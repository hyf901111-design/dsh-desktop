import { Window, DOMRect } from 'happy-dom'
import { expect, it, vi } from 'vitest'

// Vitest disables CSS imports by default; load the production raw asset as Vite does.
vi.mock('../src/preload/figma-task-scrollbar.css?raw', async () => ({
  default: (await import('node:fs')).readFileSync(new URL('../src/preload/figma-task-scrollbar.css', import.meta.url), 'utf8')
}))
import { mountFigmaTaskScrollbar } from '../src/preload/figma-task-scrollbar'

function fixture(dark = false) {
  const win = new Window(), doc = win.document
  doc.body.innerHTML = '<main><section class="lXshSW_root"><div class="odyssey-task-reveal"><div><div class="odyssey-task-list-seat"><ul class="lXshSW_list"><li>Task</li></ul></div></div></div></section></main><aside class="odyssey-task-sheet"><ul class="lXshSW_list"></ul></aside><aside class="t8lSSG_panelBody"><section class="lXshSW_root"><div class="odyssey-task-list-seat"><ul class="lXshSW_list"></ul></div></section></aside>'
  if (dark) doc.body.setAttribute('data-ds-dark-theme', '')
  const port = doc.querySelector('main ul')! as unknown as HTMLElement
  const size = { viewport: 168, content: 196, width: 780 }
  port.getBoundingClientRect = () => new DOMRect(435, 536, size.width, size.viewport) as DOMRect
  Object.defineProperties(port, {
    clientHeight: { get: () => size.viewport }, scrollHeight: { get: () => size.content },
    clientWidth: { get: () => size.width }
  })
  const observed = new Set<Element>()
  let resize = () => {}
  Object.defineProperty(win, 'ResizeObserver', { value: class {
    constructor(cb: () => void) { resize = cb }
    observe(e: Element) { observed.add(e) } unobserve(e: Element) { observed.delete(e) } disconnect() { observed.clear() }
  } })
  const dispose = mountFigmaTaskScrollbar(doc as unknown as Document)
  const tick = () => new Promise(resolve => setTimeout(resolve, 30))
  return { win, doc, port, size, dispose, tick, observed, resize: () => resize() }
}

it.each([false, true])('uses a dedicated 4 by 112 thumb without registering sheet or sidebar scrollbars (dark=%s)', async dark => {
  const f = fixture(dark)
  try {
    const track = f.doc.querySelector('[data-odyssey-task-scrollbar]')!, thumb = track.firstElementChild! as unknown as HTMLElement
    expect(f.doc.querySelectorAll('[data-odyssey-task-scrollbar]')).toHaveLength(1)
    expect(thumb.style.height).toBe('112px')
    expect(thumb.style.top).toBe('0px')
    expect((track as unknown as HTMLElement).style.height).toBe('160px')
    expect(f.port.getAttribute('tabindex')).toBe('0')
    expect(f.doc.querySelector('main ul')).toBe(f.port)
    expect(f.doc.querySelector('[data-odyssey-scrollport]')).toBeNull()
    f.port.scrollTop = 28
    f.port.dispatchEvent(new f.win.Event('scroll') as unknown as Event)
    expect(thumb.style.top).toBe('48px')
    expect(f.doc.querySelector('#odyssey-task-scrollbar-style')!.textContent).toContain('width:4px')
    expect(f.win.getComputedStyle(track.firstElementChild!).width).toBe('4px')
    expect(f.win.getComputedStyle(track.firstElementChild!).borderRadius).toBe('2px')
    expect(f.win.getComputedStyle(track.firstElementChild!).backgroundColor).toBe(dark ? '#333333' : '#e1e1e1')
  } finally { f.dispose(); await f.win.happyDOM.close() }
})

it('drags to both ends and forwards wheel over the overlay without replacing keyboard scroll behavior', async () => {
  const f = fixture()
  try {
    const track = f.doc.querySelector('[data-odyssey-task-scrollbar]')! as unknown as HTMLElement
    const thumb = track.firstElementChild! as HTMLElement
    let captured: number | null = null
    track.setPointerCapture = id => { captured = id }
    track.hasPointerCapture = id => captured === id
    track.releasePointerCapture = () => { captured = null }
    track.getBoundingClientRect = () => new DOMRect(1199, 540, 12, 160) as DOMRect
    const pointer = (target: HTMLElement, type: string, y: number) => target.dispatchEvent(new f.win.PointerEvent(type, { bubbles: true, button: 0, pointerId: 7, clientY: y }) as unknown as Event)
    pointer(thumb, 'pointerdown', 550)
    pointer(track, 'pointermove', 900)
    expect(f.port.scrollTop).toBe(28)
    pointer(track, 'pointermove', 100)
    expect(f.port.scrollTop).toBe(0)
    pointer(track, 'pointerup', 100)
    expect(captured).toBeNull()
    track.dispatchEvent(new f.win.WheelEvent('wheel', { deltaY: 10, cancelable: true }) as unknown as Event)
    expect(f.port.scrollTop).toBe(10)
    const key = new f.win.KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
    f.port.dispatchEvent(key as unknown as Event)
    expect(key.defaultPrevented).toBe(false)
    pointer(thumb, 'pointerdown', 550)
    pointer(track, 'pointercancel', 550)
    expect(captured).toBeNull()
  } finally { f.dispose(); await f.win.happyDOM.close() }
})

it('updates for content and resize, hides collapsed/inert/no-overflow lists, and cleans removed ports and disposal', async () => {
  const f = fixture()
  try {
    const track = f.doc.querySelector('[data-odyssey-task-scrollbar]')! as unknown as HTMLElement
    const thumb = track.firstElementChild! as HTMLElement
    f.size.content = 1000
    f.port.appendChild(f.doc.createElement('li') as unknown as Node)
    await f.tick()
    expect(parseFloat(thumb.style.height)).toBeCloseTo(26.88)
    f.size.viewport = 100
    f.resize(); await f.tick()
    expect(thumb.style.height).toBe('24px')
    f.doc.querySelector('.lXshSW_root')!.setAttribute('data-odyssey-task-collapsed', 'true')
    await f.tick(); expect(track.hidden).toBe(true)
    f.doc.querySelector('.lXshSW_root')!.removeAttribute('data-odyssey-task-collapsed')
    f.doc.querySelector('.odyssey-task-reveal')!.setAttribute('inert', '')
    await f.tick(); expect(track.hidden).toBe(true)
    f.doc.querySelector('.odyssey-task-reveal')!.removeAttribute('inert')
    await f.tick(); expect(track.hidden).toBe(false)
    f.size.content = 90; f.resize(); await f.tick(); expect(track.hidden).toBe(true)
    f.port.remove(); await f.tick()
    expect(track.isConnected).toBe(false)
    expect(f.port.hasAttribute('data-odyssey-task-scrollport')).toBe(false)
    expect(f.port.hasAttribute('tabindex')).toBe(false)
    f.dispose()
    expect(f.observed.size).toBe(0)
    expect(f.doc.querySelector('#odyssey-task-scrollbar-style')).toBeNull()
  } finally { f.dispose(); await f.win.happyDOM.close() }
})
