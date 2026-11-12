import { act, createElement, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { Window, type HTMLButtonElement } from 'happy-dom'
import { expect, it, vi } from 'vitest'
import type { BoardView, ResearchBoardsEvent } from '../src/shared/research-boards'
import { createResearchBoardsPage, ResearchBoardCanvasOverlay, ResearchBoardHeader } from '../src/preload/research-boards-ui'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({}))

async function pageFixture() {
  const win = new Window({ url: 'http://localhost/' })
  const node = {
    id: 'card', title: 'Original title', excerpt: 'Original text', x: 20, y: 20,
    config: { theme: 'light', label: 'Original label' }
  }
  const view = {
    boardId: 'board', localSessionId: 'shared', epoch: 1, seq: 1,
    board: {
      boardId: 'board', ownerId: 'u', title: 'Board', sharingState: 'shared',
      sharingEpoch: 1, lifecycle: 'active', cutoffSeq: null, seq: 1,
      schemaVersion: 1, capturedAt: '2026-11-12T00:00:00.000Z', createdAt: 0
    },
    connection: 'online', permissions: { read: true, edit: true, manage: true, execute: true },
    canvas: { files: [], artifacts: [node] }, canvasRevision: 'base',
    history: [], messages: [], tasks: [], members: [], presence: [], recoveries: [],
    pendingCount: 0, canUndo: false, canRedo: false
  } satisfies BoardView
  const state = {
    version: 1, eventSeq: 1, account: { status: 'ready', generation: 1, user: { userId: 'u' } },
    favorites: [], boards: [], current: view, recoveries: [],
    notifications: { notifications: [], cursor: 0, unreadCount: 0, pendingCount: 0 }
  }
  let receive: (event: ResearchBoardsEvent) => void = () => {}
  const bridge = {
    isSharedSession: (id: string) => id === 'shared',
    getSnapshot: async () => state,
    subscribe: (listener: typeof receive) => { receive = listener; return () => {} },
    invoke: vi.fn(async (_action: string, _input?: any): Promise<any> => ({ ok: true, value: null }))
  }
  const listeners = new Set<() => void>()
  let snapshot = { ...view.canvas, viewport: { x: 0, y: 0, scale: 1 } }
  const workspace = {
    getSnapshot: () => snapshot,
    subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) },
    setArtifacts: (artifacts: typeof snapshot.artifacts) => {
      snapshot = { ...snapshot, artifacts }
      listeners.forEach(fn => fn())
    },
    applyRemoteCanvas: (canvas: typeof view.canvas) => {
      snapshot = { ...snapshot, ...structuredClone(canvas) }
      listeners.forEach(fn => fn())
    },
    setCollaborationAccess() {},
    cancelTransient() {}
  }
  const shells = new Map<string, any>()
  const noSubscription = () => () => {}
  const page = createResearchBoardsPage({
    document: win.document as unknown as Document,
    sessions: {
      list: { getSnapshot: () => ({ current: 'shared', byId: {} }), subscribe: noSubscription },
      open() {}, binding: () => undefined, create: async () => 'new'
    },
    workspaces: { list: { getSnapshot: () => ({ items: [] }), subscribe: noSubscription } },
    researchWorkspaces: { for: () => workspace },
    inputHub: { shells },
    bridge: bridge as any
  })
  await vi.waitFor(() => expect(page.getView('shared')).toBeTruthy())
  return { page, bridge, workspace, view, win, shells, emit: receive, dispose() { page.dispose(); void win.happyDOM.abort() } }
}

