/** Fixed spatial coordinates, evolving local gradients. Medium frequencies
 * carry the fog; the broad field only supplies atmosphere. There is no shared
 * warp or animated spatial transform, so neighbouring clouds can change shape
 * independently without stretching the whole page into diagonal bands.
 */
export function createHomeFlowField() {
  const permutation = new Uint8Array(512)
  const gx = new Float64Array(256), gy = new Float64Array(256)
  let seed = 0x71a93b25
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296 }
  for(let i=0;i<256;i++) permutation[i]=i
  for(let i=255;i>0;i--) { const j=Math.floor(random()*(i+1));const v=permutation[i]!;permutation[i]=permutation[j]!;permutation[j]=v }
  for(let i=0;i<256;i++) permutation[i+256]=permutation[i]!
  const phase=Array.from({length:256},()=>random()*Math.PI*2)
  const rate=Array.from({length:256},()=> (.028+random()*.035)*(random()<.5?-1:1))
  let time = NaN
  const fade = (t:number) => t*t*t*(t*(t*6-15)+10)
  const noise = (x:number,y:number) => {
    const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy
    const a=permutation[(ix&255)]!+(iy&255),b=permutation[(ix+1)&255]!+(iy&255)
    const aa=permutation[a]!,ab=permutation[a+1]!,ba=permutation[b]!,bb=permutation[b+1]!
    const n00=gx[aa]!*u+gy[aa]!*v,n10=gx[ba]!*(u-1)+gy[ba]!*v
    const n01=gx[ab]!*u+gy[ab]!*(v-1),n11=gx[bb]!*(u-1)+gy[bb]!*(v-1)
    const fx=fade(u),fy=fade(v),top=n00+(n10-n00)*fx,bottom=n01+(n11-n01)*fx
    return top+(bottom-top)*fy
  }
  return (x:number,y:number,seconds:number,dark:boolean,aspect=1) => {
    if(time!==seconds) {
      time=seconds
      // Trigonometry is evaluated once per gradient per frame, never per pixel.
      for(let i=0;i<256;i++) { const angle=phase[i]!+seconds*rate[i]!;gx[i]=Math.cos(angle);gy[i]=Math.sin(angle) }
    }
    const px=x*aspect
    const field=.64*noise(px*4.8+19.3,y*4.8+27.1)
      +.23*noise(px*8.7+73.8,y*8.7+51.4)
      +.08*noise(px*1.7+113.2,y*1.7+93.7)
      +.05*noise(px*16.1+151.6,y*16.1+173.9)
    const density=Math.max(0,Math.min(1,.5+field*1.45))
    return Math.round(dark?25+91*density:250-49*density)
  }
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
    const { width, height, data } = pixels
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const value = luminance(col / (width - 1), row / (height - 1), elapsed, dark, width / height)
        const index = (row * width + col) * 4
        data[index] = data[index + 1] = data[index + 2] = value
        data[index + 3] = 255
      }
    }
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
    const next = doc.querySelector('.pI_x6G_centerCol:has([data-odyssey-page="home"])')
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
