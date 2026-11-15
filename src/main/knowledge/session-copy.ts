import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import type { SharedKnowledgeSession } from '../../shared/knowledge-sessions'
import type { NotesStore } from '../notes/store'
import type { SpreadsheetStore } from '../spreadsheet/store'
import type { ResearchCanvasStorage } from '../state/research-canvas-storage'
import type { Rpc } from '../scheduled/task-runner'

type Workspace = { workspaceId: string; sessionIds: string[] }

export function createKnowledgeSessionCopier(options: {
  rpc: Rpc
  notes: NotesStore
  workbooks: SpreadsheetStore
  research: ResearchCanvasStorage
  fallbackWorkspacePath: string
}) {
  const { rpc, notes, workbooks, research } = options
  return async (owner: string, source: SharedKnowledgeSession, fromSession: string | undefined, check: () => void) => {
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
    const title = Array.from(source.title).slice(0, 105).join('') + '（副本）'
    const undo: Array<() => void> = []
    const write = (key: string, value: string) => {
      if (!research.setItem(key, value)) throw Error('副本布局无法保存，请检查本地存储后重试。')
      undo.push(() => research.removeItem(key))
    }
    const discard = () => {
      for (const cleanup of undo.reverse()) {
        try { cleanup() } catch { /* Preserve the registration error. */ }
      }
    }

    try {
      // A session becomes visible only after its complete content is ready.
      write('ework.session.view.v1:' + sessionId, source.mode)
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
      }
      check()
    } catch (error) {
      discard()
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
          discard()
          throw error
        }
        if (!catalog) throw error
      }
    }
    check()
    const named = await rpc('session.rename', { sessionId, title }).then(() => true, () => false)
    check()
    return { id: sessionId, mode: source.mode, named }
  }
}
