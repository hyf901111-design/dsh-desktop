import { validFeedbackImages } from '../../packages/dsh-research-collaboration/feedback-images.js'
import { withSharedCanvasCompatibilityLayout } from '../shared/shared-board-layout'
import { cleanActivity } from 'dsh-research-collaboration/activity'
import { componentVersion, validateComponentMessage } from 'dsh-research-collaboration/component-state'
import {
  normalizeRequestContext,
  historyAssetIds,
  portableAssetIds
} from '../../packages/dsh-research-collaboration/context.js'
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
  LIMITS,
  validatePresenceHints
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
import { omitUnchangedTabRecovery, preserveSharedBoardTabMembership } from './state/research-board-tab-membership'
import { boardTabsSpec } from '../../packages/dsh-research-task-runtime/board-tabs-contract.js'
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
type BoardAccessContext = {
  generation: number
  userId: string
  boardId: string
  accessGeneration: number
}
export type CapturedAsset = {
  assetId: string
  name: string
  contentType: string
  size: number
  open(): Promise<BodyInit>
}
export type ResearchBoardHooks = {
  directory?(input: Record<string, unknown>, signal: AbortSignal): Promise<any>
  canResumePersonalCopy?(
    accountId: string,
    copyId: string,
    sessionId: string
  ): boolean
  completedPersonalCopy?(
    accountId: string,
    copyId: string,
    sessionId: string
  ): { localSessionId: string } | null
  personalImport?(sessionId: string): any
  personalFileOpen?(sessionId: string, nodeId: string): Promise<unknown>
  fileOpen?(input: {
    accountId: string
    boardId: string
    localSessionId: string
    nodeId: string
    signal: AbortSignal
  }): Promise<unknown>
  requestList?(accountId: string, boardId: string): unknown
  requestRetry?(
    accountId: string,
    boardId: string,
    mutation: string,
    signal: AbortSignal
  ): Promise<unknown>
  taskAction?(
    accountId: string,
    boardId: string,
    taskId: string,
    action: string,
    signal: AbortSignal
  ): Promise<unknown>
  captureOriginal?(input: {
    sessionId: string
    accountId: string
    accountGeneration: number
    operationId: string
    captureId?: string
    includeHistory?: boolean
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
    includeHistory?: boolean
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
    context?: {
      scope: string
      references: Array<{ collection: string; nodeId: string }>
    }
    targetId?: string
    targetCollection?: 'files' | 'artifacts'
    source?: 'manual' | 'refresh'
    signal: AbortSignal
  }): Promise<unknown>
}
type Revision = { bytes: Uint8Array; canvas: Canvas; tabProjection?: Pick<Canvas, 'artifacts'> }
function tabProjection(canvas: Canvas): Revision['tabProjection'] {
  const artifacts = canvas.artifacts.flatMap(node => {
    const spec = boardTabsSpec(node.containerSpec)
    return spec ? [{ id: node.id, containerSpec: spec }] : []
  })
  return artifacts.length ? { artifacts } : undefined
}
type RuntimeBoard = {
  activities?: Array<Record<string, any>>
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
  materializedRevision?: string
  materializedSessionId?: string
  materialization?: { revision: string; localSessionId: string; promise: Promise<void> }
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
      while (
        prefix < a.length &&
        prefix < b.length &&
        a[prefix] === b[prefix]
      )
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
      if (!next.has(id))
        result.push({ kind: 'delete', collection, nodeId: id })
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
  'taskStop',
  'taskYield',
  'queueEdit',
  'queueDelete',
  'queuePromote'
])

