import { sharedKnowledgeSessionFile } from '../../shared/knowledge-sessions'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, realpath, rm } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { ResearchFilePreviewRegistry, type ResearchPreviewAuthorizationRecord } from '../state/research-file-preview'
import type { PptxEditIdentity } from '../pptx/service'
import { maxEditableKnowledgeBytes, type KnowledgeDocument } from '../../shared/knowledge-library'
import type { KnowledgeSharing } from './sharing'
import type { KnowledgeStore } from './store'

type Identity = { owner: string; generation: number }
type Grant = {
  document: KnowledgeDocument
  path: string
  directory?: string
  identity: Identity
  scope: string
  authorizationId?: string
  openedAt: number
}

const textMime = /^(text\/|application\/json)/u
const maxOpenFiles = 48

export class KnowledgeFilePreview {
  private readonly grants = new Map<string, Grant>()
  private queue: Promise<unknown> = Promise.resolve()
  readonly registry = new ResearchFilePreviewRegistry({
    storage: { load: () => [], save: () => true },
    authorizeManagedFile: record => this.authorize(record)
  })

  constructor(
    private readonly directory: string,
    private readonly identity: () => Identity,
    private readonly store: KnowledgeStore,
    private readonly sharing: KnowledgeSharing
  ) {}

  private current(identity: Identity) {
    const now = this.identity()
    return identity.owner === now.owner && identity.generation === now.generation
  }

  private async authorize(record: ResearchPreviewAuthorizationRecord) {
    const grant = this.grants.get(record.sessionId)
    if (!grant || !this.current(grant.identity) || grant.path !== record.path ||
        grant.authorizationId !== record.authorizationId || grant.document.id !== record.nodeId) return false
    const allowed = grant.document.received
      ? await this.sharing.canReadVersion(grant.document, AbortSignal.timeout(9000))
      : await this.store.file(grant.document.id).then(async file => await realpath(file.path) === grant.path, () => false)
    return allowed && this.current(grant.identity) && this.grants.get(record.sessionId) === grant
  }

  private async remove(grant: Grant) {
    this.grants.delete(grant.scope)
    this.registry.revokeSession(grant.scope)
    if (grant.directory) await rm(grant.directory, { recursive: true, force: true }).catch(() => {})
  }

  reset() {
    const operation = this.queue.then(async () => {
      for (const grant of this.grants.values()) {
        if (!this.current(grant.identity)) await this.remove(grant)
      }
    })
    this.queue = operation.catch(() => {})
  }

  open(id: string, sessionId: string) {
    const identity = this.identity()
    const operation = this.queue.then(() => this.openCurrent(id, sessionId, identity))
    this.queue = operation.catch(() => {})
    return operation
  }

  async editSource(identity: PptxEditIdentity) {
    const grant = this.grants.get(identity.sessionId)
    if (!grant || grant.authorizationId !== identity.authorizationId ||
        grant.document.id !== identity.nodeId || grant.document.received || !this.current(grant.identity)) return null
    try {
      const file = await this.store.file(grant.document.id)
      if (file.document.share || await realpath(file.path) !== grant.path || !this.current(grant.identity) ||
          this.grants.get(grant.scope) !== grant) return null
      return { path: grant.path, root: dirname(grant.path) }
    } catch { return null }
  }

  async resolveCapability(url: string) {
    const candidate = await this.registry.resolvePptxEditSource(url)
    return candidate && await this.editSource(candidate.identity) ? candidate : null
  }

  async savePresentation(identity: PptxEditIdentity, path: string, version: string, bytes: Buffer) {
    const grant = this.grants.get(identity.sessionId)
    const check = () => {
      if (!grant || this.grants.get(grant.scope) !== grant ||
          !this.current(grant.identity)) throw Error('PPT 文件授权已变化，请重新打开。')
    }
    if ((await this.editSource(identity))?.path !== path) throw Error('PPT 文件无法编辑。')
    check()
    return this.store.savePresentation(identity.nodeId, path, version, bytes, check)
  }

