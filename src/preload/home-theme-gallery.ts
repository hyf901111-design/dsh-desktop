import { HOME_THEMES, type HomeTheme } from '../shared/home-themes'
import type { HomeThemeController, HomeThemePreview } from './home-theme-controls'
import sun from './home-operations-icons/sun.svg?inline'
import moon from './home-operations-icons/moon.svg?inline'

const LABELS: Record<HomeTheme, readonly [string, string]> = {
  default: ['静谧起航', 'Quiet Departure'], berber: ['星海航迹', 'Star Trails'],
  vghodki: ['碧海潮汐', 'Ocean Tides'], jarrick: ['星门微光', 'Stargate Glow'],
  lowfreez: ['银河帆影', 'Galactic Sails'], accelbia: ['翡翠秘境', 'Emerald Haven'],
  boz: ['深空讯号', 'Deep Space Signal'], shashidhar: ['星云风暴', 'Nebula Storm'],
  haseeb: ['极光之境', 'Aurora Realm'], kirian: ['远星尘光', 'Distant Stardust'],
  splines: ['虹光跃迁', 'Prismatic Drift'], antiquue: ['日曜航线', 'Solar Passage'],
  'crt-warp': ['时空回声', 'Temporal Echo'], dither: ['墨海流岚', 'Inksea Mist'],
  'koi-pond': ['锦鲤浮光', 'Koi Shimmer']
}

// Exact 18px vectors from the approved Figma appearance control.
export const homeAppearanceIcon = (dark: boolean) => dark ? sun : moon

export type HomeThemeGallery = {
  element: HTMLElement
  setVisible(visible: boolean): void
  refresh(): void
  layout(width: number, availableHeight: number, fontRevision?: number): number
  dispose(): void
}

