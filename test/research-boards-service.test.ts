import { afterEach, expect, it, vi } from 'vitest'
import type { BoardSnapshot, Canvas } from '../src/shared/research-boards'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { exportHumanHistory } from '../packages/dsh-research-collaboration/context.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import {
  createDocument,
  encodeDocument,
  projectDocument,
  applyCanvasDiff,
  decodeDocument
} from '../packages/dsh-research-collaboration/document.js'
import {
  toBase64,
  fromBase64
} from '../packages/dsh-research-collaboration/protocol.js'
import { ResearchBoardsStore } from '../src/main/state/research-boards-store'
import { boardTabsSpec } from '../packages/dsh-research-task-runtime/board-tabs-contract.js'
import { restoreUnassignedSharedBoardCards } from '../src/main/state/research-board-tab-membership'
import { ResearchCanvasStorage } from '../src/main/state/research-canvas-storage'
import {
  ResearchBoardsService,
  registerResearchBoardsHandlers,
  type ResearchBoardHooks
} from '../src/main/research-boards-service'
const dirs: string[] = []
const services: ResearchBoardsService[] = []
afterEach(() => {
  for (const s of services.splice(0)) s.stop()
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
function make(hooks?: ResearchBoardHooks) {
  const dir = mkdtempSync(join(tmpdir(), 'boards-service-'))
  dirs.push(dir)
  const store = new ResearchBoardsStore(dir)
  const storage = new ResearchCanvasStorage(dir)
  const doc = createDocument({
    files: [],
    artifacts: [
      { id: 'n', kind: 'pasted-text', title: '研究', excerpt: 'abc', x: 0 }
    ]
  })
  let role: 'owner' | 'editor' | 'viewer' = 'owner'
  let online = true
  let epoch = 1
  let seq = 0
  let revoked = false
  const listeners = new Set<(e: any) => void>()
  const watches: Array<{
    scope: any
    listener: (event: any) => void
    closed: boolean
  }> = []
  const accountListeners = new Set<() => void>()
  const receipts = new Map<string, any>()
  const sent: any[] = []
  const snapshot = (): BoardSnapshot => ({
    board: {
      boardId: 'board',
      ownerId: 'u',
      title: 'Board',
      role,
      lifecycle: 'active',
      sharingState: 'shared',
      sharingEpoch: epoch,
      seq,
      schemaVersion: 1,
      cutoffSeq: null,
      capturedAt: new Date().toISOString(),
      createdAt: 1
    },
    snapshot: {
      canvas: projectDocument(doc),
      history: [
        { id: 'h', role: 'user', text: 'Imported private shared history' }
      ]
    },
    documentUpdate: toBase64(encodeDocument(doc)),
    seq,
    tombstones: [],
    members: [],
    messages: [],
    tasks: []
  })
  const account = {
    generation: 1,
    authenticated: true,
    subscribeSessionChanged: (fn: () => void) => {
      accountListeners.add(fn)
      return () => accountListeners.delete(fn)
    }
  }
  const client = {
    generation: () => account.generation,
    request: async (e: any) => {
      if (!online)
        throw Object.assign(Error('offline'), {
          code: 'NETWORK_ERROR',
          retryable: true
        })
      if (e.kind === 'me')
        return {
          user: { userId: 'u', publicId: '0000000001', username: 'Owner' }
        }
      if (e.kind === 'boards.list')
        return { boards: revoked ? [] : [snapshot().board] }
      if (e.kind === 'notifications.list')
        return {
          notifications: [],
          cursor: 0,
          unreadCount: 0,
          pendingCount: 0
        }
      if (e.kind === 'receipt')
        return (
          receipts.get(e.operationId) ?? {
            operationId: e.operationId,
            accepted: false
          }
        )
      if (revoked)
        throw Object.assign(Error('denied'), {
          code: 'ACCESS_DENIED',
          status: 403
        })
      if (e.kind === 'board.get') return snapshot()
      if (e.kind === 'board.command') {
        sent.push(e)
        expect(
          store
            .account('u')
            .pending.some((p) => p.operationId === e.body.operationId)
        ).toBe(true)
        if (e.body.action === 'update')
          Y.applyUpdate(doc, fromBase64(e.body.update))
        seq++
        const reply = {
          action: e.body.action,
          operationId: e.body.operationId,
          seq,
          epoch,
          documentUpdate: toBase64(encodeDocument(doc))
        }
        receipts.set(e.body.operationId, {
          operationId: e.body.operationId,
          accepted: true,
          seq,
          epoch
        })
        return reply
      }
      throw Error('Unexpected endpoint ' + e.kind)
    },
    watch: (scope: any, fn: (e: any) => void) => {
      const watch = { scope, listener: fn, closed: false }
      watches.push(watch)
      listeners.add(fn)
      return () => {
        watch.closed = true
        listeners.delete(fn)
      }
    },
    stop: () => {},
    sendPresence: () => {}
  }
  const service = new ResearchBoardsService({
    store,
    storage,
    account,
    client: client as never,
    hooks
  })
  services.push(service)
  return {
    service,
    store,
    storage,
    doc,
    sent,
    client,
    account,
    snapshot,
    listeners,
    watches,
    allow: () => {
      revoked = false
    },
    accountListeners,
    dir,
    setRole: (r: 'owner' | 'editor' | 'viewer') => {
      role = r
    },
    setOnline: (v: boolean) => {
      online = v
    },
    revoke: () => {
      revoked = true
      epoch++
    },
    remote: async (fn: (c: any) => void) => {
      const before = projectDocument(doc)
      const next = structuredClone(before)
      fn(next)
      applyCanvasDiff(doc, before, next)
      seq++
      await service.receiveBoard('board', snapshot())
    }
  }
}
async function ready(t: ReturnType<typeof make>) {
  await t.service.start()
  let result: any = await t.service.invoke('board.open', { boardId: 'board' })
  expect(result.ok).toBe(true)
  result = await t.service.invoke('board.bind', {
    boardId: 'board',
    reservationId: result.value.reservationId,
    localSessionId: 'shared-session'
  })
  expect(result.ok).toBe(true)
  await t.service.invoke('board.activate', {
    localSessionId: 'shared-session'
  })
  return t.service.getSnapshot().current!
}
it('rejects original binding, viewer sync writes, arbitrary IPC and stale frame senders', async () => {
  const t = make()
  t.store.addFavorite({ sessionId: 'original', title: 'Original' })
  t.setRole('viewer')
  const view = await ready(t)
  expect(
    t.service.writeCanvasStorage(
      'sherlock.research.canvas.artifacts.v1:shared-session',
      '[]'
    )
  ).toBe(false)
  expect(
    (
      await t.service.invoke('canvas.apply', {
        boardId: 'board',
        localSessionId: 'shared-session',
        baseRevision: view.canvasRevision,
        clientMutationId: 'edit',
        canvas: { files: [], artifacts: [] }
      })
    ).ok
  ).toBe(false)
  expect(
    t.service.writeCanvasStorage(
      'sherlock.research.canvas.artifacts.v1:original',
      '[]'
    )
  ).toBe(true)
  const handlers = new Map<string, Function>()
  const webContents = { mainFrame: { processId: 1, routingId: 2 } }
  registerResearchBoardsHandlers({
    ipcMain: {
      handle: (c: string, f: Function) => handlers.set(c, f),
      removeHandler: (c: string) => handlers.delete(c)
    },
    getMainWindow: () => ({ isDestroyed: () => false, webContents }),
    service: t.service
  })
  expect(() =>
    handlers.get('research:boards:snapshot')!({
      sender: webContents,
      senderFrame: { processId: 1, routingId: 3 }
    })
  ).toThrow()
  expect(
    (
      await t.service.invoke('board.open', {
        boardId: 'board',
        url: 'https://evil.invalid'
      })
    ).ok
  ).toBe(false)
})
it('uses exact base and branch revisions while remote insertion races queued local typing', async () => {
  const t = make()
  const first = await ready(t)
  await t.remote((c) => {
    c.artifacts[0].excerpt = 'Xabc'
  })
  const local = structuredClone(first.canvas)
  local.artifacts[0]!.excerpt = 'abcd'
  const one: any = await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: first.canvasRevision,
    clientMutationId: 'one',
    canvas: local
  })
  expect(one.ok).toBe(true)
  expect(one.value.canvas.artifacts[0].excerpt).toBe('Xabcd')
  local.artifacts[0]!.excerpt = 'abcde'
  const two: any = await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: one.value.localBranchRevision,
    clientMutationId: 'two',
    canvas: local
  })
  expect(two.ok).toBe(true)
  expect(two.value.canvas.artifacts[0].excerpt).toBe('Xabcde')
  await t.service.flush()
  expect(projectDocument(t.doc).artifacts[0]!.excerpt).toBe('Xabcde')
})
it('refreshes the bound canvas and rejects a recovered write if it becomes stale again', async () => {
  const t = make()
  const initial = await ready(t)
  const target = { boardId: 'board', localSessionId: 'shared-session' }
  expect(await t.service.invoke('canvas.refresh', { ...target, localSessionId: 'wrong-session' }))
    .toMatchObject({ ok: false })
  const refreshed = await t.service.invoke('canvas.refresh', target)
  expect(refreshed.ok).toBe(true)
  if (!refreshed.ok) throw Error('Canvas refresh failed')
  const fresh = refreshed.value as typeof initial
  expect(fresh.canvasRevision).not.toBe(initial.canvasRevision)
  await t.remote(canvas => { canvas.artifacts[0]!.excerpt = 'collaborator edit' })

  const canvas = structuredClone(fresh.canvas)
  canvas.artifacts[0]!.excerpt = 'local edit'
  const pending = { ...target, clientMutationId: 'recovered-edit', requireLatest: true, canvas }
  expect(await t.service.invoke('canvas.apply', { ...pending, baseRevision: fresh.canvasRevision }))
    .toMatchObject({ ok: false, error: { code: 'STALE_CANVAS_REVISION' } })

  const latest = await t.service.invoke('canvas.refresh', target)
  expect(latest.ok).toBe(true)
  if (!latest.ok) throw Error('Canvas refresh failed')
  // A duplicate GET can give the same document a different local token.
  const duplicate = await t.service.invoke('canvas.refresh', target)
  expect(duplicate.ok).toBe(true)
  if (!duplicate.ok) throw Error('Duplicate canvas refresh failed')
  expect((duplicate.value as typeof initial).canvasRevision).not.toBe((latest.value as typeof initial).canvasRevision)
  expect(await t.service.invoke('canvas.apply', {
    ...pending, baseRevision: (latest.value as typeof initial).canvasRevision
  })).toMatchObject({ ok: true, value: { canvas } })
  await t.service.flush()
  expect(projectDocument(t.doc).artifacts[0]!.excerpt).toBe('local edit')
})
it('keeps B changes when A undoes and never reports resurrecting a tombstoned node', async () => {
  const t = make()
  const view = await ready(t)
  const after = structuredClone(view.canvas)
  after.artifacts[0]!.title = "A changed"
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'one',
    canvas: after
  })
  await t.service.flush()
  await t.remote((c) => {
    c.artifacts[0].excerpt = 'B changed'
  })
  const undo: any = await t.service.invoke('canvas.undo', {
    boardId: 'board',
    localSessionId: 'shared-session'
  })
  expect(undo.ok).toBe(true)
  expect(undo.value.canvas.artifacts[0]).toMatchObject({
    x: 0,
    title: '研究',
    excerpt: 'B changed'
  })
  const remove: any = await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: undo.value.canvasRevision,
    clientMutationId: 'delete',
    canvas: { files: [], artifacts: [] }
  })
  expect(remove.ok).toBe(true)
  const deletion: any = await t.service.invoke('canvas.undo', {
    boardId: 'board',
    localSessionId: 'shared-session'
  })
  expect(deletion.ok).toBe(false)
  expect(deletion.error.code).toBe('DELETION_RECOVERY_REQUIRED')
})
it('update preparation rejects unconfirmed queued edits and succeeds after the real queue drains', async () => {
  const t = make(), view = await ready(t)
  await expect(t.service.prepareForUpdateRestart()).resolves.toBeUndefined()
  t.setOnline(false)
  const after = structuredClone(view.canvas)
  after.artifacts[0]!.excerpt = 'save before update'
  await t.service.invoke('canvas.apply', { boardId: 'board', localSessionId: 'shared-session', baseRevision: view.canvasRevision, clientMutationId: 'update-save', canvas: after })
  await expect(t.service.prepareForUpdateRestart()).rejects.toThrow('尚未确认')
  expect(new ResearchBoardsStore(t.dir).account('u').pending).toHaveLength(1)
  t.setOnline(true)
  await expect(t.service.prepareForUpdateRestart()).resolves.toBeUndefined()
  expect(new ResearchBoardsStore(t.dir).account('u').pending).toHaveLength(0)
})
it('persists before sending, survives restart and recovers only own changes on revocation', async () => {
  const t = make()
  const view = await ready(t)
  t.setOnline(false)
  const after = structuredClone(view.canvas)
  after.artifacts[0]!.excerpt = 'abcOWN'
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'own',
    canvas: after
  })
  await t.service.flush()
  expect(new ResearchBoardsStore(t.dir).account('u').pending).toHaveLength(1)
  t.setOnline(true)
  t.revoke()
  await t.service.refresh()
  expect(t.service.getSnapshot().current?.canvas.artifacts ?? []).toEqual([])
  expect(
    t.service.readCanvasStorage(
      'sherlock.research.canvas.artifacts.v1:shared-session'
    )
  ).toBe('[]')
  const persisted = JSON.stringify(
    new ResearchBoardsStore(t.dir).account('u')
  )
  expect(persisted).toContain('OWN')
  expect(persisted).not.toContain('Imported private shared history')
  expect(persisted).not.toContain('abcOWN')
  expect(t.store.account('u').pending).toHaveLength(0)
})
it('clears rendered identity immediately on same-account session change', async () => {
  const t = make()
  await ready(t)
  t.account.generation++
  t.account.authenticated = false
  for (const fn of t.accountListeners) fn()
  expect(t.service.getSnapshot().account.user).toBe(null)
  expect(t.service.getSnapshot().current).toBe(null)
  expect(
    t.service.readCanvasStorage(
      'sherlock.research.canvas.artifacts.v1:shared-session'
    )
  ).toBe('[]')
})

