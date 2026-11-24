# IPTV 直播源聚合（Cloudflare Workers）

自动抓取央视 + 省级卫视直播源，聚合、去重、定时测速排序，输出 M3U / TXT 订阅地址，供影视仓、TVBox 等播放器直接使用。完全部署在 Cloudflare 免费版上，无需服务器。

## 工作原理

```
┌─ Cloudflare Cron 每天 00:30（北京时间）─────┐
│  抓取 6 个上游公开源 → 匹配央视/卫视 → KV   │
└──────────────────────────────────────────┘
┌─ Cloudflare Cron 每 2 小时 ─────────────────┐
│  分批测速（每批 35 个 URL）→ 可用的排前面    │
└──────────────────────────────────────────┘
访问 /index.m3u → 输出订阅文件（可用源优先排序）
```

- **上游源**（`src/config.js` 可增删）：suxuang/myIPTV、Guovin/iptv-api、fanmingming/live、vbskycn/iptv、iptv-org、YueChan/Live
- **频道覆盖**：CCTV-1~17、CCTV-5+、4K/8K、CGTN 系列、38 个省级卫视（含深圳、东南、海峡、三沙、大湾区、延边等）
- **名称归一化**：`CCTV5+体育赛事`、`cctv1(综合)`、`央视一套`、`东方卫视4K`、`Beijing Satellite TV` 等写法自动归一到标准频道
- **测速分片**：规避免费版单请求 50 个子请求限制，每轮只测一批，循环巡检

## 部署步骤

前置条件：Node.js ≥ 18、一个 Cloudflare 账号。

```bash
# 1. 安装依赖
npm install

# 2. 登录 Cloudflare（浏览器授权）
npx wrangler login

# 3. 创建 KV 命名空间，复制输出里的 id
npx wrangler kv namespace create KV

# 4. 把 id 填入 wrangler.toml 的 kv_namespaces 段
#    id = "xxxxxxxxxxxxxxxx"

# 5. 部署
npx wrangler deploy
```

部署完成后会输出 `https://iptv-crawler.<你的子域>.workers.dev`，浏览器打开即可看到状态页。

首次数据：部署后等每天 00:30 的定时抓取，或手动触发一次（见下）。

## 使用（影视仓 / TVBox）

在播放器的直播源配置处填写：

| 配置项 | 地址 |
|---|---|
| 直播源（M3U） | `https://你的域名/index.m3u` |
| 直播源（TXT） | `https://你的域名/index.txt` |
| EPG 节目单 | `https://live.fanmingming.com/e.xml` |

影视仓示例（tvbox 配置 json 里）：

```json
"lives": [
  { "name": "直播", "type": 0, "url": "https://你的域名/index.m3u", "epg": "https://live.fanmingming.com/e.xml" }
]
```

## 页面路由

| 路由 | 说明 |
|---|---|
| `/` | 状态页（频道数、源数、测速情况、上游源健康度） |
| `/index.m3u` | M3U 订阅 |
| `/index.txt` | TVBox/影视仓 TXT 订阅 |
| `/api/status` | JSON 数据 |
| `/api/refresh?token=xxx` | 手动触发抓取 |

手动刷新需先配置令牌：

```bash
npx wrangler secret put REFRESH_TOKEN   # 输入一个自定义字符串
```

然后访问 `https://你的域名/api/refresh?token=你设置的值`。
（注意：HTTP 请求路径有 10ms CPU 限制，抓取较重，推荐交给每天一次的定时任务完成；手动触发失败也无妨，waitUntil 会在后台继续。）

## 自定义

### 增删上游源
编辑 `src/config.js` 的 `SOURCES` 数组。免费版注意：单次抓取的源数量别超过 40 个（子请求上限 50，还需留测速余量）。

### 增删频道
- 央视/CGTN：`CCTV_CHANNELS` / `CGTN_CHANNELS`（`key` 是归一化结果，`name` 是输出显示名）
- 卫视：`SATELLITE_CHANNELS` 数组；旧称加进 `SATELLITE_ALIASES`，英文源加进 `SATELLITE_EN_ALIASES`

### 调参数（wrangler.toml `[vars]`）
| 变量 | 默认 | 说明 |
|---|---|---|
| `MAX_SOURCES_PER_CHANNEL` | 8 | 每频道最多输出多少个源 |
| `MAX_PROBE_PER_CHANNEL` | 6 | 每频道最多多少个源参与测速 |
| `CHECK_BATCH` | 35 | 每轮测速数量（免费版上限内） |
| `CHECK_TIMEOUT_MS` | 3500 | 单源测速超时 |
| `EPG_URL` | fanmingming | M3U 头部的节目单地址 |

## 把代码放到 GitHub，Cloudflare 自动拉取部署

推荐配合方式：GitHub 存代码，push 后自动部署到 Workers，本地不需要长期保留项目。

1. 新建 GitHub 仓库（公开/私有均可；仓库里没有敏感信息——KV id 只是标识符，REFRESH_TOKEN 存在 Cloudflare 侧不在代码里）
2. 推送代码：
   ```bash
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<你的用户名>/iptv-crawler.git
   git push -u origin main
   ```
   `.gitignore` 已排除 node_modules/.temp，不会推上去
3. 创建 Cloudflare API Token：控制台 → My Profile → API Tokens → Create Token，选 **Edit Cloudflare Workers** 模板并勾选你的账号
4. GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret：名称 `CLOUDFLARE_API_TOKEN`，值为该 token
5. 之后每次 push 到 main，Actions 自动执行 `.github/workflows/deploy.yml` 完成 `wrangler deploy`

> 替代方案：Cloudflare 控制台的 Workers & Pages 里直接「连接 GitHub 仓库」（Workers Builds），push 自动构建部署，连 workflow 文件都不需要。
> 不用 GitHub 也完全可以：任何时候本地 `npx wrangler deploy` 效果一样。

### 只用 GitHub、不部署 Cloudflare 行不行？

可以（GitHub Actions 定时跑爬虫、结果提交回仓库、影视仓拉 raw 地址），但不推荐做主方案：

| 问题 | 影响 |
|---|---|
| raw.githubusercontent.com 大陆直连很不稳定 | 影视仓经常拉不到，得套加速代理（ghproxy 等）或 jsDelivr |
| GitHub Actions 定时任务不守时 | 高峰期延迟可达几十分钟 |
| Actions runner 在美国 | 测速失真比 Cloudflare 更严重，国内源大量误判为失败 |

备用价值：可作为 Cloudflare 之外的容灾线路，需要时再加。

## 注意事项

1. **合规使用**：仅聚合公开网络渠道，请勿用于商业用途；部分源可能因版权原因随时失效，测速机制会自动淘汰。
2. **KV 成本**：免费版每天 1000 次写入，本项目每天约 30 次以内，够用。
3. **fanmingming 源**：托管在 Cloudflare，Worker 之间访问正常（本地测试环境直连可能被重置，不影响线上）。
4. **测速结果**：很多直播源仅限国内运营商网络访问，部署在 Cloudflare（境外边缘）会有一批测不通，属正常现象；测通的在输出里排前面，播放器会按顺序自动切换。
5. **更换 EPG**：若要换用其他节目单，同步修改 `wrangler.toml` 的 `EPG_URL` 即可。
6. **workers.dev 域名**：在大陆个别网络环境下偶发不稳定；若影视仓拉订阅失败，可在 Cloudflare Worker 设置里绑定自定义域名（需域名托管到 Cloudflare），订阅地址换成自定义域名即可。

> AI生成
