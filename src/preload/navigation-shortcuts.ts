import {
  isNavigationApp, isNavigationShortcut, sidebarShortcutCount, normalizeNavigationShortcuts, replaceNavigationShortcut,
  type NavigationApp, type NavigationShortcut, type NavigationShortcuts
} from '../shared/navigation-shortcuts'
import { prepareBrowserOverlay } from './browser/overlay-preflight'
import { navigationAppIcon } from './home-app-shortcuts'
import styles from './navigation-shortcuts.css?raw'
import { setWorkspaceViewPreferences, workspaceViewsChanged } from './workspace-view-shortcuts'

const presentation = {
  browser: ['浏览器', 'Browser'],
  knowledge: ['知识库', 'Knowledge Base'],
  'image-factory': ['图像', 'Images'],
  plugin: ['插件', 'Plugins'],
  scheduled: ['定时任务', 'Scheduled tasks'],
  research: ['研究', 'Research'],
  note: ['笔记', 'Notes'],
  spreadsheet: ['表格', 'Spreadsheet'],
  'new-chat': ['对话', 'Chat'],
  'new-workspace': ['新建工作区', 'New workspace']
} as const
const groupSelector = '[data-dsh-sidebar-root] .hHd-Xa_newSessionGroup'
const expandedGroupSelector = '[data-dsh-sidebar-root][data-dsh-sidebar-wide=true] .hHd-Xa_newSessionGroup'
const residentSelector = '.pI_x6G_centerCol .wSkVaW_root[data-odyssey-page]:not([hidden], [hidden] *, [aria-hidden=true], [aria-hidden=true] *, [data-odyssey-subagent-panel] *)'
const traySelector = '[data-home-app-shortcuts]'
const sourceSelector = traySelector + ' button[data-home-app]'
const slotSelector = '[data-navigation-rail] > [data-navigation-slot]'
const tooltipSelector = slotSelector + ':not([data-empty]), [data-dsh-sidebar-root] :is([data-sidebar-home], [data-sidebar-chat-entry])'
const holdTime = 360

type Bridge = {
  read(): unknown
  save(value: NavigationShortcuts): boolean
  open(app: NavigationShortcut, signal: AbortSignal, region: 'side'): Promise<void> | void
}

type PointerHold = {
  id: number; x: number; y: number; app: NavigationShortcut; slot?: HTMLButtonElement
  timer?: number; armed: boolean; moving: boolean
}

