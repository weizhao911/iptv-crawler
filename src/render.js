// ============================================================
// 输出渲染：M3U / TVBox TXT / 状态页 HTML
// ============================================================
import { allChannels } from './config.js';

const num = (v) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * 对单频道的源列表排序：测过且可用的按延迟升序在前，未测的次之，失败的最后。
 */
function sortSources(list) {
  return [...list].sort((a, b) => {
    const wa = (a.ok === true ? 0 : a.ok === undefined ? 1 : 2);
    const wb = (b.ok === true ? 0 : b.ok === undefined ? 1 : 2);
    if (wa !== wb) return wa - wb;
    if (wa === 0) return (a.latency || 9999) - (b.latency || 9999);
    return 0;
  });
}

/** 按 config 顺序生成 [{ channel, sources }] */
export function buildChannelList(data, maxSources) {
  const out = [];
  for (const ch of allChannels()) {
    const list = data.channels?.[ch.key];
    if (!list || list.length === 0) continue;
    out.push({ channel: ch, sources: sortSources(list).slice(0, maxSources) });
  }
  return out;
}

/** 生成 M3U 文本 */
export function renderM3U(data, maxSources, epgUrl) {
  const list = buildChannelList(data, maxSources);
  let s = `#EXTM3U x-tvg-url="${epgUrl || ''}"\n`;
  for (const { channel, sources } of list) {
    for (const src of sources) {
      s += `#EXTINF:-1 tvg-id="${channel.key}" tvg-name="${channel.name}" group-title="${channel.group}",${channel.name}\n${src.url}\n`;
    }
  }
  return s;
}

/** 生成 TVBox/影视仓 TXT 文本 */
export function renderTXT(data, maxSources) {
  const list = buildChannelList(data, maxSources);
  let s = '';
  for (const group of ['央视', '卫视']) {
    const items = list.filter(x => x.channel.group === group);
    if (items.length === 0) continue;
    s += `${group},#genre#\n`;
    for (const { channel, sources } of items) {
      s += `${channel.name},${sources.map(x => x.url).join('#')}\n`;
    }
  }
  return s;
}

/** 状态页 HTML */
export function renderHome(data, baseUrl, maxSources, epgUrl) {
  const list = buildChannelList(data, maxSources);
  const cctvCount = list.filter(x => x.channel.group === '央视').length;
  const satCount = list.filter(x => x.channel.group === '卫视').length;
  const totalSources = list.reduce((n, x) => n + x.sources.length, 0);
  const okSources = data.channels
    ? Object.values(data.channels).flat().filter(s => s.ok === true).length
    : 0;
  const updated = data.updated_at
    ? new Date(data.updated_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
    : '尚未抓取（等定时任务首次运行，或在地址后加 /api/refresh?token=你的令牌 手动触发）';
  const crawl = data.crawl || {};
  const srcRows = (crawl.sources || []).map(src =>
    `<tr><td>${src.name}</td><td class="${src.ok ? 'ok' : 'bad'}">${src.ok ? '正常' : '失败'}</td><td>${src.error || '-'}</td></tr>`
  ).join('');

  const chRows = list.map(({ channel, sources }) => {
    const tags = sources.map(s => {
      let cls = 'unk', txt = '未测';
      if (s.ok === true) { cls = 'ok'; txt = `${s.latency}ms`; }
      else if (s.ok === false) { cls = 'bad'; txt = '失败'; }
      return `<span class="tag ${cls}" title="${s.source || ''} · ${s.url}">${txt}</span>`;
    }).join('');
    return `<tr><td class="cname">${channel.name}</td><td class="grp">${channel.group}</td><td>${tags}</td></tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IPTV 直播源聚合</title>
<style>
  body{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;margin:0;background:#0f1115;color:#d7dae0}
  .wrap{max-width:960px;margin:0 auto;padding:32px 20px}
  h1{font-size:22px;margin:0 0 4px}
  .sub{color:#8b93a1;font-size:13px;margin-bottom:24px}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .card{background:#171a21;border-radius:10px;padding:16px}
  .card .v{font-size:24px;font-weight:700;color:#5ea0ff}
  .card .k{font-size:12px;color:#8b93a1;margin-top:4px}
  .urls{background:#171a21;border-radius:10px;padding:16px;margin-bottom:24px}
  .urls h2{font-size:14px;margin:0 0 10px}
  .urls code{display:block;background:#0f1115;border-radius:6px;padding:10px;margin:6px 0;font-size:13px;color:#7fd18c;word-break:break-all;user-select:all}
  .meta{font-size:12px;color:#8b93a1;margin-bottom:24px;line-height:1.8}
  table{width:100%;border-collapse:collapse;background:#171a21;border-radius:10px;overflow:hidden;font-size:13px}
  th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #23272f}
  th{color:#8b93a1;font-weight:500;font-size:12px}
  tr:last-child td{border-bottom:none}
  .tag{display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;margin:2px 4px 2px 0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .tag.ok{background:#1a2e1f;color:#7fd18c}
  .tag.bad{background:#2e1a1a;color:#ff7b7b}
  .tag.unk{background:#23272f;color:#8b93a1}
  .ok{color:#7fd18c}.bad{color:#ff7b7b}
  .cname{color:#e6e9ef;white-space:nowrap}.grp{color:#8b93a1;white-space:nowrap}
</style>
</head>
<body><div class="wrap">
  <h1>IPTV 直播源聚合</h1>
  <div class="sub">央视 + 卫视 · 自动抓取 · 定时测速 · 部署于 Cloudflare Workers</div>

  <div class="cards">
    <div class="card"><div class="v">${cctvCount}</div><div class="k">央视频道数</div></div>
    <div class="card"><div class="v">${satCount}</div><div class="k">卫视频道数</div></div>
    <div class="card"><div class="v">${totalSources}</div><div class="k">输出源总数</div></div>
    <div class="card"><div class="v">${okSources}</div><div class="k">测速通过源</div></div>
  </div>

  <div class="urls">
    <h2>订阅地址（影视仓 / TVBox 直播源处填写）</h2>
    <code>${baseUrl}/index.m3u</code>
    <code>${baseUrl}/index.txt</code>
    <h2 style="margin-top:14px">EPG 节目单</h2>
    <code>${epgUrl}</code>
  </div>

  <div class="meta">
    最近抓取：<b>${updated}</b><br>
    每轮测速：${data.check?.last_count ?? '-'} 个，队列剩余 ${data.check?.queue_left ?? '-'} 个
  </div>

  <table>
    <tr><th>上游源</th><th>状态</th><th>说明</th></tr>
    ${srcRows || '<tr><td colspan="3">暂无抓取记录</td></tr>'}
  </table>
  <br>
  <table>
    <tr><th>频道</th><th>分组</th><th>源测速状态</th></tr>
    ${chRows || '<tr><td colspan="3">暂无数据，请等待首次抓取完成</td></tr>'}
  </table>
</div></body></html>`;
}
