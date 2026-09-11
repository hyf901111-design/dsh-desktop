// The hosted page supplies React; this Electron-only TS project has no React declarations.
// @ts-expect-error Runtime dependency is supplied by the client module loader.
import * as React from 'react'
import { Menu, IconEllipsisOutline16, IconSearchOutline16, IconPersonalizationOutline16, IconCloseFill14, IconFolderOpenOutline16, IconEditOutline16, IconTriangleRightFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
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
  showBoardError,
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
  workspaces: { list: Store<any>; [key: string]: any }
  researchWorkspaces: { for(id: string): Workspace }
  inputHub: { shells: Map<string, any> }
  bridge: ResearchBoardsBridge
  slots?: any
  document?: Document
}
export { selectionNodeReady } from './research-board-presentation'
import { boardEditTime, boardTaskStatus, boardTaskAttempts, boardMembers, boardEntryActions, boardAvatarBackground } from './research-board-presentation'
export { followResearchConversation } from './research-conversation-follow'
import { taskFailureMessage } from '../../packages/dsh-research-collaboration/protocol.js'
import {
  selectedBoardSession,
  selectBoardSession,
  subscribeBoardSelection
} from './research-board-navigation'
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
        error?: unknown
      }
    >()
  const favoriteWatches = new Map<string, () => void>()
  const cleanups: Array<() => void> = []
  const notify = () => {
    const hidden = JSON.stringify([
      ...state.favorites.filter(f => f.dedicated && f.pinned !== false).map(f => f.sessionId),
      ...state.boards.filter(b => b.pinned && b.localSessionId).map(b => b.localSessionId)
    ].sort())
    if (doc.documentElement.dataset.srbHiddenSessions !== hidden) {
      doc.documentElement.dataset.srbHiddenSessions = hidden
      doc.dispatchEvent(new Event('sherlock-sidebar-selection'))
    }
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
    showBoardError(doc, error)
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
  async function defaultDirectory() {
    const reply = await deps.workspaces.api.host.describe({})
    if (!reply.result.ok) throw Error('无法读取默认工作目录')
    return reply.result.value.cwd as string
  }
  async function freshBoard(title: string) {
    const directory = await call<{ directoryId: string; path: string }>('local.directory', { mode: 'reserve', title, basePath: await defaultDirectory() })
    const id = await deps.sessions.create({ cwd: directory.path })
    await deps.sessions.binding(id)?.session.rename(title)
    await call('local.directory', { mode: 'bind', directoryId: directory.directoryId, sessionId: id })
    return id
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
        const id = await freshBoard(opened.title)
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
    // Keep every already-started write in the drain, even if IPC replies arrive out of order.
    draft.chain = Promise.all([draft.chain, pending]).then(
      () => {
        draft.error = undefined
        if (generation === state.account.generation && draft.text === text)
          ownRecovery.delete(key)
      },
      (error) => { draft.error = error }
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
  let updateLocked = false, priorInert = false
  const resumeAfterUpdate = () => {
    if (updateLocked) doc.body.inert = priorInert
    updateLocked = false
  }
  win.addEventListener('sherlock:boards:update-resume', resumeAfterUpdate)
  cleanups.push(() => { resumeAfterUpdate(); win.removeEventListener('sherlock:boards:update-resume', resumeAfterUpdate) })
  async function prepareForUpdate() {
    if (disposed) throw Error('研究页面已关闭，无法保存。')
    if (!updateLocked) { priorInert = doc.body.inert; doc.body.inert = true; updateLocked = true }
    const generation = state.account.generation
    try {
      for (const id of Object.keys(deps.sessions.list.getSnapshot().byId)) {
        const workspace = deps.researchWorkspaces.for(id)
        if (workspace.isCollaborationGesture?.()) throw Error('请先完成当前拖动或缩放，再重试更新。')
        if (isShared(id)) {
          if (editors.get(id)?.view.permissions.edit) await flushCanvas(id)
        } else {
          if (typeof workspace.prepareForUpdate !== 'function') throw Error('研究保存入口尚未就绪，请稍后重试更新。')
          await workspace.prepareForUpdate()
        }
      }
      for (const draft of drafts.values()) {
        let pending: Promise<unknown>
        do { pending = draft.chain; await pending } while (pending !== draft.chain)
        if (draft.error) throw Error('研究草稿保存失败，请稍后重试更新。')
      }
      if (disposed || generation !== state.account.generation) throw Error('研究账户或页面已改变，已停止自动重启。')
    } catch (error) { resumeAfterUpdate(); throw error }
  }
  const generationFlights = new Map<string, { fingerprint: string; taskId?: string; promise: Promise<{ ok: boolean; taskId: string }> }>()
  function retainedResult(sessionId: string, nodeId: string) {
    const latest = view(sessionId)?.tasks.filter((t: any) => t.targetId === nodeId).at(-1) as any
    return latest?.resultState === 'pendingResult' ? latest : undefined
  }
  async function applyRetainedResult(sessionId: string, nodeId: string) {
    const v = await flushCanvas(sessionId), task = retainedResult(sessionId, nodeId)
    if (!task) throw Error('保留的研究结果已变化，请稍后再试')
    return call('task.applyResult', { boardId: v.boardId, taskId: task.taskId })
  }
  function generateShared(sessionId: string, request: any) {
    const key = signature([state.account.generation, sessionId, view(sessionId)?.epoch, request.targetNodeId])
    const fingerprint = signature(request)
    const prior = generationFlights.get(key)
    const known = prior?.taskId && view(sessionId)?.tasks.find((t: any) => t.taskId === prior.taskId) as any
    if (prior && (!known || ['pending', 'running'].includes(known.status)))
      return prior.fingerprint === fingerprint ? prior.promise : Promise.reject(Error('组件正在提交生成请求，请稍后再试'))
    const flight = { fingerprint, taskId: undefined as string | undefined, promise: undefined as any }
    flight.promise = generateSharedOnce(sessionId, request).then(result => {
      flight.taskId = result.taskId
      return result
    }, error => { generationFlights.delete(key); throw error })
    generationFlights.set(key, flight)
    return flight.promise as Promise<{ ok: boolean; taskId: string }>
  }
  async function generateSharedOnce(sessionId: string, request: any) {
    const v = await flushCanvas(sessionId),
      workspace = deps.researchWorkspaces.for(sessionId),
      target = workspace
        .getSnapshot()
        .artifacts.find((n: any) => n.id === request.targetNodeId)
    if (!target || request.sessionId !== sessionId)
      throw Error('生成目标已失效')
    const running = v.tasks.find((t: any) => t.targetId === target.id && ['pending', 'running'].includes(t.status)) as any
    if (running) throw Error('这个组件正在生成，请等待当前任务完成')
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
      !['open', 'login', 'prepare-update'].includes(p.action)
    )
      return
    if (p.action === 'prepare-update') {
      void prepareForUpdate().then(() => response(p.requestId, true), (error) => response(p.requestId, false, error.message))
      return
    }
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
    prepareForUpdate,
    generateShared,
    hasRetainedResult: (sessionId: string, nodeId: string) => !!retainedResult(sessionId, nodeId),
    applyRetainedResult,
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
    async createPrivateBoard() {
      const id = await freshBoard('新研究看板')
      const i = identity(id)
      if (!i) throw Error('研究看板尚未就绪')
      await call('favorite.add', { identity: i, dedicated: true })
      await api.openPersonal(id)
      selectBoardSession(id)
      return id
    },
    async renamePersonal(id: string, title: string) {
      await deps.sessions.binding(id)?.session.rename(title)
    },
    async collaborationSource(id: string) {
      const existing = state.favorites.find(f => f.sessionId === id)
      if (existing) return existing
      const i = identity(id)
      if (!i) throw Error('研究内容尚未就绪')
      return call<Favorite>('favorite.add', { identity: i, pinned: false })
    },
    async returnToWorkspace(entry: Favorite | BoardSummary) {
      const shared = 'boardId' in entry
      if (shared && entry.sharingState === 'shared') throw Error('请先取消协作，再放回工作区。')
      const id = shared ? await openBoard(entry.boardId) : entry.sessionId
      if (!id) throw Error('研究看板尚未就绪')
      if (shared && view(id)?.permissions.edit) await flushCanvas(id)
      const result = await call<{ localSessionId: string }>('local.directory', { mode: 'workspace', sessionId: id, title: entry.title, basePath: await defaultDirectory() })
      await deps.workspaces.refresh()
      if (result.localSessionId !== id) {
        // Publish the replacement before archiving the retained source record.
        await deps.sessions.refresh()
        await deps.workspaces.archiveSession(id)
      }
      if (shared) await call('board.unpin', { boardId: entry.boardId })
      else await call('favorite.remove', { favoriteId: entry.favoriteId })
      selectBoardSession('')
      await api.openPersonal(result.localSessionId)
    },
    async favorite(id: string) {
      const f = state.favorites.find((f) => f.sessionId === id)
      if (f && f.pinned !== false) await call('favorite.remove', { favoriteId: f.favoriteId })
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
function boardIcon(_kind: 'people' | 'boards') {
  return h('span', { className: 'srb-people-icon', 'aria-hidden': true })
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
  const dedicatedBoard = v?.board.sharingState === 'ownerOnly' && v.permissions.read
  const pinned = dedicatedBoard ? s.boards.some(board => board.boardId === v.boardId && board.pinned) : !!f && f.pinned !== false
  return h(
    'div',
    { className: 'srb-actions', 'data-srb-board-bound': !!(v || f) },
    v && !dedicatedBoard
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
            'aria-label': pinned ? '取消常用' : '设为常用',
            'aria-pressed': pinned,
            className: 'srb-favorite-button',
            onClick: safely(page, () => dedicatedBoard
              ? page.call(pinned ? 'board.unpin' : 'board.pin', { boardId: v.boardId })
              : page.favorite(sessionId))
          },
          h('span', { className: 'srb-favorite-icon', 'aria-hidden': true }),
          pinned ? '已设为常用' : '设为常用'
        ),
    v?.board.sharingState === 'shared'
      ? v.permissions.read && h('button', {
          className: 'srb-manage-button',
          onClick: () => manageBoard(page, v.boardId, 'settings')
        }, '管理')
      : h('button', {
          className: 'srb-create-collaboration',
          disabled: !!v && (!v.permissions.manage || v.board.lifecycle !== 'active'),
          onClick: safely(page, async () => {
            if (v) addBoardCollaborator(page, v.boardId, sessionId)
            else shareFavorite(page, await page.collaborationSource(sessionId))
          })
        }, boardIcon('people'), '创建协作')
  )
}
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
  const users = boardMembers(v, s.account.user?.userId)
  return h('div', { className: 'srb-presence', 'aria-label': '协作成员' },
    ...users.slice(0, 3).map(p => h('button', {
      className: 'srb-avatar', key: p.userId,
      style: { '--srb-avatar-background': boardAvatarBackground(p.userId, p.self) } as React.CSSProperties,
      'data-self': p.self, 'data-offline': !p.online,
      'aria-label': `${p.username}，${boardRoleLabel(p.role)}`,
      'aria-haspopup': 'dialog',
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => showBoardAvatarInfo(page, sessionId, p.userId, event.currentTarget)
    }, Array.from(p.username)[0]?.toUpperCase())),
    users.length > 3 && h('button', {
      className: 'srb-avatar-overflow', 'aria-label': `另外 ${users.length - 3} 位协作成员`,
      'aria-haspopup': 'dialog',
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => showBoardMembers(page, sessionId, event.currentTarget)
    }, `+${users.length - 3}`),
    v.permissions.manage && v.board.lifecycle === 'active' && h('button', {
      className: 'srb-add-collaborator', 'aria-label': '添加协作者',
      onClick: () => addBoardCollaborator(page, v.boardId, sessionId)
    }, h('span', { className: 'srb-plus-icon', 'aria-hidden': true })))
}

/** Figma 61: clicking an avatar reveals identity, while +N opens membership. */
export function showBoardAvatarInfo(page: ResearchBoardsPage, sessionId: string, userId: string, anchor: HTMLElement) {
  const doc = anchor.ownerDocument, win = doc.defaultView!
  const existing = doc.querySelector<HTMLElement>('.srb-avatar-info')
  const same = existing?.dataset.userId === userId && existing?.dataset.sessionId === sessionId
  existing?.dispatchEvent(new win.Event('srb-close'))
  if (same) return
  doc.querySelectorAll('.srb-members-popover').forEach(el => el.dispatchEvent(new win.Event('srb-close')))
  const popover = doc.createElement('div')
  popover.className = 'srb-avatar-info'
  popover.dataset.userId = userId; popover.dataset.sessionId = sessionId
  popover.setAttribute('popover', 'manual')
  popover.setAttribute('role', 'dialog'); popover.setAttribute('aria-label', '成员信息')
  const name = uiText('strong', ''), permission = uiText('small', '')
  const arrow = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  arrow.setAttribute('viewBox', '0 0 12 8'); arrow.setAttribute('aria-hidden', 'true')
  arrow.innerHTML = '<path d="M0 7L5.3 1.7Q6 1 6.7 1.7L12 7"/>'
  popover.append(name, permission, arrow)
  let off = () => {}, closed = false
  const close = (focus = false) => {
    if (closed) return
    closed = true; off(); popover.hidePopover?.(); popover.remove()
    anchor.setAttribute('aria-expanded', 'false')
    doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', key, true)
    win.removeEventListener('resize', position); doc.removeEventListener('scroll', position, true)
    if (focus && anchor.isConnected) anchor.focus({ preventScroll: true })
  }
  const position = () => {
    if (!anchor.isConnected) { close(); return }
    const rect = anchor.getBoundingClientRect(), width = popover.getBoundingClientRect().width || 160
    const height = popover.getBoundingClientRect().height || 66
    const left = Math.max(12, Math.min(rect.left - 4, win.innerWidth - width - 12))
    const above = rect.bottom + 8 + height > win.innerHeight - 12 && rect.top >= height + 20
    popover.style.left = `${left}px`
    popover.style.top = `${Math.max(12, above ? rect.top - height - 8 : rect.bottom + 8)}px`
    popover.dataset.side = above ? 'top' : 'bottom'
    popover.style.setProperty('--srb-arrow-x', `${Math.max(12, Math.min(width - 12, rect.left + rect.width / 2 - left))}px`)
  }
  const outside = (event: Event) => {
    const target = event.target as Node
    if (!popover.contains(target) && !anchor.contains(target)) close()
  }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true) } }
  const render = () => {
    const view = page.getView(sessionId)
    const member = view && boardMembers(view, page.getState().account.user?.userId).find(m => m.userId === userId)
    if (!view?.permissions.read || view.board.sharingState !== 'shared' || !member) { close(); return }
    name.textContent = member.username + (member.self ? ' · 你' : '')
    permission.textContent = member.role === 'owner' ? '创建者 · 可编辑' : member.role === 'editor' ? '可编辑' : '仅可查看'
    position()
  }
  popover.addEventListener('srb-close', () => close())
  doc.body.append(popover); render()
  if (closed) return
  popover.showPopover?.(); position(); anchor.setAttribute('aria-expanded', 'true')
  off = page.subscribe(render)
  doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', key, true)
  win.addEventListener('resize', position); doc.addEventListener('scroll', position, true)
  return { popover, close }
}

