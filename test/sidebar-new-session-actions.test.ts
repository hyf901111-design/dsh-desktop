import {installSidebarNewNote,patchSidebarNewNoteShell} from '../scripts/lib/sidebar-new-note.mjs'
import {createSidebarNewNoteAction} from '../src/preload/sidebar-new-note'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { patchSessionViewPreferences } from '../scripts/lib/session-view-preferences.mjs'
import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host'

type ClientBundle = Record<string, unknown>
type BundleDescriptor = {
  factory(require: (id: string) => unknown): ClientBundle
}

const requireModule = createRequire(import.meta.url)
const { installInitialChatViewIntent, patchNewChatSessionRuntime } = requireModule('../scripts/lib/session-view-preferences.mjs')
const { installImageFactoryContext } = requireModule('../scripts/lib/image-factory-native.mjs')
const react = requireModule('react') as Record<string, unknown>
const jsxRuntime = requireModule('react/jsx-runtime') as Record<string, unknown>
const { createElement } = react as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const { act } = react as {
  act: (callback: () => void | Promise<void>) => Promise<void>
}
const { createRoot } = requireModule('react-dom/client') as {
  createRoot(container: unknown): { render(node: unknown): void; unmount(): void }
}

const previousGlobals = {
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  window: globalThis.window
}

function installBrowserGlobals(browserWindow: Window) {
  Object.assign(globalThis, {
    document: browserWindow.document,
    HTMLElement: browserWindow.HTMLElement,
    window: browserWindow,
    IS_REACT_ACT_ENVIRONMENT: true
  })
}

afterEach(() => {
  Object.assign(globalThis, previousGlobals)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = false
})

function fakeModule(): unknown {
  let fake: unknown
  const target = function () {}
  fake = new Proxy(target, {
    get: () => fake,
    apply: () => fake,
    construct: () => ({})
  })
  return fake
}

async function loadClientBundle(
  packageName: string,
  browserWindow?: Window,
  expose: string[] = [],
  patch?: (source:string)=>string,
  providers:Record<string,unknown>={}
): Promise<ClientBundle> {
  let source = await readFile(`node_modules/@deepseek-ai/${packageName}/lib/client.js`, 'utf8')
  if (packageName === 'dsh-client-ui-conversation') source = patchSessionViewPreferences(source)
  if(patch)source=patch(source)
  if (expose.length > 0) {
    source = source.replace(
      '\t\texports.apply = apply;',
      `\t\texports.apply = apply;\n${expose.map((name) => `\t\texports.__test${name} = ${name};`).join('\n')}`
    )
  }
  let descriptor: BundleDescriptor | undefined
  const bundleWindow = browserWindow ?? ({ sessionStorage: undefined } as unknown as Window)
  Object.assign(bundleWindow, {
    __ModuleLoader__: {
      load(value: BundleDescriptor) {
        descriptor = value
      }
    }
  })
  runInNewContext(source, {
    TextEncoder,
    TextDecoder,
    AbortController,
    window: bundleWindow,
    document: browserWindow?.document,
    navigator: browserWindow?.navigator ?? { userAgent: '' },
    localStorage: browserWindow?.localStorage,
    sessionStorage: browserWindow?.sessionStorage,
    CustomEvent: browserWindow?.CustomEvent,
    Event: browserWindow?.Event,
    MutationObserver: browserWindow?.MutationObserver,
    HTMLElement: browserWindow?.HTMLElement,
    requestAnimationFrame: browserWindow?.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow?.cancelAnimationFrame.bind(browserWindow),
    queueMicrotask,
    setTimeout,
    clearTimeout,
    console
  })
  if (descriptor === undefined) throw new Error(`${packageName} did not register its client bundle`)

  return descriptor.factory((id) => {
    if(providers[id])return providers[id]
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === 'react-dom') return requireModule('react-dom')
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      const Tooltip = ({ children }: { children: unknown }) => children
      const IconNewChat = ({ className }: { className?: string }) =>
        createElement('span', { className, 'data-test-icon': 'chat' })
      const IconSearch = ({ className }: { className?: string }) =>
        createElement('span', { className, 'data-test-icon': 'search' })
      return new Proxy({
        Tooltip,
        IconNewChatOutline16: IconNewChat,
        IconSearchOutline16: IconSearch,
        IconPanelLeftOutline16: IconNewChat
      }, { get: (target, property) => Reflect.get(target, property) ?? fakeModule() })
    }
    return fakeModule()
  })
}

async function researchRuntimeFixture(options: {
  values?: Map<string, string>
  rename?: (payload: { sessionId: string; title: string }) => Promise<unknown>
} = {}) {
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  installBrowserGlobals(browserWindow)
  const values = options.values ?? new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); return true }
  }
  Object.assign(browserWindow, { dshDesktop: { researchCanvasStorage: storage } })
  const client = await loadClientBundle('dsh-client-runtime', browserWindow)
  const Runtime = client.SessionRuntime as new (...args: unknown[]) => any
  const writes: Array<{ sessionId: string; title: string }> = []
  const disposers: Array<() => void> = []
  let nextId = 0
  const runtime = new Runtime({
    get: () => undefined,
    reflect: { provide: () => {} },
    effect: (start: () => (() => void)) => { disposers.push(start()) }
  }, { sessions: {
    create: async () => ({ result: { ok: true, value: { sessionId: `research-${++nextId}` } } }),
    rename: async (payload: { sessionId: string; title: string }) => {
      writes.push(payload)
      return options.rename?.(payload) ?? { result: { ok: true, value: { title: payload.title, seq: writes.length } } }
    }
  } }, {})
  const conversation = await loadClientBundle('dsh-client-ui-conversation', browserWindow)
  const Registry = conversation.ResearchWorkspaceRegistry as new (storage: unknown) => any
  const registry = new Registry(storage)
  return { browserWindow, values, storage, client, runtime, registry, writes, dispose: () => disposers.forEach((dispose) => dispose()) }
}

const flushResearchEffects = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

async function newNoteFixture(pendingWorkspace?: string | null, manualWorkspace?: string | null){
 const w=new Window({url:'https://sherlock.local/'});installBrowserGlobals(w);vi.stubGlobal('CustomEvent',w.CustomEvent)
 let sequence=0
 const api:any={
  sessions:{create:vi.fn(async(input:any)=>({result:{ok:true,value:{sessionId:input.sessionId??'new-note-'+(++sequence)}}}))},
  workspace:{list:async()=>({result:{ok:true,value:{items:[{workspaceId:'active',path:'/active',sessionIds:['old']},{workspaceId:'recent',path:'/recent',sessionIds:[]}],archivedSessionIds:[]}}})}
 }
 const native=await loadClientBundle('dsh-client-runtime',w,[],undefined,{'@deepseek-ai/cordis':new Proxy({Context:{filter:Symbol('filter')}},{get:(target,key)=>Reflect.get(target,key)??fakeModule()})}),context:any={get:()=>undefined,reflect:{provide:()=>{}},effect:()=>{}}
 context.plugin=()=>({ctx:{extend:()=>context},dispose:()=>{}})
 const sessions=new (native.SessionRuntime as any)(context,api,{})
 await sessions.create({sessionId:'old',cwd:'/active'});sessions.open('old')
 const workspaces=new (native.WorkspaceRuntime as any)(context,api,sessions);await workspaces.refresh()
 workspaces.list.update((state:any)=>{state.recentWorkspaceId='recent'})
 const conversation=await loadClientBundle('dsh-client-ui-conversation',w,['createChatStore'],undefined,{'@deepseek-ai/dsh-client-runtime/client':native})
 const chatStore=(conversation.__testcreateChatStore as any)()
 const shell={snapshot:{draft:'原有完整要求😀',draftRev:4,imageIds:['existing-image'],occurrences:[{id:1,source:'skill',offset:2,ref:'original'}]}}
 const stop=installSidebarNewNote({
  sessions,workspaces,chatStore,inputHub:{},getInput:()=>shell,
  getPending:()=>({getSnapshot:()=>({workspaceId:pendingWorkspace}),getManualWorkspace:()=>manualWorkspace}),
  standaloneDirectory:async()=>'/standalone/outputs'
 })
 const action=createSidebarNewNoteAction(w.document as unknown as Document,async()=>{})
 return{w,api,sessions,workspaces,chatStore,shell,action,stop:()=>{action.dispose();stop();w.happyDOM.close();vi.unstubAllGlobals()}}
}

