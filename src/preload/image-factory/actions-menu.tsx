import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'

type Format = 'png' | 'jpg'
const menuWidth = 160, edgeInset = 8

export function CanvasActionsMenu({ doc, t, canExport, exporting, galleryAction }: {
  doc: Document
  t(zh: string, en: string): string
  canExport: boolean
  exporting(format: Format): void
  galleryAction?: { label: string; run(): void }
}) {
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const exportItem = useRef<HTMLButtonElement>(null), formats = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; opensLeft: boolean }>()
  const [branch, setBranch] = useState(false)
  const label = t('更多图像操作', 'More image actions')
  function close(restoreFocus = false) {
    setBranch(false)
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
  useEffect(() => {
    if (!position) return
    const dismiss = () => close()
    const outside = (event: PointerEvent) => {
      const target = event.target as Node
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) dismiss()
    }
    doc.addEventListener('pointerdown', outside, true)
    doc.addEventListener('sherlock:workspace-surface-change', dismiss)
    doc.defaultView?.addEventListener('sherlock:global-right-panel-state', dismiss)
    doc.defaultView?.addEventListener('resize', dismiss)
    return () => {
      doc.removeEventListener('pointerdown', outside, true)
      doc.removeEventListener('sherlock:workspace-surface-change', dismiss)
      doc.defaultView?.removeEventListener('sherlock:global-right-panel-state', dismiss)
      doc.defaultView?.removeEventListener('resize', dismiss)
    }
  }, [doc, position])
  function showFormats(focus: boolean) {
    if (!canExport) return
    setBranch(true)
    if (focus) doc.defaultView?.requestAnimationFrame(() => focusFirst(formats.current))
  }
  function onMenuKey(event: KeyboardEvent) {
    const insideFormats = formats.current?.contains(event.target as Node)
    const backKey = position?.opensLeft ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === 'Escape' || insideFormats && event.key === backKey) {
      event.stopPropagation()
      event.preventDefault()
      if (insideFormats) { setBranch(false); exportItem.current?.focus() }
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
  return <>
    <button type="button" ref={trigger} className="en-header-export if-more" aria-label={label} title={label}
      aria-haspopup="menu" aria-expanded={!!position} disabled={!galleryAction && !canExport}
      onClick={() => position ? close() : open()} onKeyDown={event => {
        if (event.key === 'ArrowDown' && !position) { event.preventDefault(); open() }
      }}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        {[4, 10, 16].map(cx => <circle key={cx} cx={cx} cy="10" r="1.65"/>)}
      </svg>
    </button>
    {position && createPortal(<div ref={menu} role="menu" aria-label={label} className="en-export-menu"
      style={{ left: position.left, top: position.top }} onKeyDown={onMenuKey}>
      <button type="button" ref={exportItem} role="menuitem" aria-haspopup="menu" aria-expanded={branch} disabled={!canExport}
        onPointerEnter={event => { if (canExport && event.pointerType !== 'touch') showFormats(false) }}
        onKeyDown={event => {
          if (event.key === (position.opensLeft ? 'ArrowLeft' : 'ArrowRight')) { event.preventDefault(); showFormats(true) }
        }}
        onClick={() => showFormats(true)}>{t('导出', 'Export')}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"
          style={{ transform: position.opensLeft ? 'scaleX(-1)' : undefined }}>
          <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {galleryAction && <button type="button" role="menuitem" onPointerEnter={() => setBranch(false)}
        onClick={() => { close(true); galleryAction.run() }}>{galleryAction.label}</button>}
      {branch && <div className="en-export-menu en-note-format-menu" role="menu" ref={formats}
        aria-label={t('图像导出格式', 'Image export formats')} style={{ top: -1, ...(position.opensLeft ? { right: '100%' } : { left: '100%' }) }}>
        {(['png', 'jpg'] as const).map(format => <button key={format} type="button" role="menuitem"
          onClick={() => { close(true); exporting(format) }}>{format.toUpperCase()}</button>)}
      </div>}
    </div>, doc.body)}
  </>
}
