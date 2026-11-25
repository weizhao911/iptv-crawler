# IPTV 直播源聚合（Cloudflare Workers）

央视 + 省级卫视直播源，供影视仓、TVBox 等播放器使用。部署在 Cloudflare 免费版上，无需服务器。

## 为什么不是"纯抓取"

公开直播源池里假可用源极多：实测 578 条候选里，能真正拉到视频分片的不足 15%，其余是 404、500、SSL 握手失败、连接重置，或者"播放列表能拿到但分片拉不到"。而只按 HTTP 状态码判断的测速，会把这些源判成"可用"并排到前面，播放器一播就黑屏。

所以本项目采用两层结构：

```
第一层  本地实测基线（src/baseline.js）
       在家庭宽带出口逐个验证能否真的出流（追到视频分片）
       验证通过的源永远排第一，保证一播就有画面

第二层  云端自动抓取（可选）
       Cloudflare 定时抓取上游、测速，作为换源备选
       只补位，不抢占基线源的位置
```

即使云端抓取失败、KV 没绑、定时任务没跑，订阅照样能播——这是设计上的兜底。

## 工作原理

```
tools/make-subs.mjs   抓上游 → 逐源验证出流 → live-verified.txt / .m3u
tools/gen-baseline.mjs  校验结果 → src/baseline.js（部署进 Worker）

Worker /index.txt     基线源 + 云端测速通过的备选（每频道最多补 1 个）
Worker /index.m3u     同上，M3U 格式
Worker /api/status    基线摘要 + 云端抓取状态
```

## 部署

### 方式一：Cloudflare 直接连接 GitHub（推荐）

1. 代码推到 GitHub 仓库（KV id 已写在 `wrangler.toml`）
2. Cloudflare 控制台 → **Workers & Pages** → **Create** → **Workers** → **Connect to Git**
3. 选择仓库和 `main` 分支
4. 构建设置：
   - Build command：`npm install`（不要留默认的 `npm run build`，本项目没有这个脚本；也不要加 `--production`，wrangler 在 devDependencies 里）
   - Deploy command：`npx wrangler deploy`
5. 保存并部署，完成后访问 `https://iptv-crawler.<你的子域>.workers.dev`

> 如果已有同名 Worker，选择「连接 Git 到现有 Worker」，或先删掉旧 Worker 再建，避免订阅地址变化。

之后每次 push 到 `main`，Cloudflare 自动重新构建部署。

### 方式二：GitHub Actions

`.github/workflows/deploy.yml` 需要在仓库 Secrets 里配 `CLOUDFLARE_API_TOKEN`（Edit Cloudflare Workers 模板）。
注意：本仓库的 workflow 目前位于根目录 `workflows/deploy.yml`，GitHub 不会执行；要用这条路径的话，需要把它移到 `.github/workflows/` 下。

### 方式三：本地部署

```bash
npm install
npx wrangler deploy
```

## 影视仓 / TVBox 配置

| 配置项 | 地址 |
|---|---|
| 直播源（**推荐**） | `https://你的域名/index.txt` |
| 直播源（M3U） | `https://你的域名/index.m3u` |
| EPG 节目单 | `https://live.fanmingming.com/e.xml` |

**一定要用 TXT。** TXT 里同一频道是 `频道名,源1#源2#源3`，播放器失败会自动换下一个源；M3U 里同一频道是多个同名条目，播放器不会自动跳转，第一个源失败就黑屏。

## 更新源（源失效时）

直播源寿命很短，几天到几周不等。更新流程：

```bash
node tools/make-subs.mjs     # 抓取 + 真实验证，约 5 分钟，生成 live-verified.txt/.m3u
node tools/gen-baseline.mjs  # 转成 src/baseline.js
git add -A && git commit -m "update sources" && git push
```

push 后 Cloudflare 自动重新部署，订阅立即更新。

`make-subs.mjs` 的两个要点，改动时别破坏：

- **同一域名串行请求 + 间隔**：这些中转站有频率限制，并发一高就会把后续请求全判失败，所以按域名分组串行、域名之间并行
- **失败延时重试一次**：限流造成的假失败很常见，重试能救回一部分

### 只用一份文件看（不开电脑、不部署）

```bash
node tools/serve.mjs 8899
```

影视仓填 `http://你的电脑IP:8899/live-verified.txt`。需要电脑保持开机。

## 页面路由

| 路由 | 说明 |
|---|---|
| `/` | 状态页（基线频道数、云端抓取情况、每频道源状态） |
| `/index.txt` | TXT 订阅（影视仓推荐） |
| `/index.m3u` | M3U 订阅 |
| `/api/status` | JSON：基线摘要 + 云端数据 |
| `/api/refresh?token=xxx` | 手动触发云端抓取（需 Secret `REFRESH_TOKEN`） |

## 自定义

### 增删上游源
编辑 `src/config.js` 的 `SOURCES`。免费版单次请求 50 个子请求上限，源数量别超过 40。

### 增删频道
- 央视/CGTN：`CCTV_CHANNELS` / `CGTN_CHANNELS`（`key` 是归一化结果，`name` 是显示名）
- 卫视：`SATELLITE_CHANNELS`；旧称加进 `SATELLITE_ALIASES`，英文源加进 `SATELLITE_EN_ALIASES`

### 调参数（`wrangler.toml` 的 `[vars]`）

| 变量 | 默认 | 说明 |
|---|---|---|
| `MAX_SOURCES_PER_CHANNEL` | 8 | 每频道最多输出多少源 |
| `MAX_PROBE_PER_CHANNEL` | 6 | 每频道最多多少源进测速队列 |
| `CHECK_BATCH` | 35 | 每轮测速数量（免费版 50 子请求上限内） |
| `CHECK_TIMEOUT_MS` | 3500 | 单源测速超时 |
| `EPG_URL` | fanmingming | M3U 头部的节目单地址 |

## 注意事项

1. **合规使用**：仅聚合公开网络渠道，请勿用于商业用途。
2. **KV 可选**：没绑 KV 也能正常输出订阅（走基线），只是云端抓取不可用。所有 KV 操作都有容错，不会因为 KV 故障导致订阅 500。
3. **测速局限**：云端测速在境外边缘节点执行，对国内运营商专网源判断不准，所以它的结果只用来补备选，不决定主源。
4. **workers.dev 域名**在大陆个别网络下不稳定；订阅拉不到时可在 Worker 设置里绑定自定义域名。
5. **频道缺口**：CCTV-4K/8K、CGTN 俄语、北京/深圳/安徽/天津/四川/山西/兵团/三沙/厦门/安多等频道，目前公开源里没有稳定可用的。

> AI生成