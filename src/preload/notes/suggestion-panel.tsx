import React, { useEffect, useRef, useState } from 'react'

/** Presentation size only; resizing never changes the document or selection. */
export function SuggestionPanel({ children, header, footer }: { children: React.ReactNode; header: React.ReactNode; footer: React.ReactNode }) {
  const limit = () => Math.max(140, Math.min(640, window.innerHeight - 240))
  const [height, setHeight] = useState(240)
  const drag = useRef<{id:number;y:number;height:number}>()
  const resize = (value: number) => setHeight(Math.max(140, Math.min(limit(),value)))
  useEffect(()=>{const fit=()=>setHeight(value=>Math.min(value,limit()));window.addEventListener('resize',fit);return()=>window.removeEventListener('resize',fit)},[])
  const end = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = undefined
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <div className="en-preview-wrap">
    <div className="en-preview-resizer" role="separator" aria-label="调整建议面板高度" aria-orientation="horizontal" aria-valuemin={140} aria-valuemax={limit()} aria-valuenow={height} tabIndex={0}
      onPointerDown={event => { if(event.button!==0)return;event.preventDefault();drag.current={id:event.pointerId,y:event.clientY,height};event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => {if(drag.current?.id===event.pointerId)resize(drag.current.height+drag.current.y-event.clientY)}}
      onPointerUp={end} onPointerCancel={end} onLostPointerCapture={() => {drag.current=undefined}}
      onKeyDown={event => {if(['ArrowUp','ArrowDown','Home','End'].includes(event.key)){event.preventDefault();resize(event.key==='Home'?140:event.key==='End'?limit():height+(event.key==='ArrowUp'?32:-32))}}}><span/></div>
    <section className="en-preview" aria-label="AI 内容预览"><header>{header}</header><div className="en-preview-content" style={{height}}>{children}</div><footer>{footer}</footer></section>
  </div>
}
