import {
  defaultNavigationShortcuts, isTopNavigationApp, replaceNavigationShortcut, topNavigationApps, topShortcutCount,
  type NavigationShortcuts, type TopNavigationApp
} from '../shared/navigation-shortcuts'
import { prepareBrowserOverlay } from './browser/overlay-preflight'

const nativeViews = [
  ['chat', '对话', 'Chat'], ['research', '研究', 'Research'], ['notes', '笔记', 'Notes'], ['spreadsheet', '表格', 'Spreadsheet'], ['presentation', '演示', 'Presentation']
] as const
export const sessionWorkspaceAppViews = [
  ['browser', '浏览器', 'Browser'], ['image-factory', '图像', 'Images'], ['knowledge', '知识库', 'Knowledge']
] as const
const workspaceViews = [...nativeViews, ...sessionWorkspaceAppViews] as const
export const sessionWorkspaceViewEvent = 'sherlock:session-workspace-view'
export const workspaceModeNavigationAttribute = 'data-workspace-mode-navigation'
export type SessionWorkspaceAppView = typeof sessionWorkspaceAppViews[number][0]

const sessionHeading = '[data-srb-session-header][data-ework-notes-session]:not([data-odyssey-subagent-panel] *)'
const sessionHeader = '.pI_x6G_centerCol .wSkVaW_root ' + sessionHeading
const homeRoot = '.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page=home]:not([hidden], [aria-hidden=true], [data-odyssey-subagent-panel] *)'
const boardOnlyRoot = '[data-home-guide-board-only="true"]'

export function findWorkspaceSession(document: Document, sessionId?: string) {
  if (!sessionId && !document.body.dataset.workspaceSurface) {
    const home = document.querySelector(homeRoot)
    if (home) return home.querySelector<HTMLElement>(sessionHeading) ?? undefined
  }
  return [...document.querySelectorAll<HTMLElement>(sessionHeader)].find(header =>
    !sessionId || header.dataset.eworkNotesSession === sessionId)
}

export function workspaceViewButton(document: Document, sessionId: string, view: string) {
  if (!nativeViews.some(([id]) => id === view)) return undefined
  return findWorkspaceSession(document, sessionId)
    ?.querySelector<HTMLButtonElement>(`[data-srb-tabs] button[data-conversation-view-id="${view}"]`)
}

// Keep the incoming switcher open without replaying the manual animation.
const expandingView = new WeakMap<Document, { sessionId: string | null; view: string; arrived: boolean }>()
const globalWorkspaceNavigation = new WeakMap<Document, (view: string) => void>()

export function keepWorkspaceViewsExpanded(document: Document, sessionId: string | null, view: string) {
  const transition = { sessionId, view, arrived: false }
  expandingView.set(document, transition)
  document.documentElement.setAttribute('data-workspace-tabs-switching', '')
  document.defaultView?.setTimeout(() => {
    if (expandingView.get(document) === transition && !transition.arrived) clearWorkspaceViewsExpansion(document)
  }, sessionId === null ? 10000 : 2000)
}

export function clearWorkspaceViewsExpansion(document: Document) {
  expandingView.delete(document)
  document.documentElement.removeAttribute('data-workspace-tabs-switching')
}

export function takeWorkspaceViewsExpansion(document: Document, sessionId: string | undefined, view: string | undefined) {
  const transition = expandingView.get(document)
  if (!transition || transition.arrived ||
    (transition.sessionId !== null && transition.sessionId !== sessionId) || transition.view !== view) return false
  transition.arrived = true
  const win = document.defaultView!
  win.requestAnimationFrame(() => win.requestAnimationFrame(() => {
    if (expandingView.get(document) === transition) clearWorkspaceViewsExpansion(document)
  }))
  return true
}

export function canNavigateGlobalWorkspace(document: Document) {
  return globalWorkspaceNavigation.has(document)
}

