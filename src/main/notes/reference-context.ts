import type {NoteFiles} from './files'
import type {ResearchContextSource} from '../state/research-context-bridge'

type Options={owner:string;sessionId:string;files?:NoteFiles;signal:AbortSignal;current():boolean;captureSources?(sessionId:string,sources:ResearchContextSource[]):{captureId:string;totalSources:number}|Promise<{captureId:string;totalSources:number}>}
/** Paths and grants never come from the renderer into the model request. */
export async function prepareNoteReferences(value:any,options:Options){
 if(value===undefined)return undefined
 if(!value||!['note','selection','none'].includes(value.scope)||!Array.isArray(value.components)||value.components.length>1000)throw Error('笔记引用格式无效。')
 if(value.scope==='none')return {scope:'none',components:[]}
 const current=()=>{options.signal.throwIfAborted();if(!options.current())throw Error('账号或会话已变化，请重新发送。')}
 const components:any[]=[],sources:ResearchContextSource[]=[]
 for(const item of value.components){
  current()
  if(!item||typeof item.blockId!=='string'||!item.blockId||item.blockId.length>256||typeof item.title!=='string'||item.title.length>1000||!['research','attachment'].includes(item.type)||typeof item.content!=='string'||item.content.length>30000)throw Error('笔记引用格式无效。')
  const component={blockId:item.blockId,title:item.title,type:item.type,content:item.content};components.push(component)
  if(item.type!=='attachment')continue
  try{
   if(!options.files||!item.file)throw Error('附件授权不可用。')
   const file=await options.files.reference(options.owner,options.sessionId,item.file);current()
   sources.push({id:item.blockId,title:item.title,kind:'file',text:'',status:'ready',path:file.path,revision:file.revision})
  }catch{current();component.content=component.content.slice(0,29900)+'\n[附件原文读取失败：授权失效、导入未完成或文件不可用。]'}
 }
 if(JSON.stringify(components).length>300000)throw Error('笔记引用内容过长，请缩小范围。')
 current()
 if(!sources.length)return {scope:value.scope,components}
 if(!options.captureSources)throw Error('笔记资料服务暂不可用。')
 const capture=await options.captureSources(options.sessionId,sources);current()
 return {scope:value.scope,components,captureId:capture.captureId}
}
