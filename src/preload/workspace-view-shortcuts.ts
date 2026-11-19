import {
  defaultNavigationShortcuts, isTopNavigationApp, topNavigationApps, topShortcutCount,
  type NavigationShortcuts, type TopNavigationApp
} from '../shared/navigation-shortcuts'
import { navigationAppIcon } from './home-app-shortcuts'
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

// Transfer the open switcher only to the requested view in the same session.
const expandingView = new WeakMap<Document, { sessionId: string; view: string }>()

export function keepWorkspaceViewsExpanded(document: Document, sessionId: string, view: string) {
  expandingView.set(document, { sessionId, view })
}

export function clearWorkspaceViewsExpansion(document: Document) {
  expandingView.delete(document)
}

export function takeWorkspaceViewsExpansion(document: Document, sessionId: string | undefined, view: string | undefined) {
  const next = expandingView.get(document)
  if (!next || next.sessionId !== sessionId || next.view !== view) return false
  clearWorkspaceViewsExpansion(document)
  return true
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
  keepWorkspaceViewsExpanded(document, sessionId, view)
  current.click()
  return true
}

const viewForApp = { research: 'research', note: 'notes', spreadsheet: 'spreadsheet',
  browser: 'browser', 'image-factory': 'image-factory', knowledge: 'knowledge' } as const