export function navigateGlobalWorkspace(document: Document, view: string, reveal: () => void) {
  if (view === 'chat') {
    document.documentElement.setAttribute(workspaceModeNavigationAttribute, '')
    keepWorkspaceViewsExpanded(document, null, view)
    reveal()
  } else globalWorkspaceNavigation.get(document)?.(view)
}

export function navigateWorkspaceView(document: Document, sessionId: string, view: string, reveal: () => void) {
  const header = findWorkspaceSession(document, sessionId)
  if (!header?.querySelector('[data-srb-tabs]')) return false
  if (sessionWorkspaceAppViews.some(([id]) => id === view)) {
    const accepted = !document.dispatchEvent(new CustomEvent(sessionWorkspaceViewEvent, { detail: { sessionId, view }, cancelable: true }))
    if (accepted) document.documentElement.setAttribute(workspaceModeNavigationAttribute, '')
    return accepted
  }
  const tab = workspaceViewButton(document, sessionId, view)
  if (!tab?.isConnected || tab.disabled) return false
  document.body.dataset.sessionWorkspaceSwitch = sessionId
  keepWorkspaceViewsExpanded(document, sessionId, view)
  reveal()
  const current = workspaceViewButton(document, sessionId, view)
  if (!current?.isConnected || current.disabled) {
    clearWorkspaceViewsExpansion(document)
    return false
  }
  document.documentElement.setAttribute(workspaceModeNavigationAttribute, '')
  current.click()
  return true
}