export class ResearchBoardsService {
  readonly store: ResearchBoardsStore
  readonly client: CollaborationClient
  private accountView: AccountView
  private readonly boards = new Map<string, RuntimeBoard>()
  private readonly localTaskProgress = new Map<string, any>()
  private readonly progressTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly boardAccessGenerations = new Map<string, number>()
  private readonly listeners = new Set<(event: ResearchBoardsEvent) => void>()
  private readonly reservations = new Map<
    string,
    { reservationId: string; generation: number; previousSessionId?: string }
  >()
  private readonly opening = new Map<string, Promise<RuntimeBoard>>()
  private readonly creating = new Map<
    string,
    { includeHistory: boolean; operation: Promise<unknown> }
  >()
  private currentBoard: string | null = null
  private activationVersion = 0
  private activeDispose?: () => void
  private notificationsDispose?: () => void
  private accountDispose: () => void
  private generationAbort = new AbortController()
  private stopped = false
  private eventSeq = 0
  private flushing?: Promise<void>
  private refreshPromise?: Promise<void>
  private refreshRequested = false
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
      | Omit<Extract<ResearchBoardsEvent, { type: 'component' }>, 'eventSeq' | 'accountGeneration'>
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
    if (
      r &&
      this.currentBoard === boardId &&
      (r.materializedRevision || !this.permissions(r).read)
    )
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
  private boardContext(boardId: string): BoardAccessContext {
    return {
      ...this.context(),
      boardId,
      accessGeneration: this.boardAccessGenerations.get(boardId) ?? 0
    }
  }
  private checkBoard(context: BoardAccessContext) {
    this.check(context)
    if (
      context.accessGeneration !==
      (this.boardAccessGenerations.get(context.boardId) ?? 0)
    ) {
      throw new ResearchBoardsError(
        'BOARD_ACCESS_CHANGED',
        '看板访问状态已变化，请重新打开。'
      )
    }
  }
  private invalidateBoardAccess(boardId: string) {
    const generation = (this.boardAccessGenerations.get(boardId) ?? 0) + 1
    this.boardAccessGenerations.set(boardId, generation)
    this.opening.delete(boardId)
    this.reservations.delete(boardId)
    if (this.currentBoard === boardId) {
      this.activeDispose?.()
      this.activeDispose = undefined
    }
    return generation
  }
  private markOffline(r: RuntimeBoard) {
    if (
      r.connection === 'revoked' ||
      r.connection === 'revalidating' ||
      r.abort.signal.aborted
    )
      return
    r.connection = 'offline'
    r.presence = []
  }
  private watchCurrentBoard(
    boardId: string,
    activation = this.activationVersion
  ) {
    if (
      activation !== this.activationVersion ||
      this.currentBoard !== boardId
    )
      return
    const ctx = this.boardContext(boardId)
    this.activeDispose?.()
    this.activeDispose = this.client.watch(
      { scope: 'board', boardId },
      (event) => {
        if (
          activation !== this.activationVersion ||
          this.currentBoard !== boardId ||
          ctx.accessGeneration !==
            (this.boardAccessGenerations.get(boardId) ?? 0)
        )
          return
        if (ctx.generation === this.options.account.generation)
          void this.boardEvent(boardId, event, ctx)
      }
    )
  }
  private localSession(boardId: string) {
    const id = this.accountView.user?.userId
    return id ? (this.store.account(id).bindings[boardId] ?? null) : null
  }
  private permissions(r: RuntimeBoard) {
    const read =
      r.connection !== 'revoked' &&
      r.connection !== 'revalidating' &&
      !r.abort.signal.aborted &&
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
    const canvas = read ? copy(r.materialized ?? emptyCanvas()) : emptyCanvas()
    for (const node of canvas.artifacts) {
      const task = r.snapshot.tasks.filter(t => t.targetId === node.id).at(-1)
      if (!task || !['pending', 'running'].includes(task.status)) continue
      node.generationStartedAt = task.createdAt
      const progress = this.localTaskProgress.get(`${id}:${boardId}:${task.taskId}`)
      if (progress) {
        node.generationEvents = copy(progress.events)
        node.generationLastActivityAt = progress.lastActivityAt
        node.generationOutputChars = progress.outputChars
      }
    }
    return {
      boardId,
      localSessionId: this.localSession(boardId),
      board: copy(r.snapshot.board),
      connection: r.connection,
      permissions: permission,
      canvas,
      activities: read ? copy(r.activities ?? []) : [],
      canvasRevision: r.materializedRevision ?? r.revision,
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
            const progress = this.localTaskProgress.get(`${id}:${boardId}:${t.taskId}`) ?? r.activities?.find(v=>v.kind==='conversation'&&v.id===t.taskId)?.progress
            return copy({ ...safe, ...(progress ? { progress } : {}) }) as typeof t
          })
        : [],
      members: read ? copy(r.snapshot.members) : [],
      pendingInvitations: permission.manage
        ? copy(r.snapshot.pendingInvitations ?? [])
        : [],
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
        this.currentBoard &&
        this.boards.has(this.currentBoard) &&
        (this.boards.get(this.currentBoard)!.materializedRevision ||
          !this.permissions(this.boards.get(this.currentBoard)!).read)
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
    for (const timer of this.progressTimers.values()) clearTimeout(timer)
    this.progressTimers.clear()
    this.localTaskProgress.clear()
    this.activationVersion++
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
    this.refreshRequested = false
    for (const [boardId, r] of this.boards) {
      if (oldId) this.invalidateLocal(oldId, boardId)
      r.abort.abort()
      r.undo.destroy()
      r.doc.destroy()
    }
    this.boards.clear()
    this.boardAccessGenerations.clear()
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
    if (
      this.retryTimer ||
      this.stopped ||
      !this.options.account.authenticated
    )
      return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined
      void this.refresh()
    }, 5000)
    this.retryTimer.unref?.()
  }
  async refresh(): Promise<void> {
    if (this.refreshPromise) {
      // A result may have committed after the active read captured its snapshot.
      // Coalesce concurrent invalidations, but never discard the next fresh read.
      this.refreshRequested = true
      return this.refreshPromise
    }
    const generation = this.options.account.generation
    const work = (async () => {
      do {
        this.refreshRequested = false
        await this.refreshOnce(generation)
      } while (this.refreshRequested && generation === this.options.account.generation && !this.stopped)
    })()
    this.refreshPromise = work
    try {
      await work
    } finally {
      if (this.refreshPromise === work) this.refreshPromise = undefined
    }
  }
  private async refreshOnce(generation: number): Promise<void> {
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
      if (errorCode(error) === 'BOARD_ACCESS_CHANGED') return
      this.accountView.status = this.accountView.user
        ? 'ready'
        : 'unavailable'
      for (const r of this.boards.values()) this.markOffline(r)
      this.emitState()
      this.retry()
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
      // Events have distinct notification IDs but share authoritative invitation state.
      const invitations = new Map<
        string,
        NonNullable<Notification['invitation']>
      >()
      for (const row of [...a.notifications.notifications, ...map.values()]) {
        const invite = row.invitation,
          id = invite?.invitationId ?? invite?.id
        if (!invite || !id) continue
        const old = invitations.get(id)
        if (
          !old ||
          invite.version > old.version ||
          (invite.version === old.version &&
            (invite.status !== 'pending' || old.status === 'pending'))
        )
          invitations.set(id, invite)
      }
      for (const row of map.values()) {
        const id = row.invitation?.invitationId ?? row.invitation?.id
        if (id && invitations.has(id))
          row.invitation = copy(invitations.get(id)!)
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
    if (existing && !force && this.permissions(existing).read) return existing
    if (!replace && this.opening.has(boardId))
      return this.opening.get(boardId)!
    const ctx = this.boardContext(boardId)
    const task = (async () => {
      try {
        const snapshot = await this.client.request<BoardSnapshot>({
          kind: 'board.get',
          boardId
        })
        this.checkBoard(ctx)
        await this.receiveBoard(boardId, snapshot, replace, ctx)
        this.checkBoard(ctx)
        return this.boards.get(boardId)!
      } catch (error) {
        if (denied(error)) {
          this.checkBoard(ctx)
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
    replace = false,
    ctx = this.boardContext(boardId)
  ): Promise<void> {
    this.checkBoard(ctx)
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
    const wasBlocked =
      r?.connection === 'revoked' || r?.connection === 'revalidating'
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
      (snapshot.board.role === 'viewer' &&
        r?.snapshot.board.role !== 'viewer') ||
      (snapshot.board.lifecycle === 'archived' &&
        r?.snapshot.board.lifecycle !== 'archived')
    if (
      r &&
      (previousEpoch !== snapshot.board.sharingEpoch ||
        r.snapshot.board.role !== snapshot.board.role ||
        r.snapshot.board.lifecycle !== snapshot.board.lifecycle ||
        r.snapshot.board.sharingState !== snapshot.board.sharingState)
    ) {
      ctx.accessGeneration = this.invalidateBoardAccess(boardId)
    }
    if (retired) {
      if (r) {
        r.abort.abort()
        r.connection = 'revalidating'
        this.emitBoard(boardId, 'permissions')
      }
      await this.retirePending(boardId, 'PERMISSION_CHANGED', false)
    }
    this.checkBoard(ctx)
    r = this.boards.get(boardId)
    if (r && snapshot.seq < r.snapshot.seq) return
    if (wasBlocked) ctx.accessGeneration = this.invalidateBoardAccess(boardId)
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
    // Discussion state is already authoritative. Deliver it without waiting for
    // asset downloads, keeping the previously materialized canvas/revision pair.
    // Replaced/revoked runtimes have no materialized revision and cannot leak it.
    if (r.materializedRevision) this.emitBoard(boardId, 'remote')
    await this.materialize(r, ctx)
    this.checkBoard(ctx)
    if (this.currentBoard === boardId && !this.activeDispose)
      this.watchCurrentBoard(boardId)
    this.emitBoard(boardId, 'remote')
  }
  private async materialize(r: RuntimeBoard, ctx = this.context()) {
    const boardId = r.snapshot.board.boardId,
      deadline = Date.now() + 30000
    while (r.materializedRevision !== r.revision || r.materializedSessionId !== this.localSession(boardId)) {
      const localSessionId = this.localSession(boardId)
      if (!localSessionId) return
      this.check(ctx)
      if (this.boards.get(boardId) !== r || r.abort.signal.aborted)
        throw new ResearchBoardsError('BOARD_ACCESS_CHANGED')
      if (Date.now() > deadline)
        throw new ResearchBoardsError('STALE_CANVAS_REVISION')
      const revision = r.revision
      let pending = r.materialization
      if (!pending || pending.revision !== revision || pending.localSessionId !== localSessionId) {
        const canvas = projectDocument(r.doc)
        const promise = (async () => {
          if (
            portableAssetIds(canvas).length &&
            !this.options.hooks?.materializeBoard
          )
            throw new ResearchBoardsError(
              'RESOURCE_UNAVAILABLE',
              '共享资料尚未完成本机授权。'
            )
          const value = this.options.hooks?.materializeBoard
            ? await this.options.hooks.materializeBoard({
                accountId: ctx.userId,
                boardId,
                epoch: r.snapshot.board.sharingEpoch,
                localSessionId,
                canvas: copy(canvas),
                signal: AbortSignal.any([
                  this.generationAbort.signal,
                  r.abort.signal
                ])
              })
            : canvas
          this.check(ctx)
          if (this.boards.get(boardId) !== r || r.abort.signal.aborted)
            throw new ResearchBoardsError('BOARD_ACCESS_CHANGED')
          if (r.revision !== revision || this.localSession(boardId) !== localSessionId) return
          r.materializedSessionId = localSessionId
          r.materialized = copy(value)
          r.materializedRevision = revision
          const entry = r.revisions.get(revision)
          if (entry) entry.tabProjection = tabProjection(r.materialized)
        })()
        pending = { revision, localSessionId, promise }
        r.materialization = pending
      }
      try {
        await pending.promise
      } finally {
        if (r.materialization === pending) r.materialization = undefined
      }
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
  private async retirePending(
    boardId: string,
    reason: string,
    purge: boolean
  ) {
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
    const ctx = this.boardContext(boardId)
    ctx.accessGeneration = this.invalidateBoardAccess(boardId)
    const r = this.boards.get(boardId)
    const epoch = r?.snapshot.board.sharingEpoch ?? 0
    const localSessionId = this.localSession(boardId)
    if (r) {
      r.abort.abort()
      r.connection = 'revoked'
      r.presence = []
      r.materialized = undefined
      r.materializedRevision = undefined
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
    this.checkBoard(ctx)
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
  private requireBoard(
    boardId: string,
    localSessionId?: string,
    edit = false
  ) {
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
  private async canvasReply(
    r: RuntimeBoard,
    branch = r.revision,
    clientMutationId?: string
  ): Promise<CanvasReply> {
    await this.materialize(r)
    const view = this.view(r)
    return {
      canvas: view.canvas,
      canvasRevision: r.materializedRevision ?? r.revision,
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
    const baseRevision = safeId(input.baseRevision)
    if (input.requireLatest !== undefined && typeof input.requireLatest !== 'boolean')
      throw new ResearchBoardsError('INVALID_REQUEST')
    const latestRequired = input.requireLatest === true
    const base = r.revisions.get(baseRevision)
    // GET and socket snapshots can materialize the same document under a new
    // local token. Only an actual intervening document change invalidates a retry.
    const matchesHead = () => {
      const head = r.revisions.get(r.revision)
      return baseRevision === r.revision || !!(base && head && Buffer.compare(base.bytes, head.bytes) === 0)
    }
    if (!base || (latestRequired && !matchesHead()))
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
    if (this.boards.get(boardId) !== r || (latestRequired && !matchesHead()))
      throw new ResearchBoardsError('STALE_CANVAS_REVISION')
    // The renderer continues to edit its submitted branch until it hydrates.
    // Keep that branch's display-only memberships distinct from the room data.
    validateCanvas(next)
    const displayedTabs = tabProjection(next)
    if (base.tabProjection) omitUnchangedTabRecovery(next, base.canvas, base.tabProjection)
    preserveSharedBoardTabMembership(next, base.canvas)
    next = withSharedCanvasCompatibilityLayout(next, base.canvas)
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
    this.enqueue(
      boardId,
      'update',
      { update: toBase64(delta) },
      own,
      mutation
    )
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
    r.revisions.get(localBranchRevision)!.tabProjection = displayedTabs
    try {
      await this.materialize(r, ctx)
    } catch (error) {
      this.emitBoard(boardId, 'local')
      throw error
    }
    this.check(ctx)
    const reply = await this.canvasReply(r, localBranchRevision, mutation)
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
      Array<{ collection: 'files' | 'artifacts'; node: CanvasNode }> | undefined
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
  async prepareForUpdateRestart(): Promise<void> {
    if (this.stopped) throw Error('研究服务已停止，无法确认保存状态。')
    if (!this.accountView.user) return
    const ctx = this.context()
    await this.flushAuxiliary()
    await this.flush()
    this.check(ctx)
    const account = this.store.account(ctx.userId)
    if (account.pending.length || account.auxiliary.length) throw Error('研究更改尚未确认，请恢复连接后重试更新。')
  }
  private async acknowledge(
    op: PendingOperation,
    ctx: { generation: number; userId: string }
  ) {
    const access = this.boardContext(op.boardId)
    const snapshot = await this.client.request<BoardSnapshot>({
      kind: 'board.get',
      boardId: op.boardId
    })
    this.check(ctx)
    this.checkBoard(access)
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
    await this.receiveBoard(op.boardId, snapshot, false, access)
    this.checkBoard(access)
  }
  private async settleOwnerTransition(
    op: PendingOperation,
    ctx: { generation: number; userId: string },
    acceptedSeq: number
  ) {
    // The command response proves acceptance, but only a fresh authorized GET
    // can restore reads after its own socket was retired by an epoch change.
    for (let attempt = 0; attempt < 3; attempt++) {
      this.check(ctx)
      const previous = this.boards.get(op.boardId)
      if (
        !previous ||
        previous.connection === 'revoked' ||
        previous.snapshot.board.role !== 'owner' ||
        previous.snapshot.board.ownerId !== ctx.userId
      )
        throw new ResearchBoardsError('BOARD_ACCESS_CHANGED')
      let current: RuntimeBoard
      try {
        current = await this.loadBoard(op.boardId, true)
      } catch (error) {
        this.check(ctx)
        if (errorCode(error) === 'BOARD_ACCESS_CHANGED' && attempt < 2)
          continue
        throw error
      }
      this.check(ctx)
      const access = this.boardContext(op.boardId)
      if (
        this.boards.get(op.boardId) !== current ||
        current.connection !== 'online' ||
        !this.permissions(current).read ||
        current.snapshot.board.role !== 'owner' ||
        current.snapshot.board.ownerId !== ctx.userId ||
        current.snapshot.seq < acceptedSeq
      )
        throw new ResearchBoardsError('BOARD_ACCESS_CHANGED')
      this.checkBoard(access)
      this.store.updateAccount(ctx.userId, (a) => {
        a.pending = a.pending.filter((p) => p.operationId !== op.operationId)
        a.checkpoints[op.boardId] = copy(current.snapshot)
      })
      if (this.currentBoard === op.boardId && !this.activeDispose)
        this.watchCurrentBoard(op.boardId)
      return
    }
  }
  private async flushPending() {
    if (!this.accountView.user || this.stopped) return
    const ctx = this.context()
    const batch = this.store.account(ctx.userId).pending
    for (const op of batch) {
      try {
        this.check(ctx)
        let r = this.boards.get(op.boardId)
        if (
          !r ||
          r.connection === 'offline' ||
          r.connection === 'revalidating'
        )
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
        if (
          ctx.generation !== this.options.account.generation ||
          this.stopped
        )
          return
        if (errorCode(error) === 'BOARD_ACCESS_CHANGED') return
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
          if (r) this.markOffline(r)
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
            p.boardId === boardId &&
            p.action === action &&
            equal(p.body, body)
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
        body: {
          ...body,
          action,
          operationId: op.operationId,
          epoch: op.epoch
        }
      })
      this.check(ctx)
      if (
        result.operationId !== op.operationId ||
        !Number.isSafeInteger(result.seq)
      )
        throw new ResearchBoardsError('INVALID_RESPONSE')
      if (action === 'leave') {
        this.store.updateAccount(ctx.userId, (a) => {
          a.pending = a.pending.filter(
            (p) => p.operationId !== op.operationId
          )
        })
        await this.revoke(boardId, 'LEFT_BOARD')
      } else {
        try {
          await this.acknowledge(op, ctx)
        } catch (error) {
          if (
            errorCode(error) !== 'BOARD_ACCESS_CHANGED' ||
            !['cancel', 'reopen', 'archive', 'restore'].includes(action)
          )
            throw error
          await this.settleOwnerTransition(op, ctx, result.seq as number)
        }
      }
      return result
    } catch (error) {
      this.check(ctx)
      if (errorCode(error) === 'BOARD_ACCESS_CHANGED') throw error
      if (denied(error))
        await this.confirmAccessFailure(boardId, errorCode(error))
      else {
        const current = this.boards.get(boardId)
        if (current) this.markOffline(current)
        this.retry()
        this.emitState()
      }
      throw error
    }
  }
  private async finishCreation(
    ctx: { generation: number; userId: string },
    favorite: Favorite,
    body: Record<string, unknown>,
    expectedBoardId?: string
  ) {
    const reply = await this.client.request<{ board: Board }>({
      kind: 'board.create',
      body
    })
    this.check(ctx)
    if (
      expectedBoardId !== undefined &&
      reply.board.boardId !== expectedBoardId
    )
      throw new ResearchBoardsError('INVALID_RESPONSE')
    this.store.updateAccount(ctx.userId, (a) => {
      delete a.creates[favorite.favoriteId]
      if (!a.boards.some((b) => b.boardId === reply.board.boardId))
        a.boards.push(reply.board)
      a.sources[reply.board.boardId] = {
        favoriteId: favorite.favoriteId,
        sessionId: favorite.sessionId
      }
      a.hidden = a.hidden.filter((id) => id !== reply.board.boardId)
    })
    this.emitState()
    return { board: reply.board }
  }
  private async createBoard(
    favoriteId: string,
    titleOverride?: string,
    captureId?: string,
    includeHistory = true
  ) {
    const scopeMismatch = () => new ResearchBoardsError(
      'SHARE_SCOPE_CHANGED',
      '待发送的协作副本与本次选择的分享范围不一致。'
    )
    const current = this.creating.get(favoriteId)
    if (current) {
      if (current.includeHistory !== includeHistory) throw scopeMismatch()
      return current.operation
    }
    const ctx = this.context()
    const favorite = this.store
      .snapshot()
      .favorites.find((f) => f.favoriteId === favoriteId)
    if (!favorite) throw new ResearchBoardsError('NOT_FAVORITED')
    const operation = (async () => {
      const saved = this.store.account(ctx.userId).creates[favoriteId] ?? {
        operationId: randomUUID()
      }
      // A retry must never send a previously frozen conversation after the user chose board-only.
      if (
        !includeHistory && saved.body &&
        (saved.body.snapshot as Snapshot | undefined)?.history?.length !== 0
      ) throw scopeMismatch()
      this.store.updateAccount(ctx.userId, (a) => {
        a.creates[favoriteId] = saved
      })
      // An activated upload is immutable/closed. Recover its original creation
      // receipt from the persisted frozen manifest, without reading source files.
      if (typeof saved.body?.uploadId === 'string') {
        const upload = await this.client.request<{
          uploadId: string
          boardId: string | null
        }>({ kind: 'upload.create', operationId: saved.operationId })
        this.check(ctx)
        if (upload.boardId) {
          if (upload.uploadId !== saved.body.uploadId)
            throw new ResearchBoardsError('INVALID_RESPONSE')
          return this.finishCreation(
            ctx,
            favorite,
            saved.body,
            upload.boardId
          )
        }
      }
      if (!this.options.hooks?.captureOriginal)
        throw new ResearchBoardsError(
          'CAPTURE_UNAVAILABLE',
          '完整研究捕获尚未就绪。'
        )
      const captured = await this.options.hooks!.captureOriginal!({
        sessionId: favorite.sessionId,
        accountId: ctx.userId,
        accountGeneration: ctx.generation,
        operationId: saved.operationId,
        ...(captureId ? { captureId } : {}),
        ...(!includeHistory ? { includeHistory: false } : {}),
        signal: this.generationAbort.signal
      })
      this.check(ctx)
      try {
        const frozen = freezeSnapshot(captured.snapshot)
        if (!includeHistory && frozen.history.length) throw scopeMismatch()
        const assets = captured.assets ?? []
        const refs = new Set(portableAssetIds(frozen))
        if ([...refs].some((id) => !assets.some((a) => a.assetId === id)))
          throw new ResearchBoardsError(
            'RESOURCE_UNAVAILABLE',
            '共享资料未完整复制。'
          )
        if (
          saved.body &&
          saved.body.sourceRevision !== captured.sourceRevision
        )
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
          const upload = await this.client.request<{
            uploadId: string
            boardId: string | null
          }>({
            kind: 'upload.create',
            operationId: saved.operationId
          })
          this.check(ctx)
          if (!upload.boardId)
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
        return await this.finishCreation(ctx, favorite, body)
      } finally {
        await captured.dispose?.()
      }
    })()
    this.creating.set(favoriteId, { includeHistory, operation })
    try {
      return await operation
    } finally {
      if (this.creating.get(favoriteId)?.operation === operation)
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
      case 'local.directory': {
        const p = exact(input, ['mode'], ['basePath', 'title', 'sessionId', 'directoryId', 'targetSessionId', 'workspaceId', 'workspaceTitle'])
        if (!['reserve', 'bind', 'workspace', 'associate', 'ensure', 'fork', 'app-workspace'].includes(String(p.mode))) throw new ResearchBoardsError('INVALID_REQUEST')
        if (p.sessionId !== undefined) safeId(p.sessionId)
        if (p.directoryId !== undefined) safeId(p.directoryId)
        if (p.targetSessionId !== undefined) safeId(p.targetSessionId)
        if (p.workspaceId !== undefined) safeId(p.workspaceId)
        if (p.workspaceTitle !== undefined) text(p.workspaceTitle)
        if (p.mode === 'associate' && !this.store.snapshot().favorites.some(f => f.sessionId === p.sessionId && f.dedicated)) throw new ResearchBoardsError('BINDING_CONFLICT')
        if (p.mode === 'app-workspace' && !this.store.sharedSession(String(p.sessionId)) &&
          !this.store.snapshot().favorites.some(f => f.sessionId === p.sessionId && f.pinned !== false))
          throw new ResearchBoardsError('BINDING_CONFLICT')
        if (p.title !== undefined) text(p.title)
        if (p.basePath !== undefined) text(p.basePath, 4096)
        if (!this.options.hooks?.directory) throw new ResearchBoardsError('CAPTURE_UNAVAILABLE')
        const binding = p.sessionId ? this.store.sharedSession(String(p.sessionId)) : undefined
        const ctx = binding ? this.context() : null
        if (binding && binding.accountId !== ctx!.userId) throw new ResearchBoardsError('PERMISSION_DENIED')
        if (binding) {
          if (p.mode === 'app-workspace') await this.loadBoard(binding.boardId)
          this.requireBoard(binding.boardId, binding.localSessionId)
        }
        const result = await this.options.hooks.directory(p, this.generationAbort.signal)
        if (ctx) this.check(ctx)
        if (p.mode === 'associate') {
          this.store.associateFavorite(String(p.sessionId), { sessionId: result.localSessionId, cwd: result.path, directoryPath: result.directoryPath, workspaceId: p.workspaceId as string | undefined, workspaceTitle: p.workspaceTitle as string | undefined })
          this.emitState()
        }
        if (binding && p.mode === 'workspace' && result.localSessionId !== p.sessionId) {
          this.store.rebind(binding.accountId, binding.boardId, binding.localSessionId, result.localSessionId)
          const runtime = this.boards.get(binding.boardId)
          if (runtime) await this.materialize(runtime)
          this.emitState()
        }
        return result
      }
      case 'favorite.add': {
        const p = exact(input, ['identity'], ['pinned', 'dedicated'])
        if ((p.pinned !== undefined && typeof p.pinned !== 'boolean') || (p.dedicated !== undefined && typeof p.dedicated !== 'boolean')) throw new ResearchBoardsError('INVALID_REQUEST')
        const i = exact(
          p.identity,
          ['sessionId', 'title'],
          ['cwd', 'workspaceId', 'workspaceTitle']
        )
        safeId(i.sessionId)
        text(i.title)
        for (const k of ['cwd', 'workspaceId', 'workspaceTitle'])
          if (i[k] !== undefined) text(i[k], 4096)
        const favorite = this.store.addFavorite(i as Favorite, p.pinned !== false, p.dedicated === true)
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
      case 'boards.listRefresh': {
        exact(input, [])
        const ctx = this.context()
        const list = await this.client.request<{ boards: Board[] }>({
          kind: 'boards.list'
        })
        this.check(ctx)
        if (!Array.isArray(list.boards))
          throw new ResearchBoardsError('INVALID_RESPONSE')
        const cached = this.store.account(ctx.userId).boards
        this.store.setBoards(
          ctx.userId,
          list.boards.map((board) => {
            const recent = cached.find((b) => b.boardId === board.boardId)
            return recent && recent.seq > board.seq ? recent : board
          })
        )
        this.emitState()
        return this.getSnapshot()
      }
      case 'boards.refresh':
        exact(input, [])
        await this.refresh()
        return this.getSnapshot()
      case 'board.create': {
        const p = exact(input, ['favoriteId'], [
          'title', 'captureId', 'includeHistory'
        ])
        if (
          (p.includeHistory !== undefined && typeof p.includeHistory !== 'boolean') ||
          (p.includeHistory === false && p.captureId === undefined)
        ) throw new ResearchBoardsError('INVALID_REQUEST')
        return this.createBoard(
          safeId(p.favoriteId),
          p.title === undefined ? undefined : text(p.title),
          p.captureId === undefined ? undefined : safeId(p.captureId),
          p.includeHistory !== false
        )
      }
      case 'board.previewCapture': {
        const p = exact(input, ['favoriteId'], ['includeHistory'])
        if (p.includeHistory !== undefined && typeof p.includeHistory !== 'boolean')
          throw new ResearchBoardsError('INVALID_REQUEST')
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
          ...(p.includeHistory === false ? { includeHistory: false } : {}),
          signal: this.generationAbort.signal
        })
        this.check(ctx)
        return result
      }
      case 'board.open': {
        const p = exact(input, ['boardId'], ['missingLocalSessionId'])
        const boardId = safeId(p.boardId)
        const missingLocalSessionId = p.missingLocalSessionId === undefined ? undefined : safeId(p.missingLocalSessionId)
        await this.loadBoard(boardId, true)
        const account = this.userId()
        this.store.setPinned(account, boardId, true)
        const localSessionId = this.localSession(boardId)
        this.emitState()
        if (localSessionId && localSessionId !== missingLocalSessionId) return { localSessionId }
        const previousSessionId = localSessionId ?? undefined
        let reservation = this.reservations.get(boardId)
        if (!reservation || reservation.previousSessionId !== previousSessionId) {
          reservation = {
            reservationId: randomUUID(),
            generation: this.options.account.generation,
            previousSessionId
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
        if (reservation.previousSessionId) {
          this.store.rebind(this.userId(), boardId, reservation.previousSessionId, sessionId)
        } else {
          this.store.bind(this.userId(), boardId, sessionId)
        }
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
        const activation = ++this.activationVersion
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
        let r: RuntimeBoard
        try {
          r = await this.loadBoard(binding.boardId, true)
        } catch (error) {
          this.check(ctx)
          if (activation !== this.activationVersion) return null
          throw error
        }
        this.check(ctx)
        if (activation !== this.activationVersion) return null
        this.currentBoard = binding.boardId
        this.watchCurrentBoard(binding.boardId, activation)
        this.emitBoard(binding.boardId, 'open')
        return this.view(r)
      }
      case 'canvas.apply':
        return this.applyCanvas(
          exact(
            input,
            ['boardId', 'localSessionId', 'baseRevision', 'clientMutationId', 'canvas'],
            ['requireLatest']
          )
        )
      case 'canvas.refresh': {
        const p = exact(input, ['boardId', 'localSessionId'])
        const boardId = safeId(p.boardId), localSessionId = safeId(p.localSessionId)
        const ctx = this.context()
        if (this.getBinding(localSessionId)?.boardId !== boardId)
          throw new ResearchBoardsError('BINDING_CONFLICT')
        await this.loadBoard(boardId, true)
        this.check(ctx)
        const view = this.view(this.requireBoard(boardId, localSessionId))
        void this.flush()
        return view
      }
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
          signal: AbortSignal.any([
            this.generationAbort.signal,
            r.abort.signal
          ])
        })
        this.check(ctx)
        return value
      }
      case 'board.finalizePersonalCopy': {
        const p = exact(input, ['copyId', 'localSessionId'])
        const copyId = safeId(p.copyId),
          localSessionId = safeId(p.localSessionId)
        const completed = this.options.hooks?.completedPersonalCopy?.(
          this.context().userId,
          copyId,
          localSessionId
        )
        if (completed) return completed
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
          if (
            raw &&
            raw !== '[]' &&
            !this.options.hooks?.canResumePersonalCopy?.(
              this.context().userId,
              copyId,
              localSessionId
            )
          )
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
      case 'import.get': {
        const p = exact(input, ['localSessionId'])
        const id = safeId(p.localSessionId)
        if (this.isSharedSession(id))
          throw new ResearchBoardsError('BINDING_CONFLICT')
        return this.options.hooks?.personalImport?.(id) ?? null
      }
      case 'import.fileOpen': {
        const p = exact(input, ['localSessionId', 'nodeId'])
        const id = safeId(p.localSessionId)
        if (this.isSharedSession(id) || !this.options.hooks?.personalFileOpen)
          throw new ResearchBoardsError('RESOURCE_UNAVAILABLE')
        return this.options.hooks.personalFileOpen(id, safeId(p.nodeId))
      }
      case 'file.open': {
        const p = exact(input, ['boardId', 'localSessionId', 'nodeId'])
        const boardId = safeId(p.boardId)
        const r = this.requireBoard(boardId)
        const binding = this.getBinding(safeId(p.localSessionId))
        if (binding?.boardId !== boardId)
          throw new ResearchBoardsError('BINDING_CONFLICT')
        if (!this.options.hooks?.fileOpen)
          throw new ResearchBoardsError('RESOURCE_UNAVAILABLE')
        return this.options.hooks.fileOpen({
          accountId: this.context().userId,
          boardId,
          localSessionId: binding.localSessionId,
          nodeId: safeId(p.nodeId),
          signal: AbortSignal.any([
            this.generationAbort.signal,
            r.abort.signal
          ])
        })
      }
      case 'queue.edit':
      case 'queue.delete':
      case 'queue.promote': {
        const p = exact(input, ['boardId', 'taskId'], action === 'queue.edit' ? ['text'] : [])
        const boardId = safeId(p.boardId)
        this.requireBoard(boardId, undefined, true)
        if (action === 'queue.edit' && (typeof p.text !== 'string' || !p.text.trim() || Buffer.byteLength(p.text) > 16384)) throw new ResearchBoardsError('INVALID_REQUEST')
        return this.command(boardId, { 'queue.edit': 'queueEdit', 'queue.delete': 'queueDelete', 'queue.promote': 'queuePromote' }[action], {
          taskId: safeId(p.taskId), ...(action === 'queue.edit' ? { text: p.text } : {})
        })
      }
      case 'request.list':
      case 'request.retry':
      case 'task.stop':
      case 'task.applyResult': {
        const p = exact(
          input,
          ['boardId'],
          action === 'request.retry'
            ? ['clientMutationId']
            : action.startsWith('task.')
              ? ['taskId']
              : []
        )
        const boardId = safeId(p.boardId),
          r = this.requireBoard(
            boardId,
            undefined,
            action !== 'request.list'
          ),
          accountId = this.context().userId
        const signal = AbortSignal.any([
          this.generationAbort.signal,
          r.abort.signal
        ])
        if (action === 'request.list')
          return this.options.hooks?.requestList?.(accountId, boardId) ?? []
        if (action === 'request.retry' && this.options.hooks?.requestRetry)
          return this.options.hooks.requestRetry(
            accountId,
            boardId,
            safeId(p.clientMutationId),
            signal
          )
        if (action.startsWith('task.') && this.options.hooks?.taskAction)
          return this.options.hooks.taskAction(
            accountId,
            boardId,
            safeId(p.taskId),
            action === 'task.stop' ? 'stop' : 'apply',
            signal
          )
        throw new ResearchBoardsError('EXECUTION_UNAVAILABLE')
      }
      case 'request.submit': {
        const p = exact(
          input,
          ['boardId', 'text', 'clientMutationId'],
          ['targetId', 'targetCollection', 'source', 'context']
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
          context: normalizeRequestContext(p.context),
          accountId: ctx.userId,
          signal: AbortSignal.any([
            this.generationAbort.signal,
            r.abort.signal
          ])
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
      case 'notifications.feedback': {
        const p = exact(input, ['operationId', 'message'], ['images'])
        const images = p.images ?? []
        if (typeof p.message !== 'string' || !validFeedbackImages(images)) throw new ResearchBoardsError('INVALID_REQUEST')
        return this.client.request({
          kind: 'notifications.feedback', operationId: safeId(p.operationId), message: p.message.trim(),
          ...(images.length ? { images } : {})
        }, this.generationAbort.signal)
      }
      case 'notifications.feedbackImage': {
        const p = exact(input, ['notificationId', 'position'])
        if (typeof p.position !== 'number') throw new ResearchBoardsError('INVALID_REQUEST')
        return this.client.request({ kind: 'notifications.feedbackImage', notificationId: safeId(p.notificationId), position: p.position }, this.generationAbort.signal)
      }
      case 'notifications.read': {
        const p = exact(input, [], ['notificationIds'])
        if (
          p.notificationIds !== undefined &&
          (!Array.isArray(p.notificationIds) ||
            p.notificationIds.length > 1000)
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
      case 'activity.publish': {
        const p=exact(input,['boardId','activity']), boardId=safeId(p.boardId)
        this.requireBoard(boardId,undefined,true)
        if(boardId!==this.currentBoard)throw new ResearchBoardsError('INVALID_REQUEST')
        this.client.sendActivity(boardId,cleanActivity(p.activity))
        return {ok:true}
      }
      case 'component.send': {
        const p = exact(input, ['boardId', 'message'])
        const boardId = safeId(p.boardId), message = p.message as any
        const r = this.requireBoard(boardId)
        if (boardId !== this.currentBoard) throw new ResearchBoardsError('INVALID_REQUEST')
        validateComponentMessage(message)
        if (message.op === 'input' || message.op === 'commit') this.requireBoard(boardId, undefined, true)
        const node = projectDocument(r.doc).artifacts.find(n => n.id === message.nodeId)
        const html = (node?.containerSpec as { html?: string } | undefined)?.html
        if (typeof html !== 'string' || componentVersion(html) !== message.version) throw new ResearchBoardsError('COMPONENT_VERSION_CHANGED')
        this.client.sendComponent(boardId, message)
        return { ok: true }
      }
      case 'presence.update': {
        const p = exact(
          input,
          ['boardId'],
          ['cursor', 'selectedIds', 'previews']
        )
        const boardId = safeId(p.boardId)
        const r = this.requireBoard(boardId)
        if (boardId !== this.currentBoard)
          throw new ResearchBoardsError('INVALID_REQUEST')
        const hints = {
          cursor: p.cursor ?? null,
          selectedIds: p.selectedIds ?? [],
          previews: p.previews ?? []
        }
        if (Array.isArray(hints.previews) && hints.previews.length)
          this.requireBoard(boardId, undefined, true)
        try {
          validatePresenceHints(hints, projectDocument(r.doc))
        } catch {
          throw new ResearchBoardsError('INVALID_REQUEST')
        }
        this.client.sendPresence(
          boardId,
          hints as Parameters<CollaborationClient['sendPresence']>[1]
        )
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
        const reply = await this.applyTaskCanvas(
          this.userId(),
          boardId,
          canvas
        )
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
    ctx: BoardAccessContext
  ) {
    try {
      this.checkBoard(ctx)
      if (this.currentBoard !== boardId) return
      if (event.type === 'welcome' || event.type === 'boardChanged') {
        const access = { ...ctx }
        await this.receiveBoard(
          boardId,
          event as unknown as BoardSnapshot,
          false,
          access
        )
        this.checkBoard(access)
        if(event.type==='welcome'&&Array.isArray(event.activities)){this.requireBoard(boardId).activities=event.activities;this.emitBoard(boardId,'progress')}
        if (event.presence) this.updatePresence(boardId, event.presence)
        void this.flush()
      } else if (event.type === 'activity') {
        const r=this.requireBoard(boardId), value=event.activity as Record<string, any>
        if(!value||!value.userId)return
        const list=r.activities??[], previous=list.find(v=>v.id===value.id&&v.userId===value.userId&&v.kind===value.kind)
        if(previous&&previous.sequence>=value.sequence)return
        r.activities=[...list.filter(v=>v!==previous),value].slice(-100)
        this.emitBoard(boardId,'progress')
      } else if (event.type === 'component') {
        this.emit({ type: 'component', boardId, localSessionId: this.localSession(boardId), message: event })
      } else if (event.type === 'presence')
        this.updatePresence(boardId, event.presence)
      else if (event.type === 'accessRevoked') {
        // A role/archive change can retain reads; confirm before purging.
        const activation = this.activationVersion
        this.invalidateBoardAccess(boardId)
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
          if (!this.activeDispose) this.watchCurrentBoard(boardId, activation)
        } catch (error) {
          if (errorCode(error) === 'BOARD_ACCESS_CHANGED') return
          if (!denied(error)) {
            const r = this.boards.get(boardId)
            if (r) r.connection = 'revalidating'
            this.emitBoard(boardId, 'permissions')
            this.retry()
          }
        }
      } else if (event.type === 'offline') {
        const r = this.boards.get(boardId)
        if (r) {
          this.markOffline(r)
          this.emitBoard(boardId, 'offline')
        }
      }
    } catch (error) {
      if (errorCode(error) !== 'BOARD_ACCESS_CHANGED') this.retry()
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
  taskAuthority(
    accountId: string,
    boardId: string,
    epoch?: number,
    write = false
  ) {
    const ctx = this.context()
    if (ctx.userId !== accountId)
      throw new ResearchBoardsError('SESSION_CHANGED')
    const r = this.requireBoard(boardId, undefined, write)
    if (epoch !== undefined && r.snapshot.board.sharingEpoch !== epoch)
      throw new ResearchBoardsError('BOARD_ACCESS_CHANGED')
    const account = this.store.account(accountId)
    return {
      snapshot: copy(r.snapshot),
      localSessionId: account.bindings[boardId],
      sourceSessionId: r.snapshot.board.ownerId === accountId ? account.sources[boardId]?.sessionId : undefined,
      signal: AbortSignal.any([this.generationAbort.signal, r.abort.signal])
    }
  }
  setLocalTaskProgress(accountId: string, boardId: string, taskId: string, progress: any) {
    const a = this.taskAuthority(accountId, boardId)
    const task = a.snapshot.tasks.find(t => t.taskId === taskId)
    if (!task || !['pending', 'running'].includes(task.status)) return
    if (!progress || !Array.isArray(progress.events) || !Number.isFinite(progress.lastActivityAt) || !Number.isFinite(progress.outputChars)) return
    const key = `${accountId}:${boardId}:${taskId}`
    const value = {
      ...(Number.isFinite(progress.startedAt) ? { startedAt: progress.startedAt } : {}),
      events: progress.events.slice(-12),
      lastActivityAt: progress.lastActivityAt,
      outputChars: progress.outputChars
    }
    if (JSON.stringify(this.localTaskProgress.get(key)) === JSON.stringify(value)) return
    this.localTaskProgress.set(key, copy(value))
    try { this.client.sendActivity(boardId,cleanActivity({kind:'conversation',id:taskId,sequence:Date.now(),progress:value})) } catch {}
    if (this.localTaskProgress.size > 100) this.localTaskProgress.delete(this.localTaskProgress.keys().next().value!)
    if (!this.progressTimers.has(boardId)) {
      const timer = setTimeout(() => {
        this.progressTimers.delete(boardId)
        if (!this.stopped) this.emitBoard(boardId, 'progress')
      }, 500)
      timer.unref?.()
      this.progressTimers.set(boardId, timer)
    }
  }
  async applyTaskCanvas(accountId: string, boardId: string, canvas: Canvas) {
    const a = this.taskAuthority(accountId, boardId, undefined, true),
      baseRevision = this.requireBoard(boardId, undefined, true).revision
    // Keep the captured canvas paired with its base while assets materialize.
    if (!a.localSessionId) throw new ResearchBoardsError('BINDING_CONFLICT')
    // Materialized local representation preserves the existing projection/asset guard.
    const local = this.options.hooks?.materializeBoard
      ? await this.options.hooks.materializeBoard({
          accountId,
          boardId,
          epoch: a.snapshot.board.sharingEpoch,
          localSessionId: a.localSessionId,
          canvas,
          signal: a.signal
        })
      : canvas
    return this.applyCanvas({
      boardId,
      localSessionId: a.localSessionId,
      baseRevision,
      clientMutationId: randomUUID(),
      canvas: local
    })
  }
  // Calendar edits share the exact canvas branch captured before materialization.
  // Per-event keys patch an existing containerSpec Y.Map, even for first events.
  readCalendar(target: { sessionId: string; nodeId: string }) {
    const binding = this.getBinding(target.sessionId)
    if (!binding) throw new ResearchBoardsError('ACCESS_DENIED')
    const r = this.requireBoard(binding.boardId, target.sessionId)
    const node = projectDocument(r.doc).artifacts.find(n => n.id === target.nodeId)
    if ((node?.containerSpec as any)?.type !== 'calendar-tool') throw Error('日历组件不存在')
    const permission = this.permissions(r)
    return {
      spec: copy(node!.containerSpec) as Record<string, unknown>,
      shared: {
        canEdit: permission.execute,
        connected: r.connection === 'online',
        pending: this.store.account(binding.accountId).pending.some(p => p.boardId === binding.boardId)
      }
    }
  }
  async updateCalendar<T>(
    target: { sessionId: string; nodeId: string },
    change: (spec: Record<string, unknown>) => T
  ): Promise<T> {
    this.authorizeCanvasUse(target.sessionId, true)
    const binding = this.getBinding(target.sessionId)
    if (!binding) throw new ResearchBoardsError('ACCESS_DENIED')
    const ctx = this.boardContext(binding.boardId)
    const r = this.requireBoard(binding.boardId, target.sessionId, true)
    const baseRevision = r.revision, canvas = projectDocument(r.doc)
    const node = canvas.artifacts.find(n => n.id === target.nodeId)
    if ((node?.containerSpec as any)?.type !== 'calendar-tool') throw Error('日历组件不存在')
    const result = change(node!.containerSpec as Record<string, unknown>)
    const local = this.options.hooks?.materializeBoard
      ? await this.options.hooks.materializeBoard({
          accountId: binding.accountId,
          boardId: binding.boardId,
          epoch: r.snapshot.board.sharingEpoch,
          localSessionId: target.sessionId,
          canvas,
          signal: AbortSignal.any([this.generationAbort.signal, r.abort.signal])
        })
      : canvas
    this.checkBoard(ctx)
    this.authorizeCanvasUse(target.sessionId, true)
    await this.applyCanvas({
      boardId: binding.boardId,
      localSessionId: target.sessionId,
      baseRevision,
      clientMutationId: randomUUID(),
      canvas: local
    })
    return result
  }
  readSharedCanvas(sessionId: string): Canvas {
    const binding = this.getBinding(sessionId)
    if (!binding) throw new ResearchBoardsError('ACCESS_DENIED')
    return projectDocument(this.requireBoard(binding.boardId).doc)
  }
  fileImportScope(sessionId: string): string | null {
    if (!this.isSharedSession(sessionId)) return null
    const binding = this.getBinding(sessionId)
    if (!binding) throw new ResearchBoardsError('ACCESS_DENIED')
    const board = this.requireBoard(binding.boardId, sessionId, true)
    return JSON.stringify([binding.accountId, binding.boardId, board.snapshot.board.sharingEpoch])
  }
  authorizeCanvasUse(sessionId: string, write: boolean): void {
    if (!this.isSharedSession(sessionId)) return
    const binding = this.getBinding(sessionId)
    if (!binding) throw new ResearchBoardsError('ACCESS_DENIED')
    const board=this.requireBoard(binding.boardId, sessionId, write)
    if(write&&!this.permissions(board).execute)throw Error('协作连接不可用，任务已暂停。')
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
      return JSON.stringify((r.materialized ?? emptyCanvas())[kind])
    if (r && this.permissions(r).read && kind === 'preview-revocations') return this.options.storage.getItem(key) ?? '[]'
    return kind === 'selection' ? '{}' : kind === 'engaged' ? '0' : '[]'
  }
  writeCanvasStorage(key: unknown, value: unknown): boolean {
    const parsed = this.storageBinding(key)
    if (parsed?.binding) {
      // Preview grant cleanup is a local outbox, not a shared canvas mutation.
      const board = parsed.binding.accountId === this.accountView.user?.userId ? this.boards.get(parsed.binding.boardId) : undefined
      if (parsed.kind !== 'preview-revocations' || !board || !this.permissions(board).read || typeof value !== 'string') return false
      try {
        const ids = JSON.parse(value)
        if (!Array.isArray(ids) || ids.length > 256 || ids.some(id => typeof id !== 'string' || !/^[-\w:.]{1,128}$/.test(id))) return false
        return this.options.storage.setItem(key, value)
      } catch { return false }
    }
    const before = this.options.storage.getItem(key)
    const saved = this.options.storage.setItem(key, value)
    const match =
      typeof key === 'string' &&
      key.match(/^sherlock\.research\.canvas\.(?:files|artifacts)\.v1:(.+)$/)
    if (saved && before !== value && match) {
      try {
        if (this.store.touchFavorite(match[1]!)) this.emitState()
      } catch {
        /* Canvas was saved; a full metadata store must not discard it. */
      }
    }
    return saved
  }
  stop() {
    for (const timer of this.progressTimers.values()) clearTimeout(timer)
    this.progressTimers.clear()
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
  for (const channel of [
    'research:boards:invoke',
    'research:boards:snapshot'
  ])
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
