import { build } from 'esbuild'
import { readFile, writeFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
const root = fileURLToPath(new URL('../..', import.meta.url))
const START = '/* SHERLOCK_RESEARCH_BOARDS_PAGE_BEGIN */',
  END = '/* SHERLOCK_RESEARCH_BOARDS_PAGE_END */'
function replace(source, anchor, next, label = anchor.slice(0, 80)) {
  const first = source.indexOf(anchor)
  if (first < 0 || source.indexOf(anchor, first + anchor.length) >= 0)
    throw new Error(
      `Research boards exact anchor missing or ambiguous: ${label}`
    )
  return source.slice(0, first) + next + source.slice(first + anchor.length)
}
async function pageModule() {
  const result = await build({
    entryPoints: [join(root, 'src/preload/research-boards-ui.ts')],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    write: false,
    external: ['react', '@deepseek-ai/dsh-client-ui-primitives'],
    target: 'chrome120',
    logLevel: 'silent'
  })
  return `${START}\nconst sherlockBoardsPage = (() => {const module={exports:{}};const exports=module.exports;\n${result.outputFiles[0].text}\nreturn module.exports;})();\nlet sherlockBoardsAdapter = null;\nconst sherlockShared = id => typeof window !== "undefined" && window.dshDesktop?.researchBoards?.isSharedSession?.(id) === true;\n${END}`
}
export async function patchResearchBoardConversation(source) {
  const bundle = await pageModule()
  if (source.includes(START)) {
    for (const sentinel of [
      'sharedSubmit: (mode) => {',
      'Sherlock research boards page adapter',
      'applyRemoteCanvas(canvas, metadata',
      'sharedDraft: text =>',
      'async sink(session, text, imageIds, mode) {'
    ]) {
      replace(source, sentinel, sentinel)
    }
    const end = source.indexOf(END)
    if (end < 0) throw Error('Incomplete research boards patch')
    return polishPatch(
      task4Patch(
        gesturePatch(
          source.slice(0, source.indexOf(START)) +
            bundle +
            source.slice(end + END.length)
        )
      )
    )
  }
  source = replace(
    source,
    '\t\t//#region lib/types/client/stores.js',
    bundle + '\n\t\t//#region lib/types/client/stores.js'
  )
  source = replace(
    source,
    'const composerBlocks = new ComposerBlockRegistry();',
    'const composerBlocks = new ComposerBlockRegistry();\n            ctx.effect(() => { if (window.top !== window || !window.dshDesktop?.researchBoards) return; sherlockBoardsAdapter = sherlockBoardsPage.createResearchBoardsPage({sessions,workspaces,researchWorkspaces,inputHub,slots,bridge:window.dshDesktop.researchBoards}); return () => { sherlockBoardsAdapter?.dispose(); sherlockBoardsAdapter = null; }; }, "Sherlock research boards page adapter");'
  )
  source = replace(
    source,
    'setResearchActive(sessionId, active) {',
    'setResearchActive(sessionId, active) {\n                void sherlockBoardsAdapter?.activate(sessionId, active);'
  )
  source = replace(
    source,
    'async sink(session, text, imageIds, mode) {',
    `async sink(session, text, imageIds, mode) {
                if (sherlockShared(session.sessionId)) {
                    const inline = extractResearchReferences(text);
                    const references = [...inline.occurrences.map(o=>({collection:"files",nodeId:o.fileId,order:o.order})), ...inline.artifactOccurrences.map(o=>({collection:"artifacts",nodeId:o.artifactId,order:o.order}))].sort((a,b)=>a.order-b.order).map(({collection,nodeId})=>({collection,nodeId}));
                    if (!sherlockBoardsAdapter) { this.shells.get(session.sessionId)?.notify("error","共享研究执行尚未就绪，输入已保留。"); return; }
                    return sherlockBoardsAdapter.submitShared(session.sessionId,inline.text,{scope:references.length?"references":"board",references},imageIds,mode);
                }`
  )
  source = replace(
    source,
    'defaultSink: (text, imageIds, mode) => {',
    `sharedSubmit: (mode) => {
                        if (!sherlockShared(id)) return false;
                        const shell = this.shells.get(id); if (!shell) return true;
                        const refs = []; let text = "", cursor = 0;
                        for (const o of [...shell.snapshot.occurrences].sort((a,b)=>a.offset-b.offset)) {
                            const file = o.source === RESEARCH_FILE_REFERENCE_SOURCE ? parseResearchFileReference(o.ref) : null;
                            const artifact = o.source === RESEARCH_ARTIFACT_REFERENCE_SOURCE ? parseResearchArtifactReference(o.ref) : null;
                            const ref = file || artifact;
                            if (!ref) { shell.notify("error","此引用暂不支持共享，请先加入画板。输入已保留。"); return true; }
                            text += shell.snapshot.draft.slice(cursor,o.offset) + "@" + (ref.name || ref.title || "资料"); cursor=o.offset+1;
                            const item={collection:file?"files":"artifacts",nodeId:ref.id};if(!refs.some(r=>r.collection===item.collection&&r.nodeId===item.nodeId))refs.push(item);
                        }
                        text += shell.snapshot.draft.slice(cursor);
                        if (!sherlockBoardsAdapter) shell.notify("error","共享研究执行尚未就绪，输入已保留。");
                        else void sherlockBoardsAdapter.submitShared(id,text,{scope:refs.length?"references":"board",references:refs},shell.snapshot.imageIds,mode);
                        return true;
                    },
                    sharedDraft: text => { if (sherlockShared(id)) sherlockBoardsAdapter?.saveDraft(id,text); },
                    defaultSink: (text, imageIds, mode) => {`
  )
  source = replace(
    source,
    'submit(mode = "queue") {',
    'submit(mode = "queue") {\n                if (this.deps.sharedSubmit?.(mode)) return;'
  )
  source = replace(
    source,
    'this.mirrorFn?.(next.draft);',
    'this.mirrorFn?.(next.draft);\n                    this.deps.sharedDraft?.(next.draft);'
  )
  for (const method of [
    'async generateResearchSelection(session, request) {',
    'inspectResearchGeneration(session, request) {',
    'cancelResearchGeneration(session, request) {'
  ]) {
    // Task4 replaces this explicit unavailable execution seam; no unleased local task request.
    source = replace(
      source,
      method,
      method +
        `\n                if (sherlockShared(session.sessionId)) { if(!sherlockBoardsAdapter)throw new Error("共享研究暂不可用");return sherlockBoardsAdapter.${method.startsWith('async generate') ? 'generateShared' : method.startsWith('inspect') ? 'inspectShared' : 'cancelShared'}(session.sessionId,request); }`
    )
  }
  source = replace(
    source,
    'function parseResearchCanvasFileNodes(raw) {',
    'function parseResearchCanvasFileNodes(raw, maxNodes = RESEARCH_CANVAS_MAX_FILES_PER_SESSION) {'
  )
  source = replace(
    source,
    'if (nodes.length >= RESEARCH_CANVAS_MAX_FILES_PER_SESSION) break;',
    'if (nodes.length >= maxNodes) break;'
  )
  source = replace(
    source,
    'function boundedResearchCanvasArtifactNodes(value) {',
    'function boundedResearchCanvasArtifactNodes(value, maxNodes = RESEARCH_CANVAS_MAX_ARTIFACTS_PER_SESSION) {'
  )
  source = replace(
    source,
    'if (nodes.length >= RESEARCH_CANVAS_MAX_ARTIFACTS_PER_SESSION) break;',
    'if (nodes.length >= maxNodes) break;'
  )
  source = replace(
    source,
    'const node = canonicalResearchCanvasFileNode(item);',
    'const canonical = canonicalResearchCanvasFileNode(item);\n                    const node = canonical && typeof item.collaborationAssetId === "string" ? {...canonical,collaborationAssetId:item.collaborationAssetId} : canonical && item.personalImportFile ? {...canonical,personalImportFile:true} : canonical;'
  )
  source = replace(
    source,
    'function createResearchWorkspaceSession(storage, sessionId) {',
    `const sherlockParseBoardFiles = parseResearchCanvasFileNodes;
        const sherlockParseBoardArtifacts = boundedResearchCanvasArtifactNodes;
        function createResearchWorkspaceSession(storage, sessionId) {
            const RESEARCH_CANVAS_MAX_FILES_PER_SESSION = sherlockShared(sessionId) ? 1000 : 256;
            const RESEARCH_CANVAS_MAX_ARTIFACTS_PER_SESSION = sherlockShared(sessionId) ? 1000 : 256;
            const parseResearchCanvasFileNodes = raw => sherlockParseBoardFiles(raw, RESEARCH_CANVAS_MAX_FILES_PER_SESSION);
            const boundedResearchCanvasArtifactNodes = value => sherlockParseBoardArtifacts(value, RESEARCH_CANVAS_MAX_ARTIFACTS_PER_SESSION);
            let collaborationWritable = false;
            const collaborationCanWrite = () => !sherlockShared(sessionId) || collaborationWritable;`
  )
  source = replace(
    source,
    'const persistSnapshot = () => {',
    'const persistSnapshot = () => {\n                if (sherlockShared(sessionId)) return collaborationWritable;'
  )
  source = replace(
    source,
    'const publish = (next, persist = false) => {',
    `const publish = (next, persist = false) => {
                if (!collaborationCanWrite() && (JSON.stringify(next.files)!==JSON.stringify(snapshot.files) || JSON.stringify(next.artifacts)!==JSON.stringify(snapshot.artifacts))) return false;
                if (sherlockShared(sessionId) && next.files.length + next.artifacts.length > 1000) throw new Error("共享画板最多包含 1000 个组件。");`
  )
  source = replace(
    source,
    'const persistClipboardBatch = (next) => {',
    'const persistClipboardBatch = (next) => {\n                if (sherlockShared(sessionId)) {if (!collaborationWritable) throw new Error("当前画板仅可查看。"); if(next.files.length+next.artifacts.length>1000)throw new Error("共享画板最多包含1000个组件。"); return;}'
  )
  source = replace(
    source,
    'const recordHistory = (before, clearRedo = true) => {',
    'const recordHistory = (before, clearRedo = true) => {\n                if (sherlockShared(sessionId)) return false;'
  )
  source = replace(
    source,
    'const undo = () => {',
    'const undo = () => {\n                if (sherlockShared(sessionId)) {void sherlockBoardsAdapter?.undo(sessionId); return false;}'
  )
  source = replace(
    source,
    'const redo = () => {',
    'const redo = () => {\n                if (sherlockShared(sessionId)) {void sherlockBoardsAdapter?.undo(sessionId,true); return false;}'
  )
  source = replace(
    source,
    'const insertClipboardBatch = async (payload, point, active, epoch) => {',
    'const insertClipboardBatch = async (payload, point, active, epoch) => {\n                if (!collaborationCanWrite()) throw new Error("当前画板仅可查看。");'
  )
  source = replace(
    source,
    'if (epoch !== clipboardEpoch || !active()) throw new Error("粘贴已取消或画板已切换。"); };',
    'if (epoch !== clipboardEpoch || !active() || !collaborationCanWrite()) throw new Error("粘贴已取消或画板已切换。"); };'
  )
  source = replace(
    source,
    'getSnapshot() { return snapshot; },\n\t\t\t\tsubscribeAssistantActions',
    `getSnapshot() { return snapshot; },
                setCollaborationAccess(edit) { collaborationWritable = edit === true; if (!collaborationWritable) cancelClipboardImports(); },
                applyRemoteCanvas(canvas, metadata = {}) {
                    if (!sherlockShared(sessionId)) throw new Error("Remote canvas requires a shared binding");
                    const files = parseResearchCanvasFileNodes(JSON.stringify(canvas.files));
                    const artifacts = boundedResearchCanvasArtifactNodes(canvas.artifacts);
                    if (files.length !== canvas.files.length || artifacts.length !== canvas.artifacts.length || files.length+artifacts.length>1000) throw new Error("共享画板格式不兼容，内容未被截断。");
                    pendingHistoryTransaction = null; undoHistory.length = 0; redoHistory.length = 0;
                    snapshot = researchWorkspaceSnapshot({...snapshot,files,artifacts,selection:parseResearchCanvasSelection(JSON.stringify(snapshot.selection),files,artifacts)});
                    listeners.forEach(listener=>listener());
                },
                subscribeAssistantActions`
  )
  const storageStart = source.indexOf(
      '\t\tfunction researchCanvasStorage() {'
    ),
    storageEnd = source.indexOf(
      '\n\t\tfunction researchCanvasFileCaption',
      storageStart
    )
  if (storageStart < 0 || storageEnd < 0)
    throw Error('Research storage anchor missing')
  let storage = source.slice(storageStart, storageEnd)
  storage = replace(
    storage,
    'let originStorage = null;',
    `const sharedKey = key => {const m = /^sherlock\\.research\\.canvas\\.(files|artifacts|selection)\\.v1:(.+)$/.exec(key);if(!m || !sherlockShared(m[2]))return null;try { localStorage.removeItem(key); } catch {}return m[1]==="selection"?"{}":"[]";};
            let originStorage = null;`
  )
  storage = replace(
    storage,
    'getItem(key) {',
    'getItem(key) {\n                    const empty = sharedKey(key); if(empty !== null) return empty;'
  )
  storage = replace(
    storage,
    'setItem(key, value) {',
    'setItem(key, value) {\n                    if(sharedKey(key)!==null) throw new Error("共享画板必须通过版本化操作保存。");'
  )
  source = source.slice(0, storageStart) + storage + source.slice(storageEnd)
  source = replace(
    source,
    'const researchConversationView = researchEmpty ?',
    'const researchConversationView = sessionId !== void 0 && sherlockShared(sessionId) && sherlockBoardsAdapter ? (0, react_jsx_runtime.jsx)(sherlockBoardsPage.ResearchBoardDiscussion,{page:sherlockBoardsAdapter,sessionId,MarkdownText:_deepseek_ai_dsh_client_ui_primitives.MarkdownText}) : researchEmpty ?'
  )
  source = replace(
    source,
    'children: renderSlot("conversation.session.header.actions", {})',
    'children: renderSlot("conversation.session.header.actions", {active:active?.id === "research"})'
  )
  source = replace(
    source,
    'function ResearchCanvas({ sessionId, t, researchWorkspaces = defaultResearchWorkspaces, researchOfficePreview = defaultResearchOfficePreview, actions, selectionGeneration }) {',
    `function ResearchCanvas({ sessionId, t, researchWorkspaces = defaultResearchWorkspaces, researchOfficePreview = defaultResearchOfficePreview, actions, selectionGeneration }) {
            (0,react.useSyncExternalStore)(sherlockBoardsAdapter?.subscribe ?? (()=>()=>{}), sherlockBoardsAdapter?.version ?? (()=>0));
            const boardView = sherlockBoardsAdapter?.getView(sessionId);
            const sharedReadOnly = sherlockShared(sessionId) && boardView?.permissions.edit !== true;`
  )
  source = replace(
    source,
    'const dropLifecycle = (0, react.useMemo)(() => ({ active: true }), [workspace]);',
    `const dropLifecycle = (0, react.useMemo)(() => ({ active: true }), [workspace]);
            (0,react.useEffect)(()=>{
                if(!sherlockShared(sessionId)||!sherlockBoardsAdapter)return;
                const root=rootRef.current;if(!root)return;let last=0;
                const move=e=>{if(Date.now()-last<100)return;last=Date.now();const s=workspace.getSnapshot(),r=root.getBoundingClientRect();void sherlockBoardsAdapter.presence(sessionId,{cursor:{x:(e.clientX-r.left-s.viewport.x)/s.viewport.scale,y:(e.clientY-r.top-s.viewport.y)/s.viewport.scale},selectedIds:s.selection.selectedNodeIds.slice(0,100)});};
                const leave=()=>{const v=sherlockBoardsAdapter.getView(sessionId);if(v)sherlockBoardsAdapter.clearPresence(sessionId);};root.addEventListener("pointermove",move);root.addEventListener("pointerleave",leave);window.addEventListener("blur",leave);root.addEventListener("pointercancel",leave);return()=>{window.removeEventListener("blur",leave);root.removeEventListener("pointercancel",leave);root.removeEventListener("pointermove",move);root.removeEventListener("pointerleave",leave);leave();};
            },[sessionId,workspace]);`
  )
  // The existing mutation handlers remain, but capture guards cover native input before side effects.
  source = replace(
    source,
    '"data-research-canvas": "",',
    `"data-research-canvas": "",
                "data-shared-readonly": sharedReadOnly || void 0,
                onDropCapture: event => {if(sharedReadOnly){event.preventDefault();event.stopPropagation();}},
                onPasteCapture: event => {if(sharedReadOnly){event.preventDefault();event.stopPropagation();}},
                onPointerDownCapture: event => {if(sharedReadOnly && event.target.closest("[data-research-node-move-handle],[data-research-resize-handle],button,input,textarea,[contenteditable]")){event.preventDefault();event.stopPropagation();}},
                onKeyDownCapture: event => {if(sharedReadOnly && (event.key==="Delete"||event.key==="Backspace"||((event.metaKey||event.ctrlKey)&&["v","z","y","x"].includes(event.key.toLowerCase())))){event.preventDefault();event.stopPropagation();}},`
  )
  source = replace(
    source,
    'children: [(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: "rScV5Q_contentLayer",',
    'children: [sherlockShared(sessionId) && sherlockBoardsAdapter ? (0,react_jsx_runtime.jsx)(sherlockBoardsPage.ResearchBoardCanvasOverlay,{page:sherlockBoardsAdapter,sessionId,workspace}) : null, (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: "rScV5Q_contentLayer",'
  )
  source = replace(
    source,
    'const result = await Promise.resolve(window.dshDesktop?.researchClipboard?.open?.({ assetId: node.assetId })).catch(() => null);',
    `const result = await Promise.resolve(sherlockShared(sessionId) ? window.dshDesktop?.researchBoards?.invoke?.("file.open",{boardId:sherlockBoardsAdapter?.getView(sessionId)?.boardId,localSessionId:sessionId,nodeId:node.id}) : node.personalImportFile ? window.dshDesktop?.researchBoards?.invoke?.("import.fileOpen",{localSessionId:sessionId,nodeId:node.id}) : window.dshDesktop?.researchClipboard?.open?.({ assetId: node.assetId })).catch(() => null);`
  )
  return polishPatch(task4Patch(gesturePatch(source)))
}
function gesturePatch(source) {
  if (source.includes('/* SHERLOCK_BOARD_GESTURE_V1 */')) return source
  source = replace(
    source,
    'let collaborationWritable = false;',
    'let collaborationWritable = false; let collaborationGesture=false; /* SHERLOCK_BOARD_GESTURE_V1 */'
  )
  for (const anchor of [
    'moveNodes(selectedIds, delta, scale, persist = true) {',
    'resizeNode(nodeId, corner, delta, scale, persist = true) {'
  ])
    source = replace(
      source,
      anchor,
      anchor +
        'if(sherlockShared(sessionId)&&!persist&&collaborationCanWrite())collaborationGesture=true;'
    )
  source = replace(
    source,
    'persist() { finalizeHistoryTransaction(); persistSnapshot(); },',
    'isCollaborationGesture() {return collaborationGesture;},\n                persist() { finalizeHistoryTransaction(); persistSnapshot(); if(collaborationGesture){collaborationGesture=false;sherlockBoardsAdapter?.finishGesture(sessionId);} },'
  )
  source = replace(
    source,
    'cancelTransient() {',
    'cancelTransient() {collaborationGesture=false;sherlockBoardsAdapter?.clearPresence(sessionId);'
  )
  const oldMove =
    'void sherlockBoardsAdapter.call("presence.update",{boardId:sherlockBoardsAdapter.getView(sessionId)?.boardId,cursor:{x:(e.clientX-r.left-s.viewport.x)/s.viewport.scale,y:(e.clientY-r.top-s.viewport.y)/s.viewport.scale},selectedIds:s.selection.selectedNodeIds.slice(0,100)}).catch(()=>{});'
  if (source.includes(oldMove))
    source = replace(
      source,
      oldMove,
      'void sherlockBoardsAdapter.presence(sessionId,{cursor:{x:(e.clientX-r.left-s.viewport.x)/s.viewport.scale,y:(e.clientY-r.top-s.viewport.y)/s.viewport.scale},selectedIds:s.selection.selectedNodeIds.slice(0,100)});'
    )
  const oldLeave =
    'if(v)void sherlockBoardsAdapter.call("presence.update",{boardId:v.boardId,cursor:null,selectedIds:[]}).catch(()=>{});'
  if (source.includes(oldLeave))
    source = replace(
      source,
      oldLeave,
      'if(v)sherlockBoardsAdapter.clearPresence(sessionId);'
    )
  const oldListeners =
    'root.addEventListener("pointerleave",leave);return()=>{'
  if (source.includes(oldListeners))
    source = replace(
      source,
      oldListeners,
      'root.addEventListener("pointerleave",leave);window.addEventListener("blur",leave);root.addEventListener("pointercancel",leave);return()=>{window.removeEventListener("blur",leave);root.removeEventListener("pointercancel",leave);'
    )
  return source
}
function task4Patch(source) {
  if (source.includes('/* SHERLOCK_BOARD_EXECUTION_V1 */')) return source
  const oldNode =
    'const node = canonical && typeof item.collaborationAssetId === "string" ? {...canonical,collaborationAssetId:item.collaborationAssetId} : canonical;'
  if (source.includes(oldNode))
    source = replace(
      source,
      oldNode,
      'const node = canonical && typeof item.collaborationAssetId === "string" ? {...canonical,collaborationAssetId:item.collaborationAssetId} : canonical && item.personalImportFile ? {...canonical,personalImportFile:true} : canonical;'
    )
  const oldOpen =
    ': window.dshDesktop?.researchClipboard?.open?.({ assetId: node.assetId })).catch(() => null);'
  if (!source.includes('"import.fileOpen"'))
    source = replace(
      source,
      oldOpen,
      ': node.personalImportFile ? window.dshDesktop?.researchBoards?.invoke?.("import.fileOpen",{localSessionId:sessionId,nodeId:node.id}) ' +
        oldOpen
    )
  for (const method of [
    'async generateResearchSelection(session, request) {',
    'inspectResearchGeneration(session, request) {',
    'cancelResearchGeneration(session, request) {'
  ]) {
    const old =
      method +
      '\n                if (sherlockShared(session.sessionId)) throw new Error("共享组件执行尚未就绪，请保留需求后重试。");'
    if (source.includes(old))
      source = replace(
        source,
        old,
        method +
          `\n                if (sherlockShared(session.sessionId)) { if(!sherlockBoardsAdapter)throw new Error("共享研究暂不可用");return sherlockBoardsAdapter.${method.startsWith('async generate') ? 'generateShared' : method.startsWith('inspect') ? 'inspectShared' : 'cancelShared'}(session.sessionId,request); }`
      )
  }
  source = replace(
    source,
    '!node.assetId ? null :',
    '!(node.assetId || node.collaborationAssetId || node.personalImportFile) ? null :'
  )
  source = replace(
    source,
    'if (result?.ok !== true) button?.setAttribute',
    'if (result?.ok !== true || ((sherlockShared(sessionId) || node.personalImportFile) && result?.value?.opened !== true)) button?.setAttribute'
  )
  source = replace(
    source,
    "if (editingPrompt || node.creationMode === 'selection' || node.refreshMinutes === 0",
    "if (sherlockShared(sessionId) || editingPrompt || node.creationMode === 'selection' || node.refreshMinutes === 0"
  )
  source = replace(
    source,
    'if (active) workspace.applyGenerationInspection(node.id, inspection);',
    'if (active && !sherlockShared(sessionId)) workspace.applyGenerationInspection(node.id, inspection);'
  )
  source = replace(
    source,
    '(0, react_dom.createPortal)(researchConversationView, researchSidebarSnapshot.conversationHost)',
    '(0, react_dom.createPortal)(sherlockShared(sessionId) ? researchConversationView : (0,react_jsx_runtime.jsx)(sherlockBoardsPage.PersonalResearchHistory,{sessionId,empty:researchEmpty,MarkdownText:_deepseek_ai_dsh_client_ui_primitives.MarkdownText,children:researchConversationView}), researchSidebarSnapshot.conversationHost)'
  )
  source = replace(
    source,
    '\"data-chat-flow\": \"\",\n\t\t\t\t\t\tchildren: [',
    '\"data-chat-flow\": \"\",\n\t\t\t\t\t\tchildren: [(0,react_jsx_runtime.jsx)(sherlockBoardsPage.PersonalResearchHistory,{sessionId,flow:true,MarkdownText:_deepseek_ai_dsh_client_ui_primitives.MarkdownText}),'
  )
  return source + '\n/* SHERLOCK_BOARD_EXECUTION_V1 */'
}
export function patchResearchBoardSidebar(source) {
  if (source.includes('"sidebar.researchBoards"')) return patchBoardRegion(source)
  source = replace(
    source,
    '"sidebar.workspaces": {',
    '"sidebar.researchBoards": {kind:"list",scope:"root"},\n                    "sidebar.workspaces": {'
  )
  source = replace(
    source,
    'className: SidebarRoot_module_css_default.regionArea,',
    'className: SidebarRoot_module_css_default.regionArea,'
  )
  source = replace(
    source,
    '\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.regionArea,',
    '\t\t\t\t\trenderSlot("sidebar.researchBoards",{wide,expandSidebar:()=>{if(collapsed)toggleSidebar();}}),\n\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: SidebarRoot_module_css_default.regionArea,'
  )
  return patchBoardRegion(source)
}
function patchBoardRegion(source) {
  if (source.includes('data-srb-board-region')) return source
  return replace(source,
    'renderSlot("sidebar.researchBoards",{wide,expandSidebar:()=>{if(collapsed)toggleSidebar();}})',
    'wide && (0,react_jsx_runtime.jsx)("div",{className:SidebarRoot_module_css_default.regionArea,"data-srb-board-region":"",children:renderSlot("sidebar.researchBoards",{wide,expandSidebar:()=>{if(collapsed)toggleSidebar();}})})')
}
export function patchResearchBoardSidebarTypes(source) {
  if (source.includes("'sidebar.researchBoards'")) return source
  return replace(
    source,
    "'sidebar.workspaces': {",
    "'sidebar.researchBoards': {kind: 'list'; scope: 'root'; owner: {wide:boolean;expandSidebar():void}};\n        'sidebar.workspaces': {"
  )
}
export async function installResearchBoardClientPatches(cwd = process.cwd()) {
  const targets = [
    [
      'dsh-client-ui-conversation',
      'lib/client.js',
      patchResearchBoardConversation
    ],
    ['dsh-client-ui-sidebar', 'lib/client.js', patchResearchBoardSidebar],
    ['dsh-client-ui-workspace', 'lib/client.js', patchResearchBoardWorkspace],
    [
      'dsh-client-ui-sidebar',
      'lib/types/client/contract/slots.d.ts',
      patchResearchBoardSidebarTypes
    ]
  ]
  for (const [name, file, patch] of targets) {
    const path = join(cwd, 'node_modules/@deepseek-ai', name, file)
    const real = await realpath(path)
    if (!real.startsWith(resolve(cwd) + '/'))
      throw Error(
        'Refusing to patch shared/canonical dependency outside current checkout: ' +
          real
      )
    const before = await readFile(path, 'utf8')
    const after = await patch(before)
    if (before !== after) await writeFile(path, after)
  }
}

function polishPatch(source) {
  if (source.includes('/* SHERLOCK_BOARD_POLISH_V1 */')) return entryPatch(chromePatch(source))
  source = replace(
    source,
    'node.kind !== "generated-container" && !RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus)',
    'sherlockBoardsPage.selectionNodeReady(node) && !RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus)'
  )
  return entryPatch(chromePatch(source + '\n/* SHERLOCK_BOARD_POLISH_V1 */'))
}
function entryPatch(source) {
  if (source.includes('/* SHERLOCK_RESEARCH_ENTRY_V1 */')) return generationResultPatch(source)
  source = replace(source,
    'function ResearchConversationPanel({ active, sessionId, presentation, researchWorkspaces, conversationHostRef, composerHostRef }) {\n\t\t\tconst panelRef = (0, react.useRef)(null);',
    `function ResearchConversationPanel({ active, sessionId, presentation, researchWorkspaces, conversationHostRef, composerHostRef }) {
            const panelRef = (0, react.useRef)(null);
            (0, react.useLayoutEffect)(() => {
                if (active && panelRef.current) return sherlockBoardsPage.followResearchConversation(panelRef.current);
            }, [active, sessionId]);`)
  source = replace(source,
    'if (!sessionId) return;\n                let active = true, timer;',
    'if (!sessionId || sherlockShared(sessionId)) return;\n                let active = true, timer;')
  source = replace(source,
    'workbenchActions.current = resolvedActions;',
    `workbenchActions.current = resolvedActions;
            const sharedWorkbenchSeen = (0, react.useRef)({ sessionId, ids: new Set() });
            (0, react.useEffect)(() => {
                if (!sherlockShared(sessionId) || !sherlockBoardsAdapter) return;
                if (sharedWorkbenchSeen.current.sessionId !== sessionId) sharedWorkbenchSeen.current = { sessionId, ids: new Set() };
                const view = sherlockBoardsAdapter.getView(sessionId);
                const userId = sherlockBoardsAdapter.getState().account.user?.userId;
                for (const node of researchWorkspaceSnapshot2.artifacts ?? []) {
                    if (!node.workbenchId || sharedWorkbenchSeen.current.ids.has(node.workbenchId)) continue;
                    const task = view?.tasks.find(t => t.targetId === node.id);
                    if (!task) continue;
                    sharedWorkbenchSeen.current.ids.add(node.workbenchId);
                    const request = view?.messages.find(m => m.id === task.requestMessageId);
                    if (request?.author?.userId === userId && ['queued','running'].includes(node.generationStatus)) {
                        setWorkbenchFocus(node.workbenchId); workbenchActions.current.setView?.('research');
                    }
                }
            }, [sessionId, researchWorkspaceSnapshot2.artifacts]);`)
  return generationResultPatch(source + '\n/* SHERLOCK_RESEARCH_ENTRY_V1 */')
}
function generationResultPatch(source) {
  if (source.includes('/* SHERLOCK_GENERATION_RESULT_V1 */')) return canvasInteractionPatch(source)
  source = replace(source,
    'const target = workspace.retryGeneration(node.id);',
    `if (sherlockShared(sessionId) && sherlockBoardsAdapter?.hasRetainedResult(sessionId, node.id)) {
                    try { await sherlockBoardsAdapter.applyRetainedResult(sessionId, node.id); } catch (error) { sherlockBoardsAdapter.showError(error); }
                    return;
                }
                const target = workspace.retryGeneration(node.id);`)
  const retained = 'sherlockShared(sessionId) && sherlockBoardsAdapter?.hasRetainedResult(sessionId, node.id)'
  source = replace(source, '"aria-label": "重试生成",', `"aria-label": (${retained}) ? "应用保留的研究结果" : "重试生成",`)
  source = replace(source,
    'children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 }), "重试"]',
    `children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconRefreshOutline16, { size: 14 }), (${retained}) ? "应用结果" : "重试"]`)
  return canvasInteractionPatch(source + '\n/* SHERLOCK_GENERATION_RESULT_V1 */')
}
function canvasInteractionPatch(source) {
  if (source.includes('/* SHERLOCK_CANVAS_INTERACTION_V1 */')) return source
  source = replace(source,
    'const interactivePreview = event.target?.closest?.("[data-research-preview-interactive],[data-research-selection-actions],[data-research-create-popover]");',
    `const frame = event.target?.closest?.("[data-research-node-id]");
                    const selected = frame && workspace.getSnapshot().selection.selectedNodeIds.includes(frame.getAttribute("data-research-node-id"));
                    const interactivePreview = event.target?.closest?.("[data-research-selection-actions],[data-research-create-popover]") || (selected && event.target?.closest?.("[data-research-preview-interactive]"));`)
  source = replace(source, 'interactivePreview !== null && interactivePreview !== void 0) return;', 'interactivePreview) return;')
  source = replace(source, 'root.addEventListener("wheel", onWheel, { passive: false });', 'root.addEventListener("wheel", onWheel, { passive: false, capture: true });')
  source = replace(source, 'root.removeEventListener("wheel", onWheel);', 'root.removeEventListener("wheel", onWheel, true);')
  // The shield stays above cross-origin frames until the first selection click.
  // An expanded reader always owns its wheel, regardless of canvas selection.
  source = replace(source, 'tag.textContent = cssResearchCanvas + ',
    'tag.textContent = cssResearchCanvas + ".rScV5Q_richNode:not([data-selected=true]):not([open])>.rScV5Q_previewBody:has(iframe)>.rScV5Q_previewShield{pointer-events:auto}" + ')
  const start = source.indexOf('                    const organized = researchCanvasOrganizedLayout(snapshot.files, snapshot.artifacts, snapshot.canvasSize, measured);')
  const end = source.indexOf('\n\t\t\t\t\tcommitUpdate(organized, true);', start)
  if (start < 0 || end < 0) throw Error('Canvas arrange anchor missing')
  source = source.slice(0, start) + `                    // Normalize component row sizes first, then pack every kind once.
                    // Repositioning only generated cards after packing stranded links/text.
                    const sized = snapshot.artifacts.map(n => ({ ...n, ...(measured.get(n.id) ?? {}) }));
                    for (const n of researchAlignComponentPresets(sized)) {
                        if (n.kind === 'generated-container') measured.set(n.id, { ...normalizeResearchCanvasNodeGeometry(n), sizeMode: 'manual' });
                    }
                    const organized = researchCanvasOrganizedLayout(snapshot.files, snapshot.artifacts, snapshot.canvasSize, measured);
                    if (organized === null) return false;
                    organized.viewport = researchWorkbenchViewport([...organized.files, ...organized.artifacts], organized.viewport, snapshot.canvasSize);` + source.slice(end)
  return source + '\n/* SHERLOCK_CANVAS_INTERACTION_V1 */'
}
function chromePatch(source) {
  if (source.includes('/* SHERLOCK_BOARD_CHROME_V1 */')) return source
  for (const [property, attribute] of [['titleRow', 'title-row'], ['titleCluster', 'title-cluster'], ['headerUtilities', 'utilities'], ['tabs', 'tabs']]) {
    source = replace(source, `className: ConversationRoot_module_css_default.${property},`, `className: ConversationRoot_module_css_default.${property}, "data-srb-${attribute}":"",`)
  }
  source = replace(source, '"aria-hidden": hideChrome || void 0,', '"aria-hidden": hideChrome || void 0, "data-srb-session-header":"",')
  return source + '\n/* SHERLOCK_BOARD_CHROME_V1 */'
}
export function patchResearchBoardWorkspace(source) {
  if (source.includes('/* SHERLOCK_WORKSPACE_COLLAPSE_V1 */')) return patchWorkspaceSelection(source)
  source = replace(
    source,
    'const [query, setQuery] = (0, react.useState)("");',
    `const [sectionCollapsed, setSectionCollapsed] = (0, react.useState)(()=>{try{return localStorage.getItem("sherlock.workspaces.collapsed")==="true"}catch{return false}});
            const [query, setQuery] = (0, react.useState)("");`
  )
  source = replace(
    source,
    'className: clsx(WorkspaceBrowser_module_css_default.root, !wide && WorkspaceBrowser_module_css_default.rail),',
    'className: clsx(WorkspaceBrowser_module_css_default.root, !wide && WorkspaceBrowser_module_css_default.rail), "data-srb-workspaces":"", "data-section-collapsed":wide && sectionCollapsed && !searchExpanded,'
  )
  source = replace(
    source,
    `wide && (0, react_jsx_runtime.jsx)("span", {
\t\t\t\t\t\t\t\tclassName: clsx(WorkspaceBrowser_module_css_default.sectionLabel, WorkspaceBrowser_module_css_default.wide, searchExpanded && WorkspaceBrowser_module_css_default.sectionLabelHidden),
\t\t\t\t\t\t\t\tchildren: groupBy === "flat" ? t("section.sessions") : t("section.workspaces")`,
    `wide && (0, react_jsx_runtime.jsxs)("button", {
                                type:"button", "aria-label":sectionCollapsed?"展开工作区":"折叠工作区", "aria-expanded":!sectionCollapsed,
                                onClick:()=>{setSectionCollapsed(!sectionCollapsed);try{localStorage.setItem("sherlock.workspaces.collapsed",String(!sectionCollapsed))}catch{}},
                                className: clsx("srb-section-toggle", WorkspaceBrowser_module_css_default.sectionLabel, WorkspaceBrowser_module_css_default.wide, searchExpanded && WorkspaceBrowser_module_css_default.sectionLabelHidden),
                                children: [groupBy === "flat" ? t("section.sessions") : t("section.workspaces"), (0,react_jsx_runtime.jsx)("span", {className:"srb-chevron", "data-collapsed":sectionCollapsed,"aria-hidden":true})]`
  )
  source = replace(
    source,
    'className: WorkspaceBrowser_module_css_default.listArea,',
    'className: WorkspaceBrowser_module_css_default.listArea, "data-srb-workspace-list":"", hidden:wide && sectionCollapsed && !searchExpanded,'
  )
  return patchWorkspaceSelection(source + '\n/* SHERLOCK_WORKSPACE_COLLAPSE_V1 */')
}

function patchWorkspaceSelection(source) {
  if (source.includes('/* SHERLOCK_WORKSPACE_SELECTION_V1 */')) return patchWorkspaceBoardVisibility(source)
  source = replace(source, 'function SearchResultItem({ result, currentId, onOpen, t }) {', `
        function useSidebarBoardSelection() {
            return (0, react.useSyncExternalStore)(
                (listener)=>{document.addEventListener("sherlock-sidebar-selection",listener);return ()=>document.removeEventListener("sherlock-sidebar-selection",listener);},
                ()=>document.documentElement.dataset.srbSelectedSession || ""
            );
        }
        function clearSidebarBoardSelection() {
            delete document.documentElement.dataset.srbSelectedSession;
            document.dispatchEvent(new Event("sherlock-sidebar-selection"));
        }
        function SearchResultItem({ result, currentId, onOpen, t }) {`)
  source = replace(source, 'const selected = result.id === currentId;', 'const boardSelection = useSidebarBoardSelection(); const selected = result.id === currentId && boardSelection !== result.id;')
  source = replace(source, 'const selected = node.id === currentId;', 'const boardSelection = useSidebarBoardSelection(); const selected = node.id === currentId && boardSelection !== node.id;')
  source = replace(source, 'onOpen(result.id);', 'clearSidebarBoardSelection(); onOpen(result.id);')
  source = replace(source, 'onOpen(node.id);', 'clearSidebarBoardSelection(); onOpen(node.id);')
  return patchWorkspaceBoardVisibility(source + '\n/* SHERLOCK_WORKSPACE_SELECTION_V1 */')
}

function patchWorkspaceBoardVisibility(source) {
  if (source.includes('/* SHERLOCK_WORKSPACE_BOARD_VISIBILITY_V1 */')) return patchWorkspaceSidebarSkin(source)
  source = replace(source, 'function useSidebarBoardSelection() {', `
        function useBoardHiddenSessions() {
            const raw = (0,react.useSyncExternalStore)(
                listener=>{document.addEventListener("sherlock-sidebar-selection",listener);return ()=>document.removeEventListener("sherlock-sidebar-selection",listener);},
                ()=>document.documentElement.dataset.srbHiddenSessions || "[]"
            );
            return (0,react.useMemo)(()=>new Set(JSON.parse(raw)),[raw]);
        }
        function useBoardWorkspaceList(list) {
            const hidden = useBoardHiddenSessions();
            return (0,react.useMemo)(()=>({...list,ids:list.ids.filter(id=>!hidden.has(id)),byId:Object.fromEntries(Object.entries(list.byId).filter(([id])=>!hidden.has(id)))}),[list,hidden]);
        }
        function useSidebarBoardSelection() {`)
  const anchor = 'const list = useSessions((s) => s);'
  if (source.split(anchor).length !== 4) throw Error('Workspace board visibility list anchors drifted')
  source = source.replaceAll(anchor, 'const list = useBoardWorkspaceList(useSessions((s) => s));')
  source = replace(source, 'const statuses = sessionStatuses(result, t);', 'const hidden = useBoardHiddenSessions(); if(hidden.has(result.id))return null; const statuses = sessionStatuses(result, t);')
  return patchWorkspaceSidebarSkin(source + '\n/* SHERLOCK_WORKSPACE_BOARD_VISIBILITY_V1 */')
}

function patchWorkspaceSidebarSkin(source) {
  source = patchWorkspaceRailSearch(source)
  if (!source.includes('"data-srb-section-header"')) source = replace(source,
    'className: WorkspaceBrowser_module_css_default.sectionHeader,',
    'className: WorkspaceBrowser_module_css_default.sectionHeader, "data-srb-section-header":"",')
  if (source.includes('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V2 */')) return source
  if (source.includes('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V1 */')) return source
    .replace('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V1 */', '/* SHERLOCK_SHARED_SIDEBAR_SKIN_V2 */')
    .replace('header: WorkspaceBrowser_module_css_default};', 'header: WorkspaceBrowser_module_css_default, rowHalf, useNativeDragAcceptance, WorkspaceFolderIcon};')
  return replace(source, '\t\texports.apply = apply;', `
        /* SHERLOCK_SHARED_SIDEBAR_SKIN_V2 */
        window.__sherlockWorkspaceSidebarSkin = {rows: Rows_module_css_default, header: WorkspaceBrowser_module_css_default, rowHalf, useNativeDragAcceptance, WorkspaceFolderIcon};
        window.dispatchEvent(new window.Event("sherlock-sidebar-skin"));
        \t\texports.apply = apply;`)
}

function patchWorkspaceRailSearch(source) {
  if (source.includes('/* SHERLOCK_WORKSPACE_RAIL_SEARCH_REMOVED_V1 */')) return source
  const start = source.indexOf('!wide && (0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.search,')
  const end = source.indexOf('\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", {\n\t\t\t\t\t\tclassName: WorkspaceBrowser_module_css_default.listArea,', start)
  if (start < 0 || end < 0) throw Error('Workspace rail search anchors drifted')
  return source.slice(0, start) + source.slice(end) + '\n/* SHERLOCK_WORKSPACE_RAIL_SEARCH_REMOVED_V1 */'
}
