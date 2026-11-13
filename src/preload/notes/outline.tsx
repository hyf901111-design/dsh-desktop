import { noteUiText as t } from '../../../packages/dsh-research-task-runtime/notes-locale.js'
import React, { useEffect, useId, useRef, useState } from 'react'

type Heading = { id: string; text: string; level: number }
type Props = { headings: Heading[]; active: string; onLocate(id: string): void }

/** A non-modal outline; opening it never participates in document layout. */
export function NotesOutline({ headings, active, onLocate }: Props) {
  const [open, setOpen] = useState(false), id = useId(), container = useRef<HTMLElement>(null), trigger = useRef<HTMLButtonElement>(null)
  const close = () => { setOpen(false); trigger.current?.focus() }
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() } }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [open])
  return <aside className="en-toc" ref={container}>
    <button type="button" className="en-toc-trigger" ref={trigger} aria-label={open ? t("收起目录") : t("展开目录")} title={open ? t("收起目录") : t("展开目录")} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16M10 12h10m-10 7h10M4 9v10h2m-2-7h2"/></svg>
    </button>
    {open ? <div className="en-toc-popover" id={id} role="dialog" aria-label={t("文档目录")}>
      <div className="en-toc-heading"><span>{t("目录")}</span></div>
      <nav aria-label={t("文档目录")}>{headings.length ? headings.map(h => <button key={h.id} data-ui-preserve="" data-active={h.id === active} style={{ paddingLeft: 8 + Math.max(0,h.level-Math.min(...headings.map(heading=>heading.level))) * 12 }} title={h.text} onClick={() => { onLocate(h.id); close() }}>{h.text}</button>) : null}</nav>
    </div> : null}
  </aside>
}
