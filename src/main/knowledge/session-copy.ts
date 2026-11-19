import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { knowledgeSessionLabels, type KnowledgeSessionMode, type SharedKnowledgeSession } from '../../shared/knowledge-sessions'
import type { NotesStore } from '../notes/store'
import type { SpreadsheetStore } from '../spreadsheet/store'
import type { ResearchCanvasStorage } from '../state/research-canvas-storage'
import type { ImageFactoryCanvases } from '../state/image-factory-canvases'
import type { StoredCanvas } from '../../shared/image-factory-canvas'
import type { Rpc } from '../scheduled/task-runner'

type Workspace = { workspaceId: string; sessionIds: string[] }
type RetainCopy = (id: string, title: string, existing?: boolean, imported?: boolean) => Promise<void>
export type KnowledgeSessionSeed = SharedKnowledgeSession | {
  mode: 'notes'; title: string; note: Pick<import('../../shared/workspace-notes').NoteContent, 'title' | 'blocks'>
} | {
  mode: 'image-factory'; title: string; epoch: number
} & ({ canvas: StoredCanvas; image?: Uint8Array } | { image: Uint8Array; width: number; height: number })
const copySuffix = '（副本）'

export function knowledgeCopyRetention(runtimeUrl: () => string | undefined): RetainCopy {
  return async (sessionId, title, existing, imported) => {
    const base = runtimeUrl()
    if (!base) throw Error('会话服务尚未就绪，请稍后重试。')
    const url = new URL('/sherlock/knowledge/session-copy', base)
    const result = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: url.origin },
      body: JSON.stringify({ sessionId, title, existing, imported }), signal: AbortSignal.timeout(10_000)
    })
    const response = await result.json() as { ok?: boolean; error?: string }
    if (!result.ok || response.ok !== true) throw Error(response.error || '副本会话尚未保存，请重试。')
  }
}

// Recover copies saved by the client that registered them as blank sessions.
export async function retainExistingKnowledgeCopies({ rpc, retain, getMode, hasContent, check }: {
  rpc: Rpc; retain: RetainCopy; getMode(id: string): string | null
  hasContent(id: string, mode: KnowledgeSessionMode): boolean; check(): boolean
}) {
  const { items } = await rpc<{ items: SessionSummary[] }>('session.list', {})
  const copies = items.flatMap(item => {
    const { sessionId, blank, origin, parentSessionId } = item
    const title = item.projections?.values.title
    if (!blank || origin === 'subagent' || parentSessionId || typeof title !== 'string' ||
        !title.endsWith(copySuffix) || !/^session-[a-f0-9-]{36}$/u.test(sessionId)) return []
    const mode = getMode(sessionId)
    return mode && Object.hasOwn(knowledgeSessionLabels, mode) && hasContent(sessionId, mode as KnowledgeSessionMode)
      ? [{ sessionId, title }]
      : []
  })
  if (!copies.length || !check()) return
  const { items: workspaces, archivedSessionIds = [] } = await rpc<{ items: Workspace[]; archivedSessionIds?: string[] }>('workspace.list', {})
  const archived = new Set(archivedSessionIds)
  for (const { sessionId, title } of copies) {
    if (!check()) return
    const workspace = workspaces.find(item => item.sessionIds.includes(sessionId))
    if (!workspace || archived.has(sessionId)) continue
    try {
      await rpc('session.create', { sessionId, workspaceId: workspace.workspaceId })
      if (!check()) return
      await retain(sessionId, title, true)
    } catch (error) {
      console.warn('[knowledge] unable to recover a saved copy', error)
    }
  }
}

