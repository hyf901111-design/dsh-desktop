import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from 'react'
import type { Point } from './raster'

const origin = { x: 0, y: 0 }
const minZoom = .25
const maxZoom = 4
const textEntry = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'

export function useImageViewport(doc: Document, scroll: RefObject<HTMLDivElement>, frame: RefObject<HTMLDivElement>, visible: boolean) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState(origin)
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [panning, setPanning] = useState(false)
  const space = useRef(false)
  const drag = useRef<{ pointer: number; start: Point; pan: Point }>()
  const anchor = useRef<{ cursor: Point; fraction: Point }>()

  const reset = useCallback(() => {
    anchor.current = undefined
    setZoom(1)
    setPan(origin)
    if (scroll.current) {
      scroll.current.scrollLeft = 0
      scroll.current.scrollTop = 0
    }
  }, [scroll])

  useLayoutEffect(() => {
    const scroller = scroll.current
    if (!visible || !scroller) return
    const wheel = (event: WheelEvent) => {
      if (doc.body.dataset.workspaceSurface !== 'image-factory' || !(event.metaKey || event.ctrlKey) || !event.deltaY) return
      const rect = frame.current?.getBoundingClientRect()
      if (!rect?.width || !rect.height) return
      event.preventDefault()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller.clientHeight : 1
      const factor = Math.exp(-event.deltaY * unit * .002)
      anchor.current = {
        cursor: { x: event.clientX, y: event.clientY },
        fraction: { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height },
      }
      setZoom(old => Math.min(maxZoom, Math.max(minZoom, old * factor)))
    }
    scroller.addEventListener('wheel', wheel, { passive: false })
    return () => scroller.removeEventListener('wheel', wheel)
  }, [doc, frame, scroll, visible])

  useLayoutEffect(() => {
    const position = anchor.current
    anchor.current = undefined
    const rect = frame.current?.getBoundingClientRect()
    if (!position || !rect) return
    const { cursor, fraction } = position
    setPan(old => ({
      x: old.x + cursor.x - (rect.left + rect.width * fraction.x),
      y: old.y + cursor.y - (rect.top + rect.height * fraction.y),
    }))
  }, [frame, zoom])

  function endPan() {
    drag.current = undefined
    setPanning(false)
  }

  useLayoutEffect(() => {
    if (!visible) return
    const release = () => {
      space.current = false
      setSpaceHeld(false)
      endPan()
    }
    const keydown = (event: KeyboardEvent) => {
      if ((event.code !== 'Space' && event.key !== ' ') || event.metaKey || event.ctrlKey || event.altKey ||
          event.defaultPrevented || doc.body.dataset.workspaceSurface !== 'image-factory') return
      const target = event.target
      if (target instanceof Element && target !== doc.body && target !== doc.documentElement) {
        const scroller = scroll.current
        if (target.closest(textEntry) || target.closest('button:focus-visible, a[href]:focus-visible')) return
        if (!scroller?.contains(target) &&
            !(scroller?.matches(':hover') && scroller.closest('.image-factory')?.contains(target))) return
      }
      event.preventDefault()
      space.current = true
      setSpaceHeld(true)
    }
    const keyup = (event: KeyboardEvent) => {
      if ((event.code === 'Space' || event.key === ' ') && space.current) release()
    }
    const surfaceChanged = () => {
      if (doc.body.dataset.workspaceSurface !== 'image-factory') release()
    }
    doc.addEventListener('keydown', keydown)
    doc.addEventListener('keyup', keyup)
    doc.addEventListener('sherlock:workspace-surface-change', surfaceChanged)
    doc.defaultView?.addEventListener('blur', release)
    return () => {
      doc.removeEventListener('keydown', keydown)
      doc.removeEventListener('keyup', keyup)
      doc.removeEventListener('sherlock:workspace-surface-change', surfaceChanged)
      doc.defaultView?.removeEventListener('blur', release)
      release()
    }
  }, [doc, scroll, visible])

  function panPointer(event: PointerEvent<HTMLDivElement>, phase: 'start' | 'move' | 'end' | 'cancel') {
    if (phase === 'start') {
      if (!space.current || !event.isPrimary || event.button !== 0) return
      event.preventDefault()
      event.stopPropagation()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, pan }
      setPanning(true)
      return
    }
    const gesture = drag.current
    if (gesture?.pointer !== event.pointerId) return
    event.stopPropagation()
    if (phase !== 'cancel') {
      setPan({
        x: gesture.pan.x + event.clientX - gesture.start.x,
        y: gesture.pan.y + event.clientY - gesture.start.y,
      })
    }
    if (phase === 'end' || phase === 'cancel') endPan()
  }

  function stepZoom(factor: number) {
    anchor.current = undefined
    setZoom(old => Math.min(maxZoom, Math.max(minZoom, old * factor)))
  }

  return { zoom, pan, reset, stepZoom, spaceHeld, panning, panPointer, canZoomIn: zoom < maxZoom, canZoomOut: zoom > minZoom }
}
