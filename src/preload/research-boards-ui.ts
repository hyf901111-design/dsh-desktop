// The hosted page supplies React; this Electron-only TS project has no React declarations.
// @ts-expect-error Runtime dependency is supplied by the client module loader.
import * as React from 'react'
import type {
  BoardView,
  Canvas,
  CanvasReply,
  ResearchBoardsBridge,
  ResearchBoardsState,
  ResearchBoardsEvent,
  Favorite,
  BoardSummary,
  ResearchIdentity
} from '../shared/research-boards'
import {
  boardButton,
  boardDialog,
  boardRoleLabel,
  installBoardUiStyles,
  normalizePublicId,
  publicIdLabel,
  unwrapBoardReply
} from './research-board-dialogs'
// This module is compiled into the page-world client factory. Runtime objects never cross contextBridge.
type Store<T> = {
  getSnapshot(): T
  subscribe(listener: () => void): () => void
}
type LegacyNode = Record<string, any>
type Workspace = {
  isCollaborationGesture?(): boolean

  getSnapshot(): LegacyNode
  subscribe(fn: () => void): () => void
  applyRemoteCanvas(canvas: Canvas, meta: { revision: string }): void
  setCollaborationAccess(edit: boolean): void
  cancelTransient(): void
  [key: string]: any
}
type SessionList = {
  current?: string
  byId: Record<string, LegacyNode>
  phase?: string
}
export type PageDependencies = {
  sessions: {
    list: Store<SessionList>
    open(id: string): void
    create(input: Record<string, unknown>): Promise<string>
    binding(id: string): any
    [key: string]: any
  }
  workspaces: { list: Store<any> }
  researchWorkspaces: { for(id: string): Workspace }
  inputHub: { shells: Map<string, any> }
  bridge: ResearchBoardsBridge
  slots?: any
  document?: Document
}
const emptyState = (): ResearchBoardsState => ({
  version: 1,
  eventSeq: 0,
  account: { status: 'loading', generation: 0, user: null },
  favorites: [],
  boards: [],
  current: null,
  recoveries: [],
  notifications: {
    notifications: [],
    cursor: 0,
    unreadCount: 0,
    pendingCount: 0
  }
})
const canvasOf = (w: Workspace): Canvas => {
  const s = w.getSnapshot()
  return structuredClone({ files: s.files, artifacts: s.artifacts })
}
const signature = (v: unknown) => JSON.stringify(v)
const uuid = () => crypto.randomUUID()
type EditState = {
  workspace: Workspace
  unsubscribe: () => void
  view: BoardView
  revision: string
  observed: string
  applying: boolean
  queued?: Canvas
  remote?: BoardView
  busy: boolean
  paused: boolean
  timer?: ReturnType<typeof setTimeout>
  mutation?: { id: string; canvas: Canvas; base: string }
  error?: string
}
export type SharedRequestContext = {
  scope: 'board' | 'references'
  references: { collection: 'files' | 'artifacts'; nodeId: string }[]
}
type RequestReply = {
  accepted: boolean
  clientMutationId: string
  state: string
  requestMessageId?: string
  taskId?: string | null
  error?: { message: string }
}
export function createResearchBoardsPage(deps: PageDependencies) {
  const doc = deps.document ?? document,
    win = doc.defaultView!,
    bridge = deps.bridge
  let state = emptyState(),
    disposed = false,
    eventSeq = -1,
    revision = 0,
    activeSession: string | null = null,
    navigation = 0
  const listeners = new Set<() => void>(),
    editors = new Map<string, EditState>(),
    activeResearch = new Set<string>(),
    opening = new Map<string, Promise<string>>(),
    copies = new Map<string, string>()
  const previewStates = new Map<
    string,
    {
      cursor: { x: number; y: number } | null
      selectedIds: string[]
      last: number
      timer?: ReturnType<typeof setTimeout>
    }
  >()
  const ownRecovery = new Map<string, { boardId: string; text: string }>()
  const sends = new Map<
      string,
      {
        id: string
        key: string
        busy: boolean
        reply?: RequestReply
        retry?: () => Promise<void>
      }
    >(),
    drafts = new Map<
      string,
      {
        id: string
        timer?: ReturnType<typeof setTimeout>
        text: string
        chain: Promise<unknown>
      }
    >()
  const favoriteWatches = new Map<string, () => void>()
  const cleanups: Array<() => void> = []
  const notify = () => {
    revision++
    listeners.forEach((fn) => fn())
  }
  const call = <T = unknown>(action: string, input: unknown = {}) =>
    unwrapBoardReply<T>(bridge.invoke(action, input))
  const identity = (sessionId: string): ResearchIdentity | null => {
    const summary = deps.sessions.list.getSnapshot().byId[sessionId]
    if (!summary) return null
    const list = deps.workspaces.list.getSnapshot(),
      items = list.items ?? list.workspaces ?? []
    const workspace =
      items.find((w: any) => w.sessionIds?.includes(sessionId)) ??
      items.find((w: any) => summary.cwd && w.path === summary.cwd)
    return {
      sessionId,
      title: summary.title ?? summary.displayTitle ?? '研究',
      ...(summary.cwd ? { cwd: summary.cwd } : {}),
      ...(workspace
        ? {
            workspaceId: workspace.workspaceId,
            workspaceTitle: workspace.title
          }
        : {})
    }
  }
  const current = () => deps.sessions.list.getSnapshot().current
  const view = (id?: string): BoardView | null =>
    id
      ? (editors.get(id)?.view ??
        (state.current?.localSessionId === id ? state.current : null))
      : null
  const isShared = (id: string) => bridge.isSharedSession(id)
  const showError = (error: unknown) => {
    const d = boardDialog(doc, '操作未完成')
    d.status.textContent =
      error instanceof Error ? error.message : String(error)
  }
  const purge = (id: string) => {
    for (const kind of ['files', 'artifacts', 'selection'])
      try {
        win.localStorage.removeItem(`sherlock.research.canvas.${kind}.v1:${id}`)
      } catch {}
  }
  function rememberOwnCanvas(boardId: string, before: Canvas, after: Canvas) {
    const additions: string[] = []
    for (const collection of ['files', 'artifacts'] as const)
      for (const node of after[collection]) {
        const old = before[collection].find((n) => n.id === node.id)
        if (!old) {
          additions.push(
            JSON.stringify(node, (key, value) =>
              [
                'authorizationId',
                'capabilityToken',
                'path',
                'assetId'
              ].includes(key)
                ? undefined
                : value
            )
          )
          continue
        }
        for (const key of Object.keys(node)) {
          const a = old[key],
            b = node[key]
          if (
            a === b ||
            ['authorizationId', 'capabilityToken', 'path', 'assetId'].includes(
              key
            )
          )
            continue
          if (typeof a === 'string' && typeof b === 'string') {
            let left = 0,
              right = 0
            while (left < a.length && left < b.length && a[left] === b[left])
              left++
            while (
              right < a.length - left &&
              right < b.length - left &&
              a[a.length - right - 1] === b[b.length - right - 1]
            )
              right++
            const inserted = b.slice(left, b.length - right)
            if (inserted) additions.push(`${node.id} ${key}: ${inserted}`)
            else additions.push(`${node.id} ${key}: 删除了自己的未同步修改范围`)
          } else if (typeof b === 'number' || typeof b === 'boolean')
            additions.push(`${node.id} ${key}: ${b}`)
        }
      }
    if (additions.length) {
      const key = `canvas:${boardId}`
      const prior = ownRecovery.get(key)?.text ?? ''
      ownRecovery.set(key, {
        boardId,
        text: (prior + '\n' + additions.join('\n')).slice(-65536)
      })
    }
  }
  const hydrate = (e: EditState, v: BoardView) => {
    e.view = v
    e.workspace.setCollaborationAccess(v.permissions.edit)
    if (!v.permissions.edit || v.connection !== 'online')
      clearPresence(v.localSessionId!)
    if (!v.permissions.read) {
      e.queued = undefined
      e.remote = undefined
      e.paused = true
      e.workspace.cancelTransient()
    }
    if (
      (e.busy ||
        e.queued ||
        e.mutation ||
        e.workspace.isCollaborationGesture?.()) &&
      v.permissions.read
    ) {
      e.remote = v
      return
    }
    e.applying = true
    try {
      e.revision = v.canvasRevision
      e.workspace.applyRemoteCanvas(
        v.permissions.read ? v.canvas : { files: [], artifacts: [] },
        { revision: v.canvasRevision }
      )
      e.observed = signature(canvasOf(e.workspace))
    } finally {
      e.applying = false
    }
  }
  const acceptView = (v: BoardView) => {
    if (!v.localSessionId) return
    let e = editors.get(v.localSessionId)
    if (!e) {
      const workspace = deps.researchWorkspaces.for(v.localSessionId)
      e = {
        workspace,
        unsubscribe: () => {},
        view: v,
        revision: v.canvasRevision,
        observed: signature(canvasOf(workspace)),
        applying: false,
        busy: false,
        paused: false
      }
      editors.set(v.localSessionId, e)
      const editor = e
      e.unsubscribe = workspace.subscribe(() => {
        const next = canvasOf(workspace),
          sig = signature(next)
        if (editor.applying || sig === editor.observed) return
        const before = JSON.parse(editor.observed) as Canvas
        editor.observed = sig
        if (!editor.view.permissions.edit) return
        rememberOwnCanvas(editor.view.boardId, before, next)
        if (workspace.isCollaborationGesture?.()) {
          presence(v.localSessionId!, {})
          return
        }
        editor.queued = next
        if (editor.paused) return
        clearTimeout(editor.timer)
        editor.timer = setTimeout(() => void drain(editor), 100)
      })
    }
    hydrate(e, v)
  }
  async function drain(e: EditState) {
    if (
      disposed ||
      e.busy ||
      e.paused ||
      (!e.queued && !e.mutation) ||
      !e.view.permissions.edit ||
      e.workspace.isCollaborationGesture?.()
    )
      return
    e.busy = true
    const generation = state.account.generation
    const mutation = e.mutation ?? {
      id: uuid(),
      canvas: e.queued!,
      base: e.revision
    }
    if (!e.mutation) e.queued = undefined
    e.mutation = mutation
    try {
      const result = await call<CanvasReply>('canvas.apply', {
        boardId: e.view.boardId,
        localSessionId: e.view.localSessionId,
        baseRevision: mutation.base,
        clientMutationId: mutation.id,
        canvas: mutation.canvas
      })
      if (
        disposed ||
        state.account.generation !== generation ||
        !e.view.permissions.read
      )
        return
      e.mutation = undefined
      e.revision = result.localBranchRevision
      e.error = undefined
      // The ACK covers its submitted local canvas, even if a later held gesture
      // has not entered the queue. Hydration is held while busy, so this diff
      // contains only locally authored changes after that exact submission.
      ownRecovery.delete(`canvas:${e.view.boardId}`)
      rememberOwnCanvas(e.view.boardId, mutation.canvas, canvasOf(e.workspace))
      if (!e.queued) {
        const pending = e.remote
        e.remote = undefined
        const merged = {
          ...e.view,
          canvas: result.canvas,
          canvasRevision: result.canvasRevision,
          seq: result.seq,
          pendingCount: result.pendingCount,
          canUndo: result.canUndo,
          canRedo: result.canRedo
        }
        e.busy = false
        hydrate(e, pending && pending.seq > merged.seq ? pending : merged)
      }
    } catch (error) {
      if (state.account.generation !== generation) return
      e.paused = true
      e.error =
        error instanceof Error ? error.message : '修改未同步，请保留草稿。'
      // Never rebase an unknown/duplicate mutation onto an unrelated revision or regenerate its ID.
      if ((error as any)?.code === 'MUTATION_ALREADY_APPLIED' && !e.queued) {
        e.mutation = undefined
        await call('boards.refresh')
        const refreshed = state.current
        if (refreshed?.boardId === e.view.boardId) {
          e.busy = false
          hydrate(e, refreshed)
        }
      }
    } finally {
      e.busy = false
      notify()
      if (e.queued && !e.paused) void drain(e)
    }
  }
  function presence(
    id: string,
    input: { cursor?: { x: number; y: number } | null; selectedIds?: string[] }
  ) {
    const e = editors.get(id)
    if (!e?.view.permissions.read || e.view.connection !== 'online') return
    let p = previewStates.get(id)
    if (!p) {
      p = { cursor: null, selectedIds: [], last: 0 }
      previewStates.set(id, p)
    }
    Object.assign(p, input)
    const send = () => {
      p!.timer = undefined
      p!.last = Date.now()
      const current = editors.get(id)
      if (
        !current?.view.permissions.read ||
        current.view.connection !== 'online'
      )
        return
      const s = current.workspace.getSnapshot(),
        selectedIds = s.selection.selectedNodeIds.slice(0, 100)
      const previews =
        current.view.permissions.edit &&
        current.workspace.isCollaborationGesture?.()
          ? (['files', 'artifacts'] as const)
              .flatMap((collection) =>
                s[collection]
                  .filter((n: LegacyNode) => selectedIds.includes(n.id))
                  .map((n: LegacyNode) => ({
                    collection,
                    nodeId: n.id,
                    x: n.x,
                    y: n.y,
                    width: n.width,
                    height: n.height
                  }))
              )
              .slice(0, 100)
          : []
      const hints = { cursor: p!.cursor, selectedIds, previews }
      while (
        new TextEncoder().encode(JSON.stringify(hints)).byteLength > 8192
      ) {
        if (hints.selectedIds.length) {
          const id = hints.selectedIds.pop()
          const i = hints.previews.findIndex((n) => n.nodeId === id)
          if (i >= 0) hints.previews.splice(i, 1)
        } else if (hints.previews.length) hints.previews.pop()
        else return
      }
      void call('presence.update', {
        boardId: current.view.boardId,
        ...hints
      }).catch(() => {})
    }
    if (Date.now() - p.last >= 100) {
      clearTimeout(p.timer)
      send()
    } else if (!p.timer) p.timer = setTimeout(send, 100 - (Date.now() - p.last))
  }
  function clearPresence(id: string) {
    const p = previewStates.get(id)
    clearTimeout(p?.timer)
    previewStates.delete(id)
    const e = editors.get(id)
    if (e?.view.permissions.read && e.view.connection === 'online')
      void call('presence.update', {
        boardId: e.view.boardId,
        cursor: null,
        selectedIds: [],
        previews: []
      }).catch(() => {})
  }
  function finishGesture(id: string) {
    const e = editors.get(id)
    clearPresence(id)
    if (!e?.view.permissions.edit) return
    e.queued = canvasOf(e.workspace)
    clearTimeout(e.timer)
    void drain(e)
  }
  let clearingEditors = false
  const clearEditors = () => {
    clearingEditors = true
    for (const [id, shell] of deps.inputHub.shells) {
      if (!isShared(id)) continue
      const text = shell.snapshot?.draft
      const boardId =
        editors.get(id)?.view.boardId ??
        state.boards.find((b) => b.localSessionId === id)?.boardId
      if (text && boardId) ownRecovery.set(`draft:${id}`, { boardId, text })
      shell.setDraft?.('')
      shell.setResearchContextPreparing?.(false)
    }
    doc.querySelectorAll('.srb-dialog').forEach((dialog) => dialog.remove())
    for (const [id, e] of editors) {
      clearTimeout(e.timer)
      e.unsubscribe()
      e.workspace.setCollaborationAccess(false)
      e.workspace.cancelTransient()
      e.workspace.applyRemoteCanvas(
        { files: [], artifacts: [] },
        { revision: 'cleared' }
      )
      purge(id)
    }
    editors.clear()
    for (const d of drafts.values()) clearTimeout(d.timer)
    drafts.clear()
    sends.clear()
    clearingEditors = false
  }
  function watchFavoriteDeletion() {
    for (const f of state.favorites) {
      if (favoriteWatches.has(f.favoriteId)) continue
      const session = deps.sessions.binding(f.sessionId)?.session
      if (!session?.subscribe || !session?.getSnapshot) continue
      const check = () => {
        if (session.getSnapshot().removed === true) {
          favoriteWatches.get(f.favoriteId)?.()
          favoriteWatches.delete(f.favoriteId)
          void call('favorite.remove', { favoriteId: f.favoriteId }).catch(
            () => {}
          )
        }
      }
      favoriteWatches.set(f.favoriteId, session.subscribe(check))
      check()
    }
    for (const [id, off] of favoriteWatches)
      if (!state.favorites.some((f) => f.favoriteId === id)) {
        off()
        favoriteWatches.delete(id)
      }
  }
  cleanups.push(
    deps.sessions.list.subscribe(() => {
      watchFavoriteDeletion()
      notify()
    })
  )
  const receiveState = (next: ResearchBoardsState) => {
    if (
      next.eventSeq < eventSeq ||
      next.account.generation < state.account.generation
    )
      return
    if (next.account.generation !== state.account.generation) {
      clearEditors()
      navigation++
      if (
        next.account.user?.userId &&
        state.account.user?.userId !== next.account.user.userId
      )
        ownRecovery.clear()
    }
    eventSeq = next.eventSeq
    state = next
    watchFavoriteDeletion()
    if (next.current) acceptView(next.current)
    if (next.account.status === 'signedOut') clearEditors()
    notify()
  }
  const receive = (event: ResearchBoardsEvent) => {
    if (
      disposed ||
      event.eventSeq <= eventSeq ||
      event.accountGeneration < state.account.generation
    )
      return
    if (event.type === 'state') {
      receiveState(event.state)
      return
    }
    eventSeq = event.eventSeq
    if (event.type === 'board') {
      acceptView(event.view)
      state = { ...state, current: event.view }
    }
    if (event.type === 'presence') {
      const e = event.localSessionId
        ? editors.get(event.localSessionId)
        : undefined
      if (e) e.view = { ...e.view, presence: event.presence }
      if (state.current?.boardId === event.boardId)
        state = {
          ...state,
          current: { ...state.current, presence: event.presence }
        }
    }
    if (event.type === 'access') {
      const e = event.localSessionId
        ? editors.get(event.localSessionId)
        : undefined
      if (e) {
        e.queued = undefined
        e.mutation = undefined
        e.remote = undefined
        e.busy = false
        e.paused = true
        hydrate(e, {
          ...e.view,
          connection: 'revoked',
          permissions: {
            read: false,
            edit: false,
            manage: false,
            execute: false
          },
          canvas: { files: [], artifacts: [] },
          history: [],
          messages: [],
          tasks: [],
          members: [],
          presence: [],
          recoveries: event.recoveries
        })
      }
      if (event.localSessionId) {
        purge(event.localSessionId)
        const shell = deps.inputHub.shells.get(event.localSessionId)
        shell?.setDraft('')
        shell?.setResearchContextPreparing?.(false)
      }
      state = {
        ...state,
        current: e?.view ?? null,
        recoveries: event.recoveries
      }
    }
    notify()
  }
  cleanups.push(bridge.subscribe(receive))
  void bridge.getSnapshot().then(receiveState).catch(showError)
  function prime(id: string) {
    win.sessionStorage.setItem(
      'sherlock.conversation.initial-research-session.v1',
      id
    )
    win.dispatchEvent(
      new win.CustomEvent('sherlock:conversation-initial-research', {
        detail: { sessionId: id }
      })
    )
  }
  async function fresh(title: string) {
    const context = identity(current() ?? '')
    const id = await deps.sessions.create(
      context?.workspaceId
        ? { workspaceId: context.workspaceId }
        : context?.cwd
          ? { cwd: context.cwd }
          : {}
    )
    await deps.sessions.binding(id)?.session.rename(title)
    return id
  }
  async function openBoard(boardId: string) {
    const turn = ++navigation,
      generation = state.account.generation
    let pending = opening.get(boardId)
    if (!pending) {
      pending = (async () => {
        const opened = await call<{
          localSessionId?: string
          reservationId?: string
          title: string
        }>('board.open', { boardId })
        if (opened.localSessionId) return opened.localSessionId
        const id = await fresh(opened.title)
        const bound = await call<{ view: BoardView }>('board.bind', {
          boardId,
          reservationId: opened.reservationId,
          localSessionId: id
        })
        acceptView(bound.view)
        return id
      })()
      opening.set(boardId, pending)
    }
    try {
      const id = await pending
      if (turn !== navigation || generation !== state.account.generation)
        return id
      prime(id)
      deps.sessions.open(id)
      await activate(id, true)
      return id
    } finally {
      if (opening.get(boardId) === pending) opening.delete(boardId)
    }
  }
  async function activate(id: string, active: boolean) {
    if (active) activeResearch.add(id)
    else {
      activeResearch.delete(id)
      if (activeSession !== id) {
        notify()
        return
      }
    }
    const wanted = active && isShared(id) ? id : null
    if (activeSession === wanted) {
      notify()
      return
    }
    if (activeSession) clearPresence(activeSession)
    activeSession = wanted
    const turn = ++navigation
    try {
      const v = await call<BoardView | null>('board.activate', {
        localSessionId: wanted
      })
      if (turn === navigation && v) acceptView(v)
    } catch (error) {
      if (turn === navigation && wanted) {
        const e = editors.get(wanted)
        if (e) {
          e.workspace.setCollaborationAccess(false)
          e.error = (error as Error).message
        }
        notify()
      }
    }
    notify()
  }
  function saveDraft(id: string, text: string) {
    if (clearingEditors) return
    const v = view(id)
    if (!v?.permissions.edit) return
    let d = drafts.get(id)
    if (!d) {
      d = { id: uuid(), text, chain: Promise.resolve() }
      drafts.set(id, d)
    }
    d.text = text
    const draft = d,
      generation = state.account.generation,
      key = `draft:${id}`
    if (text) ownRecovery.set(key, { boardId: v.boardId, text })
    else ownRecovery.delete(key)
    // Begin the IPC write in this input turn; local own text survives access loss before settlement.
    const pending = call('recovery.saveDraft', {
      boardId: v.boardId,
      text,
      clientMutationId: draft.id
    })
    draft.chain = pending.then(
      () => {
        if (generation === state.account.generation && draft.text === text)
          ownRecovery.delete(key)
      },
      () => {}
    )
  }

  async function submitShared(
    sessionId: string,
    text: string,
    context: SharedRequestContext,
    imageIds: string[],
    mode: string
  ) {
    const shell = deps.inputHub.shells.get(sessionId),
      v = view(sessionId)
    if (!v?.permissions.execute || !v.permissions.edit) {
      shell?.notify(
        'error',
        v?.permissions.read
          ? '当前看板仅可查看。'
          : '共享研究执行尚未就绪，输入已保留。'
      )
      return
    }
    if (imageIds.length) {
      shell?.notify('error', '请先将图片加入共享画板后引用，输入已保留。')
      return
    }
    const before = shell?.snapshot,
      draft = before?.draft ?? text,
      key = signature([text, context, mode])
    let request = sends.get(sessionId)
    if (request?.busy) return
    if (!request || request.key !== key) {
      request = { id: uuid(), key, busy: false }
      sends.set(sessionId, request)
    }
    request.retry = () => submitShared(sessionId, text, context, imageIds, mode)
    request.busy = true
    const generation = state.account.generation
    saveDraft(sessionId, draft)
    shell?.setResearchContextPreparing?.(true)
    try {
      const reply = await call<RequestReply>('request.submit', {
        boardId: v.boardId,
        text,
        clientMutationId: request.id,
        context
      })
      if (
        generation !== state.account.generation ||
        deps.inputHub.shells.get(sessionId) !== shell
      )
        return
      request.reply = reply
      if (
        reply?.accepted === true &&
        reply.clientMutationId === request.id &&
        typeof reply.requestMessageId === 'string' &&
        reply.requestMessageId
      ) {
        if (
          shell.snapshot.draftRev === before.draftRev &&
          shell.snapshot.draft === draft
        ) {
          shell.commitSend([], draft)
          saveDraft(sessionId, '')
        }
        if (reply.state === 'taskCreateFailed')
          shell.notify(
            'error',
            reply.error?.message ??
              '消息已发送，研究任务尚未启动；可重试该任务。'
          )
      } else shell?.notify('error', '请求尚未确认，输入已保留。')
    } catch (error) {
      shell?.notify(
        'error',
        (error as any)?.code === 'INVALID_REQUEST'
          ? '共享研究执行接口尚未就绪，引用和输入已保留。'
          : (error as Error).message
      )
    } finally {
      request.busy = false
      if (generation === state.account.generation)
        shell?.setResearchContextPreparing?.(false)
      notify()
    }
  }
  async function undo(id: string, redo = false) {
    const e = editors.get(id)
    if (!e?.view.permissions.edit) return false
    await drain(e)
    if (e.busy || e.paused) return false
    try {
      const r = await call<CanvasReply>(redo ? 'canvas.redo' : 'canvas.undo', {
        boardId: e.view.boardId,
        localSessionId: id
      })
      hydrate(e, { ...e.view, ...r })
      notify()
      return true
    } catch (error) {
      if ((error as any)?.code === 'DELETION_RECOVERY_REQUIRED') {
        const d = boardDialog(doc, '恢复已删除组件')
        d.body.textContent = '恢复将创建新的组件，不会回滚其他成员的修改。'
        d.body.append(
          boardButton(doc, '恢复为新组件', () =>
            d.run(async () => {
              await call('recovery.restoreDeletion', {
                boardId: e.view.boardId,
                recoveryId: (error as any).details?.recoveryId
              })
              d.close()
            })
          )
        )
      } else showError(error)
      return false
    }
  }
  const response = (requestId: string, ok: boolean, error?: string) =>
    win.dispatchEvent(
      new win.CustomEvent('sherlock:boards:reply', {
        detail: { requestId, ok, error }
      })
    )
  const handle = (event: Event) => {
    const p = (event as CustomEvent).detail
    if (
      !p ||
      typeof p.requestId !== 'string' ||
      p.requestId.length > 128 ||
      !['open', 'login'].includes(p.action)
    )
      return
    if (p.action === 'login') {
      win.dispatchEvent(new win.CustomEvent('sherlock:account-open'))
      response(p.requestId, true)
      return
    }
    if (typeof p.boardId !== 'string' || p.boardId.length > 128) return
    void openBoard(p.boardId).then(
      () => response(p.requestId, true),
      (e) => response(p.requestId, false, e.message)
    )
  }
  win.addEventListener('sherlock:boards:request', handle)
  cleanups.push(() =>
    win.removeEventListener('sherlock:boards:request', handle)
  )
  const api = {
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    version: () => revision,
    getState: () => state,
    getView: view,
    identity,
    current,
    isShared,
    call,
    activate,
    openBoard,
    submitShared,
    retryRequest: (id: string) => {
      const r = sends.get(id)
      return r?.reply?.accepted &&
        ['messageAccepted', 'taskCreateFailed'].includes(r.reply.state)
        ? r
        : null
    },
    saveDraft,
    undo,
    presence,
    clearPresence,
    finishGesture,
    showError,
    isResearch: (id: string) => activeResearch.has(id),
    async openPersonal(id: string) {
      navigation++
      prime(id)
      deps.sessions.open(id)
      await activate(id, true)
    },
    async favorite(id: string) {
      const f = state.favorites.find((f) => f.sessionId === id)
      if (f) await call('favorite.remove', { favoriteId: f.favoriteId })
      else {
        const i = identity(id)
        if (i) await call('favorite.add', { identity: i })
      }
    },
    async copyPersonal(boardId: string) {
      const copy = await call<{ copyId: string; title: string }>(
        'board.copyPersonal',
        { boardId }
      )
      let id = copies.get(copy.copyId)
      if (!id) {
        id = await fresh(copy.title)
        copies.set(copy.copyId, id)
      }
      await call('board.finalizePersonalCopy', {
        copyId: copy.copyId,
        localSessionId: id
      })
      copies.delete(copy.copyId)
      await api.openPersonal(id)
    },
    async retryCanvas(id: string) {
      const e = editors.get(id)
      if (!e) return
      e.paused = false
      await drain(e)
    },
    editorError: (id: string) => editors.get(id)?.error,
    localRecovery: () =>
      [...ownRecovery.entries()].map(([id, value]) => ({ id, ...value })),
    dismissLocalRecovery: (id: string) => {
      ownRecovery.delete(id)
      notify()
    },
    dispose() {
      disposed = true
      navigation++
      favoriteWatches.forEach((off) => off())
      favoriteWatches.clear()
      clearEditors()
      cleanups.forEach((fn) => fn())
      listeners.clear()
      void bridge.invoke('board.activate', { localSessionId: null })
    }
  }
  installBoardUiStyles(doc)
  if (deps.slots) mountBoardSlots(api, deps.slots, doc)
  return api
}
export type ResearchBoardsPage = ReturnType<typeof createResearchBoardsPage>
const h = React.createElement
function useBoard(page: ResearchBoardsPage) {
  React.useSyncExternalStore(page.subscribe, page.version, page.version)
  return page.getState()
}
function safely(page: ResearchBoardsPage, fn: () => Promise<unknown>) {
  return () => {
    void fn().catch(page.showError)
  }
}
function currentBoard(page: ResearchBoardsPage, id: string) {
  return page.getView(id)
}
export function ResearchBoardHeader({
  page,
  sessionId,
  active
}: {
  page: ResearchBoardsPage
  sessionId: string
  active?: boolean
}) {
  const s = useBoard(page)
  if (active === false || (active === undefined && !page.isResearch(sessionId)))
    return null
  const v = currentBoard(page, sessionId),
    f = s.favorites.find((f) => f.sessionId === sessionId)
  return h(
    'div',
    { className: 'srb-actions' },
    v
      ? h(
          React.Fragment,
          null,
          h(
            'span',
            { className: 'srb-badge' },
            !v.permissions.read
              ? v.connection === 'revoked'
                ? '共享访问已结束'
                : '正在确认协作权限'
              : v.board.lifecycle === 'archived'
                ? '协作 · 已归档'
                : v.board.sharingState === 'ownerOnly'
                  ? '仅自己可见'
                  : '协作'
          ),
          v.permissions.read &&
            h(
              'button',
              { onClick: () => manageBoard(page, v.boardId) },
              '管理协作'
            )
        )
      : h(
          React.Fragment,
          null,
          h(
            'button',
            {
              className: 'srb-star',
              'aria-label': f ? '取消常用' : '设为常用',
              'aria-pressed': !!f,
              onClick: safely(page, () => page.favorite(sessionId))
            },
            f ? '★' : '☆'
          ),
          f &&
            h(
              'button',
              {
                onClick: () => shareFavorite(page, f),
                'aria-label': '共享协作'
              },
              h('span', { className: 'srb-share-label' }, '共享协作')
            )
        )
  )
}
const colorFor = (id: string) =>
  ['#b6cfca', '#d5c7a9', '#c9bfd9', '#b9cce0', '#ddbfb4'][
    Array.from(id).reduce((n, c) => n + c.charCodeAt(0), 0) % 5
  ]
