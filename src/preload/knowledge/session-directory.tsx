import React, { useEffect, useState } from 'react'
import { knowledgeSessionLabels, type KnowledgeSessionEntry, type KnowledgeSessionEvidence, type KnowledgeSessionMode } from '../../shared/knowledge-sessions'
import { KnowledgeIcon } from './icons'

type SessionRow = KnowledgeSessionEntry & { modes: KnowledgeSessionMode[] }
const modes = Object.keys(knowledgeSessionLabels) as KnowledgeSessionMode[]

export function useKnowledgeSessions(document: Document, active: boolean, evidenceFor: (ids: string[]) => Promise<KnowledgeSessionEvidence[]>) {
  const [entries, setEntries] = useState<SessionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!active) {
      setEntries([])
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
        const ids = snapshot.entries.map(entry => entry.id)
        const evidence = new Map((await evidenceFor(ids)).map(item => [item.id, item]))
        if (sequence !== latest) return
        setEntries(snapshot.entries.map(entry => {
          const record = evidence.get(entry.id)
          const rawView = record?.preferredView ?? entry.localView
          const view = rawView === 'trajectory' ? 'spreadsheet' : rawView
          return { ...entry, modes: modes.filter(mode => mode === 'research' && entry.researchBoard
            || !entry.researchBoard && (view === mode || record?.[mode])) }
        }).sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title)))
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
    const reset = () => { latest++; setEntries([]); schedule() }
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
  }, [active, document, evidenceFor])

  return { entries, loading, error }
}

export function openKnowledgeSession(document: Document, id: string, view: KnowledgeSessionMode | 'chat'): Promise<boolean> {
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
      detail: { id, requestId, view }, cancelable: true
    }))) complete(false)
  })
}

export function KnowledgeSessionDirectory({ mode, entries, loading, error, open }: {
  mode: KnowledgeSessionMode
  entries: SessionRow[]
  loading: boolean
  error: boolean
  open: (id: string, mode: KnowledgeSessionMode) => Promise<boolean>
}) {
  const [query, setQuery] = useState('')
  const [opening, setOpening] = useState<string>()
  const [failed, setFailed] = useState(false)
  const needle = query.trim().toLocaleLowerCase()
  const rows = entries.filter(entry => entry.modes.includes(mode) &&
    (!needle || `${entry.title}\n${entry.workspace ?? ''}`.toLocaleLowerCase().includes(needle)))
  const icon = mode === 'research' ? 'research' : mode === 'notes' ? 'note' : 'table'

  return <main className="knowledge-file-list knowledge-session-directory" aria-label={knowledgeSessionLabels[mode]}>
    <div className="knowledge-tools">
      <h2>{knowledgeSessionLabels[mode]}</h2>
      <label className="knowledge-search"><KnowledgeIcon name="search" />
        <input type="search" aria-label="搜索会话" placeholder="搜索会话…" value={query}
          onChange={event => setQuery(event.currentTarget.value)} />
      </label>
    </div>
    {failed && <p role="alert">此会话暂时无法打开。</p>}
    {error && <p role="alert">暂时无法读取会话。</p>}
    {loading && !rows.length && <p role="status">正在读取会话…</p>}
    {!loading && !error && !rows.length && <p className="knowledge-session-empty">{needle ? '没有符合搜索条件的会话。' : '这里还没有会话。'}</p>}
    {rows.length > 0 && <ul className="knowledge-session-rows" aria-label="会话列表">
      {rows.map(row => <li key={row.id}><button type="button" title={row.title} disabled={!!opening}
        aria-busy={opening === row.id}
        onClick={async () => {
          setOpening(row.id)
          setFailed(false)
          const ok = await open(row.id, mode)
          setOpening(undefined)
          setFailed(!ok)
        }}>
        <KnowledgeIcon name={icon} />
        <span className="knowledge-session-title"><span>{row.title}</span>{row.workspace && <small>{row.workspace}</small>}</span>
        {row.updatedAt > 0 && <time dateTime={new Date(row.updatedAt).toISOString()}>{new Date(row.updatedAt).toLocaleDateString()}</time>}
        <KnowledgeIcon name="next" />
      </button></li>)}
    </ul>}
  </main>
}
