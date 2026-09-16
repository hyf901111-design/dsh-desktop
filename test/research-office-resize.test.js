import { describe, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { freezeOfficePreviewDuringResize } from '../scripts/lib/research-office-resize.mjs'

describe('PPT canvas resize preview', () => {
  it('keeps the viewer layout stable through a drag and restores it on release or cancel', () => {
    const win = new Window()
    const host = win.document.createElement('div')
    const content = win.document.createElement('div')
    host.appendChild(content)
    let width = 600
    Object.defineProperty(host, 'clientWidth', { get: () => width })
    Object.defineProperty(host, 'clientHeight', { value: 400 })
    content.style.width = '100%'
    content.style.height = '100%'
    const original = content.style.cssText
    let resize = () => {}
    const disconnect = vi.fn()
    Object.defineProperty(win, 'ResizeObserver', { value: class {
      constructor(callback) { resize = callback }
      observe() {}
      disconnect = disconnect
    } })
    const finish = freezeOfficePreviewDuringResize(host, content)
    for (width = 610; width <= 1200; width += 10) {
      resize()
      expect(content.style.width).toBe('600px')
      expect(content.style.height).toBe('400px')
      expect(content.style.transform).toBe(`scale(${width / 600})`)
    }
    finish()
    expect(content.style.cssText).toBe(original)
    expect(disconnect).toHaveBeenCalledOnce()
  })
  it('does not freeze a hidden preview with no measurable viewport', () => {
    const win = new Window()
    const host = win.document.createElement('div')
    const content = win.document.createElement('div')
    expect(() => freezeOfficePreviewDuringResize(host, content)()).not.toThrow()
    expect(content.style.cssText).toBe('')
  })
})
