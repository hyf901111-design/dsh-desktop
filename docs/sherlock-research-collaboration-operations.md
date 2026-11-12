# 研究看板协作：本地验收与部署准备

2026-09-09 后续部署状态：用户已另行授权云端部署，已从集成提交 `030712ee21a5a50a63232a48c0106251c85b5390` 部署并通过真实云端双账户检查，见[首次云端部署记录](research-collaboration-cloud-20260909.md)。下文“部署准备”保留首次开发时的流程和边界；未实测的模型计费、容量及跨设备 UI 边界仍然适用。

本功能提供本机常用研究入口、独立共享副本、按 10 位用户 ID 邀请、通知、在场信息、授权文件及单发起方执行。当前证据来自真实 Chromium 中的生产 renderer module、主进程 service/integration、独立账户目录与本地 Miniflare/workerd 的 D1、Durable Objects、R2。它不等同于已打包桌面客户端、付费模型、Cloudflare 线上部署或容量压测。

## 本地验收

在包含已安装开发依赖的功能或集成 checkout 根目录运行：

```bash
node scripts/test-research-collaboration-e2e.mjs
```

该入口顺序执行 18 个直接相关 Vitest 文件、项目 `npm run typecheck`、真实 Worker 集成、清洁包输入再现、真实双浏览器流程和 `wrangler deploy --dry-run`，最后检查 diff 空白。任一步失败会停止并返回非零退出码。它不运行全功能 suite、不安装依赖、不调用真实模型、不执行远端迁移或部署。各阶段 argv、时间、退出结果、source tip 和日志保存在 ignored `output/research-collaboration-e2e/run-*/results.json`；`latest-results.json` 是最近一次执行指针，不是历史成功凭据。

修复失败后可只运行覆盖阶段：`--stage focused`、`typecheck`、`worker`、`sources`、`browser`、`dry-run`。`browser` 要求最近的 clean-input manifest 与当前 feature/main SHA 一致；源代码或 main 变化后先运行 `sources`。正式交接只引用源码干净、绑定最终提交的结果。浏览器截图与 console.json 在 ignored `output/playwright/research-boards/`。仅确证的原始 DshChipCell 内嵌字体 URL 的 SHA256 与相同 ERR_INVALID_URL 被排除；新增 pageerror、其他 console error、失败请求均使验收失败。

2026-09-10 Figma 最终界面改造的聚焦验收可显式运行：

```bash
node scripts/test-research-collaboration-e2e.mjs --stage sources
SHERLOCK_COLLABORATION_BROWSER_FOCUS=figma-final node scripts/test-research-collaboration-e2e.mjs --stage browser
```

仅环境值恰好为 `figma-final` 时，浏览器阶段传入 `--figma-collaboration-focus`。默认完整流程保持不变。聚焦模式验证导航、邀请接受/拒绝/撤销、角色权限、两成员文字与拖动同步、重挂载、退出重入、取消共享及恢复专用菜单；跳过文件剪贴板/个人复制回环、任务恢复/多作者生成、账户恢复隔离及旧 iframe 内滚动/生成几何后段。结果 JSON 的 scope、exclusions、focusEnvironment 明确记录范围，不能将此结果称作完整浏览器验收。

浏览器采用两个隔离账户和真实 Session 保存记录：并发独立文字/位置修改；第二作者显式请求与接收者零额外执行；独立个人副本重新收藏、审阅快照后实际创建第二代云板、邀请另一账户读取历史/引用/资产字节；预览后的个人修改仍留在个人会话；短暂断网时本人编辑/草稿遇到所有者取消，重连仅恢复本人未同步贡献；退出登录后个人副本/常用记录仍可用。每项都有持久数据断言，不只依赖截图。

Worker 层另覆盖三角色、邀请拒绝/到期/撤销、重复接受、会话与 epoch、通知补发、R2、任务租约、归档/恢复、真实 workerd 重启。字段合并/undo、迟到回包、所有受限快捷入口、max5+N 等更细边界由直接相关 focused 检查覆盖；两人截图不代表验证了 10 人负载。

### 包来源与复现边界

