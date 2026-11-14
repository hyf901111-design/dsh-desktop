import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { KnowledgeContent } from '../src/main/knowledge/content'
import { resolveKnowledgeReference } from '../src/main/knowledge/references'
import type { KnowledgeSharing } from '../src/main/knowledge/sharing'
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
  return { root, open, file, owner: () => identity, switchAccount: () => { identity = { owner: 'second', generation: 2 } } }
}

async function withoutSourceVersion(root: string) {
  const [account] = await readdir(join(root, 'library'))
  const path = join(root, 'library', account!, 'catalog.json')
  const state = JSON.parse(await readFile(path, 'utf8'))
  delete state.documents[0].sourceVersion
  await writeFile(path, JSON.stringify(state))
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

it.each([false, true])('refreshes a regenerated file in place for preview and Agent references (legacy=%s)', async legacy => {
  const { root, file, open, owner } = await fixture()
  let store = open()
  const origin = { sessionId: 'report-session', sessionTitle: '行业周报' }
  const path = await file('周报.md', '# 版本甲')
  const original = (await store.collectGenerated(path, origin))!
  await store.edit({ type: 'create-folder', name: '研究资料' })
  const folderId = (await store.snapshot()).folders[0]!.id
  await store.edit({ type: 'move', id: original.id, folderId })
  await store.edit({ type: 'rename', id: original.id, name: '已整理的周报.md' })
  await store.edit({ type: 'star', id: original.id, value: true })
  if (legacy) {
    await withoutSourceVersion(root)
    store = open()
    expect(await store.collectGenerated(path, origin)).toMatchObject({ updatedAt: original.updatedAt })
    await withoutSourceVersion(root)
    store = open()
  }
  const previous = await store.file(original.id)
  await rename(await file('重生成.md', '# 版本乙'), path)
  const [refreshed, saved] = await Promise.all([
    store.collectGenerated(path, origin), store.collectGenerated(path, { ...origin, saved: true })
  ])
  expect(refreshed?.id).toBe(original.id)
  expect(saved).toMatchObject({ id: original.id, name: '已整理的周报.md', folderId, saved: true, starred: true })
  const reopened = open()
  expect((await reopened.snapshot()).documents).toEqual([saved])
  expect(await reopened.collectGenerated(path, origin)).toEqual(saved)
  const content = new KnowledgeContent(() => { throw Error('Markdown should not load PDF modules') })
  const current = await reopened.file(original.id)
  expect(await content.read(current.document, current.path)).toMatchObject({ text: '# 版本乙' })
  expect(current.document.updatedAt).toBeGreaterThan(original.updatedAt)
  expect(await readFile(previous.path, 'utf8')).toBe('# 版本甲')
  const reference = await resolveKnowledgeReference({ kind: 'file', id: original.id }, {
    store: reopened, owner, content, sharing: {} as KnowledgeSharing
  })
  expect(reference.documents).toMatchObject([{ id: original.id, name: '已整理的周报.md', text: '# 版本乙' }])
})

it.each([false, true])('keeps in-library Markdown edits on recollection (legacy=%s)', async legacy => {
  const { root, file, open } = await fixture()
  const origin = { sessionId: 'report-session' }
  const path = await file('周报.md', '# 原稿')
  let store = open()
  const { id } = (await store.collectGenerated(path, origin))!
  const markdown = await store.markdown(id)
  await store.saveMarkdown(id, markdown.revision, '# 用户整理的正文')
  if (legacy) {
    await withoutSourceVersion(root)
    store = open()
  }
  await file('周报.md', '# 后续重生成的正文')
  expect(await store.collectGenerated(path, { ...origin, saved: true })).toMatchObject({ id, saved: true })
  expect(await store.markdown(id)).toMatchObject({ text: '# 用户整理的正文' })
})

it('preserves shared bytes until unshared, then recollects the changed source', async () => {
  const { file, open } = await fixture()
  const store = open()
  const origin = { sessionId: 'report-session' }
  const path = await file('周报.md', '# 初次共享')
  const { id } = (await store.collectGenerated(path, origin))!
  const share = { id: '0123456789abcdef'.repeat(2), category: '行业研究' }
  await store.setSharing(id, async () => share)
  await file('周报.md', '# 待审阅的新稿')
  expect(await store.collectGenerated(path, origin)).toMatchObject({ id, share })
  expect(await readFile((await store.file(id)).path, 'utf8')).toBe('# 初次共享')
  await store.setSharing(id, async () => undefined)
  await store.collectGenerated(path, origin)
  expect(await store.markdown(id)).toMatchObject({ text: '# 待审阅的新稿' })
})

it('saves Markdown with a revision guard and keeps the original imported source intact', async () => {
  const { file, open } = await fixture()
  const source = await file('研究笔记.md', '# 原文')
  const store = open()
  const { added: [row] } = await store.importFiles([source])
  const initial = await store.markdown(row!.id)
  expect(initial.text).toBe('# 原文')
  const saved = await store.saveMarkdown(row!.id, initial.revision, '# 正文已修改')
  expect(saved.revision).not.toBe(initial.revision)
  await expect(store.saveMarkdown(row!.id, initial.revision, '过期版本')).rejects.toThrow('文件已被修改')
  expect(await readFile(source, 'utf8')).toBe('# 原文')
  const reopened = open()
  expect(await reopened.markdown(row!.id)).toEqual({ revision: saved.revision, text: '# 正文已修改' })
  await expect(reopened.saveMarkdown(row!.id, saved.revision, '文字'.repeat(131072))).rejects.toThrow('正文过大')
  await reopened.setSharing(row!.id, async () => ({ id: '0123456789abcdef0123456789abcdef', category: '行业研究' }))
  await expect(reopened.markdown(row!.id)).rejects.toThrow('先取消共享')
  await expect(reopened.saveMarkdown(row!.id, saved.revision, '已共享的正文')).rejects.toThrow('先取消共享')
})

it('reports bytes while importing, cancels before publishing, and lets the same file be retried', async () => {
  const { file, open } = await fixture()
  const source = await file('待重试.md', 'x'.repeat(512 * 1024))
  const store = open()
  const controller = new AbortController()
  const progress: Array<{ copied: number; total: number }> = []
  await expect(store.importFile(source, undefined, {
    signal: controller.signal,
    progress: value => {
      progress.push(value)
      if (value.copied > 0) controller.abort()
    }
  })).rejects.toThrow()
  expect(progress.some(value => value.copied > 0 && value.copied < value.total)).toBe(true)
  expect((await store.snapshot()).documents).toEqual([])
  const completed: Array<{ copied: number; total: number }> = []
  const document = await store.importFile(source, undefined, { progress: value => completed.push(value) })
  expect(completed.at(-1)).toEqual({ copied: 512 * 1024, total: 512 * 1024 })
  expect((await store.snapshot()).documents.map(row => row.id)).toEqual([document.id])
})

it('persists a bounded and deduplicated recent search history for each account', async () => {
  const { open, switchAccount } = await fixture()
  const store = open()
  expect(await store.recentSearches()).toEqual([])
  await store.rememberSearch('  周报  ')
  await store.rememberSearch('合同')
  expect(await store.rememberSearch('周报')).toEqual(['周报', '合同'])
  for (let i = 0; i < 10; i++) await store.rememberSearch('检索 ' + i)
  expect(await open().recentSearches()).toEqual(Array.from({ length: 6 }, (_, i) => '检索 ' + (9 - i)))
  switchAccount()
  expect(await store.recentSearches()).toEqual([])
})
