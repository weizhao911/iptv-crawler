// ============================================================
// Worker 入口：HTTP 路由 + 定时任务分发
// 订阅输出：/index.m3u  /index.txt   状态页：/
// 手动刷新：/api/refresh?token=xxx （需配置 secret：REFRESH_TOKEN）
// ============================================================
import { renderM3U, renderTXT, renderHome } from './render.js';
import { doCrawl, doCheck, getData } from './cron.js';

function num(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const maxSources = num(env.MAX_SOURCES_PER_CHANNEL) || 8;
    const epgUrl = env.EPG_URL || '';

    const json = (obj, status = 200) =>
      new Response(JSON.stringify(obj, null, 2), {
        status,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });

    try {
      switch (true) {
        case path === '/' || path === '/index.html':
          return new Response(
            renderHome((await getData(env)) || {}, url.origin, maxSources, epgUrl),
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );

        case path === '/index.m3u' || path === '/m3u' || path === '/tv.m3u': {
          const data = await getData(env);
          if (!data) return new Response('#EXTM3U\n# 首次部署后请等待定时任务抓取，或访问 /api/refresh?token=... 手动触发\n', {
            headers: { 'Content-Type': 'audio/x-mpegurl; charset=utf-8' },
          });
          return new Response(renderM3U(data, maxSources, epgUrl), {
            headers: {
              'Content-Type': 'audio/x-mpegurl; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'max-age=600',
            },
          });
        }

        case path === '/index.txt' || path === '/txt': {
          const data = await getData(env);
          if (!data) return new Response('首次部署后请等待定时任务抓取\n', {
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
          return new Response(renderTXT(data, maxSources), {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'max-age=600',
            },
          });
        }

        case path === '/api/status':
          return json(await getData(env) || { empty: true });

        case path === '/api/refresh': {
          const token = url.searchParams.get('token') || '';
          const expected = env.REFRESH_TOKEN || '';
          if (!expected || token !== expected) {
            return json({ ok: false, error: 'token 无效。请先 wrangler secret put REFRESH_TOKEN' }, 403);
          }
          ctx.waitUntil(doCrawl(env).catch(() => {}));
          return json({ ok: true, msg: '抓取任务已触发，结果稍后可在 / 查看' });
        }

        case path === '/favicon.ico':
          return new Response(null, { status: 204 });

        default:
          return json({ ok: false, error: 'Not Found', routes: ['/', '/index.m3u', '/index.txt', '/api/status', '/api/refresh?token=...'] }, 404);
      }
    } catch (e) {
      return json({ ok: false, error: String(e?.message || e) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    const crawlCron = env.CRAWL_CRON || '30 16 * * *';
    ctx.waitUntil(
      (event.cron === crawlCron ? doCrawl(env) : doCheck(env))
        .catch(() => {})
    );
  },
};
