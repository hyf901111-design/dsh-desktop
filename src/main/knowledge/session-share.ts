import { createHash } from 'node:crypto'
import { freezeSnapshot, validateCanvas, type Canvas } from 'dsh-research-collaboration/document'
import { knowledgeSessionShareKey, sharedKnowledgeSessionFile, legacyKnowledgeSessionMessage,
  type KnowledgeSessionMode, type SharedKnowledgeSession } from '../../shared/knowledge-sessions'
import type { NoteContent, SavedNote } from '../../shared/workspace-notes'
import { validateWorkbook, type Workbook } from '../../shared/spreadsheet/workbook'
import { noteHasContent, researchHasContent, workbookHasContent } from './session-content'

type Snapshot =
  | { mode: 'research'; canvas: { files: unknown[]; artifacts: unknown[] }; readLayout?(prefix: string, suffix: string): string | null }
  | { mode: 'notes'; note: NoteContent & { updatedAt?: number } }
  | { mode: 'spreadsheet'; workbook: Workbook | null }

const cleanTitle = (title: unknown) => typeof title === 'string' ? title.replace(/[\\/\p{Cc}]/gu, ' ').trim().slice(0, 120) : ''
const privateKey = /^(?:__proto__|prototype|constructor|path|filePath|localPath|sessionId|sourceSessionId|previewSessionId|token|accessToken|apiKey|password|authorization|authorizationId|credentials|refreshScheduleId|generationTaskId|generationChildSessionId|leaseToken|executorId)$/iu
const privateUrl = /^(?:file:|blob:|dsh-[\w-]+:|[A-Za-z]:[\\/]|\/(?:Users|home|private|tmp|var)\/|https?:\/\/(?:localhost|127\.|\[::1\]))/iu

// Keep saved document data, without copying the originating editor's grants,
// temporary jobs or local paths into another user's desktop.
function portableContent(value: unknown, depth = 0): unknown {
  if (depth > 48) throw Error('共享会话的内容嵌套过深。')
  if (Array.isArray(value)) return value.map(item => portableContent(item, depth + 1))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKey.test(key)).map(([key, item]) => {
      if (key === 'payload' && typeof item === 'string' && item.startsWith('{')) {
        return [key, JSON.stringify(portableContent(JSON.parse(item), depth + 1))]
      }
      return [key, portableContent(item, depth + 1)]
    }))
  }
  return typeof value === 'string' && privateUrl.test(value) ? '' : value
}

export function knowledgeSessionShareId(mode: KnowledgeSessionMode, sessionId: string): string {
  const bytes = createHash('sha256').update('knowledge-session-share\0' + knowledgeSessionShareKey(mode, sessionId)).digest('hex')
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-4${bytes.slice(13, 16)}-8${bytes.slice(17, 20)}-${bytes.slice(20, 32)}`
}

const viewPrefixes = new Set([
  'sherlock.research.canvas.viewport.v1:', 'ework.research.grid.v1:',
  'ework.research.presentation.v1:', 'ework.research.tabs.view.v1:'
])
type ResearchLayout = NonNullable<Extract<SharedKnowledgeSession, { mode: 'research' }>['layout']>

function readResearchLayout(canvas: Canvas, read: NonNullable<Extract<Snapshot, { mode: 'research' }>['readLayout']>) {
  const values: ResearchLayout = []
  const add = (prefix: string, suffix = '') => {
    const raw = read(prefix, suffix)
    if (raw) values.push([prefix, suffix, JSON.stringify(portableContent(JSON.parse(raw)))])
  }
  for (const prefix of viewPrefixes) add(prefix)
  for (const node of canvas.artifacts) {
    const spec = node.containerSpec as { type?: string; tabs?: { id?: string }[] } | undefined
    if (spec?.type !== 'board-tabs' || !Array.isArray(spec.tabs)) continue
    for (const tab of spec.tabs) if (/^[-\w:.]{1,128}$/u.test(tab.id ?? '')) {
      add('ework.research.grid.v1:', ':tabs:' + node.id + ':' + tab.id)
    }
  }
  return values
}

export function createKnowledgeSessionSnapshot(input: Snapshot, sessionTitle: string) {
  const documentTitle = input.mode === 'notes' ? input.note.title : input.mode === 'spreadsheet' ? input.workbook?.name : undefined
  const title = cleanTitle(sessionTitle) || cleanTitle(documentTitle) || '未命名会话'
  const header = { title, version: 1 as const }
  let session: SharedKnowledgeSession
  if (input.mode === 'spreadsheet' && input.workbook && workbookHasContent(input.workbook)) {
    const workbook = portableContent(input.workbook)
    validateWorkbook(workbook)
    session = { ...header, mode: input.mode, workbook }
  } else if (input.mode === 'notes' && noteHasContent(input.note)) {
    // BlockNote's saved blocks retain formatting and the component layout. The
    // Yjs update also contains revision history and editor-only collaboration state.
    const note = { title: input.note.title || title, blocks: portableContent(input.note.blocks) as SavedNote['blocks'],
      yjs: '', revision: 0, updatedAt: input.note.updatedAt ?? 0 }
    session = { ...header, mode: input.mode, note }
  } else if (input.mode === 'research' && researchHasContent(input.canvas)) {
    const canvas = freezeSnapshot({ canvas: portableContent(input.canvas) as Canvas }).canvas
    session = { ...header, mode: input.mode, canvas, layout: input.readLayout && readResearchLayout(canvas, input.readLayout) }
  } else {
    throw Error('此会话暂无可共享的保存内容。')
  }
  return { name: title + '.ework-session-' + input.mode, data: Buffer.from(JSON.stringify(session)) }
}

export function readKnowledgeSessionSnapshot(document: { name: string; source: string }, data: Buffer): SharedKnowledgeSession {
  const kind = sharedKnowledgeSessionFile(document.name, document.source)
  if (kind?.legacy) throw Error(legacyKnowledgeSessionMessage)
  if (!kind) throw Error('此条目没有可查看的共享会话。')
  try {
    const value = portableContent(JSON.parse(data.toString('utf8'))) as SharedKnowledgeSession
    if (!value || value.version !== 1 || value.mode !== kind.mode || value.title !== kind.title) throw Error()
    switch (value.mode) {
      case 'research':
        validateCanvas(value.canvas)
        if (value.layout !== undefined) {
          if (!Array.isArray(value.layout) || value.layout.length > 1000) throw Error()
          value.layout = value.layout.map(item => {
            if (!Array.isArray(item) || !viewPrefixes.has(item[0]) ||
                !(item[1] === '' || item[0] === 'ework.research.grid.v1:' && /^:tabs:[-\w:.]{1,257}$/u.test(item[1])) ||
                typeof item[2] !== 'string') throw Error()
            return [item[0], item[1], JSON.stringify(portableContent(JSON.parse(item[2])))]
          })
        }
        break
      case 'spreadsheet': validateWorkbook(value.workbook); break
      case 'notes':
        if (!Array.isArray(value.note?.blocks) || typeof value.note.title !== 'string' || value.note.yjs !== '' ||
            !Number.isFinite(value.note.updatedAt)) throw Error()
        value.note = { title: value.note.title, blocks: value.note.blocks, yjs: '', revision: 0, updatedAt: value.note.updatedAt }
        break
    }
    return value
  } catch {
    throw Error('共享会话格式无法读取，请发布者重新发布。')
  }
}
