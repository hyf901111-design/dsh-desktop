import type { KnowledgeDocument } from '../../shared/knowledge-library'
import { sharedKnowledgeSessionFile } from '../../shared/knowledge-sessions'
import React, { useEffect, useState } from 'react'
import { knowledgeSessionLabels, knowledgeSessionShareKey, type KnowledgeSessionEntry, type KnowledgeSessionEvidence,
  type KnowledgeSessionMode, type KnowledgeSessionShare } from '../../shared/knowledge-sessions'
import { KnowledgeIcon, KnowledgeItemIcon } from './icons'

export function useKnowledgeSessions(document: Document, mode: KnowledgeSessionMode | undefined,
  evidenceFor: (mode: KnowledgeSessionMode, ids: string[]) => Promise<KnowledgeSessionEvidence[]>) {
  const [result, setResult] = useState<{ mode: KnowledgeSessionMode; entries: KnowledgeSessionEntry[] }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!mode) {
      setResult(undefined)
      setLoading(false)
      setError(false)
      return
    }
    const win = document.defaultView!
    let latest = 0, requestId = '', queued = 0
    const received = async (event: Event) => {
      const snapshot = (event as CustomEvent<{ requestId: string; entries: KnowledgeSessionEntry[] }>).detail
      if (snapshot?.requestId !== requestId) return
      const sequence = latest
      try {
        const candidates = snapshot.entries.filter(entry => mode === 'research' || !entry.researchBoard)
        const evidence = await evidenceFor(mode, candidates.map(entry => entry.id))
        if (sequence !== latest) return
        const populated = new Set(evidence.filter(item => item.hasContent).map(item => item.id))
        const entries = candidates.filter(entry => populated.has(entry.id))
          .sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title))
        setResult({ mode, entries })
        setLoading(false)
      } catch {
        if (sequence === latest) { setError(true); setLoading(false) }
      }
    }
    const load = () => {
      requestId = crypto.randomUUID()
      latest++
      setLoading(true)
      setError(false)
      const unhandled = document.dispatchEvent(new win.CustomEvent('sherlock:knowledge-session-catalog-request', {
        cancelable: true, detail: { requestId }
      }))
      if (unhandled) setLoading(false)
    }
    const schedule = () => {
      if (queued) return
      queued = win.requestAnimationFrame(() => { queued = 0; load() })
    }
    const reset = () => { latest++; setResult(undefined); schedule() }
    document.addEventListener('sherlock:knowledge-session-catalog', received)
    document.addEventListener('sherlock:knowledge-sessions-changed', schedule)
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    load()
    return () => {
      latest++
      win.cancelAnimationFrame(queued)
      document.removeEventListener('sherlock:knowledge-session-catalog', received)
      document.removeEventListener('sherlock:knowledge-sessions-changed', schedule)
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
    }
  }, [mode, document, evidenceFor])

  return { entries: result?.mode === mode ? result?.entries ?? [] : [], loading, error }
}

export function openKnowledgeSession(document: Document, id: string, view: KnowledgeSessionMode | 'chat', retained = false): Promise<boolean> {
  const win = document.defaultView!
  return new Promise(resolve => {
    const requestId = crypto.randomUUID()
    const complete = (ok: boolean) => {
      win.clearTimeout(timer)
      document.removeEventListener('sherlock:knowledge-source-result', reply)
      resolve(ok)
    }
    const reply = (event: Event) => {
      const result = (event as CustomEvent<{ requestId: string; ok: boolean }>).detail
      if (result?.requestId === requestId) complete(result.ok === true)
    }
    const timer = win.setTimeout(() => complete(false), 8000)
    document.addEventListener('sherlock:knowledge-source-result', reply)
    if (document.dispatchEvent(new win.CustomEvent('sherlock:knowledge-source-open', {
      detail: { id, requestId, view, retained }, cancelable: true
    }))) complete(false)
  })
}

export function KnowledgeSessionDirectory({ mode, entries, loading, error, open, shares, share }: {
  mode: KnowledgeSessionMode
  entries: KnowledgeSessionEntry[]
  loading: boolean
  error: boolean
  open: (id: string, mode: KnowledgeSessionMode) => Promise<boolean>
  shares?: Record<string, KnowledgeSessionShare>
  share: (row: KnowledgeSessionEntry, mode: KnowledgeSessionMode) => void
}) {
  const [query, setQuery] = useState('')
  const [opening, setOpening] = useState<string>()
  const [failed, setFailed] = useState(false)
  const needle = query.trim().toLocaleLowerCase()
  const rows = entries.filter(entry => !needle || `${entry.title}\n${entry.workspace ?? ''}`.toLocaleLowerCase().includes(needle))

  return <main className="knowledge-file-list knowledge-session-directory" aria-label={knowledgeSessionLabels[mode]}>
    <div className="knowledge-tools">
      <h2>{knowledgeSessionLabels[mode]}</h2>
      <label className="knowledge-search"><KnowledgeIcon name="search" />
        <input type="search" aria-label="搜索会话" placeholder="搜索会话…" value={query}
          onChange={event => setQuery(event.currentTarget.value)} />
      </label>
    </div>
    {failed && <p role="alert">此会话暂时无法打开。</p>}
    {error && <p className={rows.length ? undefined : 'knowledge-empty'} role="alert">暂时无法读取会话。</p>}
    {loading && !rows.length && <p className="knowledge-empty" role="status">正在读取会话…</p>}
    {!loading && !error && !rows.length && <p className="knowledge-empty">{needle ? '没有符合搜索条件的会话。' : '这里还没有会话。'}</p>}
    {rows.length > 0 && <ul className="knowledge-session-rows" aria-label="会话列表">
      {rows.map(row => {
        const published = shares?.[knowledgeSessionShareKey(mode, row.id)]
        const action = published ? '管理共享' : '共享会话'
        return <li key={row.id}>
          <button className="knowledge-session-open" type="button" title={row.title} disabled={!!opening}
            aria-busy={opening === row.id}
            onClick={async () => {
              setOpening(row.id)
              setFailed(false)
              const ok = await open(row.id, mode)
              setOpening(undefined)
              setFailed(!ok)
            }}>
            <KnowledgeItemIcon format={mode} tile />
            <span className="knowledge-session-title"><span>{row.title}</span>{row.workspace && <small>{row.workspace}</small>}</span>
            {published && <span className="knowledge-tag" data-kind="share">已共享</span>}
            {row.updatedAt > 0 && <time dateTime={new Date(row.updatedAt).toISOString()}>{new Date(row.updatedAt).toLocaleDateString()}</time>}
            <KnowledgeIcon name="next" />
          </button>
          <button className="knowledge-square knowledge-session-share" type="button" title={action}
            aria-label={`${action}「${row.title}」`} onClick={() => share(row, mode)}><KnowledgeIcon name="shared" /></button>
        </li>
      })}
    </ul>}
  </main>
}

export function openSharedKnowledgeSession(document: Document, row: KnowledgeDocument) {
  if (!row.received || !sharedKnowledgeSessionFile(row.name, row.source)) return false
  document.dispatchEvent(new CustomEvent('sherlock:knowledge-open-shared-session', { detail: row }))
  return true
}