type WorkspaceView = typeof workspaceViews[number]
type WorkspaceViewPreferences = {
  get(): NavigationShortcuts['top']
  replace(index: number, app: TopNavigationApp | null): boolean
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
  let owner: HTMLElement | undefined, ownerId: string | undefined, expanded = false, frame = 0
  const english = () => document.documentElement.dataset.odysseyLocale === 'en'
  const buttons = workspaceViews.map(([view, zh, en]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.workspaceNativeView = view
    button.addEventListener('click', () => {
      const id = owner?.dataset.eworkNotesSession
      if (!id || activeHeader() !== owner) return
      if (button.getAttribute('aria-current') !== 'true') navigateWorkspaceView(document, id, view, reveal)
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
    const id = header?.dataset.eworkNotesSession
    const selected = header?.querySelector<HTMLElement>('[data-conversation-view-id][aria-selected=true]')?.dataset.conversationViewId
    const arrivingExpanded = takeWorkspaceViewsExpansion(document, id, selected)
    if (header !== owner || id !== ownerId) {
      controls.remove()
      owner = header
      ownerId = id
      expand(arrivingExpanded)
      updated = ''
    } else if (arrivingExpanded) expand(true)
    if (!header) return
    if (!header.contains(controls)) header.append(controls)
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
  let closeEditor: (() => void) | undefined
  const onClick = (event: MouseEvent) => {
    const anchor = (event.target as Element)?.closest<HTMLButtonElement>('[data-workspace-view-customize]')
    const nav = anchor?.closest<HTMLElement>('.eb-workspace-tabs')
    const settings = preferences.get(document)
    if (!anchor || !nav || nav.inert || !settings || closeEditor) return

    const en = document.documentElement.dataset.odysseyLocale === 'en'
    const panel = document.createElement('dialog')
    panel.className = 'workspace-view-settings'
    panel.setAttribute('aria-label', en ? 'Customize top bar' : '自定义顶栏')
    const strip = document.createElement('div')
    strip.className = 'workspace-view-slots'
    const fixed = document.createElement('span')
    fixed.className = 'workspace-view-fixed'
    fixed.textContent = en ? 'Chat' : '对话'
    fixed.title = en ? 'Chat is fixed' : '对话固定在第一位'
    const palette = document.createElement('div')
    palette.className = 'workspace-view-palette'
    palette.setAttribute('role', 'group')
    palette.setAttribute('aria-label', en ? 'Drag apps to the top bar' : '拖动应用到上方顶栏')
    const closeButton = makeWorkspaceCustomizationButton(document)
    closeButton.removeAttribute('data-workspace-view-customize')
    closeButton.title = en ? 'Finish customizing' : '完成编辑'
    closeButton.setAttribute('aria-label', closeButton.title)
    closeButton.setAttribute('aria-pressed', 'true')
    closeButton.addEventListener('click', () => panel.close())

    const status = document.createElement('p')
    status.setAttribute('role', 'status')
    status.className = 'workspace-view-settings-status'
    const appName = (app: TopNavigationApp) => workspaceViews.find(([view]) => view === viewForApp[app])![en ? 2 : 1]
    let picked: TopNavigationApp | undefined
    let press: { id: number; app: TopNavigationApp; x: number; y: number } | undefined
    let suppressClick = false
    const ghost = document.createElement('i')
    ghost.className = 'workspace-view-drag-ghost'
    ghost.setAttribute('aria-hidden', 'true')
    let target: HTMLElement | undefined
    const highlight = (slot?: HTMLElement) => {
      target?.removeAttribute('data-drop-target')
      target = slot
      target?.setAttribute('data-drop-target', '')
    }
    const pick = (app?: TopNavigationApp) => {
      picked = app
      panel.toggleAttribute('data-picking', !!app)
      for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-workspace-editor-app]')) {
        button.setAttribute('aria-pressed', String(button.dataset.workspaceEditorApp === app))
      }
    }
    const addAppIcon = (button: HTMLButtonElement, app: TopNavigationApp) => {
      const icon = document.createElement('i')
      icon.style.setProperty('--workspace-editor-icon', navigationAppIcon(app))
      icon.setAttribute('aria-hidden', 'true')
      button.append(icon)
    }
    const choices = topNavigationApps.map(app => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.workspaceEditorApp = app
      const label = document.createElement('span')
      label.textContent = appName(app)
      button.append(label)
      button.addEventListener('click', () => pick(picked === app ? undefined : app))
      return button
    })
    palette.append(...choices)

    const slotButtons: HTMLButtonElement[] = []
    const renderSlots = () => {
      const values = settings.get()
      const slots = Array.from({ length: topShortcutCount }, (_, index) => {
        const app = values[index]
        const slot = document.createElement('div')
        slot.className = 'workspace-view-slot'
        slot.dataset.workspaceEditorSlot = String(index)
        const button = document.createElement('button')
        button.type = 'button'
        const position = en ? `Position ${index + 2}` : `第 ${index + 2} 项`
        button.title = isTopNavigationApp(app) ? appName(app) : (en ? 'Empty slot' : '空槽位')
        button.setAttribute('aria-label', `${position} · ${button.title}`)
        slotButtons[index] = button
        if (isTopNavigationApp(app)) {
          button.dataset.workspaceEditorApp = app
          addAppIcon(button, app)
          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'workspace-view-remove'
          remove.title = (en ? 'Remove ' : '移除') + appName(app)
          remove.setAttribute('aria-label', remove.title)
          remove.textContent = '×'
          remove.addEventListener('click', () => apply(index, null, true))
          slot.append(button, remove)
        } else {
          slot.setAttribute('data-empty', '')
          slot.append(button)
        }
        button.addEventListener('click', () => {
          if (picked) apply(index, picked, true)
          else if (isTopNavigationApp(app)) pick(app)
          else choices[0]?.focus()
        })
        return slot
      })
      strip.replaceChildren(fixed, ...slots, closeButton)
      pick()
    }
    const apply = (index: number, app: TopNavigationApp | null, restoreFocus = false) => {
      if (preferences.get(document) !== settings) { panel.close(); return }
      if (!settings.replace(index, app)) {
        status.textContent = en ? 'Could not save top bar' : '顶栏设置保存失败'
        return
      }
      status.textContent = ''
      renderSlots()
      if (restoreFocus) slotButtons[index]?.focus({ preventScroll: true })
    }
    const slotAt = (event: PointerEvent) => document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-workspace-editor-slot]') ?? undefined
    const stopDrag = () => {
      press = undefined
      highlight()
      ghost.remove()
    }
    panel.addEventListener('pointerdown', event => {
      suppressClick = false
      const button = (event.target as Element).closest<HTMLElement>('[data-workspace-editor-app]')
      const app = button?.dataset.workspaceEditorApp
      if (event.button !== 0 || !event.isPrimary || !isTopNavigationApp(app)) return
      press = { id: event.pointerId, app, x: event.clientX, y: event.clientY }
    })
    panel.addEventListener('pointermove', event => {
      if (!press || press.id !== event.pointerId) return
      if (!ghost.isConnected) {
        if (Math.hypot(press.x - event.clientX, press.y - event.clientY) < 5) return
        panel.setPointerCapture(event.pointerId)
        pick()
        ghost.style.setProperty('--workspace-editor-icon', navigationAppIcon(press.app))
        panel.append(ghost)
        suppressClick = true
      }
      ghost.style.transform = `translate(${event.clientX - 15}px, ${event.clientY - 15}px)`
      const slot = slotAt(event)
      if (target !== slot) highlight(slot)
    })
    panel.addEventListener('pointerup', event => {
      if (!press || press.id !== event.pointerId) return
      const slot = ghost.isConnected ? slotAt(event) : undefined
      const { app } = press
      stopDrag()
      if (slot) apply(Number(slot.dataset.workspaceEditorSlot), app)
    })
    panel.addEventListener('pointercancel', stopDrag)
    panel.addEventListener('lostpointercapture', stopDrag)
    panel.addEventListener('click', event => {
      if (!suppressClick || event.detail === 0) return
      suppressClick = false
      event.stopImmediatePropagation()
      event.preventDefault()
    }, true)
    const position = () => {
      const bounds = nav.getBoundingClientRect()
      if (!nav.isConnected || bounds.height === 0) { panel.close(); return }
      const left = Math.max(8, Math.min(bounds.left, win.innerWidth - panel.offsetWidth - 8))
      panel.style.left = left + 'px'
      panel.style.top = bounds.top + 'px'
    }
    const close = () => panel.close()
    closeEditor = close
    panel.addEventListener('click', event => {
      if (event.target !== panel) return
      const { left, right, top, bottom } = panel.getBoundingClientRect()
      if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) close()
    })
    const unobserve = observeWorkspaceViews(document, () => {
      if (preferences.get(document) !== settings) close()
    })
    panel.addEventListener('close', () => {
      unobserve()
      win.removeEventListener('resize', position)
      document.removeEventListener('sherlock:workspace-surface-change', close)
      panel.remove()
      if (closeEditor === close) closeEditor = undefined
      if (anchor.isConnected) anchor.focus({ preventScroll: true })
    }, { once: true })
    win.addEventListener('resize', position)
    document.addEventListener('sherlock:workspace-surface-change', close)
    panel.append(strip, palette, status)
    renderSlots()
    document.body.append(panel)
    panel.showModal()
    position()
    void prepareBrowserOverlay(document, panel)
  }
  document.addEventListener('click', onClick)
  return () => {
    document.removeEventListener('click', onClick)
    closeEditor?.()
  }
}