it('restarts from durable pending changes and preserves the distinct local binding', async () => {
  const t = make()
  const first = await ready(t)
  t.setOnline(false)
  const canvas = structuredClone(first.canvas)
  canvas.artifacts[0]!.excerpt = 'abc restart'
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: first.canvasRevision,
    clientMutationId: 'restart',
    canvas
  })
  await t.service.flush()
  t.service.stop()
  t.setOnline(true)
  const resumedStore = new ResearchBoardsStore(t.dir)
  const resumed = new ResearchBoardsService({
    store: resumedStore,
    storage: t.storage,
    account: t.account,
    client: t.client as never
  })
  services.push(resumed)
  await resumed.start()
  await resumed.flush()
  expect(resumedStore.account('u').pending).toHaveLength(0)
  expect(projectDocument(t.doc).artifacts[0]!.excerpt).toBe('abc restart')
  expect(
    await resumed.invoke('board.open', { boardId: 'board' })
  ).toMatchObject({ ok: true, value: { localSessionId: 'shared-session' } })
})

it('checks durable receipts after a lost ACK instead of submitting the operation twice', async () => {
  const t = make()
  const view = await ready(t)
  const base = t.client.request
  let lose = true
  t.client.request = async (e) => {
    const result = await base(e)
    if (e.kind === 'board.command' && lose) {
      lose = false
      throw Object.assign(Error('lost acknowledgement'), {
        code: 'NETWORK_ERROR',
        retryable: true
      })
    }
    return result
  }
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.excerpt = 'abc accepted'
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'lost',
    canvas
  })
  await t.service.flush()
  expect(t.store.account('u').pending).toHaveLength(1)
  await t.service.refresh()
  expect(t.store.account('u').pending).toHaveLength(0)
  expect(t.sent).toHaveLength(1)
})

it('keeps pending until the acknowledged checkpoint can be saved atomically', async () => {
  const t = make()
  const view = await ready(t)
  const base = t.client.request
  let sent = false
  let release!: (value: any) => void
  let held = false
  t.client.request = async (e) => {
    const result = await base(e)
    if (e.kind === 'board.command') sent = true
    else if (e.kind === 'board.get' && sent) {
      held = true
      return new Promise((r) => {
        release = () => r(result)
      })
    }
    return result
  }
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.title = "Local edit"
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'atomic',
    canvas
  })
  for (let i = 0; i < 30 && !held; i++)
    await new Promise((r) => setImmediate(r))
  expect(held).toBe(true)
  expect(t.store.account('u').pending).toHaveLength(1)
  release(null)
  await t.service.flush()
  expect(t.store.account('u').pending).toHaveLength(0)
  expect(
    t.store.account('u').checkpoints.board?.snapshot.canvas.artifacts[0]!.title
  ).toBe('Local edit')
})

it('recovers only the edited nested table cell and chart point after revocation', async () => {
  const t = make()
  await ready(t)
  await t.remote((c) => {
    c.artifacts[0].containerSpec = {
      type: 'table',
      rows: [
        ['peer-row', 'before'],
        ['untouched-peer', 'private-peer']
      ],
      series: [{ name: 'peer series', values: [10, 20, 30] }]
    }
  })
  const view = t.service.getSnapshot().current!
  const canvas = structuredClone(view.canvas)
  const spec = canvas.artifacts[0]!.containerSpec as any
  spec.rows[0][1] = 'OWN_CELL'
  spec.series[0].values[1] = 99
  t.setOnline(false)
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'nested',
    canvas
  })
  await t.service.flush()
  t.setOnline(true)
  t.revoke()
  await t.service.refresh()
  const recovered = JSON.stringify(t.store.account('u').recoveries)
  expect(recovered).toContain('OWN_CELL')
  expect(recovered).toContain('99')
  for (const peer of [
    'peer-row',
    'untouched-peer',
    'private-peer',
    'peer series'
  ])
    expect(recovered).not.toContain(peer)
})

