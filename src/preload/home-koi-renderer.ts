import type { HomeThemeRenderer } from './home-theme-renderer'
import { PondRenderer } from './home-koi/renderer.js'
import { Simulation } from './home-koi/simulation.js'
import waterAsset from './home-koi/assets/water-plate.png?inline'
import koiAsset from './home-koi/assets/koi-sprite.png?inline'

/** The approved portable pond, driven exclusively by the homepage's RAF owner. */
export function createKoiRenderer(canvas: HTMLCanvasElement, options: { dark: boolean; preview?: boolean }): HomeThemeRenderer | null {
  const win = canvas.ownerDocument.defaultView
  if (!win) return null
  let gl: WebGLRenderingContext | null
  try {
    gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'low-power', preserveDrawingBuffer: false
    })
  } catch { return null }
  if (!gl) return null
  const context = gl
  let disposed = false, lost = false, failed = false, dark = options.dark
  let width = 1, height = 1, previousSeconds: number | null = null
  let pond: PondRenderer | null = null, simulation: Simulation | null = null
  const water = new win.Image(), koi = new win.Image()
  const images = [water, koi]
  const clearImages = () => { for (const image of images) image.onload = image.onerror = null }
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; canvas.dataset.homeKoiState = 'lost' }
  const palette = () => ({ darkness: dark ? .78 : 0, brightness: dark ? .9 : 1, rippleStrength: 1, softness: 2.1 })
  const draw = () => {
    if (disposed || lost || failed || !pond || !simulation) return
    try { pond.draw(simulation, palette()) } catch { failed = true; canvas.dataset.homeKoiState = 'failed' }
  }
  const resize = (w: number, h: number) => {
    if (disposed || lost || failed || !Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return
    // Fish are modeled in CSS pixels. A card is a miniature of the same pond,
    // rather than a 150px pond containing full-size 310px fish.
    width = w; height = h
    const previewScale = options.preview ? 1150 / width : 1
    const sceneWidth = width * previewScale, sceneHeight = height * previewScale
    if (!simulation) simulation = new Simulation({ width: sceneWidth, height: sceneHeight, fishCount: 2, ...(options.preview ? { seed: 0x5eed } : {}) })
    else simulation.resize(sceneWidth, sceneHeight)
    if (pond) {
      const ratio = Math.min(win.devicePixelRatio || 1, 1.25, Math.sqrt(2_400_000 / (width * height)))
      try { pond.resize(sceneWidth, sceneHeight, ratio / previewScale) } catch { failed = true; canvas.dataset.homeKoiState = 'failed' }
    }
  }
  const loaded = () => {
    if (disposed || lost || failed || !images.every(image => image.complete && image.naturalWidth > 0)) return
    clearImages()
    try {
      pond = new PondRenderer(canvas, water, koi)
      resize(width, height)
      draw() // Reduced-motion mode also needs its first decoded, static frame.
      if (!failed) canvas.dataset.homeKoiState = 'ready'
    } catch { failed = true; canvas.dataset.homeKoiState = 'failed' }
  }
  canvas.addEventListener('webglcontextlost', contextLost)
  canvas.dataset.homeKoiState = 'loading'
  context.clearColor(dark ? .01 : .94, dark ? .08 : .94, dark ? .25 : .94, 1)
  context.clear(context.COLOR_BUFFER_BIT)
  for (const image of images) {
    image.onload = loaded
    image.onerror = () => { failed = true; clearImages(); canvas.dataset.homeKoiState = 'failed' }
  }
  water.src = waterAsset; koi.src = koiAsset
  return {
    backend: 'webgl', resize,
    render(seconds, nextDark = dark) {
      if (disposed || lost || failed) return false
      dark = nextDark
      const delta = previousSeconds === null ? 0 : Math.max(0, Math.min(.1, seconds - previousSeconds))
      previousSeconds = seconds
      // Asset decoding never advances an invisible scene or starts its own loop.
      if (pond && simulation) simulation.step(delta, dark ? .55 : 1)
      draw()
      return !failed
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearImages()
      canvas.removeEventListener('webglcontextlost', contextLost)
      context.useProgram(null)
      context.bindFramebuffer(context.FRAMEBUFFER, null)
      context.bindTexture(context.TEXTURE_2D, null)
      context.bindBuffer(context.ARRAY_BUFFER, null)
      pond?.destroy(); pond = null; simulation = null
      if (!context.isContextLost()) context.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.dataset.homeKoiState = 'disposed'
    }
  }
}
