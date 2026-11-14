import type { KnowledgeContent } from './content'
import {
  knowledgeCategories, knowledgeSharedCategories, listKnowledgeDocuments,
  type KnowledgeCategory, type KnowledgeDocument
} from '../../shared/knowledge-library'
import type { KnowledgeSharing } from './sharing'
import type { KnowledgeStore } from './store'

type ReferenceKind = 'file' | 'category' | 'folder' | 'shared-category'
type Reference = { kind: ReferenceKind; id: string; label: string }
type Options = { store: KnowledgeStore; sharing: KnowledgeSharing; content: KnowledgeContent; owner: () => { owner: string; generation: number } }
const isShared = (id: string) => /^[a-f0-9]{32}$/u.test(id)
export async function knowledgeReferenceOptions(store: KnowledgeStore, sharing: KnowledgeSharing) {
  const local = await store.snapshot()
  const received = await sharing.received().catch(() => [])
  const sharedCategories = [...new Set([...knowledgeSharedCategories, ...received.map(row => row.received!.category)])]
  const option = (kind: ReferenceKind | 'shared-menu', id: string, label: string, detail?: string) => ({
    id: JSON.stringify({ kind, id, label }), label, detail
  })
  return [
    ...Object.entries(knowledgeCategories).filter(([key]) => key !== 'received').map(([id, label]) => option('category', id, label)),
    option('shared-menu', 'received', '他人共享'),
    ...sharedCategories.map(label => option('shared-category', label, label)),
    ...local.folders.map(folder => option('folder', folder.id, folder.name, '文件夹'))
  ]
}

export async function resolveKnowledgeReference(input: unknown, { store, sharing, content, owner }: Options) {
  const identity = owner()
  const current = () => {
    const actual = owner()
    if (actual.owner !== identity.owner || actual.generation !== identity.generation) throw Error('账号已变化，请重新引用。')
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('知识库引用无效。')
  const ref = input as Partial<Reference>
  if (!ref.kind || !['file', 'category', 'folder', 'shared-category'].includes(ref.kind) ||
      typeof ref.id !== 'string' || !ref.id || ref.id.length > 256) throw Error('知识库引用无效。')
  let documents: KnowledgeDocument[]
  let label: string
  const snapshot = await store.snapshot()
  if (ref.kind === 'file') {
    const row = isShared(ref.id) ? (await sharing.received(true)).find(item => item.id === ref.id) : snapshot.documents.find(item => item.id === ref.id)
    if (!row) throw Error('引用的文件已不存在或已取消共享，请重新选择。')
    label = row.name
    documents = [row]
  } else if (ref.kind === 'shared-category') {
    label = ref.id
    documents = (await sharing.received(true)).filter(row => row.received?.category === ref.id)
    if (!documents.length) throw Error('此分类暂无可引用的共享文件，可能已取消共享。')
  } else if (ref.kind === 'folder') {
    const folder = snapshot.folders.find(item => item.id === ref.id)
    if (!folder) throw Error('引用的文件夹已不存在。')
    label = folder.name
    documents = listKnowledgeDocuments(snapshot, { folderId: folder.id })
  } else {
    if (!Object.hasOwn(knowledgeCategories, ref.id) || ref.id === 'received') throw Error('分类不可用。')
    const category = ref.id as KnowledgeCategory
    label = knowledgeCategories[category]
    documents = listKnowledgeDocuments(snapshot, { category })
  }
  current()
  const rows = []
  let budget = 28000
  const candidates = documents.slice(0, 40)
  for (const document of candidates) {
    current()
    const row: { id: string; name: string; sharer?: string; text?: string; truncated?: boolean; unavailable?: boolean } = {
      id: document.id, name: document.name, sharer: document.received?.owner
    }
    if (budget > 0 && content.supports(document.name)) {
      const preview = await (async () => {
        if (document.received) {
          const file = await sharing.readListed(document)
          row.name = file.document.name
          if (ref.kind === 'file') label = row.name
          return content.read(file.document, file.data)
        }
        const file = await store.file(document.id)
        return content.read(file.document, file.path)
      })().catch(error => {
        current()
        if (ref.kind === 'file') throw error
        row.unavailable = true
        return undefined
      })
      const text = preview?.text ?? ''
      const limit = Math.min(ref.kind === 'file' ? 28000 : 6000, budget)
      row.text = text.slice(0, limit)
      row.truncated = preview?.truncated || text.length > limit
      budget -= row.text.length
    }
    rows.push(row)
  }
  current()
  if (ref.kind === 'shared-category' && rows.every(row => row.unavailable)) {
    throw Error('此分类的共享文件暂时无法读取，请刷新后重新引用。')
  }
  return { kind: ref.kind, label, count: documents.length, documents: rows.filter(row => !row.unavailable),
    unavailableCount: rows.filter(row => row.unavailable).length }
}
