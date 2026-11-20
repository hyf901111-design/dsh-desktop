import {NOTE_TOOLBAR_GEOMETRY_CSS} from '../../packages/dsh-research-task-runtime/note-toolbar-style.js'
import {refineComponentReadingFooter} from '../../packages/dsh-research-task-runtime/component-reading-footer.js';
import {WORKBENCH_ENGLISH} from './workbench-localization.mjs'
import {validWorkbenchStyleMessage,installWorkbenchStyleMessages,validWorkbenchLocaleMessage,installWorkbenchLocaleMessages} from '../../packages/dsh-research-task-runtime/workbench-style.js'
import { sharedComponentRuntime } from '../../packages/dsh-research-task-runtime/shared-component-runtime.js'
import { patchSharedNativeConversation } from './shared-native-conversation.mjs'
import { patchComponentInteractionState } from './component-interaction-state.mjs'
import { patchBoardDirectoryConversation, patchBoardDirectoryWorkspace, patchBoardFileOwnership } from './board-directory-picker.mjs'
import { patchFigmaFinalConversation } from './patch-figma-final-shell.mjs'
import { researchNotoFontCss } from '../../packages/dsh-research-task-runtime/component-noto-font.js'
import { patchFigmaFinalCanvas } from './figma-canvas-client.mjs'
import { patchFigmaFilePreview } from './figma-file-preview-client.mjs'
import { patchIntegrationSkillComposer } from './patch-integration-skill-composer.mjs'
import {patchSidebarSessionExperience} from './sidebar-session-recency.mjs'
import {patchSkillConversationPresentation,patchSkillWorkspacePresentation,patchSkillToolPresentation} from './skill-presentation.mjs'
import { build } from 'esbuild'
import { readFile, writeFile, realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { compactHostDashboardHtml, MAX_RESEARCH_HTML_BYTES, RESEARCH_HTML_LIMIT_ERROR, researchComponentTypographyCss } from '../../packages/dsh-research-task-runtime/html-artifact.js'
import { candleRuntime, candleControls, refineCandlestickHtml, CANDLE_CONTROLS_CSS } from '../../packages/dsh-research-task-runtime/market-candlestick.js'
import { refineStoredSpecialChartHtml, SPECIAL_CHART_LAYOUT_RUNTIME, SPECIAL_CHART_LAYOUT_VIEW, SPECIAL_CHART_LAYOUT_CSS } from '../../packages/dsh-research-task-runtime/special-chart-layout.js'
import {REVENUE_EXPANSION_CSS} from '../../packages/dsh-research-task-runtime/financial-revenue.js'
import { refineStoredTemplateHtml, displayKpiValue, FEED_CONTEXT_CSS, CARTESIAN_RUNTIME, CARTESIAN_GEOMETRY, CARTESIAN_AXIS_PRECISION, CARTESIAN_PRESENTATION, MARKET_SERIES_RUNTIME, MARKET_SERIES_VIEWPORT_RUNTIME, MARKET_SERIES_OBSERVE_RUNTIME, FINANCIAL_PERFORMANCE_RUNTIME, ADVANCED_VISUAL_RUNTIME, ADVANCED_VISUAL_VIEW, OPERATIONS_DENSITY_CSS, GANTT_READING_CSS, GANTT_SELECTION_RUNTIME, KPI_VALUE_FIT_CSS } from '../../packages/dsh-research-task-runtime/stored-template-refinements.js'
import { CODE_VIEWPORT_CSS, INPUT_VIEW_RUNTIME } from '../../packages/dsh-research-task-runtime/input-artifact.js'
import { MARKET_PRESENTATION_CSS } from '../../packages/dsh-research-task-runtime/market-presentation.js'
import { refineTrendPresentation } from '../../packages/dsh-research-task-runtime/market-trend-presentation.js'
import { applyTerminalPresentation, TERMINAL_PRESENTATION_CSS } from '../../packages/dsh-research-task-runtime/terminal-presentation.js'
import { applyWorkbenchPresentation, WORKBENCH_PRESENTATION_CSS } from '../../packages/dsh-research-task-runtime/workbench-presentation.js'
import { installWorkbenchScrollbars, isWorkbenchScrollbarMessage } from '../../packages/dsh-research-task-runtime/workbench-scrollbars.js'
import { installWorkbenchTableColumns } from '../../packages/dsh-research-task-runtime/workbench-table-columns.js'
import { installWorkbenchNaturalCharts } from '../../packages/dsh-research-task-runtime/workbench-natural-charts.js'
import { researchFrameWheelMessage } from '../../packages/dsh-research-task-runtime/workbench-frame-wheel.js'
import { installWorkbenchStructureReading } from '../../packages/dsh-research-task-runtime/workbench-structure-reading.js'
const root = fileURLToPath(new URL('../..', import.meta.url))
const componentThemeSource = (await readFile(join(root, 'packages/dsh-research-task-runtime/html-artifact.js'), 'utf8'))
  .match(/\/\/ RESEARCH_COMPONENT_THEME_START[\s\S]*?\/\/ RESEARCH_COMPONENT_THEME_END/)[0]
  .replace(/^export /gm, '')
  .replace(/(\/\/ RESEARCH_COMPONENT_THEME_START[^\n]*\n)/, prefix => prefix+'const NOTE_TOOLBAR_GEOMETRY_CSS='+JSON.stringify(NOTE_TOOLBAR_GEOMETRY_CSS)+';\nconst WORKBENCH_ENGLISH='+JSON.stringify(WORKBENCH_ENGLISH)+';\n'+validWorkbenchLocaleMessage.toString()+'\n'+installWorkbenchLocaleMessages.toString()+'\n'+validWorkbenchStyleMessage.toString()+'\n'+installWorkbenchStyleMessages.toString()+'\nconst researchNotoFontCss = '+JSON.stringify(researchNotoFontCss)+';\n'+sharedComponentRuntime.toString()+'\n'+isWorkbenchScrollbarMessage.toString()+'\n'+installWorkbenchScrollbars.toString()+'\n'+installWorkbenchTableColumns.toString()+'\n'+installWorkbenchNaturalCharts.toString()+'\n'+installWorkbenchStructureReading.toString()+'\n'+researchFrameWheelMessage.toString()+'\n')
  .replace(/\bparseResearchHtmlArtifact\(/g, 'parseResearchContainerSpec(')
  .replace(/\bWORKBENCH_ENGLISH\b/g, 'RESEARCH_WORKBENCH_ENGLISH')
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
    stdin: { contents: "export * from './src/preload/research-boards-ui.ts'; export { installSkillComposer,serializeSharedSkillDraft } from './src/preload/integrations/skill-composer.ts'; export {installSkillCommand} from './src/preload/integrations/skill-command.ts'; export {installHomeOperationsNavigation} from './src/preload/home-operations-navigation.ts';", resolveDir: root, loader: 'ts' },
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
  source = source.replace('void sherlockBoardsAdapter.presence(sessionId,{cursor:{x:(e.clientX-r.left-s.viewport.x)/s.viewport.scale,y:(e.clientY-r.top-s.viewport.y)/s.viewport.scale},selectedIds:s.selection.selectedNodeIds.slice(0,100)});', 'const zoom=Number(root.style.getPropertyValue("zoom"))||1;void sherlockBoardsAdapter.presence(sessionId,{cursor:{x:((e.clientX-r.left)/zoom+(root.scrollLeft||0)-s.viewport.x)/s.viewport.scale,y:((e.clientY-r.top)/zoom-s.viewport.y)/s.viewport.scale},selectedIds:s.selection.selectedNodeIds.slice(0,100)});')
  const legacyEntry='sherlockBoardsPage.createResearchBoardsPage({sessions,workspaces,researchWorkspaces,inputHub,slots,bridge:window.dshDesktop.researchBoards})'
  const existingEntry='sherlockBoardsPage.createResearchBoardsPage({sessions,workspaces,researchWorkspaces,inputHub,chatStore,getInput:id=>typeof eworkActiveInput==="function"?eworkActiveInput(id,inputHub.shells.get(id)):inputHub.shells.get(id),slots,bridge:window.dshDesktop.researchBoards})'
  const sidebarEntry=existingEntry.replace('inputHub,chatStore,','inputHub,chatStore,researchSidebar,')
  const entry=sidebarEntry.replace('inputHub,chatStore,','inputHub,chatStore,composerModel:id=>(id===undefined?window[Symbol.for("sherlock:pending-conversation")]?.preferences?.model:ctx.get("modelDirectories")?.directoryFor(id))?.store.getSnapshot(),')
  for(const previous of [legacyEntry,existingEntry,sidebarEntry])if(source.includes(previous))source=replace(source,previous,entry)
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
    'const composerBlocks = new ComposerBlockRegistry();\n            ctx.effect(() => { if (window.top !== window || !window.dshDesktop?.researchBoards) return; sherlockBoardsAdapter = '+entry+'; return () => { sherlockBoardsAdapter?.dispose(); sherlockBoardsAdapter = null; }; }, "Sherlock research boards page adapter");'
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
                const move=e=>{if(Date.now()-last<100)return;last=Date.now();const s=workspace.getSnapshot(),r=root.getBoundingClientRect();const zoom=Number(root.style.getPropertyValue("zoom"))||1;void sherlockBoardsAdapter.presence(sessionId,{cursor:{x:((e.clientX-r.left)/zoom+(root.scrollLeft||0)-s.viewport.x)/s.viewport.scale,y:((e.clientY-r.top)/zoom-s.viewport.y)/s.viewport.scale},selectedIds:s.selection.selectedNodeIds.slice(0,100)});};
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
      'const zoom=Number(root.style.getPropertyValue("zoom"))||1;void sherlockBoardsAdapter.presence(sessionId,{cursor:{x:((e.clientX-r.left)/zoom+(root.scrollLeft||0)-s.viewport.x)/s.viewport.scale,y:((e.clientY-r.top)/zoom-s.viewport.y)/s.viewport.scale},selectedIds:s.selection.selectedNodeIds.slice(0,100)});'
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
  if (!source.includes('"sidebar.sessionSearch"')) {
    source = replace(source, '"sidebar.workspaces": {', '"sidebar.sessionSearch": {kind:"list",scope:"root"},\n"sidebar.workspaces": {')
    const anchor = 'label: collapsed ? t("toggle.open") : t("toggle.collapse"),'
    const index = source.indexOf(anchor)
    const before = source.lastIndexOf('(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {', index)
    if (index < 0 || before < 0) throw new Error('Sidebar search anchor missing')
    source = source.slice(0, before) + 'renderSlot("sidebar.sessionSearch",{buttonClass:SidebarRoot_module_css_default.iconButton}), ' + source.slice(before)
  }

  // Figma 44: the original sidebar icons retain a 16 px frame in either width.
  source = source.replace('size: wide ? 14 : 18', 'size: 16')
    .replace('size: wide ? 16 : 18', 'size: 16')
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
  if (source.includes('data-srb-board-region')) return patchUnifiedSidebarScroll(source)
  return patchUnifiedSidebarScroll(replace(source,
    'renderSlot("sidebar.researchBoards",{wide,expandSidebar:()=>{if(collapsed)toggleSidebar();}})',
    'wide && (0,react_jsx_runtime.jsx)("div",{className:SidebarRoot_module_css_default.regionArea,"data-srb-board-region":"",children:renderSlot("sidebar.researchBoards",{wide,expandSidebar:()=>{if(collapsed)toggleSidebar();}})})'))
}
function patchUnifiedSidebarScroll(source) {
  if (source.includes('data-srb-navigation-scroll')) return source
  const start = 'wide && (0,react_jsx_runtime.jsx)("div",{className:SidebarRoot_module_css_default.regionArea,"data-srb-board-region"'
  const first = source.indexOf(start)
  const footer = source.indexOf('className: SidebarRoot_module_css_default.footArea,', first)
  const end = source.lastIndexOf('(0, react_jsx_runtime.jsxs)("div", {', footer)
  if (first < 0 || footer < 0 || end < first) throw new Error('Unified sidebar scroll anchors missing')
  const content = source.slice(first, end).trimEnd().replace(/,$/, '')
  return source.slice(0, first) + '(0,react_jsx_runtime.jsxs)("div",{"data-srb-navigation-scroll":"",children:[' + content + ']}),\n' + source.slice(end)
}
export function patchResearchBoardSidebarTypes(source) {
  if (!source.includes("'sidebar.sessionSearch'")) source = replace(source, "'sidebar.workspaces': {", "'sidebar.sessionSearch': {kind: 'list'; scope: 'root'; owner: {buttonClass:string}};\n        'sidebar.workspaces': {")

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
    ['dsh-client-ui-tool','lib/client.js',patchSkillToolPresentation],
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
    const patched = await patch(before)
    const after = name === 'dsh-client-ui-conversation' ? patchSkillConversationPresentation(patchLegacyDashboardPreview(patched)) : name === 'dsh-client-ui-workspace' ? patchSkillWorkspacePresentation(patched) : patched
    if (before !== after) await writeFile(path, after)
  }
}

