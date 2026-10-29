import type {NoteAiResult} from '../shared/workspace-notes'

export type HomeNotesNativeOptions={sessionId:string;runId:string;cwd:string;fresh:boolean;signal:AbortSignal;wait?(ms:number,signal?:AbortSignal):Promise<void>}
export type HomeNotesNativeBridge={type(stage:'note'|'selection'):Promise<void>;configureQuote():Promise<void>;reviewSummary():Promise<string>;appendSummary():Promise<void>;generate(input:any):Promise<NoteAiResult>;stop(requestId:string):Promise<void>;dispose():void}
/** The native portal owns the actual Notes input. No DOM nodes cross worlds. */
export async function createHomeNotesNativeBridge(document:Document,host:HTMLElement,options:HomeNotesNativeOptions):Promise<HomeNotesNativeBridge>{
 const win=document.defaultView!,temporary=!host.id,hostId=host.id||'home-notes-native-'+win.crypto.randomUUID()
 host.id=hostId
 let closed=false
 const pending=new Set<()=>void>(),aborted=()=>new DOMException('笔记示例已结束。','AbortError')
 const detail=(command:string,extra:Record<string,unknown>={})=>({requestId:win.crypto.randomUUID(),runId:options.runId,sessionId:options.sessionId,hostId,command,...extra})
 const dispose=()=>{
  if(closed)return;closed=true;options.signal.removeEventListener('abort',dispose)
  for(const cancel of [...pending])cancel()
  win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-notes-native-request',{detail:detail('dispose')}))
  if(temporary&&host.id===hostId)host.removeAttribute('id')
 }
 const exchange=async(command:string,extra:Record<string,unknown>={})=>{
  if(closed||options.signal.aborted||!host.isConnected)throw aborted()
  const input=detail(command,extra),clock=new AbortController()
  return new Promise<any>((resolve,reject)=>{
   let timer:ReturnType<typeof setTimeout>|undefined
   const clean=()=>{if(timer!==undefined)clearTimeout(timer);clock.abort();pending.delete(cancel);win.removeEventListener('sherlock:home-guide-notes-native-reply',receive)}
   const cancel=()=>{clean();reject(aborted())}
   const receive=(event:Event)=>{const result=(event as CustomEvent).detail;if(result?.requestId!==input.requestId||result.runId!==options.runId||result.sessionId!==options.sessionId)return;clean();result.ok===true?resolve(result.result):reject(Error(result.message||'笔记示例任务尚未就绪。'))}
   pending.add(cancel);win.addEventListener('sherlock:home-guide-notes-native-reply',receive)
   const expire=()=>{clean();reject(Error('笔记示例任务未及时确认，请重试。'))},budget=command==='mount'?12000:90000
   if(options.wait)void options.wait(budget,clock.signal).then(expire,()=>{})
   else timer=setTimeout(expire,budget)
   try{win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-notes-native-request',{detail:input}))}catch(error){clean();reject(error)}
  })
 }
 options.signal.addEventListener('abort',dispose,{once:true})
 try{
  await exchange('mount',{cwd:options.cwd,fresh:options.fresh})
  return{type:async stage=>{await exchange('type',{stage})},configureQuote:async()=>{await exchange('configure-quote')},reviewSummary:async()=>{return(await exchange('review-summary')).requestId},appendSummary:async()=>{await exchange('append-summary')},generate:input=>exchange('generate',{input}),stop:async requestId=>{await exchange('stop',{generationRequestId:requestId})},dispose}
 }catch(error){dispose();throw error}
}
