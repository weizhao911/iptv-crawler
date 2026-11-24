// ============================================================
// 直播源可达性测速（分片执行，规避免费版 50 子请求限制）
// ============================================================

/**
 * 探测单个直播源：发起 GET（带 Range 头），记录状态码与响应耗时。
 * m3u8/ts 拿到响应头即可判定，立刻取消 body 下载。
 */
export async function probeUrl(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10) VLC/3.0',
        Range: 'bytes=0-64',
      },
    });
    try { await res.body?.cancel(); } catch (_) { /* ignore */ }
    const latency = Date.now() - start;
    const ok = res.status >= 200 && res.status < 400;
    return { ok, latency, code: res.status };
  } catch (_) {
    return { ok: false, latency: Date.now() - start, code: 0 };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 从聚合数据构建测速队列：
 * 每频道最多 MAX_PROBE 个源；从未测过的优先，其次按上次检测时间从旧到新。
 */
export function buildQueue(data, maxProbePerChannel, queueSize) {
  const items = [];
  for (const [key, sources] of Object.entries(data.channels || {})) {
    const sorted = [...sources].sort((a, b) => {
      const ta = a.checked_at || 0;
      const tb = b.checked_at || 0;
      if (ta !== tb) return ta - tb;               // 没测过(0)排最前，然后按最旧
      if (a.checked_at === undefined) return 0;
      return (a.ok === b.ok) ? 0 : (a.ok ? -1 : 1); // 同批次内可用的排前
    });
    for (const s of sorted.slice(0, maxProbePerChannel)) {
      items.push({ c: key, u: s.url });
    }
  }
  return items.slice(0, queueSize);
}

/**
 * 执行一轮测速分片：从队列取 CHECK_BATCH 个，并发探测，写回数据。
 * @param {Object} env Worker env（KV 绑定）
 * @param {Object} data KV 中的数据对象
 * @param {Array} queue 待测队列
 * @param {number} batch 本轮检测数量
 * @param {number} timeoutMs 超时
 */
export async function runCheckSlice(env, data, queue, batch, timeoutMs) {
  const todo = queue.slice(0, batch);
  const rest = queue.slice(batch);

  const probes = await Promise.allSettled(
    todo.map(item => probeUrl(item.u, timeoutMs))
  );

  let checked = 0;
  const now = Date.now();
  for (let i = 0; i < todo.length; i++) {
    const { c: key, u: url } = todo[i];
    const r = probes[i];
    const list = data.channels?.[key];
    if (!list) continue;
    const entry = list.find(s => s.url === url);
    if (!entry) continue;
    const result = r.status === 'fulfilled' ? r.value : { ok: false, latency: timeoutMs, code: 0 };
    entry.ok = result.ok;
    entry.latency = result.latency;
    entry.code = result.code;
    entry.checked_at = now;
    checked++;
  }

  data.check = {
    last_at: now,
    last_count: checked,
    queue_left: rest.length,
    running: rest.length > 0,
  };
  return rest;
}
