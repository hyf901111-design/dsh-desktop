import { randomUUID } from 'node:crypto'
import * as Y from 'yjs'
import {
  applyCanvasDiff,
  decodeDocument,
  encodeDocument,
  freezeSnapshot,
  mergeDocumentUpdate,
  projectDocument,
  validateCanvas,
  type CanvasNode
} from 'dsh-research-collaboration/document'
import {
  fromBase64,
  toBase64,
  LIMITS
} from 'dsh-research-collaboration/protocol'
import {
  CollaborationClient,
  type CollaborationAccount,
  type CollaborationEndpoint,
  type CollaborationEvent
} from './collaboration-client'
import {
  ResearchBoardsStore,
  type Binding,
  type AuxiliaryRequest
} from './state/research-boards-store'
import type { ResearchCanvasStorage } from './state/research-canvas-storage'
import {
  registerTrustedMainWindowHandler,
  registerTrustedMainWindowListener,
  type TrustedWindow,
  type TrustedWindowEvent
} from './ipc-trust'
import {
  ResearchBoardsError,
  boardsError,
  type AccountView,
  type Board,
  type BoardSnapshot,
  type BoardView,
  type Canvas,
  type CanvasReply,
  type Favorite,
  type Notification,
  type NotificationView,
  type OwnChange,
  type PendingOperation,
  type Presence,
  type Recovery,
  type ResearchBoardsEvent,
  type ResearchBoardsState,
  type BoardsResult,
  type Snapshot
} from '../shared/research-boards'

type IdentityAccount = Pick<
  CollaborationAccount,
  'generation' | 'authenticated' | 'subscribeSessionChanged'
>
export type CapturedAsset = {
  assetId: string
  name: string
  contentType: string
  size: number
  open(): Promise<BodyInit>
}
export type ResearchBoardHooks = {
  captureOriginal?(input: {
    sessionId: string
    accountId: string
    accountGeneration: number
    operationId: string
    captureId?: string
    signal: AbortSignal
  }): Promise<{
    sourceRevision: string
    capturedAt: string
    snapshot: Snapshot
    assets?: CapturedAsset[]
    dispose?(): void | Promise<void>
  }>
  previewCapture?(input: {
    sessionId: string
    favoriteId: string
    accountId: string
    accountGeneration: number
    signal: AbortSignal
  }): Promise<{
    captureId: string
    sourceRevision: string
    nodeCount: number
    historyCount: number
    assetBytes: number
  }>
  materializeBoard?(input: {
    accountId: string
    boardId: string
    epoch: number
    localSessionId: string
    canvas: Canvas
    signal: AbortSignal
  }): Promise<Canvas>
  projectLocalCanvas?(input: {
    accountId: string
    accountGeneration: number
    boardId: string
    epoch: number
    localSessionId: string
    canvas: Canvas
    signal: AbortSignal
  }): Canvas | Promise<Canvas>
  revokeBoard?(input: {
    accountId: string
    boardId: string
    localSessionId?: string
  }): void | Promise<void>
  preparePersonalCopy?(input: {
    accountId: string
    boardId: string
    snapshot: BoardSnapshot
    signal: AbortSignal
  }): Promise<{ copyId: string; title: string }>
  finalizePersonalCopy?(input: {
    accountId: string
    copyId: string
    localSessionId: string
    signal: AbortSignal
  }): Promise<{ localSessionId: string }>
  submitRequest?(input: {
    accountId: string
    boardId: string
    text: string
    clientMutationId: string
    targetId?: string
    targetCollection?: 'files' | 'artifacts'
    source?: 'manual' | 'refresh'
    signal: AbortSignal
  }): Promise<unknown>
}
type Revision = { bytes: Uint8Array; canvas: Canvas }
type RuntimeBoard = {
  abort: AbortController
  snapshot: BoardSnapshot
  doc: Y.Doc
  undo: Y.UndoManager
  localOrigin: object
  revisions: Map<string, Revision>
  revision: string
  connection: BoardView['connection']
  presence: Presence[]
  materialized?: Canvas
  mutationReplies: Map<string, CanvasReply>
  deletionRecovery: Map<
    string,
    Array<{ collection: 'files' | 'artifacts'; node: CanvasNode }>
  >
}
type Options = {
  store: ResearchBoardsStore
  storage: ResearchCanvasStorage
  account: IdentityAccount
  client: CollaborationClient
  hooks?: ResearchBoardHooks
}
const copy = <T>(value: T): T => structuredClone(value)
const emptyCanvas = (): Canvas => ({ files: [], artifacts: [] })
const emptyNotifications = (): NotificationView => ({
  notifications: [],
  cursor: 0,
  unreadCount: 0,
  pendingCount: 0
})
const summaries = (recoveries: Recovery[]) =>
  recoveries.map(({ changes: _changes, ...rest }) => rest)
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b)
const safeId = (value: unknown): string => {
  if (
    typeof value !== 'string' ||
    !/^[-\w:.]{1,256}$/.test(value) ||
    ['__proto__', 'constructor', 'prototype'].includes(value)
  )
    throw new ResearchBoardsError('INVALID_REQUEST')
  return value
}
const text = (value: unknown, max = 512): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new ResearchBoardsError('INVALID_REQUEST')
  return value
}
function exact(
  value: unknown,
  required: string[],
  optional: string[] = []
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => ![...required, ...optional].includes(k)) ||
    required.some((k) => !Object.hasOwn(value, k))
  )
    throw new ResearchBoardsError('INVALID_REQUEST')
  return value as Record<string, unknown>
}
function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : ''
}
function denied(error: unknown) {
  return (
    !!error &&
    typeof error === 'object' &&
    (('status' in error && [403, 404].includes(Number(error.status))) ||
      [
        'ACCESS_DENIED',
        'NOT_MEMBER',
        'BOARD_NOT_FOUND',
        'NOT_FOUND',
        'MEMBERSHIP_REVOKED'
      ].includes(errorCode(error)))
  )
}
function changes(before: Canvas, after: Canvas): OwnChange[] {
  const result: OwnChange[] = []
  const field = (
    collection: 'files' | 'artifacts',
    nodeId: string,
    path: string[],
    a: unknown,
    b: unknown
  ) => {
    if (equal(a, b)) return
    if (typeof a === 'string' && typeof b === 'string') {
      let prefix = 0
      while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
        prefix++
      let suffix = 0
      while (
        suffix < a.length - prefix &&
        suffix < b.length - prefix &&
        a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
      )
        suffix++
      result.push({
        kind: 'insert',
        collection,
        nodeId,
        path,
        text: b.slice(prefix, b.length - suffix),
        removed: a.length - prefix - suffix
      })
      return
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      let prefix = 0
      while (
        prefix < a.length &&
        prefix < b.length &&
        equal(a[prefix], b[prefix])
      )
        prefix++
      let suffix = 0
      while (
        suffix < a.length - prefix &&
        suffix < b.length - prefix &&
        equal(a[a.length - 1 - suffix], b[b.length - 1 - suffix])
      )
        suffix++
      const oldEnd = a.length - suffix,
        newEnd = b.length - suffix
      for (let index = prefix; index < Math.max(oldEnd, newEnd); index++)
        field(
          collection,
          nodeId,
          [...path, String(index)],
          index < oldEnd ? a[index] : undefined,
          index < newEnd ? b[index] : undefined
        )
      return
    }
    if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        field(
          collection,
          nodeId,
          [...path, key],
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key]
        )
      return
    }
    result.push({
      kind: 'field',
      collection,
      nodeId,
      path,
      ...(b === undefined ? { removed: 1 } : { value: copy(b) })
    })
  }
  for (const collection of ['files', 'artifacts'] as const) {
    const previous = new Map(before[collection].map((n) => [n.id, n]))
    const next = new Map(after[collection].map((n) => [n.id, n]))
    for (const n of after[collection]) {
      const old = previous.get(n.id)
      if (!old)
        result.push({
          kind: 'create',
          collection,
          nodeId: n.id,
          value: copy(n)
        })
      else field(collection, n.id, [], old, n)
    }
    for (const id of previous.keys())
      if (!next.has(id)) result.push({ kind: 'delete', collection, nodeId: id })
  }
  return result
}
const ownerActions = new Set([
  'rename',
  'archive',
  'restore',
  'cancel',
  'reopen',
  'refreshPause',
  'invite',
  'revokeInvitation',
  'memberRole',
  'removeMember'
])
const taskActions = new Set([
  'taskCreate',
  'taskClaim',
  'taskHeartbeat',
  'taskResult',
  'taskStop'
])

