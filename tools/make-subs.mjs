// ============================================================
// 生成"能播"的订阅（本地实测驱动）
//
// 思路：
//   1. 抓上游候选池，缓存 6 小时
//   2. 主力源（实测能出流的中转节点）低频逐个验证
//   3. 主力源没覆盖的频道，从上游池补候选（官方域名优先）并实测
//   4. 输出 TXT（影视仓自动换源）与 M3U
//
// 关键：同一域名串行请求 + 间隔，避免触发源站频率限制造成误判。
//
// 用法：node tools/make-subs.mjs [--force]
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCES, allChannels } from '../src/config.js';
import { parseM3U } from '../src/fetcher.js';
import { matchChannel } from '../src/matcher.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.temp', 'candidates.json');
const UA = process.env.USER_AGENT || 'okhttp/3.12.13';
const EPG = process.env.EPG_URL || 'https://live.fanmingming.com/e.xml';
const TIMEOUT = Number(process.env.TIMEOUT_MS || 6000);
const BACKUP_PER_CHANNEL = Number(process.env.BACKUP || 4);
const FORCE = process.argv.includes('--force');

const log = (...a) => console.log(...a);
const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };

// 实测能出流的主力节点
const PRIMARY_HOSTS = ['t.061899.xyz'];
// 各台官网/官方 CDN，稳定性通常好于第三方中转
const OFFICIAL_HOSTS = [
  'ali-m-l.cztv.com', 'l.cztvcloud.com', 'event.pull.hebtv.com',
  'idclive.hljtv.com', 'h5cul1yar48um3t.wcetv.com', 'bp-resource-dfl.bestv.cn',
  'hlsal-ldvt.qing.mgtv.com', 'play1-qk.nmtv.cn', 'live.zohi.tv',
  'liveout.xntv.tv', '119.39.9.8:9901', '112.27.5.218:9901', '221.7.175.154:8445',
  '120.76.248.139',
];

// ---------- 抓取 ----------
function mirrors(url) {
  const l = [url];
  const m = url.match(/^https?:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
  if (m) l.push(`https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}/${m[4]}`);
  if (/live\.fanmingming\.com/.test(url)) {
    const p = url.replace(/^https?:\/\/live\.fanmingming\.com\//, '');
    l.push(`https://cdn.jsdelivr.net/gh/fanmingming/live@main/${p}`);
  }
  return l;
}

async function fetchText(url) {
  for (const u of mirrors(url)) {
    for (let k = 0; k < 2; k++) {
      try {
        const res = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
        if (!res.ok) break;
        const text = await res.text();
        if (text.includes('#EXTINF')) return text;
        break;
      } catch { await new Promise(r => setTimeout(r, 400)); }
    }
  }
  return null;
}

async function loadCandidates() {
  if (!FORCE && fs.existsSync(CACHE)) {
    try {
      const c = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      if (Date.now() - c.t < 6 * 3600e3) {
        log(`① 复用候选池缓存（${new Date(c.t).toLocaleTimeString()}，${c.items.length} 条）`);
        return c.items;
      }
    } catch { /* ignore */ }
  }
  log('① 抓取上游 ...');
  const items = [];
  const seen = new Set();
  for (const src of SOURCES) {
    const text = await fetchText(src.url);
    if (!text) { log(`   ✗ ${src.name}`); continue; }
    let hit = 0;
    for (const it of parseM3U(text)) {
      const ch = matchChannel(it.name);
      if (!ch || seen.has(it.url)) continue;
      seen.add(it.url);
      items.push({ key: ch.key, name: ch.name, group: ch.group, url: it.url, source: src.name });
      hit++;
    }
    log(`   ✓ ${src.name} 命中 ${hit}`);
  }
  fs.writeFileSync(CACHE, JSON.stringify({ t: Date.now(), items }), 'utf8');
  log(`   共 ${items.length} 个候选`);
  return items;
}

// ---------- 验证 ----------
async function grab(url, max = 2048) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT);
  const s = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const buf = Buffer.from(await res.arrayBuffer()).subarray(0, max);
    return { st: res.status, ct: res.headers.get('content-type') || '', buf, ms: Date.now() - s };
  } catch (e) {
    return { st: 0, ct: '', buf: Buffer.alloc(0), ms: Date.now() - s, err: String(e?.cause?.code || e?.name) };
  } finally { clearTimeout(t); }
}

