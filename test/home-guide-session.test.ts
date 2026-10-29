import { Window } from 'happy-dom'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => Object.fromEntries(['StateDot','Modal','Button','IconTrashOutline16','Menu','IconPlusOutline16','IconEllipsisOutline16','IconSearchOutline16','IconFolderOpenOutline16','IconEditOutline16','IconTriangleRightFill14'].map(name => [name, () => null])))
import { createResearchBoardsPage } from '../src/preload/research-boards-ui'
import {Session} from '@deepseek-ai/dsh-session'
import {readFileSync,mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ResearchCanvasStorage} from '../src/main/state/research-canvas-storage'
import {runInNewContext} from 'node:vm'
import ts from 'typescript'

const runtimeTree=ts.createSourceFile('runtime.js',readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),titleFunctions=new Map<string,string>()
const visit=(node:ts.Node)=>{if(ts.isFunctionDeclaration(node)&&node.name&&['displayTitleOf','workspaceTitleOf'].includes(node.name.text))titleFunctions.set(node.name.text,node.getText(runtimeTree));ts.forEachChild(node,visit)};visit(runtimeTree)
const nativeDisplayTitle=runInNewContext([...titleFunctions.values()].join('\n')+';displayTitleOf') as (title:string|undefined,cwd:string,id:string)=>string

