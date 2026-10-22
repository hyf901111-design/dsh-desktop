import type {NoteContent} from '../../shared/workspace-notes'
export const noteCapabilityFingerprint=(content:NoteContent)=>JSON.stringify([content.title,content.blocks])
export function noteResearchBlocks(blocks:any[]):any[]{return blocks.flatMap(block=>[...(block.type==='research'?[block]:[]),...noteResearchBlocks(block.children??[])])}
export type NotePresentation={theme?:'light'|'dark'|'enterprise'|'openterminal'|'auto';titleBar?:boolean}
/** Both component controls and conversational operations update the same node property. */
export function updateNoteComponentPresentation(editor:any,ids:string[],style:NotePresentation){
 const updates=ids.map(id=>{const block=editor.getBlock(id);if(!block||block.type!=='research')throw Error('组件已移除，请重新发送请求。');const node=JSON.parse(block.props.payload);return {id,node:{...node,notePresentation:{...node.notePresentation,...style}}}})
 const apply=()=>{for(const {id,node} of updates)editor.updateBlock(id,{props:{payload:JSON.stringify(node)}})}
 if(editor.transact)editor.transact(apply);else apply()
 return ids
}
export function createNoteCapabilityActions(options:{editor:any;snapshot():NoteContent;current():boolean;generationId():string;initialFingerprint?():string;documentId:string;selectedBlockIds():string[];createComponent?(args:any,current:()=>boolean,requestId:string):Promise<any>;cancelComponent?(requestId:string):void;persist():Promise<void>;exportNote(args:any,current:()=>boolean):Promise<any>;settle():Promise<void>}){
 let generation='',fingerprint=''
 const cancelled=new Set<string>()
 return async(input:any)=>{
  if(input?.cancel){cancelled.add(input.requestId);options.cancelComponent?.(input.requestId);return}
  const current=()=>options.current()&&options.generationId()===input.generationId&&options.documentId===input.context?.documentId&&!cancelled.has(input.requestId)
  const assertCurrent=()=>{if(!current())throw Error('笔记会话已变化或操作已取消。')}
  assertCurrent()
  if(generation!==input.generationId){generation=input.generationId;fingerprint=options.initialFingerprint?.()||noteCapabilityFingerprint(options.snapshot())}
  if(noteCapabilityFingerprint(options.snapshot())!==fingerprint)throw Error('笔记内容已变化，请重新发送请求，较新修改已保留。')
  if(input.action==='context')return {status:'succeeded'}
  if(input.action==='notes.components.create'){
   if(!options.createComponent||typeof input.args?.prompt!=='string'||!input.args.prompt.trim()||input.args.prompt.length>8000)throw Error('组件创建参数无效。')
   const before=noteCapabilityFingerprint(options.snapshot()),result=await options.createComponent(input.args,current,input.requestId)
   if(result.status==='succeeded'){
    const after=options.snapshot(),withoutCreated={...after,blocks:after.blocks.filter(block=>block.id!==result.blockId)}
    // Keep a stale guard if the human edited anything outside the new card.
    fingerprint=noteCapabilityFingerprint(withoutCreated)===before?noteCapabilityFingerprint(after):'document-changed-during-generation'
    await options.persist();await options.settle()
   }
   return result
  }
  if(input.action==='notes.components.style'){
   const {scope,theme,titleBar}=input.args
   if(!['note','selected'].includes(scope)||theme!==undefined&&!['light','dark','enterprise','openterminal','auto'].includes(theme)||titleBar!==undefined&&typeof titleBar!=='boolean'||theme===undefined&&titleBar===undefined)throw Error('组件样式参数无效。')
   const selected=options.selectedBlockIds()
   if(scope==='selected'&&JSON.stringify(selected)!==JSON.stringify(input.context.selectedBlockIds))throw Error('选中组件已变化，请重新发送请求。')
   const ids=scope==='note'?noteResearchBlocks(options.editor.document).map(b=>b.id):selected
   if(!ids.length)throw Error(scope==='note'?'当前笔记没有可设置样式的研究组件。':'当前未选中研究组件。')
   assertCurrent()
   const changedBlockIds=updateNoteComponentPresentation(options.editor,ids,{...theme!==undefined?{theme}:{},...titleBar!==undefined?{titleBar}:{}})
   fingerprint=noteCapabilityFingerprint(options.snapshot())
   await options.persist()
   // A committed mutation stays successful if cancellation arrives afterwards.
   await options.settle()
   return {status:'succeeded',changedBlockIds,message:`已保存 ${ids.length} 个组件的样式。`}
  }
  if(input.action==='notes.export'){
   await options.persist();assertCurrent()
   const result=await options.exportNote({...input.args,executionId:input.requestId},current)
   return result?.status==='saved'&&typeof result.path==='string'&&result.path?{status:'succeeded',path:result.path}:result?.status==='cancelled'?{status:'cancelled',message:'保存对话框已取消。'}:{status:'failed',message:'未收到导出成功回执。'}
  }
  throw Error('不支持的笔记客户端能力。')
 }
}
