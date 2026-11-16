// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ImageFactoryGallery } from '../src/preload/image-factory/gallery'

it('stops gallery animation while a different workspace conceals it and resumes when shown', async () => {
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
  } finally {
    await act(() => root.unmount())
    mount.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  }
})
