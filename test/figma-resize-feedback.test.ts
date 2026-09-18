import { Window, DOMRect, type HTMLElement } from 'happy-dom'
import { expect, it } from 'vitest'
import { mountFigmaResizeFeedback } from '../src/preload/figma-resize-feedback'

it('follows actual clamped width without taking over native drag, and cleans cancellation', async () => {
  const win = new Window()
  const doc = win.document
  doc.body.innerHTML = '<aside class="pI_x6G_sidebarCol"></aside><div class="pI_x6G_handle" data-side="sidebar"></div>'
  let width = 280
  const surface = doc.querySelector('aside')!
  surface.getBoundingClientRect = () => ({ left:0, top:0, right:width, width, height:900 }) as DOMRect
  const queue = new Map<number, FrameRequestCallback>()
  let id = 0
  win.requestAnimationFrame = ((callback: FrameRequestCallback) => { queue.set(++id, callback); return id }) as unknown as typeof win.requestAnimationFrame
  win.cancelAnimationFrame = ((key: number) => { queue.delete(key) }) as unknown as typeof win.cancelAnimationFrame
  const tick = () => { const jobs = [...queue.values()]; queue.clear(); jobs.forEach(fn => fn(0)) }
  const dispose = mountFigmaResizeFeedback(doc as unknown as Document)
  const handle = doc.querySelector('.pI_x6G_handle')!
  const start = new win.PointerEvent('pointerdown', { bubbles:true, button:0, pointerId:1, clientY:436, cancelable:true })
  handle.dispatchEvent(start)
  expect(start.defaultPrevented).toBe(false)
  tick()
  expect(doc.querySelector('[data-odyssey-resize-width]')?.textContent).toBeUndefined()
  width = 240
  tick()
  const feedback = doc.querySelector<HTMLElement>('[data-odyssey-resize-feedback]')!
  expect(feedback.style.left).toBe('240px')
  expect(feedback.style.top).toBe('0px')
  const grip = feedback.querySelector<HTMLElement>('[data-odyssey-resize-grip]')!
  const center = () => parseFloat(feedback.style.top) + parseFloat(grip.style.top) + parseFloat(grip.style.height) / 2
  expect(center()).toBe(436)
  doc.dispatchEvent(new win.PointerEvent('pointermove', { pointerId:1, clientY:80 }))
  tick()
  expect(center()).toBe(80)
  doc.dispatchEvent(new win.PointerEvent('pointermove', { pointerId:2, clientY:650 }))
  tick()
  expect(center()).toBe(80)
  expect(doc.querySelector('[data-odyssey-resize-width]')?.textContent).toBeUndefined()
  doc.dispatchEvent(new win.PointerEvent('pointerup', { pointerId:2 }))
  expect(feedback.isConnected).toBe(true)
  doc.dispatchEvent(new win.PointerEvent('pointercancel', { pointerId:1 }))
  expect(feedback.isConnected).toBe(false)
  expect(queue.size).toBe(0)
  expect(doc.body.hasAttribute('data-odyssey-resizing')).toBe(false)
  dispose()
  handle.dispatchEvent(start)
  expect(queue.size).toBe(0)
  await win.happyDOM.close()
})

it('centers feedback in the 10px parallel-panel gutter, without a width label, and clears on removal', async () => {
  const win = new Window()
  const doc = win.document
  doc.body.innerHTML = '<aside class="t8lSSG_panel"><div class="t8lSSG_panelResize"></div></aside>'
  doc.querySelector('aside')!.getBoundingClientRect = () => ({ left:956, top:22, right:1356, width:400, height:856 }) as DOMRect
  const dispose = mountFigmaResizeFeedback(doc as unknown as Document)
  const handle = doc.querySelector('.t8lSSG_panelResize')!
  handle.dispatchEvent(new win.PointerEvent('pointerover', { bubbles:true, clientY:436 }))
  const feedback = doc.querySelector<HTMLElement>('[data-odyssey-resize-feedback]')!
  expect(feedback.style.left).toBe('951px')
  const grip = feedback.querySelector<HTMLElement>('[data-odyssey-resize-grip]')!
  expect(parseFloat(feedback.style.top) + parseFloat(grip.style.top) + parseFloat(grip.style.height) / 2).toBe(436)
  handle.dispatchEvent(new win.PointerEvent('pointermove', { bubbles:true, clientY:760 }))
  expect(parseFloat(feedback.style.top) + parseFloat(grip.style.top) + parseFloat(grip.style.height) / 2).toBe(760)
  expect(doc.querySelector('[data-odyssey-resize-width]')).toBe(null)
  handle.remove()
  doc.dispatchEvent(new win.PointerEvent('pointermove', { clientY:460 }))
  expect(feedback.isConnected).toBe(false)
  dispose()
  await win.happyDOM.close()
})

it('disables geometry interpolation throughout native window resizing and restores it afterward',async()=>{
 const win=new Window(),doc=win.document
 const dispose=mountFigmaResizeFeedback(doc as unknown as Document)
 win.dispatchEvent(new win.Event('resize'))
 expect(doc.documentElement.hasAttribute('data-odyssey-window-resizing')).toBe(true)
 await new Promise(resolve=>setTimeout(resolve,80));win.dispatchEvent(new win.Event('resize'))
 await new Promise(resolve=>setTimeout(resolve,80));expect(doc.documentElement.hasAttribute('data-odyssey-window-resizing')).toBe(true)
 await new Promise(resolve=>setTimeout(resolve,70));expect(doc.documentElement.hasAttribute('data-odyssey-window-resizing')).toBe(false)
 dispose();win.dispatchEvent(new win.Event('resize'));expect(doc.documentElement.hasAttribute('data-odyssey-window-resizing')).toBe(false)
 await win.happyDOM.close()
})
