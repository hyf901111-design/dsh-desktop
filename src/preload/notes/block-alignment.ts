import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'

export type NoteAlignmentTarget='paragraphs'|'researchComponents'
const paragraphs=new Set(['paragraph','heading','bulletListItem','numberedListItem','checkListItem','quote'])
export function noteAlignmentBlocks(blocks:readonly any[],target:NoteAlignmentTarget):any[]{
 return blocks.flatMap(block=>[...((target==='researchComponents'?block.type==='research':paragraphs.has(block.type))?[block]:[]),...noteAlignmentBlocks(block.children??[],target)])
}
/** Capture paragraph IDs while the reference range still belongs to the editor. */
export function selectedNoteParagraphIds(editor:any,range?:{from:number;to:number}):string[]{
 if(!range||range.from>=range.to)return []
 const ids:string[]=[]
 editor._tiptapEditor.state.doc.descendants((node:any,pos:number)=>{
  if(node.type.name!=='blockContainer'||!paragraphs.has(node.firstChild?.type.name))return
  const from=pos+2,to=from+node.firstChild.content.size
  if(range.from<to&&range.to>from)ids.push(node.attrs.id)
 })
 return ids
}
/** Shared by the paragraph menu and capabilities; only alignment props change. */
export function changeNoteAlignment(editor:any,ids:string[],alignment:'left'|'center'|'right'):string[]{
 if(editor.isEditable===false)throw Error(t('笔记当前不可编辑。'))
 if(!['left','center','right'].includes(alignment)||!ids.length||new Set(ids).size!==ids.length)throw Error(t('笔记对齐参数无效。'))
 const blocks=ids.map(id=>editor.getBlock(id))
 // Preserve native media/menu alignment too; conversational target filtering is
 // deliberately narrower and happens before this shared editor operation.
 if(blocks.some(block=>!block||!editor.schema?.blockSchema?.[block.type]?.propSchema?.textAlignment&&!paragraphs.has(block.type)&&!['research','attachment'].includes(block.type)))throw Error(t('对齐目标已变化，请重新选择后重试。'))
 const apply=()=>blocks.forEach(block=>editor.updateBlock(block.id,{props:{textAlignment:alignment}}))
 if(editor.transact)editor.transact(apply);else apply()
 return ids
}
