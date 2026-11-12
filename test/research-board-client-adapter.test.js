import { readFile } from 'node:fs/promises'
import { runInNewContext, Script } from 'node:vm'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { describe, it, expect, vi } from 'vitest'
import { patchFigmaUpdateWorkspace } from '../scripts/lib/figma-updates-client.mjs'
import { patchFigmaWorkspaceMenus } from '../scripts/lib/figma-workspace-menus.mjs'
import {
  patchResearchBoardConversation,
  patchLegacyDashboardPreview,
  patchResearchBoardSidebar,
  patchResearchBoardWorkspace
} from '../scripts/lib/patch-research-board-client.mjs'
// These tests exercise the page adapter; actual menu rendering is covered by
// the two-renderer browser test using the real Workspace primitives.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: () => null, IconEllipsisOutline16: () => null, IconSearchOutline16: () => null,
  IconPersonalizationOutline16: () => null, IconPlusOutline16: () => null, IconEditOutline16: () => null
}))
const require = createRequire(import.meta.url)
async function load(shared = true) {
  const window = new Window({ url: 'http://localhost/' })
  const bridge = {
    isSharedSession: () => shared,
    getSnapshot: async () => ({
      version: 1,
      eventSeq: 0,
      account: { status: 'signedOut', generation: 0, user: null },
      favorites: [],
      boards: [],
      current: null,
      notifications: {
        notifications: [],
        cursor: 0,
        unreadCount: 0,
        pendingCount: 0
      },
      recoveries: []
    }),
    subscribe: () => () => {},
    invoke: vi.fn(async () => ({
      ok: false,
      error: { code: 'EXECUTION_UNAVAILABLE', message: '尚未就绪' }
    }))
  }
  window.dshDesktop = {
    researchBoards: bridge,
    researchCanvasStorage: {
      getItem: () => (shared ? '[]' : null),
      setItem: vi.fn(() => !shared)
    }
  }
  let module
  window.__ModuleLoader__ = { load: (v) => (module = v) }
  const raw = await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
    'utf8'
  )
  const source = patchFigmaUpdateWorkspace(await patchResearchBoardConversation(raw))
  runInNewContext(
    source.replace(
      '\t\texports.apply = apply;',
      'exports.__setBoardsAdapter=value=>{sherlockBoardsAdapter=value;};\n\t\texports.apply = apply;'
    ),
    {
      window,
      document: window.document,
      navigator: window.navigator,
      localStorage: window.localStorage,
      sessionStorage: window.sessionStorage,
      CustomEvent: window.CustomEvent,
      TextEncoder,
      TextDecoder,
      AbortController,
      setTimeout,
      clearTimeout,
      console,
      queueMicrotask
    }
  )
  const fallback = new Proxy(function () {}, {
    get: () => fallback,
    apply: () => undefined,
    construct: () => ({})
  })
  const exports = module.factory((id) =>
    ['react', 'react/jsx-runtime', 'react-dom'].includes(id)
      ? require(id)
      : fallback
  )
  return { window, bridge, exports, raw, source }
}
describe('real research board module adapter', () => {
  it('patches exact actual modules idempotently and fails closed on drift', async () => {
    const { raw, source } = await load()
    expect(await patchResearchBoardConversation(source)).toBe(source)
    const previewSource = patchLegacyDashboardPreview(source)
    expect(patchLegacyDashboardPreview(previewSource)).toBe(previewSource)
    const previewStart = previewSource.indexOf('const MARKET_PRESENTATION_CSS = ')
    const previewEnd = previewSource.indexOf('function buildResearchHtmlPreview(', previewStart)
    expect(previewStart).toBeGreaterThan(0)
    expect(previewSource.slice(previewStart, previewEnd)).toContain('ODYSSEY_MARKET_PRESENTATION_V2')
    await expect(
      patchResearchBoardConversation(
        raw.replace(
          'async sink(session, text, imageIds, mode) {',
          'async missingSink() {'
        )
      )
    ).rejects.toThrow(/anchor/)
    await expect(
      patchResearchBoardConversation(
        source.replace('async sink(session, text, imageIds, mode) {', 'async missingSink() {')
      )
    ).rejects.toThrow(/anchor/)
    const sidebar = await readFile(
      'node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js',
      'utf8'
    )
    const patched = patchResearchBoardSidebar(sidebar)
    expect(patchResearchBoardSidebar(patched)).toBe(patched)
  })
  it('applies remote collections once without legacy writes, echo, history or geometry reflow', async () => {
    const { window, exports } = await load()
    const w = new exports.ResearchWorkspaceRegistry().for('shared')
    const changed = vi.fn()
    w.subscribe(changed)
    w.applyRemoteCanvas(
      {
        files: [],
        artifacts: [
          {
            id: 'a',
            messageId: 'a',
            kind: 'pasted-text',
            title: 'A',
            excerpt: 'peer',
            x: 300,
            y: 200
          }
        ]
      },
      { revision: 'r1' }
    )
    expect(changed).toHaveBeenCalledTimes(1)
    expect(w.getSnapshot().artifacts[0]).toMatchObject({
      id: 'a',
      excerpt: 'peer',
      x: 300,
      y: 200
    })
    expect(
      window.dshDesktop.researchCanvasStorage.setItem
    ).not.toHaveBeenCalled()
    expect(w.getSnapshot().viewport).toEqual({ scale: 1, x: 0, y: 0 })
  })
  it('blocks shared writes before authorization but preserves private editing', async () => {
    const shared = await load()
    const w = new shared.exports.ResearchWorkspaceRegistry().for('shared')
    w.setArtifacts([
      {
        id: 'a',
        kind: 'pasted-text',
        messageId: 'a',
        title: 'x',
        excerpt: 'blocked',
        x: 0,
        y: 0
      }
    ])
    expect(w.getSnapshot().artifacts).toEqual([])
    const personal = await load(false)
    const p = new personal.exports.ResearchWorkspaceRegistry().for('personal')
    p.setArtifacts([
      {
        id: 'a',
        kind: 'pasted-text',
        messageId: 'a',
        title: 'x',
        excerpt: 'allowed',
        x: 0,
        y: 0
      }
    ])
    expect(p.getSnapshot().artifacts).toHaveLength(1)
  })
  it('never executes private prompt for a shared default send and keeps its draft', async () => {
    const { exports } = await load()
    const prompt = vi.fn()
    const session = { sessionId: 'shared', prompt }
    const shell = {
      snapshot: { draft: '总结', draftRev: 1, occurrences: [], imageIds: [] },
      notify: vi.fn()
    }
    const hub = new exports.InputHub(
      { get: () => ({ sendSession: prompt }) },
      (s) => s
    )
    hub.shells.set('shared', shell)
    await hub.sink(session, '总结', [], 'queue')
    expect(prompt).not.toHaveBeenCalled()
    expect(shell.snapshot.draft).toBe('总结')
  })
})

