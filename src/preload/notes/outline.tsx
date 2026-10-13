import React, { useEffect, useId, useRef, useState } from 'react'
import collapse from '../../../build/notes/toc-collapse.svg?inline'

type Heading = { id: string; text: string; level: number }
type Props = { title: string; headings: Heading[]; active: string; onLocate(id: string): void; onTop(): void }

/** A non-modal outline; opening it never participates in document layout. */
export function NotesOutline({ title, headings, active, onLocate, onTop }: Props) {
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
    <button className="en-toc-trigger" ref={trigger} aria-label={open ? '收起目录' : '展开目录'} title={open ? '收起目录' : '展开目录'} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><img src={collapse} width="16" height="16" alt="" /><span>目录</span></button>
    {open ? <div className="en-toc-popover" id={id} role="dialog" aria-label="文档目录">
      <div className="en-toc-heading"><span>目录</span><button aria-label="关闭目录" title="关闭目录" onClick={close}><img src={collapse} width="16" height="16" alt="" /></button></div>
      <nav aria-label="文档目录"><button className="en-toc-title" onClick={() => { onTop(); close() }}>{title || '无标题文档'}</button>{headings.length ? headings.map(h => <button key={h.id} data-active={h.id === active} style={{ paddingLeft: 8 + (h.level - 1) * 16 }} title={h.text} onClick={() => { onLocate(h.id); close() }}>{h.text}</button>) : <p className="en-toc-empty">添加标题后显示目录</p>}</nav>
    </div> : null}
  </aside>
}
