# Research Progressive Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 未显式引用时，研究右侧对话自动获得当前画板的有界目录与相关证据，并能按需读取其余资料。

**Architecture:** Electron 从持久化画板和现有文件授权表捕获资料，用私有环回桥交给 Harness。Harness 内存索引按问题编排首轮上下文并注册三个会话隔离的只读工具；客户端只提交快照句柄和有界初始上下文，保留旧引用协议。

**Tech Stack:** Electron/TypeScript、现有本地 ESM runtime plugin、dsh tools、React patched bundle、Vitest/happy-dom。

**Spec:** `docs/superpowers/specs/2026-09-03-research-progressive-context-design.md`

## Global Constraints

- 研究模式、无选中节点、无显式引用才自动启用；空输入不得提交，普通对话不变。
- 首轮 6,000 估算 token/32 KiB，工具单次 1,800 估算 token/12 KiB，后续累计 12,000 估算 token/64 KiB；目录和包装也计入预算。
- 工具所有者来自 exec.agent.session.id，模型不能传路径或跨会话读取。
- 已授权网页使用捕获正文，不传认证凭据；文件必须来自已有组件授权且读取时校验版本。
- 快照不可变、过期明确失败、资料视为不可信数据；局部来源失败不伪造内容。
- 只运行聚焦测试；本地中文提交；不发布、不改版本、不推送、不构建或替换共享客户端。

## Files and responsibilities

- `packages/dsh-research-task-runtime/context-index.js`: 纯相关性、段落、预算、快照注册表。
- `packages/dsh-research-task-runtime/context-runtime.js`: prepare 路由、私有桥客户端、三个工具的 runtime 集成。
- `src/main/state/research-context-bridge.ts`: 从画板与授权表捕获并提供受保护资料，管理 capture 生命周期。
- `src/preload/research-context.ts`: 可信 capture IPC 的窄接口。
- `src/main/index.ts`, `src/main/runtime/harness-runtime.ts`, `src/preload/index.ts`, `packages/dsh-research-task-runtime/index.js`: 生命周期接线。
- conversation bundle 及其 patch/type declarations: 自动上下文发送协议、输入提示、失败恢复。
- `test/research-context-index.test.js`, `test/research-context-runtime.test.js`, `test/research-context-bridge.test.ts`, `test/research-file-drop.test.ts`, `test/sherlock-composer-workspace-ui.test.ts`: 对应行为覆盖。

### Task 1: 有界资料索引与快照读取

**Files:** Create `packages/dsh-research-task-runtime/context-index.js`; Create `test/research-context-index.test.js`.

**Interfaces:**
- Consumes `ContextSource = {id,kind,title,status?,text?,path?,revision?,sourceUrl?,sourceNodeIds?,truncated?}`; revision `{size,mtimeMs}`; path is accepted ONLY from trusted capture upstream, never model args.
- Produces `ResearchContextIndex({loadFileText, now?, id?, maxSnapshots?, maxStoredBytes?})` with `prepare({sessionId,query,sources,contextWindow?})`, `list(sessionId,{snapshotId,cursor?})`, `search(sessionId,{snapshotId,query,cursor?})`, `read(sessionId,{snapshotId,sourceId,cursor?})`. prepare returns `{snapshotId,totalSources,initialSourceIds,initialContext}`. Read APIs return JSON-safe bounded objects including text, cursor where relevant, and explicit limited/unavailable status. `estimateContextTokens(text)` export for verification.

- [ ] Write tests before implementation. Example real fixtures:
```js
const index = new ResearchContextIndex({loadFileText: async () => 'file text'});
const packet = await index.prepare({sessionId:'a',query:'黄金因子失效边界',sources:[
 {id:'report',kind:'assistant-result',title:'黄金因子报告',text:'失效边界：高通胀下美元指数关系反转。'},
 {id:'quote',kind:'generated-container',title:'ETF行情',text:'沪深300ETF 最新价4.6'},
]});
expect(packet.initialSourceIds[0]).toBe('report');
expect(packet.initialContext).toContain('失效边界');
await expect(index.read('b',{snapshotId:packet.snapshotId,sourceId:'report'})).rejects.toThrow();
```
Also test long multilingual content/hard budget incl wrappers, list pagination beyond initial catalog, reading tail via cursor, search hit deep in text, broad-summary multi-source coverage, same-text duplicate aliases, sourceNodeIds preserved, no blank source body, no arbitrary IDs/expired snapshots, revision changed/unavailable file, original source object mutation does not alter snapshot, concurrent cumulative budget cannot overrun, bounded stored bytes/eviction.
- [ ] RED: `npx vitest run test/research-context-index.test.js` must fail from absent exports/module.
- [ ] Implement normalization, deterministic Chinese/English ranking, paragraph/row-preserving excerpts, exact duplicate grouping with aliases, bounded initial catalog+evidence, lazy file reads (initial highest-ranked at most 4 files; search scans at most 8 previously unloaded files per page and returns cursor). Metadata-only/unsupported sources remain listed with status. Inject file loader `(source, signal?) => Promise<string>`; catch source failures as status. Prefix source data with untrusted-data notice, keep original question outside evidence. Store immutable cloned snapshots (2h TTL, max20 globally/32MiB). Every returned field is charged under serialized UTF-8 and estimated token budgets; reserve cumulative budgets atomically, reject exhausted reads without exposing more source text. Truncated content explicitly describes remaining/unavailable text.
```js
const packet = await index.prepare({sessionId, query, sources});
// Caller embeds only packet.initialContext and opaque snapshotId in its prompt.
const chunk = await index.read(sessionId, {snapshotId: packet.snapshotId, sourceId, cursor: 0});
```
- [ ] GREEN: targeted index tests pass; self-review catches meaningless exact-copy tests and bounds bypasses.
- [ ] Commit only task files: `git commit -m "功能：新增研究画板渐进式资料索引"`.

