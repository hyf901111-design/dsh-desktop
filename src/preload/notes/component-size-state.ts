import {noteUiText as t} from '../../../packages/dsh-research-task-runtime/notes-locale.js'

export type NoteComponentLayout={width?:'full'|number;height?:'auto'|number}
export const boundNoteComponentSize=(value:number,min:number,max:number)=>Math.round(Math.max(min,Math.min(max,value)))
export function noteComponentSizeBounds(available:number){
 const maxWidth=Number.isFinite(available)&&available>0?Math.max(1,Math.floor(available)):320
 return {minWidth:Math.min(320,maxWidth),maxWidth,minHeight:180,maxHeight:2400}
}
export function noteComponentAvailableWidth(root:HTMLElement|null|undefined){
 const parent=root?.parentElement,view=root?.ownerDocument.defaultView
 if(!parent||!view)return 0
 const style=view.getComputedStyle(parent)
 return Math.max(0,Math.floor(parent.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)))
}
function availableWidth(editor:any,id:string){
 const elements:HTMLElement[]=Array.from(editor.domElement?.querySelectorAll?.('[data-note-research-block]')??[])
 const root=elements.find(element=>element.dataset.noteResearchBlock===id)
 // Collapsed descendants have zero layout width. Use their first measurable
 // ancestor, or the visible editor when the node is not mounted yet.
 for(let element=root;element?.parentElement;element=element.parentElement){const width=noteComponentAvailableWidth(element);if(width>0)return width}
 const element:HTMLElement|undefined=editor.domElement,view=element?.ownerDocument.defaultView
 if(!element||!view)return 0
 const style=view.getComputedStyle(element)
 return Math.max(0,Math.floor(element.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0)))
}
/** The resize handles and conversational layout both mutate only noteSize.
 * Preflight the entire batch before opening one undoable editor transaction. */
export function updateNoteComponentLayout(editor:any,ids:string[],layout:NoteComponentLayout,options:{availableWidth?(id:string):number}={}){
 if(!layout||typeof layout!=='object'||Array.isArray(layout)||Object.keys(layout).some(key=>!['width','height'].includes(key))||layout.width===undefined&&layout.height===undefined||layout.width!==undefined&&layout.width!=='full'&&!(typeof layout.width==='number'&&Number.isFinite(layout.width)&&layout.width>=1&&layout.width<=100000)||layout.height!==undefined&&layout.height!=='auto'&&!(typeof layout.height==='number'&&Number.isFinite(layout.height)&&layout.height>=1&&layout.height<=100000))throw Error(t('组件布局参数无效。'))
 if(editor?.isEditable===false)throw Error(t('当前笔记不可编辑。'))
 const updates=[...new Set(ids)].map(id=>{
  const block=editor?.getBlock(id)
  if(!block||typeof block.props?.payload!=='string')throw Error(t('组件已移除，请重新发送请求。'))
  const node=JSON.parse(block.props.payload),size={...node.noteSize},available=options.availableWidth?.(id)??availableWidth(editor,id),bounds=noteComponentSizeBounds(available)
  if(layout.width==='full')delete size.width
  else if(layout.width!==undefined)size.width=available>0?boundNoteComponentSize(layout.width,bounds.minWidth,bounds.maxWidth):Math.round(layout.width)
  if(layout.height==='auto')delete size.height
  else if(layout.height!==undefined)size.height=boundNoteComponentSize(layout.height,bounds.minHeight,bounds.maxHeight)
  return {id,node,size}
 }).filter(({node,size})=>JSON.stringify(node.noteSize??{})!==JSON.stringify(size))
 if(!updates.length)return []
 const tiptap=editor._tiptapEditor,undo=tiptap?.state?.plugins?.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(tiptap.state)?.undoManager
 const apply=()=>{for(const {id,node,size}of updates)editor.updateBlock(id,{props:{payload:JSON.stringify({...node,noteSize:size})}})}
 undo?.stopCapturing()
 if(editor.transact)editor.transact(apply);else apply()
 undo?.stopCapturing()
 return updates.map(({id})=>id)
}