it('rejects stale IPC typing immediately while a role downgrade waits on receipts', async () => {
  const t = make()
  const view = await ready(t)
  t.setOnline(false)
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.title = "Before downgrade"
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'before-downgrade',
    canvas
  })
  await t.service.flush()
  t.setOnline(true)
  t.setRole('viewer')
  const base = t.client.request
  let release!: (v: unknown) => void
  t.client.request = async (e) =>
    e.kind === 'receipt'
      ? (new Promise((r) => {
          release = r
        }) as any)
      : base(e)
  const received = t.service.receiveBoard('board', t.snapshot())
  const blocked: any = await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'during-downgrade',
    canvas
  })
  expect(blocked.error.code).toBe('ACCESS_DENIED')
  release({
    operationId: t.store.account('u').recoveries[0]!.operationId,
    accepted: false
  })
  await received
  expect(t.service.getSnapshot().current!.permissions.edit).toBe(false)
})

it('prevents source-session binding and returns concrete errors for unwired capture/execution hooks', async () => {
  const t = make()
  await t.service.start()
  const favorite = t.store.addFavorite({
    sessionId: 'original',
    title: 'original'
  })
  const open: any = await t.service.invoke('board.open', { boardId: 'board' })
  expect(
    await t.service.invoke('board.bind', {
      boardId: 'board',
      reservationId: open.value.reservationId,
      localSessionId: 'original'
    })
  ).toMatchObject({ ok: false, error: { code: 'BINDING_CONFLICT' } })
  expect(
    await t.service.invoke('board.create', {
      favoriteId: favorite.favoriteId
    })
  ).toMatchObject({ ok: false, error: { code: 'CAPTURE_UNAVAILABLE' } })
  expect(
    await t.service.invoke('request.submit', {
      boardId: 'board',
      text: 'research this',
      clientMutationId: 'request'
    })
  ).toMatchObject({ ok: false, error: { code: 'EXECUTION_UNAVAILABLE' } })
  expect(t.sent).toHaveLength(0)
})

it('deduplicates an acknowledged discussion submission by durable client mutation ID', async () => {
  const t = make()
  await ready(t)
  const first: any = await t.service.invoke('message.send', {
    boardId: 'board',
    text: 'one message',
    clientMutationId: 'message-once'
  })
  await t.service.flush()
  const second: any = await t.service.invoke('message.send', {
    boardId: 'board',
    text: 'one message',
    clientMutationId: 'message-once'
  })
  await t.service.flush()
  expect(second.value.operationId).toBe(first.value.operationId)
  expect(t.sent).toHaveLength(1)
})

it('creates a frozen independent copy through a complete capture hook and records local source association', async () => {
  const original = {
    files: [],
    artifacts: [
      {
        id: 'source-node',
        kind: 'pasted-text',
        title: 'Source',
        excerpt: 'original evidence'
      }
    ]
  }
  let capturedOperation = ''
  let disposed = false
  const t = make({
    captureOriginal: async (input) => {
      expect(input.sessionId).toBe('original')
      capturedOperation = input.operationId
      return {
        sourceRevision: 'frozen-1',
        capturedAt: '2026-09-09T00:00:00.000Z',
        snapshot: {
          canvas: structuredClone(original),
          history: [
            { id: 'human-1', role: 'user', text: 'Complete saved question' }
          ]
        },
        dispose: () => {
          disposed = true
        }
      }
    }
  })
  t.storage.setItem(
    'sherlock.research.canvas.artifacts.v1:original',
    JSON.stringify(original.artifacts)
  )
  const favorite = t.store.addFavorite({
    sessionId: 'original',
    title: 'Original'
  })
  const base = t.client.request
  let wire: any
  t.client.request = async (e) => {
    if (e.kind === 'board.create') {
      wire = structuredClone(e.body)
      expect(t.store.account('u').creates[favorite.favoriteId]?.body).toEqual(
        e.body
      )
      return {
        board: { ...t.snapshot().board, boardId: 'created-board' }
      } as any
    }
    return base(e)
  }
  await t.service.start()
  const result: any = await t.service.invoke('board.create', {
    favoriteId: favorite.favoriteId
  })
  expect(result.ok).toBe(true)
  expect(wire.operationId).toBe(capturedOperation)
  expect(wire.snapshot.history).toHaveLength(1)
  expect(disposed).toBe(true)
  original.artifacts[0]!.excerpt = 'changed later'
  expect(wire.snapshot.canvas.artifacts[0].excerpt).toBe('original evidence')
  expect(wire).not.toHaveProperty('sessionId')
  expect(wire).not.toHaveProperty('path')
  expect(
    t.service.getSnapshot().boards.find((b) => b.boardId === 'created-board')
      ?.sourceFavoriteId
  ).toBe(favorite.favoriteId)
  expect(t.store.sharedSession('original')).toBeUndefined()
  expect(
    t.storage.getItem('sherlock.research.canvas.artifacts.v1:original')
  ).toContain('original evidence')
})

it('fails complete capture with unresolved assets instead of publishing a partial board', async () => {
  const t = make({
    captureOriginal: async () => ({
      sourceRevision: 'one',
      capturedAt: new Date().toISOString(),
      snapshot: {
        canvas: {
          files: [
            {
              id: 'f',
              name: 'missing.pdf',
              assetId: '00000000-0000-4000-8000-000000000000'
            }
          ],
          artifacts: []
        },
        history: []
      }
    })
  })
  await t.service.start()
  const favorite = t.store.addFavorite({
    sessionId: 'source',
    title: 'Missing file'
  })
  expect(
    await t.service.invoke('board.create', {
      favoriteId: favorite.favoriteId
    })
  ).toMatchObject({ ok: false, error: { code: 'RESOURCE_UNAVAILABLE' } })
  expect(t.sent).toHaveLength(0)
})

it('removes rejected optimistic CRDT structs while preserving own recovery', async () => {
  const t = make()
  const view = await ready(t)
  const base = t.client.request
  t.client.request = async (e) => {
    if (e.kind === 'board.command')
      throw Object.assign(Error('state limit'), {
        code: 'STATE_TOO_LARGE',
        status: 413,
        retryable: false
      })
    return base(e)
  }
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.excerpt = 'abc rejected'
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'rejected',
    canvas
  })
  await t.service.flush()
  expect(t.service.getSnapshot().current!.canvas.artifacts[0]!.excerpt).toBe(
    'abc'
  )
  expect(JSON.stringify(t.store.account('u').recoveries)).toContain(
    'rejected'
  )
  expect(t.store.account('u').pending).toHaveLength(0)
})

it('durably retries an invitation response with the same operation ID', async () => {
  const t = make()
  await t.service.start()
  const base = t.client.request
  const operations: string[] = []
  let offline = true
  t.client.request = async (e) => {
    if (e.kind === 'invitation.respond') {
      operations.push(e.body.operationId)
      expect(
        t.store
          .account('u')
          .auxiliary.some((p) => p.operationId === e.body.operationId)
      ).toBe(true)
      if (offline)
        throw Object.assign(Error('offline'), {
          code: 'NETWORK_ERROR',
          retryable: true
        })
      return {
        boardId: 'board',
        invitation: { version: 1, status: 'accepted' }
      } as any
    }
    return base(e)
  }
  expect(
    (
      await t.service.invoke('invitation.respond', {
        invitationId: 'invite',
        version: 1,
        decision: 'accept'
      })
    ).ok
  ).toBe(false)
  expect(new ResearchBoardsStore(t.dir).account('u').auxiliary).toHaveLength(
    1
  )
  offline = false
  await t.service.refresh()
  expect(operations).toHaveLength(2)
  expect(operations[1]).toBe(operations[0])
  expect(t.store.account('u').auxiliary).toHaveLength(0)
})

it('discards old same-account asynchronous board replies after logout', async () => {
  const t = make()
  await ready(t)
  const base = t.client.request
  let release!: (v: any) => void
  t.client.request = async (e) => {
    const value = await base(e)
    if (e.kind === 'board.get')
      return new Promise((r) => {
        release = () => r(value)
      })
    return value
  }
  const open = t.service.invoke('board.open', { boardId: 'board' })
  await new Promise((r) => setImmediate(r))
  t.account.generation++
  t.account.authenticated = false
  for (const listener of t.accountListeners) listener()
  release(null)
  expect(await open).toMatchObject({
    ok: false,
    error: { code: 'SESSION_CHANGED' }
  })
  expect(t.service.getSnapshot().current).toBe(null)
  expect(t.service.getSnapshot().account.user).toBe(null)
})

it('aborts board resource hooks on revocation and rejects their late completion', async () => {
  let signal!: AbortSignal
  let release!: (canvas: any) => void
  const t = make({
    projectLocalCanvas: (input) => {
      signal = input.signal
      return new Promise((r) => {
        release = r
      })
    }
  })
  const view = await ready(t)
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.title = "Late edit"
  const applying = t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'late-resource',
    canvas
  })
  t.revoke()
  await t.service.refresh()
  expect(signal.aborted).toBe(true)
  release(canvas)
  expect(await applying).toMatchObject({
    ok: false,
    error: { code: 'ACCESS_DENIED' }
  })
  expect(t.sent).toHaveLength(0)
})

