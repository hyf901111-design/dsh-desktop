# Research Boards Collaboration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现个人常用研究入口、独立共享副本、按用户 ID 邀请、消息通知、在场头像及可撤销权限的实时共同研究。

**Architecture:** Electron 主进程管理本地持久化、账户令牌、共享资料和网络连接；现有 Research workspace 通过窄桥接入共享文档。Cloudflare Worker 使用既有账户数据库鉴权，Durable Objects 串行协调看板和通知，Yjs 合并组件字段与文本，R2 保存私有资料。

**Tech Stack:** Electron/TypeScript、现有 React 客户端补丁、Yjs 13.6.32、y-protocols 1.0.7、Cloudflare Workers/D1/DO/R2、Vitest、Miniflare/workerd。

**Spec:** `docs/superpowers/specs/2026-09-09-research-boards-collaboration-design.md`（用户已于本轮授权按此方案开发）。

## Global Constraints

- 共享时创建独立副本；共享副本的编辑不改变原研究。
- 「研究看板」位于「新对话 / 新研究」下方、「工作区」上方。
- 个人常用记录保存在本机，未登录也可使用。
- 公开用户 ID 为 10 位数字字符串，允许前导零；邀请 7 天有效；第一版每板最多 10 名成员。
- 铃铛替换原 chevron，头像和用户名仍打开账户菜单；邀请气泡包含接受/拒绝；关闭气泡不处理邀请。
- 头像仅统计当前看板用户，按 userId 去重，最多 5 个加 +N；悬停及键盘聚焦显示用户名与角色。
- 取消共享结束非所有者云端访问，已保存成果留给所有者，本人未同步内容可恢复；归档保留有效成员只读访问。
- 权限、任务与邀请状态由服务端控制，不放进客户端可任意写入的 CRDT 文档。
- 原始本机路径、登录令牌、模型 API Key、工具授权和原始 Harness 运行日志不得共享。
- 不推送、不正式发布、不变更版本和公开更新源；不从功能 worktree 构建或替换共享客户端。
- 每个完成并通过聚焦验证的任务单独中文提交，只提交自己的文件；不运行全功能测试。

## Interfaces shared by tasks

Client-facing bridge is `window.dshDesktop.researchBoards`:

```ts
type ResearchBoardBridge = {
  invoke(action: string, input?: unknown): Promise<unknown>
  subscribe(listener: (event: { type: string; boardId?: string; data: unknown }) => void): () => void
}
type CanvasSnapshot = {
  files: Record<string, unknown>[]
  artifacts: Record<string, unknown>[]
}
type ContextMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: number; authorId?: string }
type BoardSnapshot = { canvas: CanvasSnapshot; messages: ContextMessage[] }
```

云端 action 的具体参数/响应以 Task 1 写出的 `services/collaboration/PROTOCOL.md` 为唯一联调契约。客户端本地 action 包括 `list-personal`、`favorite`、`unfavorite`、`rename-personal`、`reorder-personal`、`create-shared`、`open`、`close`、`canvas-change`、`presence`；其他 action 对接经过白名单的云端协议。客户端不得接收任意网络地址。

前端通过注册在既有客户端 apply/context 中的窄适配层完成 session 创建、打开和当前会话快照读取。不要通过 DOM 猜测用户原始文件路径或会话身份；DOM 只用于挂载 UI，真实动作使用 sessions/workspaces/actions API。

### Task 1: Cloud collaboration protocol, persistence and authorization

**Files:**
- Create: `packages/dsh-research-collaboration/{document.js,document.d.ts,protocol.js,protocol.d.ts,package.json}`
- Create: `services/collaboration/{worker.js,http.js,room.js,notifications.js,repository.js,validation.js,PROTOCOL.md,wrangler.jsonc}`
- Create: `services/accounts/migrations/0002_research_boards.sql`
- Modify: `services/accounts/auth.js` only if compatibility-safe public ID integration needs it; maintain older migration-only tests.
- Modify: `package.json`, `package-lock.json` for exact collaboration dependencies.
- Create: `test/research-board-document.test.js`, `scripts/test-collaboration-worker.mjs`

**Consumes:** existing `authenticate(request, env)` and `ACCOUNTS_DB` users/sessions; existing account IDs remain UUIDs.
**Produces:** deployable Worker exports `ResearchBoardRoom`, `ResearchNotifications`; `/v1/collaboration/*` authenticated APIs, short-lived single-use connection tickets, private assets routes, and documented structured error responses; shared Yjs document helpers imported by the main process.

- [ ] Write failing behavior tests for field/text convergence, frozen independent copy, revoked write and invitation acceptance. Start with actual document fixtures:

```js
const initial = { files: [], artifacts: [{ id: 'a', kind: 'pasted-text', title: '金价', excerpt: '研究', x: 0, y: 0 }] }
// Create two documents from one encoded initial state; A changes x, B inserts text.
// Exchange updates in both orders; assert both project to x=120 and excerpt='共同研究'.
// Delete a node at the room, then submit an offline edit; assert it stays deleted.
```

