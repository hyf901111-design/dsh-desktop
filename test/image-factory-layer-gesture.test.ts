// @vitest-environment happy-dom
import { randomUUID } from 'node:crypto'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { mountImageFactory } from '../src/preload/image-factory/view'
import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host'
import type { CanvasWrite, StoredCanvas, TextLayer } from '../src/shared/image-factory-canvas'

async function openCanvas(factory: ReturnType<typeof mountImageFactory>) {
  await act(async () => factory.open())
  await act(async () => {
    document.dispatchEvent(new CustomEvent('sherlock:image-factory-session', { detail: { sessionId: null } }))
    document.dispatchEvent(new CustomEvent('sherlock:image-factory-task-state', {
      detail: { tabs: [{ scope: null }], active: null, busy: false },
    }))
  })
}

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
    saveProject: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await openCanvas(factory)
    const tools = document.querySelector('[aria-label="画布编辑工具"]')!
    const toggle = Array.from(tools.querySelectorAll('button')).find(button => button.textContent?.trim() === '图层')!
    await act(async () => toggle.click())
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
    await act(async () => document.querySelector<HTMLElement>('.if-raster')!.click())
    expect(handles()).toHaveLength(2)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.if-layers .if-float-header button')).toBeNull()
    await act(async () => toggle.click())
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    await act(async () => toggle.click())
    expect(handles()).toHaveLength(2)
    await act(async () => toggle.click())
    expect(handles()).toHaveLength(0)
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

it('arms the text tool and places a focused, editable layer at the clicked position', async () => {
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '测试画布', width: 800, height: 1000, layers: [] }
  const write = vi.fn(async (_value: CanvasWrite) => {})
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
    saveProject: async () => {}, save: async () => ({})
  })
  try {
    await openCanvas(factory)
    const frame = document.querySelector<HTMLElement>('.if-raster')!
    const tools = document.querySelector('[aria-label="画布编辑工具"]')!
    const buttons = Array.from(tools.querySelectorAll('button'))
    const add = buttons.find(button => button.textContent?.trim() === '添加文本')!
    const mark = buttons.find(button => button.textContent?.trim() === '框选修改')!
    const editor = () => frame.querySelector<HTMLTextAreaElement>('textarea[data-canvas-text-id]')
    const press = (target: Element, clientX: number, clientY: number) => target.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, isPrimary: true, pointerId: 1, button: 0, buttons: 1, clientX, clientY
    }))
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(-60, 120, 400, 500))
    await act(async () => add.click())
    expect(add.getAttribute('aria-pressed')).toBe('true')
    expect(editor()).toBeNull()
    expect(write).not.toHaveBeenCalled()
    await act(async () => press(frame.parentElement!, 150, 70))
    expect(editor()).toBeNull()
    expect(add.getAttribute('aria-pressed')).toBe('true')
    await act(async () => press(frame, 80, 270))
    const input = editor()!
    expect(document.activeElement).toBe(input)
    expect(input.style.left).toBe('35%')
    expect(input.style.top).toBe('30%')
    expect(input.style.textAlign).toBe('left')
    expect(add.getAttribute('aria-pressed')).toBe('false')
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '春日海报')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', metaKey: true }))
    })
    expect(write.mock.calls.at(-1)?.[0].canvas.layers).toEqual([
      expect.objectContaining({ kind: 'text', text: '春日海报', x: .35, y: .3, align: 'left' })
    ])
    const persisted = frame.querySelector('[data-canvas-text-id]')!
    await act(async () => persisted.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    expect(editor()?.value).toBe('春日海报')
    await act(async () => add.click())
    await act(async () => frame.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })))
    expect(add.getAttribute('aria-pressed')).toBe('false')
    expect(editor()).toBeNull()
    await act(async () => add.click())
    expect(mark.getAttribute('aria-pressed')).toBe('false')
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
    saveProject: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await openCanvas(factory)
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

    const scroller = frame.closest<HTMLElement>('.if-stage-scroll')!
    await act(async () => pointer('pointerdown', scroller, 1, 0, 0))
    const layerText = frame.querySelector<HTMLElement>('[data-canvas-text-id]')!
    Object.defineProperty(layerText, 'setPointerCapture', { value: vi.fn() })
    const position = vi.spyOn(layerText, 'getBoundingClientRect').mockReturnValue(new DOMRect(240, 600, 300, 33))
    await act(async () => {
      pointer('pointerdown', layerText, 1, 260, 610)
      pointer('pointerup', scroller, 0, -340, -90)
    })
    const outside = write.mock.calls.at(-1)?.[0].canvas.layers[0] as TextLayer
    expect(outside.x).toBeCloseTo(-.45)
    expect(outside.y).toBeCloseTo(-.1)

    await act(async () => pointer('pointerdown', scroller, 1, 0, 0))
    const toggle = Array.from(document.querySelectorAll('.if-toolbar button')).find(button => button.textContent?.trim() === '图层')!
    await act(async () => (toggle as HTMLButtonElement).click())
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 1000))
    position.mockReturnValue(new DOMRect(-360, -100, 300, 33))
    const row = document.querySelector<HTMLButtonElement>('.if-layer-name')!
    await act(async () => row.click())
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(frame.style.transform).toBe('translate(610px, 583.5px)')
    await act(async () => {
      pointer('pointerdown', layerText, 1, 260, 490)
      pointer('pointerup', scroller, 0, 860, 1190)
    })
    const returned = write.mock.calls.at(-1)?.[0].canvas.layers[0] as TextLayer
    expect(returned.x).toBeCloseTo(scaled.x)
    expect(returned.y).toBeCloseTo(scaled.y)
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

