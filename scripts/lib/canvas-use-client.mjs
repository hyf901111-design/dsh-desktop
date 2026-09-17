import {createCanvasUseSurface} from '../../packages/dsh-research-task-runtime/canvas-use-surface.js'

function installCanvasUseClient(sessionId,workspace,root) {
  let stopped=false,busy=false,revision='',fingerprint='',last='',cursor,timer
  const receipts=new Map(),surfaces=new WeakMap()
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return(h>>>0).toString(36)}
  const check=(write=false)=>{
    if(stopped||!root.isConnected||document.hidden||!root.getBoundingClientRect().width)throw Error('画板已离开前台，任务已暂停。')
    if(write&&sherlockShared(sessionId)){const v=sherlockBoardsAdapter?.getView(sessionId);if(!v?.permissions.edit||v.connection!=='online')throw Error('画板只读或连接中断。')}
    if(root.hasAttribute('data-research-operation')||root.querySelector('[data-research-marquee]'))throw Error('用户正在操作画布，请稍后恢复任务。')
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
    const details=await Promise.all(nodes.map(async n=>{
      const element=card(n.id),rect=element?.getBoundingClientRect()
      if(!rect||rect.right<viewportRect.left||rect.left>viewportRect.right||rect.bottom<viewportRect.top||rect.top>viewportRect.bottom)return {id:n.id,available:false}
      try{return {id:n.id,...await surface(n,{op:'observe'})}}catch(error){return {id:n.id,error:error.message}}
    }))
    check();const r=root.getBoundingClientRect()
    fingerprint=hash(JSON.stringify([basic.revision,details.map(d=>[d.id,d.revision,d.error])]))
    const key=JSON.stringify([basic.revision,state.viewport,state.selection])
    if(key!==last){revision=crypto.randomUUID();last=key}
    const screenshot=args.screenshot?await window.dshDesktop?.researchLinkFrame?.captureCanvas({x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth-Math.max(0,r.x)),height:Math.min(r.height,innerHeight-Math.max(0,r.y))}):undefined
    return {...basic,revision,canvasRevision:basic.revision,fingerprint,viewport:state.viewport,size:{width:r.width,height:r.height},surfaces:details.filter(d=>!args.nodeIds||args.nodeIds.includes(d.id)),screenshot,scope:'entire-canvas',writable:basic.writable&&(!sherlockShared(sessionId)||sherlockBoardsAdapter.getView(sessionId)?.connection==='online')}
  }
  const showCursor=(node,args)=>{
    cursor?.remove();const el=card(node.id),body=el?.querySelector('[data-research-native-web],iframe,.rScV5Q_previewBody')??el
    if(!body)return
    const a=body.getBoundingClientRect(),r=root.getBoundingClientRect();let p=args.point??{x:.5,y:.5}
    // Element bounds are returned by the latest observation in content coordinates.
    const b=args.elementBounds;if(b)p={x:b.x+p.x*b.width,y:b.y+p.y*b.height}
    cursor=document.createElement('div');cursor.setAttribute('data-canvas-use-cursor','');cursor.setAttribute('aria-hidden','true')
    cursor.style.cssText='position:absolute;z-index:60;pointer-events:none;color:#0d99ff;filter:drop-shadow(0 1px 2px #0008);transition:left .18s ease,top .18s ease;font:12px/18px system-ui;white-space:nowrap;'
    cursor.innerHTML='<svg width="24" height="28" viewBox="0 0 24 28"><path d="M3 2L21 16L12 17L8 25Z" fill="currentColor" stroke="white" stroke-width="1.5"/></svg><span style="background:#0d99ff;color:white;border-radius:4px;padding:2px 5px">Agent</span>'
    cursor.style.left=(a.left-r.left+p.x*a.width)+'px';cursor.style.top=(a.top-r.top+p.y*a.height)+'px';root.append(cursor)
    clearTimeout(timer);timer=setTimeout(()=>cursor?.remove(),1200)
  }
  const use=async(args,{isCancelled=()=>false}={})=>{
    if(args.op==='observe')return observe(args)
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
        showCursor(node,{...args,elementBounds:target?.bounds})
        await new Promise(resolve=>setTimeout(resolve,180))
        check(true);if(isCancelled())throw Error('任务已取消。')
        await surface(node,{...args,op:args.op==='choose'?'select':args.op,revision:args.surfaceRevision})
      }
      const result={status:'dispatched',requestId,...(createdId?{createdId}:{}),message:'已执行操作，需重新观察确认结果。'};delete receipt.error;receipt.result=result;return result
    } finally {busy=false}
  }
  canvasUseOwners.set(sessionId,use)
  // Renew only while this exact canvas remains mounted. Leaving it invalidates
  // interaction; persisted tasks always restart paused.
  const renew=setInterval(()=>{if(!stopped&&!document.hidden)void window.dshDesktop?.researchCanvasActions?.bind({sessionId,selectedIds:workspace.getSnapshot().selection.selectedNodeIds}).catch(()=>{})},10000)
  const takeover=e=>{if(e.isTrusted&&e.altKey)void fetch('/api/research/canvas-tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId})}).then(r=>r.json()).then(v=>Promise.all((v.tasks??[]).filter(t=>['running','waiting'].includes(t.state)).map(t=>fetch('/api/research/canvas-tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,taskId:t.id,action:'takeover'})})))).catch(()=>{})}
  root.addEventListener('pointerdown',takeover,true)
  return ()=>{stopped=true;clearInterval(renew);clearTimeout(timer);cursor?.remove();root.removeEventListener('pointerdown',takeover,true);if(canvasUseOwners.get(sessionId)===use)canvasUseOwners.delete(sessionId)}
}