export function createKnowledgeSessionCopier(options: {
  rpc: Rpc
  retain: RetainCopy
  notes: NotesStore
  workbooks: SpreadsheetStore
  research: ResearchCanvasStorage
  canvases: ImageFactoryCanvases
  fallbackWorkspacePath: string
}) {
  const { rpc, retain, notes, workbooks, research, canvases } = options
  return async <Seed extends KnowledgeSessionSeed>(owner: string, source: Seed, fromSession: string | undefined, check: () => void, imported = false):
    Promise<{ id: string; mode: Seed['mode'] }> => {
    const { items } = await rpc<{ items: Workspace[] }>('workspace.list', {})
    check()
    let workspace = items.find(item => fromSession && item.sessionIds.includes(fromSession)) ?? items[0]
    if (!workspace) {
      await mkdir(options.fallbackWorkspacePath, { recursive: true, mode: 0o700 })
      check()
      workspace = (await rpc<{ workspace: Workspace }>('workspace.create', { path: options.fallbackWorkspacePath })).workspace
      check()
    }
    const sessionId = 'session-' + randomUUID()
    const title = Array.from(source.title).slice(0, 105).join('') + (imported ? '' : copySuffix)
    const undo: Array<() => void | Promise<void>> = []
    const write = (key: string, value: string) => {
      if (!research.setItem(key, value)) throw Error('副本布局无法保存，请检查本地存储后重试。')
      undo.push(() => research.removeItem(key))
    }
    const discard = async () => {
      for (const cleanup of undo.reverse()) {
        try { await cleanup() } catch { /* Preserve the registration error. */ }
      }
    }

    try {
      // A session becomes visible only after its complete content is ready.
      write('sherlock.knowledge.copy-title.v1:' + sessionId, title)
      write('ework.session.view.v1:' + sessionId, source.mode === 'image-factory' ? 'chat' : source.mode)
      switch (source.mode) {
        case 'research':
          write('sherlock.research.canvas.files.v1:' + sessionId, JSON.stringify(source.canvas.files))
          write('sherlock.research.canvas.artifacts.v1:' + sessionId, JSON.stringify(source.canvas.artifacts))
          for (const [prefix, suffix, value] of source.layout ?? []) write(prefix + sessionId + suffix, value)
          break
        case 'notes':
          undo.push(() => notes.remove(owner, sessionId))
          if (notes.save(owner, sessionId, 0, {
            title: source.note.title, blocks: source.note.blocks, yjs: ''
          }).status !== 'saved') throw Error('笔记副本无法保存。')
          break
        case 'spreadsheet': {
          const key = { owner, sessionId }
          undo.push(() => workbooks.remove(key))
          workbooks.create(key, 0, { ...source.workbook, id: randomUUID() })
          break
        }
        case 'image-factory': {
          const { image, epoch } = source
          undo.push(() => canvases.discardStaged(sessionId, epoch))
          if ('canvas' in source) {
            const { editedInSession: _sourceEdit, ...canvas } = source.canvas
            await canvases.write({ scope: sessionId, epoch, image, canvas: { ...canvas, title } })
          } else {
            const id = randomUUID()
            await canvases.write({ scope: sessionId, epoch, image, canvas: {
              version: 1, id, title, width: source.width, height: source.height, layers: [
                { kind: 'image', id: randomUUID(), assetId: id, mediaType: 'image/png' }
              ]
            } })
          }
          break
        }
      }
      check()
    } catch (error) {
      await discard()
      throw error
    }

    const target = { sessionId, workspaceId: workspace.workspaceId }
    try {
      await rpc('session.create', target)
    } catch (error) {
      // The host can register a supplied ID before the response fails. Retry
      // that same ID, and only discard the content if the host confirms absence.
      try {
        check()
        await rpc('session.create', target)
      } catch {
        const catalog = await rpc<{ items: { sessionId: string }[] }>('session.list', {}).catch(() => undefined)
        if (catalog && !catalog.items.some(item => item.sessionId === sessionId)) {
          await discard()
          throw error
        }
        if (!catalog) throw error
      }
    }
    check()
    try {
      await retain(sessionId, title, undefined, imported || undefined)
    } catch {
      check()
      await rpc('session.create', target)
      check()
      await retain(sessionId, title, undefined, imported || undefined)
    }
    check()
    return { id: sessionId, mode: source.mode }
  }
}
