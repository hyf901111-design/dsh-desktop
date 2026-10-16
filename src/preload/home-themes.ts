import {noteUiText} from '../../packages/dsh-research-task-runtime/notes-locale.js'
import { createHomeFlowField } from './home-flow'
import { createHomeThemeRenderer, type HomeShaderThemeId } from './home-theme-renderer'
import { isReactBitsTheme } from './home-reactbits-renderer'
import { REACT_BITS_PREVIEWS } from './home-reactbits-previews'
import defaultLight from './home-theme-assets/default-light.png?inline'
import defaultDark from './home-theme-assets/default-dark.png?inline'
import { HOME_THEMES as THEMES, HOME_THEME_STORAGE_KEY as STORAGE_KEY, isHomeTheme as validTheme, normalizeHomeTheme, type HomeTheme as Theme, type HomeThemePreferences } from '../shared/home-themes'

const LABELS: Record<Theme, string> = { 'default': '默认', 'berber': 'Berber', 'vghodki': 'Vghodki', 'jarrick': 'Jarrick', 'lowfreez': 'Lowfreez', 'accelbia': 'Accelbia', 'boz': 'Boz', 'shashidhar': 'Shashidhar', 'haseeb': 'Haseeb', 'kirian': 'Kirian', 'splines': 'Splines', 'antiquue': 'Antiquue', 'crt-warp': 'CRT Warp', 'dither': 'Dither' }
const PENDING_STORAGE_KEY = `${STORAGE_KEY}.pending-native`
const mounted = new WeakMap<Document, () => void>()
type Surface = { canvas: HTMLCanvasElement; render(seconds: number, dark: boolean): boolean; resize(width: number, height: number): void; dispose(): void }

/** One owner for homepage decoration; the native composer and appearance store stay native. */
export function mountHomeThemes(doc: Document = document, preferences?: HomeThemePreferences): () => void {
  const existing = mounted.get(doc)
  if (existing) return existing
  const win = doc.defaultView
  if (!win) return () => {}
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  let durable: Theme | null = null, legacy: Theme | null = null
  try { durable = normalizeHomeTheme(preferences?.get()) } catch { /* Preview or unavailable desktop bridge. */ }
  try { legacy = normalizeHomeTheme(win.localStorage.getItem(STORAGE_KEY)) } catch { /* Private storage may be unavailable. */ }
  let pending: { theme: Theme; previous: Theme | null } | undefined
  try {
    const raw = win.localStorage.getItem(PENDING_STORAGE_KEY)
    const value = raw && raw.length <= 256 ? JSON.parse(raw) : null
    if (value && validTheme(value.theme) && (value.previous === null || validTheme(value.previous))) pending = value
  } catch {}
  const savePreference = (theme: Theme) => {
    const previous = durable
    let saved = false
    try { saved = preferences?.set(theme) === true } catch {}
    if (saved) durable = theme
    try {
      win.localStorage.setItem(STORAGE_KEY, theme)
      if (preferences && !saved) win.localStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify({ theme, previous }))
      else win.localStorage.removeItem(PENDING_STORAGE_KEY)
    } catch { /* Keep the visible choice when browser storage is unavailable. */ }
  }
  // An explicit failed write is newer than its original durable value, but an
  // old page must not overwrite a choice successfully saved by another page.
  const recoverPending = !!preferences && !!pending && (durable === null || durable === pending.previous)
  let selected: Theme = recoverPending ? pending!.theme : durable ?? legacy ?? 'default'
  if (recoverPending || (durable === null && legacy !== null)) savePreference(selected)
  else if (durable !== null || legacy !== null) try {
    win.localStorage.setItem(STORAGE_KEY, selected)
    win.localStorage.removeItem(PENDING_STORAGE_KEY)
  } catch {}
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
          // React Bits uses premultiplied transparency. Freeze the complete
          // displayed surface before the next theme changes its paper color.
          ctx.fillStyle = win.getComputedStyle(background).backgroundColor
          ctx.fillRect(0, 0, freeze.width, freeze.height)
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
    background.dataset.homeThemeFamily = isReactBitsTheme(selected) ? 'react-bits' : 'open-shaders'
    resume()
  }
  const thumbnail = (theme: Theme): string | null => {
    if (theme === 'default') return dark ? defaultDark : defaultLight
    if (isReactBitsTheme(theme)) return REACT_BITS_PREVIEWS[theme][dark ? 'dark' : 'light']
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
      if (offset > Math.floor(THEMES.length / 2)) offset -= THEMES.length
      const position = offset === -1 ? 'previous' : offset === 0 ? 'current' : offset === 1 ? 'next' : 'outside'
      button.dataset.homeThemePosition = position
      button.style.setProperty('--theme-offset', String(offset))
      button.setAttribute('aria-hidden', String(Math.abs(offset) > 1))
      button.setAttribute('aria-pressed', String(offset === 0))
      button.tabIndex = Math.abs(offset) > 1 ? -1 : 0
      button.setAttribute('aria-label', doc.documentElement.dataset.odysseyLocale==='en' ? (offset===0?'Current background: ':'Switch background: ')+noteUiText(LABELS[id],'en') : offset === 0 ? '当前背景：' + LABELS[id] : '切换到 ' + LABELS[id] + ' 背景')
      button.title = noteUiText(LABELS[id],doc.documentElement.dataset.odysseyLocale)
      // Only the current card and its neighbors are painted. Avoid compiling
      // every hidden OpenShaders thumbnail during startup or a mode change.
      if (position !== 'outside') {
        const value = thumbnail(id)
        if (value) button.style.setProperty('--theme-thumbnail', `url("${value}")`)
        else button.style.removeProperty('--theme-thumbnail')
      }
    }
    if (dock) dock.dataset.currentTheme = selected
  }
  const select = (id: Theme, persist = true) => {
    if (id === selected) return
    selected = id
    if (persist) savePreference(id)
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
        select(THEMES[event.key === 'Home' ? 0 : event.key === 'End' ? THEMES.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : THEMES.length - 1)) % THEMES.length]!)
        buttons.get(selected)?.focus({ preventScroll: true })
      })
      buttons.set(id, button); strip.append(button)
    }
    dock.append(strip); host.prepend(background); host.append(dock)
    updateCards(); replaceSurface(false); observer.observe(host)
  }
  const observer = new win.ResizeObserver(resize)
  let renderedLocale=doc.documentElement.dataset.odysseyLocale
  const sync = () => {
    if (disposed) return
    dock?.setAttribute('aria-label',noteUiText('首页背景主题',doc.documentElement.dataset.odysseyLocale))
    if(renderedLocale!==doc.documentElement.dataset.odysseyLocale){renderedLocale=doc.documentElement.dataset.odysseyLocale;if(dock)updateCards()}
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
  const localeObserver=new win.MutationObserver(sync);localeObserver.observe(doc.documentElement,{attributes:true,attributeFilter:['data-odyssey-locale']})
  doc.addEventListener('visibilitychange', onVisibility)
  doc.addEventListener('sherlock:workspace-surface-change', sync)
  reduced.addEventListener('change', onReduced); win.addEventListener('storage', onStorage)
  sync()
  const dispose = () => {
    if (disposed) return
    disposed = true; changes.disconnect(); localeObserver.disconnect(); teardown()
    doc.removeEventListener('visibilitychange', onVisibility); doc.removeEventListener('sherlock:workspace-surface-change', sync)
    reduced.removeEventListener('change', onReduced); win.removeEventListener('storage', onStorage)
    thumbs.clear(); mounted.delete(doc)
  }
  mounted.set(doc, dispose)
  return dispose
}