/** Preferences remain native; only the currently hovered card owns a live view. */
export function createHomeThemeGallery(doc: Document, controller: HomeThemeController, options: { fitHeight?: boolean; livePreview?: boolean } = {}): HomeThemeGallery {
  const win = doc.defaultView!, reduced = win.matchMedia('(prefers-reduced-motion: reduce)')
  const element = doc.createElement('div')
  element.className = 'odyssey-theme-gallery'
  element.dataset.odysseyThemeGallery = ''
  const cards = new Map<HomeTheme, HTMLButtonElement>()
  let visible = false, columns = 5, layoutSignature = '', layoutHeight = 0
  let disposed = false, pointer: HomeTheme | null = null, keyboard: HomeTheme | null = null
  let pending = 0, frame = 0, active: { id: HomeTheme; view: HomeThemePreview; seconds: number; previous: number } | null = null
  const freezes = new Map<HTMLCanvasElement, number>()
  const dark = () => doc.body.hasAttribute('data-ds-dark-theme')
  const stopPreview = (fade = false) => {
    win.clearTimeout(pending); pending = 0
    win.cancelAnimationFrame(frame); frame = 0
    if (!active) return
    const previous = active; active = null
    if (fade && !reduced.matches) {
      // Retain only a short CPU freeze while releasing the GL context at once.
      const freeze = doc.createElement('canvas'), canvas = previous.view.canvas
      freeze.width = canvas.width; freeze.height = canvas.height
      const ctx = freeze.getContext('2d')
      try {
        if (ctx && previous.view.render(previous.seconds, dark())) {
          ctx.drawImage(canvas, 0, 0); freeze.dataset.homeThemePreviewFreeze = ''
          freeze.style.setProperty('--odyssey-wallpaper-freeze-opacity', win.getComputedStyle(canvas).opacity)
          canvas.before(freeze)
          freezes.set(freeze, win.setTimeout(() => { freeze.remove(); freezes.delete(freeze) }, 220))
        }
      } catch { /* Static thumbnail stays visible if copying a lost context fails. */ }
    }
    previous.view.dispose(); previous.view.canvas.remove()
    delete cards.get(previous.id)!.dataset.previewPlaying
  }
  const sizePreview = () => {
    if (!active) return
    const bounds = cards.get(active.id)!.querySelector('.odyssey-wallpaper-preview')!.getBoundingClientRect()
    active.view.resize(Math.max(1, bounds.width), Math.max(1, bounds.height))
  }
  const tick = (now: number) => {
    frame = 0
    if (!active || disposed || !visible || doc.hidden || reduced.matches) { stopPreview(); return }
    if (!active.previous || now - active.previous >= 1000 / 24) {
      if (active.previous) active.seconds += Math.min(.1, (now - active.previous) / 1000)
      active.previous = now
      if (!active.view.render(active.seconds, dark())) { stopPreview(); return }
    }
    frame = win.requestAnimationFrame(tick)
  }
  const reconcilePreview = () => {
    const id = pointer ?? keyboard
    if (active?.id === id && visible && !doc.hidden && !reduced.matches) return
    stopPreview(visible && !doc.hidden)
    if (!id || disposed || !visible || doc.hidden || reduced.matches || !options.livePreview || !controller.createPreview) return
    // Avoid shader work while the pointer is merely crossing the grid.
    pending = win.setTimeout(() => {
      pending = 0
      if (disposed || !visible || doc.hidden || reduced.matches || (pointer ?? keyboard) !== id) return
      const view = controller.createPreview!(id)
      if (!view) return
      active = { id, view, seconds: 0, previous: 0 }
      view.canvas.dataset.homeThemePreview = id
      view.canvas.setAttribute('aria-hidden', 'true')
      cards.get(id)!.querySelector('.odyssey-wallpaper-preview')!.append(view.canvas)
      sizePreview()
      if (!view.render(0, dark())) { stopPreview(); return }
      cards.get(id)!.dataset.previewPlaying = ''
      frame = win.requestAnimationFrame(tick)
    }, 90)
  }
  const english = () => doc.documentElement.dataset.odysseyLocale === 'en'
  const labels = () => {
    for (const [id, card] of cards) {
      const name = LABELS[id][english() ? 1 : 0]
      card.querySelector('.odyssey-wallpaper-name')!.textContent = name
      card.setAttribute('aria-label', name)
      card.setAttribute('aria-pressed', String(controller.getSelected() === id))
    }
  }
  const refresh = () => {
    labels()
    if (!visible) return
    for (const [id, card] of cards) {
      const image = card.querySelector('img')!
      const thumbnail = controller.getThumbnail(id)
      if (thumbnail && image.getAttribute('src') !== thumbnail) image.src = thumbnail
      image.hidden = !thumbnail
      if (!thumbnail) image.removeAttribute('src')
    }
    if (active && !active.view.render(active.seconds, dark())) stopPreview()
  }
  for (const id of HOME_THEMES) {
    const card = doc.createElement('button')
    card.type = 'button'; card.className = 'odyssey-wallpaper-card'; card.dataset.homeThemeId = id; card.tabIndex = -1
    const preview = doc.createElement('span'); preview.className = 'odyssey-wallpaper-preview'
    const image = doc.createElement('img'); image.alt = ''; image.draggable = false; image.hidden = true
    preview.append(image)
    const name = doc.createElement('span'); name.className = 'odyssey-wallpaper-name'
    card.append(preview, name)
    card.addEventListener('pointerenter', () => { pointer = id; reconcilePreview() })
    card.addEventListener('pointerleave', () => { if (pointer === id) pointer = null; reconcilePreview() })
    card.addEventListener('focus', () => { if (card.matches(':focus-visible')) { keyboard = id; reconcilePreview() } })
    card.addEventListener('blur', () => { if (keyboard === id) keyboard = null; reconcilePreview() })
    card.addEventListener('click', () => { if (visible) controller.select(id) })
    card.addEventListener('keydown', event => {
      const index = HOME_THEMES.indexOf(id)
      const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -columns, ArrowDown: columns } as Record<string, number>)[event.key]
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? HOME_THEMES.length - 1 : offset === undefined ? null : Math.max(0, Math.min(HOME_THEMES.length - 1, index + offset))
      if (target === null || event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault(); cards.get(HOME_THEMES[target]!)?.focus()
    })
    cards.set(id, card); element.append(card)
  }
  const unsubscribe = controller.subscribe(refresh)
  const leaveWindow = () => { pointer = keyboard = null; stopPreview(); for (const [freeze, timer] of freezes) { win.clearTimeout(timer); freeze.remove() }; freezes.clear() }
  const visibility = () => { if (doc.hidden) leaveWindow() }
  const scrolled = (event: Event) => {
    if ((!active && !pending) || !(event.target instanceof win.Element) || !event.target.contains(element)) return
    // Native scrolling can follow pointerenter (including scroll-into-view).
    // Keep the card actually under the pointer rather than dropping its intent.
    pointer = [...cards].find(([, card]) => card.matches(':hover'))?.[0] ?? null
    reconcilePreview()
  }
  const reducedChanged = () => { if (reduced.matches) leaveWindow(); else reconcilePreview() }
  doc.addEventListener('visibilitychange', visibility)
  doc.addEventListener('scroll', scrolled, true)
  win.addEventListener('blur', leaveWindow)
  reduced.addEventListener('change', reducedChanged)
  labels()
  return {
    element, refresh,
    setVisible(next) {
      if (visible === next) return
      visible = next
      if (!visible) leaveWindow()
      for (const card of cards.values()) card.tabIndex = visible ? 0 : -1
      if (visible) refresh()
    },
    layout(width, availableHeight, fontRevision = 0) {
      const signature = `${width}:${availableHeight}:${english()}:${fontRevision}:${doc.fonts?.status}`
      if (signature === layoutSignature) return layoutHeight
      const wasHidden = element.hidden, visibility = element.style.visibility
      if (wasHidden) { element.style.visibility = 'hidden'; element.hidden = false }
      try {
        element.style.width = `${width}px`
        const gap = width < 420 ? 8 : 12, nameGap = width < 420 ? 4 : 8
        let previewHeight = 78, rowHeight = 106, totalHeight = 342
        for (let count = width >= 650 ? 5 : 3; count <= 8; count++) {
          columns = count
          element.style.setProperty('--odyssey-wallpaper-columns', String(columns))
          element.style.setProperty('--odyssey-wallpaper-gap', `${gap}px`)
          element.style.setProperty('--odyssey-wallpaper-name-gap', `${nameGap}px`)
          const column = Math.max(1, (width - gap * (columns - 1)) / columns)
          const rows = Math.ceil(HOME_THEMES.length / columns), gaps = gap * (rows - 1)
          const hiddenLines = english() ? column < 65 ? 3 : column < 115 ? 2 : 1 : column < 48 ? 2 : 1
          const labelHeight = Math.max(20, ...[...cards.values()].map(card => { const label = card.querySelector<HTMLElement>('.odyssey-wallpaper-name')!; return Math.max(label.offsetHeight, label.scrollHeight) || hiddenLines * 18 }))
          previewHeight = column * 78 / 146.4
          rowHeight = previewHeight + nameGap + labelHeight
          totalHeight = rowHeight * rows + gaps
          if (options.fitHeight === false || totalHeight <= availableHeight) break
        }
        element.style.setProperty('--odyssey-wallpaper-preview-height', `${previewHeight}px`)
        element.style.setProperty('--odyssey-wallpaper-row-height', `${rowHeight}px`)
        sizePreview()
        layoutSignature = signature; layoutHeight = totalHeight
        return totalHeight
      } finally { if (wasHidden) { element.hidden = true; element.style.visibility = visibility } }
    },
    dispose() { disposed = true; visible = false; leaveWindow(); unsubscribe(); doc.removeEventListener('visibilitychange', visibility); doc.removeEventListener('scroll', scrolled, true); win.removeEventListener('blur', leaveWindow); reduced.removeEventListener('change', reducedChanged); element.remove() }
  }
}
