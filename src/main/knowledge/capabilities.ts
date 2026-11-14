import type { KnowledgeContent } from './content'
import type { createClientCapabilityRegistry } from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import { listKnowledgeDocuments } from '../../shared/knowledge-library'
import type { KnowledgeSharing } from './sharing'
import type { KnowledgeStore } from './store'
import type { KnowledgeViewBridge } from './view-bridge'

type Handlers = NonNullable<Parameters<typeof createClientCapabilityRegistry>[0]>

export function sharedKnowledgeCapabilityHandlers(sharing: KnowledgeSharing, content: KnowledgeContent, current: () => boolean): Handlers {
  const check = (signal?: AbortSignal) => {
    signal?.throwIfAborted()
    if (!current()) throw Error('会话或账号已变化。')
  }
  return {
    searchSharedKnowledge: async ({ query, category, formats, offset = 0 }, _context, signal) => {
      check(signal)
      const documents = await sharing.received(true, signal)
      check(signal)
      const matches = listKnowledgeDocuments({ documents, folders: [] },
        { category: 'received', query, sharedCategory: category, formats })
      const end = offset + 25
      return {
        status: 'succeeded',
        data: { count: matches.length, documents: matches.slice(offset, end), nextOffset: end < matches.length ? end : null }
      }
    },
    readSharedKnowledge: async ({ id, offset = 0 }, _context, signal) => {
      check(signal)
      const { document, data } = await sharing.read(id, signal)
      check(signal)
      const result = await content.read(document, data, signal)
      if (!result) throw Error('该格式的正文暂时无法从此工具读取。')
      check(signal)
      const end = offset + 24000
      return {
        status: 'succeeded',
        data: { document, text: result.text.slice(offset, end), offset,
          nextOffset: end < result.text.length ? end : null, truncated: result.truncated }
      }
    }
  }
}

export function knowledgeCapabilityHandlers(store: KnowledgeStore, sharing: KnowledgeSharing, content: KnowledgeContent, view: KnowledgeViewBridge, current: () => boolean): Handlers {
  const check = (signal?: AbortSignal) => {
    signal?.throwIfAborted()
    if (!current()) throw Error('知识库会话或账号已变化。')
  }
  const shared = sharedKnowledgeCapabilityHandlers(sharing, content, current)
  return {
    inspectKnowledge: async (_args, _context, signal) => {
      check(signal)
      const [state, snapshot] = await Promise.all([view.run({ action: 'inspect' }, signal), store.snapshot()])
      check(signal)
      const data = state.filter.category === 'received' ? await sharing.snapshot(snapshot, false, signal) : snapshot
      check(signal)
      const rows = listKnowledgeDocuments(data, state.filter)
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
      const data = filter.category === 'received' ? await sharing.snapshot(snapshot, false, signal) : snapshot
      check(signal)
      const state = await view.run({ action: 'filter', revision, filter }, signal)
      check(signal)
      const rows = listKnowledgeDocuments(data, state.filter)
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
      const data = state.filter.category === 'received' ? await sharing.snapshot(snapshot, false, signal) : snapshot
      check(signal)
      return {
        status: 'succeeded',
        data: { ...state, count: listKnowledgeDocuments(data, state.filter).length },
        message: '已恢复上一组筛选条件。'
      }
    },
    readKnowledgeDocument: async ({ id, offset = 0 }, context, signal) => {
      check(signal)
      if (/^[a-f0-9]{32}$/u.test(id)) return shared.readSharedKnowledge!({ id, offset }, context, signal)
      const { document, path } = await store.file(id)
      check(signal)
      const result = await content.read(document, path, signal)
      if (!result) throw Error('该格式的正文暂时无法从此工具读取。')
      check(signal)
      return {
        status: 'succeeded',
        data: {
          document, text: result.text.slice(offset, offset + 24000), offset,
          nextOffset: offset + 24000 < result.text.length ? offset + 24000 : null, truncated: result.truncated
        }
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
