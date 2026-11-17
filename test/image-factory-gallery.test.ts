// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ImageFactoryGallery } from '../src/preload/image-factory/gallery'
import { galleryExamples } from '../src/preload/image-factory/gallery-examples'

it('shows only E Fund templates and offers a separate image-only prompt gallery without category filters', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const mount = document.body.appendChild(document.createElement('div'))
  const root = createRoot(mount)
  const use = vi.fn(), onTemplate = vi.fn()
  try {
    await act(() => root.render(createElement(ImageFactoryGallery, { t: zh => zh, busy: false, onUse: use, onTemplate })))
    const cards = () => Array.from(mount.querySelectorAll('.if-gallery-cycle[data-repeat="false"] article'))
    const button = (label: string) => [...mount.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!
    expect(cards()).toHaveLength(12)
    expect(mount.querySelector('[aria-label="模板分类"]')).toBeNull()
    const rollup = cards().find(item => item.querySelector('h3')?.textContent === '线下易拉宝')!
    await vi.waitFor(() => expect(Array.from(rollup.querySelectorAll('.if-gallery-tag'), tag => tag.textContent))
      .toEqual(['2:5', '640 × 1600 px']))
    await act(async () => button('基于提示词生成').click())
    const prompts = [...mount.querySelectorAll<HTMLButtonElement>('.if-prompt-cycle[data-repeat="false"] button')]
    expect(prompts).toHaveLength(22)
    expect(mount.querySelectorAll('.if-prompt-lane').length).toBeGreaterThan(1)
    expect(mount.querySelector('.if-prompt-gallery')?.querySelector('h3, p, .if-gallery-details')).toBeNull()
    expect(prompts.every(item => item.querySelector('img') && item.getAttribute('aria-label') &&
      item.classList.contains('if-gallery-art') && item.querySelector('.if-gallery-use')?.textContent === '做同款')).toBe(true)
    expect(cards()).toHaveLength(0)
    await act(async () => prompts[0]!.click())
    expect(use).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/画面比例为 16:9。$/u))
    expect(onTemplate).not.toHaveBeenCalled()
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
    await act(() => root.render(createElement(ImageFactoryGallery, { t: zh => zh, busy: false, onUse: () => {}, onTemplate: () => {} })))
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
    const image = card.querySelector('.if-gallery-art')!
    const caption = card.querySelector('h3')!
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

it('uses the editable project route for a preview with a logo and poster title', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const mount = document.body.appendChild(document.createElement('div'))
  const root = createRoot(mount)
  const onUse = vi.fn(), onTemplate = vi.fn()
  try {
    await act(() => root.render(createElement(ImageFactoryGallery, { t: zh => zh, busy: false, onUse, onTemplate })))
    const card = mount.querySelector('article')!
    const button = card.querySelector('button')!
    expect(button.getAttribute('aria-label')).toBe('山海长跑 · 做同款 · 可编辑模板')
    await vi.waitFor(() => expect(card.querySelector('.if-gallery-layout [data-template-copy]')?.textContent).toBe('山海长跑'))
    expect(card.querySelector('.if-gallery-layout image[href^="data:image/svg"]')?.getAttribute('href')).toMatch(/^data:image\/svg\+xml/u)
    await act(() => button.click())
    expect(onTemplate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: 'steady-horizon', material: ['品牌海报', 'Brand poster'] }))
    expect(onUse).not.toHaveBeenCalled()
  } finally {
    await act(() => root.unmount())
    mount.remove()
    vi.unstubAllGlobals()
  }
})
