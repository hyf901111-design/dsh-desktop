import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Point, Size } from './raster'

type Format = 'png' | 'jpg'
export type CanvasToolAction = {
  id: string
  label: string
  run?(): void
  exporting?(format: Format): void
  choices?: readonly CanvasToolAction[]
  ratio?: Size
  disabled?: boolean
  checked?: boolean
  shortcut?: string
}
const menuWidth = 160, edgeInset = 8

type CanvasActionsProps = {
  doc: Document
  t(zh: string, en: string): string
  exportOnly?: boolean
  canExport?: boolean
  exporting?(format: Format): void
  galleryAction?: { label: string; run(): void }
  toolActions?: readonly CanvasToolAction[]
  dropdown?: CanvasToolAction
  context?: { point: Point; actions: readonly CanvasToolAction[]; close(): void; focus(): void }
}

function RatioIcon({ width, height }: Size) {
  const scale = 17 / Math.max(width, height)
  return <span className="if-ratio-icon" aria-hidden="true">
    <i style={{ width: Math.round(width * scale), height: Math.round(height * scale) }}/>
  </span>
}

export function CanvasActionsMenu({ doc, t, canExport, exporting, galleryAction, toolActions, exportOnly, dropdown, context }: CanvasActionsProps) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const submenu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; opensLeft: boolean }>()
  const [branch, setBranch] = useState<{ items: readonly CanvasToolAction[]; owner: HTMLButtonElement; label: string }>()
  const toolbarMenu = toolActions !== undefined
  const hasTools = Boolean(toolActions?.length)
  const win = doc.defaultView!
  const formatLabel = t('图像导出格式', 'Image export formats')
  const label = context ? t('图层操作', 'Layer actions') : dropdown?.label ?? (exportOnly ? t('导出', 'Export') :
    toolbarMenu ? t('更多工具', 'More tools') : t('更多图像操作', 'More image actions'))

  function close(restoreFocus = false) {
    setBranch(undefined)
    setPosition(undefined)
    context?.close()
    if (restoreFocus) {
      if (context) context.focus()
      else trigger.current?.focus()
    }
  }
  function openAt(x: number, y: number) {
    const left = Math.max(edgeInset, Math.min(x, win.innerWidth - menuWidth - edgeInset))
    const opensLeft = win.innerWidth - left - menuWidth < menuWidth + edgeInset && left >= menuWidth + edgeInset
    setPosition({ left, top: y, opensLeft })
    setBranch(undefined)
  }
  function open() {
    const bounds = trigger.current?.getBoundingClientRect()
    if (bounds) openAt(bounds.right - menuWidth, bounds.bottom + 5)
  }
  function focusFirst(group?: HTMLDivElement | null) {
    group?.querySelector<HTMLElement>(':scope > button:not(:disabled)')?.focus({ preventScroll: true })
  }
  function fitToViewport(group: HTMLDivElement | null, top: number) {
    if (group) group.style.top = Math.max(edgeInset, Math.min(top, win.innerHeight - group.offsetHeight - edgeInset)) + 'px'
  }
  const point = context?.point
  useLayoutEffect(() => { if (point) openAt(point.x, point.y) }, [point])
  useLayoutEffect(() => {
    if (!position) return
    fitToViewport(menu.current, position.top)
    focusFirst(menu.current)
  }, [position])
  useLayoutEffect(() => {
    if (branch) fitToViewport(submenu.current, branch.owner.getBoundingClientRect().top || position?.top || edgeInset)
  }, [branch, position])
  useLayoutEffect(() => {
    if (toolbarMenu && !hasTools || dropdown?.disabled) close()
  }, [toolbarMenu, hasTools, dropdown?.disabled])
  useLayoutEffect(() => {
    if (!position) return
    const dismiss = () => close()
    const outside = (event: Event) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !menu.current?.contains(target) && !submenu.current?.contains(target)) dismiss()
    }
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
  }, [doc, position])
  function formats(action: (format: Format) => void): CanvasToolAction[] {
    return (['png', 'jpg'] as const).map(format => ({ id: format, label: format.toUpperCase(), run: () => action(format) }))
  }
  function showBranch(action: CanvasToolAction, owner: HTMLButtonElement, focus: boolean) {
    const items = action.exporting ? formats(action.exporting) : action.choices
    if (!items?.length || action.disabled) { setBranch(undefined); return }
    setBranch({ items, owner, label: action.exporting ? formatLabel : action.label })
    if (focus) win.requestAnimationFrame(() => focusFirst(submenu.current))
  }
  function onMenuKey(event: KeyboardEvent) {
    const insideSubmenu = submenu.current?.contains(event.target as Node)
    const backKey = position?.opensLeft ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === 'Escape' || insideSubmenu && event.key === backKey) {
      event.stopPropagation()
      event.preventDefault()
      if (insideSubmenu) { branch?.owner.focus(); setBranch(undefined) }
      else close(true)
    } else if (event.key === 'Tab') close(true)
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const group = insideSubmenu ? submenu.current : menu.current
      const items = Array.from(group?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? [])
      if (!items.length) return
      const index = items.indexOf(doc.activeElement as HTMLButtonElement)
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus({ preventScroll: false })
    }
  }
  const arrow = (left = false) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
    style={{ transform: left ? 'scaleX(-1)' : undefined }}>
    <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
  function item(action: CanvasToolAction, child = false) {
    const hasBranch = !!(action.exporting || action.choices)
    return <button key={action.id} type="button"
      role={action.ratio ? 'menuitemradio' : action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
      aria-haspopup={hasBranch ? 'menu' : undefined}
      aria-expanded={hasBranch ? branch?.owner.dataset.action === action.id : undefined}
      aria-checked={action.checked} aria-keyshortcuts={action.shortcut} disabled={action.disabled} data-action={action.id}
      onPointerEnter={event => { if (!child && event.pointerType !== 'touch') showBranch(action, event.currentTarget, false) }}
      onKeyDown={event => {
        if (hasBranch && event.key === (position?.opensLeft ? 'ArrowLeft' : 'ArrowRight')) {
          event.preventDefault(); showBranch(action, event.currentTarget, true)
        }
      }} onClick={event => {
        if (hasBranch) showBranch(action, event.currentTarget, true)
        else { close(true); action.run?.() }
      }}>
      {action.ratio ? <span className="if-ratio-label"><RatioIcon {...action.ratio}/>{action.label}</span> : action.label}
      {action.checked && <span aria-hidden="true">✓</span>}
      {hasBranch && arrow(position?.opensLeft)}
    </button>
  }
  const actions = context?.actions ?? dropdown?.choices ?? toolActions ?? (exportOnly && exporting ? formats(exporting) : [
    { id: 'export', label: t('导出', 'Export'), disabled: !canExport, exporting },
    ...(galleryAction ? [{ id: 'gallery', ...galleryAction }] : []),
  ])
  const direct = exportOnly || dropdown
  return <>
    {!context && <button type="button" ref={trigger}
      className={direct ? 'if-button if-toolbar-export' : toolbarMenu ? 'if-button if-toolbar-more' : 'en-header-export if-more'}
      aria-label={label} title={label} aria-haspopup="menu" aria-expanded={!!position}
      disabled={dropdown ? dropdown.disabled : exportOnly ? !canExport : toolbarMenu ? !hasTools : !galleryAction && !canExport}
      onClick={() => position ? close() : open()} onKeyDown={event => {
        if (event.key === 'ArrowDown' && !position) { event.preventDefault(); open() }
      }}>
      {direct ? <>{label}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
      </svg></> : <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {[4, 10, 16].map(cx => <circle key={cx} cx={cx} cy="10" r="1.65"/>)}
      </svg>}
    </button>}
    {position && createPortal(<>
      <div ref={menu} role="menu" aria-label={label} className="en-export-menu if-actions-popup"
        style={{ left: position.left, top: position.top }} onKeyDown={onMenuKey}>
        {actions.map(action => item(action))}
      </div>
      {branch && <div className="en-export-menu if-actions-popup" role="menu" ref={submenu}
        aria-label={branch.label} style={{ top: position.top, left: position.left + (position.opensLeft ? -menuWidth : menuWidth) }}
        onKeyDown={onMenuKey}>
        {branch.items.map(action => item(action, true))}
      </div>}
    </>, doc.body)}
  </>
}
