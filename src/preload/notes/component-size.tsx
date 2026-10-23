import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React, {useLayoutEffect, useRef, useState} from 'react'
import {boundNoteComponentSize as bounded,noteComponentSizeBounds,noteComponentAvailableWidth,updateNoteComponentLayout} from './component-size-state'

type Axis = 'width' | 'height'
type Size = Partial<Record<Axis, number>>
type Gesture = {axis:Axis; pointerId:number; start:number; value:number; next:number}
const finite = (value:unknown):value is number => typeof value === 'number' && Number.isFinite(value)

/** Note dimensions are independent from the source research canvas geometry. */
export function useNoteComponentSize({block,node,editor,root,naturalHeight}:{block:any;node:any;editor:any;root:React.RefObject<HTMLElement>;naturalHeight:number}) {
 const [available,setAvailable]=useState(0),[preview,setPreview]=useState<Size>(),gesture=useRef<Gesture>()
 const {maxWidth,minWidth,minHeight,maxHeight}=noteComponentSizeBounds(available)
 const saved:Size=node.noteSize || {},height=bounded(preview?.height ?? (finite(saved.height)?saved.height:naturalHeight),minHeight,maxHeight)
 const width=bounded(preview?.width ?? (finite(saved.width)?saved.width:maxWidth),minWidth,maxWidth)
 useLayoutEffect(()=>{
  const parent=root.current?.parentElement;if(!parent)return
  const measure=()=>{const next=noteComponentAvailableWidth(root.current);setAvailable(old=>old===next?old:next)}
  measure();const observer=new ResizeObserver(measure);observer.observe(parent);return()=>observer.disconnect()
 },[root,node.importStatus])
 const commit=(axis:Axis,value:number)=>{
  const current=editor?.getBlock(block.id);if(!editor?.isEditable || !current)return
  try{JSON.parse(current.props.payload)}catch{return}
  updateNoteComponentLayout(editor,[block.id],{[axis]:bounded(value,axis==='width'?minWidth:minHeight,axis==='width'?maxWidth:maxHeight)},{availableWidth:()=>maxWidth})
 }
 const start=(axis:Axis,e:Pick<PointerEvent,'button'|'pointerId'|'clientX'|'clientY'|'preventDefault'|'stopPropagation'>,target:HTMLButtonElement)=>{
  if(e.button!==0 || !editor?.isEditable || gesture.current)return
  e.preventDefault();e.stopPropagation();target.focus({preventScroll:true})
  const value=axis==='width'?root.current?.getBoundingClientRect().width ?? width:height
  gesture.current={axis,pointerId:e.pointerId,start:axis==='width'?e.clientX:e.clientY,value,next:value}
  setPreview({[axis]:value});target.setPointerCapture(e.pointerId)
 }
 const begin=useRef(start);begin.current=start
 useLayoutEffect(()=>{
  const view=root.current?.ownerDocument.defaultView||window
  const overlap=(event:PointerEvent)=>{
   const element=root.current;if(!element)return
   // A reader's body-level object handles can cover the note's resize strip.
   // Own only that exact overlap; ordinary object handles and toolbars still edit the reader.
   if(event.button!==0||!editor?.isEditable||element.dataset.selected!=='true'||!(event.target as HTMLElement)?.closest?.('.sherlock-ppt-selection [data-pptx-handle]'))return
   for(const axis of ['width','height'] as const){
    const target=element.querySelector<HTMLButtonElement>('.en-component-resize-'+axis),rect=target?.getBoundingClientRect()
    if(!target||!rect||event.clientX<rect.left||event.clientX>=rect.right||event.clientY<rect.top||event.clientY>=rect.bottom)continue
    event.stopImmediatePropagation();begin.current(axis,event,target);return
   }
  }
  view.addEventListener('pointerdown',overlap,true)
  return()=>view.removeEventListener('pointerdown',overlap,true)
 },[root,editor])
 const handle=(axis:Axis)=>({
  onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>start(axis,e,e.currentTarget),
  onPointerMove:(e:React.PointerEvent<HTMLButtonElement>)=>{
   const active=gesture.current;if(!active || active.pointerId!==e.pointerId)return
   const next=bounded(active.value+(axis==='width'?e.clientX:e.clientY)-active.start,axis==='width'?minWidth:minHeight,axis==='width'?maxWidth:maxHeight)
   active.next=next;setPreview({[axis]:next})
  },
  onPointerUp:(e:React.PointerEvent<HTMLButtonElement>)=>{
   const active=gesture.current;if(!active || active.pointerId!==e.pointerId)return
   gesture.current=undefined;if(active.next!==Math.round(active.value))commit(axis,active.next)
   setPreview(undefined);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)
  },
  onPointerCancel:()=>{gesture.current=undefined;setPreview(undefined)},
  onLostPointerCapture:()=>{gesture.current=undefined;setPreview(undefined)},
  onKeyDown:(e:React.KeyboardEvent<HTMLButtonElement>)=>{
   if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='z'){e.preventDefault();e.stopPropagation();e.shiftKey?editor?.redo():editor?.undo();return}
   if(e.key==='Escape' && gesture.current){e.preventDefault();e.stopPropagation();gesture.current=undefined;setPreview(undefined);return}
   const keys=axis==='width'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown']
   if(![...keys,'Home','End'].includes(e.key))return
   e.preventDefault();e.stopPropagation()
   const min=axis==='width'?minWidth:minHeight,max=axis==='width'?maxWidth:maxHeight,value=axis==='width'?width:height
   commit(axis,e.key==='Home'?min:e.key==='End'?max:value+(e.key===keys[0]?-1:1)*(e.shiftKey?64:16))
  }
 })
 const alignment=block.props.textAlignment||'left'
 return {height,width,minWidth,maxWidth,minHeight,maxHeight,resizing:!!preview,style:{width:preview?.width ?? (finite(saved.width)?width:'100%'),maxWidth:'100%',minWidth:0,marginLeft:alignment==='left'?0:'auto',marginRight:alignment==='right'?0:'auto',textAlign:'left'} as React.CSSProperties,handle}
}

export function NoteComponentResizeHandles({size}:{size:ReturnType<typeof useNoteComponentSize>}) {
 return <>{size.resizing?<div className="en-component-resize-shield"/>:null}{(['width','height'] as const).map(axis=><button key={axis} type="button" className={'en-component-resize en-component-resize-'+axis} role="separator" aria-label={axis==='width'?t("调整组件宽度"):t("调整组件高度")} aria-orientation={axis==='width'?'vertical':'horizontal'} aria-valuemin={axis==='width'?size.minWidth:size.minHeight} aria-valuemax={axis==='width'?size.maxWidth:size.maxHeight} aria-valuenow={axis==='width'?size.width:size.height} aria-valuetext={(axis==='width'?size.width:size.height)+t(" 像素")} title={axis==='width'?t("拖动或使用左右方向键调整宽度"):t("拖动或使用上下方向键调整高度")} {...size.handle(axis)}/>)}</>
}
