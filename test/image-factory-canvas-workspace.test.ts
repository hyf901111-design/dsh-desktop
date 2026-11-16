import { Window } from 'happy-dom'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { CanvasWorkspace } from '../src/preload/image-factory/canvas-workspace'
import type { CanvasRead, CanvasScope, CanvasStorage, CanvasWrite, StoredCanvas, TextLayer } from '../src/shared/image-factory-canvas'

const scene = (title: string): StoredCanvas & { layers: TextLayer[] } => ({
  version: 1, id: randomUUID(), title, width: 800, height: 1000, layers: [
    { id: randomUUID(), kind: 'text', text: title, x: .15, y: .12, width: .7, fontSize: 64,
      align: 'center', weight: 600, family: 'system-ui', color: '#dddddd' },
  ],
})

it('restores the new selection and sends an in-flight result to its originating session', async () => {
  const win = new Window()
  const records = new Map<CanvasScope, StoredCanvas>([
    ['original', scene('原会话')], ['other', scene('另一个会话')],
  ])
  let resolveOriginal!: (value: CanvasRead) => void
  const originalLoad = new Promise<CanvasRead>(resolve => { resolveOriginal = resolve })
  const store: CanvasStorage = {
    read: vi.fn(async scope => scope === 'original' ? originalLoad : { epoch: 1, canvas: records.get(scope) }),
    write: vi.fn(async write => { records.set(write.scope, write.canvas) }),
    adopt: vi.fn(async () => false),
  }
  const workspace = new CanvasWorkspace(win.document as unknown as Document, store)
  try {
    workspace.select('original')
    const release = workspace.retain('original')
    const pending = workspace.ready('original')
    workspace.select('other')
    await workspace.ready('other')
    resolveOriginal({ epoch: 1, canvas: records.get('original')! })
    await pending
    expect(workspace.getSnapshot()).toMatchObject({ scope: 'other', scene: { title: '另一个会话' } })
    workspace.change('original', previous => previous && { ...previous, title: '后台任务结果' })
    release()
    await vi.waitFor(() => expect(records.get('original')?.title).toBe('后台任务结果'))
    expect(workspace.getSnapshot().scene?.title).toBe('另一个会话')
  } finally { workspace.dispose(); await win.happyDOM.abort() }
})

it('moves a pending canvas after its unsaved edits finish and supports retrying a failed save', async () => {
  const win = new Window()
  const records = new Map<CanvasScope, StoredCanvas>()
  const writes = vi.fn(async (write: CanvasWrite) => { records.set(write.scope, write.canvas) })
  const workspace = new CanvasWorkspace(win.document as unknown as Document, {
    read: async scope => ({ epoch: 1, canvas: records.get(scope) }),
    write: writes,
    adopt: async to => {
      const draft = records.get(null)
      if (!draft) return false
      records.set(to, draft)
      records.delete(null)
      return true
    },
  })
  try {
    workspace.select(null)
    await workspace.ready(null)
    writes.mockRejectedValueOnce(Error('disk busy'))
    workspace.change(null, () => scene('待提交画布'))
    await vi.waitFor(() => expect(workspace.getSnapshot().save).toBe('error'))
    const snapshots: ReturnType<typeof workspace.getSnapshot>[] = []
    const unsubscribe = workspace.subscribe(() => snapshots.push(workspace.getSnapshot()))
    const transfer = workspace.adopt('created-conversation')
    workspace.select('created-conversation')
    expect(workspace.getSnapshot()).toMatchObject({ scope: null, scene: { title: '待提交画布' } })
    await transfer
    unsubscribe()
    expect(snapshots.length).toBeGreaterThan(0)
    expect(snapshots.every(snapshot => snapshot.status === 'ready' && snapshot.scene?.title === '待提交画布')).toBe(true)
    await workspace.ready('created-conversation')
    expect(workspace.getSnapshot()).toMatchObject({ scene: { title: '待提交画布' }, save: 'saved' })
    expect(records.get(null)).toBeUndefined()
    expect(records.get('created-conversation')?.title).toEqual('待提交画布')
  } finally { workspace.dispose(); await win.happyDOM.abort() }
})

it('shows the saved target when draft adoption is declined', async () => {
  const win = new Window()
  const draft = scene('待提交画布')
  const saved = scene('已有会话画布')
  const workspace = new CanvasWorkspace(win.document as unknown as Document, {
    read: async scope => ({ epoch: 1, canvas: scope === null ? draft : saved }),
    write: async () => {},
    adopt: async () => false,
  })
  try {
    const release = workspace.retain('saved')
    await workspace.ready('saved')
    workspace.select(null)
    await workspace.ready(null)
    const adoption = workspace.adopt('saved')
    workspace.select('saved')
    expect(workspace.getSnapshot().scene?.title).toBe('待提交画布')
    await adoption
    await workspace.ready('saved')
    expect(workspace.getSnapshot()).toMatchObject({ scope: 'saved', scene: { title: '已有会话画布' } })
    workspace.select(null)
    await workspace.ready(null)
    expect(workspace.getSnapshot().scene?.title).toBe('待提交画布')
    release()
  } finally { workspace.dispose(); await win.happyDOM.abort() }
})