it('rejects a pre-revocation GET and permits independently requested later reauthorization', async () => {
  const t = make()
  await ready(t)
  const base = t.client.request
  let release!: (value: any) => void
  let hold = true
  t.client.request = async (e) => {
    const response = await base(e)
    if (hold && e.kind === 'board.get') {
      hold = false
      return new Promise((r) => {
        release = () => r(response)
      })
    }
    return response
  }
  const opening = t.service.invoke('board.open', { boardId: 'board' })
  await new Promise((r) => setImmediate(r))
  t.revoke()
  await t.service.refresh()
  expect(t.service.getSnapshot().current!.permissions.read).toBe(false)
  expect(t.store.account('u').checkpoints.board).toBeUndefined()
  t.allow()
  expect(
    (await t.service.invoke('board.open', { boardId: 'board' })).ok
  ).toBe(true)
  release(null)
  expect(await opening).toMatchObject({
    ok: false,
    error: { code: 'BOARD_ACCESS_CHANGED' }
  })
  expect(t.service.getSnapshot().current!.permissions.read).toBe(true)
  expect(t.store.account('u').checkpoints.board!.board.sharingEpoch).toBe(2)
})

it('discards an ACK checkpoint read produced before membership revocation', async () => {
  const t = make()
  const view = await ready(t)
  const base = t.client.request
  let commandAccepted = false
  let held = false
  let release!: (value: any) => void
  t.client.request = async (e) => {
    const response = await base(e)
    if (e.kind === 'board.command') commandAccepted = true
    else if (e.kind === 'board.get' && commandAccepted && !held) {
      held = true
      return new Promise((r) => {
        release = () => r(response)
      })
    }
    return response
  }
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.excerpt = 'abc own'
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'ack-revoke',
    canvas
  })
  for (let i = 0; i < 30 && !held; i++)
    await new Promise((r) => setImmediate(r))
  expect(held).toBe(true)
  t.revoke()
  // Refresh retires access before it waits on the already-running flush.
  const refreshing = t.service.refresh()
  for (
    let i = 0;
    i < 30 && t.service.getSnapshot().current!.permissions.read;
    i++
  )
    await new Promise((r) => setImmediate(r))
  expect(t.service.getSnapshot().current!.permissions.read).toBe(false)
  release(null)
  await t.service.flush()
  await refreshing
  expect(t.store.account('u').checkpoints.board).toBeUndefined()
  expect(t.service.getSnapshot().current!.permissions.read).toBe(false)
  t.allow()
  expect(
    (await t.service.invoke('board.open', { boardId: 'board' })).ok
  ).toBe(true)
  expect(t.service.getSnapshot().current!.permissions.read).toBe(true)
})

it('keeps revalidation fail-closed across permission GET and scheduled refresh network failures', async () => {
  const t = make()
  await ready(t)
  t.setOnline(false)
  const watch = t.watches.find((w) => w.scope.scope === 'board' && !w.closed)!
  watch.listener({ type: 'accessRevoked', reason: 'ACCESS_DENIED' })
  await new Promise((r) => setImmediate(r))
  expect(t.service.getSnapshot().current!.permissions.read).toBe(false)
  await t.service.refresh()
  expect(t.service.getSnapshot().current).toMatchObject({
    connection: 'revalidating',
    permissions: { read: false, edit: false },
    canvas: { files: [], artifacts: [] }
  })
  t.setOnline(true)
  expect(
    (await t.service.invoke('board.open', { boardId: 'board' })).ok
  ).toBe(true)
  expect(t.service.getSnapshot().current!.permissions.read).toBe(true)
})

it('invalidates older loads when a new permission revalidation begins', async () => {
  const t = make()
  await ready(t)
  const base = t.client.request
  let release!: (value: any) => void
  let hold = true
  t.client.request = async (e) => {
    const response = await base(e)
    if (hold && e.kind === 'board.get') {
      hold = false
      return new Promise((r) => {
        release = () => r(response)
      })
    }
    return response
  }
  const opening = t.service.invoke('board.open', { boardId: 'board' })
  await new Promise((r) => setImmediate(r))
  t.setOnline(false)
  t.watches
    .find((w) => w.scope.scope === 'board' && !w.closed)!
    .listener({ type: 'accessRevoked', reason: 'ACCESS_DENIED' })
  await new Promise((r) => setImmediate(r))
  release(null)
  expect(await opening).toMatchObject({
    ok: false,
    error: { code: 'BOARD_ACCESS_CHANGED' }
  })
  expect(t.service.getSnapshot().current!.permissions.read).toBe(false)
})

it.each(['resolve', 'reject'])(
  'a delayed activation (%s) cannot override a later leave or leak a presence socket',
  async (outcome) => {
    const t = make()
    await ready(t)
    const base = t.client.request
    let release!: (value: any) => void
    t.client.request = async (e) => {
      const response = await base(e)
      if (e.kind === 'board.get')
        return new Promise((r, reject) => {
          release = () =>
            outcome === 'reject'
              ? reject(
                  Object.assign(Error('offline'), { code: 'NETWORK_ERROR' })
                )
              : r(response)
        })
      return response
    }
    const activating = t.service.invoke('board.activate', {
      localSessionId: 'shared-session'
    })
    await new Promise((r) => setImmediate(r))
    await t.service.invoke('board.activate', { localSessionId: null })
    release(null)
    expect(await activating).toEqual({ ok: true, value: null })
    expect(t.service.getSnapshot().current).toBe(null)
    expect(
      t.watches.filter((w) => w.scope.scope === 'board' && !w.closed)
    ).toHaveLength(0)
  }
)

it.each(['resolve', 'reject'])(
  'a delayed A activation (%s) cannot override the newer B activation',
  async (outcome) => {
    const t = make()
    await ready(t)
    const base = t.client.request
    let holdA = false
    let release!: (value: any) => void
    t.client.request = async (e) => {
      if (e.kind === 'board.get' && e.boardId === 'board-b')
        return {
          ...t.snapshot(),
          board: { ...t.snapshot().board, boardId: 'board-b' }
        } as any
      const response = await base(e)
      if (holdA && e.kind === 'board.get' && e.boardId === 'board')
        return new Promise((r, reject) => {
          release = () =>
            outcome === 'reject'
              ? reject(
                  Object.assign(Error('offline'), { code: 'NETWORK_ERROR' })
                )
              : r(response)
        })
      return response
    }
    const opened: any = await t.service.invoke('board.open', {
      boardId: 'board-b'
    })
    await t.service.invoke('board.bind', {
      boardId: 'board-b',
      reservationId: opened.value.reservationId,
      localSessionId: 'session-b'
    })
    holdA = true
    const a = t.service.invoke('board.activate', {
      localSessionId: 'shared-session'
    })
    await new Promise((r) => setImmediate(r))
    await t.service.invoke('board.activate', { localSessionId: 'session-b' })
    release(null)
    expect(await a).toEqual({ ok: true, value: null })
    expect(t.service.getSnapshot().current!.boardId).toBe('board-b')
    expect(
      t.watches
        .filter((w) => w.scope.scope === 'board' && !w.closed)
        .map((w) => w.scope.boardId)
    ).toEqual(['board-b'])
  }
)

it.each(['NETWORK_ERROR', 'ACCESS_DENIED'])(
  'the latest activation preserves its real %s failure',
  async (code) => {
    const t = make()
    await ready(t)
    const base = t.client.request
    t.client.request = async (e) => {
      if (e.kind === 'board.get') throw Object.assign(Error(code), { code })
      return base(e)
    }
    expect(
      await t.service.invoke('board.activate', {
        localSessionId: 'shared-session'
      })
    ).toMatchObject({ ok: false, error: { code } })
    expect(t.service.getSnapshot().current).toBe(null)
    if (code === 'ACCESS_DENIED')
      expect(() => t.service.readSharedCanvas('shared-session')).toThrow(
        'ACCESS_DENIED'
      )
  }
)

it('a rejected superseded activation still reports an account lifetime change', async () => {
  const t = make()
  await ready(t)
  const base = t.client.request
  let reject!: (error: Error) => void
  t.client.request = async (e) => {
    if (e.kind === 'board.get')
      return new Promise((_, fail) => {
        reject = fail
      })
    return base(e)
  }
  const activating = t.service.invoke('board.activate', {
    localSessionId: 'shared-session'
  })
  await new Promise((r) => setImmediate(r))
  await t.service.invoke('board.activate', { localSessionId: null })
  t.account.generation++
  reject(Object.assign(Error('offline'), { code: 'NETWORK_ERROR' }))
  expect(await activating).toMatchObject({
    ok: false,
    error: { code: 'SESSION_CHANGED' }
  })
})

