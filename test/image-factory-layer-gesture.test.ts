// @vitest-environment happy-dom
import { randomUUID } from 'node:crypto'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { mountImageFactory } from '../src/preload/image-factory/view'
import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host'
import type { CanvasWrite, StoredCanvas, TextLayer } from '../src/shared/image-factory-canvas'

it('saves the layer order when capture is lost before pointerup reaches a sibling row', async () => {
  const layer = (text: string): TextLayer => ({
    id: randomUUID(), kind: 'text', text, x: .1, y: .1, width: .8,
    fontSize: 36, family: 'system-ui', weight: 400, color: '#ffffff', align: 'center'
  })
  const [bottom, top] = [layer('底层'), layer('顶层')]
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '测试画布', width: 800, height: 1000, layers: [bottom, top] }
  const write = vi.fn(async () => {})
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
    archive: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await act(async () => factory.open())
    const tools = document.querySelector('[aria-label="画布编辑工具"]')!
    await act(async () => Array.from(tools.querySelectorAll('button')).find(button => button.textContent?.trim() === '图层')!.click())
    const handles = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.if-layer-name'))
    expect(handles().map(button => button.textContent)).toEqual(['顶层', '底层'])
    const [source, destination] = handles()
    const target = destination!.parentElement!
    Object.defineProperty(source, 'setPointerCapture', { value: vi.fn() })
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(destination!)
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 50, 100, 32))
    const pointer = (type: string, node: Element, buttons: number, clientY: number) =>
      node.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, buttons, clientY }))
    await act(async () => {
      pointer('pointerdown', source!, 1, 36)
      pointer('lostpointercapture', source!, 0, 75)
      pointer('pointermove', destination!, 0, 75)
      pointer('pointerup', destination!, 0, 75)
    })
    expect(handles().map(button => button.textContent)).toEqual(['底层', '顶层'])
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ canvas: { ...canvas, layers: [top, bottom] } }))
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

it.each([false, true])('moves and resizes the selected text box (lost capture: %s)', async lostCapture => {
  const text: TextLayer = { id: randomUUID(), kind: 'text', text: '可拖动文字', x: .1, y: .2, width: .6,
    fontSize: 36, family: 'system-ui', weight: 400, color: '#ffffff', align: 'center' }
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '测试画布', width: 800, height: 1000, layers: [text] }
  const write = vi.fn(async (_value: CanvasWrite) => {})
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly resized: ResizeObserverCallback) {}
    observe(target: Element) {
      this.resized([{ target, contentRect: new DOMRect(0, 0, canvas.width, canvas.height) } as ResizeObserverEntry],
        this as unknown as ResizeObserver)
    }
    disconnect() {}
  })
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
    archive: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await act(async () => factory.open())
    const label = document.querySelector<HTMLElement>('[data-canvas-text-id]')!
    const frame = label.closest<HTMLElement>('.if-raster')!
    expect(frame.querySelector('[data-text-resize-handle]')).toBeNull()
    Object.defineProperty(label, 'setPointerCapture', { value: vi.fn() })
    vi.spyOn(label, 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 200, 480, 44))
    const pointer = (type: string, target: Element, buttons: number, clientX: number, clientY: number) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, buttons, clientX, clientY }))
    await act(async () => {
      pointer('pointerdown', label, 1, 120, 220)
      if (lostCapture) pointer('lostpointercapture', label, 1, 120, 220)
      pointer('pointerup', lostCapture ? frame : label, 0, 280, 620)
    })
    const saved = write.mock.calls.at(-1)?.[0].canvas.layers[0] as TextLayer
    expect(saved?.x).toBeCloseTo(.3)
    expect(saved?.y).toBeCloseTo(.6)
    expect(frame.querySelectorAll('[data-text-resize-handle]')).toHaveLength(6)
    const east = frame.querySelector<HTMLButtonElement>('[data-text-resize-handle="e"]')!
    Object.defineProperty(east, 'setPointerCapture', { value: vi.fn() })
    await act(async () => {
      pointer('pointerdown', east, 1, 720, 622)
      pointer('pointerup', frame, 0, 640, 622)
    })
    const narrowed = write.mock.calls.at(-1)?.[0].canvas.layers[0] as TextLayer
    expect(narrowed.width).toBeCloseTo(.5)
    expect(narrowed.fontSize).toBe(36)
    const corner = frame.querySelector<HTMLButtonElement>('[data-text-resize-handle="se"]')!
    Object.defineProperty(corner, 'setPointerCapture', { value: vi.fn() })
    await act(async () => {
      pointer('pointerdown', corner, 1, 640, 644)
      pointer('pointerup', frame, 0, 540, 633)
    })
    const scaled = write.mock.calls.at(-1)?.[0].canvas.layers[0] as TextLayer
    expect(scaled.width).toBeCloseTo(.375)
    expect(scaled.fontSize).toBeCloseTo(27)
    expect(document.querySelector<HTMLInputElement>('input[aria-label="字号"]')?.value).toBe('27')
    await act(async () => label.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(document.querySelector<HTMLTextAreaElement>('textarea[data-canvas-text-id]')?.value).toBe(text.text)
    expect(frame.querySelectorAll('[data-text-resize-handle]')).toHaveLength(0)
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

it.each([
  ['生成一张全新的 1:1 插画，标题为「柚子气泡水」。', '柚子气泡水', 1024, 1024],
  ['Please create a brand-new poster titled “Summer Market”.', 'Summer Market', 1080, 1350],
  ['给当前画布的标题换个配色。', '旧海报', 800, 1000],
] as const)('prepares a canvas request for %s', async (prompt, title, width, height) => {
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '旧海报', width: 800, height: 1000, layers: [] }
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas }), write: async () => {}, adopt: async () => false },
    archive: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await act(async () => factory.open())
    const sessionId = 'image-session'
    const id = randomUUID()
    await act(async () => {
      document.dispatchEvent(new CustomEvent('sherlock:image-factory-session', { detail: { sessionId } }))
    })
    const prepared = new Promise(resolve => {
      document.addEventListener('sherlock:image-factory-prepared', event => resolve((event as CustomEvent).detail), { once: true })
    })
    await act(async () => {
      document.dispatchEvent(new CustomEvent('sherlock:image-factory-prepare', {
        detail: { id, sessionId, scope: sessionId, prompt }
      }))
    })
    expect(await prepared).toMatchObject({ id, title, width, height })
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.unstubAllGlobals()
  }
})