describe('normal new Note workspace flow',()=>{
 it.each(['note','spreadsheet'] as const)('hands off Images before opening a new %s session',async kind=>{
  const f=await newNoteFixture()
  const doc=f.w.document as unknown as Document
  const host=new WorkspaceSurfaceHost(doc)
  const images=installImageFactoryContext({sessions:f.sessions,doc,win:f.w})
  const action=createSidebarNewNoteAction(doc,async()=>{},kind)
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json({ok:true})))
  try {
   host.register('image-factory',doc.createElement('section'))
   host.open('image-factory')
   let scopes:unknown[]=[]
   doc.addEventListener('sherlock:image-factory-task-state',event=>{scopes=(event as CustomEvent).detail.tabs.map((tab:{scope:unknown})=>tab.scope)})
   doc.dispatchEvent(new CustomEvent('sherlock:image-factory-request-session',{detail:{entry:true}}))
   expect(scopes).toEqual(['old'])
   f.api.sessions.create.mockRejectedValueOnce(Error('host offline'))
   await expect(action.create()).rejects.toThrow('host offline')
   expect(host.current()?.surface).toBe('image-factory')
   await action.create()
   const id=f.sessions.list.getSnapshot().current
   expect(id).toBe('new-note-1')
   expect(host.current()).toBeUndefined()
   expect(f.chatStore.create(id).getSnapshot().view).toBe(kind==='note'?'notes':'spreadsheet')
   expect(scopes).toEqual(['old'])
  } finally {action.dispose();images.dispose();host.dispose();f.stop()}
 })
 it.each(['note','spreadsheet'] as const)('opens a new %s session without reusing the research board session',async kind=>{
  const f=await newNoteFixture()
  const doc=f.w.document as unknown as Document
  const action=createSidebarNewNoteAction(doc,async()=>{},kind)
  const fetch=vi.fn(async()=>Response.json({ok:true}))
  vi.stubGlobal('fetch',fetch)
  try {
   f.chatStore.create('old').actions.setView('research')
   const before=JSON.stringify(f.shell.snapshot)
   await action.create()
   const id=f.sessions.list.getSnapshot().current
   expect(id).toBeTruthy()
   expect(id).not.toBe('old')
   expect(f.chatStore.create(id).getSnapshot().view).toBe(kind==='note'?'notes':'spreadsheet')
   expect(f.chatStore.create('old').getSnapshot().view).toBe('research')
   expect(JSON.stringify(f.shell.snapshot)).toBe(before)
   if(kind==='spreadsheet')expect(fetch).toHaveBeenCalledWith('/sherlock/spreadsheet/session',expect.objectContaining({
    body:expect.stringContaining(id)
   }))
  } finally { action.dispose(); f.stop() }
 })
 it.each([
  {selected:'active',options:{workspaceId:'active'}},
  {selected:null,options:{cwd:'/standalone/outputs'}}
 ])('uses the selected Home workspace $selected when opening Notes',async ({selected,options})=>{
  const f=await newNoteFixture(selected)
  try {
   f.sessions.clear()
   f.workspaces.list.update((state:any)=>{state.recentWorkspaceId='recent'})
   await f.action.create()
   expect(f.api.sessions.create).toHaveBeenLastCalledWith(options)
   expect(f.chatStore.create(f.sessions.list.getSnapshot().current).getSnapshot().view).toBe('notes')
  } finally {f.stop()}
 })
 it.each([
  {manual:'recent',options:{workspaceId:'recent'}},
  {manual:null,options:{cwd:'/standalone/outputs'}}
 ])('creates a new app session in the manual project $manual when an older session is open',async ({manual,options})=>{
  const f=await newNoteFixture('active',manual)
  try {
   expect(f.sessions.list.getSnapshot().current).toBe('old')
   await f.action.create()
   expect(f.api.sessions.create).toHaveBeenLastCalledWith(options)
  } finally {f.stop()}
 })
 it('uses the real SDK fresh create/current workspace and persists Notes without consuming the old draft',async()=>{
  const f=await newNoteFixture();try{
   const before=JSON.stringify(f.shell.snapshot);expect(f.sessions.list.getSnapshot().current).toBe('old')
   await f.action.create()
   expect(f.api.sessions.create).toHaveBeenLastCalledWith({workspaceId:'active'})
   const id=f.sessions.list.getSnapshot().current;expect(id).not.toBe('old');expect(f.chatStore.create(id).getSnapshot().view).toBe('notes')
   expect(f.w.localStorage.getItem('ework.session.view.v1:'+id)).toBe('notes');expect(JSON.stringify(f.shell.snapshot)).toBe(before)
  }finally{f.stop()}
 })
 it('waits for confirmed old Note saving, coalesces clicks, and cancels a changed owner before fresh create',async()=>{
  const f=await newNoteFixture();try{
   let release!:()=>void;const action=createSidebarNewNoteAction(f.w.document as unknown as Document,()=>new Promise<void>(resolve=>{release=resolve}));const count=f.api.sessions.create.mock.calls.length
   const first=action.create();expect(action.create()).toBe(first);await flushResearchEffects();expect(f.api.sessions.create).toHaveBeenCalledTimes(count)
   f.sessions.clear();release();await expect(first).rejects.toMatchObject({name:'AbortError'});expect(f.api.sessions.create).toHaveBeenCalledTimes(count)
  }finally{f.stop()}
 })
 it('keeps a late created session unselected after user navigation or a newer draft',async()=>{
  for(const change of ['navigation','draft']){const f=await newNoteFixture();try{
   let release!:()=>void;f.api.sessions.create.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve});return{result:{ok:true,value:{sessionId:'late-note'}}}})
   const result=f.action.create();await flushResearchEffects();if(change==='navigation')f.sessions.clear();else{f.shell.snapshot.draft+='用户新输入';f.shell.snapshot.draftRev++}release()
   await expect(result).rejects.toMatchObject({name:'AbortError'});expect(f.sessions.list.getSnapshot().current).not.toBe('late-note');expect(f.w.localStorage.getItem('ework.session.view.v1:late-note')).toBeNull()
  }finally{f.stop()}}
 })
 it('does not steal a same-session Research navigation while fresh creation is pending',async()=>{
  const f=await newNoteFixture();try{
   let release!:()=>void;f.api.sessions.create.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve});return{result:{ok:true,value:{sessionId:'late-note'}}}})
   const result=f.action.create();await flushResearchEffects();f.chatStore.create('old').actions.setView('research');release()
   await expect(result).rejects.toMatchObject({name:'AbortError'});expect(f.sessions.list.getSnapshot().current).toBe('old');expect(f.chatStore.create('old').getSnapshot().view).toBe('research')
  }finally{f.stop()}
 })
 it.each(['unacknowledged-navigation','same-view-ack','tab-roundtrip','new-chat','account-control'])('respects the native effective view and navigation epoch: %s',async scenario=>{
  const f=await newNoteFixture();try{
   const key='ework.session.view.v1:old',disk=new Map([[key,'chat']]);Object.assign(f.w,{dshDesktop:{researchCanvasStorage:{getItem:(name:string)=>disk.get(name)??null,setItem:()=>false}}})
   f.chatStore.create('old').actions.setView(scenario==='same-view-ack'?'research':'chat')
   let release!:()=>void;f.api.sessions.create.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve});return{result:{ok:true,value:{sessionId:'late-note'}}}})
   const result=f.action.create();await flushResearchEffects()
   if(scenario==='same-view-ack'){disk.set(key,'research');f.w.localStorage.removeItem(key+'.pending-native')}
   else if(scenario==='unacknowledged-navigation')f.chatStore.create('old').actions.setView('research')
   else{const tab=f.w.document.createElement('button');if(scenario==='tab-roundtrip')tab.dataset.conversationViewId='research';else tab.className=scenario==='new-chat'?'hHd-Xa_newSession':'VOzbGW_trigger';f.w.document.body.append(tab);tab.click()}
   release();if(scenario==='same-view-ack'){await result;expect(f.sessions.list.getSnapshot().current).toBe('late-note')}else{await expect(result).rejects.toMatchObject({name:'AbortError'});expect(f.sessions.list.getSnapshot().current).toBe('old')}
  }finally{f.stop()}
 })
 it('does not create after failed save and propagates the original host create error',async()=>{
  const f=await newNoteFixture();try{
   const failed=createSidebarNewNoteAction(f.w.document as unknown as Document,async()=>{throw Error('保存失败')});await expect(failed.create()).rejects.toThrow('保存失败');expect(f.api.sessions.create).toHaveBeenCalledTimes(1)
   f.api.sessions.create.mockRejectedValueOnce(Error('host offline'));await expect(f.action.create()).rejects.toThrow('host offline');expect(f.sessions.list.getSnapshot().current).toBe('old')
  }finally{f.stop()}
 })
 it('does not open a cancelled request when its Host creation later finishes',async()=>{
  const f=await newNoteFixture();try{
   let release!:()=>void;f.api.sessions.create.mockImplementationOnce(async()=>{await new Promise<void>(resolve=>{release=resolve});return{result:{ok:true,value:{sessionId:'cancelled-note'}}}})
   const result=f.action.create();await flushResearchEffects();f.action.reset();await expect(result).rejects.toMatchObject({name:'AbortError'});release();await flushResearchEffects();expect(f.sessions.list.getSnapshot().current).toBe('old')
  }finally{f.stop()}
 })
})

