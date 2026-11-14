import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { KnowledgeStore } from '../src/main/knowledge/store'
import { listKnowledgeDocuments } from '../src/shared/knowledge-library'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ework-knowledge-'))
  roots.push(root)
  let identity = { owner: 'first', generation: 1 }
  const open = () => new KnowledgeStore(join(root, 'library'), () => identity, () => {})
  const source = join(root, 'source')
  await mkdir(source)
  const file = async (name: string, value = name) => {
    const path = join(source, name)
    await writeFile(path, value)
    return path
  }
  return { open, file, switchAccount: () => { identity = { owner: 'second', generation: 2 } } }
}

it('keeps uploaded bytes and document organization through reopen and account switches', async () => {
  const { file, open, switchAccount } = await fixture()
  const store = open()
  await store.edit({ type: 'create-folder', name: '研究资料' })
  const initial = await store.snapshot()
  const folder = initial.folders[0]!
  const report = await file('行业周报.MD', '原始正文')
  const pdf = await file('行业框架.pdf')
  const batch = await store.importFiles([report, '/missing.pdf', pdf], folder.id)
  expect(batch.failed.map(row => row.name)).toEqual(['missing.pdf'])
  const [document] = batch.added
  await Promise.all([
    store.edit({ type: 'rename', id: document!.id, name: '消费行业周报.MD' }),
    store.edit({ type: 'star', id: document!.id, value: true }),
    store.edit({ type: 'save', id: document!.id, value: true })
  ])
  await writeFile(report, '上游文件的新内容')
  const reopened = open()
  const match = listKnowledgeDocuments(await reopened.snapshot(), {
    folderId: folder.id, sources: ['upload'], formats: ['markdown'], query: '消费 研究资料', savedOnly: true
  })
  expect(match).toMatchObject([{ id: document!.id, name: '消费行业周报.MD', starred: true, saved: true }])
  expect(await readFile((await reopened.file(document!.id)).path, 'utf8')).toBe('原始正文')
  await reopened.edit({ type: 'remove-folder', id: folder.id })
  expect((await reopened.snapshot()).documents.every(row => row.folderId === undefined)).toBe(true)
  switchAccount()
  await expect(reopened.snapshot()).resolves.toEqual({ documents: [], folders: [] })
  await expect(reopened.file(document!.id)).rejects.toThrow('文件已不存在')
})

it('collects a generated deliverable once, excludes process scripts, and honors removal', async () => {
  const { file, open } = await fixture()
  const store = open()
  const draft = await file('准备.py')
  const report = await file('总结.docx')
  const origin = { sessionId: 'session-one', sessionTitle: '行业研究' }
  expect(await store.collectGenerated(draft, origin)).toBeUndefined()
  const [first, duplicate] = await Promise.all([store.collectGenerated(report, origin), store.collectGenerated(report, origin)])
  expect(first?.id).toBe(duplicate?.id)
  expect(listKnowledgeDocuments(await store.snapshot(), { category: 'saved' })).toHaveLength(0)
  await store.collectGenerated(report, { ...origin, saved: true })
  expect(listKnowledgeDocuments(await store.snapshot(), { category: 'saved' })).toMatchObject([{ id: first!.id, source: 'generated' }])
  await store.edit({ type: 'remove', id: first!.id })
  expect(await store.collectGenerated(report, origin)).toBeUndefined()
  expect((await store.snapshot()).documents).toHaveLength(0)
  expect((await store.collectGenerated(report, { ...origin, saved: true }))?.saved).toBe(true)
})