it('zooms around the Command-wheel position and pans with Space without editing layers', async () => {
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '测试画布', width: 800, height: 1000, layers: [] }
  const write = vi.fn(async () => {})
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly resized: ResizeObserverCallback) {}
    observe(target: Element) {
      this.resized([{ target, contentRect: new DOMRect(0, 0, canvas.width, canvas.height) } as ResizeObserverEntry],
        this as unknown as ResizeObserver)
    }
    disconnect() {}
  })
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
    archive: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const input = document.body.appendChild(document.createElement('textarea'))
  try {
    await act(async () => factory.open())
    const frame = document.querySelector<HTMLElement>('.if-raster')!
    const scroll = frame.closest<HTMLElement>('.if-stage-scroll')!
    Object.defineProperty(scroll, 'setPointerCapture', { value: vi.fn() })
    vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(() => {
      const [x = 0, y = 0] = [...frame.style.transform.matchAll(/(-?\d+(?:\.\d+)?)px/g)].map(match => Number(match[1]))
      return new DOMRect(100 + x, 80 + y, Number.parseFloat(frame.style.width), Number.parseFloat(frame.style.height))
    })
    // Happy DOM's WheelEvent lacks the mouse fields inherited by browsers.
    const zoom = Object.assign(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }),
      { metaKey: true, clientX: 400, clientY: 420 })
    await act(async () => frame.dispatchEvent(zoom))
    expect(zoom.defaultPrevented).toBe(true)
    const magnified = frame.getBoundingClientRect()
    expect(magnified.width).toBeGreaterThan(800)
    expect(magnified.left + magnified.width * .375).toBeCloseTo(400)
    expect(magnified.top + magnified.height * .34).toBeCloseTo(420)
    const space = (type: string) => new KeyboardEvent(type, { key: ' ', code: 'Space', bubbles: true, cancelable: true })
    const pointer = (type: string, buttons: number, clientX: number, clientY: number) =>
      frame.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, buttons, clientX, clientY }))
    await act(async () => {
      expect(document.body.dispatchEvent(space('keydown'))).toBe(false)
      pointer('pointerdown', 1, 130, 225)
      pointer('pointerup', 0, 180, 295)
      document.body.dispatchEvent(space('keyup'))
    })
    expect(frame.getBoundingClientRect().left).toBeCloseTo(magnified.left + 50)
    expect(frame.getBoundingClientRect().top).toBeCloseTo(magnified.top + 70)
    input.focus()
    expect(input.dispatchEvent(space('keydown'))).toBe(true)
    await act(async () => Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === '适合')!.click())
    expect(frame.getBoundingClientRect().left).toBe(100)
    expect(frame.getBoundingClientRect().top).toBe(80)
    expect(frame.getBoundingClientRect().width).toBe(800)
    expect(write).not.toHaveBeenCalled()
  } finally {
    await act(async () => factory.dispose())
    input.remove()
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