it('starts an unnamed Chat instead of reusing a titled blank session', async () => {
  const w = new Window({ url: 'https://sherlock.local/' })
  installBrowserGlobals(w)
  const client = await loadClientBundle('dsh-client-runtime', w, [], patchNewChatSessionRuntime)
  const WorkspaceRuntime = client.WorkspaceRuntime as new (...args: unknown[]) => any
  const byId: Record<string, { id: string; cwd: string; blank: boolean; title?: string }> = {
    sheet: { id: 'sheet', cwd: '/workspace', blank: true, title: '新表格' },
    renamed: { id: 'renamed', cwd: '/workspace', blank: true, title: '手动标题' },
    chat: { id: 'chat', cwd: '/workspace', blank: true },
  }
  const sessions = {
    list: { subscribe: () => () => {}, getSnapshot: () => ({ ids: Object.keys(byId), byId }) },
    create: vi.fn(async () => 'fresh-chat')
  }
  const install = runInNewContext('(' + installInitialChatViewIntent.toString() + ')', {
    window: w,
    sherlockBoardsAdapter: { getState: () => ({ account: { status: 'ready' } }), isBoardOnly: () => false }
  })
  const dispose = install({}, sessions)
  try {
    const policy = Reflect.get(w, Symbol.for('sherlock:initial-chat-reuse'))
    const runtime = new WorkspaceRuntime({ reflect: { provide: vi.fn() } }, {}, sessions)
    runtime.list.update((draft: any) => {
      draft.items = [{ workspaceId: 'workspace-1', path: '/workspace', sessionIds: Object.keys(byId) }]
    })
    expect(await runtime.connectWorkspace('workspace-1', policy.canReuse)).toBe('chat')
    expect(sessions.create).not.toHaveBeenCalled()
    delete byId.chat
    expect(await runtime.connectWorkspace('workspace-1', policy.canReuse)).toBe('fresh-chat')
    expect(sessions.create).toHaveBeenCalledExactlyOnceWith({ workspaceId: 'workspace-1' })
  } finally {
    dispose()
    w.happyDOM.close()
  }
})

