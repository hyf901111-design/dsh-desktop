import { createHomeFlowField } from './home-flow'
import { createHomeThemeRenderer, type HomeShaderThemeId } from './home-theme-renderer'
import defaultLight from './home-theme-assets/default-light.png?inline'
import defaultDark from './home-theme-assets/default-dark.png?inline'

const THEMES = ['default', 'berber', 'vghodki', 'jarrick', 'lowfreez'] as const
type Theme = typeof THEMES[number]
const LABELS: Record<Theme, string> = { default: '默认', berber: 'Berber', vghodki: 'Vghodki', jarrick: 'Jarrick', lowfreez: 'Lowfreez' }
const STORAGE_KEY = 'ework.home-background.v1'
const mounted = new WeakMap<Document, () => void>()
const validTheme = (value: unknown): value is Theme => THEMES.includes(value as Theme)
type Surface = { canvas: HTMLCanvasElement; render(seconds: number, dark: boolean): boolean; resize(width: number, height: number): void; dispose(): void }

/** One owner for homepage decoration; the native composer and appearance store stay native. */
export function mountHomeThemes(doc: Document = document): () => void {
  const existing = mounted.get(doc)
  if (existing) return existing
  const win = doc.defaultView
  if (!win) return () => {}
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  let selected: Theme = 'default'
  try { const stored = win.localStorage.getItem(STORAGE_KEY); if (validTheme(stored)) selected = stored } catch { /* Private storage may be unavailable. */ }
  let host: HTMLElement | null = null, background: HTMLElement | null = null, dock: HTMLElement | null = null
  let surface: Surface | null = null, visible = false, dark = doc.body.hasAttribute('data-ds-dark-theme')
  let disposed = false, frame = 0, previous = 0, elapsed = 0, generation = 0, cleanupTimer = 0
  const buttons = new Map<Theme, HTMLButtonElement>(), thumbs = new Map<string, string>()
  const entries = new Set<Animation>(), transitions = new Set<Animation>()
  const field = createHomeFlowField({ speed: 1.5, strength: 1.3 })
  const isShown = (element: Element | null): boolean => {
    for (let node = element; node; node = node.parentElement) {
      const style = win.getComputedStyle(node)
      if ((node as HTMLElement).hidden || style.display === 'none' || style.visibility === 'hidden') return false
    }
    return !!element
  }
  const cancelAnimations = (set: Set<Animation>) => { for (const animation of set) animation.cancel(); set.clear() }
  const animate = (element: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions, set: Set<Animation>) => {
    if (reduced.matches || typeof element.animate !== 'function') return
    const animation = element.animate(keyframes, options)
    set.add(animation)
    void animation.finished.then(() => { set.delete(animation) }, () => { set.delete(animation) })
  }
  const stop = () => {
    if (frame) win.cancelAnimationFrame(frame)
    frame = 0; previous = 0
    if (background) background.dataset.renderState = 'paused'
  }
  const fallback = (canvas: HTMLCanvasElement): Surface | null => {
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return null
    let pixels: ImageData | null = null
    return { canvas,
      resize(width, height) {
        const ratio = Math.max(.25, Math.min(4, width / Math.max(1, height)))
        canvas.width = Math.round(ratio >= 1 ? 256 : 256 * ratio)
        canvas.height = Math.round(ratio >= 1 ? 256 / ratio : 256)
        pixels = ctx.createImageData(canvas.width, canvas.height)
      },
      render(seconds, mode) { if (pixels) { field.paint(pixels, seconds, mode); ctx.putImageData(pixels, 0, 0) }; return true },
      dispose() { pixels = null }
    }
  }
  const makeSurface = (theme: Theme): Surface | null => {
    let canvas = doc.createElement('canvas')
    canvas.setAttribute('aria-hidden', 'true')
    canvas.dataset.homeThemeCanvas = theme
    if (theme !== 'default') {
      const renderer = createHomeThemeRenderer(canvas, theme, { dark })
      if (renderer) return { canvas, ...renderer }
      // A canvas with a failed GL context cannot be reused as a 2D canvas.
      canvas = doc.createElement('canvas'); canvas.setAttribute('aria-hidden', 'true'); canvas.dataset.homeThemeCanvas = 'default'
    }
    return fallback(canvas)
  }
  const clearTransition = () => {
    if (cleanupTimer) win.clearTimeout(cleanupTimer)
    cleanupTimer = 0; cancelAnimations(transitions)
    background?.querySelectorAll('[data-theme-freeze]').forEach(node => node.remove())
  }
  const resize = () => {
    if (!surface || !host) return
    const bounds = host.getBoundingClientRect()
    surface.resize(Math.max(1, bounds.width), Math.max(1, bounds.height))
    if (visible && !doc.hidden) surface.render(elapsed, dark)
  }
  const render = () => {
    if (surface?.render(elapsed, dark) !== false || !background || !host) return
    surface.dispose(); surface.canvas.remove()
    surface = makeSurface('default')
    if (surface) { background.append(surface.canvas); resize() }
    background.dataset.renderBackend = 'fallback'
  }
  const tick = (now: number) => {
    frame = 0
    if (disposed || !visible || doc.hidden || reduced.matches) return
    if (!previous || now - previous >= 1000 / 24) {
      if (previous) elapsed += Math.min(.1, (now - previous) / 1000)
      previous = now; render()
    }
    frame = win.requestAnimationFrame(tick)
  }
  const resume = () => {
    stop()
    if (!visible || !surface) return
    render()
    if (!doc.hidden && !reduced.matches) {
      if (background) background.dataset.renderState = 'running'
      frame = win.requestAnimationFrame(tick)
    }
  }
  const replaceSurface = (transition: boolean) => {
    if (!background) return
    const old = surface
    // Freeze the last actually displayed pixels before releasing the old GL resources.
    let freeze: HTMLCanvasElement | null = null
    if (old && transition && !reduced.matches) {
      freeze = doc.createElement('canvas'); freeze.dataset.themeFreeze = ''; freeze.setAttribute('aria-hidden', 'true')
      freeze.width = old.canvas.width; freeze.height = old.canvas.height
      const ctx = freeze.getContext('2d')
      try {
        if (ctx) {
          const previousFreeze = background.querySelector<HTMLCanvasElement>('[data-theme-freeze]')
          if (previousFreeze) ctx.drawImage(previousFreeze, 0, 0, freeze.width, freeze.height)
          const opacity = Number.parseFloat(win.getComputedStyle(old.canvas).opacity)
          ctx.globalAlpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1
          old.render(elapsed, dark)
          ctx.drawImage(old.canvas, 0, 0)
        } else freeze = null
      } catch { freeze = null }
    }
    clearTransition()
    old?.dispose(); old?.canvas.remove()
    surface = makeSurface(selected)
    if (surface) {
      background.append(surface.canvas); resize()
      if (freeze) {
        background.prepend(freeze)
        animate(surface.canvas, [{ opacity: 0 }, { opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.22,.61,.36,1)' }, transitions)
        cleanupTimer = win.setTimeout(clearTransition, 460)
      }
    }
    background.dataset.homeThemeId = selected
    resume()
  }
  const thumbnail = (theme: Theme): string | null => {
    if (theme === 'default') return dark ? defaultDark : defaultLight
    const key = theme + ':' + dark
    if (thumbs.has(key)) return thumbs.get(key)!
    const canvas = doc.createElement('canvas')
    const renderer = createHomeThemeRenderer(canvas, theme as HomeShaderThemeId, { dark, thumbnail: true })
    if (!renderer) return null
    try {
      renderer.resize(192, 112)
      if (!renderer.render(0, dark)) return null
      const value = canvas.toDataURL('image/png')
      thumbs.set(key, value); return value
    } catch { return null } finally { renderer.dispose() }
  }
  const updateCards = () => {
    const current = THEMES.indexOf(selected)
    for (const [id, button] of buttons) {
      let offset = (THEMES.indexOf(id) - current + THEMES.length) % THEMES.length
      if (offset > 2) offset -= THEMES.length
      const position = offset === -1 ? 'previous' : offset === 0 ? 'current' : offset === 1 ? 'next' : 'outside'
      button.dataset.homeThemePosition = position
      button.style.setProperty('--theme-offset', String(offset))
      button.setAttribute('aria-hidden', String(Math.abs(offset) > 1))
      button.setAttribute('aria-pressed', String(offset === 0))
      button.tabIndex = Math.abs(offset) > 1 ? -1 : 0
      button.setAttribute('aria-label', offset === 0 ? '当前背景：' + LABELS[id] : '切换到 ' + LABELS[id] + ' 背景')
      button.title = LABELS[id]
      const value = thumbnail(id)
      if (value) button.style.setProperty('--theme-thumbnail', `url("${value}")`)
      else button.style.removeProperty('--theme-thumbnail')
    }
    if (dock) dock.dataset.currentTheme = selected
  }
  const select = (id: Theme, persist = true) => {
    if (id === selected) return
    selected = id
    if (persist) try { win.localStorage.setItem(STORAGE_KEY, id) } catch { /* Keep the in-memory selection. */ }
    if (visible) { updateCards(); replaceSurface(true) }
  }
  const enter = () => {
    cancelAnimations(entries)
    if (!dock) return
    dock.dataset.entryGeneration = String(++generation)
    for (const button of buttons.values()) {
      const position = button.dataset.homeThemePosition
      if (position === 'outside') continue
      const delay = position === 'current' ? 100 : position === 'next' ? 175 : 35
      const body = button.firstElementChild as HTMLElement
      animate(body, [{ opacity: 0, transform: 'translateY(24px) scale(.9)' }, { opacity: 1, transform: 'translateY(-2px) scale(1.015)', offset: .72 }, { opacity: 1, transform: 'translateY(0) scale(1)' }], { duration: 570, delay, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' }, entries)
    }
  }
  const teardown = () => {
    stop(); clearTransition(); cancelAnimations(entries)
    observer.disconnect(); surface?.dispose(); surface = null
    background?.remove(); dock?.remove(); background = dock = null; buttons.clear()
  }
  const attach = (next: HTMLElement) => {
    teardown(); host = next
    background = doc.createElement('div'); background.dataset.odysseyHomeThemeBackground = ''; background.setAttribute('aria-hidden', 'true')
    dock = doc.createElement('div'); dock.dataset.odysseyThemeDock = ''; dock.setAttribute('role', 'group'); dock.setAttribute('aria-label', '首页背景主题')
    const strip = doc.createElement('div'); strip.className = 'odyssey-theme-strip'
    for (const id of THEMES) {
      const button = doc.createElement('button'); button.type = 'button'; button.dataset.homeThemeId = id
      const body = doc.createElement('span'); body.className = 'odyssey-theme-card-body'
      const glass = doc.createElement('span'); glass.className = 'odyssey-theme-glass'
      const preview = doc.createElement('span'); preview.className = 'odyssey-theme-preview'
      const blur = doc.createElement('span'); blur.className = 'odyssey-theme-edge-blur'
      preview.append(blur); body.append(glass, preview); button.append(body)
      button.addEventListener('click', () => { if (button.getAttribute('aria-hidden') !== 'true') select(id) })
      button.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
        event.preventDefault(); event.stopPropagation()
        const index = THEMES.indexOf(selected)
        select(THEMES[event.key === 'Home' ? 0 : event.key === 'End' ? 4 : (index + (event.key === 'ArrowRight' ? 1 : 4)) % 5]!)
        buttons.get(selected)?.focus({ preventScroll: true })
      })
      buttons.set(id, button); strip.append(button)
    }
    dock.append(strip); host.prepend(background); host.append(dock)
    updateCards(); replaceSurface(false); observer.observe(host)
  }
  const observer = new win.ResizeObserver(resize)
  const sync = () => {
    if (disposed) return
    const root = [...doc.querySelectorAll<HTMLElement>('.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"]')].find(node => !node.closest('[data-odyssey-subagent-panel]'))
    const nextHost = root?.closest<HTMLElement>('.pI_x6G_centerCol') ?? null
    const nextDark = doc.body.hasAttribute('data-ds-dark-theme')
    const settings = [...doc.querySelectorAll('.VOzbGW_overlay,[data-sherlock-settings-panel]')].some(isShown)
    const nextVisible = !!root && isShown(root) && !doc.body.hasAttribute('data-workspace-surface') && !settings
    const wasVisible = visible && nextHost === host, themeChanged = dark !== nextDark
    dark = nextDark
    if (nextHost && nextHost !== host) { attach(nextHost); visible = false }
    visible = nextVisible
    if (dock && dock.hidden === visible) dock.hidden = !visible
    if (background && background.hidden === visible) background.hidden = !visible
    if (!visible) { stop(); clearTransition(); cancelAnimations(entries); return }
    if (background?.dataset.homeThemeId !== selected) { updateCards(); replaceSurface(false) }
    else if (themeChanged || !wasVisible) { updateCards(); if (themeChanged && (doc.hidden || reduced.matches)) render() }
    if (!wasVisible || !surface) { if (!surface) replaceSurface(false); enter(); resume() }
  }
  const onVisibility = () => { if (doc.hidden) { stop(); cancelAnimations(entries); clearTransition() } else { sync(); resume() } }
  const onReduced = () => { clearTransition(); cancelAnimations(entries); resume() }
  const onStorage = (event: StorageEvent) => { if (event.key !== STORAGE_KEY) return; const value = event.newValue === null ? 'default' : event.newValue; if (validTheme(value)) select(value, false) }
  const changes = new win.MutationObserver(sync)
  changes.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-odyssey-page', 'data-ds-dark-theme', 'data-workspace-surface', 'hidden', 'class', 'style'] })
  doc.addEventListener('visibilitychange', onVisibility)
  doc.addEventListener('sherlock:workspace-surface-change', sync)
  reduced.addEventListener('change', onReduced); win.addEventListener('storage', onStorage)
  sync()
  const dispose = () => {
    if (disposed) return
    disposed = true; changes.disconnect(); teardown()
    doc.removeEventListener('visibilitychange', onVisibility); doc.removeEventListener('sherlock:workspace-surface-change', sync)
    reduced.removeEventListener('change', onReduced); win.removeEventListener('storage', onStorage)
    thumbs.clear(); mounted.delete(doc)
  }
  mounted.set(doc, dispose)
  return dispose
}