function CanvasUseTaskPanel({sessionId,active}) {
  const [tasks,setTasks]=react.useState([]),[error,setError]=react.useState('')
  const call=async(extra={})=>{const r=await fetch('/api/research/canvas-tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({sessionId,...extra})});const v=await r.json();if(!r.ok)throw Error(v.error);setTasks(v.tasks??[])}
  react.useEffect(()=>{if(!active)return;let current=true;const read=()=>{if(current)call().catch(()=>{})};read();const timer=setInterval(read,1500);return()=>{current=false;clearInterval(timer)}},[sessionId,active])
  if(!active)return null
  const visible=tasks.filter(t=>!['stopped','completed'].includes(t.state)).concat(tasks.filter(t=>['stopped','completed'].includes(t.state)).slice(-1)).slice(-4)
  if(!visible.length)return null
  const h=react_jsx_runtime.jsx,hs=react_jsx_runtime.jsxs,labels={running:'正在执行',waiting:'等待变化',paused:'已暂停',stopped:'已停止',completed:'已完成'}
  return hs('div',{'data-canvas-use-tasks':'',style:{padding:'10px 14px',maxHeight:240,overflow:'auto',flexShrink:0},children:[...visible.map(t=>hs('div',{style:{border:'1px solid var(--dsw-alias-border-default,#8884)',borderRadius:10,padding:12,marginBottom:8,fontSize:12,lineHeight:'18px'},children:[h('strong',{children:'画布持续任务 · '+labels[t.state]}),h('div',{children:t.goal,style:{marginTop:6}}),h('div',{children:t.reason,style:{opacity:.65,marginTop:4}}),h('div',{children:`${t.actions}/${t.maxActions} 次操作 · 截止 ${new Date(t.deadline).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`,style:{opacity:.6,marginTop:4}}),hs('div',{style:{display:'flex',gap:12,marginTop:8},children:(['running','waiting'].includes(t.state)?[['pause','暂停'],['takeover','接管'],['stop','停止']]:t.state==='paused'?[['resume','恢复'],['stop','停止']]:[]).map(([action,label])=>h('button',{type:'button',style:{border:0,background:'transparent',color:'inherit',padding:0,cursor:'pointer',font:'inherit'},children:label,onClick:async()=>{try{setError('');await call({taskId:t.id,action})}catch(e){setError(e.message)}}},action))})]},t.id)),error?h('p',{role:'alert',children:error}):null]})
}

export function patchCanvasUseClient(source) {
  const start='/* CANVAS_USE_CLIENT_START */',end='/* CANVAS_USE_CLIENT_END */'
  const defs=start+'\nconst canvasUseOwners = new Map();\n'+createCanvasUseSurface.toString()+'\n'+installCanvasUseClient.toString()+'\n'+CanvasUseTaskPanel.toString()+'\n'+end+'\n'
  if(source.includes(start)){const a=source.indexOf(start),b=source.indexOf(end,a);return source.slice(0,a)+defs+source.slice(b+end.length+1)}
  const once=(a,b)=>{if(!source.includes(a))throw Error('Canvas use anchor missing: '+a.slice(0,100));source=source.replace(a,b)}
  once('function createResearchWorkspaceSession(storage, sessionId) {',defs+'function createResearchWorkspaceSession(storage, sessionId) {')
  once('const result=await workspace.canvasAction(request.method,request.args,{isCancelled:request.isCancelled});',`if(request.method==='use'){const use=canvasUseOwners.get(request.sessionId);if(!use)throw Error('画板未打开，任务已暂停。');return use(request.args,{isCancelled:request.isCancelled});}
          const result=await workspace.canvasAction(request.method,request.args,{isCancelled:request.isCancelled});`)
  once('const dropLifecycle = (0, react.useMemo)(() => ({ active: true }), [workspace]);',`const dropLifecycle = (0, react.useMemo)(() => ({ active: true }), [workspace]);
      react.useEffect(()=>installCanvasUseClient(sessionId,workspace,rootRef.current),[sessionId,workspace]);`)
  once('children: [(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: "sRp_body sRp_conversation",','children: [react_jsx_runtime.jsx(CanvasUseTaskPanel,{sessionId,active}),(0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\tclassName: "sRp_body sRp_conversation",')
  return source
}
