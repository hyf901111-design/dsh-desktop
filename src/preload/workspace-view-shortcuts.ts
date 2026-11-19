import { defaultNavigationShortcuts, isTopNavigationApp, topNavigationApps, type NavigationShortcuts } from '../shared/navigation-shortcuts'
import { prepareBrowserOverlay } from './browser/overlay-preflight'

const nativeViews = [
  ['chat', '对话', 'Chat'], ['research', '研究', 'Research'], ['notes', '笔记', 'Notes'], ['spreadsheet', '表格', 'Spreadsheet']
] as const
export const sessionWorkspaceAppViews = [
  ['browser', '浏览器', 'Browser'], ['image-factory', '图像', 'Images'], ['knowledge', '知识库', 'Knowledge']
] as const
const workspaceViews = [...nativeViews, ...sessionWorkspaceAppViews] as const
export const sessionWorkspaceViewEvent = 'sherlock:session-workspace-view'
export type SessionWorkspaceAppView = typeof sessionWorkspaceAppViews[number][0]

const sessionHeader = '.pI_x6G_centerCol .wSkVaW_root [data-srb-session-header][data-ework-notes-session]'

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

const viewForApp = { research: 'research', note: 'notes', spreadsheet: 'spreadsheet',
  browser: 'browser', 'image-factory': 'image-factory', knowledge: 'knowledge' } as const
type WorkspaceView = typeof workspaceViews[number]
type WorkspaceViewPreferences = {
  get(): NavigationShortcuts['top']
  save(slots: NavigationShortcuts['top']): boolean
}
export const workspaceViewsChanged = 'sherlock:workspace-view-shortcuts-changed'
const preferences = new WeakMap<Document, WorkspaceViewPreferences>()
const visibleViews = new WeakMap<NavigationShortcuts['top'], readonly WorkspaceView[]>()

export function setWorkspaceViewPreferences(document: Document, value: WorkspaceViewPreferences | undefined) {
  if (value) preferences.set(document, value)
  else preferences.delete(document)
  document.dispatchEvent(new document.defaultView!.Event(workspaceViewsChanged))
}

export function sessionWorkspaceViews(document: Document) {
  const slots = preferences.get(document)?.get() ?? defaultNavigationShortcuts.top
  let views = visibleViews.get(slots)
  if (!views) {
    views = [nativeViews[0], ...slots.filter(isTopNavigationApp).map(app => workspaceViews.find(([view]) => view === viewForApp[app])!)]
    visibleViews.set(slots, views)
  }
  return views
}

export function observeWorkspaceViews(document: Document, update: () => void) {
  document.addEventListener(workspaceViewsChanged, update)
  return () => document.removeEventListener(workspaceViewsChanged, update)
}

export function setWorkspaceViewsExpanded(toggle: HTMLButtonElement, nav: HTMLElement, expanded: boolean, english = false) {
  const label = english ? (expanded ? 'Collapse workspace tabs' : 'Expand workspace tabs')
    : (expanded ? '收起工作区页签' : '展开工作区页签')
  toggle.title = label
  toggle.setAttribute('aria-label', label)
  toggle.setAttribute('aria-expanded', String(expanded))
  nav.setAttribute('aria-hidden', String(!expanded))
  nav.inert = !expanded
}

export function mountSessionWorkspaceViewShortcuts(document: Document, reveal: () => void) {
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
  let owner: HTMLElement | undefined, expanded = false, frame = 0
  const english = () => document.documentElement.dataset.odysseyLocale === 'en'
  const buttons = workspaceViews.map(([view, zh, en]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.workspaceNativeView = view
    button.addEventListener('click', () => {
      const id = owner?.dataset.eworkNotesSession
      if (!id || activeHeader() !== owner) return
      const selected = button.getAttribute('aria-current') === 'true'
      expand(false)
      if (!selected) navigateWorkspaceView(document, id, view, reveal)
    })
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
  const edit = makeWorkspaceCustomizationButton(document)
  const expand = (next: boolean) => {
    expanded = next
    setWorkspaceViewsExpanded(toggle, nav, next, english())
  }
  toggle.addEventListener('click', () => expand(!expanded))
  controls.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !expanded) return
    event.preventDefault()
    event.stopPropagation()
    expand(false)
    toggle.focus({ preventScroll: true })
  })
  let updated = ''
  const sync = () => {
    frame = 0
    const header = activeHeader()
    if (header !== owner) {
      controls.remove()
      owner = header
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
    const views = sessionWorkspaceViews(document)
    const signature = [id, selected, language, ...availability, ...views.map(([view]) => view)].join(',')
    if (updated === signature) return
    updated = signature
    expand(expanded)
    if (!edit.parentElement) nav.append(edit)
    for (const child of [...nav.children]) if (child !== edit) child.remove()
    edit.before(...views.map(([view]) => buttons.find(row => row.view === view)!.button))
    labelWorkspaceCustomization(edit, english())
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
  const unobserve = observeWorkspaceViews(document, schedule)
  sync()
  return () => {
    observer.disconnect()
    win.cancelAnimationFrame(frame)
    document.removeEventListener('sherlock:workspace-surface-change', schedule)
    unobserve()
    controls.remove()
  }
}


function labelWorkspaceCustomization(button: HTMLButtonElement, english: boolean) {
  const label = english ? 'Customize top bar' : '自定义顶栏'
  button.title = label
  button.setAttribute('aria-label', label)
}

function makeWorkspaceCustomizationButton(document: Document) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'eb-workspace-edit'
  button.dataset.workspaceViewCustomize = ''
  const icon = document.createElement('i')
  icon.setAttribute('aria-hidden', 'true')
  button.append(icon)
  return button
}

