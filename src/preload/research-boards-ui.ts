import { watchResearchSessionTitle } from './research-session-title'
import { sharedPageContext } from './research-board-page-context'
import { ResearchBoardHeaderMenu } from './research-board-header-menu'
import headerEditLock from '../shared/header-edit-lock.json'
import { HeaderViewModeIcon } from './header-view-mode-icon'
import { mergeSharedCanvas } from './shared-board-canvas-merge'
import { sharedCanvasContent, withSharedCanvasCompatibilityLayout } from '../shared/shared-board-layout'
export { useResearchBoardCanvasHeader } from './research-board-header-menu'
import {waitForMemorySource} from './memory/source'
import {homeGuideMode,installHomeGuideEntryNative,type HomeGuideEntryKind} from './home-guide-entry-native'
import {homeGuideSessionTitle,isHomeGuideSessionTitle} from '../../packages/dsh-research-task-runtime/home-guide-session-titles.js'
import { researchBoardRunning } from './research-board-activity'
import { orderBoardConversationGroups } from './research-board-conversation-order'
import { ResearchBoardTaskProgress, componentTask, taskForMessage } from './research-board-task-progress'
import { TemporaryBoards } from './temporary-board'
import { installBoardSessionFork } from './board-session-fork'
import * as React from 'react'
import { StateDot, Modal, Button, IconTrashOutline16, Menu, IconPlusOutline16, IconEllipsisOutline16, IconSearchOutline16, IconFolderOpenOutline16, IconEditOutline16, IconTriangleRightFill14 } from '@deepseek-ai/dsh-client-ui-primitives'
import { admitSharedDraft } from './shared-send-draft'
import { promoteSidebarOrder } from './sidebar-manual-order'
import {sidebarUsageSnapshot,sidebarUsageTimes,subscribeSidebarUsage} from '../../scripts/lib/sidebar-session-recency.mjs'
import { sidebarSearchResults, showSidebarSessionSearch, type SidebarSearchResult } from './sidebar-session-search'
import { mountSidebarSessionSwitcher } from './sidebar-session-switcher'
import { SidebarRecentSessions, recentSidebarRows, trackSidebarVisits } from './sidebar-recent-sessions'
import { installExploreSearch } from './explore-search'
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
  boardRolePicker,
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
type ComposerModelSnapshot = {
  current: { provider: string; model: string; reasoningEffort?: string } | null
  groups: readonly { id: string; models: readonly { id: string }[] }[]
}
type LegacyNode = Record<string, any>
type Workspace = {
  isCollaborationGesture?(): boolean
  getVisibleBoardSnapshot?(): LegacyNode

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
  getInput?(sessionId:string):any
  composerModel?(sessionId?: string): ComposerModelSnapshot | undefined
  chatStore?:{create(sessionId:string):{actions:{setView(view:string):void}}}
  researchSidebar?: {
    service?: {
      activateTab(tabId: string, scope: {sessionId: string}): void
      setPanelState(patch: {open: boolean}, scope: {sessionId: string}): void
    } | null
  }
  bridge: ResearchBoardsBridge
  slots?: any
  document?: Document
}
export { selectionNodeReady } from './research-board-presentation'
import { boardOnlySession, boardRequestPresentation, boardEditTime, boardTaskStatus, boardTaskAttempts, boardMembers, boardEntryActions, boardAvatarBackground } from './research-board-presentation'
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
const canvasFromSnapshot = (s: LegacyNode): Canvas =>
  structuredClone(sharedCanvasContent({ files: s.files, artifacts: s.artifacts }))