it('recovers a distant text layer from Layers without altering its formatting', async () => {
  const text: TextLayer = { id: randomUUID(), kind: 'text', text: '画框外的文字', x: 2, y: -1, width: .4,
    fontSize: 36, family: 'system-ui', weight: 400, color: '#ffffff', align: 'center' }
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '恢复位置', width: 800, height: 1000, layers: [text] }
  const write = vi.fn(async (_value: CanvasWrite) => {})
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
    saveProject: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await openCanvas(factory)
    const tools = document.querySelector('[aria-label="画布编辑工具"]')!
    const toggle = Array.from(tools.querySelectorAll('button')).find(button => button.textContent?.trim() === '图层')!
    await act(async () => toggle.click())
    const row = document.querySelector<HTMLButtonElement>('.if-layer-name')!
    const restore = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.if-layers button'))
      .find(button => button.textContent?.trim() === '移回画框')
    expect(restore()).toBeUndefined()
    await act(async () => row.click())
    expect(restore()).toBeDefined()
    expect(write).not.toHaveBeenCalled()
    await act(async () => restore()!.click())
    expect(write.mock.calls.at(-1)?.[0].canvas.layers).toEqual([{ ...text, x: .6, y: 0 }])
    expect(restore()).toBeUndefined()
    expect(row.getAttribute('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(row)
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.unstubAllGlobals()
  }
})

it.each(['Backspace', 'Delete'])('deletes the selected text layer with %s after leaving text editing', async key => {
  const text: TextLayer = { id: randomUUID(), kind: 'text', text: '标题', x: .15, y: .2, width: .4,
    fontSize: 36, family: 'system-ui', weight: 600, color: '#fff', align: 'left' }
  const remaining = { ...text, id: randomUUID(), text: '保留' }
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '删除文字', width: 800, height: 1000, layers: [text, remaining] }
  const write = vi.fn(async (_value: CanvasWrite) => {})
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
    saveProject: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await openCanvas(factory)
    const keydown = (node: Element) => node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    const textLabel = () => document.querySelector<HTMLElement>(`[data-canvas-text-id="${text.id}"]`)!
    await act(async () => textLabel().dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const input = document.querySelector<HTMLTextAreaElement>('textarea[data-canvas-text-id]')!
    await act(async () => expect(keydown(input)).toBe(true))
    expect(write).not.toHaveBeenCalled()
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))
    expect(document.activeElement).toBe(document.querySelector('.if-raster'))
    const font = document.querySelector<HTMLInputElement>('input[aria-label="字号"]')!
    await act(async () => expect(keydown(font)).toBe(true))
    expect(write).not.toHaveBeenCalled()
    await act(async () => expect(keydown(document.activeElement!)).toBe(false))
    expect(write.mock.calls.at(-1)?.[0].canvas.layers).toEqual([remaining])
    expect(textLabel()).toBeNull()
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
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
    saveProject: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await openCanvas(factory)
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

