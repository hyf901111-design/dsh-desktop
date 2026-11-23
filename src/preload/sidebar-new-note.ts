/** Pure-data bridge to the native workspace/session owner; never a demo route. */
export function createSidebarNewNoteAction(document:Document,beforeCreate:()=>Promise<void>,kind:'note'|'spreadsheet'|'presentation'='note'){
 const noun=kind==='spreadsheet'?'表格':kind==='presentation'?'演示':'笔记'
 const win=document.defaultView!;let flight:Promise<string>|null=null,controller:AbortController|null=null
 const request=(phase:'prepare'|'create'|'cancel',token:string|undefined,signal:AbortSignal)=>new Promise<{token?:string;sessionId?:string}>((resolve,reject)=>{
  const requestId=crypto.randomUUID(),cleanup=()=>{clearTimeout(timer);win.removeEventListener('sherlock:sidebar-new-note-reply',reply);signal.removeEventListener('abort',abort)}
  const abort=()=>{cleanup();reject(new DOMException('已取消新建'+noun+'。','AbortError'))}
  const reply=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.requestId!==requestId)return;cleanup();d.ok===true?resolve(d):reject(d.cancelled?new DOMException(d.message,'AbortError'):Error(d.message||'新'+noun+'未能创建。'))}
  const timer=setTimeout(()=>{cleanup();reject(Error('新建'+noun+'超时，请重试。'))},30_000)
  win.addEventListener('sherlock:sidebar-new-note-reply',reply);signal.addEventListener('abort',abort,{once:true})
  if(signal.aborted){abort();return}
  win.dispatchEvent(new CustomEvent('sherlock:sidebar-new-note-request',{detail:{requestId,phase,...kind!=='note'?{kind}:{},...token?{token}:{}}}))
 })
 const create=(signal?:AbortSignal):Promise<string>=>{
  if(flight){
   if(!controller?.signal.aborted)return flight
   // A new launch after navigation owns a fresh request, even if the
   // previous request has yet to run its cancellation cleanup.
   return flight.catch(()=>{}).then(()=>create(signal))
  }
  const owned=new AbortController();controller=owned
  const abort=()=>owned.abort()
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true})
  flight=(async()=>{let token:string|undefined
   try {
    token = (await request('prepare', undefined, owned.signal)).token
    if (!token) throw Error('新'+noun+'入口不可用。')
    await beforeCreate()
    if (owned.signal.aborted) throw new DOMException('已取消新建'+noun+'。', 'AbortError')
    const result = await request('create', token, owned.signal)
    if (!result.sessionId) throw Error('新'+noun+'会话未就绪。')
    return result.sessionId
   }
   finally{signal?.removeEventListener('abort',abort);if(token)win.dispatchEvent(new CustomEvent('sherlock:sidebar-new-note-request',{detail:{requestId:crypto.randomUUID(),phase:'cancel',token,...kind!=='note'?{kind}:{}}}));if(controller===owned)controller=null;flight=null}
  })();return flight
 }
 return {create,reset:()=>controller?.abort(),dispose:()=>controller?.abort()}
}
