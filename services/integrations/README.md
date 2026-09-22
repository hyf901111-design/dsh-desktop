# EWork 应用授权与插件目录服务

当前提供可运行的 Worker 源码与本地 HTTP / SQLite 验证。**尚未注册产品 OAuth、配置生产 Secret 或部署服务，不能把此目录视作已上线的公共连接功能。** Google 个人桌面授权和 Notion 内部令牌走客户端适配器；Notion 公共 OAuth 才使用本服务。

## 客户端接线

- `GoogleCalendarAdapter(vault, {openExternal})`：`Connection.config.clientId` 填用户自己注册的 Desktop OAuth Client ID；应用需启用 Calendar API。系统浏览器 + S256 PKCE + 随机端口的 `127.0.0.1` 回调。凭据使用 `authorize()` 返回的 JSON 原文存入主进程 Vault；刷新必须允许 `vault.put(ref, value)` 原子覆盖同一 ref。
- `NotionAdapter(vault, {openExternal, accountToken, brokerUrl})`：`brokerUrl` 必须来自主进程可信部署配置。仅当连接上的 `brokerUrl` 与该地址的 origin 一致，且两者都是根路径时才允许发送 EWork 账号令牌。生产环境仅 HTTPS；未配置公共服务时可手工添加 Notion 内部连接令牌。
- 客户端只保存 Notion Broker 的连接引用，不接收 Notion access / refresh token。Vault、工作区授权、工具授权与模型上下文隔离由主进程集成服务管理。
- Google 首版只读 `calendars_list` / `calendar_events`；Notion 首版只读 `search` / `page_read` / `block_children`。分页令牌直接返回结果，后续调用可继续分页。Notion 页面正文需要读取子块，嵌套块需逐层继续读取。

## 生产准备（尚未执行）

1. 注册 Notion 公共集成，只启用读取内容所需权限，并配置固定 HTTPS 回调：`https://<实际服务域名>/v1/integrations/oauth/notion/callback`。真实 Client ID / Secret 由服务所有者提供，禁止放进桌面端包。
2. 为此 Worker 配置 `ACCOUNTS_DB`（现有账号库）和独立 `INTEGRATIONS_DB` D1 绑定。在后者执行 `migrations/0001_integrations.sql`。前者仅用于复用 `services/accounts/auth.js` 的会话鉴权，不在此服务创建账号或写账号表。
3. 通过 Cloudflare Secret 配置 `NOTION_CLIENT_ID`、`NOTION_CLIENT_SECRET`、`NOTION_REDIRECT_URI` 和 `INTEGRATION_TOKEN_KEY`。加密键必须为独立的 32 字节随机值的 Base64 编码，不得写入源码、日志或客户端。直接替换加密键会令已有连接失效；换键前需要设计版本化迁移或安排重新授权。
4. 给 `wrangler.jsonc` 添加实际域名路由和 D1 绑定；配置中默认没有任何生产路由、数据库 ID 或虚构服务地址。再由主进程可信配置提供相同 Broker origin，例如根接线采用的 `EWORK_NOTION_OAUTH_BROKER_URL`。
5. 完成真实外部账号授权、拒绝授权、过期刷新、断开连接、重新登录及账号切换验收后，才能把公共 OAuth 标记为可用。当前本地 fixture 不代替这些验收。

## HTTP 协议

下面的 OAuth / proxy 接口除回调外均为 POST JSON，使用现有 EWork 会话的 `Authorization: Bearer <account session token>`；账号 ID 一律由服务器认证得到。拒绝跨 Origin 的浏览器请求，不暴露 CORS 授权。

| 路径（前缀 `/v1/integrations`） | 请求 | 结果 |
| --- | --- | --- |
| `/oauth/notion/start` | `{connectionId}` | `{ticket, authorizationUrl, expiresAt}` |
| `/oauth/notion/callback` | GET `state` + `code` | 浏览器纯文本结果，不包含令牌 |
| `/oauth/notion/complete` | `{ticket}` | 202 `{status:"pending"}` 或 `{status:"connected",connectionId,accountLabel}` |
| `/oauth/notion/cancel` | `{ticket}` | `{status:"cancelled"}` |
| `/oauth/notion/disconnect` | `{connectionId}` | 本地撤销并尝试远端撤销；远端失败明确返回错误 |
| `/proxy/notion` | `{connectionId,operationId,args}` | 只读 Notion JSON；没有任意 URL 代理 |

state 和 ticket 为独立随机值，仅保存 SHA-256；票据绑定账号、十分钟过期且只能消费一次。回调先把令牌加密暂存于授权流程，消费 ticket 的同一 D1 事务内才提升为可调用连接。取消、过期或断开阻止迟到回调重新授权。AES-256-GCM 的附加认证数据绑定账号与连接 ID，复制密文到其他账号或连接不能解密。

Notion refresh token 会轮换。D1 的刷新租约和 revision 条件更新避免并发覆盖；401 只触发一次刷新和一次只读重试。未知或写入操作不会发送到 Notion。网络目的地固定为 `https://api.notion.com/v1/...`，不跟随重定向；30 秒截止，响应上限 8 MiB；入站 JSON 上限 8 KiB / 5 秒。同一账号最多十个正在等待的授权流程。过期流程在下一次开始授权时清理，生产可额外安排保留期清理；已授权但随后取消的上游授权可能仍显示在 Notion 账号中，可由用户在 Notion 撤销，EWork 不保留可调用令牌。