it('resumes a committed staged creation after losing its ACK without reopening its frozen source or closed upload', async () => {
  let captures = 0
  const assetId = '00000000-0000-4000-8000-000000000001'
  const t = make({
    captureOriginal: async () => {
      captures++
      if (captures > 1) throw Error('Original source no longer available')
      return {
        sourceRevision: 'frozen-assets',
        capturedAt: '2026-09-09T00:00:00.000Z',
        snapshot: {
          canvas: {
            files: [{ id: 'file', name: 'document.txt', assetId }],
            artifacts: []
          },
          history: [{ id: 'q', role: 'user', text: 'Previously reviewed question' }]
        },
        assets: [
          {
            assetId,
            name: 'document.txt',
            contentType: 'text/plain',
            size: 4,
            open: async () => new Blob(['data'])
          }
        ]
      }
    }
  })
  const base = t.client.request
  let committed = false
  let stageCount = 0
  const bodies: any[] = []
  t.client.request = async (e) => {
    if (e.kind === 'upload.create')
      return {
        uploadId: 'upload',
        boardId: committed ? 'created-board' : null
      } as any
    if (e.kind === 'asset.stage') {
      stageCount++
      if (committed)
        throw Object.assign(Error('closed'), {
          code: 'UPLOAD_CLOSED',
          status: 409
        })
      return { assetId } as any
    }
    if (e.kind === 'board.create') {
      bodies.push(structuredClone(e.body))
      if (!committed) {
        committed = true
        throw Object.assign(Error('lost response'), {
          code: 'NETWORK_ERROR',
          retryable: true
        })
      }
      return {
        board: { ...t.snapshot().board, boardId: 'created-board' }
      } as any
    }
    return base(e)
  }
  await t.service.start()
  const favorite = t.store.addFavorite({
    sessionId: 'original',
    title: 'Original'
  })
  expect(
    (
      await t.service.invoke('board.create', {
        favoriteId: favorite.favoriteId
      })
    ).ok
  ).toBe(false)
  expect(await t.service.invoke('board.create', {
    favoriteId: favorite.favoriteId, captureId: 'board-only-preview', includeHistory: false
  })).toMatchObject({ ok: false, error: { code: 'SHARE_SCOPE_CHANGED' } })
  expect(bodies).toHaveLength(1)
  expect(
    await t.service.invoke('board.create', {
      favoriteId: favorite.favoriteId
    })
  ).toMatchObject({
    ok: true,
    value: { board: { boardId: 'created-board' } }
  })
  expect(captures).toBe(1)
  expect(stageCount).toBe(1)
  expect(bodies[1]).toEqual(bodies[0])
  expect(t.store.account('u').creates[favorite.favoriteId]).toBeUndefined()
})

