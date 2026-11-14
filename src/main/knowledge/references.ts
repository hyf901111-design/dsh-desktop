import { readFile } from 'node:fs/promises'
import {
  knowledgeCategories, knowledgeFormat, knowledgeSharedCategories, listKnowledgeDocuments,
  type KnowledgeCategory, type KnowledgeDocument
} from '../../shared/knowledge-library'
import type { KnowledgeSharing } from './sharing'
import type { KnowledgeStore } from './store'

type ReferenceKind = 'file' | 'category' | 'folder' | 'shared-category'
type Reference = { kind: ReferenceKind; id: string; label: string }
type Options = { store: KnowledgeStore; sharing: KnowledgeSharing; owner: () => { owner: string; generation: number } }
const isShared = (id: string) => /^[a-f0-9]{32}$/u.test(id)
const canReadText = (row: KnowledgeDocument) => row.size <= 2 * 1024 * 1024 &&
  (knowledgeFormat(row.name) === 'markdown' || /\.(txt|csv|tsv)$/iu.test(row.name))

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

export async function resolveKnowledgeReference(input: unknown, { store, sharing, owner }: Options) {
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
  for (const document of documents.slice(0, 40)) {
    current()
    const row: { id: string; name: string; sharer?: string; text?: string; truncated?: boolean } = {
      id: document.id, name: document.name, sharer: document.received?.owner
    }
    if (budget > 0 && canReadText(document)) {
      const text = document.received ? (await sharing.read(document.id)).data.toString('utf8') : await readFile((await store.file(document.id)).path, 'utf8')
      const limit = Math.min(ref.kind === 'file' ? 28000 : 6000, budget)
      row.text = text.slice(0, limit)
      row.truncated = text.length > limit
      budget -= row.text.length
    }
    rows.push(row)
  }
  current()
  return { kind: ref.kind, label, count: documents.length, documents: rows }
}