- [ ] Run `node_modules/.bin/vitest run test/research-board-document.test.js` and record expected failing output before implementing.
- [ ] Implement document projection and local-diff application with nested shared maps/text. Publish actual named exports and their types in PROTOCOL.md. Shared canvas excludes task authority and secrets; enforce size/shape and tombstones at the server boundary.
- [ ] Implement idempotent creation, exact public ID lookup, role-scoped invitations, notification read/pending state, memberships, archive/restore/cancel/reopen, messages, asset upload/read, and task claim/result/control. Serial room commands plus D1 transactional outbox prevent partial successful invitations. Public ID provisioning must be race-safe and work for existing users without breaking pre-migration account responses.
- [ ] Use hibernation WebSockets. Tickets bind session hash, user, board, epoch and scope; validate live sessions and membership for content reads and mutations. Notifications have a separate user channel. No plaintext account tokens in URLs, no caller-provided role/author authority.
- [ ] Build real Miniflare tests using local D1/DO/R2, three synthetic accounts and two real WebSocket connections. Authenticate with hashed synthetic session rows. Test owner/editor/viewer, wrong recipient, duplicate accept, cancellation races, rejoin stale epoch, asset denial, task lease, notification reconnect, unknown IDs and size limits.

```js
assert.equal((await viewerWrite()).status, 403)
assert.equal((await acceptTwice()).memberCount, 2)
assert.equal((await ownerCancel()).sharingState, 'ownerOnly')
assert.equal((await oldMemberRead()).status, 403)
assert.equal((await oldMemberWrite()).status, 403)
assert.equal((await ownerRead()).snapshot.canvas.artifacts[0].title, '共同结论')
```

- [ ] Run the focused document suite and `node scripts/test-collaboration-worker.mjs`; commit only task-owned paths with a Chinese message and record RED/GREEN evidence and API contracts.

### Task 2: Electron local boards, authenticated transport and durable recovery

**Files:**
- Create: `src/shared/research-boards.ts`, `src/main/state/research-boards-store.ts`, `src/main/research-boards-service.ts`, `src/main/collaboration-client.ts`, `src/preload/research-boards.ts`
- Modify: `src/main/index.ts`, `src/main/account-service.ts`, `src/preload/index.ts`, `src/main/state/research-context-bridge.ts`
- Create: `test/research-boards-store.test.ts`, `test/collaboration-client.test.ts`, `test/research-boards-service.test.ts`

**Consumes:** Task 1 PROTOCOL.md and typed document helpers; real `ResearchCanvasStorage`, account service and trusted-main-window IPC registration.
**Produces:** `ResearchBoardsStore` durable personal favorites; `ResearchBoardsService` lifecycle/invoke/events; `createResearchBoardsBridge(ipcRenderer)`; `AccountService` narrowly scoped authenticated request capability without exposing tokens.

- [ ] Write and run failing tests around restart persistence, duplicate favorite, original/shared isolation, unauthorized IPC, account switch, epoch revocation recovery, and no arbitrary destination URL.
- [ ] Persist personal favorites and per-account shared bindings atomically under userData. Keep user ordering and board membership separate. Preserve original research data; store shared document and pending updates by accountId/boardId/epoch.
- [ ] Add trusted IPC and transport using production fixed origin, with explicit constructor-injected loopback transport only in test harnesses. Persist before send; ACK only after server durable confirmation. Reconnect validates epoch before replay, checks own receipts and surfaces recoverable own edits.
- [ ] Implement avatar-presence event delivery and notification startup catch-up/dedupe. Close old subscriptions and erase old rendered identity on account switch/logout. Task 3 UI consumes typed state/events, not raw credentials.
- [ ] Wire local canvas read/write through service with permission guard. Resource/context import hooks are defined explicitly for Task 4, with unavailable resources rejecting publication instead of silently losing context.
- [ ] Run only new service/store/client tests and directly affected account/IPC tests plus typecheck. Commit task paths in Chinese with test evidence.

### Task 3: Real Research/sidebar bindings and collaboration UI

**Files:**
- Create: `src/preload/research-boards-ui.ts`, `src/preload/research-board-notifications-ui.ts`, `src/preload/research-board-dialogs.ts`
- Create: `scripts/lib/patch-research-board-client.mjs`, `scripts/lib/patch-research-board-client.d.mts`
- Modify: `scripts/patch-web-frontend-loading.mjs`, `src/preload/index.ts`, `src/preload/account-ui.ts`, relevant `src/shared` contracts
- Create: `test/research-boards-ui.test.ts`, `test/research-board-client-adapter.test.js`

**Consumes:** `window.dshDesktop.researchBoards`, existing real `ctx.sessions`, `ctx.workspaces`, `ConversationRoot` actions and ResearchWorkspaceRegistry.
**Produces:** working favorite/navigation, copy/invite flows, bell/popover, member management, presence and role/read-only/termination UI connected to the service.