### Task 2: 可信画板捕获与会话内读取工具

**Files:** Create `src/main/state/research-context-bridge.ts`, `src/preload/research-context.ts`, `packages/dsh-research-task-runtime/context-runtime.js`, corresponding bridge/runtime tests. Modify `src/main/index.ts`, `src/main/runtime/harness-runtime.ts`, `src/preload/index.ts`, `packages/dsh-research-task-runtime/index.js`; update directly affected runtime/preload tests if needed.

**Interfaces:**
- Consumes Task 1 `ResearchContextIndex` and existing `loadResearchFileText`, `ResearchCanvasStorage`, `ResearchFilePreviewRegistry.resolveExportSource`.
- Produces preload `researchContext.capture({sessionId}) => Promise<{captureId,totalSources}>` via `research:context:capture` trusted-main-window IPC. `ResearchContextBridge` starts loopback server and returns endpoint `{url,token}`, captures sources from injected `readCanvas(sessionId)` and `resolveFile({sessionId,nodeId,authorizationId})`, stops cleanly; capture freeze returns no private path or body to renderer. Private `POST /snapshot` requires bearer + `{sessionId,captureId}`, exact session match, no browser Origin, bounded body, no CORS. Captures TTL 10min/max20/32MiB.
- Env `SHERLOCK_RESEARCH_CONTEXT_URL`, `SHERLOCK_RESEARCH_CONTEXT_TOKEN` goes only into Harness process. Runtime route `/sherlock/research-context/prepare` requires trusted same-origin POST and existing session; request `{sessionId,captureId,query}`, response Task1 packet.
- Three tools `research_context_list`, `research_context_search`, `research_context_read` use `exec.agent.session.id` and never accept sessionId/path. Register real `defineTool` output schema and model-facing render. Include tool descriptions explaining progressive disclosure and source trust. Errors are concise user-facing Chinese, no private token/path leakage. Stop/dispose unregisters routes/tools and clears captures.

- [ ] Write failing bridge tests with real HTTP server and fake stored canvas, real temporary authorized file. Assert attacker path supplied in request is rejected, wrong bearer/origin/capture owner denied, subframe IPC denied, normal artifacts/web/containers/mindmaps normalized, empty/failed status retained, missing authorization omitted as unreadable, snapshot remains fixed after canvas edits, caps and cleanup. Runtime tests use a real `ResearchContextIndex` and captured tool registration; execute tool with `exec.agent.session.id` and verify source content plus cross-session denial; prepare private bridge transport uses expected bearer without exposing it in result.
```js
const packet = await registeredPrepare({sessionId:'parent',captureId:'cap',query:'失效边界'});
const result = await registeredRead.execute({snapshotId:packet.snapshotId,sourceId:'report'}, {agent:{session:{id:'other'}}});
// Expect a denied result/throw, never report body.
```
- [ ] RED: `npx vitest run test/research-context-bridge.test.ts test/research-context-runtime.test.js` fails for missing behavior.
- [ ] Implement bridge, runtime route and tool wiring. Main captures current stored per-session files/artifacts via the storage's existing keys; resolve files through authorized registry (not raw frontend path), stat freezes revision; loader re-stats before and after extraction and rejects changed files. Use existing bounded text/PDF/PPTX extractor, explicit status for unsupported types. Generated native specs serialize meaningful labeled content; blank containers not treated as evidence. Runtime must derive an optional model contextWindow only if current API exposes a reliable value; otherwise use Task1 default budget. First-session parent lookup reuses research-task runtime's established agent resolution. Register context module alongside existing research generation plugin without changing old task behavior.
```ts
// Keep secret on main/runtime boundary, never window.dshDesktop.
env.SHERLOCK_RESEARCH_CONTEXT_URL
// Tools use server-owned session identity, not a request field.
const sessionId = exec.agent?.session.id;
return index.read(sessionId, args);
```
- [ ] GREEN: bridge/runtime tests plus `test/research-task-runtime.test.js`, directly changed harness/preload tests and `npm run typecheck` pass.
- [ ] Commit task files with `功能：接通研究画板授权资料读取工具`.

