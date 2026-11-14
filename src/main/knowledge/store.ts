import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import { canAutomaticallyCollect, knowledgeFormat, maxEditableKnowledgeBytes, type KnowledgeDocument, type KnowledgeEdit, type KnowledgeFolder, type KnowledgeImportProgress, type KnowledgeImportResult, type KnowledgeSnapshot } from '../../shared/knowledge-library'
import { atomicWrite } from '../integrations/store'
import { copyResearchFile } from '../state/research-owned-files'

interface StoredDocument extends KnowledgeDocument {
  storageName: string
  origin?: string
}

interface LibraryState {
  version: 1
  documents: StoredDocument[]
  folders: KnowledgeFolder[]
  excludedOrigins: string[]
  recentSearches?: string[]
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
const initialState = (): LibraryState => ({ version: 1, documents: [], folders: [], excludedOrigins: [] })
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const hashBytes = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

function validatedName(value: unknown): string {
  if (typeof value !== 'string') throw Error('请输入名称。')
  const name = value.trim().normalize()
  if (!name || name.length > 255 || name === '.' || name === '..' || /[\\/\p{Cc}]/u.test(name)) {
    throw Error('请使用有效名称，最多 255 个字符。')
  }
  return name
}

function publicDocument({ storageName: _storage, origin: _origin, ...row }: StoredDocument): KnowledgeDocument {
  return row
}

function findFolder(state: LibraryState, id?: string) {
  if (id !== undefined && !state.folders.some(folder => folder.id === id)) throw Error('文件夹已不存在，请重新选择。')
}

export class KnowledgeStore {
  private readonly states = new Map<string, LibraryState>()
  private readonly queues = new Map<string, Promise<unknown>>()

  constructor(
    private readonly root: string,
    private readonly identity: () => { owner: string; generation: number },
    private readonly changed: () => void
  ) {}

  private directory(owner: string) {
    return join(this.root, digest(owner))
  }

  private async read(owner: string): Promise<LibraryState> {
    const cached = this.states.get(owner)
    if (cached) return cached
    let state: LibraryState
    try {
      const value = JSON.parse(await readFile(join(this.directory(owner), 'catalog.json'), 'utf8')) as LibraryState
      if (value?.version !== 1 || !Array.isArray(value.documents) || !Array.isArray(value.folders) ||
          !Array.isArray(value.excludedOrigins) || value.documents.some(row =>
            !row || !uuid.test(row.id) || typeof row.storageName !== 'string' || basename(row.storageName) !== row.storageName ||
            row.storageName === '.' || row.storageName === '..' || !row.storageName)) {
        throw Error('invalid knowledge catalog')
      }
      state = { ...value, recentSearches: Array.isArray(value.recentSearches)
        ? value.recentSearches.filter(term => typeof term === 'string' && term.length <= 400).slice(0, 6) : [] }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('知识库目录读取失败，原文件已保留。')
      state = initialState()
    }
    this.states.set(owner, state)
    return state
  }

  private async run<T>(action: (state: LibraryState, directory: string, current: () => void) => Promise<T>): Promise<T> {
    const identity = this.identity()
    const current = () => {
      const actual = this.identity()
      if (actual.owner !== identity.owner || actual.generation !== identity.generation) throw Error('当前账号已变化，请重试。')
    }
    const next = (this.queues.get(identity.owner) ?? Promise.resolve()).catch(() => {}).then(async () => {
      current()
      const state = await this.read(identity.owner)
      current()
      return action(state, this.directory(identity.owner), current)
    })
    this.queues.set(identity.owner, next)
    try { return await next }
    finally { if (this.queues.get(identity.owner) === next) this.queues.delete(identity.owner) }
  }

  private async persist(state: LibraryState, next: LibraryState, directory: string, current: () => void, notify = true) {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    current()
    await atomicWrite(join(directory, 'catalog.json'), JSON.stringify(next))
    Object.assign(state, next)
    if (notify) {
      try { this.changed() } catch { /* A closed window cannot roll back a committed catalog. */ }
    }
  }

  snapshot(): Promise<KnowledgeSnapshot> {
    return this.run(async state => ({
      documents: state.documents.map(publicDocument),
      folders: state.folders.map(folder => ({ ...folder }))
    }))
  }

  async recentSearches(): Promise<string[]> {
    return this.run(async state => [...(state.recentSearches ?? [])])
  }

  async rememberSearch(input: string): Promise<string[]> {
    const query = input.trim()
    if (!query || query.length > 400) throw Error('搜索词无效。')
    const key = (value: string) => value.normalize('NFKC').toLowerCase()
    return this.run(async (state, directory, current) => {
      const recent = state.recentSearches ?? []
      const searches = [query, ...recent.filter(value => key(value) !== key(query))].slice(0, 6)
      if (recent[0] !== query) await this.persist(state, { ...state, recentSearches: searches }, directory, current, false)
      return searches
    })
  }