it('accepts a cleared presence cursor and enforces the 100-node transient selection hint limit', async () => {
  const t = make()
  await ready(t)
  expect(
    await t.service.invoke('presence.update', {
      boardId: 'board',
      cursor: null,
      selectedIds: Array.from({ length: 100 }, (_, i) => `n-${i}`)
    })
  ).toMatchObject({ ok: true })
  expect(
    await t.service.invoke('presence.update', {
      boardId: 'board',
      selectedIds: Array.from({ length: 101 }, (_, i) => `n-${i}`)
    })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  const preview = {
    collection: 'artifacts',
    nodeId: 'n',
    x: 1,
    y: 2,
    width: 300,
    height: 200
  }
  expect(
    await t.service.invoke('presence.update', {
      boardId: 'board',
      previews: [preview]
    })
  ).toMatchObject({ ok: true })
  expect(
    await t.service.invoke('presence.update', {
      boardId: 'board',
      previews: [{ ...preview, nodeId: 'missing' }]
    })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  expect(
    await t.service.invoke('presence.update', {
      boardId: 'board',
      selectedIds: Array(100).fill('x'.repeat(128))
    })
  ).toMatchObject({ ok: false, error: { code: 'INVALID_REQUEST' } })
  t.setRole('viewer')
  await t.service.receiveBoard('board', t.snapshot())
  expect(
    await t.service.invoke('presence.update', {
      boardId: 'board',
      previews: [preview]
    })
  ).toMatchObject({ ok: false, error: { code: 'READ_ONLY' } })
  expect(
    await t.service.invoke('presence.update', {
      boardId: 'board',
      cursor: null,
      selectedIds: [],
      previews: []
    })
  ).toMatchObject({ ok: true })
})

it.each(['event-first', 'ack-first'] as const)(
  'settles an accepted owner cancel after broadcast-before-ACK (%s)',
  async (order) => {
    const t = make()
    await ready(t)
    const base = t.client.request
    const reads: Array<() => void> = []
    let accepted = false
    t.client.request = async (e) => {
      const response = await base(e)
      if (e.kind === 'board.command' && e.body.action === 'cancel') {
        accepted = true
        t.watches
          .find((w) => w.scope.scope === 'board' && !w.closed)!
          .listener({ type: 'accessRevoked', reason: 'STALE_EPOCH' })
        return { ...response, epoch: 2 }
      }
      if (e.kind === 'board.get' && accepted) {
        const fresh = {
          ...response,
          board: {
            ...response.board,
            sharingEpoch: 2,
            sharingState: 'ownerOnly'
          }
        }
        if (reads.length < 2)
          return new Promise((resolve) => reads.push(() => resolve(fresh)))
        return fresh
      }
      return response
    }
    const cancelling = t.service.invoke('board.cancel', { boardId: 'board' })
    for (let i = 0; i < 30 && reads.length < 2; i++)
      await new Promise((r) => setImmediate(r))
    expect(reads).toHaveLength(2)
    const first = order === 'event-first' ? 0 : 1
    reads[first]!()
    await new Promise((r) => setImmediate(r))
    reads[1 - first]!()
    const reply = await cancelling
    expect(reply).toMatchObject({
      ok: true,
      value: { operationId: t.sent[0].body.operationId, seq: 1 }
    })
    expect(t.sent.filter((e) => e.body.action === 'cancel')).toHaveLength(1)
    expect(t.store.account('u').pending).toHaveLength(0)
    expect(t.store.account('u').checkpoints.board!.board.sharingEpoch).toBe(2)
    expect(t.service.getSnapshot().current).toMatchObject({
      permissions: { read: true, manage: true },
      board: { sharingState: 'ownerOnly' }
    })
  }
)

it.each(['network', 'account', 'revoked'] as const)(
  'does not settle accepted owner cancel after %s failure during fresh authorization',
  async (failure) => {
    const t = make()
    await ready(t)
    const base = t.client.request
    const reads: Array<() => void> = []
    let accepted = false
    t.client.request = async (e) => {
      const response = await base(e)
      if (e.kind === 'board.command') {
        accepted = true
        t.watches
          .find((w) => w.scope.scope === 'board' && !w.closed)!
          .listener({ type: 'accessRevoked', reason: 'STALE_EPOCH' })
        return { ...response, epoch: 2 }
      }
      if (e.kind === 'board.get' && accepted) {
        if (reads.length < 2)
          return new Promise((resolve) =>
            reads.push(() =>
              resolve({
                ...response,
                board: {
                  ...response.board,
                  sharingEpoch: 2,
                  sharingState: 'ownerOnly'
                }
              })
            )
          )
        if (failure === 'account') t.account.generation++
        throw Object.assign(Error(failure), {
          code: failure === 'revoked' ? 'ACCESS_DENIED' : 'NETWORK_ERROR'
        })
      }
      return response
    }
    const cancelling = t.service.invoke('board.cancel', { boardId: 'board' })
    for (let i = 0; i < 30 && reads.length < 2; i++)
      await new Promise((r) => setImmediate(r))
    expect(reads).toHaveLength(2)
    reads[0]!()
    await new Promise((r) => setImmediate(r))
    reads[1]!()
    expect(await cancelling).toMatchObject({ ok: false })
    expect(t.sent).toHaveLength(1)
    if (failure === 'revoked')
      expect(t.service.getSnapshot().current!.permissions.read).toBe(false)
  }
)

it('hydrates retained invitation rows when role and terminal events use new notification IDs', async () => {
  const t = make()
  await ready(t)
  const watch = t.watches.find(
    (w) => w.scope.scope === 'notifications' && !w.closed
  )!
  const n = {
    notificationId: 'first',
    eventVersion: 1,
    type: 'invitation',
    boardId: 'board',
    boardTitle: 'Board',
    createdAt: 1,
    readAt: null,
    invitation: {
      invitationId: 'invite',
      version: 1,
      status: 'pending',
      role: 'editor'
    }
  }
  watch.listener({ type: 'notification', notification: n })
  await new Promise((r) => setImmediate(r))
  watch.listener({
    type: 'notification',
    notification: {
      ...n,
      notificationId: 'role',
      eventVersion: 2,
      invitation: { ...n.invitation, version: 2, role: 'viewer' }
    }
  })
  await new Promise((r) => setImmediate(r))
  expect(
    t.service
      .getSnapshot()
      .notifications.notifications.find((n) => n.notificationId === 'first')!
      .invitation
  ).toMatchObject({ version: 2, role: 'viewer' })
  watch.listener({
    type: 'notification',
    notification: {
      ...n,
      notificationId: 'revoked',
      eventVersion: 2,
      type: 'invitationCancelled',
      invitation: { ...n.invitation, version: 2, status: 'cancelled' }
    }
  })
  await new Promise((r) => setImmediate(r))
  expect(
    t.service
      .getSnapshot()
      .notifications.notifications.every(
        (n) => n.invitation?.status === 'cancelled'
      )
  ).toBe(true)
})
it('Task4 main actions preserve request context and return independent personal import', async () => {
  let captured: any
  const m = make({
    submitRequest: async (i: any) => {
      captured = i
      return {
        accepted: false,
        clientMutationId: i.clientMutationId,
        state: 'pending'
      }
    },
    personalImport: (id: string) => ({
      history: [{ id: 'old', role: 'user', text: id }]
    })
  } as any)
  await ready(m)
  const result = await m.service.invoke('request.submit', {
    boardId: 'board',
    text: 'q',
    clientMutationId: 'task4-m',
    context: {
      scope: 'references',
      references: [{ collection: 'artifacts', nodeId: 'n' }]
    }
  })
  expect(result.ok).toBe(true)
  expect(captured.context.references[0].nodeId).toBe('n')
  const imported = await m.service.invoke('import.get', {
    localSessionId: 'personal'
  })
  expect(imported.ok).toBe(true)
})
it('publishes an atomic local canvas/revision pair through deferred materialization and account reset', async () => {
  let hold = false,
    release!: () => void
  const t = make({
    materializeBoard: async (input) => {
      if (hold) await new Promise<void>((r) => (release = r))
      const canvas = structuredClone(input.canvas)
      for (const n of canvas.files) {
        n.collaborationAssetId = n.assetId
        delete n.assetId
        n.path = '/owned/' + n.id
        n.authorizationId = 'local-grant'
        n.contentType = 'text/plain'
      }
      return canvas
    }
  })
  const before = await ready(t)
  hold = true
  const remote = t.remote((c) =>
    c.files.push({
      id: 'file',
      assetId: 'cloud',
      name: 'evidence.txt',
      contentType: 'text/plain',
      source: 'computer',
      x: 0,
      y: 0
    })
  )
  await new Promise((r) => setTimeout(r, 0))
  ;(t.service as any).emitState()
  const during = t.service.getSnapshot().current!
  expect(during.canvas).toEqual(before.canvas)
  expect(during.canvasRevision).toBe(before.canvasRevision)
  expect(during.permissions.read).toBe(true)
  expect(
    t.service.readCanvasStorage(
      'sherlock.research.canvas.files.v1:shared-session'
    )
  ).toBe('[]')
  release()
  await remote
  const after = t.service.getSnapshot().current!
  expect(after.canvas.files[0]!.path).toBe('/owned/file')
  expect(after.canvas.files[0]!.assetId).toBeUndefined()
  expect(after.canvasRevision).not.toBe(before.canvasRevision)
  const late = t.remote((c) => (c.files[0].name = 'changed.txt'))
  await new Promise((r) => setTimeout(r, 0))
  t.account.authenticated = false
  t.account.generation++
  for (const listener of t.accountListeners) listener()
  release()
  await expect(late).rejects.toThrow()
  expect(t.service.getSnapshot().current).toBeNull()
  expect(
    t.service.readCanvasStorage(
      'sherlock.research.canvas.files.v1:shared-session'
    )
  ).toBe('[]')
})

it('keeps viewer copy authority alive through an ordinary content snapshot while still aborting epoch changes', async () => {
  let captured: AbortSignal | undefined, release: any
  const t = make({
    preparePersonalCopy: async (i) => {
      captured = i.signal
      await new Promise((r) => (release = r))
      i.signal.throwIfAborted()
      return { copyId: 'copy', title: 'copy' }
    }
  })
  t.setRole('viewer')
  await t.service.start()
  await t.service.invoke('board.open', { boardId: 'board' })
  const pending = t.service.invoke('board.copyPersonal', { boardId: 'board' })
  await new Promise((r) => setTimeout(r, 0))
  await t.remote((c) => (c.artifacts[0].excerpt = 'remote update'))
  expect(captured?.aborted).toBe(false)
  release()
  expect((await pending).ok).toBe(true)
  const second = t.service.invoke('board.copyPersonal', { boardId: 'board' })
  await new Promise((r) => setTimeout(r, 0))
  t.revoke()
  await t.service.receiveBoard('board', t.snapshot())
  expect(captured?.aborted).toBe(true)
  release()
  expect((await second).ok).toBe(false)
})

it('retires durable former-editor writes when the first cold-start snapshot is viewer', async () => {
  const t = make()
  const view = await ready(t)
  t.setOnline(false)
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.excerpt = 'unsent editor intent'
  await t.service.invoke('canvas.apply', {
    boardId: 'board',
    localSessionId: 'shared-session',
    baseRevision: view.canvasRevision,
    clientMutationId: 'cold-downgrade',
    canvas
  })
  await t.service.flush()
  expect(t.store.account('u').pending).toHaveLength(1)
  t.service.stop()
  t.setRole('viewer')
  t.setOnline(true)
  const store = new ResearchBoardsStore(t.dir)
  const resumed = new ResearchBoardsService({
    store,
    storage: t.storage,
    account: t.account,
    client: t.client as never
  })
  services.push(resumed)
  await resumed.start()
  await resumed.invoke('board.open', { boardId: 'board' })
  await resumed.flush()
  expect(store.account('u').pending).toHaveLength(0)
  expect(projectDocument(t.doc).artifacts[0]!.excerpt).toBe('abc')
  expect(JSON.stringify(store.account('u').recoveries)).toContain(
    'unsent editor intent'
  )
})

import { ResearchBoardIntegration } from '../src/main/research-board-integration'
import {
  ResearchFilePreviewRegistry,
  FileResearchPreviewAuthorizationStorage
} from '../src/main/state/research-file-preview'
import { readFileSync, realpathSync } from 'node:fs'
it('shares a frozen canvas and authorized files without exporting private saved history', async () => {
  const hooks: ResearchBoardHooks = {}
  const t = make(hooks)
  const sessionId = 'original'
  const privatePath = '/Users/example/Documents/指数 原型.html'
  const events = [{
    type: 'assistant/message', surfaceOp: 'append',
    data: { message: { id: 'answer', content: [{ type: 'text', text: `已读取 ${privatePath}` }] } }
  }]
  let historyReads = 0
  const root = realpathSync(t.dir)
  const registry = new ResearchFilePreviewRegistry({
    storage: new FileResearchPreviewAuthorizationStorage(t.dir)
  })
  const integration = new ResearchBoardIntegration({
    root: join(root, 'integration'),
    storage: t.storage,
    registry,
    clipboard: () => undefined,
    client: t.client as any,
    service: () => t.service,
    runtimeUrl: () => null,
    runtimeToken: 'fixture',
    revealFile() {},
    invalidate() {},
    runtimeRequest: async (action) => {
      expect(action).toBe('history')
      historyReads++
      return { revision: 'saved', history: exportHumanHistory(events) }
    }
  })
  Object.assign(hooks, integration.hooks)
  const filePath = join(root, 'board-source.txt')
  writeFileSync(filePath, 'board data')
  const grant = await registry.admitFinder({ path: filePath, sessionId, nodeId: 'source-file' })
  expect(grant).not.toBeNull()
  t.storage.setItem(`sherlock.research.canvas.files.v1:${sessionId}`, JSON.stringify([
    { id: 'source-file', name: 'board-source.txt', path: filePath, authorizationId: grant!.authorizationId }
  ]))
  t.storage.setItem(`sherlock.research.canvas.artifacts.v1:${sessionId}`, JSON.stringify([
    { id: 'market', kind: 'pasted-text', title: '市场概览', excerpt: '看板内容' }
  ]))
  const { favoriteId } = t.store.addFavorite({ sessionId, title: '指数运营研究' })
  const base = t.client.request
  const staged: any[] = []
  const created: any[] = []
  t.client.request = async (e: any) => {
    if (e.kind === 'upload.create') return { uploadId: 'upload', boardId: null } as any
    if (e.kind === 'asset.stage') {
      staged.push(e)
      return { assetId: e.assetId } as any
    }
    if (e.kind === 'board.create') {
      created.push(e.body)
      return { board: { ...t.snapshot().board, boardId: 'created-board' } } as any
    }
    return base(e)
  }
  await t.service.start()
  expect(await t.service.invoke('board.previewCapture', { favoriteId })).toMatchObject({
    ok: false, error: { code: 'PRIVATE_PATH_IN_HISTORY' }
  })
  const preview = await t.service.invoke('board.previewCapture', { favoriteId, includeHistory: false })
  expect(preview).toMatchObject({ ok: true, value: { nodeCount: 2, historyCount: 0, assetBytes: 10 } })
  expect(created).toEqual([])
  expect(staged).toEqual([])
  if (!preview.ok) throw Error(preview.error.code)
  const { captureId } = preview.value as { captureId: string }
  expect(await t.service.invoke('board.create', { favoriteId, captureId, includeHistory: false })).toMatchObject({
    ok: true, value: { board: { boardId: 'created-board' } }
  })
  expect(created[0].snapshot.history).toEqual([])
  expect(created[0].snapshot.canvas.artifacts[0]).toMatchObject({ title: '市场概览', excerpt: '看板内容' })
  expect(created[0].snapshot.canvas.files[0]).toMatchObject({ name: 'board-source.txt', assetId: staged[0].assetId })
  expect(JSON.stringify(created)).not.toContain(privatePath)
  expect(JSON.stringify(created)).not.toContain(filePath)
  expect(staged).toHaveLength(1)
  expect(await new Response(staged[0].data).text()).toBe('board data')
  expect(historyReads).toBe(1)
})

it.each(['preview-file', 'nonpreview-file', 'artifact', 'concurrent-file'])(
  'restores deleted %s through production materialization without reimporting cloud assets',
  async (kind) => {
    const hooks: ResearchBoardHooks = {}
    const t = make(hooks)
    const registry = new ResearchFilePreviewRegistry({
      storage: new FileResearchPreviewAuthorizationStorage(t.dir)
    })
    const originalRequest = t.client.request
    const assets: string[] = []
    t.client.request = async (e: any) => {
      if (e.kind === 'asset.get') {
        assets.push(e.assetId)
        return new Response('authorized cloud bytes', {
          headers: { 'content-type': 'text/plain' }
        }) as any
      }
      if (e.kind === 'asset.add') throw Error('RESTORE_MUST_NOT_REUPLOAD')
      return originalRequest(e)
    }
    let opened = ''
    const integration = new ResearchBoardIntegration({
      root: join(realpathSync(t.dir), 'integration'),
      runtimeRequest: async (action, body) => {
        if (action === 'directory' && body.mode === 'ensure') return {path:realpathSync(t.dir)}
        throw Error('UNEXPECTED_RUNTIME_REQUEST')
      },
      storage: t.storage,
      registry,
      clipboard: () => undefined,
      client: t.client as any,
      service: () => t.service,
      runtimeUrl: () => null,
      runtimeToken: 'fixture',
      revealFile: (path) => {
        opened = path
      },
      invalidate() {}
    })
    Object.assign(hooks, integration.hooks)
    const initial = projectDocument(t.doc)
    applyCanvasDiff(t.doc, initial, {
      ...initial,
      files: [
        {
          id: 'f',
          name: 'cloud.txt',
          assetId: 'cloud-asset',
          previewEligible: kind === 'preview-file' || kind === 'concurrent-file',
          x: 0,
          y: 0,
          width: 200,
          height: 100
        }
      ]
    })
    const view = await ready(t)
    const canvas = structuredClone(view.canvas)
    const collection = kind === 'artifact' ? 'artifacts' : 'files'
    const oldId = canvas[collection][0]!.id
    canvas[collection] = []
    const removed: any = await t.service.invoke('canvas.apply', {
      boardId: 'board',
      localSessionId: 'shared-session',
      baseRevision: view.canvasRevision,
      clientMutationId: 'delete-file',
      canvas
    })
    expect(removed.ok).toBe(true)
    await t.service.flush()
    const undo: any = await t.service.invoke('canvas.undo', {
      boardId: 'board',
      localSessionId: 'shared-session'
    })
    expect(undo.error.code).toBe('DELETION_RECOVERY_REQUIRED')
    let releaseMaterialization!: () => void
    let enteredMaterialization!: () => void
    const held = new Promise<void>((resolve) => {
      releaseMaterialization = resolve
    })
    const entered = new Promise<void>((resolve) => {
      enteredMaterialization = resolve
    })
    if (kind === 'concurrent-file') {
      const materialize = hooks.materializeBoard!
      let holdOnce = true
      hooks.materializeBoard = async (input) => {
        if (holdOnce) {
          holdOnce = false
          enteredMaterialization()
          await held
        }
        return materialize(input)
      }
    }
    const restoration = t.service.invoke('recovery.restoreDeletion', {
      boardId: 'board',
      recoveryId: undo.error.details.recoveryId
    })
    if (kind === 'concurrent-file') {
      await entered
      // The restore has captured its canvas; a teammate now changes both
      // an existing field and canvas membership during asset materialization.
      await t.remote((next) => {
        next.artifacts[0].excerpt = 'teammate edit during restoration'
        next.artifacts.push({
          id: 'teammate-new',
          kind: 'pasted-text',
          title: 'New shared note',
          excerpt: 'teammate new node'
        })
      })
      releaseMaterialization()
    }
    const restored: any = await restoration
    expect(restored.ok, JSON.stringify(restored)).toBe(true)
    await t.service.flush()
    const canonical = projectDocument(t.doc)
    if (kind === 'concurrent-file')
      expect(canonical.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'n',
            excerpt: 'teammate edit during restoration'
          }),
          expect.objectContaining({
            id: 'teammate-new',
            excerpt: 'teammate new node'
          })
        ])
      )
    expect(canonical[collection]).toHaveLength(1)
    expect(canonical[collection][0]!.id).not.toBe(oldId)
    expect(canonical.files[0]!.assetId).toBe('cloud-asset')
    expect(canonical[collection].some((n) => n.id === oldId)).toBe(false)
    const fileId = canonical.files[0]!.id
    const openedResult = await t.service.invoke('file.open', {
      boardId: 'board',
      localSessionId: 'shared-session',
      nodeId: fileId
    })
    expect(openedResult.ok).toBe(true)
    expect(readFileSync(opened, 'utf8')).toBe('authorized cloud bytes')
    expect(assets).toEqual(['cloud-asset'])
  }
)
it('records personal board content edits, preserves edit time on selection and identical rehydration', () => {
  const t = make()
  t.store.addFavorite({ sessionId: 'original', title: 'Original' })
  const key = 'sherlock.research.canvas.artifacts.v1:original'
  t.service.writeCanvasStorage(key, '[{"id":"note","x":10}]')
  const stamp = t.service.getSnapshot().favorites[0]!.updatedAt
  expect(stamp).toBeGreaterThan(0)
  t.service.writeCanvasStorage(
    'sherlock.research.canvas.selection.v1:original',
    '{}'
  )
  t.service.writeCanvasStorage(key, '[{"id":"note","x":10}]')
  expect(t.service.getSnapshot().favorites[0]!.updatedAt).toBe(stamp)
})

