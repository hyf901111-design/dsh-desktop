import styles from './home-app-shortcuts.css?raw'

export type HomeAppShortcut = 'browser' | 'plugin' | 'scheduled' | 'research' | 'note'
const apps: readonly HomeAppShortcut[] = ['browser', 'plugin', 'scheduled', 'research', 'note']
const labels = {
  zh: ['浏览器', '插件', '定时任务', '研究看板', '笔记'],
  en: ['Browser', 'Plugins', 'Scheduled tasks', 'Research board', 'Notes']
}
const mounted = new WeakMap<Document, () => void>()

/** A projection of existing app navigation; the composer and its draft stay native. */
export function mountHomeAppShortcuts(doc: Document, open: (app: HomeAppShortcut, signal: AbortSignal) => Promise<void> | void): () => void {
  const existing = mounted.get(doc)
  if (existing) return existing
  const win = doc.defaultView
  if (!win) return () => {}
  const style = doc.createElement('style')
  style.id = 'sherlock-home-app-shortcuts-style'
  style.textContent = styles
  doc.head.append(style)
  const nav = doc.createElement('nav')
  nav.dataset.homeAppShortcuts = ''
  const status = doc.createElement('p')
  status.className = 'home-app-shortcuts-status'
  status.setAttribute('role', 'status')
  const buttons = apps.map(app => {
    const button = doc.createElement('button')
    button.type = 'button'
    button.dataset.homeApp = app
    const icon = doc.createElement('span')
    icon.className = 'home-app-shortcut-icon'
    icon.setAttribute('aria-hidden', 'true')
    const tooltip = doc.createElement('span')
    tooltip.className = 'home-app-shortcut-tooltip'
    tooltip.setAttribute('aria-hidden', 'true')
    button.append(icon, tooltip)
    return button
  })
  nav.append(...buttons, status)
  let host: Element | null = null
  let pending: { controller: AbortController; button: HTMLButtonElement } | undefined
  let stopped = false
  const reset = () => {
    pending?.controller.abort()
    pending?.button.removeAttribute('aria-busy')
    pending = undefined
    status.textContent = ''
  }
  const sync = () => {
    const next = doc.body.dataset.workspaceSurface ? null : [...doc.querySelectorAll('.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"] .wSkVaW_composerHero')]
      .find(el => !el.closest('[data-odyssey-subagent-panel], .sRp_composer') && el.querySelector('.uV2eYG_card')) ?? null
    if (next !== host) { reset(); nav.remove(); host = next }
    const english = doc.documentElement.dataset.odysseyLocale === 'en'
    nav.setAttribute('aria-label', english ? 'Apps' : '应用快捷入口')
    buttons.forEach((button, index) => {
      const label = labels[english ? 'en' : 'zh'][index]!
      if (button.getAttribute('aria-label') !== label) {
        button.setAttribute('aria-label', label)
        button.lastElementChild!.textContent = label
      }
    })
    if (host && nav.parentElement !== host) host.append(nav)
  }
  nav.addEventListener('click', event => {
    const target = (event.target as Element).closest<HTMLButtonElement>('button[data-home-app]')
    if (!target || pending?.button === target || !host?.isConnected || stopped) return
    event.preventDefault()
    reset()
    const controller = new win.AbortController()
    pending = { controller, button: target }
    target.setAttribute('aria-busy', 'true')
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return open(target.dataset.homeApp as HomeAppShortcut, controller.signal)
    }).catch(error => {
      if (!controller.signal.aborted) status.textContent = error instanceof Error ? error.message : String(error)
    }).finally(() => {
      if (pending?.controller === controller) { pending = undefined; target.removeAttribute('aria-busy') }
    })
  })
  const observer = new win.MutationObserver(sync)
  observer.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-odyssey-page', 'data-workspace-surface'] })
  observer.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  sync()
  const dispose = () => {
    stopped = true
    observer.disconnect()
    reset()
    nav.remove()
    style.remove()
    mounted.delete(doc)
  }
  mounted.set(doc, dispose)
  return dispose
}
