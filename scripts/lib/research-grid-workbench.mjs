import {readFileSync} from 'node:fs'
import {createResearchGrid} from '../../packages/dsh-research-task-runtime/research-grid.js'
import {createWorkbenchGridState} from './research-grid-state.mjs'
import * as ui from './research-grid-ui.mjs'
const begin='/* EWORK_GRID_WORKBENCH_BEGIN */',end='/* EWORK_GRID_WORKBENCH_END */',meta='/* EWORK_GRID_RESTORE '
const css=readFileSync(new URL('./research-grid-workbench.css',import.meta.url),'utf8')
export function restoreResearchGridWorkbench(source){
  const start=source.indexOf(begin);if(start<0)return source
  const finish=source.indexOf(end,start),a=source.indexOf(meta,finish),b=source.indexOf(' */',a)
  if(finish<0||a<0||b<0)throw Error('Incomplete workbench patch')
  const changes=JSON.parse(source.slice(a+meta.length,b))
  source=source.slice(0,a-1)+source.slice(b+3)
  for(const [original,replacement] of changes.reverse()){
    if(!source.includes(replacement))throw Error('Workbench restore anchor changed: '+replacement.slice(0,90))
    source=source.replace(replacement,original)
  }
  const restoredStart=source.indexOf(begin),restoredEnd=source.indexOf(end,restoredStart)
  return source.slice(0,restoredStart)+source.slice(restoredEnd+end.length+1)
}
export function patchResearchGridWorkbench(source){
  source=restoreResearchGridWorkbench(source)
  const changes=[]
  const change=(from,to)=>{if(source.split(from).length!==2)throw Error('Workbench anchor missing or ambiguous: '+from.slice(0,90));changes.push([from,to]);source=source.replace(from,to)}
  const anchor='function createResearchWorkspaceSession(storage, sessionId) {'
  change(anchor,anchor+'\nconst workbenchGrid=createWorkbenchGridState(storage,sessionId);')
  change('const persistSnapshot = () => {','const persistSnapshot = () => {\nif(!workbenchGrid.save())return false;')
  change('snapshot = researchWorkspaceSnapshot(researchWorkbenchGrowthViewport(snapshot,next));','snapshot = researchWorkspaceSnapshot(workbenchGrid.reconcile(workbenchGrid.enabled()?next:researchWorkbenchGrowthViewport(snapshot,next)));')
  const methods=`
    getWorkbenchCells:()=>workbenchGrid.get(),
    getWorkbenchDocument:()=>workbenchGrid.document(snapshot),
    setWorkbenchWidth(width){if(workbenchGrid.enable(width)){initialWorkbenchFit=false;autoFitManaged=false;autoFitActive=false;update({},false);}},
    applyWorkbenchCells(cells,persist=false){if(!collaborationCanWrite())return false;if(pendingHistoryTransaction===null)pendingHistoryTransaction=historyState();workbenchGrid.set(cells);const nodes=createResearchGrid().project([...snapshot.files,...snapshot.artifacts],cells,Math.max(240,Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity)));this.applyPointerGeometry(nodes);if(persist)this.persist();return true;},
  `
  change('subscribeCanvasAction:listener=>{',methods+'subscribeCanvasAction:listener=>{')
  change('return structuredClone({ files: s.files, artifacts: s.artifacts });','return structuredClone(w.getWorkbenchDocument?.()??{ files: s.files, artifacts: s.artifacts });')
  change('files: value.files,','files: value.files,\nworkbenchCells:workbenchGrid.get(),')
  change('const restoreHistory = (entry) => {','const restoreHistory = (entry) => {\nif(entry.workbenchCells)workbenchGrid.set(entry.workbenchCells);')
  // Shared documents store geometry in a fixed 1000px logical coordinate system.
  // View width is local and never creates a collaboration edit.
  change('applyRemoteCanvas(canvas, metadata = {}) {','applyRemoteCanvas(canvas, metadata = {}) {\nworkbenchGrid.receiveCanonical([...canvas.files,...canvas.artifacts]);')
  change('if(collaborationAppliedRevision!==metadata.revision){', 'workbenchGrid.receiveCanonical([...files,...artifacts]);\nif(collaborationAppliedRevision!==metadata.revision){')
  const hydrated='snapshot = researchWorkspaceSnapshot({...snapshot,files,artifacts,selection:parseResearchCanvasSelection(JSON.stringify(snapshot.selection),files,artifacts)});'
  change('collaborationAppliedRevision=metadata.revision;\n                    '+hydrated,'collaborationAppliedRevision=metadata.revision;\n                    '+hydrated.replace('researchWorkspaceSnapshot({','researchWorkspaceSnapshot(workbenchGrid.reconcile({').replace(')});',')}));'))
  change('pendingHistoryTransaction = null; undoHistory.length = 0; redoHistory.length = 0;\n                    '+hydrated,'pendingHistoryTransaction = null; undoHistory.length = 0; redoHistory.length = 0;\nworkbenchGrid.receiveCanonical([...files,...artifacts]);\n                    '+hydrated.replace('researchWorkspaceSnapshot({','researchWorkspaceSnapshot(workbenchGrid.reconcile({').replace(')});',')}));'))
  {const from='return { left: left - origin.left, top: top - origin.top,',to='return { left: left - origin.left, top: top - origin.top + (root?.hasAttribute("data-ework-grid")?root.scrollTop:0),';if(source.split(from).length!==3)throw Error('Marquee anchors changed');for(let i=0;i<2;i++){changes.push([from,to]);source=source.replace(from,to)}}
  change("left: next.left, top: next.top, bottom: 'auto'","left: next.left + parent.scrollLeft, top: next.top + parent.scrollTop, bottom: 'auto'")
  change("element.style.top = Math.max(inset, Math.min(point.top, height - element.offsetHeight - inset)) + 'px';", "element.style.top = (Math.max(inset, Math.min(point.top, height - element.offsetHeight - inset)) + (canvas.hasAttribute('data-ework-grid')?canvas.scrollTop:0)) + 'px';")
  change('function normalizeResearchCanvasNodeGeometry(node) {','function normalizeResearchCanvasNodeGeometry(node) {\nif(researchGridNodeIds.has(node?.id))return {width:Math.max(1,node.width),height:Math.max(1,node.height),sizeMode:"manual",resizable:true};')
  change('const onWheel = (event) => {','const onWheel = (event) => {\nif(root.hasAttribute("data-ework-grid"))return;')
  change('const onPointerDown = (event) => {','const onPointerDown = (event) => {\nif(root.hasAttribute("data-ework-grid")){const card=event.target?.closest?.("[data-research-node-id]");if(card){const id=card.getAttribute("data-research-node-id");if(!workspace.getSnapshot().selection.selectedNodeIds.includes(id)||event.metaKey||event.shiftKey)workspace.updateSelection([id],event.metaKey?"toggle":event.shiftKey?"add":"replace");return;}if(spacePressedRef.current)return;}')
  // Original business callbacks stay in this closure. The hidden floating
  // toolbar remains a stable anchor for the existing selected-create dialog.
  const hook=`
    useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef:canvasToolRef,selectTool:selectCanvasTool,readOnly:sharedReadOnly});
    const workbenchAsk=node=>{workspace.updateSelection([node.id],'replace');actions?.setResearchRightTab?.('conversation');window.requestAnimationFrame(()=>document.querySelector('.sRp_composer textarea')?.focus());};
    const workbenchDerived=(kind,detail)=>{
      if(kind!=='create'){void startSelectionGeneration(kind,detail);return;}
      const current=workspace.getSnapshot(),ids=Object.freeze([...current.selection.selectedNodeIds]);
      createTriggerRef.current=rootRef.current?.querySelector('[data-workbench-more="'+ids[0]+'"]')||createTriggerRef.current;
      setCreatePrompt('');setCreateError(ids.length>RESEARCH_GENERATION_MAX_SOURCES?'最多选择24项资料':null);
      setCreateSelection({ids,files:current.files.filter(n=>ids.includes(n.id)),artifacts:current.artifacts.filter(n=>ids.includes(n.id)),position:selectionActionPosition});
    };
    const workbenchLegacy=(node,event,action)=>{if(action){frameAction(node,action);return;}const r=rootRef.current.getBoundingClientRect();setContextMenu({nodeId:node.id,left:event.clientX-r.left,top:event.clientY-r.top});};
  `
  change('const emptyViewport = canvasNodes.length > 0',hook+'\nconst emptyViewport = canvasNodes.length > 0')
  change('children: [(0,react_jsx_runtime.jsx)(ComponentDataSettings,{sessionId,canvasRoot:rootRef}),','children: [(0,react_jsx_runtime.jsx)(WorkbenchChromeLayer,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly,onAsk:workbenchAsk,onDerived:workbenchDerived,onLegacy:workbenchLegacy,voiceTarget:voiceWorkbenchTarget}),(0,react_jsx_runtime.jsx)(ComponentDataSettings,{sessionId,canvasRoot:rootRef}),')
  change('const [linkPlacement,setLinkPlacement]=(0,react.useState)(null);','const [linkPlacement,setLinkPlacement]=(0,react.useState)(null);\nconst voiceWorkbenchNode=(0,react.useRef)(null);const [voiceWorkbenchTarget,setVoiceWorkbenchTarget]=react.useState(null);')
  const voice='function ResearchVoiceControl({ sessionId, disabled, onCommand }) {'
  change(voice,'function ResearchVoiceControl({ sessionId, disabled, onCommand, onStart, onCancelDraft, feedbackTarget }) {')
  change('const commandRef = (0, react.useRef)(onCommand);','const commandRef = (0, react.useRef)(onCommand);\nconst startRef=(0,react.useRef)(onStart);startRef.current=onStart;const cancelDraftRef=react.useRef(onCancelDraft);cancelDraftRef.current=onCancelDraft;const [feedbackHost,setFeedbackHost]=react.useState(null);\nreact.useLayoutEffect(()=>{const target=feedbackTarget?.();if((target||null)!==feedbackHost)setFeedbackHost(target||null);});')
  change('const cancel = () => {','const cancel = () => {\ncancelDraftRef.current?.();')
  change('else if (event.type === "cancelled") { requestRef.current = null;', 'else if (event.type === "cancelled") { cancelDraftRef.current?.();requestRef.current = null;')
  change('mounted = false;\n\t\t\t\t\tconst request = requestRef.current;', 'mounted = false;cancelDraftRef.current?.();\n\t\t\t\t\tconst request = requestRef.current;')
  change('if (!bridge) { setError("当前客户端暂不支持语音，请使用 macOS 本地客户端。"); return; }','startRef.current?.();\nif (!bridge) { setError("当前客户端暂不支持语音，请使用 macOS 本地客户端。"); return; }')
  change('!recording && !error ? null : (0, react_jsx_runtime.jsxs)("div", {','!recording && !error ? null : react_dom.createPortal((0, react_jsx_runtime.jsxs)("div", {')
  change('\n\t\t\t\t})\n\t\t\t] });\n\t\t}\n\t\tfunction researchCanvasUnobscuredWidth(', '\n\t\t\t\t}),feedbackHost||document.body)\n\t\t\t] });\n\t\t}\n\t\tfunction researchCanvasUnobscuredWidth(')
  change('onCommand: async (prompt) => {\n\t\t\t\t\t\t\tconst node = workspace.createContainerDraft();',`onCancelDraft:()=>{setVoiceWorkbenchTarget(null);rootRef.current?.querySelector('[data-research-node-id="'+voiceWorkbenchNode.current+'"]')?.removeAttribute('data-research-voice-target');},
      onStart:()=>{const node=workspace.getSnapshot().artifacts.find(n=>n.id===voiceWorkbenchNode.current&&n.generationStatus==='draft')??workspace.createContainerDraft(null,'voice');voiceWorkbenchNode.current=node?.id;setVoiceWorkbenchTarget(node?.id||null);window.requestAnimationFrame(()=>{const card=rootRef.current?.querySelector('[data-research-node-id="'+node?.id+'"]');card?.scrollIntoView({block:'nearest'});});},
      feedbackTarget:()=>rootRef.current?.querySelector('[data-research-node-id="'+voiceWorkbenchNode.current+'"]'),
      onCommand: async (prompt) => {
      const node = workspace.getSnapshot().artifacts.find(n=>n.id===voiceWorkbenchNode.current)??workspace.createContainerDraft(null,'voice');
      setVoiceWorkbenchTarget(null);rootRef.current?.querySelector('[data-research-node-id="'+node?.id+'"]')?.removeAttribute('data-research-voice-target');`)
  change('...(draftKind === "link" ? {title:"添加链接"} : {}),','...(draftKind === "link" ? {title:"添加链接"} : draftKind === "voice" ? {title:"语音组件"} : {}),')
  const definitions=[createResearchGrid,createWorkbenchGridState,...Object.values(ui)].map(fn=>fn.toString()).join('\n')
  source=source.replace('function createResearchWorkspaceSession(storage, sessionId) {',begin+'\nconst researchGridNodeIds=new Set();\n'+definitions+`\nif(typeof document!=='undefined'){let style=document.getElementById('ework-grid-workbench-style');if(!style){style=document.createElement('style');style.id='ework-grid-workbench-style';document.head.appendChild(style);}style.textContent=${JSON.stringify(css)}}\n`+end+'\nfunction createResearchWorkspaceSession(storage, sessionId) {')
  return source+'\n'+meta+JSON.stringify(changes)+' */'
}