it('opens an editable region comment when the pointer is released outside the image after losing capture', async () => {
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '测试画布', width: 800, height: 1000, layers: [
    { kind: 'image', id: randomUUID(), assetId: randomUUID(), mediaType: 'image/png' },
  ] }
  const image = { data: Uint8Array.of(1, 2, 3), mediaType: 'image/png' as const }
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(canvas.width)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(canvas.height)
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1, canvas, image }), write: async () => {}, adopt: async () => false },
    saveProject: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const submitted = vi.fn((event: Event) => event.preventDefault())
  document.addEventListener('sherlock:image-factory-comment', submitted)
  try {
    await openCanvas(factory)
    const frame = document.querySelector<HTMLElement>('.if-raster')!
    const scroller = frame.closest<HTMLElement>('.if-stage-scroll')!
    Object.defineProperty(frame, 'setPointerCapture', { value: vi.fn() })
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 800, 1000))
    vi.spyOn(scroller.parentElement!, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 980, 1160))
    const mark = Array.from(document.querySelectorAll('button')).find(button => button.textContent?.trim() === '框选修改')!
    await act(async () => mark.click())
    expect(document.querySelector('.if-mark-hint')).toBeNull()
    const pointer = (type: string, target: Element, buttons: number, x: number, y: number) =>
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, buttons, clientX: x, clientY: y }))
    await act(async () => {
      pointer('pointerdown', frame, 1, 550, 800)
      pointer('pointermove', frame, 1, 690, 990)
      pointer('lostpointercapture', frame, 0, 925, 1120)
      pointer('pointerup', scroller, 0, 925, 1120)
    })
    const selected = frame.querySelector<HTMLElement>('.if-region')
    expect(selected?.style.left).toBe('56.25%')
    expect(selected?.style.width).toBe('43.75%')
    expect(selected?.style.height).toBe('30%')
    expect(selected?.querySelectorAll('i')).toHaveLength(4)
    const input = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="修改意见"]')!
    expect(input).not.toBeNull()
    expect(input.closest<HTMLElement>('.if-comment')?.style.visibility).not.toBe('hidden')
    expect(document.activeElement).toBe(input)
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '把区域改成浅蓝')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const send = input.closest('form')!.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(send.disabled).toBe(false)
    await act(async () => send.click())
    expect(submitted).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ detail: expect.objectContaining({ prompt: '把区域改成浅蓝' }) }))
    const { id } = (submitted.mock.calls[0]![0] as CustomEvent).detail
    const report = (error?: string) =>
      document.dispatchEvent(new CustomEvent('sherlock:image-factory-comment-result', { detail: { id, error } }))
    expect(selected?.dataset.processing).toBe('true')
    expect(selected?.querySelectorAll('i')).toHaveLength(0)
    expect(document.querySelector('.if-comment')).toBeNull()
    await act(async () => { report() })
    expect(selected?.dataset.processing).toBe('true')
    expect(document.querySelector('.if-comment')).toBeNull()
    await act(async () => { report('服务暂时不可用') })
    const restored = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="修改意见"]')
    expect(selected?.dataset.processing).toBe('false')
    expect(selected?.querySelectorAll('i')).toHaveLength(4)
    expect(restored?.value).toBe('把区域改成浅蓝')
    expect(restored?.closest('form')?.querySelector('[role=alert]')?.textContent).toBe('服务暂时不可用')
    expect(restored?.closest('form')?.querySelector('button[type=submit]')?.textContent?.trim()).toBe('重试')
  } finally {
    document.removeEventListener('sherlock:image-factory-comment', submitted)
    await act(async () => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
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
    saveProject: async () => {}, save: async () => ({})
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const input = document.body.appendChild(document.createElement('textarea'))
  try {
    await openCanvas(factory)
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

it('opens a resident Workspace view from Images without triggering return to the original board', async () => {
  const center = document.createElement('div')
  const chooseNotes = vi.fn()
  center.className = 'pI_x6G_centerCol'
  center.innerHTML = '<div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="board-file-session"><div data-srb-tabs><button data-conversation-view-id="notes"></button></div></header></div>'
  center.querySelector('button')!.addEventListener('click', chooseNotes)
  document.body.append(center)
  const host = new WorkspaceSurfaceHost(document)
  const factory = mountImageFactory(document, host, {
    storage: { read: async () => ({ epoch: 1 }), write: async () => {}, adopt: async () => false },
    saveProject: async () => {}, save: async () => ({})
  })
  const returns: unknown[] = []
  const surfaceChanged = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (!detail.active) returns.push(detail.back)
  }
  document.addEventListener('sherlock:workspace-surface-change', surfaceChanged)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  try {
    await act(async () => factory.open())
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="展开工作区页签"]')!.click())
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="切换到笔记"]')!.click())
    expect(chooseNotes).toHaveBeenCalledOnce()
    expect(host.current()).toBeUndefined()
    expect(returns).toEqual([undefined])

    await act(async () => factory.open())
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="返回工作区"]')!.click())
    expect(returns).toEqual([undefined, true])
  } finally {
    document.removeEventListener('sherlock:workspace-surface-change', surfaceChanged)
    await act(async () => factory.dispose())
    host.dispose()
    center.remove()
    vi.unstubAllGlobals()
  }
})

