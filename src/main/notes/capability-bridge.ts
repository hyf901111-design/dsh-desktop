import {randomUUID} from 'node:crypto'
import type {ClientCapabilityContext} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
type Pending={owner:string;sessionId:string;resolve(value:any):void;reject(error:Error):void;cleanup():void;signal:AbortSignal;current():boolean}
/** Fixed renderer capability transport; it never accepts a channel or executable source. */
export class NotesCapabilityBridge{
 private pending=new Map<string,Pending>()
 constructor(private send:(value:any)=>void){}
 request(action:'context'|'notes.export'|'notes.components.style'|'notes.components.create',args:any,context:ClientCapabilityContext,generationId:string,signal:AbortSignal,current:()=>boolean):Promise<any>{
  signal.throwIfAborted();if(!current())throw Error('笔记会话已变化。')
  const requestId=randomUUID()
  return new Promise((resolve,reject)=>{
   const end=(error:Error)=>{const job=this.pending.get(requestId);if(!job)return;job.cleanup();this.pending.delete(requestId);try{this.send({requestId,sessionId:context.sessionId,owner:context.owner,cancel:true})}catch{}reject(error)}
   const timer=setTimeout(()=>end(Error('笔记操作未及时确认，请查看文档当前状态。')),action==='notes.components.create'?250000:100000)
   const abort=()=>end(Error('笔记操作已取消。')),cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort)}
   this.pending.set(requestId,{owner:context.owner,sessionId:context.sessionId,resolve,reject,cleanup,signal,current});signal.addEventListener('abort',abort,{once:true})
   try{this.send({requestId,generationId,action,args,context,owner:context.owner,sessionId:context.sessionId})}catch{end(Error('笔记窗口不可用。'))}
  })
 }
 allowed(requestId:string,owner:string,sessionId:string){const job=this.pending.get(requestId);return !!job&&job.owner===owner&&job.sessionId===sessionId&&!job.signal.aborted&&job.current()}
 respond(input:any,owner:string){const job=this.pending.get(input.requestId);if(!job||job.owner!==owner||job.sessionId!==input.sessionId)return {ok:false};job.cleanup();this.pending.delete(input.requestId);if(!job.current())job.reject(Error('账号或会话已变化。'));else if(typeof input.error==='string')job.reject(Error(input.error.slice(0,1000)));else job.resolve(input.result);return{ok:true}}
 dispose(){for(const job of this.pending.values()){job.cleanup();job.reject(Error('笔记操作服务已停止。'))}this.pending.clear()}
}