- [ ] Add failing DOM/component behavioral tests with a stateful bridge boundary and real existing client module loading, following current test fixtures. Verify favorite -> sidebar -> research open after reload; invite -> bell -> accept; viewer cannot mutate.
- [ ] Add exact, idempotent source transforms for existing package `lib/client.js` during postinstall/build, with missing-anchor errors. Keep feature source in new modules; do not edit shared canonical node_modules or use source grep as behavioral proof.
- [ ] Register a genuine session navigation/capture adapter from ctx, publish current research identity and canvas changes, and subscribe to remote changes. Apply remote snapshots without feedback loops, resetting personal undo appropriately while preserving local unsynced edits.
- [ ] Mount the research section above workspaces and star/share/avatar controls in the actual header. Split account button and bell as siblings; preserve update footer layout. Render Chinese dialogs, public ID copy, exact user lookup, reviewable creation range, roles, notifications and owner controls.
- [ ] Show at most five deduped current-board avatars plus overflow. Tooltips support focus/hover; membership includes offline users only in the member panel. Sharing cancellation replaces both canvas and shared conversation with termination/recovery UI.
- [ ] Validate actual rendered client modules in a browser against synthetic users and the real local service. Cover both themes, sidebar collapse, narrow header, pending/accepted/revoked invitations and pointer interaction; save screenshots outside tracked source.
- [ ] Run focused UI/adapter tests, build-source checks and typecheck; commit task-owned files in Chinese and record rendered evidence.

### Task 4: Portable context, authorized assets and single-executor AI

**Files:**
- Create: `src/main/state/research-board-snapshot.ts`, `src/main/state/research-board-assets.ts`
- Modify: `src/main/research-boards-service.ts`, `src/main/state/research-context-bridge.ts`, `src/main/index.ts`, frontend adapter, and `packages/dsh-research-task-runtime/{index.js,context-runtime.js}` as necessary
- Create: `test/research-board-snapshot.test.ts`, `test/research-board-assets.test.ts`, `test/research-board-tasks.test.js`

**Consumes:** real session snapshot/actions, existing file preview authorization, Task 1 private resource/task APIs and Task 2 service.
**Produces:** complete copy at one revision, authenticated portable file preview/read, materialized shared context and scoped task leases.

- [ ] Write failing tests: original file changed/deleted after copy, missing source aborts publication, no machine paths/tokens in wire snapshot, canceled sharing rejects task result, concurrent requests retain request/author identities.
- [ ] Capture visible saved user/assistant records through a bounded runtime/client contract. Remap component/message/source IDs consistently, copy completed output and mark running tasks interrupted. Strip local capabilities/configuration; source-text and document bytes must match captured version.
- [ ] Upload assets to board-scoped private storage, validate completeness before activate/invite, download into account/board-scoped cache, and authorize them through the existing safe preview bridge. All resumes reuse operation IDs; report concrete missing assets.
- [ ] Feed shared messages/materials into each new shared request at an accepted contextRevision. Shared submitted messages and assistant results get authoritative author/request linkage. Do not replay imported history or silently start other members' models.
- [ ] Wrap generated component actions with task claim/lease and result CAS; handle cancellation/role loss/epoch changes and stale result recovery. Only one executor owns refresh work; stop its loop when ownership is lost.
- [ ] Run focused snapshot/assets/tasks tests and directly affected existing research context/task tests; commit in Chinese with evidence.

### Task 5: End-to-end local integration, review and handoff

**Files:**
- Create: `scripts/test-research-collaboration-e2e.mjs`, local deployment/operation documentation under `docs/`
- Modify only directly failing seams from the completed tasks, preserving ownership/report records.

**Consumes:** all prior tasks and their test/review evidence.
**Produces:** reproducible two-account real-service validation, packaged source reproducibility evidence, integration handoff artifacts and honest deployment/runtime status.

- [ ] Drive two clients with isolated accounts against real local workerd service. Verify independent fork, invitations, concurrent text/position edits, file/context reads, presence, disconnect/restart, cancel-sharing with unsynced changes, and rejoin stale epoch rejection.
- [ ] Validate renderer package transforms from clean installation inputs and actual UI state, not only HTTP success. Check meaningful screen, console errors, interactions and screenshots. No production user data or credentials in fixtures.
- [ ] Run the complete focused collaboration check set once after integration, plus typecheck and package-source checks; no full suite.
- [ ] Dispatch task and whole-branch reviews with immutable diff packages; fix actionable findings and rerun only covering checks. Record any unresolved limitations explicitly.
- [ ] Create local Chinese commits and a handoff through `docs/sherlock-multi-session-integration-runbook.md`; use its integration/preflight path before canonical-main acceptance. Do not build the shared client from this feature worktree.
- [ ] Prepare cloud deployment commands/schema/configuration and validate via local wrangler dry-run. User requested development, so do not modify production Cloudflare state or publish releases as part of this task. Cloud-live readiness must be reported separately from local success.
