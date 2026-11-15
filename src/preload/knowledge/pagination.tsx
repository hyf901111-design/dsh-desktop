import React, { useLayoutEffect, useRef, useState } from 'react'

const pageSize = 20

export function useKnowledgePagination<T extends HTMLElement>(total: number) {
  const [requestedPage, setRequestedPage] = useState(1)
  const scrollRef = useRef<T>(null)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(requestedPage, pages)

  useLayoutEffect(() => {
    if (requestedPage > pages) {
      setRequestedPage(pages)
      if (scrollRef.current) scrollRef.current.scrollTop = 0
    }
  }, [pages, requestedPage])

  function setPage(next: number) {
    setRequestedPage(next)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }

  return { page, pages, setPage, scrollRef, start: (page - 1) * pageSize, end: page * pageSize }
}

export function KnowledgePagination({ label, page, pages, setPage }: {
  label: string
  page: number
  pages: number
  setPage: (page: number) => void
}) {
  const [invalid, setInvalid] = useState(false)
  const shake = useRef<Animation | null>(null)
  const start = Math.max(2, Math.min(page - 2, pages - 5))
  const end = Math.min(pages - 1, start + 4)
  const shortcuts = pages <= 7
    ? Array.from({ length: pages }, (_, index) => index + 1)
    : [1, ...(start > 2 ? ['before'] : []), ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
      ...(end < pages - 1 ? ['after'] : []), pages]

  return <nav className="knowledge-pagination" aria-label={label}>
    <div className="knowledge-pagination-controls">
      <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button>
      {pages === 1 ? <span>1 / 1</span> : shortcuts.map(item => typeof item === 'number'
        ? <button key={item} type="button" className="knowledge-pagination-number" aria-label={`第 ${item} 页`}
          aria-current={item === page ? 'page' : undefined} onClick={() => setPage(item)}>{item}</button>
        : <span key={item} aria-hidden="true">…</span>)}
      <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>下一页</button>
    </div>
    {pages > 1 && <form className="knowledge-pagination-jump" noValidate onSubmit={event => {
      event.preventDefault()
      const form = event.currentTarget
      const input = form.elements.namedItem('page') as HTMLInputElement
      shake.current?.cancel()
      if (!input.validity.valid) {
        setInvalid(true)
        input.focus({ preventScroll: true })
        if (!input.ownerDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          shake.current = input.animate(
            [0, -5, 5, -3, 3, 0].map(offset => ({ transform: `translateX(${offset}px)` })),
            { duration: 260, easing: 'ease-out' }
          )
        }
        return
      }
      setInvalid(false)
      setPage(input.valueAsNumber)
      form.reset()
    }}>
      <label><span>跳至</span><input type="number" inputMode="numeric" name="page" min={1} max={pages} required
        aria-label="跳至页码" aria-invalid={invalid || undefined} onChange={() => setInvalid(false)} /></label>
      <button type="submit">跳转</button>
    </form>}
  </nav>
}