### Task 3: 自动上下文发送与轻量提示

**Files:** Modify conversation `node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js` and affected type declarations, persist using existing patch-package mechanism to `patches/@deepseek-ai+dsh-client-ui-conversation+0.1.0-rc.7.patch`; modify `test/research-file-drop.test.ts`, `test/sherlock-composer-workspace-ui.test.ts` and type contract where needed.

**Interfaces:**
- Consumes capture bridge and prepare packet. InputHub only auto-captures when researchActive, no canvas selected IDs, no inline files/artifacts, per-send opt-out false, and nonempty user text/images.
- Produces backward-compatible `serializeResearchPrompt(...,canvasContext?)` and parse result `canvasContext?` object `{version:1,snapshotId,totalSources,initialSourceIds,initialContext}`. All new fields strictly validated/bounded; empty explicit arrays allowed only for valid auto context. Renderer projects user text normally plus a small auto-context source marker, never serialized JSON/full evidence/tokens.

- [ ] Write RED InputHub tests with real registry and sink: no-selection message carries packet; current session capture parameters correct; explicit reference/selected node/nonresearch/opt-out/empty draft never capture; preparation error keeps draft/images and visible error; later canvas edit doesn't change admitted packet; reference/selection failure behavior unchanged. Add render tests for the actual input badge, popover listing sources, per-send disable, explicit reference suppresses badge, send resets option only on success. Assert no source body appears in composer/message projection.
```ts
await hub.sink({sessionId:'s'}, '黄金的失效边界是什么', [], 'queue');
expect(client.parseResearchPrompt(sentPrompt).canvasContext).toMatchObject({snapshotId:'snap',totalSources:3});
expect(client.parseResearchPrompt(sentPrompt).text).toBe('黄金的失效边界是什么');
```
- [ ] RED: new focused test names fail against existing bundle.
- [ ] Implement lightweight per-session/per-send opt-out state in existing InputHub/shell (not new persistent board storage). Capture before optimistic clearing, await prepare with cancellation/error handling, verify shell still belongs to same session/attempt, pass frozen packet to normal conversation sink. Do not create ghost sends or rehydrate expired snapshots silently. Badge uses workspace source-of-truth and counts all nodes, including offscreen; expand titles/status and explain priority picked at send time, then sent message indicates initialSourceIds; native explicit tags remain unchanged. This avoids speculative network calls while typing. Make UI Chinese/English and light/dark theme-consistent using existing tokens/styles.
```js
const auto = researchActive && !explicitReferences && currentSelection.selectedNodeIds.length === 0 && !optOut;
// After empty-submit guard, before shell.commitSend:
const capture = auto ? await window.dshDesktop.researchContext.capture({sessionId}) : null;
const packet = capture?.totalSources ? await prepare({sessionId,captureId:capture.captureId,query:inline.text}) : undefined;
```
- [ ] GREEN: `test/research-file-drop.test.ts` and targeted progressive-context UI tests; `npm run typecheck`; regenerate patch and verify new clean install can apply it. Run all directly related context/bridge/runtime tests together, not full suite.
- [ ] Commit only task files: `功能：让研究对话自动按需引用整个画板`.

### Task 4: 最终集成验证与交接

**Files:** Modify approved spec/plan only to record real outcomes if needed; create ignored handoff metadata/evidence under output. No new feature behavior in this task.

**Interfaces:** Consumes Tasks1–3 commits; produces local clean feature tip, focused evidence and handoff card under `docs/sherlock-multi-session-integration-runbook.md`.

- [ ] Run `npx vitest run test/research-context-index.test.js test/research-context-bridge.test.ts test/research-context-runtime.test.js test/research-task-runtime.test.js test/research-file-drop.test.ts` and targeted UI smoke. Run `npm run typecheck`, `npm run build`, `git diff --check`.
- [ ] Verify actual registered read tool obtains text absent from initial context with matching session, and rejects cross-session; verify render shows auto badge and sends compact prompt through real InputHub tests. Do not claim live external Feishu/model verification if no authorized fixture/session.
- [ ] Create feature handoff with exact base/tip, evidence and affected surfaces. Do not merge/promote until project acceptance; do not build or replace shared App from this feature worktree. Retain feature branch for user testing/integration.
- [ ] Finish with concise result, evidence, limitation and exact branch/commit. No release or remote push.
