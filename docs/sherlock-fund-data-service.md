# 基金研究公共数据服务

## 用户行为

新版客户端默认请求 `https://sherlock-fund-data.nmchgx.workers.dev/v1/fund-research/query`，用户不用配置基金数据 API Key，也不用增加登录步骤。已有本机 `YINGMI_API_KEY` 不再被默认基金研究运行时读取。个人模型配置保持原样。

客户端仅发送 `task`、`funds` 和可选 `lookback_days`，不发送聊天记录、本地文件、账户持仓金额或凭据。服务提供单基金、基金对比、持仓风格和近期变化四种既有任务，保留现有 ETF、指数基金、ETF 联接基金范围。

## 实现与用量

- 数据源凭据只作为 Cloudflare Worker 的 `YINGMI_API_KEY` secret 保存。供应商只读请求固定发送到 `https://stargate.yingmi.com/mcp/v2`，拒绝所有重定向和非白名单操作。
- Worker `sherlock-fund-data` 部署在既有账号 `54389c3ac6d28713b36c466807493ada`。该账号没有 `evanarts.com` 的域名管理权限，因此服务使用其已核验的 `nmchgx.workers.dev` 子域名。下载和更新 Worker 不受修改。
- 公共 API 是匿名只读服务，没有把可从安装包提取的固定 token 当作身份凭据。每个访问 IP 每分钟最多 20 次请求；Cloudflare 的边缘限流是局部计数，供应商总用量另由单一 SQLite Durable Object 的持久预算限制。
- 默认每日最多 1000 次未命中缓存的研究尝试，按 UTC 日重置；失败也计入预算，近期变化一次研究可能包含两次数据工具调用。并发上游研究最多 4 项，同参数并发共用一次查询。
- 已验证的成功或部分结果缓存最多 10 分钟；继续保留原始 `received_at`、`as_of`、证据哈希及质量状态。缓存过期且上游失败会明确返回不可用，不用旧值伪装刷新成功。
- 数据源失败触发 30 秒暂缓；请求最多 2 KiB、输出最多 64 KiB、供应商操作最长 60 秒。客户端不自动循环重试，超限提示“基金查询较多，请稍后再试”。
- 单个匿名用户可消耗共享额度；如将来需要按用户计费或配额，可在此入口前增加账号鉴权。当前限额是研究请求预算，不是 Cloudflare 总账单上限。

配置见 `services/fund-data/wrangler.jsonc`。调高 `DAILY_RESEARCH_LIMIT` 前应核对供应商实际额度；`CACHE_TTL_SECONDS` 最长 600 秒。访问日志采集关闭，代码不记录密钥、请求正文或供应商原始错误。

## 验证与上线顺序

在仓库根目录执行：

```bash
npm run test:fund-service
npm run typecheck
npm run fund-service:check
```

`test:fund-service` 包含真实 workerd、SQLite Durable Object 和无密钥客户端联调；上游使用合成数据，禁止访问真实密钥。覆盖缓存、预算、无密钥默认运行时、异常响应以及重定向不转发密钥。

上线先确认 Cloudflare 账号与工作区，再部署 Worker：

```bash
npx wrangler whoami
npm run fund-service:deploy
npx wrangler secret put YINGMI_API_KEY --config services/fund-data/wrangler.jsonc
```

密钥通过标准输入/交互提示写入 Cloudflare secret，不写入命令参数、Git、构建产物或文档。需授权将现有本机密钥交由该 Cloudflare 账号托管，并用于上述供应商的只读查询。未设置 secret 时健康检查与查询返回 HTTP 503，绝不假装可用。

然后验证 `/v1/fund-research/health` 为 `ready`，在完全未配置本机基金密钥的客户端上验证四种任务及错误提示。服务成功并不代表客户端已分发：需要按现有本地测试手册构建验证，再按正式发布手册签名、公证和分发新版；旧安装包仍保持原先本地凭据行为。不得在服务尚未就绪时向所有用户发布这份客户端。

## 回滚

临时停用可移除 Worker 的数据源 secret，新客户端会收到明确的服务不可用提示；不要删除 Durable Object 类或迁移。修复后恢复 secret 即可，不需要向用户分发密钥。回滚客户端应通过正式发布流程发新版，不能复用或降低发布版本。

## 参考

- [Cloudflare Rate limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Cloudflare SQLite Durable Object storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
