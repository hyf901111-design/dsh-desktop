import { createHomeFlowField } from './home-flow'

/** Low-contrast motion within each image placeholder. */
export function mountImageGenerationFlow(doc: Document = document): () => void {
  const win = doc.defaultView
  if (!win) return () => {}
  const field = createHomeFlowField({ speed: 3.2, strength: 2.5 })
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  type Surface = { context: CanvasRenderingContext2D; pixels: ImageData; visible: boolean }
  const surfaces = new Map<HTMLCanvasElement, Surface>()
  let frame = 0, previous = 0, elapsed = 0, disposed = false
  const paint = (canvas: HTMLCanvasElement, surface: Surface) => {
    const dark = doc.body.hasAttribute('data-ds-dark-theme')
    field.paint(surface.pixels, elapsed, dark)
    const pixels = surface.pixels.data
    const base = dark ? 32 : 236
    for (let offset = 0; offset < pixels.length; offset += 4) {
      const tone = base + (pixels[offset]! - base) * 0.4
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = tone
    }
    surface.context.putImageData(surface.pixels, 0, 0)
    canvas.dataset.flowState = doc.hidden || reduced.matches || !surface.visible ? 'paused' : 'running'
  }
  const stop = () => { if (frame) win.cancelAnimationFrame(frame); frame = previous = 0 }
  const tick = (now: number) => {
    frame = 0
    if (disposed || doc.hidden || reduced.matches) return
    if (!previous || now - previous >= 1000 / 30) {
      if (previous) elapsed += Math.min(.1, (now - previous) / 1000)
      previous = now
      for (const [canvas, surface] of surfaces) if (surface.visible) paint(canvas, surface)
    }
    if ([...surfaces.values()].some(surface => surface.visible)) frame = win.requestAnimationFrame(tick)
  }
  const resume = () => {
    stop()
    for (const [canvas, surface] of surfaces) paint(canvas, surface)
    if (!disposed && !doc.hidden && !reduced.matches && [...surfaces.values()].some(surface => surface.visible)) frame = win.requestAnimationFrame(tick)
  }
  const resize = (canvas: HTMLCanvasElement) => {
    const surface = surfaces.get(canvas)
    if (!surface) return
    const bounds = canvas.getBoundingClientRect(), ratio = Math.max(.25, Math.min(4, bounds.width / Math.max(1, bounds.height)))
    const width = Math.round(ratio >= 1 ? 256 : 256 * ratio), height = Math.round(ratio >= 1 ? 256 / ratio : 256)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height
      surface.pixels = surface.context.createImageData(width, height)
    }
    paint(canvas, surface)
  }
  const sizes = new win.ResizeObserver(entries => { for (const entry of entries) resize(entry.target as HTMLCanvasElement) })
  const visibility = new win.IntersectionObserver(entries => {
    for (const entry of entries) { const surface = surfaces.get(entry.target as HTMLCanvasElement); if (surface) surface.visible = entry.isIntersecting }
    resume()
  })
  const sync = () => {
    let changed = false
    for (const [canvas] of surfaces) if (!canvas.isConnected) { sizes.unobserve(canvas); visibility.unobserve(canvas); surfaces.delete(canvas); changed = true }
    for (const canvas of doc.querySelectorAll<HTMLCanvasElement>('canvas[data-odyssey-image-flow]')) {
      if (surfaces.has(canvas)) continue
      const context = canvas.getContext('2d', { alpha: false })
      if (!context) continue
      surfaces.set(canvas, { context, pixels: context.createImageData(canvas.width, canvas.height), visible: false })
      resize(canvas); sizes.observe(canvas); visibility.observe(canvas); changed = true
    }
    if (changed) resume()
  }
  const changes = new win.MutationObserver(sync)
  changes.observe(doc.body, { childList: true, subtree: true })
  const theme = new win.MutationObserver(resume)
  theme.observe(doc.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  doc.addEventListener('visibilitychange', resume); reduced.addEventListener('change', resume)
  sync()
  return () => {
    disposed = true; stop(); changes.disconnect(); theme.disconnect(); sizes.disconnect(); visibility.disconnect(); surfaces.clear()
    doc.removeEventListener('visibilitychange', resume); reduced.removeEventListener('change', resume)
  }
}
