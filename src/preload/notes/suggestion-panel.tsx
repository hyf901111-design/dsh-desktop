import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React, {useLayoutEffect, useRef, useState} from 'react'

/** Content sets the initial height; a top-edge gesture opts into a bounded manual height. */
export function SuggestionPanel({children, header, footer}: {children: React.ReactNode; header: React.ReactNode; footer: React.ReactNode}) {
  const wrap = useRef<HTMLDivElement>(null), panel = useRef<HTMLElement>(null), content = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>(), [bounds, setBounds] = useState({min:24, max:640, current:24})
  const gesture = useRef<{pointer:number; y:number; height:number}>()
  const clamp = (value:number) => Math.round(Math.max(bounds.min, Math.min(bounds.max, value)))
  useLayoutEffect(() => {
    const section=panel.current, body=content.current
    if(!section||!body)return
    const workspace=section.closest('.en-main')
    const measure=()=>{
      const viewport=window.visualViewport, top=viewport?.offsetTop||0, bottom=top+(viewport?.height||window.innerHeight)
      const rect=section.getBoundingClientRect(), bodyHeight=body.getBoundingClientRect().height, chrome=rect.height-bodyHeight
      const topSpace=wrap.current?Math.max(0,rect.top-wrap.current.getBoundingClientRect().top):0
      const area=workspace?.getBoundingClientRect(), visibleTop=Math.max(top,area?.top??top), visibleBottom=Math.min(bottom,area?.bottom??bottom)
      const room=section.closest('.en-composer-area')?Math.min(visibleBottom-8,rect.bottom)-visibleTop-8-topSpace:visibleBottom-Math.max(visibleTop+8,rect.top)-8
      const max=Math.max(24,Math.min(640,Math.floor(room-chrome))), current=Math.round(Math.min(max,bodyHeight))
      setBounds(previous=>previous.max===max&&previous.current===current?previous:{min:24,max,current})
      setHeight(previous=>previous===undefined?undefined:Math.max(24,Math.min(max,previous)))
    }
    measure()
    const observer=new ResizeObserver(measure);observer.observe(section);observer.observe(body);if(workspace)observer.observe(workspace)
    window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure)
    return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.visualViewport?.removeEventListener('resize',measure)}
  }, [])
  return <div ref={wrap} className="en-preview-wrap">
    <section ref={panel} className="en-preview" aria-label={t("AI 内容预览")}>
      <div className="en-preview-resize" role="separator" tabIndex={0} aria-label={t("调整建议面板高度")} aria-orientation="horizontal" aria-valuemin={bounds.min} aria-valuemax={bounds.max} aria-valuenow={height??bounds.current}
        onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();gesture.current={pointer:event.pointerId,y:event.clientY,height:content.current?.getBoundingClientRect().height||bounds.current};event.currentTarget.setPointerCapture(event.pointerId)}}
        onPointerMove={event=>{const active=gesture.current;if(active?.pointer===event.pointerId){event.preventDefault();setHeight(clamp(active.height+active.y-event.clientY))}}}
        onPointerUp={event=>{if(gesture.current?.pointer!==event.pointerId)return;gesture.current=undefined;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)}}
        onPointerCancel={()=>{gesture.current=undefined}}
        onKeyDown={event=>{const step=event.key==='ArrowUp'?32:event.key==='ArrowDown'?-32:0;if(!step&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();event.stopPropagation();setHeight(clamp(event.key==='Home'?bounds.min:event.key==='End'?bounds.max:(content.current?.getBoundingClientRect().height||bounds.current)+step))}} />
      <header>{header}</header><div ref={content} className="en-preview-content" style={{height,maxHeight:bounds.max}}>{children}</div><footer>{footer}</footer>
    </section>
  </div>
}
