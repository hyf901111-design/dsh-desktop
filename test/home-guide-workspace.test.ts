import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, realpath, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as cordis from '@deepseek-ai/cordis'
import { Context, Service } from '@deepseek-ai/cordis'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'
import { runInNewContext } from 'node:vm'
import Storage from '@deepseek-ai/dsh-storage'
import { JsonStorageBackend } from '@deepseek-ai/dsh-storage-json'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import { SessionStore, SessionId } from '@deepseek-ai/dsh-session'
import { JsonlSessionPersistence } from '@deepseek-ai/dsh-session-persistence-jsonl'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import SessionTitleService from '@deepseek-ai/dsh-session-title'
import { createApiProxy, toFetchHandler } from '@deepseek-ai/dsh-host-apiproxy'
// @ts-expect-error The production runtime is plain JavaScript without declarations.
import { resolveCapabilityContext } from '../packages/dsh-integration-runtime/context.js'
// @ts-expect-error The production runtime is plain JavaScript without declarations.
import { BoardDirectories } from '../packages/dsh-research-task-runtime/board-directories.js'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => Object.fromEntries(['StateDot','Modal','Button','IconTrashOutline16','Menu','IconPlusOutline16','IconEllipsisOutline16','IconSearchOutline16','IconFolderOpenOutline16','IconEditOutline16','IconTriangleRightFill14'].map(name => [name, () => null])))
import { createResearchBoardsPage } from '../src/preload/research-boards-ui'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => { for (const stop of cleanup.splice(0).reverse()) await stop() })
function store<T>(value: T) { const listeners = new Set<() => void>(); return { getSnapshot: () => value, subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) }, set(next: T) { value = next; listeners.forEach(fn => fn()) } } }

async function loadBrowserRuntime(name: string, dependencies: Record<string, unknown> = {}) {
  const source = await readFile('node_modules/@deepseek-ai/' + name + '/lib/client.js', 'utf8')
  let descriptor: { factory(require: (id: string) => unknown): any } | undefined
  runInNewContext(source, { window: { __ModuleLoader__: { load(value: typeof descriptor) { descriptor = value } } }, AbortController, AbortSignal, Response, TextDecoder, URL, console, crypto, queueMicrotask, setTimeout, clearTimeout })
  if (!descriptor) throw Error('Browser runtime did not register: ' + name)
  return descriptor.factory(id => { if (id in dependencies) return dependencies[id]; throw Error('Unexpected browser runtime dependency: ' + id) })
}
const browserRuntimes = Promise.all([
  loadBrowserRuntime('dsh-client-connection'),
  loadBrowserRuntime('dsh-client-runtime', { '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-ui-slots': slots })
])

