import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { createHomeFlowField, homeFlowLuminance, mountHomeFlow } from '../src/preload/home-flow'

describe('procedural home atmosphere', () => {
  it('keeps the reference faces and dark gaps after extended local animation', () => {
    // All primary reference regions remain stable, including the areas where
    // the rejected version introduced bright ribbons and dark crease grooves.
    const anchors = [[.04,.2,171],[.5,.78,83],[.35,.08,45],[.65,.18,105],[.9,.3,42],[.2,.65,64],[.23,.88,18],[.9,.85,31]]
    for (const [x,y,gray] of anchors) {
      expect(Math.abs(homeFlowLuminance(x!,y!,0,true)-gray!)).toBeLessThan(12)
      for (const time of [12, 60, 300, 600]) {
        expect(Math.abs(homeFlowLuminance(x!,y!,time,true)-gray!)).toBeLessThan(16)
      }
    }
  })
  it('preserves the measured transition profiles without added bright rims or dark grooves', () => {
    // Upper-right boundary, lower irregular column, and left edge, sampled
    // from the latest reference at the same normalized content coordinates.
    const profile = [[.65,.18,105],[.7,.18,111],[.75,.18,108],[.8,.18,94],[.85,.18,66],[.9,.18,43],
      [.36,.8,24],[.4,.8,26],[.44,.8,43],[.52,.8,76],[.56,.8,63],[.6,.8,52],
      [0,.2,213],[.03,.2,177],[.06,.2,154],[.09,.2,129],[.12,.2,110]]
    for (const [x, y, expected] of profile) {
      expect(Math.abs(homeFlowLuminance(x!, y!, 0, true) - expected!)).toBeLessThan(10)
      for (const time of [12, 60, 300, 600]) {
        expect(Math.abs(homeFlowLuminance(x!, y!, time, true) - expected!)).toBeLessThan(18)
      }
    }
  })
  it('gives the existing lower ridge a lit shoulder and a restrained shadow side', () => {
    // The latest direction explicitly strengthens this crest beyond the old
    // flat reference profile (74). Its neighbours retain the reference bounds.
    for (const time of [0, 12, 60, 300, 600]) {
      const crest = homeFlowLuminance(.48, .8, time, true)
      const shadow = homeFlowLuminance(.44, .8, time, true)
      expect(crest).toBeGreaterThanOrEqual(78)
      expect(crest).toBeLessThanOrEqual(92)
      expect(crest - shadow).toBeGreaterThan(40)
    }
  })
  it('produces bounded grayscale in both themes and continuous, non-uniform changes', () => {
    const changes: number[] = []
    for (let y = 0; y <= 1; y += .05) for (let x = 0; x <= 1; x += .05) {
      const dark = homeFlowLuminance(x, y, 0, true)
      const light = homeFlowLuminance(x, y, 0, false)
      expect(dark).toBeGreaterThanOrEqual(12)
      expect(dark).toBeLessThanOrEqual(215)
      expect(light).toBeGreaterThanOrEqual(201)
      expect(light).toBeLessThanOrEqual(250)
      changes.push(homeFlowLuminance(x, y, 6, true) - dark)
      expect(Math.abs(homeFlowLuminance(x, y, .042, true) - dark)).toBeLessThanOrEqual(2)
    }
    // Some regions lighten while others darken: not global opacity breathing.
    expect(Math.max(...changes)).toBeGreaterThan(1)
    expect(Math.min(...changes)).toBeLessThan(-1)
  })

  it('keeps the cached canvas rendering aligned with the analytic overlapping regions', () => {
    const field = createHomeFlowField()
    for (const [width, height] of [[73, 49], [41, 67]]) {
      const pixels = { width: width!, height: height!, data: new Uint8ClampedArray(width! * height! * 4) } as ImageData
      for (const time of [0, 8, 120]) for (const dark of [true, false]) {
        field.paint(pixels, time, dark)
        for (let y = 0; y < height!; y += 4) for (let x = 0; x < width!; x += 4) {
          expect(pixels.data[(y * width! + x) * 4]).toBe(field(x / (width! - 1), y / (height! - 1), time, dark))
        }
      }
    }
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
