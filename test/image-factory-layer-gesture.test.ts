// @vitest-environment happy-dom
import { randomUUID } from 'node:crypto'
import { act } from 'react'
import { expect, it, vi } from 'vitest'
import { mountImageFactory } from '../src/preload/image-factory/view'
import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host'
import type { StoredCanvas, TextLayer } from '../src/shared/image-factory-canvas'

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
