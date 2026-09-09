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
export { selectionNodeReady } from './research-board-presentation'
import { boardEditTime } from './research-board-presentation'
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
  accountId: string
  generation: number
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
    copies = new Map<string, string>(),
    copyFlights = new Map<string, Promise<void>>()
  const previewStates = new Map<
    string,
    {
      cursor: { x: number; y: number } | null
      selectedIds: string[]
      last: number
      timer?: ReturnType<typeof setTimeout>
    }
  >()
  const ownRecovery = new Map<
    string,
    { boardId: string; text: string; accountId: string }
  >()
  let recoveryOwner: string | undefined
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
        win.localStorage.removeItem(
          `sherlock.research.canvas.${kind}.v1:${id}`
        )
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
            [
              'authorizationId',
              'capabilityToken',
              'path',
              'assetId'
            ].includes(key)
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
            else
              additions.push(`${node.id} ${key}: 删除了自己的未同步修改范围`)
          } else if (typeof b === 'number' || typeof b === 'boolean')
            additions.push(`${node.id} ${key}: ${b}`)
        }
      }
    if (additions.length) {
      const key = `canvas:${boardId}`
      const prior = ownRecovery.get(key)?.text ?? ''
      ownRecovery.set(key, {
        boardId,
        accountId: recoveryOwner ?? '',
        text: (prior + '\n' + additions.join('\n')).slice(-65536)
      })
    }
  }
  const hydrate = (e: EditState, v: BoardView) => {
    // Fresh authority may resume new edits only after old work was retired.
    // An uncertain mutation remains paused until the explicit retry path.
    if (
      !e.view.permissions.read &&
      v.permissions.read &&
      !e.mutation &&
      !e.queued
    ) {
      e.paused = false
      e.error = undefined
    }
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
        accountId: state.account.user?.userId ?? '',
        generation: state.account.generation,
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
        if (
          editor.applying ||
          sig === editor.observed ||
          editor.generation !== state.account.generation ||
          editor.accountId !== state.account.user?.userId
        )
          return
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
      e.generation !== state.account.generation ||
      e.accountId !== state.account.user?.userId ||
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
      rememberOwnCanvas(
        e.view.boardId,
        mutation.canvas,
        canvasOf(e.workspace)
      )
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
    input: {
      cursor?: { x: number; y: number } | null
      selectedIds?: string[]
    }
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
    } else if (!p.timer)
      p.timer = setTimeout(send, 100 - (Date.now() - p.last))
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
      if (text && boardId)
        ownRecovery.set(`draft:${id}`, {
          boardId,
          text,
          accountId: recoveryOwner ?? ''
        })
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
  let refreshingList = false
  const refreshList = () => {
    if (
      disposed ||
      refreshingList ||
      doc.visibilityState === 'hidden' ||
      state.account.status !== 'ready' ||
      !state.account.user ||
      !state.boards.length
    )
      return
    refreshingList = true
    void call('boards.listRefresh')
      .catch(() => {})
      .finally(() => {
        refreshingList = false
      })
  }
  const listTimer = win.setInterval(refreshList, 30000)
  win.addEventListener('focus', refreshList)
  cleanups.push(() => {
    win.clearInterval(listTimer)
    win.removeEventListener('focus', refreshList)
  })
  const receiveState = (next: ResearchBoardsState) => {
    if (
      next.eventSeq < eventSeq ||
      next.account.generation < state.account.generation
    )
      return
    if (next.account.generation !== state.account.generation) {
      clearEditors()
      activeSession = null
      navigation++
    }
    // Identity arrives after loading/null at the same generation. Keep the last
    // recovery owner through logout, and retire it when a different user resolves.
    const nextOwner = next.account.user?.userId
    if (nextOwner && nextOwner !== recoveryOwner) {
      ownRecovery.clear()
      doc.querySelectorAll('.srb-dialog').forEach((dialog) => dialog.remove())
      recoveryOwner = nextOwner
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
    if (text)
      ownRecovery.set(key, {
        boardId: v.boardId,
        text,
        accountId: recoveryOwner ?? ''
      })
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

  async function flushCanvas(sessionId: string) {
    const e = editors.get(sessionId)
    if (!e || !e.view.permissions.edit) throw Error('当前画板不可编辑')
    if (e.workspace.isCollaborationGesture?.())
      throw Error('请先完成当前拖动或缩放')
    const until = Date.now() + 30000
    while (e.busy || e.queued || e.mutation || e.view.pendingCount) {
      if (e.paused || Date.now() > until || !e.view.permissions.edit)
        throw Error(e.error ?? '画板更改尚未确认')
      if (!e.busy && (e.queued || e.mutation)) await drain(e)
      await new Promise((r) => setTimeout(r, 20))
    }
    if (e.view.pendingCount) throw Error('画板更改尚未由云端确认')
    return e.view
  }
  async function generateShared(sessionId: string, request: any) {
    const v = await flushCanvas(sessionId),
      workspace = deps.researchWorkspaces.for(sessionId),
      target = workspace
        .getSnapshot()
        .artifacts.find((n: any) => n.id === request.targetNodeId)
    if (!target || request.sessionId !== sessionId)
      throw Error('生成目标已失效')
    const references = (request.selectedNodeIds ?? []).map(
      (nodeId: string) => ({
        collection: workspace
          .getSnapshot()
          .files.some((n: any) => n.id === nodeId)
          ? 'files'
          : 'artifacts',
        nodeId
      })
    )
    const text =
      request.prompt ??
      (request.kind === 'mind-map'
        ? '请基于所选资料生成思维导图'
        : '请总结所选研究资料')
    const result = await call<RequestReply>('request.submit', {
      boardId: v.boardId,
      text,
      clientMutationId: uuid(),
      context: {
        scope: references.length ? 'references' : 'board',
        references
      },
      targetId: target.id,
      targetCollection: 'artifacts',
      source: 'manual'
    })
    if (!result.accepted || !result.taskId)
      throw Error(result.error?.message ?? '消息已保存，任务尚未启动')
    return { ok: true, taskId: result.taskId }
  }
  function inspectShared(sessionId: string, request: any) {
    const v = view(sessionId),
      task = v?.tasks.find((t: any) => t.taskId === request.taskId) as any
    if (!task) throw Error('任务不存在')
    return Promise.resolve({
      taskId: task.taskId,
      parentSessionId: sessionId,
      state: task.status,
      events: [],
      lastSeq: v?.seq ?? 0
    })
  }
  async function cancelShared(sessionId: string, request: any) {
    const v = view(sessionId)
    if (!v) throw Error('访问已结束')
    return call('task.stop', { boardId: v.boardId, taskId: request.taskId })
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
    if (
      !request ||
      request.key !== key ||
      request.reply?.state === 'taskAccepted'
    ) {
      request = { id: uuid(), key, busy: false }
      sends.set(sessionId, request)
    }
    request.retry = () =>
      submitShared(sessionId, text, context, imageIds, mode)
    request.busy = true
    const generation = state.account.generation
    saveDraft(sessionId, draft)
    shell?.setResearchContextPreparing?.(true)
    try {
      await flushCanvas(sessionId)
      if (generation !== state.account.generation) return
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
      const r = await call<CanvasReply>(
        redo ? 'canvas.redo' : 'canvas.undo',
        {
          boardId: e.view.boardId,
          localSessionId: id
        }
      )
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
    editedAt: (id: string) =>
      deps.sessions.list.getSnapshot().byId[id]?.updatedAt as
        number | undefined,
    current,
    isShared,
    call,
    activate,
    openBoard,
    submitShared,
    flushCanvas,
    generateShared,
    inspectShared,
    cancelShared,
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
      const accountId = state.account.user?.userId
      if (!accountId) throw Error('请先登录')
      const key =
        'sherlock.research.personal-copy.v1:' + accountId + ':' + boardId
      if (copyFlights.has(key)) return copyFlights.get(key)
      const generation = state.account.generation
      const work = (async () => {
        let saved: any = null
        try {
          saved = JSON.parse(win.localStorage.getItem(key) ?? 'null')
        } catch {}
        const copy = saved?.copyId
          ? saved
          : await call<{
              copyId: string
              title: string
              localSessionId?: string
            }>('board.copyPersonal', { boardId })
        win.localStorage.setItem(key, JSON.stringify(copy))
        let id = copy.localSessionId ?? copies.get(copy.copyId)
        if (!id) {
          id = await fresh(copy.title)
          if (generation !== state.account.generation)
            throw Error('账户已改变')
          copies.set(copy.copyId, id)
          copy.localSessionId = id
          win.localStorage.setItem(key, JSON.stringify(copy))
        }
        await call('board.finalizePersonalCopy', {
          copyId: copy.copyId,
          localSessionId: id
        })
        if (generation !== state.account.generation) throw Error('账户已改变')
        win.localStorage.removeItem(key)
        copies.delete(copy.copyId)
        await api.openPersonal(id)
      })()
      copyFlights.set(key, work)
      try {
        return await work
      } finally {
        copyFlights.delete(key)
      }
    },
    async retryCanvas(id: string) {
      const e = editors.get(id)
      if (!e) return
      e.paused = false
      await drain(e)
    },
    editorError: (id: string) => editors.get(id)?.error,
    localRecovery: () =>
      [...ownRecovery.entries()]
        .filter(
          ([, value]) =>
            value.accountId === recoveryOwner &&
            (!state.account.user ||
              state.account.user.userId === value.accountId)
        )
        .map(([id, value]) => ({ id, ...value })),
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
function boardIcon(kind: 'people' | 'boards') {
  return h(
    'svg',
    {
      width: 16,
      height: 16,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': true
    },
    ...(kind === 'people'
      ? [
          h('path', {
            key: 'a',
            d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75'
          }),
          h('circle', { key: 'b', cx: 9, cy: 7, r: 4 })
        ]
      : [
          h('rect', {
            key: 'a',
            x: 3,
            y: 3,
            width: 18,
            height: 18,
            rx: 3
          }),
          h('path', { key: 'b', d: 'M9 3v18M9 10h12' })
        ])
  )
}
function BoardActionMenu({
  items
}: {
  items: { label: string; action: () => void }[]
}) {
  const ref = React.useRef(null as HTMLDivElement | null),
    trigger = React.useRef(null as HTMLButtonElement | null)
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (!open) return
    const menu = ref.current!,
      button = trigger.current!,
      rect = button.getBoundingClientRect()
    menu.style.top = `${rect.bottom + 8}px`
    menu.style.left = `${Math.max(8, Math.min(rect.right - 208, window.innerWidth - 216))}px`
    menu.showPopover?.()
    menu.querySelector<HTMLButtonElement>('button')?.focus()
    const dismiss = (event: Event) => {
      if (
        !menu.contains(event.target as Node) &&
        !button.contains(event.target as Node)
      )
        setOpen(false)
    }
    const toggle = (event: any) => {
      if (event.newState === 'closed') setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    menu.addEventListener('toggle', toggle)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      menu.removeEventListener('toggle', toggle)
      menu.hidePopover?.()
    }
  }, [open])
  return h(
    React.Fragment,
    null,
    h(
      'button',
      {
        ref: trigger,
        className: 'srb-menu-trigger',
        'aria-label': '画板设置',
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: () => setOpen(!open)
      },
      '画板设置',
      h('span', { className: 'srb-chevron', 'aria-hidden': true })
    ),
    open &&
      h(
        'div',
        {
          ref,
          className: 'srb-action-menu',
          role: 'menu',
          popover: 'auto',
          'aria-label': '画板设置',
          onKeyDown: (event: React.KeyboardEvent) => {
            const buttons = [
                ...ref.current!.querySelectorAll<HTMLButtonElement>('button')
              ],
              index = buttons.indexOf(
                document.activeElement as HTMLButtonElement
              )
            if (event.key === 'Escape') {
              event.preventDefault()
              setOpen(false)
              trigger.current?.focus()
            }
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault()
              buttons[
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (index +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        buttons.length) %
                      buttons.length
              ]?.focus()
            }
          }
        },
        ...items.map((item) =>
          h(
            'button',
            {
              key: item.label,
              role: 'menuitem',
              onClick: () => {
                setOpen(false)
                trigger.current?.focus()
                item.action()
              }
            },
            item.label
          )
        )
      )
  )
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
  if (
    active === false ||
    (active === undefined && !page.isResearch(sessionId))
  )
    return null
  const v = currentBoard(page, sessionId),
    f = s.favorites.find((f) => f.sessionId === sessionId)
  const items = v
    ? [
        ...(v.permissions.read
          ? [
              {
                label: '管理协作',
                action: () => manageBoard(page, v.boardId)
              }
            ]
          : []),
        { label: '管理研究看板', action: () => manageSidebarBoards(page) }
      ]
    : [
        ...(f
          ? [
              { label: '共享协作', action: () => shareFavorite(page, f) },
              {
                label: '重命名看板',
                action: () => favoriteMenu(page, f)
              },
              {
                label: '取消常用',
                action: safely(page, () => page.favorite(sessionId))
              }
            ]
          : []),
        { label: '管理研究看板', action: () => manageSidebarBoards(page) }
      ]
  return h(
    'div',
    { className: 'srb-actions' },
    v
      ? h(
          React.Fragment,
          null,
          (v.board.sharingState !== 'shared' ||
            !v.permissions.read ||
            v.board.lifecycle === 'archived') &&
            h(
              'span',
              { className: 'srb-badge' },
              !v.permissions.read
                ? '共享访问已结束'
                : v.board.lifecycle === 'archived'
                  ? '已归档'
                  : '仅自己可见'
            ),
          h(ResearchBoardPresence, { page, sessionId })
        )
      : h(
          'button',
          {
            'aria-label': f ? '取消常用' : '设为常用',
            'aria-pressed': !!f,
            className: 'srb-favorite-button',
            onClick: safely(page, () => page.favorite(sessionId))
          },
          f ? '已设为常用' : '设为常用'
        ),
    h(BoardActionMenu, { key: sessionId, items })
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
function manageSidebarBoards(page: ResearchBoardsPage) {
  const s = page.getState()
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

  return h(
    'section',
    { className: 'srb-section', 'data-wide': wide, 'aria-label': '研究看板' },
    h(
      'header',
      null,
      h(
        'button',
        {
          className: 'srb-section-toggle',
          'aria-label': !wide
            ? '展开研究看板'
            : collapsed
              ? '展开研究看板'
              : '折叠研究看板',
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
        wide
          ? h(
              React.Fragment,
              null,
              '研究看板',
              h('span', {
                className: 'srb-chevron',
                'data-collapsed': collapsed,
                'aria-hidden': true
              })
            )
          : boardIcon('boards')
      )
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
              onContextMenu: (event: React.MouseEvent) => {
                event.preventDefault()
                favoriteMenu(page, f)
              },
              draggable: true,
              onDragStart: (e: React.DragEvent) => {
                setDrag(f.favoriteId)
                e.dataTransfer.setData(
                  'text/x-sherlock-favorite',
                  f.favoriteId
                )
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
              h('span', null, f.title)
            ),
            h(BoardEditTime, {
              value:
                Math.max(f.updatedAt ?? 0, page.editedAt(f.sessionId) ?? 0) ||
                undefined
            })
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
                onContextMenu: (event: React.MouseEvent) => {
                  event.preventDefault()
                  manageBoard(page, b.boardId)
                },
                'aria-current': page.current() === b.localSessionId
              },
              h(
                'button',
                {
                  onClick: safely(page, () => page.openBoard(b.boardId)),
                  title: b.title
                },
                b.sharingState === 'shared' && boardIcon('people'),
                h('span', null, b.title)
              ),
              h(BoardEditTime, {
                value: b.updatedAt,
                editor: b.updatedBy?.username
              })
            )
          )
      )
  )
}
function BoardEditTime({ value, editor }: { value?: number; editor?: string }) {
  const [now, setNow] = React.useState(Date.now())
  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [])
  return h(
    'time',
    {
      className: 'srb-edit-time',
      dateTime: value ? new Date(value).toISOString() : undefined,
      title: value
        ? `${editor ? editor + ' · ' : ''}${new Date(value).toLocaleString()} 编辑`
        : '暂无编辑记录'
    },
    boardEditTime(value, now)
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
    scope.textContent =
      capture.nodeCount === 0 && capture.historyCount === 0 && capture.assetBytes === 0
        ? '当前研究尚无组件、已保存对话或资料，将创建空白共享画板。'
        : `将当前研究的 ${capture.nodeCount} 个组件、${capture.historyCount} 条已保存对话及 ${(capture.assetBytes / 1024 / 1024).toFixed(1)} MB 资料复制到共享画板。`
    const sync = document.createElement('p')
    sync.textContent =
      '协作成员访问的是同一块共享画板，拖动、编辑和生成的组件会实时同步。原个人画板单独保留，后续修改不会与共享画板互相同步。'
    scope.className = 'srb-description'
    sync.className = 'srb-info-panel'
    const field = uiText('label', '画板名称')
    field.append(name)
    d.body.append(field, scope, sync)
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
      document.createTextNode(
        '已有协作副本，继续管理可邀请成员加入同一看板。'
      )
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
  label = '发送邀请',
  parent: HTMLElement = d.body
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
        parent.append(
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
  const form = document.createElement('section')
  form.className = 'srb-invite-form'
  const field = document.createElement('label')
  field.textContent = '通过用户 ID 邀请'
  const lookupRow = document.createElement('div')
  lookupRow.className = 'srb-field-row'
  lookupRow.append(input, lookupButton)
  field.append(lookupRow)
  const hint = document.createElement('p')
  hint.className = 'srb-description'
  hint.textContent = '输入对方的 10 位专有 ID，核对用户后发送邀请。'
  recipient.className = 'srb-recipient'
  const controls = document.createElement('div')
  controls.className = 'srb-invite-controls'
  const roleLabel = document.createElement('label')
  roleLabel.textContent = '成员权限'
  roleLabel.append(role)
  controls.append(roleLabel, send)
  form.append(field, hint, recipient, controls)
  parent.append(form)
}
function uiText(tag: string, text: string, className = '') {
  const element = document.createElement(tag)
  element.textContent = text
  element.className = className
  return element
}
function fieldRow(
  label: string,
  input: HTMLInputElement,
  button: HTMLButtonElement
) {
  const field = uiText('label', label),
    row = uiText('div', '', 'srb-field-row')
  row.append(input, button)
  field.append(row)
  return field
}
export function manageBoard(page: ResearchBoardsPage, boardId: string) {
  const d = boardDialog(document, '管理协作')
  d.dialog.classList.add('srb-management')
  void d.run(async () => {
    const summary = page.getState().boards.find((b) => b.boardId === boardId)
    const view = () => page.getView(summary?.localSessionId)
    const v = view()
    if (!v) {
      d.body.append(
        uiText('p', '打开看板后可查看成员和管理协作。', 'srb-description'),
        boardButton(document, '打开看板', async () => {
          await page.openBoard(boardId)
          d.close()
          manageBoard(page, boardId)
        })
      )
      return
    }
    const intro = uiText('div', '', 'srb-dialog-intro')
    intro.append(
      uiText('strong', v.board.title),
      uiText(
        'p',
        v.board.sharingState === 'shared'
          ? '成员共同编辑同一块画板，修改实时同步。'
          : '这块画板目前仅你可见。',
        'srb-description'
      )
    )
    const tabs = uiText('nav', '', 'srb-dialog-tabs')
    tabs.setAttribute('role', 'tablist')
    tabs.setAttribute('aria-label', '协作管理')
    const members = uiText('div', '', 'srb-tab-panel'),
      settings = uiText('div', '', 'srb-tab-panel')
    members.id = 'srb-members-' + crypto.randomUUID()
    settings.id = 'srb-settings-' + crypto.randomUUID()
    for (const [title, panel] of [
      ['成员与邀请', members],
      ['画板设置', settings]
    ] as const) {
      const tab = boardButton(document, title, () => {
        for (const button of tabs.querySelectorAll('button')) {
          button.setAttribute('aria-selected', String(button === tab))
          button.tabIndex = button === tab ? 0 : -1
        }
        members.hidden = panel !== members
        settings.hidden = panel !== settings
      })
      tab.role = 'tab'
      tab.id = panel.id + '-tab'
      tab.setAttribute('aria-controls', panel.id)
      tab.setAttribute('aria-selected', String(panel === members))
      tab.tabIndex = panel === members ? 0 : -1
      tab.onkeydown = (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault()
          const next = [...tabs.querySelectorAll('button')].find(
            (b) => b !== tab
          )!
          next.click()
          next.focus()
        }
      }
      panel.setAttribute('role', 'tabpanel')
      panel.setAttribute('aria-labelledby', tab.id)
      panel.hidden = panel !== members
      tabs.append(tab)
    }
    d.body.append(intro, tabs, members, settings)
    if (
      v.permissions.manage &&
      v.board.lifecycle === 'active' &&
      v.board.sharingState === 'shared'
    )
      inviteForm(page, d, async () => boardId, '发送邀请', members)
    const memberList = uiText('section', '', 'srb-member-list'),
      pending = uiText('section', '', 'srb-pending-list')
    pending.setAttribute('aria-label', '待处理邀请')
    members.append(memberList, pending)
    const cmd = (
      label: string,
      action: string,
      extra: Record<string, unknown> = {}
    ) =>
      boardButton(document, label, () =>
        d.run(async () => {
          await page.call(action, { boardId, ...extra })
          d.close()
        })
      )
    const renderMembers = () => {
      const current = view()
      memberList.replaceChildren()
      pending.replaceChildren()
      if (!current?.permissions.read) {
        members.replaceChildren(
          uiText('p', '共享访问已结束。', 'srb-description')
        )
        settings.replaceChildren()
        return
      }
      const users = [
        ...new Map(current.members.map((m) => [m.userId, m])).values()
      ]
      memberList.append(uiText('h3', `成员 · ${users.length}`))
      for (const member of users) {
        const row = uiText('div', '', 'srb-member'),
          avatar = uiText(
            'div',
            Array.from(member.username)[0] ?? '',
            'srb-member-avatar'
          )
        avatar.style.setProperty('--srb-color', colorFor(member.userId)!)
        const online = current.presence.some((p) => p.userId === member.userId)
        avatar.dataset.online = String(online)
        const identity = uiText('div', '', 'srb-member-identity')
        identity.append(
          uiText(
            'strong',
            member.username +
              (member.userId === page.getState().account.user?.userId
                ? ' · 你'
                : '')
          ),
          uiText('small', online ? '正在画板中' : '未在当前画板')
        )
        row.append(avatar, identity)
        if (current.permissions.manage && member.role !== 'owner') {
          const select = document.createElement('select')
          select.setAttribute('aria-label', `${member.username}权限`)
          for (const r of ['editor', 'viewer']) {
            const o = document.createElement('option')
            o.value = r
            o.textContent = r === 'editor' ? '可编辑' : '仅查看'
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
          const remove = cmd('移除', 'member.remove', {
            userId: member.userId
          })
          remove.className = 'srb-quiet-danger'
          row.append(select, remove)
        } else
          row.append(uiText('span', boardRoleLabel(member.role), 'srb-role'))
        memberList.append(row)
      }
      if (!current.permissions.manage || !current.pendingInvitations?.length)
        return
      pending.append(
        uiText('h3', `待处理邀请 · ${current.pendingInvitations.length}`)
      )
      for (const invite of current.pendingInvitations) {
        const row = uiText('div', '', 'srb-member')
        row.dataset.pendingInvitation = invite.invitationId
        const identity = uiText('div', '', 'srb-member-identity')
        identity.append(
          uiText('strong', invite.invitee.username),
          uiText('small', `ID ${publicIdLabel(invite.invitee.publicId)}`)
        )
        const select = document.createElement('select')
        select.setAttribute(
          'aria-label',
          `${invite.invitee.username}待处理邀请权限`
        )
        for (const r of ['editor', 'viewer']) {
          const o = document.createElement('option')
          o.value = r
          o.textContent = r === 'editor' ? '可编辑' : '仅查看'
          o.selected = r === invite.role
          select.append(o)
        }
        select.onchange = () =>
          void d.run(() =>
            page.call('invitation.send', {
              boardId,
              publicId: invite.invitee.publicId,
              role: select.value
            })
          )
        row.append(
          identity,
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
    renderMembers()
    const off = page.subscribe(() => {
      if (!d.dialog.isConnected) off()
      else renderMembers()
    })
    d.dialog.addEventListener('close', off, { once: true })
    if (v.permissions.manage) {
      const name = document.createElement('input')
      name.value = v.board.title
      name.setAttribute('aria-label', '协作名称')
      settings.append(
        fieldRow(
          '画板名称',
          name,
          boardButton(document, '保存', () =>
            d.run(async () => {
              await page.call('board.rename', {
                boardId,
                title: name.value
              })
              d.close()
            })
          )
        )
      )
    }
    const setting = (
      title: string,
      description: string,
      button: HTMLButtonElement,
      danger = false
    ) => {
      const row = uiText(
          'div',
          '',
          danger ? 'srb-setting-row srb-danger-zone' : 'srb-setting-row'
        ),
        label = uiText('div', '', 'srb-setting-label')
      label.append(
        uiText('strong', title),
        uiText('p', description, 'srb-description')
      )
      row.append(label, button)
      settings.append(row)
      if (danger) button.className = 'srb-quiet-danger'
    }
    setting(
      '侧栏显示',
      '从研究看板列表快速访问。',
      cmd(
        summary?.pinned ? '移出侧栏' : '固定到侧栏',
        summary?.pinned ? 'board.unpin' : 'board.pin'
      )
    )
    setting(
      '保存个人副本',
      '保存当前内容，之后作为个人研究独立编辑。',
      boardButton(document, '另存为个人研究', () =>
        d.run(async () => {
          await page.copyPersonal(boardId)
          d.close()
        })
      )
    )
    if (v.permissions.manage) {
      setting(
        '自动刷新',
        '控制画板中组件的定时更新。',
        cmd(
          v.board.refreshPaused ? '恢复自动刷新' : '暂停自动刷新',
          'board.refreshPause',
          { paused: !v.board.refreshPaused }
        )
      )
      setting(
        '归档画板',
        '归档后所有成员仍可查看，暂时停止编辑。',
        cmd(
          v.board.lifecycle === 'archived' ? '恢复协作' : '归档协作',
          v.board.lifecycle === 'archived' ? 'board.restore' : 'board.archive'
        )
      )
      const ownerOnly = v.board.sharingState === 'ownerOnly'
      setting(
        ownerOnly ? '重新开启共享' : '结束共享',
        ownerOnly
          ? '重新邀请成员加入这块画板。'
          : '其他成员立即失去访问权，原个人研究保留。',
        boardButton(document, ownerOnly ? '重新开启共享' : '取消共享', () => {
          const c = boardDialog(
            document,
            ownerOnly ? '重新开启共享' : '取消共享'
          )
          c.body.append(
            uiText(
              'p',
              ownerOnly
                ? '需要重新邀请成员，旧邀请不会恢复。'
                : '其他成员将立即失去访问权，原个人研究不受影响。',
              'srb-description'
            )
          )
          const actions = uiText('div', '', 'srb-dialog-footer'),
            confirm = boardButton(document, '确认', () =>
              c.run(async () => {
                await page.call(ownerOnly ? 'board.reopen' : 'board.cancel', {
                  boardId
                })
                c.close()
                d.close()
              })
            )
          confirm.className = ownerOnly ? 'srb-primary' : 'srb-danger-button'
          actions.append(boardButton(document, '返回', c.close), confirm)
          c.body.append(actions)
        }),
        !ownerOnly
      )
    } else
      setting(
        '退出协作',
        '退出后将不再访问这块共享画板。',
        cmd('退出协作', 'board.leave'),
        true
      )
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
  const [pendingRequests, setPendingRequests] = React.useState([] as any[])
  React.useEffect(() => {
    let active = true
    if (v?.permissions.read)
      void page
        .call<any[]>('request.list', { boardId: v.boardId })
        .then((rows) => {
          if (active) setPendingRequests(rows)
        })
        .catch(() => {})
    return () => {
      active = false
    }
  }, [v?.boardId, v?.seq, v?.permissions.read])
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
  const live = [
    ...new Map(v.messages.map((m: any) => [m.id, m])).values()
  ] as any[]
  const requestIds = new Set(
    live.filter((m) => m.role === 'user').map((m) => m.id)
  )
  const linked = (m: any) =>
    m.role === 'assistant' && requestIds.has(m.requestMessageId)
  const groups = [
    ...(v.history ?? []).map((m: any) => ({
      key: 'history:' + m.id,
      rows: [{ ...m, imported: true }],
      requestId: undefined
    })),
    ...live
      .filter((m) => !linked(m))
      .map((m) => ({
        key: 'message:' + m.id,
        requestId: m.role === 'user' ? m.id : undefined,
        rows: [
          m,
          ...live.filter(
            (answer) => linked(answer) && answer.requestMessageId === m.id
          )
        ]
      }))
  ]
  const renderMessage = (m: any, i: number) =>
    h(
      'article',
      {
        className: 'srb-message',
        'data-role': m.role,
        'data-message-id': m.id,
        key: `${m.imported ? 'history' : 'message'}:${m.id ?? i}`
      },
      h(
        'small',
        null,
        m.role === 'assistant'
          ? '研究助手' + (m.author?.username ? ' · ' + m.author.username : '')
          : (m.author?.username ?? m.authorName ?? '成员'),
        m.imported ? ' · 复制时的已保存对话' : ''
      ),
      MarkdownText ? h(MarkdownText, { text: m.text }) : h('p', null, m.text)
    )
  const renderControls = (requestId?: string) => {
    const belongs = (id: unknown) =>
      requestId ? id === requestId : !requestIds.has(id)
    return h(
      React.Fragment,
      null,
      ...pendingRequests
        .filter((r: any) => belongs(r.requestMessageId))
        .filter(
          (r: any) =>
            r.state === 'taskCreateFailed' ||
            r.state === 'messageAccepted' ||
            r.runtimeState === 'interrupted' ||
            r.runtimeState === 'uncertain'
        )
        .map((r: any) =>
          h(
            'div',
            { className: 'srb-status', key: r.clientMutationId },
            r.runtimeState
              ? '执行已中断或结果未确认；不会自动重复调用模型。'
              : '消息已保存，任务尚未启动。',
            h(
              'button',
              {
                onClick: () =>
                  void page
                    .call('request.retry', {
                      boardId: v.boardId,
                      clientMutationId: r.clientMutationId
                    })
                    .catch(page.showError)
              },
              r.runtimeState === 'uncertain'
                ? '明确重新执行这条请求（可能已有一次执行）'
                : r.runtimeState
                  ? '重新执行这条请求'
                  : '重试这条研究任务'
            )
          )
        ),
      ...v.tasks
        .filter((t: any) => belongs(t.requestMessageId))
        .filter(
          (t: any) =>
            t.resultState === 'pendingResult' ||
            t.resultState === 'targetDeleted'
        )
        .map((t: any) =>
          h(
            'button',
            {
              key: 'apply-' + t.taskId,
              onClick: () =>
                void page
                  .call('task.applyResult', {
                    boardId: v.boardId,
                    taskId: t.taskId
                  })
                  .catch(page.showError)
            },
            t.resultState === 'targetDeleted'
              ? '将结果恢复为新组件'
              : '应用保留的研究结果'
          )
        ),
      page.retryRequest(sessionId) &&
        belongs(page.retryRequest(sessionId)?.reply?.requestMessageId) &&
        !pendingRequests.some(
          (r: any) => r.clientMutationId === page.retryRequest(sessionId)?.id
        ) &&
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
        .filter((t: any) => belongs(t.requestMessageId))
        .filter(
          (t) => !['completed', 'failed', 'cancelled'].includes(t.status)
        )
        .map((t) =>
          h(
            'p',
            { key: t.taskId, className: 'srb-status' },
            t.status === 'running' ? '正在研究…' : '研究任务等待执行'
          )
        )
    )
  }
  return h(
    'div',
    { className: 'srb-discussion', 'data-shared-discussion': sessionId },
    !groups.length &&
      h('p', { className: 'srb-status' }, '围绕这份画板继续研究。'),
    ...groups.map((group) =>
      h(
        'section',
        {
          key: group.key,
          className: 'srb-request-group',
          'data-request-message-id': group.requestId
        },
        ...group.rows.map(renderMessage),
        group.requestId && renderControls(group.requestId)
      )
    ),
    renderControls()
  )
}

function showRecovery(page: ResearchBoardsPage) {
  const d = boardDialog(document, '我的恢复记录')
  for (const r of page.localRecovery()) {
    const notice = document.createElement('p')
    notice.textContent = '当前窗口保留的未确认内容，请先复制保存。'
    d.body.append(
      notice,
      boardButton(document, '复制这条恢复内容', () => {
        const current = page.localRecovery().find(
          (row) => row.id === r.id && row.accountId === r.accountId
        )
        if (current) return navigator.clipboard.writeText(current.text)
      })
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
function mountBoardSlots(
  page: ResearchBoardsPage,
  slots: any,
  doc: Document
) {
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
    'conversation.session.header.utilities',
    'sherlock-research-board-actions',
    ResearchBoardHeader
  )
}

export function PersonalResearchHistory({
  sessionId,
  children,
  MarkdownText,
  empty = false,
  flow = false
}: any) {
  const [baseline, setBaseline] = React.useState(null as any)
  React.useEffect(() => {
    let active = true
    setBaseline(null)
    const bridge = (window as any).dshDesktop?.researchBoards
    if (!bridge || bridge.isSharedSession(sessionId)) return
    void bridge
      .invoke('import.get', { localSessionId: sessionId })
      .then((r: any) => {
        if (active && r.ok) setBaseline(r.value)
      })
    return () => {
      active = false
    }
  }, [sessionId])
  if (!flow && !empty) return children ?? null
  if (!baseline?.history?.length) return flow ? null : (children ?? null)
  const records = baseline.history.map((m: any) =>
    h(
      'article',
      {
        className: 'srb-message',
        'data-personal-import': m.id,
        key: m.id
      },
      h(
        'small',
        null,
        m.role === 'assistant'
          ? '研究助手 · ' + (m.authorName ?? '已保存的研究')
          : (m.authorName ?? '已保存的研究对话')
      ),
      MarkdownText ? h(MarkdownText, { text: m.text }) : h('p', null, m.text)
    )
  )
  return h(
    'div',
    {
      className: 'srb-discussion',
      ...(flow
        ? {}
        : {
            'data-chat-flow': '',
            style: { minHeight: 0, flex: 1, overflowY: 'auto' }
          })
    },
    ...records
  )
}