const firstUri = (t) => {
  for (const l of t.split(/\r?\n/)) { const s = l.trim(); if (s && !s.startsWith('#')) return s; }
  return null;
};

async function verify(url) {
  const r = await grab(url);
  if (!r.st) return { ok: false, why: `连接失败 ${r.err}` };
  if (r.st >= 400) return { ok: false, why: `HTTP ${r.st}` };
  if (r.buf[0] === 0x47 && r.buf.length > 200) return { ok: true, ms: r.ms, kind: 'ts' };

  const text = r.buf.toString('utf8').trimStart();
  if (text.startsWith('#EXTM3U')) {
    const uri = firstUri(text);
    if (!uri) return { ok: false, why: '空列表' };
    let target;
    try { target = new URL(uri, url).toString(); } catch { return { ok: false, why: '分片地址非法' }; }
    let seg = await grab(target, 1024);
    if (seg.st === 200 && seg.buf.toString('utf8').trimStart().startsWith('#EXTM3U')) {
      const u2 = firstUri(seg.buf.toString('utf8'));
      if (u2) { try { seg = await grab(new URL(u2, target).toString(), 1024); } catch { /* ignore */ } }
    }
    if (!seg.st) return { ok: false, why: `分片失败 ${seg.err}` };
    if (seg.st >= 400) return { ok: false, why: `分片 HTTP ${seg.st}` };
    if (seg.buf.length < 400) return { ok: false, why: `分片仅 ${seg.buf.length}B` };
    if (seg.buf[0] !== 0x47 && seg.buf.subarray(0, 4).toString('hex') !== '00000001') {
      return { ok: false, why: '分片非音视频' };
    }
    return { ok: true, ms: r.ms + seg.ms, kind: 'hls' };
  }
  if (text.startsWith('<') || r.ct.includes('html')) return { ok: false, why: '返回网页' };
  return { ok: false, why: `未知内容 ${r.ct}` };
}

/** 同域名串行 + 间隔，域名之间并行 */
async function verifyAll(tasks, workers = 4, gap = 1500) {
  const byHost = new Map();
  for (const t of tasks) {
    const h = hostOf(t.url);
    if (!byHost.has(h)) byHost.set(h, []);
    byHost.get(h).push(t);
  }
  const queues = [...byHost.values()].sort((a, b) => b.length - a.length);
  const out = [];
  let qi = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(workers, queues.length) }, async () => {
    while (true) {
      const q = queues[qi++];
      if (!q) return;
      for (const t of q) {
        out.push({ ...t, ...(await verify(t.url)) });
        done++;
        if (done % 10 === 0) process.stdout.write(`   ${done}/${tasks.length}\r`);
        if (gap) await new Promise(r => setTimeout(r, gap));
      }
    }
  }));
  return out;
}

// ---------- 主流程 ----------
const candidates = await loadCandidates();
const order = allChannels();
const byKey = new Map();
for (const c of candidates) {
  if (!byKey.has(c.key)) byKey.set(c.key, []);
  byKey.get(c.key).push(c);
}

// 主力源：已验证能出流的中转节点
const primaryTasks = [];
for (const ch of order) {
  for (const c of (byKey.get(ch.key) || []).filter(x => PRIMARY_HOSTS.includes(hostOf(x.url)))) {
    primaryTasks.push({ key: ch.key, name: ch.name, group: ch.group, url: c.url, source: 'primary', tier: 0 });
  }
}
log(`② 验证主力源 ${primaryTasks.length} 个（同域名串行）...`);
const primaryResults = await verifyAll(primaryTasks, 2, 1800);
log('');

// 源站有频率限制，失败项延时重试一次，避免把限流误判成死源
const retry = primaryResults.filter(r => !r.ok);
if (retry.length) {
  log(`   有 ${retry.length} 个未通过，延时重试 ...`);
  await new Promise(r => setTimeout(r, 8000));
  for (const r of retry) {
    const v = await verify(r.url);
    if (v.ok) { r.ok = true; r.ms = v.ms; r.kind = v.kind; r.why = undefined; }
    await new Promise(x => setTimeout(x, 2500));
  }
  log(`   重试后通过 ${retry.filter(r => r.ok).length} 个`);
}

const primaryOk = new Map(); // key -> [result]
for (const r of primaryResults) {
  if (!r.ok) continue;
  if (!primaryOk.has(r.key)) primaryOk.set(r.key, []);
  primaryOk.get(r.key).push(r);
}

