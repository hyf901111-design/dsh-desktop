# Research Create and Clipboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 实现用户确认的所选内容创作、持久跨画板复制粘贴、系统剪贴板导入与引用列表图标。

**Architecture:** Electron main 持有系统剪贴板和资源仓库，preload 暴露限定 IPC；renderer 使用工作区原有持久化/撤销事务。所选创作扩展现有安全研究任务链路，复用授权页面与文件读取；依赖包更改固化到 patch-package。

**Tech Stack:** Electron / TypeScript / bundled React client / Node research task runtime / Vitest / happy-dom.

**Spec:** docs/superpowers/specs/2026-09-03-research-create-clipboard-design.md

## Global Constraints

- 版本保持 0.7.9。不公证、不发布、不上传、不推送、不替换共享客户端、不把未验收批次标记接受。
- 文字直接成为可编辑组件，不调用模型；图片和文件持久保存；跨画板独立副本重新授权。
- 编辑器、输入框与网页内部原生复制粘贴不被劫持。
- 基于所选创建仅以冻结的所选资料为来源，生成独立安全原生组件；不能只凭标题假装阅读全文。
- 外部标签保持紧凑尺寸，弹层底部开关尺寸不变；名称前使用对应组件类型图标，不显示「发送时检查」。
- 只运行直接相关聚焦测试和类型检查；依赖包更改固化到 patch-package；中文本地提交。

### Task 1: Main-process clipboard and durable resource contract

**Files:**
- Create: src/main/state/research-canvas-clipboard.ts
- Create: src/preload/research-canvas-clipboard.ts
- Modify: src/main/index.ts, src/preload/index.ts
- Modify if required: src/main/state/research-file-preview.ts (reuse registry rather than duplicate preview validation)
- Test: test/research-canvas-clipboard.test.ts, test/preload-main-frame.test.ts

**Interfaces:**
- Consumes: ResearchFilePreviewRegistry.resolveExportSource({sessionId,nodeId,authorizationId}), admitFinder and main-frame IPC trust gate.
- Produces: window.dshDesktop.researchClipboard with inspect(), copy({sessionId,nodes}), read(), admit({assetId,sessionId,nodeId}), open({assetId}) for unsupported file cards.
- inspect() returns {available:boolean}; copy returns {ok:boolean,error?:string}.
- read() returns a discriminated union: {kind:'empty'} | {kind:'text',text:string} | {kind:'files',files:ClipboardAsset[]} | {kind:'components',nodes:ClipboardNode[]}; both file nodes and ClipboardAsset carry opaque assetId, name, size, mimeType, previewable, never live preview tokens. A failed read may reject with a user-readable error.
- admit returns ResearchPreviewDescriptor|null; renderer allocates IDs and journals admission before invoking it. open resolves only a stored assetId and reveals it in Finder, never launching arbitrary file contents or accepting renderer paths.
- ClipboardNode is a bounded allowlisted serializable canvas snapshot, new ID generation and placement deferred to Task 3. File nodes contain an assetId instead of original path/authorization.

- [x] Step 1: Write behavioral failing tests against the contract. Use real temp files and actual preview registry with only native clipboard/IPC boundary doubled:
  ```ts
  // Removing file snapshotting must fail this behavior:
  await service.copy({sessionId:'source',nodes:[authorizedPdfNode]})
  await unlink(originalPdfPath)
  registry.revokeSession('source')
  const payload = await service.read()
  const preview = await service.admit({assetId:payload.nodes[0].assetId,sessionId:'target',nodeId:'new'})
  expect(preview?.contentType).toBe('application/pdf')
  expect(preview?.authorizationId).not.toBe(authorizedPdfNode.authorizationId)
  ```
  Add text/image/file precedence, actual Finder file URL formats, empty clipboard, multi-file, invalid asset IDs, malformed/oversized component payload, unauthorized source, hostile IPC frame, unsupported format card metadata, restart reload, failed copy retaining previous clipboard. Prove no renderer-supplied raw path grants.
- [x] Step 2: Run `npx vitest run test/research-canvas-clipboard.test.ts`, record expected missing behavior failure.
- [x] Step 3: Implement a service with injected native clipboard and preview registry. Persist snapshots/assets below app userData/research-clipboard; use random opaque IDs, atomic metadata, finite node/text/file/batch bounds, safe file names, regular-file validation and containment; respect existing Office/PDF safeguards. Copy source resources BEFORE changing clipboard. Native file reads only interpret actual clipboard file formats, never ordinary text as a path. Store immutable component snapshot behind an opaque typed reference embedded in escaped HTML plus plain text in one atomic clipboard.write (Electron writeBuffer would replace the text format). Read revalidates manifests, creates no preview grants. admit revalidates asset and delegates registry; unsupported files remain openable via stored assetId. Register handlers only for trusted main frame.
  ```ts
  const source = await previewRegistry.resolveExportSource(identity)
  if (!source) throw new Error('源文件不可用，请重新添加后复制')
  // Copy verified bytes into an app-owned asset before publishing its opaque ID.
  // Clipboard/preload expose metadata, not arbitrary-path admission.
  ```
