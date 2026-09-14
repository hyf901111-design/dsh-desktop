/** Reference-led grayscale regions with irregular overlapping transitions.
 * Signed broad and local volumes reproduce the supplied spatial composition;
 * Curvature lighting follows those same volumes, without separate crease paths.
 * Independent bounded changes reshape overlaps without moving the surface.
 */
const FOG_VOLUMES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [220.03405, -0.0788, 0.2098, 0.1671, 0.1243],
  [99.92567, 0.1796, 0.4407, 0.161, 0.3163],
  [53, 0.765, 0.195, 0.104, 0.31],
  [73, 0.60, 0.07, 0.18, 0.235],
  [189.77068, -0.0928, 0.4216, 0.0824, 0.1713],
  [88, 0.51, 0.85, 0.12, 0.188],
  [28.55129, 0.6667, 0.6311, 0.0753, 0.1526],
  [108.47596, 0.7687, 0.8392, 0.3721, 0.2215],
  [-20, 0.395, 0.82, 0.075, 0.105],
  [-102.68613, 0.0474, 0.2807, 0.3034, 0.1294],
  [44.63898, 0.3838, 0.3063, 0.117, 0.0788],
  [-119.78286, 0.5936, 0.821, 0.38, 0.1736],
  // Join the upper shoulder to the edge instead of capping it with a tiny
  // bright bead and a dark notch that separate it from the surrounding face.
  [9, 0.77, -0.04, 0.075, 0.125],
  [-4, 0.73, 0.08, 0.07, 0.10],
  // Broad overlapping shoulders replace the tiny cap / notch pair that read
  // as a round head on a narrow stalk after curvature lighting was applied.
  [6, 0.480, 0.739, 0.052, 0.062],
  [-8, 0.435, 0.761, 0.044, 0.065],
  [15.66448, -0.01524, 0.16689, 0.03547, 0.01912],
  [-12.07471, -0.01974, 0.08657, 0.04407, 0.03209],
  [-3, 0.492, 0.675, 0.05, 0.055],
  [7, 0.461, 0.802, 0.042, 0.078]
]

export function createHomeFlowField() {
  const state = new Float64Array(FOG_VOLUMES.length * 5)
  let time = NaN
  let xWeights = new Float64Array(0), yWeights = new Float64Array(0)
  let xCurvature = new Float64Array(0), yCurvature = new Float64Array(0)
  const prepare = (seconds: number) => {
    if (time === seconds) return
    time = seconds
    FOG_VOLUMES.forEach(([amplitude, x, y, rx, ry], i) => {
      const phase = i * 2.39996, t = seconds * 3.4 * (.067 + (i % 7) * .006)
      const local = Math.sin(t + phase) - Math.sin(phase)
      const cross = Math.sin(t * .79 + phase * 1.7) - Math.sin(phase * 1.7)
      state[i*5] = amplitude * (1 + .015 * cross)
      state[i*5+1] = x + .012 * local
      state[i*5+2] = y + .012 * cross
      state[i*5+3] = rx * (1 + .085 * local)
      state[i*5+4] = ry * (1 - .075 * cross)
    })
  }
  const color = (value: number, curvature: number, dark: boolean) => {
    // Lift only the existing lit regions, by at most four grayscale levels.
    // A smooth shoulder adds a little sheen without new rims or dark grooves.
    const highlight = Math.max(0, Math.min(1, (value - 55) / 65))
    const sheen = 4 * highlight * highlight * (3 - 2 * highlight)
    // Convex shoulders catch light; the adjacent concave side recedes. This
    // bounded analytic curvature sharpens existing ridges, not brightness bands.
    const ridge = 14 * curvature / (14 + Math.abs(curvature))
    const luminance = Math.max(12, Math.min(215, value + sheen + ridge))
    return Math.round(dark ? luminance : 250 - 49 * (Math.min(185, luminance) - 12) / 173)
  }
  const sample = (x: number, y: number, seconds: number, dark: boolean) => {
    prepare(seconds)
    let value = 9.8591, curvature = 0
    for (let i=0; i<state.length; i+=5) {
      const dx=(x-state[i+1]!)/state[i+3]!, dy=(y-state[i+2]!)/state[i+4]!
      const volume = state[i]! * Math.exp(-.5 * (dx*dx+dy*dy))
      value += volume
      curvature += volume * (.0012 * (1-dx*dx) / state[i+3]!**2 + .0006 * (1-dy*dy) / state[i+4]!**2)
    }
    return color(value,curvature,dark)
  }
  const paint = (pixels: ImageData, seconds: number, dark: boolean) => {
    prepare(seconds)
    const {width,height,data}=pixels, count=FOG_VOLUMES.length
    if(xWeights.length!==width*count) { xWeights=new Float64Array(width*count); xCurvature=new Float64Array(width*count) }
    if(yWeights.length!==height*count) { yWeights=new Float64Array(height*count); yCurvature=new Float64Array(height*count) }
    // Separable Gaussian weights: a few thousand exponentials per frame,
    // instead of one exponential for every volume at every pixel.
    for(let c=0;c<count;c++) {
      const i=c*5
      for(let x=0;x<width;x++){const d=(x/(width-1)-state[i+1]!)/state[i+3]!;xWeights[c*width+x]=state[i]!*Math.exp(-.5*d*d);xCurvature[c*width+x]=.0012*(1-d*d)/state[i+3]!**2}
      for(let y=0;y<height;y++){const d=(y/(height-1)-state[i+2]!)/state[i+4]!;yWeights[c*height+y]=Math.exp(-.5*d*d);yCurvature[c*height+y]=.0006*(1-d*d)/state[i+4]!**2}
    }
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      let value=9.8591, curvature=0
      for(let c=0;c<count;c++) {
        const volume=xWeights[c*width+x]!*yWeights[c*height+y]!
        value+=volume
        curvature+=volume*(xCurvature[c*width+x]!+yCurvature[c*height+y]!)
      }
      const index=(y*width+x)*4, gray=color(value,curvature,dark)
      data[index]=data[index+1]=data[index+2]=gray;data[index+3]=255
    }
  }
  return Object.assign(sample,{paint})
}

