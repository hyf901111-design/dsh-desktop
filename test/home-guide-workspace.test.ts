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
import LlmRuntime, { MessageId } from '@deepseek-ai/dsh-llm'
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
  let source = await readFile('node_modules/@deepseek-ai/' + name + '/lib/client.js', 'utf8')
  if(name==='dsh-client-runtime')source=source.replace('exports.SessionRuntime = SessionRuntime;','exports.SessionRuntime = SessionRuntime;exports.__Session=Session;')
  let descriptor: { factory(require: (id: string) => unknown): any } | undefined
  runInNewContext(source, { window: { __ModuleLoader__: { load(value: typeof descriptor) { descriptor = value } } }, AbortController, AbortSignal, Response, TextDecoder, URL, console, crypto, queueMicrotask, setTimeout, clearTimeout })
  if (!descriptor) throw Error('Browser runtime did not register: ' + name)
  return descriptor.factory(id => { if (id in dependencies) return dependencies[id]; throw Error('Unexpected browser runtime dependency: ' + id) })
}
const browserRuntimes = Promise.all([
  loadBrowserRuntime('dsh-client-connection'),
  loadBrowserRuntime('dsh-client-runtime', { '@deepseek-ai/cordis': cordis, '@deepseek-ai/dsh-client-ui-slots': slots })
])