- [x] Step 4: Run clipboard and affected preload tests plus npm run typecheck; record output. Self-review persistence and frame checks.
- [x] Step 5: Commit scoped files with `功能：增加画板剪贴板与持久文件资源桥接`.

### Task 2: Selected-source creation and reference directory UI

**Files:**
- Modify: packages/dsh-research-task-runtime/index.js (and context-index.js/context-runtime.js only where reuse requires)
- Modify: src/main/state/research-context-bridge.ts (new native mind-map content must also remain readable from the right-side conversation)
- Modify: node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js, lib/index.js and declarations as applicable; persist patches/@deepseek-ai+dsh-client-ui-conversation+0.1.0-rc.7.patch
- Test: test/research-task-runtime.test.js, test/research-file-drop.test.ts, test/sherlock-composer-workspace-ui.test.ts (discover exact existing runtime test filename)

**Interfaces:**
- Consumes: existing selectionGeneration.generate, workspace source snapshots, read-only authorized research content bridge, container JSON parser.
- Produces: selection custom-create request supporting prompt AND selected source descriptors; bounded validation across renderer/server/runtime; persistent provenance and retry.
- Add safe native mind-map container shape `{version:1,type:'mind-map',title:string,content:string}` if needed to let one custom-create request choose supported native output. Preserve ordinary container and fixed summary/mind-map contracts.
- Selected-create canonical storage permits generationSources to be absent for independent copied results; retry must report missing source instead of silently running without evidence. Preserve sourceNodeIds and creationMode even then. Never submit credential-free file provenance as readable file evidence.

- [x] Step 1: Write failing behavior tests for selected-create prompt/source validation, actual source inclusion (authorized text rather than URL/title), irrelevant canvas source exclusion, mixed failed sources honest error, retry preserving frozen source and prompt, cancellation and safe native response parsing.
  ```ts
  const result = await generateSelected({prompt:'比较两份材料',selectedNodeIds:['a','b']})
  expect(result.target.sourceNodeIds).toEqual(['a','b'])
  expect(result.target.containerPrompt).toBe('比较两份材料')
  // Exercise real rendered toolbar and InputBar; name-only rows must have matching icons.
  ```
- [x] Step 2: Run newly targeted tests and record RED before changing production code.
- [x] Step 3: Add「基于所选创建」toolbar prompt popover with source icon chips; freeze selected set on open and read relevant content at submit, empty prompt disabled. Reuse generation placement, pending task lifecycle, cancel/retry, validated native container rendering. Correct toolbar positioning for its actual expanded width. A new explicit task kind or container-with-sources variant must validate all transport layers consistently; no extra web permission or arbitrary code execution. Preserve provenance through normalize/save/load/retry and independent output.
  ```js
  await selectionGeneration.generate({
    sessionId, kind: 'create', targetNodeId: target.id,
    selectedNodeIds: frozenIds, prompt: prompt.trim()
  })
  ```
  Use a single explicit kind 'create' throughout; generated artifact reuses generated-container with creationMode:'selection', containerPrompt, sourceNodeIds and generationSources. Snapshot source descriptors at creation, reread authenticated live page through the existing bridge before final freezing. Use existing bounded source/chunk retrieval; do not use entire board for this task.
- [x] Step 4: Remove per-row normal status from ResearchCanvasContextBadge, add existing reference type icon mapping; retain original compact badge and expanded toggle geometry. Extend main context bridge native-content extraction for mind-map container content and test actual extracted text. Run focused UI/runtime tests and npm run typecheck, regenerate patch, check no unrelated dependency changes.
- [x] Step 5: Commit `功能：根据所选资料创建组件并精简参考列表`.

### Task 3: Canvas copy/paste UI and transactional workspace mutations

**Files:**
- Modify: node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js and declarations as needed; persist patch-package patch
- Modify if required: src/preload/index.ts declarations
- Modify if required: src/main/state/research-canvas-clipboard.ts and src/preload/research-canvas-clipboard.ts to return the newly authorized managed file path from admit (never consume a renderer path), so existing file-source generation remains functional for pasted files.
- Modify: src/main/state/research-context-bridge.ts for native pasted-text content extraction
- Test: test/research-canvas-clipboard-ui.test.ts (real bundled client / happy-dom), test/research-file-drop.test.ts