export class ResearchBoardsService {
  readonly store: ResearchBoardsStore
  readonly client: CollaborationClient
  private accountView: AccountView
  private readonly boards = new Map<string, RuntimeBoard>()
  private readonly listeners = new Set<(event: ResearchBoardsEvent) => void>()
  private readonly reservations = new Map<
    string,
    { reservationId: string; generation: number }
  >()
  private readonly opening = new Map<string, Promise<RuntimeBoard>>()
  private readonly creating = new Map<string, Promise<unknown>>()
  private currentBoard: string | null = null
  private activeDispose?: () => void
  private notificationsDispose?: () => void
  private accountDispose: () => void
  private generationAbort = new AbortController()
  private stopped = false
  private eventSeq = 0
  private flushing?: Promise<void>
  private refreshPromise?: Promise<void>
  private retryTimer?: ReturnType<typeof setTimeout>
  constructor(private readonly options: Options) {
    this.store = options.store
    this.client = options.client
    this.accountView = {
      status: options.account.authenticated ? 'loading' : 'signedOut',
      generation: options.account.generation,
      user: null
    }
    this.accountDispose = options.account.subscribeSessionChanged(() =>
      this.resetAccount()
    )
  }
  subscribe(listener: (event: ResearchBoardsEvent) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit(
    event:
      | Omit<
          Extract<ResearchBoardsEvent, { type: 'state' }>,
          'eventSeq' | 'accountGeneration'
        >
      | Omit<
          Extract<ResearchBoardsEvent, { type: 'board' }>,
          'eventSeq' | 'accountGeneration'
        >
      | Omit<
          Extract<ResearchBoardsEvent, { type: 'presence' }>,
          'eventSeq' | 'accountGeneration'
        >
      | Omit<
          Extract<ResearchBoardsEvent, { type: 'access' }>,
          'eventSeq' | 'accountGeneration'
        >
  ) {
    if (this.stopped) return
    const value = {
      ...event,
      eventSeq: ++this.eventSeq,
      accountGeneration: this.options.account.generation
    } as ResearchBoardsEvent
    if (value.type === 'state') value.state.eventSeq = value.eventSeq
    for (const listener of this.listeners) {
      try {
        listener(copy(value))
      } catch {}
    }
  }
  private emitState() {
    this.emit({ type: 'state', state: this.getSnapshot() })
  }
  private emitBoard(boardId: string, cause: string) {
    const r = this.boards.get(boardId)
    if (r && this.currentBoard === boardId)
      this.emit({
        type: 'board',
        boardId,
        localSessionId: this.localSession(boardId),
        view: this.view(r),
        cause
      })
    this.emitState()
  }
  private userId() {
    const id = this.accountView.user?.userId
    if (
      !id ||
      this.accountView.generation !== this.options.account.generation ||
      !this.options.account.authenticated
    )
      throw new ResearchBoardsError('LOGIN_REQUIRED', '请先登录账户。')
    return id
  }
  private context() {
    return {
      generation: this.options.account.generation,
      userId: this.userId()
    }
  }
  private check(context: { generation: number; userId: string }) {
    if (
      this.stopped ||
      context.generation !== this.options.account.generation ||
      context.userId !== this.accountView.user?.userId
    )
      throw new ResearchBoardsError('SESSION_CHANGED')
  }
  private localSession(boardId: string) {
    const id = this.accountView.user?.userId
    return id ? (this.store.account(id).bindings[boardId] ?? null) : null
  }
  private permissions(r: RuntimeBoard) {
    const read =
      r.connection !== 'revoked' &&
      r.connection !== 'revalidating' &&
      !!this.accountView.user
    const edit =
      read &&
      r.snapshot.board.role !== 'viewer' &&
      r.snapshot.board.lifecycle === 'active' &&
      r.connection !== 'revalidating'
    return {
      read,
      edit,
      manage: read && r.snapshot.board.role === 'owner',
      execute: edit && r.connection === 'online'
    }
  }
  private view(r: RuntimeBoard): BoardView {
    const id = this.accountView.user?.userId
    const boardId = r.snapshot.board.boardId
    const account = id ? this.store.account(id) : undefined
    const permission = this.permissions(r)
    const read = permission.read
    return {
      boardId,
      localSessionId: this.localSession(boardId),
      board: copy(r.snapshot.board),
      connection: r.connection,
      permissions: permission,
      canvas: read
        ? copy(r.materialized ?? projectDocument(r.doc))
        : emptyCanvas(),
      canvasRevision: r.revision,
      seq: r.snapshot.seq,
      epoch: r.snapshot.board.sharingEpoch,
      history: read ? copy(r.snapshot.snapshot.history) : [],
      messages: read ? copy(r.snapshot.messages) : [],
      tasks: read
        ? r.snapshot.tasks.map((t) => {
            const {
              leaseToken: _lease,
              leaseHash: _hash,
              sessionHash: _session,
              contextSnapshot: _context,
              ...safe
            } = t
            return copy(safe) as typeof t
          })
        : [],
      members: read ? copy(r.snapshot.members) : [],
      presence: read ? copy(r.presence) : [],
      pendingCount:
        account?.pending.filter((p) => p.boardId === boardId).length ?? 0,
      canUndo: permission.edit && r.undo.canUndo(),
      canRedo: permission.edit && r.undo.canRedo(),
      recoveries: summaries(
        account?.recoveries.filter((p) => p.boardId === boardId) ?? []
      )
    }
  }
  getSnapshot(): ResearchBoardsState {
    const state = this.store.snapshot()
    const id = this.accountView.user?.userId
    const a = id ? this.store.account(id) : undefined
    return {
      version: 1,
      eventSeq: this.eventSeq,
      account: copy(this.accountView),
      favorites: state.favorites,
      boards:
        a?.boards.map((b) => ({
          ...b,
          pinned: !a.hidden.includes(b.boardId),
          ...(a.bindings[b.boardId]
            ? { localSessionId: a.bindings[b.boardId] }
            : {}),
          ...(a.sources[b.boardId]
            ? {
                sourceFavoriteId:
                  state.favorites.find(
                    (f) => f.sessionId === a.sources[b.boardId]!.sessionId
                  )?.favoriteId ?? a.sources[b.boardId]!.favoriteId
              }
            : {})
        })) ?? [],
      current:
        this.currentBoard && this.boards.has(this.currentBoard)
          ? this.view(this.boards.get(this.currentBoard)!)
          : null,
      notifications: copy(a?.notifications ?? emptyNotifications()),
      recoveries: summaries(a?.recoveries ?? [])
    }
  }
  async start() {
    if (this.options.account.authenticated) await this.refresh()
    else this.emitState()
  }
  private resetAccount() {
    const oldId = this.accountView.user?.userId
    this.generationAbort.abort()
    this.generationAbort = new AbortController()
    this.activeDispose?.()
    this.notificationsDispose?.()
    this.activeDispose = undefined
    this.notificationsDispose = undefined
    clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    this.refreshPromise = undefined
    for (const [boardId, r] of this.boards) {
      if (oldId) this.invalidateLocal(oldId, boardId)
      r.abort.abort()
      r.undo.destroy()
      r.doc.destroy()
    }
    this.boards.clear()
    this.currentBoard = null
    this.reservations.clear()
    this.opening.clear()
    this.creating.clear()
    this.accountView = {
      status: this.options.account.authenticated ? 'loading' : 'signedOut',
      generation: this.options.account.generation,
      user: null
    }
    this.emitState()
    if (this.options.account.authenticated) void this.refresh()
  }
  private retry() {
    if (this.retryTimer || this.stopped || !this.options.account.authenticated)
      return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.refresh()
    }, 5000)
    this.retryTimer.unref?.()
  }
  async refresh(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise
    const generation = this.options.account.generation
    const work = (async () => {
      if (!this.options.account.authenticated) return
      try {
        const me = await this.client.request<{
          user: { userId: string; publicId: string; username: string }
        }>({ kind: 'me' })
        if (generation !== this.options.account.generation || this.stopped)
          return
        safeId(me.user.userId)
        if (!/^\d{10}$/.test(me.user.publicId))
          throw new ResearchBoardsError('INVALID_RESPONSE')
        this.accountView = {
          status: 'ready',
          generation,
          user: {
            userId: me.user.userId,
            publicId: me.user.publicId,
            username: text(me.user.username, 512)
          }
        }
        const ctx = this.context()
        const list = await this.client.request<{ boards: Board[] }>({
          kind: 'boards.list'
        })
        this.check(ctx)
        if (!Array.isArray(list.boards))
          throw new ResearchBoardsError('INVALID_RESPONSE')
        const known = this.store.account(ctx.userId)
        for (const boardId of new Set([
          ...Object.keys(known.bindings),
          ...known.pending.map((p) => p.boardId)
        ]))
          if (!list.boards.some((b) => b.boardId === boardId))
            await this.revoke(boardId, 'ACCESS_DENIED')
        this.check(ctx)
        this.store.setBoards(ctx.userId, list.boards)
        if (
          this.currentBoard &&
          list.boards.some((b) => b.boardId === this.currentBoard)
        )
          await this.loadBoard(this.currentBoard, true)
        await this.flushAuxiliary()
        this.check(ctx)
        await this.catchUpNotifications()
        this.check(ctx)
        if (!this.notificationsDispose)
          this.notificationsDispose = this.client.watch(
            { scope: 'notifications' },
            (event) => {
              if (ctx.generation === this.options.account.generation)
                void this.notificationEvent(event, ctx)
            }
          )
        await this.flush()
        this.emitState()
      } catch (error) {
        if (generation !== this.options.account.generation || this.stopped)
          return
        this.accountView.status = this.accountView.user
          ? 'ready'
          : 'unavailable'
        for (const r of this.boards.values())
          if (r.connection !== 'revoked') r.connection = 'offline'
        this.emitState()
        this.retry()
      }
    })()
    this.refreshPromise = work
    try {
      await work
    } finally {
      if (this.refreshPromise === work) this.refreshPromise = undefined
    }
  }
  private async durableAuxiliary(
    request:
      | Omit<
          Extract<AuxiliaryRequest, { kind: 'invitation.respond' }>,
          'operationId'
        >
      | Omit<
          Extract<AuxiliaryRequest, { kind: 'notifications.read' }>,
          'operationId'
        >
  ) {
    const ctx = this.context()
    const existing = this.store
      .account(ctx.userId)
      .auxiliary.find(({ operationId: _id, ...body }) => equal(body, request))
    const operation: AuxiliaryRequest = existing ?? {
      ...request,
      operationId: randomUUID()
    }
    if (!existing)
      this.store.updateAccount(ctx.userId, (a) => a.auxiliary.push(operation))
    return this.sendAuxiliary(operation, ctx)
  }
  private async sendAuxiliary(
    operation: AuxiliaryRequest,
    ctx: { generation: number; userId: string }
  ): Promise<unknown> {
    try {
      const result =
        operation.kind === 'invitation.respond'
          ? await this.client.request<{ boardId: string }>({
              kind: 'invitation.respond',
              invitationId: operation.invitationId,
              body: {
                operationId: operation.operationId,
                version: operation.version,
                decision: operation.decision
              }
            })
          : await this.client.request({
              kind: 'notifications.read',
              ...(operation.notificationIds
                ? { notificationIds: operation.notificationIds }
                : {})
            })
      this.check(ctx)
      this.store.updateAccount(ctx.userId, (a) => {
        a.auxiliary = a.auxiliary.filter(
          (p) => p.operationId !== operation.operationId
        )
        if (operation.kind === 'notifications.read')
          for (const n of a.notifications.notifications)
            if (
              !operation.notificationIds ||
              operation.notificationIds.includes(n.notificationId)
            )
              n.readAt = Date.now()
      })
      if (
        operation.kind === 'invitation.respond' &&
        operation.decision === 'accept'
      )
        this.store.setPinned(
          ctx.userId,
          (result as { boardId: string }).boardId,
          true
        )
      return result
    } catch (error) {
      this.check(ctx)
      const status = (error as ResearchBoardsError).status
      if (status && status >= 400 && status < 500 && status !== 429)
        this.store.updateAccount(ctx.userId, (a) => {
          a.auxiliary = a.auxiliary.filter(
            (p) => p.operationId !== operation.operationId
          )
        })
      else this.retry()
      throw error
    }
  }
  private async flushAuxiliary() {
    const ctx = this.context()
    for (const operation of this.store.account(ctx.userId).auxiliary)
      await this.sendAuxiliary(operation, ctx)
  }
  private async catchUpNotifications() {
    const ctx = this.context()
    let cursor = this.store.account(ctx.userId).notifications.cursor
    for (let pages = 0; pages < 100; pages++) {
      const page = await this.client.request<NotificationView>({
        kind: 'notifications.list',
        after: cursor,
        limit: 50
      })
      this.check(ctx)
      this.mergeNotifications(page, ctx.userId)
      if (page.cursor <= cursor) break
      cursor = page.cursor
    }
  }
  private mergeNotifications(page: NotificationView, userId: string) {
    if (
      !Array.isArray(page.notifications) ||
      !Number.isSafeInteger(page.cursor) ||
      page.cursor < 0
    )
      throw new ResearchBoardsError('INVALID_RESPONSE')
    this.store.updateAccount(userId, (a) => {
      const map = new Map(
        a.notifications.notifications.map((n) => [n.notificationId, n])
      )
      for (const n of page.notifications) {
        const old = map.get(n.notificationId)
        if (!old || n.eventVersion >= old.eventVersion)
          map.set(n.notificationId, copy(n))
      }
      a.notifications = {
        notifications: [...map.values()]
          .filter((n) => n.invitation?.status === 'pending')
          .concat(
            [...map.values()]
              .filter((n) => n.invitation?.status !== 'pending')
              .sort((a, b) => b.createdAt - a.createdAt)
              .slice(0, 1000)
          )
          .sort((a, b) => b.createdAt - a.createdAt),
        cursor: Math.max(a.notifications.cursor, page.cursor),
        unreadCount: page.unreadCount,
        pendingCount: page.pendingCount
      }
    })
  }
  private async notificationEvent(
    event: CollaborationEvent,
    ctx: { generation: number; userId: string }
  ) {
    try {
      this.check(ctx)
      if (event.type === 'welcome') {
        await this.catchUpNotifications()
        this.check(ctx)
        this.emitState()
      } else if (event.type === 'notification') {
        const n = event.notification as Notification
        const a = this.store.account(ctx.userId).notifications
        this.mergeNotifications({ ...a, notifications: [n] }, ctx.userId)
        this.emitState()
        await this.catchUpNotifications()
        this.check(ctx)
        this.emitState()
      } else if (event.type === 'accessRevoked') {
        this.notificationsDispose?.()
        this.notificationsDispose = undefined
        void this.refresh()
      }
    } catch {
      this.retry()
    }
  }
  private revision(
    r: RuntimeBoard,
    bytes = encodeDocument(r.doc),
    canvas = projectDocument(r.doc)
  ): string {
    const token = randomUUID()
    r.revisions.set(token, {
      bytes: Uint8Array.from(bytes),
      canvas: copy(canvas)
    })
    if (r.revisions.size > 128) {
      const first = r.revisions.keys().next().value
      if (first) r.revisions.delete(first)
    }
    return token
  }
  private async loadBoard(
    boardId: string,
    force = false,
    replace = false
  ): Promise<RuntimeBoard> {
    const existing = this.boards.get(boardId)
    if (existing && !force && existing.connection !== 'revoked') return existing
    if (!replace && this.opening.has(boardId)) return this.opening.get(boardId)!
    const ctx = this.context()
    const task = (async () => {
      try {
        const snapshot = await this.client.request<BoardSnapshot>({
          kind: 'board.get',
          boardId
        })
        this.check(ctx)
        await this.receiveBoard(boardId, snapshot, replace)
        this.check(ctx)
        return this.boards.get(boardId)!
      } catch (error) {
        if (denied(error)) {
          this.check(ctx)
          await this.revoke(boardId, errorCode(error))
        }
        throw error
      }
    })()
    this.opening.set(boardId, task)
    try {
      return await task
    } finally {
      if (this.opening.get(boardId) === task) this.opening.delete(boardId)
    }
  }
  async receiveBoard(
    boardId: string,
    snapshot: BoardSnapshot,
    replace = false
  ): Promise<void> {
    const ctx = this.context()
    if (
      snapshot.board.boardId !== boardId ||
      !Array.isArray(snapshot.tombstones) ||
      !Array.isArray(snapshot.messages) ||
      !Array.isArray(snapshot.tasks) ||
      !['owner', 'editor', 'viewer'].includes(snapshot.board.role ?? '')
    )
      throw new ResearchBoardsError('INVALID_RESPONSE')
    validateCanvas(snapshot.snapshot.canvas)
    let r = this.boards.get(boardId)
    if (r && snapshot.seq < r.snapshot.seq) return
    const previousEpoch = r?.snapshot.board.sharingEpoch
    if (
      previousEpoch !== undefined &&
      snapshot.board.sharingEpoch < previousEpoch
    )
      return
    const retired =
      (previousEpoch !== undefined &&
        previousEpoch !== snapshot.board.sharingEpoch) ||
      snapshot.board.role === 'viewer' ||
      snapshot.board.lifecycle === 'archived'
    if (retired) {
      if (r) {
        r.abort.abort()
        r.connection = 'revalidating'
        this.emitBoard(boardId, 'permissions')
      }
      await this.retirePending(boardId, 'PERMISSION_CHANGED', false)
    }
    this.check(ctx)
    r = this.boards.get(boardId)
    if (r && snapshot.seq < r.snapshot.seq) return
    if (
      !r ||
      retired ||
      replace ||
      r.abort.signal.aborted ||
      r.connection === 'revoked' ||
      previousEpoch !== snapshot.board.sharingEpoch
    ) {
      r?.abort.abort()
      r?.undo.destroy()
      r?.doc.destroy()
      const doc = decodeDocument(fromBase64(snapshot.documentUpdate))
      const localOrigin = {}
      const undo = new Y.UndoManager(
        [doc.getMap('files'), doc.getMap('artifacts')],
        { trackedOrigins: new Set([localOrigin]), captureTimeout: 0 }
      )
      r = {
        abort: new AbortController(),
        snapshot: copy(snapshot),
        doc,
        undo,
        localOrigin,
        revisions: new Map(),
        revision: '',
        connection: 'online',
        presence: [],
        mutationReplies: new Map(),
        deletionRecovery: new Map()
      }
      this.boards.set(boardId, r)
    } else {
      mergeDocumentUpdate(
        r.doc,
        fromBase64(snapshot.documentUpdate),
        new Set(snapshot.tombstones)
      )
      r.snapshot = copy(snapshot)
      r.connection = 'online'
    }
    // HTTP snapshot validates permission for HTTP replay; WebSocket never carries queued writes.
    for (const pending of this.store
      .account(ctx.userId)
      .pending.filter(
        (p) =>
          p.boardId === boardId &&
          p.epoch === snapshot.board.sharingEpoch &&
          p.action === 'update'
      ))
      mergeDocumentUpdate(
        r.doc,
        fromBase64(pending.body.update as string),
        new Set(snapshot.tombstones)
      )
    r.revision = this.revision(r)
    this.store.updateAccount(ctx.userId, (a) => {
      a.checkpoints[boardId] = copy(snapshot)
      const i = a.boards.findIndex((b) => b.boardId === boardId)
      if (i >= 0) a.boards[i] = copy(snapshot.board)
      else a.boards.push(copy(snapshot.board))
    })
    await this.materialize(r, ctx)
    this.check(ctx)
    this.emitBoard(boardId, 'remote')
  }
  private async materialize(r: RuntimeBoard, ctx = this.context()) {
    const localSessionId = this.localSession(r.snapshot.board.boardId)
    const canvas = projectDocument(r.doc)
    r.materialized = undefined
    if (!localSessionId) return
    const hasAssets = [...canvas.files, ...canvas.artifacts].some(
      (n) => n.assetId
    )
    if (hasAssets && !this.options.hooks?.materializeBoard)
      throw new ResearchBoardsError(
        'RESOURCE_UNAVAILABLE',
        '共享资料尚未完成本机授权。'
      )
    if (this.options.hooks?.materializeBoard) {
      const revision = r.revision
      const value = await this.options.hooks.materializeBoard({
        accountId: ctx.userId,
        boardId: r.snapshot.board.boardId,
        epoch: r.snapshot.board.sharingEpoch,
        localSessionId,
        canvas: copy(canvas),
        signal: AbortSignal.any([this.generationAbort.signal, r.abort.signal])
      })
      this.check(ctx)
      if (
        this.boards.get(r.snapshot.board.boardId) !== r ||
        r.revision !== revision
      )
        return
      r.materialized = copy(value)
    }
  }
  private invalidateLocal(accountId: string, boardId: string) {
    const localSessionId = this.store.account(accountId).bindings[boardId]
    if (localSessionId)
      for (const kind of [
        'files',
        'artifacts',
        'selection',
        'preview-revocations'
      ])
        this.options.storage.setItem(
          `sherlock.research.canvas.${kind}.v1:${localSessionId}`,
          kind === 'selection' ? '{}' : '[]'
        )
    try {
      void Promise.resolve(
        this.options.hooks?.revokeBoard?.({
          accountId,
          boardId,
          ...(localSessionId ? { localSessionId } : {})
        })
      ).catch(() => {})
    } catch {}
  }
  private async retirePending(boardId: string, reason: string, purge: boolean) {
    const ctx = this.context()
    const pending = this.store
      .account(ctx.userId)
      .pending.filter((p) => p.boardId === boardId)
    // Strip the private checkpoint and CRDT causality before any network await.
    this.store.updateAccount(ctx.userId, (a) => {
      a.pending = a.pending.filter((p) => p.boardId !== boardId)
      for (const op of pending)
        if (op.recovery.length)
          a.recoveries.push({
            recoveryId: randomUUID(),
            boardId,
            operationId: op.operationId,
            createdAt: Date.now(),
            reason,
            status: 'unknown',
            changes: copy(op.recovery)
          })
      if (purge) delete a.checkpoints[boardId]
    })
    for (const op of pending) {
      try {
        const receipt = await this.client.request<{
          accepted: boolean
          operationId: string
        }>({ kind: 'receipt', boardId, operationId: op.operationId })
        this.check(ctx)
        if (receipt.operationId !== op.operationId) throw Error()
        this.store.updateAccount(ctx.userId, (a) => {
          if (receipt.accepted)
            a.recoveries = a.recoveries.filter(
              (r) => r.operationId !== op.operationId
            )
          else
            for (const r of a.recoveries)
              if (r.operationId === op.operationId) r.status = 'unsent'
        })
      } catch {
        this.check(ctx)
      }
    }
  }
  private async revoke(boardId: string, reason: string) {
    const ctx = this.context()
    const r = this.boards.get(boardId)
    const epoch = r?.snapshot.board.sharingEpoch ?? 0
    const localSessionId = this.localSession(boardId)
    if (r) {
      r.abort.abort()
      r.connection = 'revoked'
      r.presence = []
      r.materialized = undefined
      r.revisions.clear()
      r.mutationReplies.clear()
      r.deletionRecovery.clear()
      r.undo.clear()
      r.doc.destroy()
      r.snapshot = {
        ...r.snapshot,
        snapshot: { canvas: emptyCanvas(), history: [] },
        documentUpdate: '',
        members: [],
        messages: [],
        tasks: []
      }
    }
    if (this.currentBoard === boardId) {
      this.activeDispose?.()
      this.activeDispose = undefined
    }
    this.invalidateLocal(ctx.userId, boardId)
    this.emit({
      type: 'access',
      boardId,
      localSessionId,
      reason,
      epoch,
      recoveries: []
    })
    this.emitState()
    await this.retirePending(boardId, reason, true)
    this.check(ctx)
    this.store.updateAccount(ctx.userId, (a) => {
      a.boards = a.boards.filter((b) => b.boardId !== boardId)
    })
    this.emit({
      type: 'access',
      boardId,
      localSessionId,
      reason,
      epoch,
      recoveries: summaries(
        this.store
          .account(ctx.userId)
          .recoveries.filter((x) => x.boardId === boardId)
      )
    })
    this.emitState()
  }
  private async confirmAccessFailure(boardId: string, reason: string) {
    try {
      await this.loadBoard(boardId, true)
      await this.retirePending(boardId, reason, false)
      await this.loadBoard(boardId, true, true)
    } catch (error) {
      if (!denied(error)) throw error
    }
  }
  private requireBoard(boardId: string, localSessionId?: string, edit = false) {
    this.userId()
    const r = this.boards.get(boardId)
    if (!r || !this.permissions(r).read)
      throw new ResearchBoardsError('ACCESS_DENIED')
    if (
      localSessionId !== undefined &&
      this.localSession(boardId) !== localSessionId
    )
      throw new ResearchBoardsError('BINDING_CONFLICT')
    if (edit && !this.permissions(r).edit)
      throw new ResearchBoardsError('READ_ONLY', '当前看板只读。')
    return r
  }
  private canvasReply(
    r: RuntimeBoard,
    branch = r.revision,
    clientMutationId?: string
  ): CanvasReply {
    const view = this.view(r)
    return {
      canvas: view.canvas,
      canvasRevision: r.revision,
      localBranchRevision: branch,
      seq: r.snapshot.seq,
      pendingCount: view.pendingCount,
      canUndo: view.canUndo,
      canRedo: view.canRedo,
      ...(clientMutationId ? { clientMutationId } : {})
    }
  }
  private enqueue(
    boardId: string,
    action: string,
    body: Record<string, unknown>,
    recovery: OwnChange[] = [],
    clientMutationId?: string
  ): PendingOperation {
    const id = this.userId()
    const r = this.requireBoard(boardId)
    const operation: PendingOperation = {
      operationId: randomUUID(),
      boardId,
      epoch: r.snapshot.board.sharingEpoch,
      action,
      body: copy(body),
      recovery: copy(recovery),
      createdAt: Date.now(),
      ...(clientMutationId ? { clientMutationId } : {})
    }
    this.store.updateAccount(id, (a) => {
      a.pending.push(operation)
      if (clientMutationId)
        a.mutations[`${boardId}:${clientMutationId}`] = {
          operationId: operation.operationId,
          epoch: operation.epoch
        }
    })
    return operation
  }
  private async applyCanvas(
    input: Record<string, unknown>
  ): Promise<CanvasReply> {
    const boardId = safeId(input.boardId),
      localSessionId = safeId(input.localSessionId),
      mutation = safeId(input.clientMutationId)
    const r = this.requireBoard(boardId, localSessionId, true)
    const ctx = this.context()
    const previousReply = r.mutationReplies.get(mutation)
    if (previousReply) return copy(previousReply)
    const durable = this.store.account(ctx.userId).mutations[
      `${boardId}:${mutation}`
    ]
    if (durable)
      throw new ResearchBoardsError(
        'MUTATION_ALREADY_APPLIED',
        '修改已记录，请同步当前画板后继续。',
        false,
        { operationId: durable.operationId, canvasRevision: r.revision }
      )
    const base = r.revisions.get(safeId(input.baseRevision))
    if (!base)
      throw new ResearchBoardsError(
        'STALE_CANVAS_REVISION',
        '画板版本已更新，请保留当前草稿并重新载入。'
      )
    let next = copy(input.canvas) as Canvas
    if (this.options.hooks?.projectLocalCanvas)
      next = await this.options.hooks.projectLocalCanvas({
        accountId: ctx.userId,
        accountGeneration: ctx.generation,
        boardId,
        epoch: r.snapshot.board.sharingEpoch,
        localSessionId,
        canvas: next,
        signal: AbortSignal.any([this.generationAbort.signal, r.abort.signal])
      })
    this.check(ctx)
    this.requireBoard(boardId, localSessionId, true)
    if (this.boards.get(boardId) !== r)
      throw new ResearchBoardsError('STALE_CANVAS_REVISION')
    validateCanvas(next)
    // Fork the exact page branch. Applying stale string indices directly to live Y.Text loses remote edits.
    const fork = decodeDocument(base.bytes)
    let delta: Uint8Array
    try {
      delta = applyCanvasDiff(fork, base.canvas, next)
    } catch (error) {
      fork.destroy()
      throw error
    }
    const branchBytes = encodeDocument(fork)
    fork.destroy()
    const candidate = decodeDocument(encodeDocument(r.doc))
    mergeDocumentUpdate(candidate, delta, new Set(r.snapshot.tombstones))
    validateCanvas(projectDocument(candidate))
    candidate.destroy()
    const own = changes(base.canvas, next)
    if (!own.length) return this.canvasReply(r, r.revision, mutation)
    this.enqueue(boardId, 'update', { update: toBase64(delta) }, own, mutation)
    const deleted = (['files', 'artifacts'] as const).flatMap((collection) =>
      base.canvas[collection]
        .filter((n) => !next[collection].some((x) => x.id === n.id))
        .map((node) => ({ collection, node: copy(node) }))
    )
    r.doc.transact(
      () => mergeDocumentUpdate(r.doc, delta, new Set(r.snapshot.tombstones)),
      r.localOrigin
    )
    r.undo.stopCapturing()
    if (deleted.length) r.undo.undoStack.at(-1)?.meta.set('deleted', deleted)
    r.revision = this.revision(r)
    const localBranchRevision = this.revision(r, branchBytes, next)
    r.materialized = undefined
    try {
      await this.materialize(r, ctx)
    } catch (error) {
      this.emitBoard(boardId, 'local')
      throw error
    }
    this.check(ctx)
    const reply = this.canvasReply(r, localBranchRevision, mutation)
    r.mutationReplies.set(mutation, copy(reply))
    if (r.mutationReplies.size > 256)
      r.mutationReplies.delete(r.mutationReplies.keys().next().value!)
    this.emitBoard(boardId, 'local')
    void this.flush()
    return reply
  }
  private async undo(
    boardId: string,
    sessionId: string,
    redo: boolean
  ): Promise<CanvasReply> {
    const r = this.requireBoard(boardId, sessionId, true)
    const ctx = this.context()
    const stack = redo ? r.undo.redoStack : r.undo.undoStack
    const item = stack.at(-1)
    const deleted = item?.meta.get('deleted') as
      | Array<{ collection: 'files' | 'artifacts'; node: CanvasNode }>
      | undefined
    if (deleted?.length) {
      const recoveryId = randomUUID()
      r.deletionRecovery.set(recoveryId, copy(deleted))
      const recovery: Recovery = {
        recoveryId,
        boardId,
        createdAt: Date.now(),
        reason: 'DELETION_UNDO',
        status: 'deletion',
        changes: deleted.map((d) => ({
          kind: 'delete',
          collection: d.collection,
          nodeId: d.node.id
        }))
      }
      this.store.updateAccount(ctx.userId, (a) => a.recoveries.push(recovery))
      throw new ResearchBoardsError(
        'DELETION_RECOVERY_REQUIRED',
        '已删除组件需要以新身份恢复。',
        false,
        { recoveryId }
      )
    }
    if (!item) return this.canvasReply(r)
    const before = projectDocument(r.doc)
    const vector = Y.encodeStateVector(r.doc)
    if (redo) r.undo.redo()
    else r.undo.undo()
    const after = projectDocument(r.doc)
    const delta = Y.encodeStateAsUpdate(r.doc, vector)
    try {
      this.enqueue(
        boardId,
        'update',
        { update: toBase64(delta) },
        changes(before, after)
      )
    } catch (error) {
      if (redo) r.undo.undo()
      else r.undo.redo()
      throw error
    }
    r.revision = this.revision(r)
    await this.materialize(r, ctx)
    this.check(ctx)
    this.emitBoard(boardId, 'local')
    void this.flush()
    return this.canvasReply(r)
  }
  async flush(): Promise<void> {
    if (this.flushing) return this.flushing
    const work = this.flushPending()
    this.flushing = work
    try {
      await work
    } finally {
      if (this.flushing === work) this.flushing = undefined
    }
  }
  private async acknowledge(
    op: PendingOperation,
    ctx: { generation: number; userId: string }
  ) {
    const snapshot = await this.client.request<BoardSnapshot>({
      kind: 'board.get',
      boardId: op.boardId
    })
    this.check(ctx)
    if (snapshot.board.boardId !== op.boardId)
      throw new ResearchBoardsError('INVALID_RESPONSE')
    validateCanvas(snapshot.snapshot.canvas)
    this.store.updateAccount(ctx.userId, (a) => {
      a.pending = a.pending.filter((p) => p.operationId !== op.operationId)
      if (
        !a.checkpoints[op.boardId] ||
        a.checkpoints[op.boardId]!.seq <= snapshot.seq
      )
        a.checkpoints[op.boardId] = copy(snapshot)
    })
    await this.receiveBoard(op.boardId, snapshot)
    this.check(ctx)
  }
  private async flushPending() {
    if (!this.accountView.user || this.stopped) return
    const ctx = this.context()
    const batch = this.store.account(ctx.userId).pending
    for (const op of batch) {
      try {
        this.check(ctx)
        let r = this.boards.get(op.boardId)
        if (!r || r.connection === 'offline' || r.connection === 'revalidating')
          r = await this.loadBoard(op.boardId, true)
        this.check(ctx)
        if (
          !this.store
            .account(ctx.userId)
            .pending.some((p) => p.operationId === op.operationId)
        )
          continue
        if (
          r.snapshot.board.sharingEpoch !== op.epoch ||
          (!this.permissions(r).edit &&
            ['update', 'message', ...taskActions].includes(op.action))
        ) {
          await this.retirePending(op.boardId, 'PERMISSION_CHANGED', false)
          continue
        }
        // A lost ACK is resolved before every retry; receipt is content-free even after revocation.
        const receipt = await this.client.request<{
          operationId: string
          accepted: boolean
          seq?: number
          epoch?: number
        }>({
          kind: 'receipt',
          boardId: op.boardId,
          operationId: op.operationId
        })
        this.check(ctx)
        if (receipt.operationId !== op.operationId)
          throw new ResearchBoardsError('INVALID_RESPONSE')
        if (receipt.accepted) {
          await this.acknowledge(op, ctx)
          continue
        }
        const reply = await this.client.request<Record<string, unknown>>({
          kind: 'board.command',
          boardId: op.boardId,
          body: {
            ...op.body,
            action: op.action,
            operationId: op.operationId,
            epoch: op.epoch
          }
        })
        this.check(ctx)
        if (
          reply.operationId !== op.operationId ||
          !Number.isSafeInteger(reply.seq) ||
          !Number.isSafeInteger(reply.epoch)
        )
          throw new ResearchBoardsError('INVALID_RESPONSE')
        if (op.action === 'leave') {
          this.store.updateAccount(ctx.userId, (a) => {
            a.pending = a.pending.filter(
              (p) => p.operationId !== op.operationId
            )
          })
          await this.revoke(op.boardId, 'LEFT_BOARD')
          continue
        }
        await this.acknowledge(op, ctx)
        this.check(ctx)
        this.emitBoard(op.boardId, 'ack')
      } catch (error) {
        if (ctx.generation !== this.options.account.generation || this.stopped)
          return
        if (denied(error)) {
          await this.confirmAccessFailure(op.boardId, errorCode(error))
          continue
        }
        if (errorCode(error) === 'STALE_EPOCH') {
          await this.loadBoard(op.boardId, true, true).catch(() => {})
          continue
        }
        const retryable =
          (error as ResearchBoardsError)?.retryable === true ||
          ['NETWORK_ERROR', ''].includes(errorCode(error))
        if (!retryable && errorCode(error) !== 'SESSION_CHANGED') {
          this.store.updateAccount(ctx.userId, (a) => {
            a.pending = a.pending.filter(
              (p) => p.operationId !== op.operationId
            )
            if (op.recovery.length)
              a.recoveries.push({
                recoveryId: randomUUID(),
                boardId: op.boardId,
                operationId: op.operationId,
                createdAt: Date.now(),
                reason: errorCode(error),
                status: 'unsent',
                changes: op.recovery
              })
          })
          await this.loadBoard(op.boardId, true, true).catch(() => {})
        } else {
          const r = this.boards.get(op.boardId)
          if (r && r.connection !== 'revoked') r.connection = 'offline'
          this.retry()
        }
        this.emitState()
        return
      }
    }
    this.check(ctx)
    if (
      this.store
        .account(ctx.userId)
        .pending.some(
          (op) => !batch.some((sent) => sent.operationId === op.operationId)
        )
    )
      await this.flushPending()
  }
  // Main-only Task4 command hook. Renderer has no raw command action.
  async command(
    boardId: string,
    action: string,
    body: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    safeId(boardId)
    const r = await this.loadBoard(boardId)
    this.requireBoard(
      boardId,
      undefined,
      !ownerActions.has(action) && action !== 'leave'
    )
    if (ownerActions.has(action) && r.snapshot.board.role !== 'owner')
      throw new ResearchBoardsError('ACCESS_DENIED')
    if (
      !ownerActions.has(action) &&
      !taskActions.has(action) &&
      !['leave', 'message'].includes(action)
    )
      throw new ResearchBoardsError('INVALID_REQUEST')
    const ctx = this.context()
    const op =
      this.store
        .account(ctx.userId)
        .pending.find(
          (p) =>
            p.boardId === boardId && p.action === action && equal(p.body, body)
        ) ??
      this.enqueue(
        boardId,
        action,
        body,
        action === 'message'
          ? [{ kind: 'message', text: String(body.text) }]
          : []
      )
    this.emitState()
    // Control calls wait for durable acknowledgement; queued commands remain recoverable/retriable.
    try {
      const result = await this.client.request<Record<string, unknown>>({
        kind: 'board.command',
        boardId,
        body: { ...body, action, operationId: op.operationId, epoch: op.epoch }
      })
      this.check(ctx)
      if (
        result.operationId !== op.operationId ||
        !Number.isSafeInteger(result.seq)
      )
        throw new ResearchBoardsError('INVALID_RESPONSE')
      if (action === 'leave') {
        this.store.updateAccount(ctx.userId, (a) => {
          a.pending = a.pending.filter((p) => p.operationId !== op.operationId)
        })
        await this.revoke(boardId, 'LEFT_BOARD')
      } else await this.acknowledge(op, ctx)
      return result
    } catch (error) {
      this.check(ctx)
      if (denied(error))
        await this.confirmAccessFailure(boardId, errorCode(error))
      else {
        const current = this.boards.get(boardId)
        if (current && current.connection !== 'revoked')
          current.connection = 'offline'
        this.retry()
        this.emitState()
      }
      throw error
    }
  }
  private async createBoard(
    favoriteId: string,
    titleOverride?: string,
    captureId?: string
  ) {
    if (this.creating.has(favoriteId)) return this.creating.get(favoriteId)!
    const ctx = this.context()
    const favorite = this.store
      .snapshot()
      .favorites.find((f) => f.favoriteId === favoriteId)
    if (!favorite) throw new ResearchBoardsError('NOT_FAVORITED')
    if (!this.options.hooks?.captureOriginal)
      throw new ResearchBoardsError(
        'CAPTURE_UNAVAILABLE',
        '完整研究捕获尚未就绪。'
      )
    const operation = (async () => {
      const saved = this.store.account(ctx.userId).creates[favoriteId] ?? {
        operationId: randomUUID()
      }
      this.store.updateAccount(ctx.userId, (a) => {
        a.creates[favoriteId] = saved
      })
      const captured = await this.options.hooks!.captureOriginal!({
        sessionId: favorite.sessionId,
        accountId: ctx.userId,
        accountGeneration: ctx.generation,
        operationId: saved.operationId,
        ...(captureId ? { captureId } : {}),
        signal: this.generationAbort.signal
      })
      this.check(ctx)
      try {
        const frozen = freezeSnapshot(captured.snapshot)
        const assets = captured.assets ?? []
        const refs = new Set(
          [...frozen.canvas.files, ...frozen.canvas.artifacts].flatMap((n) =>
            typeof n.assetId === 'string' ? [n.assetId] : []
          )
        )
        if ([...refs].some((id) => !assets.some((a) => a.assetId === id)))
          throw new ResearchBoardsError(
            'RESOURCE_UNAVAILABLE',
            '共享资料未完整复制。'
          )
        if (saved.body && saved.body.sourceRevision !== captured.sourceRevision)
          throw new ResearchBoardsError(
            'SOURCE_CHANGED',
            '原研究已变化，请完成或清理上次捕获。'
          )
        const body = saved.body ?? {
          operationId: saved.operationId,
          title: titleOverride ?? favorite.title,
          sourceRevision: captured.sourceRevision,
          capturedAt: captured.capturedAt,
          snapshot: frozen
        }
        this.store.updateAccount(ctx.userId, (a) => {
          a.creates[favoriteId] = { ...saved, body: copy(body) }
        })
        if (assets.length) {
          const upload = await this.client.request<{ uploadId: string }>({
            kind: 'upload.create',
            operationId: saved.operationId
          })
          this.check(ctx)
          for (const asset of assets) {
            const data = await asset.open()
            this.check(ctx)
            await this.client.request({
              kind: 'asset.stage',
              uploadId: upload.uploadId,
              assetId: asset.assetId,
              name: asset.name,
              size: asset.size,
              contentType: asset.contentType,
              data
            })
            this.check(ctx)
          }
          body.uploadId = upload.uploadId
          this.store.updateAccount(ctx.userId, (a) => {
            a.creates[favoriteId]!.body = copy(body)
          })
        }
        const reply = await this.client.request<{ board: Board }>({
          kind: 'board.create',
          body
        })
        this.check(ctx)
        this.store.updateAccount(ctx.userId, (a) => {
          delete a.creates[favoriteId]
          if (!a.boards.some((b) => b.boardId === reply.board.boardId))
            a.boards.push(reply.board)
          a.sources[reply.board.boardId] = {
            favoriteId,
            sessionId: favorite.sessionId
          }
          a.hidden = a.hidden.filter((id) => id !== reply.board.boardId)
        })
        this.emitState()
        return { board: reply.board }
      } finally {
        await captured.dispose?.()
      }
    })()
    this.creating.set(favoriteId, operation)
    try {
      return await operation
    } finally {
      if (this.creating.get(favoriteId) === operation)
        this.creating.delete(favoriteId)
    }
  }
  async invoke(action: string, input: unknown = {}): Promise<BoardsResult> {
    try {
      return { ok: true, value: await this.perform(action, input) }
    } catch (error) {
      return { ok: false, error: boardsError(error) }
    }
  }
  private async perform(action: string, input: unknown): Promise<unknown> {
    if (this.stopped) throw new ResearchBoardsError('SESSION_CHANGED')
    switch (action) {
      case 'favorite.add': {
        const p = exact(input, ['identity'])
        const i = exact(
          p.identity,
          ['sessionId', 'title'],
          ['cwd', 'workspaceId', 'workspaceTitle']
        )
        safeId(i.sessionId)
        text(i.title)
        for (const k of ['cwd', 'workspaceId', 'workspaceTitle'])
          if (i[k] !== undefined) text(i[k], 4096)
        const favorite = this.store.addFavorite(i as Favorite)
        this.emitState()
        return favorite
      }
      case 'favorite.rename':
      case 'favorite.remove': {
        const p = exact(
          input,
          action === 'favorite.rename'
            ? ['favoriteId', 'title']
            : ['favoriteId']
        )
        const id = safeId(p.favoriteId)
        if (action === 'favorite.rename')
          this.store.renameFavorite(id, text(p.title))
        else this.store.removeFavorite(id)
        this.emitState()
        return this.store.snapshot().favorites
      }
      case 'favorite.reorder': {
        const p = exact(input, ['favoriteIds'])
        if (!Array.isArray(p.favoriteIds))
          throw new ResearchBoardsError('INVALID_REQUEST')
        this.store.reorderFavorites(p.favoriteIds.map(safeId))
        this.emitState()
        return this.store.snapshot().favorites
      }
      case 'board.pin':
      case 'board.unpin': {
        const p = exact(input, ['boardId'])
        this.store.setPinned(
          this.userId(),
          safeId(p.boardId),
          action === 'board.pin'
        )
        this.emitState()
        return this.getSnapshot()
      }
      case 'boards.refresh':
        exact(input, [])
        await this.refresh()
        return this.getSnapshot()
      case 'board.create': {
        const p = exact(input, ['favoriteId'], ['title', 'captureId'])
        return this.createBoard(
          safeId(p.favoriteId),
          p.title === undefined ? undefined : text(p.title),
          p.captureId === undefined ? undefined : safeId(p.captureId)
        )
      }
      case 'board.previewCapture': {
        const p = exact(input, ['favoriteId'])
        const favoriteId = safeId(p.favoriteId)
        const favorite = this.store
          .snapshot()
          .favorites.find((f) => f.favoriteId === favoriteId)
        if (!favorite) throw new ResearchBoardsError('NOT_FAVORITED')
        if (!this.options.hooks?.previewCapture)
          throw new ResearchBoardsError('CAPTURE_UNAVAILABLE')
        const ctx = this.context()
        const result = await this.options.hooks.previewCapture({
          sessionId: favorite.sessionId,
          favoriteId,
          accountId: ctx.userId,
          accountGeneration: ctx.generation,
          signal: this.generationAbort.signal
        })
        this.check(ctx)
        return result
      }
      case 'board.open': {
        const p = exact(input, ['boardId'])
        const boardId = safeId(p.boardId)
        await this.loadBoard(boardId, true)
        const account = this.userId()
        this.store.setPinned(account, boardId, true)
        const localSessionId = this.localSession(boardId)
        this.emitState()
        if (localSessionId) return { localSessionId }
        let reservation = this.reservations.get(boardId)
        if (!reservation) {
          reservation = {
            reservationId: randomUUID(),
            generation: this.options.account.generation
          }
          this.reservations.set(boardId, reservation)
        }
        return {
          reservationId: reservation.reservationId,
          title: this.boards.get(boardId)!.snapshot.board.title
        }
      }
      case 'board.bind': {
        const p = exact(input, ['boardId', 'reservationId', 'localSessionId'])
        const boardId = safeId(p.boardId),
          sessionId = safeId(p.localSessionId)
        const reservation = this.reservations.get(boardId)
        if (
          !reservation ||
          reservation.reservationId !== p.reservationId ||
          reservation.generation !== this.options.account.generation
        )
          throw new ResearchBoardsError('BINDING_CONFLICT')
        const r = this.requireBoard(boardId)
        for (const kind of ['files', 'artifacts']) {
          const raw = this.options.storage.getItem(
            `sherlock.research.canvas.${kind}.v1:${sessionId}`
          )
          if (raw && raw !== '[]')
            throw new ResearchBoardsError('BINDING_CONFLICT')
        }
        this.store.bind(this.userId(), boardId, sessionId)
        this.reservations.delete(boardId)
        await this.materialize(r)
        this.emitState()
        return {
          binding: this.store.sharedSession(sessionId),
          view: this.view(r)
        }
      }
      case 'board.activate': {
        const p = exact(input, ['localSessionId'])
        this.activeDispose?.()
        this.activeDispose = undefined
        this.currentBoard = null
        if (p.localSessionId === null) {
          this.emitState()
          return null
        }
        const binding = this.getBinding(safeId(p.localSessionId))
        if (!binding) {
          this.emitState()
          return null
        }
        const ctx = this.context()
        const r = await this.loadBoard(binding.boardId, true)
        this.check(ctx)
        this.currentBoard = binding.boardId
        this.activeDispose = this.client.watch(
          { scope: 'board', boardId: binding.boardId },
          (event) => {
            if (ctx.generation === this.options.account.generation)
              void this.boardEvent(binding.boardId, event, ctx)
          }
        )
        this.emitBoard(binding.boardId, 'open')
        return this.view(r)
      }
      case 'canvas.apply':
        return this.applyCanvas(
          exact(input, [
            'boardId',
            'localSessionId',
            'baseRevision',
            'clientMutationId',
            'canvas'
          ])
        )
      case 'canvas.undo':
      case 'canvas.redo': {
        const p = exact(input, ['boardId', 'localSessionId'])
        return this.undo(
          safeId(p.boardId),
          safeId(p.localSessionId),
          action === 'canvas.redo'
        )
      }
      case 'board.copyPersonal': {
        const p = exact(input, ['boardId'])
        const boardId = safeId(p.boardId)
        const r = this.requireBoard(boardId)
        if (!this.options.hooks?.preparePersonalCopy)
          throw new ResearchBoardsError('CAPTURE_UNAVAILABLE')
        const ctx = this.context()
        const value = await this.options.hooks.preparePersonalCopy({
          accountId: ctx.userId,
          boardId,
          snapshot: copy(r.snapshot),
          signal: AbortSignal.any([this.generationAbort.signal, r.abort.signal])
        })
        this.check(ctx)
        return value
      }
      case 'board.finalizePersonalCopy': {
        const p = exact(input, ['copyId', 'localSessionId'])
        const copyId = safeId(p.copyId),
          localSessionId = safeId(p.localSessionId)
        if (
          this.isSharedSession(localSessionId) ||
          this.store
            .snapshot()
            .favorites.some((f) => f.sessionId === localSessionId)
        )
          throw new ResearchBoardsError('BINDING_CONFLICT')
        for (const kind of ['files', 'artifacts']) {
          const raw = this.options.storage.getItem(
            `sherlock.research.canvas.${kind}.v1:${localSessionId}`
          )
          if (raw && raw !== '[]')
            throw new ResearchBoardsError('BINDING_CONFLICT')
        }
        if (!this.options.hooks?.finalizePersonalCopy)
          throw new ResearchBoardsError('CAPTURE_UNAVAILABLE')
        const ctx = this.context()
        const result = await this.options.hooks.finalizePersonalCopy({
          accountId: ctx.userId,
          copyId,
          localSessionId,
          signal: this.generationAbort.signal
        })
        this.check(ctx)
        return result
      }
      case 'request.submit': {
        const p = exact(
          input,
          ['boardId', 'text', 'clientMutationId'],
          ['targetId', 'targetCollection', 'source']
        )
        const boardId = safeId(p.boardId)
        const r = this.requireBoard(boardId, undefined, true)
        text(p.text, LIMITS.messageBytes)
        safeId(p.clientMutationId)
        if (p.targetId !== undefined) safeId(p.targetId)
        if (
          (p.targetCollection !== undefined &&
            !['files', 'artifacts'].includes(String(p.targetCollection))) ||
          (p.source !== undefined &&
            !['manual', 'refresh'].includes(String(p.source)))
        )
          throw new ResearchBoardsError('INVALID_REQUEST')
        if (!this.options.hooks?.submitRequest)
          throw new ResearchBoardsError(
            'EXECUTION_UNAVAILABLE',
            '共享研究执行尚未就绪，输入已保留。'
          )
        const ctx = this.context()
        const result = await this.options.hooks.submitRequest({
          ...p,
          accountId: ctx.userId,
          signal: AbortSignal.any([this.generationAbort.signal, r.abort.signal])
        } as Parameters<NonNullable<ResearchBoardHooks['submitRequest']>>[0])
        this.check(ctx)
        return result
      }
      case 'message.send': {
        const p = exact(input, ['boardId', 'text', 'clientMutationId'])
        const boardId = safeId(p.boardId)
        this.requireBoard(boardId, undefined, true)
        const value = text(p.text, LIMITS.messageBytes),
          mutation = safeId(p.clientMutationId)
        const a = this.store.account(this.userId())
        const existing = a.mutations[`${boardId}:${mutation}`]
        if (existing)
          return {
            operationId: existing.operationId,
            pending: a.pending.some(
              (p) => p.operationId === existing.operationId
            )
          }
        const op = this.enqueue(
          boardId,
          'message',
          { text: value },
          [{ kind: 'message', text: value }],
          mutation
        )
        this.emitState()
        void this.flush()
        return { operationId: op.operationId, pending: true }
      }
      case 'user.lookup': {
        const p = exact(input, ['publicId'])
        if (typeof p.publicId !== 'string' || !/^\d{10}$/.test(p.publicId))
          throw new ResearchBoardsError('INVALID_REQUEST')
        return this.client.request({
          kind: 'users.lookup',
          publicId: p.publicId
        })
      }
      case 'invitation.respond': {
        const p = exact(input, ['invitationId', 'version', 'decision'])
        safeId(p.invitationId)
        if (
          !Number.isSafeInteger(p.version) ||
          Number(p.version) < 1 ||
          !['accept', 'decline'].includes(String(p.decision))
        )
          throw new ResearchBoardsError('INVALID_REQUEST')
        const result = await this.durableAuxiliary({
          kind: 'invitation.respond',
          invitationId: p.invitationId as string,
          version: p.version as number,
          decision: p.decision as 'accept' | 'decline'
        })
        await this.refresh()
        return result
      }
      case 'notifications.read': {
        const p = exact(input, [], ['notificationIds'])
        if (
          p.notificationIds !== undefined &&
          (!Array.isArray(p.notificationIds) || p.notificationIds.length > 1000)
        )
          throw new ResearchBoardsError('INVALID_REQUEST')
        const ids = (p.notificationIds as unknown[] | undefined)?.map(safeId)
        const ctx = this.context()
        await this.durableAuxiliary({
          kind: 'notifications.read',
          ...(ids ? { notificationIds: ids } : {})
        })
        this.check(ctx)
        await this.catchUpNotifications()
        this.emitState()
        return this.store.account(ctx.userId).notifications
      }
      case 'presence.update': {
        const p = exact(input, ['boardId'], ['cursor', 'selectedIds'])
        const boardId = safeId(p.boardId)
        this.requireBoard(boardId)
        if (boardId !== this.currentBoard)
          throw new ResearchBoardsError('INVALID_REQUEST')
        if (p.cursor !== undefined) {
          const c = exact(p.cursor, ['x', 'y'])
          if (!Number.isFinite(c.x) || !Number.isFinite(c.y))
            throw new ResearchBoardsError('INVALID_REQUEST')
        }
        if (
          p.selectedIds !== undefined &&
          (!Array.isArray(p.selectedIds) || p.selectedIds.length > 1000)
        )
          throw new ResearchBoardsError('INVALID_REQUEST')
        this.client.sendPresence(boardId, {
          ...(p.cursor ? { cursor: p.cursor as { x: number; y: number } } : {}),
          ...(p.selectedIds
            ? { selectedIds: (p.selectedIds as unknown[]).map(safeId) }
            : {})
        })
        return { ok: true }
      }
      case 'recovery.saveDraft': {
        const p = exact(input, ['boardId', 'text', 'clientMutationId'])
        const boardId = safeId(p.boardId)
        this.requireBoard(boardId, undefined, true)
        if (typeof p.text !== 'string' || p.text.length > LIMITS.messageBytes)
          throw new ResearchBoardsError('INVALID_REQUEST')
        const key = safeId(p.clientMutationId)
        const id = this.userId()
        this.store.updateAccount(id, (a) => {
          a.recoveries = a.recoveries.filter((r) => r.recoveryId !== key)
          if (p.text)
            a.recoveries.push({
              recoveryId: key,
              boardId,
              createdAt: Date.now(),
              reason: 'COMPOSER_DRAFT',
              status: 'unsent',
              changes: [{ kind: 'message', text: p.text as string }]
            })
        })
        return { recoveryId: key }
      }
      case 'recovery.get':
      case 'recovery.dismiss': {
        const p = exact(input, ['recoveryId'])
        const key = safeId(p.recoveryId)
        const id = this.userId()
        const r = this.store
          .account(id)
          .recoveries.find((r) => r.recoveryId === key)
        if (!r) throw new ResearchBoardsError('NOT_FOUND')
        if (action === 'recovery.get') return r
        this.store.updateAccount(id, (a) => {
          a.recoveries = a.recoveries.filter((r) => r.recoveryId !== key)
        })
        this.emitState()
        return { ok: true }
      }
      case 'recovery.restoreDeletion': {
        const p = exact(input, ['boardId', 'recoveryId'])
        const boardId = safeId(p.boardId),
          id = safeId(p.recoveryId)
        const r = this.requireBoard(boardId, undefined, true)
        const deleted = r.deletionRecovery.get(id)
        if (!deleted)
          throw new ResearchBoardsError(
            'RECOVERY_UNAVAILABLE',
            '此删除只能在原授权会话内恢复。'
          )
        const canvas = projectDocument(r.doc)
        const ids = new Map(deleted.map((d) => [d.node.id, randomUUID()]))
        for (const d of deleted) {
          const node = copy(d.node)
          node.id = ids.get(node.id)!
          if (Array.isArray(node.sourceNodeIds))
            node.sourceNodeIds = node.sourceNodeIds.map(
              (x) => ids.get(String(x)) ?? x
            )
          for (const field of ['parentId', 'groupId'])
            if (typeof node[field] === 'string' && ids.has(node[field]))
              node[field] = ids.get(node[field])
          canvas[d.collection].push(node)
        }
        const reply = await this.applyCanvas({
          boardId,
          localSessionId: this.localSession(boardId),
          baseRevision: r.revision,
          clientMutationId: randomUUID(),
          canvas
        })
        r.deletionRecovery.delete(id)
        this.store.updateAccount(this.userId(), (a) => {
          a.recoveries = a.recoveries.filter((x) => x.recoveryId !== id)
        })
        return reply
      }
      default:
        return this.controlAction(action, input)
    }
  }
  private controlAction(action: string, input: unknown) {
    const map: Record<string, { wire: string; fields: string[] }> = {
      'board.rename': { wire: 'rename', fields: ['title'] },
      'board.refreshPause': { wire: 'refreshPause', fields: ['paused'] },
      'invitation.send': { wire: 'invite', fields: ['publicId', 'role'] },
      'invitation.revoke': {
        wire: 'revokeInvitation',
        fields: ['invitationId']
      },
      'member.role': { wire: 'memberRole', fields: ['userId', 'role'] },
      'member.remove': { wire: 'removeMember', fields: ['userId'] },
      ...Object.fromEntries(
        ['archive', 'restore', 'cancel', 'reopen', 'leave'].map((wire) => [
          `board.${wire}`,
          { wire, fields: [] }
        ])
      )
    }
    if (!Object.hasOwn(map, action))
      throw new ResearchBoardsError('INVALID_REQUEST')
    const config = map[action]!
    const p = exact(input, ['boardId', ...config.fields])
    const boardId = safeId(p.boardId)
    const body = { ...p }
    delete body.boardId
    for (const field of config.fields) {
      if (field === 'title') text(p[field])
      else if (field === 'publicId') {
        if (typeof p[field] !== 'string' || !/^\d{10}$/.test(p[field]))
          throw new ResearchBoardsError('INVALID_REQUEST')
      } else if (field === 'role') {
        if (!['editor', 'viewer'].includes(String(p[field])))
          throw new ResearchBoardsError('INVALID_REQUEST')
      } else if (field === 'paused') {
        if (typeof p[field] !== 'boolean')
          throw new ResearchBoardsError('INVALID_REQUEST')
      } else safeId(p[field])
    }
    return this.command(boardId, config.wire, body)
  }
  private async boardEvent(
    boardId: string,
    event: CollaborationEvent,
    ctx: { generation: number; userId: string }
  ) {
    try {
      this.check(ctx)
      if (this.currentBoard !== boardId) return
      if (event.type === 'welcome' || event.type === 'boardChanged') {
        await this.receiveBoard(boardId, event as unknown as BoardSnapshot)
        this.check(ctx)
        if (event.presence) this.updatePresence(boardId, event.presence)
        void this.flush()
      } else if (event.type === 'presence')
        this.updatePresence(boardId, event.presence)
      else if (event.type === 'accessRevoked') {
        // A role/archive change can retain reads; confirm before purging.
        const current = this.boards.get(boardId)
        if (current) {
          current.abort.abort()
          current.connection = 'revalidating'
          current.presence = []
        }
        this.activeDispose?.()
        this.activeDispose = undefined
        this.emitBoard(boardId, 'permissions')
        try {
          await this.loadBoard(boardId, true)
          this.check(ctx)
          if (this.currentBoard === boardId)
            this.activeDispose = this.client.watch(
              { scope: 'board', boardId },
              (event) => {
                if (ctx.generation === this.options.account.generation)
                  void this.boardEvent(boardId, event, ctx)
              }
            )
        } catch (error) {
          if (!denied(error)) {
            const r = this.boards.get(boardId)
            if (r) r.connection = 'revalidating'
            this.emitBoard(boardId, 'permissions')
            this.retry()
          }
        }
      } else if (event.type === 'offline') {
        const r = this.boards.get(boardId)
        if (r && r.connection !== 'revoked') {
          r.connection = 'offline'
          r.presence = []
          this.emitBoard(boardId, 'offline')
        }
      }
    } catch {
      this.retry()
    }
  }
  private updatePresence(boardId: string, value: unknown) {
    const r = this.boards.get(boardId)
    if (!r || !Array.isArray(value) || boardId !== this.currentBoard) return
    const map = new Map<string, Presence>()
    for (const item of value) {
      if (
        item &&
        typeof item.userId === 'string' &&
        typeof item.username === 'string' &&
        ['owner', 'editor', 'viewer'].includes(item.role)
      )
        map.set(item.userId, copy(item))
    }
    r.presence = [...map.values()]
    this.emit({
      type: 'presence',
      boardId,
      localSessionId: this.localSession(boardId),
      presence: r.presence
    })
  }
  isSharedSession(sessionId: string) {
    return !!this.store.sharedSession(sessionId)
  }
  getBinding(sessionId: string): Binding | undefined {
    const binding = this.store.sharedSession(sessionId)
    return binding &&
      binding.accountId === this.accountView.user?.userId &&
      this.options.account.authenticated
      ? binding
      : undefined
  }
  readSharedCanvas(sessionId: string): Canvas {
    const binding = this.getBinding(sessionId)
    if (!binding) throw new ResearchBoardsError('ACCESS_DENIED')
    return projectDocument(this.requireBoard(binding.boardId).doc)
  }
  private storageBinding(key: unknown) {
    if (typeof key !== 'string') return undefined
    const match = key.match(
      /^sherlock\.research\.(?:canvas\.(files|artifacts|selection|preview-revocations)|session-engaged)\.v1:(.+)$/
    )
    return match
      ? {
          kind: match[1] ?? 'engaged',
          binding: this.store.sharedSession(match[2]!)
        }
      : undefined
  }
  readCanvasStorage(key: unknown): string | null {
    const parsed = this.storageBinding(key)
    if (!parsed?.binding) return this.options.storage.getItem(key)
    const { binding, kind } = parsed
    const r =
      binding.accountId === this.accountView.user?.userId
        ? this.boards.get(binding.boardId)
        : undefined
    if (
      r &&
      this.permissions(r).read &&
      (kind === 'files' || kind === 'artifacts')
    )
      return JSON.stringify((r.materialized ?? projectDocument(r.doc))[kind])
    return kind === 'selection' ? '{}' : kind === 'engaged' ? '0' : '[]'
  }
  writeCanvasStorage(key: unknown, value: unknown): boolean {
    if (this.storageBinding(key)?.binding) return false
    return this.options.storage.setItem(key, value)
  }
  stop() {
    if (this.stopped) return
    this.stopped = true
    this.generationAbort.abort()
    this.accountDispose()
    this.activeDispose?.()
    this.notificationsDispose?.()
    clearTimeout(this.retryTimer)
    for (const [id, r] of this.boards) {
      if (this.accountView.user)
        this.invalidateLocal(this.accountView.user.userId, id)
      r.abort.abort()
      r.undo.destroy()
      r.doc.destroy()
    }
    this.client.stop()
    this.listeners.clear()
  }
}

