// ============================================================
// 局域网订阅服务：把本地生成的订阅文件提供给影视仓/TVBox
//
// 用法：node tools/serve.mjs [端口]
// 然后在影视仓直播源处填：http://<本机IP>:<端口>/live-verified.txt
//
// 电脑开着就能看。想彻底摆脱电脑，改用 GitHub / Cloudflare 托管。
// ============================================================
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8899);
const FILES = {
  '/live-verified.txt': { file: 'live-verified.txt', type: 'text/plain; charset=utf-8' },
  '/live-verified.m3u': { file: 'live-verified.m3u', type: 'audio/x-mpegurl; charset=utf-8' },
  '/index.txt': { file: 'live-verified.txt', type: 'text/plain; charset=utf-8' },
  '/index.m3u': { file: 'live-verified.m3u', type: 'audio/x-mpegurl; charset=utf-8' },
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const hit = FILES[url.pathname];
  if (!hit) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('可用地址：\n' + Object.keys(FILES).join('\n'));
    return;
  }
  const full = path.join(ROOT, hit.file);
  if (!fs.existsSync(full)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`缺少 ${hit.file}，请先运行 node tools/make-subs.mjs`);
    return;
  }
  const body = fs.readFileSync(full);
  res.writeHead(200, {
    'Content-Type': hit.type,
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
  const ip = req.socket.remoteAddress;
  console.log(`[${new Date().toLocaleTimeString()}] ${ip} 拉取 ${url.pathname} (${body.length}B)`);
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) ips.push(n.address);
    }
  }
  console.log(`\n订阅服务已启动，端口 ${PORT}\n`);
  console.log('影视仓 / TVBox 直播源填其中一个：');
  for (const ip of ips) console.log(`  http://${ip}:${PORT}/live-verified.txt`);
  console.log(`  http://127.0.0.1:${PORT}/live-verified.txt   (本机测试)`);
  console.log('\n保持本窗口开启；按 Ctrl+C 停止。首次可能需要在 Windows 防火墙弹窗里允许访问。\n');
});