export function showBoardMembers(page: ResearchBoardsPage, sessionId: string, anchor: HTMLElement) {
  const doc = anchor.ownerDocument, win = doc.defaultView!
  doc.querySelectorAll('.srb-avatar-info').forEach(element => element.dispatchEvent(new win.Event('srb-close')))
  doc.querySelectorAll('.srb-members-popover').forEach(element => element.dispatchEvent(new win.Event('srb-close')))
  const popover = doc.createElement('div')
  popover.className = 'srb-members-popover'
  popover.setAttribute('popover', 'auto')
  popover.setAttribute('role', 'dialog')
  popover.setAttribute('aria-label', '协作成员')
  const title = uiText('h2', ''), online = uiText('p', '', 'srb-members-online')
  const input = doc.createElement('input')
  input.type = 'search'; input.placeholder = '搜索成员姓名…'; input.setAttribute('aria-label', '搜索成员姓名')
  const list = uiText('div', '', 'srb-members-scroll')
  const footer = uiText('div', '', 'srb-members-footer')
  const close = () => { popover.hidePopover?.(); popover.remove(); off(); win.removeEventListener('resize', position) }
  const position = () => {
    // Figma 305:614 is aligned with the management button's right edge,
    // regardless of which avatar or overflow count opened it.
    const rect = (anchor.closest('.srb-actions') ?? anchor).getBoundingClientRect()
    popover.style.left = Math.max(12, Math.min(rect.right - 340, win.innerWidth - 352)) + 'px'
    popover.style.top = Math.max(12, Math.min(rect.bottom + 21, win.innerHeight - popover.getBoundingClientRect().height - 12)) + 'px'
  }
  const render = () => {
    const v = page.getView(sessionId)
    if (!v?.permissions.read || v.board.sharingState !== 'shared') { close(); return }
    const users = boardMembers(v, page.getState().account.user?.userId)
    title.textContent = `协作成员 · ${users.length}`
    online.textContent = `${users.filter(member => member.online).length} 位正在画板中`
    list.replaceChildren()
    for (const member of users.filter(member => member.username.toLocaleLowerCase().includes(input.value.trim().toLocaleLowerCase()))) {
      const row = uiText('div', '', 'srb-member'), avatar = uiText('div', Array.from(member.username)[0]?.toUpperCase() ?? '', 'srb-member-avatar')
      avatar.style.setProperty('--srb-avatar-background', boardAvatarBackground(member.userId, member.self))
      avatar.dataset.self = String(member.self)
      const identity = uiText('div', '', 'srb-member-identity')
      identity.append(uiText('strong', member.username + (member.self ? ' · 你' : '')), uiText('small', member.online ? member.editing ? '正在编辑' : '正在画板中' : '未在当前画板'))
      row.append(avatar, identity, uiText('span', member.role === 'owner' ? '创建者' : member.role === 'editor' ? '可编辑' : '可查看', 'srb-role'))
      list.append(row)
    }
    if (!list.children.length) list.append(uiText('p', '没有找到匹配的成员', 'srb-members-empty'))
    footer.replaceChildren(boardButton(doc, '管理协作', () => { close(); manageBoard(page, v.boardId, 'members') }))
  }
  const off = page.subscribe(() => { if (popover.isConnected) render(); else off() })
  input.addEventListener('input', render)
  popover.addEventListener('srb-close', close)
  popover.addEventListener('toggle', (event: Event) => { if ((event as Event & { newState?: string }).newState === 'closed') close() })
  popover.addEventListener('keydown', (event: KeyboardEvent) => { if (event.key === 'Escape') close() })
  popover.append(title, online, input, list, footer)
  doc.body.append(popover)
  render(); if (!popover.isConnected) return { popover, close }; popover.showPopover?.(); position(); win.addEventListener('resize', position)
  popover.tabIndex = -1
  popover.focus({ preventScroll: true })
  return { popover, close }
}