async function pageFixture(favorites = []) {
  const fixture = await load()
  const { createResearchBoardsPage } = await import(
    '../src/preload/research-boards-ui.ts'
  )
  const node = {
    id: 'a',
    messageId: 'a',
    kind: 'pasted-text',
    title: 'Team source',
    excerpt: 'teammate secret baseline',
    x: 200,
    y: 200
  }
  const view = {
    boardId: 'board',
    localSessionId: 'shared',
    board: {
      boardId: 'board',
      title: 'Team',
      sharingState: 'shared',
      sharingEpoch: 1,
      lifecycle: 'active'
    },
    connection: 'online',
    permissions: { read: true, edit: true, manage: true, execute: true },
    canvas: { files: [], artifacts: [node] },
    canvasRevision: 'base',
    seq: 1,
    epoch: 1,
    history: [],
    messages: [],
    tasks: [],
    members: [],
    presence: [],
    pendingCount: 0,
    canUndo: false,
    canRedo: false,
    recoveries: []
  }
  let state = {
    version: 1,
    eventSeq: 1,
    account: {
      status: 'ready',
      generation: 1,
      user: { userId: 'u', publicId: '0000000001', username: 'Me' }
    },
    favorites,
    boards: [{ ...view.board, pinned: true, localSessionId: 'shared' }],
    current: view,
    notifications: {
      notifications: [],
      cursor: 0,
      unreadCount: 0,
      pendingCount: 0
    },
    recoveries: []
  }
  const events = new Set()
  fixture.bridge.subscribe = (fn) => {
    events.add(fn)
    return () => events.delete(fn)
  }
  fixture.bridge.getSnapshot = async () => state
  fixture.bridge.invoke = vi.fn(async (action) => ({
    ok: true,
    value: action === 'board.activate' ? view : undefined
  }))
  const sessionState = {
    current: 'shared',
    byId: { shared: { id: 'shared', title: 'Shared' } },
    phase: 'ready'
  }
  const listListeners = new Set()
  const list = { getSnapshot: () => sessionState, subscribe: fn => { listListeners.add(fn); return () => listListeners.delete(fn) } }
  const sessions = {
    list,
    binding: () => undefined,
    open: vi.fn(),
    create: vi.fn(async () => 'new-shared')
  }
  const registry = new fixture.exports.ResearchWorkspaceRegistry()
  const hub = { shells: new Map() }
  const page = createResearchBoardsPage({
    sessions,
    workspaces: { list: { ...list, getSnapshot: () => ({ items: [] }) } },
    researchWorkspaces: registry,
    inputHub: hub,
    bridge: fixture.bridge,
    document: fixture.window.document
  })
  fixture.exports.__setBoardsAdapter(page)
  await new Promise((r) => setTimeout(r, 0))
  return {
    ...fixture,
    page,
    view,
    registry,
    hub,
    sessions,
    emitSessions: () => listListeners.forEach(fn => fn()),
    emit: (event) =>
      events.forEach((fn) =>
        fn({ eventSeq: ++state.eventSeq, accountGeneration: 1, ...event })
      ),
    dispose: () => {
      page.dispose()
      fixture.window.happyDOM.abort()
    }
  }
}
it('does not rebuild the canvas for repeated activation snapshots with unchanged content', async () => {
  const f = await pageFixture()
  const w = f.registry.for('shared')
  const largeView = { ...f.view, canvas: { files: [], artifacts: Array.from({ length: 100 }, (_, i) => ({
    ...f.view.canvas.artifacts[0], id: `node-${i}`, messageId: `message-${i}`, excerpt: '研究内容'.repeat(500)
  })) } }
  f.emit({ type: 'board', view: largeView })
  const apply = vi.spyOn(w, 'applyRemoteCanvas')
  const redraw = vi.fn(), off = w.subscribe(redraw)
  // IPC delivers new objects even when a session returns to the same canvas.
  const updates = Array.from({ length: 20 }, (_, i) => ({
    ...structuredClone(largeView), messages: [{ id: `message-${i}` }]
  }))
  const clone = vi.spyOn(globalThis, 'structuredClone')
  try {
    for (const view of updates) f.emit({ type: 'board', view })
    expect(apply.mock.calls.length).toBe(0)
    expect(redraw).not.toHaveBeenCalled()
    expect(clone).not.toHaveBeenCalled()
    expect(f.page.getView('shared').messages).toEqual(updates.at(-1).messages)
  } finally { clone.mockRestore(); off(); f.dispose() }
})
it('still applies same-revision progress changes, new revisions and revoked/regranted access', async () => {
  const f = await pageFixture(), w = f.registry.for('shared')
  const apply = vi.spyOn(w, 'applyRemoteCanvas')
  try {
    const progress = { ...f.view, canvas: { ...f.view.canvas,
      artifacts: f.view.canvas.artifacts.map(node => ({ ...node, generationOutputChars: 100 })) } }
    f.emit({ type: 'board', view: progress })
    expect(apply).toHaveBeenCalledTimes(1)
    expect(w.getSnapshot().artifacts[0].generationOutputChars).toBe(100)
    f.emit({ type: 'board', view: { ...progress, canvasRevision: 'new-revision' } })
    expect(apply).toHaveBeenCalledTimes(2)
    f.emit({ type: 'access', boardId: 'board', localSessionId: 'shared', recoveries: [] })
    expect(w.getSnapshot().artifacts).toEqual([])
    f.emit({ type: 'board', view: progress })
    expect(w.getSnapshot().artifacts[0].generationOutputChars).toBe(100)
    expect(apply).toHaveBeenCalledTimes(4)
  } finally { f.dispose() }
})
it('does not clone the entire canvas in the local subscription during remote application', async () => {
  const f = await pageFixture(), w = f.registry.for('shared')
  const clone = vi.spyOn(globalThis, 'structuredClone')
  try {
    f.emit({ type: 'board', view: { ...f.view, canvasRevision: 'changed' } })
    // One immutable observation is sufficient; the applying subscription must return first.
    expect(clone).toHaveBeenCalledTimes(1)
    expect(w.getSnapshot().artifacts).toHaveLength(1)
  } finally { clone.mockRestore(); f.dispose() }
})
it('update preparation saves actual workspaces and releases the input lock on failure', async () => {
  const f = await pageFixture()
  try {
    await f.page.prepareForUpdate()
    expect(f.window.document.body.inert).toBe(true)
    f.window.dispatchEvent(new f.window.Event('sherlock:boards:update-resume'))
    expect(f.window.document.body.inert).toBe(false)
    f.registry.for('shared').isCollaborationGesture = () => true
    await expect(f.page.prepareForUpdate()).rejects.toThrow('拖动')
    expect(f.window.document.body.inert).toBe(false)
  } finally { f.dispose() }
})
it('update preparation drains every already-started draft write when replies arrive out of order', async () => {
  const f = await pageFixture(), replies = []
  try {
    f.bridge.invoke.mockImplementation(action => action === 'recovery.saveDraft'
      ? new Promise(resolve => replies.push(resolve))
      : Promise.resolve({ ok: true, value: null }))
    f.page.saveDraft('shared', 'first')
    f.page.saveDraft('shared', 'latest')
    let done = false
    const prepared = f.page.prepareForUpdate().then(() => { done = true })
    replies[1]({ ok: true })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(done).toBe(false)
    replies[0]({ ok: true })
    await prepared
    expect(done).toBe(true)
    f.window.dispatchEvent(new f.window.Event('sherlock:boards:update-resume'))
    f.bridge.invoke.mockResolvedValue({ ok: false, error: { code: 'WRITE_FAILED', message: '保存失败' } })
    f.page.saveDraft('shared', 'failed')
    await expect(f.page.prepareForUpdate()).rejects.toThrow('草稿保存失败')
    expect(f.window.document.body.inert).toBe(false)
  } finally { f.dispose() }
})
it('serializes next local edits on localBranchRevision and never overwrites them with queued remote hydration', async () => {
  const f = await pageFixture(),
    w = f.registry.for('shared')
  const requests = [],
    resolvers = []
  f.bridge.invoke = vi.fn((action, input) => {
    if (action === 'canvas.apply') {
      requests.push(input)
      return new Promise((r) => resolvers.push(r))
    }
    return Promise.resolve({ ok: true, value: null })
  })
  try {
    w.setArtifacts([
      {
        ...w.getSnapshot().artifacts[0],
        excerpt: 'teammate secret baseline A'
      }
    ])
    await new Promise((r) => setTimeout(r, 120))
    expect(requests).toHaveLength(1)
    w.setArtifacts([
      {
        ...w.getSnapshot().artifacts[0],
        excerpt: 'teammate secret baseline AB'
      }
    ])
    f.emit({
      type: 'board',
      boardId: 'board',
      localSessionId: 'shared',
      view: {
        ...f.view,
        canvas: {
          files: [],
          artifacts: [
            {
              ...f.view.canvas.artifacts[0],
              excerpt: 'REMOTE teammate secret baseline'
            }
          ]
        },
        canvasRevision: 'remote',
        seq: 2
      }
    })
    expect(w.getSnapshot().artifacts[0].excerpt).toBe(
      'teammate secret baseline AB'
    )
    resolvers[0]({
      ok: true,
      value: {
        canvas: {
          files: [],
          artifacts: [
            {
              ...f.view.canvas.artifacts[0],
              excerpt: 'REMOTE teammate secret baseline A'
            }
          ]
        },
        canvasRevision: 'merged1',
        localBranchRevision: 'branchA',
        seq: 2,
        pendingCount: 1
      }
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(requests[1].baseRevision).toBe('branchA')
    expect(requests[1].canvas.artifacts[0].excerpt).toBe(
      'teammate secret baseline AB'
    )
    resolvers[1]({
      ok: true,
      value: {
        canvas: {
          files: [],
          artifacts: [
            {
              ...f.view.canvas.artifacts[0],
              excerpt: 'REMOTE teammate secret baseline AB'
            }
          ]
        },
        canvasRevision: 'merged2',
        localBranchRevision: 'branchAB',
        seq: 3,
        pendingCount: 1
      }
    })
    await new Promise((r) => setTimeout(r, 5))
    expect(w.getSnapshot().artifacts[0].excerpt).toBe(
      'REMOTE teammate secret baseline AB'
    )
  } finally {
    f.dispose()
  }
})
it('preserves immediate pre-IPC own input after revoke without retaining teammate full text', async () => {
  const f = await pageFixture()
  f.bridge.invoke = vi.fn(async () => ({
    ok: false,
    error: { code: 'ACCESS_DENIED', message: 'revoked' }
  }))
  const shell = {
    snapshot: { draft: 'my unfinished words' },
    setDraft: vi.fn()
  }
  f.hub.shells.set('shared', shell)
  try {
    f.page.saveDraft('shared', 'my unfinished words')
    const w = f.registry.for('shared')
    w.setArtifacts([
      {
        ...w.getSnapshot().artifacts[0],
        excerpt: 'teammate secret baseline MY INSERTION'
      }
    ])
    f.emit({
      type: 'access',
      boardId: 'board',
      localSessionId: 'shared',
      reason: 'REVOKED',
      epoch: 2,
      recoveries: []
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(w.getSnapshot().artifacts).toEqual([])
    const own = JSON.stringify(f.page.localRecovery())
    expect(own).toContain('my unfinished words')
    expect(own).toContain('MY INSERTION')
    expect(own).not.toContain('teammate secret baseline')
    expect(shell.setDraft).toHaveBeenCalledWith('')
  } finally {
    f.dispose()
  }
})
it('ignores old Research deactivation after another board activation', async () => {
  const f = await pageFixture()
  try {
    await f.page.activate('A', true)
    await f.page.activate('B', true)
    const before = f.bridge.invoke.mock.calls.length
    await f.page.activate('A', false)
    expect(
      f.bridge.invoke.mock.calls
        .slice(before)
        .some(([action]) => action === 'board.activate')
    ).toBe(false)
  } finally {
    f.dispose()
  }
})
it('keeps more than256 shared nodes when editing and atomically applying another collection', async () => {
  const f = await load()
  const w = new f.exports.ResearchWorkspaceRegistry().for('shared')
  const artifacts = Array.from({ length: 300 }, (_, i) => ({
    id: 'n' + i,
    messageId: 'n' + i,
    kind: 'pasted-text',
    title: 'Item' + i,
    excerpt: 'Value' + i,
    x: i,
    y: 0
  }))
  w.applyRemoteCanvas({ files: [], artifacts })
  w.setCollaborationAccess(true)
  w.setArtifacts(
    w
      .getSnapshot()
      .artifacts.map((n, i) => (i === 299 ? { ...n, excerpt: 'changed' } : n))
  )
  expect(w.getSnapshot().artifacts).toHaveLength(300)
  expect(w.getSnapshot().artifacts[299].excerpt).toBe('changed')
})

it('renders at most3 avatars plus overflow and removes manage action after access ends', async () => {
  const { ResearchBoardPresence, ResearchBoardHeader } = await import(
    '../src/preload/research-boards-ui.ts'
  )
  const React = require('react'),
    { renderToStaticMarkup } = require('react-dom/server')
  const view = {
    permissions: { read: true },
    board: { sharingState: 'shared' },
    presence: Array.from({ length: 7 }, (_, i) => ({
      userId: 'u' + i,
      username: 'Member' + i,
      role: i ? 'editor' : 'owner',
      joinedAt: i
    }))
  }
  const page = {
    subscribe: () => () => {},
    version: () => 1,
    getState: () => ({ account: { user: { userId: 'u0' } }, favorites: [] }),
    getView: () => view,
    isResearch: () => true
  }
  const rendered = renderToStaticMarkup(
    React.createElement(ResearchBoardPresence, { page, sessionId: 's' })
  )
  expect(rendered.match(/class="srb-avatar"/g)).toHaveLength(3)
  expect(rendered).toContain('+4')
  expect(rendered).toContain('Member0，创建者')
  view.permissions.read = false
  view.connection = 'revoked'
  const ended = renderToStaticMarkup(
    React.createElement(ResearchBoardHeader, { page, sessionId: 's' })
  )
  expect(ended).toContain('共享访问已结束')
  expect(ended).not.toContain('管理协作')
})

it('preserves exact references and mutation identity across unavailable and accepted task retry', async () => {
  const f = await pageFixture()
  const shell = {
    snapshot: { draft: '\ufffc 总结', draftRev: 4 },
    restoreDraftState: vi.fn(function (snapshot) { this.snapshot = { ...snapshot } }),
    notify: vi.fn(),
    setResearchContextPreparing: vi.fn(),
    commitSend: vi.fn(function () {
      this.snapshot = { draft: '', draftRev: 5 }
    })
  }
  f.hub.shells.set('shared', shell)
  const context = {
    scope: 'references',
    references: [{ collection: 'artifacts', nodeId: 'a' }]
  }
  let fail = true
  f.bridge.invoke.mockImplementation(async (action, input) =>
    action === 'request.submit'
      ? fail
        ? {
            ok: false,
            error: { code: 'EXECUTION_UNAVAILABLE', message: '尚未就绪' }
          }
        : {
            ok: true,
            value: {
              accepted: true,
              clientMutationId: input.clientMutationId,
              requestMessageId: 'message',
              taskId: null,
              state: 'taskCreateFailed'
            }
          }
      : { ok: true, value: null }
  )
  try {
    await f.page.submitShared(
      'shared',
      '@Team source 总结',
      context,
      [],
      'queue'
    )
    expect(shell.snapshot.draft).toBe('\ufffc 总结')
    expect(shell.commitSend).toHaveBeenCalledTimes(1)
    expect(shell.restoreDraftState).toHaveBeenCalledTimes(1)
    fail = false
    await f.page.submitShared(
      'shared',
      '@Team source 总结',
      context,
      [],
      'queue'
    )
    expect(shell.commitSend).toHaveBeenCalledTimes(2)
    await f.page.retryRequest('shared').retry()
    const calls = f.bridge.invoke.mock.calls
      .filter(([a]) => a === 'request.submit')
      .map(([, p]) => p)
    expect(new Set(calls.map((p) => p.clientMutationId)).size).toBe(1)
    expect(
      calls.every(
        (p) =>
          JSON.stringify(p.context) === JSON.stringify(context) &&
          p.text === '@Team source 总结'
      )
    ).toBe(true)
  } finally {
    f.dispose()
  }
})

it('retains edits made while sync is paused and retries old mutation before the newer branch', async () => {
  const f = await pageFixture(),
    w = f.registry.for('shared'),
    calls = []
  let failure = true
  f.bridge.invoke.mockImplementation(async (action, p) => {
    if (action !== 'canvas.apply') return { ok: true, value: null }
    calls.push(p)
    if (failure)
      return {
        ok: false,
        error: { code: 'NETWORK_ERROR', message: 'offline' }
      }
    return {
      ok: true,
      value: {
        canvas: p.canvas,
        canvasRevision: 'merged' + calls.length,
        localBranchRevision: 'branch' + calls.length,
        seq: calls.length,
        pendingCount: 0
      }
    }
  })
  try {
    w.setArtifacts([
      {
        ...w.getSnapshot().artifacts[0],
        excerpt: 'teammate secret baseline A'
      }
    ])
    await new Promise((r) => setTimeout(r, 130))
    expect(calls).toHaveLength(1)
    w.setArtifacts([
      {
        ...w.getSnapshot().artifacts[0],
        excerpt: 'teammate secret baseline AB'
      }
    ])
    expect(f.page.localRecovery()[0].text).toContain('B')
    failure = false
    await f.page.retryCanvas('shared')
    await new Promise((r) => setTimeout(r, 10))
    expect(calls).toHaveLength(3)
    expect(calls[1].clientMutationId).toBe(calls[0].clientMutationId)
    expect(calls[2].baseRevision).toBe('branch2')
    expect(calls[2].canvas.artifacts[0].excerpt).toBe(
      'teammate secret baseline AB'
    )
    expect(w.getSnapshot().artifacts[0].excerpt).toBe(
      'teammate secret baseline AB'
    )
  } finally {
    f.dispose()
  }
})

it('clears only shared shell text, references and preparation on account generation changes', async () => {
  const f = await pageFixture()
  const shared = {
      snapshot: { draft: 'old account reference' },
      setDraft: vi.fn(),
      setResearchContextPreparing: vi.fn()
    },
    personal = { setDraft: vi.fn(), setResearchContextPreparing: vi.fn() }
  f.hub.shells.set('shared', shared)
  f.hub.shells.set('personal', personal)
  f.bridge.isSharedSession = (id) => id === 'shared'
  const dialog = f.window.document.createElement('dialog')
  dialog.className = 'srb-dialog'
  f.window.document.body.append(dialog)
  try {
    f.emit({
      type: 'state',
      state: {
        ...f.page.getState(),
        eventSeq: 99,
        account: { status: 'signedOut', generation: 2, user: null },
        current: null
      }
    })
    expect(shared.setDraft).toHaveBeenCalledWith('')
    expect(shared.setResearchContextPreparing).toHaveBeenCalledWith(false)
    expect(personal.setDraft).not.toHaveBeenCalled()
    expect(dialog.isConnected).toBe(false)
  } finally {
    f.dispose()
  }
})

it('holds native gesture through remote hydration, emits previews, and commits only on persist', async () => {
  const f = await pageFixture(),
    w = f.registry.for('shared'),
    canvasCalls = []
  f.bridge.invoke.mockImplementation(async (action, p) => {
    if (action === 'canvas.apply') {
      canvasCalls.push(p)
      return {
        ok: true,
        value: {
          canvas: {
            ...p.canvas,
            artifacts: p.canvas.artifacts.map((n) => ({
              ...n,
              excerpt: 'teammate changed text'
            }))
          },
          canvasRevision: 'merged',
          localBranchRevision: 'branch',
          seq: 3,
          pendingCount: 0
        }
      }
    }
    return { ok: true, value: null }
  })
  try {
    w.setSelection({ selectedNodeIds: ['a'], orderedFileIds: [] })
    w.moveNodes(['a'], { x: 40, y: 20 }, 1, false)
    await new Promise((r) => setTimeout(r, 170))
    expect(canvasCalls).toHaveLength(0)
    expect(
      f.bridge.invoke.mock.calls.some(
        ([action, p]) =>
          action === 'presence.update' && p.previews?.[0]?.x === 240
      )
    ).toBe(true)
    f.emit({
      type: 'board',
      boardId: 'board',
      localSessionId: 'shared',
      view: {
        ...f.view,
        canvas: {
          ...f.view.canvas,
          artifacts: f.view.canvas.artifacts.map((n) => ({
            ...n,
            excerpt: 'teammate changed text'
          }))
        },
        canvasRevision: 'remote',
        seq: 2
      }
    })
    expect(w.getSnapshot().artifacts[0].x).toBe(240)
    expect(w.getSnapshot().artifacts[0].excerpt).toBe(
      'teammate secret baseline'
    )
    w.resizeNode('a', 'se', { x: 30, y: 10 }, 1, false)
    await new Promise((r) => setTimeout(r, 140))
    expect(canvasCalls).toHaveLength(0)
    w.persist()
    await new Promise((r) => setTimeout(r, 15))
    expect(canvasCalls).toHaveLength(1)
    expect(canvasCalls[0].baseRevision).toBe('base')
    expect(canvasCalls[0].canvas.artifacts[0].excerpt).toBe(
      'teammate secret baseline'
    )
    expect(w.getSnapshot().artifacts[0].excerpt).toBe('teammate changed text')
  } finally {
    f.dispose()
  }
})

it('budgets long-ID multiselection previews by bytes without truncating the final canvas', async () => {
  const f = await pageFixture(),
    w = f.registry.for('shared'),
    sent = []
  const artifacts = Array.from({ length: 100 }, (_, i) => ({
    ...f.view.canvas.artifacts[0],
    id: ('n' + i).padEnd(128, 'x'),
    messageId: ('n' + i).padEnd(128, 'x'),
    width: 400,
    height: 200
  }))
  f.bridge.invoke.mockImplementation(async (action, p) => {
    sent.push([action, p])
    return {
      ok: true,
      value:
        action === 'canvas.apply'
          ? {
              canvas: p.canvas,
              canvasRevision: 'merged',
              localBranchRevision: 'branch',
              seq: 2,
              pendingCount: 0
            }
          : null
    }
  })
  try {
    f.emit({
      type: 'board',
      boardId: 'board',
      localSessionId: 'shared',
      view: { ...f.view, canvas: { files: [], artifacts } }
    })
    w.setSelection({
      selectedNodeIds: artifacts.map((n) => n.id),
      orderedFileIds: []
    })
    w.moveNodes(
      artifacts.map((n) => n.id),
      { x: 10, y: 0 },
      1,
      false
    )
    await new Promise((r) => setTimeout(r, 140))
    const hint = sent
      .filter(([action]) => action === 'presence.update')
      .at(-1)[1]
    const { boardId, ...payload } = hint
    expect(
      new TextEncoder().encode(JSON.stringify(payload)).byteLength
    ).toBeLessThanOrEqual(8192)
    expect(payload.previews.length).toBeGreaterThan(0)
    expect(payload.previews.length).toBeLessThan(100)
    w.persist()
    await new Promise((r) => setTimeout(r, 15))
    expect(
      sent.find(([a]) => a === 'canvas.apply')[1].canvas.artifacts
    ).toHaveLength(100)
  } finally {
    f.dispose()
  }
})

it('upgrades the committed Task3 transform to gesture hooks without duplicate patching', async () => {
  const { execFileSync } = await import('node:child_process'),
    { mkdir, writeFile } = await import('node:fs/promises'),
    { pathToFileURL } = await import('node:url')
  const oldSource = execFileSync(
    'git',
    [
      'show',
      'edfcc87820d8ca611861692b0541c533ad96c7f8:scripts/lib/patch-research-board-client.mjs'
    ],
    { encoding: 'utf8' }
  ).replace(
    "const root = fileURLToPath(new URL('../..', import.meta.url))",
    'const root = ' + JSON.stringify(process.cwd())
  )
  await mkdir('output/playwright/source-checks', { recursive: true })
  const path =
    process.cwd() +
    '/output/playwright/source-checks/task3-base-transform.mjs'
  await writeFile(path, oldSource.replace(/external: \[.react.\]/, "external: ['react', '@deepseek-ai/dsh-client-ui-primitives']"))
  const old = await import(pathToFileURL(path).href + '?v=' + Date.now())
  const raw = await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
    'utf8'
  )
  const upgraded = await patchResearchBoardConversation(
    await old.patchResearchBoardConversation(raw)
  )
  expect(upgraded).toBe(await patchResearchBoardConversation(raw))
  expect(await patchResearchBoardConversation(upgraded)).toBe(upgraded)
})

it.each(['revoke', 'finish'])(
  'retains only the unacknowledged held gesture after an earlier ACK then %s',
  async (ending) => {
    const f = await pageFixture(),
      w = f.registry.for('shared'),
      requests = [],
      resolve = []
    f.bridge.invoke.mockImplementation((action, input) => {
      if (action === 'canvas.apply') {
        requests.push(input)
        return new Promise((r) => resolve.push(r))
      }
      return Promise.resolve({ ok: true, value: null })
    })
    const ack = (index) =>
      resolve[index]({
        ok: true,
        value: {
          canvas: {
            ...requests[index].canvas,
            artifacts: requests[index].canvas.artifacts.map((n) => ({
              ...n,
              title: 'teammate later title'
            }))
          },
          canvasRevision: 'merged' + index,
          localBranchRevision: 'branch' + index,
          seq: 2 + index,
          pendingCount: 0
        }
      })
    try {
      w.setArtifacts([
        {
          ...w.getSnapshot().artifacts[0],
          excerpt: 'teammate secret baseline OWN_ACKED_TEXT'
        }
      ])
      await new Promise((r) => setTimeout(r, 130))
      expect(requests).toHaveLength(1)
      w.setSelection({ selectedNodeIds: ['a'], orderedFileIds: [] })
      w.moveNodes(['a'], { x: 45, y: 10 }, 1, false)
      expect(w.getSnapshot().artifacts[0].x).toBe(245)
      w.resizeNode('a', 'se', { x: 30, y: 20 }, 1, false)
      const held = w.getSnapshot().artifacts[0]
      expect(held.width).toBeGreaterThan(0)
      expect(f.page.localRecovery()[0].text).toContain('OWN_ACKED_TEXT')
      ack(0)
      await new Promise((r) => setTimeout(r, 0))
      const tail = f.page
        .localRecovery()
        .map((r) => r.text)
        .join('\n')
      expect(tail).toContain('a x: ' + held.x)
      expect(tail).toContain('a width: ' + held.width)
      expect(tail).not.toContain('OWN_ACKED_TEXT')
      expect(tail).not.toContain('teammate')
      expect(w.getSnapshot().artifacts[0].x).toBe(held.x)
      expect(requests).toHaveLength(1)
      if (ending === 'revoke') {
        f.emit({
          type: 'access',
          boardId: 'board',
          localSessionId: 'shared',
          reason: 'REVOKED',
          epoch: 2,
          recoveries: []
        })
        expect(w.getSnapshot().artifacts).toEqual([])
        expect(
          f.page
            .localRecovery()
            .map((r) => r.text)
            .join('\n')
        ).toBe(tail)
      } else {
        w.persist()
        await new Promise((r) => setTimeout(r, 0))
        expect(requests).toHaveLength(2)
        expect(requests[1].baseRevision).toBe('branch0')
        expect(requests[1].canvas.artifacts[0].x).toBe(held.x)
        expect(
          f.page
            .localRecovery()
            .map((r) => r.text)
            .join('\n')
        ).toBe(tail)
        ack(1)
        await new Promise((r) => setTimeout(r, 0))
        expect(f.page.localRecovery()).toEqual([])
        expect(w.getSnapshot().artifacts[0].x).toBe(held.x)
      }
    } finally {
      f.dispose()
    }
  }
)
it('Task4 transformed shared generation uses the board adapter without private fetch', async () => {
  const t = await load(true)
  expect(typeof t).toBe('object')
  const raw = await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js',
    'utf8'
  )
  const source = await patchResearchBoardConversation(raw)
  expect(source).toContain('sherlockBoardsAdapter.generateShared')
  expect(source).toContain('node.collaborationAssetId')
  expect(source).toContain('PersonalResearchHistory')
})

it('coalesces repeated component generation clicks before cloud acknowledgement', async () => {
  const f = await pageFixture()
  let release
  f.bridge.invoke.mockImplementation(async action => {
    if (action === 'request.submit') { await new Promise(r => { release = r }); return { ok: true, value: { accepted: true, taskId: 'single-task' } } }
    return { ok: true }
  })
  try {
    const request = { sessionId: 'shared', targetNodeId: 'a', kind: 'container', prompt: '创建计数器' }
    const pending = Array.from({ length: 9 }, () => f.page.generateShared('shared', request))
    await vi.waitFor(() => expect(f.bridge.invoke.mock.calls.filter(c => c[0] === 'request.submit')).toHaveLength(1))
    release()
    expect((await Promise.all(pending)).every(r => r.taskId === 'single-task')).toBe(true)
    // The command can be acknowledged before the task snapshot reaches React.
    await f.page.generateShared('shared', request)
    expect(f.bridge.invoke.mock.calls.filter(c => c[0] === 'request.submit')).toHaveLength(1)
  } finally { f.dispose() }
})

it('applies a retained result from the component without another model request', async () => {
  const f = await pageFixture()
  try {
    f.emit({ type: 'board', view: { ...f.view, seq: 2, tasks: [{ taskId: 'retained', targetId: 'a', status: 'completed', resultState: 'pendingResult' }] } })
    expect(f.page.hasRetainedResult('shared', 'a')).toBe(true)
    await f.page.applyRetainedResult('shared', 'a')
    expect(f.bridge.invoke).toHaveBeenCalledWith('task.applyResult', { boardId: 'board', taskId: 'retained' })
    expect(f.bridge.invoke.mock.calls.some(c => c[0] === 'request.submit')).toBe(false)
    expect(f.source).toContain("retryLabel:(sherlockShared(sessionId)&&sherlockBoardsAdapter?.hasRetainedResult(sessionId,node.id))?'应用保留的研究结果':undefined")
  } finally { f.dispose() }
})

it('places imported history before real native chat flow and suppresses the empty surface only while the native conversation is empty', async () => {
  const { source } = await load(false)
  expect(source).toContain('PersonalResearchHistory,{sessionId,flow:true')
  expect(source).toContain(
    'PersonalResearchHistory,{sessionId,empty:researchEmpty'
  )
})

it('resumes newly authorized editing after read revalidation without replaying retired changes', async () => {
  const f = await pageFixture(), w = f.registry.for('shared'), submitted = []
  f.bridge.invoke.mockImplementation(async (action, p) => {
    if (action !== 'canvas.apply') return { ok: true, value: null }
    submitted.push(p)
    return { ok: true, value: { canvas: p.canvas, canvasRevision: 'accepted', localBranchRevision: 'accepted-local', seq: 3, pendingCount: 0 } }
  })
  try {
    f.emit({ type: 'board', view: { ...f.view, connection: 'revalidating', permissions: { read: false, edit: false, manage: false, execute: false }, canvas: { files: [], artifacts: [] } } })
    w.setArtifacts([{ id: 'forbidden', kind: 'pasted-text', excerpt: 'not authorized' }])
    f.emit({ type: 'board', view: { ...f.view, canvasRevision: 'fresh-authority', seq: 2 } })
    w.setArtifacts(w.getSnapshot().artifacts.map(n => ({ ...n, excerpt: n.excerpt + ' NEW OWN' })))
    await new Promise(r => setTimeout(r, 160))
    expect(submitted).toHaveLength(1)
    expect(submitted[0].baseRevision).toBe('fresh-authority')
    expect(submitted[0].canvas.artifacts[0].excerpt).toBe('teammate secret baseline NEW OWN')
    expect(submitted[0].canvas.artifacts.some(n => n.id === 'forbidden')).toBe(false)
  } finally { f.dispose() }
})

it.each(['u', 'other'])(
  'retires activation across null account states and isolates recovery for ready %s',
  async (userId) => {
    const f = await pageFixture()
    const shell = {
      snapshot: { draft: 'A private recovery' },
      setDraft(text) {
        this.snapshot.draft = text
      },
      setResearchContextPreparing() {}
    }
    f.hub.shells.set('shared', shell)
    f.bridge.invoke.mockImplementation(async (action) => ({
      ok: true,
      value:
        action === 'board.open'
          ? { localSessionId: 'shared' }
          : action === 'board.activate'
            ? f.view
            : null
    }))
    const emitAccount = (status, generation, user) =>
      f.emit({
        type: 'state',
        accountGeneration: generation,
        state: {
          ...f.page.getState(),
          eventSeq: f.page.getState().eventSeq + 1,
          account: { status, generation, user },
          current: null
        }
      })
    try {
      await f.page.activate('shared', true)
      emitAccount('signedOut', 2, null)
      expect(f.page.localRecovery().map((r) => r.text)).toContain(
        'A private recovery'
      )
      emitAccount('loading', 3, null)
      const dialog = f.window.document.createElement('dialog')
      dialog.className = 'srb-dialog'
      dialog.textContent = 'A private recovery'
      f.window.document.body.append(dialog)
      emitAccount('ready', 3, {
        userId,
        publicId: '0000000001',
        username: userId
      })
      if (userId !== 'u') {
        expect(f.page.localRecovery()).toEqual([])
        expect(dialog.isConnected).toBe(false)
      } else {
        expect(f.page.localRecovery().map((r) => r.text)).toContain(
          'A private recovery'
        )
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(
          f.bridge.invoke.mock.calls.filter(
            ([action, p]) =>
              action === 'board.activate' && p.localSessionId === 'shared'
          )
        ).toHaveLength(2)
        expect(f.sessions.open).not.toHaveBeenCalled()
        expect(f.page.getView('shared').permissions.edit).toBe(true)
      }
    } finally {
      f.dispose()
    }
  }
)

it('renders reversed same-author answers and task controls under their durable request identities', async () => {
  const { ResearchBoardDiscussion } =
    await import('../src/preload/research-boards-ui.ts')
  const React = require('react'),
    { renderToStaticMarkup } = require('react-dom/server')
  const w = new Window()
  const author = { username: '同一个提问者' }
  const view = {
    boardId: 'board',
    permissions: { read: true },
    history: [{ id: 'q1', role: 'user', text: 'imported baseline' }],
    messages: [
      { id: 'q1', role: 'user', text: 'Q1', author },
      { id: 'q2', role: 'user', text: 'Q2', author },
      {
        id: 'a2',
        role: 'assistant',
        text: 'A2',
        requestMessageId: 'q2',
        author
      },
      {
        id: 'a1',
        role: 'assistant',
        text: 'A1',
        requestMessageId: 'q1',
        author
      },
      {
        id: 'orphan',
        role: 'assistant',
        text: 'orphan answer',
        requestMessageId: 'missing'
      }
    ],
    tasks: [
      { taskId: 't1', requestMessageId: 'q1', status: 'running' },
      {
        taskId: 't2',
        requestMessageId: 'q2',
        status: 'completed',
        resultState: 'pendingResult'
      }
    ]
  }
  const page = {
    subscribe: () => () => {},
    version: () => 1,
    getView: () => view,
    getState: () => ({}),
    retryRequest: () => null
  }
  w.document.body.innerHTML = renderToStaticMarkup(
    React.createElement(ResearchBoardDiscussion, { page, sessionId: 's' })
  )
  expect(
    [...w.document.querySelectorAll('.srb-message p')].map(
      (el) => el.textContent
    )
  ).toEqual(['imported baseline', 'Q1', 'A1', 'Q2', 'A2', 'orphan answer'])
  expect(
    w.document.querySelector('[data-request-message-id="q1"]').textContent
  ).toContain('正在研究')
  expect(
    w.document.querySelector('[data-request-message-id="q2"]').textContent
  ).toContain('应用保留')
  expect(w.document.querySelectorAll('[data-message-id="a1"]')).toHaveLength(
    1
  )
  w.happyDOM.abort()
})

it('does not let old-account queued edits or draft ACKs repopulate recovery after ready B', async () => {
  const f = await pageFixture(), w = f.registry.for('shared')
  let settleCanvas, settleDraft
  const calls = []
  f.bridge.invoke.mockImplementation((action, p) => {
    calls.push(action)
    if (action === 'canvas.apply') return new Promise(resolve => { settleCanvas = () => resolve({ ok: true, value: { canvas: p.canvas, localBranchRevision: 'old', canvasRevision: 'old', seq: 2, pendingCount: 0 } }) })
    if (action === 'recovery.saveDraft') return new Promise(resolve => { settleDraft = () => resolve({ ok: true, value: {} }) })
    return Promise.resolve({ ok: true, value: null })
  })
  try {
    f.page.saveDraft('shared', 'A private late draft')
    w.setArtifacts([{ ...f.view.canvas.artifacts[0], excerpt: 'first own edit' }])
    await new Promise(r => setTimeout(r, 120))
    w.setArtifacts([{ ...f.view.canvas.artifacts[0], excerpt: 'second queued own edit' }])
    for (const [status, generation, user] of [['signedOut', 2, null], ['loading', 3, null], ['ready', 3, { userId: 'B' }]])
      f.emit({ type: 'state', accountGeneration: generation, state: { ...f.page.getState(), eventSeq: f.page.getState().eventSeq + 1, account: { status, generation, user }, current: null } })
    settleCanvas(); settleDraft()
    await new Promise(r => setTimeout(r, 140))
    expect(calls.filter(a => a === 'canvas.apply')).toHaveLength(1)
    expect(f.page.localRecovery()).toEqual([])
    expect(w.getSnapshot().artifacts).toEqual([])
  } finally { f.dispose() }
})

it('workspace section collapse survives reapplying the actual module patch', async () => {
  const raw = await readFile(
    'node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js',
    'utf8'
  )
  const patched = patchFigmaWorkspaceMenus(patchResearchBoardWorkspace(raw))
  expect(patchResearchBoardWorkspace(patched)).toBe(patched)
  expect(() => new Script(patched)).not.toThrow()
  const menu = patched.slice(patched.indexOf('function ViewOptionsMenu('), patched.indexOf('function workspaceGroupHalf('))
  expect(menu).toContain('const [open, setOpen]')
  expect(menu).toContain('className: "odyssey-view-menu", open,')
  expect(menu).toContain('"aria-expanded": open')

  expect(patched).toContain('"aria-expanded":!sectionCollapsed')
  expect(patched).toContain(
    'hidden:wide && sectionCollapsed && !searchExpanded'
  )
})
it('completed generated HTML and table provide real content to selection tools', async () => {
  const { exports, window } = await load(false)
  for (const spec of [
    { version: 1, type: 'html', title: '计数器', html: '<p>研究结果</p>' },
    {
      version: 1,
      type: 'table',
      title: '表格',
      columns: ['项目', '结果'],
      rows: [['邀请', '已验证']]
    }
  ]) {
    const sources = exports.researchGenerationSources(
      {
        files: [],
        artifacts: [
          {
            id: 'n',
            title: spec.title,
            kind: 'generated-container',
            generationStatus: 'completed',
            containerSpec: spec
          }
        ]
      },
      ['n'],
      true
    )
    expect(sources?.[0]?.text).toContain(
      spec.type === 'html' ? '研究结果' : '已验证'
    )
  }
  window.happyDOM.abort()
})

// Login recovery must use fresh authority without requiring a sidebar round trip.
it('restores only the selected research board after ready and ignores stale activation across accounts', async () => {
  const f = await pageFixture(), waiting = []
  vi.stubGlobal('Event', f.window.Event)
  const emitAccount = (status, generation, userId, boards = f.page.getState().boards) => f.emit({
    type: 'state', accountGeneration: generation,
    state: { ...f.page.getState(), eventSeq: f.page.getState().eventSeq + 1,
      account: { status, generation, user: userId ? { userId } : null }, boards, current: null }
  })
  try {
    await f.page.activate('shared', true)
    f.bridge.invoke.mockClear()
    f.bridge.invoke.mockImplementation((action, input) => action === 'board.activate' && input.localSessionId
      ? new Promise(resolve => waiting.push(resolve)) : Promise.resolve({ ok: true }))
    emitAccount('signedOut', 2, null)
    await f.page.activate('shared', true)
    emitAccount('loading', 3, null)
    expect(f.bridge.invoke.mock.calls.filter(([action]) => action !== 'presence.update')).toEqual([])
    emitAccount('ready', 3, 'u')
    emitAccount('ready', 3, 'u')
    expect(waiting).toHaveLength(1)
    expect(f.page.getView('shared')).toBeNull()
    emitAccount('signedOut', 4, null)
    emitAccount('loading', 5, null)
    emitAccount('ready', 5, 'other', [])
    waiting[0]({ ok: true, value: f.view })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.page.getView('shared')).toBeNull()
    expect(f.registry.for('shared').getSnapshot().artifacts).toEqual([])
    expect(f.bridge.invoke.mock.calls.map(([action]) => action).filter(action => action !== 'presence.update')).toEqual(['board.activate'])
  } finally { f.dispose(); vi.unstubAllGlobals() }
})
it('does not hydrate a login activation after leaving research and permits explicit retry after failure', async () => {
  const f = await pageFixture()
  let release
  const emitReady = generation => f.emit({ type: 'state', accountGeneration: generation,
    state: { ...f.page.getState(), eventSeq: f.page.getState().eventSeq + 1,
      account: { status: 'ready', generation, user: { userId: 'u' } }, current: null } })
  try {
    await f.page.activate('shared', true)
    f.bridge.invoke.mockImplementation((action, input) => action === 'board.activate' && input.localSessionId
      ? new Promise(resolve => { release = resolve }) : Promise.resolve({ ok: true, value: null }))
    emitReady(2)
    expect(release).toBeTypeOf('function')
    await f.page.activate('shared', false)
    release({ ok: true, value: f.view })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.page.getView('shared')).toBeNull()
    f.bridge.invoke.mockResolvedValueOnce({ ok: false, error: { code: 'NETWORK', message: 'offline' } })
    await f.page.activate('shared', true)
    f.bridge.invoke.mockResolvedValue({ ok: true, value: f.view })
    await f.page.activate('shared', true)
    expect(f.page.getView('shared')?.permissions.read).toBe(true)
  } finally { f.dispose() }
})

