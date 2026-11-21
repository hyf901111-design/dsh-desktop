import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type RefObject } from 'react'
import type { CanvasScope, ImageFactoryTaskTab } from '../../shared/image-factory-canvas'
import { browserIcons } from '../browser/icons'
import { clipWorkspaceTabs, reserveWorkspaceRightControl, revealWorkspaceTab } from '../workspace-topbar'
import { iconSource } from './icons'

export type TaskTabs = { tabs: (ImageFactoryTaskTab & { key?: string })[]; active?: CanvasScope; busy: boolean; creating?: string; fresh?: string; canRestore?: boolean }
export type TaskAction = { kind: 'new' | 'select' | 'close' | 'restore' | 'reorder' | 'pin' | 'close-others'; scope?: CanvasScope; before?: CanvasScope }
type Translate = (zh: string, en: string) => string
type Drag = { pointer: number; id: string; x: number; y: number; active: boolean }

function TabIcon({ name }: { name: 'check' | 'chevron' | 'close' | 'history' | 'image' | 'pin' | 'plus' }) {
  const icon = name === 'image' ? iconSource(name) : browserIcons[name]
  if (!icon) return null
  return <i className="eb-icon" aria-hidden="true"
    style={{ '--eb-icon': 'url("' + icon.replaceAll('"', '%22') + '")' } as CSSProperties}/>
}

