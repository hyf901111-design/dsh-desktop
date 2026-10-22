import type {CapabilityStyleEffect,CapabilityCreateEffect} from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import type {NoteContent} from '../../shared/workspace-notes'
import {changeNoteAlignment,noteAlignmentBlocks} from './block-alignment'
import {createNoteComponentDataActions} from './component-data-actions'
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
export function createNoteCapabilityActions(options:{editor:any;snapshot():NoteContent;current():boolean;generationId():string;initialFingerprint?():string;documentId:string;selectedBlockIds():string[];selectedParagraphIds?():string[];createComponent?(args:any,current:()=>boolean,requestId:string,report:(effect:CapabilityCreateEffect)=>Promise<void>):Promise<any>;cancelComponent?(requestId:string):void;reportEffect?(requestId:string,effect:CapabilityStyleEffect|CapabilityCreateEffect):Promise<unknown>;persist():Promise<void>;exportNote(args:any,current:()=>boolean):Promise<any>;settle():Promise<void>}){
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
  const saveMutation=async(changedBlockIds:string[],kind:'alignment'|'content',data?:any)=>{
   fingerprint=noteCapabilityFingerprint(options.snapshot())
   let effect:CapabilityStyleEffect={state:'applied',changedBlockIds,kind}
   const publish=()=>options.reportEffect?.(input.requestId,effect).catch(()=>{})
   const message=()=>t(kind==='alignment'?(effect.state==='saved'?'已保存 {count} 个块的对齐方式':'已应用但未确认保存 {count} 个块的对齐方式'):(effect.state==='saved'?'已保存 {count} 个组件的内容':'已应用但未确认保存 {count} 个组件的内容')).replace('{count}',String(changedBlockIds.length))
   const receipt=(status:string,detail='')=>({status,changedBlockIds,effect,...data?{data}:{},message:message()+detail})
   await publish()
   if(!current())return receipt('cancelled',t('后续操作已取消。'))
   try{await options.persist();effect={...effect,state:'saved'};await publish();if(current())await options.settle();return receipt(current()?'succeeded':'cancelled',current()?'':t('后续操作已取消。'))}
   catch(error){return receipt(current()?'failed':'cancelled',(error as Error).message)}
  }
  if(input.action==='notes.blocks.align'){
   const {scope,target,alignment}=input.args
   if(!['note','selected'].includes(scope)||!['paragraphs','researchComponents'].includes(target)||!['left','center','right'].includes(alignment))throw Error(t('笔记对齐参数无效。'))
   const all=noteAlignmentBlocks(options.editor.document,target),selected=target==='researchComponents'?options.selectedBlockIds():options.selectedParagraphIds?.()??[],bound=target==='researchComponents'?input.context.selectedBlockIds:input.context.selectedParagraphIds??[]
   if(scope==='selected'&&JSON.stringify(selected)!==JSON.stringify(bound))throw Error(t('对齐目标已变化，请重新选择后重试。'))
   const ids=(scope==='note'?all:all.filter(block=>selected.includes(block.id))).map(block=>block.id)
   if(!ids.length||scope==='selected'&&ids.length!==selected.length)throw Error(t('当前未选中对应类型的段落或研究组件。'))
   assertCurrent()
   return saveMutation(changeNoteAlignment(options.editor,ids,alignment),'alignment')
  }
  if(input.action==='notes.components.inspect'||input.action==='notes.components.apply'){
   const bound=input.context.selectedBlockIds,selectionCurrent=()=>Array.isArray(bound)&&bound.length===1&&JSON.stringify(options.selectedBlockIds())===JSON.stringify(bound)
   if(!selectionCurrent())throw Error(t('选中组件已变化，请重新发送请求。'))
   const block=options.editor.getBlock(bound[0])
   if(block?.type!=='research')throw Error(t('组件已移除，请重新发送请求。'))
   const node=JSON.parse(block.props.payload),applying=input.action==='notes.components.apply'
   if(applying&&input.args.blockId!==block.id)throw Error(t('组件不在当前引用范围内，请重新选择。'))
   let applied=false
   const handle=createNoteComponentDataActions({sessionId:input.context.sessionId,editor:options.editor,current:()=>current()&&selectionCurrent()&&noteCapabilityFingerprint(options.snapshot())===fingerprint,update:(id,next)=>{options.editor.updateBlock(id,{props:{payload:JSON.stringify(next)}});applied=true;fingerprint=noteCapabilityFingerprint(options.snapshot())}})
   const reply=await handle({sessionId:input.context.sessionId,requestId:input.requestId,expiresAt:Date.now()+100000,selectedIds:[node.id],method:applying?'apply':'inspect',args:applying?{requestId:input.requestId,revision:input.args.revision,changes:[{op:'update',id:node.id,fields:{containerSpec:input.args.containerSpec}}]}:{ids:[node.id]}})
   // The existing sink rechecks visibility after its mutation. Keep an honest
   // applied effect if cancellation arrived at that boundary; never claim no edit.
   if(applied&&reply?.error)return saveMutation([block.id],'content')
   if(reply?.error)throw Error(t(reply.error))
   if(!reply?.result)throw Error(t('客户端操作未返回有效回执。'))
   const data={...reply.result,blockId:block.id}
   return applying?saveMutation([block.id],'content',data):{status:'succeeded',data}
  }
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
