import {useEffect, useRef, useState} from 'react'

/** Native capture also sees controls portalled into a note by another React root. */
export function useNoteComponentInteraction(){
 const root=useRef<HTMLElement>(null),[selected,setSelected]=useState(false)
 const select=(append=false)=>{setSelected(true);const element=root.current,sessionId=element?.closest<HTMLElement>('[data-note-source-session]')?.dataset.noteSourceSession,blockId=element?.closest<HTMLElement>('.bn-block-outer[data-id]')?.dataset.id;if(sessionId&&blockId)document.dispatchEvent(new CustomEvent('sherlock:notes-reference-component',{detail:{sessionId,blockId,append}}))}
 useEffect(()=>{
  // An importing file mounts its interactive frame later, without remounting this hook.
  const doc=root.current?.ownerDocument||document
  const down=(event:PointerEvent)=>{
   const element=root.current,target=event.target as HTMLElement|null;if(!element)return
   const action=target?.closest?.('button.en-component-more,button.en-component-close')
   // Header actions must not select this card, clear another card's selection,
   // or move the editor caret before their normal click handler runs.
   if(event.button===0&&action?.closest('.en-research-header,.en-file-header')&&action.closest('.en-root')){
    event.preventDefault();event.stopPropagation();return
   }
   if(target&&element.contains(target)){
    if(event.button===0&&target.closest?.('.en-research-header,.en-file-header'))select(event.shiftKey||event.metaKey||event.ctrlKey)
    return
   }
   // The reader's object tools live in document.body, outside the note frame.
   if(element.querySelector('[data-ppt-editor]')&&target?.closest?.('.sherlock-ppt-selection,.sherlock-ppt-format'))return
   const fileMenu=target?.closest<HTMLElement>('[data-note-file-menu]')
   if(fileMenu?.dataset.noteFileMenu&&fileMenu.dataset.noteFileMenu===element.querySelector('.en-file-header')?.id)return
   if(target?.closest?.('[data-ework-notes-composer-host]'))return
   setSelected(false)
  }
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented)setSelected(false)}
  const reference=(event:Event)=>{const value=(event as CustomEvent).detail,element=root.current,sessionId=element?.closest<HTMLElement>('[data-note-source-session]')?.dataset.noteSourceSession,blockId=element?.closest<HTMLElement>('.bn-block-outer[data-id]')?.dataset.id;if(sessionId&&blockId&&value?.sessionId===sessionId)setSelected(value.references.some((item:any)=>item.blockId===blockId))}
  doc.addEventListener('sherlock:notes-reference-state',reference)
  doc.addEventListener('pointerdown',down,true);doc.addEventListener('keydown',escape)
  return()=>{doc.removeEventListener('sherlock:notes-reference-state',reference);doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('keydown',escape)}
 },[])
 return {root,selected,select:(append:unknown=false)=>select(append===true)}
}
