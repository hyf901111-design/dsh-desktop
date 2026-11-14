import { readFile } from 'node:fs/promises'
import type { CollaborationClient } from '../collaboration-client'
import { knowledgeSharedCategories, type KnowledgeDocument, type KnowledgeSnapshot } from '../../shared/knowledge-library'

const maxBytes = 25 * 1024 * 1024

interface SharedCard {
  id: string
  name: string
  size: number
  updatedAt: number
  source: KnowledgeDocument['source']
  category: string
  owner: string
}
type Cursor = { at: number; after: string }

export class KnowledgeSharing {
  private cache?: { generation: number; promise: Promise<KnowledgeDocument[]>; expires: number }

  constructor(private readonly options: {
    client: CollaborationClient
    authenticated: () => boolean
  }) {}

  private async load(signal?: AbortSignal) {
    let cursor: Cursor | null = null
    const rows: KnowledgeDocument[] = []
    const generation = this.options.client.generation()
    do {
      signal?.throwIfAborted()
      const result: { documents: SharedCard[]; next: Cursor | null } = await this.options.client.request({
        kind: 'knowledge.list', ...(cursor ?? {})
      }, signal)
      for (const doc of result.documents) {
        if (!/^[a-f0-9]{32}$/u.test(doc.id) || !Number.isSafeInteger(doc.size) ||
            doc.size < 0 || doc.size > maxBytes || !Number.isFinite(doc.updatedAt) || typeof doc.name !== 'string') continue
        rows.push({ id: doc.id, name: doc.name, size: doc.size, updatedAt: doc.updatedAt, source: doc.source,
          saved: false, starred: false, received: { owner: doc.owner, category: doc.category } })
      }
      cursor = result.next
    } while (cursor && generation === this.options.client.generation())
    if (generation !== this.options.client.generation()) throw Error('账号已变化，请重新打开知识库。')
    return rows
  }

  async received(force = false, signal?: AbortSignal): Promise<KnowledgeDocument[]> {
    if (!this.options.authenticated()) throw Error('请登录后查看他人共享。')
    const generation = this.options.client.generation()
    const cached = this.cache
    if (!signal && !force && cached?.generation === generation && cached.expires > Date.now()) return cached.promise
    if (signal) return this.load(signal)
    const promise = this.load()
    this.cache = { generation, promise, expires: Date.now() + 10_000 }
    try { return await promise }
    catch (error) {
      if (this.cache?.promise === promise) this.cache = undefined
      throw error
    }
  }

  async snapshot(local: KnowledgeSnapshot, force = false, signal?: AbortSignal): Promise<KnowledgeSnapshot> {
    return { ...local, documents: [...local.documents, ...await this.received(force, signal)] }
  }

  async publish(document: KnowledgeDocument, path: string, category: string, current: () => void) {
    if (!this.options.authenticated()) throw Error('请登录后共享文件。')
    if (!knowledgeSharedCategories.some(value => value === category)) throw Error('请选择共享分类。')
    if (document.size > maxBytes) throw Error('共享文件最大为 25 MB。')
    const data = await readFile(path)
    if (data.byteLength !== document.size) throw Error('文件大小已变化，请重新添加文件。')
    current()
    const result = await this.options.client.request<{ id: string; category: string }>({
      kind: 'knowledge.publish', id: document.id, name: document.name, category,
      source: document.source, size: data.byteLength, data: new Uint8Array(data)
    })
    if (!/^[a-f0-9]{32}$/u.test(result.id) || result.category !== category) throw Error('共享服务未返回有效的文件标识。')
    return result
  }

  async revoke(id: string) {
    if (!this.options.authenticated()) throw Error('请登录后取消共享。')
    await this.options.client.request({ kind: 'knowledge.revoke', id })
  }

  async read(id: string, signal?: AbortSignal) {
    if (!this.options.authenticated()) throw Error('请登录后读取共享文件。')
    let rows = await this.received(false, signal)
    let document = rows.find(row => row.id === id)
    if (!document) {
      rows = await this.received(true, signal)
      document = rows.find(row => row.id === id)
    }
    if (!document) throw Error('该文件已取消共享或不可用。')
    return this.readListed(document, signal)
  }

  // Only callers holding an authorized catalog row can skip the catalog lookup.
  // The server still checks the current share before returning any bytes.
  async readListed(document: KnowledgeDocument, signal?: AbortSignal) {
    if (!this.options.authenticated()) throw Error('请登录后读取共享文件。')
    const generation = this.options.client.generation()
    let response: Response
    try { response = await this.options.client.request<Response>({ kind: 'knowledge.file', id: document.id }, signal) }
    catch (error) {
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        this.cache = undefined
        throw Error('该文件已取消共享或不可用。')
      }
      throw error
    }
    if (Number(response.headers.get('content-length')) !== document.size) {
      await response.body?.cancel()
      this.cache = undefined
      throw Error('共享文件已更新，请刷新后重试。')
    }
    const reader = response.body?.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    if (reader) {
      try {
        for (;;) {
          signal?.throwIfAborted()
          const value = await reader.read()
          if (value.done) break
          size += value.value.byteLength
          if (size > document.size) throw Error('共享文件响应超出预期大小。')
          chunks.push(value.value)
        }
      } finally { await reader.cancel().catch(() => {}) }
    }
    if (generation !== this.options.client.generation()) throw Error('当前账号已变化，请重试。')
    if (size !== document.size) throw Error('共享文件尚未完整接收，请重试。')
    return { document, data: Buffer.concat(chunks, size) }
  }
}
