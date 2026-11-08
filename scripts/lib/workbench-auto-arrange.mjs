// Local ownership belongs to the renderer that admitted this plan. A remote
// collaborator and a reopened historical document must not become new owners.
export function createWorkbenchAutoArrangeState(storage,sessionId) {
  const key='sherlock.workbench.auto-arrange.v1:'+sessionId,pending=new Map(),consumed=new Set()
  try{
    const saved=JSON.parse(storage?.getItem(key)||'{}')
    if(Array.isArray(saved.done))for(const id of saved.done)if(typeof id==='string')consumed.add(id)
    // applyWorkbench admits 1–30 panels; this restores the same exact contract.
    if(Array.isArray(saved.pending))for(const item of saved.pending)if(typeof item?.id==='string'&&!consumed.has(item.id)&&Array.isArray(item.ids)&&item.ids.length>0&&item.ids.length<=30&&item.ids.every(id=>typeof id==='string'))pending.set(item.id,[...new Set(item.ids)])
  }catch{/* A malformed local marker cannot grant historical arrange ownership. */}
  const save=()=>{try{storage?.setItem(key,JSON.stringify({pending:[...pending].map(([id,ids])=>({id,ids})),done:[...consumed]}));return true}catch{return false}}
  return {
    register(plan,existing){
      if(!plan?.id||!plan.panels?.length||pending.has(plan.id)||consumed.has(plan.id)||plan.panels.every(panel=>existing.has(panel.nodeId)))return false
      pending.set(plan.id,plan.panels.map(panel=>panel.nodeId));save();return true
    },
    ready(snapshot,visibleIds){
      const nodes=new Map(snapshot.artifacts.map(node=>[node.id,node]))
      return [...pending].filter(([id,ids])=>{
        const members=visibleIds?ids.filter(nodeId=>visibleIds.has(nodeId)):ids
        return members.length>0&&members.every(nodeId=>{
          const node=nodes.get(nodeId)
          return node?.workbenchId===id&&node.generationStatus==='completed'&&node.containerSpec&&typeof node.containerSpec==='object'
        })
      }).map(([id])=>id)
    },
    consume(ids,visibleIds){
      let changed=false
      for(const id of ids){
        const members=pending.get(id)
        if(!members)continue
        const remaining=visibleIds?members.filter(nodeId=>!visibleIds.has(nodeId)):[]
        if(remaining.length===members.length)continue
        if(remaining.length)pending.set(id,remaining)
        else{pending.delete(id);consumed.add(id)}
        changed=true
      }
      if(changed)save()
      return changed
    }
  }
}

export function installWorkbenchAutoArrange(root,workspace,readOnly) {
  if(readOnly)return()=>{}
  const view=root.ownerDocument.defaultView
  const attempted=new Set()
  const pageKey=id=>JSON.stringify([workspace.getActiveBoardTab?.()??null,id])
  let frame=null,stopped=false
  const check=()=>{
    if(stopped||frame!==null||!workspace.pendingWorkbenchArrange().some(id=>!attempted.has(pageKey(id))))return
    frame=view.requestAnimationFrame(()=>{frame=view.requestAnimationFrame(()=>{
      frame=null
      if(stopped||!root.isConnected||root.getBoundingClientRect().width<=0||root.hasAttribute('data-grid-operation')||root.__eworkContentFit)return
      const ids=workspace.pendingWorkbenchArrange().filter(id=>!attempted.has(pageKey(id)))
      if(!ids.length)return
      // Same all-canvas content measurement, offscreen mount preview, native
      // settle, HTML refit and persistence used by the manual Standard action.
      const snapshot=workspace.getSnapshot(),nodes=[...snapshot.files,...snapshot.artifacts]
      // At most one attempt in this mounted view, including failed storage or
      // an interrupted refit. Persisted pending can retry on the next visit.
      ids.forEach(id=>attempted.add(pageKey(id)))
      arrangeWorkbenchContents(root,workspace,measureWorkbenchContents(root,nodes),'standard',{focus:false,onFinish:durable=>{if(durable)workspace.consumeWorkbenchArrange(ids)}})
    })})
  }
  const unsubscribe=workspace.subscribe(check)
  const retry=()=>check()
  view.addEventListener('resize',retry);view.addEventListener('ework:arrange-preview',retry);root.addEventListener('pointerup',retry)
  check()
  return()=>{stopped=true;unsubscribe();if(frame!==null)view.cancelAnimationFrame(frame);view.removeEventListener('resize',retry);view.removeEventListener('ework:arrange-preview',retry);root.removeEventListener('pointerup',retry)}
}
