import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

type Format = 'png' | 'jpg'
export type CanvasToolAction = {
  id: string
  label: string
  run?(): void
  exporting?(format: Format): void
  disabled?: boolean
  checked?: boolean
  shortcut?: string
}
const menuWidth = 160, edgeInset = 8

type CanvasActionsProps = {
  doc: Document
  t(zh: string, en: string): string
} & ({
  exportOnly?: boolean
  canExport: boolean
  exporting(format: Format): void
  galleryAction?: { label: string; run(): void }
  toolActions?: never
} | {
  exportOnly?: never
  toolActions: readonly CanvasToolAction[]
  canExport?: never
  exporting?: never
  galleryAction?: never
})

export function CanvasActionsMenu({ doc, t, canExport, exporting, galleryAction, toolActions, exportOnly }: CanvasActionsProps) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const exportItem = useRef<HTMLButtonElement>(null), formats = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; opensLeft: boolean }>()
  const [branch, setBranch] = useState<(format: Format) => void>()
  const toolbarMenu = toolActions !== undefined
  const hasTools = Boolean(toolActions?.length)
  const label = exportOnly ? t('导出', 'Export') : toolbarMenu ? t('更多工具', 'More tools') : t('更多图像操作', 'More image actions')
  function close(restoreFocus = false) {
    setBranch(undefined)
    setPosition(undefined)
    if (restoreFocus) trigger.current?.focus()
  }
  function open() {
    const bounds = trigger.current?.getBoundingClientRect()
    if (bounds) {
      const width = doc.defaultView?.innerWidth ?? bounds.right
      const left = Math.max(edgeInset, Math.min(bounds.right - menuWidth, width - menuWidth - edgeInset))
      const opensLeft = width - left - menuWidth < menuWidth + edgeInset && left >= menuWidth + edgeInset
      setPosition({ left, top: bounds.bottom + 5, opensLeft })
    }
  }
  function focusFirst(group?: HTMLDivElement | null) {
    group?.querySelector<HTMLElement>(':scope > button:not(:disabled)')?.focus()
  }
  useLayoutEffect(() => { if (position) focusFirst(menu.current) }, [position])
  useLayoutEffect(() => {
    if (toolbarMenu && !hasTools) setPosition(undefined)
  }, [toolbarMenu, hasTools])
  useLayoutEffect(() => {
    if (!position) return
    const dismiss = () => close()
    const outside = (event: Event) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !menu.current?.contains(target) && !formats.current?.contains(target)) dismiss()
    }
    doc.addEventListener('pointerdown', outside, true)
    doc.addEventListener('click', outside, true)
    doc.addEventListener('sherlock:workspace-surface-change', dismiss)
    doc.defaultView?.addEventListener('sherlock:global-right-panel-state', dismiss)
    doc.defaultView?.addEventListener('resize', dismiss)
    return () => {
      doc.removeEventListener('pointerdown', outside, true)
      doc.removeEventListener('click', outside, true)
      doc.removeEventListener('sherlock:workspace-surface-change', dismiss)
      doc.defaultView?.removeEventListener('sherlock:global-right-panel-state', dismiss)
      doc.defaultView?.removeEventListener('resize', dismiss)
    }
  }, [doc, position])
  function showFormats(focus: boolean, action = canExport ? exporting : undefined) {
    if (!action) return
    setBranch(() => action)
    if (focus) doc.defaultView?.requestAnimationFrame(() => focusFirst(formats.current))
  }
  function onMenuKey(event: KeyboardEvent) {
    const insideFormats = formats.current?.contains(event.target as Node)
    const backKey = position?.opensLeft ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === 'Escape' || insideFormats && event.key === backKey) {
      event.stopPropagation()
      event.preventDefault()
      if (insideFormats) { setBranch(undefined); exportItem.current?.focus() }
      else close(true)
    } else if (event.key === 'Tab') close(true)
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const group = insideFormats ? formats.current : menu.current
      const items = Array.from(group?.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)') ?? [])
      if (!items.length) return
      const index = items.indexOf(doc.activeElement as HTMLButtonElement)
      const step = event.key === 'ArrowDown' ? 1 : -1
      items[(index + step + items.length) % items.length]?.focus()
    }
  }
  const formatItems = (action: (format: Format) => void) => (['png', 'jpg'] as const).map(format =>
    <button key={format} type="button" role="menuitem" onClick={() => { close(true); action(format) }}>{format.toUpperCase()}</button>)
  const arrow = (left = false) => <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
    style={{ transform: left ? 'scaleX(-1)' : undefined }}>
    <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
  return <>
    <button type="button" ref={trigger} className={exportOnly ? 'if-button if-toolbar-export' : toolbarMenu ? 'if-button if-toolbar-more' : 'en-header-export if-more'} aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={!!position} disabled={exportOnly ? !canExport : toolbarMenu ? !hasTools : !galleryAction && !canExport}
      onClick={() => position ? close() : open()} onKeyDown={event => {
        if (event.key === 'ArrowDown' && !position) { event.preventDefault(); open() }
      }}>
      {exportOnly ? <>{label}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
      </svg></> : <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {[4, 10, 16].map(cx => <circle key={cx} cx={cx} cy="10" r="1.65"/>)}
      </svg>}
    </button>
    {position && createPortal(<>
      <div ref={menu} role="menu" aria-label={label} className="en-export-menu if-actions-popup"
        style={{ left: position.left, top: position.top }} onKeyDown={onMenuKey}>
      {exportOnly && exporting && formatItems(exporting)}
      {!toolbarMenu && !exportOnly && <button type="button" ref={exportItem} role="menuitem" aria-haspopup="menu" aria-expanded={!!branch} disabled={!canExport}
        onPointerEnter={event => { if (event.pointerType !== 'touch') showFormats(false) }}
        onKeyDown={event => {
          if (event.key === (position.opensLeft ? 'ArrowLeft' : 'ArrowRight')) { event.preventDefault(); showFormats(true) }
        }}
        onClick={() => showFormats(true)}>{t('导出', 'Export')}{arrow(position.opensLeft)}</button>}
      {galleryAction && <button type="button" role="menuitem" onPointerEnter={() => setBranch(undefined)}
        onClick={() => { close(true); galleryAction.run() }}>{galleryAction.label}</button>}
      {toolActions?.map(action => <button key={action.id} type="button" ref={action.exporting ? exportItem : undefined}
        role={action.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-haspopup={action.exporting ? 'menu' : undefined} aria-expanded={action.exporting ? !!branch : undefined}
        aria-checked={action.checked} aria-keyshortcuts={action.shortcut} disabled={action.disabled}
        onPointerEnter={event => {
          if (!action.disabled && action.exporting && event.pointerType !== 'touch') showFormats(false, action.exporting)
          else setBranch(undefined)
        }} onKeyDown={event => {
          if (action.exporting && event.key === (position.opensLeft ? 'ArrowLeft' : 'ArrowRight')) {
            event.preventDefault(); showFormats(true, action.exporting)
          }
        }} onClick={() => {
          if (action.exporting) showFormats(true, action.exporting)
          else { close(true); action.run?.() }
        }}>
        {action.label}{action.checked && <span aria-hidden="true">✓</span>}{action.exporting && arrow(position.opensLeft)}
      </button>)}
      </div>
      {branch && <div className="en-export-menu if-actions-popup" role="menu" ref={formats}
        aria-label={t('图像导出格式', 'Image export formats')}
        style={{ top: position.top, left: position.left + (position.opensLeft ? -menuWidth : menuWidth) }} onKeyDown={onMenuKey}>
        {formatItems(branch)}
      </div>}
    </>, doc.body)}
  </>
}