export function ImageTaskTabs({ doc, header, state, current, title, t, action }: {
  doc: Document; header: RefObject<HTMLElement>; state: TaskTabs; current: CanvasScope; title?: string; t: Translate
  action(value: TaskAction): void
}) {
  const { tabs, active, busy, canRestore } = state
  const strip = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const [popup, setPopup] = useState<{ left: number; scope?: CanvasScope; focus?: boolean }>()
  const contextTab = popup?.scope === undefined ? undefined : tabs.find(tab => tab.scope === popup.scope)
  const press = useRef<Drag>(), suppressClick = useRef(0)
  const frozen = useRef<HTMLElement[]>([]), closing = useRef<Animation>()
  const focusOnChange = useRef(false)
  const labels = tabs.map(tab => tab.title ?? (tab.scope === current ? title : undefined) ?? t('新图像', 'New image'))
  const listLabel = t('已打开的页签', 'Open tabs')
  const addLabel = t('新建图片任务', 'New image task')
  const win = doc.defaultView!
  const tabNodes = () => Array.from(strip.current?.querySelectorAll<HTMLElement>('.eb-tab') ?? [])
  const activeTab = () => strip.current?.querySelector<HTMLElement>('[aria-selected=true]')
  const closeList = (focus = false) => {
    setPopup(undefined)
    if (focus) (contextTab ? activeTab() : trigger.current)?.focus({ preventScroll: true })
  }
  function showPopup(anchor: HTMLElement | null, scope?: CanvasScope, focus = false) {
    const bounds = header.current?.getBoundingClientRect(), box = anchor?.getBoundingClientRect()
    if (bounds && box) setPopup({ left: Math.max(8, Math.min(bounds.width - 316, box.left - bounds.left)), scope, focus })
  }
  function unfreeze() {
    if (closing.current) return
    for (const node of frozen.current) {
      node.style.removeProperty('flex')
      node.style.removeProperty('width')
    }
    frozen.current = []
    if (strip.current) revealWorkspaceTab(strip.current)
  }
  useLayoutEffect(() => {
    if (!strip.current || !header.current) return
    const list = strip.current, bar = header.current
    const layout = () => { reserveWorkspaceRightControl(bar); revealWorkspaceTab(list) }
    const observer = new ResizeObserver(layout)
    observer.observe(bar)
    observer.observe(list)
    win.addEventListener('sherlock:global-right-panel-state', layout)
    bar.addEventListener('pointerleave', unfreeze)
    layout()
    return () => {
      observer.disconnect()
      win.removeEventListener('sherlock:global-right-panel-state', layout)
      bar.removeEventListener('pointerleave', unfreeze)
      const animation = closing.current
      closing.current = undefined
      animation?.cancel()
      unfreeze()
    }
  }, [header, win])
  useLayoutEffect(() => {
    if (strip.current) revealWorkspaceTab(strip.current)
    if (focusOnChange.current && !busy) {
      focusOnChange.current = false
      activeTab()?.focus({ preventScroll: true })
    }
  }, [tabs, active, busy])
  useLayoutEffect(() => {
    if (!popup) return
    if (popup.focus) menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
    const outside = (event: Event) => {
      const target = event.target as Node
      if (!menu.current?.contains(target) && !trigger.current?.contains(target)) closeList()
    }
    const dismiss = () => closeList()
    doc.addEventListener('pointerdown', outside, true)
    doc.addEventListener('click', outside, true)
    doc.addEventListener('sherlock:workspace-surface-change', dismiss)
    win.addEventListener('sherlock:global-right-panel-state', dismiss)
    win.addEventListener('resize', dismiss)
    return () => {
      doc.removeEventListener('pointerdown', outside, true)
      doc.removeEventListener('click', outside, true)
      doc.removeEventListener('sherlock:workspace-surface-change', dismiss)
      win.removeEventListener('sherlock:global-right-panel-state', dismiss)
      win.removeEventListener('resize', dismiss)
    }
  }, [doc, win, popup])
  function select(scope: CanvasScope, fromList = false) {
    if (busy || closing.current) return
    closeList(fromList)
    if (!fromList) {
      tabNodes().find(node => node.dataset.id === (scope ?? ''))?.focus({ preventScroll: true })
    }
    action({ kind: 'select', scope })
  }
  async function close(scope: CanvasScope) {
    if (busy || closing.current) return
    const list = strip.current
    const node = tabNodes().find(tab => tab.dataset.id === (scope ?? ''))
    if (!list || !node) return
    closeList()
    if (!win.matchMedia('(prefers-reduced-motion: reduce)').matches && typeof node.animate === 'function') {
      const width = node.getBoundingClientRect().width
      frozen.current = tabNodes()
      for (const item of frozen.current) {
        const pixels = item.getBoundingClientRect().width + 'px'
        item.style.flex = '0 0 ' + pixels
        item.style.width = pixels
      }
      const gap = parseFloat(win.getComputedStyle(list).columnGap) || 0
      const animation = node.animate([
        { flexBasis: width + 'px', width: width + 'px', opacity: 1 },
        { flexBasis: '0px', width: '0px', minWidth: '0px', opacity: 0, marginRight: -gap + 'px' },
      ], { duration: 150, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })
      closing.current = animation
      await animation.finished.catch(() => {})
      if (closing.current !== animation) return
      closing.current = undefined
      animation.cancel()
      if (!header.current?.matches(':hover')) unfreeze()
    }
    focusOnChange.current = true
    action({ kind: 'close', scope })
  }
  useLayoutEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      if (doc.body.dataset.workspaceSurface !== 'image-factory' || event.defaultPrevented || event.isComposing ||
          !(event.metaKey || event.ctrlKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key !== 't' && key !== 'w') return
      event.preventDefault()
      event.stopPropagation()
      if (busy || closing.current || event.repeat) return
      if (key === 'w') {
        if (active !== undefined) void close(active)
      } else if (!event.shiftKey || canRestore) {
        closeList()
        focusOnChange.current = true
        action({ kind: event.shiftKey ? 'restore' : 'new' })
      }
    }
    doc.addEventListener('keydown', shortcuts, true)
    return () => doc.removeEventListener('keydown', shortcuts, true)
  }, [doc, active, busy, canRestore, tabs, action])

  function dropTarget(event: PointerEvent<HTMLDivElement>) {
    const list = event.currentTarget, box = list.getBoundingClientRect()
    for (const node of tabNodes()) delete node.dataset.dropEdge
    const { clientX: x, clientY: y } = event
    if (x < box.left || x > box.right || y < box.top || y > box.bottom) return
    if (x < box.left + 24) list.scrollLeft -= 12
    else if (x > box.right - 24) list.scrollLeft += 12
    const hit = doc.elementFromPoint(x, y)?.closest<HTMLElement>('.eb-tab') ?? tabNodes().at(-1)
    if (!hit || !list.contains(hit)) return
    const hitBox = hit.getBoundingClientRect(), after = x > hitBox.left + hitBox.width / 2
    if (hit.dataset.id !== press.current?.id) hit.dataset.dropEdge = after ? 'after' : 'before'
    return { id: after ? (hit.nextElementSibling as HTMLElement | null)?.dataset.id : hit.dataset.id }
  }
  function endDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const drag = press.current
    if (drag?.pointer !== event.pointerId) return
    if (drag.active) {
      const target = cancelled ? undefined : dropTarget(event)
      suppressClick.current = win.performance.now() + 80
      event.preventDefault()
      if (target) action({ kind: 'reorder', scope: drag.id || null, before: target.id === '' ? null : target.id })
      for (const node of tabNodes()) { delete node.dataset.tabDragging; delete node.dataset.dropEdge }
    }
    press.current = undefined
  }
  const maxWidth = tabs.reduce((width, tab) => width + (tab.pinned ? 42 : 240), 0) +
    Math.max(0, tabs.length - 1) * (tabs.length > 6 ? 2 : 8)
  const menuLabel = contextTab ? t('页签操作', 'Tab actions') : listLabel
  function runContext(kind: TaskAction['kind']) {
    if (!contextTab) return
    if (kind === 'close') { void close(contextTab.scope); return }
    closeList(true)
    focusOnChange.current = true
    action({ kind, scope: contextTab.scope })
  }
  return <>
    {tabs.length > 0 && <>
      <span className="eb-app-divider" aria-hidden="true"/>
      <button ref={trigger} type="button" className="eb-icon-button eb-tab-switcher" aria-label={listLabel} title={listLabel}
        aria-haspopup="menu" aria-expanded={!!popup && popup.scope === undefined}
        onClick={() => popup && popup.scope === undefined ? closeList(true) : showPopup(trigger.current)}
        onKeyDown={event => {
          if (event.key === 'ArrowDown') { event.preventDefault(); showPopup(trigger.current, undefined, true) }
          if (event.key === 'Escape' && popup) { event.stopPropagation(); closeList(true) }
        }}><TabIcon name="chevron"/></button>
    </>}
    <div className="eb-tab-scroll" role="tablist" aria-hidden={tabs.length === 0 || undefined} aria-label={t('图片任务', 'Image tasks')} aria-busy={busy} ref={strip}
      style={{ '--eb-tab-count': tabs.length, '--eb-tabs-max': maxWidth + 'px' } as CSSProperties}
      onScroll={event => clipWorkspaceTabs(event.currentTarget)}
      onPointerDown={event => {
        const target = event.target as HTMLElement, node = target.closest<HTMLElement>('.eb-tab')
        if (event.button !== 0 || !event.isPrimary || !node || target.closest('button') || busy || closing.current) return
        press.current = { id: node.dataset.id!, pointer: event.pointerId, x: event.clientX, y: event.clientY, active: false }
      }}
      onPointerMove={event => {
        const drag = press.current
        if (drag?.pointer !== event.pointerId) return
        if (!(event.buttons & 1)) { endDrag(event, true); return }
        if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 6) {
          drag.active = true
          const node = tabNodes().find(tab => tab.dataset.id === drag.id)
          if (node) node.dataset.tabDragging = 'true'
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        if (drag.active) { event.preventDefault(); dropTarget(event) }
      }}
      onPointerUp={event => endDrag(event)} onLostPointerCapture={event => endDrag(event, true)}
      onPointerCancel={event => endDrag(event, true)}>
      {tabs.map((tab, index) => {
        const selected = tab.scope === active, title = labels[index]!
        return <div key={tab.key ?? tab.scope ?? ''} className="eb-tab" role="tab" data-id={tab.scope ?? ''} data-pinned={!!tab.pinned}
          tabIndex={selected && !busy ? 0 : -1} aria-label={title} aria-selected={selected} aria-disabled={busy || undefined}
          aria-controls="image-factory-task-workspace" title={title}
          onClick={event => { if (!event.detail || win.performance.now() >= suppressClick.current) select(tab.scope) }}
          onAuxClick={event => { if (event.button === 1) { event.preventDefault(); void close(tab.scope) } }}
          onContextMenu={event => {
            event.preventDefault()
            if (busy || closing.current) return
            select(tab.scope)
            showPopup(event.currentTarget, tab.scope)
          }}
          onKeyDown={event => {
            if (event.target !== event.currentTarget) return
            const count = tabs.length
            const next = event.key === 'ArrowLeft' ? (index - 1 + count) % count : event.key === 'ArrowRight' ? (index + 1) % count
              : event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : undefined
            if (next !== undefined) { event.preventDefault(); select(tabs[next]!.scope) }
            else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(tab.scope) }
            else if (event.key === 'Delete') { event.preventDefault(); void close(tab.scope) }
          }}>
          <TabIcon name="image"/>
          {!tab.pinned && <><span className="eb-tab-title">{title}</span>
          <button className="eb-tab-close" type="button" tabIndex={-1} disabled={busy}
            aria-label={t('关闭任务 ', 'Close image task ') + title}
            onClick={event => { event.stopPropagation(); void close(tab.scope) }}><TabIcon name="close"/></button>
          </>}
        </div>
      })}
    </div>
    <button type="button" className="eb-icon-button if-task-add" aria-label={addLabel} title={addLabel} disabled={busy}
      onClick={() => {
        if (closing.current) return
        closeList(); focusOnChange.current = true; action({ kind: 'new' })
      }}><TabIcon name="plus"/></button>
    {popup && <div ref={menu} className="if-tab-list" data-tab-context={!!contextTab} role="menu" aria-label={menuLabel}
      style={{ left: popup.left }} onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); closeList(true) }
        if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const rows = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
        const index = rows.indexOf(doc.activeElement as HTMLButtonElement), step = event.key === 'ArrowUp' ? -1 : 1
        rows[event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + step + rows.length) % rows.length]?.focus()
      }}>
      {contextTab ? <>
        <button type="button" role="menuitem" className="eb-menu-item" onClick={() => runContext('pin')} disabled={busy}>
          <TabIcon name="pin"/>{contextTab.pinned ? t('取消固定页签', 'Unpin tab') : t('固定页签', 'Pin tab')}</button>
        <button type="button" role="menuitem" className="eb-menu-item" onClick={() => runContext('close')} disabled={busy}>
          <TabIcon name="close"/>{t('关闭页签', 'Close tab')}<kbd>⌘W</kbd></button>
        <button type="button" role="menuitem" className="eb-menu-item" onClick={() => runContext('close-others')} disabled={busy || tabs.length < 2}>
          <TabIcon name="close"/>{t('关闭其他页签', 'Close other tabs')}</button>
        <button type="button" role="menuitem" className="eb-menu-item" onClick={() => runContext('restore')} disabled={busy || !canRestore}>
          <TabIcon name="history"/>{t('重新打开关闭的页签', 'Reopen closed tab')}<kbd>⇧⌘T</kbd></button>
      </> : <>
        <div className="eb-tab-heading"><span>{listLabel}</span><span>{tabs.length}</span></div>
        <hr/>
        <div className="eb-tab-options">{tabs.map((tab, index) => <button key={tab.key ?? tab.scope ?? ''} type="button" role="menuitemradio"
          className="eb-tab-option" aria-checked={tab.scope === active} disabled={busy} onClick={() => select(tab.scope, true)}>
          <TabIcon name="image"/><span>{labels[index]}</span>{tab.scope === active && <TabIcon name="check"/>}
        </button>)}</div>
      </>}
    </div>}
  </>
}
