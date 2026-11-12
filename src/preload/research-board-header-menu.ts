import * as React from 'react'

type CanvasAction = 'refresh' | 'arrange' | 'select-all'
type CanvasActions = Partial<Record<CanvasAction, () => void>>
type CanvasStatus = { zoom: number; actions: readonly CanvasAction[] }
const defaults: CanvasStatus = { zoom: 100, actions: [] }
const noSubscription = () => () => {}
const defaultStatus = () => defaults
const minZoom = 50, maxZoom = 200, step = 10

function canvasControls(sessionId?: string) {
  const key = sessionId ? 'ework.research.zoom.v1:' + sessionId : null
  const storage = typeof window === 'undefined' ? undefined :
    (window as Window & { dshDesktop?: { researchCanvasStorage?: Storage } }).dshDesktop?.researchCanvasStorage
  let zoom = defaults.zoom
  if (key && storage) {
    try {
      const saved = Number(storage.getItem(key))
      if (Number.isInteger(saved) && saved >= minZoom && saved <= maxZoom) zoom = saved
    } catch {}
  }
  let status = { ...defaults, zoom }, actions: CanvasActions = {}
  const listeners = new Set<() => void>()
  const publish = (next: CanvasStatus) => {
    if (next.zoom === status.zoom && next.actions.join() === status.actions.join()) return
    status = next
    listeners.forEach(notify => notify())
  }
  return {
    subscribe(notify: () => void) { listeners.add(notify); return () => { listeners.delete(notify) } },
    getSnapshot: () => status,
    setZoom(value: number) {
      const next = Math.max(minZoom, Math.min(maxZoom, value))
      if (key && storage && next !== status.zoom) {
        try { storage.setItem(key, String(next)) } catch {}
      }
      publish({ ...status, zoom: next })
    },
    bind(next: CanvasActions) { actions = next; publish({ ...status, actions: Object.keys(next) as CanvasAction[] }) },
    run(action: CanvasAction) { actions[action]?.() }
  }
}
const controlsByWorkspace = new WeakMap<object, ReturnType<typeof canvasControls>>()
function controlsFor(workspace: object, sessionId?: string) {
  let controls = controlsByWorkspace.get(workspace)
  if (!controls) { controls = canvasControls(sessionId); controlsByWorkspace.set(workspace, controls) }
  return controls
}

// The resident canvas binds its own operations; inactive views cannot service header commands.
export function useResearchBoardCanvasHeader(
  workspace: object,
  rootRef: React.RefObject<HTMLElement>,
  enabled: boolean,
  actions: CanvasActions,
  sessionId?: string
) {
  const controls = controlsFor(workspace, sessionId)
  const latest = React.useRef(actions)
  latest.current = actions
  const available = Object.keys(actions).join(',')
  React.useLayoutEffect(() => {
    const root = rootRef.current
    if (!enabled || !root || root.closest('[data-home-guide]')) return
    let appliedZoom: number | undefined
    const update = () => {
      const { zoom } = controls.getSnapshot()
      if (appliedZoom === zoom) return
      appliedZoom = zoom
      if (zoom === 100) {
        root.style.removeProperty('zoom')
        root.style.removeProperty('--srb-board-display-zoom')
      } else {
        const scale = String(zoom / 100)
        root.style.setProperty('zoom', scale)
        root.style.setProperty('--srb-board-display-zoom', scale)
      }
      root.toggleAttribute('data-research-board-zoomed-in', zoom > 100)
      root.dispatchEvent(new Event('ework:board-display-zoom'))
    }
    update()
    const off = controls.subscribe(update)
    return () => {
      off()
      root.style.removeProperty('zoom')
      root.style.removeProperty('--srb-board-display-zoom')
      root.removeAttribute('data-research-board-zoomed-in')
    }
  }, [controls, enabled, rootRef])
  React.useLayoutEffect(() => {
    if (!enabled || !rootRef.current || rootRef.current.closest('[data-home-guide]')) return
    const bound: CanvasActions = {}
    for (const key of Object.keys(latest.current) as CanvasAction[]) {
      bound[key] = () => latest.current[key]?.()
    }
    controls.bind(bound)
    return () => controls.bind({})
  }, [controls, enabled, available, rootRef])
}

type MenuAction = {
  label: string
  icon: 'people' | 'add' | 'refresh' | 'arrange' | 'select-all' | 'manage'
  run(): void
  disabled?: boolean
}
const paths: Record<MenuAction['icon'], string> = {
  people: 'M13 18v-2a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v2M8 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-6a3 3 0 0 1 0 6m4 8v-2a3 3 0 0 0-3-3',
  add: 'M10 17H4V4h14v6M9 4v13m6-1h7m-3.5-3.5v7',
  refresh: 'M18 9a7 7 0 1 0 .2 5M18 4v5h-5',
  arrange: 'M4 4h14v14H4zM11 4v14m0-7h7',
  'select-all': 'M8 4H4v4m10-4h4v4M4 14v4h4m10-4v4h-4M8 8h6v6H8z',
  manage: 'M4 6h14M4 11h14M4 16h14M8 4v4m6 1v4m-5 1v4'
}
const h = React.createElement
const actionIcon = (icon: MenuAction['icon']) =>
  h('svg', { width: 16, height: 16, viewBox: '0 0 22 22', 'aria-hidden': true, fill: 'none', stroke: 'currentColor', strokeWidth: 1.55, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: paths[icon] }))