const canvasOf = (w: Workspace): Canvas => canvasFromSnapshot(w.getSnapshot())
const signature = (v: unknown) => JSON.stringify(v)
const canvasSignature = (canvas: Canvas) => {
  const byId = (a: Canvas['artifacts'][number], b: Canvas['artifacts'][number]) => a.id.localeCompare(b.id)
  return signature({ files: [...canvas.files].sort(byId), artifacts: [...canvas.artifacts].sort(byId) })
}
const uuid = () => crypto.randomUUID()
type EditState = {
  accountId: string
  generation: number
  workspace: Workspace
  unsubscribe: () => void
  view: BoardView
  revision: string
  baseCanvas: Canvas
  observed: string
  appliedCanvas?: { revision: string; signature: string }
  applying: boolean
  queued?: Canvas
  remote?: BoardView
  busy: boolean
  paused: boolean
  timer?: ReturnType<typeof setTimeout>
  mutation?: { id: string; canvas: Canvas; base: string; requireLatest?: boolean }
  syncFailure?: CanvasSyncFailure
  retrying?: boolean
}
type CanvasSyncFailure = {
  kind: 'stale' | 'recorded' | 'retry'
  message: string
  dismissed: boolean
}
const canvasErrorCode = (error: unknown) =>
  error instanceof Error && 'code' in error ? error.code : undefined
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
  const researchTitles = new Map<string, () => void>()
  const activations = new Map<string, Promise<void>>()
  const activationErrors = new Map<string, string>()
  const listeners = new Set<() => void>(),
    editors = new Map<string, EditState>(),
    activeResearch = new Set<string>(),
    opening = new Map<string, Promise<string>>(),
    appWorkspaceSessions = new Map<string, Promise<string>>(),
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
        text?: string
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
  let isGuideWorkspaceOriginal = (_id: string): boolean => false
  const notify = () => {
    const hidden = JSON.stringify([
      ...state.favorites.filter(f => f.dedicated && f.pinned !== false && !isGuideWorkspaceOriginal(f.sessionId)).map(f => f.sessionId),
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
  const visits = trackSidebarVisits(doc, current, notify)
  cleanups.push(visits.dispose)
  const view = (id?: string): BoardView | null =>
    id
      ? (editors.get(id)?.view ??
        (state.current?.localSessionId === id ? state.current : null))
      : null
  const isShared = (id: string) => bridge.isSharedSession(id)
  const showError = (error: unknown) => {
    showBoardError(doc, error)
  }
  const temporaryBoards = new TemporaryBoards(deps.sessions.list, async id => {
    const favorite = state.favorites.find(f => f.sessionId === id && f.dedicated)
    if (!favorite || isShared(id)) return
    await call('favorite.remove', { favoriteId: favorite.favoriteId })
    await deps.workspaces.archiveSession(id)
    purge(id)
  }, showError)
  cleanups.push(() => temporaryBoards.dispose())
  const trackTemporary = (id: string) => {
    const session = deps.sessions.binding(id)?.session
    if (session) temporaryBoards.track(id, session, deps.researchWorkspaces.for(id))
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
      e.syncFailure = undefined
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
    // A board activation/state refresh also carries the canvas. Only rebuild the
    // workspace when its authority or content changed. Revision alone is not
    // enough: generation progress is overlaid without a document revision bump.
    const canvas = v.permissions.read ? v.canvas : { files: [], artifacts: [] }
    const remoteSignature = canvasSignature(sharedCanvasContent(canvas))
    if (
      e.appliedCanvas?.revision === v.canvasRevision &&
      e.appliedCanvas.signature === remoteSignature
    ) return
    e.applying = true
    try {
      e.workspace.applyRemoteCanvas(
        canvas,
        { revision: v.canvasRevision }
      )
      e.revision = v.canvasRevision
      e.baseCanvas = canvasOf(e.workspace)
      e.observed = canvasSignature(e.baseCanvas)
      e.appliedCanvas = { revision: v.canvasRevision, signature: remoteSignature }
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
        baseCanvas: sharedCanvasContent(v.canvas),
        observed: canvasSignature(canvasOf(workspace)),
        applying: false,
        busy: false,
        paused: false
      }
      editors.set(v.localSessionId, e)
      const editor = e
      let { files: observedFiles, artifacts: observedArtifacts } = workspace.getSnapshot()
      e.unsubscribe = workspace.subscribe(() => {
        const snapshot = workspace.getSnapshot()
        if (snapshot.files === observedFiles && snapshot.artifacts === observedArtifacts) return
        observedFiles = snapshot.files
        observedArtifacts = snapshot.artifacts
        if (
          editor.applying ||
          editor.generation !== state.account.generation ||
          editor.accountId !== state.account.user?.userId
        ) return
        const next = canvasFromSnapshot(snapshot),
          sig = canvasSignature(next)
        if (sig === editor.observed) return
        // Local edits invalidate the remote-content cache, including held gestures.
        editor.appliedCanvas = undefined
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
    const mutation: NonNullable<EditState['mutation']> = e.mutation ?? {
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
        canvas: mutation.canvas,
        ...(mutation.requireLatest && { requireLatest: true })
      })
      if (
        disposed ||
        state.account.generation !== generation ||
        !e.view.permissions.read ||
        e.mutation !== mutation
      )
        return
      e.mutation = undefined
      e.revision = result.localBranchRevision
      e.baseCanvas = mutation.canvas
      e.syncFailure = undefined
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
      if (disposed || state.account.generation !== generation || e.mutation !== mutation) return
      e.paused = true
      const code = canvasErrorCode(error)
      const dismissed = e.syncFailure?.dismissed ?? false
      if (code === 'STALE_CANVAS_REVISION')
        e.syncFailure = {
          kind: 'stale',
          message: mutation.requireLatest
            ? '同步时看板又有更新。本机修改已保留，请重试。'
            : '共享看板已有更新。本机修改尚未同步。',
          dismissed
        }
      else if (code === 'MUTATION_ALREADY_APPLIED')
        e.syncFailure = { kind: 'recorded', message: '上次修改已记录，需要载入最新看板。', dismissed }
      else
        e.syncFailure = { kind: 'retry', message: '看板修改尚未同步，请稍后重试。', dismissed }
    } finally {
      e.busy = false
      notify()
      if (e.queued && !e.paused) void drain(e)
    }
  }
  async function retryCanvas(id: string, refreshed?: BoardView) {
    const e = editors.get(id)
    const failure = e?.syncFailure
    if (!e || !failure || e.retrying || e.busy || !e.view.permissions.edit || !e.mutation) return
    if (e.workspace.isCollaborationGesture?.()) {
      e.syncFailure = { ...failure, message: '请先完成当前拖动或缩放，再同步看板修改。', dismissed: false }
      notify()
      return
    }
    const mutation = e.mutation
    const { boardId, epoch } = e.view
    const valid = () =>
      !disposed && editors.get(id) === e && e.mutation === mutation &&
      e.generation === state.account.generation && e.accountId === state.account.user?.userId &&
      e.view.epoch === epoch && e.view.permissions.edit
    e.retrying = true
    e.syncFailure = { ...failure, dismissed: false }
    notify()
    try {
      if (failure.kind !== 'retry') {
        const fresh = refreshed ?? await loadLatestCanvas(id, e)
        if (!valid() || !fresh.permissions.edit) return
        if (e.workspace.isCollaborationGesture?.()) {
          e.syncFailure = { ...failure, message: '请先完成当前拖动或缩放，再同步看板修改。', dismissed: false }
          return
        }
        const latest = e.remote && e.remote.seq > fresh.seq ? e.remote : fresh
        // Acknowledged changes are already part of the board's history. Only
        // edits made after that submission should take precedence on retry.
        const base = failure.kind === 'recorded' ? mutation.canvas : e.baseCanvas
        const latestContent = sharedCanvasContent(latest.canvas)
        const merged = mergeSharedCanvas(base, e.queued ?? mutation.canvas, latestContent)
        // Keep the user's draft on screen until the refreshed revision and merge are ready.
        const needsSync = canvasSignature(merged) !== canvasSignature(latestContent)
        e.applying = true
        try {
          e.workspace.applyRemoteCanvas(
            withSharedCanvasCompatibilityLayout(merged, latest.canvas),
            { revision: latest.canvasRevision }
          )
          e.observed = canvasSignature(canvasOf(e.workspace))
        } finally {
          e.applying = false
        }
        e.view = latest
        e.remote = undefined
        e.revision = latest.canvasRevision
        e.baseCanvas = latestContent
        e.appliedCanvas = needsSync
          ? undefined
          : { revision: latest.canvasRevision, signature: canvasSignature(latestContent) }
        e.queued = undefined
        e.mutation = needsSync
          ? { id: uuid(), canvas: merged, base: latest.canvasRevision, requireLatest: true }
          : undefined
        if (!needsSync) {
          e.syncFailure = undefined
          ownRecovery.delete(`canvas:${boardId}`)
        }
      }
      e.paused = false
      await drain(e)
    } catch {
      if (valid())
        e.syncFailure = {
          ...failure,
          message: '未能载入最新看板。本机修改已保留，请稍后重试。',
          dismissed: e.syncFailure?.dismissed ?? false
        }
    } finally {
      e.retrying = false
      notify()
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
      const hints = { cursor: p!.cursor, selectedIds, previews: [] }
      while (new TextEncoder().encode(JSON.stringify(hints)).byteLength > 8192) {
        if (!hints.selectedIds.length) return
        hints.selectedIds.pop()
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
    const canvas = canvasOf(e.workspace)
    const submitted = e.mutation?.canvas ?? e.baseCanvas
    e.queued = canvasSignature(canvas) === canvasSignature(submitted) ? undefined : canvas
    clearTimeout(e.timer)
    if (!e.queued && !e.mutation && !e.busy && e.remote) {
      const remote = e.remote
      e.remote = undefined
      hydrate(e, remote)
      notify()
    } else {
      void drain(e)
    }
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
  const titleWrites = new Set<string>()
  function syncFavoriteTitles() {
    for (const favorite of state.favorites) {
      const title = deps.sessions.list.getSnapshot().byId[favorite.sessionId]?.title?.trim()
      if (!title || deps.sessions.officeDocumentTitle?.(favorite.sessionId) || title === favorite.title || titleWrites.has(favorite.favoriteId)) continue
      titleWrites.add(favorite.favoriteId)
      void call('favorite.rename', { favoriteId: favorite.favoriteId, title })
        .catch(() => {}).finally(() => {
          titleWrites.delete(favorite.favoriteId)
          const latest = deps.sessions.list.getSnapshot().byId[favorite.sessionId]?.title?.trim()
          if (!disposed && latest && latest !== title) syncFavoriteTitles()
        })
    }
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
      visits.selected()
      watchFavoriteDeletion()
      syncFavoriteTitles()
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
    const identityChanged = next.account.generation !== state.account.generation || next.account.user?.userId !== state.account.user?.userId
    if (identityChanged) { guideIdentityRevision++; guideRequests.clear(); guidePendingTitles.clear(); clearGuideModel() }
    if (next.account.generation !== state.account.generation) {
      clearEditors()
      activeSession = null
      activations.clear()
      appWorkspaceSessions.clear()
      activationErrors.clear()
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
    if (identityChanged) for (const id of researchTitles.keys()) stopResearchTitle(id)
    const currentId = current()
    if (currentId && activeResearch.has(currentId)) startResearchTitle(currentId)
    if (state.account.status !== 'loading') { for (const waiter of guideReadyWaiters) waiter.resolve(); guideReadyWaiters.clear() }
    watchFavoriteDeletion()
    if (next.current) acceptView(next.current)
    if (next.account.status === 'signedOut') clearEditors()
    notify()
    // Login retires the host's active board without remounting the selected
    // conversation. Re-enter only a still-selected research session present in
    // this account's fresh directory; activate performs the permission check.
    const selected = current()
    if (
      next.account.status === 'ready' && next.account.user && selected &&
      activeResearch.has(selected) && activeSession !== selected &&
      next.boards.some(board => board.localSessionId === selected)
    ) void activate(selected, true)
  }
  const componentListeners = new Set<(event: any) => void>()
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
    if (event.type === 'component') { for (const listener of componentListeners) listener(event); return }
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
        e.syncFailure = undefined
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
  void bridge.getSnapshot().then(receiveState).catch(error => { for (const waiter of guideReadyWaiters) waiter.reject(error); guideReadyWaiters.clear(); showError(error) })
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
  async function freshBoard(title: string, shared = false) {
    const directory = await call<{ directoryId: string; path: string }>('local.directory', { mode: 'reserve', title, basePath: await defaultDirectory() })
    const id = await deps.sessions.create({ cwd: directory.path })
    if (shared || title !== '新研究看板') await deps.sessions.binding(id)?.session.rename(title)
    await call('local.directory', { mode: 'bind', directoryId: directory.directoryId, sessionId: id })
    if (shared) await call('local.directory', {mode:'ensure',sessionId:id})
    return id
  }
  type GuideKind = HomeGuideEntryKind
  type GuideSession = { kind: GuideKind; sessionId: string; cwd: string; title: string; createdAt: number }
  const guidePrefix = 'sherlock.home-guide.sessions.v1:'
  let guideIdentityRevision = 0
  const guideRecords = new Map<string, GuideSession[]>()
  const guideFlights = new Map<string, Promise<GuideSession>>()
  const guidePendingTitles = new Map<string, {owner:string;generation:number;revision:number;cwd:string;original:string}>()
  cleanups.push(()=>guidePendingTitles.clear())
  // Pre-recorded chat demonstrations borrow the visible picker state only.
  // Do not select a model on the Host or change the user's default.
  const guideModelKey = Symbol.for('sherlock:home-guide-model')
  const pageWindow = win as Window & { [guideModelKey]?: (id: string) => ComposerModelSnapshot | undefined }
  let guideModel: { sessionId: string; snapshot: ComposerModelSnapshot } | undefined
  const readGuideModel = (id: string) => guideModel?.sessionId === id ? guideModel.snapshot : undefined
  const copySelectedGuideModel = (snapshot?: ComposerModelSnapshot): ComposerModelSnapshot | undefined => {
    if (!snapshot?.current) return
    const { current, groups } = snapshot
    if (groups.some(group => group.id === current.provider && group.models.some(model => model.id === current.model)))
      return { current: { ...current }, groups }
  }
  const setGuideModel = (value?: typeof guideModel) => {
    if (guideModel === value) return
    guideModel = value
    win.dispatchEvent(new win.Event('sherlock:home-guide-model-changed'))
  }
  const clearGuideModel = () => setGuideModel()
  const endGuideModel = (event: Event) => {
    const detail = (event as CustomEvent).detail
    if (detail?.ending === true && detail.sessionId === guideModel?.sessionId) clearGuideModel()
  }
  pageWindow[guideModelKey] = readGuideModel
  win.addEventListener('sherlock:home-guide-playback', endGuideModel)
  cleanups.push(() => {
    win.removeEventListener('sherlock:home-guide-playback', endGuideModel)
    if (pageWindow[guideModelKey] === readGuideModel) delete pageWindow[guideModelKey]
    clearGuideModel()
  })
  const guideWorkspaceFlights = new Map<string, { guards: Set<() => void>; promise?: Promise<void> }>()
  let guideSelectedSession = current(), guideSelectionRevision = 0, guideSelectedAttempt = ''
  const guideRequests = new Map<string, { fingerprint: string; promise: Promise<Record<string, unknown>>; owner?: string; generation?: number; revision?: number;cancelled?:boolean;source?:string;selectionRevision?:number }>()
  const guideReadyWaiters = new Set<{ resolve(): void; reject(error: Error): void }>()
  const guideOwner = () => state.account.user?.userId ? 'account:' + state.account.user.userId : 'local'
  const guideStorage = () => {
    const storage = (win as Window & { dshDesktop?: { researchCanvasStorage?: { getItem(key: string): string | null; setItem(key: string, value: string): boolean } } }).dshDesktop?.researchCanvasStorage
    if (!storage?.getItem || !storage?.setItem) throw Error('示例保存服务尚未就绪，请稍后重试。')
    return storage
  }
  const guideRegistry = (owner = guideOwner()): GuideSession[] => {
    const cached = guideRecords.get(owner)
    if (cached) return cached
    const raw = guideStorage().getItem(guidePrefix + encodeURIComponent(owner))
    let entries: GuideSession[] = []
    if (raw) {
      const value = JSON.parse(raw)
      if (value?.version !== 1 || value.scope !== owner || !Array.isArray(value.entries)) throw Error('示例记录暂时无法读取。')
      entries = value.entries.filter((entry: GuideSession) => entry && ['board', 'note', 'ppt', 'report', 'workbench', 'spreadsheet', 'presentation-edit'].includes(entry.kind) && typeof entry.sessionId === 'string' && typeof entry.cwd === 'string' && typeof entry.title === 'string' && Number.isFinite(entry.createdAt))
    }
    guideRecords.set(owner, entries)
    return entries
  }
  const guideSessionAvailable = (entry: GuideSession) => {
    const summary = deps.sessions.list.getSnapshot().byId[entry.sessionId]
    const archived = deps.workspaces.list.getSnapshot().archivedSessionIds ?? []
    return summary && !summary.removed && !summary.subagent && summary.cwd === entry.cwd && !archived.includes(entry.sessionId)
  }
  const guideTitleFlights=new Map<string,Promise<void>>(),guideTitleAttempts=new Set<string>()
  const migrateGuideTitles=(retry=false):Promise<void>=>{
    if(disposed||state.account.status==='loading')return Promise.resolve()
    const owner=guideOwner(),generation=state.account.generation,revision=guideIdentityRevision,key=JSON.stringify([owner,generation,revision])
    const previous=guideTitleFlights.get(key);if(previous)return previous
    const valid=()=>{if(disposed||owner!==guideOwner()||generation!==state.account.generation||revision!==guideIdentityRevision)throw Error('账号或页面已变化，未更新示例名称。')}
    const work=(async()=>{
      for(const entry of guideRegistry(owner)){
        valid();if(!guideSessionAvailable(entry))continue
        const summary=()=>deps.sessions.list.getSnapshot().byId[entry.sessionId]
        const rootSession=()=>!summary()?.parentId&&summary()?.origin!=='subagent'
        if(!rootSession())continue
        const oldTitle=entry.title,title=homeGuideSessionTitle(entry.kind)
        if(!isHomeGuideSessionTitle(entry.kind,oldTitle)||oldTitle===title)continue
        if(summary()?.title!==oldTitle&&summary()?.title!==title)continue
        const binding=deps.sessions.binding(entry.sessionId)
        // Native rename settles this projection before the list's next frame.
        const actualTitle=()=>binding?.session?.projections?.faceOf?.('title')?.getSnapshot?.()??summary()?.title
        if(actualTitle()!==oldTitle&&actualTitle()!==title)continue
        const attempt=JSON.stringify([key,entry.sessionId,entry.cwd,oldTitle]);if(!retry&&guideTitleAttempts.has(attempt))continue
        guideTitleAttempts.add(attempt)
        if(actualTitle()===oldTitle){
          if(!binding?.session?.rename)throw Error('示例会话尚未就绪。')
          const result=await binding.session.rename(title);valid()
          if(result?.ok!==true)throw Error(result?.error?.message||'示例名称保存失败。')
        }
        valid();if(!guideSessionAvailable(entry)||!rootSession()||actualTitle()!==title)continue
        const latest=guideRegistry(owner),index=latest.findIndex(row=>row.sessionId===entry.sessionId&&row.cwd===entry.cwd&&row.title===oldTitle)
        if(index<0)continue
        const next=latest.map((row,i)=>i===index?{...row,title}:row)
        if(guideStorage().setItem(guidePrefix+encodeURIComponent(owner),JSON.stringify({version:1,scope:owner,entries:next}))!==true)throw Error('示例名称已更新，注册记录尚未保存，请重试。')
        guideRecords.set(owner,next);notify()
      }
    })()
    guideTitleFlights.set(key,work);void work.finally(()=>{if(guideTitleFlights.get(key)===work)guideTitleFlights.delete(key)}).catch(()=>{})
    return work
  }
  let guideTitleScheduled=false
  const scheduleGuideTitles=()=>{
    if(disposed||guideTitleScheduled||state.account.status==='loading')return
    guideTitleScheduled=true
    win.queueMicrotask(()=>{guideTitleScheduled=false;if(!disposed)void migrateGuideTitles().catch(()=>{})})
  }
  listeners.add(scheduleGuideTitles);cleanups.push(()=>{listeners.delete(scheduleGuideTitles);guideTitleAttempts.clear()})
  scheduleGuideTitles()
  const getHomeGuideSession = (id: string): GuideSession | undefined => {
    if (disposed || state.account.status === 'loading') return
    try { return guideRegistry().find(entry => entry.sessionId === id && guideSessionAvailable(entry)) } catch { return }
  }
  const whenHomeGuideSessionsReady = () => {
    if (disposed) return Promise.reject(Error('示例页面已关闭。'))
    if (state.account.status !== 'loading') return Promise.resolve()
    return new Promise<void>((resolve, reject) => guideReadyWaiters.add({ resolve, reject }))
  }
  const guideWorkspaceKey = (entry: GuideSession) => JSON.stringify([guideOwner(), state.account.generation, guideIdentityRevision, entry.sessionId, entry.cwd])
  const hasGuideWorkspace = (entry: GuideSession) => deps.workspaces.list.getSnapshot().items.some((workspace: { workspaceId?: string; path?: string; sessionIds?: readonly string[] }) => workspace.workspaceId && workspace.path === entry.cwd && workspace.sessionIds?.includes(entry.sessionId))
  // A registered guide is the original usable Workspace session, even when its
  // canvas also has a dedicated board entry. Independent board copies and shared
  // local mirrors retain the ordinary hiding policy; no persisted role is changed.
  isGuideWorkspaceOriginal = id => {
    const entry = getHomeGuideSession(id)
    const summary = deps.sessions.list.getSnapshot().byId[id]
    return !!entry && (entry.kind === 'board' || entry.kind === 'workbench') &&
      !summary?.parentId && summary?.origin !== 'subagent' && !isShared(id) && hasGuideWorkspace(entry)
  }
  const ensureGuideWorkspace = async (entry: GuideSession, valid: () => void) => {
    valid()
    if (!guideSessionAvailable(entry)) throw Error('示例会话已变化，请重新打开。')
    if (hasGuideWorkspace(entry)) return
    const key = guideWorkspaceKey(entry)
    let flight = guideWorkspaceFlights.get(key)
    if (!flight) { flight = { guards: new Set() }; guideWorkspaceFlights.set(key, flight) }
    flight.guards.add(valid)
    if (!flight.promise) {
      const record = flight
      const check = () => {
        if (!guideSessionAvailable(entry)) throw Error('示例会话已变化，请重新打开。')
        // A prepare request and a direct revisit may share the Host operation.
        // Continue only while at least one requester still owns its context.
        for (const guard of record.guards) { try { guard(); return } catch {} }
        throw Error('账号或页面已变化，请重新打开示例。')
      }
      record.promise = (async () => {
        check()
        if (!deps.workspaces.create || !deps.workspaces.api?.sessions?.create) throw Error('示例工作区服务尚未就绪，请稍后重试。')
        // The Host resolves an existing canonical path before creating a Workspace.
        const workspace = await deps.workspaces.create({ path: entry.cwd }); check()
        if (!workspace || typeof workspace.workspaceId !== 'string' || !workspace.workspaceId || workspace.path !== entry.cwd) throw Error('示例工作区目录不一致，请重新打开示例。')
        if (!Array.isArray(workspace.sessionIds) || !workspace.sessionIds.includes(entry.sessionId)) {
          // Reuse the same Agent without SessionRuntime.create's blank-summary upsert.
          const reply = await deps.workspaces.api.sessions.create({ workspaceId: workspace.workspaceId, sessionId: entry.sessionId }); check()
          if (!reply?.result?.ok || reply.result.value?.sessionId !== entry.sessionId) throw Error('示例会话工作区绑定失败，请稍后重试。')
        }
        await deps.workspaces.refresh?.(); check()
      })().finally(() => { if (guideWorkspaceFlights.get(key) === record) guideWorkspaceFlights.delete(key) })
    }
    try { await flight.promise; valid() } finally { flight.guards.delete(valid) }
  }
  const repairSelectedGuideWorkspace = () => {
    const selected = current()
    if (guideSelectedSession !== selected) { guideSelectedSession = selected; guideSelectionRevision++; guideSelectedAttempt = '' }
    const entry = selected && getHomeGuideSession(selected)
    if (!entry || hasGuideWorkspace(entry)) return
    const owner = guideOwner(), generation = state.account.generation, identityRevision = guideIdentityRevision, selectionRevision = guideSelectionRevision
    const key = JSON.stringify([guideWorkspaceKey(entry), selectionRevision])
    if (guideSelectedAttempt === key) return
    guideSelectedAttempt = key
    const valid = () => {
      if (disposed || guideOwner() !== owner || state.account.generation !== generation || guideIdentityRevision !== identityRevision || current() !== selected || guideSelectionRevision !== selectionRevision) throw Error('账号或页面已变化，请重新打开示例。')
    }
    void ensureGuideWorkspace(entry, valid).then(() => { try { valid(); notify() } catch {} }, () => {})
  }
  listeners.add(repairSelectedGuideWorkspace)
  cleanups.push(() => listeners.delete(repairSelectedGuideWorkspace), deps.workspaces.list.subscribe(() => { repairSelectedGuideWorkspace(); notify() }))
  const prepareHomeGuideSession = async (kind: GuideKind, replay: boolean, requester?:{check():void;runId?:string}) => {
    requester?.check()
    await whenHomeGuideSessionsReady()
    const owner = guideOwner(), generation = state.account.generation, identityRevision = guideIdentityRevision
    const valid = () => {
      requester?.check()
      if (disposed || guideOwner() !== owner || state.account.generation !== generation || identityRevision !== guideIdentityRevision) throw Error('账号或页面已变化，请重新打开示例。')
    }
    valid()
    if(!requester?.runId){await migrateGuideTitles(true);valid()}
    const records = guideRegistry(owner)
    const previous = !replay && [...records].reverse().find(entry => entry.kind === kind && guideSessionAvailable(entry))
    const key = JSON.stringify([owner, generation, identityRevision, kind, replay,requester?.runId??null])
    let flight = guideFlights.get(key)
    if (!flight) {
      flight = (async () => {
        if (previous) { await ensureGuideWorkspace(previous, valid); return previous }
        const sourceSession = current()
        let sourceModel: ComposerModelSnapshot | undefined
        if (kind === 'ppt' || kind === 'report' || kind === 'presentation-edit' || kind === 'workbench') {
          sourceModel = copySelectedGuideModel((sourceSession ? readGuideModel(sourceSession) : undefined) ?? deps.composerModel?.(sourceSession))
          if (sourceSession && !sourceModel) sourceModel = copySelectedGuideModel(deps.composerModel?.())
        }
        const title = homeGuideSessionTitle(kind,replay)
        const basePath = await defaultDirectory(); valid()
        const directory = await call<{ directoryId: string; path: string }>('local.directory', { mode: 'reserve', title, basePath }); valid()
        const sessionId = await deps.sessions.create({ cwd: directory.path }); valid()
        const binding = deps.sessions.binding(sessionId)
        if (!binding?.session?.rename) throw Error('示例会话尚未就绪，请稍后重试。')
        const original=binding.session.projections?.faceOf?.('title')?.getSnapshot?.()??deps.sessions.list.getSnapshot().byId[sessionId]?.title??''
        const placeholder=doc.documentElement.dataset.odysseyLocale==='en'?{board:'New Research',workbench:'New Research',note:'New Note',ppt:'New Session',report:'New Session',spreadsheet:'New Spreadsheet','presentation-edit':'New Presentation'}[kind]:{board:'新研究',workbench:'新研究',note:'新笔记',ppt:'新会话',report:'新会话',spreadsheet:'新表格','presentation-edit':'新演示'}[kind]
        // Native summaries otherwise fall back to the reserved directory name
        // as soon as composing begins. Keep the normal empty-session label.
        if(!original.trim()){
          const renamed=await binding.session.rename(placeholder);valid()
          if(renamed?.ok!==true)throw Error(renamed?.error?.message||'示例名称保存失败。')
        }
        if(!original.trim()||original===placeholder)guidePendingTitles.set(sessionId,{owner,generation,revision:identityRevision,cwd:directory.path,original:placeholder})
        await call('local.directory', { mode: 'bind', directoryId: directory.directoryId, sessionId }); valid()
        await call('local.directory', { mode: 'ensure', sessionId }); valid()
        const entry: GuideSession = { kind, sessionId, cwd: directory.path, title, createdAt: Date.now() }
        await ensureGuideWorkspace(entry, valid); valid()
        if (kind === 'board' || kind === 'workbench') {
          const value = identity(sessionId)
          if (!value) throw Error('示例看板尚未就绪。')
          await call('favorite.add', { identity: { ...value, title }, dedicated: true }); valid()
          temporaryBoards.keep(sessionId)
        }
        // History is not an in-flight quota. Keep archived/offline records;
        // the main-process schema and byte limit bound durable storage.
        const latest = guideRegistry(owner)
        const next = [...latest, entry]
        if (guideStorage().setItem(guidePrefix + encodeURIComponent(owner), JSON.stringify({ version: 1, scope: owner, entries: next })) !== true) throw Error('示例保存失败，已创建的会话仍保留在本地。')
        guideRecords.set(owner, next)
        if (sourceModel) setGuideModel({ sessionId, snapshot: sourceModel })
        notify()
        return entry
      })()
      guideFlights.set(key, flight)
      void flight.finally(() => { if (guideFlights.get(key) === flight) guideFlights.delete(key) }).catch(() => {})
    }
    const entry = await flight; valid()
    return { ...entry, fresh: !previous }
  }
  const openHomeGuideSession = (kind: GuideKind, sessionId: string, check: () => void) => {
    const view = homeGuideMode(kind)
    check()
    deps.chatStore?.create(sessionId).actions.setView(view)
    check()
    // Images reconciles its task tabs synchronously on session selection.
    // Release the source surface before its listener sees the guide's session.
    doc.dispatchEvent(new win.CustomEvent('sherlock:sidebar-document-will-open', { detail: { view } }))
    check()
    navigation++
    deps.sessions.open(sessionId)
  }
  const configureHomeGuideConversation = (kind: GuideKind, sessionId: string) => {
    const service = deps.researchSidebar?.service
    const scope = { sessionId }
    const open = homeGuideMode(kind) !== 'chat'
    if (open) service?.activateTab('sherlock-research-conversation', scope)
    service?.setPanelState({ open }, scope)
  }
  const receiveHomeGuideSession = (event: Event) => {
    const request = (event as CustomEvent).detail
    if (disposed || !request || Array.isArray(request) || typeof request.requestId !== 'string' || !request.requestId || request.requestId.length > 200) return
    const { requestId, kind, command } = request
    if(command==='cancel'){const prior=guideRequests.get(requestId);if(prior)prior.cancelled=true;return}
    const reply = (value: Record<string, unknown>, record?: { owner?: string; generation?: number; revision?: number }) => {
      if (disposed) return
      const stale = value.ok === true && record && (record.owner !== guideOwner() || record.generation !== state.account.generation || record.revision !== guideIdentityRevision)
      win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-session-reply', { detail: { requestId, ...(stale ? { ok: false, message: '账号或页面已变化，请重新打开示例。' } : value) } }))
    }
    if (!['board','note','ppt','report','workbench','spreadsheet','presentation-edit'].includes(kind) || !['prepare','open','activate-title'].includes(command) || Object.keys(request).some(key => !['requestId','kind','command','replay','sessionId'].includes(key)) || request.replay !== undefined && typeof request.replay !== 'boolean' || command !== 'prepare' && (typeof request.sessionId !== 'string' || !request.sessionId)) { reply({ ok: false, message: '示例请求无效，请重新打开。' }); return }
    const fingerprint = JSON.stringify([kind, command, request.replay === true, request.sessionId])
    const prior = guideRequests.get(requestId)
    if (prior) { if (prior.fingerprint !== fingerprint) reply({ ok: false, message: '示例请求标识已使用。' }); else void prior.promise.then(value => reply(value, prior)); return }
    const record = { fingerprint, promise: undefined as unknown as Promise<Record<string, unknown>>, owner: undefined as string | undefined, generation: undefined as number | undefined, revision: undefined as number | undefined,cancelled:false,source:current(),selectionRevision:guideSelectionRevision }
    const valid=()=>{if(disposed||record.cancelled||current()!==record.source||guideSelectionRevision!==record.selectionRevision||record.owner!==undefined&&(record.owner!==guideOwner()||record.generation!==state.account.generation||record.revision!==guideIdentityRevision))throw Error('账号或页面已变化，请重新打开示例。')}
    const promise = (async () => {
      valid()
      await whenHomeGuideSessionsReady()
      valid()
      record.owner = guideOwner(); record.generation = state.account.generation; record.revision = guideIdentityRevision
      if (command === 'prepare') { const entry = await prepareHomeGuideSession(kind, request.replay === true,{check:valid});valid(); return { ok: true, sessionId: entry.sessionId, cwd: entry.cwd, title: entry.title, fresh: entry.fresh } }
      const owner = guideOwner(), generation = state.account.generation, origin = current(), identityRevision = guideIdentityRevision
      await whenHomeGuideSessionsReady()
      valid()
      if (disposed || owner !== guideOwner() || generation !== state.account.generation || current() !== origin || identityRevision !== guideIdentityRevision) throw Error('账号或页面已变化，请重新打开示例。')
      const entry = getHomeGuideSession(request.sessionId)
      if (!entry || entry.kind !== kind) throw Error('该示例不属于当前账号，或会话已移除。')
      if(command==='activate-title'){
        if(origin!==entry.sessionId)throw Error('当前示例会话已变化，未更新名称。')
        const pending=guidePendingTitles.get(entry.sessionId),binding=deps.sessions.binding(entry.sessionId)
        const actualTitle=()=>binding?.session?.projections?.faceOf?.('title')?.getSnapshot?.()??deps.sessions.list.getSnapshot().byId[entry.sessionId]?.title??''
        if(pending&&pending.owner===owner&&pending.generation===generation&&pending.revision===identityRevision&&pending.cwd===entry.cwd){
          // Only the native title captured at creation is ours to replace.
          // A user's later title wins, including a name changed during entry.
          if(actualTitle()===pending.original){
            valid()
            const renamed=await binding?.session?.rename(entry.title)
            valid()
            if(renamed?.ok!==true)throw Error(renamed?.error?.message||'示例名称保存失败。')
          }
          if(disposed||owner!==guideOwner()||generation!==state.account.generation||identityRevision!==guideIdentityRevision||current()!==origin||!guideSessionAvailable(entry))throw Error('账号或页面已变化，未更新示例名称。')
          guidePendingTitles.delete(entry.sessionId)
        }
        return {ok:true,sessionId:entry.sessionId,cwd:entry.cwd,title:entry.title}
      }
      openHomeGuideSession(kind, entry.sessionId, valid)
      configureHomeGuideConversation(kind, entry.sessionId)
      if (kind === 'board' || kind === 'workbench') selectBoardSession(entry.sessionId)
      return { ok: true, sessionId: entry.sessionId, cwd: entry.cwd, title: entry.title, fresh: false }
    })().catch(error => ({ ok: false, message: error instanceof Error ? error.message : '示例暂时无法打开，请稍后重试。' }))
    record.promise = promise
    guideRequests.set(requestId, record)
    if (guideRequests.size > 128) guideRequests.delete(guideRequests.keys().next().value!)
    void promise.then(value => reply(value, record))
  }
  cleanups.push(installHomeGuideEntryNative({
    document:doc,
    context:()=>{
      const sessionId=current(),summary=sessionId?deps.sessions.list.getSnapshot().byId[sessionId]:undefined,binding=sessionId?deps.sessions.binding(sessionId):undefined
      return{owner:guideOwner(),generation:state.account.generation,identityRevision:guideIdentityRevision,sessionId,selectionRevision:guideSelectionRevision,input:sessionId?(deps.getInput?deps.getInput(sessionId):deps.inputHub.shells.get(sessionId)):undefined,eligible:state.account.status!=='loading'&&(!sessionId||!!summary&&!summary.removed&&!summary.subagent&&!summary.parentId&&summary.origin!=='subagent'&&binding?.kind!=='subagent')}
    },
    subscribe:listener=>{listeners.add(listener);const off=deps.sessions.list.subscribe(listener);return()=>{listeners.delete(listener);off()}},
    prepare:(kind,runId,check)=>prepareHomeGuideSession(kind,true,{check,runId}),
    open:(entry,kind,check)=>{
      check();const registered=getHomeGuideSession(entry.sessionId)
      if(!registered||registered.kind!==kind||registered.cwd!==entry.cwd||!deps.chatStore)throw Error('原生示例入口已变化。')
      openHomeGuideSession(kind, entry.sessionId, check)
      check();configureHomeGuideConversation(kind, entry.sessionId)
      if(kind==='board'||kind==='workbench')selectBoardSession(entry.sessionId)
    }
  }))

  function waitForBoardSession(id: string) {
    const list = deps.sessions.list.getSnapshot()
    // A native starter session can reach the personal list just before its host event.
    if (!list.byId[id] && (list.phase === 'pending' || state.favorites.some(f => f.dedicated && f.sessionId === id))) {
      return deps.sessions.refresh().then(() => {
        const refreshed = deps.sessions.list.getSnapshot()
        if (refreshed.phase === 'pending' && !refreshed.byId[id]) throw Error('会话列表加载失败，请重试。')
      })
    }
  }

  const missingSession = (id: string) => {
    const list = deps.sessions.list.getSnapshot()
    return list.phase === 'ready' && (!list.byId[id] || !!list.byId[id].removed)
  }

  const selectionIntent = () => typeof deps.sessions.selectionIntent === 'function' ? deps.sessions.selectionIntent() : current()
  async function openBoard(boardId: string) {
    const turn = ++navigation, generation = state.account.generation, selected = selectionIntent()
    const stillOpening = () => !disposed && turn === navigation && generation === state.account.generation && selected === selectionIntent()
    // The account-scoped directory already identifies pinned local sessions.
    // Wait for the native catalog before opening a cached local session.
    const known = state.account.status === 'ready' && state.account.user &&
      state.boards.find(board => board.boardId === boardId && board.pinned && board.localSessionId)
    const knownSession = known && known.localSessionId
    if (knownSession) {
      const loading = waitForBoardSession(knownSession)
      if (loading) {
        await loading
        if (!stillOpening()) return knownSession
      }
      if (!missingSession(knownSession)) {
        prime(knownSession)
        deps.sessions.open(knownSession)
        selectBoardSession(knownSession)
        await activate(knownSession, true)
        if (!disposed && generation === state.account.generation && current() === knownSession && !activationErrors.has(knownSession))
          await call('local.directory', { mode: 'ensure', sessionId: knownSession })
        return knownSession
      }
    }
    let pending = opening.get(boardId)
    if (!pending) {
      pending = (async () => {
        type OpenedBoard = {
          localSessionId?: string
          reservationId?: string
          title: string
        }
        const missingLocalSessionId = knownSession && missingSession(knownSession) ? knownSession : undefined
        let opened = await call<OpenedBoard>('board.open', { boardId, ...(missingLocalSessionId && { missingLocalSessionId }) })
        if (opened.localSessionId) await waitForBoardSession(opened.localSessionId)
        if (opened.localSessionId && missingSession(opened.localSessionId) && opened.localSessionId !== missingLocalSessionId)
          opened = await call<OpenedBoard>('board.open', { boardId, missingLocalSessionId: opened.localSessionId })
        if (opened.localSessionId) { await call('local.directory',{mode:'ensure',sessionId:opened.localSessionId}); return opened.localSessionId }
        const id = await freshBoard(opened.title, true)
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
      if (disposed || turn !== navigation || generation !== state.account.generation || ![selected, id].includes(selectionIntent())) return id
      prime(id)
      deps.sessions.open(id)
      selectBoardSession(id)
      await activate(id, true)
      return id
    } finally {
      if (opening.get(boardId) === pending) opening.delete(boardId)
    }
  }
  function stopResearchTitle(id: string) {
    researchTitles.get(id)?.()
    researchTitles.delete(id)
  }
  function startResearchTitle(id: string) {
    if (researchTitles.has(id) || state.account.status === 'loading' || isShared(id) || getHomeGuideSession(id)) return
    const generation = state.account.generation, accountId = state.account.user?.userId
    const workspace = deps.researchWorkspaces.for(id)
    const eligible = () => !disposed && generation === state.account.generation && accountId === state.account.user?.userId && !isShared(id) && !getHomeGuideSession(id)
    researchTitles.set(id, watchResearchSessionTitle(win, id, {
      subscribe: listener => workspace.subscribe(listener),
      getSnapshot: () => {
        const { files, artifacts } = workspace.getSnapshot()
        return { files: files ?? [], artifacts: artifacts ?? [] }
      }
    }, eligible))
  }
  cleanups.push(() => { for (const id of researchTitles.keys()) stopResearchTitle(id) })
  async function activate(id: string, active: boolean) {
    if (active) {
      activeResearch.add(id)
      startResearchTitle(id)
    } else {
      stopResearchTitle(id)
      activeResearch.delete(id)
      if (activeSession !== id) {
        notify()
        return
      }
    }
    const wanted = active && isShared(id) ? id : null
    // The active research intent survives logout; reads wait for fresh identity.
    if (wanted && (state.account.status !== 'ready' || !state.account.user)) {
      notify()
      return
    }
    if (activeSession === wanted) {
      notify()
      return wanted ? activations.get(wanted) : undefined
    }
    if (activeSession) clearPresence(activeSession)
    activeSession = wanted
    const turn = ++navigation
    const generation = state.account.generation, accountId = state.account.user?.userId
    const valid = () => !disposed && turn === navigation &&
      generation === state.account.generation && accountId === state.account.user?.userId
    if (wanted) activationErrors.delete(wanted)
    // Publish loading before IPC. Repeated activations share this flight;
    // stale replies cannot clear a newer board's loading UI.
    let complete!: () => void
    const pending = new Promise<void>(resolve => { complete = resolve })
    if (wanted) activations.set(wanted, pending)
    notify()
    void (async () => {
      try {
        const v = await call<BoardView | null>('board.activate', {
          localSessionId: wanted
        })
        if (valid() && v) acceptView(v)
      } catch (error) {
        if (valid() && wanted) {
          activeSession = null
          activationErrors.set(wanted, (error as Error).message)
          const e = editors.get(wanted)
          if (e) {
            e.workspace.setCollaborationAccess(false)
          }
        }
      } finally {
        if (wanted && activations.get(wanted) === pending) activations.delete(wanted)
        complete()
        if (!disposed) notify()
      }
    })()
    await pending
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

  async function loadLatestCanvas(id: string, e: EditState) {
    const { boardId, epoch } = e.view
    const fresh = await call<BoardView>('canvas.refresh', { boardId, localSessionId: id })
    if (
      disposed || editors.get(id) !== e || e.generation !== state.account.generation ||
      e.accountId !== state.account.user?.userId || fresh.boardId !== boardId ||
      fresh.localSessionId !== id || fresh.epoch !== epoch || e.view.epoch !== epoch ||
      !fresh.permissions.read || !e.view.permissions.read
    ) throw Error('看板访问权限已变化，请重新打开看板。')
    return e.view.seq > fresh.seq ? e.view : fresh
  }

  async function refreshCanvas(id: string) {
    const e = editors.get(id)
    if (!e?.view.permissions.read) throw Error('协作看板暂时不可用，请重新打开看板。')
    const fresh = await loadLatestCanvas(id, e)
    hydrate(e, fresh)
    notify()
    if (e.view.permissions.edit) await flushCanvas(id, { recover: true, refreshed: fresh })
  }

  async function flushCanvas(sessionId: string, { recover = false, refreshed }: { recover?: boolean; refreshed?: BoardView } = {}) {
    const e = editors.get(sessionId)
    if (!e || !e.view.permissions.edit) throw Error('当前画板不可编辑')
    if (e.workspace.isCollaborationGesture?.())
      throw Error('请先完成当前拖动或缩放')
    const until = Date.now() + 30000
    let attempted = false
    const active = () => !disposed && editors.get(sessionId) === e &&
      e.generation === state.account.generation && e.accountId === state.account.user?.userId &&
      e.view.permissions.edit
    while (e.busy || e.retrying || e.queued || e.mutation || e.view.pendingCount) {
      if (!active() || Date.now() > until)
        throw Error('画板更改尚未确认')
      if (e.paused && !e.retrying) {
        if (!recover || attempted || !e.syncFailure || !e.mutation)
          throw Error(e.syncFailure?.message ?? '画板更改尚未确认')
        attempted = true
        await retryCanvas(sessionId, refreshed)
      } else if (!e.busy && !e.retrying && (e.queued || e.mutation)) await drain(e)
      await new Promise((r) => setTimeout(r, 20))
    }
    if (!active()) throw Error('看板访问权限已变化，请重新打开看板。')
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
    mode: string,
    retryDraft?: string,
    inspectReferences = context.scope === 'references'
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
    if (!text.trim() && !imageIds.length) {
      if (mode === 'steer') {
        const own = v.tasks.filter((t: any) => t.conversation && t.status === 'pending' && t.initiatorId === state.account.user?.userId)
          .sort((a: any, b: any) => (b.queueOrder ?? b.createdAt ?? 0) - (a.queueOrder ?? a.createdAt ?? 0))
        for (const task of own) {
          try { await call('queue.promote', { boardId: v.boardId, taskId: task.taskId }) } catch (error) { showError(error); break }
        }
      }
      return
    }
    if (imageIds.length) {
      shell?.notify('error', '请先将图片加入共享画板后引用，输入已保留。')
      return
    }
    const workspace = deps.researchWorkspaces.for(sessionId)
    context = sharedPageContext(workspace, context)
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
      submitShared(sessionId, text, context, imageIds, mode, retryDraft ?? draft, inspectReferences)
    request.text = text
    request.busy = true
    notify()
    const generation = state.account.generation
    const admitted = retryDraft !== undefined && retryDraft !== draft
      ? { untouched: () => false, restore: () => false }
      : admitSharedDraft(shell)
    const restoreInput = () => {
      if (generation === state.account.generation && deps.inputHub.shells.get(sessionId) === shell) admitted.restore()
    }
    saveDraft(sessionId, draft)
    shell?.setResearchContextPreparing?.(true)
    try {
      const inspect = (win as any).dshDesktop?.researchLinkFrame?.inspect
      if (inspect && inspectReferences && context.references.length) {
        await Promise.all(context.references.filter(ref => ref.collection === 'artifacts').map(async ref => {
          const node = workspace.getSnapshot().artifacts.find((n: LegacyNode) => n.id === ref.nodeId)
          if (node?.kind !== 'web-link' || new URL(node.url).hostname === 'mp.weixin.qq.com') return
          const inspection = await inspect({ sessionId, nodeId: node.id })
          if (!inspection?.sourceText?.trim()) throw Error(`无法读取「${node.title}」的当前网页正文，请等待页面加载完成后重试。`)
          if (workspace.getSnapshot().artifacts.find((n: LegacyNode) => n.id === node.id)?.url !== node.url) throw Error('网页来源已变化，请重新选择。')
          workspace.applyWebLinkInspection(node.id, node.url, inspection)
        }))
      }
      const selectedIds = inspectReferences
        ? context.references.map(ref => ref.nodeId)
        : workspace.getSnapshot().selection.selectedNodeIds
      await (win as any).dshDesktop?.researchCanvasActions?.bind({ sessionId, selectedIds })
      const current = await flushCanvas(sessionId, { recover: true })
      if (generation !== state.account.generation) return
      if (!current.permissions.execute || current.boardId !== v.boardId || current.epoch !== v.epoch)
        throw Error('看板当前无法发送消息，输入已保留。')
      const reply = await call<RequestReply>('request.submit', {
        boardId: current.boardId,
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
        if (admitted.untouched()) saveDraft(sessionId, '')
        if (mode === 'steer' && reply.taskId) await call('queue.promote', { boardId: v.boardId, taskId: reply.taskId }).catch(showError)
        if (reply.state === 'taskCreateFailed')
          shell.notify(
            'error',
            reply.error?.message ??
              '消息已发送，研究任务尚未启动；可重试该任务。'
          )
      } else { restoreInput(); shell?.notify('error', '请求尚未确认，输入已保留。') }
    } catch (error) {
      restoreInput()
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
  if (typeof deps.sessions.fork === 'function') {
    cleanups.push(installBoardSessionFork(deps.sessions as PageDependencies['sessions'] & { fork(input: { sessionId: string; atSeq?: number; increaseTitle?: boolean }): Promise<string> },
      id => boardOnlySession(state, id),
      id => call('local.directory', { mode: 'fork', sessionId: id }),
      async () => { await deps.workspaces.refresh(); selectBoardSession('') }))
  }
  const visibleBoardState = () => {
    const pending = !!deps.sessions.officeSessionHidden && deps.sessions.list.getSnapshot().phase === 'pending'
    const favorites = state.favorites.filter(f => !pending && !deps.sessions.officeSessionHidden?.(f.sessionId)).map(f => {
      const title = deps.sessions.officeDocumentTitle?.(f.sessionId)
      return title && title !== f.title ? {...f, title} : f
    })
    return favorites.length === state.favorites.length && favorites.every((f, index) => f === state.favorites[index])
      ? state : {...state, favorites}
  }
  const api = {
    subscribeComponent(fn: (event: any) => void) { componentListeners.add(fn); return () => { componentListeners.delete(fn) } },
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    version: () => revision,
    getState: visibleBoardState,
    getView: view,
    collaborativeBoard: (id: string) => state.boards.find(board => board.localSessionId === id),
    workspaceFor: (id: string) => deps.researchWorkspaces.for(id),
    identity,
    subscribeActivity(id: string, listener: () => void) {
      const offList = deps.sessions.list.subscribe(listener)
      const offWorkspace = deps.researchWorkspaces.for(id).subscribe(listener)
      return () => { offList(); offWorkspace() }
    },
    isRunning(id: string) {
      return researchBoardRunning(deps.sessions.list.getSnapshot().byId, id, deps.researchWorkspaces.for(id).getSnapshot().artifacts)
    },
    editedAt: (id: string) =>
      deps.sessions.list.getSnapshot().byId[id]?.updatedAt as
        number | undefined,
    current,
    sidebarWorkspaces: () => deps.workspaces.list.getSnapshot().items,
    recentSessions(english: boolean) {
      const sessions = deps.sessions.list.getSnapshot(), workspace = deps.workspaces.list.getSnapshot()
      const workspaceRows = (win as any).__sherlockWorkspaceSidebarSkin?.recentWorkspaceSessions?.(sessions, workspace, english) ?? []
      const excluded = new Set<string>(workspace.archivedSessionIds)
      return recentSidebarRows(visibleBoardState(), workspaceRows,
        id => excluded.has(id) || !!sessions.byId[id]?.removed || !!deps.sessions.officeSessionHidden?.(id),
        id => sessions.byId[id]?.updatedAt, visits.time, english)
    },
    searchSessions(query: string) { return sidebarSearchResults(visibleBoardState(), deps.sessions.list.getSnapshot().byId, deps.workspaces.list.getSnapshot().archivedSessionIds ?? [], query) },
    subscribeSearch(listener: () => void) {
      listeners.add(listener)
      const off = deps.workspaces.list.subscribe(listener)
      return () => { listeners.delete(listener); off() }
    },
    openSearchSession(id: string) { navigation++; selectBoardSession(''); deps.sessions.open(id) },
    isShared,
    isBoardOnly: (id: string) => boardOnlySession(state, id),
    call,
    activate,
    isLoading: (id: string) => activations.has(id),
    activationError: (id: string) => activationErrors.get(id),
    openBoard,
    appWorkspaceSession(id: string) {
      // Opening an app is still work in this board's directory. Keep an
      // empty draft available for Back when the workspace session is shown.
      temporaryBoards.keep(id)
      const pending = appWorkspaceSessions.get(id)
      if (pending) return pending
      const generation = state.account.generation
      const check = () => {
        if (disposed || generation !== state.account.generation || !(isShared(id) || boardOnlySession(state, id)))
          throw new DOMException('看板已切换，请重新打开。', 'AbortError')
      }
      const resolve = async () => {
        check()
        const { workspaceId, appSessionId } = await call<{ workspaceId: string; appSessionId: string }>('local.directory', {
          mode: 'app-workspace', sessionId: id
        })
        check()
        await deps.workspaces.refresh?.()
        check()
        if (deps.sessions.list.getSnapshot().byId[appSessionId]) return appSessionId
        const created = await deps.sessions.create({ sessionId: appSessionId, workspaceId })
        check()
        if (created !== appSessionId) throw Error('看板工作区会话未能打开。')
        return created
      }
      const operation = resolve().finally(() => {
        if (appWorkspaceSessions.get(id) === operation) appWorkspaceSessions.delete(id)
      })
      appWorkspaceSessions.set(id, operation)
      return operation
    },
    getHomeGuideSession,
    homeGuideSessionsReady: () => !disposed && state.account.status !== 'loading',
    whenHomeGuideSessionsReady,
    submitShared,
    flushCanvas,
    refreshCanvas,
    prepareForUpdate,
    generateShared,
    hasRetainedResult: (sessionId: string, nodeId: string) => !!retainedResult(sessionId, nodeId),
    applyRetainedResult,
    inspectShared,
    cancelShared,
    retryRequest: (id: string) => {
      const r = sends.get(id)
      return r?.reply?.accepted &&
        !r.busy && r.reply.state === 'taskCreateFailed'
        ? r
        : null
    },
    pendingSend: (id: string) => {
      const request = sends.get(id)
      if (!request?.text || !request.busy && !request.reply?.accepted) return null
      if (request.reply?.requestMessageId && view(id)?.messages.some((m: any) => m.id === request.reply?.requestMessageId)) return null
      return { id: request.id, text: request.text, state: request.reply?.accepted ? 'syncing' : 'sending' }
    },
    saveDraft,
    undo,
    presence,
    clearPresence,
    finishGesture,
    showError,
    isResearch: (id: string) => activeResearch.has(id),
    async openPersonal(id: string) {
      const turn = ++navigation, generation = state.account.generation, selected = selectionIntent()
      const loading = waitForBoardSession(id)
      if (loading) {
        await loading
        if (disposed || turn !== navigation || generation !== state.account.generation || selected !== selectionIntent()) return
      }
      if (missingSession(id)) throw Error('该看板的会话已不可用。')
      prime(id)
      deps.sessions.open(id)
      await activate(id, true)
    },
    directoryChoice(id: string) {
      // Registered examples become usable only through a real native Workspace.
      // A saved directory label is not evidence that the Host can execute there.
      if (getHomeGuideSession(id)) return null
      const f = state.favorites.find(f => f.sessionId === id && f.dedicated)
      if (deps.bridge.isSharedSession(id)) return {path:identity(id)?.cwd,label:'新建看板目录'}
      if (f) return { path: f.directoryPath ?? f.cwd, workspaceId: f.workspaceId, label: f.workspaceTitle ?? '新建看板目录' }
      return null
    },
    async associateProject(id: string, workspaceId: string) {
      const f = state.favorites.find(f => f.sessionId === id && f.dedicated)
      if (!f && workspaceId === '::board-directory') {
        if (!getHomeGuideSession(id)) throw Error('该示例目录不属于当前账号，或会话目录已变化。')
        return id
      }
      const example = !f && getHomeGuideSession(id)
      if (example && deps.workspaces.list.getSnapshot().items.some((workspace: { workspaceId: string; path?: string; sessionIds?: readonly string[] }) => workspace.workspaceId === workspaceId && workspace.path === example.cwd && workspace.sessionIds?.includes(id))) return id
      if (win.localStorage.getItem('sherlock.research.directory-locked.v1:' + id) === 'true' || deps.researchWorkspaces.for(id).getSnapshot().files.length > 0) throw Error('画板已有资料，项目目录已固定')
      if (!f) return null
      const workspace = workspaceId === '::board-directory' ? null : deps.workspaces.list.getSnapshot().items.find((w: { workspaceId: string; path: string; title: string }) => w.workspaceId === workspaceId)
      if (workspaceId !== '::board-directory' && !workspace) throw Error('项目暂不可用')
      const cwd = workspace?.path ?? f.directoryPath ?? f.cwd
      if (!cwd) throw Error('看板目录暂不可用')
      if (identity(id)?.cwd === cwd) return id
      deps.researchWorkspaces.for(id).persist?.()
      const wasTemporary = temporaryBoards.keep(id)
      const nextId = await deps.sessions.create({ cwd })
      if (!['新看板', 'New Board', '新研究看板'].includes(f.title)) await deps.sessions.binding(nextId)?.session.rename(f.title)
      try {
        await call('local.directory', { mode: 'associate', sessionId: id, targetSessionId: nextId, ...(workspace ? { workspaceId: workspace.workspaceId, workspaceTitle: workspace.title } : {}) })
      } catch (error) { await deps.workspaces.archiveSession(nextId); throw error }
      prime(nextId)
      await activate(nextId, true)
      selectBoardSession(nextId)
      if (wasTemporary) trackTemporary(nextId)
      return nextId
    },
    async createPrivateBoard() {
      const id = await freshBoard('新研究看板')
      const i = identity(id)
      if (!i) throw Error('研究看板尚未就绪')
      const title = doc.documentElement.dataset.odysseyLocale === 'en' ? 'New Board' : '新看板'
      await call('favorite.add', { identity: { ...i, title }, dedicated: true })
      deps.researchWorkspaces.for(id).initializeWorkbenchResponsiveArrange?.()
      await api.openPersonal(id)
      selectBoardSession(id)
      trackTemporary(id)
      return id
    },
    async deletePersonal(entry: Favorite) {
      await deps.workspaces.archiveSession(entry.sessionId)
      await call('favorite.remove', { favoriteId: entry.favoriteId })
    },
    async renameSession(id: string, title: string) {
      const board = api.collaborativeBoard(id)
      if (board) {
        if (board.role !== 'owner') throw Error('只有看板所有者可以重命名。')
        await call('board.rename', { boardId: board.boardId, title })
        return
      }
      if (isShared(id)) throw Error('协作看板尚未就绪。')
      await api.renamePersonal(id, title)
    },
    async renamePersonal(id: string, title: string) {
      const binding = deps.sessions.binding(id)
      if (!binding) throw Error('会话尚未就绪')
      await binding.session.rename(title)
      for (const favorite of state.favorites.filter(f => f.sessionId === id)) {
        await call('favorite.rename', { favoriteId: favorite.favoriteId, title })
      }
    },
    async collaborationSource(id: string) {
      temporaryBoards.keep(id)
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
      temporaryBoards.keep(id)
      if (shared && view(id)?.permissions.edit) await flushCanvas(id)
      const result = await call<{ localSessionId: string; canvas?: Canvas }>('local.directory', { mode: 'workspace', sessionId: id, title: entry.title, basePath: await defaultDirectory() })
      if (result.canvas) deps.researchWorkspaces.for(result.localSessionId).applyDirectoryCanvas(result.canvas)
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
          id = await freshBoard(copy.title, true)
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
        const directory = await call<{ localSessionId: string }>('local.directory', { mode: 'workspace', sessionId: id, title: copy.title, basePath: await defaultDirectory() })
        await deps.workspaces.refresh()
        await deps.sessions.refresh()
        win.localStorage.removeItem(key)
        copies.delete(copy.copyId)
        await api.openPersonal(directory.localSessionId)
      })()
      copyFlights.set(key, work)
      try {
        return await work
      } finally {
        copyFlights.delete(key)
      }
    },
    retryCanvas,
    canvasSyncNotice(id: string) {
      const e = editors.get(id)
      return e?.syncFailure && { ...e.syncFailure, retrying: e.retrying === true }
    },
    dismissCanvasSyncNotice(id: string, dismissed = true) {
      const e = editors.get(id)
      if (!e?.syncFailure) return
      e.syncFailure = { ...e.syncFailure, dismissed }
      notify()
    },
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
  win.addEventListener('sherlock:home-guide-session-request', receiveHomeGuideSession)
  cleanups.push(installExploreSearch(doc,{
    results:query=>api.searchSessions(query).map(result=>{
      let savedView:string|null=null
      if(result.sessionId){
        const key='ework.session.view.v1:'+result.sessionId
        try{savedView=(win as any).dshDesktop?.researchCanvasStorage?.getItem(key)??win.localStorage.getItem(key)}catch{}
      }
      return{...result,kind:result.area==='boards'?'board' as const:savedView==='notes'?'note' as const:'session' as const,location:result.area==='boards'?'看板区':'工作区'}
    }),
    subscribe:api.subscribeSearch,
    open:async result=>{if(result.boardId)await api.openBoard(result.boardId);else if(result.area==='boards')await api.openPersonal(result.sessionId!);else api.openSearchSession(result.sessionId!)},
    cancelOpen:()=>{navigation++},
    generation:()=>state.account.generation
  }))
  cleanups.push(() => { win.removeEventListener('sherlock:home-guide-session-request', receiveHomeGuideSession); for (const waiter of guideReadyWaiters) waiter.reject(Error('示例页面已关闭。')); guideReadyWaiters.clear() })
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
function ResearchBoardPreviewToggle({page,sessionId,readOnly}:{page:ResearchBoardsPage;sessionId:string;readOnly:boolean}) {
  const workspace=page.workspaceFor?.(sessionId)
  const subscribe=React.useCallback((listener:()=>void)=>workspace?.subscribePreviewMode?.(listener)??(()=>{}),[workspace])
  const read=React.useCallback(()=>workspace?.getPreviewMode?.()===true,[workspace])
  const preview=React.useSyncExternalStore(subscribe,read,read)
  const subscribeLock=React.useCallback((listener:()=>void)=>workspace?.subscribePreviewModeLock?.(listener)??(()=>{}),[workspace])
  const readLock=React.useCallback(()=>workspace?.getPreviewModeLocked?.()===true,[workspace])
  const locked=React.useSyncExternalStore(subscribeLock,readLock,readLock)
  const editingLocked=readOnly||preview
  const label=(readOnly?headerEditLock.readOnly:preview?headerEditLock.locked:headerEditLock.unlocked).zh
  const description=locked?'工作台演示进行中，结束后可切换模式':label
  if(!workspace?.getPreviewMode||!workspace?.setPreviewMode)return null
  return h('button',{
    type:'button',className:'srb-header-control srb-preview-toggle','data-research-preview-toggle':'',
    'aria-label':description,'aria-pressed':editingLocked,
    title:description,disabled:readOnly||locked,
    onClick:()=>{try{workspace.setPreviewMode(!workspace.getPreviewMode())}catch(error){page.showError(error)}}
  },h(HeaderViewModeIcon,{preview:editingLocked,'data-research-preview-icon':editingLocked?'preview':'edit','data-research-preview-glyph':editingLocked?'lock':'lock-open'}))
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
  const shared = v?.board.sharingState === 'shared'
  const inBoardArea = boardOnlySession(s, sessionId) ||
    (!!v && s.boards.some(board => board.boardId === v.boardId && board.pinned === true))
  const canInvite = !v || (v.permissions.manage && v.board.lifecycle === 'active')
  const syncNotice = page.canvasSyncNotice?.(sessionId)
  const invite = safely(page, async () => {
    if (v) addBoardCollaborator(page, v.boardId, sessionId)
    else shareFavorite(page, await page.collaborationSource(sessionId))
  })
  return h(
    'div',
    { className: 'srb-actions', 'data-srb-board-bound': !!(v || f || inBoardArea) },
    v && !dedicatedBoard && h(React.Fragment, null,
      (!shared || !v.permissions.read || v.board.lifecycle === 'archived') &&
        h('span', { className: 'srb-badge' },
          !v.permissions.read ? '共享访问已结束' : v.board.lifecycle === 'archived' ? '已归档' : '仅自己可见'),
      h(ResearchBoardPresence, { page, sessionId, showInvite: false })
    ),
    h(ResearchBoardPreviewToggle, { page, sessionId, readOnly: v?.permissions.edit === false || v?.board.lifecycle === 'archived' }),
    h(ResearchBoardHeaderMenu, {
      key: sessionId,
      workspace: page.workspaceFor?.(sessionId),
      sessionId,
      collaboration: shared ? [
        ...(v.permissions.read ? [{ label: '管理协作', icon: 'manage' as const, run: () => manageBoard(page, v.boardId, 'settings') }] : []),
        ...(canInvite ? [{ label: '添加协作者', icon: 'people' as const, run: invite }] : []),
        ...(v.permissions.read && syncNotice?.dismissed ? [{ label: '查看看板同步提示', icon: 'refresh' as const, run: () => page.dismissCanvasSyncNotice(sessionId, false) }] : [])
      ] : [{ label: '创建协作看板', icon: 'people', run: invite, disabled: !canInvite }],
      membership: {
        label: inBoardArea ? '已加入看板区' : '加入至看板区',
        icon: 'add',
        disabled: inBoardArea || (!!v && !dedicatedBoard),
        run: safely(page, async () => {
          if (dedicatedBoard) await page.call('board.pin', { boardId: v.boardId })
          else await page.favorite(sessionId)
        })
      }
    })
  )
}
export function ResearchBoardPresence({
  page,
  sessionId,
  showInvite = true
}: {
  page: ResearchBoardsPage
  sessionId: string
  showInvite?: boolean
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
    h('button', {
      className: 'odyssey-members-compact', 'aria-label': `查看 ${users.length} 位协作成员`,
      title: `${users.length} 位协作成员`, 'aria-haspopup': 'dialog',
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => showBoardMembers(page, sessionId, event.currentTarget)
    }, boardIcon('people')),
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
    showInvite && v.permissions.manage && v.board.lifecycle === 'active' && h('button', {
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
  const same = anchor.getAttribute('aria-expanded') === 'true'
  doc.querySelectorAll('.srb-avatar-info').forEach(element => element.dispatchEvent(new win.Event('srb-close')))
  doc.querySelectorAll('.srb-members-popover').forEach(element => element.dispatchEvent(new win.Event('srb-close')))
  if (same) return
  const popover = doc.createElement('div')
  popover.className = 'srb-members-popover'
  popover.setAttribute('popover', 'manual')
  popover.setAttribute('role', 'dialog')
  popover.setAttribute('aria-label', '协作成员')
  const title = uiText('h2', ''), online = uiText('p', '', 'srb-members-online')
  const input = doc.createElement('input')
  input.type = 'search'; input.placeholder = '搜索成员姓名…'; input.setAttribute('aria-label', '搜索成员姓名')
  const list = uiText('div', '', 'srb-members-scroll')
  const footer = uiText('div', '', 'srb-members-footer')
  let closed = false
  const outside = (event: Event) => {
    if (!popover.contains(event.target as Node) && !anchor.contains(event.target as Node)) close()
  }
  const close = () => {
    if (closed) return
    closed = true
    popover.hidePopover?.(); popover.remove(); off()
    anchor.setAttribute('aria-expanded', 'false')
    doc.removeEventListener('pointerdown', outside, true)
    win.removeEventListener('resize', position)
  }
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
  anchor.setAttribute('aria-expanded', 'true')
  doc.addEventListener('pointerdown', outside, true)
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

export function SidebarSessionSearch({ page, buttonClass }: { page: ResearchBoardsPage; buttonClass: string }) {
  const label = '搜索会话', search = React.useRef<HTMLButtonElement>(null)
  const open = React.useCallback(async (result: SidebarSearchResult) => {
    if (result.boardId) await page.openBoard(result.boardId)
    else if (result.area === 'boards') await page.openPersonal(result.sessionId!)
    else page.openSearchSession(result.sessionId!)
  }, [page])
  React.useEffect(() => {
    const root = search.current?.closest<HTMLElement>('[data-dsh-sidebar-root]')
    if (root) return mountSidebarSessionSwitcher(root, {
      recentRows: english => root.dataset.sidebarSessionOrder === 'recent' ? page.recentSessions(english) : undefined,
      results: page.searchSessions, subscribe: page.subscribeSearch, workspaces: page.sidebarWorkspaces,
      current: page.current, showError: page.showError, open
    })
  }, [page, open])
  return h('button', { ref: search, type: 'button', className: buttonClass, 'data-sidebar-session-search': '', 'aria-label': label, title: label, onClick: () => showSidebarSessionSearch(document, {
    results: page.searchSessions, subscribe: page.subscribeSearch, open
  }) }, h(IconSearchOutline16))
}
export function ResearchBoardSidebar({ page, wide = true }: { page: ResearchBoardsPage; wide?: boolean; expandSidebar?: () => void }) {
  const state = useBoard(page)
  const skin = React.useSyncExternalStore((listener: () => void) => { window.addEventListener('sherlock-sidebar-skin', listener); return () => window.removeEventListener('sherlock-sidebar-skin', listener) }, () => (window as any).__sherlockWorkspaceSidebarSkin)
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem('sherlock.boards.collapsed') === 'true')
  const search = false, query = ''
  const [creating, setCreating] = React.useState(false)
  const [preferences, setPreferences] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sherlock.boards.view.v3') ?? localStorage.getItem('sherlock.boards.view.v2') ?? 'null')
      return { groupBy: 'type', collapsedGroups: Array.isArray(saved?.collapsedGroups) ? saved.collapsedGroups.filter((g: unknown) => g === 'private' || g === 'shared') : [], sort: 'manual', updatedAt: saved?.updatedAt ?? {}, order: Array.isArray(saved?.order) ? saved.order.filter((v: unknown) => typeof v === 'string') : [] }
    }
    catch { return { groupBy: 'type', collapsedGroups: [], sort: 'manual', order: [], updatedAt: {} } }
  })
  const selectedSession = React.useSyncExternalStore(subscribeBoardSelection, selectedBoardSession)
  React.useSyncExternalStore(subscribeSidebarUsage,sidebarUsageSnapshot)
  const currentSession=page.current(),usage=sidebarUsageTimes(),revealedBoardSession=React.useRef<string|null>(null)
  React.useEffect(()=>{
    document.documentElement.dataset.eworkMemorySession=currentSession??''
    document.dispatchEvent(new CustomEvent('sherlock:memory-session',{detail:{sessionId:currentSession??undefined}}))
  },[currentSession])
  React.useEffect(()=>{
    const open=(event:Event)=>{
      const {requestId,source}=(event as CustomEvent).detail??{}
      if(typeof requestId!=='string'||typeof source?.sessionId!=='string')return
      const result=page.searchSessions('').find(row=>row.sessionId===source.sessionId)
      if(!result){document.dispatchEvent(new CustomEvent('sherlock:memory-source-result',{detail:{requestId,ok:false}}));return}
      void (async()=>{
        if(result.boardId)await page.openBoard(result.boardId)
        else if(result.area==='boards')await page.openPersonal(result.sessionId!)
        else page.openSearchSession(result.sessionId!)
        const match=await waitForMemorySource(document,source,()=>page.current()??undefined,{onReady:()=>{
          const tab=source.kind==='note'?'notes':'chat'
          document.querySelector<HTMLButtonElement>(`[data-srb-tabs] [data-conversation-view-id="${tab}"]`)?.click()
          if(source.kind==='note')document.dispatchEvent(new CustomEvent('sherlock:notes-open',{detail:{sessionId:source.sessionId}}))
        }})
        if(!match){document.dispatchEvent(new CustomEvent('sherlock:memory-source-result',{detail:{requestId,ok:false}}));return}
        document.querySelector<HTMLButtonElement>('.VOzbGW_close')?.click()
        match.scrollIntoView({block:'center',behavior:'smooth'});match.dataset.memorySourceHighlight='true';setTimeout(()=>delete match.dataset.memorySourceHighlight,3000)
        document.dispatchEvent(new CustomEvent('sherlock:memory-source-result',{detail:{requestId,ok:true}}))
      })().catch(()=>document.dispatchEvent(new CustomEvent('sherlock:memory-source-result',{detail:{requestId,ok:false}})))
    }
    document.addEventListener('sherlock:memory-source-open',open)
    return()=>document.removeEventListener('sherlock:memory-source-open',open)
  },[page])
  const save = (next: any) => { setPreferences((previous:any)=>{const value=typeof next==='function'?next(previous):next;localStorage.setItem('sherlock.boards.view.v3',JSON.stringify(value));return value}) }
  const entries = [
    ...state.favorites.filter(f => f.pinned !== false).map(f => ({ key: 'private:' + f.favoriteId, group: 'private', value: f, time: Math.max(f.updatedAt ?? f.createdAt, page.editedAt(f.sessionId) ?? 0,usage[f.sessionId]??0) })),
    ...state.boards.filter(b => b.pinned).map(b => ({ key: 'shared:' + b.boardId, group: b.sharingState === 'shared' ? 'shared' : 'private', value: b, time: Math.max(b.updatedAt ?? b.createdAt,usage[b.localSessionId??'']??0) }))
  ]
  const activeGroup=entries.find(e=>('boardId' in e.value?e.value.localSessionId:e.value.sessionId)===currentSession)?.group
  React.useEffect(()=>{
    const key=(currentSession??'')+':'+(activeGroup??'workspace')
    if(revealedBoardSession.current===key)return
    revealedBoardSession.current=key
    if(!currentSession||!activeGroup)return
    setCollapsed(false);localStorage.setItem('sherlock.boards.collapsed','false')
    if(preferences.collapsedGroups.includes(activeGroup))save((previous:any)=>({...previous,collapsedGroups:previous.collapsedGroups.filter((g:string)=>g!==activeGroup)}))
  },[currentSession,activeGroup])
  const nextOrder = promoteSidebarOrder(entries, preferences.order, preferences.updatedAt)
  const order = nextOrder.order
  React.useEffect(() => {
    if (entries.length && nextOrder.changed) save((previous:any)=>({ ...previous, order: nextOrder.order, updatedAt: nextOrder.updatedAt }))
  }, [JSON.stringify(nextOrder)])
  entries.sort((a, b) => preferences.sort === 'updated' ? b.time - a.time :
    (order.includes(a.key) ? order.indexOf(a.key) : 100000) - (order.includes(b.key) ? order.indexOf(b.key) : 100000))
  const visible = entries.filter(e => e.value.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  if (!wide || !skin) return null
  const B = skin.header
  const classes = (...names: Array<string | false>) => names.filter(Boolean).join(' ')
  return h('section', { className: 'srb-section ' + B.root, 'data-wide': true, 'data-section-collapsed': collapsed && !search, 'aria-label': '看板区' },
    h('div', { className: B.sectionHeader, 'data-srb-section-header': '' },
      h('button', { className: classes('srb-section-toggle', B.sectionLabel, search && B.sectionLabelHidden), 'aria-label': collapsed ? '展开看板区' : '折叠看板区', 'aria-expanded': !collapsed,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          if (collapsed) event.currentTarget.closest<HTMLElement>('[data-srb-navigation-scroll]')?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
          setCollapsed(!collapsed); localStorage.setItem('sherlock.boards.collapsed', String(!collapsed))
        } },
        '看板区', h('span', { className: 'srb-chevron', 'data-collapsed': collapsed, 'aria-hidden': true })),
      h('div', { className: classes(B.headerActions, search && B.headerActionsHidden) },
        h('button', { className: B.iconButton, 'aria-label': '新建研究看板', title: '新建研究看板', disabled: creating, onClick: safely(page, async () => {
          setCreating(true)
          try { await page.createPrivateBoard(); setCollapsed(false); localStorage.setItem('sherlock.boards.collapsed', 'false'); save({ ...preferences, collapsedGroups: preferences.collapsedGroups.filter((g: string) => g !== 'private') }) }
          finally { setCreating(false) }
        }) }, h(IconPlusOutline16)))),
    (!collapsed || search) && h(ResearchBoardList, { page, skin, visible, entries, preferences, query, selectedSession, save }))
}
function ResearchBoardList({ page, skin, visible, entries, preferences, query, selectedSession, save }: any) {
  const [drag, setDrag] = React.useState<any>(null)
  const [expandedGroups, setExpandedGroups] = React.useState<string[]>([])
  const currentDrag = React.useRef<any>(null), committed = React.useRef(false)
  skin.useNativeDragAcceptance(drag !== null)
  const updateDrag = (next: any) => { currentDrag.current = next; setDrag(next) }
  React.useEffect(() => { updateDrag(null) }, [preferences.groupBy, preferences.sort, query])
  React.useEffect(() => { setExpandedGroups((keys: string[]) => keys.filter(key => !preferences.collapsedGroups.includes(key))) }, [preferences.collapsedGroups])
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
  const renderRows = (rows: any[], group: string) => {
    const limit = Math.max(1, skin.collapsedSessionLimit ?? 5), expanded = !!query || expandedGroups.includes(group)
    let shown = expanded ? rows : rows.slice(0, limit)
    // Keep the open board discoverable without rewriting the user's manual order.
    const current = rows.find(row => (row.value.localSessionId ?? row.value.sessionId) === page.current())
    if (!expanded && current && !shown.includes(current)) shown = [...shown.slice(0, limit - 1), current]
    return [
      ...shown.map(renderRow),
      !query && rows.length > limit && h('button', {
        key: 'overflow:' + group, type: 'button', className: B.sessionOverflowButton,
        'data-srb-board-overflow': group, 'aria-expanded': expanded,
        onClick: () => setExpandedGroups((keys: string[]) => keys.includes(group) ? keys.filter(key => key !== group) : [...keys, group])
      }, expanded ? '收起' : `展开其余 ${rows.length - shown.length} 个看板`)
    ]
  }
  const groups = grouped ? ['private', 'shared'].map(group => ({ group, rows: visible.filter((e: any) => e.group === group) })).filter(g => g.rows.length) : []
  const firstMarker = !grouped && drag?.over?.key === visible[0]?.key && drag?.over?.half === 'before'
  return h('div', { className: B.listArea }, h('div', { className: B.treeBody },
    h('div', { className: ['srb-board-list', B.list, !grouped && B.flatList].filter(Boolean).join(' '), 'data-group-by': preferences.groupBy },
      !visible.length && h('p', { className: 'srb-empty' }, query ? '没有找到匹配的看板' : '暂无看板'),
      ...(grouped ? groups.map(({ group, rows }) => h(ResearchBoardGroup, { key: group, skin, group,
        expanded: !!query || !preferences.collapsedGroups.includes(group),
        onToggle: () => { if (!query) save({ ...preferences, collapsedGroups: preferences.collapsedGroups.includes(group) ? preferences.collapsedGroups.filter((g: string) => g !== group) : [...preferences.collapsedGroups, group] }) }
      }, ...renderRows(rows, group))) : renderRows(visible, 'all'))),
    firstMarker && h('span', { className: B.listTopDropIndicator, 'aria-hidden': true })))
}
function ResearchBoardGroup({ skin, group, expanded, onToggle, children }: any) {
  const R = skin.rows, title = group === 'private' ? '个人看板' : '协作看板'
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
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [deleteError, setDeleteError] = React.useState('')
  const R = skin.rows
  const selected = page.current() === ('boardId' in entry ? entry.localSessionId : entry.sessionId)
  const shared = 'boardId' in entry
  const sessionId = shared ? entry.localSessionId : entry.sessionId
  const subscribeActivity = React.useCallback((listener: () => void) => page.subscribeActivity(sessionId, listener), [page, sessionId])
  const activitySnapshot = React.useCallback(() => page.isRunning(sessionId), [page, sessionId])
  const running = React.useSyncExternalStore(subscribeActivity, activitySnapshot, activitySnapshot)
  const collaboration = shared && entry.sharingState === 'shared'
  const items = boardEntryActions(entry).map(item => ({ ...item, icon: item.id === 'collaboration' ? boardIcon('people') : h(item.id === 'delete' ? IconTrashOutline16 : item.id === 'rename' ? IconEditOutline16 : IconFolderOpenOutline16) }))
  return h('div', { className: ['srb-row', R.sessionRow, !nested && R.flatSessionRowWithoutStatus, selected && R.selected, open && R.menuOpen, marker === 'before' && R.dropBefore, marker === 'after' && R.dropAfter].filter(Boolean).join(' '), 'data-menu-open': open, 'aria-current': selected,
    ...drag, 'data-drop-marker': marker ?? undefined,
    onContextMenu: (event: React.MouseEvent) => { event.preventDefault(); setOpen(true) } },
    (nested || running) && h('span', { className: R.slot, 'aria-label': running ? '任务运行中' : undefined }, running && h(StateDot, { state: 'ongoing' })),
    h('button', { className: R.title + ' srb-board-title', title: entry.title, onClick: safely(page, async () => {
      const id = shared ? await page.openBoard(entry.boardId) : entry.sessionId
      if (!shared) await page.openPersonal(id)
      if (page.current() === id) selectBoardSession(id)
    }) },
      collaboration && (entry.memberCount ?? page.getView(sessionId)?.members.length ?? 1) <= 1 &&
        h('span', { className: 'srb-pending-ring', title: '等待成员接受邀请', 'aria-label': '等待接受邀请' }),
      h('span', { className: 'odyssey-nav-title' }, h('span', { className: 'odyssey-nav-title-text' }, entry.title))),
    h('span', { className: R.time + ' srb-row-time' }, h(BoardEditTime, { value: time || undefined, editor: shared ? entry.updatedBy?.username : undefined })),
    h('span', { className: R.rowActions + ' srb-row-actions' }, h(Menu, { className: 'srb-navigation-menu', open, onClose: () => setOpen(false), items, portal: true, closeOnPointerLeave: true,
      anchor: h('button', { className: R.iconButton + ' srb-row-more', 'aria-label': entry.title + '，更多', 'aria-haspopup': 'menu', 'aria-expanded': open,
        onClick: (event: React.MouseEvent) => { event.stopPropagation(); setOpen(!open) } }, h(IconEllipsisOutline16)),
    onSelect: (id: string) => {
      setOpen(false)
      if (id === 'rename') renameBoardEntry(page, entry)
      if (id === 'delete') { setDeleteError(''); setDeleteOpen(true) }
      if (id === 'collaboration') {
        if (collaboration) manageBoard(page, entry.boardId, 'members')
        else if (shared) void page.openBoard(entry.boardId).then((id: string) => addBoardCollaborator(page, entry.boardId, id)).catch(page.showError)
        else shareFavorite(page, entry)
      }
      if (id === 'workspace') void page.returnToWorkspace(entry).catch(page.showError)
    }
  })), h(Modal, {
    open: deleteOpen, onClose: () => { if (!deleting) setDeleteOpen(false) }, closeLabel: '关闭',
    title: '删除看板', description: `将“${entry.title}”从看板列表中删除，并归档对应会话。已有文件与会话记录会保留。`,
    footer: h(React.Fragment, null,
      h(Button, { variant: 'outline', disabled: deleting, onClick: () => setDeleteOpen(false) }, '取消'),
      h(Button, { variant: 'outline', disabled: deleting, style: { color: 'var(--dsw-alias-status-error, #d44)' }, onClick: async () => {
        setDeleting(true); setDeleteError('')
        try { await page.deletePersonal(entry); setDeleteOpen(false) }
        catch (error) { setDeleteError(error instanceof Error ? error.message : '删除失败，请重试') }
        finally { setDeleting(false) }
      } }, '删除看板'))
  }, deleting && h('div', { role: 'status' }, '正在删除…'), deleteError && h('div', { role: 'alert' }, deleteError)))
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
  const historyProblems = new Map([
    ['PRIVATE_PATH_IN_HISTORY', '原研究对话含有本机路径，无法一并共享。'],
    ['HISTORY_UNSUPPORTED_ATTACHMENT', '原研究对话含有暂不支持共享的附件。'],
    ['HISTORY_TOO_LARGE', '原研究对话超过协作共享上限。']
  ])
  const start = async (includeHistory = true) => {
    const scope = includeHistory ? {} : { includeHistory: false }
    const result = await d.run(async () => {
      try {
        const capture = await page.call<{
          captureId: string
          nodeCount: number
          historyCount: number
          assetBytes: number
        }>('board.previewCapture', { favoriteId: f.favoriteId, ...scope })
        return { capture }
      } catch (error) {
        const code = (error as { code?: string } | null)?.code
        const reason = includeHistory && code ? historyProblems.get(code) : undefined
        if (!reason) throw error
        return { reason }
      }
    }, includeHistory ? '准备研究内容…' : '准备看板和资料…')
    if (!d.dialog.isConnected || !result) return
    d.body.replaceChildren()
    if (!result.capture) {
      const action = boardButton(document, '仅共享看板', () => start(false))
      action.className = 'srb-primary'
      const footer = uiText('div', '', 'srb-dialog-footer')
      footer.append(action)
      d.body.append(
        uiText('p', `${result.reason} 你可以继续共享画板上的组件和资料，原对话会保留在本机。`, 'srb-description'),
        footer
      )
      action.focus()
      return
    }
    const { capture } = result
    const name = document.createElement('input')
    name.value = `${f.title} · 协作`
    name.setAttribute('aria-label', '协作名称')
    const panel = uiText('div', '', 'srb-info-panel')
    const summary = uiText('div', '', 'srb-capture-summary')
    summary.append(
      uiText('span', `${capture.nodeCount} 个组件`),
      uiText('span', includeHistory ? `${capture.historyCount} 条已保存对话` : '不包含原研究对话'),
      uiText('span', `${(capture.assetBytes / 1024 / 1024).toFixed(1)} MB 资料`)
    )
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
            captureId: capture.captureId,
            ...scope
          }
        )
        return result.board.boardId
      },
      '发送邀请'
    )
    if (!includeHistory) name.focus()
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
  const role = boardRolePicker(document, '邀请权限')
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
  const roleLabel = document.createElement('div')
  roleLabel.className = 'srb-role-label'
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
      // Cursor/selection heartbeats must not replace a permission picker while its
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
          const select = boardRolePicker(document, `${member.username}权限`, member.role)
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
        const select = boardRolePicker(document, `${invite.invitee.username}待处理邀请权限`, invite.role)
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
/** Reuse the normal conversation queue dock, including edit/collapse/steer controls. */
export function ResearchBoardQueue({ page, sessionId, QueueDock, ...props }: any) {
  useBoard(page)
  const view = page.getView(sessionId)
  const userId = page.getState().account.user?.userId
  const queue = React.useMemo(() => (view?.tasks ?? [])
    .filter((t: any) => t.conversation && t.status === 'pending')
    .sort((a: any,b: any) => (a.queueOrder ?? a.createdAt ?? 0) - (b.queueOrder ?? b.createdAt ?? 0))
    .map((t: any) => {
      const m = view.messages.find((m: any) => m.id === t.requestMessageId)
      return { id: t.taskId, placement: 'queued', source: { kind: 'user' }, text: m?.text ?? '', preview: (t.resumeCount ? '待继续 · ' : '') + (m?.text ?? ''),
        authorName: m?.author?.username ?? m?.authorName ?? '成员', editable: view.permissions.execute && t.initiatorId === userId }
    }), [view, userId])
  const snapshot = { queue, running: view?.tasks.some((t: any) => t.conversation && t.status === 'running'), subagent: null }
  return h(QueueDock, { ...props, useSession: (select: any) => select(snapshot), updateQueue: async (taskId: string, action: any) => {
    await page.call('queue.' + ({ edit: 'edit', remove: 'delete', steer: 'promote' } as any)[action.kind], {
      boardId: view.boardId, taskId, ...(action.kind === 'edit' ? { text: action.content.map((b: any) => b.text ?? '').join('') } : {})
    })
  } })
}

export function ResearchBoardDiscussion({
  page,
  sessionId,
  MarkdownText, NativeGroup, NativeMessage, nativeProps
}: {
  page: ResearchBoardsPage
  sessionId: string
  MarkdownText?: React.ComponentType<any>
  NativeGroup?: React.ComponentType<any>
  NativeMessage?: React.ComponentType<any>
  nativeProps?: any
}) {
  useBoard(page)
  const v = page.getView(sessionId)
  const [pendingRequests, setPendingRequests] = React.useState([] as any[])
  React.useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    setPendingRequests([])
    const load = () => {
      if (!v?.permissions.read) return
      void page.call<any[]>('request.list', { boardId: v.boardId }).then(rows => {
        if (!active) return
        setPendingRequests(rows)
        if (rows.some(r => r.state === 'messageAccepted' && r.submissionState !== 'interrupted')) timer = setTimeout(load, 1000)
      }).catch(() => {})
    }
    load()
    return () => { active = false; clearTimeout(timer) }
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
    ...new Map(v.messages.filter((m: any) => !m.queueDeleted).map((m: any) => [m.id, m])).values()
  ] as any[]
  const requestIds = new Set(
    live.filter((m) => m.role === 'user').map((m) => m.id)
  )
  const linked = (m: any) =>
    m.role === 'assistant' && requestIds.has(m.requestMessageId)
  const groups = orderBoardConversationGroups([
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
  ], v.tasks, v.messages)
  const currentUserId = page.getState().account?.user?.userId
  const pendingSend = page.pendingSend?.(sessionId)
  nativeProps = { ...nativeProps, currentUserId }
  const renderMessage = (m: any, i: number) =>
    NativeMessage && !componentTask(taskForMessage(m, v.tasks)) ? h(NativeMessage, { key: m.id ?? i, message: m, nativeProps }) : h(
      'article',
      {
        className: 'srb-message',
        'data-role': m.role,
        'data-self': m.role === 'user' && !!currentUserId && (m.author?.userId ?? m.authorId) === currentUserId,
        'data-message-id': m.id,
        'data-execution-kind': !m.imported && componentTask(taskForMessage(m, v.tasks)) ? 'component' : 'conversation',
        key: `${m.imported ? 'history' : 'message'}:${m.id ?? i}`
      },
      h(
        'small',
        { className: 'srb-message-author' },
        m.role === 'assistant'
          ? (m.author?.username ?? m.authorName ?? '成员') + '的智能助理' + (componentTask(taskForMessage(m, v.tasks)) ? ' · 组件子智能体' : '')
          : (m.author?.username ?? m.authorName ?? '成员'),
        m.imported ? ' · 复制时的已保存对话' : ''
      ),
      h('div', { className: 'srb-message-body' }, MarkdownText ? h(MarkdownText, { text: m.text }) : h('p', null, m.text))
    )
  const renderControls = (requestId?: string) => {
    const belongs = (id: unknown) =>
      requestId ? id === requestId : !requestIds.has(id)
    const tasks = v.tasks.filter((t: any) => belongs(t.requestMessageId) && !(t.conversation && t.status === 'pending' && !t.resumeCount) && !v.messages.some((m: any) => m.id === t.requestMessageId && m.queueDeleted))
    const attempts = requestId ? boardTaskAttempts(tasks) : { current: tasks, previous: [] }
    return h(
      'div',
      { className: 'srb-request-statuses' },
      ...pendingRequests
        .filter((r: any) => belongs(r.requestMessageId) && !v.messages.some((m: any) => m.id === r.requestMessageId && m.queueDeleted))
        .filter((r: any) => boardRequestPresentation(r, v.tasks))
        .map((r: any) =>
          h(
            'div',
            { className: 'srb-status', key: r.clientMutationId },
            boardRequestPresentation(r, v.tasks)?.text,
            boardRequestPresentation(r, v.tasks)?.kind === 'retry' && h(
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
          (t) => !(NativeGroup && t.conversation && t.status === 'running') && boardTaskStatus(t) && !(['failed', 'interrupted'].includes(t.status) && pendingRequests.some((r: any) => r.taskId === t.taskId && ['interrupted', 'uncertain'].includes(r.runtimeState)))
        )
        .map((t) => t.status === 'running'
          ? h(ResearchBoardTaskProgress, { key: t.taskId, task: t })
          : h(
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
    { className: 'srb-discussion' + (!groups.length && !pendingSend ? ' srb-discussion-empty' : ''), 'data-shared-discussion': sessionId },
    !groups.length && !pendingSend &&
      h('p', { className: 'sRp_emptyState' }, '探索更远，洞见更深'),
    ...groups.map((group) =>
      h(
        'section',
        {
          key: group.key,
          className: 'srb-request-group',
          'data-request-message-id': group.requestId,
          'data-execution-kind': group.requestId && componentTask(taskForMessage({ id: group.requestId }, v.tasks)) ? 'component' : 'conversation'
        },
        group.requestId && componentTask(taskForMessage({ id: group.requestId }, v.tasks)) && h('div', { className: 'srb-component-activity-label' }, '◇ 组件子智能体 · 独立执行', h('span', null, String(v.canvas?.artifacts?.find((node: any) => node.id === taskForMessage({ id: group.requestId }, v.tasks)?.targetId)?.title ?? '画板组件'))),
        ...(NativeGroup && group.requestId && !componentTask(taskForMessage({ id: group.requestId }, v.tasks))
          ? [h(NativeGroup, { key: 'native', group: { ...group, rows: group.rows.filter((m: any) => !componentTask(taskForMessage(m, v.tasks))) }, tasks: v.tasks.filter((t: any) => t.requestMessageId === group.requestId), nativeProps }), ...group.rows.filter((m: any) => componentTask(taskForMessage(m, v.tasks))).map(renderMessage)]
          : group.rows.map(renderMessage)),
        group.requestId && renderControls(group.requestId)
      )
    ),
    pendingSend && h('section', { className: 'srb-request-group', key: 'sending:' + pendingSend.id },
      renderMessage({ id: 'sending:' + pendingSend.id, role: 'user', text: pendingSend.text, authorId: currentUserId }, 0),
      h('p', { className: 'srb-status' }, pendingSend.state === 'syncing' ? '消息已发送，正在同步…' : '正在发送…')),
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
  const v = page.getView(sessionId)
  if (page.isLoading(sessionId)) return h('div',
    { className: 'srb-canvas-loading', role: 'status', 'aria-live': 'polite', 'aria-busy': true },
    h('span', { className: 'srb-canvas-loading-spinner', 'aria-hidden': true }),
    h('span', null, '正在加载画板…'))
  if (page.activationError(sessionId)) return h('div',
    { className: 'srb-canvas-loading', role: 'alert' },
    h('span', null, '画板加载失败，请重试'),
    h('button', { onClick: () => void page.activate(sessionId, true) }, '重新加载'))
  if (!v?.permissions.read)
    return h(
      'div',
      { className: 'srb-terminated' },
      h('h3', null, '共享内容不可访问'),
      h('button', { onClick: () => showRecovery(page) }, '恢复我的未发送内容')
    )
  const snapshot = workspace.getVisibleBoardSnapshot?.() ?? workspace.getSnapshot(),
    viewport = snapshot.viewport
  const syncNotice = page.canvasSyncNotice?.(sessionId)
  return h(
    React.Fragment,
    null,
    !v.permissions.edit && h('div', { className: 'srb-readonly' }, '仅可查看'),
    syncNotice && !syncNotice.dismissed && h('div',
      {
        className: 'srb-readonly', 'data-canvas-error': '',
        onPointerDown: (event: React.PointerEvent) => event.stopPropagation()
      },
      h('span', { role: 'status' }, syncNotice.retrying ? '正在同步看板修改…' : syncNotice.message),
      h('div', { className: 'srb-sync-actions' },
        v.permissions.edit && h('button', {
          type: 'button', disabled: syncNotice.retrying,
          onClick: () => void page.retryCanvas(sessionId)
        }, syncNotice.kind === 'retry' ? '重试同步看板修改' : '载入最新看板并同步'),
        h('button', {
          type: 'button', className: 'srb-sync-close',
          'aria-label': '关闭看板同步提示', title: '关闭看板同步提示',
          onClick: () => page.dismissCanvasSyncNotice(sessionId)
        }, h('span', { className: 'srb-close-icon', 'aria-hidden': true }))
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
            const n = [...snapshot.files, ...snapshot.artifacts].find(node => node.id === id)
            return (
              n &&
              h(
                'div',
                {
                  className: 'srb-occupied',
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
  register('sidebar.recentSessions', 'sherlock-recent-sessions', SidebarRecentSessions)
  register('sidebar.sessionSearch', 'sherlock-session-search', SidebarSessionSearch)
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