export function ResearchBoardPresence({
  page,
  sessionId
}: {
  page: ResearchBoardsPage
  sessionId: string
}) {
  const s = useBoard(page),
    v = page.getView(sessionId)
  if (
    !page.isResearch(sessionId) ||
    !v?.permissions.read ||
    v.board.sharingState !== 'shared'
  )
    return null
  const users = [
    ...new Map(v.presence.map((p) => [p.userId, p])).values()
  ].sort((a, b) =>
    a.userId === s.account.user?.userId
      ? -1
      : b.userId === s.account.user?.userId
        ? 1
        : (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  )
  return h(
    'div',
    { className: 'srb-presence', 'aria-label': '当前在场成员' },
    ...users.slice(0, 5).map((p) =>
      h(
        'button',
        {
          className: 'srb-avatar',
          key: p.userId,
          style: { '--srb-color': colorFor(p.userId) } as React.CSSProperties,
          'data-offline': v.connection !== 'online',
          'aria-label': `${p.username}，${boardRoleLabel(p.role)}`,
          onClick: () => manageBoard(page, v.boardId)
        },
        Array.from(p.username)[0]?.toUpperCase(),
        h(
          'span',
          { className: 'srb-tip', role: 'tooltip' },
          p.username,
          p.userId === s.account.user?.userId ? ' · 你' : '',
          h(
            'small',
            null,
            boardRoleLabel(p.role),
            v.connection !== 'online' ? ' · 重新连接中' : ''
          )
        )
      )
    ),
    users.length > 5 &&
      h(
        'button',
        {
          'aria-label': `另外 ${users.length - 5} 位在场成员`,
          onClick: () => manageBoard(page, v.boardId)
        },
        `+${users.length - 5}`
      )
  )
}
export function ResearchBoardSidebar({
  page,
  wide = true,
  expandSidebar
}: {
  page: ResearchBoardsPage
  wide?: boolean
  expandSidebar?: () => void
}) {
  const s = useBoard(page),
    [collapsed, setCollapsed] = React.useState(() => {
      try {
        return localStorage.getItem('sherlock.boards.collapsed') === 'true'
      } catch {
        return false
      }
    }),
    [drag, setDrag] = React.useState<string | null>(null)
  const openMenu = () => {
    const d = boardDialog(document, '管理看板')
    for (const b of s.boards) {
      const row = document.createElement('div')
      row.className = 'srb-member'
      const label = document.createElement('span')
      label.textContent = b.title
      row.append(
        label,
        boardButton(document, b.pinned ? '移出侧栏' : '固定到侧栏', () =>
          d.run(async () => {
            await page.call(b.pinned ? 'board.unpin' : 'board.pin', {
              boardId: b.boardId
            })
            d.close()
          })
        ),
        boardButton(document, '打开', () =>
          d.run(async () => {
            await page.openBoard(b.boardId)
            d.close()
          })
        )
      )
      d.body.append(row)
    }
    if (!s.boards.length) d.body.textContent = '暂无协作看板。'
  }
  return h(
    'section',
    { className: 'srb-section', 'data-wide': wide, 'aria-label': '研究看板' },
    h(
      'header',
      null,
      h(
        'button',
        {
          'aria-label': collapsed ? '展开研究看板' : '折叠研究看板',
          'aria-expanded': !collapsed,
          onClick: () => {
            if (!wide) {
              expandSidebar?.()
              return
            }
            setCollapsed(!collapsed)
            try {
              localStorage.setItem(
                'sherlock.boards.collapsed',
                String(!collapsed)
              )
            } catch {}
          }
        },
        wide ? `${collapsed ? '›' : '⌄'} 研究看板` : '☆'
      ),
      wide && h('button', { 'aria-label': '管理看板', onClick: openMenu }, '⋯')
    ),
    !collapsed &&
      wide &&
      h(
        React.Fragment,
        null,
        !s.favorites.length &&
          !s.boards.some((b) => b.pinned) &&
          h('p', { className: 'srb-empty' }, '在研究中设为常用，固定到这里'),
        ...s.favorites.map((f) =>
          h(
            'div',
            {
              key: f.favoriteId,
              className: 'srb-row',
              'aria-current': page.current() === f.sessionId,
              draggable: true,
              onDragStart: (e: React.DragEvent) => {
                setDrag(f.favoriteId)
                e.dataTransfer.setData('text/x-sherlock-favorite', f.favoriteId)
              },
              onDragOver: (e: React.DragEvent) => e.preventDefault(),
              onDrop: (e: React.DragEvent) => {
                e.preventDefault()
                if (!drag || drag === f.favoriteId) return
                const ids = s.favorites
                  .map((f) => f.favoriteId)
                  .filter((id) => id !== drag)
                ids.splice(ids.indexOf(f.favoriteId), 0, drag)
                void page
                  .call('favorite.reorder', { favoriteIds: ids })
                  .catch(page.showError)
                setDrag(null)
              }
            },
            h(
              'button',
              {
                onClick: safely(page, () => page.openPersonal(f.sessionId)),
                title: f.title
              },
              '☆ ',
              f.title
            ),
            h(
              'button',
              {
                'aria-label': `${f.title}菜单`,
                onClick: () => favoriteMenu(page, f)
              },
              '⋯'
            )
          )
        ),
        ...s.boards
          .filter((b) => b.pinned)
          .map((b) =>
            h(
              'div',
              {
                key: b.boardId,
                className: 'srb-row',
                'aria-current': page.current() === b.localSessionId
              },
              h(
                'button',
                {
                  onClick: safely(page, () => page.openBoard(b.boardId)),
                  title: b.title
                },
                '♧ ',
                b.title
              ),
              h(
                'button',
                {
                  'aria-label': `${b.title}菜单`,
                  onClick: () => manageBoard(page, b.boardId)
                },
                '⋯'
              )
            )
          )
      )
  )
}
function favoriteMenu(page: ResearchBoardsPage, f: Favorite) {
  const d = boardDialog(document, f.title)
  const name = document.createElement('input')
  name.value = f.title
  name.setAttribute('aria-label', '看板名称')
  d.body.append(
    name,
    boardButton(document, '保存名称', () =>
      d.run(async () => {
        await page.call('favorite.rename', {
          favoriteId: f.favoriteId,
          title: name.value
        })
        d.close()
      })
    ),
    boardButton(document, '共享协作', () => {
      d.close()
      shareFavorite(page, f)
    }),
    boardButton(document, '取消常用', () =>
      d.run(async () => {
        await page.call('favorite.remove', { favoriteId: f.favoriteId })
        d.close()
      })
    )
  )
}
export function shareFavorite(page: ResearchBoardsPage, f: Favorite) {
  const d = boardDialog(document, '共享协作'),
    s = page.getState()
  if (s.account.status === 'loading' || s.account.status === 'unavailable') {
    d.body.textContent =
      s.account.status === 'loading'
        ? '正在连接协作服务…'
        : '协作服务暂不可用，个人研究可继续使用。'
    d.body.append(
      boardButton(document, '重试连接', () =>
        d.run(async () => {
          await page.call('boards.refresh')
          d.close()
          shareFavorite(page, f)
        })
      )
    )
    return
  }
  if (!s.account.user) {
    d.body.textContent = '登录后可创建独立协作副本；个人研究仍保存在本机。'
    d.body.append(
      boardButton(document, '登录', () => {
        document.defaultView!.dispatchEvent(
          new CustomEvent('sherlock:account-open')
        )
        const off = page.subscribe(() => {
          if (page.getState().account.user) {
            off()
            d.close()
            shareFavorite(page, f)
          }
        })
        d.dialog.addEventListener('close', off, { once: true })
      })
    )
    return
  }
  const existing = s.boards.filter((b) => b.sourceFavoriteId === f.favoriteId)
  const start = async () => {
    d.body.replaceChildren()
    const capture = await d.run(
      () =>
        page.call<{
          captureId: string
          nodeCount: number
          historyCount: number
          assetBytes: number
        }>('board.previewCapture', { favoriteId: f.favoriteId }),
      '准备研究内容…'
    )
    if (!d.dialog.isConnected || !capture) return
    const name = document.createElement('input')
    name.value = `${f.title} · 协作`
    name.setAttribute('aria-label', '协作名称')
    const scope = document.createElement('p')
    scope.textContent = `将复制 ${capture.nodeCount} 个组件、${capture.historyCount} 条已保存对话及 ${(capture.assetBytes / 1024 / 1024).toFixed(1)} MB 资料。此后双方独立更新。`
    d.body.append(name, scope)
    inviteForm(
      page,
      d,
      async () => {
        const result = await page.call<{ board: { boardId: string } }>(
          'board.create',
          {
            favoriteId: f.favoriteId,
            title: name.value,
            captureId: capture.captureId
          }
        )
        return result.board.boardId
      },
      '创建副本并邀请'
    )
  }
  if (existing.length) {
    d.body.append(
      document.createTextNode('已有协作副本，继续管理可邀请成员加入同一看板。')
    )
    for (const b of existing)
      d.body.append(
        boardButton(document, b.title, () => {
          d.close()
          manageBoard(page, b.boardId)
        })
      )
    d.body.append(boardButton(document, '新建协作副本', start))
  } else void start()
}
type Dialog = ReturnType<typeof boardDialog>
function inviteForm(
  page: ResearchBoardsPage,
  d: Dialog,
  resolveBoard: () => Promise<string>,
  label = '发送邀请'
) {
  const input = document.createElement('input')
  input.placeholder = 'ID 0000 0000 00'
  input.setAttribute('aria-label', '对方专有 ID')
  input.inputMode = 'numeric'
  const role = document.createElement('select')
  role.setAttribute('aria-label', '邀请权限')
  for (const [value, text] of [
    ['editor', '可编辑'],
    ['viewer', '仅查看']
  ]) {
    const o = document.createElement('option')
    o.value = value!
    o.textContent = text!
    role.append(o)
  }
  const recipient = document.createElement('p')
  let user: { publicId: string; username: string } | undefined,
    boardId: string | undefined,
    lookup = 0
  const send = boardButton(document, label, async () => {
    if (!user) return
    const confirmedPublicId = user.publicId,
      confirmedRole = role.value
    send.disabled = true
    await d.run(
      async () => {
        boardId ??= await resolveBoard()
        if (!d.dialog.isConnected) return
        await page.call('invitation.send', {
          boardId,
          publicId: confirmedPublicId,
          role: confirmedRole
        })
        d.status.textContent = '邀请已发送'
        recipient.textContent = '邀请已发送'
        send.remove()
        d.body.append(
          boardButton(document, '打开协作看板', async () => {
            await page.openBoard(boardId!)
            d.close()
          })
        )
      },
      boardId ? '发送邀请…' : '上传资料并创建协作副本…'
    )
    send.disabled = false
    if (boardId && send.isConnected) send.textContent = '副本已创建，重试邀请'
  })
  send.disabled = true
  send.className = 'srb-primary'
  input.addEventListener('input', () => {
    lookup++
    user = undefined
    send.disabled = true
    recipient.textContent = ''
  })
  const lookupButton = boardButton(document, '查找并核对', async () => {
    const id = normalizePublicId(input.value),
      turn = ++lookup
    if (!/^\d{10}$/.test(id)) {
      d.status.textContent = '请输入完整的 10 位数字 ID。'
      return
    }
    const found = await d.run(
      () =>
        page.call<{ user: { publicId: string; username: string } }>(
          'user.lookup',
          { publicId: id }
        ),
      '查找用户…'
    )
    if (turn !== lookup || !d.dialog.isConnected || !found) return
    user = found.user
    recipient.textContent = `${user.username} · ID ${publicIdLabel(user.publicId)}`
    send.disabled = false
  })
  d.body.append(input, lookupButton, recipient, role, send)
}
export function manageBoard(page: ResearchBoardsPage, boardId: string) {
  const d = boardDialog(document, '管理协作')
  void d.run(async () => {
    const summary = page.getState().boards.find((b) => b.boardId === boardId)
    let v = page.getView(summary?.localSessionId)
    if (!v) {
      d.body.textContent = '打开看板后可查看成员和管理协作。'
      d.body.append(
        boardButton(document, '打开看板', async () => {
          await page.openBoard(boardId)
          d.close()
          manageBoard(page, boardId)
        })
      )
      return
    }
    const title = document.createElement('p')
    title.textContent = v.board.title
    d.body.append(title)
    const cmd = (
      text: string,
      action: string,
      extra: Record<string, unknown> = {}
    ) =>
      boardButton(document, text, () =>
        d.run(async () => {
          await page.call(action, { boardId, ...extra })
          d.close()
        })
      )
    d.body.append(
      cmd(
        summary?.pinned ? '移出侧栏' : '固定到侧栏',
        summary?.pinned ? 'board.unpin' : 'board.pin'
      ),
      boardButton(document, '另存为个人研究', () =>
        d.run(async () => {
          await page.copyPersonal(boardId)
          d.close()
        })
      )
    )
    if (v.permissions.manage) {
      const pending = document.createElement('section')
      pending.setAttribute('aria-label', '待处理邀请')
      d.body.append(pending)
      const renderPending = () => {
        const current = page.getView(summary?.localSessionId)
        pending.replaceChildren()
        if (!current?.permissions.manage) return
        const heading = document.createElement('strong')
        heading.textContent = '待处理邀请'
        pending.append(heading)
        if (!current.pendingInvitations?.length)
          pending.append(document.createTextNode('没有待处理邀请'))
        for (const invite of current.pendingInvitations ?? []) {
          const row = document.createElement('div')
          row.className = 'srb-member'
          row.dataset.pendingInvitation = invite.invitationId
          const text = document.createElement('span')
          text.textContent = `${invite.invitee.username} · ID ${publicIdLabel(invite.invitee.publicId)} · 版本 ${invite.version}`
          const select = document.createElement('select')
          select.setAttribute(
            'aria-label',
            `${invite.invitee.username}待处理邀请权限`
          )
          for (const value of ['editor', 'viewer']) {
            const o = document.createElement('option')
            o.value = value
            o.textContent = boardRoleLabel(value)
            o.selected = value === invite.role
            select.append(o)
          }
          select.onchange = () => {
            const role = select.value
            void d.run(() =>
              page.call('invitation.send', {
                boardId,
                publicId: invite.invitee.publicId,
                role
              })
            )
          }
          row.append(
            text,
            select,
            boardButton(document, '撤销邀请', () =>
              d.run(() =>
                page.call('invitation.revoke', {
                  boardId,
                  invitationId: invite.invitationId
                })
              )
            )
          )
          pending.append(row)
        }
      }
      renderPending()
      const off = page.subscribe(() => {
        if (!d.dialog.isConnected) off()
        else renderPending()
      })
      d.dialog.addEventListener('close', off, { once: true })
    }
    for (const group of [
      { label: '当前在场', users: v.presence },
      { label: '全部成员', users: v.members }
    ]) {
      const heading = document.createElement('strong')
      heading.textContent = group.label
      d.body.append(heading)
      for (const member of [
        ...new Map(group.users.map((m) => [m.userId, m])).values()
      ]) {
        const row = document.createElement('div')
        row.className = 'srb-member'
        const text = document.createElement('span')
        text.textContent = `${member.username} · ${boardRoleLabel(member.role)}`
        row.append(text)
        if (
          group.label === '全部成员' &&
          v.permissions.manage &&
          member.role !== 'owner'
        ) {
          const select = document.createElement('select')
          select.setAttribute('aria-label', `${member.username}权限`)
          for (const r of ['editor', 'viewer']) {
            const o = document.createElement('option')
            o.value = r
            o.textContent = boardRoleLabel(r)
            o.selected = r === member.role
            select.append(o)
          }
          select.onchange = () =>
            void d.run(() =>
              page.call('member.role', {
                boardId,
                userId: member.userId,
                role: select.value
              })
            )
          row.append(
            select,
            cmd('移除', 'member.remove', { userId: member.userId })
          )
        }
        d.body.append(row)
      }
    }
    if (v.permissions.manage) {
      const name = document.createElement('input')
      name.value = v.board.title
      name.setAttribute('aria-label', '协作名称')
      d.body.append(
        name,
        boardButton(document, '重命名', () =>
          d.run(async () => {
            await page.call('board.rename', { boardId, title: name.value })
            d.close()
          })
        )
      )
      if (v.board.lifecycle === 'active' && v.board.sharingState === 'shared')
        inviteForm(page, d, async () => boardId)
      d.body.append(
        cmd(
          v.board.refreshPaused ? '恢复自动刷新' : '暂停自动刷新',
          'board.refreshPause',
          { paused: !v.board.refreshPaused }
        ),
        cmd(
          v.board.lifecycle === 'archived'
            ? '恢复协作'
            : '归档协作（全员只读）',
          v.board.lifecycle === 'archived' ? 'board.restore' : 'board.archive'
        )
      )
      d.body.append(
        boardButton(
          document,
          v.board.sharingState === 'ownerOnly' ? '重新开启共享' : '取消共享',
          () => {
            const c = boardDialog(
              document,
              v!.board.sharingState === 'ownerOnly'
                ? '重新开启共享'
                : '取消共享'
            )
            c.body.textContent =
              v!.board.sharingState === 'ownerOnly'
                ? '需要重新邀请成员，旧邀请不会恢复。'
                : '其他成员将立即失去访问权，原个人研究不受影响。'
            c.body.append(
              boardButton(document, '确认', () =>
                c.run(async () => {
                  await page.call(
                    v!.board.sharingState === 'ownerOnly'
                      ? 'board.reopen'
                      : 'board.cancel',
                    { boardId }
                  )
                  c.close()
                  d.close()
                })
              )
            )
          }
        )
      )
    } else d.body.append(cmd('退出协作', 'board.leave'))
  })
}
export function ResearchBoardDiscussion({
  page,
  sessionId,
  MarkdownText
}: {
  page: ResearchBoardsPage
  sessionId: string
  MarkdownText?: React.ComponentType<any>
}) {
  useBoard(page)
  const v = page.getView(sessionId)
  if (!v?.permissions.read)
    return h(
      'div',
      { className: 'srb-terminated' },
      h(
        'h3',
        null,
        v?.connection === 'revoked' ? '共享访问已结束' : '正在确认协作权限'
      ),
      h('p', null, '画板内容已隐藏。你的未发送内容可从恢复记录中查看。'),
      h('button', { onClick: () => showRecovery(page) }, '查看我的恢复记录')
    )
  const rows = [
    ...(v.history ?? []).map((m: any) => ({ ...m, imported: true })),
    ...v.messages
  ]
  return h(
    'div',
    { className: 'srb-discussion', 'data-shared-discussion': sessionId },
    !rows.length &&
      h('p', { className: 'srb-status' }, '围绕这份画板继续研究。'),
    ...rows.map((m: any, i) =>
      h(
        'article',
        {
          className: 'srb-message',
          'data-role': m.role,
          key: `${m.imported ? 'history' : 'message'}:${m.id ?? i}`
        },
        h(
          'small',
          null,
          m.authorName ?? (m.role === 'assistant' ? '研究助手' : '成员'),
          m.imported ? ' · 复制时的已保存对话' : ''
        ),
        MarkdownText ? h(MarkdownText, { text: m.text }) : h('p', null, m.text)
      )
    ),
    page.retryRequest(sessionId) &&
      h(
        'div',
        { className: 'srb-status' },
        '消息已保存，研究任务尚未启动。',
        h(
          'button',
          {
            disabled: page.retryRequest(sessionId)?.busy,
            onClick: () => void page.retryRequest(sessionId)?.retry?.()
          },
          '重试这条研究任务'
        )
      ),
    ...v.tasks
      .filter((t) => !['completed', 'failed', 'cancelled'].includes(t.status))
      .map((t) =>
        h(
          'p',
          { key: t.taskId, className: 'srb-status' },
          t.status === 'running' ? '正在研究…' : '研究任务等待执行'
        )
      )
  )
}
function showRecovery(page: ResearchBoardsPage) {
  const d = boardDialog(document, '我的恢复记录')
  for (const r of page.localRecovery()) {
    const notice = document.createElement('p')
    notice.textContent = '当前窗口保留的未确认内容，请先复制保存。'
    d.body.append(
      notice,
      boardButton(document, '复制这条恢复内容', () =>
        navigator.clipboard.writeText(r.text)
      )
    )
    const pre = document.createElement('pre')
    pre.textContent = r.text
    d.body.append(
      pre,
      boardButton(document, '清除这条本机恢复', () => {
        page.dismissLocalRecovery(r.id)
        pre.remove()
      })
    )
  }
  for (const r of page.getState().recoveries) {
    const row = document.createElement('div')
    row.append(
      boardButton(document, new Date(r.createdAt).toLocaleString(), () =>
        d.run(async () => {
          const full = await page.call<any>('recovery.get', {
            recoveryId: r.recoveryId
          })
          const pre = document.createElement('pre')
          pre.textContent = full.changes
            .map(
              (c: any) =>
                c.text ??
                JSON.stringify(c.value ?? { kind: c.kind, nodeId: c.nodeId })
            )
            .join('\n')
          row.append(pre)
        })
      )
    )
    d.body.append(row)
  }
  if (!d.body.childNodes.length) d.body.textContent = '没有待恢复内容。'
}
export function ResearchBoardCanvasOverlay({
  page,
  sessionId,
  workspace
}: {
  page: ResearchBoardsPage
  sessionId: string
  workspace: Workspace
}) {
  const state = useBoard(page)
  React.useSyncExternalStore(
    workspace.subscribe,
    workspace.getSnapshot,
    workspace.getSnapshot
  )
  const [previewNow, setPreviewNow] = React.useState(Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setPreviewNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [])
  const v = page.getView(sessionId)
  if (!v?.permissions.read)
    return h(
      'div',
      { className: 'srb-terminated' },
      h('h3', null, '共享内容不可访问'),
      h('button', { onClick: () => showRecovery(page) }, '恢复我的未发送内容')
    )
  const snapshot = workspace.getSnapshot(),
    viewport = snapshot.viewport
  return h(
    React.Fragment,
    null,
    (!v.permissions.edit || page.editorError(sessionId)) &&
      h(
        'div',
        { className: 'srb-readonly' },
        page.editorError(sessionId) ?? '仅可查看',
        page.editorError(sessionId) &&
          h(
            'button',
            { onClick: safely(page, () => page.retryCanvas(sessionId)) },
            '重试同步'
          )
      ),
    h(
      'div',
      { className: 'srb-canvas-presence', 'aria-hidden': true },
      ...v.presence
        .filter((p) => p.userId !== state.account.user?.userId)
        .flatMap((p) => [
          p.cursor &&
            h(
              'span',
              {
                className: 'srb-cursor',
                key: `cursor:${p.userId}`,
                style: {
                  left: p.cursor.x * viewport.scale + viewport.x,
                  top: p.cursor.y * viewport.scale + viewport.y,
                  '--srb-color': colorFor(p.userId)
                } as React.CSSProperties
              },
              '↖ ',
              p.username
            ),
          ...(p.selectedIds ?? []).slice(0, 100).map((id) => {
            const accepted = [...snapshot.files, ...snapshot.artifacts].find(
              (n) => n.id === id
            )
            const preview =
              p.previewExpiresAt! > previewNow && p.previewSeq === v.seq
                ? p.previews?.find((q) => q.nodeId === id)
                : undefined
            const n =
              accepted && preview ? { ...accepted, ...preview } : accepted
            return (
              n &&
              h(
                'div',
                {
                  className: 'srb-occupied',
                  'data-geometry-preview': !!preview,
                  key: `${p.userId}:${id}`,
                  style: {
                    left: (n.x - n.width / 2) * viewport.scale + viewport.x,
                    top: (n.y - n.height / 2) * viewport.scale + viewport.y,
                    width: n.width * viewport.scale,
                    height: n.height * viewport.scale,
                    '--srb-color': colorFor(p.userId)
                  } as React.CSSProperties
                },
                h('span', null, p.username, ' 正在操作')
              )
            )
          })
        ])
    )
  )
}
function mountBoardSlots(page: ResearchBoardsPage, slots: any, doc: Document) {
  const register = (
    name: string,
    id: string,
    component: React.ComponentType<any>
  ) =>
    slots.inject(name, () =>
      slots.register(
        { name, id, order: 50, inject: () => ({ page }) },
        component
      )
    )
  register(
    'sidebar.researchBoards',
    'sherlock-research-boards',
    ResearchBoardSidebar
  )
  register(
    'conversation.session.header.actions',
    'sherlock-research-board-actions',
    ResearchBoardHeader
  )
  register(
    'conversation.session.header.utilities',
    'sherlock-research-board-presence',
    ResearchBoardPresence
  )
}