function polishPatch(source) {
  source = patchIntegrationSkillComposer(source)
  source = patchSharedNativeConversation(sharedQueuePatch(source))
  if (!source.includes('applyDirectoryCanvas(canvas) {')) source = replace(source, 'setCollaborationAccess(edit) {', `                applyDirectoryCanvas(canvas) {
                    if (sherlockShared(sessionId)) throw new Error("Directory canvas requires a personal binding");
                    const files = parseResearchCanvasFileNodes(JSON.stringify(canvas.files));
                    const artifacts = boundedResearchCanvasArtifactNodes(canvas.artifacts);
                    if (files.length !== canvas.files.length || artifacts.length !== canvas.artifacts.length) throw new Error("画板资料格式不兼容");
                    pendingHistoryTransaction = null; undoHistory.length = 0; redoHistory.length = 0;
                    snapshot = researchWorkspaceSnapshot({...snapshot,files,artifacts,selection:parseResearchCanvasSelection(JSON.stringify(snapshot.selection),files,artifacts)});
                    listeners.forEach(listener=>listener());
                },
setCollaborationAccess(edit) {`);
  return patchBoardOnlyViews(patchComponentInteractionState(patchBoardFileOwnership(patchBoardDirectoryConversation(patchFigmaFinalConversation(polishBoardPatch(source))))))
}
function polishBoardPatch(source) {
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
export function researchPreviewCanConsumeWheel(target, boundary, deltaX, deltaY) {
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX)
  for (let element = target?.nodeType === 1 ? target : target?.parentElement; element; element = element.parentElement) {
    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element)
    if (style) {
      const scrolls = (delta, overflow, size, visible, position) =>
        delta !== 0 && /^(auto|scroll|overlay)$/u.test(overflow) && size > visible + 1 &&
        (delta > 0 ? position < size - visible - 1 : position > 1)
      if (vertical ? scrolls(deltaY, style.overflowY, element.scrollHeight, element.clientHeight, element.scrollTop) :
          scrolls(deltaX, style.overflowX, element.scrollWidth, element.clientWidth, element.scrollLeft)) return true
    }
    if (element === boundary) break
  }
  return false
}