async function fixture(legacyKind?: string, options: {legacyTitle?:string;currentTitle?:string;projectedTitle?:string;deferTitleList?:boolean;childOrigin?:boolean;failRename?:boolean;failStorage?:number;renameGate?:Promise<void>;registration?:'missing'|'other-owner'|'wrong-cwd';savedWork?:boolean} = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'home-guide-workspace-'))), ctx = new Context()
  new Storage(ctx)
  const backend = new JsonStorageBackend(join(root, 'storage'))
  ctx.storage.backend.register('json', backend)
  const domain = new DomainFacility(ctx, { backend: 'json' }); ctx.provide('storageDomain', domain)
  const sessionStore = new SessionStore(ctx)
  new JsonlSessionPersistence(ctx, { root: join(root, 'history'), compression: 'none' })
  new AgentRegistry(ctx)
  const handles = new Map<string, { dispose(): Promise<void> }>(), createAgent = ctx.agents.create.bind(ctx.agents)
  ctx.agents.create = async (input: any) => { const handle = await createAgent(input); handles.set(input.sessionId, handle); return handle }
  new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 }); new UserQuestionService(ctx)
  new SessionTitleService(ctx, { fallbackMaxWords: 10, fallbackMaxBytes: 100, maxTitleBytes: 256 })
  const registry = new WorkspaceRegistry(ctx); await registry[Service.init]()
  const directories = new BoardDirectories(ctx, join(root, 'directories'))
  const api = createApiProxy(ctx, { cwd: root, defaultModelSelection: () => ({ provider: 'unused', model: 'unused' }) })
  const oldEvent = globalThis.Event, oldDocument = globalThis.document
  const win = new Window({ url: 'http://localhost:43210' }), disk = new Map<string, string>(), opened: string[] = [], calls: any[] = []
  globalThis.Event = win.Event as unknown as typeof Event; globalThis.document = win.document as unknown as Document
  const list = store<any>({ current: 'original', byId: { original: { id: 'original', title: '用户原会话', cwd: root, blank: false } } })
  let sequence = 0, emit: (event: any) => void = () => {}, failCreate = false, failAttach = false, workspaceGate = Promise.resolve(), hostClosed = false, failRename = options.failRename === true, failStorage = options.failStorage ?? 0
  const closeHost = async () => { if (hostClosed) return; hostClosed = true; directories.dispose(); await ctx.fiber.dispose(); await domain.closeAll(); await backend.close() }
  const state: any = { version: 1, eventSeq: 1, account: { status: 'ready', generation: 1, user: { userId: 'owner' } }, favorites: [], boards: [], current: null, recoveries: [], notifications: { cursor: 0, unreadCount: 0, pendingCount: 0, notifications: [] } }
  const unwrap = (reply: any) => { if (!reply.result.ok) throw Error(reply.result.error.message); return reply.result.value }
  const [{ AbstractApiClient }, { WorkspaceRuntime, __Session:NativeSession }] = await browserRuntimes
  const carrier = toFetchHandler(api)
  class HostClient extends AbstractApiClient {
    doFetch(input: URL, init: RequestInit) { return carrier.fetch(input, init) }
  }
  const wire = new HostClient(),nativeSessions=new Map<string,any>(),nativeFor=(id:string)=>{let native=nativeSessions.get(id);if(!native){native=new NativeSession(id,wire,{});nativeSessions.set(id,native)}return native}
  const sessions = {
    list, open(id: string) { opened.push(id); list.set({ ...list.getSnapshot(), current: id }) },
    async create(input: any) { calls.push(['session.create', input]); const id = unwrap(await wire.sessions.create(input)).sessionId; list.set({ ...list.getSnapshot(), byId: { ...list.getSnapshot().byId, [id]: { id, cwd: ctx.agents.get(id)!.session.header.cwd, blank: true, title: '新对话' } } }); return id },
    binding(id: string) { return { session: { getSnapshot: () => list.getSnapshot().byId[id], subscribe: () => () => {}, projections:nativeFor(id).projections, async rename(title: string) { calls.push(['session.rename',{sessionId:id,title}]);if(failRename)return{ok:false,error:{code:'rename-failed',message:'标题保存失败'}};const result=await nativeFor(id).rename(title);await options.renameGate;if(result.ok&&!options.deferTitleList){const current = list.getSnapshot(); list.set({ ...current, byId: { ...current.byId, [id]: { ...current.byId[id], title, displayTitle: title } } })}return result } } } },
  }
  const workspaces = new WorkspaceRuntime(ctx, wire, sessions)
  const createWorkspace = workspaces.create.bind(workspaces)
  workspaces.create = async (input: any) => { calls.push(['workspace.create', input]); await workspaceGate; if (failCreate) throw Error('工作区创建失败'); return createWorkspace(input) }
  const createSession = api.sessions.create
  api.sessions.create = async input => {
    if (input.payload.workspaceId) {
      calls.push(['workspace.attach', input.payload])
      if (failAttach) {
        const sessionId = input.payload.sessionId
        if (!sessionId) throw Error('测试绑定请求必须指定既有会话。')
        return { rpcId: input.rpcId, result: { ok: false, error: { code: 'workspace-attach-failed', message: '工作区绑定失败', details: { sessionId, workspaceId: input.payload.workspaceId } } } }
      }
    }
    return createSession(input)
  }
  ;(win as any).dshDesktop = { researchCanvasStorage: { getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => { if(failStorage>0){failStorage--;return false}disk.set(key, value); return true } } }
  let legacy: { sessionId: string; cwd: string } | undefined
  if (legacyKind) {
    const title=options.legacyTitle??'已保存示例',cwd = join(root, 'legacy-' + legacyKind); await mkdir(cwd, { recursive: true }); const sessionId = await sessions.create({ cwd });const actual=options.currentTitle??title;await nativeFor(sessionId).rename(actual);const current=list.getSnapshot();list.set({...current,byId:{...current.byId,[sessionId]:{...current.byId[sessionId],title:actual,displayTitle:actual,...(options.childOrigin?{parentId:'parent',origin:'subagent'}:{})}}});if(options.projectedTitle)await nativeFor(sessionId).rename(options.projectedTitle)
    if(options.savedWork){ctx.agents.get(SessionId(sessionId))!.session.append('user/message',{id:MessageId('saved-guide-message'),role:'user',source:{kind:'user'},content:[{type:'text',text:'保留既有笔记、任务和交付内容'}]},{surfaceOp:'append'});await writeFile(join(cwd,'既有任务与成果.json'),JSON.stringify({task:{status:'completed'},note:'原笔记正文',output:'既有成果'}))}
    const scope=options.registration==='other-owner'?'account:other':'account:owner'
    if(options.registration!=='missing')disk.set('sherlock.home-guide.sessions.v1:' + encodeURIComponent(scope), JSON.stringify({ version: 1, scope, entries: [{ kind: legacyKind, sessionId, cwd:options.registration==='wrong-cwd'?root:cwd, title, createdAt: 1 }] }))
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
  return { root, ctx, registry, api, page, workspaces, sessions, disk, state, calls, opened, send, reply, unwrap, closeHost, legacy, win, emitState(){ state.eventSeq++; emit({type:"state",state:{...state},eventSeq:state.eventSeq,accountGeneration:state.account.generation}) }, failRename(value:boolean){failRename=value}, failStorage(count:number){failStorage=count}, headers: () => sessionStore.list().map(session => session.header), async coldSession(id: string) { await sessionStore.flush(ctx.agents.get(SessionId(id))!.session); await handles.get(id)!.dispose() }, gateWorkspace(gate: Promise<void>) { workspaceGate = gate }, fail(create = false, attach = false) { failCreate = create; failAttach = attach }, setOwner(userId: string) { state.account = { status: 'ready', generation: state.account.generation + 1, user: { userId } }; state.eventSeq++; emit({ type: 'state', state: { ...state }, eventSeq: state.eventSeq, accountGeneration: state.account.generation }) } }
}