it.each(['personal', 'conversation'])('does not reactivate an old board when login returns to %s', async selected => {
  const f = await pageFixture()
  try {
    await f.page.activate('shared', true)
    if (selected === 'conversation') await f.page.activate('shared', false)
    else f.sessions.list.getSnapshot().current = 'personal'
    f.bridge.invoke.mockClear()
    f.emit({ type: 'state', accountGeneration: 2, state: { ...f.page.getState(),
      eventSeq: f.page.getState().eventSeq + 1, account: { status: 'ready', generation: 2, user: { userId: 'u' } }, current: null } })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(f.bridge.invoke.mock.calls.filter(([action]) => action === 'board.activate' || action === 'request.submit')).toEqual([])
    expect(f.page.getView('shared')).toBeNull()
  } finally { f.dispose() }
})

it('renaming a board session also persists its favorite title',async()=>{
 const f=await pageFixture([{favoriteId:'favorite',sessionId:'shared',title:'旧名'}])
 const rename=vi.fn(async()=>{});f.sessions.binding=()=>({session:{rename}})
 try{await f.page.renamePersonal('shared','新研究标题');expect(rename).toHaveBeenCalledWith('新研究标题');expect(f.bridge.invoke).toHaveBeenCalledWith('favorite.rename',{favoriteId:'favorite',title:'新研究标题'})}finally{f.dispose()}
})