  async annotationSource(id: string) {
    const identity = this.identity()
    try {
      const file = await this.store.file(id)
      if (file.document.share || !/\.pptx$/i.test(file.document.name)) return null
      const path = await realpath(file.path)
      return this.current(identity) ? { path, root: dirname(path) } : null
    } catch { return null }
  }

  async status(id: string, updatedAt: unknown) {
    const identity = this.identity()
    const received = id.length === 32
    try {
      const document = received
        ? (await this.sharing.received(true, AbortSignal.timeout(9000))).find(row => row.id === id)
        : (await this.store.file(id)).document
      if (!document || !this.current(identity)) return null
      if (received && document.updatedAt === updatedAt && !await this.sharing.canReadVersion(document, AbortSignal.timeout(9000))) return null
      return this.current(identity) ? document : null
    } catch { return null }
  }

  private async openCurrent(id: string, sessionId: string, identity: Identity) {
    const check = () => {
      if (!this.current(identity)) throw Error('当前账号已变化，请重新打开文件。')
    }
    check()
    const scope = 'knowledge-preview:' + createHash('sha256').update(JSON.stringify([identity.owner, identity.generation, sessionId, id])).digest('hex')
    const received = id.length === 32
    const previous = this.grants.get(scope)
    const file = received ? await this.sharing.read(id, AbortSignal.timeout(15000)) : await this.store.file(id)
    check()
    const document = file.document
    if (received && sharedKnowledgeSessionFile(document.name, document.source)) throw Error('请在知识库中打开对应的只读会话。')
    const editablePresentation = !received && !document.share && /\.pptx$/i.test(document.name)
    if (previous?.authorizationId && 'path' in file && await realpath(file.path) === previous.path) {
      const descriptor = await this.registry.restore({ sessionId: scope, nodeId: id, authorizationId: previous.authorizationId })
      check()
      if (descriptor) {
        previous.openedAt = Date.now()
        return { document, kind: 'media' as const, url: descriptor.url, contentType: descriptor.contentType, editablePresentation }
      }
    }
    if (previous) await this.remove(previous)
    const directory = 'data' in file ? join(this.directory, scope.slice('knowledge-preview:'.length)) : undefined
    const path = 'data' in file ? join(directory!, 'file' + extname(document.name).toLowerCase().replace(/[^.a-z0-9]/gu, '')) : file.path
    try {
      if ('data' in file) {
        await mkdir(directory!, { recursive: true, mode: 0o700 })
        await writeFile(path, file.data, { mode: 0o600 })
      }
      check()
      const canonical = await realpath(path)
      const descriptor = await this.registry.admitManaged({ sessionId: scope, nodeId: id, path: canonical })
      check()
      if (!descriptor) return { document, kind: 'binary' as const }
      if (textMime.test(descriptor.contentType)) {
        const bytes = 'data' in file ? file.data : await readFile(path)
        check()
        this.registry.revokeSession(scope)
        const revision = !received && !document.share && bytes.length <= maxEditableKnowledgeBytes && /\.(md|markdown)$/i.test(document.name)
          ? createHash('sha256').update(bytes).digest('hex') : undefined
        return { document, kind: 'text' as const, revision, text: bytes.toString('utf8').replace(/^\uFEFF/u, '') }
      }
      if (this.grants.size >= maxOpenFiles) {
        const oldest = [...this.grants.values()].sort((a, b) => a.openedAt - b.openedAt)[0]
        if (oldest) await this.remove(oldest)
      }
      const grant = { document, path: canonical, identity, directory, scope, authorizationId: descriptor.authorizationId, openedAt: Date.now() }
      this.grants.set(scope, grant)
      return { document, kind: 'media' as const, url: descriptor.url, contentType: descriptor.contentType, editablePresentation }
    } finally {
      if (!this.grants.has(scope)) {
        this.registry.revokeSession(scope)
        if (directory) await rm(directory, { recursive: true, force: true }).catch(() => {})
      }
    }
  }
}