it('keeps the rendered gallery mounted while a fresh task waits for its session and canvas', async () => {
  // @ts-expect-error The native renderer patch ships as untyped JavaScript.
  const { installImageFactoryContext } = await import('../scripts/lib/image-factory-native.mjs')
  const host = new WorkspaceSurfaceHost(document)
  const state = { current: 'image-task-original', byId: {} as Record<string, { blank: boolean }> }
  state.byId[state.current] = { blank: true }
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(listener => listener())
  let releaseSession: (() => void) | undefined
  let releaseCanvas: (() => void) | undefined
  const sessions = {
    list: {
      getSnapshot: () => state,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    },
    binding: (id: string) => state.byId[id] ? {} : undefined,
    open: (id: string) => { state.current = id; notify() },
    create: ({ sessionId }: { sessionId: string }) => new Promise<string>(resolve => {
      releaseSession = () => { state.byId[sessionId] = { blank: true }; notify(); resolve(sessionId) }
    }),
  }
  const runtime = installImageFactoryContext({ sessions, doc: document, win: window } as any)
  const factory = mountImageFactory(document, host, {
    storage: {
      read: scope => scope === 'image-task-original' ? Promise.resolve({ epoch: 1 })
        : new Promise(resolve => { releaseCanvas = () => resolve({ epoch: 1 }) }),
      write: async () => {}, adopt: async () => false,
    },
    saveProject: async () => {}, save: async () => ({}),
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const activeTask = () => document.querySelector<HTMLElement>('.if-top [role=tab][aria-selected=true]')
  const gallery = () => document.querySelector('.if-gallery')
  const galleryControl = () => gallery()?.querySelector<HTMLButtonElement>('.if-gallery-art')
  try {
    await act(async () => factory.open())
    const firstGallery = gallery()
    expect(firstGallery).not.toBeNull()
    expect(activeTask()?.dataset.id).toBe('image-task-original')
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="新建图片任务"]')!.click())
    const newTask = activeTask()?.dataset.id
    expect(newTask).toMatch(/^image-task-/)
    expect(newTask).not.toBe(state.current)
    expect(gallery()).toBe(firstGallery)
    expect(galleryControl()?.disabled).toBe(true)

    await act(async () => releaseSession!())
    expect(state.current).toBe(newTask)
    expect(activeTask()?.dataset.id).toBe(newTask)
    expect(gallery()).toBe(firstGallery)
    expect(galleryControl()?.disabled).toBe(true)

    await act(async () => releaseCanvas!())
    expect(gallery()).toBe(firstGallery)
    expect(galleryControl()?.disabled).toBe(false)
  } finally {
    await act(async () => { factory.dispose(); runtime.dispose(); host.dispose() })
    vi.unstubAllGlobals()
  }
})

it('drops a colorful poster preset into the zoomed frame as editable layers', async () => {
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '品牌海报', width: 800, height: 1000, layers: [] }
  const write = vi.fn(async (_value: CanvasWrite) => {})
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = new WorkspaceSurfaceHost(document)
  let factory!: ReturnType<typeof mountImageFactory>
  await act(async () => {
    factory = mountImageFactory(document, host, {
      storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
      saveProject: async () => {}, save: async () => ({})
    })
  })
  try {
    await openCanvas(factory)
    const tools = document.querySelector('[aria-label="画布编辑工具"]')!
    const button = [...tools.querySelectorAll('button')].find(item => item.textContent?.trim() === '品牌资产')
    expect(button).toBeDefined()
    await act(async () => button!.click())
    const preset = document.querySelector<HTMLButtonElement>('[data-brand-asset="product-poster"]')!
    expect(preset).toBeTruthy()
    const frame = document.querySelector<HTMLElement>('.if-raster')!
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(-60, 120, 400, 500))
    const dataTransfer = new DataTransfer()
    await act(async () => {
      const drag = (type: string) => Object.defineProperty(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 110, clientY: 380 }), 'dataTransfer', { value: dataTransfer })
      preset.dispatchEvent(drag('dragstart'))
      frame.dispatchEvent(drag('drop'))
    })
    expect(write).toHaveBeenCalledTimes(1)
    const layers = write.mock.calls[0]![0].canvas.layers
    expect(layers.map(layer => layer.kind)).toEqual(['shape', 'shape', 'shape', 'shape', 'brand', 'brand', 'text', 'text', 'text', 'text'])
    const graphic = layers.find(layer => layer.kind === 'brand' && layer.asset === 'graphic-top')
    expect(graphic).toMatchObject({ x: expect.closeTo(.425, 3), y: expect.closeTo(.11, 3) })
    const title = Array.from(frame.querySelectorAll('[data-canvas-text-id]')).find(node => node.textContent === '产品主标题')!
    await act(async () => title.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })))
    const editor = frame.querySelector<HTMLTextAreaElement>('textarea[data-canvas-text-id]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, '活动海报标题')
      editor.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(write.mock.calls.at(-1)![0].canvas.layers).toContainEqual(expect.objectContaining({ kind: 'text', text: '活动海报标题' }))
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

it('opens a wide gallery template in a fresh task with its own JPEG, artwork, shape and text layers', async () => {
  const target = 'image-task-website-banner'
  const jpeg = new Blob([new Uint8Array([255, 216, 255])], { type: 'image/jpeg' })
  const write = vi.fn(async (_value: CanvasWrite) => {})
  const read = vi.fn(async () => ({ epoch: 3 }))
  const load = vi.fn(async () => ({ ok: true, blob: async () => jpeg }))
  vi.stubGlobal('fetch', load)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockResolvedValue()
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(1440)
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(480)
  const host = new WorkspaceSurfaceHost(document)
  let factory!: ReturnType<typeof mountImageFactory>
  const onUsePrompt = vi.fn()
  const action = (event: Event) => {
    const { requestId, kind } = (event as CustomEvent).detail
    if (kind !== 'new' || !requestId) return
    document.dispatchEvent(new CustomEvent('sherlock:image-factory-session', { detail: { sessionId: target } }))
    document.dispatchEvent(new CustomEvent('sherlock:image-factory-task-state', {
      detail: { tabs: [{ scope: null }, { scope: target }], active: target, busy: false },
    }))
    document.dispatchEvent(new CustomEvent('sherlock:image-factory-task-created', { detail: { requestId, scope: target } }))
  }
  document.addEventListener('sherlock:image-factory-use-prompt', onUsePrompt)
  document.addEventListener('sherlock:image-factory-task-action', action)
  try {
    await act(async () => {
      factory = mountImageFactory(document, host, { storage: { read, write, adopt: async () => false }, saveProject: async () => {}, save: async () => ({}) })
    })
    await openCanvas(factory)
    const card = document.querySelector<HTMLButtonElement>('.if-gallery-art[aria-label^="奔流的线 ·"]')!
    await act(async () => card.click())
    const [{ scope, canvas, image }] = write.mock.calls[0]!
    expect(scope).toBe(target)
    expect(canvas).toMatchObject({ title: '奔流的线', width: 1440, height: 480 })
    expect(canvas.layers.map(layer => layer.kind)).toEqual(['image', 'shape', 'shape', 'brand', 'brand', 'text', 'text'])
    expect(canvas.layers).toContainEqual(expect.objectContaining({ kind: 'text', text: '奔流的线' }))
    expect(canvas.layers).toContainEqual(expect.objectContaining({ kind: 'brand', asset: 'logo-white' }))
    expect(image).toEqual(new Uint8Array([255, 216, 255]))
    expect(onUsePrompt).not.toHaveBeenCalled()
    expect(document.querySelector('.if-raster')).toBeTruthy()
  } finally {
    document.removeEventListener('sherlock:image-factory-task-action', action)
    document.removeEventListener('sherlock:image-factory-use-prompt', onUsePrompt)
    await act(async () => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})

it('groups two selected layers, restores the group with redo, and returns from templates to the brand drawer', async () => {
  const first = { kind: 'shape' as const, id: randomUUID(), x: .18, y: .25, width: .2, height: .18, color: '#005096' }
  const second = { ...first, id: randomUUID(), x: .45, color: '#44bbff' }
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '编组画板', width: 800, height: 1000, layers: [first, second] }
  const write = vi.fn(async (_value: CanvasWrite) => {})
  const host = new WorkspaceSurfaceHost(document)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let factory!: ReturnType<typeof mountImageFactory>
  try {
    await act(async () => {
      factory = mountImageFactory(document, host, {
        storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
        saveProject: async () => {}, save: async () => ({}),
      })
    })
    await openCanvas(factory)
    const tool = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.if-toolbar button')]
      .find(button => (button.getAttribute('aria-label') ?? button.textContent)?.trim() === label)!
    const row = (id: string) => document.querySelector<HTMLButtonElement>('[data-layer-id="' + id + '"] .if-layer-name')!
    const frame = () => document.querySelector<HTMLElement>('.if-raster')!
    const key = (key: string, shiftKey = false) => frame().dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: true, shiftKey, bubbles: true, cancelable: true }))
    const layers = () => write.mock.calls.at(-1)?.[0].canvas.layers
    await act(async () => tool('图层').click())
    await act(async () => {
      row(first.id).click()
      row(second.id).dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))
    })
    expect(tool('编组')).toBeUndefined()
    await act(async () => key('g'))
    const groupId = (layers()?.[0] as typeof first & { groupId?: string })?.groupId
    expect(groupId).toBeTruthy()
    expect(layers()).toEqual([{ ...first, groupId }, { ...second, groupId }])
    expect(row(groupId!)?.textContent).toBe('编组 · 2')
    await act(async () => key('z'))
    expect(layers()).toEqual([first, second])
    await act(async () => key('Z', true))
    expect(layers()).toEqual([{ ...first, groupId }, { ...second, groupId }])
    await act(async () => tool('上一步').click())
    expect(layers()).toEqual([first, second])
    await act(async () => tool('下一步').click())
    expect(layers()).toEqual([{ ...first, groupId }, { ...second, groupId }])

    expect(document.querySelector('.if-drawer [data-drawer-tab]')).toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('.if-toolbar [data-drawer-tab="brand"]')!.click())
    expect(document.querySelector('.if-layers')).toBeNull()
    expect(document.querySelector('.if-drawer .if-brand-library')).toBeTruthy()
    await act(async () => document.querySelector<HTMLButtonElement>('.if-brand-templates')!.click())
    expect(frame()).toBeNull()
    await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭画廊"]')!.click())
    expect(frame()).toBeTruthy()
    expect(document.querySelector('.if-drawer .if-brand-library')).toBeTruthy()
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.if-brand-templates')!.click()
    })
    await act(async () => {
      document.querySelector('[aria-label="关闭画廊"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(frame()).toBeTruthy()
    expect(document.querySelector('.if-drawer .if-brand-library')).toBeTruthy()
  } finally {
    await act(async () => factory.dispose())
    host.dispose()
    vi.unstubAllGlobals()
  }
})