export function ResearchBoardHeaderMenu({ workspace, sessionId, collaboration, membership }: {
  workspace?: object
  sessionId?: string
  collaboration: MenuAction[]
  membership: MenuAction
}) {
  const controls = workspace ? controlsFor(workspace, sessionId) : null
  const { zoom, actions } = React.useSyncExternalStore(controls?.subscribe ?? noSubscription, controls?.getSnapshot ?? defaultStatus, defaultStatus)
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef<HTMLButtonElement>(null)
  const popup = React.useRef<HTMLDivElement>(null)
  const id = React.useId()
  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus({ preventScroll: true }) }

  React.useLayoutEffect(() => {
    const anchor = trigger.current, menu = popup.current
    if (!open || !anchor || !menu) return
    const doc = anchor.ownerDocument, win = doc.defaultView!
    menu.setAttribute('popover', 'manual')
    menu.showPopover?.()
    const place = () => {
      const r = anchor.getBoundingClientRect(), { width, height } = menu.getBoundingClientRect()
      menu.style.left = Math.max(8, Math.min(r.right - width, win.innerWidth - width - 8)) + 'px'
      menu.style.top = Math.max(8, Math.min(r.bottom + 6, win.innerHeight - height - 8)) + 'px'
    }
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menu.contains(target) && !anchor.contains(target)) setOpen(false)
    }
    place()
    menu.querySelector<HTMLElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    doc.addEventListener('pointerdown', outside, true)
    win.addEventListener('resize', place)
    doc.addEventListener('scroll', place, true)
    return () => {
      menu.hidePopover?.()
      doc.removeEventListener('pointerdown', outside, true)
      win.removeEventListener('resize', place)
      doc.removeEventListener('scroll', place, true)
    }
  }, [open])

  const canvasAction = (action: CanvasAction, label: string): MenuAction => ({
    icon: action, label, run: () => controls?.run(action), disabled: !actions.includes(action)
  })
  const item = ({ label, icon, run, disabled }: MenuAction) => h('button', {
    key: icon + label, type: 'button', role: 'menuitem', 'data-board-menu-action': icon, disabled,
    onClick: () => { close(); run() }
  }, actionIcon(icon), h('span', null, label))
  const zoomButton = (label: string, value: number, text: string, disabled: boolean) => h('button', {
    type: 'button', role: 'menuitem', 'aria-label': label, title: label, disabled: !controls || disabled,
    onClick: () => controls?.setZoom(value)
  }, text)
  return h(React.Fragment, null,
    h('button', {
      ref: trigger, type: 'button', className: 'srb-header-control srb-header-more',
      'aria-label': '更多看板操作', title: '更多看板操作', 'aria-haspopup': 'menu',
      'aria-expanded': open, 'aria-controls': open ? id : undefined,
      onClick: () => setOpen(value => !value),
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); setOpen(true)
        }
      }
    }, h('svg', { width: 16, height: 16, viewBox: '0 0 20 20', fill: 'currentColor', 'aria-hidden': true },
      [4, 10, 16].map(x => h('circle', { key: x, cx: x, cy: 10, r: 1.65 })))),
    open && h('div', {
      ref: popup, id, role: 'menu', 'aria-label': '看板操作', className: 'srb-header-menu',
      onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
        if (event.key === 'Tab') { close(); return }
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        if (!buttons.length) return
        const index = buttons.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLButtonElement)
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? (index + 1) % buttons.length
          : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? (index - 1 + buttons.length) % buttons.length : null
        if (target !== null) { event.preventDefault(); event.stopPropagation(); buttons[target]?.focus({ preventScroll: true }) }
      }
    },
    ...collaboration.map(item), item(membership),
    h('div', { className: 'srb-header-zoom' },
      h('span', null, '缩放看板'),
      h('div', { role: 'group', 'aria-label': '缩放看板' },
        zoomButton('缩小看板', zoom - step, '−', zoom <= minZoom),
        zoomButton('恢复看板至 100%', 100, zoom + '%', zoom === 100),
        zoomButton('放大看板', zoom + step, '+', zoom >= maxZoom))),
    item(canvasAction('refresh', '刷新看板')),
    item(canvasAction('arrange', '整理看板')),
    item(canvasAction('select-all', '全选看板')))
  )
}
