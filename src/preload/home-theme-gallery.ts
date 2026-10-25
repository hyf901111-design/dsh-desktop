import { HOME_THEMES, type HomeTheme } from '../shared/home-themes'
import type { HomeThemeController } from './home-theme-controls'
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

/** A view of the native owner. It holds neither wallpaper preferences nor renderers. */
export function createHomeThemeGallery(doc: Document, controller: HomeThemeController): HomeThemeGallery {
  const element = doc.createElement('div')
  element.className = 'odyssey-theme-gallery'
  element.dataset.odysseyThemeGallery = ''
  const cards = new Map<HomeTheme, HTMLButtonElement>()
  let visible = false, columns = 5, layoutSignature = '', layoutHeight = 0
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
  }
  for (const id of HOME_THEMES) {
    const card = doc.createElement('button')
    card.type = 'button'; card.className = 'odyssey-wallpaper-card'; card.dataset.homeThemeId = id; card.tabIndex = -1
    const preview = doc.createElement('span'); preview.className = 'odyssey-wallpaper-preview'
    const image = doc.createElement('img'); image.alt = ''; image.draggable = false; image.hidden = true
    preview.append(image)
    const name = doc.createElement('span'); name.className = 'odyssey-wallpaper-name'
    card.append(preview, name)
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
  labels()
  return {
    element, refresh,
    setVisible(next) {
      if (visible === next) return
      visible = next
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
          if (totalHeight <= availableHeight) break
        }
        element.style.setProperty('--odyssey-wallpaper-preview-height', `${previewHeight}px`)
        element.style.setProperty('--odyssey-wallpaper-row-height', `${rowHeight}px`)
        layoutSignature = signature; layoutHeight = totalHeight
        return totalHeight
      } finally { if (wasHidden) { element.hidden = true; element.style.visibility = visibility } }
    },
    dispose() { visible = false; unsubscribe(); element.remove() }
  }
}
