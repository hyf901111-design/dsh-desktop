/** A continuous grayscale field, evaluated afresh rather than moving a texture.
 * Domain warping makes neighbouring regions stretch and fold independently.
 * Low spatial frequencies keep the foreground calm; no bitmap assets are used.
 */
export function homeFlowLuminance(x: number, y: number, seconds: number, dark: boolean): number {
  const t = seconds * 0.16
  const u = x + 0.16 * Math.sin(y * 5.2 + t) + 0.08 * Math.sin(x * 3.7 - y * 2.8 - t * 0.73)
  const v = y + 0.14 * Math.sin(x * 4.3 - t * 0.81) + 0.09 * Math.cos(y * 4.1 + x * 2.4 + t * 0.61)
  const cloud = (cx: number, cy: number, sx: number, sy: number) =>
    Math.exp(-((u - cx) ** 2 / sx + (v - cy) ** 2 / sy))
  const field = Math.min(1, Math.max(0,
    0.82 * cloud(0.06, 0.25, 0.075, 0.14)
    + 0.63 * cloud(0.63, 0.2, 0.055, 0.065)
    + 0.44 * cloud(0.47, 0.83, 0.04, 0.085)
    + 0.23 * cloud(0.9, 1.04, 0.2, 0.09)
    + 0.09 * Math.sin(u * 5.6 + v * 4.5 + t * 0.47)))
  return Math.round(dark ? 15 + 112 * field : 250 - 49 * field)
}

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

  const draw = () => {
    if (!canvas || !context || !pixels) return
    const { width, height, data } = pixels
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const value = homeFlowLuminance(col / (width - 1), row / (height - 1), elapsed, dark)
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