it('binds canvas tools to the shared request references before submitting the task',async()=>{
 const f=await pageFixture()
 const bind=vi.fn(async()=>({ok:true}))
 f.window.dshDesktop.researchCanvasActions={bind}
 try{
   await f.page.submitShared('shared','删除引用的组件',{scope:'references',references:[{collection:'artifacts',nodeId:'a'}]},[],'queue')
   expect(bind).toHaveBeenCalledWith({sessionId:'shared',selectedIds:['a']})
 }finally{f.dispose()}
})

it('syncs generated session titles into pinned personal board titles', async () => {
 const f=await pageFixture([{favoriteId:'favorite',sessionId:'shared',title:'新研究看板'}])
 try {
   f.sessions.list.getSnapshot().byId.shared.title='公司员工管理工作台'
   f.emitSessions(); await new Promise(resolve=>setTimeout(resolve,0))
   expect(f.bridge.invoke).toHaveBeenCalledWith('favorite.rename',{favoriteId:'favorite',title:'公司员工管理工作台'})
 } finally {f.dispose()}
})

it('refreshes referenced webpage text before a shared chat request', async () => {
  const f=await pageFixture()
  try {
    const node={id:'web',kind:'web-link',messageId:'web',title:'搜索',url:'https://www.bing.com/',excerpt:'https://www.bing.com/',sourceText:'旧正文',x:0,y:0}
    f.emit({type:'board',view:{...f.view,canvasRevision:'web-revision',canvas:{files:[],artifacts:[node]}}})
    const inspection={title:'搜索结果',url:node.url,sourceText:'当前网页的实际内容',scrollWidth:800,clientWidth:600}
    const inspect=vi.fn(async()=>inspection)
    f.window.dshDesktop.researchLinkFrame={inspect}
    const apply=vi.spyOn(f.registry.for('shared'),'applyWebLinkInspection')
    await f.page.submitShared('shared','总结网页',{scope:'references',references:[{collection:'artifacts',nodeId:'web'}]},[],'queue')
    expect(inspect).toHaveBeenCalledWith({sessionId:'shared',nodeId:'web'})
    expect(apply).toHaveBeenCalledWith('web',node.url,inspection)
    expect(f.registry.for('shared').getSnapshot().artifacts[0].sourceText).toBe(inspection.sourceText)
  } finally {f.dispose()}
})