export function canvasWheelPassThroughPatch(source) {
  const marker = '/* SHERLOCK_SELECTED_COMPONENT_WHEEL_V2 */'
  const helper = `\nvar researchPreviewCanConsumeWheel = ${researchPreviewCanConsumeWheel.toString()};\n${marker}`
  if (source.includes(marker)) return source.replace(/\nvar researchPreviewCanConsumeWheel = [\s\S]*?\n\/\* SHERLOCK_SELECTED_COMPONENT_WHEEL_V2 \*\//, helper)
  if (source.includes('/* SHERLOCK_SELECTED_COMPONENT_WHEEL_V1 */')) return replace(source,
    'frame?.querySelector?.("[data-research-artifact-card]")',
    'frame?.matches?.("[data-research-artifact-card]")').replace(/\nvar researchPreviewCanConsumeWheel = [\s\S]*?\n\/\* SHERLOCK_SELECTED_COMPONENT_WHEEL_V1 \*\//, helper)
  source = replace(source,
    'if (!event.metaKey && !event.ctrlKey && interactivePreview) return;',
    `const preview = selected && event.target?.closest?.("[data-research-preview-interactive]");
                    const passToCanvas = preview && frame?.matches?.("[data-research-artifact-card]") && !preview.querySelector("iframe") && !researchPreviewCanConsumeWheel(event.target, preview, event.deltaX, event.deltaY);
                    if (!event.metaKey && !event.ctrlKey && interactivePreview && !event.__sherlockCanvasPan && !passToCanvas) return;`)
  return source + helper
}

function canvasInteractionPatch(source) {
  source = generationFeedbackPatch(source)
  if (!source.includes('/* SHERLOCK_CHART_ARRANGE_STABLE_V1 */')) {
    // Charts fill their existing frame. Measuring that as intrinsic content
    // adds the frame border again on every arrange and slowly grows the card.
    source = replace(source,
      'node.kind === "web-link" || ["html", "web", "mind-map"].includes(node.containerSpec?.type)',
      'node.kind === "web-link" || ["html", "web", "mind-map", "chart"].includes(node.containerSpec?.type)')
    source += '\n/* SHERLOCK_CHART_ARRANGE_STABLE_V1 */'
  }
  if (!source.includes('/* SHERLOCK_ARRANGE_BORDER_STABLE_V1 */')) {
    // A viewport-filling table reports the current inner frame height. Do not
    // count its border as two new content pixels and grow every row peer.
    source = replace(source,
      "measured.set(node.id, { ...before, width, height: Math.min(maxHeight, Math.max(RESEARCH_CANVAS_NODE_POLICIES.assistant.minHeight, naturalHeight + RESEARCH_CANVAS_TITLE_HEIGHT + 2)), sizeMode: 'manual' });",
      "const measuredHeight = Math.min(maxHeight, Math.max(RESEARCH_CANVAS_NODE_POLICIES.assistant.minHeight, naturalHeight + RESEARCH_CANVAS_TITLE_HEIGHT + 2));\n                    const height = measuredHeight > before.height && measuredHeight - before.height <= 2 ? before.height : measuredHeight;\n                    measured.set(node.id, { ...before, width, height, sizeMode: 'manual' });")
    source += '\n/* SHERLOCK_ARRANGE_BORDER_STABLE_V1 */'
  }
  if (source.includes('/* SHERLOCK_CANVAS_INTERACTION_V1 */')) return canvasWheelPassThroughPatch(patchFigmaFilePreview(patchFigmaFinalCanvas(source)))
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
  return canvasWheelPassThroughPatch(patchFigmaFilePreview(patchFigmaFinalCanvas(source + '\n/* SHERLOCK_CANVAS_INTERACTION_V1 */')))
}

function generationFeedbackPatch(source) {
  for (const [name, value] of Object.entries({ MAX_RESEARCH_HTML_BYTES, RESEARCH_HTML_LIMIT_ERROR })) {
    const declaration = source.match(new RegExp(`^[\\t ]*const ${name} = [^\\n]+;$`, 'm'))?.[0]
    if (!declaration) throw Error('Research HTML limit declaration missing: ' + name)
    source = replace(source, declaration, declaration.slice(0, declaration.indexOf('=') + 1) + ' ' + JSON.stringify(value) + ';')
  }
  source = componentTypographyPatch(source)
  source = componentRuntimeFontPatch(source)
  source = generationProgressOverlayPatch(source)
  if (!source.includes('/* SHERLOCK_GENERATION_PROGRESS_EVENTS_V1 */')) {
    source = replace(source, 'node[key]=original[key];}', 'node[key]=original[key];if(Array.isArray(original?.generationEvents))node.generationEvents=researchGenerationInspectionEvents(original.generationEvents.map(e=>({...e,taskId:node.generationTaskId,canvasNodeId:node.id})),node.generationTaskId,node.id,0);}')
    source += '\n/* SHERLOCK_GENERATION_PROGRESS_EVENTS_V1 */'
  }
  if (source.includes('/* SHERLOCK_GENERATION_FEEDBACK_V1 */')) return generationActivityClockPatch(source)
  source = replace(source, 'className: ChatView_module_css_default.column,\n\t\t\t\t\t\t"data-chat-flow": "",', 'className: ChatView_module_css_default.column,\n\t\t\t\t\t\t"data-chat-flow": "", "data-research-task-conversation": researchTaskIdentity ? "" : undefined,')
  source = replace(source, '"data-research-generation-state": node.generationStatus,', '"data-research-generation-state": node.generationStatus, "data-research-generation-empty": node.kind === "generated-container" && !node.containerSpec ? "" : undefined,')
  source = replace(source, 'const research = /网页|搜索|检索/.test(lastTool);', 'const research = /网页|搜索|检索|金融|行情/.test(lastTool);')
  source = replace(source, "if (event?.type === 'tool-started' && event.detail) append(id, `${event.tool}：${event.detail}`);", "if (event?.type === 'tool-started') append(id, event.detail ? `${event.tool}：${event.detail}` : event.tool);\n                    if(event?.type === 'tool-finished' && !event.failed) append(id, '资料已返回，继续核对与整理');")
  source = replace(source, 'const visible = rows.slice(-5);', `const visible = rows.slice(-3);
            const outputChars = node.generationOutputChars ?? (node.generationPartialText || '').length;
            const lastActivity = node.generationLastActivityAt ?? node.generationEvents?.at(-1)?.at;
            const silence = Number.isFinite(lastActivity) ? Math.max(0, Math.floor((clock-lastActivity)/1000)) : null;
            const activityStatus = silence === null ? (elapsed < 20 ? '任务运行中，等待模型响应' : '仍在等待模型输出') : silence < 3 ? '刚刚收到响应' : '最近响应 ' + silence + ' 秒前';`)
  source = replace(source, "timer = setTimeout(tick, document.hidden ? 1000 : 160);", 'timer = setTimeout(tick, 1000);')
  source = replace(source, "className: 'rScV5Q_generationTerminal', 'data-research-generation-visual': '', 'aria-hidden': true,", "className: 'rScV5Q_generationTerminal', 'data-research-generation-visual': '', 'aria-hidden': true,")
  source = replace(source, "}), (0, react_jsx_runtime.jsx)('span', { className: 'rScV5Q_generationAnnouncement'", `}), (0,react_jsx_runtime.jsxs)('div', {'data-research-generation-activity':'',children:[outputChars>0?'已接收 '+outputChars.toLocaleString()+' 字 · ':'',activityStatus]}), (0, react_jsx_runtime.jsx)('span', { className: 'rScV5Q_generationAnnouncement'`)
  const css = `[data-research-task-conversation]{min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:break-word}[data-research-task-conversation] :is(p,pre,code,details){min-width:0;max-width:100%;overflow-wrap:anywhere;word-break:break-word}[data-research-task-conversation] pre{white-space:pre-wrap;overflow-x:auto}[data-research-generation-empty] .rScV5Q_generationProcess{min-height:0;height:100%;padding:12px 20px 16px;gap:10px}[data-research-generation-empty] .rScV5Q_generationTerminal{min-height:0;flex:1;display:flex;align-items:flex-start;overflow:hidden}[data-research-generation-empty] .rScV5Q_generationLog{justify-content:flex-start;gap:6px;width:100%;min-width:0}[data-research-generation-description]{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}[data-research-generation-activity]{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}.rScV5Q_generationLogText{min-width:0;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}`
  return generationActivityClockPatch(source + `\n/* SHERLOCK_GENERATION_FEEDBACK_V1 */\nif(typeof document!=="undefined"){const style=document.createElement("style");style.dataset.sherlockGenerationFeedback="";style.textContent=${JSON.stringify(css)};document.head.appendChild(style);}\n`)
}

export function patchLegacyDashboardPreview(source) {
  source = source.replace('const baseStyle = `@layer sherlock-component-defaults{', 'const baseStyle = `@layer sherlock-terminal;@layer sherlock-component-defaults{')
  const previewStart = 'function buildResearchHtmlPreview(html, title = '
  if (!source.includes('function compactHostDashboardHtml(html) {'))
    source = replace(source, previewStart, `${compactHostDashboardHtml.toString()}\n${previewStart}`)
  if (!source.includes('function refineCandlestickHtml(html) {'))
    source = replace(source, 'function compactHostDashboardHtml(html) {',
      `${candleRuntime.toString()}\n${candleControls.toString()}\n${refineCandlestickHtml.toString()}\nfunction compactHostDashboardHtml(html) {`)
  if (!source.includes('const MARKET_PRESENTATION_CSS = '))
    source = replace(source, 'function compactHostDashboardHtml(html) {',
      `const MARKET_PRESENTATION_CSS = ${JSON.stringify(MARKET_PRESENTATION_CSS)};\nconst CANDLE_CONTROLS_CSS = ${JSON.stringify(CANDLE_CONTROLS_CSS)};\nconst REVENUE_EXPANSION_CSS = ${JSON.stringify(REVENUE_EXPANSION_CSS)};\nfunction compactHostDashboardHtml(html) {`)
  if (!source.includes('function applyTerminalPresentation(html) {'))
    source = replace(source, previewStart, `const TERMINAL_PRESENTATION_CSS = ${JSON.stringify(TERMINAL_PRESENTATION_CSS)};\n${applyTerminalPresentation.toString()}\n${previewStart}`)
  // Refresh owned serialized definitions on a second postinstall as well.
  // Function boundaries are known insertion anchors, not brace parsing.
  const refreshDefinition = (start, end, definition) => {
    const a = source.indexOf(start), b = source.indexOf(end, a + start.length)
    if (a < 0 || b < 0) throw Error('Component preview definition boundary missing: ' + start)
    source = source.slice(0, a) + definition + '\n' + source.slice(b)
  }
  refreshDefinition('function candleRuntime(groups) {', 'function candleControls(groups) {', candleRuntime.toString())
  refreshDefinition('function candleControls(groups) {', 'function refineCandlestickHtml(html) {', candleControls.toString())
  refreshDefinition('function refineCandlestickHtml(html) {', 'const MARKET_PRESENTATION_CSS = ', refineCandlestickHtml.toString())
  refreshDefinition('const MARKET_PRESENTATION_CSS = ', 'const TERMINAL_PRESENTATION_CSS = ',
    `const MARKET_PRESENTATION_CSS = ${JSON.stringify(MARKET_PRESENTATION_CSS)};\nconst FEED_CONTEXT_CSS = ${JSON.stringify(FEED_CONTEXT_CSS)};\nconst CARTESIAN_RUNTIME = ${JSON.stringify(CARTESIAN_RUNTIME)};\nconst CARTESIAN_GEOMETRY = ${JSON.stringify(CARTESIAN_GEOMETRY)};\nconst CARTESIAN_AXIS_PRECISION = ${JSON.stringify(CARTESIAN_AXIS_PRECISION)};\nconst CARTESIAN_PRESENTATION = ${JSON.stringify(CARTESIAN_PRESENTATION)};\nconst MARKET_SERIES_RUNTIME = ${JSON.stringify(MARKET_SERIES_RUNTIME)};\nconst MARKET_SERIES_VIEWPORT_RUNTIME = ${JSON.stringify(MARKET_SERIES_VIEWPORT_RUNTIME)};\nconst MARKET_SERIES_OBSERVE_RUNTIME = ${JSON.stringify(MARKET_SERIES_OBSERVE_RUNTIME)};\nconst CANDLE_CONTROLS_CSS = ${JSON.stringify(CANDLE_CONTROLS_CSS)};\nconst REVENUE_EXPANSION_CSS = ${JSON.stringify(REVENUE_EXPANSION_CSS)};\nconst SPECIAL_CHART_LAYOUT_RUNTIME = ${JSON.stringify(SPECIAL_CHART_LAYOUT_RUNTIME)};\nconst SPECIAL_CHART_LAYOUT_VIEW = ${JSON.stringify(SPECIAL_CHART_LAYOUT_VIEW)};\nconst SPECIAL_CHART_LAYOUT_CSS = ${JSON.stringify(SPECIAL_CHART_LAYOUT_CSS)};\nconst FINANCIAL_PERFORMANCE_RUNTIME = ${JSON.stringify(FINANCIAL_PERFORMANCE_RUNTIME)};\nconst ADVANCED_VISUAL_RUNTIME = ${JSON.stringify(ADVANCED_VISUAL_RUNTIME)};\nconst ADVANCED_VISUAL_VIEW = ${JSON.stringify(ADVANCED_VISUAL_VIEW)};\nconst OPERATIONS_DENSITY_CSS = ${JSON.stringify(OPERATIONS_DENSITY_CSS)};\nconst GANTT_READING_CSS = ${JSON.stringify(GANTT_READING_CSS)};\nconst GANTT_SELECTION_RUNTIME = ${JSON.stringify(GANTT_SELECTION_RUNTIME)};\nconst KPI_VALUE_FIT_CSS = ${JSON.stringify(KPI_VALUE_FIT_CSS)};\nconst CODE_VIEWPORT_CSS = ${JSON.stringify(CODE_VIEWPORT_CSS)};\nconst INPUT_VIEW_RUNTIME = ${JSON.stringify(INPUT_VIEW_RUNTIME)};\n${refineStoredSpecialChartHtml.toString()}\n${refineTrendPresentation.toString()}\n${displayKpiValue.toString()}\n${refineStoredTemplateHtml.toString()}\n${refineComponentReadingFooter.toString()}\n${compactHostDashboardHtml.toString()}`)
  refreshDefinition('const TERMINAL_PRESENTATION_CSS = ', previewStart,
    `const TERMINAL_PRESENTATION_CSS = ${JSON.stringify(TERMINAL_PRESENTATION_CSS)};\n${applyTerminalPresentation.toString()}\nconst WORKBENCH_PRESENTATION_CSS = ${JSON.stringify(WORKBENCH_PRESENTATION_CSS)};\n${applyWorkbenchPresentation.toString()}`)
  if (!source.includes('const displayHtml = ')) {
    source = replace(source, "  const theme = initialTheme === 'dark' ? 'dark' : 'light'", "  const displayHtml = applyTerminalPresentation(compactHostDashboardHtml(html))\n  const theme = initialTheme === 'dark' ? 'dark' : 'light'")
    source = replace(source, '<body>${html}</body></html>', '<body>${displayHtml}</body></html>')
  } else {
    source = source.replace('const displayHtml = compactHostDashboardHtml(html)', 'const displayHtml = applyTerminalPresentation(compactHostDashboardHtml(html))')
  }
  return source
}

export function componentTypographyPatch(source) {
  const start = source.indexOf('// RESEARCH_COMPONENT_THEME_START')
  const end = source.indexOf('// RESEARCH_COMPONENT_THEME_END', start)
  if (start < 0 || end < 0) throw Error('Component theme block missing')
  source = source.slice(0, start) + componentThemeSource + source.slice(end + '// RESEARCH_COMPONENT_THEME_END'.length)
  const css = JSON.stringify(researchComponentTypographyCss('[data-research-container-type], [data-research-generated-mind-map], [data-research-compact-chrome] .rScV5Q_nodeTitleText', { notoFont: 'local' }))
  const marker = '/* SHERLOCK_COMPONENT_DIN_PRO_V1 */'
  const next = `${marker}\nif(typeof document!=="undefined"){const style=document.createElement("style");style.dataset.sherlockComponentTypography="";style.textContent=${css};document.head.appendChild(style);}`
  const previous = source.indexOf(marker)
  if (previous >= 0) {
    const suffix = ';document.head.appendChild(style);}'
    const previousEnd = source.indexOf(suffix, previous)
    if (previousEnd < 0) throw Error('Component typography stylesheet boundary missing')
    return source.slice(0, previous) + next + source.slice(previousEnd + suffix.length)
  }
  return source + '\n' + next + '\n'

}

function componentRuntimeFontPatch(source) {
  source = source.replaceAll("buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme(), {notoFont:'runtime'})", 'buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme())')
  source = replace(source, 'const srcDoc = (0, react.useMemo)(() => buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme()), [spec.html, spec.title]);', "const srcDoc = (0, react.useMemo)(() => buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme(), {notoFont:'runtime'}), [spec.html, spec.title]);")
  const runtimeStart=source.indexOf('/* SHERLOCK_COMPONENT_RUNTIME_FONT_V1 */')
  if(runtimeStart>=0){const end=source.indexOf('function ResearchHtmlArtifact({ spec, node, onSize }) {',runtimeStart);if(end<0)throw Error('Runtime font bridge boundary missing');source=source.slice(0,runtimeStart)+source.slice(end);}
  source = replace(source, 'function ResearchHtmlArtifact({ spec, node, onSize }) {', `/* SHERLOCK_COMPONENT_RUNTIME_FONT_V1 */
        let researchNotoRuntimeFont;
        function researchSendRuntimeFont(frame, view, force=false) {
            const target=frame.contentWindow;
            frame.dataset.researchFontStatus='loading';
            if(force)researchNotoRuntimeFont=undefined;
            if(!researchNotoRuntimeFont)researchNotoRuntimeFont=fetch('/fonts/NotoSansSC.woff2').then(response=>{if(!response.ok)throw Error('Noto Sans SC 字体读取失败');return response.blob();}).then(blob=>{if(blob.size<1||blob.size>16*1024*1024)throw Error('Noto Sans SC 字体文件无效');return blob;});
            researchNotoRuntimeFont.then(blob=>{if(frame.isConnected&&frame.contentWindow===target){target.postMessage({type:'sherlock-font-data',font:'noto-sc',blob},'*');frame.dataset.researchFontStatus='delivered';}}).catch(error=>{researchNotoRuntimeFont=undefined;if(frame.isConnected&&frame.contentWindow===target){target.postMessage({type:'sherlock-font-failed',font:'noto-sc'},'*');frame.dataset.researchFontStatus='failed';}view.console?.error('组件字体加载失败',error);});
        }
        function ResearchHtmlArtifact({ spec, node, onSize }) {`)
  source=source.replace(/if\(data\.type==='sherlock-font-request'[^\n]+\n[ ]*/, '')
  source=source.replace(/if\(\(data\.type==='sherlock-font-request'[^\n]+\n[ ]*/, '')
  source=source.replace(/if\(data\.type==='sherlock-font-status'[^\n]+\n[ ]*/, '')
  source = replace(source, 'if (data.type === "sherlock-content-hover" && Object.keys(data).length === 2', `if((data.type==='sherlock-font-request'||data.type==='sherlock-font-retry')&&data.font==='noto-sc'&&Object.keys(data).length===2&&Object.hasOwn(data,'type')&&Object.hasOwn(data,'font')){researchSendRuntimeFont(frame,view,data.type==='sherlock-font-retry');return;}
                        if(data.type==='sherlock-font-status'&&data.font==='noto-sc'&&Object.keys(data).length===3&&['loaded','failed'].includes(data.status)){frame.dataset.researchFontStatus=data.status;return;}
                        if (data.type === "sherlock-content-hover" && Object.keys(data).length === 2`)
  return source
}

function generationActivityClockPatch(source) {
  if (source.includes('/* SHERLOCK_GENERATION_ACTIVITY_CLOCK_V1 */')) return source
  source = replace(source, "node.generationLastActivityAt ?? node.generationEvents?.at(-1)?.at", "node.generationLastActivityAt || node.generationEvents?.at(-1)?.time || node.generationEvents?.at(-1)?.at")
  source = replace(source, 'Number.isFinite(lastActivity) ? Math.max', 'Number.isFinite(lastActivity) && lastActivity > 0 ? Math.max')
  return source + '\n/* SHERLOCK_GENERATION_ACTIVITY_CLOCK_V1 */'
}

export function generationProgressOverlayPatch(source) {
  if (source.includes('/* SHERLOCK_GENERATION_PROGRESS_OVERLAY_V1 */')) return source
  source = replace(source, 'let collaborationWritable = false;', 'let collaborationWritable = false; let collaborationAppliedRevision;')
  // Personal directory and shared canvas paths now have the same parsing lines.
  // Revision tracking only belongs to the shared path, where metadata exists.
  const start = source.indexOf('applyRemoteCanvas(canvas, metadata = {}) {')
  const end = source.indexOf('subscribeAssistantActions', start)
  if (start < 0 || end < 0) throw new Error('Shared canvas progress patch boundary missing')
  let remote = source.slice(start, end)
  remote = replace(remote, 'const artifacts = boundedResearchCanvasArtifactNodes(canvas.artifacts);', `const artifacts = boundedResearchCanvasArtifactNodes(canvas.artifacts);
                    for(const node of artifacts){const original=canvas.artifacts.find(n=>n.id===node.id);for(const key of ['generationLastActivityAt','generationOutputChars'])if(Number.isFinite(original?.[key]))node[key]=original[key];}`)
  remote = replace(remote, 'pendingHistoryTransaction = null; undoHistory.length = 0; redoHistory.length = 0;', 'if(collaborationAppliedRevision!==metadata.revision){pendingHistoryTransaction = null; undoHistory.length = 0; redoHistory.length = 0;}collaborationAppliedRevision=metadata.revision;')
  return source.slice(0, start) + remote + source.slice(end) + '\n/* SHERLOCK_GENERATION_PROGRESS_OVERLAY_V1 */'
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
  source = source.replace('const groupBy = useStore((s) => s.groupBy);', 'const groupBy = "workspace";')
    .replace('const orderBy = useStore((s) => s.orderBy);', 'const orderBy = "manual";')
    .replace('children: [wide && (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {', 'children: [false && (0, react_jsx_runtime.jsx)(ViewOptionsMenu, {')
    .replace('else if (orderBy === "updated") {', 'else if (orderBy === "updated" || orderBy === "manual") {')
    .replace('previousUpdatedAt[id] === void 0 || session.updatedAt > previousUpdatedAt[id]', '(previousUpdatedAt[id] === void 0 ? Object.keys(previousUpdatedAt).length > 0 : session.updatedAt > previousUpdatedAt[id])')

  // The unified header search replaces both regional search controls.
  source = source.replace(/wide && (\(0, react_jsx_runtime.jsx\)\("div", \{\s*className: clsx\(WorkspaceBrowser_module_css_default.searchSlot,)/, 'false && $1')

  source = patchBoardDirectoryWorkspace(source)
  // Figma 22/44: idle search and the collapsed add-project glyph remain 16 px.
  source = source.replace('size: searchExpanded ? 11 : 14', 'size: searchExpanded ? 11 : 16')
    .replace('size: wide ? 16 : 18', 'size: 16')
  if (source.includes('/* SHERLOCK_WORKSPACE_COLLAPSE_V1 */')) return patchSidebarSessionExperience(patchWorkspaceSelection(source))
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
  return patchSidebarSessionExperience(patchWorkspaceSelection(source + '\n/* SHERLOCK_WORKSPACE_COLLAPSE_V1 */'))
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
  if (!source.includes('/* SHERLOCK_WORKSPACE_MENU_SKIN_V1 */')) {
    const start = source.indexOf('function ViewOptionsMenu(')
    const end = source.indexOf('function workspaceGroupHalf(', start)
    if (start < 0 || end < 0) throw Error('Workspace view menu anchors drifted')
    const menu = source.slice(start, end)
      .replace('\n\t\t\t\topen,', '\n\t\t\t\tclassName: "srb-navigation-menu", open,')
      .replace('"aria-label": t("viewOptions.label"),', '"aria-label": t("viewOptions.label"), "aria-expanded": open,')
    source = source.slice(0, start) + menu + source.slice(end) + '\n/* SHERLOCK_WORKSPACE_MENU_SKIN_V1 */'
  }

  if (!source.includes('"data-srb-section-header"')) source = replace(source,
    'className: WorkspaceBrowser_module_css_default.sectionHeader,',
    'className: WorkspaceBrowser_module_css_default.sectionHeader, "data-srb-section-header":"",')
  if (source.includes('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V3 */')) return source
  if (source.includes('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V2 */')) return source
    .replace('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V2 */', '/* SHERLOCK_SHARED_SIDEBAR_SKIN_V3 */')
    .replace('rowHalf, useNativeDragAcceptance, WorkspaceFolderIcon};', 'rowHalf, useNativeDragAcceptance, WorkspaceFolderIcon, collapsedSessionLimit: COLLAPSED_SESSION_LIMIT};')
  if (source.includes('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V1 */')) return source
    .replace('/* SHERLOCK_SHARED_SIDEBAR_SKIN_V1 */', '/* SHERLOCK_SHARED_SIDEBAR_SKIN_V3 */')
    .replace('header: WorkspaceBrowser_module_css_default};', 'header: WorkspaceBrowser_module_css_default, rowHalf, useNativeDragAcceptance, WorkspaceFolderIcon, collapsedSessionLimit: COLLAPSED_SESSION_LIMIT};')
  return replace(source, '\t\texports.apply = apply;', `
        /* SHERLOCK_SHARED_SIDEBAR_SKIN_V3 */
        window.__sherlockWorkspaceSidebarSkin = {rows: Rows_module_css_default, header: WorkspaceBrowser_module_css_default, rowHalf, useNativeDragAcceptance, WorkspaceFolderIcon, collapsedSessionLimit: COLLAPSED_SESSION_LIMIT};
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

function patchBoardOnlyViews(source) {
  if (source.includes('/* SHERLOCK_BOARD_ONLY_V1 */')) return source
  source = replace(source, 'function conversationViewTabProps(', `/* SHERLOCK_BOARD_ONLY_V1 */
function useSherlockBoardOnly(sessionId) {
  react.useSyncExternalStore(sherlockBoardsAdapter?.subscribe ?? (()=>()=>{}), sherlockBoardsAdapter?.version ?? (()=>0));
  return sherlockBoardsAdapter?.isBoardOnly(sessionId) === true;
}
function conversationViewTabProps(`)
  source = replace(source, 'const activeView = directActiveView ?? sessionPresentation.view;', 'const boardOnly = useSherlockBoardOnly(sessionId);\n            const activeView = boardOnly ? "research" : directActiveView ?? sessionPresentation.view;')
  // Both resident content and header resolve their view from the same live membership.
  source = source.replaceAll('const storedView = useStore((s) => s.view);', 'const boardOnly = useSherlockBoardOnly(sessionId);\n            const storedView = useStore((s) => s.view);')
  source = replace(source, 'const active = resolveActiveView(tabs, initialResearchRequested || persistedResearchRequested ? "research" : storedView);', 'const active = resolveActiveView(tabs, boardOnly || initialResearchRequested || persistedResearchRequested ? "research" : storedView);')
  source = replace(source, 'const view = initialResearchRequested || persistedResearchRequested ? "research" : storedView ?? "chat";', 'const view = boardOnly || initialResearchRequested || persistedResearchRequested ? "research" : storedView ?? "chat";')
  source = replace(source, 'tabs.length > 1 && (0, react_jsx_runtime.jsx)("div", {', '!boardOnly && tabs.length > 1 && (0, react_jsx_runtime.jsx)("div", {')
  source = replace(source, 'actions.setView(viewId);', 'actions.setView(sherlockBoardsAdapter?.isBoardOnly(sessionId) ? "research" : viewId);')
  return source
}

function sharedQueuePatch(source) {
  if (source.includes('/* SHERLOCK_SHARED_QUEUE_V1 */')) return source
  source = replace(source, 'function QueueDock({ useSession, updateQueue, notify, t }) {', `function QueueDock(props) {
    return sherlockBoardsAdapter && sherlockShared(props.sessionId)
      ? (0,react_jsx_runtime.jsx)(sherlockBoardsPage.ResearchBoardQueue,{...props,page:sherlockBoardsAdapter,QueueDock:NativeQueueDock})
      : (0,react_jsx_runtime.jsx)(NativeQueueDock,props);
  }
  function NativeQueueDock({ useSession, updateQueue, notify, t }) {`)
  source = replace(source, 'updateQueue: (itemId, action) => conversation.updateQueue(itemId, action),', 'sessionId, updateQueue: (itemId, action) => conversation.updateQueue(itemId, action),')
  const start = source.indexOf('function NativeQueueDock('), end = source.indexOf('const queueDockEntry', start)
  let dock = source.slice(start,end)
  dock = dock.replace('queueMutable && (0, react_jsx_runtime.jsx)("div",', 'queueMutable && row.editable !== false && (0, react_jsx_runtime.jsx)("div",')
  dock = dock.replace('queue.length === 1 && (0, react_jsx_runtime.jsx)("span",', '(queue.length === 1 || row.authorName) && (0, react_jsx_runtime.jsx)("span",')
  dock = dock.replace('editing?.id === row.id ? (0, react_jsx_runtime.jsx)("input",', '(row.authorName && (0,react_jsx_runtime.jsx)("span", {"data-queue-author":"",title:row.authorName,style:{fontSize:"12px",color:"var(--dsw-alias-label-secondary)",maxWidth:"96px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flexShrink:0},children:row.authorName})), editing?.id === row.id ? (0, react_jsx_runtime.jsx)("input",')
  source = source.slice(0,start) + dock + source.slice(end)
  return source + '\n/* SHERLOCK_SHARED_QUEUE_V1 */'
}
