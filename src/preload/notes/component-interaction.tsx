import {useEffect, useRef, useState} from 'react'

/** Native capture also sees controls portalled into a note by another React root. */
export function useNoteComponentInteraction(){
 const root=useRef<HTMLElement>(null),[selected,setSelected]=useState(false)
 useEffect(()=>{
  // An importing file mounts its interactive frame later, without remounting this hook.
  const doc=root.current?.ownerDocument||document
  const down=(event:PointerEvent)=>{
   const element=root.current,target=event.target as HTMLElement|null;if(!element)return
   if(target&&element.contains(target)){
    if(event.button===0&&target.closest?.('.en-research-header,.en-file-header'))setSelected(true)
    return
   }
   // The reader's object tools live in document.body, outside the note frame.
   if(element.querySelector('[data-ppt-editor]')&&target?.closest?.('.sherlock-ppt-selection,.sherlock-ppt-format'))return
   setSelected(false)
  }
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented)setSelected(false)}
  doc.addEventListener('pointerdown',down,true);doc.addEventListener('keydown',escape)
  return()=>{doc.removeEventListener('pointerdown',down,true);doc.removeEventListener('keydown',escape)}
 },[])
 return {root,selected,select:()=>setSelected(true)}
}