it('marquee-selects enclosed canvas elements and adds another element with Shift', async () => {
  const block = (x: number, y: number, width = .15, height = .13) => ({
    kind: 'shape' as const, id: randomUUID(), x, y, width, height, color: '#005096',
  })
  const background = block(0, 0, 1, 1)
  const first = block(.12, .20), second = block(.40, .24), third = block(.70, .65)
  const canvas: StoredCanvas = { version: 1, id: randomUUID(), title: '框选画板', width: 1000, height: 1000,
    layers: [background, first, second, third] }
  const write = vi.fn(async (_request: CanvasWrite) => {})
  const host = new WorkspaceSurfaceHost(document)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly callback: ResizeObserverCallback) {}
    observe(target: Element) {
      if (target.classList.contains('if-stage-scroll'))
        this.callback([{ target, contentRect: new DOMRect(0, 0, 500, 500) } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }
    disconnect() {}
  })
  let factory!: ReturnType<typeof mountImageFactory>
  try {
    await act(() => {
      factory = mountImageFactory(document, host, {
        storage: { read: async () => ({ epoch: 1, canvas }), write, adopt: async () => false },
        saveProject: async () => {}, save: async () => ({}),
      })
    })
    await openCanvas(factory)
    const viewport = document.querySelector<HTMLElement>('.if-stage-scroll')!
    const node = (layer: typeof first) => document.querySelector<HTMLElement>('[data-brand-layer-id="' + layer.id + '"]')!
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 500, 500))
    Object.defineProperty(viewport, 'setPointerCapture', { value: vi.fn() })
    for (const layer of canvas.layers as typeof first[]) {
      vi.spyOn(node(layer), 'getBoundingClientRect').mockReturnValue(new DOMRect(layer.x * 500, layer.y * 500, layer.width * 500, layer.height * 500))
    }
    const pointer = (type: string, target: Element, clientX: number, clientY: number, shiftKey = false) => target.dispatchEvent(new PointerEvent(type,
      { pointerId: 1, pointerType: 'mouse', bubbles: true, cancelable: true, isPrimary: true, button: 0,
        buttons: type === 'pointerup' ? 0 : 1, clientX, clientY, shiftKey }))
    await act(() => { pointer('pointerdown', viewport, 45, 92); pointer('pointermove', viewport, 295, 225) })
    expect(document.querySelector('.if-marquee')).not.toBeNull()
    await act(() => pointer('pointerup', viewport, 295, 225))
    const selected = (layer: typeof first) => node(layer).getAttribute('aria-pressed')
    expect([selected(background), selected(first), selected(second), selected(third)]).toEqual(['false', 'true', 'true', 'false'])
    expect(document.querySelector('.if-marquee')).toBeNull()
    expect(document.querySelector('[data-tool="select"]')).toBeNull()
    const outlines = () => [...document.querySelectorAll<HTMLElement>('[data-selected-layer-outline]')]
    expect(outlines().map(element => element.dataset.selectedLayerOutline)).toEqual([first.id, second.id])
    expect(outlines()[0]?.style.width).toBe('75px')
    expect(document.querySelector('.if-group-bounds')).not.toBeNull()
    await act(() => {
      pointer('pointerdown', viewport, 330, 280, true)
      pointer('pointermove', viewport, 450, 408, true)
      pointer('pointerup', viewport, 450, 408, true)
    })
    expect([selected(background), selected(first), selected(second), selected(third)]).toEqual(['false', 'true', 'true', 'true'])
    expect(outlines().map(element => element.dataset.selectedLayerOutline)).toEqual([first.id, second.id, third.id])
    const frame = document.querySelector('.if-raster')!
    expect(document.activeElement).toBe(frame)
    const actions = () => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="图层操作"] > button')]
    const choose = async (label: string) => {
      const action = actions().find(button => button.textContent === label)
      expect(action).toBeDefined()
      await act(() => action!.click())
    }
    const context = async (target: Element) => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 104, clientY: 134 })
      await act(() => target.dispatchEvent(event))
      expect(event.defaultPrevented).toBe(true)
    }
    const layers = () => write.mock.calls.at(-1)?.[0].canvas.layers ?? []
    await context(node(first))
    expect(actions().map(button => button.textContent)).toEqual(['编组', '删除', '复制', '下载'])
    await choose('编组')
    const handle = document.querySelector<HTMLButtonElement>('.if-group-bounds [data-text-resize-handle="se"]')!
    expect(document.querySelectorAll('.if-group-bounds button')).toHaveLength(4)
    Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() })
    await act(() => {
      pointer('pointerdown', handle, 425, 390)
      pointer('pointermove', handle, 498, 448)
      pointer('pointerup', handle, 498, 448)
    })
    const [resizedFirst, resizedSecond, resizedThird] = layers().slice(1) as typeof first[]
    const scale = resizedFirst!.width / first.width
    expect(scale).toBeGreaterThan(1)
    expect(resizedFirst!.x).toBeCloseTo(first.x)
    expect(resizedSecond!.x - resizedFirst!.x).toBeCloseTo((second.x - first.x) * scale)
    expect(resizedThird!.height).toBeCloseTo(third.height * scale)
    await context(node(first))
    expect(actions().map(button => button.textContent)).toEqual(['取消编组', '删除', '复制', '下载'])
    await choose('复制')
    await act(() => frame.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', metaKey: true, bubbles: true, cancelable: true })))
    expect(layers()).toHaveLength(7)
    const groupIds = layers().slice(1).map(layer => 'groupId' in layer ? layer.groupId : undefined)
    expect(new Set(groupIds.slice(0, 3)).size).toBe(1)
    expect(new Set(groupIds.slice(3)).size).toBe(1)
    expect(groupIds[0]).not.toBe(groupIds[3])
    const pasted = layers().at(-1) as typeof first
    await context(node(pasted))
    await choose('删除')
    expect(layers()).toHaveLength(4)
    await context(node(first))
    await choose('取消编组')
    expect(document.querySelector('.if-group-bounds button')).toBeNull()
    expect(layers().every(layer => !('groupId' in layer))).toBe(true)

    await act(() => document.querySelector<HTMLButtonElement>('[aria-label="画布比例"]')!.click())
    const ratios = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"][aria-label="画布比例"] button')]
    expect(ratios.every(button => button.querySelector('.if-ratio-icon'))).toBe(true)
    await act(() => ratios.find(button => button.textContent?.trim() === '16:9')!.click())
    expect(document.querySelector('.if-canvas-readout')?.textContent).toContain('1600 × 900 px')
  } finally {
    await act(() => factory.dispose())
    host.dispose()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
