import type {CapabilityStyleEffect,CapabilityCreateEffect} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import type {NoteContent} from '../../shared/workspace-notes'
export const noteCapabilityFingerprint=(content:NoteContent)=>JSON.stringify([content.title,content.blocks])
export function noteResearchBlocks(blocks:any[]):any[]{return blocks.flatMap(block=>[...(block.type==='research'?[block]:[]),...noteResearchBlocks(block.children??[])])}
export type NotePresentation={theme?:'light'|'dark'|'enterprise'|'openterminal'|'auto';titleBar?:boolean}
/** Both component controls and conversational operations update the same node property. */
export function updateNoteComponentPresentation(editor:any,ids:string[],style:NotePresentation){
 const updates=ids.map(id=>{const block=editor.getBlock(id);if(!block||block.type!=='research')throw Error(t('组件已移除，请重新发送请求。'));const node=JSON.parse(block.props.payload);return {id,node:{...node,notePresentation:{...node.notePresentation,...style}}}})
 const apply=()=>{for(const {id,node} of updates)editor.updateBlock(id,{props:{payload:JSON.stringify(node)}})}
 if(editor.transact)editor.transact(apply);else apply()
 return ids
}
export function createNoteCapabilityActions(options:{editor:any;snapshot():NoteContent;current():boolean;generationId():string;initialFingerprint?():string;documentId:string;selectedBlockIds():string[];createComponent?(args:any,current:()=>boolean,requestId:string,report:(effect:CapabilityCreateEffect)=>Promise<void>):Promise<any>;cancelComponent?(requestId:string):void;reportEffect?(requestId:string,effect:CapabilityStyleEffect|CapabilityCreateEffect):Promise<unknown>;persist():Promise<void>;exportNote(args:any,current:()=>boolean):Promise<any>;settle():Promise<void>}){
 let generation='',fingerprint=''
 const cancelled=new Set<string>()
 return async(input:any)=>{
  if(input?.cancel){cancelled.add(input.requestId);options.cancelComponent?.(input.requestId);return}
  const current=()=>options.current()&&options.generationId()===input.generationId&&options.documentId===input.context?.documentId&&!cancelled.has(input.requestId)
  const assertCurrent=()=>{if(!current())throw Error(t('笔记会话已变化或操作已取消。'))}
  assertCurrent()
  if(generation!==input.generationId){generation=input.generationId;fingerprint=options.initialFingerprint?.()||noteCapabilityFingerprint(options.snapshot())}
  if(noteCapabilityFingerprint(options.snapshot())!==fingerprint)throw Error(t('笔记内容已变化，请重新发送请求，较新修改已保留。'))
  if(input.action==='context')return {status:'succeeded'}
  if(input.action==='notes.components.create'){
   if(!options.createComponent||typeof input.args?.prompt!=='string'||!input.args.prompt.trim()||input.args.prompt.length>8000)throw Error(t('组件创建参数无效。'))
   let effect:CapabilityCreateEffect|undefined
   const publish=async(next:CapabilityCreateEffect)=>{
    if(effect?.state==='saved'&&next.state!=='saved')return
    effect=next;await options.reportEffect?.(input.requestId,effect).catch(()=>{})
   }
   const receipt=(result:any)=>({...result,...effect?{effect,blockId:effect.blockId}:{},...!current()?{status:'cancelled'}:{},message:[result.message,effect?t(effect.state==='saved'?'已生成并保存组件':effect.state==='applied'?'已生成组件，尚未确认保存':'已插入组件占位块，尚未生成完成'):'',!current()?t('后续操作已取消。'):''].filter(Boolean).join(t('。'))})
   const before=noteCapabilityFingerprint(options.snapshot())
   try{
    const result=await options.createComponent(input.args,current,input.requestId,publish)
    if(result.status==='succeeded'){
     await publish({state:'applied',blockId:result.blockId})
     const after=options.snapshot(),withoutCreated={...after,blocks:after.blocks.filter(block=>block.id!==result.blockId)}
     // Keep a stale guard if the human edited anything outside the new card.
     fingerprint=noteCapabilityFingerprint(withoutCreated)===before?noteCapabilityFingerprint(after):'document-changed-during-generation'
     if(!current())return receipt(result)
     await options.persist();await publish({state:'saved',blockId:result.blockId})
     if(current())await options.settle()
    }
    return receipt(result)
   }catch(error){return receipt({status:'failed',message:(error as Error).message})}
  }
  if(input.action==='notes.components.style'){
   const {scope,theme,titleBar}=input.args
   if(!['note','selected'].includes(scope)||theme!==undefined&&!['light','dark','enterprise','openterminal','auto'].includes(theme)||titleBar!==undefined&&typeof titleBar!=='boolean'||theme===undefined&&titleBar===undefined)throw Error(t('组件样式参数无效。'))
   const selected=options.selectedBlockIds()
   if(scope==='selected'&&JSON.stringify(selected)!==JSON.stringify(input.context.selectedBlockIds))throw Error(t('选中组件已变化，请重新发送请求。'))
   const ids=scope==='note'?noteResearchBlocks(options.editor.document).map(b=>b.id):selected
   if(!ids.length)throw Error(t(scope==='note'?'当前笔记没有可设置样式的研究组件。':'当前未选中研究组件。'))
   assertCurrent()
   const changedBlockIds=updateNoteComponentPresentation(options.editor,ids,{...theme!==undefined?{theme}:{},...titleBar!==undefined?{titleBar}:{}})
   fingerprint=noteCapabilityFingerprint(options.snapshot())
   let effect:CapabilityStyleEffect={state:'applied',changedBlockIds}
   const publish=()=>options.reportEffect?.(input.requestId,effect).catch(()=>{})
   const receipt=(status:string,detail='')=>({status,changedBlockIds,effect,message:t(effect.state==='saved'?'已保存 {count} 个组件的样式。':'已应用但未确认保存 {count} 个组件的样式。').replace('{count}',String(ids.length))+detail})
   await publish()
   if(!current())return receipt('cancelled',t('后续操作已取消。'))
   try{
    await options.persist()
    effect={state:'saved',changedBlockIds};await publish()
    if(current())await options.settle()
    return receipt(current()?'succeeded':'cancelled',current()?'':t('后续操作已取消。'))
   }catch(error){return receipt(current()?'failed':'cancelled',(error as Error).message)}
  }
  if(input.action==='notes.export'){
   await options.persist();assertCurrent()
   const result=await options.exportNote({...input.args,executionId:input.requestId},current)
   return result?.status==='saved'&&typeof result.path==='string'&&result.path?{status:'succeeded',path:result.path}:result?.status==='cancelled'?{status:'cancelled',message:t('保存对话框已取消。')}:{status:'failed',message:t('未收到导出成功回执。')}
  }
  throw Error(t('不支持的笔记客户端能力。'))
 }
}
