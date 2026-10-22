import {useEffect,useRef} from 'react'
import {NoteAiSelection} from './selection'
import {noteRangeHasOnlyText} from './replace-selection'
import {noteEditorVisible} from './editor-visibility'

type Component = {blockId:string;title:string;type:string;content:string;file?:{nodeId:string;authorizationId:string}}
type Range = {from:number;to:number;text:string;cursor:string}
export type NoteReferenceContext = {scope:'note'|'selection'|'none';components:Component[];range?:Range}

/** Selection belongs to the note, so moving focus to its composer keeps the reference. */
export function useNoteReferenceContext(editor:any,sessionId:string,root:React.RefObject<HTMLElement>,readOnly:boolean){
 const state=useRef({enabled:true,ids:[] as string[],range:undefined as Range|undefined}),publishRef=useRef(()=>{})
 const components=(includeContent=true):Component[]=>{
  const result:Component[]=[]
  const visit=(blocks:any[])=>{for(const block of blocks){
   if(['research','attachment'].includes(block.type)){
    let node:any;try{node=JSON.parse(block.props.payload)}catch{node={}}
    const element=includeContent?root.current?.querySelector<HTMLElement>('[data-id="'+CSS.escape(block.id)+'"] .en-research'):undefined
    const content=includeContent?JSON.stringify({spec:node.containerSpec,excerpt:node.excerpt,sourceText:node.sourceText,visibleText:element?.innerText?.slice(0,16000),status:node.generationStatus||node.importStatus}):''
    result.push({blockId:block.id,title:node.displayName||node.title||node.name||(block.type==='attachment'?'文件':'研究组件'),type:block.type,content:content.length>30000?content.slice(0,29970)+'\n[组件内容已截断]':content,...includeContent&&block.type==='attachment'&&typeof node.id==='string'&&typeof node.authorizationId==='string'?{file:{nodeId:node.id,authorizationId:node.authorizationId}}:{}})
   }
   if(block.children?.length)visit(block.children)
  }};visit(editor.document);return result
 }
 const capture=(includeContent=true):NoteReferenceContext=>{
  const current=state.current,all=components(includeContent)
  current.ids=current.ids.filter(id=>all.some(item=>item.blockId===id))
  if(current.range){
   const mapped=editor.getExtension(NoteAiSelection)?.currentRange(),range=mapped||current.range
   if(noteRangeHasOnlyText(editor._tiptapEditor.state.doc,range))current.range={...current.range,...range,text:editor._tiptapEditor.state.doc.textBetween(range.from,range.to,'\n')}
   else current.range=undefined
  }
  return {scope:current.range||current.ids.length?'selection':current.enabled?'note':'none',components:current.ids.length?all.filter(item=>current.ids.includes(item.blockId)):current.range||!current.enabled?[]:all,...current.range?{range:{...current.range}}:{}}
 }
 publishRef.current=()=>{if(!noteEditorVisible(root.current))return;const context=capture(false);document.dispatchEvent(new CustomEvent('sherlock:notes-reference-state',{detail:{sessionId,enabled:state.current.enabled,components:components(false).map(({content,...item})=>item),references:context.scope==='selection'?[...context.components.map(({content,...item})=>item),...context.range?[{blockId:'text-selection',type:'text',title:context.range.text}]:[]]:[]}}))}
 useEffect(()=>{
  const clear=()=>{state.current.ids=[];state.current.range=undefined;editor.getExtension(NoteAiSelection)?.highlight()}
  const selection=()=>{
   if(!noteEditorVisible(root.current))return
   const {doc,selection:range}=editor._tiptapEditor.state
   const selectedNode=range.node?.type.name==='blockContainer'?range.node.firstChild:range.node
   if(['research','attachment'].includes(selectedNode?.type.name)){
    let blockId=range.node.attrs.id
    for(let depth=range.$from.depth;!blockId&&depth>0;depth--)if(range.$from.node(depth).type.name==='blockContainer')blockId=range.$from.node(depth).attrs.id
    if(blockId&&(editor._tiptapEditor.isFocused||state.current.ids.includes(blockId))){state.current.range=undefined;if(!state.current.ids.includes(blockId))state.current.ids=[blockId];publishRef.current();return}
   }
   if(noteRangeHasOnlyText(doc,range)){
    state.current.ids=[];state.current.range={from:range.from,to:range.to,text:editor.getSelectedText(),cursor:editor.getTextCursorPosition().block.id}
    // Paint only on leaving the editor; ordinary text selection stays native.
   }else if(editor._tiptapEditor.isFocused){clear()}
   publishRef.current()
  }
  const component=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!noteEditorVisible(root.current)||detail?.sessionId!==sessionId)return
   state.current.range=undefined;editor.getExtension(NoteAiSelection)?.highlight()
   state.current.ids=detail.append?[...new Set([...state.current.ids,detail.blockId])]:[detail.blockId];publishRef.current()
  }
  const action=(event:Event)=>{const detail=(event as CustomEvent).detail;if(!noteEditorVisible(root.current)||detail?.sessionId!==sessionId)return
   if(detail.action==='toggle')state.current.enabled=!state.current.enabled
   if(detail.action==='remove'){if(detail.blockId==='text-selection')clear();else state.current.ids=state.current.ids.filter(id=>id!==detail.blockId)}
   publishRef.current()
  }
  const requested=(event:Event)=>{if((event as CustomEvent).detail?.sessionId===sessionId)publishRef.current()}
  const down=(event:PointerEvent)=>{
   if(!noteEditorVisible(root.current))return
   const target=event.target as HTMLElement
   if(target.closest?.('[data-ework-notes-composer-host]')){if(state.current.range)editor.getExtension(NoteAiSelection)?.highlight(state.current.range);return}
   if(!root.current?.contains(target)||target.closest('.en-inline-assistant,.en-research,.bn-side-menu'))return
   clear();publishRef.current()
  }
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&root.current?.contains(event.target as Node)){clear();publishRef.current()}}
  const offSelection=editor.onSelectionChange(selection),offChange=editor.onChange(()=>publishRef.current())
  document.addEventListener('sherlock:notes-reference-component',component);document.addEventListener('sherlock:notes-reference-action',action);document.addEventListener('sherlock:notes-reference-request',requested);document.addEventListener('pointerdown',down,true);document.addEventListener('keydown',escape)
  publishRef.current()
  return()=>{offSelection();offChange();document.removeEventListener('sherlock:notes-reference-component',component);document.removeEventListener('sherlock:notes-reference-action',action);document.removeEventListener('sherlock:notes-reference-request',requested);document.removeEventListener('pointerdown',down,true);document.removeEventListener('keydown',escape)}
 },[editor,sessionId,readOnly])
 return {capture,clear:()=>{state.current.ids=[];state.current.range=undefined;editor.getExtension(NoteAiSelection)?.highlight();publishRef.current()}}
}