export const homeFlowLuminance = createHomeFlowField()

const mounted = new WeakMap<Document, () => void>()

export function mountHomeFlow(doc: Document = document): () => void {
  const existing = mounted.get(doc)
  if (existing) return existing
  const win = doc.defaultView
  if (!win) return () => {}
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  let host: Element | null = null
  let canvas: HTMLCanvasElement | null = null
  let context: CanvasRenderingContext2D | null = null
  let pixels: ImageData | null = null
  let frame = 0
  let previous = 0
  let elapsed = 0
  let disposed = false
  let dark = doc.body.hasAttribute('data-ds-dark-theme')
  const luminance = createHomeFlowField()

  const draw = () => {
    if (!canvas || !context || !pixels) return
    luminance.paint(pixels, elapsed, dark)
    context.putImageData(pixels, 0, 0)
  }
  const stop = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0
    previous = 0
  }
  const tick = (now: number) => {
    frame = 0
    if (!canvas || doc.hidden || reduced.matches || disposed) return
    if (!previous || now - previous >= 1000 / 24) {
      if (previous) elapsed += Math.min((now - previous) / 1000, 0.1)
      previous = now
      draw()
    }
    frame = win.requestAnimationFrame(tick)
  }
  const resume = () => {
    stop()
    if (!canvas) return
    draw()
    canvas.dataset.flowState = doc.hidden || reduced.matches ? 'paused' : 'running'
    if (!doc.hidden && !reduced.matches) frame = win.requestAnimationFrame(tick)
  }
  const resize = () => {
    if (!canvas || !host || !context) return
    const bounds = host.getBoundingClientRect()
    // Bound CPU and allocation cost independently of Retina/window dimensions.
    const ratio = Math.max(0.25, Math.min(4, bounds.width / Math.max(1, bounds.height)))
    const width = Math.round(ratio >= 1 ? 256 : 256 * ratio)
    const height = Math.round(ratio >= 1 ? 256 / ratio : 256)
    if (canvas.width !== width || canvas.height !== height || !pixels) {
      canvas.width = width
      canvas.height = height
      pixels = context.createImageData(width, height)
      draw()
    }
  }
  const observer = new win.ResizeObserver(resize)
  const sync = () => {
    const next = doc.querySelector('.sherlock-auth-dialog[open] .sherlock-auth-scenery') ?? doc.querySelector('.pI_x6G_centerCol:has([data-odyssey-page="home"])')
    const nextDark = doc.body.hasAttribute('data-ds-dark-theme')
    if (next === host && (!host || canvas?.isConnected)) {
      if (dark !== nextDark) { dark = nextDark; draw() }
      return
    }
    stop()
    observer.disconnect()
    canvas?.remove()
    canvas = null
    context = null
    pixels = null
    host = next
    dark = nextDark
    if (!host) return
    canvas = doc.createElement('canvas')
    canvas.dataset.odysseyHomeFlow = ''
    canvas.setAttribute('aria-hidden', 'true')
    context = canvas.getContext('2d', { alpha: false })
    if (!context) { canvas = null; return }
    host.prepend(canvas)
    observer.observe(host)
    resize()
    resume()
  }
  const changes = new win.MutationObserver(sync)
  changes.observe(doc.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-odyssey-page', 'data-ds-dark-theme'] })
  doc.addEventListener('visibilitychange', resume)
  reduced.addEventListener('change', resume)
  sync()
  const dispose = () => {
    disposed = true
    stop()
    changes.disconnect()
    observer.disconnect()
    doc.removeEventListener('visibilitychange', resume)
    reduced.removeEventListener('change', resume)
    canvas?.remove()
    mounted.delete(doc)
  }
  mounted.set(doc, dispose)
  return dispose
}