export function registerResearchBoardsHandlers(options: {
  ipcMain: {
    handle(
      channel: string,
      handler: (event: any, ...args: any[]) => unknown
    ): unknown
    removeHandler(channel: string): void
    on?(
      channel: string,
      listener: (event: any, ...args: any[]) => void
    ): unknown
    removeAllListeners?(channel: string): unknown
  }
  getMainWindow(): TrustedWindow | undefined
  service: ResearchBoardsService
}): () => void {
  const { ipcMain, getMainWindow, service } = options
  for (const channel of ['research:boards:invoke', 'research:boards:snapshot'])
    ipcMain.removeHandler(channel)
  registerTrustedMainWindowHandler(
    ipcMain,
    'research:boards:invoke',
    getMainWindow,
    (_event: TrustedWindowEvent, action: unknown, input: unknown) =>
      typeof action === 'string'
        ? service.invoke(action, input)
        : Promise.resolve({
            ok: false,
            error: {
              code: 'INVALID_REQUEST',
              message: '请求无效。',
              retryable: false
            }
          })
  )
  registerTrustedMainWindowHandler(
    ipcMain,
    'research:boards:snapshot',
    getMainWindow,
    () => service.getSnapshot()
  )
  if (ipcMain.on) {
    ipcMain.removeAllListeners?.('research:boards:is-shared-session')
    registerTrustedMainWindowListener(
      ipcMain as Required<Pick<typeof ipcMain, 'on'>>,
      'research:boards:is-shared-session',
      getMainWindow,
      (_event, sessionId: unknown) =>
        typeof sessionId === 'string' && service.isSharedSession(sessionId),
      true
    )
  }
  return () => {
    for (const channel of [
      'research:boards:invoke',
      'research:boards:snapshot'
    ])
      ipcMain.removeHandler(channel)
    ipcMain.removeAllListeners?.('research:boards:is-shared-session')
  }
}
