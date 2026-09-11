import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { homeFlowLuminance, mountHomeFlow } from '../src/preload/home-flow'

describe('procedural home atmosphere', () => {
  it('preserves the reference composition instead of distributing equal fog peaks across the page', () => {
    // Median grayscale samples measured from unobstructed reference regions.
    const anchors = [[.04,.2,171],[.35,.08,45],[.65,.18,105],[.9,.3,42],[.2,.65,64],[.5,.78,83],[.23,.88,18],[.9,.85,31]]
    for (const [x,y,gray] of anchors) {
      expect(Math.abs(homeFlowLuminance(x!,y!,0,true)-gray!)).toBeLessThan(12)
      expect(Math.abs(homeFlowLuminance(x!,y!,12,true)-gray!)).toBeLessThan(16)
    }
  })
  it('produces bounded grayscale in both themes and continuous, non-uniform changes', () => {
    const changes: number[] = []
    for (let y = 0; y <= 1; y += .05) for (let x = 0; x <= 1; x += .05) {
      const dark = homeFlowLuminance(x, y, 0, true)
      const light = homeFlowLuminance(x, y, 0, false)
      expect(dark).toBeGreaterThanOrEqual(12)
      expect(dark).toBeLessThanOrEqual(185)
      expect(light).toBeGreaterThanOrEqual(201)
      expect(light).toBeLessThanOrEqual(250)
      changes.push(homeFlowLuminance(x, y, 6, true) - dark)
      expect(Math.abs(homeFlowLuminance(x, y, .042, true) - dark)).toBeLessThanOrEqual(2)
    }
    // Some regions lighten while others darken: not global opacity breathing.
    expect(Math.max(...changes)).toBeGreaterThan(1)
    expect(Math.min(...changes)).toBeLessThan(-1)
  })

  it('stops rendering off the home page and disposes canvas, observers and animation', async () => {
    const w = new Window()
    const callbacks = new Map<number, FrameRequestCallback>()
    let next = 0, draws = 0
    w.requestAnimationFrame = ((cb: FrameRequestCallback) => { callbacks.set(++next, cb); return next }) as unknown as typeof w.requestAnimationFrame
    w.cancelAnimationFrame = ((id: number) => { callbacks.delete(id) }) as unknown as typeof w.cancelAnimationFrame
    w.HTMLCanvasElement.prototype.getContext = (() => ({
      createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => { draws++ }
    })) as unknown as typeof w.HTMLCanvasElement.prototype.getContext
    w.document.body.innerHTML = '<main class="pI_x6G_centerCol"><section data-odyssey-page="home"></section></main>'
    const doc = w.document as unknown as Document
    const dispose = mountHomeFlow(doc)
    expect(mountHomeFlow(doc)).toBe(dispose)
    expect(w.document.querySelectorAll('canvas')).toHaveLength(1)
    expect(callbacks.size).toBe(1)
    const step = (time: number) => { const c = [...callbacks.values()]; callbacks.clear(); c.forEach(cb => cb(time)) }
    step(100); step(150)
    expect(draws).toBeGreaterThan(2)
    w.document.querySelector('section')!.setAttribute('data-odyssey-page', 'research')
    await Promise.resolve(); await Promise.resolve()
    expect(w.document.querySelector('canvas')).toBeNull()
    expect(callbacks.size).toBe(0)
    w.document.querySelector('section')!.setAttribute('data-odyssey-page', 'home')
    await Promise.resolve(); await Promise.resolve()
    expect(w.document.querySelectorAll('canvas')).toHaveLength(1)
    dispose()
    expect(w.document.querySelector('canvas')).toBeNull()
    expect(callbacks.size).toBe(0)
    await w.happyDOM.close()
  })
})