基础四个注册表输入固定为 `@deepseek-ai/dsh-client-ui-conversation`、`dsh-client-ui-sidebar`、`dsh-client-ui-primitives`、`dsh-web-frontend` 的 `0.1.0-rc.7`。当前缓存归档路径记录在 ignored `output/research-boards-source-inputs-20260909/verified-inputs.json`。sources 另从相同 lock 的精确 resolved URL 补齐 workspace 与 layout 的 0.1.0-rc.7 归档，共六个 clean-input 包。脚本重新验证每个 SHA512 与 package-lock 的 integrity/resolved URL；缺失或不匹配就失败，不下载其他版本或改写 lock。

迁移到其他工作目录时先从相同 lock 的精确 resolved tgz URL 执行 `npm pack <resolved-url> --offline --ignore-scripts --pack-destination <private-output>`，重建带 name/version/archive/resolved/integrity 的 inventory，并校验 tarball SHA512。不按 npm 缓存 basename 或更新时间选择包。inventory 与所有解包目录均只属于本地测试输出。

每次 sources 阶段建立两个独立目录：feature matching baseline；当前 main SHA 的 conversation baseline 加 feature 其他 matching baseline。先应用 patch-package 文件，再运行完整 `patch-web-frontend-loading.mjs` 两次并比较所有目标文件 hash，随后执行真实 conversation/sidebar module factory。最终浏览器挂载真实 ResearchConversationPanel 的 conversationHost/composerHost 和 ComposerSurface，量取长历史滚动后的末条消息与底部 composer，读取 main 兼容目录的 conversation/sidebar、primitives 和 frontend CSS；esbuild 明确将 primitives 指向同一清洁目录。其他 React/runtime 开发依赖仍来自该 checkout 已安装依赖，在结果中不冒称全部来自四归档。

两个本地 package 另以 `npm pack --ignore-scripts` 输出到私有目录，提取成 `node_modules/dsh-research-collaboration` 和 `node_modules/dsh-research-task-runtime` 的 sibling 布局，实际 import 并执行 context 与固定 ID runtime。context.js/context.d.ts、board-runtime.js 必须进入包。它们当前为内部相对文件，context 和 board-runtime **不是公开 subpath export**；runtime 使用 sibling `../dsh-research-collaboration/context.js`。main bundle 的仓库相对源输入与此安装布局分别验证，不把 feature symlink 或 tarball 检查称为 native 打包验收。活动或 canonical node_modules 不被修改。

## 服务与权限不变量

共享创建读取已审阅的 captureId，完成文件冻结/上传与闭包检查后才激活云板。原研究仍是独立个人会话；重新邀请复用选中的既有共享板，显式新建才生成新 boardId。文件仅通过有实时账户/board/epoch 授权的服务读取，无公开 R2 URL。

公开 ID 保留前导零。邀请读/关闭通知不等于接受/拒绝；服务端决定角色、到期、版本、成员及任务状态。取消共享增加 epoch 并结束非所有者的内容/文件/任务访问，所有者保留已接受成果；归档保留成员只读访问。取消前已经完成的个人副本有独立本机文件和历史，退出登录后仍可使用。本人未同步恢复只保存自己的贡献，不能保留同事的完整共享缓存。

只允许显式请求方领取和运行任务；接收、打开、重连、导入历史不触发模型。丢回包通过持久 operation/task 身份检查，不能当成新任务自动执行。运行时重启后未完成任务为 interrupted；不确定执行只能显式新 attempt，不保证外部模型副作用 exactly once。默认真实执行适配的 focused 测试只替换最低 subagent 驱动；浏览器合成 execute 边界更高，两者均未调用付费 provider。

本机路径、账户令牌、模型密钥、工具授权、原始运行日志禁止进入共享数据。完整历史含本机路径、不支持的内嵌附件，或超过共享上限时，不会截断或自动省略后上传。创建协作弹窗允许用户明确选择「仅共享看板」，重新预览后仅复制画板组件和其已授权的资料，不读取、上传原研究对话或仅被对话引用的附件。完整共享时，历史引用和生成来源一并参加资产闭包检查；仅共享看板时，画板文件和生成来源仍参加同样检查。

