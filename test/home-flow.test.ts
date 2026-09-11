import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'
import { homeFlowLuminance, mountHomeFlow } from '../src/preload/home-flow'

describe('procedural home atmosphere', () => {
  it('has many distinct medium fog peaks instead of a few page-sized light masses', () => {
    for (const seconds of [0, 4, 8, 12, 60, 120]) {
      const width = 64, height = 56
      const values = Array.from({length: width * height}, (_, i) => homeFlowLuminance(i % width / (width-1), Math.floor(i/width)/(height-1), seconds, true))
      let peaks = 0
      for (let y=2;y<height-2;y++) for (let x=2;x<width-2;x++) {
        const v=values[y*width+x]!
        if (v<78) continue
        let highest=true
        for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) {
          if((dx||dy) && values[(y+dy)*width+x+dx]! >= v + ((dy<0||dy===0&&dx<0)?0:1)) highest=false
        }
        if(highest) peaks++
      }
      expect(peaks, `medium fog peaks at ${seconds}s`).toBeGreaterThanOrEqual(8)
      expect(values.filter(v=>v<25).length/values.length).toBeLessThan(.02)
    }
  })
  it('produces bounded grayscale in both themes and continuous, non-uniform changes', () => {
    const changes: number[] = []
    for (let y = 0; y <= 1; y += .05) for (let x = 0; x <= 1; x += .05) {
      const dark = homeFlowLuminance(x, y, 0, true)
      const light = homeFlowLuminance(x, y, 0, false)
      expect(dark).toBeGreaterThanOrEqual(15)
      expect(dark).toBeLessThanOrEqual(127)
      expect(light).toBeGreaterThanOrEqual(201)
      expect(light).toBeLessThanOrEqual(250)
      changes.push(homeFlowLuminance(x, y, 6, true) - dark)
      expect(Math.abs(homeFlowLuminance(x, y, .042, true) - dark)).toBeLessThanOrEqual(2)
    }
    // Some regions lighten while others darken: not global opacity breathing.
    expect(Math.max(...changes)).toBeGreaterThan(6)
    expect(Math.min(...changes)).toBeLessThan(-6)
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
