import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { createKnowledgeSessionCopier, retainExistingKnowledgeCopies } from '../src/main/knowledge/session-copy'
import { NotesStore } from '../src/main/notes/store'
import { SpreadsheetStore } from '../src/main/spreadsheet/store'
import { ResearchCanvasStorage } from '../src/main/state/research-canvas-storage'
import { ImageFactoryCanvases } from '../src/main/state/image-factory-canvases'
import { blankWorkbook } from '../src/shared/spreadsheet/workbook'
import type { SharedKnowledgeSession } from '../src/shared/knowledge-sessions'
import type { Rpc } from '../src/main/scheduled/task-runner'

const note: SharedKnowledgeSession = { version: 1, mode: 'notes', title: '笔记标题',
  note: { revision: 0, updatedAt: 1, yjs: '', title: '正文标题', blocks: [
    { id: 'block', type: 'paragraph', content: [{ type: 'text', text: '可编辑的副本', styles: { bold: true } }] }
  ] } }
const workbook = blankWorkbook('shared-book')
workbook.sheets[workbook.sheetOrder[0]!]!.cellData[0] = { 0: { v: '共享单元格' } }
const sources: SharedKnowledgeSession[] = [
  { version: 1, mode: 'research', title: '研究标题',
    canvas: { files: [], artifacts: [{ id: 'card', x: 60, y: 190, width: 320, height: 200 }] },
    layout: [['ework.research.presentation.v1:', '', '{"version":1,"mode":"dark","scope":"board"}']] },
  note,
  { version: 1, mode: 'spreadsheet', title: '表格标题', workbook }
]

async function fixture(run: (stores: {
  notes: NotesStore; workbooks: SpreadsheetStore; research: ResearchCanvasStorage
  canvases: ImageFactoryCanvases; fallbackWorkspacePath: string
}) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'ework-session-copy-'))
  try {
    await run({
      notes: new NotesStore(join(root, 'notes')),
      workbooks: new SpreadsheetStore(root),
      research: new ResearchCanvasStorage(root),
      canvases: new ImageFactoryCanvases(join(root, 'studio'), () => ({ owner: 'recipient', generation: 5 })),
      fallbackWorkspacePath: join(root, 'default-workspace')
    })
  } finally { await rm(root, { recursive: true, force: true }) }
}

test.each(sources)('seeds the $mode mode before publishing the personal copy to the catalog', async source => {
  await fixture(async stores => {
    const calls: string[] = []
    const rpc: Rpc = async <T>(method: string, input: unknown) => {
      calls.push(method)
      const params = input as { sessionId: string; workspaceId: string }
      if (method === 'workspace.list') return { items: [
        { workspaceId: 'unused', sessionIds: [] }, { workspaceId: 'current', sessionIds: ['viewer-session'] }
      ] } as T
      if (method === 'session.create') {
        expect(params.workspaceId).toBe('current')
        expect(stores.research.getItem('sherlock.knowledge.copy-title.v1:' + params.sessionId)).toBe(source.title + '（副本）')
        expect(stores.research.getItem('ework.session.view.v1:' + params.sessionId)).toBe(source.mode)
        if (source.mode === 'research') {
          const key = 'sherlock.research.canvas.artifacts.v1:' + params.sessionId
          expect(JSON.parse(stores.research.getItem(key)!)).toEqual(source.canvas.artifacts)
          expect(stores.research.getItem('ework.research.presentation.v1:' + params.sessionId)).toContain('dark')
        } else if (source.mode === 'notes') {
          const saved = stores.notes.load('recipient', params.sessionId).saved
          expect(saved.blocks).toEqual(source.note.blocks)
          expect(stores.notes.hasContent('publisher', params.sessionId)).toBe(false)
        } else {
          const created = stores.workbooks.load({ owner: 'recipient', sessionId: params.sessionId }).workbook
          expect(created?.id).not.toBe(source.workbook.id)
          expect(created?.sheets).toEqual(source.workbook.sheets)
        }
      }
      return { sessionId: params.sessionId } as T
    }
    const result = await createKnowledgeSessionCopier({ ...stores, rpc, retain: async (id, title) => {
      calls.push('retain')
      expect(stores.research.getItem('ework.session.view.v1:' + id)).toBe(source.mode)
      expect(title).toBe(source.title + '（副本）')
    } })('recipient', source, 'viewer-session', () => {})
    expect(result.mode).toBe(source.mode)
    expect(calls).toEqual(['workspace.list', 'session.create', 'retain'])
  })
})

