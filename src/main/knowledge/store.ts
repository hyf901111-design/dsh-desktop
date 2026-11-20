import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { link, mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import { canAutomaticallyCollect, knowledgeFormat, maxEditableKnowledgeBytes, type KnowledgeDocument, type KnowledgeEdit, type KnowledgeFolder, type KnowledgeImportProgress, type KnowledgeImportResult, type KnowledgeSnapshot } from '../../shared/knowledge-library'
import { atomicWrite } from '../integrations/store'
import type { KnowledgeSessionShare } from '../../shared/knowledge-sessions'
import { maximumCanvasImageBytes, type CanvasRead, type StoredCanvas } from '../../shared/image-factory-canvas'
import { copyResearchFile } from '../state/research-owned-files'

interface StoredDocument extends KnowledgeDocument {
  storageName: string
  origin?: string
  /** Null when Markdown has been edited in the library. */
  sourceVersion?: string | null
}

interface LibraryState {
  version: 1
  documents: StoredDocument[]
  folders: KnowledgeFolder[]
  excludedOrigins: string[]
  historicalScanRevisions?: Record<string, string>
  recentSearches?: string[]
  sessionShares?: Record<string, KnowledgeSessionShare>
}

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u
const initialState = (): LibraryState => ({ version: 1, documents: [], folders: [], excludedOrigins: [] })
const digest = (text: string) => createHash('sha256').update(text).digest('hex')
const hashBytes = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

async function generatedVersion(path: string) {
  const info = await stat(path)
  if (!info.isFile()) throw Error('只能收录文件。')
  return JSON.stringify([info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs])
}

async function hashFile(path: string) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function validatedName(value: unknown): string {
  if (typeof value !== 'string') throw Error('请输入名称。')
  const name = value.trim().normalize()
  if (!name || name.length > 255 || name === '.' || name === '..' || /[\\/\p{Cc}]/u.test(name)) {
    throw Error('请使用有效名称，最多 255 个字符。')
  }
  return name
}

function factoryFilename(documents: readonly KnowledgeDocument[], suggestion: string) {
  const stem = suggestion.replace(/[\\/\p{Cc}]/gu, ' ').trim().normalize().slice(0, 120) || '生成图片'
  const occupied = new Set(documents.map(row => row.name.normalize().toLowerCase()))
  let name = stem + '.png'
  for (let suffix = 2; occupied.has(name.toLowerCase()); suffix++) name = stem + '（' + suffix + '）.png'
  return name
}

function publicDocument({ storageName: _storage, origin: _origin, sourceVersion, ...row }: StoredDocument): KnowledgeDocument {
  return row.imageProject || sourceVersion === 'factory-canvas' || sourceVersion === 'factory-provider'
    ? { ...row, generatedBy: 'image-factory' }
    : row
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
      folders: state.folders.map(folder => ({ ...folder })),
      ...(state.sessionShares ? { sessionShares: { ...state.sessionShares } } : {})
    }))
  }

  async updateSessionShare(key: string, change: (
    previous: KnowledgeSessionShare | undefined, current: () => void
  ) => Promise<KnowledgeSessionShare | undefined>) {
    await this.run(async (state, directory, current) => {
      const shares = { ...state.sessionShares }
      const share = await change(shares[key], current)
      if (share) shares[key] = share
      else delete shares[key]
      await this.persist(state, { ...state, sessionShares: shares }, directory, current)
    })
    return this.snapshot()
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

  savePresentation(id: string, path: string, version: string, bytes: Buffer, guard: () => void) {
    return this.run(async (state, directory, identityCurrent) => {
      const current = () => { identityCurrent(); guard() }
      const row = state.documents.find(document => document.id === id)
      if (!row || row.share || extname(row.name).toLowerCase() !== '.pptx' ||
          await realpath(join(directory, 'files', row.id, row.storageName)) !== path) {
        throw Error('PPT 文件已变化或已共享，请重新打开。')
      }
      if (await hashFile(path) !== version) return false
      const backup = path + '.previous-' + randomUUID()
      const updated = { ...row, size: bytes.length, updatedAt: Math.max(Date.now(), row.updatedAt + 1),
        sourceVersion: row.origin ? null : undefined }
      await link(path, backup)
      try {
        current()
        await atomicWrite(path, bytes)
        try {
          await this.persist(state, {
            ...state, documents: state.documents.map(item => item === row ? updated : item)
          }, directory, current)
        } catch (error) {
          await rename(backup, path)
          throw error
        }
        return true
      } finally { await rm(backup, { force: true }).catch(() => {}) }
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
      const updated = { ...row, storageName, size: bytes.length, updatedAt: Math.max(Date.now(), row.updatedAt + 1),
        sourceVersion: row.origin ? null : undefined }
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

  ensurePresentationGuideSource(name: string, folderName: string, bytes: Buffer) {
    return this.run(async (state, directory, current) => {
      const origin = digest('bundled-presentation-guide:' + hashBytes(bytes))
      const folder = state.folders.find(item => item.name === folderName) ?? { id: randomUUID(), name: folderName }
      for (const row of state.documents) {
        if (row.origin !== origin || row.folderId !== folder.id || row.name !== name) continue
        const path = join(directory, 'files', row.id, row.storageName)
        if (await hashFile(path).catch(() => '') === hashBytes(bytes)) return { folderId: folder.id, fileId: row.id }
      }
      const id = randomUUID(), target = join(directory, 'files', id)
      const row: StoredDocument = {
        id, name, storageName: name, origin, folderId: folder.id, source: 'upload',
        saved: false, starred: false, size: bytes.length, updatedAt: Date.now()
      }
      current()
      await mkdir(target, { recursive: true })
      try {
        await atomicWrite(join(target, name), bytes)
        await this.persist(state, {
          ...state, documents: [...state.documents, row],
          folders: state.folders.includes(folder) ? state.folders : [...state.folders, folder]
        }, directory, current)
      } catch (error) {
        await rm(target, { recursive: true, force: true })
        throw error
      }
      return { folderId: folder.id, fileId: id }
    })
  }

  historicalScanRevisions() {
    return this.run(async state => ({ ...state.historicalScanRevisions }))
  }

  saveHistoricalScanRevisions(revisions: Record<string, string>, check: () => void) {
    return this.run(async (state, directory, current) => {
      await this.persist(state, {
        ...state, historicalScanRevisions: { ...state.historicalScanRevisions, ...revisions }
      }, directory, () => { current(); check() }, false)
    })
  }

  collectGenerated(path: string, provenance: { sessionId: string; sessionTitle?: string; saved?: boolean; updatedAt?: number }) {
    return this.importOne(path, provenance)
  }

  saveImageProject(bytes: Buffer, snapshot: Pick<CanvasRead, 'image'> & { canvas: StoredCanvas },
    scope: NonNullable<KnowledgeDocument['imageProject']>['scope'], guard: () => void) {
    return this.run(async (state, directory, identityCurrent) => {
      const current = () => { identityCurrent(); guard() }
      current()
      const { canvas, image } = snapshot
      const origin = digest('image-project:' + canvas.id)
      const existing = state.documents.find(row => row.origin === origin)
      const id = existing?.id ?? randomUUID()
      const storageName = randomUUID() + '.png'
      const target = join(directory, 'files', id)
      const path = join(target, storageName)
      const row: StoredDocument = {
        id, origin, source: 'generated', saved: false, starred: false,
        name: factoryFilename(state.documents, canvas.title), ...existing,
        sessionId: scope ?? undefined, updatedAt: Math.max(Date.now(), (existing?.updatedAt ?? 0) + 1),
        storageName, size: bytes.length, imageProject: { canvasId: canvas.id, scope },
      }
      const removeRevision = async (file: string) => {
        await Promise.all([file, file + '.canvas', file + '.original'].map(path => rm(path, { force: true }).catch(() => {})))
      }
      try {
        await mkdir(target, { recursive: true, mode: 0o700 })
        current()
        await atomicWrite(path, bytes)
        await atomicWrite(path + '.canvas', JSON.stringify(canvas))
        if (image) await atomicWrite(path + '.original', image.data)
        await this.persist(state, {
          ...state, documents: existing ? state.documents.map(item => item === existing ? row : item) : [...state.documents, row],
          excludedOrigins: state.excludedOrigins.filter(value => value !== origin),
        }, directory, current)
      } catch (error) {
        await removeRevision(path)
        throw error
      }
      if (existing) await removeRevision(join(target, existing.storageName))
      return publicDocument(row)
    })
  }

  imageProject(id: string) {
    return this.run(async (state, directory, current) => {
      const row = state.documents.find(item => item.id === id)
      if (!row?.imageProject) throw Error('图像工程已不存在。')
      const path = join(directory, 'files', row.id, row.storageName)
      const readBounded = async (file: string, limit: number) => {
        const info = await stat(file)
        if (!info.isFile() || info.size > limit) throw Error('已保存的图像工程无法读取。')
        return readFile(file)
      }
      const canvas = JSON.parse((await readBounded(path + '.canvas', 320 * 1024)).toString('utf8')) as StoredCanvas
      if (canvas?.id !== row.imageProject.canvasId || !Array.isArray(canvas.layers)) throw Error('已保存的图像工程无法读取。')
      const asset = canvas.layers.find(layer => layer.kind === 'image')
      const image = asset ? { data: await readBounded(path + '.original', maximumCanvasImageBytes), mediaType: asset.mediaType } : undefined
      current()
      return { canvas, image, revision: row.storageName }
    })
  }

  linkImageProject(id: string, revision: string, scope: string, guard: () => void) {
    return this.run(async (state, directory, current) => {
      const row = state.documents.find(item => item.id === id)
      if (!row?.imageProject || row.storageName !== revision) return false
      const updated = { ...row, sessionId: scope, imageProject: { ...row.imageProject, scope } }
      await this.persist(state, {
        ...state, documents: state.documents.map(item => item === row ? updated : item),
      }, directory, () => { current(); guard() }, false)
      return true
    })
  }

  private importOne(path: string, options: {
    folderId?: string
    sessionId?: string
    sessionTitle?: string
    saved?: boolean
    updatedAt?: number
    transfer?: { signal?: AbortSignal; progress?: (value: KnowledgeImportProgress) => void }
  }) {
    return this.run(async (state, directory, identityCurrent) => {
      const current = () => { identityCurrent(); options.transfer?.signal?.throwIfAborted() }
      current()
      if (!isAbsolute(path)) throw Error('文件路径无效。')
      const source = await realpath(path)
      current()
      const name = basename(path)
      findFolder(state, options.folderId)
      const origin = options.sessionId ? digest(JSON.stringify([options.sessionId, source])) : undefined
      if (origin && !options.saved && (!canAutomaticallyCollect(name) || state.excludedOrigins.includes(origin))) return
      const existing = origin ? state.documents.find(row => row.origin === origin) : undefined
      const id = existing?.id ?? randomUUID()
      const target = join(directory, 'files', id)
      // Older catalogs used the original basename for collected bytes and a UUID for library edits.
      const canRefresh = !existing || (!existing.share && (existing.sourceVersion === undefined
        ? existing.storageName === basename(source) : existing.sourceVersion !== null))
      const sourceVersion = origin && canRefresh ? await generatedVersion(source) : undefined
      const saved = existing?.saved || options.saved === true
      const sessionTitle = options.sessionTitle ?? existing?.sessionTitle
      if (existing) {
        let refresh = sourceVersion !== undefined && sourceVersion !== existing.sourceVersion
        if (refresh && existing.sourceVersion === undefined) {
          const previousPath = join(target, existing.storageName)
          const [currentHash, previousHash] = await Promise.all([hashFile(source), hashFile(previousPath)])
          refresh = currentHash !== previousHash
          if (!refresh && await generatedVersion(source) !== sourceVersion) {
            throw Error('文件在收录期间发生变化，请重试。')
          }
        }
        if (!refresh) {
          current()
          const metadataChanged = saved !== existing.saved || sessionTitle !== existing.sessionTitle
          const updated = { ...existing, saved, sessionTitle, sourceVersion: sourceVersion ?? existing.sourceVersion }
          if (metadataChanged || updated.sourceVersion !== existing.sourceVersion) {
            await this.persist(state, { ...state, documents: state.documents.map(row => row === existing ? updated : row) },
              directory, current, metadataChanged)
          }
          return publicDocument(updated)
        }
      }
      current()
      let copied: string | undefined
      try {
        copied = await copyResearchFile(source, target, options.transfer)
        const info = await stat(copied)
        if (sourceVersion !== undefined && await generatedVersion(source) !== sourceVersion) {
          throw Error('文件在收录期间发生变化，请重试。')
        }
        const row: StoredDocument = {
          id, name, source: origin ? 'generated' : 'upload', origin, folderId: options.folderId,
          sessionId: options.sessionId, starred: false,
          ...existing, saved, sessionTitle, sourceVersion, storageName: basename(copied), size: info.size,
          updatedAt: Math.max(options.updatedAt ?? Date.now(), (existing?.updatedAt ?? 0) + 1)
        }
        await this.persist(state, {
          ...state, documents: existing ? state.documents.map(item => item === existing ? row : item) : [...state.documents, row],
          excludedOrigins: state.excludedOrigins.filter(value => value !== origin)
        }, directory, current)
        return publicDocument(row)
      } catch (error) {
        if (!existing) await rm(target, { recursive: true, force: true }).catch(() => {})
        else if (copied && copied !== source) await rm(copied, { force: true }).catch(() => {})
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

  edit(edit: KnowledgeEdit, options?: {
    guard?: () => void
    renameShare?: (id: string, name: string) => Promise<void>
  }): Promise<void> {
    return this.run(async (state, directory, identityCurrent) => {
      const current = () => { identityCurrent(); options?.guard?.() }
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
          const extension = extname(row.name.trim())
          if (extname(name).toLowerCase() !== extension.toLowerCase()) throw Error('重命名时请保留原文件扩展名。')
          if (row.share) {
            if (!options?.renameShare) throw Error('当前无法更新共享文件名。')
            current()
            await options.renameShare(row.share.id, name)
          }
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
      // Once a remote rename commits, finish updating the originating catalog
      // even if the initiating turn is cancelled while the request is in flight.
      await this.persist(state, { ...state, documents: state.documents.map(item => item.id === row.id ? updated : item) },
        directory, edit.type === 'rename' && row.share ? identityCurrent : current)
    })
  }
}