export function mountWorkspaceViewCustomization(document: Document) {
  const win = document.defaultView!
  const rootSelector = '.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page="home"]:not([hidden], [aria-hidden=true], [data-odyssey-subagent-panel] *)'
  const home = makeWorkspaceCustomizationButton(document)
  home.dataset.workspaceCustomizeHome = ''
  let dialog: HTMLDialogElement | undefined, editing: WorkspaceViewPreferences | undefined, frame = 0
  const english = () => document.documentElement.dataset.odysseyLocale === 'en'
  const update = () => {
    frame = 0
    const root = !document.body.dataset.workspaceSurface ? document.querySelector(rootSelector) : null
    if (!root) { home.remove(); return }
    if (home.parentElement !== root) root.append(home)
    labelWorkspaceCustomization(home, english())
  }
  const schedule = () => { if (!frame) frame = win.requestAnimationFrame(update) }
  const observer = new win.MutationObserver(schedule)
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-workspace-surface', 'data-odyssey-page', 'data-odyssey-locale'] })
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as Element)?.closest<HTMLButtonElement>('[data-workspace-view-customize]')
    const settings = preferences.get(document)
    if (!anchor || !settings || dialog) return
    const en = english()
    const panel = document.createElement('dialog')
    dialog = panel
    editing = settings
    panel.className = 'workspace-view-settings'
    panel.setAttribute('aria-label', en ? 'Customize top bar' : '自定义顶栏')
    const form = document.createElement('form')
    const heading = document.createElement('h2')
    heading.textContent = en ? 'Customize top bar' : '自定义顶栏'
    const fixed = document.createElement('p')
    fixed.textContent = en ? '1. Chat (fixed)' : '1. 对话（固定）'
    form.append(heading, fixed)
    const draft = settings.get().map(app => isTopNavigationApp(app) ? app : null)
    const selects: HTMLSelectElement[] = []
    draft.forEach((app, index) => {
      const row = document.createElement('label')
      const order = document.createElement('span')
      order.textContent = en ? `Position ${index + 2}` : `第 ${index + 2} 项`
      const field = document.createElement('select')
      field.add(new win.Option(en ? 'Empty' : '留空', ''))
      for (const candidate of topNavigationApps) {
        const view = workspaceViews.find(([id]) => id === viewForApp[candidate])!
        field.add(new win.Option(view[en ? 2 : 1], candidate))
      }
      field.value = app ?? ''
      field.addEventListener('change', () => {
        const next = isTopNavigationApp(field.value) ? field.value : null
        const occupied = next ? draft.indexOf(next) : -1
        if (occupied >= 0 && occupied !== index) draft[occupied] = draft[index]!
        draft[index] = next
        selects.forEach((select, position) => { select.value = draft[position] ?? '' })
      })
      selects.push(field)
      row.append(order, field)
      form.append(row)
    })
    const status = document.createElement('p')
    status.setAttribute('role', 'status')
    const footer = document.createElement('footer')
    const cancel = document.createElement('button')
    const save = document.createElement('button')
    cancel.type = 'button'
    cancel.textContent = en ? 'Cancel' : '取消'
    save.type = 'submit'
    save.textContent = en ? 'Save' : '保存'
    footer.append(cancel, save)
    form.append(status, footer)
    panel.append(form)
    cancel.addEventListener('click', () => panel.close())
    panel.addEventListener('click', event => {
      if (event.target !== panel) return
      const { left, right, top, bottom } = panel.getBoundingClientRect()
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) panel.close()
    })
    panel.addEventListener('close', () => {
      panel.remove()
      if (dialog === panel) { dialog = undefined; editing = undefined }
      if (anchor.isConnected) anchor.focus({ preventScroll: true })
    }, { once: true })
    form.addEventListener('submit', event => {
      event.preventDefault()
      if (preferences.get(document) === settings && settings.save(draft)) panel.close()
      else status.textContent = en ? 'Could not save top bar' : '顶栏设置保存失败'
    })
    const bounds = anchor.getBoundingClientRect()
    panel.style.setProperty('--workspace-settings-left', Math.max(16, Math.min(bounds.left, win.innerWidth - 376)) + 'px')
    panel.style.setProperty('--workspace-settings-top', Math.max(16, Math.min(bounds.bottom + 8, win.innerHeight - 350)) + 'px')
    document.body.append(panel)
    panel.showModal()
    void prepareBrowserOverlay(document, panel)
  }
  document.addEventListener('click', onClick)
  const unobserve = observeWorkspaceViews(document, () => {
    if (editing && preferences.get(document) !== editing) dialog?.close()
  })
  update()
  return () => {
    observer.disconnect()
    win.cancelAnimationFrame(frame)
    document.removeEventListener('click', onClick)
    unobserve()
    dialog?.close()
    home.remove()
  }
}
