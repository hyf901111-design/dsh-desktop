import {randomUUID} from 'node:crypto'
import {canonicalConversationComponentInput} from '../../../packages/dsh-research-task-runtime/conversation-component-contract.js'
import type {ConversationComponentCapabilityAdapter,ConversationComponentVisibleContext,ConversationComponentExecutionIdentity} from '../../../packages/dsh-research-task-runtime/conversation-component-contract.js'
import {createClientCapabilityHost} from '../../../packages/dsh-research-task-runtime/client-capability-host.js'
import type {ClientCapabilityContext} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import type {NoteDocumentAdapter,NoteDocumentLease} from '../notes/document-capability-adapter'
import {registerTrustedMainWindowHandler,type TrustedWindow} from '../ipc-trust'
const validId=(v:any)=>typeof v==='string'&&v.length>0&&v.length<=256
import type {SpreadsheetService} from '../spreadsheet/service'
const modes=['conversation','research','notes','spreadsheet','knowledge']
type Binding={sessionId:string;mode:ClientCapabilityContext['mode'];owner:string;generation:string;expires:number;controller:AbortController;windowIdentity:unknown}
type CapabilityHandlers=NonNullable<Parameters<typeof createClientCapabilityHost>[0]['handlers']>
type Options={spreadsheet?:SpreadsheetService;sharedKnowledge?(current:()=>boolean,sessionId:string):CapabilityHandlers;knowledge?(current:()=>boolean,sessionId:string):NonNullable<Parameters<typeof createClientCapabilityHost>[0]['handlers']>;conversationComponents?:ConversationComponentCapabilityAdapter;notes?():NoteDocumentAdapter|undefined;owner():string;canRead(id:string):boolean;canWrite?(id:string):boolean;windowIdentity?():unknown;scheduled(id:string):boolean;send(value:any):void;canvasAvailable(id:string):boolean;canvas(id:string,method:string,args:any,signal?:AbortSignal):Promise<any>;window(action:string,args:any):Promise<any>;now?():number}
/** A fresh visible-header binding is distinct from the long-lived canvas data
 * binding. A background task or child can never borrow a visible parent lease. */