  async file(id: string): Promise<{ document: KnowledgeDocument; path: string }> {
    return this.run(async (state, directory, current) => {
      const document = state.documents.find(row => row.id === id)
      if (!document) throw Error('文件已不存在。')
      const file = join(directory, 'files', document.id, document.storageName)
      const info = await stat(file).catch(() => undefined)
      current()
      if (!info?.isFile()) throw Error('文件内容无法读取。')
      return { document: publicDocument(document), path: file }
    })
  }

  async markdown(id: string): Promise<{ text: string; revision: string }> {
    return this.run(async (state, directory, current) => {
      const row = this.editableMarkdown(state, id)
      const bytes = await this.readMarkdown(join(directory, 'files', row.id, row.storageName))
      current()
      return { text: bytes.toString('utf8'), revision: hashBytes(bytes) }
    })
  }

  async saveMarkdown(id: string, revision: string, text: string, guard?: () => void) {
    const bytes = Buffer.from(text, 'utf8')
    if (bytes.length > maxEditableKnowledgeBytes) throw Error('Markdown 正文过大，无法保存。')
    return this.run(async (state, directory, identityCurrent) => {
      const current = () => { identityCurrent(); guard?.() }
      current()
      const row = this.editableMarkdown(state, id)
      const rowPath = join(directory, 'files', row.id)
      const oldPath = join(rowPath, row.storageName)
      const existing = await this.readMarkdown(oldPath)
      if (hashBytes(existing) !== revision) throw Error('文件已被修改，请重新打开后再保存。')
      const nextRevision = hashBytes(bytes)
      if (nextRevision === revision) return { document: publicDocument(row), revision }
      const storageName = randomUUID() + extname(row.storageName)
      const nextPath = join(rowPath, storageName)
      const updated = { ...row, storageName, size: bytes.length, updatedAt: Date.now() }
      try {
        await atomicWrite(nextPath, bytes)
        await this.persist(state, {
          ...state, documents: state.documents.map(item => item === row ? updated : item)
        }, directory, current)
      } catch (error) {
        await rm(nextPath, { force: true }).catch(() => {})
        throw error
      }
      return { document: publicDocument(updated), revision: nextRevision }
    })
  }

  private editableMarkdown(state: LibraryState, id: string) {
    const row = state.documents.find(document => document.id === id)
    if (!row) throw Error('文件已不存在。')
    if (knowledgeFormat(row.name) !== 'markdown') throw Error('此文件格式暂不支持在知识库中编辑。')
    if (row.share) throw Error('请先取消共享，再编辑文件正文。')
    return row
  }

  private async readMarkdown(path: string) {
    const file = await open(path, 'r')
    try {
      const { size, mtimeMs } = await file.stat()
      if (size > maxEditableKnowledgeBytes) throw Error('Markdown 正文过大，无法在知识库中编辑。')
      const bytes = Buffer.alloc(size)
      const { bytesRead } = await file.read({ buffer: bytes })
      const after = await file.stat()
      if (bytesRead !== size || after.size !== size || after.mtimeMs !== mtimeMs) throw Error('文件已被修改，请重新打开。')
      return bytes
    } finally { await file.close() }
  }

  async importFiles(paths: string[], folderId?: string, expected = this.identity()): Promise<KnowledgeImportResult> {
    if (paths.length > 64) throw Error('每次最多添加 64 个文件。')
    const result: KnowledgeImportResult = { added: [], failed: [] }
    for (const path of paths) {
      try {
        const actual = this.identity()
        if (expected.owner !== actual.owner || expected.generation !== actual.generation) throw Error('当前账号已变化，请重试。')
        const row = await this.importFile(path, folderId)
        result.added.push(row)
      } catch (error) {
        result.failed.push({ name: basename(path), message: error instanceof Error ? error.message : '文件添加失败。' })
      }
    }
    return result
  }

  async importFile(path: string, folderId?: string, transfer?: {
    signal?: AbortSignal
    progress?: (value: KnowledgeImportProgress) => void
  }): Promise<KnowledgeDocument> {
    const document = await this.importOne(path, { folderId, transfer })
    if (!document) throw Error('文件添加失败。')
    return document
  }

  collectGenerated(path: string, provenance: { sessionId: string; sessionTitle?: string; saved?: boolean }) {
    return this.importOne(path, provenance)
  }

