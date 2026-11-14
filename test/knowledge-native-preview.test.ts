import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { KnowledgeFilePreview } from '../src/main/knowledge/file-preview'
import { KnowledgeStore } from '../src/main/knowledge/store'
import type { KnowledgeSharing } from '../src/main/knowledge/sharing'
import { PptxEditorService } from '../src/main/pptx/service'
import { readPptxContent } from '../src/main/pptx/content'
import { fixture } from './fixtures/pptx'

const temporary: string[] = []
afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'knowledge-native-'))
  temporary.push(root)
  const identity = { owner: 'owner', generation: 1 }
  const store = new KnowledgeStore(join(root, 'library'), () => ({ ...identity }), () => {})
  const sharing = { read: vi.fn(), canReadVersion: vi.fn(), received: vi.fn() }
  const preview = new KnowledgeFilePreview(join(root, 'shared'), () => ({ ...identity }), store, sharing as unknown as KnowledgeSharing)
  async function add(name: string, bytes: Uint8Array | string) {
    const source = join(root, name)
    await writeFile(source, bytes)
    return store.importFile(source)
  }
  return { root, identity, store, sharing, preview, add }
}

it('uses exact-file preview for supported formats and denies a previous account', async () => {
  const { preview, identity, add } = await setup()
  const rows = await Promise.all([
    add('原图.png', Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    add('演示.pptx', fixture()),
    add('正文.md', '# 已收藏'),
    add('附件.pdf', '%PDF-1.7\n'),
    add('片段.webm', Buffer.from([26, 69, 223, 163])),
    add('页面.html', '<script>throw Error("must remain text")</script>')
  ])
  for (const [index, type] of [[0, 'image/png'], [1, 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    [3, 'application/pdf'], [4, 'video/webm']] as const) {
    const value = await preview.open(rows[index]!.id, 'session')
    if (value.kind !== 'media') throw Error(type)
    expect(value.contentType).toBe(type)
    expect((await preview.registry.handle(new Request(value.url))).status).toBe(200)
    expect((await preview.registry.handle(new Request(value.url + 'other'))).status).toBe(403)
    if (index === 0) {
      identity.generation++
      expect((await preview.registry.handle(new Request(value.url))).status).toBe(403)
    }
  }
  expect(await preview.open(rows[2]!.id, 'session')).toMatchObject({ kind: 'text', text: '# 已收藏', revision: expect.any(String) })
  expect(await preview.open(rows[5]!.id, 'session')).toMatchObject({ kind: 'text', text: expect.stringContaining('<script>') })
})

it('rechecks shared access on byte reads and denies presentation edits', async () => {
  const { preview, sharing } = await setup()
  const bytes = Buffer.from(fixture()), id = 'a'.repeat(32)
  const row = { id, name: '共享.pptx', size: bytes.length, updatedAt: 123, received: { owner: '共享人', category: '行业研究' } }
  sharing.read.mockResolvedValue({ document: row, data: bytes })
  sharing.received.mockResolvedValue([row])
  sharing.canReadVersion.mockResolvedValue(true)
  const value = await preview.open(id, 'session')
  if (value.kind !== 'media') throw Error('expected shared presentation')
  expect(value.editablePresentation).toBe(false)
  expect(await preview.resolveCapability(value.url)).toBeNull()
  expect((await preview.registry.handle(new Request(value.url))).status).toBe(200)
  sharing.canReadVersion.mockResolvedValue(false)
  expect((await preview.registry.handle(new Request(value.url))).status).toBe(403)
  expect(await preview.status(id, row.updatedAt)).toBeNull()
})

it('saves an owned presentation via the existing editor and reopens its committed bytes', async () => {
  const { preview, store, add } = await setup()
  const file = await add('演示.pptx', fixture())
  const source = await preview.open(file.id, 'session')
  if (source.kind !== 'media') throw Error('expected presentation')
  const editor = new PptxEditorService({
    resolveWorkspace: async () => null,
    resolveCapability: url => preview.resolveCapability(url),
    resolveEditIdentity: identity => preview.editSource(identity),
    commitManaged: (identity, path, version, bytes) => preview.savePresentation(identity, path, version, bytes)
  })
  const original = await editor.open({ sourceUrl: source.url })
  if (!original.ok) throw Error(original.error)
  const saved = await editor.save({ editToken: original.document.editToken, version: original.document.version,
    edits: [{ id: original.document.slides[0]!.fields[0]!.id, text: '知识库编辑后的内容' }] })
  expect(saved.ok).toBe(true)
  const row = await store.file(file.id)
  const bytes = await readFile(row.path)
  expect(readPptxContent(bytes).slides[0]!.fields[0]!.text).toBe('知识库编辑后的内容')
  expect(row.document.size).toBe(bytes.length)
  const reopened = await preview.open(file.id, 'session')
  if (reopened.kind !== 'media') throw Error('expected saved presentation')
  expect(await (await preview.registry.handle(new Request(reopened.url))).arrayBuffer()).toEqual(Uint8Array.from(bytes).buffer)
  await store.setSharing(file.id, async () => ({ id: 'a'.repeat(32), category: '行业研究' }))
  expect(await editor.open({ editToken: original.document.editToken })).toMatchObject({ ok: false })
})
