// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ImageFactoryGallery } from '../src/preload/image-factory/gallery'
import { galleryExamples } from '../src/preload/image-factory/gallery-examples'

it('uses the displayed asset dimensions for both the readout and the Make something like this prompt', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const mount = document.body.appendChild(document.createElement('div'))
  const root = createRoot(mount)
  const use = vi.fn()
  try {
    await act(() => root.render(createElement(ImageFactoryGallery, { t: zh => zh, busy: false, onUse: use })))
    const card = mount.querySelector('article')!
    const image = card.querySelector('img')!
    await vi.waitFor(() => expect(card.querySelector('dl')?.textContent).toContain('1:1 · 512 × 512 px'))
    const button = card.querySelector('button')!
    expect(button.contains(image)).toBe(true)
    expect(button.textContent).toContain('做同款')
    expect(card.textContent).not.toContain('使用提示词')
    await act(() => button.click())
    expect(use).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/画面比例为 1:1。$/u))
  } finally {
    await act(() => root.unmount())
    mount.remove()
    vi.unstubAllGlobals()
  }
})

it('pages several cards in either direction and pauses only over content or while concealed', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const win = document.defaultView!
  let nextFrame = 1
  const request = vi.spyOn(win, 'requestAnimationFrame').mockImplementation(() => nextFrame++)
  const cancel = vi.spyOn(win, 'cancelAnimationFrame').mockImplementation(() => {})
  let setCycleWidth: (width: number) => void
  vi.stubGlobal('ResizeObserver', class {
    constructor(private readonly resized: ResizeObserverCallback) {}
    observe(target: Element) {
      let width = 0
      vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => new DOMRect(0, 0, width, 450))
      setCycleWidth = value => {
        width = value
        this.resized([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver)
      }
    }
    disconnect() {}
  })
  const mount = document.body.appendChild(document.createElement('div'))
  const root = createRoot(mount)
  try {
    await act(() => root.render(createElement(ImageFactoryGallery, { t: zh => zh, busy: false, onUse: () => {} })))
    setCycleWidth!(3000)
    expect(request).toHaveBeenCalledOnce()
    const visibleFrame = request.mock.results[0]?.value
    setCycleWidth!(0)
    expect(cancel).toHaveBeenLastCalledWith(visibleFrame)
    setCycleWidth!(3000)
    expect(request).toHaveBeenCalledTimes(2)

    const stride = 220
    const cycleWidth = galleryExamples.length * stride
    setCycleWidth!(cycleWidth)
    const viewport = mount.querySelector<HTMLElement>('.if-gallery-viewport')!
    const track = viewport.querySelector('.if-gallery-track')!
    const cycle = track.querySelector('.if-gallery-cycle')!
    const card = cycle.querySelector('article')!
    const image = card.querySelector('img')!
    const caption = card.querySelector('.if-gallery-caption')!
    const pointer = (target: Element, type: 'pointerover' | 'pointerout', relatedTarget?: Element) => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'mouse', relatedTarget }))
    }
    cancel.mockClear()
    for (const blank of [viewport, track, cycle, card]) pointer(blank, 'pointerover')
    expect(cancel).not.toHaveBeenCalled()
    pointer(image, 'pointerover', card)
    expect(cancel).toHaveBeenLastCalledWith(request.mock.results[1]?.value)
    cancel.mockClear()
    pointer(image, 'pointerout', caption)
    pointer(caption, 'pointerover', image)
    expect(request).toHaveBeenCalledTimes(2)
    expect(cancel).not.toHaveBeenCalled()
    pointer(caption, 'pointerout', card)
    expect(request).toHaveBeenCalledTimes(3)

    Object.defineProperty(viewport, 'clientWidth', { value: 680 })
    const flip = async (label: string, start: number) => {
      await act(() => mount.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())
      request.mock.lastCall![0](start)
      request.mock.lastCall![0](start + 260)
    }
    await flip('向右翻页', 1000)
    expect(viewport.scrollLeft).toBe(3 * stride)
    await flip('向左翻页', 2000)
    expect(viewport.scrollLeft).toBe(0)
    await flip('向左翻页', 3000)
    expect(viewport.scrollLeft).toBe(cycleWidth - 3 * stride)
    await flip('向右翻页', 4000)
    expect(viewport.scrollLeft).toBe(0)
  } finally {
    await act(() => root.unmount())
    mount.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
