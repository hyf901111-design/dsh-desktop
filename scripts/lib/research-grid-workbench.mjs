import {readFileSync} from 'node:fs'
import {createResearchGrid} from '../../packages/dsh-research-task-runtime/research-grid.js'
import {createWorkbenchGridState} from './research-grid-state.mjs'
import * as ui from './research-grid-ui.mjs'
import {WORKBENCH_PRESENTATION_CSS} from '../../packages/dsh-research-task-runtime/workbench-presentation.js'
const begin='/* EWORK_GRID_WORKBENCH_BEGIN */',end='/* EWORK_GRID_WORKBENCH_END */',meta='/* EWORK_GRID_RESTORE '
const nativePresentation=WORKBENCH_PRESENTATION_CSS.replaceAll(':root[data-sherlock-theme="dark"]','__GRID_DARK__').replaceAll(':root','__GRID_ROOT__').replace(/\bhtml\b|\bbody\b/g,'body [data-ework-grid] .rScV5Q_containerContent').replaceAll('__GRID_DARK__','body[data-ds-dark-theme] [data-ework-grid] .rScV5Q_containerContent').replaceAll('__GRID_ROOT__','body [data-ework-grid] .rScV5Q_containerContent')
const toolbarIcons=['link','voice'].map(name=>`body [data-ework-toolbar] .odyssey-global-${name}{background:currentColor!important;mask:center/22px 22px no-repeat url("data:image/svg+xml;base64,${readFileSync(new URL('../../build/figma-canvas-icons/tool-'+name+'.svg',import.meta.url)).toString('base64')}")}`).join('\n')
const workbenchIcons=['refresh','ask','more','close','expand','duplicate','rename','edit','settings','branch','summary','plus','download'].map(name=>{
  const asset=readFileSync(new URL('../../build/figma-workbench-icons/'+name+'.svg',import.meta.url),'utf8')
  const [,width,height]=asset.match(/width="([\d.]+)" height="([\d.]+)"/)
  return `.ew-grid-icon-${name}{mask-image:url("data:image/svg+xml;base64,${Buffer.from(asset).toString('base64')}");mask-size:${width}px ${height}px;${name==='expand'?'transform:rotate(90deg);':''}}`
}).join('\n')
const css='@layer ework-workbench;'+readFileSync(new URL('./research-grid-workbench.css',import.meta.url),'utf8')+toolbarIcons+workbenchIcons+nativePresentation
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
  change("buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme(), {notoFont:'runtime'})","buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme(), {notoFont:'runtime',workbench:true})")
  change('ComponentDataStatusBar,{sessionId:componentDataSessionId,node}','ComponentDataStatusBar,{sessionId:componentDataSessionId,node,workbench:true}')
  const anchor='function createResearchWorkspaceSession(storage, sessionId) {'
  change(anchor,anchor+'\nconst workbenchGrid=createWorkbenchGridState(storage,sessionId);')
  change('const persistSnapshot = () => {','const persistSnapshot = () => {\nif(!workbenchGrid.save())return false;')
  change('setCanvasSize(canvasSize) {','setCanvasSize(canvasSize) {\nif(workbenchGrid.enabled()){const size={...snapshot.canvasSize,...canvasSize};workbenchGrid.enable(Math.max(240,Math.min(size.width||800,size.availableWidth||Infinity)));}')
  change("if(document.documentElement.hasAttribute('data-odyssey-window-resizing')){","if(!root.hasAttribute('data-ework-grid')&&document.documentElement.hasAttribute('data-odyssey-window-resizing')){")
  change('const availableWidth=researchCanvasUnobscuredWidth(bounds,panelBounds);','const availableWidth=root.hasAttribute("data-ework-grid")?workbenchAvailableWidth(root,bounds,panelBounds):researchCanvasUnobscuredWidth(bounds,panelBounds);')
  change('const viewport=researchCanvasViewportForAreaChange(current,next);','const viewport=root.hasAttribute("data-ework-grid")?current.viewport:researchCanvasViewportForAreaChange(current,next);')
  change('snapshot = researchWorkspaceSnapshot(researchWorkbenchGrowthViewport(snapshot,next));','snapshot = researchWorkspaceSnapshot(workbenchGrid.reconcile(workbenchGrid.enabled()?next:researchWorkbenchGrowthViewport(snapshot,next)));')
  const methods=`
    getWorkbenchCells:()=>workbenchGrid.get(),
    getWorkbenchVisibleCells:()=>workbenchGrid.visible(),
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
  change('contextMenu === null ? null : (0, react_jsx_runtime.jsx)("div", {','contextMenu === null ? null : (0, react_jsx_runtime.jsx)(WorkbenchContextMenu, {')
  change('ref: element => positionFigmaCanvasContextMenu(element, contextMenu, rootRef.current),','canvasRoot:rootRef,point:contextMenu,onClose:()=>setContextMenu(null),')
  change('const [downloadMenuNodeId, setDownloadMenuNodeId] = (0, react.useState)(null);','const [downloadMenuNodeId, setDownloadMenuNodeId] = (0, react.useState)(null);\nconst workbenchDownloadLeave=react.useRef(null);react.useEffect(()=>()=>window.clearTimeout(workbenchDownloadLeave.current),[]);')
  change('onMouseEnter:()=>{if(downloadBusyNodeId===null&&researchCanvasExportDescriptor(contextNode,sessionId)?.kind===\'mind-map\')setDownloadMenuNodeId(contextNode.id);},','onMouseEnter:()=>{window.clearTimeout(workbenchDownloadLeave.current);if(downloadBusyNodeId===null&&researchCanvasExportDescriptor(contextNode,sessionId)?.kind===\'mind-map\')setDownloadMenuNodeId(contextNode.id);},')
  change('onMouseLeave:()=>setDownloadMenuNodeId(null),','onMouseLeave:()=>{window.clearTimeout(workbenchDownloadLeave.current);workbenchDownloadLeave.current=window.setTimeout(()=>setDownloadMenuNodeId(null),200);},')
  change('downloadMenuNodeId !== contextNode.id ? null : (0, react_jsx_runtime.jsx)("div", {','downloadMenuNodeId !== contextNode.id ? null : (0, react_jsx_runtime.jsx)(WorkbenchDownloadMenu, {canvasRoot:rootRef,onClose:()=>setContextMenu(null),onMouseEnter:()=>window.clearTimeout(workbenchDownloadLeave.current),onMouseLeave:()=>{window.clearTimeout(workbenchDownloadLeave.current);workbenchDownloadLeave.current=window.setTimeout(()=>setDownloadMenuNodeId(null),200);},')
  change('function normalizeResearchCanvasNodeGeometry(node) {','function normalizeResearchCanvasNodeGeometry(node) {\nif(researchGridNodeIds.has(node?.id))return {width:Math.max(1,node.width),height:Math.max(1,node.height),sizeMode:"manual",resizable:true};')
  change('const onWheel = (event) => {','const onWheel = (event) => {\nif(root.hasAttribute("data-ework-grid")){handleWorkbenchWheel(root,workspace,event);return;}')
  change('organizeCanvas(measured = new Map()) {',`organizeCanvas(measured = new Map()) {
    if(workbenchGrid.enabled()){
      if(!collaborationCanWrite())return false;
      const grid=createResearchGrid(),nodes=[...snapshot.files,...snapshot.artifacts].map(n=>({...n,preferred:measured.get(n.id)||researchOptimalDimensions({...n,width:0,height:0}),gridCompact:researchMarketDimensions(n,true)?.height<=180}));
      if(!nodes.length)return false;
      return this.applyWorkbenchCells(grid.arrange(nodes,workbenchGrid.get(),Math.max(240,Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity)),snapshot.canvasSize.height||0),true);
    }`)
  change('const onPointerDown = (event) => {','const onPointerDown = (event) => {\nif(root.hasAttribute("data-ework-grid")){if(canvasToolRef.current==="select"&&handleWorkbenchMultiSelect(root,workspace,event))return;const card=event.target?.closest?.("[data-research-node-id]");if(card){const id=card.getAttribute("data-research-node-id");if(!workspace.getSnapshot().selection.selectedNodeIds.includes(id))workspace.updateSelection([id],"replace");return;}if(spacePressedRef.current)return;}')
  change('const onContentSelect = (event) => {','const onContentSelect = (event) => {\nif(root.hasAttribute("data-ework-grid")){const frame=event.target,id=frame?.matches?.("iframe[data-research-html-artifact]")&&frame.closest("[data-research-node-id]")?.getAttribute("data-research-node-id");if(!id||!workspace.getSnapshot().artifacts.some(n=>n.id===id))return;const modified=event.detail?.shiftKey||event.detail?.metaKey;if(modified){root.ownerDocument.defaultView.getSelection()?.removeAllRanges();workspace.updateSelection([id],"toggle");}else if(!workspace.getSnapshot().selection.selectedNodeIds.includes(id))workspace.updateSelection([id],"replace");return;}')
  change('const disabled = activeGeneration || editingPrompt;',`const disabled = activeGeneration || editingPrompt;
  useWorkbenchSettings({triggerRef,sessionId,node,disabled,editingPrompt,onEdit,onRefresh,onSetRefresh,onFrameAction,onOpenBrowser,onProvenance:()=>{setShowProvenance(true);setOpen(true);}});`)
  // Selecting a card must not repaint the inner component through an unchanged
  // shared-context message. Fresh documents still request context on join.
  change(`(0,react.useLayoutEffect)(()=>{
      frameRef.current?.contentWindow?.postMessage(componentContext(),'*');
    });`,`const workbenchContextRef=react.useRef(null);
    (0,react.useLayoutEffect)(()=>{
      const context=componentContext(),encoded=JSON.stringify(context),previous=workbenchContextRef.current;
      if(previous?.html===spec.html&&previous.encoded===encoded)return;
      workbenchContextRef.current={html:spec.html,encoded};
      frameRef.current?.contentWindow?.postMessage(context,'*');
    });`)
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
  change('(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: "rScV5Q_globalToolbar",','(0, react_jsx_runtime.jsxs)(WorkbenchToolbar, {rootRef,sessionId,availableWidth:snapshot.canvasSize.availableWidth,\n\t\t\t\t\tclassName: "rScV5Q_globalToolbar",')
  change("const button = root.querySelector('[data-research-global-'+attribute+']')","const button = root.ownerDocument.querySelector('[data-ework-toolbar-owner=\"'+CSS.escape(sessionId)+'\"] [data-research-global-'+attribute+']')")
  change('const canvasOwnsFocus = () => document.activeElement === root || root.contains(document.activeElement);','const canvasOwnsFocus = () => document.activeElement === root || root.contains(document.activeElement) || document.activeElement?.closest?.("[data-ework-toolbar-owner]")?.getAttribute("data-ework-toolbar-owner")===sessionId;')
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
  source=source.replace('function createResearchWorkspaceSession(storage, sessionId) {',begin+'\nconst researchGridNodeIds=new Set();\n'+definitions+`\nif(typeof document!=='undefined'){let style=document.getElementById('ework-grid-workbench-style');if(!style){style=document.createElement('style');style.id='ework-grid-workbench-style';document.head.prepend(style);}style.textContent=${JSON.stringify(css)}}\n`+end+'\nfunction createResearchWorkspaceSession(storage, sessionId) {')
  return source+'\n'+meta+JSON.stringify(changes)+' */'
}
