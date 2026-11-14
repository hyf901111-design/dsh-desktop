import type { KnowledgeContent } from './content'
import type { createClientCapabilityRegistry } from '../../../packages/dsh-research-task-runtime/client-capabilities.js'
import { listKnowledgeDocuments, sharedKnowledgeCitationUrl, type KnowledgeDocument } from '../../shared/knowledge-library'
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
    searchSharedKnowledge: async ({ query, category, formats, offset = 0, scope }, _context, signal) => {
      check(signal)
      const words = query?.normalize('NFKC').toLowerCase().trim().split(/\s+/u).filter(Boolean) ?? []
      if (scope === 'content' && !words.length) throw Error('请提供正文检索关键词。')
      const documents = await sharing.received(true, signal)
      check(signal)
      const matches = listKnowledgeDocuments({ documents, folders: [] },
        { category: 'received', query: scope === 'content' ? undefined : query, sharedCategory: category, formats })
      if (scope === 'content') {
        const end = Math.min(offset + 12, matches.length)
        const hits: Array<KnowledgeDocument & { excerpt: string; truncated: boolean }> = []
        let unreadable = 0
        for (const document of matches.slice(offset, end)) {
          check(signal)
          if (!content.supports(document.name)) { unreadable++; continue }
          const timeout = AbortSignal.timeout(7000)
          const operation = signal ? AbortSignal.any([signal, timeout]) : timeout
          try {
            const file = await sharing.readListed(document, operation)
            const result = await content.read(file.document, file.data, operation)
            check(signal)
            if (!result) { unreadable++; continue }
            const text = result.text.normalize('NFKC')
            const searchable = text.toLowerCase()
            if (!words.every(word => searchable.includes(word))) continue
            const first = Math.min(...words.map(word => searchable.indexOf(word)))
            const start = Math.max(0, first - 65)
            hits.push({ ...file.document, excerpt: text.slice(start, start + 300), truncated: result.truncated })
          } catch {
            check(signal)
            unreadable++
          }
        }
        return {
          status: 'succeeded',
          data: { scope, count: hits.length, documents: hits, examined: Math.max(0, end - offset),
            unreadable, nextOffset: end < matches.length ? end : null }
        }
      }
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
        data: { document, citation: sharedKnowledgeCitationUrl(document.id), text: result.text.slice(offset, end), offset,
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
      const state = await view.run({ action: 'inspect' }, signal)
      check(signal)
      return { status: 'succeeded', data: state }
    },
    filterKnowledge: async ({ revision, filter }, _context, signal) => {
      check(signal)
      const state = await view.run({ action: 'filter', revision, filter }, signal)
      check(signal)
      return {
        status: 'succeeded',
        data: { ...state, applied: true },
        message: `已更新文件列表，找到 ${state.count} 个文件。`
      }
    },
    undoKnowledgeFilter: async ({ revision }, _context, signal) => {
      check(signal)
      const state = await view.run({ action: 'undo', revision }, signal)
      check(signal)
      return {
        status: 'succeeded',
        data: state,
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
    inspectKnowledgeMarkdown: async ({ id }, _context, signal) => {
      check(signal)
      const markdown = await store.markdown(id)
      check(signal)
      return { status: 'succeeded', data: markdown }
    },
    saveKnowledgeMarkdown: async ({ id, revision, text }, _context, signal) => {
      check(signal)
      const saved = await store.saveMarkdown(id, revision, text, () => check(signal))
      return { status: 'succeeded', data: { ...saved, saved: true }, message: 'Markdown 正文已保存。' }
    },
    editKnowledgeDocument: async ({ id, operation, name, folderId, value }, _context, signal) => {
      check(signal)
      switch (operation) {
        case 'rename':
          if (name === undefined) throw Error('请提供文件新名称。')
          await store.edit({ type: 'rename', id, name }, {
            guard: () => check(signal), renameShare: (id, newName) => sharing.rename(id, newName)
          })
          break
        case 'move':
          await store.edit({ type: 'move', id, folderId: folderId ?? undefined }, { guard: () => check(signal) })
          break
        case 'star':
        case 'save':
          if (typeof value !== 'boolean') throw Error('请指定启用或取消。')
          await store.edit({ type: operation, id, value }, { guard: () => check(signal) })
          break
      }
      return { status: 'succeeded', data: { id, operation, saved: true }, message: '文件属性已保存到知识库。' }
    }
  }
}