async function fixture(legacyKind?: string) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'home-guide-workspace-'))), ctx = new Context()
  new Storage(ctx)
  const backend = new JsonStorageBackend(join(root, 'storage'))
  ctx.storage.backend.register('json', backend)
  const domain = new DomainFacility(ctx, { backend: 'json' }); ctx.provide('storageDomain', domain)
  const sessionStore = new SessionStore(ctx)
  new JsonlSessionPersistence(ctx, { root: join(root, 'history'), compression: 'none' })
  new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 }); new UserQuestionService(ctx)
  new SessionTitleService(ctx, { fallbackMaxWords: 10, fallbackMaxBytes: 100, maxTitleBytes: 256 })
  const registry = new WorkspaceRegistry(ctx); await registry[Service.init]()
  const directories = new BoardDirectories(ctx, join(root, 'directories'))
  const api = createApiProxy(ctx, { cwd: root, defaultModelSelection: () => ({ provider: 'unused', model: 'unused' }) })
  const oldEvent = globalThis.Event, oldDocument = globalThis.document
  const win = new Window({ url: 'http://localhost:43210' }), disk = new Map<string, string>(), opened: string[] = [], calls: any[] = []
  globalThis.Event = win.Event as unknown as typeof Event; globalThis.document = win.document as unknown as Document
  const list = store<any>({ current: 'original', byId: { original: { id: 'original', title: '用户原会话', cwd: root, blank: false } } })
  let sequence = 0, emit: (event: any) => void = () => {}, failCreate = false, failAttach = false, workspaceGate = Promise.resolve(), hostClosed = false
  const closeHost = async () => { if (hostClosed) return; hostClosed = true; directories.dispose(); await ctx.fiber.dispose(); await domain.closeAll(); await backend.close() }
  const state: any = { version: 1, eventSeq: 1, account: { status: 'ready', generation: 1, user: { userId: 'owner' } }, favorites: [], boards: [], current: null, recoveries: [], notifications: { cursor: 0, unreadCount: 0, pendingCount: 0, notifications: [] } }
  const unwrap = (reply: any) => { if (!reply.result.ok) throw Error(reply.result.error.message); return reply.result.value }
  const [{ AbstractApiClient }, { WorkspaceRuntime }] = await browserRuntimes
  const carrier = toFetchHandler(api)
  class HostClient extends AbstractApiClient {
    doFetch(input: URL, init: RequestInit) { return carrier.fetch(input, init) }
  }
  const wire = new HostClient()
  const sessions = {
    list, open(id: string) { opened.push(id); list.set({ ...list.getSnapshot(), current: id }) },
    async create(input: any) { calls.push(['session.create', input]); const id = unwrap(await wire.sessions.create(input)).sessionId; list.set({ ...list.getSnapshot(), byId: { ...list.getSnapshot().byId, [id]: { id, cwd: ctx.agents.get(id)!.session.header.cwd, blank: true, title: '新对话' } } }); return id },
    binding(id: string) { return { session: { getSnapshot: () => list.getSnapshot().byId[id], subscribe: () => () => {}, async rename(title: string) { unwrap(await wire.sessions.rename({ sessionId: id, title })); const current = list.getSnapshot(); list.set({ ...current, byId: { ...current.byId, [id]: { ...current.byId[id], title, displayTitle: title } } }) } } } },
  }
  const workspaces = new WorkspaceRuntime(ctx, wire, sessions)
  const createWorkspace = workspaces.create.bind(workspaces)
  workspaces.create = async (input: any) => { calls.push(['workspace.create', input]); await workspaceGate; if (failCreate) throw Error('工作区创建失败'); return createWorkspace(input) }
  const createSession = api.sessions.create
  api.sessions.create = async (input: any) => {
    if (input.payload.workspaceId) {
      calls.push(['workspace.attach', input.payload])
      if (failAttach) return { rpcId: input.rpcId, result: { ok: false, error: { code: 'workspace-attach-failed', message: '工作区绑定失败', details: {} } } }
    }
    return createSession(input)
  }
  ;(win as any).dshDesktop = { researchCanvasStorage: { getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => { disk.set(key, value); return true } } }
  let legacy: { sessionId: string; cwd: string } | undefined
  if (legacyKind) {
    const cwd = join(root, 'legacy-' + legacyKind); await mkdir(cwd, { recursive: true }); const sessionId = await sessions.create({ cwd }); await sessions.binding(sessionId).session.rename('已保存示例')
    disk.set('sherlock.home-guide.sessions.v1:' + encodeURIComponent('account:owner'), JSON.stringify({ version: 1, scope: 'account:owner', entries: [{ kind: legacyKind, sessionId, cwd, title: '已保存示例', createdAt: 1 }] }))
    legacy = { sessionId, cwd }
  }
  const page = createResearchBoardsPage({ document: win.document as unknown as Document, sessions, workspaces, inputHub: { shells: new Map() }, researchWorkspaces: { for: () => ({ getSnapshot: () => ({ files: [], artifacts: [] }), subscribe: () => () => {}, persist: () => true }) }, bridge: { isSharedSession: () => false, getSnapshot: async () => state, subscribe: (fn: any) => { emit = fn; return () => {} }, invoke: async (action: string, input: any) => {
    calls.push([action, input])
    if (action === 'local.directory') return { ok: true, value: await directories.run(input) }
    if (action === 'favorite.add') { const item = { ...input.identity, favoriteId: 'favorite-' + sequence, dedicated: true }; state.favorites.push(item); return { ok: true, value: item } }
    return { ok: true, value: null }
  } } } as any)
  const replies: any[] = []; win.addEventListener('sherlock:home-guide-session-reply', (event: any) => replies.push(event.detail))
  const send = (kind = 'ppt', extra: any = {}) => { const requestId = 'request-' + (++sequence); win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-session-request', { detail: { requestId, kind, command: 'prepare', ...extra } })); return requestId }
  const reply = async (id: string) => { await expect.poll(() => replies.find(row => row.requestId === id), { timeout: 1500 }).toBeTruthy(); return replies.find(row => row.requestId === id) }
  await Promise.resolve(); await Promise.resolve()
  cleanup.push(async () => { page.dispose(); globalThis.Event = oldEvent; globalThis.document = oldDocument; await win.happyDOM.abort(); await closeHost(); await rm(root, { recursive: true, force: true }) })
  return { root, ctx, registry, api, page, workspaces, sessions, disk, state, calls, opened, send, reply, unwrap, closeHost, legacy, headers: () => sessionStore.list().map(session => session.header), gateWorkspace(gate: Promise<void>) { workspaceGate = gate }, fail(create = false, attach = false) { failCreate = create; failAttach = attach }, setOwner(userId: string) { state.account = { status: 'ready', generation: state.account.generation + 1, user: { userId } }; state.eventSeq++; emit({ type: 'state', state: { ...state }, eventSeq: state.eventSeq, accountGeneration: state.account.generation }) } }
}

