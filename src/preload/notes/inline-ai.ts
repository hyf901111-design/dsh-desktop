import type {NoteInsertionAnchor} from '../../shared/workspace-notes'
import * as Y from 'yjs'
import {absolutePositionToRelativePosition,relativePositionToAbsolutePosition,prosemirrorToYXmlFragment,ySyncPluginKey} from 'y-prosemirror'

/** Space is an AI shortcut only for a truly empty paragraph, never whitespace. */
export function noteInlineAiTrigger(editor:any,event:Pick<KeyboardEvent,'key'|'isComposing'|'keyCode'|'metaKey'|'ctrlKey'|'altKey'|'shiftKey'>):string|undefined{
 if(event.key!==' '||event.isComposing||event.keyCode===229||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!editor.isEditable||editor._tiptapEditor.view.composing)return
 const selection=editor._tiptapEditor.state.selection
 if(!selection.empty||selection.$from.parentOffset!==0||selection.$from.parent.type.name!=='paragraph'||selection.$from.parent.content.size!==0)return
 const block=editor.getTextCursorPosition().block
 return block.type==='paragraph'?block.id:undefined
}

export function captureNoteInlineAnchor(editor:any,documentId:string,blockId:string):NoteInsertionAnchor{
 let state=editor._tiptapEditor.state,binding=ySyncPluginKey.getState(state)?.binding
 if(!binding)throw Error('笔记插入位置尚未就绪，请稍后重试。')
 // y-prosemirror intentionally leaves createAndFill's sole empty paragraph out
 // of an empty Y fragment. Give that existing paragraph a durable identity;
 // a root-boundary relative position cannot prove that it survived deletion.
 if(binding.type.length===0){
  const blocks=editor.document,block=blocks[0]
  if(blocks.length!==1||block?.id!==blockId||block.type!=='paragraph'||block.content?.length||block.children?.length)throw Error('笔记插入位置尚未就绪，请稍后重试。')
  binding.type.doc.transact((transaction:Y.Transaction)=>{
   transaction.meta.set('addToHistory',false)
   prosemirrorToYXmlFragment(state.doc,binding.type)
  })
  state=editor._tiptapEditor.state;binding=ySyncPluginKey.getState(state)?.binding
  if(!binding||binding.type.length===0)throw Error('笔记插入位置尚未就绪，请稍后重试。')
 }
 return {documentId,blockId,position:Y.relativePositionToJSON(absolutePositionToRelativePosition(state.selection.from,binding.type,binding.mapping))}
}

/** Block IDs survive unrelated edits; absence is an error, never an append hint. */
export function noteInlineAnchorBlock(editor:any,anchor:NoteInsertionAnchor,documentId:string){
 if(anchor.documentId!==documentId||!editor.isEditable)throw Error('笔记文档已变化，原需求已保留。')
 const block=editor.getBlock(anchor.blockId)
 let identity=false
 try{
  const state=editor._tiptapEditor.state,binding=ySyncPluginKey.getState(state)?.binding
  if(binding&&anchor.position){
   const position=relativePositionToAbsolutePosition(binding.type.doc,binding.type,Y.createRelativePositionFromJSON(anchor.position),binding.mapping)
   if(position!==null){const resolved=state.doc.resolve(position);for(let depth=resolved.depth;depth>0;depth--)if(resolved.node(depth).type.name==='blockContainer'){identity=resolved.node(depth).attrs.id===anchor.blockId;break}}
  }
 }catch{}
 if(!block||block.type!=='paragraph'||!identity)throw Error('原插入位置已删除或变化，请在空白行重新启用 AI。')
 return block
}

/** The identity belongs to the Yjs block, never its reusable public ID. */
export function noteInlineBlockIdentity(editor:any,blockId:string):string|undefined{
 const binding=ySyncPluginKey.getState(editor._tiptapEditor.state)?.binding
 const visit=(type:any):string|undefined=>{
  if(type instanceof Y.XmlElement&&type.getAttribute('id')===blockId){const item=type._item;return item?item.id.client+':'+item.id.clock:undefined}
  for(const child of type.toArray?.()??[]){const found=visit(child);if(found)return found}
 }
 return binding?visit(binding.type):undefined
}

/** Component placeholders retain the anchor; completed prose can consume it. */
export function insertNoteInlineBlocks(editor:any,anchor:NoteInsertionAnchor,documentId:string,blocks:any[],complete=false,before?:{blockId:string;identity:string}){
 const block=noteInlineAnchorBlock(editor,anchor,documentId)
 if(before&&(!before.identity||editor.getBlock(before.blockId)?.type!=='research'||noteInlineBlockIdentity(editor,before.blockId)!==before.identity))throw Error('本次组件已变化，原需求已保留，请重新生成正文。')
 if(!blocks.length)throw Error('生成未返回可插入内容，请重试。')
 const state=editor._tiptapEditor.state,undo=state.plugins.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(state)?.undoManager
 undo?.stopCapturing()
 let created:any[]=[]
 try{
  if(before){
   // Keep these two local PM edits in the same proposal/history group, but
   // synchronize them separately: one disjoint replacement spanning existing
   // components can cause y-prosemirror to recreate their untouched Y items.
   created=editor.insertBlocks(blocks,before.blockId,'before')
   const original=noteInlineAnchorBlock(editor,anchor,documentId)
   if(complete&&Array.isArray(original.content)&&!original.content.length&&!original.children?.length)editor.removeBlocks([original.id])
  }else editor.transact(()=>{
   // Do not remove text, inline nodes, or child blocks typed while awaiting AI.
   const empty=Array.isArray(block.content)&&block.content.length===0&&!block.children?.length
   if(complete&&empty)created=editor.replaceBlocks([block.id],blocks).insertedBlocks
   else created=editor.insertBlocks(blocks,block.id,'before')
  })
  return created
 }finally{undo?.stopCapturing()}
}
