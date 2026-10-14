import {useEffect, useRef, type RefObject} from 'react'
import {NOTE_FILE_DRAG_TYPE} from '../../shared/note-files'

const COMPONENT_DRAG_TYPE='application/x-ework-note-component'
type Options={editor:any;root:RefObject<HTMLElement|null>;sessionId:string;clientId:string;readOnly:boolean;dropFiles(event:DragEvent):Promise<void>;finish():void}

/** Own native drops before BlockNote's document capture redirects blank-space drops. */
export function useNoteDragAndDrop(options:Options){
 const current=useRef(options);current.current=options
 useEffect(()=>{
  const root=options.root.current,view=root?.ownerDocument.defaultView
  if(!root||!view)return
  const contains=(event:Event)=>root.contains(event.target as Node)
  const componentDrag=(event:DragEvent)=>event.dataTransfer?.types.includes(COMPONENT_DRAG_TYPE)
  let headerControl=false
  const down=(event:PointerEvent)=>{const target=event.target as Element;headerControl=contains(event)&&!!target.closest?.('.en-research-header,.en-file-header')&&!!target.closest('button,input,textarea,select,a,[role=separator]')}
  const start=(event:DragEvent)=>{
   const {editor,readOnly,sessionId,clientId}=current.current
   if(readOnly||!contains(event)||!event.dataTransfer)return
   const target=event.target as Element
   if(!target.closest?.('.en-research-header,.en-file-header'))return
   if(headerControl||target.closest('button,input,textarea,select,a,[role=separator]')){event.preventDefault();event.stopPropagation();return}
   const outer=target.closest<HTMLElement>('.bn-block-outer[data-id]'),block=outer&&editor.getBlock(outer.dataset.id)
   if(!block||!['research','attachment'].includes(block.type))return
   // Serialize the block identity, never the resident preview's DOM.
   event.stopPropagation();event.dataTransfer.clearData();event.dataTransfer.effectAllowed='move'
   event.dataTransfer.setData(COMPONENT_DRAG_TYPE,JSON.stringify({sessionId,clientId,blockId:block.id}))
  }
  const over=(event:DragEvent)=>{if(contains(event)&&componentDrag(event)){event.preventDefault();event.stopPropagation();event.dataTransfer!.dropEffect=current.current.readOnly?'none':'move'}}
  const drop=(event:DragEvent)=>{
   if(!contains(event)||!event.dataTransfer)return
   const {editor,readOnly,sessionId,clientId,dropFiles,finish}=current.current
   const files=event.dataTransfer.types.some(type=>type==='Files'||type===NOTE_FILE_DRAG_TYPE)
   if(!componentDrag(event)&&!files)return
   event.preventDefault();event.stopPropagation();finish()
   if(readOnly)return
   if(files){void dropFiles(event);return}
   try{
    const identity=JSON.parse(event.dataTransfer.getData(COMPONENT_DRAG_TYPE))
    if(identity.sessionId!==sessionId||identity.clientId!==clientId||typeof identity.blockId!=='string')return
    const block=editor.getBlock(identity.blockId)
    if(!block||!['research','attachment'].includes(block.type))return
    const target=(event.target as Element).closest<HTMLElement>('.bn-block-outer[data-id]'),reference=target?editor.getBlock(target.dataset.id):editor.document.at(-1)
    if(!reference||reference.id===block.id)return
    const placement=target&&event.clientY<target.getBoundingClientRect().top+target.getBoundingClientRect().height/2?'before':'after'
    const undo=editor._tiptapEditor.state.plugins.find((plugin:any)=>plugin.key.startsWith('y-undo'))?.getState(editor._tiptapEditor.state)?.undoManager
    undo?.stopCapturing();editor.transact(()=>{editor.removeBlocks([block.id]);editor.insertBlocks([block],reference,placement)});undo?.stopCapturing()
   }catch{return}
  }
  view.addEventListener('pointerdown',down,true);view.addEventListener('dragstart',start,true);view.addEventListener('dragover',over,true);view.addEventListener('drop',drop,true)
  return()=>{view.removeEventListener('pointerdown',down,true);view.removeEventListener('dragstart',start,true);view.removeEventListener('dragover',over,true);view.removeEventListener('drop',drop,true)}
 },[options.editor,options.root])
}