const viewForApp = { research: 'research', note: 'notes', spreadsheet: 'spreadsheet', presentation: 'presentation',
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

export function mountSessionWorkspaceViewShortcuts(document: Document, reveal: () => void,
  openHome?: (app: TopNavigationApp, signal: AbortSignal) => Promise<void> | void) {
  const win = document.defaultView!
  const homeTopbar = document.createElement('div')
  homeTopbar.className = 'workspace-app-topbar workspace-home-topbar'
  const homeTitle = document.createElement('div')
  homeTitle.className = 'workspace-app-title workspace-app-heading'
  const homeIcon = document.createElement('i')
  homeIcon.setAttribute('aria-hidden', 'true')
  const homeLabel = document.createElement('span')
  homeTitle.append(homeIcon, homeLabel)
  const homeDragArea = document.createElement('div')
  homeDragArea.dataset.odysseyWindowMove = ''
  homeDragArea.setAttribute('aria-hidden', 'true')
  homeTopbar.append(homeTitle, homeDragArea)
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
  let ownerOnHome = false, openingHome: AbortController | undefined
  if (openHome) globalWorkspaceNavigation.set(document, view => {
    const app = topNavigationApps.find(candidate => viewForApp[candidate] === view)
    if (!app) return
    openingHome?.abort()
    const request = new win.AbortController()
    openingHome = request
    document.documentElement.setAttribute(workspaceModeNavigationAttribute, '')
    keepWorkspaceViewsExpanded(document, null, view)
    void Promise.resolve().then(() => openHome(app, request.signal)).catch(() => {
      if (openingHome === request) clearWorkspaceViewsExpansion(document)
    })
  })
  const english = () => document.documentElement.dataset.odysseyLocale === 'en'
  const buttons = workspaceViews.map(([view, zh, en]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.workspaceNativeView = view
    button.addEventListener('click', () => {
      if (!owner || activeHeader() !== owner || button.getAttribute('aria-current') === 'true') return
      const session = ownerOnHome ? owner.querySelector<HTMLElement>(sessionHeading) : owner
      const id = session?.dataset.eworkNotesSession
      if (id) navigateWorkspaceView(document, id, view, reveal)
      else if (ownerOnHome) navigateGlobalWorkspace(document, view, reveal)
    })
    return { view, zh, en, button }
  })
  function activeHeader() {
    const surface = document.body.dataset.workspaceSurface
    if (surface && surface !== 'notes') return undefined
    if (!surface && openHome) {
      const home = document.querySelector<HTMLElement>(homeRoot)
      if (home && !home.matches(boardOnlyRoot)) return home
    }
    const header = findWorkspaceSession(document)
    if (!header || header.closest(boardOnlyRoot) || header.dataset.odysseyHomeHeader === 'true' ||
        header.getAttribute('aria-hidden') === 'true' ||
        header.closest('.wSkVaW_root')?.getAttribute('data-odyssey-page') === 'home') return undefined
    return header
  }
  const edit = makeWorkspaceCustomizationButton(document)
  const labels = document.createElement('div')
  labels.className = 'eb-workspace-tab-list'
  nav.append(labels, edit)
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
    const onHome = !!header?.matches(homeRoot)
    const transition = expandingView.get(document)
    const session = onHome ? header?.querySelector<HTMLElement>(sessionHeading) : header
    const id = session?.dataset.eworkNotesSession ??
      (onHome && transition?.view === 'chat' ? transition.sessionId ?? undefined : undefined)
    const selected = onHome ? 'chat' : header?.querySelector<HTMLElement>('[data-conversation-view-id][aria-selected=true]')?.dataset.conversationViewId
    const nextOwnerId = id
    const arrivingExpanded = takeWorkspaceViewsExpansion(document, id, selected)
    const enteringNativeView = !!transition && (transition.sessionId === null || transition.sessionId === id) &&
      nativeViews.some(([view]) => view === transition.view)
    if (header !== owner || nextOwnerId !== ownerId || onHome !== ownerOnHome) {
      const sameViewOwner = !!header && !!owner && nextOwnerId === ownerId &&
        (nextOwnerId !== undefined || onHome === ownerOnHome)
      controls.remove()
      homeTopbar.remove()
      owner = header
      ownerId = nextOwnerId
      ownerOnHome = onHome
      expand(arrivingExpanded || enteringNativeView || (sameViewOwner && expanded))
      updated = ''
    } else if (arrivingExpanded) expand(true)
    if (!header) return
    if (onHome && homeTopbar.parentElement !== header) header.append(homeTopbar)
    const container = onHome ? homeTopbar : header
    if (controls.parentElement !== container) container.insertBefore(controls, onHome ? homeDragArea : null)
    const language = english() ? 'en' : 'zh'
    const native = session?.querySelector('[data-srb-tabs]')
    const availability = buttons.map(({ view }) => Boolean(onHome && !id || (native && (
      sessionWorkspaceAppViews.some(([appView]) => appView === view) || !!native.querySelector(`button[data-conversation-view-id="${view}"]:not(:disabled)`)))))
    const views = sessionWorkspaceViews(document)
    const signature = [id, selected, language, ...availability, ...views.map(([view]) => view)].join(',')
    if (updated === signature) return
    updated = signature
    if (onHome) homeLabel.textContent = language === 'en' ? 'New chat' : '新对话'
    expand(expanded)
    labels.replaceChildren(...views.map(([view]) => buttons.find(row => row.view === view)!.button))
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
    'data-ework-notes-session', 'data-odyssey-home-header', 'data-odyssey-page', 'data-home-guide-board-only',
    'aria-selected', 'disabled', 'aria-hidden'
  ] })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-odyssey-locale'] })
  document.addEventListener('sherlock:workspace-surface-change', schedule)
  const unobserve = observeWorkspaceViews(document, schedule)
  sync()
  return () => {
    observer.disconnect()
    win.cancelAnimationFrame(frame)
    openingHome?.abort()
    if (openHome) globalWorkspaceNavigation.delete(document)
    document.removeEventListener('sherlock:workspace-surface-change', schedule)
    unobserve()
    controls.remove()
    homeTopbar.remove()
  }
}