it.each(['STALE_CANVAS_REVISION', 'MUTATION_ALREADY_APPLIED'])(
  'refreshes an expired or acknowledged mutation before safely syncing later edits (%s)',
  async code => {
    const f = await pageFixture(), w = f.workspace
    const sent: any[] = []
    const updated = code === 'MUTATION_ALREADY_APPLIED' ? 'my first edit' : f.view.canvas.artifacts[0]!.excerpt
    const fresh = { ...f.view, seq: 2, canvasRevision: 'fresh', canvas: { files: [], artifacts: [
      { ...f.view.canvas.artifacts[0]!, title: 'Updated by a collaborator', excerpt: updated }
    ] } }
    f.bridge.invoke.mockImplementation(async (action, input) => {
      if (action === 'canvas.refresh') return { ok: true, value: fresh }
      if (action !== 'canvas.apply') return { ok: true, value: null }
      sent.push(input)
      if (sent.length === 1) return { ok: false, error: { code, message: 'expired mutation' } }
      return { ok: true, value: { ...fresh, canvas: input.canvas, localBranchRevision: 'new-branch' } }
    })
    try {
      w.setArtifacts([{ ...w.getSnapshot().artifacts[0]!, excerpt: 'my first edit' }])
      await vi.waitFor(() => expect(sent).toHaveLength(1))
      w.setArtifacts([{ ...w.getSnapshot().artifacts[0]!, excerpt: 'my latest edit' }])
      await f.page.retryCanvas('shared')
      expect(f.bridge.invoke).toHaveBeenCalledWith('canvas.refresh', { boardId: 'board', localSessionId: 'shared' })
      expect(sent[1].baseRevision).toBe('fresh')
      expect(sent[1].clientMutationId).not.toBe(sent[0].clientMutationId)
      expect(w.getSnapshot().artifacts[0]!).toMatchObject({ title: 'Updated by a collaborator', excerpt: 'my latest edit' })
      expect(f.page.canvasSyncNotice('shared')).toBeUndefined()
    } finally { f.dispose() }
  }
)
it('applies the pending edit on the same field and preserves other changes', async () => {
  const f = await pageFixture(), w = f.workspace
  const node = f.view.canvas.artifacts[0]!
  const fresh = { ...f.view, seq: 2, canvasRevision: 'fresh', canvas: { files: [], artifacts: [
    { ...node, title: 'collaborator title', excerpt: 'collaborator edit', config: { ...node.config, theme: 'dark' } },
    { ...node, id: 'another-card' }
  ] } }
  let writes = 0
  f.bridge.invoke.mockImplementation(async (action, input) => {
    if (action === 'canvas.refresh') return { ok: true, value: fresh }
    if (action !== 'canvas.apply') return { ok: true, value: null }
    if (++writes === 1) return { ok: false, error: { code: 'STALE_CANVAS_REVISION', message: 'expired mutation' } }
    expect(input.requireLatest).toBe(true)
    const [freshContent, anotherCard] = fresh.canvas.artifacts.map(({ x: _x, y: _y, ...content }) => content)
    expect(input.canvas.artifacts).toEqual([
      { ...freshContent, excerpt: 'my local edit', config: { theme: 'dark', label: 'My label' } },
      anotherCard
    ])
    return { ok: true, value: { ...fresh, canvas: input.canvas, localBranchRevision: 'new-branch' } }
  })
  try {
    w.setArtifacts([{ ...node, excerpt: 'my local edit', config: { ...node.config, label: 'My label' } }])
    await vi.waitFor(() => expect(f.page.canvasSyncNotice('shared')).toMatchObject({ kind: 'stale' }))
    await f.page.retryCanvas('shared')
    expect(writes).toBe(2)
    expect(w.getSnapshot().artifacts[0]!.excerpt).toBe('my local edit')
    expect(f.page.canvasSyncNotice('shared')).toBeUndefined()
  } finally { f.dispose() }
})

it('does not replay an acknowledged edit over a newer collaborator edit', async () => {
  const f = await pageFixture()
  const fresh = { ...f.view, seq: 2, canvasRevision: 'fresh', canvas: { files: [], artifacts: [
    { ...f.view.canvas.artifacts[0]!, excerpt: 'newer collaborator edit' }
  ] } }
  f.bridge.invoke.mockImplementation(async action => {
    if (action === 'canvas.refresh') return { ok: true, value: fresh }
    if (action !== 'canvas.apply') return { ok: true, value: null }
    return { ok: false, error: { code: 'MUTATION_ALREADY_APPLIED', message: 'already recorded' } }
  })
  try {
    f.workspace.setArtifacts([{ ...f.view.canvas.artifacts[0]!, excerpt: 'already recorded edit' }])
    await vi.waitFor(() => expect(f.page.canvasSyncNotice('shared')).toMatchObject({ kind: 'recorded' }))
    await f.page.retryCanvas('shared')
    expect(f.bridge.invoke.mock.calls.filter(([action]) => action === 'canvas.apply')).toHaveLength(1)
    expect(f.workspace.getSnapshot().artifacts[0]!.excerpt).toBe('newer collaborator edit')
    expect(f.page.canvasSyncNotice('shared')).toBeUndefined()
  } finally { f.dispose() }
})

