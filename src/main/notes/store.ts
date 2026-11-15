import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, existsSync, readFileSync, renameSync, writeFileSync, unlinkSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import * as Y from 'yjs'
import type { NoteContent, NoteLoad, NoteSave, SavedNote, DraftNote } from '../../shared/workspace-notes'
const empty = (): SavedNote => ({ title: '', blocks: [], yjs: '', revision: 0, updatedAt: 0 })
type FileNote = { version: 1; saved: SavedNote; drafts: DraftNote[] }

/** Yjs observers run before transaction GC; equivalent updates can encode differently. */
function sameNoteContent(left: NoteContent, right: NoteContent): boolean {
  if (left.title !== right.title || JSON.stringify(left.blocks) !== JSON.stringify(right.blocks)) return false
  if (left.yjs === right.yjs) return true
  if (typeof left.yjs !== 'string' || typeof right.yjs !== 'string') return false
  const canonical = (update: string): string => {
    const doc = new Y.Doc()
    try {
      if (update) Y.applyUpdate(doc, Buffer.from(update, 'base64'))
      return Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64')
    } finally { doc.destroy() }
  }
  try { return canonical(left.yjs) === canonical(right.yjs) }
  catch { return false } // An undecodable recovery draft must remain available.
}
export function validateNoteContent(value: unknown): NoteContent {
  const c = value as NoteContent
  if (!c || typeof c.title !== 'string' || c.title.length > 1000 || !Array.isArray(c.blocks) || c.blocks.length > 10000 || typeof c.yjs !== 'string' || !/^[a-zA-Z0-9+/=]*$/.test(c.yjs)) throw Error('笔记格式无效。')
  const serialized = JSON.stringify(c)
  if (Buffer.byteLength(serialized) > 4 * 1024 * 1024) throw Error('笔记超过4 MiB，请拆分文档。')
  const visit = (blocks: any[], depth: number) => {
    if (depth > 32) throw Error('笔记层级过深。')
    for (const block of blocks) {
      if (!block || typeof block !== 'object' || typeof block.type !== 'string' || typeof block.id !== 'string' || block.id.length > 256) throw Error('笔记段落格式无效。')
      if (block.children !== undefined) { if (!Array.isArray(block.children)) throw Error('笔记段落格式无效。'); visit(block.children, depth + 1) }
    }
  }
  visit(c.blocks, 0)
  return JSON.parse(serialized)
}
export class NotesStore {
  constructor(private root: string) { mkdirSync(root, { recursive: true, mode: 0o700 }) }
  private path(owner: string, session: string): string {
    if (![owner, session].every(id => typeof id === 'string' && id.length > 0 && id.length <= 512)) throw Error('笔记身份无效。')
    return join(this.root, createHash('sha256').update(JSON.stringify([owner, session])).digest('hex') + '.json')
  }
  hasDocument(owner: string, session: string): boolean { return existsSync(this.path(owner, session)) }
  private read(owner: string, session: string): FileNote {
    const file = this.path(owner, session)
    if (!existsSync(file)) return { version: 1, saved: empty(), drafts: [] }
    if (!lstatSync(file).isFile() || lstatSync(file).size > 48 * 1024 * 1024) throw Error('笔记文件不可读取。')
    const data = JSON.parse(readFileSync(file, 'utf8')) as FileNote
    if (data.version !== 1 || !Number.isSafeInteger(data.saved?.revision) || !Array.isArray(data.drafts)) throw Error('笔记保存记录已损坏，请保留文件并重试。')
    validateNoteContent(data.saved)
    return data
  }
  private write(owner: string, session: string, data: FileNote): void {
    const file = this.path(owner, session), temporary = file + '.' + randomUUID() + '.tmp'
    try { writeFileSync(temporary, JSON.stringify(data), { flag: 'wx', mode: 0o600 }); renameSync(temporary, file) }
    finally { if (existsSync(temporary)) unlinkSync(temporary) }
  }
  load(owner: string, session: string): NoteLoad {
    const file = this.read(owner, session)
    const draft = file.drafts.filter(d => !sameNoteContent(d, file.saved)).sort((a, b) => b.updatedAt - a.updatedAt).at(0)
    return { saved: file.saved, ...(draft ? { draft } : {}) }
  }
  save(owner: string, session: string, revision: number, content: NoteContent, client?: string): NoteSave {
    const normalized = validateNoteContent(content), file = this.read(owner, session)
    if (revision !== file.saved.revision) return { status: 'conflict', saved: file.saved }
    file.saved = { ...normalized, revision: revision + 1, updatedAt: Date.now() }
    file.drafts = file.drafts.filter(d => d.clientId !== client || !sameNoteContent(d, normalized))
    this.write(owner, session, file)
    return { status: 'saved', saved: file.saved }
  }
  draft(owner: string, session: string, client: string, revision: number, content: NoteContent): void {
    if (typeof client !== 'string' || client.length > 128 || !Number.isSafeInteger(revision) || revision < 0) throw Error('草稿身份无效。')
    const normalized = validateNoteContent(content), file = this.read(owner, session)
    file.drafts = file.drafts.filter(d => d.clientId !== client)
    file.drafts.push({ ...normalized, clientId: client, baseRevision: revision, updatedAt: Date.now() })
    file.drafts = file.drafts.slice(-10)
    this.write(owner, session, file)
  }
  discardDraft(owner: string, session: string, clientId: string): void {
    const file = this.read(owner, session)
    file.drafts = file.drafts.filter(d => d.clientId !== clientId)
    this.write(owner, session, file)
  }
}
