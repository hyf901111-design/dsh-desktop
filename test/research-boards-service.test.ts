import { afterEach, expect, it } from 'vitest'
import type { BoardSnapshot } from '../src/shared/research-boards'
import { mkdtempSync, rmSync } from 'node:fs'
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
    watch: (_scope: any, fn: (e: any) => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
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
it('keeps B changes when A undoes and never reports resurrecting a tombstoned node', async () => {
  const t = make()
  const view = await ready(t)
  const after = structuredClone(view.canvas)
  after.artifacts[0]!.x = 100
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
  const persisted = JSON.stringify(new ResearchBoardsStore(t.dir).account('u'))
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
  canvas.artifacts[0]!.x = 10
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
    t.store.account('u').checkpoints.board?.snapshot.canvas.artifacts[0]!.x
  ).toBe(10)
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
  canvas.artifacts[0]!.x = 20
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
    await t.service.invoke('board.create', { favoriteId: favorite.favoriteId })
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
    await t.service.invoke('board.create', { favoriteId: favorite.favoriteId })
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
  expect(JSON.stringify(t.store.account('u').recoveries)).toContain('rejected')
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
  expect(new ResearchBoardsStore(t.dir).account('u').auxiliary).toHaveLength(1)
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
  canvas.artifacts[0]!.x = 9
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