it.each(['board', 'note', 'ppt'])('registers a durable Workspace through the production browser transport and binds the same %s session before success', async kind => {
  const f = await fixture(), ids = [f.send(kind), f.send(kind)], [first, concurrent] = await Promise.all(ids.map(f.reply))
  expect(first).toMatchObject({ ok: true, fresh: true }); expect(concurrent.sessionId).toBe(first.sessionId)
  const workspace = await f.registry.resolveByPath(first.cwd)
  expect(workspace, 'reserved directories alone do not satisfy the runtime guard').toBeDefined()
  expect(workspace!.sessionIds).toEqual([first.sessionId])
  expect(f.workspaces.list.getSnapshot().items).toContainEqual(expect.objectContaining({ workspaceId: workspace!.id, path: first.cwd, sessionIds: [first.sessionId] }))
  const agent = f.ctx.agents.get(first.sessionId)!
  expect(agent.session.events.some(event => event.type === 'user/message')).toBe(false)
  expect(await resolveCapabilityContext(f.ctx, agent, { ownerAccountId: 'owner', runtimeEpoch: 'test-epoch' })).toMatchObject({ sessionId: first.sessionId, workspaceId: workspace!.id })
  expect(f.calls.filter(row => row[0] === 'session.create')).toHaveLength(1)
  expect(f.calls.filter(row => row[0] === 'workspace.attach')).toHaveLength(1)
  expect(f.opened).toEqual([]); expect(f.sessions.list.getSnapshot().current).toBe('original')
  const repeated = await f.reply(f.send(kind)); expect(repeated).toMatchObject({ ok: true, fresh: false, sessionId: first.sessionId })
  expect(f.ctx.agents.get(first.sessionId)).toBe(agent)
  expect(f.calls.filter(row => row[0] === 'workspace.attach')).toHaveLength(1)
})

it.each(['board', 'note', 'ppt'])('repairs legacy %s examples with the existing path/entity/session and preserves previous work', async kind => {
  const f = await fixture(kind), old = f.legacy!, agent = f.ctx.agents.get(SessionId(old.sessionId))!, events = [...agent.session.events]
  const summary = { ...f.sessions.list.getSnapshot().byId[old.sessionId], blank: false, title: '我的保留成果' }
  f.sessions.list.set({ ...f.sessions.list.getSnapshot(), byId: { ...f.sessions.list.getSnapshot().byId, [old.sessionId]: summary } })
  await writeFile(join(old.cwd, '成果.txt'), '保留的示例结果')
  const existing = await f.registry.create(old.cwd, '用户保留的工作区名称')
  const repaired = await f.reply(f.send(kind))
  expect(repaired).toMatchObject({ ok: true, fresh: false, sessionId: old.sessionId, cwd: old.cwd })
  expect(await f.registry.resolveByPath(old.cwd)).toBe(existing)
  expect(existing.title).toBe('用户保留的工作区名称'); expect(existing.sessionIds).toEqual([old.sessionId])
  expect(f.ctx.agents.get(SessionId(old.sessionId))).toBe(agent); expect(agent.session.events).toEqual(events)
  expect(f.sessions.list.getSnapshot().byId[old.sessionId]).toBe(summary)
  expect(await readFile(join(old.cwd, '成果.txt'), 'utf8')).toBe('保留的示例结果')
  expect(f.calls.filter(row => row[0] === 'session.create')).toHaveLength(1)
  expect(f.calls.filter(row => row[0] === 'local.directory' && row[1].mode === 'reserve')).toHaveLength(0)
  expect(f.opened).toEqual([])
})

