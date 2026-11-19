import type { BrowserRegionRect } from '../shared/browser-region'

const nativeViews = [
  ['chat', '对话', 'Chat'], ['research', '研究', 'Research'], ['notes', '笔记', 'Notes'], ['spreadsheet', '表格', 'Spreadsheet']
] as const
export const sessionWorkspaceAppViews = [
  ['browser', '浏览器', 'Browser'], ['image-factory', '图像', 'Images'], ['knowledge', '知识库', 'Knowledge']
] as const
export const workspaceViews = [...nativeViews, ...sessionWorkspaceAppViews] as const
export const sessionWorkspaceViewEvent = 'sherlock:session-workspace-view'
export type SessionWorkspaceAppView = typeof sessionWorkspaceAppViews[number][0]

const sessionHeader = '.pI_x6G_centerCol .wSkVaW_root [data-srb-session-header][data-ework-notes-session]'
const hoverDelay = 160

export function findWorkspaceSession(document: Document, sessionId?: string) {
  return [...document.querySelectorAll<HTMLElement>(sessionHeader)].find(header =>
    (!sessionId || header.dataset.eworkNotesSession === sessionId) && !header.closest('[data-odyssey-subagent-panel]'))
}

export function workspaceViewButton(document: Document, sessionId: string, view: string) {
  if (!nativeViews.some(([id]) => id === view)) return undefined
  return findWorkspaceSession(document, sessionId)
    ?.querySelector<HTMLButtonElement>(`[data-srb-tabs] button[data-conversation-view-id="${view}"]`)
}

export function navigateWorkspaceView(document: Document, sessionId: string, view: string, reveal: () => void) {
  const header = findWorkspaceSession(document, sessionId)
  if (!header?.querySelector('[data-srb-tabs]')) return false
  if (sessionWorkspaceAppViews.some(([id]) => id === view)) {
    return !document.dispatchEvent(new CustomEvent(sessionWorkspaceViewEvent, { detail: { sessionId, view }, cancelable: true }))
  }
  const tab = workspaceViewButton(document, sessionId, view)
  if (!tab?.isConnected || tab.disabled) return false
  document.body.dataset.sessionWorkspaceSwitch = sessionId
  reveal()
  const current = workspaceViewButton(document, sessionId, view)
  if (!current?.isConnected || current.disabled) return false
  current.click()
  return true
}

export type WorkspacePointerInBar = (bounds: BrowserRegionRect) => Promise<boolean>

export class WorkspaceViewHover {
  expanded = false
  private timer?: ReturnType<typeof setTimeout>
  private generation = 0
  private pointerBar?: HTMLElement

  constructor(
    private root: HTMLElement,
    private bar: () => HTMLElement | null,
    private onChange: (expanded: boolean) => void,
    private pointerInBar?: WorkspacePointerInBar
  ) {
    root.addEventListener('pointerover', this.over)
    root.addEventListener('pointerdown', this.down)
    root.addEventListener('pointerout', this.out)
    root.addEventListener('focusout', this.out)
  }

  setExpanded(expanded: boolean) {
    if (this.expanded === expanded) {
      if (!expanded) this.cancel()
      return
    }
    this.reset(expanded)
    this.onChange(expanded)
    if (expanded && this.pointerInBar) this.schedule()
  }

  reset(expanded = false) {
    this.cancel()
    this.expanded = expanded
  }

  dispose() {
    this.reset()
    this.root.removeEventListener('pointerover', this.over)
    this.root.removeEventListener('pointerdown', this.down)
    this.root.removeEventListener('pointerout', this.out)
    this.root.removeEventListener('focusout', this.out)
  }

  private cancel() {
    clearTimeout(this.timer)
    this.generation++
  }

  private schedule() {
    this.cancel()
    const generation = this.generation
    this.timer = setTimeout(async () => {
      if (!this.expanded || this.root.querySelector('.eb-workspace-controls :focus-visible')) return
      const bar = this.bar()
      if (!bar) return
      const insideBar = () => this.pointerBar === bar || bar.matches(':hover')
      let inside = insideBar()
      // Native window drag regions can consume Chromium's pointer events.
      if (!inside && this.pointerInBar) {
        const { x, y, width, height } = bar.getBoundingClientRect()
        try { inside = await this.pointerInBar({ x, y, width, height }) } catch {}
      }
      if (generation !== this.generation || this.root.querySelector('.eb-workspace-controls :focus-visible')) return
      const editingShortcuts = this.root.ownerDocument.body.hasAttribute('data-navigation-editing') ||
        bar.querySelector('.eb-workspace-tabs[data-navigation-retain]')
      if (!inside && !insideBar() && !editingShortcuts) this.setExpanded(false)
      else if (this.pointerInBar || editingShortcuts) this.schedule()
    }, hoverDelay)
  }

  private over = (event: PointerEvent) => {
    const target = event.target as Element
    const bar = this.bar()
    if (event.pointerType === 'touch' || !bar?.contains(target)) return
    // A renderer pointer event can be newer than the native screen position.
    this.pointerBar = bar
    if (this.expanded) {
      if (!this.pointerInBar) this.cancel()
      return
    }
    if (target.closest('.eb-workspace-toggle') && !(event.relatedTarget as Element | null)?.closest?.('.eb-workspace-toggle')) {
      // Entering the button to click it should not open it just before the click toggles it.
      this.cancel()
      this.timer = setTimeout(() => this.setExpanded(true), hoverDelay)
    }
  }