export function mountNavigationShortcuts(doc: Document, bridge: Bridge) {
  const win = doc.defaultView!
  let value = normalizeNavigationShortcuts(bridge.read())
  const style = doc.createElement('style')
  style.textContent = styles
  doc.head.append(style)
  doc.documentElement.setAttribute('data-navigation-sidebar-only', '')
  const rail = doc.createElement('div')
  rail.dataset.navigationRail = ''
  const deletes = doc.createElement('div')
  deletes.dataset.navigationDeletes = ''
  const ghost = doc.createElement('div')
  ghost.dataset.navigationGhost = ''
  ghost.setAttribute('aria-hidden', 'true')
  const tooltip = doc.createElement('span')
  tooltip.dataset.navigationTooltip = ''
  tooltip.setAttribute('role', 'tooltip')
  const status = doc.createElement('span')
  status.dataset.navigationStatus = ''
  status.setAttribute('role', 'status')
  doc.body.append(status)

  let shown: NavigationShortcut[] = []
  let editableSlots: number[] = []
  let editing = false
  let picked: NavigationApp | undefined
  let pointer: PointerHold | undefined
  let consumeClick = false
  let hovering: HTMLButtonElement | null = null
  let tooltipAnchor: HTMLElement | undefined
  let tooltipTimer = 0
  let menu: HTMLElement | undefined
  let menuAnchor: HTMLElement | undefined
  let pending: AbortController | undefined
  let frame = 0
  const deleteButtons = new Map<HTMLButtonElement, HTMLButtonElement>()
  const english = () => doc.documentElement.dataset.odysseyLocale === 'en'
  const label = (app: NavigationShortcut) => presentation[app][english() ? 1 : 0]
  const setAttribute = (element: Element, name: string, next: string) => {
    if (element.getAttribute(name) !== next) element.setAttribute(name, next)
  }

  function hideTooltip() {
    win.clearTimeout(tooltipTimer)
    tooltipAnchor = undefined
    tooltip.remove()
  }

  function hoverTooltip(event: PointerEvent | FocusEvent) {
    if (!(event.target instanceof win.Element)) return
    const anchor = event.target.closest<HTMLElement>(tooltipSelector)
    if (!anchor || (event.relatedTarget instanceof win.Node && anchor.contains(event.relatedTarget))) return
    if (event.type === 'pointerout' || event.type === 'focusout') {
      if (anchor === tooltipAnchor) hideTooltip()
      return
    }
    if (event.type === 'focusin' && !anchor.matches(':focus-visible')) return
    hideTooltip()
    tooltipAnchor = anchor
    const show = () => {
      const name = anchor.getAttribute('aria-label')
      if (!name || tooltipAnchor !== anchor || !anchor.isConnected || editing || menu ||
          doc.querySelector('.st-menu[data-sidebar-more]') || !anchor.checkVisibility()) return
      const box = anchor.getBoundingClientRect()
      tooltip.textContent = name
      doc.body.append(tooltip)
      const margin = 12
      tooltip.style.left = Math.max(margin, Math.min(box.right + 10, win.innerWidth - tooltip.offsetWidth - margin)) + 'px'
      const halfHeight = tooltip.offsetHeight / 2
      tooltip.style.top = Math.max(halfHeight + margin, Math.min(box.top + box.height / 2, win.innerHeight - halfHeight - margin)) + 'px'
    }
    if (event.type === 'focusin') show()
    else tooltipTimer = win.setTimeout(show, 500)
  }

  function currentShortcut(): NavigationShortcut | 'home' | undefined {
    const surface = doc.body.dataset.workspaceSurface
    if (surface === 'integrations') return 'plugin'
    if (surface === 'notes') return 'note'
    if (surface === 'shared-session') return 'knowledge'
    if (surface) return isNavigationApp(surface) ? surface : undefined
    const resident = doc.querySelector<HTMLElement>(residentSelector)
    if (!resident) return
    const mode = resident.querySelector<HTMLElement>('[data-srb-tabs] [aria-selected=true]')?.dataset.conversationViewId
    if (mode === 'notes') return 'note'
    if (mode === 'spreadsheet' || resident.dataset.odysseyPage === 'spreadsheet') return 'spreadsheet'
    if (mode === 'research' || resident.dataset.odysseyPage === 'research') return 'research'
    const selectedSession = doc.documentElement.dataset.srbSelectedSession ||
      resident.querySelector<HTMLElement>('[data-srb-session-header]')?.dataset.eworkNotesSession
    return resident.dataset.odysseyPage === 'home' && !selectedSession ? 'home' : 'new-chat'
  }

  function sync() {
    const group = doc.querySelector(groupSelector)
    if (!group) {
      rail.remove()
      shown = []
      editableSlots = []
    } else {
      const active = currentShortcut()
      const collapsed = group.closest('[data-dsh-sidebar-root]')?.getAttribute('data-dsh-sidebar-wide') === 'false'
      const more = group.querySelector('.st-more-zone')
      if (rail.parentElement !== group || (more && rail.nextElementSibling !== more)) group.insertBefore(rail, more)
      for (let index = 0; index < sidebarShortcutCount; index++) {
        const app = value.side[index] ?? null
        const existing = rail.children.item(index) as HTMLButtonElement | null
        const button = existing ?? doc.createElement('button')
        setAttribute(button, 'data-navigation-slot', String(index))
        setAttribute(button, 'data-navigation-app', app ?? '')
        setAttribute(button, 'type', 'button')
        button.toggleAttribute('data-empty', !app)
        const name = app ? label(app) : english() ? 'Empty shortcut slot' : '空快捷位'
        setAttribute(button, 'aria-label', name)
        const mask = app ? navigationAppIcon(app) : ''
        if (button.style.getPropertyValue('--navigation-glyph') !== mask) button.style.setProperty('--navigation-glyph', mask)
        if (app) setAttribute(button, 'aria-pressed', String(app === active))
        else button.removeAttribute('aria-pressed')
        setAttribute(button, 'tabindex', app ? '0' : '-1')
        if (!existing) rail.append(button)
      }

      let capacity = sidebarShortcutCount
      if (!collapsed) {
        const layout = win.getComputedStyle(rail)
        const gap = parseFloat(layout.columnGap) || 0
        const size = parseFloat(layout.getPropertyValue('--navigation-shortcut-size')) || 36
        capacity = Math.min(capacity, Math.floor((rail.clientWidth + gap) / (size + gap)))
      }
      editableSlots = value.side.flatMap((app, index) => !collapsed && app === 'new-chat' ? [] : [index]).slice(0, capacity)
      Array.from(rail.children).forEach((button, index) => button.toggleAttribute('hidden', !editableSlots.includes(index)))
      shown = editableSlots.map(index => value.side[index]).filter(isNavigationShortcut)

      const home = group.querySelector('[data-sidebar-home]')
      const onHome = active === 'home' || (active === 'new-chat' && !value.side.includes('new-chat'))
      if (home) setAttribute(home, 'aria-pressed', String(onHome))
      const chat = group.querySelector('[data-sidebar-chat-entry]')
      if (chat) {
        setAttribute(chat, 'aria-pressed', String(active === 'home' || active === 'new-chat'))
      }
      const overflowActive = Boolean(active && active !== 'home' && !shown.includes(active) &&
        !(active === 'new-chat' && (!collapsed || onHome)))
      more?.querySelector('button.st-more')?.toggleAttribute('data-navigation-overflow-active', overflowActive)
    }
    if (menuAnchor && (!menuAnchor.isConnected || menuAnchor.closest('[aria-hidden=true],[hidden]'))) closeMenu()
    if (tooltipAnchor && (!tooltipAnchor.isConnected || tooltipAnchor.closest('[hidden],[data-empty]') ||
        (tooltip.isConnected && tooltip.textContent !== tooltipAnchor.getAttribute('aria-label')))) hideTooltip()
  }

  function targetAt(element: Element | null) {
    return element?.closest<HTMLButtonElement>(slotSelector) ?? null
  }
  function clearHover() {
    hovering?.removeAttribute('data-drop-target')
    hovering = null
  }
  function canDrop(button: HTMLButtonElement, app: NavigationShortcut) {
    return button.dataset.navigationApp !== app
  }
  function dropTarget(event: PointerEvent, hold: PointerHold) {
    const slot = targetAt(doc.elementFromPoint(event.clientX, event.clientY))
    if (!slot || !canDrop(slot, hold.app)) return null
    if (hold.slot && (slot.hasAttribute('data-empty') || hold.slot.dataset.navigationApp !== hold.app)) return null
    return slot
  }
  function stopPointer() {
    if (pointer?.timer !== undefined) win.clearTimeout(pointer.timer)
    pointer?.slot?.removeAttribute('data-navigation-drag-source')
    pointer = undefined
    ghost.remove()
    clearHover()
  }
  function update(next: NavigationShortcuts) {
    if (next === value) return true
    if (!bridge.save(next)) {
      status.textContent = english() ? 'Could not save shortcuts' : '快捷入口保存失败'
      return false
    }
    const topChanged = next.top !== value.top
    value = next
    status.textContent = ''
    sync()
    if (topChanged) doc.dispatchEvent(new win.Event(workspaceViewsChanged))
    return true
  }
  function apply(button: HTMLButtonElement, app: NavigationShortcut | null) {
    update(replaceNavigationShortcut(value, 'side', Number(button.dataset.navigationSlot), app))
  }
  function setEditing(active: boolean, selection?: NavigationApp) {
    if (active) hideTooltip()
    editing = active
    picked = selection
    doc.body.toggleAttribute('data-navigation-editing', active)
    doc.body.toggleAttribute('data-navigation-picking', Boolean(selection))
    if (active && !frame) frame = win.requestAnimationFrame(positionDeletes)
    if (!active) {
      win.cancelAnimationFrame(frame)
      frame = 0
      deleteButtons.clear()
      deletes.replaceChildren()
      deletes.remove()
    }
  }

  function positionDeletes() {
    frame = 0
    if (!editing) return
    const visible = new Set<HTMLButtonElement>()
    for (const slot of doc.querySelectorAll<HTMLButtonElement>(slotSelector + ':not([data-empty])')) {
      if (slot.closest('[aria-hidden=true],[hidden]') || !slot.checkVisibility({ visibilityProperty: true })) continue
      const rect = slot.getBoundingClientRect()
      visible.add(slot)
      let button = deleteButtons.get(slot)
      if (!button) {
        button = doc.createElement('button')
        button.type = 'button'
        button.dataset.navigationDelete = ''
        button.addEventListener('click', () => apply(slot, null))
        deleteButtons.set(slot, button)
        deletes.append(button)
      }
      const app = slot.dataset.navigationApp
      setAttribute(button, 'aria-label', (english() ? 'Remove ' : '删除') + (isNavigationShortcut(app) ? label(app) : ''))
      const left = (rect.right - 12) + 'px'
      const top = (rect.top - 7) + 'px'
      if (button.style.left !== left) button.style.left = left
      if (button.style.top !== top) button.style.top = top
    }
    for (const [slot, button] of deleteButtons) {
      if (visible.has(slot)) continue
      button.remove()
      deleteButtons.delete(slot)
    }
    if (!deletes.isConnected) doc.body.append(deletes)
    frame = win.requestAnimationFrame(positionDeletes)
  }

  function closeMenu(restoreFocus = false) {
    menu?.remove()
    menu = undefined
    if (restoreFocus && menuAnchor?.isConnected) menuAnchor.focus({ preventScroll: true })
    menuAnchor = undefined
  }

  type MenuItem = [action: string, zh: string, en: string, icon: 'edit' | 'remove', run: () => void]
  type MenuPoint = { x: number; y: number }
  function showMenu(anchor: HTMLElement, items: MenuItem[], keyboard: boolean, point?: MenuPoint) {
    hideTooltip()
    closeMenu()
    menuAnchor = anchor
    menu = doc.createElement('div')
    menu.dataset.navigationMenu = ''
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', english() ? 'Shortcuts' : '快捷入口')
    const shapes = {
      edit: '<path d="m3 13 1-4 7.4-7.4 3 3L7 12l-4 1ZM10.3 2.7l3 3"/>',
      remove: '<path d="M3 4h10M6 4V2h4v2M4.5 4l.6 10h5.8l.6-10M7 7v4m2-4v4"/>'
    }
    for (const [action, zh, en, icon, run] of items) {
      const row = doc.createElement('button')
      row.type = 'button'
      row.dataset.action = action
      row.setAttribute('role', 'menuitem')
      row.innerHTML = '<svg aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">' + shapes[icon] + '</svg>'
      row.append(english() ? en : zh)
      row.onclick = () => { closeMenu(keyboard); run() }
      menu.append(row)
    }
    doc.body.append(menu)
    positionMenu(anchor, menu, point)
    const opened = menu
    const focus = () => {
      if (keyboard && menu === opened) opened.querySelector('button')?.focus()
    }
    const prepared = prepareBrowserOverlay(doc, opened)
    if (prepared) void prepared.then(ready => {
      if (menu !== opened) return
      if (ready) focus()
      else closeMenu(keyboard)
    })
    else focus()
  }

  function positionMenu(anchor: HTMLElement, popup: HTMLElement, point?: MenuPoint) {
    const anchorBox = anchor.getBoundingClientRect()
    const width = popup.offsetWidth
    const height = popup.offsetHeight
    const side = anchor.matches(slotSelector)
    const x = point?.x ?? (side ? anchorBox.right + 8 : anchorBox.left)
    const y = point ? point.y + 4 : side ? anchorBox.top : anchorBox.top - height - 8
    popup.style.left = Math.max(8, Math.min(x, win.innerWidth - width - 8)) + 'px'
    popup.style.top = Math.max(8, Math.min(y, win.innerHeight - height - 8)) + 'px'
  }

  function openContext(target: Element | null, keyboard = false, point?: MenuPoint) {
    const tray = target?.closest<HTMLElement>(traySelector)
    if (tray) {
      const anchor = target?.closest<HTMLButtonElement>(sourceSelector) ?? tray
      showMenu(anchor, [['manage', '快捷管理', 'Manage shortcuts', 'edit', () => setEditing(true)]], keyboard, point)
      return true
    }
    const slot = targetAt(target)
    if (!slot || slot.hasAttribute('data-empty')) {
      const group = target?.closest<HTMLElement>(expandedGroupSelector)
      if (!group) return false
      const anchor = target?.closest<HTMLButtonElement>('button') ?? group
      showMenu(anchor, [['manage', '快捷管理', 'Manage shortcuts', 'edit', () => setEditing(true)]], keyboard, point)
      return true
    }
    showMenu(slot, [
      ['edit', '编辑快捷入口', 'Edit shortcuts', 'edit', () => setEditing(true)],
      ['remove', '删除快捷入口', 'Remove shortcut', 'remove', () => apply(slot, null)]
    ], keyboard)
    return true
  }

  function onContext(event: MouseEvent) {
    if (openContext(event.target as Element, false, { x: event.clientX, y: event.clientY })) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    consumeClick = false
    hideTooltip()
    const target = event.target as Element
    if (!target.closest('[data-navigation-menu]')) closeMenu()
    const source = target.closest<HTMLButtonElement>(sourceSelector)
    const homeApp = source?.dataset.homeApp
    const slot = editing ? targetAt(target) : null
    const app = isNavigationApp(homeApp) ? homeApp : slot?.dataset.navigationApp
    if (!isNavigationShortcut(app)) {
      if (!target.closest(slotSelector + ',[data-navigation-menu],[data-navigation-delete],.st-more-zone,.st-menu[data-sidebar-more]')) setEditing(false)
      return
    }
    stopPointer()
    const hold: PointerHold = { id: event.pointerId, x: event.clientX, y: event.clientY, app, slot: slot ?? undefined, armed: editing, moving: false }
    pointer = hold
    if (!isNavigationApp(homeApp)) return
    if (editing) setEditing(true, homeApp)
    else hold.timer = win.setTimeout(() => {
      if (pointer !== hold || !source?.isConnected) return
      hold.armed = true
      setEditing(true, homeApp)
    }, holdTime)
  }
  function onPointerMove(event: PointerEvent) {
    const hold = pointer
    if (!hold || hold.id !== event.pointerId) return
    const distance = Math.hypot(event.clientX - hold.x, event.clientY - hold.y)
    if (!hold.armed) {
      if (distance > 6) stopPointer()
      return
    }
    if (!hold.moving && distance <= 6) return
    hold.moving = true
    if (!ghost.isConnected) {
      hold.slot?.setAttribute('data-navigation-drag-source', '')
      ghost.dataset.navigationApp = hold.app
      ghost.style.setProperty('--navigation-glyph', navigationAppIcon(hold.app))
      doc.body.append(ghost)
    }
    ghost.style.left = event.clientX + 'px'
    ghost.style.top = event.clientY + 'px'
    const next = dropTarget(event, hold)
    if (hovering !== next) {
      clearHover()
      hovering = next
      next?.setAttribute('data-drop-target', '')
    }
  }
  function onPointerUp(event: PointerEvent) {
    const hold = pointer
    if (!hold || hold.id !== event.pointerId) return
    consumeClick = hold.slot ? hold.moving : hold.armed
    const slot = hold.moving ? dropTarget(event, hold) : null
    if (slot) {
      apply(slot, hold.app)
      setEditing(true)
    }
    stopPointer()
  }
  function onClick(event: MouseEvent) {
    const target = event.target as Element
    if (consumeClick) {
      consumeClick = false
      if (target.closest(sourceSelector + ',' + slotSelector) || !target.closest('[data-navigation-menu],[data-navigation-delete]')) {
        event.preventDefault()
        event.stopImmediatePropagation()
        return
      }
    }
    if (menu && !target.closest('[data-navigation-menu]')) closeMenu()
    const button = targetAt(target)
    if (!button || button.hasAttribute('data-home-guide-entry-click')) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (editing) {
      if (picked && canDrop(button, picked)) {
        apply(button, picked)
        setEditing(false)
      }
      return
    }
    const app = button.dataset.navigationApp
    if (!isNavigationShortcut(app)) return
    pending?.abort()
    const controller = new AbortController()
    pending = controller
    status.textContent = ''
    const report = () => {
      if (!controller.signal.aborted) status.textContent = english() ? 'Could not open app' : '应用打开失败'
    }
    try { void Promise.resolve(bridge.open(app, controller.signal, 'side')).catch(report) } catch { report() }
  }
  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && !menu && doc.querySelector('.st-menu[data-sidebar-more]')) return
    if (event.key === 'Escape' && (menu || editing)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (menu) closeMenu(true)
      else { stopPointer(); setEditing(false) }
      return
    }
    if (menu && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      const rows = [...menu.querySelectorAll('button')]
      const active = rows.findIndex(row => row === doc.activeElement)
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 :
        (active + (event.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length
      rows[index]?.focus()
      event.preventDefault()
      event.stopImmediatePropagation()
    } else if ((event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) && openContext(event.target as Element, true)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  function onDragStart(event: DragEvent) {
    if ((event.target as Element)?.closest(sourceSelector + ',' + slotSelector)) event.preventDefault()
  }

  const lifetime = new win.AbortController()
  const options = { capture: true, signal: lifetime.signal }
  for (const type of ['pointerover', 'pointerout', 'focusin', 'focusout'] as const) {
    doc.addEventListener(type, hoverTooltip, options)
  }
  win.addEventListener('blur', () => { hideTooltip(); stopPointer() }, { signal: lifetime.signal })
  win.addEventListener('resize', hideTooltip, options)
  win.addEventListener('contextmenu', onContext, options)
  win.addEventListener('pointerdown', onPointerDown, options)
  win.addEventListener('pointermove', onPointerMove, options)
  win.addEventListener('pointerup', onPointerUp, options)
  win.addEventListener('pointercancel', stopPointer, options)
  win.addEventListener('click', onClick, options)
  win.addEventListener('keydown', onKey, options)
  win.addEventListener('dragstart', onDragStart, options)
  const observer = new win.MutationObserver(sync)
  observer.observe(doc.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-dsh-sidebar-wide', 'data-workspace-surface', 'data-odyssey-locale', 'data-odyssey-page',
      'data-srb-selected-session', 'data-ework-notes-session', 'aria-selected', 'aria-hidden', 'hidden']
  })
  const resize = win.ResizeObserver ? new win.ResizeObserver(sync) : undefined
  resize?.observe(rail)
  sync()
  const connectWorkspaceViews = () => setWorkspaceViewPreferences(doc, {
    get: () => value.top,
    replace: (index, app) => update(replaceNavigationShortcut(value, 'top', index, app))
  })
  connectWorkspaceViews()
  const freeSlot = () => editableSlots.find(index => value.side[index] === null)
  return {
    sidebar: () => value.side,
    visibleSidebar: () => shown,
    sidebarFull: () => freeSlot() === undefined,
    pinSidebar(app: NavigationShortcut) {
      if (value.side.includes(app) || (app === 'new-chat' && rail.closest(expandedGroupSelector))) return
      const index = freeSlot()
      if (index !== undefined) update(replaceNavigationShortcut(value, 'side', index, app))
    },
    reload() {
      pending?.abort()
      stopPointer()
      closeMenu()
      setEditing(false)
      value = normalizeNavigationShortcuts(bridge.read())
      sync()
      connectWorkspaceViews()
    },
    dispose() {
      lifetime.abort()
      setWorkspaceViewPreferences(doc, undefined)
      observer.disconnect()
      resize?.disconnect()
      hideTooltip()
      pending?.abort()
      stopPointer()
      closeMenu()
      setEditing(false)
      rail.remove()
      status.remove()
      style.remove()
      doc.documentElement.removeAttribute('data-navigation-sidebar-only')
    }
  }
}
