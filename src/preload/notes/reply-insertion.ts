import {useEffect} from 'react'
import {blockToNode} from '@blocknote/core'
import {TextSelection} from '@tiptap/pm/state'

/** Insert an atomic component at the retained body caret, preserving both sides of the paragraph. */
export function insertReplyComponent(editor:any,sessionId:string,messageId:string,text:string) {
 if(!editor.isEditable)throw Error('笔记当前不可编辑。')
 if(typeof text!=='string'||!text.trim()||text.length>100000||typeof messageId!=='string'||!messageId||messageId.length>512)throw Error('回复内容不可用。')
 const node={id:'note-reply-'+crypto.randomUUID(),kind:'assistant-result',title:'助手回复',excerpt:text,messageId,sessionId,noteReply:true,noteLibrary:true,generationStatus:'completed',createdAt:Date.now(),height:362}
 const block={id:crypto.randomUUID(),type:'research',props:{payload:JSON.stringify(node)}}
 const state=editor._tiptapEditor.state,undo=state.plugins.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(state)?.undoManager
 undo?.stopCapturing()
 if(state.selection.$from.parent.inlineContent){
  editor.transact((tr:any)=>{const content=blockToNode(block,editor.pmSchema);tr.replaceRangeWith(tr.selection.from,tr.selection.from,content);const end=tr.mapping.map(state.selection.from,1);tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(end,tr.doc.content.size)),1)).scrollIntoView()})
 }else editor.insertBlocks([block],editor.getTextCursorPosition().block,'after')
 undo?.stopCapturing();editor.focus()
 return node
}
export function useNoteReplyInsertion({editor,sessionId,root,readOnly}:any) {
 useEffect(()=>{
  const receive=(event:Event)=>{
   const value=(event as CustomEvent).detail
   if(value?.sessionId!==sessionId)return
   const ack=(ok:boolean,message?:string)=>document.dispatchEvent(new CustomEvent('sherlock:notes-add-reply-ack',{detail:{sessionId,actionId:value.actionId,ok,message}}))
   try{
    if(readOnly||!root.current?.isConnected||!root.current.getClientRects().length)throw Error('笔记当前不可编辑。')
    insertReplyComponent(editor,sessionId,value.messageId,value.text);ack(true)
   }catch(error){ack(false,(error as Error).message)}
  }
  document.addEventListener('sherlock:notes-add-reply',receive)
  return()=>document.removeEventListener('sherlock:notes-add-reply',receive)
 },[editor,sessionId,root,readOnly])
}