export function addBoardCollaborator(page: ResearchBoardsPage, boardId: string, sessionId: string) {
  const v = page.getView(sessionId)
  if (!v?.permissions.read || !v.permissions.manage || v.board.lifecycle !== 'active') return
  const d = boardDialog(document, '添加协作者')
  d.dialog.classList.add('srb-add-collaborator-dialog')
  d.body.append(uiText('p', `邀请成员加入「${v.board.title}」`, 'srb-description'))
  inviteForm(page, d, async () => {
    if (page.getView(sessionId)?.board.sharingState !== 'shared') await page.call('board.reopen', { boardId })
    return boardId
  })
}

export function ResearchBoardSidebar({ page, wide = true }: { page: ResearchBoardsPage; wide?: boolean; expandSidebar?: () => void }) {
  const state = useBoard(page)
  const skin = React.useSyncExternalStore((listener: () => void) => { window.addEventListener('sherlock-sidebar-skin', listener); return () => window.removeEventListener('sherlock-sidebar-skin', listener) }, () => (window as any).__sherlockWorkspaceSidebarSkin)
  const searchInput = React.useRef<HTMLInputElement>(null), searchRoot = React.useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem('sherlock.boards.collapsed') === 'true')
  const [search, setSearch] = React.useState(false), [query, setQuery] = React.useState('')
  React.useEffect(() => { if (search) searchInput.current?.focus({ preventScroll: true }) }, [search])
  React.useEffect(() => {
    if (!search) return
    const outside = (event: MouseEvent) => { if (!query.trim() && !searchRoot.current?.contains(event.target as Node)) setSearch(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [search, query])
  const [optionsOpen, setOptionsOpen] = React.useState(false), [creating, setCreating] = React.useState(false)
  const [preferences, setPreferences] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sherlock.boards.view.v3') ?? localStorage.getItem('sherlock.boards.view.v2') ?? 'null')
      return { groupBy: saved?.groupBy === 'type' ? 'type' : 'flat', collapsedGroups: Array.isArray(saved?.collapsedGroups) ? saved.collapsedGroups.filter((g: unknown) => g === 'private' || g === 'shared') : [], sort: saved?.sort === 'updated' ? 'updated' : 'manual', order: Array.isArray(saved?.order) ? saved.order.filter((v: unknown) => typeof v === 'string') : [] }
    }
    catch { return { groupBy: 'flat', collapsedGroups: [], sort: 'manual', order: [] } }
  })
  const selectedSession = React.useSyncExternalStore(subscribeBoardSelection, selectedBoardSession)
  const save = (next: any) => { setPreferences(next); localStorage.setItem('sherlock.boards.view.v3', JSON.stringify(next)) }
  const entries = [
    ...state.favorites.filter(f => f.pinned !== false).map(f => ({ key: 'private:' + f.favoriteId, group: 'private', value: f, time: Math.max(f.updatedAt ?? f.createdAt, page.editedAt(f.sessionId) ?? 0) })),
    ...state.boards.filter(b => b.pinned).map(b => ({ key: 'shared:' + b.boardId, group: b.sharingState === 'shared' ? 'shared' : 'private', value: b, time: b.updatedAt ?? b.createdAt }))
  ]
  const order = preferences.order as string[]
  entries.sort((a, b) => preferences.sort === 'updated' ? b.time - a.time :
    (order.includes(a.key) ? order.indexOf(a.key) : 100000) - (order.includes(b.key) ? order.indexOf(b.key) : 100000))
  const visible = entries.filter(e => e.value.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  if (!wide || !skin) return null
  const B = skin.header
  const classes = (...names: Array<string | false>) => names.filter(Boolean).join(' ')
  return h('section', { className: 'srb-section ' + B.root, 'data-wide': true, 'aria-label': '研究看板' },
    h('div', { className: B.sectionHeader, 'data-srb-section-header': '' },
      h('button', { className: classes('srb-section-toggle', B.sectionLabel, search && B.sectionLabelHidden), 'aria-label': collapsed ? '展开研究看板' : '折叠研究看板', 'aria-expanded': !collapsed,
        onClick: () => { setCollapsed(!collapsed); localStorage.setItem('sherlock.boards.collapsed', String(!collapsed)) } },
        '研究看板', h('span', { className: 'srb-chevron', 'data-collapsed': collapsed, 'aria-hidden': true })),
      h('div', { className: classes(B.searchSlot, search && B.searchSlotExpanded) },
        h('div', { ref: searchRoot, className: classes(B.search, search && B.searchExpanded), onClick: () => { setSearch(true); searchInput.current?.focus() } },
          h('button', { className: B.searchButton, 'aria-label': '搜索研究看板', 'aria-expanded': search, title: '搜索研究看板', onClick: () => setSearch(true) }, h(IconSearchOutline16, { size: search ? 11 : 16 })),
          h('input', { ref: searchInput, className: B.searchInput, value: query, tabIndex: search ? 0 : -1, placeholder: '搜索研究看板…', 'aria-label': '搜索看板名称',
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Escape') { setQuery(''); setSearch(false) } } }),
          search && h('button', { className: B.clearButton, 'aria-label': '关闭看板搜索', onClick: (e: React.MouseEvent) => { e.stopPropagation(); setQuery(''); setSearch(false) } }, h(IconCloseFill14)))),
      h('div', { className: classes(B.headerActions, search && B.headerActionsHidden) },
        h(Menu, { className: 'srb-navigation-menu', open: optionsOpen, onClose: () => setOptionsOpen(false), align: 'end', dense: true, portal: true,
          selectedIds: [preferences.groupBy, preferences.sort],
          items: [{ type: 'label', id: 'groups-label', text: '分组方式' }, { id: 'type', label: '按类型' }, { id: 'flat', label: '单列表' },
            { type: 'separator', id: 'sort-separator' }, { type: 'label', id: 'sort-label', text: '排序方式' }, { id: 'manual', label: '手动排序' }, { id: 'updated', label: '最近更新' }],
          onSelect: (id: string) => {
            setOptionsOpen(false)
            if (id === 'type' || id === 'flat') save({ ...preferences, groupBy: id })
            else save({ ...preferences, sort: id })
          },
          anchor: h('button', { className: B.iconButton, 'aria-label': '看板视图选项', 'aria-expanded': optionsOpen, title: '看板视图选项', onClick: () => setOptionsOpen(!optionsOpen) }, h(IconPersonalizationOutline16)) }),
        h('button', { className: B.iconButton, 'aria-label': '新建研究看板', title: '新建研究看板', disabled: creating, onClick: safely(page, async () => {
          setCreating(true)
          try { await page.createPrivateBoard(); setCollapsed(false); localStorage.setItem('sherlock.boards.collapsed', 'false'); setQuery(''); save({ ...preferences, collapsedGroups: preferences.collapsedGroups.filter((g: string) => g !== 'private') }) }
          finally { setCreating(false) }
        }) }, h('span', { className: 'srb-research-icon', 'data-sherlock-research-icon': '', 'aria-hidden': true })))),
    (!collapsed || search) && h(ResearchBoardList, { page, skin, visible, entries, preferences, query, selectedSession, save }))
}
function ResearchBoardList({ page, skin, visible, entries, preferences, query, selectedSession, save }: any) {
  const [drag, setDrag] = React.useState<any>(null)
  const currentDrag = React.useRef<any>(null), committed = React.useRef(false)
  skin.useNativeDragAcceptance(drag !== null)
  const updateDrag = (next: any) => { currentDrag.current = next; setDrag(next) }
  React.useEffect(() => { updateDrag(null) }, [preferences.groupBy, preferences.sort, query])
  const B = skin.header, grouped = preferences.groupBy === 'type'
  const commit = (over: { key: string; half: 'before' | 'after' } | null) => {
    const active = currentDrag.current
    if (!active || !over || committed.current) return
    committed.current = true
    updateDrag(null)
    const rows = entries.filter((e: any) => !grouped || e.group === active.group)
    const source = rows.findIndex((e: any) => e.key === active.key), target = rows.findIndex((e: any) => e.key === over.key)
    if (source < 0 || target < 0 || source === target) return
    const anchor = over.half === 'before' ? target : target + 1
    if (anchor === source || anchor === source + 1) return
    const keys = rows.map((e: any) => e.key).filter((key: string) => key !== active.key)
    keys.splice(anchor > source ? anchor - 1 : anchor, 0, active.key)
    let index = 0
    save({ ...preferences, order: entries.map((e: any) => !grouped || e.group === active.group ? keys[index++] : e.key) })
  }
  const renderRow = (entry: any) => {
    const active = drag !== null && (!grouped || drag.group === entry.group)
    const over = (e: React.DragEvent) => ({ key: entry.key, half: skin.rowHalf(e) })
    return h(ResearchBoardRow, { key: entry.key, skin, page, entry: entry.value, time: entry.time, selectedSession, nested: grouped,
      marker: active && drag.over?.key === entry.key ? drag.over.half : null,
      draggable: preferences.sort === 'manual' && !query,
      onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('text/plain', entry.key)
        e.dataTransfer.setData('text/x-sherlock-board', entry.key)
        committed.current = false
        updateDrag({ key: entry.key, group: entry.group, over: null })
      },
      onDragOver: (e: React.DragEvent) => {
        if (!active) return
        e.preventDefault(); e.dataTransfer.dropEffect = 'move'
        updateDrag({ ...currentDrag.current, over: over(e) })
      },
      onDrop: (e: React.DragEvent) => { if (active) { e.preventDefault(); commit(over(e)) } },
      onDragEnd: () => { commit(currentDrag.current?.over ?? null); updateDrag(null); committed.current = false }
    })
  }
  const groups = grouped ? ['private', 'shared'].map(group => ({ group, rows: visible.filter((e: any) => e.group === group) })).filter(g => g.rows.length) : []
  const firstMarker = !grouped && drag?.over?.key === visible[0]?.key && drag?.over?.half === 'before'
  return h('div', { className: B.listArea }, h('div', { className: B.treeBody },
    h('div', { className: ['srb-board-list', B.list, !grouped && B.flatList].filter(Boolean).join(' '), 'data-group-by': preferences.groupBy },
      !visible.length && h('p', { className: 'srb-empty' }, query ? '没有找到匹配的看板' : '新建研究看板，或从研究中创建协作'),
      ...(grouped ? groups.map(({ group, rows }) => h(ResearchBoardGroup, { key: group, skin, group,
        expanded: !!query || !preferences.collapsedGroups.includes(group),
        onToggle: () => { if (!query) save({ ...preferences, collapsedGroups: preferences.collapsedGroups.includes(group) ? preferences.collapsedGroups.filter((g: string) => g !== group) : [...preferences.collapsedGroups, group] }) }
      }, ...rows.map(renderRow))) : visible.map(renderRow))),
    firstMarker && h('span', { className: B.listTopDropIndicator, 'aria-hidden': true })))
}
function ResearchBoardGroup({ skin, group, expanded, onToggle, children }: any) {
  const R = skin.rows, title = group === 'private' ? '专用看板' : '协作看板'
  return h('div', { className: skin.header.groupSection, 'data-srb-board-group': group },
    h('div', { className: R.projectRow, role: 'treeitem', tabIndex: 0, 'aria-label': title, 'aria-expanded': expanded,
      onClick: onToggle, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } } },
      h('span', { className: R.slot + ' ' + R.folder }, h(skin.WorkspaceFolderIcon, { expanded })),
      h('span', { className: R.slot + ' ' + R.chevron }, h(IconTriangleRightFill14, { className: [R.arrow, expanded && R.arrowOpen].filter(Boolean).join(' ') })),
      h('span', { className: R.projectText }, h('span', { className: R.title }, title))),
    expanded && children)
}
function ResearchBoardRow({ page, entry, time, selectedSession, skin, marker, nested, ...drag }: any) {
  const [open, setOpen] = React.useState(false)
  const R = skin.rows
  const selected = selectedSession === ('boardId' in entry ? entry.localSessionId : entry.sessionId) && page.current() === selectedSession
  const shared = 'boardId' in entry
  const sessionId = shared ? entry.localSessionId : entry.sessionId
  const collaboration = shared && entry.sharingState === 'shared'
  const items = boardEntryActions(entry).map(item => ({ ...item, icon: item.id === 'collaboration' ? boardIcon('people') : h(item.id === 'rename' ? IconEditOutline16 : IconFolderOpenOutline16) }))
  return h('div', { className: ['srb-row', R.sessionRow, !nested && R.flatSessionRowWithoutStatus, selected && R.selected, open && R.menuOpen, marker === 'before' && R.dropBefore, marker === 'after' && R.dropAfter].filter(Boolean).join(' '), 'data-menu-open': open, 'aria-current': selected,
    ...drag, 'data-drop-marker': marker ?? undefined,
    onContextMenu: (event: React.MouseEvent) => { event.preventDefault(); setOpen(true) } },
    nested && h('span', { className: R.slot, 'aria-hidden': true }),
    h('button', { className: R.title + ' srb-board-title', title: entry.title, onClick: safely(page, async () => {
      if (shared) await page.openBoard(entry.boardId)
      else await page.openPersonal(entry.sessionId)
      selectBoardSession(page.current() ?? '')
    }) },
      collaboration && ((entry.memberCount ?? page.getView(sessionId)?.members.length ?? 1) > 1
        ? h('span', { className: 'srb-row-status', title: '多人协作', 'aria-label': '多人协作' }, boardIcon('people'))
        : h('span', { className: 'srb-pending-ring', title: '等待成员接受邀请', 'aria-label': '等待接受邀请' })),
      h('span', null, entry.title)),
    h('span', { className: R.time + ' srb-row-time' }, h(BoardEditTime, { value: time || undefined, editor: shared ? entry.updatedBy?.username : undefined })),
    h('span', { className: R.rowActions + ' srb-row-actions' }, h(Menu, { className: 'srb-navigation-menu', open, onClose: () => setOpen(false), items, portal: true, closeOnPointerLeave: true,
      anchor: h('button', { className: R.iconButton + ' srb-row-more', 'aria-label': entry.title + '，更多', 'aria-haspopup': 'menu', 'aria-expanded': open,
        onClick: (event: React.MouseEvent) => { event.stopPropagation(); setOpen(!open) } }, h(IconEllipsisOutline16)),
    onSelect: (id: string) => {
      setOpen(false)
      if (id === 'rename') renameBoardEntry(page, entry)
      if (id === 'collaboration') {
        if (collaboration) manageBoard(page, entry.boardId, 'members')
        else if (shared) void page.openBoard(entry.boardId).then((id: string) => addBoardCollaborator(page, entry.boardId, id)).catch(page.showError)
        else shareFavorite(page, entry)
      }
      if (id === 'workspace') void page.returnToWorkspace(entry).catch(page.showError)
    }
  })))
}
function renameBoardEntry(page: ResearchBoardsPage, entry: Favorite | BoardSummary) {
  const d = boardDialog(document, '重命名看板')
  const input = document.createElement('input')
  input.value = entry.title
  input.setAttribute('aria-label', '看板名称')
  const label = uiText('label', '名称'); label.append(input)
  const save = boardButton(document, '保存', () => d.run(async () => {
    const title = input.value.trim()
    if (!title) throw Error('请输入看板名称')
    if ('boardId' in entry) await page.call('board.rename', { boardId: entry.boardId, title })
    else {
      await page.renamePersonal(entry.sessionId, title)
      await page.call('favorite.rename', { favoriteId: entry.favoriteId, title })
    }
    d.close()
  }))
  save.className = 'srb-primary'
  d.body.append(label, save)
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
export function shareFavorite(page: ResearchBoardsPage, f: Favorite) {
  const d = boardDialog(document, '创建协作'),
    s = page.getState()
  d.dialog.classList.add('srb-create-collaboration-dialog')
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
    const panel = uiText('div', '', 'srb-info-panel')
    const summary = uiText('div', '', 'srb-capture-summary')
    summary.append(uiText('span', `${capture.nodeCount} 个组件`), uiText('span', `${capture.historyCount} 条已保存对话`), uiText('span', `${(capture.assetBytes / 1024 / 1024).toFixed(1)} MB 资料`))
    panel.append(summary, uiText('p', '成员将共同编辑同一块共享画板。原个人研究独立保留，后续修改互不影响。'))
    const field = uiText('label', '画板名称')
    field.append(name)
    d.body.append(field, panel)
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
      '发送邀请'
    )
  }
  void start()
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
  input.placeholder = '输入 10 位数字 ID'
  input.setAttribute('aria-label', '对方专有 ID')
  input.inputMode = 'numeric'
  const fieldError = uiText('small', '', 'srb-field-error')
  fieldError.id = 'srb-invite-id-error-' + crypto.randomUUID()
  fieldError.setAttribute('role', 'alert')
  fieldError.hidden = true
  const showFieldError = (message: string) => {
    fieldError.textContent = message
    fieldError.hidden = !message
    if (message) {
      input.setAttribute('aria-invalid', 'true')
      input.setAttribute('aria-describedby', fieldError.id)
    } else {
      input.removeAttribute('aria-invalid')
      input.removeAttribute('aria-describedby')
    }
  }
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
  const recipient = document.createElement('div')
  let user: { userId?: string; publicId: string; username: string } | undefined,
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
        await page.openBoard(boardId)
        selectBoardSession(page.current() ?? '')
        d.close()
      },
      boardId ? '发送邀请…' : '上传资料并创建协作副本…'
    )
    send.disabled = false
    if (boardId && send.isConnected) send.textContent = label
  })
  send.disabled = true
  send.className = 'srb-primary'
  input.addEventListener('input', () => {
    lookup++
    showFieldError('')
    user = undefined
    send.disabled = true
    recipient.textContent = ''
  })
  const lookupButton = boardButton(document, '查找并核对', async () => {
    const id = normalizePublicId(input.value),
      turn = ++lookup
    if (!/^\d{10}$/.test(id)) {
      showFieldError('请输入 10 位数字 ID。')
      return
    }
    showFieldError('')
    const found = await d.run(
      () =>
        page.call<{ user: { userId?: string; publicId: string; username: string } }>(
          'user.lookup',
          { publicId: id }
        ),
      '查找用户…'
    )
    if (turn !== lookup || !d.dialog.isConnected) return
    if (!found) {
      showFieldError(d.status.textContent || '暂时无法核对用户，请重试。')
      d.status.textContent = ''
      return
    }
    user = found.user
    const avatar = uiText('div', Array.from(user.username)[0]?.toUpperCase() ?? '', 'srb-member-avatar')
    avatar.style.setProperty('--srb-avatar-background', boardAvatarBackground(user.userId ?? user.publicId, user.userId === page.getState().account.user?.userId))
    const identity = uiText('div', '', 'srb-member-identity')
    identity.append(uiText('strong', user.username), uiText('small', `ID ${publicIdLabel(user.publicId)}`))
    const check = uiText('span', '', 'srb-check-icon')
    check.setAttribute('aria-label', '已核对接收人')
    recipient.replaceChildren(avatar, identity, check)
    send.disabled = false
  })
  const form = document.createElement('section')
  form.className = 'srb-invite-form'
  const field = document.createElement('label')
  const management = d.dialog.classList.contains('srb-management')
  const creation = d.dialog.classList.contains('srb-create-collaboration-dialog')
  field.textContent = management ? '邀请新成员 · 对方专有 ID' : '对方专有 ID'
  const lookupRow = document.createElement('div')
  lookupRow.className = 'srb-field-row'
  lookupRow.append(input, lookupButton)
  field.append(lookupRow, fieldError)
  recipient.className = 'srb-recipient'
  const controls = document.createElement('div')
  controls.className = 'srb-invite-controls'
  const roleLabel = document.createElement('label')
  roleLabel.textContent = management ? '' : '邀请权限'
  roleLabel.append(role)
  controls.append(roleLabel)
  form.append(field, recipient, controls)
  if (creation) form.append(uiText('p', '可编辑成员可拖动、编辑和生成组件；仅查看成员只能浏览。', 'srb-description'))
  if (management) controls.append(send)
  else {
    const actions = uiText('div', '', 'srb-dialog-footer')
    actions.append(boardButton(document, '取消', d.close), send)
    form.append(actions)
  }
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
export function manageBoard(page: ResearchBoardsPage, boardId: string, initialTab: 'members' | 'settings' = 'members') {
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
          manageBoard(page, boardId, initialTab)
        })
      )
      return
    }
    if (!v.permissions.read) {
      d.body.append(uiText('p', '共享访问已结束。', 'srb-description'))
      return
    }
    const intro = uiText('div', '', 'srb-dialog-intro')
    intro.append(uiText('p', v.board.title, 'srb-board-name'))
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
      const selected = initialTab === 'members' ? panel === members : panel === settings
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
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
      panel.hidden = !selected
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
    let memberStructure = ''
    const renderMembers = () => {
      const current = view()
      if (!current?.permissions.read) {
        memberStructure = ''
        members.replaceChildren(
          uiText('p', '共享访问已结束。', 'srb-description')
        )
        settings.replaceChildren()
        return
      }
      const users = boardMembers(current, page.getState().account.user?.userId)
      // Cursor/selection heartbeats must not replace a native select while its
      // menu is open. Presence labels can update without losing focus or scroll.
      const structure = JSON.stringify({
        manage: current.permissions.manage,
        users: users.map(({ userId, username, role, self }) => ({ userId, username, role, self }))
          .sort((a, b) => a.userId.localeCompare(b.userId)),
        pending: current.pendingInvitations ?? []
      })
      if (structure === memberStructure) {
        for (const row of memberList.querySelectorAll<HTMLElement>('[data-member-id]')) {
          const member = users.find((user) => user.userId === row.dataset.memberId)
          if (!member) continue
          row.querySelector<HTMLElement>('.srb-member-avatar')!.dataset.online = String(member.online)
          row.querySelector('small')!.textContent = member.online ? '正在画板中' : '未在当前画板'
        }
        return
      }
      memberStructure = structure
      const scrollTop = memberList.scrollTop
      memberList.replaceChildren()
      pending.replaceChildren()
      memberList.append(uiText('h3', `成员 · ${users.length}`))
      for (const member of users) {
        const row = uiText('div', '', 'srb-member'),
          avatar = uiText(
            'div',
            Array.from(member.username)[0]?.toUpperCase() ?? '',
            'srb-member-avatar'
          )
        row.dataset.memberId = member.userId
        avatar.style.setProperty('--srb-avatar-background', boardAvatarBackground(member.userId, member.userId === page.getState().account.user?.userId))
        avatar.dataset.self = String(member.userId === page.getState().account.user?.userId)
        const online = current.connection === 'online' && current.presence.some((p) => p.userId === member.userId)
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
          row.append(uiText('span', member.role === 'owner' ? '创建者' : member.role === 'editor' ? '可编辑' : '可查看', 'srb-role'))
        memberList.append(row)
      }
      memberList.scrollTop = scrollTop
      if (!current.permissions.manage || !current.pendingInvitations?.length)
        return
      pending.append(
        uiText('h3', `待处理邀请 · ${current.pendingInvitations.length}`)
      )
      for (const invite of current.pendingInvitations) {
        const row = uiText('div', '', 'srb-member')
        const avatar = uiText('div', Array.from(invite.invitee.username)[0]?.toUpperCase() ?? '', 'srb-member-avatar')
        avatar.style.setProperty('--srb-avatar-background', boardAvatarBackground(invite.invitee.userId, invite.invitee.userId === page.getState().account.user?.userId))
        row.append(avatar)
        row.dataset.pendingInvitation = invite.invitationId
        const identity = uiText('div', '', 'srb-member-identity')
        identity.append(
          uiText('strong', invite.invitee.username),
          uiText('small', `等待接受 · ID ${publicIdLabel(invite.invitee.publicId)}`)
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
    const settingsList = uiText('div', '', 'srb-settings-list')
    settings.append(settingsList)
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
      settingsList.append(row)
      if (danger) button.className = 'srb-quiet-danger'
    }
    setting(
      '保存个人副本',
      '保存当前内容，之后独立编辑。',
      boardButton(document, '另存为个人研究', () =>
        d.run(async () => {
          await page.copyPersonal(boardId)
          d.close()
        })
      )
    )
    if (v.permissions.manage) {
      setting(
        '归档画板',
        '所有成员仍可查看，暂时停止编辑。',
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
          : '其他成员立即失去访问权。',
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
      settings.append(uiText('p', '结束共享不删除原个人研究。重新开启时需再次邀请成员。', 'srb-description'))
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
        { className: 'srb-message-author' },
        m.role === 'assistant'
          ? '研究助手' + (m.author?.username ? ' · ' + m.author.username : '')
          : (m.author?.username ?? m.authorName ?? '成员'),
        m.imported ? ' · 复制时的已保存对话' : ''
      ),
      h('div', { className: 'srb-message-body' }, MarkdownText ? h(MarkdownText, { text: m.text }) : h('p', null, m.text))
    )
  const renderControls = (requestId?: string) => {
    const belongs = (id: unknown) =>
      requestId ? id === requestId : !requestIds.has(id)
    const tasks = v.tasks.filter((t: any) => belongs(t.requestMessageId))
    const attempts = requestId ? boardTaskAttempts(tasks) : { current: tasks, previous: [] }
    return h(
      'div',
      { className: 'srb-request-statuses' },
      ...pendingRequests
        .filter((r: any) => belongs(r.requestMessageId))
        .filter((r: any) => r.runtimeState !== 'superseded')
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
            taskFailureMessage(r.failureCode) ?? (r.runtimeState
              ? '执行已中断或结果未确认；不会自动重复调用模型。'
              : '消息已保存，任务尚未启动。'),
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
      ...tasks
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
      ...attempts.current
        .filter(
          (t) => boardTaskStatus(t) && !(['failed', 'interrupted'].includes(t.status) && pendingRequests.some((r: any) => r.taskId === t.taskId && ['interrupted', 'uncertain'].includes(r.runtimeState)))
        )
        .map((t) =>
          h(
            'p',
            { key: t.taskId, className: 'srb-status' },
            boardTaskStatus(t)
          )
        ),
      attempts.previous.length > 0 && h('details', { className: 'srb-attempt-history' },
        h('summary', null, `之前的执行记录（${attempts.previous.length}）`),
        ...attempts.previous.map((t: any) => h('p', { key: t.taskId, className: 'srb-status' },
          Number.isFinite(t.createdAt) && h('time', { dateTime: new Date(t.createdAt).toISOString() }, new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
          boardTaskStatus(t) ?? '研究任务已完成。')))
    )
  }
  return h(
    'div',
    { className: 'srb-discussion' + (!groups.length ? ' srb-discussion-empty' : ''), 'data-shared-discussion': sessionId },
    !groups.length &&
      h('p', { className: 'sRp_emptyState' }, '探索更远，洞见更深'),
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
                } as React.CSSProperties
              },
              h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', 'aria-hidden': true, focusable: false },
                h('path', { d: 'M 3 2 L 13 9 L 8 9.699999809265137 L 5.5 14 L 3 2 Z', fill: 'none', stroke: 'currentColor', strokeWidth: 1.35, strokeLinecap: 'round', strokeLinejoin: 'round' })),
              h('span', null, p.username)
            ),
          ...(p.role !== 'viewer' && v.board.lifecycle === 'active' ? p.selectedIds ?? [] : []).slice(0, 100).map((id) => {
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
                  } as React.CSSProperties
                },
                h('svg', { className: 'srb-occupied-outline', width: n.width * viewport.scale, height: n.height * viewport.scale, 'aria-hidden': true, focusable: false },
                  h('rect', { x: .7, y: .7, width: Math.max(0, n.width * viewport.scale - 1.4), height: Math.max(0, n.height * viewport.scale - 1.4), rx: 9.3, fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeDasharray: '4 4' })),
                h('span', { className: 'srb-occupied-label' }, p.username, '正在编辑')
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
