// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CanvasActionsMenu } from '../src/preload/image-factory/actions-menu'

it.each([
  { side: 'left', open: 'ArrowLeft', back: 'ArrowRight' },
  { side: 'right', open: 'ArrowRight', back: 'ArrowLeft' },
])('stays under the trigger and opens the format menu to the $side', async ({ side, open, back }) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const right = side === 'left' ? document.defaultView!.innerWidth - 48 : 280
  const mount = document.body.appendChild(document.createElement('div'))
  const root = createRoot(mount)
  const exportImage = vi.fn()
  const key = (name: string) => act(() => {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }))
  })
  try {
    await act(() => root.render(createElement(CanvasActionsMenu, {
      doc: document, t: zh => zh, canExport: true, exporting: exportImage,
    })))
    const trigger = mount.querySelector('button')!
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue(new DOMRect(right - 30, 16, 30, 30))
    await act(() => trigger.click())
    const main = document.querySelector<HTMLElement>('[role="menu"][aria-label="更多图像操作"]')!
    expect(main.style.left).toBe((right - 160) + 'px')
    expect(main.querySelector('svg')?.style.transform ?? '').toBe(side === 'left' ? 'scaleX(-1)' : '')
    expect(document.activeElement?.textContent).toBe('导出')

    await key(open)
    const child = document.querySelector<HTMLElement>('[role="menu"][aria-label="图像导出格式"]')!
    expect(child.style[side === 'left' ? 'right' : 'left']).toBe('100%')
    await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('PNG'))
    await key(back)
    expect(document.querySelector('[aria-label="图像导出格式"]')).toBeNull()
    expect(document.activeElement?.textContent).toBe('导出')

    await key(open)
    const jpg = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="图像导出格式"] button')]
      .find(button => button.textContent === 'JPG')!
    await act(() => jpg.click())
    expect(exportImage).toHaveBeenCalledExactlyOnceWith('jpg')
    expect(document.activeElement).toBe(trigger)
  } finally {
    await act(() => root.unmount())
    mount.remove()
    vi.unstubAllGlobals()
  }
})
