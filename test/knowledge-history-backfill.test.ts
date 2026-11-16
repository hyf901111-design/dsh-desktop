import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { KnowledgeStore } from '../src/main/knowledge/store'
import { scanKnowledgeHistory } from '../src/main/knowledge/history-backfill'

it('recovers closed historical deliveries from all frames without collecting inputs, failed turns or external files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ework-knowledge-history-'))
  try {
    const cwd = join(root, '原项目')
    const sessions = join(root, 'sessions')
    const session = join(sessions, 'project', 'session-main')
    await mkdir(join(cwd, 'outputs'), { recursive: true })
    await mkdir(session, { recursive: true })
    await Promise.all(['outputs/报告.pdf', 'outputs/数据.xlsx', '未交付.md', '中断.md'].map(name => writeFile(join(cwd, name), name)))
    const external = join(root, '外部.pdf')
    await writeFile(external, '外部')
    await symlink(external, join(cwd, '跳转.pdf'))
    const message = (turn: number, text: string) => ({ type: 'assistant/message', data: { turn, message: { content: [{ type: 'text', text }] } } })
    const end = (turn: number, kind: string) => ({ type: 'turn/end', data: { turn, reason: { kind } } })
    const frame = (...events: object[]) => zstdCompressSync(events.map(event => JSON.stringify(event)).join('\n') + '\n')
    await writeFile(join(session, 'session.jsonl.zstd'), Buffer.concat([
      frame({ type: 'session', id: 'session-main', cwd }, { type: 'session/title', data: { title: '历史研究' } }),
      frame(message(1, '[报告](outputs/报告.pdf) [越界](跳转.pdf)'), end(1, 'completed'),
        message(2, '[中断](中断.md)'), end(2, 'aborted')),
      frame(message(3, '[数据](outputs/数据.xlsx)'), end(3, 'completed'), message(4, '[进行中](未交付.md)'))
    ]))
    const store = new KnowledgeStore(join(root, 'library'), () => ({ owner: 'local', generation: 0 }), () => {})
    const run = () => scanKnowledgeHistory({ sessionRoot: sessions, store, allowSession: () => true, check: () => {} })
    await run()
    const before = (await store.snapshot()).documents
    expect(before.map(row => row.name).sort()).toEqual(['报告.pdf', '数据.xlsx'].sort())
    expect(before.every(row => row.source === 'generated' && row.sessionId === 'session-main' && row.sessionTitle === '历史研究')).toBe(true)
    await store.edit({ type: 'remove', id: before.find(row => row.name === '报告.pdf')!.id })
    await run()
    expect((await store.snapshot()).documents.map(row => [row.name, row.sessionId])).toEqual([['数据.xlsx', 'session-main']])
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})

it('collects a factory result from the native turn, updates it with the full canvas and respects deletion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ework-knowledge-factory-'))
  try {
    const sessionId = 'session-main', id = 'e6a48a78-afdf-4e08-8c8b-b7e987012fab'
    const directory = join(root, 'sessions', 'project', sessionId)
    const objects = join(root, 'objects')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64')
    const hash = createHash('sha256').update(png).digest('hex')
    await mkdir(directory, { recursive: true })
    await mkdir(join(objects, hash.slice(0, 2)), { recursive: true })
    await writeFile(join(objects, hash.slice(0, 2), hash), png)
    const image = { attachmentId: 'sha256:' + hash, mediaType: 'image/png' }
    const receipt = { kind: 'odyssey-image-generation', version: 1, ok: true, image, factory: { id, title: '活动海报' } }
    const log = join(directory, 'session.jsonl')
    const lines = [
      { type: 'session', id: sessionId, cwd: root },
      { type: 'session/title', data: { title: '图片会话' } },
      { type: 'tool/code-dispatch', data: { name: 'image_generate', content: [
        { type: 'text', text: JSON.stringify(receipt) }, { type: 'image', attachment: image }
      ] } },
    ]
    const writeLog = () => writeFile(log, lines.map(row => JSON.stringify(row)).join('\n') + '\n')
    await writeLog()
    const store = new KnowledgeStore(join(root, 'library'), () => ({ owner: 'local', generation: 0 }), () => {})
    const scan = () => scanKnowledgeHistory({ sessionRoot: join(root, 'sessions'), attachmentsRoot: objects, store,
      allowSession: () => true, check: () => {} })
    await scan()
    const [collected] = (await store.snapshot()).documents
    expect(collected).toMatchObject({ name: '活动海报.png', sessionId, source: 'generated', sessionTitle: '图片会话' })
    await store.edit({ type: 'rename', id: collected!.id, name: '已整理.png' })
    await store.collectFactoryImage(png, { id, name: '新名称', sessionId, processed: true })
    expect((await store.snapshot()).documents).toEqual([expect.objectContaining({ id: collected!.id, name: '已整理.png' })])
    await store.edit({ type: 'remove', id: collected!.id })
    await writeFile(log, lines.map(row => JSON.stringify(row)).join('\n') + '\n\n')
    await scan()
    expect(await store.collectFactoryImage(png, { id, name: '新名称', sessionId, processed: true })).toBeUndefined()
    expect((await store.snapshot()).documents).toEqual([])
  } finally {
    await rm(root, { force: true, recursive: true })
  }
})