it('creates a new replay Workspace without overwriting the old session or an unrelated Workspace', async () => {
  const f = await fixture(), unrelated = await f.registry.create(f.root, '用户项目'), first = await f.reply(f.send('ppt')), replay = await f.reply(f.send('ppt', { replay: true }))
  expect(replay).toMatchObject({ ok: true, fresh: true }); expect(replay.cwd).not.toBe(first.cwd); expect(replay.sessionId).not.toBe(first.sessionId)
  const original = await f.registry.resolveByPath(first.cwd), copy = await f.registry.resolveByPath(replay.cwd)
  expect(original!.id).not.toBe(copy!.id); expect(original!.sessionIds).toEqual([first.sessionId]); expect(copy!.sessionIds).toEqual([replay.sessionId])
  expect(unrelated.title).toBe('用户项目'); expect(unrelated.sessionIds).toEqual([])
})

it('refuses success/navigation on Workspace registration or attachment failure and leaves old results intact', async () => {
  const f = await fixture('ppt'), old = f.legacy!, before = f.sessions.list.getSnapshot().byId[old.sessionId], record = [...f.disk]
  f.fail(true); expect(await f.reply(f.send('ppt'))).toMatchObject({ ok: false })
  f.fail(false, true); expect(await f.reply(f.send('ppt'))).toMatchObject({ ok: false })
  expect(f.opened).toEqual([]); expect([...f.disk]).toEqual(record); expect(f.sessions.list.getSnapshot().byId[old.sessionId]).toBe(before)
  f.fail(); expect(await f.reply(f.send('ppt'))).toMatchObject({ ok: true, fresh: false, sessionId: old.sessionId })
})

it('persists actual Workspace identity and session accounting across a fresh registry process scope', async () => {
  const f = await fixture(), first = await f.reply(f.send('ppt')), oldWorkspace = await f.registry.resolveByPath(first.cwd), headers = f.headers()
  await f.closeHost()
  const ctx = new Context(); new Storage(ctx)
  const backend = new JsonStorageBackend(join(f.root, 'storage')); ctx.storage.backend.register('json', backend)
  const domain = new DomainFacility(ctx, { backend: 'json' }); ctx.provide('storageDomain', domain)
  ctx.provide('sessionPersistence', { list: async () => headers })
  const registry = new WorkspaceRegistry(ctx)
  cleanup.push(async () => { await ctx.fiber.dispose(); await domain.closeAll(); await backend.close() })
  await registry[Service.init]()
  const restored = await registry.resolveByPath(first.cwd)
  expect(restored!.id).toBe(oldWorkspace!.id); expect(restored!.sessionIds).toEqual([first.sessionId])
})

it('stops before binding or publishing a Workspace registration that outlives account A to B to A', async () => {
  const f = await fixture(); let release!: () => void
  f.gateWorkspace(new Promise<void>(resolve => { release = resolve }))
  const id = f.send('ppt')
  await expect.poll(() => f.calls.some(row => row[0] === 'workspace.create')).toBe(true)
  f.setOwner('other'); f.setOwner('owner'); release()
  expect(await f.reply(id)).toMatchObject({ ok: false })
  expect(f.calls.filter(row => row[0] === 'workspace.attach')).toEqual([])
  expect(f.disk.size).toBe(0); expect(f.opened).toEqual([])
})

it('does not register a successful/fresh example or favorite when creating its Workspace fails', async () => {
  const f = await fixture(); f.fail(true)
  const failed = await f.reply(f.send('board'))
  expect(failed).toMatchObject({ ok: false }); expect(failed.fresh).toBeUndefined()
  expect(f.disk.size).toBe(0); expect(f.calls.filter(row => row[0] === 'favorite.add')).toEqual([])
  expect(f.opened).toEqual([])
})

