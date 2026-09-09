# Task 1 实现报告

日期：2026-09-09。状态：Task 1 服务端与共享文档实现完成，等待独立审查；不表示 Electron/UI 已接通或服务已上线。

工作目录：`/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/.worktrees/research-board-design-20260909`。
分支：`codex/feat/research-board-collaboration-20260909`。

## 交付与实际合同

完整接口见 `services/collaboration/PROTOCOL.md`，先于服务实现发布给主任务，并已同步所有最终参数和限额。

- `packages/dsh-research-collaboration/document.js/.d.ts`：`createDocument`、`encodeDocument`、`decodeDocument`、`projectDocument`、`applyCanvasDiff`、`freezeSnapshot`、`mergeDocumentUpdate`、`validateCanvas`。位置/字段为嵌套 Y.Map，文本为 Y.Text，表格/图表数据为递归 Y.Array；本地差分不重写未修改字段。冻结副本保留真实 canonicalizer 的 containerSpec、sourceText、generationSources、几何和静态生成结果；移除机器路径/执行会话/任务授权，并把运行中组件标为 interrupted。
- `protocol.js/.d.ts`：协议版本、常量、base64 转换，以及基础 Board/Role/Error 类型。根 package.json 新增精确 `yjs@13.6.27` 和 file dependency `dsh-research-collaboration`，lockfile 同步。
- `services/accounts/migrations/0002_research_boards.sql`：增量新增公开 ID、看板、成员、看板邀请、通知/outbox、操作回执、连接票据、素材 staging/索引和速率限制表。内部用户 UUID 不变；迁移补齐旧用户，注册触发器分配新 ID，`/collaboration/me` 对极小概率碰撞/缺失进行 race-safe 重试。`auth.js` 和旧迁移未修改。
- `services/collaboration/worker.js`、`http.js`、`room.js`、`repository.js`、`notifications.js`、`validation.js`：完整鉴权 HTTP、每板串行 DO、hibernation WebSocket、独立账户通知通道、D1 事务/outbox、私有 R2 代理、任务租约与结果控制。
- `wrangler.jsonc`：独立 Worker 的两个 SQLite DO、既有账户 D1、独立私有素材桶、5 分钟恢复/回收 cron 和相对 `/v1/collaboration/*` 路由。

所有命令是 `{action,operationId,epoch,...}`；成功后返回 `{action,operationId,seq,epoch,...result}`。主要动作包括 update、invite/revokeInvitation、memberRole/removeMember/leave、rename/archive/restore/cancel/reopen、message、taskCreate/Claim/Heartbeat/Result/Stop、refreshPause。公开 ID lookup 精确匹配 10 位字符串，包括前导零。

- 创建副本为用户作用域幂等。大文件先 `POST /uploads`、再 `PUT /uploads/:uploadId/assets/:assetId`，最后 `/boards` 以 uploadId 激活；小文件仍支持 inline assets。文件名为 `encodeURIComponent` UTF-8，发送 `X-Asset-Size`。不接受路径式文件名。
- 文档与成员/邀请/回执/outbox 在同一 D1 batch 原子提交，DO 串行控制竞争；D1 checkpoint 是权威，DO SQLite-backed storage 做尽力恢复镜像。镜像/广播失败不能撤销已落盘提交；每个新命令重新读取 D1 权限和 live session。
- 取消共享保留所有者成果，撤销其他成员/邀请/任务，记录 cutoffSeq、取消时间并推进 epoch。重新共享需要新邀请。只读归档保持成员读取权限。旧 epoch 写入被拒绝，只有本人 content-free receipt 可在撤权后查询。
- Snapshot 返回 `{board,snapshot:{canvas,history},documentUpdate,seq,tombstones,members,messages,tasks}`。tombstones 为只读 `collection:id` 列表；服务端删除优先，旧离线 patch 和迟到 AI 结果不能复活节点。
- 单次票据 30 秒、一次使用，绑定账户 session hash/user/scope/board/epoch；不把账户 token 放 URL。已建立的连接、每次命令/读取/广播都重新验证有效会话和角色。通知与看板 socket 分开。
- taskClaim 的幂等响应额外绑定原 session、executorId、当前 epoch、未过期租约和 running 状态。同 operationId 换 action 返回 409，不能跨 session 重放租约或研究上下文。cancel/reopen 的安全所有者回执保留超时重试能力。
- 任务捕获当前已接受版本的上下文并保存在私有 R2；结果为 applied、pendingResult 或 targetDeleted；刷新任务同一目标只有一个 pending/running，所有者 refreshPause 可中断并阻止刷新。模型调用与密钥仍在发起者本机，Worker 不调用模型或代扣模型用量。
- 高频 document update/taskResult 只查激活后的素材元数据，不遍历 R2 HEAD；创建激活时验证对象可读。流式上传在 DO 输入 gate 外接收，入板提交时重新进入 gate 并再次检查权限。并发同 assetId 内容不同返回 409，不覆盖赢家对象。

## RED 证据

所有测试先写入任务拥有路径；开始实现前已运行。安装依赖缺失和 workerd compatibility date 的初始化错误没有计作行为 RED。

