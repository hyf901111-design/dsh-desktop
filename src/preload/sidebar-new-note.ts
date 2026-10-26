/** Pure-data bridge to the native workspace/session owner; never a demo route. */
export function createSidebarNewNoteAction(document:Document,beforeCreate:()=>Promise<void>){
 const win=document.defaultView!;let flight:Promise<void>|null=null,controller:AbortController|null=null
 const request=(phase:'prepare'|'create'|'cancel',token:string|undefined,signal:AbortSignal)=>new Promise<{token?:string;sessionId?:string}>((resolve,reject)=>{
  const requestId=crypto.randomUUID(),cleanup=()=>{clearTimeout(timer);win.removeEventListener('sherlock:sidebar-new-note-reply',reply);signal.removeEventListener('abort',abort)}
  const abort=()=>{cleanup();reject(new DOMException('已取消新建笔记。','AbortError'))}
  const reply=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.requestId!==requestId)return;cleanup();d.ok===true?resolve(d):reject(d.cancelled?new DOMException(d.message,'AbortError'):Error(d.message||'新笔记未能创建。'))}
  const timer=setTimeout(()=>{cleanup();reject(Error('新建笔记超时，请重试。'))},30_000)
  win.addEventListener('sherlock:sidebar-new-note-reply',reply);signal.addEventListener('abort',abort,{once:true})
  if(signal.aborted){abort();return}
  win.dispatchEvent(new CustomEvent('sherlock:sidebar-new-note-request',{detail:{requestId,phase,...token?{token}:{}}}))
 })
 const create=()=>{
  if(flight)return flight
  const owned=new AbortController();controller=owned
  flight=(async()=>{let token:string|undefined
   try{token=(await request('prepare',undefined,owned.signal)).token;if(!token)throw Error('新笔记入口不可用。');await beforeCreate();if(owned.signal.aborted)throw new DOMException('已取消新建笔记。','AbortError');await request('create',token,owned.signal)}
   finally{if(token)win.dispatchEvent(new CustomEvent('sherlock:sidebar-new-note-request',{detail:{requestId:crypto.randomUUID(),phase:'cancel',token}}));if(controller===owned)controller=null;flight=null}
  })();return flight
 }
 return {create,reset:()=>controller?.abort(),dispose:()=>controller?.abort()}
}
