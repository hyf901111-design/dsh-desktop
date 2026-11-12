// Recover a missed terminal frame from the live host, without reloading the
// conversation list or clearing active unrelated agents and remote catalogs.
export async function reconcileRunningSessions(manager,signal){
 if(signal?.aborted||manager.activityReconciliation)return
 const ids=manager.summaries.filter(row=>row.running).map(row=>row.sessionId).slice(0,128)
 if(!ids.length)return
 const changed=new Set();manager.activityReconciliation=changed
 try{
  const {result}=await manager.api.sessions.list({activitySessionIds:ids},signal)
  if(signal?.aborted||!result.ok)return
  const live=new Map(result.value.items.map(row=>[row.sessionId,row.running]))
  const current=new Map(manager.summaries.map(row=>[row.sessionId,row.running]))
  for(const id of ids){
   if(changed.has(id)||current.get(id)!==true||live.get(id)===true)continue
   manager.recordMutation({kind:'status',sessionId:id,running:false})
   manager.sessions.get(id)?.handleRunning(false)
   manager.updateCatalogActivity(id,false)
  }
 }catch{/* A failed read is not evidence that an agent stopped. */}
 finally{manager.activityReconciliation=undefined}
}

export function patchSessionRunningActivity(source){
 const marker='/* ework:session-running-activity:v1 */'
 if(source.includes(marker))return source
 const replace=(a,b)=>{if(source.split(a).length!==2)throw Error('Session activity anchor drifted: '+a.slice(0,90));source=source.replace(a,b)}
 replace('case "host/session-status":\n\t\t\t\t\t\tthis.recordMutation({',
  'case "host/session-status":\nthis.activityReconciliation?.add(frame.sessionId);\n\t\t\t\t\t\tthis.recordMutation({')
 const anchor='this.manager = new SessionManager(api, remote, restored.sessionId, restored.subagentAddress, conversation);'
 replace(anchor,`${anchor}
 ${marker}
 rootCtx.effect(()=>{
  const controller=new AbortController();
  const poll=()=>void (${reconcileRunningSessions.toString()})(this.manager,controller.signal);
  const timer=setInterval(poll,3000);
  return()=>{clearInterval(timer);controller.abort()};
 },'sessions: reconcile running state');`)
 return source
}