| 命令/阶段 | 观察到的预期失败 |
| --- | --- |
| `node_modules/.bin/vitest run test/research-board-document.test.js` 初始 API skeleton | 4 个测试均 `document not implemented`，覆盖字段/文本合并、独立冻结、删除优先、非法文档 |
| `node scripts/test-collaboration-worker.mjs` 初始 Worker skeleton | 实际 Miniflare D1/DO/R2 启动后，`501 !== 200`，服务尚未实现 |
| 文档保真回归 | `containerSpec` 为 undefined，未保留静态组件 |
| 嵌套数组并发 | 不同行单元格修改丢失，`D` 未变成 `乙` |
| 复制运行任务 | `running` 未变为 `interrupted` |
| cancel 同操作重试 | `STALE_EPOCH / 409` 未返回原成功回执 |
| 通知游标 | pending 邀请导致 `pending invites must not stall chronological cursor` |
| taskClaim session/executor/action 复用 | 200，应为 409；分别补充绑定和 action 校验后 GREEN |
| 私有文件名 | `/Users/private/report.pdf` 上传 200，应为 400 |
| 90 天清理 | 5 条超期记录残留，应为 0 |

新增行为测试后的修改均重新运行直接相关聚焦命令。阶段中另定位并修复 workerd 的 R2 FixedLengthStream 要求，以及读取流不能被 DO input gate 持续阻塞的问题。

## 最终 GREEN（2026-09-09 11:47 UTC 这次执行）

1. `node_modules/.bin/vitest run test/research-board-document.test.js test/account-service.test.ts`
   - 2 个文件，13 个测试通过，exit 0；其中共享文档 7 个、既有账户兼容 6 个。
2. `node scripts/test-collaboration-worker.mjs`
   - exit 0；真实 workerd、D1、SQLite DO、R2，以及 owner/editor 两条真实 WebSocket；还验证同账户多连接 presence 去重和独立通知 socket。
   - 三个 synthetic accounts，另一个同用户 synthetic session；所有 token 只用于合成 session 的 hash，不读取用户真实凭证；测试拒绝未预期外网请求。
   - 覆盖精确 ID/前导零/存量 provisioning 并发、未知 ID、幂等副本、错接收人、重复 accept、viewer 拒写、邀请版本变化、取消/接受竞争、取消后的旧读写和素材 403、所有者保留成果、reopen 后旧 epoch 拒绝、本人回执、归档/恢复、过期 lease、claim session/executor/action 边界、结果应用/冲突/删除、离线删除优先、刷新暂停和单执行。
   - 注入 D1 notification INSERT 触发器异常，验证 accept 的成员写入、邀请状态、outbox 一并回滚；错误取消后可重试。
   - 验证通知读取/待处理独立、limit=1 分页持续前进、reconnect/backfill、持久化 outbox 恢复入口、会话撤销后原通知连接下一条消息返回 LOGIN_REQUIRED。
   - 验证 UTF-8 文件名、staging 激活、并发不可变上传、原字节读取、超期 staging 回收不删除已激活素材、处理完通知 90 天清理。
   - 真正 dispose Miniflare/workerd 后，重新 new Miniflare 使用同一 `resourcePersistencePath` 临时目录；重新读取原画布、本人回执、邀请终态、R2 原字节，并再次检查旧成员权限拒绝。测试 finally 删除私有临时持久化目录。
   - D1 合计过大状态创建返回 413 且不存在激活看板；1001 节点返回 413；超长消息返回 413。
3. `node_modules/.bin/wrangler deploy --dry-run --config services/collaboration/wrangler.jsonc`
   - exit 0；本地 bundle 323.92 KiB / gzip 65.89 KiB，显示两个 DO、账户 D1、私有 R2 binding；明确 `--dry-run: exiting now`，没有远端部署。
4. `git diff --check`：exit 0。

## 限额、审查重点及未测试范围

- 与已批准 spec 对齐：1000 节点、50 MiB/文件、1 GiB/看板素材、10 成员、7 天邀请。限额是服务端实际检查，不仅 UI 提示。
- 文档额外保守限额为 1 MiB projected canvas / encoded Yjs，state 和每条 receipt 各 1,800,000 UTF-8 bytes，避免撞到 D1 每行/字符串/BLOB 2,000,000 bytes 限制。总历史/任务逐渐增长可能达到明确 413；当前没有永久历史分区或自动删除研究成果。大资料应使用素材引用。未进行 50 MiB 文件、1 GiB 总素材、长期历史或 10 人并发的负载实测；测试验证了流式路径、状态边界和1000节点配额。
- 普通不同表格单元格/图表 series 编辑已验证；任意并发数组重排不属于第一版 UI 操作，未声称提供稳定 ID 的任意重排语义。正常插入/删除保留未改变的前后 shared children。
- 两层存储取舍：D1 原子 checkpoint 为唯一权威，DO 镜像是尽力写入，恢复时始终从 D1 读取。这与设计中把 DO 文档作为主要持久层有所调整，已提前向主任务说明，换取权限/文档/邀请/outbox 不发生跨存储半提交。
- 尚未对 Cloudflare 生产网络、R2 桶实际存在性、路由权限或线上迁移做验证；正式启用前必须部署增量 migration、创建/确认独立私有 `sherlock-research-private` 桶并部署 Worker。本任务没有执行这些远端动作。
- 未构建或替换共享客户端、未运行全功能测试、未 bump 版本、未修改公开更新源、未推送源码/标签、未触碰 canonical node_modules。Electron IPC、前端交互、真实共享文件捕获和多客户端 UI 验收属于后续任务。

本任务提交包含上述所有 Task 1 文件及本报告；提交信息为「实现研究看板协作服务与细粒度共享文档」。提交哈希由 Git 日志和最终交接消息提供，避免报告自引用哈希。
