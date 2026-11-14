import { randomUUID } from 'node:crypto'
import type { KnowledgeDocument, KnowledgeFilter, KnowledgeFolder } from '../../shared/knowledge-library'

export type KnowledgeViewAction =
  | { action: 'inspect' }
  | { action: 'filter'; revision: string; filter: KnowledgeFilter }
  | { action: 'undo'; revision: string }

export interface KnowledgeViewResult {
  revision: string
  filter: KnowledgeFilter
  section: 'files' | 'memory'
  count: number
  documents: KnowledgeDocument[]
  folders: KnowledgeFolder[]
}

export type KnowledgeViewMessage = (KnowledgeViewAction & { id: string }) | { action: 'cancel'; id: string }

export class KnowledgeViewBridge {
  private readonly pending = new Map<string, {
    resolve(value: KnowledgeViewResult): void
    reject(error: Error): void
  }>()

  constructor(private send: (value: KnowledgeViewMessage) => void) {}

  run(action: KnowledgeViewAction, signal?: AbortSignal): Promise<KnowledgeViewResult> {
    signal?.throwIfAborted()
    if (this.pending.size >= 16) throw Error('知识库正在处理其他操作。')
    const id = randomUUID()
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener('abort', cancel)
        clearTimeout(timer)
        this.pending.delete(id)
      }
      const fail = (message: string) => {
        finish()
        try { this.send({ action: 'cancel', id }) } catch { /* The window has already closed. */ }
        reject(Error(message))
      }
      const cancel = () => fail('知识库操作已取消。')
      const timer = setTimeout(() => fail('知识库列表未确认，请查看当前界面后重试。'), 4000)
      this.pending.set(id, {
        resolve(value) { finish(); resolve(value) },
        reject(error) { finish(); reject(error) }
      })
      signal?.addEventListener('abort', cancel, { once: true })
      try { this.send({ ...action, id }) }
      catch {
        finish()
        reject(Error('知识库工作区不可用。'))
      }
    })
  }

  reply(value: { id?: string; error?: string; result?: KnowledgeViewResult }) {
    const pending = value?.id && this.pending.get(value.id)
    if (!pending) return
    if (typeof value.error === 'string') pending.reject(Error(value.error.slice(0, 600)))
    else if (typeof value.result?.revision === 'string' && value.result.filter &&
      ['files', 'memory'].includes(value.result.section) && Number.isSafeInteger(value.result.count) &&
      Array.isArray(value.result.documents) && Array.isArray(value.result.folders)) pending.resolve(value.result)
    else pending.reject(Error('知识库未返回有效的列表状态。'))
  }
}