## 聚焦验证

在仓库根目录运行：

```sh
npx vitest run test/integration-oauth.test.ts test/integration-providers.test.ts test/integration-broker.test.js test/integration-catalog-worker.test.js test/integration-catalog.test.ts
```

覆盖真实本机回调与 S256、错误/重复 state、取消监听、Google 刷新合并与原 ref 回写、Notion 内部令牌 HTTP、账号越权、AES 账号绑定、一次性 ticket、延迟回调与断开、失效刷新、以及桌面 Notion Adapter → 真实本机 Broker HTTP → SQLite → 模拟 Notion HTTP 全链路。所有凭据都是测试常量，未访问个人账号。

协议依据：[Google 原生应用 OAuth](https://developers.google.com/identity/protocols/oauth2/native-app)、[Google Calendar API](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)、[Notion 授权](https://developers.notion.com/guides/get-started/authorization)、[Notion 刷新令牌](https://developers.notion.com/reference/refresh-a-token)、[Notion 撤销令牌](https://developers.notion.com/reference/revoke-token)。Notion 请求固定使用 `2026-03-11` API 版本。


## 公开只读目录

`GET /v1/integrations/catalog?kind=plugin&query=研究&cursor=<上页游标>` 返回 `{schemaVersion:1, entries, nextCursor, catalogRevision}`。`kind` 可选 `plugin/app/tool/skill`；省略时返回全部分类。`query` 搜索名称和说明；`cursor` 是查询、页大小和目录 revision 绑定的 opaque token，不是 URL。默认每页 20 条；可选 `limit=1..20`；每条 JSON 上限 256 KiB，总响应上限 8 MiB。对已发布条目按 ID 稳定排序，目录改变后旧 cursor 返回 409，客户端应从第一页刷新。ETag 包含全目录 revision，后页变化也会使第一页的 ETag 失效；支持 `If-None-Match` / 304。

此接口是公共读取，明确先于账号/OAuth 鉴权路由；允许跨域 GET，但没有公开上架、编辑或删除接口，POST 返回 405。目录服务可以单独部署，不要求 Notion OAuth Secret 或账号数据库。目录绑定优先 `CATALOG_DB`，也可使用已执行迁移的 `INTEGRATIONS_DB`；**存在绑定但迁移损坏时返回 503，不用内置条目掩盖失败**。两者均未配置时，Worker 打包携带 `build/integration-catalog/catalog.json` 的真实内容。

### 上架与签名

1. 对目录 D1 执行 `migrations/0002_catalog.sql`。该迁移创建条目表、发布状态、索引和自动递增的目录 revision 触发器。既有 OAuth 数据表不变。
2. 运维通过受控 SQL 文件插入 `integration_catalog_entries(id,kind,status,entry_json)`，初始 `status='draft'`。`entry_json` 与内置目录的单条结构一致，包含 `id/kind/name/description/publisher/version/permissions/manifest`，以及需要时的 `minClientVersion/digest`。插件和技能的摘要为整个 manifest 的 canonical JSON SHA-256。只接受声明式 manifest，不接受安装脚本。
3. Worker 会使用与桌面安装器相同的 `validateManifest`、版本比较和摘要校验；连接模板仅允许已有 Provider/API/MCP 字段，操作侧内部字段不会进入响应。先用 `validateCatalogEntry(entry)` 和聚焦测试校验运维条目；内置资源修改还需运行 `node scripts/validate-integration-catalog.mjs`。确认后运维将该行更新为 `published`，撤回改为 `withdrawn`。请求只读 published；畸形已发布条目使该页明确失败。
4. 需要签名时，用 Cloudflare Secret 配置 `CATALOG_SIGNING_PRIVATE_KEY`（Ed25519 PKCS#8 PEM），客户端来源配置钉住对应 `CatalogSource.publicKey`（SPKI PEM）。Worker 对 `{schemaVersion,entries}` 的 canonical JSON 签名并返回 Base64 `signature`，与现有客户端校验协议一致。私钥不得进入客户端或仓库；配置了错误私钥时失败，不会降级为未签名。

桌面客户端内置目录仍为默认来源，没有预填一个尚未部署的“官方市场” URL。只有部署并配置真实 HTTPS 来源后才访问远端。`IntegrationCatalog` 对远端逐页校验签名、条目和 ETag；最多 25 页、500 条、8 MiB，游标只能修改同一 origin/path 的查询参数。分页重复、校验失败或超限不会保存部分结果；网络失败只能使用先前完整且已验证的目录快照，不能把本次部分新页与旧页拼在一起。带目录凭据的缓存不写磁盘。离线缓存表示历史目录，安装仍校验 manifest 摘要与兼容版本。

### 仅打包验证

```sh
WRANGLER_SEND_METRICS=false node_modules/.bin/wrangler deploy --dry-run --config services/integrations/wrangler.jsonc --outdir /tmp/ework-integrations-worker-dryrun
```

已验证 Wrangler 可以打包跨目录 TypeScript manifest 校验器、JSON 资源及 `nodejs_compat` 依赖；dry-run 不部署、不创建 D1、不注册路由、不配置 Secret。真实生产部署和发布上架仍未执行。
