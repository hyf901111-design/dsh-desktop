import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { createHomeFlowField, homeFlowLuminance, mountHomeFlow } from '../src/preload/home-flow'

describe('procedural home atmosphere', () => {
  it('retains the initial composition and distinct lit faces and dark gaps as it reshapes', () => {
    const anchors = [[.04,.2,171],[.5,.78,83],[.35,.08,45],[.65,.18,105],[.9,.3,42],[.2,.65,64],[.23,.88,18],[.9,.85,31]]
    for (const [x,y,gray] of anchors) {
      expect(Math.abs(homeFlowLuminance(x!,y!,0,true)-gray!)).toBeLessThan(12)
    }
    // Larger deformation intentionally moves transitions past individual
    // pixels. Preserve spatial contrast rather than pinning their gray value.
    for (const time of [12, 60, 300, 600]) {
      expect(homeFlowLuminance(.04,.2,time,true)).toBeGreaterThan(120)
      expect(homeFlowLuminance(.65,.18,time,true)-homeFlowLuminance(.9,.3,time,true)).toBeGreaterThan(30)
      expect(homeFlowLuminance(.23,.88,time,true)).toBeLessThan(45)
    }
  })
  it('preserves the initial broad transition profiles', () => {
    // Upper-right boundary and left edge, sampled
    // from the latest reference at the same normalized content coordinates.
    const profile = [[.65,.18,105],[.7,.18,111],[.75,.18,108],[.8,.18,94],[.85,.18,66],[.9,.18,43],
      [0,.2,213],[.03,.2,177],[.06,.2,154],[.09,.2,129],[.12,.2,110]]
    for (const [x, y, expected] of profile) {
      expect(Math.abs(homeFlowLuminance(x!, y!, 0, true) - expected!)).toBeLessThan(10)
    }
  })
  it('joins the upper shoulder without a small isolated highlight cap', () => {
    for (const time of [0, 4, 8, 12, 60, 300, 600]) {
      for (const x of [.7,.75,.8]) {
        const center=homeFlowLuminance(x,.04,time,true)
        const neighbours=(homeFlowLuminance(x-.05,.04,time,true)+homeFlowLuminance(x+.05,.04,time,true))/2
        expect(center-neighbours).toBeLessThan(14)
      }
    }
  })
  it('connects the lower lit surface without an isolated bright cap or pinched neck', () => {
    // The old small cap exceeded the lower body by around 30 levels, reading
    // as a detached round clump. The latest direction replaces that profile.
    for (const time of [0, 12, 60, 300, 600]) {
      const cap = homeFlowLuminance(.52, .74, time, true)
      const body = homeFlowLuminance(.52, .9, time, true)
      const shoulder = homeFlowLuminance(.52, .82, time, true)
      const shadow = homeFlowLuminance(.4, .82, time, true)
      expect(cap - body).toBeLessThanOrEqual(3)
      expect(shoulder).toBeGreaterThanOrEqual(65)
      expect(shoulder).toBeLessThanOrEqual(85)
      expect(shoulder - shadow).toBeGreaterThan(30)
      expect(shoulder - shadow).toBeLessThan(65)
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
    // Visible local evolution over a few seconds, while keeping average
    // illumination stable enough to avoid a whole-page brightness pulse.
    expect(changes.reduce((sum,v)=>sum+Math.abs(v),0)/changes.length).toBeGreaterThan(5)
    expect(Math.abs(changes.reduce((sum,v)=>sum+v,0)/changes.length)).toBeLessThan(12)
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

  it('keeps authentication scenery when homepage drawing is delegated to the theme controller', async () => {
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
    const dispose = mountHomeFlow(w.document as unknown as Document, { home: false })
    try {
      expect(w.document.querySelector('canvas')).toBeNull()
      expect(callbacks.size).toBe(0)
      const dialog = w.document.createElement('dialog')
      dialog.className = 'sherlock-auth-dialog'
      dialog.open = true
      dialog.innerHTML = '<div class="sherlock-auth-scenery"></div>'
      w.document.body.append(dialog)
      await Promise.resolve(); await Promise.resolve()
      expect(dialog.querySelectorAll('.sherlock-auth-scenery > canvas')).toHaveLength(1)
      expect(w.document.querySelector('main canvas')).toBeNull()
      expect(draws).toBeGreaterThan(0)
      expect(callbacks.size).toBe(1)
      dialog.remove()
      await Promise.resolve(); await Promise.resolve()
      expect(w.document.querySelector('canvas')).toBeNull()
      expect(callbacks.size).toBe(0)
    } finally {
      dispose()
      await w.happyDOM.close()
    }
  })
})
