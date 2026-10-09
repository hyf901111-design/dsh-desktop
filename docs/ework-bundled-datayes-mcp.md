# EWork 内置通联 MCP

2026-10-09 验证：通联官网个人中心发放的 Token 可连接 EWork 现有的 `https://gw.datayes.com/rwtracker/datayes-mcp`，返回 `datayes 0.2.0` 与原连接相同的 10 个工具。官网同时提供分类 MCP，例如股票行情入口；它们与综合入口的工具集不同，本次继续使用综合入口。

## 客户端行为

- 「插件 → MCP」自动提供「通联 DataYes MCP（内置）」，默认启用，不能关闭、删除、断开、编辑配置或停用单个工具；可以查看工具和重新测试。
- 用户登录 EWork 即可调用，不需要填写通联 Token。未登录时连接仍可见，调用提示先登录。
- 每个账号使用独立的内置连接标识与工作区授权，适用于该账号所有拥有的工作区。账号切换取消旧请求；定时任务仍遵守已有的任务授权规则。
- 保留原有个人通联连接、加密凭据和组件绑定，不自动迁移或移除。
- 10 个工具为 `ai_search`、`reportdata_search`、`meeting_search`、`announcement_search`、`search_api`、`get_catalog`、`get_api_info`、`call_api`、`macro_industry_data`、`cite_link`。默认元数据在 `config/datayes-tools.json`，实际连接时重新发现并检查 schema 变化。

## 云端部署与凭据

网关是 `https://updates.evanarts.com/v1/datayes/mcp`，由既有 `sherlock-fund-data` Worker 提供，复用 EWork 账号鉴权。公共安装包与连接配置没有通联 Token，账号凭据只在主进程读取。

供应商凭据仅存 Cloudflare Secret `DATAYES_MCP_API_KEY`。通过 Wrangler 的交互提示或标准输入配置，不写入参数、源码或文档。保留 `YINGMI_API_KEY`、`TONGHUASHUN_API_KEY` 与既有账户/基金路由。

网关只支持 MCP 初始化、通知、ping、工具发现和上述 10 个工具的调用；供应商地址固定且不跟随重定向。上游会话不向客户端公开；每次发现或调用建立独立上游会话。每个账号/IP 每分钟限 60 次请求，输入最多 256 KiB，结果最多 8 MiB，上游总等待最多 55 秒。调用记录仅保存账号、能力、时间与完成状态，不记录参数、结果、凭据或供应商原始异常。

部署沿用 `npm run fund-service:deploy` 的生产账号与现有 R2 桶归属校验；部署前先运行 `npm run fund-service:check`。回滚可回退 Worker 版本或移除新增 Secret，客户端明确提示服务不可用。云端部署与桌面正式发布分开，现有用户需升级包含本修改的客户端才获得内置连接。

## 聚焦验证

```sh
npx vitest run test/bundled-datayes-mcp.test.ts test/integration-service.test.ts test/integration-mcp.test.ts test/integration-view.test.ts test/account-service.test.ts test/fund-data-service.test.js test/fund-data-deployment.test.js
npm run typecheck
npm run fund-service:check
```

真实验收须包括原生 MCP 列表锁定状态、工具发现，以及经过账号鉴权网关的一次实际只读工具调用；仅显示「已连接」不足以证明数据调用成功。

2026-10-09 当前 Worker 版本 `6b15f546-1462-4e98-a0f9-40b47114a899`。Secret 清单确认原有两项凭据保留，新增通联 Secret；未登录的 MCP 请求返回 HTTP 401，原基金健康检查仍为 HTTP 200 / ready。桌面版本保持 1.1.1，此服务部署没有修改公开客户端更新源。

实际云端验证：使用现有 EWork 登录态发现 10 个工具；通过运行中的主客户端集成桥执行 `get_catalog`，HTTP 200、无工具错误，返回 3752 字节的目录内容。仅记录状态、长度和 SHA-256，不保留查询内容或凭据。

公网验收发现上游 `redirect: error` 会立即抛出重定向相关异常，而同一请求使用 `manual` 可正常返回 HTTP 200。网关改为手动模式并拒绝所有非成功响应，绝不跟随重定向。错误诊断仅输出固定阶段、错误分类和 HTTP 状态，不输出上游响应或异常原文。内置连接发现失败立即提示，不进行十轮重连后才显示取消；个人 MCP 的重连逻辑不变。