it('retries an uncertain write only on request and reuses its mutation ID', async () => {
  const f = await pageFixture()
  const writes: { clientMutationId: string; canvas: typeof f.view.canvas }[] = []
  f.bridge.invoke.mockImplementation(async (action, input) => {
    if (action !== 'canvas.apply') return { ok: true, value: null }
    writes.push(input)
    if (writes.length === 1) return { ok: false, error: { code: 'NETWORK_ERROR', message: 'ACK lost' } }
    return { ok: true, value: { ...f.view, canvas: input.canvas, localBranchRevision: 'new-branch' } }
  })
  try {
    const node = f.view.canvas.artifacts[0]!
    f.workspace.setArtifacts([{ ...node, excerpt: 'uncertain edit' }])
    await vi.waitFor(() => expect(f.page.canvasSyncNotice('shared')).toMatchObject({ kind: 'retry' }))
    const boardEvent = {
      type: 'board' as const, accountGeneration: 1, cause: 'permissions',
      boardId: 'board', localSessionId: 'shared'
    }
    f.emit({
      ...boardEvent, eventSeq: 2,
      view: {
        ...f.view, connection: 'revalidating',
        permissions: { read: false, edit: false, manage: false, execute: false },
        canvas: { files: [], artifacts: [] }
      }
    })
    f.emit({
      ...boardEvent, eventSeq: 3,
      view: { ...f.view, seq: 2, canvasRevision: 'reconfirmed' }
    })
    f.workspace.setArtifacts([{ ...node, excerpt: 'later edit' }])
    expect(writes).toHaveLength(1)
    expect(f.page.canvasSyncNotice('shared')).toMatchObject({ kind: 'retry' })
    await f.page.retryCanvas('shared')
    await vi.waitFor(() => expect(writes).toHaveLength(3))
    expect(writes[1]).toEqual(writes[0])
    expect(writes[2]!.clientMutationId).not.toBe(writes[0]!.clientMutationId)
    expect(writes[2]!.canvas.artifacts[0]!.excerpt).toBe('later edit')
  } finally { f.dispose() }
})

it('renders a dismissible sync prompt with progress and actionable failure feedback', async () => {
  const f = await pageFixture()
  vi.stubGlobal('document', f.win.document)
  vi.stubGlobal('window', f.win)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = f.win.document.createElement('div')
  f.win.document.body.append(host)
  const root = createRoot(host as unknown as HTMLElement)
  let finishRefresh: (reply: unknown) => void = () => {}
  f.bridge.invoke.mockImplementation(async action => {
    if (action === 'canvas.refresh') return new Promise(resolve => { finishRefresh = resolve })
    if (action !== 'canvas.apply') return { ok: true, value: null }
    return { ok: false, error: { code: 'STALE_CANVAS_REVISION', message: 'expired mutation' } }
  })
  try {
    f.workspace.setArtifacts([{ ...f.view.canvas.artifacts[0]!, excerpt: 'draft' }])
    await vi.waitFor(() => expect(f.page.canvasSyncNotice('shared')).toMatchObject({ kind: 'stale' }))
    await act(async () => {
      root.render(createElement(Fragment, null,
        createElement(ResearchBoardHeader, { page: f.page, sessionId: 'shared', active: true }),
        createElement(ResearchBoardCanvasOverlay, {
          page: f.page, sessionId: 'shared', workspace: f.workspace
        })
      ))
    })
    const notice = () => host.querySelector('[data-canvas-error]')
    const retry = () => notice()?.querySelector('button')
    expect(retry()?.textContent).toBe('载入最新看板并同步')
    await act(async () => { retry()?.click() })
    expect(notice()?.textContent).toContain('正在同步看板修改')
    expect(retry()?.hasAttribute('disabled')).toBe(true)
    await act(async () => { finishRefresh({ ok: false, error: { code: 'NETWORK_ERROR', message: 'offline' } }) })
    expect(notice()?.textContent).toContain('未能载入最新看板')
    expect(retry()?.hasAttribute('disabled')).toBe(false)
    await act(async () => { notice()?.querySelector<HTMLButtonElement>('[aria-label="关闭看板同步提示"]')?.click() })
    expect(notice()).toBeNull()
    expect(f.workspace.getSnapshot().artifacts[0]!.excerpt).toBe('draft')
    const more = host.querySelector<HTMLButtonElement>('[aria-label="更多看板操作"]')!
    await act(async () => { more.click() })
    const reopen = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
      .find(item => item.textContent === '查看看板同步提示')
    expect(reopen).toBeDefined()
    await act(async () => { reopen?.click() })
    expect(retry()?.textContent).toBe('载入最新看板并同步')
  } finally {
    await act(async () => { root.unmount() })
    f.dispose()
    vi.unstubAllGlobals()
  }
})