it('opens a pinned board before the remote read and shares repeated activation while loading', async () => {
  const f = await pageFixture()
  vi.stubGlobal('document', f.window.document)
  vi.stubGlobal('Event', f.window.Event)
  let finish
  f.bridge.invoke.mockImplementation(action => action === 'board.activate'
    ? new Promise(resolve => { finish = resolve }) : Promise.resolve({ok: true}))
  try {
    const first = f.page.openBoard('board')
    expect(f.sessions.open).toHaveBeenCalledWith('shared')
    expect(f.window.document.documentElement.dataset.srbSelectedSession).toBe('shared')
    expect(f.page.isLoading('shared')).toBe(true)
    const second = f.page.openBoard('board')
    await Promise.resolve()
    expect(f.bridge.invoke.mock.calls.filter(([action]) => action === 'board.activate')).toHaveLength(1)
    expect(f.bridge.invoke.mock.calls.some(([action]) => action === 'board.open')).toBe(false)
    finish({ok: true, value: {...f.view, canvasRevision: 'fresh'}})
    await Promise.all([first, second])
    expect(f.page.isLoading('shared')).toBe(false)
    expect(f.page.getView('shared').canvasRevision).toBe('fresh')
  } finally { f.dispose(); vi.unstubAllGlobals() }
})

