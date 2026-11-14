/** Explicit sent-reference navigation. Registration itself never reads a file. */
export function createPptxAnnotationRevealController(deps){
 const viewers=new Set(),waiters=new Set();let disposed=false,pending=null
 const cancelled=()=>new DOMException('标注定位已取消，请在当前会话重新打开。','AbortError')
 const sourceKey=value=>{const source=value?.source;return JSON.stringify([value?.sessionId,source?.kind,source?.relativePath,source?.authorizationId,source?.nodeId])}
 const current=job=>{if(disposed||pending!==job||job.controller.signal.aborted||(job.identity&&deps.isCurrent?.(job.identity)===false))throw cancelled()}
 const awaiting=(value,job)=>new Promise((resolve,reject)=>{
  const signal=job.controller.signal,abort=()=>{clean();reject(cancelled())},clean=()=>signal.removeEventListener('abort',abort)
  if(signal.aborted){abort();return}signal.addEventListener('abort',abort,{once:true})
  Promise.resolve(value).then(result=>{clean();try{current(job);resolve(result)}catch(reason){reject(reason)}},reason=>{clean();reject(reason)})
 })
 const resolve=async(job,reference)=>{
  const response=await awaiting(deps.bridge.resolveReference({sendingSessionId:job.identity.sessionId,reference}),job)
  if(response?.ok!==true)throw Error(response?.error||'无法读取此标注的原文件授权。')
  const value=response.value
  if(value?.status!=='ready')throw Error(value?.error||'此标注暂不可定位，请重新打开原文件。')
  const ref=deps.parseReference(value.reference)
  if(JSON.stringify(ref)!==JSON.stringify(reference)||value.fileVersion!==reference.fileVersion||value.source?.sessionId!==reference.sessionId||value.mark?.id!==reference.markId||typeof value.path!=='string'||!value.path||typeof value.name!=='string'||!value.name)throw Error('原文件身份或版本已变化，请重新打开后定位。')
  if(!['workspace','research','note-file','knowledge-file'].includes(value.source?.source?.kind)||(value.source.source.kind!=='workspace'&&!/^sherlock-preview:\/\/[A-Za-z0-9_-]+\/$/.test(value.sourceUrl??'')))throw Error('原文件只读预览授权不可用。')
  return value
 }
 const matching=value=>[...viewers].filter(viewer=>sourceKey(viewer.source)===sourceKey(value.source)&&
  (value.source.source.kind==='knowledge-file'||(viewer.canonicalPath??viewer.path)===value.path))
 const find=value=>matching(value).filter(viewer=>viewer.isAvailable?.()===true)
 const waitViewer=(value,job)=>awaiting(new Promise((resolve,reject)=>{
  let timer;const signal=job.controller.signal
  const clean=()=>{clearTimeout(timer);waiters.delete(check);signal.removeEventListener('abort',abort)}
  const abort=()=>{clean();reject(cancelled())}
  const check=()=>{clearTimeout(timer);try{current(job);const found=find(value);if(found.length>1)throw Error('发现多个原文件预览，请关闭重复窗口后重试。');if(found.length===1){clean();resolve(found[0]);return}timer=setTimeout(check,16)}catch(reason){clean();reject(reason)}}
  signal.addEventListener('abort',abort,{once:true});waiters.add(check);check()
 }),job)
 return{
  registerViewer(viewer){if(disposed)return()=>{};viewers.add(viewer);for(const wake of [...waiters])wake();return()=>{viewers.delete(viewer)}},
  async revealReference(input){
   pending?.controller.abort();const job={controller:new AbortController(),identity:null};pending=job
   const timer=setTimeout(()=>job.controller.abort(),15000);let activation
   try{
    const reference=deps.parseReference(input)
    job.identity=await awaiting(deps.resolveInput({switchToChat:false,signal:job.controller.signal}),job);current(job)
    if(job.identity.sessionId!==reference.sessionId)throw Error('此标注不属于当前实际会话。')
    const value=await resolve(job,reference)
    const reusable=matching(value).filter(viewer=>viewer.canReuse?.()===true)
    if(reusable.length>1)throw Error('发现多个已加载的原文件预览，请关闭重复窗口后重试。')
    await awaiting(deps.openPreview(job.identity,value,{reuse:reusable.length===1}),job)
    const viewer=await waitViewer(value,job);activation=await awaiting(viewer.activate(reference,{signal:job.controller.signal}),job)
    const verified=await resolve(job,reference)
    if(sourceKey(value.source)!==sourceKey(verified.source)||value.path!==verified.path||!viewers.has(viewer)||!viewer.isAvailable?.())throw Error('原文件预览已切换，请重新定位。')
    current(job);activation.select();return true
   }catch(reason){activation?.cancel?.();throw reason}
   finally{clearTimeout(timer);job.controller.abort();if(pending===job)pending=null}
  },
  dispose(){if(disposed)return;disposed=true;pending?.controller.abort();pending=null;viewers.clear();waiters.clear()}
 }
}

/** Open the normal registered sidebar editor, never a separate preview surface. */
export function openPptxAnnotationPreview(sidebar,identity,value,options={}){
 const service=sidebar?.service
 if(!service?.openTab||!service?.setPanelState||!service?.updateTab||!service?.getSnapshot)throw Error('右侧文件预览尚未就绪，请稍后重试。')
 const scope={sessionId:identity.sessionId},tabsOf=snapshot=>{
  const tabs=[],walk=node=>{if(!node)return;if(node.kind==='leaf')tabs.push(...node.tabs);else for(const child of node.children??[])walk(child)}
  walk(snapshot.state?.splits);walk(snapshot.state?.bottomSplits);return tabs.filter(tab=>tab.type==='editor'&&tab.path===value.path)
 }
 const before=service.getSnapshot()
 if(before.sessionId!==identity.sessionId)throw Error('右侧预览的实际会话已变化。')
 if(value.source.source.kind==='knowledge-file'){
  const id=value.source.source.nodeId
  service.openTab({type:'editor',id:'knowledge-file:'+id,path:'knowledge/'+id+'/'+value.name,title:value.name,meta:{fileId:id,sherlockPanel:'right',treeOpen:false}},scope)
  service.setPanelState({open:true},scope)
  return
 }
 const existing=tabsOf(before)
 if(existing.length>1)throw Error('发现多个原文件预览，请关闭重复窗口后重试。')
 const prior=existing[0]?.meta?.sherlockPptAnnotationPreview,sourceKey=value=>JSON.stringify([value?.sessionId,value?.source?.kind,value?.source?.relativePath,value?.source?.authorizationId,value?.source?.nodeId])
 if(prior&&sourceKey(prior.source)!==sourceKey(value.source))throw Error('原文件预览授权已变化，请先关闭原预览再重新定位。')
 // A renewed read capability is not a new document. Keep the live reader,
 // including its unsaved edits and undo stack, until its own safe mode gate runs.
 const preview=(options.reuse?prior:null)??{source:value.source,...(value.sourceUrl?{sourceUrl:value.sourceUrl}:{})}
 service.openTab({type:'editor',id:'editor:'+value.path,path:value.path,title:value.name,meta:{sherlockPanel:'right',sherlockPptAnnotationPreview:preview}},scope)
 const snapshot=service.getSnapshot(),found=tabsOf(snapshot)
 if(snapshot.sessionId!==identity.sessionId||found.length!==1)throw Error('原文件未能在当前右栏打开，请重试。')
 service.updateTab(found[0].id,{meta:{...found[0].meta,sherlockPanel:'right',sherlockPptAnnotationPreview:preview}},scope)
 service.setPanelState({open:true},scope)
}
