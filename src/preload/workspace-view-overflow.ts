import { prepareBrowserOverlay } from './browser/overlay-preflight'

const selector = '.eb-workspace-tabs'
const overflowLabel = (document: Document) => document.documentElement.dataset.odysseyLocale === 'en'
  ? 'More workspace views' : '更多工作区页签'

/** Keep full labels in one row and route the remaining modes through the same buttons. */
export function installWorkspaceViewOverflow(document: Document) {
  const win = document.defaultView!
  const triggers = new Map<HTMLElement, HTMLButtonElement>()
  const menu = document.createElement('dialog')
  menu.className = 'workspace-view-overflow-menu'
  menu.setAttribute('role', 'menu')
  let anchor: HTMLButtonElement | undefined
  let menuSources: HTMLButtonElement[] = []
  const items = (nav: HTMLElement) => [...nav.querySelectorAll<HTMLButtonElement>('.eb-workspace-tab-list > button')]
  const sources = (nav: HTMLElement) => items(nav).filter(button => button.hasAttribute('data-workspace-overflowed'))
  const close = (focus = false) => {
    const previous = anchor
    anchor = undefined
    menuSources = []
    previous?.setAttribute('aria-expanded', 'false')
    menu.remove()
    if (focus && previous?.isConnected && !previous.hidden) previous.focus({ preventScroll: true })
  }
  const place = () => {
    if (!anchor) return
    const bounds = anchor.getBoundingClientRect()
    const header = anchor.closest('.workspace-app-topbar,[data-srb-session-header]')?.getBoundingClientRect()
    const width = menu.offsetWidth
    const start = bounds.left + width <= (header?.right ?? win.innerWidth) - 8 ? bounds.left : bounds.right - width
    menu.style.left = Math.round(Math.max(8, Math.min(start, win.innerWidth - width - 8))) + 'px'
    menu.style.top = Math.round(bounds.bottom + 5) + 'px'
  }
  const open = (nav: HTMLElement, trigger: HTMLButtonElement, last = false) => {
    const hidden = sources(nav)
    if (!hidden.length || nav.inert) return
    close()
    anchor = trigger
    menuSources = hidden
    menu.setAttribute('aria-label', overflowLabel(document))
    menu.replaceChildren(...hidden.map(source => {
      const option = document.createElement('button')
      option.type = 'button'
      option.setAttribute('role', 'menuitem')
      option.textContent = source.textContent
      option.dataset.workspaceNativeView = source.dataset.workspaceNativeView
      option.disabled = source.disabled
      option.setAttribute('aria-current', source.getAttribute('aria-current') ?? 'false')
      option.onclick = () => { close(true); source.click() }
      return option
    }))
    trigger.setAttribute('aria-expanded', 'true')
    document.body.append(menu)
    menu.show()
    place()
    const focusable = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    ;(last ? focusable.at(-1) : focusable[0])?.focus({ preventScroll: true })
    void prepareBrowserOverlay(document, menu)
  }
  const setup = (nav: HTMLElement, list: HTMLElement) => {
    const trigger = document.createElement('button')
    trigger.type = 'button'
    trigger.className = 'eb-workspace-overflow'
    trigger.hidden = true
    trigger.setAttribute('aria-haspopup', 'menu')
    trigger.setAttribute('aria-expanded', 'false')
    const icon = document.createElement('i')
    icon.setAttribute('aria-hidden', 'true')
    trigger.append(icon)
    trigger.onclick = () => anchor === trigger ? close(true) : open(nav, trigger)
    trigger.onkeydown = event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return
      event.preventDefault()
      open(nav, trigger, event.key === 'ArrowUp')
    }
    list.after(trigger)
    triggers.set(nav, trigger)
    resize.observe(nav)
    return trigger
  }
  const layout = (nav: HTMLElement) => {
    const list = nav.querySelector<HTMLElement>('.eb-workspace-tab-list')
    const gear = nav.querySelector<HTMLElement>('.eb-workspace-edit')
    if (!list || !gear) return
    const trigger = triggers.get(nav) ?? setup(nav, list)
    const label = overflowLabel(document)
    if (trigger.title !== label) {
      trigger.title = label
      trigger.setAttribute('aria-label', label)
    }
    if (nav.hasAttribute('data-customizing') || !nav.getClientRects().length || !gear.offsetWidth) {
      if (anchor === trigger) close()
      return
    }
    const buttons = items(nav)
    const gap = parseFloat(win.getComputedStyle(nav).columnGap) || 0
    const listGap = parseFloat(win.getComputedStyle(list).columnGap) || 0
    const widths = buttons.map(button => button.getBoundingClientRect().width)
    const gearWidth = gear.getBoundingClientRect().width
    const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, buttons.length - 1) * listGap + gearWidth + gap
    const cssWidth = `${Math.ceil(total)}px`
    if (nav.style.getPropertyValue('--workspace-view-width') !== cssWidth) {
      // Reflow can change the natural width without replaying the open animation.
      nav.setAttribute('data-workspace-measuring', '')
      nav.style.setProperty('--workspace-view-width', cssWidth)
      void nav.offsetWidth
      nav.removeAttribute('data-workspace-measuring')
    }
    if (nav.inert) {
      if (anchor === trigger) close()
      return
    }
    const available = nav.getBoundingClientRect().width
    let visible = 0
    if (available + 0.5 >= total) visible = buttons.length
    else {
      const triggerWidth = parseFloat(win.getComputedStyle(trigger).width)
      let remaining = available - gearWidth - triggerWidth - 2 * gap
      for (const width of widths) {
        if (remaining + 0.5 < width) break
        visible++
        remaining -= width + listGap
      }
    }
    buttons.forEach((button, index) => button.toggleAttribute('data-workspace-overflowed', index >= visible))
    const hidden = buttons.slice(visible)
    trigger.hidden = !hidden.length
    const content = document.documentElement.dataset.workspaceViewContent?.split(/\s+/) ?? []
    trigger.toggleAttribute('data-has-content', hidden.some(button =>
      button.getAttribute('aria-current') !== 'true' && content.includes(button.dataset.workspaceNativeView ?? '')))
    if (anchor === trigger) {
      if (hidden.length !== menuSources.length || hidden.some((button, index) => button !== menuSources[index])) close(true)
      else place()
    }
  }
  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = win.requestAnimationFrame(() => {
      frame = 0
      for (const [nav, trigger] of triggers) if (!nav.isConnected) {
        if (anchor === trigger) close()
        resize.unobserve(nav)
        triggers.delete(nav)
      }
      document.querySelectorAll<HTMLElement>(selector).forEach(layout)
    })
  }
  const resize = new win.ResizeObserver(schedule)
  const observer = new win.MutationObserver(records => {
    if (records.some(record => record.target === document.documentElement ||
      (record.target instanceof win.Element && record.target.closest(selector)) ||
      [...record.addedNodes, ...record.removedNodes].some(node => node instanceof win.Element &&
        (node.matches(selector) || node.querySelector(selector))))) schedule()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['aria-hidden', 'aria-current', 'data-customizing', 'data-workspace-surface'] })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale', 'data-workspace-view-content'] })
  win.addEventListener('resize', schedule)
  document.addEventListener('sherlock:workspace-surface-change', () => { close(); schedule() })
  document.addEventListener('pointerdown', event => {
    if (anchor && !anchor.contains(event.target as Node) && !menu.contains(event.target as Node)) close()
  }, true)
  document.addEventListener('keydown', event => {
    if (!anchor || event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    close(true)
  }, true)
  menu.addEventListener('keydown', event => {
    if (event.key === 'Tab') { close(true); return }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const options = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    if (!options.length) return
    event.preventDefault()
    const index = options.indexOf(document.activeElement as HTMLButtonElement)
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
    options[next]?.focus()
  })
  schedule()
}
