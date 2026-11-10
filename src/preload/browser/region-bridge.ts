import type {BrowserQuestionCommand,BrowserQuestionState,BrowserQuestionUpdate} from '../../shared/browser-region'

function request(win:Window,name:string,replyName:string,detail:Record<string,unknown>):Promise<any>{
 return new Promise((resolve,reject)=>{
  const requestId=win.crypto.randomUUID()
  const cleanup=()=>{clearTimeout(timer);win.removeEventListener(replyName,reply)}
  const reply=(event:Event)=>{const d=(event as CustomEvent).detail;if(d?.requestId!==requestId)return;cleanup();d.ok?resolve(d):reject(Error(d.message||'对话输入暂不可用。'))}
  const timer=setTimeout(()=>{cleanup();reject(Error('对话输入尚未就绪，请重试。'))},10000)
  win.addEventListener(replyName,reply)
  win.dispatchEvent(new CustomEvent(name,{detail:{requestId,...detail}}))
 })
}
/** Trusted mainworld event adapter; payloads contain only public composer state. */
export async function question(ownerSessionId:string|null,command:BrowserQuestionCommand):Promise<BrowserQuestionState>{
 const reply=await request(window,'sherlock:browser-question-request','sherlock:browser-question-reply',{ownerSessionId,command:JSON.stringify(command)})
 return JSON.parse(reply.state) as BrowserQuestionState
}
export function subscribeQuestion(listener:(value:BrowserQuestionUpdate)=>void):()=>void{
 const handle=(event:Event)=>{try{const d=(event as CustomEvent).detail;const state=JSON.parse(d.state) as BrowserQuestionState;if(typeof d.ticket==='string'&&state.ticket===d.ticket)listener({ticket:d.ticket,state})}catch{}}
 window.addEventListener('sherlock:browser-question-state',handle)
 return()=>window.removeEventListener('sherlock:browser-question-state',handle)
}
export async function translationModel(ownerSessionId:string|null):Promise<{provider:string;model:string;reasoningEffort?:string}|undefined>{
 const reply=await request(window,'sherlock:browser-model-request','sherlock:browser-model-reply',{ownerSessionId})
 if(reply.selection===undefined)return undefined
 const selected=JSON.parse(reply.selection)
 if(typeof selected?.provider!=='string'||typeof selected.model!=='string')throw Error('当前模型选择无效。')
 return{provider:selected.provider,model:selected.model,...(typeof selected.reasoningEffort==='string'?{reasoningEffort:selected.reasoningEffort}:{})}
}
