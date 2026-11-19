import {
  isNavigationApp, navigationSlotCount, normalizeNavigationShortcuts, replaceNavigationShortcut,
  type NavigationApp, type NavigationRegion, type NavigationShortcuts
} from '../shared/navigation-shortcuts'
import { prepareBrowserOverlay } from './browser/overlay-preflight'
import { icons } from './scheduled/icons'
import styles from './navigation-shortcuts.css?raw'

const presentation = {
  browser: ['浏览器', 'Browser', icons.browserRail],
  knowledge: ['知识库', 'Knowledge Base', icons.knowledge],
  'image-factory': ['图像', 'Images', icons.factory],
  plugin: ['插件', 'Plugins', icons.plugin],
  scheduled: ['定时任务', 'Scheduled tasks', icons.clock],
  research: ['研究', 'Research', icons.research],
  note: ['笔记', 'Notes', icons.noteDark],
  spreadsheet: ['表格', 'Spreadsheet', icons.spreadsheet]
} as const
const nativeApps = { research: 'research', notes: 'note', spreadsheet: 'spreadsheet' } as const
const tabsSelector = '.pI_x6G_centerCol [data-srb-tabs], .eb-workspace-tabs'
const groupSelector = '[data-dsh-sidebar-root][data-dsh-sidebar-wide=false] .hHd-Xa_newSessionGroup'
const sourceSelector = '[data-home-app-shortcuts] button[data-home-app]'
const slotSelector = '[data-navigation-slot]'
const holdTime = 360

type Bridge = {
  read(): unknown
  save(value: NavigationShortcuts): boolean
  open(app: NavigationApp, signal: AbortSignal): Promise<void> | void
}

type PickedApp = { app: NavigationApp; region?: NavigationRegion }
type PointerHold = {
  id: number; x: number; y: number; app: NavigationApp
  timer?: number; armed: boolean; moving: boolean
}

