// ============================================================
// 把本地实测通过的订阅（live-verified.txt）转成 Worker 的基线数据
//
// 用法：node tools/gen-baseline.mjs
// 输出：src/baseline.js
//
// 这样部署到 Cloudflare 后，即使云端抓不到可播源，
// /index.txt 也能直接输出本地验证过的可用源。
// ============================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { allChannels } from '../src/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TXT = path.join(ROOT, 'live-verified.txt');
const OUT = path.join(ROOT, 'src', 'baseline.js');

if (!fs.existsSync(TXT)) {
  console.error('缺少 live-verified.txt，请先运行 node tools/make-subs.mjs');
  process.exit(1);
}

const byName = new Map(allChannels().map(c => [c.name, c]));
const rows = [];
const unknown = [];

for (const raw of fs.readFileSync(TXT, 'utf8').split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line === 'AI生成') continue;
  if (line.endsWith(',#genre#')) continue;

  const i = line.indexOf(',');
  if (i < 0) continue;
  const name = line.slice(0, i).trim();
  const urls = line.slice(i + 1).split('#').map(s => s.trim()).filter(s => /^https?:\/\//i.test(s));
  if (!urls.length) continue;

  const ch = byName.get(name);
  if (!ch) { unknown.push(name); continue; }
  rows.push([ch.key, ch.name, ch.group, urls]);
}

if (!rows.length) {
  console.error('没有解析出任何频道，检查 live-verified.txt 格式');
  process.exit(1);
}

const updated = new Date().toISOString();
const body = rows.map(r => `  ${JSON.stringify(r)},`).join('\n');

const src = `// ============================================================
// 订阅基线 —— 自动生成，请勿手动修改
//
// 生成时间：${updated}
// 生成方式：node tools/make-subs.mjs（本地实测出流）→ node tools/gen-baseline.mjs
//
// 格式：[频道key, 显示名, 分组, [源URL...]]
// 这些源都在家庭宽带出口真实拉到过视频分片，作为订阅的首选源；
// 云端抓取到的源只作补充，避免假可用源占位导致播放失败。
// ============================================================
export const BASELINE_UPDATED = ${JSON.stringify(updated)};

export const BASELINE = [
${body}
];
`;

fs.writeFileSync(OUT, src, 'utf8');

console.log(`已写入 ${OUT}`);
console.log(`频道 ${rows.length} 个，源 ${rows.reduce((n, r) => n + r[3].length, 0)} 条`);
if (unknown.length) console.log(`未识别（已跳过）：${unknown.join('、')}`);
console.log('\n频道清单：');
for (const [key, name, , urls] of rows) console.log(`  ${name.padEnd(18)} ${urls.length} 源`);