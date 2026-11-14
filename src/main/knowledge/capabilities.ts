import { readFile } from 'node:fs/promises'
import type { createClientCapabilityRegistry } from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import { knowledgeFormat, listKnowledgeDocuments } from '../../shared/knowledge-library'
import type { KnowledgeStore } from './store'
import type { KnowledgeViewBridge } from './view-bridge'

type Handlers = NonNullable<Parameters<typeof createClientCapabilityRegistry>[0]>

export function knowledgeCapabilityHandlers(store: KnowledgeStore, view: KnowledgeViewBridge, current: () => boolean): Handlers {
  const check = (signal?: AbortSignal) => {
    signal?.throwIfAborted()
    if (!current()) throw Error('知识库会话或账号已变化。')
  }
  return {
    inspectKnowledge: async (_args, _context, signal) => {
      check(signal)
      const [state, snapshot] = await Promise.all([view.run({ action: 'inspect' }, signal), store.snapshot()])
      check(signal)
      const rows = listKnowledgeDocuments(snapshot, state.filter)
      return {
        status: 'succeeded',
        data: { ...state, count: rows.length, documents: rows.slice(0, 40), folders: snapshot.folders }
      }
    },
    filterKnowledge: async ({ revision, filter }, _context, signal) => {
      check(signal)
      const snapshot = await store.snapshot()
      check(signal)
      if (filter.folderId && !snapshot.folders.some(folder => folder.id === filter.folderId)) throw Error('文件夹已不存在。')
      const state = await view.run({ action: 'filter', revision, filter }, signal)
      check(signal)
      const rows = listKnowledgeDocuments(snapshot, state.filter)
      return {
        status: 'succeeded',
        data: { ...state, applied: true, count: rows.length, documents: rows.slice(0, 40) },
        message: `已更新文件列表，找到 ${rows.length} 个文件。`
      }
    },
    undoKnowledgeFilter: async ({ revision }, _context, signal) => {
      check(signal)
      const state = await view.run({ action: 'undo', revision }, signal)
      check(signal)
      const snapshot = await store.snapshot()
      check(signal)
      return {
        status: 'succeeded',
        data: { ...state, count: listKnowledgeDocuments(snapshot, state.filter).length },
        message: '已恢复上一组筛选条件。'
      }
    },
    readKnowledgeDocument: async ({ id, offset = 0 }, _context, signal) => {
      check(signal)
      const { path, document } = await store.file(id)
      check(signal)
      if (document.size > 2 * 1024 * 1024 || !(knowledgeFormat(document.name) === 'markdown' || /\.(txt|csv|tsv)$/iu.test(document.name))) {
        throw Error('该格式的正文暂时无法从此工具读取。')
      }
      const text = await readFile(path, { encoding: 'utf8', signal })
      check(signal)
      return {
        status: 'succeeded',
        data: { document, text: text.slice(offset, offset + 24000), offset, nextOffset: offset + 24000 < text.length ? offset + 24000 : null }
      }
    },
    editKnowledgeDocument: async ({ id, operation, name, folderId, value }, _context, signal) => {
      check(signal)
      switch (operation) {
        case 'rename':
          if (name === undefined) throw Error('请提供文件新名称。')
          await store.edit({ type: 'rename', id, name }, () => check(signal))
          break
        case 'move':
          await store.edit({ type: 'move', id, folderId: folderId ?? undefined }, () => check(signal))
          break
        case 'star':
        case 'save':
          if (typeof value !== 'boolean') throw Error('请指定启用或取消。')
          await store.edit({ type: operation, id, value }, () => check(signal))
          break
      }
      return { status: 'succeeded', data: { id, operation, saved: true }, message: '文件属性已保存到知识库。' }
    }
  }
}
