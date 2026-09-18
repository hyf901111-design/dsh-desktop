import { describe, expect, it } from 'vitest'
import { resizeWindowBounds } from '../src/shared/window-resize'
describe('desktop window resize bounds', () => {
  const start = { x: 100, y: 80, width: 1000, height: 800 }
  it('anchors the opposite corner when growing from the upper left', () => {
    expect(resizeWindowBounds(start, 'nw', -100, -50, 800, 640)).toEqual({ x: 0, y: 30, width: 1100, height: 850 })
  })
  it('clamps left and top edges without moving the opposite edge', () => {
    expect(resizeWindowBounds(start, 'nw', 900, 900, 800, 640)).toEqual({ x: 300, y: 240, width: 800, height: 640 })
  })
  it('keeps unrelated dimensions unchanged on all four sides', () => {
    expect(resizeWindowBounds(start, 'e', 50, 90, 800, 640)).toEqual({ ...start, width: 1050 })
    expect(resizeWindowBounds(start, 's', 50, 90, 800, 640)).toEqual({ ...start, height: 890 })
    expect(resizeWindowBounds(start, 'w', 50, 90, 800, 640)).toEqual({ ...start, x: 150, width: 950 })
    expect(resizeWindowBounds(start, 'n', 50, 90, 800, 640)).toEqual({ ...start, y: 170, height: 710 })
  })
})

it('keeps edge handles alive when the app replaces body contents, and removes them on cleanup', async () => {
  const { Window } = await import('happy-dom')
  const { mountWindowResize } = await import('../src/preload/window-resize')
  const win = new Window()
  const dispose = mountWindowResize(win.document as unknown as Document, () => {})
  win.document.body.innerHTML = '<main>Application mount</main>'
  expect(win.document.querySelector('[data-odyssey-window-resize]')?.parentElement).toBe(win.document.documentElement)
  dispose()
  expect(win.document.querySelector('[data-odyssey-window-resize]')).toBeNull()
  await win.happyDOM.abort()
})