// 缺口频道：补候选
const missing = order.filter(ch => !primaryOk.has(ch.key));
log(`③ 主力源未覆盖 ${missing.length} 个频道，补候选 ...`);

function rank(c) {
  const h = hostOf(c.url);
  const oi = OFFICIAL_HOSTS.indexOf(h);
  return oi >= 0 ? oi : 100;
}

const patchTasks = [];
for (const ch of missing) {
  const pool = (byKey.get(ch.key) || [])
    .filter(c => !PRIMARY_HOSTS.includes(hostOf(c.url)))
    .sort((a, b) => rank(a) - rank(b));
  const seenHost = new Set();
  const picked = [];
  for (const c of pool) {
    const h = hostOf(c.url);
    if (seenHost.has(h)) continue;
    seenHost.add(h);
    picked.push(c);
    if (picked.length >= 6) break;
  }
  for (const c of picked) {
    patchTasks.push({ key: ch.key, name: ch.name, group: ch.group, url: c.url, source: c.source, tier: 1 });
  }
}
const patchResults = patchTasks.length ? await verifyAll(patchTasks, 5, 1200) : [];
log('');

const patchOk = new Map();
for (const r of patchResults) {
  if (!r.ok) continue;
  if (!patchOk.has(r.key)) patchOk.set(r.key, []);
  patchOk.get(r.key).push(r);
}

// ---------- 汇总 ----------
const final = [];
for (const ch of order) {
  const list = [];
  for (const r of (primaryOk.get(ch.key) || []).slice(0, 2)) list.push({ url: r.url, ms: r.ms, tier: 0 });
  for (const r of (patchOk.get(ch.key) || []).sort((a, b) => a.ms - b.ms).slice(0, BACKUP_PER_CHANNEL)) {
    list.push({ url: r.url, ms: r.ms, tier: 1 });
  }
  if (list.length) final.push({ ch, list });
}

let txt = '';
const cleanUrl = (u) => String(u).trim().replace(/#+$/, '');   // TXT 用 # 分隔多源，URL 尾部 # 会造成空源
for (const group of ['央视', '卫视']) {
  const items = final.filter(x => x.ch.group === group);
  if (!items.length) continue;
  txt += `${group},#genre#\n`;
  for (const x of items) txt += `${x.ch.name},${x.list.map(s => cleanUrl(s.url)).join('#')}\n`;
}

let m3u = `#EXTM3U x-tvg-url="${EPG}"\n`;
for (const x of final) {
  for (const s of x.list) {
    m3u += `#EXTINF:-1 tvg-id="${x.ch.key}" tvg-name="${x.ch.name}" group-title="${x.ch.group}",${x.ch.name}\n${cleanUrl(s.url)}\n`;
  }
}

const txtPath = path.join(ROOT, 'live-verified.txt');
const m3uPath = path.join(ROOT, 'live-verified.m3u');
fs.writeFileSync(txtPath, txt, 'utf8');
fs.writeFileSync(m3uPath, m3u, 'utf8');

const report = {
  generated_at: new Date().toISOString(),
  primary_checked: primaryTasks.length,
  primary_ok: primaryResults.filter(r => r.ok).length,
  patch_checked: patchTasks.length,
  patch_ok: patchResults.filter(r => r.ok).length,
  channels_with_primary: primaryOk.size,
  channels_total_ok: final.length,
  channels: final.map(x => ({
    key: x.ch.key, name: x.ch.name, group: x.ch.group,
    sources: x.list.map(s => ({ url: s.url, tier: s.tier, ms: s.ms })),
  })),
  missing: order.filter(ch => !final.some(x => x.ch.key === ch.key)).map(ch => ch.name),
};
fs.writeFileSync(path.join(ROOT, '.temp', 'subs-report.json'), JSON.stringify(report, null, 1), 'utf8');

log('');
log(`④ 完成：${final.length}/${order.length} 个频道可看`);
log(`   主力源通过 ${report.primary_ok}/${primaryTasks.length}，补源通过 ${report.patch_ok}/${patchTasks.length}`);
const still = report.missing;
if (still.length) log(`   仍缺源：${still.join('、')}`);
log(`   输出 ${txtPath}`);
log(`        ${m3uPath}`);
log('');
log('频道\t源数\t首源延迟');
for (const x of final) log(`${x.ch.name}\t${x.list.length}\t${x.list[0].ms}ms`);