test.each([false, true])('stages the selected archived PNG in an independent canvas (registration fails: %s)', async fail => {
  await fixture(async stores => {
    const image = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aP1sAAAAASUVORK5CYII=', 'base64'))
    const source = { mode: 'image-factory' as const, title: '归档原图', image, width: 1, height: 1, epoch: 5 }
    const original = { version: 1 as const, id: '0ec3c0e2-043a-481b-aeca-ab81b053a100', title: '来源会话当前画布', width: 1, height: 1, layers: [] }
    await stores.canvases.write({ scope: 'source-session', epoch: 5, canvas: original })
    const registered: string[] = []
    const rpc: Rpc = async <T>(method: string, input: unknown) => {
      if (method === 'workspace.list') return { items: [
        { workspaceId: 'other', sessionIds: [] }, { workspaceId: 'original', sessionIds: ['source-session'] }
      ] } as T
      if (method === 'session.list') return { items: [] } as T
      const { sessionId, workspaceId } = input as { sessionId: string; workspaceId: string }
      expect(method).toBe('session.create')
      registered.push(sessionId)
      expect(workspaceId).toBe('original')
      expect(stores.research.getItem('ework.session.view.v1:' + sessionId)).toBe('chat')
      expect(await stores.canvases.read(sessionId)).toMatchObject({
        canvas: { title: '归档原图（副本）', width: 1, height: 1, layers: [{ kind: 'image', mediaType: 'image/png' }] },
        image: { data: image, mediaType: 'image/png' }
      })
      if (fail) throw Error('会话注册失败')
      return { sessionId } as T
    }
    const retain = async (id: string, title: string) => {
      expect(fail).toBe(false)
      expect(id).toBe(registered[0])
      expect(title).toBe('归档原图（副本）')
    }
    const copy = createKnowledgeSessionCopier({ ...stores, rpc, retain })('recipient', source, 'source-session', () => {})
    if (fail) {
      await expect(copy).rejects.toThrow('会话注册失败')
      expect(registered).toHaveLength(2)
      expect(registered[0]).toBe(registered[1])
      expect((await stores.canvases.read(registered[0]!)).canvas).toBeUndefined()
    } else {
      const result = await copy
      expect(registered).toHaveLength(1)
      expect(result).toEqual({ id: registered[0], mode: 'image-factory' })
    }
    expect((await stores.canvases.read('source-session')).canvas).toEqual(original)
    expect((await stores.canvases.read(null)).canvas).toBeUndefined()
  })
})

test('retries a possibly registered copy with the same id and removes staged data if no session exists', async () => {
  await fixture(async stores => {
    const attempted: string[] = []
    const rpc: Rpc = async <T>(method: string, input: unknown) => {
      if (method === 'workspace.list') return { items: [{ workspaceId: 'current', sessionIds: [] }] } as T
      if (method === 'session.create') {
        attempted.push((input as { sessionId: string }).sessionId)
        throw Error('工作区暂不可用')
      }
      if (method === 'session.list') return { items: [] } as T
      throw Error('unexpected method')
    }
    await expect(createKnowledgeSessionCopier({ ...stores, rpc, retain: async () => {
      throw Error('unexpected retention')
    } })('recipient', note, undefined, () => {})).rejects.toThrow('工作区暂不可用')
    expect(attempted).toHaveLength(2)
    expect(attempted[0]).toBe(attempted[1])
    expect(stores.research.getItem('ework.session.view.v1:' + attempted[0])).toBeNull()
    expect(stores.notes.hasContent('recipient', attempted[0]!)).toBe(false)
  })
})

test('recovers a saved copy in its original project without creating a new session', async () => {
  const saved = 'session-0ec3c0e2-043a-481b-aeca-ab81b053a100'
  const archived = 'session-0ec3c0e2-043a-481b-aeca-ab81b053a200'
  const empty = 'session-0ec3c0e2-043a-481b-aeca-ab81b053a300'
  const title = '渠道库存（副本）'
  const sequence: unknown[] = []
  const rpc: Rpc = async <T>(method: string, input: unknown) => {
    if (method === 'session.list') return { items: [saved, archived, empty].map(sessionId => ({
      sessionId, blank: true, projections: { values: { title } }
    })) } as T
    if (method === 'workspace.list') return {
      items: [{ workspaceId: 'original-project', sessionIds: [saved, archived, empty] }],
      archivedSessionIds: [archived]
    } as T
    sequence.push([method, input])
    return {} as T
  }
  await retainExistingKnowledgeCopies({
    rpc, getMode: () => 'spreadsheet', hasContent: id => id !== empty, check: () => true,
    retain: async (...args) => { sequence.push(args) }
  })
  expect(sequence).toEqual([
    ['session.create', { sessionId: saved, workspaceId: 'original-project' }],
    [saved, title, true]
  ])
})

test('restores an archived editable project with its original layer identities and grouping', async () => {
  await fixture(async stores => {
    const canvas = {
      version: 1 as const, id: '232b75d7-42e1-4708-a293-a45c55ce4703', width: 960, height: 720, title: '已保存的海报',
      layers: [{
        kind: 'brand' as const, asset: 'container-left' as const, id: 'a6f25973-989d-41e3-a16b-1004964a2c87',
        x: 0, y: 0, width: .3, height: .15, groupId: 'bd57fc8e-f851-4557-9432-75ed5b5b04cd',
      }, {
        kind: 'text' as const, id: '8179159d-a110-4acd-a852-e963df69b622', text: '保留分层',
        color: '#005098', x: .2, y: .3, width: .6, fontSize: 44, family: 'system-ui' as const, weight: 600,
        align: 'left' as const, groupId: 'bd57fc8e-f851-4557-9432-75ed5b5b04cd',
      }],
    }
    const rpc: Rpc = async <T>(method: string, args: unknown) => {
      if (method === 'workspace.list') return { items: [{ workspaceId: 'current', sessionIds: [] }] } as T
      return args as T
    }
    const retain = vi.fn(async () => {})
    const result = await createKnowledgeSessionCopier({ ...stores, rpc, retain })('recipient',
      { mode: 'image-factory', title: canvas.title, canvas, epoch: 5 }, undefined, () => {}, true)
    expect((await stores.canvases.read(result.id)).canvas).toEqual(canvas)
    expect(retain).toHaveBeenCalledExactlyOnceWith(result.id, canvas.title, undefined, true)
  })
})
