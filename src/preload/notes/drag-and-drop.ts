import {useEffect, useRef, type RefObject} from 'react'
import {NOTE_FILE_DRAG_TYPE} from '../../shared/note-files'
import {isKnowledgeDragSource, KNOWLEDGE_FILE_DRAG_TYPE, readKnowledgeDrag, type KnowledgeDragFile} from '../../shared/knowledge-drag'

const COMPONENT_DRAG_TYPE='application/x-ework-note-component'
type Options={editor:any;root:RefObject<HTMLElement|null>;sessionId:string;clientId:string;readOnly:boolean;active():boolean;dropFiles(event:DragEvent,file?:KnowledgeDragFile):Promise<void>;setFileDrag(active:boolean):void}

/** Own native drops before BlockNote's document capture redirects blank-space drops. */
export function useNoteDragAndDrop(options:Options){
 const current=useRef(options);current.current=options
 useEffect(()=>{
  const root=options.root.current,view=root?.ownerDocument.defaultView
  if(!root||!view)return
  const contains=(event:Event)=>root.contains(event.target as Node)
  const componentDrag=(event:DragEvent)=>event.dataTransfer?.types.includes(COMPONENT_DRAG_TYPE)
  let knowledgeSource:{row:Element;file:KnowledgeDragFile}|undefined
  const rememberKnowledge=(event:DragEvent)=>{
   knowledgeSource=undefined
   if(current.current.readOnly||!current.current.active())return
   const row=(event.target as Element)?.closest?.('[data-knowledge-file-id]')
   const file=readKnowledgeDrag(event.dataTransfer)
   knowledgeSource=row&&file&&isKnowledgeDragSource(row,file,current.current.sessionId)?{row,file}:undefined
  }
  const endKnowledge=()=>{
   if(knowledgeSource)current.current.setFileDrag(false)
   knowledgeSource=undefined
  }
  const acceptsKnowledge=()=>knowledgeSource&&!current.current.readOnly&&current.current.active()&&current.current.editor.isEditable&&
   isKnowledgeDragSource(knowledgeSource.row,knowledgeSource.file,current.current.sessionId)
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
  const over=(event:DragEvent)=>{
   if(!contains(event)||!event.dataTransfer)return
   if(event.dataTransfer.types.includes(KNOWLEDGE_FILE_DRAG_TYPE)&&acceptsKnowledge()){
    event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect='copy';current.current.setFileDrag(true)
   }else if(componentDrag(event)){event.preventDefault();event.stopPropagation();event.dataTransfer.dropEffect=current.current.readOnly?'none':'move'}
  }
  const drop=(event:DragEvent)=>{
   if(!contains(event)||!event.dataTransfer)return
   const {editor,readOnly,sessionId,clientId,dropFiles,setFileDrag}=current.current
   if(event.dataTransfer.types.includes(KNOWLEDGE_FILE_DRAG_TYPE)){
    const file=readKnowledgeDrag(event.dataTransfer)
    const accepted=file&&knowledgeSource&&file.id===knowledgeSource.file.id&&file.label===knowledgeSource.file.label&&acceptsKnowledge()
    endKnowledge()
    if(accepted){event.preventDefault();event.stopPropagation();void dropFiles(event,file)}
    return
   }
   const files=event.dataTransfer.types.some(type=>type==='Files'||type===NOTE_FILE_DRAG_TYPE)
   if(!componentDrag(event)&&!files)return
   event.preventDefault();event.stopPropagation();setFileDrag(false)
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
  root.ownerDocument.addEventListener('dragstart',rememberKnowledge);view.addEventListener('dragend',endKnowledge,true)
  return()=>{view.removeEventListener('pointerdown',down,true);view.removeEventListener('dragstart',start,true);view.removeEventListener('dragover',over,true);view.removeEventListener('drop',drop,true);root.ownerDocument.removeEventListener('dragstart',rememberKnowledge);view.removeEventListener('dragend',endKnowledge,true)}
 },[options.editor,options.root])
}
