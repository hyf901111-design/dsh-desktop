// A local view preference, independent of the shared board's write permission.
export function createResearchPreviewModeState(storage,sessionId,ownership) {
 const key='ework.research.preview.v1:'+sessionId,listeners=new Set(),cancellers=new Set()
 let requestedPreview=false,stopOwnership=null
 try{requestedPreview=storage?.getItem(key)==='preview'}catch{}
 const isLocked=()=>Boolean(ownership?.get?.(sessionId,get))
 const get=()=>!isLocked()&&requestedPreview
 const ownerChanged=(_next,phase)=>{
  if(phase==='before-release'){
   if(requestedPreview&&isLocked())for(const cancel of cancellers)try{cancel()}catch(error){console.error('Research preview gesture cancellation failed',error)}
   return
  }
  listeners.forEach(fn=>fn())
 }
 const updateSubscription=()=>{
  if(listeners.size||cancellers.size){if(!stopOwnership&&ownership?.subscribe)stopOwnership=ownership.subscribe(sessionId,get,ownerChanged)||(()=>{})}
  else if(stopOwnership){const stop=stopOwnership;stopOwnership=null;stop()}
 }
 const add=(set,fn)=>{set.add(fn);updateSubscription();return()=>{set.delete(fn);updateSubscription()}}
 return {get,isLocked,subscribe:fn=>add(listeners,fn),cancel:fn=>add(cancellers,fn),set(value){
  if(isLocked()||typeof value!=='boolean'||value===requestedPreview)return false
  // Fail before changing either runtime state or active gestures when disk is unavailable.
  try{if(!storage?.setItem||storage.setItem(key,value?'preview':'edit')===false)throw Error()}catch{throw Error('看板模式未保存，请检查本地存储后重试。')}
  if(value)for(const cancel of cancellers)cancel()
  requestedPreview=value;listeners.forEach(fn=>fn());return true
 }}
}

