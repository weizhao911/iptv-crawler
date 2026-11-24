// ============================================================
// 上游 M3U 抓取、解析、按频道聚合去重
// ============================================================
import { SOURCES } from './config.js';
import { matchChannel } from './matcher.js';

/** 解析 M3U 文本，返回 [{ name, url }] */
export function parseM3U(text) {
  const lines = text.split('\n');
  const out = [];
  let pendingName = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.charCodeAt(0) === 35) { // '#'
      if (line.startsWith('#EXTINF')) {
        const commaIdx = line.indexOf(',');
        pendingName = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : '';
      }
      continue;
    }
    // URL 行
    if (/^(https?|rtsp|rtmp):\/\//i.test(line) && pendingName) {
      out.push({ name: pendingName, url: line });
    }
    pendingName = null;
  }
  return out;
}

/** 抓取单个上游源（永不 throw，返回带状态的对象） */
async function fetchSource(src) {
  try {
    const res = await fetch(src.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 IPTV-Crawler/1.0' },
      cf: { cacheTtl: 600 },
    });
    if (!res.ok) return { src, ok: false, error: `HTTP ${res.status}` };
    const text = await res.text();
    if (text.length > 8 * 1024 * 1024) return { src, ok: false, error: `响应过大 ${text.length}B` };
    return { src, ok: true, text };
  } catch (e) {
    return { src, ok: false, error: String(e?.message || e) };
  }
}

/**
 * 抓取全部上游源，聚合到频道。
 * 返回 { channels: Map<key, [{url, source}]>, stats: {...} }
 */
export async function crawlAll() {
  const channels = new Map(); // key -> [{ url, source }]
  const seenUrls = new Set();
  const stats = { sources: [], totalLines: 0, matched: 0, uniqueUrls: 0, failed: 0 };

  const results = await Promise.all(SOURCES.map(fetchSource));

  for (const r of results) {
    stats.sources.push(r.ok
      ? { name: r.src.name, ok: true }
      : { name: r.src.name, ok: false, error: r.error });
    if (!r.ok) { stats.failed++; continue; }

    const items = parseM3U(r.text);
    let matched = 0;
    for (const it of items) {
      const ch = matchChannel(it.name);
      if (!ch) continue;
      matched++;
      if (seenUrls.has(it.url)) continue; // 跨源按 URL 去重
      seenUrls.add(it.url);
      if (!channels.has(ch.key)) channels.set(ch.key, []);
      channels.get(ch.key).push({ url: it.url, source: r.src.name });
    }
    stats.totalLines += items.length;
    stats.matched += matched;
  }

  stats.uniqueUrls = seenUrls.size;
  return { channels, stats };
}