## 协议边界与回收

完整 wire 契约见 `services/collaboration/PROTOCOL.md`，不能绕过以下边界或以截断伪装成功。

| 项目 | 当前上限/行为 |
| --- | --- |
| 成员、邀请 | 每板 10 人；邀请 7 天；每邀请者每天 20 个新邀请；被拒绝后 24 小时冷却；精确用户查询每账户每分钟 5 次 |
| Canvas/Yjs | 1,000 节点；投影画布、编码 checkpoint、单次 Yjs update 各最多 1 MiB |
| 历史/消息 | 完整历史最多 100 条，单条文本/消息 16 KiB；超限整体拒绝 |
| 权威状态/receipt | 每份最多 1,800,000 UTF-8 bytes；累计任务/历史也占用此边界 |
| 文件 | 单文件 50 MiB；每板合计 1 GiB；inline creation request 合计 25 MiB；大文件走 staging stream |
| 临时 presence | cursor/selectedIds/previews 的 JSON 总计 8,192 UTF-8 bytes；selectedIds/previews 各最多 100；完整 socket attachment 预检 16,000 bytes |
| 临时坐标 | ID 1–128 安全字符；坐标 ±10,000,000；宽高 >0 且 ≤20,000；预览必须对应既有节点，无重复 collection/node |
| Presence/执行 | 光标 presence 30 秒租期，预览 3 秒且绑定 seq；发送最多每 100ms；socket application ping/任务 heartbeat 为 10 秒；模型 lease 30 秒；ticket 单用、30 秒 |
| 保留 | 上传 staging 24 小时后回收；通知 90 天，pending 保留；活跃板资料不受 staging 回收影响 |