it('refuses to attach when a Workspace response does not identify the exact reserved example directory', async () => {
  const f = await fixture(), create = f.workspaces.create
  f.workspaces.create = async input => ({ ...await create(input), path: f.root })
  expect(await f.reply(f.send('ppt'))).toMatchObject({ ok: false })
  expect(f.calls.filter(row => row[0] === 'workspace.attach')).toEqual([])
  expect(f.disk.size).toBe(0); expect(f.opened).toEqual([])
})

it('repairs a directly revisited legacy example and keeps the ordinary input directory unavailable until real binding', async () => {
  const f = await fixture('note'), old = f.legacy!; let release!: () => void
  f.gateWorkspace(new Promise<void>(resolve => { release = resolve }))
  f.sessions.open(old.sessionId)
  expect(f.page.directoryChoice(old.sessionId)).toBe(null)
  await expect.poll(() => f.calls.filter(row => row[0] === 'workspace.create').length).toBe(1)
  expect(f.workspaces.list.getSnapshot().items).toEqual([])
  release()
  await expect.poll(async () => (await f.registry.resolveByPath(old.cwd))?.sessionIds).toEqual([old.sessionId])
  expect(f.opened).toEqual([old.sessionId]); expect(f.calls.filter(row => row[0] === 'session.create')).toHaveLength(1)
  expect(f.page.directoryChoice(old.sessionId)).toBe(null)
})

it('does not attach a late direct-revisit result after selecting another session, then safely repairs on return', async () => {
  const f = await fixture('ppt'), old = f.legacy!; let release!: () => void
  f.gateWorkspace(new Promise<void>(resolve => { release = resolve }))
  f.sessions.open(old.sessionId)
  await expect.poll(() => f.calls.some(row => row[0] === 'workspace.create')).toBe(true)
  f.sessions.open('original'); release()
  await expect.poll(async () => !!await f.registry.resolveByPath(old.cwd)).toBe(true)
  expect(f.calls.filter(row => row[0] === 'workspace.attach')).toEqual([])
  expect(f.sessions.list.getSnapshot().current).toBe('original')
  f.sessions.open(old.sessionId)
  await expect.poll(async () => (await f.registry.resolveByPath(old.cwd))?.sessionIds).toEqual([old.sessionId])
  expect(f.calls.filter(row => row[0] === 'session.create')).toHaveLength(1)
})

it.each(['account', 'dispose'])('does not continue a direct-revisit binding after its %s context ends', async mode => {
  const f = await fixture('ppt'), old = f.legacy!, saved = [...f.disk]; let release!: () => void
  f.gateWorkspace(new Promise<void>(resolve => { release = resolve }))
  f.sessions.open(old.sessionId)
  await expect.poll(() => f.calls.some(row => row[0] === 'workspace.create')).toBe(true)
  if (mode === 'account') f.setOwner('other'); else f.page.dispose()
  release()
  await expect.poll(async () => !!await f.registry.resolveByPath(old.cwd)).toBe(true)
  expect(f.calls.filter(row => row[0] === 'workspace.attach')).toEqual([])
  expect(f.calls.filter(row => row[0] === 'session.create')).toHaveLength(1)
  expect(f.opened).toEqual([old.sessionId]); expect([...f.disk]).toEqual(saved)
})

it('shares a pending current-example binding with an explicit prepare without invalidating the prepare when selection changes', async () => {
  const f = await fixture('ppt'), old = f.legacy!; let release!: () => void
  f.gateWorkspace(new Promise<void>(resolve => { release = resolve }))
  f.sessions.open(old.sessionId)
  await expect.poll(() => f.calls.some(row => row[0] === 'workspace.create')).toBe(true)
  const prepared = f.send('ppt')
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  f.sessions.open('original'); release()
  expect(await f.reply(prepared)).toMatchObject({ ok: true, fresh: false, sessionId: old.sessionId })
  expect(f.calls.filter(row => row[0] === 'workspace.create')).toHaveLength(1)
  expect(f.calls.filter(row => row[0] === 'workspace.attach')).toHaveLength(1)
  expect(f.sessions.list.getSnapshot().current).toBe('original')
  expect(f.opened).toEqual([old.sessionId, 'original'])
})
