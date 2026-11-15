import { useEffect, useState } from 'react'
import { listKnowledgeDocuments, type KnowledgeDocument, type KnowledgeFilter, type KnowledgeSnapshot } from '../../shared/knowledge-library'
import { knowledgeSessionLabels, type KnowledgeSessionEntry, type KnowledgeSessionMode } from '../../shared/knowledge-sessions'

export type KnowledgeListRow = KnowledgeDocument & {
  publishedSession?: { entry: KnowledgeSessionEntry; mode: KnowledgeSessionMode }
}

export function usePublishedKnowledgeSessions(document: Document, snapshot: KnowledgeSnapshot, active: boolean) {
  const [entries, setEntries] = useState<KnowledgeSessionEntry[]>([])
  const needsCatalog = active && Object.values(snapshot.sessionShares ?? {}).some(share => !share.title)
  useEffect(() => {
    if (!needsCatalog) return
    let requestId: string
    const request = () => {
      requestId = crypto.randomUUID()
      document.dispatchEvent(new CustomEvent('sherlock:knowledge-session-catalog-request', {
        cancelable: true, detail: { requestId }
      }))
    }
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; entries: KnowledgeSessionEntry[] }>).detail
      if (detail?.requestId === requestId) setEntries(detail.entries)
    }
    const reset = () => setEntries([])
    document.addEventListener('sherlock:knowledge-session-catalog', receive)
    document.addEventListener('sherlock:knowledge-sessions-changed', request)
    document.addEventListener('sherlock:knowledge-identity-changed', reset)
    request()
    return () => {
      reset()
      document.removeEventListener('sherlock:knowledge-session-catalog', receive)
      document.removeEventListener('sherlock:knowledge-sessions-changed', request)
      document.removeEventListener('sherlock:knowledge-identity-changed', reset)
    }
  }, [document, needsCatalog])

  if (!active) return []
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  return Object.entries(snapshot.sessionShares ?? {}).flatMap(([key, share]): KnowledgeListRow[] => {
    const separator = key.indexOf(':')
    const mode = key.slice(0, separator) as KnowledgeSessionMode
    const id = key.slice(separator + 1)
    if (separator < 0 || !id || !Object.hasOwn(knowledgeSessionLabels, mode)) return []
    const original = byId.get(id)
    const title = share.title ?? original?.title ?? knowledgeSessionLabels[mode] + '会话'
    const updatedAt = share.publishedAt ?? original?.updatedAt ?? 0
    const entry = { id, title, updatedAt }
    return [{
      id: share.id, name: title, source: 'generated', size: share.size ?? 0, updatedAt,
      saved: false, starred: false, share, publishedSession: { entry, mode }
    }]
  })
}

export function listKnowledgeRows(snapshot: KnowledgeSnapshot, filter: KnowledgeFilter, published: KnowledgeListRow[]) {
  const documents: KnowledgeListRow[] = filter.category === 'shared' && !filter.formats?.length
    ? [...snapshot.documents, ...published] : snapshot.documents
  return listKnowledgeDocuments({ ...snapshot, documents }, filter)
}