const cleanup: Array<() => void> = []
afterEach(() => cleanup.splice(0).reverse().forEach(stop => stop()))
function store<T>(value: T) { const listeners = new Set<() => void>(); return { getSnapshot: () => value, subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) }, set(next: T) { value = next; listeners.forEach(fn => fn()) } } }
async function fixture({ disk = new Map<string, string>(), byId = {} as Record<string, any>, createGate = Promise.resolve(), storage = undefined as Pick<ResearchCanvasStorage,'getItem'|'setItem'> | undefined } = {}) {
  const oldEvent = globalThis.Event, oldDocument = globalThis.document
  const win = new Window({ url: 'http://localhost:43210' }), requests: any[] = [], opened: string[] = [], archived: string[] = [],nativeSessions=new Map<string,any>()
  const list = store<{ current: string; byId: Record<string, any> }>({ current: 'original', byId: { original: { id: 'original', title: '我的研究', cwd: '/workspace' }, ...byId } })
  let emit: (event: any) => void = () => {}, sequence = 0
  const state: any = { version: 1, eventSeq: 1, account: { status: 'ready', generation: 1, user: { userId: 'owner' } }, favorites: [], boards: [], current: null, recoveries: [], notifications: { cursor: 0, unreadCount: 0, pendingCount: 0, notifications: [] } }
  const canvases = new Map<string, any>()
  const workspaces = { list: store({ items: [] as any[] }), create: async ({path}: {path:string}) => { requests.push(['workspace.create',path]); const existing=workspaces.list.getSnapshot().items.find(item=>item.path===path);if(existing)return existing;const item={workspaceId:'workspace:'+path,path,sessionIds:[]};workspaces.list.set({items:[...workspaces.list.getSnapshot().items,item]});return item }, api: { host: { describe: async () => ({ result: { ok: true, value: { cwd: '/workspace' } } }) }, sessions: {create:async(input:any)=>{requests.push(['workspace.attach',input]);workspaces.list.set({items:workspaces.list.getSnapshot().items.map(item=>item.workspaceId===input.workspaceId?{...item,sessionIds:[input.sessionId]}:item)});return {result:{ok:true,value:{sessionId:input.sessionId}}}}} }, archiveSession: async (id: string) => { archived.push(id) } }
  const sessions = { list, open(id: string) { opened.push(id); list.set({ ...list.getSnapshot(), current: id }) }, async create({ cwd }: any) { requests.push(['create', cwd]); await createGate; const id = 'guide-' + (++sequence); nativeSessions.set(id,Session.create(id as Parameters<typeof Session.create>[0])); list.set({ ...list.getSnapshot(), byId: { ...list.getSnapshot().byId, [id]: { id, cwd, blank: true } } }); return id }, binding(id: string) { return { session: { getSnapshot: () => list.getSnapshot().byId[id], projections:{faceOf:()=>({getSnapshot:()=>nativeSessions.has(id)?nativeSessions.get(id).events.findLast((event:any)=>event.type==='session/title')?.data.title:list.getSnapshot().byId[id]?.title})}, subscribe: () => () => {}, rename: async (title: string) => {nativeSessions.get(id)?.append('session/title',{title,source:{kind:'user'}});list.set({ ...list.getSnapshot(), byId: { ...list.getSnapshot().byId, [id]: { ...list.getSnapshot().byId[id], title, displayTitle: title } } });return{ok:true,value:{title,seq:1}}} } } } }
  ;(win as any).dshDesktop = { researchCanvasStorage: storage ?? { getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => { disk.set(key, value); return true } } }
  globalThis.Event = win.Event as unknown as typeof Event
  globalThis.document = win.document as unknown as Document
  const page = createResearchBoardsPage({ document: win.document as unknown as Document, sessions, workspaces, inputHub: { shells: new Map() }, researchWorkspaces: { for(id: string) { if (!canvases.has(id)) canvases.set(id, { getSnapshot: () => ({ files: [], artifacts: [] }), subscribe: () => () => {}, persist: () => true }); return canvases.get(id) } }, bridge: { isSharedSession: () => false, getSnapshot: async () => state, subscribe: (fn: (event: any) => void) => { emit = fn; return () => {} }, invoke: async (action: string, input: any) => { requests.push([action, input]); if (action === 'local.directory' && input.mode === 'reserve') return { ok: true, value: { directoryId: 'd-' + requests.length, path: '/workspace/examples/' + requests.length } }; if (action === 'favorite.add') { const item = { ...input.identity, favoriteId: 'f-' + requests.length, dedicated: true }; state.favorites.push(item); return { ok: true, value: item } } return { ok: true, value: null } } } } as any)
  const replies: any[] = []
  win.addEventListener('sherlock:home-guide-session-reply', (event: any) => replies.push(event.detail))
  let requestId = 0
  const send = (kind = 'board', command = 'prepare', extra = {}) => { const id = 'r-' + (++requestId); win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-session-request', { detail: { requestId: id, kind, command, ...extra } })); return id }
  const reply = async (id: string) => { await expect.poll(() => replies.find(value => value.requestId === id), { timeout: 500 }).toBeTruthy(); return replies.find(value => value.requestId === id) }
  await Promise.resolve(); await Promise.resolve()
  cleanup.push(() => { page.dispose(); globalThis.Event = oldEvent; globalThis.document = oldDocument; void win.happyDOM.abort() })
  return { win, page, sessions, workspaces, state, requests, opened, archived, disk, replies, send, reply,nativeSessions, setOwner(userId: string, advanceGeneration = true) { state.account = { status: 'ready', generation: state.account.generation + (advanceGeneration ? 1 : 0), user: { userId } }; state.eventSeq++; emit({ type: 'state', state: { ...state }, eventSeq: state.eventSeq, accountGeneration: state.account.generation }) } }
}
it('prepares a dedicated report session and gives its separate replay the same concise demo title', async () => {
  const f = await fixture(), first = await f.reply(f.send('report'))
  expect(first).toMatchObject({ ok: true, title: '研究报告示例（演示案例）', fresh: true })
  const repeated = await f.reply(f.send('report'))
  expect(repeated).toMatchObject({ ok: true, sessionId: first.sessionId, fresh: false })
  const copy = await f.reply(f.send('report', 'prepare', { replay: true }))
  expect(copy).toMatchObject({ ok: true, title: '研究报告示例（演示案例）', fresh: true })
  expect(copy.sessionId).not.toBe(first.sessionId); expect(copy.cwd).not.toBe(first.cwd)
  expect(f.requests.filter(item => item[0] === 'favorite.add')).toEqual([])
  const reopen = await fixture({ disk: f.disk, byId: f.sessions.list.getSnapshot().byId })
  expect(await reopen.reply(reopen.send('report'))).toMatchObject({ ok: true, sessionId: copy.sessionId, fresh: false })
  reopen.setOwner('another')
  expect(await reopen.reply(reopen.send('report', 'open', { sessionId: copy.sessionId }))).toMatchObject({ ok: false })
})
it.each([
 ['board','自选行情示例看板（演示案例）'],['note','AI 护航研究笔记示例（演示案例）'],
 ['ppt','公司风格演示示例（演示案例）'],['report','研究报告示例（演示案例）']
])('keeps the concise %s title for both first use and an independently stored replay',async(kind,title)=>{
 const f=await fixture(),first=await f.reply(f.send(kind)),replay=await f.reply(f.send(kind,'prepare',{replay:true}))
 for(const row of [first,replay])expect(row).toMatchObject({ok:true,title,fresh:true})
 expect(replay.sessionId).not.toBe(first.sessionId);expect(replay.cwd).not.toBe(first.cwd)
 expect(f.sessions.list.getSnapshot().byId[first.sessionId].title).toBe(kind==='board'?'新研究':kind==='note'?'新笔记':'新会话')
 expect(f.sessions.list.getSnapshot().byId[replay.sessionId].title).toBe(kind==='board'?'新研究':kind==='note'?'新笔记':'新会话')
})
it.each(['board','note','ppt','report'])('names the registered %s only after its current successful activity checkpoint',async kind=>{
 const f=await fixture(),entry=await f.reply(f.send(kind));expect(f.sessions.list.getSnapshot().byId[entry.sessionId].title).toBe(kind==='board'?'新研究':kind==='note'?'新笔记':'新会话')
 expect(await f.reply(f.send(kind,'activate-title',{sessionId:entry.sessionId}))).toMatchObject({ok:false})
 await f.reply(f.send(kind,'open',{sessionId:entry.sessionId}))
 expect(await f.reply(f.send(kind,'activate-title',{sessionId:entry.sessionId}))).toMatchObject({ok:true})
 expect(f.sessions.list.getSnapshot().byId[entry.sessionId].title).toBe(entry.title)
 expect(await f.reply(f.send(kind,'activate-title',{sessionId:entry.sessionId}))).toMatchObject({ok:true})
})
it.each(['board','note','ppt','report'])('keeps the actual native %s title projection from falling back to its final workspace name',async kind=>{
 for(const english of [false,true]){
  const f=await fixture();f.win.document.documentElement.dataset.odysseyLocale=english?'en':'zh'
  const entry=await f.reply(f.send(kind)),row=f.sessions.list.getSnapshot().byId[entry.sessionId]
  const expected=english?{board:'New Research',note:'New Note',ppt:'New Session',report:'New Session'}[kind]:{board:'新研究',note:'新笔记',ppt:'新会话',report:'新会话'}[kind]
  const event=f.nativeSessions.get(entry.sessionId).events.findLast((event:any)=>event.type==='session/title')
  expect(nativeDisplayTitle(undefined,entry.cwd,entry.sessionId)).toBe(entry.cwd.split('/').at(-1))
  expect(nativeDisplayTitle(event?.data.title,entry.cwd,entry.sessionId)).toBe(expected)
  expect(row.title).toBe(expected);expect(event.data.title).not.toBe(entry.title)
 }
})
it.each(['custom','directory','owner'])('does not rename after a %s change to a prepared session',async change=>{
 const f=await fixture(),entry=await f.reply(f.send('ppt'));await f.reply(f.send('ppt','open',{sessionId:entry.sessionId}))
 if(change==='custom')await f.sessions.binding(entry.sessionId).session.rename('用户自己的名字')
 if(change==='directory'){const list=f.sessions.list.getSnapshot();f.sessions.list.set({...list,byId:{...list.byId,[entry.sessionId]:{...list.byId[entry.sessionId],cwd:'/changed'}}})}
 if(change==='owner')f.setOwner('other')
 const result=await f.reply(f.send('ppt','activate-title',{sessionId:entry.sessionId}))
 expect(result.ok).toBe(change==='custom')
 expect(f.sessions.list.getSnapshot().byId[entry.sessionId].title).toBe(change==='custom'?'用户自己的名字':'新会话')
})
it('prepares a real dedicated board without navigation, reuses it and opens only a registered matching session', async () => {
  const f = await fixture(), a = f.send(), b = f.send()
  const first = await f.reply(a), second = await f.reply(b)
  expect(first).toMatchObject({ ok: true, fresh: true, sessionId: 'guide-1' }); expect(second.sessionId).toBe(first.sessionId)
  expect(f.requests.filter(item => item[0] === 'create')).toHaveLength(1)
  expect(f.requests.filter(item => item[0] === 'favorite.add')).toHaveLength(1)
  expect(f.opened).toEqual([]); expect(f.sessions.list.getSnapshot().current).toBe('original')
  expect((await f.reply(f.send('board', 'open', { sessionId: first.sessionId }))).ok).toBe(true)
  expect(f.opened).toEqual([first.sessionId]); expect(f.archived).toEqual([])
  expect((await f.reply(f.send('note', 'open', { sessionId: first.sessionId }))).ok).toBe(false)
})
it('creates ordinary note and presentation sessions, and replay keeps the previous result', async () => {
  const f = await fixture(), note = await f.reply(f.send('note')), ppt = await f.reply(f.send('ppt'))
  expect(note.ok).toBe(true); expect(ppt.ok).toBe(true); expect(note.sessionId).not.toBe(ppt.sessionId)
  expect(f.requests.filter(item => item[0] === 'favorite.add')).toHaveLength(0)
  const replay = await f.reply(f.send('note', 'prepare', { replay: true }))
  expect(replay.ok).toBe(true); expect(replay.sessionId).not.toBe(note.sessionId)
  expect(f.sessions.list.getSnapshot().byId[note.sessionId]).toBeTruthy(); expect(f.opened).toEqual([])
})
it('uses main-backed registration across renderer recreation and isolates account ownership', async () => {
  const a = await fixture(), first = await a.reply(a.send())
  expect(a.disk.size).toBeGreaterThan(0)
  const b = await fixture({ disk: a.disk, byId: a.sessions.list.getSnapshot().byId })
  const repeated = await b.reply(b.send()); expect(repeated.sessionId).toBe(first.sessionId); expect(repeated.fresh).toBe(false)
  expect(b.requests.filter(item => item[0] === 'create')).toHaveLength(0)
  b.setOwner('other'); expect((await b.reply(b.send('board', 'open', { sessionId: first.sessionId }))).ok).toBe(false)
})
it('does not navigate or publish success for creation that outlives identity change or disposal', async () => {
  let finish!: () => void; const f = await fixture({ createGate: new Promise<void>(resolve => { finish = resolve }) }), id = f.send()
  await expect.poll(() => f.requests.some(item => item[0] === 'create')).toBe(true)
  f.setOwner('other'); finish(); expect((await f.reply(id)).ok).toBe(false); expect(f.opened).toEqual([])
  f.page.dispose(); const count = f.replies.length; f.send(); await new Promise(resolve => setTimeout(resolve, 20)); expect(f.replies).toHaveLength(count)
})

it('rejects account A to B to A creation even if an upstream generation is unchanged', async () => {
  let finish!: () => void
  const f = await fixture({ createGate: new Promise<void>(resolve => { finish = resolve }) }), id = f.send()
  await expect.poll(() => f.requests.some(item => item[0] === 'create')).toBe(true)
  f.setOwner('other', false); f.setOwner('owner', false); finish()
  expect((await f.reply(id)).ok).toBe(false)
  expect(f.opened).toEqual([]); expect(f.disk.size).toBe(0)
})

it('uses the real Workspace membership instead of a virtual registered-example directory', async () => {
 const f=await fixture(),note=await f.reply(f.send('note')),ppt=await f.reply(f.send('ppt'))
 expect(f.page.directoryChoice(note.sessionId)).toBe(null)
 expect(f.page.directoryChoice(ppt.sessionId)).toBe(null)
 expect(f.workspaces.list.getSnapshot().items).toEqual(expect.arrayContaining([expect.objectContaining({path:note.cwd,sessionIds:[note.sessionId]}),expect.objectContaining({path:ppt.cwd,sessionIds:[ppt.sessionId]})]))
 expect(f.page.directoryChoice('original')).toBe(null)
 f.workspaces.list.set({items:[{workspaceId:'real',path:ppt.cwd,title:'已关联真实工作区',sessionIds:[ppt.sessionId]}]})
 expect(f.page.directoryChoice(ppt.sessionId)).toBe(null)
 const before=f.sessions.list.getSnapshot();f.sessions.list.set({...before,byId:{...before.byId,[note.sessionId]:{...before.byId[note.sessionId],cwd:'/another'}}})
 expect(f.page.directoryChoice(note.sessionId)).toBe(null)
 f.setOwner('other');expect(f.page.directoryChoice(ppt.sessionId)).toBe(null)
 expect(f.opened).toEqual([]);expect(f.requests.filter(item=>item[0]==='create')).toHaveLength(2)
})

it('keeps a registered same-owner example when its current directory is selected and rejects foreign or stale directory placeholders',async()=>{
 const f=await fixture(),note=await f.reply(f.send('note')),ppt=await f.reply(f.send('ppt'))
 for(const entry of [note,ppt])expect(await f.page.associateProject(entry.sessionId,'::board-directory')).toBe(entry.sessionId)
 for(const entry of [note,ppt])expect(await f.page.associateProject(entry.sessionId,'workspace:'+entry.cwd)).toBe(entry.sessionId)
 expect(f.opened).toEqual([]);expect(f.archived).toEqual([]);expect(f.requests.filter(row=>row[0]==='create')).toHaveLength(2)
 await expect(f.page.associateProject('original','::board-directory')).rejects.toThrow()
 const before=f.sessions.list.getSnapshot();f.sessions.list.set({...before,byId:{...before.byId,[note.sessionId]:{...before.byId[note.sessionId],cwd:'/another'}}})
 await expect(f.page.associateProject(note.sessionId,'::board-directory')).rejects.toThrow()
 f.setOwner('other');await expect(f.page.associateProject(ppt.sessionId,'::board-directory')).rejects.toThrow()
})

it('registers the workbench replay through real main storage and reopens it after a cold reader restart',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-main-storage-'))
 cleanup.push(()=>rmSync(directory,{recursive:true,force:true}))
 const f=await fixture({storage:new ResearchCanvasStorage(directory)}),first=await f.reply(f.send('workbench','prepare',{replay:true}))
 expect(first).toMatchObject({ok:true,title:'白酒龙头研究工作台（演示案例）',fresh:true})
 expect(f.sessions.list.getSnapshot().byId[first.sessionId].title).toBe('新研究')
 expect(f.requests.filter(item=>item[0]==='favorite.add')).toEqual([['favorite.add',expect.objectContaining({dedicated:true,identity:expect.objectContaining({sessionId:first.sessionId,title:first.title})})]])
 expect((await f.reply(f.send('workbench','open',{sessionId:first.sessionId}))).ok).toBe(true)
 expect(f.opened).toEqual([first.sessionId])
 expect(await f.reply(f.send('workbench','activate-title',{sessionId:first.sessionId}))).toMatchObject({ok:true})
 expect(f.sessions.list.getSnapshot().byId[first.sessionId].title).toBe(first.title)
 const next=await f.reply(f.send('workbench','prepare',{replay:true}))
 expect(next.sessionId).not.toBe(first.sessionId);expect(next.cwd).not.toBe(first.cwd)
 const reopened=await fixture({storage:new ResearchCanvasStorage(directory),byId:f.sessions.list.getSnapshot().byId})
 expect(await reopened.reply(reopened.send('workbench'))).toMatchObject({ok:true,sessionId:next.sessionId,fresh:false})
 expect(reopened.requests.filter(item=>item[0]==='create')).toHaveLength(0)
 expect(await reopened.reply(reopened.send('workbench','open',{sessionId:next.sessionId}))).toMatchObject({ok:true,sessionId:next.sessionId})
 expect(reopened.opened).toEqual([next.sessionId])
 reopened.setOwner('different');expect((await reopened.reply(reopened.send('workbench','open',{sessionId:next.sessionId}))).ok).toBe(false)
})
