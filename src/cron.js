// ============================================================
// 定时任务逻辑：全量抓取 / 测速分片
// ============================================================
import { crawlAll } from './fetcher.js';
import { buildQueue, runCheckSlice } from './checker.js';
import { allChannels } from './config.js';

const DATA_KEY = 'data';
const QUEUE_KEY = 'queue';

function num(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** 全量抓取：抓上游 → 匹配 → 入 KV → 重建测速队列 */
export async function doCrawl(env) {
  const maxProbe = num(env.MAX_PROBE_PER_CHANNEL) || 6;
  const queueSize = Math.max(num(env.MAX_PROBE_PER_CHANNEL) || 6, 300);

  const { channels, stats } = await crawlAll();

  // 转成可序列化结构，只保留每个频道前 N 个源进数据（全部 URL 用于队列）
  const data = {
    updated_at: Date.now(),
    crawl: stats,
    channels: {},
  };
  for (const [key, sources] of channels.entries()) {
    data.channels[key] = sources.slice(0, Math.max(maxProbe, 12)).map(s => ({
      url: s.url,
      source: s.source,
      ok: undefined,
      latency: undefined,
      code: undefined,
      checked_at: undefined,
    }));
  }

  await env.KV.put(DATA_KEY, JSON.stringify(data));

  // 重建测速队列
  const queue = buildQueue(data, maxProbe, queueSize);
  await env.KV.put(QUEUE_KEY, JSON.stringify(queue));

  return { channelCount: Object.keys(data.channels).length, queueSize: queue.length, stats };
}

/** 测速分片：没有数据先抓取；否则测一批并写回 */
export async function doCheck(env) {
  const batch = num(env.CHECK_BATCH) || 30;
  const timeoutMs = num(env.CHECK_TIMEOUT_MS) || 3500;
  const maxProbe = num(env.MAX_PROBE_PER_CHANNEL) || 6;

  let dataRaw = await env.KV.get(DATA_KEY);
  if (!dataRaw) {
    // 首次运行还没有数据，直接抓一遍
    return doCrawl(env);
  }
  const data = JSON.parse(dataRaw);

  let queue = [];
  const queueRaw = await env.KV.get(QUEUE_KEY);
  if (queueRaw) {
    try { queue = JSON.parse(queueRaw); } catch (_) { queue = []; }
  }
  if (!Array.isArray(queue) || queue.length === 0) {
    queue = buildQueue(data, maxProbe, 300);
  }

  const rest = await runCheckSlice(env, data, queue, batch, timeoutMs);

  await env.KV.put(DATA_KEY, JSON.stringify(data));
  await env.KV.put(QUEUE_KEY, JSON.stringify(rest));
  return { checked: data.check.last_count, left: rest.length };
}

/** 读取数据（HTTP 输出用） */
export async function getData(env) {
  const raw = await env.KV.get(DATA_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (_) { return null; }
}