it('ends loading on failure and can retry the board without leaving it', async () => {
  const f = await pageFixture()
  try {
    f.bridge.invoke.mockResolvedValueOnce({ok: false, error: {code:'NETWORK_ERROR', message:'网络不可用'}})
    await f.page.activate('shared', true)
    expect(f.page.isLoading('shared')).toBe(false)
    expect(f.page.activationError('shared')).toBeTruthy()
    await f.page.activate('shared', true)
    expect(f.page.activationError('shared')).toBeUndefined()
    expect(f.page.getView('shared').permissions.read).toBe(true)
  } finally { f.dispose() }
})

it('keeps the latest loading flight when a previous activation resolves after a round trip', async () => {
  const f = await pageFixture(), waiting = []
  f.bridge.invoke.mockImplementation(action => action === 'board.activate'
    ? new Promise(resolve => waiting.push(resolve)) : Promise.resolve({ok:true}))
  try {
    const a = f.page.activate('shared', true)
    const b = f.page.activate('other', true)
    const c = f.page.activate('shared', true)
    await Promise.resolve()
    waiting[0]({ok:true, value:{...f.view, canvasRevision:'stale'}})
    await a
    expect(f.page.isLoading('shared')).toBe(true)
    expect(f.page.getView('shared').canvasRevision).toBe('base')
    waiting[1]({ok:true, value:null}); waiting[2]({ok:true, value:{...f.view, canvasRevision:'latest'}})
    await Promise.all([b,c])
    expect(f.page.isLoading('shared')).toBe(false)
    expect(f.page.getView('shared').canvasRevision).toBe('latest')
  } finally { f.dispose() }
})