it('keeps sharing authority and refreshed file materialization when moving a board to a new workspace session', async () => {
  const materialized: string[] = []
  const t = make({
    directory: async () => ({ localSessionId: 'workspace-session', path: '/workspace/board' }),
    materializeBoard: async input => { materialized.push(input.localSessionId); return input.canvas }
  })
  await ready(t)
  const input = { mode: 'workspace', sessionId: 'shared-session', title: 'Board', basePath: '/workspace' }
  expect((await t.service.invoke('local.directory', input)).ok).toBe(true)
  expect(t.store.account('u').bindings.board).toBe('workspace-session')
  expect(t.service.isSharedSession('workspace-session')).toBe(true)
  expect(t.service.isSharedSession('shared-session')).toBe(true)
  expect(materialized.at(-1)).toBe('workspace-session')
  expect((await t.service.invoke('local.directory', input)).ok).toBe(true)
  await t.service.invoke('board.unpin', { boardId: 'board' })
  await t.service.invoke('board.activate', { localSessionId: 'workspace-session' })
  const view = t.service.getSnapshot().current!
  const canvas = structuredClone(view.canvas)
  canvas.artifacts[0]!.title = "After move"
  expect((await t.service.invoke('canvas.apply', { boardId: 'board', localSessionId: 'workspace-session', baseRevision: view.canvasRevision, clientMutationId: 'after-move', canvas })).ok).toBe(true)
  expect(t.service.getSnapshot().boards[0]?.pinned).toBe(false)
  expect((await t.service.invoke('canvas.apply', { boardId: 'board', localSessionId: 'shared-session', baseRevision: view.canvasRevision, clientMutationId: 'old-session', canvas })).ok).toBe(false)
})

it('overlays local generation progress without changing the shared document or exposing it across accounts', async () => {
 const t=make();await ready(t)
 const snapshot=t.snapshot();snapshot.tasks=[{taskId:'progress',targetId:'n',status:'running',createdAt:123}]
 await t.service.receiveBoard('board',snapshot)
 const before=JSON.stringify(t.service.readSharedCanvas('shared-session'))
 t.service.setLocalTaskProgress('u','board','progress',{events:[{seq:1,type:'tool-started',tool:'查询金融数据'}],lastActivityAt:456,outputChars:1200})
 const node=t.service.getSnapshot().current!.canvas.artifacts[0]!
 expect(node.generationEvents).toEqual([{seq:1,type:'tool-started',tool:'查询金融数据'}]);expect(node.generationOutputChars).toBe(1200);expect(node.generationStartedAt).toBe(123)
 expect(JSON.stringify(t.service.readSharedCanvas('shared-session'))).toBe(before)
 expect(()=>t.service.setLocalTaskProgress('another-account','board','progress',{events:[],lastActivityAt:999,outputChars:0})).toThrow()
 snapshot.tasks[0]!.status='completed';await t.service.receiveBoard('board',snapshot)
 expect(t.service.getSnapshot().current!.canvas.artifacts[0]!.generationEvents).toBeUndefined()
})

it('keeps shared preview cleanup local and durable without allowing direct shared canvas writes', async () => {
  const t=make(); await ready(t)
  const key='sherlock.research.canvas.preview-revocations.v1:shared-session'
  expect(t.service.writeCanvasStorage(key,'["file-test"]')).toBe(true)
  expect(t.service.readCanvasStorage(key)).toBe('["file-test"]')
  expect(t.storage.getItem(key)).toBe('["file-test"]')
  expect(t.service.writeCanvasStorage(key,'[{}]')).toBe(false)
  expect(t.service.writeCanvasStorage('sherlock.research.canvas.files.v1:shared-session','[]')).toBe(false)
  expect(t.service.writeCanvasStorage(key,'[]')).toBe(true)
})


it('coalesces refreshes requested after an in-flight snapshot into a fresh read', async () => {
  const t = make()
  await ready(t)
  const original = t.client.request
  const stale = t.snapshot()
  const latest = structuredClone(stale)
  latest.seq = latest.board.seq = 1
  latest.messages = [{ messageId: 'answer', role: 'assistant', text: 'Fresh result' }] as any
  let release!: (snapshot: BoardSnapshot) => void
  let reads = 0
  t.client.request = async (request: any) => {
    if (request.kind === 'board.get') {
      reads++
      if (reads === 1) return await new Promise<BoardSnapshot>(resolve => { release = resolve })
      return latest
    }
    return original(request)
  }
  const beforeCompletion = t.service.refresh()
  await vi.waitFor(() => expect(reads).toBe(1))
  const afterCompletion = Array.from({ length: 4 }, () => t.service.refresh())
  release(stale)
  await Promise.all([beforeCompletion, ...afterCompletion])
  expect(reads).toBe(2)
  expect(t.service.getSnapshot().current!.messages).toEqual(latest.messages)
})

