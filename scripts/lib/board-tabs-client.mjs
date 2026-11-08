import {readFileSync} from 'node:fs'
import * as contract from '../../packages/dsh-research-task-runtime/board-tabs-contract.js'
import {createBoardTabsGridState} from './board-tabs-grid.mjs'
import {createBoardTabsWorkspace} from './board-tabs-workspace.mjs'
import * as ui from './board-tabs-ui.mjs'
const start='/* EWORK_BOARD_TABS_BEGIN */',end='/* EWORK_BOARD_TABS_END */',record='/* EWORK_BOARD_TABS_RESTORE '
export function stripBoardTabsClient(source){
 const a=source.indexOf(start);if(a<0)return source
 const b=source.indexOf(end,a),r=source.indexOf(record),finish=source.indexOf(' */',r)
 if(b<0||r<0||finish<0)throw Error('页签补丁恢复记录不完整')
 const changes=JSON.parse(source.slice(r+record.length,finish))
 source=source.slice(0,source[r-1]==='\n'?r-1:r)+source.slice(finish+3)
 for(const [before,after] of changes.reverse()){const index=source.indexOf(after);if(index<0)throw Error('页签补丁锚点变化: '+after.slice(0,80));source=source.slice(0,index)+before+source.slice(index+after.length)}
 const x=source.indexOf(start),y=source.indexOf(end,x);return source.slice(0,x)+source.slice(y+end.length+1)
}
export function patchBoardTabsClient(source){
 source=stripBoardTabsClient(source)
 const preview=source.includes("const workbenchPreview=createResearchPreviewModeState(")
 const write=preview?"structureCanWrite()":"collaborationCanWrite()"
 const changes=[],change=(before,after,from=0)=>{const at=source.indexOf(before,from);if(at<0)throw Error('页签补丁缺少锚点: '+before.slice(0,110));changes.push([before,after]);source=source.slice(0,at)+after+source.slice(at+before.length)}
 const css=readFileSync(new URL('./board-tabs.css',import.meta.url),'utf8')+['board-tabs','tabs-more','tabs-grip'].map(name=>'.ew-board-tabs-icon[data-tabs-icon="'+name+'"]{mask-image:url("data:image/svg+xml;base64,'+readFileSync(new URL('../../build/figma-component-library/'+name+'.svg',import.meta.url)).toString('base64')+'")}').join('\n')
 const definitions=start+'\n'+[...Object.values(contract),createBoardTabsGridState,createBoardTabsWorkspace,...Object.values(ui)].map(fn=>fn.toString()).join('\n')+'\nif(typeof document!=="undefined"){let style=document.getElementById("ework-board-tabs-style");if(!style){style=document.createElement("style");style.id="ework-board-tabs-style";document.head.append(style)}style.textContent='+JSON.stringify(css)+'}\n'+end+'\n'
 source=source.replace('function createResearchWorkspaceSession(storage, sessionId) {',definitions+'function createResearchWorkspaceSession(storage, sessionId) {')
 change('const workbenchGrid=createWorkbenchGridState(storage,sessionId);','const workbenchGrid=createBoardTabsGridState(storage,sessionId);')
 change('const htmlFitStates = new Map();',`const boardTabsWorkspace=createBoardTabsWorkspace({read:()=>snapshot,grid:workbenchGrid,canWrite:()=>${write},publish:patch=>update(patch,false),notify:()=>listeners.forEach(listener=>listener()),createId:createResearchCanvasArtifactId,canonical:canonicalResearchCanvasArtifactNode,bound:boundedResearchCanvasArtifactNodes,remove:removeResearchCanvasNodes,
 transact:(patch,prepare)=>{
  if(!${write})return false;finalizeHistoryTransaction();const before=historyState(),old=snapshot,redo=[...redoHistory];let staged=false;
  try{const prepared=prepare?.()??{},candidate={...snapshot,...patch,...prepared};candidate.artifacts=synchronizeFinancialLinks(candidate.artifacts);const next=workbenchGrid.reconcile(boardTabsReconcile(candidate,workbenchGrid.active()));persistClipboardBatch(next);staged=true;if(!workbenchGrid.save())throw Error('保存失败');publish(next,false,true);recordHistory(before);releaseRemovedArtifacts(old.artifacts,snapshot.artifacts);const live=new Set(snapshot.files.map(n=>n.id));const removed=old.files.filter(n=>!live.has(n.id)&&typeof n.authorizationId==='string').map(n=>n.id);if(removed.length)updateOrphanRevocations(removed);return true}
  catch{workbenchGrid.restore(before.boardTabsGrid);workbenchGrid.sync(old);if(staged){try{persistClipboardBatch(old)}catch{}workbenchGrid.save()}publish(old,false,true);redoHistory.splice(0,redoHistory.length,...redo);return false}
 }});
const htmlFitStates = new Map();`)
 change('const publish = (next, persist = false, preserveStack = false) => {',`const publish = (next, persist = false, preserveStack = false) => {
 next=boardTabsReconcile(next,workbenchGrid.active(),workbenchGrid.active(),n=>workbenchGrid.targetForNode(n));
 if(boardTabsNode(next)){const visible=boardTabsVisible(next,workbenchGrid.active()),ids=new Set([...visible.files,...visible.artifacts,...workbenchGrid.planningNodes()].map(n=>n.id));if(next.selection.selectedNodeIds.some(id=>!ids.has(id))){const selected=next.selection.selectedNodeIds.filter(id=>ids.has(id)),prior=snapshot.selection.selectedNodeIds.filter(id=>ids.has(id));next={...next,selection:{selectedNodeIds:selected.length?selected:prior,orderedFileIds:next.selection.orderedFileIds.filter(id=>ids.has(id))}};}}`)
 change('workbenchCells:workbenchGrid.get(),','workbenchCells:workbenchGrid.get(),boardTabsGrid:workbenchGrid.history(),boardTabsViewport:boardTabsNode(value)?value.viewport:null,')
 change('if(entry.workbenchCells)workbenchGrid.set(entry.workbenchCells);','if(entry.boardTabsGrid)workbenchGrid.restore(entry.boardTabsGrid);else if(entry.workbenchCells)workbenchGrid.set(entry.workbenchCells);')
 change('publish({ ...snapshot, files: entry.files, artifacts: artifacts2, selection: entry.selection }, true, true);','publish({ ...snapshot, files: entry.files, artifacts: artifacts2, selection: entry.selection,viewport:entry.boardTabsViewport??snapshot.viewport }, true, true);')
 change('subscribeCanvasAction:listener=>{','...boardTabsWorkspace,\ngetWorkbenchLayoutOffset:()=>workbenchGrid.offset(),\ngetWorkbenchLayoutOffsetX:()=>workbenchGrid.offsetX(),\ngetWorkbenchContentWidth:width=>workbenchGrid.contentWidth(width),\nsubscribeCanvasAction:listener=>{')
 change('const nodes=createResearchGrid().project([...snapshot.files,...snapshot.artifacts],cells,Math.max(240,Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity)));this.applyPointerGeometry('+(preview?'nodes,previewToken':'nodes')+');','const visible=boardTabsVisible(snapshot,workbenchGrid.active()),nodes=createResearchGrid().project([...visible.files,...visible.artifacts],cells,workbenchGrid.contentWidth(Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity))).map(n=>({...n,x:n.x+workbenchGrid.offsetX(),y:n.y+workbenchGrid.offset()}));this.applyPointerGeometry('+(preview?'nodes,previewToken':'nodes')+');')
 change('setViewport(viewport, automatic=false) {','setViewport(viewport, automatic=false) { workbenchGrid.rememberViewport({...snapshot.viewport,...viewport});')
 const types=source.match(/const RESEARCH_CONTAINER_TYPES = (?:\/\* @__PURE__ \*\/ )?new Set\(\[[^\]]+\]/)?.[0];if(!types)throw Error('页签类型注册缺失');change(types,types.replace('new Set([','new Set(["board-tabs",'))
 change('if (value.type === "web") {','if(value.type===\'board-tabs\')return boardTabsSpec(value);\nif (value.type === "web") {')
 change('function normalizeResearchCanvasNodeGeometry(node) {','function normalizeResearchCanvasNodeGeometry(node) {\nif(node?.containerSpec?.type===\'board-tabs\')return {width:Math.max(1,node.width),height:34,sizeMode:"manual",resizable:false};')
 change('function researchOptimalDimensions(node = {}, measured = null) {','function researchOptimalDimensions(node = {}, measured = null) {\nif(node?.containerSpec?.type===\'board-tabs\')return {width:node.width||976,height:34};')
 const canvasStart=source.search(/function (?:HomeGuideNativeOriginal)?ResearchCanvas\(\{/)
 if(canvasStart<0)throw Error('页签补丁缺少画布组件')
 change('const snapshot = (0, react.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);','const snapshot = (0, react.useSyncExternalStore)(workspace.subscribe, workspace.getBoardTabsRenderSnapshot, workspace.getBoardTabsRenderSnapshot);',canvasStart)
 change('const canvasNodes = [...files, ...artifacts];','const boardPage=boardTabsVisible(snapshot,workspace.getActiveBoardTab());const canvasNodes = [...boardPage.files, ...boardPage.artifacts];',canvasStart)
 change('if(root.hasAttribute("data-ework-grid")){handleWorkbenchWheel(root,workspace,event);return;}','if(event.target?.closest?.("[data-board-tabs-nav]"))return;\nif(root.hasAttribute("data-ework-grid")){handleWorkbenchWheel(root,workspace,event);return;}')
 change('const onPointerDown = (event) => {\nif(root.hasAttribute("data-ework-grid"))','const onPointerDown = (event) => {\nif(event.target?.closest?.("[data-board-tabs-resize]"))return;\nif(root.hasAttribute("data-ework-grid"))')
 change("const frame = occupied || (intent.state === 'dealing' ? gridFrame.current : null);","const frame = occupied || (intent.state === 'dealing' ? gridFrame.current : null);\nconst boardTabPlanningHidden=workspace?.isBoardPlanningVisible?.(intent.id)===false;")
 change("'aria-label': label + workbenchText(\"生成进度\"), style: frame ? {left:frame.x", "'data-board-tab-hidden':boardTabPlanningHidden?'':undefined,inert:boardTabPlanningHidden?'':undefined,'aria-label': label + workbenchText(\"生成进度\"), style: frame ? {visibility:boardTabPlanningHidden?'hidden':undefined,left:frame.x")
 change('function ResearchCanvasContextBadge({ workspace, input, keyboard, t, disabled = false }) {\n\t\t\tconst snapshot = (0, react.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);','function ResearchCanvasContextBadge({ workspace, input, keyboard, t, disabled = false }) {\n\t\t\tconst fullSnapshot = (0, react.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);\nconst snapshot=workspace.getVisibleBoardSnapshot?.()??fullSnapshot;')
 change('artifacts.map((node) => node.containerPrompt===',"artifacts.filter(node=>node.containerSpec?.type!=='board-tabs').map((node) => node.containerPrompt===")
 change('children: [(0,react_jsx_runtime.jsx)(WorkbenchChromeLayer,','children: [(0,react_jsx_runtime.jsx)(BoardTabsLayer,{rootRef,workspace,sessionId,snapshot,readOnly:'+(preview?'structureReadOnly':'sharedReadOnly')+'}),(0,react_jsx_runtime.jsx)(WorkbenchChromeLayer,')
 change('const nodes=[...snapshot.files,...snapshot.artifacts],next=[]','const visible=workspace.getVisibleBoardSnapshot(),nodes=[...visible.files,...visible.artifacts],next=[]')
 change('const nodes=[...snapshot.files,...snapshot.artifacts,...workspace.getWorkbenchPlanningNodes()],width=', 'const visible=boardTabsVisible(snapshot,workspace.getActiveBoardTab()),nodes=[...visible.files,...visible.artifacts,...(snapshot.boardTabsPlanningNodes??workspace.getWorkbenchPlanningNodes())],width=')
 change('const occupied = workspace?.getWorkbenchPlanningNodes?.().find(node => node.id === intent.id);','const occupied = (workspace?.getBoardTabsRenderSnapshot?.().boardTabsPlanningNodes??workspace?.getWorkbenchPlanningNodes?.())?.find(node => node.id === intent.id);')
 change('const grid=createResearchGrid(),nodes=[...snapshot.files,...snapshot.artifacts,...workbenchGrid.planningNodes()].map(', 'const activePage=boardTabsVisible(snapshot,workbenchGrid.active()),grid=createResearchGrid(),nodes=[...activePage.files,...activePage.artifacts,...workbenchGrid.planningNodes()].map(')
 const arrangePageIds='boardTabsNode(snapshot)?new Set(boardTabsVisible(snapshot,workbenchGrid.active()).artifacts.map(node=>node.id)):undefined'
 change('pendingWorkbenchArrange:()=>'+write+'?workbenchAutoArrange.ready(snapshot):[],','pendingWorkbenchArrange:()=>'+write+'?workbenchAutoArrange.ready(snapshot,'+arrangePageIds+'):[],')
 change('consumeWorkbenchArrange:ids=>workbenchAutoArrange.consume(ids),','consumeWorkbenchArrange:ids=>workbenchAutoArrange.consume(ids,'+arrangePageIds+'),')
 change("const node=widget==='calendar'?workspace.createCalendarTool():workspace.createFinancialWidget(widget);", "const node=widget==='board-tabs'?workspace.createBoardTabs():widget==='calendar'?workspace.createCalendarTool():workspace.createFinancialWidget(widget);")
 change('...componentLibraryBuiltins().map(({widget})=>',"...[...componentLibraryBuiltins(),{widget:'board-tabs'}].map(({widget})=>")
 change("widget==='calendar'?'日历':financialWidgetDefaults(widget).title","widget==='board-tabs'?'页签':widget==='calendar'?'日历':financialWidgetDefaults(widget).title")
 change("children:widget==='calendar'?'日历':financialWidgetDefaults(widget).title","children:widget==='board-tabs'?'页签':widget==='calendar'?'日历':financialWidgetDefaults(widget).title")
 change("if(name!=='library')return jsx('span'", "if(name==='board-tabs')return jsx(BoardTabsIcon,{name:'board-tabs'});\n if(name!=='library')return jsx('span'")
 change("onClick:()=>place(widget),children:","onClick:()=>place(widget),...(widget==='board-tabs'?{onPointerDown:e=>boardTabsLibraryDrag(e,{workspace,rootRef,onPlaced:()=>setOpen(false),readOnly})}:{}),children:")
 // Keep draw, drag and fit calculations in the page-local grid.
 change('grid.arrange(nodes,workbenchGrid.visible(),Math.max(240,Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity)),','grid.arrange(nodes,workbenchGrid.visible(),workbenchGrid.contentWidth(Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity)),')
 change('const width=()=>Math.max(240,Math.min(root.clientWidth,workspace.getSnapshot().canvasSize.availableWidth||root.clientWidth))','const width=()=>workspace.getWorkbenchContentWidth(Math.min(root.clientWidth,workspace.getSnapshot().canvasSize.availableWidth||root.clientWidth))')
 change('return {x:e.clientX-r.left,y:e.clientY-r.top+root.scrollTop}}','return {x:e.clientX-r.left-(workspace.getWorkbenchLayoutOffsetX?.()||0),y:e.clientY-r.top+root.scrollTop-(workspace.getWorkbenchLayoutOffset?.()||0)}}')
 change("left:n.x-n.width/2+'px',top:n.y-n.height/2+'px',width:n.width+'px'", "left:n.x-n.width/2+(workspace.getWorkbenchLayoutOffsetX?.()||0)+'px',top:n.y-n.height/2+(workspace.getWorkbenchLayoutOffset?.()||0)+'px',width:n.width+'px'")
 change("workspace.createContainerDraft({x:n.x,y:n.y,width:n.width,height:n.height,", "workspace.createContainerDraft({x:n.x+(workspace.getWorkbenchLayoutOffsetX?.()||0),y:n.y+(workspace.getWorkbenchLayoutOffset?.()||0),width:n.width,height:n.height,")
 // Keep the existing canvas pointer engine. The optional controller only
 // suspends it while a move is close to a visible, receivable page label.
 const pointerStart=source.indexOf('function installWorkbenchPointer('),pointerEnd=source.indexOf('\nfunction ',pointerStart+10)
 if(pointerStart<0||pointerEnd<0)throw Error('页签原生拖动接入点缺失')
 const pointer=source.slice(pointerStart,pointerEnd)
 let hooked=pointer
 const hook=(before,after)=>{if(!hooked.includes(before))throw Error('页签拖动钩子缺失: '+before.slice(0,70));hooked=hooked.replace(before,after)}
 hook('const finish=(commit,event)=>{','const finish=(commit,event,preserveLayout=false)=>{')
 hook('else{workspace.applyWorkbenchCells(op.canonicalBefore,false);workspace.cancelPointerGeometry(', 'else{if(!preserveLayout)workspace.applyWorkbenchCells(op.canonicalBefore,false);workspace.cancelPointerGeometry(')
 hook('workspace.applyWorkbenchCells(pending,false);const visible=', 'workspace.applyWorkbenchCells(pending,false);op.boardTabsPreviewCells=pending;const visible=')
 hook('Math.max(12+origin.width/2,Math.min(width()-12-origin.width/2,origin.x+p.x-op.start.x))','Math.max(12+origin.width/2,Math.min(width()-12-origin.width/2,origin.x+p.x-op.start.x))+(workspace.getWorkbenchLayoutOffsetX?.()||0)')
 hook('Math.max(12+origin.height/2,origin.y+p.y-op.start.y)', 'Math.max(12+origin.height/2,origin.y+p.y-op.start.y)+(workspace.getWorkbenchLayoutOffset?.()||0)')
 hook("root.setAttribute('data-grid-operation',op.kind);card?.setAttribute('data-grid-active','');lastPointer=e", "root.__ewBoardTabsDrag?.begin(e,op);\nroot.setAttribute('data-grid-operation',op.kind);card?.setAttribute('data-grid-active','');lastPointer=e")
 hook('autoFrame=0;if(!op||!lastPointer)return', 'autoFrame=0;if(!op||!lastPointer||root.__ewBoardTabsDrag?.active())return')
 hook('lastPointer=e;update(e);if(!autoFrame)autoFrame=view.requestAnimationFrame(autoScroll)', 'lastPointer=e;const tabMove=root.__ewBoardTabsDrag?.move(e,op);if(tabMove){if(frame)view.cancelAnimationFrame(frame);frame=0;pending=null;show(op.cell);preview.hidden=false;if(tabMove===\'cancel\')root.__ewBoardTabsDrag.cancel(e,op,preserve=>finish(false,e,preserve));return}update(e);root.__ewBoardTabsDrag?.afterMove(e);if(!autoFrame)autoFrame=view.requestAnimationFrame(autoScroll)')
 hook('e.stopImmediatePropagation();finish(true,e)', 'e.stopImmediatePropagation();if(root.__ewBoardTabsDrag?.release(e,op,preserve=>finish(false,e,preserve)))return;if(op.boardTabsResume){update(e);op.boardTabsResume=false}finish(true,e);root.__ewBoardTabsDrag?.end()')
 hook('e?.stopImmediatePropagation?.();finish(false,e)', 'e?.stopImmediatePropagation?.();if(!root.__ewBoardTabsDrag?.cancel(e,op,preserve=>finish(false,e,preserve)))finish(false,e)')
 hook("e.preventDefault();finish(false)}}", "e.preventDefault();if(!root.__ewBoardTabsDrag?.cancel(e,op,preserve=>finish(false,undefined,preserve)))finish(false)}}")
 hook('if(op)finish(false,e)}', 'if(op){if(!root.__ewBoardTabsDrag?.cancel(e,op,preserve=>finish(false,e,preserve)))finish(false,e)}else root.__ewBoardTabsDrag?.end()}')
 const cleanup=hooked.includes('return()=>{offPreview?.();')?'return()=>{offPreview?.();':'return()=>{';hook(cleanup+'finish(false);preview.remove();',cleanup+'root.__ewBoardTabsDrag?.end();finish(false);preview.remove();')
 change(pointer,hooked)
 // Keep asynchronous clipboard admission attached to its original page.
 change('const insertClipboardBatch = async (payload, point, active, epoch) => {','const insertClipboardBatch = async (payload, point, active, epoch, boardTabTarget) => {')
 change('else if (payload?.kind === "components") raw = payload.nodes;', 'else if (payload?.kind === "components") {raw = payload.nodes;if(raw?.some(n=>n.containerSpec?.type===\'board-tabs\'))throw Error(\'请从组件库添加页签组件。\');}')
 change('const checkActive = () => {',"const checkActive = () => { if(boardTabTarget?.navId&&(!boardTabsNode(snapshot)||boardTabsNode(snapshot).id!==boardTabTarget.navId||!boardTabsNode(snapshot).containerSpec.tabs.some(t=>t.id===boardTabTarget.tabId)))throw Error('目标页签已删除，请重新粘贴。');")
 change('let next = { ...snapshot, files: nextFiles, artifacts: nextArtifacts, selection };','let next = boardTabsReconcile({ ...snapshot, files: nextFiles, artifacts: nextArtifacts, selection },workbenchGrid.active(),workbenchGrid.active(),()=>boardTabTarget);')
 change('const selection = { selectedNodeIds: raw.map((node) => ids.get(node.id)), orderedFileIds: files2.map((node) => node.id) };',"const requestedTab=boardTabTarget?.navId===null?boardTabsNode(snapshot)?.containerSpec.tabs[0]?.id:boardTabTarget?.tabId;const selection = requestedTab&&requestedTab!==workbenchGrid.active()?snapshot.selection:{ selectedNodeIds: raw.map((node) => ids.get(node.id)), orderedFileIds: files2.map((node) => node.id) };")
 change('return selection.selectedNodeIds;','return raw.map(node=>ids.get(node.id));')
 change('insertClipboardNodes(payload, point, options = {}) {','insertClipboardNodes(payload, point, options = {}) {\nconst boardTabTarget=boardTabsWorkspace.captureBoardTabTarget();')
 change('insertClipboardBatch(frozen, point, options.active ?? (() => true), epoch)','insertClipboardBatch(frozen, point, options.active ?? (() => true), epoch,boardTabTarget)')
 change('pasteClipboardNodes(point, options = {}) {','pasteClipboardNodes(point, options = {}) {\nconst boardTabTarget=boardTabsWorkspace.captureBoardTabTarget();')
 change('insertClipboardBatch(payload, point, active, epoch)','insertClipboardBatch(payload, point, active, epoch,boardTabTarget)')
 change('const startSelectedCreate = async (draftSelection = null, draftPrompt = null) => {','const startSelectedCreate = async (draftSelection = null, draftPrompt = null) => {\nconst boardTabTarget=workspace.captureBoardTabTarget();')
 change("const target = workspace.beginGeneration('create', selectedNodeIds, draft?{x:draft.x,y:draft.y,width:draft.width,height:draft.height,sizeMode:'manual'}:placement, prompt, frozen, draft?.id??null);","const target = workspace.withBoardTabTarget(boardTabTarget,()=>workspace.beginGeneration('create', selectedNodeIds, draft?{x:draft.x,y:draft.y,width:draft.width,height:draft.height,sizeMode:'manual'}:placement, prompt, frozen, draft?.id??null));")
 change('const startSelectionGeneration = async (kind, requestedDetail = "standard") => {','const startSelectionGeneration = async (kind, requestedDetail = "standard") => {\nconst boardTabTarget=workspace.captureBoardTabTarget();')
 change('const target = workspace.beginGeneration(kind, selectedNodeIds, placement, detail);',"let target;try{target=workspace.withBoardTabTarget(boardTabTarget,()=>workspace.beginGeneration(kind, selectedNodeIds, placement, detail))}catch(error){setClipboardFeedback({state:'error',kind:'generation',message:error?.message||'目标页签已不可用，请重新选择后生成。'});return;}")
 change('applyWorkbench(plan) {',"applyWorkbench(plan) {\nif(!plan||!Array.isArray(plan.panels))return false;const tabIntent=odysseyCreationIntents.get(sessionId),boardTabTarget=workbenchGrid.capturePlanTarget(plan,['planning','stopping'].includes(tabIntent?.state)?tabIntent.startedAt:undefined);if(!boardTabsWorkspace.canApplyBoardTabTarget(boardTabTarget)){boardTabsWorkspace.retainBoardTabPlan(plan);return false;}")
 change('persistClipboardBatch({ ...snapshot, artifacts, selection });', 'const tabbed=boardTabsReconcile(boardTabsApplyWorkbench({ ...snapshot, artifacts, selection },plan),workbenchGrid.active(),workbenchGrid.active(),n=>workbenchGrid.targetForNode(n));persistClipboardBatch(tabbed);')
 change('commitUpdate({ artifacts, selection, ...(preparedViewport ? {viewport:preparedViewport} : {}) }, false);','commitUpdate({ artifacts:tabbed.artifacts, selection, ...(preparedViewport&&!boardTabsNode(snapshot)?{viewport:preparedViewport}:{}) }, false);')
 change('async copySelectedNodes() {',"async copySelectedNodes() {\nif(snapshot.selection.selectedNodeIds.some(id=>id===boardTabsNode(snapshot)?.id))throw Error('请复制页签中的业务组件。');")
 // Measure only visible component ports; FinancialConnections projects hidden endpoints onto their owning page tabs.
 const connectionStart=source.indexOf('function FinancialConnections('),connectionEnd=source.indexOf('\nfunction ',connectionStart+10)
 if(connectionStart<0||connectionEnd<0)throw Error('页签连线可见性锚点缺失')
 const connections=source.slice(connectionStart,connectionEnd)
 change(connections,connections.replaceAll("for(const port of root.querySelectorAll('[data-financial-port]')){","for(const port of root.querySelectorAll('[data-financial-port]')){if(!workspace.isBoardNodeVisible(port.dataset.financialPortNode))continue;"))
 // Hidden components stay mounted; native data and media state survive switching.
 return source+'\n'+record+JSON.stringify(changes).replaceAll('*/','*\\/')+' */'
}
