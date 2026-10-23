import { readFileSync } from 'node:fs'
const start='/* SHERLOCK_CANVAS_ACTIONS_START */',end='/* SHERLOCK_CANVAS_ACTIONS_END */'
function replace(source,anchor,value){if(!source.includes(anchor))throw Error('Canvas actions anchor missing: '+anchor.slice(0,80));return source.replace(anchor,value)}
function canvasWorkspaceActions(adapter) {
  return createCanvasActionController({
    ...adapter,
    describe(node,collection) {
      const fields={title:{type:'string',maxLength:256,description:'画板内显示标题，不重命名原文件。'}}
      if(collection==='artifacts' && researchCanvasArtifactContentEditable(node))fields.excerpt={type:'string',maxLength:120000,description:'组件正文。'}
      if(collection==='artifacts' && (node.containerSpec || node.kind==='generated-container' && ['failed','cancelled','interrupted'].includes(node.generationStatus)) && !RESEARCH_ACTIVE_GENERATION_STATUSES.has(node.generationStatus))fields.containerSpec={type:'object',description:'当前组件的完整内容对象；先按 ID 查看 content，保留原结构，修改所需字段。提交后由该组件解析器验证。'}
      fields.width={type:'number',minimum:80,maximum:RESEARCH_CANVAS_MAX_NODE_SIZE,description:'宽度；组件比例约束由原生布局校验。'};
      fields.height={type:'number',minimum:80,maximum:RESEARCH_CANVAS_MAX_NODE_SIZE,description:'高度；固定比例组件须保持原比例。'};
      return fields
    },
    validate(node,collection,changes) {
      if(Object.hasOwn(changes,'title')) {
        if(collection==='files'){node.displayName=normalizeResearchCanvasDisplayName(changes.title,node.name);delete node.title}
        else node.title=normalizeResearchCanvasTitle(changes.title)
      }
      if(Object.hasOwn(changes,'containerSpec')) {
        const spec=parseResearchContainerSpec(changes.containerSpec)
        if(!spec)throw Error('组件内容不符合其结构约定，请保留原有结构重新修改。')
        const previousVersion=node.containerSpec?.html?researchInteractionVersion(node.containerSpec.html):undefined
        node.containerSpec=spec
        try{node.excerpt=researchContainerPlainText(spec)||JSON.stringify(spec)}catch{node.excerpt=JSON.stringify(spec)}
        node.excerpt=node.excerpt.slice(0,RESEARCH_GENERATION_MAX_OUTPUT)
        node.generationStatus='completed';delete node.generationError;delete node.refreshError
        node.lastSuccessfulAt=Date.now()
        // Data refresh within a fixed template preserves view controls; template edits reset them.
        if(node.config?.interactionState&&(!previousVersion||previousVersion!==researchInteractionVersion(spec.html??''))){node.config={...node.config};delete node.config.interactionState}
      }
      if(['x','y','width','height'].some(k=>Object.hasOwn(changes,k))){node.sizeMode='manual';const geometry=normalizeResearchCanvasNodeGeometry(node);for(const key of ['width','height'])if(Object.hasOwn(changes,key)&&Math.abs(geometry[key]-node[key])>.01)throw Error('尺寸不符合组件原生比例或最小尺寸，请保留原比例调整。');}
      return node
    },
    arrange:state=>researchCanvasOrganizedLayout(state.files,state.artifacts,state.canvasSize,new Map())??{}
  })
}
function ResearchCanvasActionReceipt({workspace}) {
  const receipt=react.useSyncExternalStore(workspace.subscribeCanvasAction,workspace.getCanvasActionReceipt,workspace.getCanvasActionReceipt);
  const [hidden,setHidden]=react.useState(null),[error,setError]=react.useState(''),[busy,setBusy]=react.useState(false);
  react.useEffect(()=>{if(!receipt)return;setError('');const timer=setTimeout(()=>setHidden(receipt),6000);return()=>clearTimeout(timer);},[receipt]);
  if(!receipt||hidden===receipt)return null;
  const label=error||(receipt.status==='pending'?'画布已更新，等待同步':receipt.presentation?'已更新当前看板样式':receipt.canUndo?'已更新 '+receipt.changedIds.length+' 个组件':'已撤销画布操作');
  return react_jsx_runtime.jsxs('div',{'data-canvas-action-receipt':'','data-state':error?'error':'success',role:'status','aria-live':'polite',onPointerDown:e=>e.stopPropagation(),onClick:e=>e.stopPropagation(),children:[
    react_jsx_runtime.jsx('span',{children:label}),
    receipt.canUndo?react_jsx_runtime.jsx('button',{type:'button','data-canvas-action-undo':'',disabled:busy,children:busy?'撤销中…':'撤销',onClick:async()=>{setBusy(true);try{await workspace.canvasAction('undo',{requestId:crypto.randomUUID(),revision:receipt.revision,actionId:receipt.actionId});}catch(e){setError(e.message);}finally{setBusy(false);}}}):null,
    react_jsx_runtime.jsx('button',{type:'button','data-canvas-action-dismiss':'','aria-label':'关闭提示',children:'×',onClick:()=>setHidden(receipt)})
  ]});
}
export function patchCanvasActionsClient(source) {
  // Explicit references also own the tool selection. A stale canvas selection
  // must not add another component to the current request's bound IDs.
  source = source.replace('...attempt.artifacts.map(n=>n.id),...currentSelection.selectedNodeIds', '...attempt.artifacts.map(n=>n.id),...(attempt.files.length || attempt.artifacts.length ? [] : currentSelection.selectedNodeIds)')
  const definitions=start+'\n'+readFileSync(new URL('../../packages/dsh-research-task-runtime/canvas-actions.js',import.meta.url),'utf8').replace(/^export /gm,'')+'\n'+canvasWorkspaceActions.toString()+'\n'+ResearchCanvasActionReceipt.toString()+'\n'+end+'\n'
  if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);return (source.slice(0,a)+definitions+source.slice(b+end.length+1)).replace("if(method!=='inspect'&&result.status!=='unchanged')","if(method!=='inspect'&&result.status!=='unchanged'&&options?.silent!==true)").replace("{isCancelled:request.isCancelled}","{isCancelled:request.isCancelled,silent:request.source==='component-data-refresh'}")}
  source=replace(source,'function createResearchWorkspaceSession(storage, sessionId) {',definitions+'function createResearchWorkspaceSession(storage, sessionId) {')
  source=replace(source,'\t\t\treturn {\n\t\t\t\tsubscribe(listener) { listeners.add(listener);',`\t\t\tlet actionReceipt = null; const actionListeners = new Set();
      const canvasActions = canvasWorkspaceActions({
        snapshot:()=>snapshot,
        canWrite:()=>collaborationCanWrite(),
        ready:async()=>{if(pendingHistoryTransaction!==null||collaborationGesture)throw Error('请先完成当前拖动或缩放。');if(sherlockShared(sessionId))await sherlockBoardsAdapter.flushCanvas(sessionId);},
        flush:async()=>{if(sherlockShared(sessionId))await sherlockBoardsAdapter.flushCanvas(sessionId);},
        commit:(next,before)=>{
          const files=parseResearchCanvasFileNodes(JSON.stringify(next.files));
          const artifacts=boundedResearchCanvasArtifactNodes(next.artifacts);
          if(files.length!==next.files.length||artifacts.length!==next.artifacts.length)throw Error('组件格式或容量超出画板限制。');
          // Reject parser truncation instead of claiming a silently shortened edit succeeded.
          for(const node of artifacts){const requested=next.artifacts.find(n=>n.id===node.id);for(const key of ['excerpt','containerSpec'])if(JSON.stringify(node[key])!==JSON.stringify(requested[key]))throw Error('组件内容超过限制或结构不兼容。');}
          const patch={files,artifacts,selection:next.selection};
          persistClipboardBatch({...snapshot,...patch});
          cancelClipboardImports();
          if(commitUpdate(patch,false)===false)throw Error('画板修改未应用。');
          releaseRemovedArtifacts(before.artifacts,artifacts);
          const live=new Set(files.map(n=>n.id));
          updateOrphanRevocations(before.files.filter(n=>!live.has(n.id)&&n.authorizationId).map(n=>n.id));
          finalizeUnreachablePreviewNodes();
        },
        undo:async()=>sherlockShared(sessionId)?await sherlockBoardsAdapter.undo(sessionId):undo()
      });
\t\t\treturn {
        subscribeCanvasAction:listener=>{actionListeners.add(listener);return()=>actionListeners.delete(listener);},
        getCanvasActionReceipt:()=>actionReceipt,
        canvasAction:async(method,args,options)=>{if(!['inspect','apply','undo'].includes(method))throw Error('不支持的画布操作。');const result=await canvasActions[method](args,options);if(method!=='inspect'&&result.status!=='unchanged'&&options?.silent!==true){actionReceipt=result;actionListeners.forEach(listener=>listener());}return result;},
\t\t\t\tsubscribe(listener) { listeners.add(listener);`)
  source=replace(source,'const composerBlocks = new ComposerBlockRegistry();',`const composerBlocks = new ComposerBlockRegistry();
      ctx.effect(()=>{
        if(window.top!==window)return;
        return window.dshDesktop?.researchCanvasActions?.subscribe(async request=>{
          const workspace=researchWorkspaces.sessions.get(request.sessionId);
          if(!workspace)throw Error('画板未打开，请从画板右侧重新发送指令。');
          const result=await workspace.canvasAction(request.method,request.args,{isCancelled:request.isCancelled,silent:request.source==='component-data-refresh'});
          if(request.method==='inspect')result.selectedIds=request.selectedIds.filter(id=>workspace.getSnapshot().files.some(n=>n.id===id)||workspace.getSnapshot().artifacts.some(n=>n.id===id));
          return result;
        });
      },'Sherlock canvas actions');`)
  source=replace(source,'const autoContext = researchActive &&',`if(researchActive){
        try{await window.dshDesktop?.researchCanvasActions?.bind({sessionId:session.sessionId,selectedIds:[...new Set([...attempt.files.map(n=>n.id),...attempt.artifacts.map(n=>n.id),...(attempt.files.length || attempt.artifacts.length ? [] : currentSelection.selectedNodeIds)])]});}
        catch(error){shell?.notify('error',error.message);return;}
      }
      const autoContext = researchActive &&`)
  source=replace(source,'children: [(0,react_jsx_runtime.jsx)(ResearchCanvasDotGrid,','children: [(0,react_jsx_runtime.jsx)(ResearchCanvasActionReceipt,{workspace}),(0,react_jsx_runtime.jsx)(ResearchCanvasDotGrid,')
  return source
}