function labelWorkspaceCustomization(button: HTMLButtonElement, english: boolean) {
  const editing = button.getAttribute('aria-pressed') === 'true'
  const label = english ? (editing ? 'Finish customizing' : 'Customize top bar') : (editing ? '完成编辑' : '自定义顶栏')
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
    const header = nav?.closest<HTMLElement>('.workspace-app-topbar,[data-srb-session-header]')
    const labels = nav?.querySelector('.eb-workspace-tab-list')
    const settings = preferences.get(document)
    if (!anchor || !nav || !header || !labels || nav.inert || !settings) return
    if (closeEditor) { closeEditor(); return }

    const en = document.documentElement.dataset.odysseyLocale === 'en'
    const panel = document.createElement('dialog')
    panel.className = 'workspace-view-settings'
    panel.setAttribute('aria-label', en ? 'Customize top bar' : '自定义顶栏')
    const strip = document.createElement('div')
    strip.className = 'workspace-view-slots'
    strip.setAttribute('role', 'group')
    strip.setAttribute('aria-label', en ? 'Top bar slots' : '顶栏插槽')
    const fixed = document.createElement('span')
    fixed.className = 'workspace-view-fixed'
    fixed.textContent = en ? 'Chat' : '对话'
    fixed.title = en ? 'Chat is fixed' : '对话固定在第一位'
    const palette = document.createElement('div')
    palette.className = 'workspace-view-palette'
    palette.setAttribute('role', 'group')
    palette.setAttribute('aria-label', en ? 'Drag apps to the top bar' : '拖动应用到上方顶栏')
    const status = document.createElement('p')
    status.setAttribute('role', 'status')
    status.className = 'workspace-view-settings-status'
    const appName = (app: TopNavigationApp) => workspaceViews.find(([view]) => view === viewForApp[app])![en ? 2 : 1]
    let picked: TopNavigationApp | undefined
    let press: { id: number; app: TopNavigationApp; button: HTMLElement; x: number; y: number; offsetX: number; offsetY: number } | undefined
    let suppressClick = false
    const ghost = document.createElement('span')
    ghost.className = 'workspace-view-drag-ghost'
    ghost.setAttribute('aria-hidden', 'true')
    let target: HTMLElement | undefined
    const highlight = (slot?: HTMLElement) => {
      target?.removeAttribute('data-drop-target')
      target = slot
      target?.setAttribute('data-drop-target', '')
    }
    const previewMove = (slot: HTMLElement | undefined, app: TopNavigationApp) => {
      const current = settings.get()
      const targetIndex = slot ? Number(slot.dataset.workspaceEditorSlot) : undefined
      const next = targetIndex === undefined ? current.filter(isTopNavigationApp) : replaceNavigationShortcut(
        { ...defaultNavigationShortcuts, top: current }, 'top', targetIndex, app
      ).top
      for (const [index, slotButton] of slotButtons.entries()) {
        const item = slotButton.dataset.workspaceEditorApp
        if (!isTopNavigationApp(item)) continue
        const wrapper = slotButton.parentElement!
        const position = next.indexOf(item)
        const to = slotButtons[position]?.parentElement?.offsetLeft
        wrapper.toggleAttribute('data-slot-source', item === app)
        wrapper.toggleAttribute('data-slot-evicted', position < 0)
        wrapper.style.setProperty('--workspace-slot-shift', (to === undefined ? 16 : to - wrapper.offsetLeft) + 'px')
      }
    }
    const pick = (app?: TopNavigationApp) => {
      picked = app
      nav.toggleAttribute('data-picking', !!app)
      for (const button of [...slotButtons, ...choices]) {
        button.setAttribute('aria-pressed', String(button.dataset.workspaceEditorApp === app))
      }
    }
    const choices = topNavigationApps.map(app => {
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.workspaceEditorApp = app
      const label = document.createElement('span')
      label.textContent = appName(app)
      button.title = label.textContent
      button.append(label)
      button.addEventListener('click', () => pick(picked === app ? undefined : app))
      return button
    })
    palette.append(...choices)

    const slotButtons: HTMLButtonElement[] = []
    const renderSlots = () => {
      const values = settings.get().filter(isTopNavigationApp)
      for (const option of choices) {
        const app = option.dataset.workspaceEditorApp
        option.hidden = isTopNavigationApp(app) && values.includes(app)
      }
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
          const label = document.createElement('span')
          label.textContent = button.title
          button.append(label)
          const remove = document.createElement('button')
          remove.type = 'button'
          remove.className = 'workspace-view-remove'
          remove.dataset.navigationDelete = ''
          remove.title = (en ? 'Remove ' : '移除') + appName(app)
          remove.setAttribute('aria-label', remove.title)
          remove.addEventListener('click', () => apply(index, null, true))
          slot.append(button, remove)
        } else {
          slot.setAttribute('data-empty', '')
          slot.append(button)
        }
        button.addEventListener('click', () => {
          if (picked) apply(index, picked, true)
          else if (isTopNavigationApp(app)) pick(app)
          else choices.find(choice => !choice.hidden)?.focus()
        })
        return slot
      })
      strip.replaceChildren(fixed, ...slots)
      pick()
    }
    const apply = (index: number, app: TopNavigationApp | null, restoreFocus = false,
      previous?: Map<TopNavigationApp, DOMRect>) => {
      if (preferences.get(document) !== settings) { close(); return }
      if (!settings.replace(index, app)) {
        status.textContent = en ? 'Could not save top bar' : '顶栏设置保存失败'
        return
      }
      status.textContent = ''
      renderSlots()
      if (restoreFocus) slotButtons[index]?.focus({ preventScroll: true })
      if (!previous || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      for (const button of slotButtons) {
        const item = button.dataset.workspaceEditorApp
        const before = isTopNavigationApp(item) ? previous.get(item) : undefined
        if (!before) continue
        const after = button.getBoundingClientRect()
        const dx = before.left + (before.width - after.width) / 2 - after.left
        const dy = before.top - after.top
        if (Math.hypot(dx, dy) >= 1) button.animate([
          { translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }
        ], { duration: 180, easing: 'ease-out' })
      }
    }
    const slotAt = ({ clientX: x, clientY: y }: PointerEvent) => {
      const slots = slotButtons.map(button => button.parentElement!)
      const bounds = slots.map(slot => slot.getBoundingClientRect())
      const first = bounds[0], last = bounds.at(-1)
      const visible = strip.getBoundingClientRect()
      if (!first || !last || x < Math.max(first.left, visible.left) ||
          x > Math.min(last.right, visible.right) || y < first.top || y > first.bottom) return
      const index = bounds.findIndex((box, i) => x <= (box.right + (bounds[i + 1]?.left ?? box.right)) / 2)
      return slots[index]
    }
    const stopDrag = () => {
      const id = press?.id
      press?.button.removeAttribute('data-workspace-editor-source')
      press = undefined
      if (id !== undefined && panel.hasPointerCapture(id)) panel.releasePointerCapture(id)
      highlight()
      ghost.remove()
      nav.removeAttribute('data-dragging')
      for (const slot of strip.querySelectorAll<HTMLElement>('[data-workspace-editor-slot]')) {
        slot.removeAttribute('data-slot-source')
        slot.removeAttribute('data-slot-evicted')
        slot.style.removeProperty('--workspace-slot-shift')
      }
    }
    const pointerDown = (event: PointerEvent) => {
      suppressClick = false
      const target = event.target as Element
      if (!nav.contains(target) && !panel.contains(target)) { close(false); return }
      const button = target.closest<HTMLElement>('[data-workspace-editor-app]')
      const app = button?.dataset.workspaceEditorApp
      if (!button || event.button !== 0 || !event.isPrimary || !isTopNavigationApp(app)) return
      const bounds = button.getBoundingClientRect()
      press = { id: event.pointerId, app, button, x: event.clientX, y: event.clientY,
        offsetX: event.clientX - bounds.left, offsetY: event.clientY - bounds.top }
    }
    const pointerMove = (event: PointerEvent) => {
      if (!press || press.id !== event.pointerId) return
      if (!ghost.isConnected) {
        if (Math.hypot(press.x - event.clientX, press.y - event.clientY) < 5) return
        panel.setPointerCapture(event.pointerId)
        pick()
        ghost.textContent = appName(press.app)
        ghost.style.width = press.button.offsetWidth + 'px'
        press.button.setAttribute('data-workspace-editor-source', '')
        panel.append(ghost)
        nav.setAttribute('data-dragging', '')
        previewMove(undefined, press.app)
        suppressClick = true
      }
      ghost.style.transform = `translate(${event.clientX - press.offsetX}px, ${event.clientY - press.offsetY}px)`
      const slot = slotAt(event)
      if (target !== slot) {
        highlight(slot)
        previewMove(slot, press.app)
      }
    }
    const pointerUp = (event: PointerEvent) => {
      if (!press || press.id !== event.pointerId) return
      const slot = ghost.isConnected ? slotAt(event) : undefined
      const { app } = press
      if (!slot) { stopDrag(); return }
      const previous = new Map<TopNavigationApp, DOMRect>()
      for (const button of slotButtons) {
        const item = button.dataset.workspaceEditorApp
        if (isTopNavigationApp(item)) previous.set(item, button.getBoundingClientRect())
      }
      previous.set(app, ghost.getBoundingClientRect())
      stopDrag()
      apply(Number(slot.dataset.workspaceEditorSlot), app, false, previous)
    }
    const ignoreDragClick = (event: MouseEvent) => {
      if (!suppressClick || event.detail === 0) return
      suppressClick = false
      event.stopImmediatePropagation()
      event.preventDefault()
    }
    const position = () => {
      if (!anchor.isConnected || !header.contains(nav) || nav.inert) { close(false); return }
      const bounds = strip.getBoundingClientRect()
      const bar = header.getBoundingClientRect()
      if (bounds.height === 0 || bar.width === 0) { close(false); return }
      const leftEdge = Math.max(8, bar.left + 8)
      const rightEdge = Math.min(win.innerWidth - 8, bar.right - 8)
      panel.style.maxWidth = Math.max(0, rightEdge - leftEdge) + 'px'
      panel.style.left = Math.max(leftEdge, Math.min(bounds.left, rightEdge - panel.offsetWidth)) + 'px'
      panel.style.top = bar.bottom + 4 + 'px'
    }
    const keyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
    }
    const resize = new win.ResizeObserver(position)
    const unobserve = observeWorkspaceViews(document, () => {
      if (preferences.get(document) !== settings) close()
    })
    const close = (restoreFocus = true) => {
      stopDrag()
      unobserve()
      resize.disconnect()
      listeners.abort()
      panel.remove()
      strip.remove()
      nav.removeAttribute('data-customizing')
      nav.removeAttribute('data-picking')
      anchor.removeAttribute('aria-pressed')
      labelWorkspaceCustomization(anchor, en)
      closeEditor = undefined
      if (restoreFocus && anchor.isConnected && !nav.inert) anchor.focus({ preventScroll: true })
    }
    closeEditor = close
    const listeners = new win.AbortController()
    const signal = listeners.signal
    win.addEventListener('resize', position, { signal })
    document.addEventListener('sherlock:workspace-surface-change', () => close(false), { signal })
    document.addEventListener('keydown', keyDown, { capture: true, signal })
    document.addEventListener('pointerdown', pointerDown, { capture: true, signal })
    document.addEventListener('pointermove', pointerMove, { capture: true, signal })
    document.addEventListener('pointerup', pointerUp, { capture: true, signal })
    document.addEventListener('pointercancel', stopDrag, { signal })
    document.addEventListener('click', ignoreDragClick, { capture: true, signal })
    panel.addEventListener('lostpointercapture', stopDrag, { signal })
    panel.append(palette, status)
    renderSlots()
    labels.before(strip)
    nav.setAttribute('data-customizing', '')
    anchor.setAttribute('aria-pressed', 'true')
    labelWorkspaceCustomization(anchor, en)
    document.body.append(panel)
    panel.show()
    position()
    resize.observe(header)
    resize.observe(strip)
    resize.observe(panel)
    slotButtons[0]?.focus({ preventScroll: true })
    void prepareBrowserOverlay(document, panel)
  }
  document.addEventListener('click', onClick)
  return () => {
    document.removeEventListener('click', onClick)
    closeEditor?.()
  }
}