export class ClientCapabilityService{
 private binding?:Binding
 private turns=new Map<string,{generation:string;authorityId?:string;authoritySeq?:number;catalogRequired?:boolean;canvasAvailable:boolean;editable:boolean;context:ClientCapabilityContext;conversationIdentity?:ConversationComponentExecutionIdentity;sheet?:Awaited<ReturnType<SpreadsheetService['acquire']>>;notesIdentity?:string;notes?:NoteDocumentLease;host:ReturnType<typeof createClientCapabilityHost>;receipts:Map<string,{fingerprint:string;promise:Promise<any>;identity?:ConversationComponentExecutionIdentity;authority:string}>}>()
 private authorities=new Map<string,{id?:string;sequence:number;instruction:string}>()
 private callers=new WeakMap<AbortSignal,AbortSignal|undefined>()
 private now:()=>number
 constructor(private options:Options){this.now=options.now??Date.now}
 bind(input:any){
  if(!input||Object.keys(input).some(k=>!['sessionId','mode','active'].includes(k))||!validId(input.sessionId)||!modes.includes(input.mode)||typeof input.active!=='boolean')throw Error('客户端上下文无效。')
  if(!input.active){const old=this.binding;if(old&&old.sessionId===input.sessionId&&old.mode===input.mode){old.controller.abort();for(const turn of this.turns.values())if(turn.generation===old.generation)turn.notes?.dispose();this.binding=undefined}return{ok:true}}
  if(!this.options.canRead(input.sessionId)||this.options.scheduled(input.sessionId))throw Error('当前会话不可用。')
  const owner=this.options.owner(),old=this.binding
  const same=old&&old.sessionId===input.sessionId&&old.mode===input.mode&&old.owner===owner&&old.windowIdentity===this.options.windowIdentity?.()
  if(old&&!same){old.controller.abort();for(const turn of this.turns.values())if(turn.generation===old.generation)turn.notes?.dispose()}
  this.binding={windowIdentity:this.options.windowIdentity?.(),controller:same?old.controller:new AbortController(),sessionId:input.sessionId,mode:input.mode,owner,generation:same?old.generation:randomUUID(),expires:this.now()+90000}
  return{ok:true}
 }
 private current(sessionId:string){const b=this.binding;return b&&b.sessionId===sessionId&&b.owner===this.options.owner()&&b.windowIdentity===this.options.windowIdentity?.()&&b.expires>this.now()&&this.options.canRead(sessionId)&&!this.options.scheduled(sessionId)?b:undefined}
 currentVisibleContext():ConversationComponentVisibleContext|undefined{
  const binding=this.binding&&this.current(this.binding.sessionId)
  return binding?{ownerAccountId:binding.owner,sessionId:binding.sessionId,mode:binding.mode,generation:binding.generation}:undefined
 }
 async request(input:any,signal?:AbortSignal){
  if(!input||Object.keys(input).some(k=>!['sessionId','turnId','method','call','sourceInstruction','sourceInstructionDigest','authorityId','authoritySeq'].includes(k))||!validId(input.sessionId)||!validId(input.turnId)||!['catalog','execute','receipt','spreadsheet-reference'].includes(input.method)||['catalog','spreadsheet-reference'].includes(input.method)&&input.call!==undefined)throw Error('客户端操作请求无效。')
  if(input.sourceInstruction!==undefined&&(typeof input.sourceInstruction!=='string'||input.sourceInstruction.length>8000)||input.authorityId!==undefined&&!validId(input.authorityId)||(input.authorityId===undefined)!==(input.sourceInstruction===undefined)||(input.authorityId===undefined)!==(input.authoritySeq===undefined)||input.authoritySeq!==undefined&&(!Number.isSafeInteger(input.authoritySeq)||input.authoritySeq<0))throw Error('客户端请求来源无效。')
  if(input.sourceInstructionDigest!==undefined&&(input.sourceInstruction!==''||typeof input.sourceInstructionDigest!=='string'||!/^[a-f0-9]{64}$/.test(input.sourceInstructionDigest)))throw Error('客户端请求来源无效。')
  signal?.throwIfAborted()
  if(input.method==='spreadsheet-reference'){
   const binding=this.current(input.sessionId)
   if(binding?.mode!=='spreadsheet'||input.authorityId===undefined)return {}
   return this.options.spreadsheet?.referenceSettings({owner:binding.owner,sessionId:binding.sessionId},input.sourceInstruction,input.sourceInstructionDigest)??{}
  }
  if(input.method==='receipt')return this.recoverReceipt(input,signal)
  const binding=this.current(input.sessionId);if(!binding)throw Error('当前会话未绑定可见客户端，请回到该会话后重试。')
  const key=JSON.stringify([binding.owner,binding.sessionId,input.turnId])
  let turn=this.turns.get(key)
  const authorityId=input.authorityId,sequence=input.authoritySeq??-1,instruction=input.sourceInstruction??''
  let authority=this.authorities.get(key)
  if(authority&&(sequence<authority.sequence||sequence===authority.sequence&&(authority.id!==authorityId||authority.instruction!==instruction)))throw Error('客户端请求已被较新用户输入替代，请重新读取能力目录。')
  if(!authority||sequence>authority.sequence){
   if(this.authorities.size>=100&&!authority)throw Error('客户端操作历史已达上限，请重启客户端后继续。')
   authority={id:authorityId,sequence,instruction};this.authorities.set(key,authority)
  }
  const authorityCurrent=()=>this.authorities.get(key)===authority
  if(turn&&(turn.authorityId!==authorityId||turn.authoritySeq!==sequence)){
   // A newly admitted human can withdraw the old request in this same turn.
   // Revoke its lease immediately; completed receipts remain replayable.
   turn.notes?.dispose();turn.notes=undefined;turn.authorityId=authorityId;turn.authoritySeq=sequence;turn.catalogRequired=true
  }
  if(input.method==='catalog'){
   const sheetService=binding.mode==='spreadsheet'?this.options.spreadsheet:undefined
   const sheetKey={owner:binding.owner,sessionId:binding.sessionId}
   const sheetIdentity=sheetService?.identity(sheetKey)
   const adapter=binding.mode==='notes'?this.options.notes?.():undefined,notesIdentity=adapter?.identity(binding.sessionId)
   if(!turn||turn.catalogRequired||turn.generation!==binding.generation||turn.canvasAvailable!==(binding.mode==='research'&&this.options.canvasAvailable(binding.sessionId))||turn.editable!==(this.options.canWrite?.(binding.sessionId)??true)||turn.sheet?.identity!==sheetIdentity||turn.notesIdentity!==notesIdentity||binding.mode==='notes'&&!!adapter&&!turn.notes){
    if(this.turns.size>=100&&!turn)throw Error('客户端操作历史已达上限，请重启客户端后继续。')
    turn?.notes?.dispose()
    const leaseCurrent=()=>this.current(binding.sessionId)?.generation===binding.generation&&authorityCurrent()
    const notes=adapter?await adapter.acquire({sessionId:binding.sessionId,turnId:input.turnId,sourceInstruction:input.sourceInstruction??'',current:leaseCurrent,signal:signal??new AbortController().signal}):undefined
    const sheet=await sheetService?.acquire({key:sheetKey,turnId:input.turnId,authorityId,instruction:input.sourceInstruction,instructionDigest:input.sourceInstructionDigest,current:leaseCurrent,canWrite:()=>this.options.canWrite?.(binding.sessionId)??true,signal})
    if(!leaseCurrent()){notes?.dispose();throw Error('客户端请求已被较新用户输入替代，请重新读取能力目录。')}
    const context:ClientCapabilityContext={owner:binding.owner,sessionId:binding.sessionId,documentId:binding.generation,mode:binding.mode,editable:this.options.canWrite?.(binding.sessionId)??true,selectedBlockIds:[],canvasAvailable:binding.mode==='research'&&this.options.canvasAvailable(binding.sessionId),...notes?.context}
    const current=()=>leaseCurrent()&&(!notes||notes.current())?context:undefined
    const conversationComponents=this.options.conversationComponents
    const conversationIdentity:ConversationComponentExecutionIdentity|undefined=context.mode==='conversation'&&conversationComponents?{
     ownerAccountId:binding.owner,sessionId:binding.sessionId,turnId:input.turnId,mode:'conversation',
     ...(authorityId?{authorityId,authoritySeq:sequence}:{}),windowGeneration:binding.generation,
     current:()=>!!current()&&(this.options.canWrite?.(binding.sessionId)??true)
    }:undefined
    const host=createClientCapabilityHost({current,handlers:{...sheet?.handlers,...notes?.handlers,...this.options.sharedKnowledge?.(()=>!!current(),binding.sessionId),...(binding.mode==='knowledge'?this.options.knowledge?.(()=>!!current(),binding.sessionId):undefined),...conversationIdentity&&conversationComponents?{
     createConversationComponent:async(args,_context,signal,requestId)=>{
      if(!signal||!requestId||!conversationIdentity.current())throw Error('当前对话组件操作身份已失效。')
      signal.throwIfAborted();return conversationComponents.create(args,conversationIdentity,signal,requestId)
     }
    }:{}},
     canvas:context.canvasAvailable?async(method,args,_context,signal)=>{if(!current())throw Error('当前会话已变化。');return this.options.canvas(binding.sessionId,method,args,signal)}:undefined,
     window:async(action,args,_context,signal)=>{signal?.throwIfAborted();if(!current())throw Error('当前会话已变化。');return this.options.window(action,args)},
     navigate:async(mode,_context,signal)=>{
      if(!current())throw Error('当前会话已变化。');if(mode===binding.mode)return{mode}
      this.options.send({sessionId:binding.sessionId,mode})
      const deadline=Date.now()+4000
      while(Date.now()<deadline){if(signal&&this.callers.get(signal)?.aborted)throw Error('视图切换请求已发出；后续操作已取消，请查看当前视图。');const actual=this.current(binding.sessionId);if(actual?.mode===mode)return{mode};if(this.options.owner()!==binding.owner||this.binding&&this.binding.sessionId!==binding.sessionId)throw Error('当前会话已变化。');await new Promise(r=>setTimeout(r,20))}
      throw Error('会话视图切换未确认，请查看当前界面。')
     }})
    turn={generation:binding.generation,authorityId,authoritySeq:sequence,catalogRequired:false,context,conversationIdentity,sheet,notes,notesIdentity:notes?.context.documentId,canvasAvailable:context.canvasAvailable===true,editable:context.editable,host,receipts:turn?.receipts??new Map()};this.turns.set(key,turn)
   }
   const guidance=binding.mode==='knowledge'
    ?'先用 knowledge.inspect 获取当前列表、目录标识和筛选版本。使用 knowledge.filter 更新中间文件列表，依据客户端回执说明匹配结果。'
    :binding.mode==='spreadsheet'
     ?(turn.sheet?.guidance??'')+'表格能力只作用于当前工作簿。使用 spreadsheet.inspect 获取版本、工作表和目标范围，用户明确要求修改时才调用 spreadsheet.apply。依据已保存回执确认结果。'
     :'切换视图后重新读取目录；只有available:true的能力可执行。笔记能力使用当下可见编辑器捕获的文档与选区，较新输入或其它请求占用时拒绝旧操作。'
   return{mode:binding.mode,capabilities:turn.host.registry.catalog(turn.context),guidance,...turn.sheet&&{referenceScope:turn.sheet.referenceScope}}
  }
  if(!turn||turn.catalogRequired||turn.generation!==binding.generation)throw Error('请先重新读取当前客户端能力目录。')
  const call=input.call
  if(!call||Object.keys(call).some(k=>!['requestId','capability','arguments'].includes(k))||!validId(call.requestId)||!validId(call.capability)||JSON.stringify(call).length>1500000)throw Error('客户端调用格式无效。')
  const fingerprint=JSON.stringify([call.capability,call.capability==='conversation.components.create'?canonicalConversationComponentInput(call.arguments):call.arguments]),old=turn.receipts.get(call.requestId)
  if(old){if(old.fingerprint!==fingerprint)throw Error('请求标识已用于不同操作。');return old.promise}
  if(turn.receipts.size>=32)throw Error('本轮客户端操作数量已达上限。')
  const context=turn.context
  const controller=new AbortController(),executionSignal=AbortSignal.any([controller.signal,binding.controller.signal,...signal?[signal]:[]])
  this.callers.set(executionSignal,signal)
  const guard=setInterval(()=>{if(this.current(binding.sessionId)?.generation!==binding.generation||!authorityCurrent()||turn?.notes&&!turn.notes.current())controller.abort()},25)
  const promise=turn.host.executor.execute(call,context,executionSignal).finally(()=>{clearInterval(guard);this.callers.delete(executionSignal)});turn.receipts.set(call.requestId,{fingerprint,promise,identity:turn.conversationIdentity,authority:JSON.stringify([authorityId,sequence,instruction])});return promise
 }
 private async recoverReceipt(input:any,signal?:AbortSignal){
  const call=input.call
  if(!call||Object.keys(call).some(key=>!['requestId','capability','arguments'].includes(key))||!validId(call.requestId)||call.capability!=='conversation.components.create')throw Error('对话组件回执恢复参数无效。')
  const owner=this.options.owner(),fingerprint=JSON.stringify([call.capability,canonicalConversationComponentInput(call.arguments)])
  if(!owner||!this.options.canRead(input.sessionId))throw Error('对话组件回执无权读取。')
  const previous=this.turns.get(JSON.stringify([owner,input.sessionId,input.turnId]))?.receipts.get(call.requestId)
  const absent=()=>({requestId:call.requestId,capability:call.capability,status:'cancelled',message:'操作已取消，未查到已保存的对话组件。'})
  if(!previous)return absent()
  if(previous.fingerprint!==fingerprint||previous.authority!==JSON.stringify([input.authorityId,input.authoritySeq??-1,input.sourceInstruction??'']))throw Error('对话组件回执与原请求身份或内容不一致。')
  // Drain only the already-started request. This branch never catalogs, grants
  // a new lease, executes create, or changes the current human authority.
  const result=await previous.promise
  signal?.throwIfAborted()
  if(this.options.owner()!==owner||!this.options.canRead(input.sessionId))throw Error('对话组件回执账号或会话权限已变化。')
  const adapter=this.options.conversationComponents
  const saved=previous.identity&&adapter?.recover?await adapter.recover(call.arguments,previous.identity,call.requestId):result?.status==='succeeded'?result:undefined
  signal?.throwIfAborted()
  if(this.options.owner()!==owner||!this.options.canRead(input.sessionId))throw Error('对话组件回执账号或会话权限已变化。')
  return saved?{...saved,requestId:call.requestId,capability:call.capability}:absent()
 }
 dispose(){this.binding?.controller.abort();for(const turn of this.turns.values())turn.notes?.dispose();this.binding=undefined;this.turns.clear();this.authorities.clear()}
}
export function installClientCapabilityBinding(options:{ipcMain:any;getWindow():TrustedWindow|undefined;service:ClientCapabilityService}){
 options.ipcMain.removeHandler('client-capabilities:bind')
 registerTrustedMainWindowHandler(options.ipcMain,'client-capabilities:bind',options.getWindow,(_event,value)=>options.service.bind(value))
 return()=>{options.ipcMain.removeHandler('client-capabilities:bind');options.service.dispose()}
}
