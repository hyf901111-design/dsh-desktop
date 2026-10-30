import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import {noteCapabilityFingerprint} from './data-refresh-guard'
import type {NoteContent} from '../../shared/workspace-notes'
type Lease={generationId:string;fingerprint:string;context:any;cancelled:boolean;pending:Set<string>;handler:((input:any)=>Promise<any>)&{dispose():void}}
/** A Harness turn owns a separate lease. It never impersonates the local Notes
 * composer request, and it cannot recapture a changed document mid-operation. */
export function createExternalNoteCapabilityLease(options:{sessionId:string;documentId:string;current():boolean;busy():boolean;snapshot():NoteContent;capture():Promise<{selectedBlockIds:string[];selectedParagraphIds:string[];selectedNativeBlockIds?:string[];requestContext:any}>;begin(id:string):void;create(lease:{generationId():string;initialFingerprint():string;current():boolean}):Lease['handler'];retaining(value:boolean):void}){
 let lease:Lease|undefined,acquiring:{requestId:string;generationId:string;cancelled:boolean}|undefined
 const usable=(value:Lease)=>lease===value&&!value.cancelled&&options.current()&&!options.busy()
 const clear=(value:Lease)=>{if(value.pending.size)return;value.handler.dispose();if(lease===value)lease=undefined}
 const cancel=(value:Lease)=>{value.cancelled=true;for(const requestId of value.pending)void value.handler({requestId,cancel:true});clear(value)}
 return{
  generationId:()=>lease&&!lease.cancelled?lease.generationId:'',
  pending:()=>!!lease?.pending.size||!!acquiring,
  owns:(id:string)=>!!lease?.pending.has(id),
  revoke:()=>{if(acquiring)acquiring.cancelled=true;if(lease)cancel(lease)},
  async handle(input:any){
   if(input?.sessionId!==options.sessionId)return
   if(input.release){if(acquiring&&acquiring.generationId===input.generationId)acquiring.cancelled=true;if(lease&&lease.generationId===input.generationId&&input.documentId===options.documentId)cancel(lease);return}
   if(input.cancel){if(acquiring&&acquiring.requestId===input.requestId)acquiring.cancelled=true;if(lease?.pending.has(input.requestId))cancel(lease);return}
   if(!input.generationId?.startsWith('harness:')||input.context?.documentId!==options.documentId||!options.current()||options.busy())throw Error(t('当前笔记正在处理其它请求或已切换，请稍后重试。'))
   if(input.action==='context.acquire'){
    if(acquiring||lease?.pending.size)throw Error(t('当前笔记操作尚未保存，请等待完成。'))
    if(lease?.generationId===input.generationId)throw Error(t('请使用当前笔记能力上下文，不能重置本轮校验。'))
    if(lease)cancel(lease)
    const capture={requestId:input.requestId,generationId:input.generationId,cancelled:false};acquiring=capture
    try{
     const fingerprint=noteCapabilityFingerprint(options.snapshot()),captured=await options.capture()
     if(capture.cancelled||!options.current()||options.busy()||noteCapabilityFingerprint(options.snapshot())!==fingerprint)throw Error(t('笔记内容已变化或操作已取消，请重新读取能力目录。'))
     const value={generationId:input.generationId,fingerprint,context:captured,cancelled:false,pending:new Set<string>()} as Lease
     value.handler=options.create({generationId:()=>usable(value)?value.generationId:'',initialFingerprint:()=>value.fingerprint,current:()=>usable(value)})
     lease=value;options.begin(value.generationId)
     return{status:'succeeded',context:{documentId:options.documentId,selectedBlockIds:captured.selectedBlockIds,selectedParagraphIds:captured.selectedParagraphIds,selectedNativeBlockIds:captured.selectedNativeBlockIds??[]},requestContext:captured.requestContext}
    }finally{if(acquiring===capture)acquiring=undefined}
   }
   const value=lease
   if(!value||!usable(value)||value.generationId!==input.generationId)throw Error(t('笔记能力上下文已失效，请重新发送请求。'))
   if(value.pending.size)throw Error(t('当前笔记操作尚未完成，请等待回执。'))
   value.pending.add(input.requestId);options.retaining(true)
   try{return await value.handler(input)}
   finally{value.pending.delete(input.requestId);options.retaining(false);if(value.cancelled)clear(value)}
  },
  dispose(){if(acquiring)acquiring.cancelled=true;if(lease)cancel(lease)}
 }
}