// Runs inside the existing grid restore transaction; no new outer patch wrapper.
export function installResearchPreviewMode(change,changeAll,read) {
 change('const workbenchGrid=createWorkbenchGridState(storage,sessionId,typeof sherlockShared==="function"&&sherlockShared(sessionId));','const workbenchPreview=createResearchPreviewModeState(storage,sessionId,{get:(id,read)=>typeof homeGuideNativePreviewOwner==="function"?homeGuideNativePreviewOwner(id,read):null,subscribe:(id,read,listener)=>typeof subscribeHomeGuideNativePreviewOwner==="function"?subscribeHomeGuideNativePreviewOwner(id,read,listener):()=>{}});\nresearchPreviewWorkspaces.set(sessionId,workbenchPreview);\nconst structureCanWrite=()=>collaborationCanWrite()&&!workbenchPreview.get();\nconst workbenchGrid=createWorkbenchGridState(storage,sessionId,typeof sherlockShared==="function"&&sherlockShared(sessionId));')
 change('pendingWorkbenchArrange:()=>collaborationCanWrite()?','getPreviewMode:workbenchPreview.get,subscribePreviewMode:workbenchPreview.subscribe,subscribePreviewCancel:workbenchPreview.cancel,getPreviewModeLocked:workbenchPreview.isLocked,subscribePreviewModeLock:workbenchPreview.subscribe,\n    setPreviewMode(value){if(workbenchPreview.isLocked())return false;if(value)cancelClipboardImports();return workbenchPreview.set(value)},\n    canEditStructure:structureCanWrite,\n    pendingWorkbenchArrange:()=>structureCanWrite()?')
 // Begin guards precede serialization, native release and history side effects.
 const guards=[
  ['setFiles(files2) {','false'],['setArtifacts(artifacts2) {','false'],['completeLinkDraft(nodeId,rawUrl){','false'],
  ['createWebLink(rawUrl, placement = null) {','null'],['createCalendarTool(){','null'],['createFinancialWidget(widget){','null'],
  ['createContainerDraft(placement = null, draftKind = "container") {','null'],
  ['updateWebLink(nodeId, rawUrl) {','false'],['updateContainerDraft(nodeId, rawPrompt) {','false'],['beginContainerGeneration(nodeId, rawPrompt) {','null'],
  ['updateSmartCreateDraftPrompt(nodeId,prompt,persist=false) {','false'],['connectSmartCreateSource(nodeId,sourceId) {','false'],
  ['beginSelectedCreateDraft(sourceNodeIds) {','null'],['updateSelectedCreateDraft(nodeId,prompt) {','false'],['editSelectedCreateDraft(nodeId) {','null'],
  ['beginGeneration(kind, sourceNodeIds, placement, requestedDetail = "standard", frozenSnapshot = snapshot, existingTargetId = null) {','null'],
  ['retryGeneration(nodeId) {','null'],['renameNode(nodeId, rawTitle) {','false'],['updateArtifactContent(nodeId, rawContent) {','false'],
  ['updateMindMapNodeLabel(nodeId, sourceLineIndex, rawLabel) {','false'],['bringNodeToFront(nodeId, persist = true) {','false'],
  ['removeNodes(nodeIds) {','false'],['moveNodes(selectedIds, delta, scale, persist = true) {','false'],
  ['resizeNode(nodeId, corner, delta, scale, persist = true) {','false'],['updateNodeGeometry(nodeId, geometry, persist = true) {','false'],
  ['reserveWorkbenchPlanning(intent,position){','false']
 ]
 for(const [anchor,result] of guards)change(anchor,anchor+'if(!structureCanWrite())return '+result+';')
 change('const undo = () => {','const undo = () => {if(!structureCanWrite())return false;')
 change('const redo = () => {','const redo = () => {if(!structureCanWrite())return false;')
 const assistant=read().match(/const addAssistantArtifact = \([^\n]+\) => \{/)?.[0]
 if(!assistant)throw Error('Preview assistant artifact anchor changed')
 change(assistant,assistant+'if(!structureCanWrite())return false;')
 // Existing plans may hydrate/complete after a mode switch; admitting new nodes may not.
 change('const existing = new Set(snapshot.artifacts.map(n => n.id));','const existing = new Set(snapshot.artifacts.map(n => n.id));\nif(!structureCanWrite()&&plan.panels.some(p=>!existing.has(p.nodeId)))return false;')
 change('const checkActive = () => { if (epoch !== clipboardEpoch','const checkActive = () => { if(!structureCanWrite())throw Error("预览模式下无法添加组件，请切换到编辑模式。"); if (epoch !== clipboardEpoch')
 // All these sinks edit component content; financial/interaction/view sinks keep their original ACL.
 for(const name of ['researchAttachmentSinks','researchAudioSinks','researchYoutubeSinks','researchIframeSinks','researchDerivedSinks','financialLinkSinks']){
  const expression=new RegExp(name+'\\.set\\(sessionId,\\([^\\n]*?\\)=>\\{','g')
  const anchors=[...new Set(read().match(expression)||[])]
  if(!anchors.length&&name!=='researchYoutubeSinks'&&name!=='researchIframeSinks')throw Error('Preview content sink missing: '+name)
  for(const anchor of anchors)changeAll(anchor,anchor+'if(!structureCanWrite())return false;')
 }
 // These presets own manual content editors and external import services.
 for(const name of ['ResearchAttachmentPreset','ResearchAudioPreset','ResearchYoutubePreset','ResearchIframePreset','ResearchDerivedPreset']){
  const start=read().indexOf('function '+name+'('),end=read().indexOf('\nfunction ',start+10)
  if(start<0||end<0)throw Error('Preview preset missing: '+name)
  const before=read().slice(start,end)
  const after=before.replace('const readOnly=', 'const previewMode=useResearchPreviewSession('+({ResearchYoutubePreset:'ref',ResearchIframePreset:'ref',ResearchDerivedPreset:'host'}[name]||'root')+',sessionId);\n const readOnly=previewMode||')
  if(before===after)throw Error('Preview preset permission missing: '+name)
  change(before,name==='ResearchAttachmentPreset'?after.replace("type:'file',multiple:true","type:'file',multiple:true,disabled:readOnly||busy"):after)
 }
 const calendarStart=read().indexOf('function CalendarTool({node,sessionId}){'),calendarEnd=read().indexOf('\nfunction ',calendarStart+10)
 if(calendarStart<0||calendarEnd<0)throw Error('Preview calendar anchor changed')
 const calendar=read().slice(calendarStart,calendarEnd)
 change(calendar,calendar.replace('const shared=sherlockShared(sessionId),readOnly=shared&&data.shared?.canEdit!==true','const previewMode=useResearchPreviewSession(root,sessionId);\n const shared=sherlockShared(sessionId),readOnly=previewMode||shared&&data.shared?.canEdit!==true'))
 // Request provenance is renderer-local. A retained, hidden research tree
 // must not lock a separate Notes calendar with the same session/node identity.
 change('function calendarToolRequest(sessionId,nodeId,action,extra={}){',`function calendarToolRequest(sessionId,nodeId,action,extra={},origin){
if(["save","delete","complete"].includes(action)&&researchPreviewWorkspaces.get(sessionId)?.get()){
 const owner=origin?.isConnected?origin.closest?.('[data-research-node-id]'):null,canvas=owner?.closest('[data-research-canvas]'),note=origin?.isConnected?origin.closest?.('.en-native-component-host[data-note-session][data-note-component]'):null;
 const ownsCanvas=canvas?.dataset.researchPreviewSession===sessionId&&owner?.dataset.researchNodeId===nodeId;
 const ownsNote=!canvas&&note?.dataset.noteSession===sessionId&&note?.dataset.noteComponent===nodeId&&owner?.matches('.en-research')&&owner.dataset.researchNodeId===nodeId;
 if(ownsCanvas||!ownsNote)return Promise.reject(Error("预览模式下无法编辑事项，请切换到编辑模式。"));
}`)
 // The editor is portalled to body, so its existing anchor owns the request.
 for(const [call,origin] of [
  ["calendarToolRequest(sessionId,node.id,'save',{input:draft,id:event?.id})",'anchor.current'],
  ["calendarToolRequest(sessionId,node.id,'delete',{id:event.id})",'anchor.current'],
  ["calendarToolRequest(sessionId,node.id,'complete',{id:r.event.id,date:r.date,completed:!completed(r.event,r.date)})",'root.current'],
  ["calendarToolRequest(sessionId,node.id,'save',{input:{title,date,time:null,timezone:zone,notes:'',repeat:'none',reminderMinutes:null}})",'root.current']
 ])change(call,call.slice(0,-1)+','+origin+')')
 const financialStart=read().indexOf('financialWidgetSinks.set(sessionId,(nodeId,expected,next)=>{'),financialEnd=read().indexOf('\n',financialStart)
 if(financialStart<0)throw Error('Preview financial usage sink missing')
 const financial=read().slice(financialStart,financialEnd)
 change(financial,financial.replace('spec=financialWidgetSpec(next);','parsed=financialWidgetSpec(next),spec=parsed?{...parsed}:null;').replace('return commitUpdate(',`if(workbenchPreview.get())for(const field of ['linkedWatchlistId','linkedSourceId']){if(Object.hasOwn(node.containerSpec,field))spec[field]=node.containerSpec[field];else delete spec[field];}return commitUpdate(`))
 // Changing a linked receiver's symbol/query implicitly unlinks it in edit
 // mode. In preview, leave this one field visibly locked and direct the person
 // to the upstream selector; all independent component filters stay interactive.
 for(const name of ['FinancialQuoteSelector','FinancialNewsSearch']){
  const start=read().indexOf('function '+name+'('),bodyStart=read().indexOf('\n',start),end=read().indexOf('\nfunction ',bodyStart)
  if(start<0||end<0)throw Error('Preview linked selector missing: '+name)
  const before=read().slice(bodyStart,end)
  const setup=`\n const previewRoot=react.useRef(null),previewLinked=useResearchPreviewSession(previewRoot,sessionId)&&Boolean(financialLinkSourceId(node.containerSpec)),previewLinkHint=previewLinked?(document.documentElement.dataset.odysseyLocale==='en'?'Follows the upstream selection. Change the symbol in the source component.':'跟随上游联动，请在上游切换标的'):undefined;readOnly=readOnly||previewLinked;`
  let after=setup+before
  after=after.replace("className:'ew-financial-header-selector'","ref:previewRoot,className:'ew-financial-header-selector'")
  if(name==='FinancialQuoteSelector')after=after.replace("FinancialSymbolSearch,{readOnly,variant:'quote'","FinancialSymbolSearch,{readOnly,contextHint:previewLinkHint,variant:'quote'")
  else after=after.replace('title:value||undefined,disabled:readOnly',"title:previewLinkHint||value||undefined,'aria-description':previewLinkHint,disabled:readOnly")
  change(before,after)
 }
 change('title:query===null?displayValue:undefined,disabled:readOnly',"title:arguments[0].contextHint||(query===null?displayValue:undefined),'aria-description':arguments[0].contextHint,disabled:readOnly")
 // Layout authorization is a bundle-private identity, never a caller-controlled boolean.
 change('applyWorkbenchCells(cells,persist=false,layoutToken,automatic=false){if(!collaborationCanWrite())return false;','applyWorkbenchCells(cells,persist=false,previewToken,automatic=false){if(!collaborationCanWrite()||workbenchPreview.get()&&previewToken!==researchPreviewArrangeToken)return false;')
 change('this.applyPointerGeometry(nodes);if(persist)this.persist();return true;},','this.applyPointerGeometry(nodes,previewToken);if(persist)this.persist();return true;},')
 change('applyPointerGeometry(nodes) {','applyPointerGeometry(nodes,previewToken) {if(workbenchPreview.get()&&previewToken!==researchPreviewArrangeToken)return false;')
 change('organizeCanvas(measured = new Map(), arrangeMode="standard") {','organizeCanvas(measured = new Map(), arrangeMode="standard",previewToken) {if(!collaborationCanWrite()||workbenchPreview.get()&&previewToken!==researchPreviewArrangeToken)return false;')
 change('arrangeMode,{authoredBoard:measured.__homeGuideBoardLayout===true}),!measured.__workbenchDeferred,undefined,true);','arrangeMode,{authoredBoard:measured.__homeGuideBoardLayout===true}),!measured.__workbenchDeferred,previewToken,true);')
 // The ordinary controller rejects structural AI edits. A separate controller is
 // reachable only by the existing trusted host refresh subscription and may only
 // replace one existing component's containerSpec, as the refresh service does.
 change('const canvasActions = canvasWorkspaceActions({','const canvasActionAdapter = {')
 change('canWrite:()=>collaborationCanWrite(),','canWrite:structureCanWrite,')
 const controllerEnd='undo:async()=>sherlockShared(sessionId)?await sherlockBoardsAdapter.undo(sessionId):undo()\n      });'
 change(controllerEnd,'undo:async()=>sherlockShared(sessionId)?await sherlockBoardsAdapter.undo(sessionId):undo()\n      };\nconst canvasActions=canvasWorkspaceActions(canvasActionAdapter);\nconst canvasDataRefreshActions=canvasWorkspaceActions({...canvasActionAdapter,canWrite:collaborationCanWrite});')
 change('const result=await canvasActions[method](args,options);',`const refresh=options?.previewToken===researchPreviewDataRefreshToken&&['inspect','apply'].includes(method);
 if(refresh&&method==='apply'&&(!Array.isArray(args?.changes)||args.changes.length!==1||args.changes[0]?.op!=='update'||Object.keys(args.changes[0]?.fields||{}).join(',')!=='containerSpec'||!snapshot.artifacts.some(n=>n.id===args.changes[0].id)))throw Error('数据刷新仅可更新当前组件内容。');
 const result=await (refresh?canvasDataRefreshActions:canvasActions)[method](args,options);`)
 change("workspace.canvasAction(request.method,request.args,{isCancelled:request.isCancelled,silent:request.source==='component-data-refresh'})","workspace.canvasAction(request.method,request.args,{isCancelled:request.isCancelled,silent:request.source==='component-data-refresh',previewToken:request.source==='component-data-refresh'?researchPreviewDataRefreshToken:undefined})")
 // Dynamic read of preview avoids stale event closures for drops/keyboard actions.
 change('const run = (event, kind, keyboard = false) => {','const run = (event, kind, keyboard = false) => {if(kind!=="copy"&&workspace.getPreviewMode())return;')
 change('const frameAction = (node, action) => {','const frameAction = (node, action) => {if(workspace.getPreviewMode())return;')
 change('const onPointerCancel = (event) => finishOperation(event, false);','const onPointerCancel = (event) => finishOperation(event, false);\nconst offPreviewCancel=workspace.subscribePreviewCancel(()=>{finishOperation(undefined,false);resetFileDrag();});')
 change('root.removeEventListener("dragenter", onDragEnter);','offPreviewCancel();root.removeEventListener("dragenter", onDragEnter);')
 // Only structural controls use this derived flag. Inner financial and HTML
 // components retain their original interaction and collaboration permissions.
 change('const snapshot = (0, react.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);\n            /* ODYSSEY_CREATION_CANVAS_RECONCILE */','const snapshot = (0, react.useSyncExternalStore)(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot);\nconst previewMode=react.useSyncExternalStore(workspace.subscribePreviewMode,workspace.getPreviewMode,workspace.getPreviewMode),structureReadOnly=sharedReadOnly||previewMode;\n            /* ODYSSEY_CREATION_CANVAS_RECONCILE */')
 change("canvasToolRef.current=sharedReadOnly?'select':canvasTool;","canvasToolRef.current=structureReadOnly?'select':canvasTool;")
 change('"data-canvas-tool":sharedReadOnly?"select":canvasTool,','"data-canvas-tool":structureReadOnly?"select":canvasTool,"data-research-preview-mode":previewMode?"preview":"edit","data-research-preview-session":sessionId,')
 for(const anchor of ['onDropCapture: event => {if(sharedReadOnly)','onPasteCapture: event => {if(sharedReadOnly)'])change(anchor,anchor.replace('sharedReadOnly','structureReadOnly'))
 change('useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef:canvasToolRef,selectTool:selectCanvasTool,readOnly:sharedReadOnly});','useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef:canvasToolRef,selectTool:selectCanvasTool,readOnly:structureReadOnly});\nreact.useEffect(()=>workspace.subscribePreviewCancel(()=>{selectCanvasTool("select");setLinkPopoverOpen(false);setEditingNodeId(null);setEditingContentNodeId(null);setContextMenu(null);closeSelectedCreate();}),[workspace,closeSelectedCreate]);')
 // Preserve the producer's research-surface boundary; older resident bundles
 // emit the same call without that explicit scope. Unknown/mixed shapes fail.
 const connectionCalls=['(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly})',"(FinancialConnections,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly,surface:'research'})"].filter(call=>read().includes(call))
 if(connectionCalls.length!==1)throw Error('Preview financial connection call missing or ambiguous')
 change(connectionCalls[0],connectionCalls[0].replace('readOnly:sharedReadOnly','readOnly:structureReadOnly'))
 // The toolbar wrapper clones creation buttons with disabled; library owns its
 // own subscription because its internal menus can already be open on a switch.
 const library='function FinancialLibrary({rootRef,workspace,sessionId}){'
 if(!read().includes(library))throw Error('Preview component library anchor changed')
 change(library,library+'\nconst previewMode=react.useSyncExternalStore(workspace.subscribePreviewMode,workspace.getPreviewMode,workspace.getPreviewMode);')
 const libraryStart=read().indexOf(library),libEnd=read().indexOf('\nfunction ',libraryStart+library.length),lib=read().slice(libraryStart,libEnd)
 change(lib,lib.replace('const readOnly=sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true','const readOnly=previewMode||sherlockShared(sessionId)&&sherlockBoardsAdapter?.getView(sessionId)?.permissions.edit!==true').replace('const place=widget=>','react.useEffect(()=>{if(previewMode)setOpen(false)},[previewMode]);\n const place=widget=>'))
}

// Restrict this local policy to the research canvas. A note component may reuse
// the same source session while retaining its independent note edit permission.
export function useResearchPreviewSession(rootRef,sessionId) {
 const state=researchPreviewWorkspaces.get(sessionId)
 const subscribe=react.useCallback(fn=>state?.subscribe(fn)||(()=>{}),[state])
 const snapshot=react.useCallback(()=>Boolean(rootRef.current?.closest?.('[data-research-canvas]')&&state?.get()),[state,rootRef])
 return react.useSyncExternalStore(subscribe,snapshot,snapshot)
}
