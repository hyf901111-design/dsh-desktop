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
  return <nav className="knowledge-pagination" aria-label={label}>
    <button type="button" disabled={page === 1} onClick={() => setPage(page - 1)}>上一页</button>
    <span aria-live="polite">{page} / {pages}</span>
    <button type="button" disabled={page === pages} onClick={() => setPage(page + 1)}>下一页</button>
  </nav>
}
