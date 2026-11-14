import React, { useId, useRef, useState } from 'react'
import { KnowledgeIcon } from './icons'

export function FileSearch({ query, shared, recent, change, remember }: {
  query: string
  shared: boolean
  recent: string[]
  change(query: string): void
  remember(query: string): void
}) {
  const [expanded, setExpanded] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const typed = useRef<string>()
  const id = useId()
  const open = expanded && !query && recent.length > 0

  function commit(value: string) {
    const term = value.trim()
    if (term) remember(term)
    typed.current = undefined
    setExpanded(false)
  }

  return <div className="knowledge-search-wrap" onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget)) return
    if (typed.current === query) commit(query)
    else setExpanded(false)
  }} onKeyDown={event => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      input.current?.focus()
      setExpanded(false)
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || query || !recent.length) return
    event.preventDefault()
    setExpanded(true)
    requestAnimationFrame(() => {
      const options = Array.from(menu.current?.querySelectorAll('button') ?? [])
      const current = options.indexOf(event.target as HTMLButtonElement)
      const direction = event.key === 'ArrowDown' ? 1 : -1
      const next = current === -1 ? (direction === 1 ? 0 : options.length - 1) : current + direction
      if (next < 0 || next >= options.length) input.current?.focus()
      else options[next]?.focus()
    })
  }}>
    <div className="knowledge-search">
      <KnowledgeIcon name="search" />
      <input ref={input} aria-label="搜索文件" aria-controls={open ? id : undefined}
        placeholder={shared ? '搜索他人共享…' : '搜索文件…'} value={query} maxLength={400}
        onFocus={() => setExpanded(true)}
        onChange={event => {
          typed.current = event.currentTarget.value
          change(event.currentTarget.value)
          setExpanded(true)
        }}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing || !query.trim()) return
          event.preventDefault()
          commit(query)
        }} />
      <button type="button" className="knowledge-search-clear" aria-label="清除搜索" title="清除搜索" disabled={!query}
        onClick={() => {
          if (typed.current === query) commit(query)
          change('')
          input.current?.focus()
          setExpanded(true)
        }}><KnowledgeIcon name="close" /></button>
    </div>
    {open && <div className="knowledge-popup knowledge-search-recent" role="group" aria-label="最近搜索" id={id} ref={menu}>
      <span aria-hidden="true">最近搜索</span>
      {recent.map(term => <button key={term} type="button" title={term}
        onClick={() => { input.current?.focus(); change(term); commit(term) }}>{term}</button>)}
    </div>}
  </div>
}