it.each(['refresh', 'send'] as const)('recovers a paused stale edit before the user can %s the shared board', async action => {
  const f = await pageFixture()
  const node = f.view.canvas.artifacts[0]!
  const fresh = { ...f.view, seq: 2, canvasRevision: 'fresh', canvas: { files: [], artifacts: [
    { ...node, title: 'Updated by a collaborator' }
  ] } }
  let writes = 0
  f.bridge.invoke.mockImplementation(async (method, input) => {
    if (method === 'canvas.refresh') return { ok: true, value: fresh }
    if (method === 'canvas.apply') {
      if (++writes === 1) return { ok: false, error: { code: 'STALE_CANVAS_REVISION' } }
      return { ok: true, value: { ...fresh, canvas: input.canvas, localBranchRevision: 'local' } }
    }
    if (method === 'request.submit')
      return { ok: true, value: { accepted: true, clientMutationId: input.clientMutationId, requestMessageId: 'message', state: 'taskAccepted' } }
    return { ok: true, value: null }
  })
  let input = { draft: '总结', draftRev: 1 }
  const notify = vi.fn()
  f.shells.set('shared', {
    get snapshot() { return input },
    notify,
    commitSend() { input = { draft: '', draftRev: input.draftRev + 1 } },
    restoreDraftState(before: typeof input) { input = before }
  })
  try {
    f.workspace.setArtifacts([{ ...node, excerpt: 'My latest local edit' }])
    await vi.waitFor(() => expect(f.page.canvasSyncNotice('shared')?.kind).toBe('stale'))
    const context = { scope: 'references' as const, references: [{ collection: 'artifacts' as const, nodeId: node.id }] }
    if (action === 'send') await f.page.submitShared('shared', '总结', context, [], 'send')
    else await f.page.refreshCanvas('shared')
    const calls = f.bridge.invoke.mock.calls
    expect(calls.filter(([name]) => name === 'canvas.refresh')).toHaveLength(1)
    const writesAndSends = calls.map(([name]) => name).filter(name => name === 'canvas.apply' || name === 'request.submit')
    expect(writesAndSends).toEqual(action === 'send' ? ['canvas.apply', 'canvas.apply', 'request.submit'] : ['canvas.apply', 'canvas.apply'])
    if (action === 'send') {
      expect(calls.find(([name]) => name === 'request.submit')?.[1]).toMatchObject({ text: '总结', context })
      expect(input.draft).toBe('')
      expect(notify).not.toHaveBeenCalled()
    }
    expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({ title: 'Updated by a collaborator', excerpt: 'My latest local edit' })
    expect(f.page.canvasSyncNotice('shared')).toBeUndefined()
  } finally { f.dispose() }
})

it('retains both the current canvas and message draft when the refresh really fails', async () => {
  const f = await pageFixture()
  const node = f.view.canvas.artifacts[0]!
  let input = { draft: '总结这个组件', draftRev: 1 }
  const notify = vi.fn()
  f.shells.set('shared', {
    get snapshot() { return input },
    notify,
    commitSend() { input = { draft: '', draftRev: input.draftRev + 1 } },
    restoreDraftState(before: typeof input) { input = before }
  })
  f.bridge.invoke.mockImplementation(async method => {
    if (method === 'canvas.apply') return { ok: false, error: { code: 'STALE_CANVAS_REVISION' } }
    if (method === 'canvas.refresh') return { ok: false, error: { code: 'NETWORK_ERROR', message: '网络暂时不可用' } }
    return { ok: true, value: null }
  })
  try {
    f.workspace.setArtifacts([{ ...node, excerpt: 'My pending edit' }])
    await vi.waitFor(() => expect(f.page.canvasSyncNotice('shared')?.kind).toBe('stale'))
    await expect(f.page.refreshCanvas('shared')).rejects.toThrow('网络暂时不可用')
    await f.page.submitShared('shared', input.draft, { scope: 'references', references: [{ collection: 'artifacts', nodeId: node.id }] }, [], 'send')
    expect(f.bridge.invoke.mock.calls.some(([name]) => name === 'request.submit')).toBe(false)
    expect(input.draft).toBe('总结这个组件')
    expect(f.workspace.getSnapshot().artifacts[0]!.excerpt).toBe('My pending edit')
    expect(notify).toHaveBeenCalledWith('error', expect.stringContaining('本机修改已保留'))
  } finally { f.dispose() }
})

it('keeps a local drag out of shared mutations and sends a later content edit', async () => {
  const f = await pageFixture()
  const original = f.view.canvas.artifacts[0]!
  const attempts: any[] = []
  f.bridge.invoke.mockImplementation(async (action, input) => {
    if (action !== 'canvas.apply') return { ok: true, value: null }
    attempts.push(input)
    return { ok: true, value: { ...f.view, canvas: input.canvas, localBranchRevision: 'saved' } }
  })
  try {
    f.workspace.setArtifacts([{ ...original, x: 260, y: 120 }])
    f.page.finishGesture('shared')
    expect(attempts).toHaveLength(0)

    f.workspace.setArtifacts([{ ...original, x: 260, y: 120, excerpt: 'New content' }])
    await vi.waitFor(() => expect(attempts).toHaveLength(1))
    const [sent] = attempts[0].canvas.artifacts
    expect(sent.excerpt).toBe('New content')
    expect(sent.x).not.toBe(260)
    expect(sent.y).not.toBe(120)
  } finally {
    f.dispose()
  }
})
