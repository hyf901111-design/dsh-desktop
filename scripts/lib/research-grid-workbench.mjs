import {stripResearchBoardHeaderClient} from './research-board-header-client.mjs'
import {serializeWorkbenchRestore,parseWorkbenchRestore} from './workbench-restore-codec.mjs'
import {createResearchPreviewModeState,useResearchPreviewSession,installResearchPreviewMode} from './research-preview-mode.mjs'
import {financialRecordsActionPayload,financialRecordsCsv} from '../../packages/dsh-research-task-runtime/financial-records.js'
import {codeTemplatePayload} from '../../packages/dsh-research-task-runtime/input-template-contract.js'
import {installWorkbenchChartMotion} from '../../packages/dsh-research-task-runtime/workbench-chart-motion.js'
import {installWorkbenchTableColumns,createWorkbenchTableColumnState} from '../../packages/dsh-research-task-runtime/workbench-table-columns.js'
import {WORKBENCH_ENGLISH,workbenchText,useWorkbenchLocale,localizedWorkbenchFunctions} from './workbench-localization.mjs'
import * as workbenchStyle from './workbench-style-client.mjs'
import {workbenchModeCss,workbenchStructureDepthCss} from '../../packages/dsh-research-task-runtime/workbench-style.js'
import {readFileSync} from 'node:fs'
import {createResearchGrid} from '../../packages/dsh-research-task-runtime/research-grid.js'
import {createWorkbenchGridState,workbenchScrollExtent} from './research-grid-state.mjs'
import {workbenchReadingCandidate,workbenchReadingOutline,WorkbenchReadingSections} from './workbench-reading-sections.mjs'
import * as ui from './research-grid-ui.mjs'
import {componentWheelPan} from './component-wheel-zoom.mjs'
import {workbenchSelectedCreateCells,WorkbenchSelectedCreateContext,WorkbenchSelectedCreateDraft,patchWorkbenchSelectedCreate} from './research-selected-create.mjs'
import {serializeWorkbenchContent,installWorkbenchExport,isPassiveWorkbenchSvg,workbenchImageExportRequest} from '../../packages/dsh-research-task-runtime/workbench-export.js'
import {installWorkbenchRefresh,workbenchRefreshCss} from '../../packages/dsh-research-task-runtime/workbench-refresh.js'
import {WORKBENCH_PRESENTATION_CSS} from '../../packages/dsh-research-task-runtime/workbench-presentation.js'
import {installWorkbenchScrollbars,isWorkbenchScrollbarMessage} from '../../packages/dsh-research-task-runtime/workbench-scrollbars.js'
import {noteAssistantDestinationFunction} from './notes-reply-actions.mjs'
import {createWorkbenchAutoArrangeState,installWorkbenchAutoArrange} from './workbench-auto-arrange.mjs'
import {patchComponentPptxMode,stripComponentPptxMode} from './component-pptx-mode.mjs'
const begin='/* EWORK_GRID_WORKBENCH_BEGIN */',end='/* EWORK_GRID_WORKBENCH_END */',meta='/* EWORK_GRID_RESTORE '
const nativePresentation=WORKBENCH_PRESENTATION_CSS.replaceAll(':root[data-sherlock-theme="dark"]','__GRID_DARK__').replaceAll(':root','__GRID_ROOT__').replace(/\bhtml\b|\bbody\b/g,'body [data-ework-grid] .rScV5Q_containerContent').replaceAll('__GRID_DARK__','body[data-ds-dark-theme] [data-ework-grid] .rScV5Q_containerContent').replaceAll('__GRID_ROOT__','body [data-ework-grid] .rScV5Q_containerContent')
const toolbarIcons=['link','voice'].map(name=>`body [data-ework-toolbar] .odyssey-global-${name}{background:currentColor!important;mask:center/20px 20px no-repeat url("data:image/svg+xml;base64,${readFileSync(new URL('../../build/figma-canvas-icons/tool-'+name+'.svg',import.meta.url)).toString('base64')}")}`).join('\n')
// Preserve Figma path geometry while giving all workbench glyphs one frame and
// stroke family. Supplementary glyphs use the same pipeline as reference assets.
const workbenchIconNames=['refresh','refresh-manual','ask','more','close','expand','folder','duplicate','rename','edit','settings','branch','summary','plus','download','link','globe','voice','schedule','data','remove','zoom-in','zoom-out','zoom-reset','library-add']
const workbenchIcons=workbenchIconNames.map(name=>{
  const asset=readFileSync(new URL('../../build/figma-workbench-icons/'+name+'.svg',import.meta.url),'utf8')
  const [,rawWidth,rawHeight]=asset.match(/width="([\d.]+)" height="([\d.]+)"/),width=Number(rawWidth),height=Number(rawHeight)
  const scale=name==='expand'?14.5/Math.max(width,height):Math.min(1,16/Math.max(width,height))
  const inner=asset.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace(/ stroke-width="[^"]*"/g,'').replace(/<path /g,'<path vector-effect="non-scaling-stroke" ')
  const normalized='<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g data-icon-family="workbench" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><g transform="translate('+(16-width*scale)/2+' '+(16-height*scale)/2+') scale('+scale+')">'+inner+'</g></g></svg>'
  return `.ew-grid-icon-${name}{mask-image:url("data:image/svg+xml;base64,${Buffer.from(normalized).toString('base64')}");mask-size:16px 16px;${name==='expand'?'transform:rotate(90deg);':''}}`
}).join('\n')
const modeIcons=['light','dark','openterminal','enterprise'].map(name=>'.ew-workbench-mode-'+name+'{mask-image:url("data:image/svg+xml;base64,'+readFileSync(new URL('../../build/figma-canvas-icons/mode-'+name+'.svg',import.meta.url)).toString('base64')+'")}').join('\n')
export const nativeMindMapDepthCss=workbenchStructureDepthCss(
  'body [data-ework-grid][data-workbench-style=enterprise]',
  '.rScV5Q_mindMap .rScV5Q_mindMapNode','data-research-mind-map-depth'
)
const css='@layer ework-workbench;'+readFileSync(new URL('./research-grid-workbench.css',import.meta.url),'utf8')+toolbarIcons+workbenchIcons+nativePresentation+'@layer ework-workbench{'+workbenchModeCss('body [data-ework-grid]',' [data-research-node-id]')+workbenchModeCss('body [data-ework-grid]',' .rScV5Q_containerContent')+nativeMindMapDepthCss+'}'+readFileSync(new URL('./research-selected-create.css',import.meta.url),'utf8')+readFileSync(new URL('./workbench-style.css',import.meta.url),'utf8')+modeIcons
export function restoreResearchGridWorkbench(source){
  source=stripComponentPptxMode(stripResearchBoardHeaderClient(source))
  const start=source.indexOf(begin);if(start<0)return source
  // The writer escapes comment terminators inside JSON; stop at this record's
  // own delimiter so later independent restore records remain intact.
  const finish=source.indexOf(end,start),a=source.indexOf(meta,finish),b=source.indexOf(' */',a+meta.length)
  if(finish<0||a<0||b<0)throw Error('Incomplete workbench patch')
  const changes=parseWorkbenchRestore(source.slice(a+meta.length,b))
  source=source.slice(0,a-1)+source.slice(b+3)
  for(const [original,replacement,count=1] of changes.reverse()){
    if(count>1){if(!Number.isSafeInteger(count)||source.split(replacement).length!==count+1)throw Error("Workbench repeated restore count changed");source=source.replaceAll(replacement,original);continue}
    if(!source.includes(replacement)){
      // Earlier progress-copy upgrades changed this sentence after the grid
      // restore record was written. Preserve that exact owned copy migration.
      if(replacement.startsWith('function researchGenerationLog(node) {')){
        const oldCopy='本次资料获取未完成，正在调整检索',newCopy='正在调整这一步的处理，已取得的内容会保留'
        const migrated=replacement.replace(oldCopy,newCopy)
        if(migrated!==replacement&&source.includes(migrated)){source=source.replace(migrated,original.replace(oldCopy,newCopy));continue}
      }
      // Older restore records predate the owned Notes destination transform.
      // Match that complete transform exactly, then preserve it on both sides.
      if(replacement.startsWith('function ResearchAssistantCanvasAction({ messageId, text, workspace }) {')){
        const migrated=noteAssistantDestinationFunction(replacement).trimEnd()
        if(source.includes(migrated)){source=source.replace(migrated,noteAssistantDestinationFunction(original).trimEnd());continue}
      }
      throw Error('Workbench restore anchor changed: '+replacement.slice(0,90))
    }
    source=source.replace(replacement,original)
  }
  const restoredStart=source.indexOf(begin),restoredEnd=source.indexOf(end,restoredStart)
  return source.slice(0,restoredStart)+source.slice(restoredEnd+end.length+1)
}
export function patchResearchGridWorkbench(source){
  source=restoreResearchGridWorkbench(source)
  const changes=[]
  const change=(from,to)=>{if(source.split(from).length!==2)throw Error('Workbench anchor missing or ambiguous: '+from.slice(0,90));changes.push([from,to]);source=source.replace(from,to)}
  // The generated workbench preview is the only caller that opts in. Other
  // hosts reuse ResearchContainerContent, including copied components in Notes.
  change('ResearchContainerContent, { node, sessionId, visible, officePreview, onHtmlSize, onUpgradeSize }',
    'ResearchContainerContent, { node, sessionId, visible, officePreview, onHtmlSize, onUpgradeSize, workbenchReading:workbenchReadingCandidate(node) }')
  change('react_jsx_runtime.jsx)(ResearchContainerBody,props)', 'react_jsx_runtime.jsx)(props.workbenchReading ? WorkbenchReadingSections : ResearchContainerBody,props)')
  change("buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme(), {notoFont:'runtime'})","buildResearchHtmlPreview(spec.html, spec.title, readResearchComponentTheme(), {notoFont:'runtime',workbench:true})")
  change('const ready = visible !== false || previewActive || RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus);','const arranging=useWorkbenchArrangePreview(node);\n            const ready = arranging || visible !== false || previewActive || RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus);')
  change('ComponentDataStatusBar,{sessionId:componentDataSessionId,node}','ComponentDataStatusBar,{sessionId:componentDataSessionId,node,workbench:true}')
  change("'data-research-generation-stage': presentation.stage,", "'data-workbench-fixed-generation-size':'', 'data-research-generation-stage': presentation.stage,")
  const anchor='function createResearchWorkspaceSession(storage, sessionId) {'
  change(anchor,anchor+'\nconst implicitGenerationResizes=new Set();const workbenchGrid=createWorkbenchGridState(storage,sessionId,typeof sherlockShared==="function"&&sherlockShared(sessionId));const workbenchStyleState=createWorkbenchStyleState(storage,sessionId);const workbenchTableColumns=createWorkbenchTableColumnState(storage,sessionId);const workbenchAutoArrange=createWorkbenchAutoArrangeState(storage,sessionId);')
  change('const workbenchAutoArrange=createWorkbenchAutoArrangeState(storage,sessionId);',`const workbenchAutoArrange=createWorkbenchAutoArrangeState(storage,sessionId);
const responsiveArrangeKey='ework.research.responsive-arrange.v1:'+sessionId;
let responsiveArrange;
try{const saved=storage?.getItem(responsiveArrangeKey);if(saved==='auto'||saved==='manual')responsiveArrange=saved==='auto'}catch{}`)
  change('const canvasActions = canvasWorkspaceActions({\n        snapshot:()=>snapshot,',`const canvasActions = canvasWorkspaceActions({
        snapshot:()=>snapshot,
        presentation:()=>({workbenchStyle:workbenchStyleState.get()||readResearchComponentTheme()}),
        describePresentation:()=>({workbenchStyle:{type:'string',enum:['light','dark','enterprise','openterminal'],description:'仅当前看板的展示主题；enterprise 为易方达，openterminal 为彭博。'}}),
        canChangePresentation:()=>true,
        applyPresentation:fields=>setWorkbenchStyle(fields.workbenchStyle,{scope:'board'}),`)
  change('let actionReceipt = null; const actionListeners = new Set();',`const setWorkbenchStyle=(mode,options)=>{if(workbenchStyleState.set(mode,options)){update({},false);return true}return false};
      let actionReceipt = null; const actionListeners = new Set();`)
  change('frame?.contentWindow?.postMessage({ type: \"sherlock-theme\", colorScheme: readResearchComponentTheme(frame.ownerDocument) }, \"*\");','sendWorkbenchFramePresentation(frame);')
  // Explicitly drawn frames retain their size across generation and hydration.
  // This is distinct from automatic voice/selection cards' readable task size.
  change('...(selectedCreate ? { creationMode: "selection" } : {}),','...(selectedCreate ? { creationMode: "selection" } : {}),\n...(typeof value.preserveGenerationSize==="boolean"?{preserveGenerationSize:value.preserveGenerationSize}:{}),')
  // Only a newly click-created implicit frame opts into one completed-content fit.
  // Grid projection remains manual; absent/true markers retain all legacy sizes.
  change("if(node?.sizeMode==='manual'||spec===null)return null;\n  const {width,height}=researchOptimalDimensions({...node,containerSpec:spec});\n  return {width,height};", "if((node?.sizeMode==='manual'&&node.preserveGenerationSize!==false)||spec===null)return null;\n  const content=node.preserveGenerationSize===false?{...node,width:0,height:0,containerSizePreset:undefined,size:undefined,sizeMode:'auto'}:node;\n  const {width,height}=researchOptimalDimensions({...content,containerSpec:spec});\n  return {width,height,...(node.preserveGenerationSize===false?{preserveGenerationSize:true}:{})};")
  // Explicit geometry edits take ownership before a pending result can fit it.
  change('const next = geometry.sizeMode === "auto" ? researchGenerationSizedNode(node, geometry, snapshot) : { ...node, ...geometry };', 'const next = geometry.sizeMode === "auto" ? researchGenerationSizedNode(node, geometry, snapshot) : { ...node, ...geometry };\nif(node.preserveGenerationSize===false&&geometry.sizeMode!=="auto"&&(Number.isFinite(geometry.width)&&geometry.width!==node.width||Number.isFinite(geometry.height)&&geometry.height!==node.height))next.preserveGenerationSize=true;')
  change('const next = {...n,x:g.x,y:g.y,width:g.width,height:g.height};', 'const next = {...n,x:g.x,y:g.y,width:g.width,height:g.height};\nif(n.preserveGenerationSize===false&&(Math.abs(g.width-n.width)>.5||Math.abs(g.height-n.height)>.5))implicitGenerationResizes.add(n.id);')
  change('const geometry = researchContainerFinalGeometry(next, spec);','const geometry = implicitGenerationResizes.has(next.id)&&next.preserveGenerationSize===false?null:researchContainerFinalGeometry(next, spec);')
  change('this.applyPointerGeometry(nodes);\n                  pendingHistoryTransaction = null;',`this.applyPointerGeometry(nodes);
                  const cancelled=new Set(implicitGenerationResizes);implicitGenerationResizes.clear();
                  const artifacts=snapshot.artifacts.map(n=>cancelled.has(n.id)&&n.preserveGenerationSize===false&&n.generationStatus==='completed'&&n.containerSpec?researchGenerationSizedNode(n,researchContainerFinalGeometry(n,n.containerSpec),snapshot):n);
                  if(collaborationCanWrite()&&artifacts.some((n,i)=>n!==snapshot.artifacts[i]))update({artifacts},false);
                  pendingHistoryTransaction = null;`)
  change('const persistSnapshot = () => {','const persistSnapshot = () => {\nif(!workbenchGrid.save())return false;')
  change('persist() { finalizeHistoryTransaction(); persistSnapshot(); if(collaborationGesture){collaborationGesture=false;sherlockBoardsAdapter?.finishGesture(sessionId);} },','persist() { if(implicitGenerationResizes.size){const canWrite=collaborationCanWrite();const artifacts=snapshot.artifacts.map(n=>implicitGenerationResizes.has(n.id)&&n.preserveGenerationSize===false?{...n,preserveGenerationSize:true}:n);implicitGenerationResizes.clear();if(canWrite)update({artifacts},false);}finalizeHistoryTransaction(); const durable=persistSnapshot(); if(collaborationGesture){collaborationGesture=false;sherlockBoardsAdapter?.finishGesture(sessionId);} return durable; },')
  // Planning participates in local selection and geometry, but is not a
  // document node. Persist only selection belonging to durable components.
  change('setSelection(selection) { update({ selection: parseResearchCanvasSelection(JSON.stringify(selection), snapshot.files, snapshot.artifacts) }, true); },','setSelection(selection) { update({ selection: parseResearchCanvasSelection(JSON.stringify(selection), snapshot.files, [...snapshot.artifacts,...workbenchGrid.planningNodes()]) }, true); },')
  change('saveResearchCanvasSelection(storage, sessionId, snapshot.selection);','saveResearchCanvasSelection(storage, sessionId, parseResearchCanvasSelection(JSON.stringify(snapshot.selection),snapshot.files,snapshot.artifacts));')
  change('setCanvasSize(canvasSize) {','setCanvasSize(canvasSize) {\nif(workbenchGrid.enabled()){const size={...snapshot.canvasSize,...canvasSize};workbenchGrid.enable(Math.max(240,Math.min(size.width||800,size.availableWidth||Infinity)));}')
  change("if(document.documentElement.hasAttribute('data-odyssey-window-resizing')){","if(!root.hasAttribute('data-ework-grid')&&document.documentElement.hasAttribute('data-odyssey-window-resizing')){")
  // The native input region is in screen pixels. Delegate grid geometry to
  // its logical-pixel measurement so the two paths cannot overwrite it.
  change('const availableWidth=researchCanvasUnobscuredWidth(bounds,panelBounds);','')
  change('const current=workspace.getSnapshot(),previous=current.canvasSize;','if(root.__eworkMeasureViewport)root.__eworkMeasureViewport(bounds,panelBounds);\nelse {\nconst availableWidth=researchCanvasUnobscuredWidth(bounds,panelBounds);\nconst current=workspace.getSnapshot(),previous=current.canvasSize;')
  change('publishRegion(bounds,document.visibilityState!=="hidden");','}\npublishRegion(bounds,document.visibilityState!=="hidden");')
  change('window.addEventListener("resize", scheduleSync);','root.addEventListener("ework:board-display-zoom",scheduleSync);\nwindow.addEventListener("resize", scheduleSync);')
  change('window.removeEventListener("resize", scheduleSync);','root.removeEventListener("ework:board-display-zoom",scheduleSync);\nwindow.removeEventListener("resize", scheduleSync);')
  change('snapshot = researchWorkspaceSnapshot(researchWorkbenchGrowthViewport(snapshot,next));','snapshot = researchWorkspaceSnapshot(workbenchGrid.reconcile(workbenchGrid.enabled()?next:researchWorkbenchGrowthViewport(snapshot,next)));')
  const methods=`
    getWorkbenchResponsiveArrange:()=>responsiveArrange===true,
    initializeWorkbenchResponsiveArrange(){
      if(responsiveArrange!==undefined||snapshot.files.length||snapshot.artifacts.length||sherlockShared(sessionId))return false;
      return this.setWorkbenchResponsiveArrange(true);
    },
    setWorkbenchResponsiveArrange(value){
      if(!collaborationCanWrite())return false;
      if(value===responsiveArrange)return true;
      try{if(storage?.setItem(responsiveArrangeKey,value?'auto':'manual')===false)return false}catch{return false}
      responsiveArrange=value;listeners.forEach(listener=>listener());return true;
    },
    saveWorkbenchResponsiveLayout:()=>workbenchGrid.save(),
    pendingWorkbenchArrange:()=>collaborationCanWrite()?workbenchAutoArrange.ready(snapshot):[],
    consumeWorkbenchArrange:ids=>workbenchAutoArrange.consume(ids),
    getWorkbenchTableColumns:(id,index,labels)=>workbenchTableColumns.get(id,index,labels),
    setWorkbenchTableColumns:(id,index,labels,state)=>workbenchTableColumns.set(id,index,labels,state),
    getWorkbenchStyle:()=>workbenchStyleState.get(),
    setWorkbenchStyle,
    getWorkbenchCells:()=>workbenchGrid.get(),
    getWorkbenchVisibleCells:()=>workbenchGrid.visible(),
    setWorkbenchContentHeight(id,value){if(workbenchGrid.contentHeight(id,value)){update({},false);return true}return false},
    getWorkbenchDocument:()=>workbenchGrid.document(snapshot),
    initializeWorkbenchDocument(canvas){
      if(!collaborationCanWrite()||sherlockShared(sessionId))return false;
      workbenchGrid.enable(1000);
      workbenchGrid.receiveCanonical([...canvas.files,...canvas.artifacts]);
      return persistSnapshot();
    },
    getWorkbenchPlanningNodes:()=>workbenchGrid.planningNodes(),
    reserveWorkbenchPlanning(intent,position){if(workbenchGrid.reservePlanning(intent,snapshot,position)){update({},false);return true}return false},
    releaseWorkbenchPlanning(id){if(workbenchGrid.releasePlanning(id)){update({},false);return true}return false},
    setWorkbenchWidth(width){if(workbenchGrid.enable(width)){initialWorkbenchFit=false;autoFitManaged=false;autoFitActive=false;update({},false);}},
    applyWorkbenchCells(cells,persist=false,layoutToken,automatic=false){if(!collaborationCanWrite())return false;if(automatic&&responsiveArrange){workbenchGrid.set(cells,{automatic:true});update({},false);return !persist||workbenchGrid.save();}if(responsiveArrange&&!automatic)cells=cells.map(({responsiveOrder,...cell})=>cell);if(pendingHistoryTransaction===null)pendingHistoryTransaction=historyState();workbenchGrid.set(cells,{automatic});const nodes=createResearchGrid().project([...snapshot.files,...snapshot.artifacts],cells,Math.max(240,Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity)));this.applyPointerGeometry(nodes);if(persist)this.persist();return true;},
  `
  change('subscribeCanvasAction:listener=>{',methods+'subscribeCanvasAction:listener=>{')
  change('const artifacts = boundedResearchCanvasArtifactNodes([...snapshot.artifacts, ...nodes]);',`for(const node of workbenchGrid.planningNodes())if((plan.createdAt??0)>=node.startedAt-1000)workbenchGrid.releasePlanning(node.id);
                    const artifacts = boundedResearchCanvasArtifactNodes([...snapshot.artifacts, ...nodes]);`)
  change("if (artifacts.length !== snapshot.artifacts.length + nodes.length) throw new Error('画布容量不足，工作台尚未加入');","if (artifacts.length !== snapshot.artifacts.length + nodes.length) throw new Error('画布容量不足，工作台尚未加入');\n                    if(collaborationCanWrite()){const requestedStyle=['enterprise','light','dark','openterminal'].includes(plan.requestedStyle)?plan.requestedStyle:workbenchRequestedStyle(plan.originalRequest);if(!existing.size&&!workbenchStyleState.hasPreference()&&requestedStyle)workbenchStyleState.set(requestedStyle,{scope:'board'});workbenchAutoArrange.register(plan,existing);}")
  change('files: value.files,','files: value.files,\nworkbenchCells:workbenchGrid.get(),')
  change('const restoreHistory = (entry) => {','const restoreHistory = (entry) => {\nif(entry.workbenchCells)workbenchGrid.set(entry.workbenchCells);')
  // Remote content joins the local grid by ID. Legacy geometry is only used to
  // order an ungrouped board on first open.
  change('if(collaborationAppliedRevision!==metadata.revision){', 'workbenchGrid.receiveShared([...files,...artifacts]);\nif(collaborationAppliedRevision!==metadata.revision){')
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
  change('function researchCanvasMeasureForArrange(root,nodes) {','function researchCanvasMeasureForArrange(root,nodes) {\nif(root?.hasAttribute("data-ework-grid"))return measureWorkbenchContents(root,nodes);')
  change('function researchCanvasArrangeWithMotion(root, workspace, measured) {','function researchCanvasArrangeWithMotion(root, workspace, measured, arrangeMode="standard") {\nif(root?.hasAttribute("data-ework-grid"))return arrangeWorkbenchContents(root,workspace,measured,arrangeMode==="standard"&&workspace.getWorkbenchResponsiveArrange?.()?"auto":arrangeMode);')
  change('organizeCanvas(measured = new Map()) {',`organizeCanvas(measured = new Map(), arrangeMode="standard") {
    if(workbenchGrid.enabled()){
      workbenchGrid.clearContentOverrides();
      if(!collaborationCanWrite())return false;
      const grid=createResearchGrid(),nodes=[...snapshot.files,...snapshot.artifacts,...workbenchGrid.planningNodes()].map(n=>({...n,preferred:n.kind==='planning-card'?{width:320,height:220}:n.kind==='generated-container'&&!n.containerSpec?{width:656,height:320}:measured.get(n.id)||researchOptimalDimensions({...n,width:0,height:0}),gridCompact:researchMarketDimensions(n,true)?.height<=180}));
      if(!nodes.length)return false;
      return this.applyWorkbenchCells(grid.arrange(nodes,workbenchGrid.visible(),Math.max(240,Math.min(snapshot.canvasSize.width||800,snapshot.canvasSize.availableWidth||Infinity)),snapshot.canvasSize.height||0,arrangeMode,{authoredBoard:measured.__homeGuideBoardLayout===true}),!measured.__workbenchDeferred,undefined,true);
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
  // Preserve the existing source inspection and generation bridge while the
  // workbench creates a real inline node before opening its demand editor.
  const hook=`
    useWorkbenchGrid({rootRef,workspace,sessionId,snapshot,toolRef:canvasToolRef,selectTool:selectCanvasTool,readOnly:sharedReadOnly});
    useWorkbenchStyle({rootRef,workspace});
    const workbenchAsk=node=>{workspace.updateSelection([node.id],'replace');actions?.setResearchRightTab?.('conversation');window.requestAnimationFrame(()=>document.querySelector('.sRp_composer textarea')?.focus());};
    const workbenchSelectedDrafts=react.useRef(new Map());
    const workbenchSelectedState=node=>{
      let state=workbenchSelectedDrafts.current.get(node.id);
      if(node.generationSources?.length&&node.generationSources.every(s=>s.text||s.path)){
        state={nodeId:node.id,ids:Object.freeze([...node.sourceNodeIds]),files:[],artifacts:[],selectionSources:structuredClone(node.generationSources)};
        workbenchSelectedDrafts.current.set(node.id,state);
        return state;
      }
      if(!state||state.ids.length!==node.sourceNodeIds.length||state.ids.some((id,index)=>id!==node.sourceNodeIds[index])){
        const current=workspace.getSnapshot(),ids=Object.freeze([...node.sourceNodeIds]);
        state={nodeId:node.id,ids,files:current.files.filter(n=>ids.includes(n.id)).map(n=>Object.freeze(structuredClone(n))),artifacts:current.artifacts.filter(n=>ids.includes(n.id)).map(n=>Object.freeze(structuredClone(n)))};
        workbenchSelectedDrafts.current.set(node.id,state);
      }
      return state;
    };
    const workbenchFocusSelected=(node,editing=false)=>{
      if(createSelection?.nodeId!==node.id){createAttempt.current=null;setCreatePreparing(false);}
      setCreateSelection({...workbenchSelectedState(node),editing});setCreatePrompt(node.containerPrompt||'');setCreateError(null);
      window.requestAnimationFrame(()=>{const card=rootRef.current?.querySelector('[data-research-node-id="'+CSS.escape(node.id)+'"]');card?.scrollIntoView({block:'nearest',inline:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});card?.querySelector('[data-workbench-selected-create-draft] textarea')?.focus({preventScroll:true});});
    };
    const workbenchSelectedPrompt=(node,prompt,persist=false)=>{
      if(sharedReadOnly)return;
      if(createSelection?.nodeId===node.id&&createSelection.editing){setCreatePrompt(prompt);setCreateError(null);return;}
      if(createSelection?.nodeId!==node.id){createAttempt.current=null;setCreatePreparing(false);}
      if(workspace.updateSelectedCreateDraft(node.id,prompt)){setCreateSelection(workbenchSelectedState(node));setCreatePrompt(prompt);setCreateError(null);if(persist)workspace.persist();}
    };
    const workbenchSelectedSubmit=(node,prompt)=>{
      if(sharedReadOnly)return;
      const state=workbenchSelectedState(node);if(node.generationStatus!=='draft'&&!workspace.editSelectedCreateDraft(node.id))return;setCreateSelection(state);setCreatePrompt(prompt);void startSelectedCreate(state,prompt);
    };
    const workbenchEditSelected=node=>{
      if(sharedReadOnly)return;
      workbenchSelectedDrafts.current.delete(node.id);
      workbenchFocusSelected(node,node.generationStatus!=='draft');
    };
    const workbenchCancelSelectedEdit=()=>{createAttempt.current=null;closeSelectedCreate();rootRef.current?.focus({preventScroll:true});};
    react.useEffect(()=>{
      if(createSelection?.nodeId&&!snapshot.artifacts.some(n=>n.id===createSelection.nodeId)){workbenchSelectedDrafts.current.delete(createSelection.nodeId);closeSelectedCreate();}
    },[snapshot.artifacts,createSelection,closeSelectedCreate]);
    const workbenchDerived=(kind,detail,baselineId)=>{
      if(kind!=='create'){void startSelectionGeneration(kind,detail);return;}
      if(sharedReadOnly||selectionGeneration?.disabled)return;
      const ids=baselineId?[baselineId]:[...workspace.getSnapshot().selection.selectedNodeIds];
      const draft=workspace.beginSelectedCreateDraft(ids);if(draft)workbenchFocusSelected(draft);
    };
    const workbenchLegacy=(node,event,action)=>{if(action){frameAction(node,action);return;}const r=rootRef.current.getBoundingClientRect();setContextMenu({nodeId:node.id,left:event.clientX-r.left,top:event.clientY-r.top});};
  `
  change('const emptyViewport = canvasNodes.length > 0',hook+'\nconst emptyViewport = canvasNodes.length > 0')
  change('(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: "rScV5Q_globalToolbar",','(0, react_jsx_runtime.jsxs)(WorkbenchToolbar, {rootRef,sessionId,workspace,availableWidth:snapshot.canvasSize.availableWidth,\n\t\t\t\t\tclassName: "rScV5Q_globalToolbar",')
  {
    const marker="'data-research-global-arrange':''",at=source.indexOf(marker),start=source.lastIndexOf("(0,react_jsx_runtime.jsx)('button'",at),suffix="className:'odyssey-tool-icon'})})",finish=source.indexOf(suffix,at)
    if(at<0||start<0||finish<0)throw Error('Workbench arrange button anchor missing')
    change(source.slice(start,finish+suffix.length),"(0,react_jsx_runtime.jsx)(WorkbenchArrangeTool,{rootRef,workspace,nodes:canvasNodes,sessionId,disabled:sharedReadOnly||canvasNodes.length===0,onArrange:(message,state='success')=>setClipboardFeedback({state,kind:'arrange',message})})")
  }
  change("const button = root.querySelector('[data-research-global-'+attribute+']')","const button = root.ownerDocument.querySelector('[data-ework-toolbar-owner=\"'+CSS.escape(sessionId)+'\"] [data-research-global-'+attribute+']')")
  change('const canvasOwnsFocus = () => document.activeElement === root || root.contains(document.activeElement);','const canvasOwnsFocus = () => document.activeElement === root || root.contains(document.activeElement) || document.activeElement?.closest?.("[data-ework-toolbar-owner]")?.getAttribute("data-ework-toolbar-owner")===sessionId;')
  change('const historyShortcut = event.metaKey && !event.altKey && (event.code === "KeyZ" || event.code === "KeyY");','const historyShortcut = (event.metaKey || event.ctrlKey) && !event.altKey && !event.isComposing && !event.defaultPrevented && (event.code === "KeyZ" || event.code === "KeyY");')
  change('historyShortcut && canvasOwnsFocus() && !isInteractiveTarget(event.target)','historyShortcut && canvasOwnsFocus() && !(root.hasAttribute("data-ework-grid") ? event.target?.closest?.("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]") : isInteractiveTarget(event.target))')
  change('clipboardFeedback === null ? null : (0, react_jsx_runtime.jsx)("div", {','clipboardFeedback === null ? null : (0, react_jsx_runtime.jsx)(WorkbenchToolbar, {rootRef,sessionId,availableWidth:snapshot.canvasSize.availableWidth,bottomOffset:86,')
  change("children: clipboardFeedback.kind==='arrange'?","children: clipboardFeedback.kind==='arrange'&&clipboardFeedback.state==='success'?")
  change('function ResearchCanvasActionReceipt({workspace}) {','function ResearchCanvasActionReceipt({workspace,rootRef,sessionId,availableWidth}) {')
  change("return react_jsx_runtime.jsxs('div',{'data-canvas-action-receipt':'',","return react_jsx_runtime.jsxs(WorkbenchToolbar,{rootRef,sessionId,availableWidth,bottomOffset:86,'data-workbench-notice':'','data-canvas-action-receipt':'',")
  change('(0,react_jsx_runtime.jsx)(ResearchCanvasActionReceipt,{workspace})','(0,react_jsx_runtime.jsx)(ResearchCanvasActionReceipt,{workspace,rootRef,sessionId,availableWidth:snapshot.canvasSize.availableWidth})')
  change('children: [(0,react_jsx_runtime.jsx)(ComponentDataSettings,{sessionId,canvasRoot:rootRef}),','children: [(0,react_jsx_runtime.jsx)(WorkbenchChromeLayer,{rootRef,workspace,sessionId,snapshot,readOnly:sharedReadOnly,onAsk:workbenchAsk,onDerived:workbenchDerived,onLegacy:workbenchLegacy,onEditSelected:workbenchEditSelected}),(0,react_jsx_runtime.jsx)(ComponentDataSettings,{sessionId,canvasRoot:rootRef}),')
  // Keep the original recording capsule and lifecycle inside the floating toolbar.
  // Only a valid final recognition reaches onCommand and appends a grid component.
  change('onCommand: async (prompt) => {\n\t\t\t\t\t\t\tconst node = workspace.createContainerDraft();','onCommand: async (prompt) => {\n\t\t\t\t\t\t\tconst node = workspace.createContainerDraft(null,"voice");\nrevealWorkbenchNode(rootRef.current,workspace,node?.id);')
  change("workspace.createContainerDraft({x:((current.canvasSize.availableWidth||current.canvasSize.width||rootRef.current?.getBoundingClientRect().width||800)/2-vp.x)/vp.scale,y:((current.canvasSize.height||rootRef.current?.getBoundingClientRect().height||600)/2-vp.y)/vp.scale,width:485,height:400,sizeMode:'manual'},'link');", "const node=workspace.createContainerDraft({x:((current.canvasSize.availableWidth||current.canvasSize.width||rootRef.current?.getBoundingClientRect().width||800)/2-vp.x)/vp.scale,y:((current.canvasSize.height||rootRef.current?.getBoundingClientRect().height||600)/2-vp.y)/vp.scale,width:485,height:400,sizeMode:'manual'},'link');revealWorkbenchNode(rootRef.current,workspace,node?.id);")
  change('...(draftKind === "link" ? {title:"添加链接"} : {}),','...(draftKind === "link" ? {title:"添加链接"} : draftKind === "voice" ? {title:"语音组件"} : {}),')
  source=patchWorkbenchSelectedCreate(source,change)
  const changeAll=(from,to)=>{const count=source.split(from).length-1;if(!count)throw Error('Workbench repeated anchor missing: '+from);changes.push([from,to,count]);source=source.replaceAll(from,to)}
  installResearchPreviewMode(change,changeAll,()=>source)
  const definitions='const researchPreviewWorkspaces=new Map();const researchPreviewArrangeToken=Symbol("research-preview-arrange"),researchPreviewDataRefreshToken=Symbol("research-preview-data-refresh");\n'+createResearchPreviewModeState.toString()+'\n'+useResearchPreviewSession.toString()+'\n'+'const workbenchRefreshCss='+JSON.stringify(workbenchRefreshCss)+';\n'+[financialRecordsActionPayload,financialRecordsCsv,codeTemplatePayload,workbenchText,useWorkbenchLocale,createResearchGrid,createWorkbenchGridState,workbenchScrollExtent,createWorkbenchAutoArrangeState,installWorkbenchAutoArrange,serializeWorkbenchContent,installWorkbenchExport,isPassiveWorkbenchSvg,workbenchImageExportRequest,installWorkbenchRefresh,installWorkbenchChartMotion,installWorkbenchTableColumns,createWorkbenchTableColumnState,isWorkbenchScrollbarMessage,installWorkbenchScrollbars,workbenchSelectedCreateCells,WorkbenchSelectedCreateContext,WorkbenchSelectedCreateDraft,workbenchReadingCandidate,workbenchReadingOutline,WorkbenchReadingSections,componentWheelPan,...Object.values(ui),...Object.values(workbenchStyle)].map(fn=>fn.toString()).join('\n')
  source=source.replace('function createResearchWorkspaceSession(storage, sessionId) {',begin+'\nconst researchGridNodeIds=new Set();\nconst WORKBENCH_ENGLISH='+JSON.stringify(WORKBENCH_ENGLISH)+';\n'+definitions+`\nif(typeof document!=='undefined'){let style=document.getElementById('ework-grid-workbench-style');if(!style){style=document.createElement('style');style.id='ework-grid-workbench-style';document.head.prepend(style);}style.textContent=${JSON.stringify(css)}}\n`+end+'\nfunction createResearchWorkspaceSession(storage, sessionId) {')
  change('d: "M3 3.5h10v9H3z"','d: "M9.5 2.25h-6a1.25 1.25 0 0 0-1.25 1.25v9a1.25 1.25 0 0 0 1.25 1.25H7M13.75 6.5v-3a1.25 1.25 0 0 0-1.25-1.25h-3"')
  change('d: "M8 5.5v5M5.5 8h5"','d: "M11.25 8v6.5M8 11.25h6.5"')
  for(const {before,after,name} of localizedWorkbenchFunctions(source)){
    const localized=name==='ResearchCanvasFrameMenu'?after.replace('workbenchText("从画布移除")','workbenchText(node.noteDocument?"从笔记移除":"从画布移除")'):name==='ResearchAssistantCanvasAction'&&before.includes('/* ework:note-assistant-destination:v1 */')?after.replaceAll('(notes?"添加到笔记":workbenchText("添加到画布"))','workbenchText(notes?"添加到笔记":"添加到画布")'):after
    change(before,localized)
  }
  return patchComponentPptxMode(source+'\n'+meta+serializeWorkbenchRestore(changes)+' */')
}