it('opens Home directly and keeps New Chat and New Research as separate actions', async () => {
  const w = new Window({ url: 'https://sherlock.local/' })
  installBrowserGlobals(w)
  const client = await loadClientBundle('dsh-client-ui-sidebar', w, ['SidebarRoot'], patchSidebarNewNoteShell)
  const root = createRoot(w.document.body as unknown as Element)
  const startSession = vi.fn()
  const startResearchSession = vi.fn()
  const source = patchSidebarNewNoteShell(await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js', 'utf8'))
  const handler = source.match(/openHome: (\(\) => \{[\s\S]*?\n\s*\}),/u)?.[1]
  expect(handler).toBeDefined()
  let imageActive = true
  let selected: string | undefined = 'image-task'
  w.document.addEventListener('sherlock:sidebar-home-opened', () => { imageActive = false })
  const openHome = vi.fn(runInNewContext('(' + handler + ')', {
    document: w.document,
    CustomEvent: w.CustomEvent,
    ctx: { sessions: { clear() { selected = imageActive ? 'image-task' : undefined } } },
  }))
  try {
    await act(async () => root.render(createElement(client.__testSidebarRoot, {
      collapsed: true, width: 240, t: (key: string) => key, toggleSidebar: vi.fn(),
      openHome, startSession, startResearchSession, renderSlot: () => null
    })))
    const creation = w.document.querySelectorAll('button.hHd-Xa_newSession')
    expect(creation).toHaveLength(1)
    const home = w.document.querySelector('button[data-sidebar-home]')
    expect(home?.getAttribute('aria-label')).toBe('sidebar.home.label')
    home?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    expect(openHome).toHaveBeenCalledOnce()
    expect(selected).toBeUndefined()
    expect(startSession).not.toHaveBeenCalled()
    home?.dispatchEvent(new w.CustomEvent('sherlock:sidebar-new-chat', { bubbles: true }))
    expect(startSession).toHaveBeenCalledOnce()
    expect(startResearchSession).not.toHaveBeenCalled()
    home?.dispatchEvent(new w.CustomEvent('sherlock:sidebar-new-research', { bubbles: true }))
    expect(startResearchSession).toHaveBeenCalledOnce()
    expect(startSession).toHaveBeenCalledOnce()
    await act(async () => root.render(createElement(client.__testSidebarRoot, {
      collapsed: false, width: 240, t: (key: string) => key, toggleSidebar: vi.fn(),
      openHome, startSession, startResearchSession, renderSlot: () => null
    })))
    const sidebar = w.document.querySelector('[data-dsh-sidebar-root]')!
    sidebar.querySelector('[data-sidebar-chat-entry]')!.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    expect(openHome).toHaveBeenCalledOnce()
    sidebar.dispatchEvent(new w.CustomEvent('sherlock:sidebar-new-research', { bubbles: true }))
    expect(startSession).toHaveBeenCalledTimes(2)
    expect(startResearchSession).toHaveBeenCalledTimes(2)
  } finally {
    await act(async () => root.unmount())
    w.happyDOM.close()
  }
})

describe('Sherlock sidebar new-session actions', () => {
  it('renders distinct New Chat and New Research buttons and routes each action separately', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const client = await loadClientBundle('dsh-client-ui-sidebar', browserWindow, ['SidebarRoot'])
    const SidebarRoot = client.__testSidebarRoot as (props: Record<string, unknown>) => unknown
    const host = browserWindow.document.createElement('div')
    browserWindow.document.body.appendChild(host)
    const root = createRoot(host)
    const startSession = vi.fn()
    const startResearchSession = vi.fn()
    const labels: Record<string, string> = {
      'session.new': '新建对话',
      'session.new.label': '新建对话',
      'session.newResearch': '新研究',
      'session.newResearch.label': '新建研究'
    }

    try {
      await act(async () => {
        root.render(createElement(SidebarRoot, {
          collapsed: false,
          width: 280,
          startSession,
          startResearchSession,
          toggleSidebar: vi.fn(),
          t: (key: string) => labels[key] ?? key,
          renderSlot: () => null
        }))
      })

      const chat = host.querySelector('button[aria-label="新建对话"]') as HTMLElement | null
      const research = host.querySelector('button[aria-label="新建研究"]') as HTMLElement | null
      expect(chat?.textContent).toContain('新建对话')
      expect(research?.textContent).toContain('新研究')
      expect(chat?.querySelector('[data-test-icon="chat"]')).not.toBeNull()
      expect(research?.querySelector('[data-sherlock-research-icon]')).not.toBeNull()
      expect(research?.querySelector('[data-test-icon="search"]')).toBeNull()

      await act(async () => { chat?.click() })
      await act(async () => { research?.click() })
      expect(startSession).toHaveBeenCalledOnce()
      expect(startResearchSession).toHaveBeenCalledOnce()
    } finally {
      await act(async () => { root.unmount() })
    }
  })

  it('requests Chat view before reopening a workspace blank session', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const client = await loadClientBundle('dsh-client-ui-sidebar', browserWindow, [], patchSidebarNewNoteShell)
    const navigation: string[] = []
    browserWindow.document.addEventListener('sherlock:sidebar-home-opened', () => navigation.push('home'))
    let registration: {
      inject: () => {
        startSession: (workspaceId?: string) => void
      }
    } | undefined
    const startSession = vi.fn((
      _workspaceId?: string,
      beforeOpen?: (sessionId: string) => void
    ) => {
      navigation.push('connect')
      beforeOpen?.('session-reused-from-research')
    })
    const requested: Array<{ sessionId?: string }> = []
    browserWindow.addEventListener('sherlock:conversation-initial-chat', (event) => {
      navigation.push('chat')
      requested.push((event as unknown as { detail: { sessionId?: string } }).detail)
    })

    ;(client.apply as (context: Record<string, unknown>) => void)({
      effect: (run: () => unknown) => run(),
      layout: { toggleSidebar: vi.fn() },
      locale: { register: vi.fn() },
      slots: {
        register: (value: typeof registration) => {
          registration = value
          return vi.fn()
        }
      },
      workspaces: { startSession }
    })

    registration?.inject().startSession()

    expect(startSession).toHaveBeenCalledWith(undefined, expect.any(Function))
    expect(requested).toEqual([{ sessionId: 'session-reused-from-research' }])
    expect(navigation).toEqual(['home', 'connect', 'chat'])
  })

  it('prepares a requested session before opening it', async () => {
    const client = await loadClientBundle('dsh-client-runtime')
    const WorkspaceRuntime = client.WorkspaceRuntime as new (
      context: Record<string, unknown>, api: Record<string, unknown>, sessions: Record<string, unknown>
    ) => {
      list: { update(mutator: (draft: Record<string, unknown>) => void): void }
      connectWorkspace(workspaceId: string): Promise<string>
      startSession(workspaceId?: string, beforeOpen?: (sessionId: string) => void): void
    }
    const events: string[] = []
    const sessions = {
      list: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: undefined, ids: [], byId: {} })
      },
      open: (sessionId: string) => { events.push(`open:${sessionId}`) },
      clear: vi.fn(),
      create: vi.fn()
    }
    const runtime = new WorkspaceRuntime({
      reflect: { provide: vi.fn() }
    }, {}, sessions)
    runtime.list.update((draft) => {
      draft.items = [{ workspaceId: 'workspace-1', path: '/workspace', sessionIds: [] }]
      draft.recentWorkspaceId = 'workspace-1'
    })
    runtime.connectWorkspace = async () => 'session-new-research'

    runtime.startSession('workspace-1', (sessionId) => {
      events.push(`prepare:${sessionId}`)
    })
    await new Promise<void>((resolve) => queueMicrotask(() => resolve()))

    expect(events).toEqual([
      'prepare:session-new-research',
      'open:session-new-research'
    ])
  })

  it.each([false, true])('keeps new Research tabs switchable with persisted components: %s', async (persisted) => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    browserWindow.sessionStorage.setItem(
      'sherlock.conversation.initial-research-session.v1',
      'session-new-research'
    )
    const client = await loadClientBundle(
      'dsh-client-ui-conversation', browserWindow,
      ['ConversationSessionHeader', 'ConversationSession']
    )
    const ConversationSessionHeader = client.__testConversationSessionHeader as (
      props: Record<string, unknown>
    ) => unknown
    const ConversationSession = client.__testConversationSession as (
      props: Record<string, unknown>
    ) => unknown
    const renderedViews: string[] = []
    const host = browserWindow.document.createElement('div')
    browserWindow.document.body.appendChild(host)
    const root = createRoot(host)
    const state = {
      view: null as string | null,
      draft: '',
      selection: null,
      inspect: null,
      researchRightTab: 'conversation',
      researchFilesTabOpen: true,
      researchConversationUnread: false
    }
    const useSession = (selector: (value: Record<string, unknown>) => unknown) => selector({
      composerPhase: 'blank', blank: true
    })
    const views = {
      subscribe: () => () => {},
      version: () => 1,
      list: () => [{ id: 'chat', label: '对话' }, { id: 'research', label: '研究' }, { id: 'trajectory', label: '轨迹' }]
    }
    const actions = {
      setView: vi.fn((view: string) => { state.view = view }), setDraft: vi.fn(), setInspect: vi.fn()
    }
    const renderSlot = (_name: string, _props?: unknown, options?: { only: string }) => {
      if (options?.only === undefined) return null
      renderedViews.push(options.only)
      return createElement('div', { 'data-rendered-view': options.only })
    }

    const render = () => root.render(createElement(react.Fragment as unknown as string, null,
          createElement(ConversationSessionHeader, {
            sessionId: 'session-new-research',
            useSession,
            useSessions: (selector: (value: Record<string, unknown>) => unknown) => selector({
              byId: {
                'session-new-research': {
                  id: 'session-new-research', displayTitle: '新对话', origin: 'root'
                }
              }
            }),
            useStore: (selector: (value: typeof state) => unknown) => selector(state),
            actions,
            renderSlot,
            views,
            open: vi.fn(),
            t: (key: string) => key
          }),
          createElement(ConversationSession, {
            sessionId: 'session-new-research',
            useSession,
            useInput: (selector: (value: Record<string, unknown>) => unknown) => selector({ draft: '' }),
            inputActions: { setDraft: vi.fn() },
            useStore: (selector: (value: typeof state) => unknown) => selector(state),
            actions,
            views,
            renderSlot,
            bindDraftMirror: () => () => {},
            releaseSessionImages: vi.fn(),
            releaseResearchWorkspace: vi.fn()
          })
        ))
    try {
      await act(async () => { render() })

      expect(renderedViews.at(-1)).toBe('research')
      expect(host.querySelector('[data-rendered-view="research"]')).not.toBeNull()
      expect(host.querySelector('[data-rendered-view="chat"]')).toBeNull()
      expect(host.querySelector('header')?.getAttribute('aria-hidden')).toBeNull()
      expect(host.querySelector('[data-conversation-view-id="research"]')
        ?.getAttribute('aria-selected')).toBe('true')

      if (persisted) browserWindow.localStorage.setItem(
        'sherlock.research.session-engaged.v1:session-new-research', '1'
      )
      for (const target of ['trajectory', 'chat', 'research', 'chat', 'trajectory', 'research']) {
        await act(async () => {
          ;(host.querySelector(`[data-conversation-view-id="${target}"]`) as HTMLElement | null)?.click()
          render()
        })
        expect(actions.setView).toHaveBeenLastCalledWith(target)
        expect(host.querySelector(`[data-conversation-view-id="${target}"]`)
          ?.getAttribute('aria-selected')).toBe('true')
        expect(host.querySelector('header')?.getAttribute('aria-hidden')).toBeNull()
        if (target !== 'chat') expect(host.querySelector(`[data-rendered-view="${target}"]`)).not.toBeNull()
      }
      await act(async () => {
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:conversation-initial-chat', {
          detail: { sessionId: 'session-new-research' }
        }))
        render()
      })
      expect(actions.setView).toHaveBeenLastCalledWith('chat')
      expect(host.querySelector('header')?.getAttribute('aria-hidden')).toBeNull()
    } finally {
      await act(async () => { root.unmount() })
    }
  })

  it('keeps a new Research session in Research when the first message commits', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const sessionId = 'session-new-research-first-message'
    const initialResearchKey = 'sherlock.conversation.initial-research-session.v1'
    browserWindow.sessionStorage.setItem(initialResearchKey, sessionId)
    const client = await loadClientBundle(
      'dsh-client-ui-conversation', browserWindow,
      ['ConversationSession']
    )
    const ConversationSession = client.__testConversationSession as (
      props: Record<string, unknown>
    ) => unknown
    const host = browserWindow.document.createElement('div')
    browserWindow.document.body.appendChild(host)
    const root = createRoot(host)
    const sessionState = { composerPhase: 'blank', blank: true }
    const storeState = {
      view: null as string | null,
      draft: '', selection: null, inspect: null,
      researchRightTab: 'conversation', researchFilesTabOpen: true,
      researchConversationUnread: false
    }
    const actions = {
      setView: vi.fn(), setDraft: vi.fn(), setInspect: vi.fn()
    }
    const renderSession = () => createElement(ConversationSession, {
      sessionId,
      useSession: (selector: (value: typeof sessionState) => unknown) => selector(sessionState),
      useInput: (selector: (value: Record<string, unknown>) => unknown) => selector({ draft: '' }),
      inputActions: { setDraft: vi.fn() },
      useStore: (selector: (value: typeof storeState) => unknown) => selector(storeState),
      actions,
      views: {
        subscribe: () => () => {},
        version: () => 1,
        list: () => [{ id: 'chat', label: '对话' }, { id: 'research', label: '研究' }]
      },
      renderSlot: (_name: string, _props?: unknown, options?: { only: string }) =>
        options?.only === undefined
          ? null
          : createElement('div', { 'data-rendered-view': options.only }),
      bindDraftMirror: () => () => {},
      releaseSessionImages: vi.fn(),
      releaseResearchWorkspace: vi.fn()
    })

    try {
      await act(async () => { root.render(renderSession()) })

      expect(host.querySelector('[data-rendered-view="research"]')).not.toBeNull()
      expect(browserWindow.sessionStorage.getItem(initialResearchKey)).toBe(sessionId)

      // The first accepted prompt changes the host Session from blank to active.
      // Its store scope may be recreated with the default Chat view during that handoff.
      sessionState.composerPhase = 'active'
      sessionState.blank = false
      storeState.view = 'chat'
      await act(async () => { root.render(renderSession()) })

      expect(host.querySelector('[data-rendered-view="research"]')).not.toBeNull()
      expect(host.querySelector('[data-rendered-view="chat"]')).toBeNull()
      expect(actions.setView).toHaveBeenLastCalledWith('research')
      expect(browserWindow.sessionStorage.getItem(initialResearchKey)).toBeNull()
    } finally {
      await act(async () => { root.unmount() })
    }
  })

  it('switches a reused blank Research session back to Chat on request', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const client = await loadClientBundle(
      'dsh-client-ui-conversation', browserWindow,
      ['ConversationSession']
    )
    const ConversationSession = client.__testConversationSession as (
      props: Record<string, unknown>
    ) => unknown
    const host = browserWindow.document.createElement('div')
    browserWindow.document.body.appendChild(host)
    const root = createRoot(host)
    const actions = {
      setView: vi.fn(), setDraft: vi.fn(), setInspect: vi.fn()
    }

    try {
      await act(async () => {
        root.render(createElement(ConversationSession, {
          sessionId: 'session-reused-from-research',
          useSession: (selector: (value: Record<string, unknown>) => unknown) => selector({
            composerPhase: 'blank', blank: true
          }),
          useInput: (selector: (value: Record<string, unknown>) => unknown) => selector({ draft: '' }),
          inputActions: { setDraft: vi.fn() },
          useStore: (selector: (value: Record<string, unknown>) => unknown) => selector({
            view: 'research',
            draft: '',
            selection: null,
            inspect: null,
            researchRightTab: 'conversation',
            researchFilesTabOpen: true,
            researchConversationUnread: false
          }),
          actions,
          views: {
            subscribe: () => () => {},
            version: () => 1,
            list: () => [{ id: 'chat', label: '对话' }, { id: 'research', label: '研究' }]
          },
          renderSlot: (_name: string, _props?: unknown, options?: { only: string }) =>
            options?.only === undefined
              ? null
              : createElement('div', { 'data-rendered-view': options.only }),
          bindDraftMirror: () => () => {},
          releaseSessionImages: vi.fn(),
          releaseResearchWorkspace: vi.fn()
        }))
      })

      await act(async () => {
        browserWindow.dispatchEvent(new browserWindow.CustomEvent(
          'sherlock:conversation-initial-chat',
          { detail: { sessionId: 'session-reused-from-research' } }
        ))
      })

      expect(actions.setView).toHaveBeenCalledWith('chat')
    } finally {
      await act(async () => { root.unmount() })
    }
  })

  it('marks a Research session after its first durable canvas component and never unmarks it', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const client = await loadClientBundle('dsh-client-ui-conversation', browserWindow)
    const Registry = client.ResearchWorkspaceRegistry as new (storage: Storage) => {
      for(sessionId: string): {
        getSnapshot(): { artifacts: Array<{ id: string }> }
        addAssistantResult(input: { messageId: string; text: string; at: { x: number; y: number } }): void
        removeNodes(nodeIds: string[]): void
      }
    }
    const sessionId = 'session-canvas-only-research'
    const engagementKey = `sherlock.research.session-engaged.v1:${sessionId}`
    const engaged: string[] = []
    browserWindow.addEventListener('sherlock:research-session-engaged', (event) => {
      engaged.push((event as unknown as { detail: { sessionId: string } }).detail.sessionId)
    })
    const workspace = new Registry(browserWindow.localStorage as Storage).for(sessionId)

    expect(browserWindow.localStorage.getItem(engagementKey)).toBeNull()
    workspace.addAssistantResult({ messageId: 'assistant-1', text: '研究结论', at: { x: 0, y: 0 } })
    expect(browserWindow.localStorage.getItem(engagementKey)).toBe('1')
    expect(engaged).toEqual([sessionId])

    workspace.removeNodes(workspace.getSnapshot().artifacts.map((artifact) => artifact.id))
    expect(browserWindow.localStorage.getItem(engagementKey)).toBe('1')
  })

  it('shows a persisted blank Research session in workspace projections', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const client = await loadClientBundle(
      'dsh-client-ui-workspace', browserWindow,
      ['sessionVisible', 'sessionTitle']
    )
    const sessionVisible = client.__testsessionVisible as (
      session: Record<string, unknown>, current: string | undefined, archived: Set<string>
    ) => boolean
    const sessionTitle = client.__testsessionTitle as (session: Record<string, unknown>) => string
    const summary = {
      id: 'session-canvas-only-research', origin: 'root', blank: true,
      displayTitle: 'New Session'
    }

    expect(sessionVisible(summary, undefined, new Set())).toBe(false)
    browserWindow.localStorage.setItem(
      'sherlock.research.session-engaged.v1:session-canvas-only-research',
      '1'
    )
    expect(sessionVisible(summary, undefined, new Set())).toBe(true)
    expect(sessionTitle(summary)).toBe('New Research')
  })

  it.each(['origin', 'desktop', 'legacy-desktop'])('opens a %s zero-message Research session directly on its canvas', async (storageKind) => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const sessionId = 'session-persisted-research'
    if (storageKind === 'origin') browserWindow.localStorage.setItem(`sherlock.research.session-engaged.v1:${sessionId}`, '1')
    else Object.assign(browserWindow, { dshDesktop: { researchCanvasStorage: {
      getItem: (key: string) => storageKind === 'desktop'
        ? key === `sherlock.research.session-engaged.v1:${sessionId}` ? '1' : null
        : key === `sherlock.research.canvas.artifacts.v1:${sessionId}` ? JSON.stringify([{
          id: 'legacy-note', kind: 'assistant-excerpt', messageId: 'source-1',
          title: '保留的研究', excerpt: '原有画板内容', x: 0, y: 0
        }]) : null,
      setItem: () => true
    } } })
    const client = await loadClientBundle(
      'dsh-client-ui-conversation', browserWindow,
      ['ConversationSession']
    )
    const ConversationSession = client.__testConversationSession as (
      props: Record<string, unknown>
    ) => unknown
    const host = browserWindow.document.createElement('div')
    browserWindow.document.body.appendChild(host)
    const root = createRoot(host)
    const actions = {
      setView: vi.fn(), setDraft: vi.fn(), setInspect: vi.fn()
    }

    try {
      await act(async () => {
        root.render(createElement(ConversationSession, {
          sessionId,
          useSession: (selector: (value: Record<string, unknown>) => unknown) => selector({
            composerPhase: 'blank', blank: true
          }),
          useInput: (selector: (value: Record<string, unknown>) => unknown) => selector({ draft: '' }),
          inputActions: { setDraft: vi.fn() },
          useStore: (selector: (value: Record<string, unknown>) => unknown) => selector({
            view: 'chat', draft: '', selection: null, inspect: null,
            researchRightTab: 'conversation', researchFilesTabOpen: true,
            researchConversationUnread: false
          }),
          actions,
          views: {
            subscribe: () => () => {},
            version: () => 1,
            list: () => [{ id: 'chat', label: '对话' }, { id: 'research', label: '研究' }]
          },
          renderSlot: (_name: string, _props?: unknown, options?: { only: string }) =>
            options?.only === undefined
              ? null
              : createElement('div', { 'data-rendered-view': options.only }),
          bindDraftMirror: () => () => {},
          releaseSessionImages: vi.fn(),
          releaseResearchWorkspace: vi.fn()
        }))
      })

      expect(host.querySelector('[data-rendered-view="research"]')).not.toBeNull()
      expect(host.querySelector('[data-rendered-view="chat"]')).toBeNull()
      expect(actions.setView).toHaveBeenCalledWith('research')
    } finally {
      await act(async () => { root.unmount() })
    }
  })

  it.each(['marker', 'legacy-artifacts', 'legacy-files'])('keeps %s desktop Research visible and content-named without an origin mirror', async (kind) => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const values = new Map<string, string>()
    if (kind === 'marker') values.set('sherlock.research.session-engaged.v1:research', '1')
    values.set(`sherlock.research.canvas.${kind === 'legacy-files' ? 'files' : 'artifacts'}.v1:research`, JSON.stringify([
      kind === 'legacy-files'
        ? { id: 'file-1', name: '现金流研究.pdf', path: '/research/report.pdf', x: 0, y: 0 }
        : { id: 'note-1', kind: 'pasted-text', title: '现金流研究', excerpt: '正文', x: 0, y: 0 }
    ]))
    Object.assign(browserWindow, { dshDesktop: { researchCanvasStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); return true }
    } } })
    const client = await loadClientBundle('dsh-client-ui-workspace', browserWindow, ['sessionVisible', 'sessionNode', 'displayTitle'])
    const visible = client.__testsessionVisible as (summary: unknown, current: string, archived: Set<string>) => boolean
    const node = client.__testsessionNode as (summary: unknown, descendants: Map<string, unknown>) => unknown
    const display = client.__testdisplayTitle as (node: unknown, t: (key: string) => string) => string
    const summary = { id: 'research', origin: 'root', blank: true, displayTitle: 'New Session' }
    expect(visible(summary, 'another-session', new Set())).toBe(true)
    expect(display(node(summary, new Map()), (key) => key)).toBe(kind === 'legacy-files' ? '现金流研究.pdf' : '现金流研究')
    expect(display(node({ ...summary, title: '用户自定名称', displayTitle: '用户自定名称' }, new Map()), (key) => key)).toBe('用户自定名称')
    expect(visible(summary, 'another-session', new Set(['research']))).toBe(false)
  })

  it.each(['origin', 'desktop', 'legacy-desktop'])('does not reuse an occupied zero-message %s Research canvas', async (kind) => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const values = new Map<string, string>(kind === 'legacy-desktop'
      ? [['sherlock.research.canvas.artifacts.v1:occupied', JSON.stringify([{ id: 'node-1', title: '既有研究', kind: 'pasted-text', excerpt: '内容' }])]]
      : [['sherlock.research.session-engaged.v1:occupied', '1']])
    if (kind === 'origin') for (const [key, value] of values) browserWindow.localStorage.setItem(key, value)
    else Object.assign(browserWindow, { dshDesktop: { researchCanvasStorage: { getItem: (key: string) => values.get(key) ?? null } } })
    const client = await loadClientBundle('dsh-client-runtime', browserWindow)
    const WorkspaceRuntime = client.WorkspaceRuntime as new (...args: unknown[]) => any
    const created: string[] = []
    const sessions = {
      list: {
        subscribe: () => () => {},
        getSnapshot: () => ({ current: 'occupied', ids: ['occupied'], byId: { occupied: { id: 'occupied', blank: true, cwd: '/workspace' } } })
      },
      create: async ({ workspaceId }: { workspaceId: string }) => { created.push(workspaceId); return 'fresh-research' }
    }
    const runtime = new WorkspaceRuntime({ reflect: { provide: vi.fn() } }, {}, sessions)
    runtime.list.update((draft: any) => { draft.items = [{ workspaceId: 'workspace-1', path: '/workspace', sessionIds: ['occupied'] }] })
    expect(await runtime.connectWorkspace('workspace-1')).toBe('fresh-research')
    expect(created).toEqual(['workspace-1'])
    expect(values.size).toBe(1)
  })

  it('materializes the first canvas title through the real Session rename and title projection without starting a conversation', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); return true }
    }
    Object.assign(browserWindow, { dshDesktop: { researchCanvasStorage: storage } })
    const client = await loadClientBundle('dsh-client-runtime', browserWindow)
    const SessionRuntime = client.SessionRuntime as new (...args: unknown[]) => any
    const writes: unknown[] = []
    const disposers: Array<() => void> = []
    const runtime = new SessionRuntime({
      get: () => undefined,
      reflect: { provide: vi.fn() },
      effect: (start: () => (() => void)) => { disposers.push(start()) }
    }, { sessions: {
      create: async () => ({ result: { ok: true, value: { sessionId: 'research-title' } } }),
      rename: async (payload: { sessionId: string; title: string }) => {
        writes.push(payload)
        return { result: { ok: true, value: { title: payload.title, seq: writes.length } } }
      }
    } }, {})
    try {
      await runtime.create({ cwd: '/workspace' })
      const conversation = await loadClientBundle('dsh-client-ui-conversation', browserWindow)
      const Registry = conversation.ResearchWorkspaceRegistry as new (storage: unknown) => any
      const workspace = new Registry(storage).for('research-title')
      workspace.addAssistantResult({ messageId: 'source-1', text: '# 现金流的质量\n证据与边界', at: { x: 0, y: 0 } })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(writes).toEqual([{ sessionId: 'research-title', title: '现金流的质量' }])
      expect(runtime.list.getSnapshot().byId['research-title']).toMatchObject({ title: '现金流的质量', blank: true })
      await runtime.manager.get('research-title').rename('用户改名')
      workspace.createWebLink('https://example.com', { x: 20, y: 30 })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(writes).toEqual([
        { sessionId: 'research-title', title: '现金流的质量' },
        { sessionId: 'research-title', title: '用户改名' }
      ])
    } finally {
      disposers.forEach((dispose) => dispose())
    }
  })

  it.each([
    ['file-drop', '季度研究.pdf'],
    ['clipboard-text', '粘贴的研究事实'],
    ['web-link', 'example.com'],
    ['container-draft', '智能容器'],
    ['assistant-result', '生成结果'],
    ['clipboard-component', '保留的卡片'],
    ['generated-summary', '组合研究摘要']
  ])('persists the first %s component as a zero-message named session', async (kind, title) => {
    const f = await researchRuntimeFixture()
    try {
      const id = await f.runtime.create({ cwd: '/workspace' })
      const workspace = f.registry.for(id)
      const at = { x: 10, y: 20 }
      if (kind === 'file-drop') workspace.setFiles([{ id: 'file', name: title, source: 'computer', path: '/workspace/report.pdf', ...at }])
      if (kind === 'clipboard-text') await workspace.insertClipboardNodes({ kind: 'text', text: title }, at)
      if (kind === 'web-link') workspace.createWebLink('https://example.com/research', at)
      if (kind === 'container-draft') workspace.createContainerDraft(at)
      if (kind === 'assistant-result') workspace.addAssistantResult({ messageId: 'm-1', text: title, at })
      if (kind === 'clipboard-component') await workspace.insertClipboardNodes({ kind: 'components', nodes: [{ id: 'source', kind: 'pasted-text', messageId: 'm-source', title, excerpt: '原文', ...at }] }, at)
      if (kind === 'generated-summary') workspace.setArtifacts([{ id: 'summary', kind: 'generated-summary', title, messageId: 'm-summary', excerpt: '摘要正文', generationStatus: 'completed', generationLastSeq: 0, sourceNodeIds: ['source'], generationSources: [{ id: 'source', type: 'artifact', title: '参考资料', text: '原文' }], ...at }])
      await flushResearchEffects()
      expect(f.writes).toEqual([{ sessionId: id, title }])
      expect(f.runtime.list.getSnapshot().byId[id]).toMatchObject({ title, blank: true })
      expect(f.values.get(`sherlock.research.session-engaged.v1:${id}`)).toBe('1')
      const afterRestart = new (f.registry.constructor)(f.storage).for(id).getSnapshot()
      expect(afterRestart.files.length + afterRestart.artifacts.length).toBe(1)
    } finally { f.dispose() }
  })

  it('recovers a legacy canvas before it is opened, and keeps the existing content after naming', async () => {
    const key = 'sherlock.research.canvas.artifacts.v1:research-1'
    const original = JSON.stringify([{ id: 'old', title: '旧画板研究', kind: 'pasted-text', messageId: 'old-message', excerpt: '不可丢失的内容', x: 0, y: 0 }])
    const f = await researchRuntimeFixture({ values: new Map([[key, original]]) })
    try {
      await f.runtime.create({ cwd: '/workspace' })
      await flushResearchEffects()
      expect(f.writes).toEqual([{ sessionId: 'research-1', title: '旧画板研究' }])
      expect(f.values.get(key)).toBe(original)
      const workspace = f.registry.for('research-1')
      expect(f.values.get('sherlock.research.session-engaged.v1:research-1')).toBe('1')
      workspace.removeNodes(['old'])
      expect(f.values.get('sherlock.research.session-engaged.v1:research-1')).toBe('1')
    } finally { f.dispose() }
  })

  it('does not duplicate delayed title writes and never reuses a canvas when naming fails', async () => {
    let rejectRename!: (reason: Error) => void
    const delayed = new Promise((_resolve, reject) => { rejectRename = reject })
    const f = await researchRuntimeFixture({ rename: () => delayed })
    try {
      const id = await f.runtime.create({ cwd: '/workspace' })
      const workspace = f.registry.for(id)
      workspace.createWebLink('https://example.com', { x: 0, y: 0 })
      workspace.createContainerDraft({ x: 20, y: 20 })
      await flushResearchEffects()
      expect(f.writes).toEqual([{ sessionId: id, title: 'example.com' }])
      const WorkspaceRuntime = f.client.WorkspaceRuntime as new (...args: unknown[]) => any
      const runtime = new WorkspaceRuntime({ reflect: { provide: () => {} } }, {}, f.runtime)
      runtime.list.update((draft: any) => { draft.items = [{ workspaceId: 'w', path: '/workspace', sessionIds: [id] }] })
      expect(await runtime.connectWorkspace('w')).toBe('research-2')
      rejectRename(new Error('offline'))
      await flushResearchEffects()
      runtime.list.update((draft: any) => { draft.items = [{ workspaceId: 'w', path: '/workspace', sessionIds: [id] }] })
      expect(await runtime.connectWorkspace('w')).toBe('research-3')
      expect(workspace.getSnapshot().artifacts).toHaveLength(2)
    } finally { f.dispose() }
  })

  it('retries a rejected automatic title on the next durable canvas change', async () => {
    let attempts = 0
    const f = await researchRuntimeFixture({ rename: async (payload) => ++attempts === 1
      ? { result: { ok: false, error: { code: 'offline', message: 'retry later' } } }
      : { result: { ok: true, value: { title: payload.title, seq: 1 } } }
    })
    try {
      const id = await f.runtime.create({ cwd: '/workspace' })
      const workspace = f.registry.for(id)
      workspace.createWebLink('https://example.com', { x: 0, y: 0 })
      await flushResearchEffects()
      expect(f.writes).toHaveLength(1)
      expect(f.runtime.list.getSnapshot().byId[id].title).toBeUndefined()
      workspace.createContainerDraft({ x: 20, y: 20 })
      await flushResearchEffects()
      expect(f.writes).toEqual([{ sessionId: id, title: 'example.com' }, { sessionId: id, title: 'example.com' }])
      expect(f.runtime.list.getSnapshot().byId[id].title).toBe('example.com')
    } finally { f.dispose() }
  })

  it('uses acknowledged desktop storage when the origin mirror rejects every canvas write', async () => {
    const f = await researchRuntimeFixture()
    try {
      const id = await f.runtime.create({ cwd: '/workspace' })
      Object.defineProperty(f.browserWindow.localStorage, 'setItem', { configurable: true, value: () => { throw new Error('origin quota') } })
      const workspace = new (f.registry.constructor)().for(id)
      workspace.createWebLink('https://example.com', { x: 0, y: 0 })
      await flushResearchEffects()
      expect(f.browserWindow.localStorage.getItem(`sherlock.research.session-engaged.v1:${id}`)).toBeNull()
      expect(f.values.get(`sherlock.research.session-engaged.v1:${id}`)).toBe('1')
      expect(f.runtime.list.getSnapshot().byId[id]).toMatchObject({ title: 'example.com', blank: true })
      const workspaceClient = await loadClientBundle('dsh-client-ui-workspace', f.browserWindow, ['sessionVisible'])
      expect((workspaceClient.__testsessionVisible as any)(f.runtime.list.getSnapshot().byId[id], 'other', new Set())).toBe(true)
    } finally { f.dispose() }
  })

  it('keeps readable legacy metadata safe when an optional artifact kind is malformed', async () => {
    const f = await researchRuntimeFixture({ values: new Map([
      ['sherlock.research.canvas.artifacts.v1:research-1', JSON.stringify([{ id: 'legacy', kind: 7, title: '保留名称', x: 0, y: 0 }])]
    ]) })
    try {
      await f.runtime.create({ cwd: '/workspace' })
      await flushResearchEffects()
      expect(f.writes).toEqual([{ sessionId: 'research-1', title: '保留名称' }])
    } finally { f.dispose() }
  })

  it('preserves a pre-existing user title when an untitled legacy canvas is discovered', async () => {
    const f = await researchRuntimeFixture({ values: new Map([
      ['sherlock.research.canvas.files.v1:research-1', JSON.stringify([{ id: 'report', name: '自动候选.pdf', source: 'computer', x: 0, y: 0 }])]
    ]) })
    try {
      f.runtime.manager.projectionStore('research-1').apply('title', '我的自定标题', 10)
      await f.runtime.create({ cwd: '/workspace' })
      await flushResearchEffects()
      expect(f.writes).toEqual([])
      expect(f.runtime.list.getSnapshot().byId['research-1'].title).toBe('我的自定标题')
    } finally { f.dispose() }
  })

  it('hydrates legacy canvas identity without synchronously updating the sidebar during React render', async () => {
    const f = await researchRuntimeFixture({ values: new Map([
      ['sherlock.research.canvas.files.v1:research-1', JSON.stringify([{ id: 'file', name: '旧研究.pdf', source: 'computer', x: 0, y: 0 }])]
    ]) })
    const { useState, useEffect, useMemo, Fragment } = react as any
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Sidebar = () => {
      const [revision, setRevision] = useState(0)
      useEffect(() => {
        const refresh = () => setRevision((value: number) => value + 1)
        f.browserWindow.addEventListener('sherlock:research-session-engaged', refresh)
        return () => f.browserWindow.removeEventListener('sherlock:research-session-engaged', refresh)
      }, [])
      return createElement('span', { 'data-sidebar-revision': revision })
    }
    const Canvas = () => {
      useMemo(() => f.registry.for('research-1'), [])
      return createElement('div', { 'data-canvas': '' })
    }
    const host = f.browserWindow.document.createElement('div')
    f.browserWindow.document.body.appendChild(host)
    const root = createRoot(host)
    try {
      await act(async () => { root.render(createElement(Fragment, null, createElement(Sidebar), null)) })
      await act(async () => { root.render(createElement(Fragment, null, createElement(Sidebar), createElement(Canvas))) })
      expect(f.values.get('sherlock.research.session-engaged.v1:research-1')).toBe('1')
      expect(host.querySelector('[data-sidebar-revision]')?.getAttribute('data-sidebar-revision')).toBe('1')
      expect(errors.mock.calls.filter((args) => args.some((value) => String(value).includes('Cannot update a component')))).toEqual([])
    } finally {
      await act(async () => root.unmount())
      errors.mockRestore()
      f.dispose()
    }
  })
})