const oldGuideTitles={board:'自选行情示例看板',note:'AI 护航研究笔记示例',ppt:'公司风格演示示例',report:'研究报告示例'} as const
it('persists a successful native title projection before the delayed list frame arrives',async()=>{
 const title=oldGuideTitles.note,f=await fixture('note',{legacyTitle:title,deferTitleList:true}),id=f.legacy!.sessionId,key='sherlock.home-guide.sessions.v1:account%3Aowner'
 await expect.poll(()=>JSON.parse(f.disk.get(key)!).entries[0].title).toBe(title+'（演示案例）')
 expect(f.sessions.list.getSnapshot().byId[id].title).toBe(title);expect(f.sessions.binding(id).session.projections.get('title')).toBe(title+'（演示案例）')
})
it.each(['newer-projection','child-origin'])('does not rename a registered default with %s metadata',async mode=>{
 const title=oldGuideTitles.ppt,f=await fixture('ppt',{legacyTitle:title,...(mode==='newer-projection'?{projectedTitle:'用户刚命名的项目'}:{childOrigin:true})}),id=f.legacy!.sessionId
 await new Promise(resolve=>setTimeout(resolve,30));expect(f.calls.filter(row=>row[0]==='session.rename')).toEqual([])
 expect(f.ctx.agents.get(SessionId(id))!.session.events.filter(event=>event.type==='session/title').at(-1)?.data.title).toBe(mode==='newer-projection'?'用户刚命名的项目':title)
})
it.each(Object.entries(oldGuideTitles))('cold-migrates only the registered default %s title with the real durable rename transport',async(kind,title)=>{
 const f=await fixture(kind,{legacyTitle:title}),old=f.legacy!,expected=title+'（演示案例）',agent=f.ctx.agents.get(SessionId(old.sessionId))!
 await expect.poll(()=>f.sessions.list.getSnapshot().byId[old.sessionId].title).toBe(expected)
 await expect.poll(()=>JSON.parse(f.disk.get('sherlock.home-guide.sessions.v1:account%3Aowner')!).entries[0].title).toBe(expected)
 expect(agent.session.header.cwd).toBe(old.cwd);expect(f.calls.filter(row=>row[0]==='session.create')).toHaveLength(1);expect(f.calls.filter(row=>row[0]==='local.directory')).toEqual([])
 expect(agent.session.events.filter(event=>event.type==='session/title').map(event=>event.data.title)).toEqual([title,expected])
 const again=await f.reply(f.send(kind));expect(again).toMatchObject({ok:true,sessionId:old.sessionId,cwd:old.cwd,title:expected,fresh:false})
 expect(agent.session.events.filter(event=>event.type==='session/title')).toHaveLength(2)
})
it('keeps the legacy title registration when native rename returns a business failure, and retries explicitly',async()=>{
 const title=oldGuideTitles.note,f=await fixture('note',{legacyTitle:title,failRename:true}),id=f.legacy!.sessionId,key='sherlock.home-guide.sessions.v1:account%3Aowner'
 const failed=await f.reply(f.send('note'));expect(failed.ok).toBe(false);expect(f.sessions.list.getSnapshot().byId[id].title).toBe(title);expect(JSON.parse(f.disk.get(key)!).entries[0].title).toBe(title)
 f.failRename(false);expect(await f.reply(f.send('note'))).toMatchObject({ok:true,sessionId:id,title:title+'（演示案例）'})
})
it('repairs registration after rename succeeds but storage rejects without duplicating the durable title event',async()=>{
 const title=oldGuideTitles.ppt,f=await fixture('ppt',{legacyTitle:title,failStorage:1}),id=f.legacy!.sessionId,key='sherlock.home-guide.sessions.v1:account%3Aowner'
 await expect.poll(()=>f.sessions.list.getSnapshot().byId[id].title).toBe(title+'（演示案例）');expect(JSON.parse(f.disk.get(key)!).entries[0].title).toBe(title)
 expect(await f.reply(f.send('ppt'))).toMatchObject({ok:true,sessionId:id,title:title+'（演示案例）'});expect(JSON.parse(f.disk.get(key)!).entries[0].title).toBe(title+'（演示案例）')
 expect(f.ctx.agents.get(SessionId(id))!.session.events.filter(event=>event.type==='session/title')).toHaveLength(2)
})
it('does not write a legacy migration into another account after the real rename response is delayed',async()=>{
 let finish!:()=>void;const title=oldGuideTitles.report,f=await fixture('report',{legacyTitle:title,renameGate:new Promise<void>(resolve=>{finish=resolve})}),key='sherlock.home-guide.sessions.v1:account%3Aowner'
 await expect.poll(()=>f.calls.some(row=>row[0]==='session.rename')).toBe(true);f.setOwner('other');finish();await new Promise(resolve=>setTimeout(resolve,20))
 expect(JSON.parse(f.disk.get(key)!).entries[0].title).toBe(title);expect(f.disk.has('sherlock.home-guide.sessions.v1:account%3Aother')).toBe(false);expect(f.opened).toEqual([])
})
it('preserves a user-renamed registered default and removes the old practice-copy label',async()=>{
 const custom=await fixture('note',{legacyTitle:oldGuideTitles.note,currentTitle:'我的自定义研究笔记'}),id=custom.legacy!.sessionId
 expect(await custom.reply(custom.send('note'))).toMatchObject({ok:true,sessionId:id});expect(custom.sessions.list.getSnapshot().byId[id].title).toBe('我的自定义研究笔记');expect(custom.calls.filter(row=>row[0]==='session.rename')).toEqual([])
 const title=oldGuideTitles.ppt+' · 练习副本',copy=await fixture('ppt',{legacyTitle:title})
 await expect.poll(()=>copy.sessions.list.getSnapshot().byId[copy.legacy!.sessionId].title).toBe(oldGuideTitles.ppt+'（演示案例）')
 expect(await copy.reply(copy.send('ppt'))).toMatchObject({ok:true,title:oldGuideTitles.ppt+'（演示案例）'})
})
it.each(Object.entries(oldGuideTitles))('cold-cleans the registered %s replay title once without changing its work or directory',async(kind,title)=>{
 const oldTitle=title+' · 练习副本（演示案例）',f=await fixture(kind,{legacyTitle:oldTitle,savedWork:true}),old=f.legacy!,agent=f.ctx.agents.get(SessionId(old.sessionId))!,expected=title+'（演示案例）'
 const events=agent.session.events.filter(event=>event.type!=='session/title'),file=join(old.cwd,'既有任务与成果.json'),bytes=await readFile(file),key='sherlock.home-guide.sessions.v1:account%3Aowner'
 await expect.poll(()=>f.sessions.list.getSnapshot().byId[old.sessionId].title).toBe(expected)
 await expect.poll(()=>JSON.parse(f.disk.get(key)!).entries[0].title).toBe(expected)
 expect(agent.session.header.cwd).toBe(old.cwd);expect(agent.session.events.filter(event=>event.type!=='session/title')).toEqual(events);expect(await readFile(file)).toEqual(bytes)
 expect(agent.session.events.filter(event=>event.type==='session/title').map(event=>event.data.title)).toEqual([oldTitle,expected])
 expect(await f.reply(f.send(kind))).toMatchObject({ok:true,sessionId:old.sessionId,cwd:old.cwd,title:expected,fresh:false})
 expect(agent.session.events.filter(event=>event.type==='session/title')).toHaveLength(2)
 expect(f.calls.filter(row=>row[0]==='session.create')).toHaveLength(1);expect(f.calls.filter(row=>row[0]==='local.directory')).toEqual([])
})
it.each(['missing','other-owner','wrong-cwd'] as const)('does not rename a default-looking session with %s registration',async registration=>{
 const title=oldGuideTitles.note+' · 练习副本（演示案例）',f=await fixture('note',{legacyTitle:title,registration}),id=f.legacy!.sessionId,before=[...f.disk]
 await new Promise(resolve=>setTimeout(resolve,25))
 expect(f.sessions.list.getSnapshot().byId[id].title).toBe(title);expect(f.calls.filter(row=>row[0]==='session.rename')).toEqual([]);expect([...f.disk]).toEqual(before)
})
it.each(['board', 'note', 'ppt', 'report'])('registers a durable Workspace through the production browser transport and binds the same %s session before success', async kind => {
  const f = await fixture(), ids = [f.send(kind), f.send(kind)], [first, concurrent] = await Promise.all(ids.map(f.reply))
  expect(first).toMatchObject({ ok: true, fresh: true }); expect(concurrent.sessionId).toBe(first.sessionId)
  const expected=oldGuideTitles[kind as keyof typeof oldGuideTitles]+'（演示案例）'
  expect(first.title).toBe(expected);expect(f.sessions.list.getSnapshot().byId[first.sessionId].title).toBe(expected)
  expect(f.calls.find(row=>row[0]==='local.directory'&&row[1].mode==='reserve')?.[1].title).toBe(expected)
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

it.each(['board', 'note', 'ppt', 'report'])('repairs legacy %s examples with the existing path/entity/session and preserves previous work', async kind => {
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
  f.workspaces.create = async (input: { path: string }) => ({ ...await create(input), path: f.root })
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

it.each(['board', 'note', 'ppt', 'report'])('binds the same persisted %s example after its Agent has been unloaded', async kind => {
  const f = await fixture(kind), old = f.legacy!
  await f.coldSession(old.sessionId)
  expect(f.ctx.agents.get(SessionId(old.sessionId))).toBeUndefined()
  const repaired = await f.reply(f.send(kind))
  expect(repaired).toMatchObject({ ok: true, fresh: false, sessionId: old.sessionId, cwd: old.cwd })
  expect((await f.registry.resolveByPath(old.cwd))!.sessionIds).toEqual([old.sessionId])
  expect(f.calls.filter(row => row[0] === 'session.create')).toHaveLength(1)
})


// Execute the installed production sidebar projection without rewriting its
// filter or group implementation. Host Workspace/session transport above is real;
// these hooks only read the exact dataset snapshot used by SessionTree.
async function sidebarProjection(win: Window) {
  const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js', 'utf8')
  const anchor = 'return module.exports;'
  expect(source.split(anchor)).toHaveLength(2)
  let descriptor: any
  ;(win as any).__ModuleLoader__ = { load(value: any) { descriptor = value } }
  runInNewContext(source.replace(anchor, 'exports.__sidebar = { useBoardWorkspaceList, groupByWorkspace, researchSessionEngaged };' + anchor), {window:win,document:win.document,localStorage:win.localStorage,Event:win.Event,console,crypto,setTimeout,clearTimeout})
  const dependencies: Record<string, unknown> = {
    '@deepseek-ai/dsh-client-runtime/client': {},
    'react/jsx-runtime': {},
    'react': { useSyncExternalStore: (_subscribe: unknown, snapshot: () => unknown) => snapshot(), useMemo: (read: () => unknown) => read() },
    '@deepseek-ai/dsh-client-ui-primitives': {}
  }
  return descriptor.factory((id: string) => { if (id in dependencies) return dependencies[id]; throw Error('Unexpected sidebar dependency: ' + id) }).__sidebar
}
async function projectedGuideFixture(kind: string) {
  const f = await fixture(), entry = await f.reply(f.send(kind))
  expect(entry.ok).toBe(true)
  const sidebar = await sidebarProjection(f.win)
  const tree = () => {
    const list = f.sessions.list.getSnapshot()
    return sidebar.groupByWorkspace(sidebar.useBoardWorkspaceList({...list,ids:Object.keys(list.byId)}),f.workspaces.list.getSnapshot().items,new Set(f.workspaces.list.getSnapshot().archivedSessionIds ?? [])) as Array<{sessions:Array<{id:string}>}>
  }
  const visible = () => tree().flatMap(group => group.sessions.map(session => session.id))
  const setSummary = (patch: Record<string, unknown>) => {
    const list = f.sessions.list.getSnapshot()
    f.sessions.list.set({...list,byId:{...list.byId,[entry.sessionId]:{...list.byId[entry.sessionId],...patch}}})
  }
  // This is the saved desktop-owned artifact representation read by the real
  // blank/engaged filter; plain journal blank summaries are not force-unblanked.
  f.disk.set('sherlock.research.canvas.artifacts.v1:' + entry.sessionId,JSON.stringify([{id:'saved-chart',title:'Saved research chart'}]))
  return {...f,entry,sidebar,tree,visible,setSummary,hidden:()=>JSON.parse(f.win.document.documentElement.dataset.srbHiddenSessions ?? '[]') as string[]}
}
it.each(['board','workbench'])('keeps the original registered %s inside its real Workspace after dedicated pinning and cold summary restore',async kind=>{
  const f = await projectedGuideFixture(kind), id=f.entry.sessionId
  expect((await f.registry.resolveByPath(f.entry.cwd))!.sessionIds).toEqual([id])
  expect(f.sessions.list.getSnapshot().current).toBe('original')
  expect(f.state.favorites.find((row:any)=>row.sessionId===id).dedicated).toBe(true)
  expect(f.page.isBoardOnly(id)).toBe(true)
  expect(f.sidebar.researchSessionEngaged(id)).toBe(true)
  expect(f.visible()).toContain(id)
  expect(f.hidden()).not.toContain(id)
  await f.coldSession(id)
  expect(f.ctx.agents.get(SessionId(id))).toBeUndefined()
  await f.sessions.binding(id).session.rename('User-renamed original')
  f.emitState()
  expect(f.visible()).toContain(id)
  expect(f.calls.filter(row=>row[0]==='session.create')).toHaveLength(1)
})
it('retains dedicated copies and shared-board local sessions in the hidden set while exposing only the registered original',async()=>{
  const f=await projectedGuideFixture('board'),id=f.entry.sessionId
  const workspace=await f.registry.resolveByPath(f.entry.cwd)
  const copy=await f.sessions.create({cwd:f.entry.cwd}),mirror=await f.sessions.create({cwd:f.entry.cwd})
  for(const sessionId of [copy,mirror])f.unwrap(await f.workspaces.api.sessions.create({workspaceId:workspace!.id,sessionId}))
  await f.workspaces.refresh()
  const list=f.sessions.list.getSnapshot()
  f.sessions.list.set({...list,byId:{...list.byId,[copy]:{...list.byId[copy],blank:false},[mirror]:{...list.byId[mirror],blank:false}}})
  f.state.favorites.push({favoriteId:'ordinary-copy',sessionId:copy,pinned:true,dedicated:true})
  f.state.boards.push({boardId:'shared-board',localSessionId:mirror,pinned:true})
  f.emitState()
  expect(new Set(f.hidden())).toEqual(new Set([copy,mirror]))
  expect(f.visible()).toContain(id)
  expect(f.visible()).not.toContain(copy);expect(f.visible()).not.toContain(mirror)
  f.state.boards.push({boardId:'shared-original',localSessionId:id,pinned:true});f.emitState()
  expect(f.hidden()).toContain(id);expect(f.visible()).not.toContain(id)
})

it.each(['account','cwd','workspace','archived','removed','parent','origin','subagent'])('does not expose a dedicated guide original after its %s ownership or root-session guard fails',async guard=>{
  const f=await projectedGuideFixture('workbench'),id=f.entry.sessionId
  expect(f.visible()).toContain(id)
  if(guard==='account')f.setOwner('other')
  else if(guard==='cwd')f.setSummary({cwd:f.root})
  else if(guard==='removed')f.setSummary({removed:true})
  else if(guard==='parent')f.setSummary({parentId:'parent-agent'})
  else if(guard==='origin')f.setSummary({origin:'subagent'})
  else if(guard==='subagent')f.setSummary({subagent:true})
  else if(guard==='workspace'){
    const list=f.workspaces.list.getSnapshot();(f.workspaces.list as any).getSnapshot=()=>({...list,items:list.items.map((row:any)=>({...row,sessionIds:[]}))});f.emitState()
  }else if(guard==='archived'){
    await f.workspaces.archiveSession(id)
  }
  expect(f.hidden()).toContain(id)
  expect(f.visible()).not.toContain(id)
})
it('keeps the ordinary blank/engaged and archived filters after the guide-only hidden-set exception',async()=>{
  const f=await projectedGuideFixture('board'),id=f.entry.sessionId
  expect(f.sessions.list.getSnapshot().byId[id].blank).toBe(true)
  expect(f.visible()).toContain(id)
  f.disk.delete('sherlock.research.canvas.artifacts.v1:'+id)
  expect(f.hidden()).not.toContain(id)
  expect(f.visible()).not.toContain(id)
  f.setSummary({blank:false})
  expect(f.visible()).toContain(id)
  await f.workspaces.archiveSession(id)
  expect(f.visible()).not.toContain(id)
})

it.each(['missing','other-owner','wrong-cwd'] as const)('keeps an existing dedicated session hidden without a matching %s guide registration',async registration=>{
  const f=await fixture('board',{registration}),id=f.legacy!.sessionId
  const workspace=await f.workspaces.create({path:f.legacy!.cwd})
  f.unwrap(await f.workspaces.api.sessions.create({workspaceId:workspace.workspaceId,sessionId:id}))
  await f.workspaces.refresh()
  f.state.favorites.push({favoriteId:'legacy-dedicated',sessionId:id,pinned:true,dedicated:true,cwd:f.legacy!.cwd})
  f.emitState()
  expect(JSON.parse(f.win.document.documentElement.dataset.srbHiddenSessions ?? '[]')).toContain(id)
  const sidebar=await sidebarProjection(f.win),list=f.sessions.list.getSnapshot()
  const groups=sidebar.groupByWorkspace(sidebar.useBoardWorkspaceList({...list,ids:Object.keys(list.byId)}),f.workspaces.list.getSnapshot().items,new Set())
  expect(groups.flatMap((group:any)=>group.sessions.map((session:any)=>session.id))).not.toContain(id)
})