it('publishes completed replies while assets materialize and keeps the canvas revision paired', async () => {
  let hold = false
  let release!: () => void
  const t = make({ materializeBoard: async input => {
    if (hold) await new Promise<void>(resolve => { release = resolve })
    return input.canvas
  } })
  const before = await ready(t)
  const events: any[] = []
  t.service.subscribe(event => events.push(event))
  hold = true
  const snapshot = t.snapshot()
  snapshot.seq = snapshot.board.seq = 1
  snapshot.messages = [{ messageId: 'answer', role: 'assistant', text: 'Done' }] as any
  snapshot.tasks = [{ taskId: 'task', status: 'completed' }] as any
  const received = t.service.receiveBoard('board', snapshot)
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  const delivered = events.filter(event => event.type === 'board').at(-1)?.view
  release()
  await received
  expect(delivered?.messages).toEqual(snapshot.messages)
  expect(delivered?.tasks[0].status).toBe('completed')
  expect(delivered?.canvasRevision).toBe(before.canvasRevision)
  expect(delivered?.canvas).toEqual(before.canvas)
})

it('exposes local discussion task progress without a canvas target or executor secrets', async () => {
  const t = make()
  await ready(t)
  const snapshot = t.snapshot()
  snapshot.tasks = [{ taskId: 'discussion', targetId: null, status: 'running', leaseToken: 'secret', contextSnapshot: { private: true } }] as any
  await t.service.receiveBoard('board', snapshot)
  const progress = { startedAt: 123, events: [{ seq: 1, type: 'tool-started', tool: '查询金融数据' }], lastActivityAt: 456, outputChars: 1200 }
  t.service.setLocalTaskProgress('u', 'board', 'discussion', progress)
  const task = t.service.getSnapshot().current!.tasks[0] as any
  expect(task.progress).toEqual(progress)
  expect(task.leaseToken).toBeUndefined()
  expect(task.contextSnapshot).toBeUndefined()
  expect(t.service.taskAuthority('u', 'board').snapshot.tasks[0]!.progress).toBeUndefined()
})


it('keeps competing discussion snapshots monotonic while older materialization finishes last', async () => {
  const releases: Array<() => void> = []
  let hold = false
  const t = make({ materializeBoard: async input => {
    if (hold) await new Promise<void>(resolve => releases.push(resolve))
    return input.canvas
  } })
  await ready(t)
  const events: any[] = []
  t.service.subscribe(event => { if (event.type === 'board') events.push(event) })
  hold = true
  const first = t.snapshot()
  first.seq = first.board.seq = 1
  first.tasks = [{ taskId: 'task', status: 'running' }] as any
  const second = structuredClone(first)
  second.seq = second.board.seq = 2
  second.tasks[0]!.status = 'completed'
  second.messages = [{ messageId: 'answer', role: 'assistant', text: 'Done' }] as any
  const receivingFirst = t.service.receiveBoard('board', first)
  const receivingSecond = t.service.receiveBoard('board', second)
  await vi.waitFor(() => expect(releases).toHaveLength(2))
  expect(events.map(event => event.view.seq)).toEqual([1, 2])
  releases[1]!()
  await receivingSecond
  releases[0]!()
  await receivingFirst
  expect(events.map(event => event.view.seq)).toEqual([1, 2, 2, 2])
  expect(events.at(-1).view.messages).toEqual(second.messages)
  expect(events.every((event, index) => index === 0 || event.eventSeq > events[index - 1].eventSeq)).toBe(true)
})

it('does not republish a buffered reply or old canvas after access is revoked during materialization', async () => {
  let hold = false
  let release!: () => void
  const t = make({ materializeBoard: async input => {
    if (hold) await new Promise<void>(resolve => { release = resolve })
    return input.canvas
  } })
  await ready(t)
  const events: any[] = []
  t.service.subscribe(event => events.push(event))
  hold = true
  const snapshot = t.snapshot()
  snapshot.seq = snapshot.board.seq = 1
  snapshot.messages = [{ messageId: 'answer', role: 'assistant', text: 'Done' }] as any
  const received = t.service.receiveBoard('board', snapshot)
  const rejected = expect(received).rejects.toThrow()
  await vi.waitFor(() => expect(release).toBeTypeOf('function'))
  t.revoke()
  const watch = t.watches.filter(watch => watch.scope.scope === 'board' && !watch.closed).at(-1)!
  watch.listener({ type: 'accessRevoked' })
  await vi.waitFor(() => expect(t.service.getSnapshot().current!.permissions.read).toBe(false))
  const revokedAt = events.length
  release()
  await rejected
  for (const event of events.slice(revokedAt)) {
    const view = event.type === 'board' ? event.view : event.state?.current
    if (!view) continue
    expect(view.messages).toEqual([])
    expect(view.canvas).toEqual({ files: [], artifacts: [] })
  }
  expect(t.service.getSnapshot().current!.messages).toEqual([])
})
it('binds component transport to the active board, exact HTML version and editor permission', async () => {
  const { componentVersion } = await import('../packages/dsh-research-collaboration/component-state.js')
  const t=make();await ready(t)
  const html='<button>共享</button>'
  await t.remote(c=>{c.artifacts[0].containerSpec={version:1,type:'html',title:'共享',html}})
  const send=vi.fn();Object.assign(t.client,{sendComponent:send})
  const message={op:'join',nodeId:'n',version:componentVersion(html),peerId:'peer'}
  expect((await t.service.invoke('component.send',{boardId:'board',message})).ok).toBe(true)
  expect(send).toHaveBeenCalledWith('board',message)
  expect((await t.service.invoke('component.send',{boardId:'board',message:{...message,version:'old'}})).ok).toBe(false)
  expect((await t.service.invoke('component.send',{boardId:'other-board',message})).ok).toBe(false)
  t.setRole('viewer');await t.service.receiveBoard('board',t.snapshot())
  expect((await t.service.invoke('component.send',{boardId:'board',message})).ok).toBe(true)
  expect((await t.service.invoke('component.send',{boardId:'board',message:{...message,op:'input',inputId:'input',sequence:1,payload:{type:'increment'}}})).ok).toBe(false)
})

it('publishes shared content without changing existing compatibility geometry', async () => {
  const t = make()
  const view = await ready(t)
  const first = view.canvas.artifacts[0]!
  const canvas = { files: [], artifacts: [{ ...first, x: 680, width: 350, title: '共享标题' }] }
  const result = await t.service.invoke('canvas.apply', {
    boardId: 'board', localSessionId: 'shared-session', baseRevision: view.canvasRevision,
    clientMutationId: 'shared-content-only', canvas
  })
  expect(result.ok).toBe(true)
  await t.service.flush()
  expect(projectDocument(t.doc).artifacts[0]).toEqual({ ...first, title: '共享标题' })
})

it('keeps recovered tabs visible without writing guesses during stale and queued content edits', async () => {
  const t = make({ materializeBoard: async ({ canvas }) => {
    restoreUnassignedSharedBoardCards(canvas)
    return canvas
  } })
  await ready(t)
  await t.remote(canvas => canvas.artifacts.push({
    id: 'tabs', kind: 'generated-container', containerSpec: {
      version: 1, type: 'board-tabs', title: '页签', revision: 1,
      tabs: [{ id: 'first', name: '市场面', nodeIds: [] }, { id: 'next', name: '渠道', nodeIds: [] }]
    }
  }))
  const view = t.service.getSnapshot().current!
  const membership = (canvas: Canvas) => boardTabsSpec(canvas.artifacts.find(n => n.id === 'tabs')?.containerSpec)?.tabs.map(tab => tab.nodeIds)
  expect(membership(view.canvas)).toEqual([['n'], []])
  await t.remote((canvas: Canvas) => { canvas.artifacts.find(n => n.id === 'n')!.excerpt = '其他用户的修改' })

  const send = (revision: string, mutation: string, canvas: typeof view.canvas) =>
    t.service.invoke('canvas.apply', {
      boardId: 'board', localSessionId: 'shared-session', baseRevision: revision, clientMutationId: mutation, canvas
    })
  const edit = structuredClone(view.canvas)
  edit.artifacts.find(n => n.id === 'n')!.title = '第一次编辑'
  const first: any = await send(view.canvasRevision, 'legacy-tab-first', edit)
  expect(first.ok).toBe(true)
  edit.artifacts.find(n => n.id === 'n')!.title = '第二次编辑'
  const next: any = await send(first.value.localBranchRevision, 'legacy-tab-next', edit)
  expect(next.ok).toBe(true)
  expect(membership(next.value.canvas)).toEqual([['n'], []])
  await t.service.flush()
  const shared = projectDocument(t.doc)
  expect(membership(shared)).toEqual([[], []])
  expect(shared.artifacts.find(n => n.id === 'n')).toMatchObject({ title: '第二次编辑', excerpt: '其他用户的修改' })
})