WebSocket attachment 的平台上限是 16,384 serialized bytes；本实现留出额外空间并执行双层 byte preflight，不只数节点。[Cloudflare WebSocket attachment 文档](https://developers.cloudflare.com/durable-objects/best-practices/websockets/#websocketserializeattachment)

全状态限制低于 D1 2,000,000-byte row/string/BLOB 平台边界。到达限额明确返回 413，不作半份激活。[D1 限制](https://developers.cloudflare.com/d1/platform/limits/)

暂不支持任意并发数组重排；目标几何改变也会造成生成结果 CAS 冲突，结果保留供显式应用；已删除目标不会自动复活。长期本机 capture/个人 owned 文件清理策略尚未增加，需单独设计，不能在恢复所需字节仍使用时强删。

## Cloudflare 部署准备（本轮未执行远端步骤）

`services/collaboration/wrangler.jsonc` 配置 worker `sherlock-research-collaboration`，`updates.evanarts.com/v1/collaboration/*` 路由，既有 `sherlock-accounts` D1（binding `ACCOUNTS_DB`），私有 `sherlock-research-private` R2（`RESEARCH_ASSETS`），SQLite DO `ResearchBoardRoom`/`ResearchNotifications`（`RESEARCH_ROOMS`/`RESEARCH_NOTIFICATIONS`），migration tag `research-collaboration-v1`，每 5 分钟 cron。workers.dev、preview URLs、observability 均关闭。当前未核对线上 bucket、路由、迁移或套餐状态。

账户逻辑是既有 fund-data worker 导入的 `services/accounts/auth.js`，不是另一个可替换的 accounts worker。新增路由与当前 account/fund 路由分离。本功能只新增 `services/accounts/migrations/0002_research_boards.sql`，它给旧用户补公开 ID，并为新用户插入建立 trigger；保持账户 migration0001 和 auth secret 不变。没有理由仅为新增路由盲目重部署既有账户/fund服务。

得到另行部署授权后，操作员再核对目标账户、现有资源和迁移状态，然后执行下列步骤；**这些 remote 命令不是当前聚合脚本的一部分**：

```bash
# 只在授权的目标账户下检查；确认没有其他未审阅 pending migration。
node_modules/.bin/wrangler d1 migrations list sherlock-accounts --remote --config services/collaboration/wrangler.jsonc
# 列表与现状核对后，仅应用确认的新增迁移；不重建/清空数据库。
node_modules/.bin/wrangler d1 migrations apply sherlock-accounts --remote --config services/collaboration/wrangler.jsonc
# 已确认缺少该私有桶时才创建；不要给它绑定公开访问。
node_modules/.bin/wrangler r2 bucket create sherlock-research-private
# 本地干运行可预先完成；真实 deploy 需要独立的部署授权。
node_modules/.bin/wrangler deploy --dry-run --config services/collaboration/wrangler.jsonc
node_modules/.bin/wrangler deploy --config services/collaboration/wrangler.jsonc
```

真实部署后还需用授权测试账户检查路由、鉴权、邀请、双客户端连接、取消权限和资产读取，并观察数据库/CPU/错误率；通过前不能称 cloud-live ready。不要输出登录 token/模型密钥到命令、截图、日志。main-to-runtime 的私有 token 与云账户 bearer 分开，不需要创建第二套登录体系。

## 成本与负载观察

以下为 2026-09-09 核对的官方 USD 标价维度，不是账单或报价。账号当前计划及剩余额度未查；现有账号与其他服务共享额度，已付 Workers 基础订阅时不能再凭空增加第二份 $5。不能按人数推断“永久免费”。

| 资源 | 相关标价与观察量 |
| --- | --- |
| Workers | Paid 最低 $5/月，含 10M 请求及 30M CPU ms；超额 $0.30/M 请求与 $0.02/M CPU ms。记录请求、CPU及错误率。[定价](https://developers.cloudflare.com/workers/platform/pricing/) |
| SQLite Durable Objects | Paid 含 1M compute 请求及 400k GB-s，超额 $0.15/M 与 $12.50/M GB-s；SQLite 含 5 GB-month，超额 $0.20/GB-month，另有行读写维度。入站 WebSocket 消息按 20:1 请求计费，出站消息不计请求费。[定价](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| D1 | Paid 含每月 25B 行读、50M 行写、5GB；超额 $0.001/M 读、$1/M 写、$0.75/GB-month。Free 每日 5M 读/100k 写，5GB。记录行数而不只是 SQL 次数。[定价](https://developers.cloudflare.com/d1/platform/pricing/) |
| R2 Standard | 每月免费 10 GB-month、1M Class A、10M Class B；超额 $0.015/GB-month、$4.50/M A、$0.36/M B；互联网 egress 免费不等于存储/操作/Worker 免费。[定价](https://developers.cloudflare.com/r2/pricing/) |

Room/notification 使用 hibernation-capable sockets，但当前客户端每条 welcomed socket 每 10 秒发送应用 JSON ping；服务端重新鉴权，并有每 10 秒 alarm，不能把全天开着的窗口视为零数据库活动。活跃拖动预览最多 10Hz，同样有校验/查询成本。每用户可能同时有 room 和 notification socket，多设备要分别计量。DO setAlarm 也有 SQLite row-write 成本，不能只统计画板的最终保存次数。

估算应基于实际在线 board/socket 小时、入站消息、handler 时长、Worker CPU、D1/DO 行读写、R2 GB-month 与操作数。当前 authorize 会检查 session、board 和 membership；presence 广播还会逐连接复验，成员数增加会扩大单消息查询量。先测实际计划的每 invocation query/CPU 限制，再谈 10 人容量；本地小 fixture 没有证明免费层或生产容量。模型计费单独属于显式发起者 provider 用量，不能因结果共享而声称 AI 免费。

## 合并与桌面验收

完成本地中文提交及聚焦证据后，用 `docs/sherlock-multi-session-integration-runbook.md` 生成 original base→exact feature tip 的 handoff，并先执行只读 prepare preflight。Task 5 不自动创建/合并 integration batch，不记录用户未接受的 accept/promote。当前 main 的独立 0.9.5 发布不包含该功能；不能将 feature 的旧版本 metadata 复制回 main。功能 worktree 不构建或替换共享客户端。后续由集成流程在当前 main 上验证冲突和直接影响项，再取得精确 integration tip 的实际客户端验收。
