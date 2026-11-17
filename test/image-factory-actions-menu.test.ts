// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { CanvasActionsMenu } from '../src/preload/image-factory/actions-menu'

it.each([
  { side: 'left', room: 48, open: 'ArrowLeft', back: 'ArrowRight' },
  { side: 'right', room: 248, open: 'ArrowRight', back: 'ArrowLeft' },
])('aligns under the trigger and opens to the $side with $room px to the window edge', async ({ side, room, open, back }) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const right = document.defaultView!.innerWidth - room
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

    await key(back)
    expect(document.querySelector('[aria-label="图像导出格式"]')).toBeNull()
    await key(open)
    const child = document.querySelector<HTMLElement>('[role="menu"][aria-label="图像导出格式"]')!
    expect(child.parentElement).toBe(main.parentElement)
    expect(child.style.left).toBe((right - 160 + (side === 'left' ? -160 : 160)) + 'px')
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

it('keeps both menus open for internal clicks and dismisses both after an outside click', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const mount = document.body.appendChild(document.createElement('div'))
  const outside = document.body.appendChild(document.createElement('button'))
  const root = createRoot(mount)
  const underlyingAction = vi.fn()
  outside.addEventListener('click', underlyingAction)
  try {
    await act(() => root.render(createElement(CanvasActionsMenu, {
      doc: document, t: zh => zh, canExport: true, exporting: vi.fn(),
    })))
    const trigger = mount.querySelector('button')!
    await act(() => trigger.click())
    await act(() => document.querySelector<HTMLButtonElement>('[aria-haspopup="menu"][role="menuitem"]')!.click())
    const submenu = document.querySelector('[aria-label="图像导出格式"]')!
    await act(() => submenu.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
    expect(submenu.isConnected).toBe(true)
    await act(() => outside.click())
    expect(document.querySelectorAll('.en-export-menu')).toHaveLength(0)
    expect(underlyingAction).toHaveBeenCalledOnce()
  } finally {
    await act(() => root.unmount())
    mount.remove()
    outside.remove()
    vi.unstubAllGlobals()
  }
})

it('offers overflow tools in the existing menu and preserves the watermark toggle state', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const mount = document.body.appendChild(document.createElement('div'))
  const root = createRoot(mount)
  const toggle = vi.fn()
  try {
    await act(() => root.render(createElement(CanvasActionsMenu, {
      doc: document, t: zh => zh, canExport: false, exporting: vi.fn(),
      toolActions: [{ id: 'cutout', label: '去背景', disabled: true, run: vi.fn() },
        { id: 'watermark', label: 'AI 水印', checked: true, run: toggle }],
    })))
    const trigger = mount.querySelector('button')!
    await act(() => trigger.click())
    const watermark = document.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!
    expect(watermark.getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(watermark)
    expect([...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent === '去背景')?.disabled).toBe(true)
    await act(() => watermark.click())
    expect(toggle).toHaveBeenCalledOnce()
    expect(document.querySelector('.if-actions-popup')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  } finally {
    await act(() => root.unmount())
    mount.remove()
    vi.unstubAllGlobals()
  }
})