  private down = (event: PointerEvent) => {
    if (!this.expanded && (event.target as Element).closest?.('.eb-workspace-toggle')) this.cancel()
  }

  private out = (event: PointerEvent | FocusEvent) => {
    const target = event.target as Element
    const next = event.relatedTarget as Element | null
    const bar = this.pointerBar
    if (event.type === 'pointerout' && bar?.contains(target) && !bar.contains(next)) this.pointerBar = undefined
    const boundary = event.type === 'focusout' ? target.closest?.('.eb-workspace-controls')
      : this.expanded ? this.bar() : target.closest?.('.eb-workspace-toggle')
    if (!boundary?.contains(target) || boundary.contains(next)) return
    if (!this.expanded) this.cancel()
    else if (!this.pointerInBar || event.type === 'focusout') this.schedule()
  }
}

export function mountSessionWorkspaceViewShortcuts(document: Document, reveal: () => void, pointerInBar?: WorkspacePointerInBar) {
  const win = document.defaultView!
  const controls = document.createElement('div')
  controls.className = 'eb-workspace-controls'
  controls.dataset.sessionWorkspaceControls = ''
  const toggle = document.createElement('button')
  toggle.type = 'button'
  toggle.className = 'eb-workspace-toggle'
  toggle.setAttribute('aria-controls', 'odyssey-session-workspace-views')
  const icon = document.createElement('i')
  icon.setAttribute('aria-hidden', 'true')
  toggle.append(icon)
  const nav = document.createElement('nav')
  nav.id = 'odyssey-session-workspace-views'
  nav.className = 'eb-workspace-tabs'
  controls.append(toggle, nav)
  let owner: HTMLElement | undefined, hover: WorkspaceViewHover | undefined, frame = 0
  const english = () => document.documentElement.dataset.odysseyLocale === 'en'
  const buttons = workspaceViews.map(([view, zh, en]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.workspaceNativeView = view
    button.addEventListener('click', () => {
      const id = owner?.dataset.eworkNotesSession
      if (!id || activeHeader() !== owner) return
      const selected = button.getAttribute('aria-current') === 'true'
      hover?.setExpanded(false)
      if (!selected) navigateWorkspaceView(document, id, view, reveal)
    })
    nav.append(button)
    return { view, zh, en, button }
  })
  function activeHeader() {
    const surface = document.body.dataset.workspaceSurface
    if (surface && surface !== 'notes') return undefined
    const header = findWorkspaceSession(document)
    if (!header || header.dataset.odysseyHomeHeader === 'true' ||
        header.getAttribute('aria-hidden') === 'true' ||
        header.closest('.wSkVaW_root')?.getAttribute('data-odyssey-page') === 'home') return undefined
    return header
  }
  const expand = (expanded: boolean) => {
    const label = english() ? (expanded ? 'Collapse workspace tabs' : 'Expand workspace tabs')
      : (expanded ? '收起工作区页签' : '展开工作区页签')
    toggle.title = label
    toggle.setAttribute('aria-label', label)
    toggle.setAttribute('aria-expanded', String(expanded))
    nav.setAttribute('aria-hidden', String(!expanded))
    nav.inert = !expanded
  }
  toggle.addEventListener('click', () => hover?.setExpanded(!hover.expanded))
  controls.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !hover?.expanded) return
    event.preventDefault()
    event.stopPropagation()
    hover.setExpanded(false)
    toggle.focus({ preventScroll: true })
  })
  let updated = ''
  const sync = () => {
    frame = 0
    const header = activeHeader()
    if (header !== owner) {
      hover?.dispose()
      controls.remove()
      owner = header
      hover = header && new WorkspaceViewHover(header, () => header, expand, pointerInBar)
      expand(false)
      updated = ''
    }
    if (!header) return
    if (!header.contains(controls)) header.append(controls)
    const selected = header.querySelector('[data-conversation-view-id][aria-selected=true]')?.getAttribute('data-conversation-view-id')
    const id = header.dataset.eworkNotesSession!
    const language = english() ? 'en' : 'zh'
    const native = header.querySelector('[data-srb-tabs]')
    const availability = buttons.map(({ view }) => !!native && (
      sessionWorkspaceAppViews.some(([id]) => id === view) || !!native.querySelector(`button[data-conversation-view-id="${view}"]:not(:disabled)`)))
    const signature = [id, selected, language, ...availability].join(',')
    if (updated === signature) return
    updated = signature
    expand(hover?.expanded === true)
    nav.setAttribute('aria-label', language === 'en' ? 'Workspace views' : '工作区视图')
    buttons.forEach(({ view, zh, en, button }, index) => {
      const label = language === 'en' ? en : zh
      button.textContent = label
      button.setAttribute('aria-label', (language === 'en' ? 'Switch to ' : '切换到') + label)
      button.setAttribute('aria-current', String(selected === view))
      button.disabled = !availability[index]
    })
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(sync) }
  const observer = new win.MutationObserver(schedule)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: [
    'data-ework-notes-session', 'data-odyssey-home-header', 'data-odyssey-page', 'aria-selected', 'disabled', 'aria-hidden'
  ] })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  document.addEventListener('sherlock:workspace-surface-change', schedule)
  sync()
  return () => {
    observer.disconnect()
    win.cancelAnimationFrame(frame)
    document.removeEventListener('sherlock:workspace-surface-change', schedule)
    hover?.dispose()
    controls.remove()
  }
}