  private importOne(path: string, options: {
    folderId?: string
    sessionId?: string
    sessionTitle?: string
    saved?: boolean
    transfer?: { signal?: AbortSignal; progress?: (value: KnowledgeImportProgress) => void }
  }) {
    return this.run(async (state, directory, identityCurrent) => {
      const current = () => { identityCurrent(); options.transfer?.signal?.throwIfAborted() }
      current()
      if (!isAbsolute(path)) throw Error('文件路径无效。')
      const source = await realpath(path)
      const name = basename(path)
      findFolder(state, options.folderId)
      const origin = options.sessionId ? digest(JSON.stringify([options.sessionId, source])) : undefined
      if (origin) {
        if (!options.saved && (!canAutomaticallyCollect(name) || state.excludedOrigins.includes(origin))) return
        const existing = state.documents.find(row => row.origin === origin)
        if (existing) {
          if (options.saved && !existing.saved || options.sessionTitle && options.sessionTitle !== existing.sessionTitle) {
            const updated = { ...existing, saved: existing.saved || options.saved === true,
              sessionTitle: options.sessionTitle ?? existing.sessionTitle }
            await this.persist(state, { ...state, documents: state.documents.map(row => row === existing ? updated : row) }, directory, current)
            return publicDocument(updated)
          }
          return publicDocument(existing)
        }
      }
      current()
      const id = randomUUID()
      const target = join(directory, 'files', id)
      try {
        const copied = await copyResearchFile(source, target, options.transfer)
        const info = await stat(copied)
        const row: StoredDocument = {
          id, name, storageName: basename(copied), size: info.size, updatedAt: Date.now(),
          source: options.sessionId ? 'generated' : 'upload', origin, folderId: options.folderId,
          sessionId: options.sessionId, sessionTitle: options.sessionTitle, saved: options.saved === true, starred: false
        }
        await this.persist(state, {
          ...state, documents: [...state.documents, row],
          excludedOrigins: state.excludedOrigins.filter(value => value !== origin)
        }, directory, current)
        return publicDocument(row)
      } catch (error) {
        await rm(target, { recursive: true, force: true }).catch(() => {})
        throw error
      }
    })
  }

  setSharing(id: string, publish: (document: KnowledgeDocument, path: string, current: () => void) => Promise<KnowledgeDocument['share']>) {
    return this.run(async (state, directory, current) => {
      const row = state.documents.find(document => document.id === id)
      if (!row) throw Error('文件已不存在。')
      const path = join(directory, 'files', row.id, row.storageName)
      const share = await publish(publicDocument(row), path, current)
      await this.persist(state, {
        ...state, documents: state.documents.map(item => item.id === id ? { ...item, share } : item)
      }, directory, current)
    })
  }

  edit(edit: KnowledgeEdit, guard?: () => void): Promise<void> {
    return this.run(async (state, directory, identityCurrent) => {
      const current = () => { identityCurrent(); guard?.() }
      current()
      if (edit.type === 'create-folder' || edit.type === 'rename-folder' || edit.type === 'remove-folder') {
        let folders = state.folders
        let documents = state.documents
        if (edit.type === 'remove-folder') {
          findFolder(state, edit.id)
          folders = folders.filter(folder => folder.id !== edit.id)
          documents = documents.map(row => row.folderId === edit.id ? { ...row, folderId: undefined } : row)
        } else {
          const name = validatedName(edit.name)
          const id = edit.type === 'rename-folder' ? edit.id : randomUUID()
          if (edit.type === 'rename-folder') findFolder(state, id)
          if (folders.some(folder => folder.id !== id && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw Error('已有同名文件夹。')
          folders = edit.type === 'rename-folder' ? folders.map(folder => folder.id === id ? { id, name } : folder) : [...folders, { id, name }]
        }
        await this.persist(state, { ...state, folders, documents }, directory, current)
        return
      }
      const row = state.documents.find(row => row.id === edit.id)
      if (!row) throw Error('文件已不存在。')
      if (edit.type === 'remove') {
        if (row.share) throw Error('请先取消共享，再从知识库删除。')
        await this.persist(state, {
          ...state, documents: state.documents.filter(item => item.id !== row.id),
          excludedOrigins: row.origin ? [...state.excludedOrigins, row.origin] : state.excludedOrigins
        }, directory, current)
        await rm(join(directory, 'files', row.id), { recursive: true, force: true }).catch(() => {})
        return
      }
      const updated = { ...row }
      switch (edit.type) {
        case 'rename': {
          const name = validatedName(edit.name)
          const extension = extname(row.name)
          if (extname(name).toLowerCase() !== extension.toLowerCase()) throw Error('重命名时请保留原文件扩展名。')
          updated.name = name
          break
        }
        case 'move':
          findFolder(state, edit.folderId)
          updated.folderId = edit.folderId
          break
        case 'save': updated.saved = edit.value; break
        case 'star': updated.starred = edit.value; break
      }
      await this.persist(state, { ...state, documents: state.documents.map(item => item.id === row.id ? updated : item) }, directory, current)
    })
  }
}
