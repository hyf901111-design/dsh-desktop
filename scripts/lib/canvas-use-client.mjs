import {agentCursorMarkup} from '../../packages/dsh-research-task-runtime/agent-cursor.js'
import {createCanvasUseSurface,installCanvasUseSurface} from '../../packages/dsh-research-task-runtime/canvas-use-surface.js'
import {anchorConversationDisclosures} from '../../packages/dsh-research-task-runtime/conversation-disclosure.js'

function installCanvasUseClient(sessionId,workspace,root,cursorMarkup) {
  let stopped=false,busy=false,revision='',fingerprint='',last='',cursor,timer,activeTask,position,animation,anchor,frame,wakeTimer,cancelMove,userPointer=false
  const receipts=new Map(),surfaces=new WeakMap()
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(36)}
  const check=(write=false)=>{
    if(stopped||!root.isConnected||document.hidden||!root.getBoundingClientRect().width)throw Error('画板暂不可见，等待恢复后重新观察。')
    if(document.documentElement.hasAttribute('data-odyssey-window-resizing'))throw Error('窗口正在调整尺寸，稍后重新观察。')
    if(write&&sherlockShared(sessionId)){const v=sherlockBoardsAdapter?.getView(sessionId);if(v?.connection!=='online')throw Error('画板连接暂不可用。');if(!v?.permissions.edit)throw Error('[CANVAS_FATAL] 画板编辑权限已撤销。')}
    if(userPointer||root.hasAttribute('data-research-operation')||root.querySelector('[data-research-marquee]'))throw Error('用户正在操作画布，等待操作结束后重新观察。')
  }
  const card=id=>[...root.querySelectorAll('[data-research-node-id]')].find(el=>el.getAttribute('data-research-node-id')===id)
  const rpc=(frame,args)=>new Promise((resolve,reject)=>{
    const id=crypto.randomUUID(),win=frame.contentWindow
    const done=()=>{clearTimeout(timeout);window.removeEventListener('message',receive)}
    const receive=e=>{if(e.source!==win||e.data?.type!=='sherlock-canvas-use-result'||e.data.id!==id)return;done();e.data.error?reject(Error(e.data.error)):resolve(e.data.result)}
    const timeout=setTimeout(()=>{done();reject(Error('组件尚未响应观察，请重新打开组件。'))},1800)
    window.addEventListener('message',receive);win?.postMessage({type:'sherlock-canvas-use-request',id,args},'*')
  })
  const surface=async(node,args)=>{
    const el=card(node.id);if(!el)throw Error('组件未显示，请先 focus 到此组件。')
    if(node.kind==='web'||node.url&&el.querySelector('[data-research-native-web],iframe'))return window.dshDesktop.researchLinkFrame.canvasUse({sessionId,nodeId:node.id,args})
    const frame=el.querySelector('iframe');if(frame)return rpc(frame,args)
    const body=el.querySelector('.rScV5Q_previewBody')??el
    if(!surfaces.has(body))surfaces.set(body,createCanvasUseSurface(body))
    return surfaces.get(body)(args)
  }
  const observe=async(args={})=>{
    check();const state=workspace.getSnapshot(),basic=await workspace.canvasAction('inspect',{})
    const nodes=[...state.files,...state.artifacts]
    const viewportRect=root.getBoundingClientRect()
    const details=await Promise.all(nodes.filter(n=>!args.nodeIds?.length||args.nodeIds.includes(n.id)).map(async n=>{
      const element=card(n.id),rect=element?.getBoundingClientRect()
      if(!rect||rect.right<viewportRect.left||rect.left>viewportRect.right||rect.bottom<viewportRect.top||rect.top>viewportRect.bottom)return {id:n.id,available:false}
      try{return {id:n.id,...await surface(n,{op:'observe',images:args.screenshot===true})}}catch(error){return {id:n.id,error:error.message}}
    }))
    check();const r=root.getBoundingClientRect()
    const nodeFingerprints=Object.fromEntries(details.map(d=>[d.id,hash(JSON.stringify([d.revision,d.error,d.available]))]));
    fingerprint=hash(JSON.stringify([args.nodeIds?.length?null:basic.revision,nodeFingerprints]))
    const key=JSON.stringify([basic.revision,state.viewport,state.selection])
    if(key!==last){revision=crypto.randomUUID();last=key}
    const screenshot=args.screenshot?await window.dshDesktop?.researchLinkFrame?.captureCanvas({x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth-Math.max(0,r.x)),height:Math.min(r.height,innerHeight-Math.max(0,r.y))}):undefined
    return {nodes:basic.nodes?.map(({id,title,kind,bounds})=>({id,title,kind,bounds})),selectedIds:basic.selectedIds,revision,canvasRevision:basic.revision,fingerprint,nodeFingerprints,observedNodeIds:args.nodeIds??[],viewport:state.viewport,size:{width:r.width,height:r.height},surfaces:details.filter(d=>!args.nodeIds?.length||args.nodeIds.includes(d.id)),screenshot,scope:'entire-canvas',blockedReason:!basic.writable&&(!sherlockShared(sessionId)||sherlockBoardsAdapter.getView(sessionId)?.connection==='online')?'permission':undefined,writable:basic.writable&&(!sherlockShared(sessionId)||sherlockBoardsAdapter.getView(sessionId)?.connection==='online')}
  }
  const ensureCursor=()=>{
    if(cursor?.isConnected)return
    cursor=document.createElement('div');cursor.setAttribute('data-canvas-use-cursor','');cursor.setAttribute('aria-hidden','true')
    cursor.style.cssText='position:absolute;left:0;top:0;z-index:60;pointer-events:none;will-change:transform;contain:layout style;isolation:isolate;color:#0d99ff;font:11px/16px system-ui;white-space:nowrap;'
    cursor.innerHTML=cursorMarkup()
    const name=sherlockBoardsAdapter?.getState()?.account?.user?.username
    cursor.querySelector('[data-canvas-cursor-text]').textContent=name?name+'的智能助理':'智能助理'
    root.append(cursor)
    if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)animation=cursor.querySelector('[data-canvas-pointer]').animate?.([{transform:'rotate(-5deg)'},{transform:'rotate(5deg)'},{transform:'rotate(-5deg)'}],{duration:1800,iterations:Infinity,easing:'ease-in-out'})
    position??={x:Math.min(80,root.clientWidth/2),y:64}
    cursor.style.transform='translate3d('+position.x+'px,'+position.y+'px,0)'
  }
  const removeCursor=()=>{clearTimeout(timer);cancelAnimationFrame(frame);cancelMove?.();cancelMove=null;animation?.cancel();cursor?.remove();cursor=null;anchor=null}
  const targetPoint=(node,args)=>{
    const el=card(node.id),body=el?.querySelector('[data-research-native-web],iframe,.rScV5Q_previewBody')??el
    if(!body)return null
    const a=body.getBoundingClientRect(),r=root.getBoundingClientRect();let p=args.point??{x:.5,y:.5}
    const b=args.elementBounds;if(b)p={x:b.x+p.x*b.width,y:b.y+p.y*b.height}
    return {x:Math.max(0,Math.min(r.width-20,a.left-r.left+p.x*a.width)),y:Math.max(0,Math.min(r.height-24,a.top-r.top+p.y*a.height))}
  }
  const showCursor=async(node,args)=>{
    const to=targetPoint(node,args);if(!to)return
    ensureCursor();clearTimeout(timer);anchor={node,args}
    const from={...position},distance=Math.hypot(to.x-from.x,to.y-from.y)
    const duration=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:Math.min(280,80+distance*.25)
    const curve=Math.min(32,distance*.12),start=performance.now()
    await new Promise(resolve=>{
      cancelMove=resolve
      const step=now=>{
        if(stopped||!cursor?.isConnected){resolve();return}
        const t=duration?Math.min(1,(now-start)/duration):1,u=t*t*(3-2*t),bend=Math.sin(Math.PI*u)*curve
        position={x:from.x+(to.x-from.x)*u+(distance?-(to.y-from.y)/distance*bend:0),y:from.y+(to.y-from.y)*u+(distance?(to.x-from.x)/distance*bend:0)}
        cursor.style.transform='translate3d('+position.x+'px,'+position.y+'px,0)'
        if(t<1)frame=requestAnimationFrame(step);else {cancelMove=null;resolve()}
      };step(start)
    })
    if(!activeTask)timer=setTimeout(removeCursor,1200)
  }
  const taskUpdate=()=>{
    activeTask=canvasTaskStore(sessionId).value.find(t=>['running','waiting'].includes(t.state))
    if(activeTask)ensureCursor();else removeCursor()
  }
  const unsubscribeTasks=canvasTaskStore(sessionId).subscribe(taskUpdate);taskUpdate()
  const wake=()=>{
    if(!activeTask||wakeTimer||userPointer)return
    wakeTimer=setTimeout(()=>{wakeTimer=null;if(!stopped&&activeTask)void fetch('/api/research/canvas-tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,action:'wake'})}).catch(()=>{})},60)
  }
  const pointerDown=e=>{if(e.isTrusted&&e.button===0){userPointer=true;animation?.pause();cancelAnimationFrame(frame);cancelMove?.();cancelMove=null}},pointerUp=()=>{if(userPointer){userPointer=false;animation?.play();wake()}}
  root.addEventListener('pointerdown',pointerDown,true);window.addEventListener('pointerup',pointerUp,true);window.addEventListener('pointercancel',pointerUp,true);window.addEventListener('blur',pointerUp)
  const unsubscribeWorkspace=workspace.subscribe(()=>{
    if(anchor&&cursor?.isConnected){const p=targetPoint(anchor.node,anchor.args);if(p){position=p;cursor.style.transform='translate3d('+p.x+'px,'+p.y+'px,0)'}}
    wake()
  })
  const changed=e=>{if(e.data?.type==='sherlock-canvas-use-changed'&&[...root.querySelectorAll('iframe')].some(f=>f.contentWindow===e.source))wake()}
  window.addEventListener('message',changed)
  const use=async(args,{isCancelled=()=>false}={})=>{
    if(args.op==='observe')return observe(args)
    if(args.op==='report'){canvasTaskStore(sessionId).update([args.activity]);check();if(sherlockShared(sessionId)){const v=sherlockBoardsAdapter?.getView(sessionId);await sherlockBoardsAdapter.call('activity.publish',{boardId:v.boardId,activity:args.activity})}return {ok:true}}
    const requestId=args.requestId,key=JSON.stringify(args)
    if(typeof requestId!=='string'||!requestId||requestId.length>128)throw Error('操作缺少 requestId。')
    const prior=receipts.get(requestId);if(prior){if(prior.key!==key)throw Error('requestId 已用于不同操作。');if(prior.error)throw Error(prior.error);return prior.result}
    if(busy)throw Error('画布已有操作正在执行。')
    check(true);if(isCancelled())throw Error('任务已取消。')
    if(args.revision!==revision||JSON.stringify([(await workspace.canvasAction('inspect',{})).revision,workspace.getSnapshot().viewport,workspace.getSnapshot().selection])!==last)throw Error('画布位置或内容已变化，请重新观察。')
    busy=true
    // Persist an uncertain receipt before dispatch, preventing a timeout retry
    // from accidentally clicking twice. Explicit new observation is required.
    const receipt={key,error:'操作结果尚未确认，请重新观察，不能重复发送。'};receipts.set(requestId,receipt)
    if(receipts.size>200)receipts.delete(receipts.keys().next().value)
    try {
      const state=workspace.getSnapshot(),nodes=[...state.files,...state.artifacts],node=nodes.find(n=>n.id===args.nodeId)
      let createdId
      if(args.op==='create') {
        if(![args.x,args.y,args.width,args.height].every(Number.isFinite)||Math.abs(args.x)>100000||Math.abs(args.y)>100000||args.width<320||args.width>4000||args.height<177||args.height>4000||!['component','link'].includes(args.kind))throw Error('组件创建参数无效。')
        const created=workspace.createContainerDraft({x:args.x,y:args.y,width:args.width,height:args.height,sizeMode:'manual'},args.kind==='link'?'link':undefined)
        if(!created)throw Error('当前画布无法创建组件。');createdId=created.id;workspace.updateSelection([createdId],'replace')
      } else if(args.op==='viewport') {
        if(![args.x,args.y,args.scale].every(Number.isFinite)||Math.abs(args.x)>100000||Math.abs(args.y)>100000||args.scale<.1||args.scale>4)throw Error('画布视口参数无效。')
        workspace.setViewport({x:args.x,y:args.y,scale:args.scale})
      } else if(args.op==='select') {
        if(!Array.isArray(args.ids)||args.ids.some(id=>!nodes.some(n=>n.id===id)))throw Error('组件选择无效。')
        workspace.updateSelection(args.ids,'replace')
      } else if(args.op==='focus') {
        if(!node)throw Error('组件不存在。');workspace.updateSelection([node.id],'replace')
        const r=root.getBoundingClientRect(),scale=Math.min(1,(r.width-80)/node.width,(r.height-100)/node.height)
        workspace.setViewport({scale,x:r.width/2-node.x*scale,y:r.height/2-node.y*scale})
      } else {
        if(!node)throw Error('组件不存在。')
        const before=await surface(node,{op:'observe'});if(before.revision!==args.surfaceRevision)throw Error('组件内容已变化，请重新观察。')
        const target=before.elements.find(e=>e.ref===args.ref)
        if(args.ref&&!target)throw Error('操作元素已失效。')
        check(true);if(isCancelled())throw Error('任务已取消。')
        await showCursor(node,{...args,elementBounds:target?.bounds})
        check(true);if(isCancelled())throw Error('任务已取消。')
        await surface(node,{...args,externalCursor:true,op:args.op==='choose'?'select':args.op,revision:args.surfaceRevision})
        if(args.op==='drag')await showCursor(node,{...args,point:args.to,elementBounds:target?.bounds})
      }
      const result={status:'dispatched',requestId,...(createdId?{createdId}:{}),message:'已执行操作，需重新观察确认结果。'};delete receipt.error;receipt.result=result;return result
    } finally {busy=false}
  }
  canvasUseOwners.set(sessionId,use)
  // Renew only while this exact canvas remains mounted. Leaving it invalidates
  // interaction; persisted tasks always restart paused.
  const renew=setInterval(()=>{if(!stopped&&!document.hidden)void window.dshDesktop?.researchCanvasActions?.bind({sessionId,selectedIds:workspace.getSnapshot().selection.selectedNodeIds}).catch(()=>{})},10000)
  document.addEventListener('visibilitychange',wake)
  return ()=>{stopped=true;root.removeEventListener('pointerdown',pointerDown,true);window.removeEventListener('pointerup',pointerUp,true);window.removeEventListener('pointercancel',pointerUp,true);window.removeEventListener('blur',pointerUp);clearInterval(renew);clearTimeout(wakeTimer);removeCursor();unsubscribeTasks();unsubscribeWorkspace();window.removeEventListener('message',changed);document.removeEventListener('visibilitychange',wake);if(canvasUseOwners.get(sessionId)===use)canvasUseOwners.delete(sessionId)}
}

// One store per session connects reports, the existing composer and conversation flow.
export function canvasTaskStore(sessionId) {
  if(canvasTaskStores.has(sessionId))return canvasTaskStores.get(sessionId)
  const listeners=new Set();let timer,pending
  const store={value:[],update(rows){
    const byId=new Map(store.value.map(t=>[t.id,t]))
    for(const t of rows){const old=byId.get(t.id);if(!old||(t.updatedAt??0)>=(old.updatedAt??0))byId.set(t.id,t)}
    const next=[...byId.values()].sort((a,b)=>a.createdAt-b.createdAt).slice(-100)
    if(JSON.stringify(next)===JSON.stringify(store.value))return
    store.value=next;for(const l of listeners)l()
  },subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)},snapshot(){return store.value},async call(extra={}){
    const response=await fetch('/api/research/canvas-tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,...extra})})
    const value=await response.json();if(!response.ok)throw Error(value.error||'任务状态暂不可用')
    store.update(value.tasks??[]);return value
  },retain(){
    store.users=(store.users??0)+1
    if(store.users===1){const poll=()=>{if(pending)return;pending=store.call().catch(()=>{}).finally(()=>pending=null)};poll();timer=setInterval(poll,1000)}
    return()=>{if(--store.users===0)clearInterval(timer)}
  },async stop(){
    // Stop only the active chain; historical paused tasks retain their state.
    const ids=store.value.filter(t=>['running','waiting'].includes(t.state)).map(t=>t.id)
    await Promise.all(ids.map(taskId=>store.call({taskId,action:'stop'})))
  }}
  canvasTaskStores.set(sessionId,store);return store
}
function useCanvasTasks(sessionId) {
  const store=react.useMemo(()=>canvasTaskStore(sessionId),[sessionId])
  const tasks=react.useSyncExternalStore(store.subscribe,store.snapshot,store.snapshot)
  react.useEffect(()=>sessionId?store.retain():undefined,[store,sessionId])
  return {tasks,stop:store.stop}
}
// Keep one execution header and defer the native final actions to the end of
// the durable task, even after the starter model call has already returned.
export function continueCanvasTaskFlow(flow,nodes,tasks) {
  if(!tasks.length)return flow
  const sorted=[...tasks].sort((a,b)=>a.createdAt-b.createdAt),task=sorted.at(-1)
  const executions=flow.filter(e=>e.kind==='execution'),tails=flow.filter(e=>e.kind==='node'&&nodes.get(e.key)?.kind==='turn-tail')
  const first=executions[0],active=tasks.some(t=>['running','waiting'].includes(t.state))
  const result=flow.flatMap(e=>{
    if(tails.includes(e))return []
    if(e.kind!=='execution')return [e]
    return e===first?[{...e,nodeKeys:executions.flatMap(v=>v.nodeKeys),canvasTask:task,running:active}]:[]
  })
  for(const item of sorted)result.push({kind:'canvas-task',key:'canvas-task:'+item.id,task:item,showExecution:!first})
  if(!active&&tails.length)result.push(tails.at(-1))
  return result
}
// Attach by the initiating user message time, never append old tasks to the live tail.
export function mergeCanvasTaskFlow(flow,nodes,tasks) {
  const users=flow.map((entry,index)=>({entry,index,node:entry.kind==='node'?nodes.get(entry.key):null})).filter(v=>v.node?.kind==='user'&&Number.isFinite(v.node.data?.time))
  if(!users.length)return flow
  const result=flow.slice(0,users[0].index)
  for(let i=0;i<users.length;i++) {
    const owner=users[i],next=users[i+1],end=next?.index??flow.length
    const scoped=tasks.filter(t=>(t.resumedAt??t.createdAt)>=owner.node.data.time&&(t.resumedAt??t.createdAt)<(next?.node.data.time??Infinity))
    result.push(...continueCanvasTaskFlow(flow.slice(owner.index,end),nodes,scoped))
  }
  return result
}
function CanvasUseTaskMessage({task,t,showExecution=true}) {
  const transient=['running','waiting'].includes(task.state)&&/^正在/.test(task.reason??'')
  if(transient&&!showExecution)return null
  return react.createElement('div',{'data-canvas-task-message':task.id,className:'odyssey-canvas-task-message'},
    showExecution&&react.createElement(ExecutionStatusGroup,{entry:{key:'canvas-task:'+task.id,running:['running','waiting'].includes(task.state),canvasTask:task},activityNodes:[],startTime:task.createdAt??task.updatedAt,endTime:['running','waiting'].includes(task.state)?null:task.updatedAt,seatProps:{},t}),
    !transient&&react.createElement(AssistantMarkdown,{blocks:[{kind:'text',text:task.reason||'正在观察画布'}],streaming:false,interrupted:false,t}))
}
function useAllCanvasTasks(sessionId) {
  const {tasks}=useCanvasTasks(sessionId)
  react.useSyncExternalStore(sherlockBoardsAdapter?.subscribe??(()=>()=>{}),sherlockBoardsAdapter?.version??(()=>0))
  const shared=sherlockBoardsAdapter?.getView(sessionId),remote=(shared?.activities??[]).filter(a=>a.kind==='canvas'&&!tasks.some(t=>t.id===a.id)).map(t=>({...t,remote:true,state:['running','waiting'].includes(t.state)&&(shared.connection!=='online'||Date.now()-t.updatedAt>20000)?'waiting':t.state,reason:['running','waiting'].includes(t.state)&&(shared.connection!=='online'||Date.now()-t.updatedAt>20000)?'正在等待执行端恢复连接并同步进展':t.reason}))
  return [...tasks,...remote]
}
function CanvasUseConversation({sessionId,active,t,from=0,to=Infinity}) {
  const tasks=useAllCanvasTasks(sessionId)
  if(!active)return null
  return react.createElement(react.Fragment,null,...tasks.filter(task=>(task.resumedAt??task.createdAt)>=from&&(task.resumedAt??task.createdAt)<to).sort((a,b)=>a.createdAt-b.createdAt).map(task=>react.createElement(CanvasUseTaskMessage,{key:task.id,task,t})))
}

export function canvasComposerEmpty(draft,attachments=[]) {
  return !draft.replace(/\uFFFC/g,'').trim() && attachments.length===0
}

export function canvasQueueEditContent(row,text,serialize) {
  const context=row?.canvasQueuedContext
  const body=context?serialize(context.files,text,[],context.artifacts??[],[],context.canvasContext):text
  return [{type:'text',text:body},...(row?.content??[]).filter(part=>part.type!=='text')]
}

export function patchCanvasUseClient(source) {
  source=source.replace('installCanvasUseClient(sessionId,workspace,rootRef.current)', 'installCanvasUseClient(sessionId,workspace,rootRef.current,agentCursorMarkup)')
  const start='/* CANVAS_USE_CLIENT_START */',end='/* CANVAS_USE_CLIENT_END */'
  const defs=start+'\nconst canvasUseOwners = new Map(),canvasTaskStores=new Map();\n'+agentCursorMarkup.toString()+'\n'+createCanvasUseSurface.toString()+'\n'+installCanvasUseSurface.toString()+'\n'+installCanvasUseClient.toString()+'\n'+[canvasComposerEmpty,canvasQueueEditContent,anchorConversationDisclosures,canvasTaskStore,useCanvasTasks,continueCanvasTaskFlow,mergeCanvasTaskFlow,useAllCanvasTasks,CanvasUseTaskMessage,CanvasUseConversation].map(fn=>fn.toString()).join('\n')+'\n'+end+'\n'
  const inlineTasks=value=>{
    // Migrate the former global tail into the native chronological flow.
    value=value.replace('react_jsx_runtime.jsx(CanvasUseTaskPanel,{sessionId,active}),','')
    value=value.replace('/* CANVAS_USE_INLINE_TASKS */react_jsx_runtime.jsxs(react_jsx_runtime.Fragment,{children:[','')
    for(const name of ['CanvasUseConversation,{sessionId,active:research,t}','CanvasUseTaskPanel,{sessionId,active:research}'])value=value.replace(',react_jsx_runtime.jsx('+name+')]})','')
    if(value.includes('/* CANVAS_TASK_CHRONOLOGY */'))return value
    const anchor='const renderFlow = (0, react.useMemo)(() => mergePendingSteeringFlow(compactFlow, pendingSteering, nodeStore), [compactFlow, pendingSteering, nodeStore]);'
    if(!value.includes(anchor))throw Error('Canvas task flow anchor missing')
    value=value.replace(anchor,`/* CANVAS_TASK_CHRONOLOGY */
      const canvasTasks=useCanvasTasks(sessionId).tasks;
      const nativeRenderFlow = react.useMemo(() => mergePendingSteeringFlow(compactFlow,pendingSteering,nodeStore),[compactFlow,pendingSteering,nodeStore]);
      const renderFlow=react.useMemo(()=>mergeCanvasTaskFlow(nativeRenderFlow,nodeStore,canvasTasks),[nativeRenderFlow,nodeStore,canvasTasks]);`)
    value=value.replace('renderFlow.map((entry) => {',"renderFlow.map((entry) => { if(entry.kind==='canvas-task')return react.createElement(CanvasUseTaskMessage,{key:entry.key,task:entry.task,t});")
    return value
  }
  const continuousFlow=value=>{
    // Attachment-backed local images belong in the same thumbnail gallery as screenshots.
    value=value.replace('if (localImage) {', 'if (localImage && refs.length === 0) {')
    value=value.replace('flexDirection: "column", alignItems: "flex-start", gap: 8, marginTop: 8', 'flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8, marginTop: 8')

    { // Idempotent even when other build patches regenerate surrounding helpers.
      const replace=(a,b,present=b)=>{if(value.includes(present))return;if(!value.includes(a))throw Error('Disclosure scroll anchor missing: '+a);value=value.replace(a,b)}
      replace('const toBottom = (el) => {', 'const toBottom = (el) => { delete el.dataset.conversationReading;')
      replace('const settle = () => {\n\t\t\t\tel.scrollTop = el.scrollHeight;', 'const settle = () => {\n        if(el.dataset?.conversationReading)return;\n\t\t\t\tel.scrollTop = el.scrollHeight;', 'const settle = () => {\n        if(el.dataset?.conversationReading)return;')
      replace('const floor = Math.max(0, el.scrollHeight - el.clientHeight);', 'if(el.dataset.conversationAnchoring){observedTopRef.current=el.scrollTop;return;}\n        const floor = Math.max(0, el.scrollHeight - el.clientHeight);')
      replace('el.addEventListener("scroll", onScroll, { passive: true });', `el.addEventListener("scroll", onScroll, { passive: true });
        const stopAnchoring=anchorConversationDisclosures(local,()=>[el],()=>{atBottomRef.current=false;setAtBottom(false);observedTopRef.current=el.scrollTop;});`, 'const stopAnchoring=anchorConversationDisclosures(local,()=>[el],()=>{atBottomRef.current=false;setAtBottom(false);observedTopRef.current=el.scrollTop;});')
      const cleanup=value.indexOf('el.removeEventListener("scroll", onScroll);'),cleanupEnd=value.indexOf('};',cleanup)
      if(!value.slice(cleanup,cleanupEnd).includes('stopAnchoring();'))replace('el.removeEventListener("scroll", onScroll);', 'el.removeEventListener("scroll", onScroll); stopAnchoring();')
    }
    if(!value.includes('/* EXECUTION_HEADER_FIRST */')) {
      const start=value.indexOf('function ExecutionStatusGroup(')
      const a=value.indexOf('children: [progressSurface.showProgress',start)
      const b=value.indexOf('}), (0, react_jsx_runtime.jsxs)("button", {',a)
      const c=value.indexOf('}), open &&',b)
      if(a<0||b<0||c<0)throw Error('Execution header ordering anchor missing')
      const progress=value.slice(a+'children: ['.length,b+2)
      const button=value.slice(b+4,c+2)
      value=value.slice(0,a)+'/* EXECUTION_HEADER_FIRST */children: ['+button+', '+progress+value.slice(c+2)
    }
    if(!value.includes('/* EXECUTION_REPORT_AFTER_DETAILS */')) {
      const start=value.indexOf('function ExecutionStatusGroup(')
      const a=value.indexOf('progressSurface.showProgress &&',start)
      const b=value.indexOf('}), open &&',a)
      const tail=value.indexOf('loadImage: seatProps.loadImage, t })]',b)
      if(a<0||b<0||tail<0)throw Error('Execution report ordering anchor missing')
      const progress=value.slice(a,b+2)
      const end=tail+'loadImage: seatProps.loadImage, t })'.length
      value=value.slice(0,a)+value.slice(b+4,end)+', /* EXECUTION_REPORT_AFTER_DETAILS */ '+progress+value.slice(end)
    }
    // Move the transient action into the existing shimmering header.
    value=value.replace(/, \/\* CANVAS_TASK_LIVE_STATUS \*\/ entry\.canvasTask[\s\S]*?(?=, (?:progressSurface.showProgress|open &&))/,'')
    value=value.replace("'执行过程 · '+({running:'正在执行',waiting:'等待变化',paused:'已暂停',completed:'已完成',stopped:'已停止'})[entry.canvasTask.state]", "'执行过程 · '+(entry.running ? (/^正在/.test(entry.canvasTask.reason??'') ? entry.canvasTask.reason : entry.canvasTask.state==='waiting'?'等待内容变化':'正在观察画布') : ({paused:'已暂停',completed:'已完成',stopped:'已停止'})[entry.canvasTask.state])")


    value=value.replace('task:entry.task,t});','task:entry.task,t,showExecution:entry.showExecution});')
    if(value.includes('/* CANVAS_CONTINUOUS_EXECUTION */'))return value
    const anchor='const [expanded, setExpanded] = (0, react.useState)(false);'
    const start=value.indexOf('function ExecutionStatusGroup('),at=value.indexOf(anchor,start)
    if(start<0||at<0)throw Error('Canvas continuous execution anchor missing')
    const timing="/* CANVAS_CONTINUOUS_EXECUTION */ if(entry.canvasTask){startTime=entry.canvasTask.createdAt??startTime;endTime=entry.running?null:entry.canvasTask.updatedAt;}\n"
    return value.slice(0,at)+timing+value.slice(at)
  }
  const connectConversation=value=>{
    if(!value.includes('if (action.kind === "remove" && result.error.code === "queue-item-not-found")'))value=value.replace('if (action.kind === "steer" && (result.error.code === "steer-unavailable" || result.error.code === "queue-item-not-found")) return;', 'if (action.kind === "remove" && result.error.code === "queue-item-not-found") return; if (action.kind === "steer" && (result.error.code === "steer-unavailable" || result.error.code === "queue-item-not-found")) return;')
    value=value.replace('text: null, preview: research.text', 'text: row.content?.some(part=>part.type!=="text") ? null : research.text, canvasQueuedContext: research, preview: research.text')
    value=value.replace('title: row.frozenCanvasContext ? t(\"research.context.queueEdit\") : row.text === null ?', 'title: row.text === null ?')
    const queueStart=value.indexOf('function NativeQueueDock(')
    if(queueStart>=0){
      const before=value.slice(0,queueStart),tail=value.slice(queueStart)
      value=before+tail.replace(/content: \[\{\s*type: "text",\s*text: editing\.text\s*\}\]/, 'content: canvasQueueEditContent(queue.find(row=>row.id===editing.id),editing.text,serializeResearchPrompt)')
    }
    // Ongoing goals do not have a near-term queue boundary. Deliver new input
    // as steering, without invoking the explicit goal-stop control.
    value=value.replace('keyboard.submit(resolveSubmitMode(running, accelerated ? "accelerated" : "enter", subagent === null));', 'keyboard.submit(canvasRunning && subagent === null ? "queue" : resolveSubmitMode(running, accelerated ? "accelerated" : "enter", subagent === null));')
    value=value.replace('canvasRunning && subagent === null ? \"steer\" : resolveSubmitMode','canvasRunning && subagent === null ? \"queue\" : resolveSubmitMode')
    value=value.replace('const primaryStops = canvasRunning || running && subagent === null;', 'const primaryStops = empty && (canvasRunning || running && subagent === null);')
    value=value.replace('const primaryStops = empty && (canvasRunning || running && subagent === null);', 'const primaryStops = (canvasRunning ? canvasComposerEmpty(draft,attachments) : empty) && (canvasRunning || running && subagent === null);')
    if(value.includes('/* CANVAS_TASK_COMPOSER */'))return value
    const replace=(a,b)=>{if(!value.includes(a))throw Error('Canvas task conversation anchor missing: '+a);value=value.replace(a,b)}
    replace('const primaryStops = running && subagent === null;', `/* CANVAS_TASK_COMPOSER */
      const canvasExecution=useCanvasTasks(sessionId);
      const canvasRunning=canvasExecution.tasks.some(task=>['running','waiting'].includes(task.state));
      const ordinaryStop=stop;
      stop=()=>{if(canvasRunning)void canvasExecution.stop().catch(error=>showToast(error.message));ordinaryStop?.()};
      const primaryStops = (canvasRunning ? canvasComposerEmpty(draft,attachments) : empty) && (canvasRunning || running && subagent === null);`)
    replace('const expandable = detailGroups.length > 0;', 'const expandable = !!entry.canvasTask || detailGroups.length > 0;')
    replace('const status = executionSummaryStatus(activityNodes, entry.running, t);', "const status = entry.canvasTask ? '执行过程 · '+({running:'正在执行',waiting:'等待变化',paused:'已暂停',completed:'已完成',stopped:'已停止'})[entry.canvasTask.state] : executionSummaryStatus(activityNodes, entry.running, t);")
    replace('open && progressSurface.detailGroups.length > 0', "open && entry.canvasTask && react.createElement('div',{className:ChatView_module_css_default.executionDetails},...(entry.canvasTask.history?.length?entry.canvasTask.history:[{reason:entry.canvasTask.reason}]).map((row,index)=>react.createElement(AssistantMarkdown,{key:index,blocks:[{kind:'text',text:row.reason}],streaming:false,interrupted:false,t}))), open && progressSurface.detailGroups.length > 0")
    return value
  }
  if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);return continuousFlow(connectConversation(inlineTasks(source.slice(0,a)+defs+source.slice(b+end.length+1))))}
  const once=(a,b)=>{if(!source.includes(a))throw Error('Canvas use anchor missing: '+a.slice(0,100));source=source.replace(a,b)}
  once('function createResearchWorkspaceSession(storage, sessionId) {',defs+'function createResearchWorkspaceSession(storage, sessionId) {')
  // Fresh installs already carry the refresh patch's silent option. Preserve
  // the complete dispatch call instead of replacing it with the old options.
  const dispatchCall=[
    "const result=await workspace.canvasAction(request.method,request.args,{isCancelled:request.isCancelled,silent:request.source==='component-data-refresh'});",
    'const result=await workspace.canvasAction(request.method,request.args,{isCancelled:request.isCancelled});'
  ].find(call=>source.includes(call))
  if(!dispatchCall)throw Error('Canvas use dispatch anchor missing')
  once(dispatchCall,`if(request.method==='use'){const use=canvasUseOwners.get(request.sessionId);if(!use)throw Error('画板暂未打开，等待返回后重新观察。');return use(request.args,{isCancelled:request.isCancelled});}
          ${dispatchCall}`)
  once('const dropLifecycle = (0, react.useMemo)(() => ({ active: true }), [workspace]);',`const dropLifecycle = (0, react.useMemo)(() => ({ active: true }), [workspace]);
      react.useEffect(()=>installCanvasUseClient(sessionId,workspace,rootRef.current,agentCursorMarkup),[sessionId,workspace]);`)
  return continuousFlow(connectConversation(inlineTasks(source)))
}