**Interfaces:**
- Consumes: Task 1 researchClipboard bridge and Task 2 canonical artifact schema.
- Produces: workspace atomic insert of files+artifacts, clipboard keyboard and context actions, editable pasted-text native artifact (excerpt, title, synthetic messageId, geometry; no assistant origin or generation task) and safe unsupported-file card. Keep text within bridge bounds and reject over-limit/capacity explicitly rather than truncating.
- Clipboard copy source file entries use kind:'file' explicitly. Bridge's generationSources are credential-free audit descriptors; if they cannot be reconstructed as complete valid evidence after remapping copied sources, omit generationSources for the independent result and preserve source IDs/prompt, with honest missing-source retry. After any cancelled in-flight admit settles, revoke the late grant too.
- Verify pasted file nodes remain readable by existing researchGenerationSources and right-chat context. Existing generation uses file.path; if needed extend admit's response with an authoritative managed path alongside its fresh descriptor. This is an output-only path resolved by main for a valid asset; ordinary clipboard read/copy remains path-free and no renderer path becomes an admission request.
- Existing file parsing deduplicates by path: retain that behavior for ordinary file imports, but copied asset-backed nodes with fresh IDs must survive repeated paste/reload even if their immutable managed bytes are shared. Unsupported file cards can omit path/preview authorization and retain opaque assetId; never invent a readable path.

- [x] Step 1: Write failing real-workspace tests for multi-node copy/paste preserving relative positions and manual geometry with new IDs, one undo/redo transaction, snapshot persistence/reload and identity remapping, no active task/autorefresh copied. Render canvas to test Cmd/Ctrl+C/V scope, input/editor native paste, native webpage selection, right-click selection semantics, menu availability, mouse/world coordinate conversion, pasted text edit, and queue cancellation on unmount/session switch. Test file admission failure/quota and journal cleanup.
  ```ts
  workspace.insertClipboardNodes(payload, {x:100,y:200})
  expect(workspace.getSnapshot().selection.selectedNodeIds).toHaveLength(2)
  workspace.undo()
  expect(workspace.getSnapshot().artifacts).toHaveLength(0)
  workspace.redo()
  expect(workspace.getSnapshot().artifacts).toHaveLength(2)
  ```
- [x] Step 2: Run targeted tests and record RED.
- [x] Step 3: Implement atomic insertion using existing workspace history/persistence. Canonicalize all clipboard nodes, fresh node and message identities, remap copied-internal IDs while retaining safe provenance snapshots for external sources, clear running task IDs/state and auto-refresh. Pasted text is native editable Markdown content, not a generation request. Import files one at a time with pre-journaled new IDs, reissue grants via admit, cleanup failed/unmounted import grants, and commit successful batch once. Preserve owned assets for undo/redo. Unsupported file cards expose stored-asset open action, no arbitrary path execution.
  ```js
  const payload = await clipboard.read()
  if (!lifecycle.active || workspace !== capturedWorkspace) return
  // Journal admission first, then use target session/new node IDs.
  // Publish the full batch once; rollback grants if persistence fails.
  ```
  Add copy to component menu and paste to canvas background menu; read availability when menu opens, not background polling. Keyboard handlers require canvas focus and non-editable target/no native selection; preserve iframe shortcuts. Track last pointer inside bounds; compute world coordinates; fixed context-menu paste point, repeated keyboard offset. Surface concise progress/errors, serialize imports, and recheck capacity after await.
  Electron menu accelerators may dispatch native DOM copy/paste rather than keydown. Handle both paths without duplicate operations, default-preventing only canvas-owned events. Include native CopyEvent/PasteEvent tests as well as keyboard events.
- [x] Step 4: Run focused clipboard UI/workspace and directly affected tests plus typecheck. Exercise a safe isolated rendered canvas fixture through Browser for menu, multi-selection, creation dialog and icon rows. Do not operate or replace the shared app.
- [x] Step 5: Commit `功能：支持研究画板跨画板复制粘贴与内容导入`.

### Completion

- [x] Whole-branch scoped review against this spec (base 165da7b3 excludes already-tested prerequisites).
- [x] Fresh combined directly affected checks and patch reproducibility check.
- [x] Leave clean feature worktree with Chinese local commits. Report precise verified boundaries; no integration acceptance, shared build or release without the matching user request.
