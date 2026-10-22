import {randomUUID} from 'node:crypto'
import {createClientCapabilityHost} from '../../../packages/dsh-research-task-runtime/client-capability-host.js'
import type {ClientCapabilityContext} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {registerTrustedMainWindowHandler,type TrustedWindow} from '../ipc-trust'
const validId=(v:any)=>typeof v==='string'&&v.length>0&&v.length<=256
const modes=['conversation','research','notes']
type Binding={sessionId:string;mode:ClientCapabilityContext['mode'];owner:string;generation:string;expires:number;controller:AbortController;windowIdentity:unknown}
type Options={owner():string;canRead(id:string):boolean;canWrite?(id:string):boolean;windowIdentity?():unknown;scheduled(id:string):boolean;send(value:any):void;canvasAvailable(id:string):boolean;canvas(id:string,method:string,args:any,signal?:AbortSignal):Promise<any>;window(action:string,args:any):Promise<any>;now?():number}
/** A fresh visible-header binding is distinct from the long-lived canvas data
 * binding. A background task or child can never borrow a visible parent lease. */
export class ClientCapabilityService{
 private binding?:Binding
 private turns=new Map<string,{generation:string;canvasAvailable:boolean;editable:boolean;host:ReturnType<typeof createClientCapabilityHost>;receipts:Map<string,{fingerprint:string;promise:Promise<any>}>}>()
 private callers=new WeakMap<AbortSignal,AbortSignal|undefined>()
 private now:()=>number
 constructor(private options:Options){this.now=options.now??Date.now}
 bind(input:any){
  if(!input||Object.keys(input).some(k=>!['sessionId','mode','active'].includes(k))||!validId(input.sessionId)||!modes.includes(input.mode)||typeof input.active!=='boolean')throw Error('客户端上下文无效。')
  if(!input.active){const old=this.binding;if(old&&old.sessionId===input.sessionId&&old.mode===input.mode){old.controller.abort();this.binding=undefined}return{ok:true}}
  if(!this.options.canRead(input.sessionId)||this.options.scheduled(input.sessionId))throw Error('当前会话不可用。')
  const owner=this.options.owner(),old=this.binding
  const same=old&&old.sessionId===input.sessionId&&old.mode===input.mode&&old.owner===owner&&old.windowIdentity===this.options.windowIdentity?.()
  if(old&&!same)old.controller.abort()
  this.binding={windowIdentity:this.options.windowIdentity?.(),controller:same?old.controller:new AbortController(),sessionId:input.sessionId,mode:input.mode,owner,generation:same?old.generation:randomUUID(),expires:this.now()+90000}
  return{ok:true}
 }
 private current(sessionId:string){const b=this.binding;return b&&b.sessionId===sessionId&&b.owner===this.options.owner()&&b.windowIdentity===this.options.windowIdentity?.()&&b.expires>this.now()&&this.options.canRead(sessionId)&&!this.options.scheduled(sessionId)?b:undefined}
 async request(input:any,signal?:AbortSignal){
  if(!input||Object.keys(input).some(k=>!['sessionId','turnId','method','call'].includes(k))||!validId(input.sessionId)||!validId(input.turnId)||!['catalog','execute'].includes(input.method)||input.method==='catalog'&&input.call!==undefined)throw Error('客户端操作请求无效。')
  signal?.throwIfAborted()
  const binding=this.current(input.sessionId);if(!binding)throw Error('当前会话未绑定可见客户端，请回到该会话后重试。')
  const key=JSON.stringify([binding.owner,binding.sessionId,input.turnId])
  let turn=this.turns.get(key)
  if(input.method==='catalog'){
   if(!turn||turn.generation!==binding.generation||turn.canvasAvailable!==(binding.mode==='research'&&this.options.canvasAvailable(binding.sessionId))||turn.editable!==(this.options.canWrite?.(binding.sessionId)??true)){
    if(this.turns.size>=100&&!turn)throw Error('客户端操作历史已达上限，请重启客户端后继续。')
    const context:ClientCapabilityContext={owner:binding.owner,sessionId:binding.sessionId,documentId:binding.generation,mode:binding.mode,editable:this.options.canWrite?.(binding.sessionId)??true,selectedBlockIds:[],canvasAvailable:binding.mode==='research'&&this.options.canvasAvailable(binding.sessionId)}
    const current=()=>this.current(binding.sessionId)?.generation===binding.generation?context:undefined
    const host=createClientCapabilityHost({current,
     canvas:context.canvasAvailable?async(method,args,_context,signal)=>{if(!current())throw Error('当前会话已变化。');return this.options.canvas(binding.sessionId,method,args,signal)}:undefined,
     window:async(action,args,_context,signal)=>{signal?.throwIfAborted();if(!current())throw Error('当前会话已变化。');return this.options.window(action,args)},
     navigate:async(mode,_context,signal)=>{
      if(!current())throw Error('当前会话已变化。');if(mode===binding.mode)return{mode}
      this.options.send({sessionId:binding.sessionId,mode})
      const deadline=Date.now()+4000
      while(Date.now()<deadline){if(signal&&this.callers.get(signal)?.aborted)throw Error('视图切换请求已发出；后续操作已取消，请查看当前视图。');const actual=this.current(binding.sessionId);if(actual?.mode===mode)return{mode};if(this.options.owner()!==binding.owner||this.binding&&this.binding.sessionId!==binding.sessionId)throw Error('当前会话已变化。');await new Promise(r=>setTimeout(r,20))}
      throw Error('会话视图切换未确认，请查看当前界面。')
     }})
    turn={generation:binding.generation,canvasAvailable:context.canvasAvailable===true,editable:context.editable,host,receipts:turn?.receipts??new Map()};this.turns.set(key,turn)
   }
   const context:ClientCapabilityContext={owner:binding.owner,sessionId:binding.sessionId,documentId:binding.generation,mode:binding.mode,editable:this.options.canWrite?.(binding.sessionId)??true,selectedBlockIds:[],canvasAvailable:binding.mode==='research'&&this.options.canvasAvailable(binding.sessionId)}
   return{mode:binding.mode,capabilities:turn.host.registry.catalog(context),guidance:'切换视图后重新读取目录；只有available:true的能力可执行。笔记写操作需要笔记编辑器的独立文档上下文，本入口不会借用其他笔记。'}
  }
  if(!turn||turn.generation!==binding.generation)throw Error('请先重新读取当前客户端能力目录。')
  const call=input.call
  if(!call||Object.keys(call).some(k=>!['requestId','capability','arguments'].includes(k))||!validId(call.requestId)||!validId(call.capability)||JSON.stringify(call).length>1500000)throw Error('客户端调用格式无效。')
  const fingerprint=JSON.stringify([call.capability,call.arguments]),old=turn.receipts.get(call.requestId)
  if(old){if(old.fingerprint!==fingerprint)throw Error('请求标识已用于不同操作。');return old.promise}
  if(turn.receipts.size>=32)throw Error('本轮客户端操作数量已达上限。')
  const context:ClientCapabilityContext={owner:binding.owner,sessionId:binding.sessionId,documentId:binding.generation,mode:binding.mode,editable:this.options.canWrite?.(binding.sessionId)??true,selectedBlockIds:[],canvasAvailable:binding.mode==='research'&&this.options.canvasAvailable(binding.sessionId)}
  const controller=new AbortController(),executionSignal=AbortSignal.any([controller.signal,binding.controller.signal,...signal?[signal]:[]])
  this.callers.set(executionSignal,signal)
  const guard=setInterval(()=>{if(this.current(binding.sessionId)?.generation!==binding.generation)controller.abort()},25)
  const promise=turn.host.executor.execute(call,context,executionSignal).finally(()=>{clearInterval(guard);this.callers.delete(executionSignal)});turn.receipts.set(call.requestId,{fingerprint,promise});return promise
 }
 dispose(){this.binding?.controller.abort();this.binding=undefined;this.turns.clear()}
}
export function installClientCapabilityBinding(options:{ipcMain:any;getWindow():TrustedWindow|undefined;service:ClientCapabilityService}){
 options.ipcMain.removeHandler('client-capabilities:bind')
 registerTrustedMainWindowHandler(options.ipcMain,'client-capabilities:bind',options.getWindow,(_event,value)=>options.service.bind(value))
 return()=>{options.ipcMain.removeHandler('client-capabilities:bind');options.service.dispose()}
}