export function mountNavigationShortcuts(doc: Document, bridge: Bridge) {
  const win = doc.defaultView!
  let value = normalizeNavigationShortcuts(bridge.read())
  const style = doc.createElement('style')
  style.textContent = styles
  doc.head.append(style)
  const rail = doc.createElement('div')
  rail.dataset.navigationRail = ''
  const deletes = doc.createElement('div')
  deletes.dataset.navigationDeletes = ''
  const ghost = doc.createElement('div')
  ghost.dataset.navigationGhost = ''
  ghost.setAttribute('aria-hidden', 'true')
  const status = doc.createElement('span')
  status.dataset.navigationStatus = ''
  status.setAttribute('role', 'status')
  doc.body.append(status)

  let editing = false
  let picked: PickedApp | undefined
  let pointer: PointerHold | undefined
  let consumeClick = false
  let hovering: HTMLButtonElement | null = null
  let menu: HTMLElement | undefined
  let menuAnchor: HTMLButtonElement | undefined
  let pending: AbortController | undefined
  let frame = 0
  const deleteButtons = new Map<HTMLButtonElement, HTMLButtonElement>()
  const english = () => doc.documentElement.dataset.odysseyLocale === 'en'
  const label = (app: NavigationApp) => presentation[app][english() ? 1 : 0]
  const glyph = (app: NavigationApp) => 'url("' + presentation[app][2].replaceAll('"', '%22') + '")'
  const setAttribute = (element: Element, name: string, next: string) => {
    if (element.getAttribute(name) !== next) element.setAttribute(name, next)
  }

  function project(container: Element, region: NavigationRegion) {
    const children = Array.from(container.children) as HTMLButtonElement[]
    const native = new Map<NavigationApp, HTMLButtonElement>()
    for (const child of children) {
      const id = child.dataset.conversationViewId ?? child.dataset.workspaceNativeView
      if (!id || !Object.hasOwn(nativeApps, id)) continue
      const app = nativeApps[id as keyof typeof nativeApps]
      native.set(app, child)
      const unpinned = !value[region].includes(app)
      child.toggleAttribute('data-navigation-unpinned', unpinned)
      if (unpinned) child.removeAttribute('data-navigation-slot')
    }
    for (let index = 0; index < navigationSlotCount; index++) {
      const app = value[region][index] ?? null
      const existing = children.find(child => child.hasAttribute('data-navigation-owned') && child.dataset.navigationSlot === String(index))
      const original = app ? native.get(app) : undefined
      const button = original ?? existing ?? doc.createElement('button')
      setAttribute(button, 'data-navigation-slot', String(index))
      setAttribute(button, 'data-navigation-region', region)
      setAttribute(button, 'data-navigation-app', app ?? '')
      button.toggleAttribute('data-empty', !app)
      if (original) {
        existing?.remove()
        continue
      }
      setAttribute(button, 'type', 'button')
      button.toggleAttribute('data-navigation-owned', true)
      const name = app ? label(app) : english() ? 'Empty shortcut slot' : '空快捷位'
      setAttribute(button, 'aria-label', name)
      setAttribute(button, 'title', name)
      if (region === 'side') {
        const mask = app ? glyph(app) : ''
        if (button.style.getPropertyValue('--navigation-glyph') !== mask) button.style.setProperty('--navigation-glyph', mask)
        const surface = app === 'plugin' ? 'integrations' : app === 'note' ? 'notes' : app
        setAttribute(button, 'aria-pressed', String(Boolean(app && doc.body.dataset.workspaceSurface === surface)))
      } else {
        if (button.textContent !== (app ? name : '')) button.textContent = app ? name : ''
        setAttribute(button, 'tabindex', container.getAttribute('aria-hidden') === 'true' ? '-1' : '0')
      }
      if (!existing) container.append(button)
    }
  }

  function sync() {
    const count = String(1 + value.top.filter(Boolean).length)
    if (doc.body.style.getPropertyValue('--navigation-tab-count') !== count) {
      doc.body.style.setProperty('--navigation-tab-count', count)
    }
    for (const tabs of doc.querySelectorAll(tabsSelector)) {
      if (tabs.closest('[data-odyssey-subagent-panel]')) continue
      tabs.toggleAttribute('data-navigation-tabs', true)
      project(tabs, 'top')
    }
    const group = doc.querySelector(groupSelector)
    if (group) {
      const more = group.querySelector('.st-more-zone')
      if (rail.parentElement !== group || (more && rail.nextElementSibling !== more)) group.insertBefore(rail, more)
      project(rail, 'side')
    } else rail.remove()
    if (menu && menuAnchor && !menuAnchor.isConnected && menuAnchor.closest('#eb-workspace-tabs')) {
      // Browser rebuilds its toolbar when tab state changes, including during a download.
      const shortcut = menuAnchor.dataset
      const replacement = doc.querySelector<HTMLButtonElement>(
        `#eb-workspace-tabs [data-navigation-slot="${shortcut.navigationSlot}"]`)
      if (replacement && replacement.dataset.navigationApp === shortcut.navigationApp) {
        menuAnchor = replacement
        replacement.closest('.eb-workspace-tabs')?.setAttribute('data-navigation-retain', '')
        positionMenu(replacement, menu)
      }
    }
    if (menuAnchor && (!menuAnchor.isConnected || menuAnchor.closest('[aria-hidden=true],[hidden]'))) closeMenu()
  }

  function targetAt(element: Element | null) {
    return element?.closest<HTMLButtonElement>(slotSelector) ?? null
  }
  function clearHover() {
    hovering?.removeAttribute('data-drop-target')
    hovering = null
  }
  function canDrop(button: HTMLButtonElement, selection: PickedApp) {
    const region = button.dataset.navigationRegion as NavigationRegion
    return (!selection.region || region === selection.region) && button.dataset.navigationApp !== selection.app
  }
  function stopPointer() {
    if (pointer?.timer !== undefined) win.clearTimeout(pointer.timer)
    pointer = undefined
    ghost.remove()
    clearHover()
  }
  function update(next: NavigationShortcuts) {
    if (next === value) return
    if (!bridge.save(next)) {
      status.textContent = english() ? 'Could not save shortcuts' : '快捷入口保存失败'
      return
    }
    value = next
    status.textContent = ''
    sync()
  }
  function apply(button: HTMLButtonElement, app: NavigationApp | null) {
    const region = button.dataset.navigationRegion as NavigationRegion
    update(replaceNavigationShortcut(value, region, Number(button.dataset.navigationSlot), app))
  }
  function setEditing(active: boolean, selection?: PickedApp) {
    editing = active
    picked = selection
    doc.body.toggleAttribute('data-navigation-editing', active)
    if (selection?.region) doc.body.dataset.navigationEditingRegion = selection.region
    else delete doc.body.dataset.navigationEditingRegion
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
    const scope = picked?.region
    for (const slot of doc.querySelectorAll<HTMLButtonElement>(slotSelector + ':not([data-empty])')) {
      if ((scope && slot.dataset.navigationRegion !== scope) || slot.closest('[aria-hidden=true],[hidden]') || !slot.checkVisibility({ visibilityProperty: true })) continue
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
      setAttribute(button, 'aria-label', (english() ? 'Remove ' : '删除') + (isNavigationApp(app) ? label(app) : ''))
      const left = (rect.right - 9) + 'px'
      const top = (rect.top - 4) + 'px'
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
    menuAnchor?.closest('.eb-workspace-tabs')?.removeAttribute('data-navigation-retain')
    if (restoreFocus && menuAnchor?.isConnected) menuAnchor.focus({ preventScroll: true })
    menuAnchor = undefined
  }

  type MenuItem = [action: string, zh: string, en: string, icon: 'edit' | 'remove' | 'top' | 'side', run: () => void]
  function showMenu(anchor: HTMLButtonElement, items: MenuItem[], keyboard: boolean) {
    closeMenu()
    menuAnchor = anchor
    anchor.closest('.eb-workspace-tabs')?.setAttribute('data-navigation-retain', '')
    menu = doc.createElement('div')
    menu.dataset.navigationMenu = ''
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', english() ? 'Shortcuts' : '快捷入口')
    const shapes = {
      edit: '<path d="m3 13 1-4 7.4-7.4 3 3L7 12l-4 1ZM10.3 2.7l3 3"/>',
      remove: '<path d="M3 4h10M6 4V2h4v2M4.5 4l.6 10h5.8l.6-10M7 7v4m2-4v4"/>',
      top: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M2 6.5h12"/>',
      side: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M5.5 3v10"/>'
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
    positionMenu(anchor, menu)
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

  function positionMenu(anchor: HTMLButtonElement, popup: HTMLElement) {
    const anchorBox = anchor.getBoundingClientRect()
    const width = popup.offsetWidth
    const height = popup.offsetHeight
    const side = anchor.dataset.navigationRegion === 'side'
    const source = anchor.matches(sourceSelector)
    const x = side ? anchorBox.right + 8 : anchorBox.left
    const y = side ? anchorBox.top : source ? anchorBox.top - height - 8 : anchorBox.bottom + 8
    popup.style.left = Math.max(8, Math.min(x, win.innerWidth - width - 8)) + 'px'
    popup.style.top = Math.max(8, Math.min(y, win.innerHeight - height - 8)) + 'px'
  }

  function openContext(target: Element | null, keyboard = false) {
    const source = target?.closest<HTMLButtonElement>(sourceSelector)
    const app = source?.dataset.homeApp
    if (source && isNavigationApp(app)) {
      const items: MenuItem[] = []
      if (!value.top.includes(app)) items.push(['top', '添加到顶栏', 'Add to top bar', 'top', () => setEditing(true, { app, region: 'top' })])
      if (!value.side.includes(app)) items.push(['side', '添加到侧栏', 'Add to sidebar', 'side', () => setEditing(true, { app, region: 'side' })])
      if (items.length) showMenu(source, items, keyboard)
      return items.length > 0
    }
    const slot = targetAt(target)
    if (!slot || slot.hasAttribute('data-empty')) return false
    showMenu(slot, [
      ['edit', '编辑快捷入口', 'Edit shortcuts', 'edit', () => setEditing(true)],
      ['remove', '删除快捷入口', 'Remove shortcut', 'remove', () => apply(slot, null)]
    ], keyboard)
    return true
  }

  function onContext(event: MouseEvent) {
    if (openContext(event.target as Element)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !event.isPrimary) return
    consumeClick = false
    const target = event.target as Element
    if (!target.closest('[data-navigation-menu]')) closeMenu()
    const source = target.closest<HTMLButtonElement>(sourceSelector)
    const app = source?.dataset.homeApp
    if (!source || !isNavigationApp(app)) {
      if (!target.closest(slotSelector + ',[data-navigation-menu],[data-navigation-delete]')) setEditing(false)
      return
    }
    stopPointer()
    const hold: PointerHold = { id: event.pointerId, x: event.clientX, y: event.clientY, app, armed: editing, moving: false }
    pointer = hold
    if (editing) setEditing(true, { app })
    else hold.timer = win.setTimeout(() => {
      if (pointer !== hold || !source.isConnected) return
      hold.armed = true
      setEditing(true, { app })
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
      ghost.style.setProperty('--navigation-glyph', glyph(hold.app))
      doc.body.append(ghost)
    }
    ghost.style.left = event.clientX + 'px'
    ghost.style.top = event.clientY + 'px'
    const slot = targetAt(doc.elementFromPoint(event.clientX, event.clientY))
    const next = slot && picked && canDrop(slot, picked) ? slot : null
    if (hovering !== next) {
      clearHover()
      hovering = next
      next?.setAttribute('data-drop-target', '')
    }
  }
  function onPointerUp(event: PointerEvent) {
    const hold = pointer
    if (!hold || hold.id !== event.pointerId) return
    consumeClick = hold.armed
    const slot = hold.moving ? targetAt(doc.elementFromPoint(event.clientX, event.clientY)) : null
    if (slot && picked && canDrop(slot, picked)) {
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
    if (!button) return
    if (editing || button.hasAttribute('data-navigation-owned')) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
    if (editing) {
      if (picked && canDrop(button, picked)) {
        apply(button, picked.app)
        setEditing(false)
      }
      return
    }
    const app = button.dataset.navigationApp
    if (!button.hasAttribute('data-navigation-owned') || !isNavigationApp(app) || (button.dataset.navigationRegion === 'side' && button.getAttribute('aria-pressed') === 'true')) return
    pending?.abort()
    const controller = new AbortController()
    pending = controller
    status.textContent = ''
    const report = () => {
      if (!controller.signal.aborted) status.textContent = english() ? 'Could not open app' : '应用打开失败'
    }
    try { void Promise.resolve(bridge.open(app, controller.signal)).catch(report) } catch { report() }
  }
  function onKey(event: KeyboardEvent) {
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
    if ((event.target as Element)?.closest(sourceSelector)) event.preventDefault()
  }

  const lifetime = new win.AbortController()
  const options = { capture: true, signal: lifetime.signal }
  win.addEventListener('contextmenu', onContext, options)
  win.addEventListener('pointerdown', onPointerDown, options)
  win.addEventListener('pointermove', onPointerMove, options)
  win.addEventListener('pointerup', onPointerUp, options)
  win.addEventListener('pointercancel', stopPointer, options)
  win.addEventListener('blur', stopPointer, options)
  win.addEventListener('click', onClick, options)
  win.addEventListener('keydown', onKey, options)
  win.addEventListener('dragstart', onDragStart, options)
  const observer = new win.MutationObserver(sync)
  observer.observe(doc.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-dsh-sidebar-wide', 'data-workspace-surface', 'data-odyssey-locale', 'aria-hidden', 'hidden']
  })
  sync()
  return {
    sidebar: () => value.side,
    reload() {
      pending?.abort()
      stopPointer()
      closeMenu()
      setEditing(false)
      value = normalizeNavigationShortcuts(bridge.read())
      sync()
    },
    dispose() {
      lifetime.abort()
      observer.disconnect()
      pending?.abort()
      stopPointer()
      closeMenu()
      setEditing(false)
      rail.remove()
      status.remove()
      style.remove()
      doc.body.style.removeProperty('--navigation-tab-count')
      doc.querySelectorAll('[data-navigation-owned]').forEach(node => node.remove())
      doc.querySelectorAll('[data-navigation-tabs],[data-navigation-unpinned],' + slotSelector).forEach(node => {
        for (const attribute of ['data-navigation-tabs', 'data-navigation-unpinned', 'data-navigation-slot', 'data-navigation-region', 'data-navigation-app']) {
          node.removeAttribute(attribute)
        }
      })
    }
  }
}
