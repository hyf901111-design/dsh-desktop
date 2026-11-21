// Browser fixture: actual transformed module factories, production bridge/UI, real React primitives.
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as jsx from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import * as slotModule from '@deepseek-ai/dsh-client-ui-slots'
import { createManagerWorkbenchCanvas, managerWorkbenchTitle } from './manager-workbench/canvas'
import { createResearchBoardsBridge } from '../../src/preload/research-boards'
import { mountAccountUi } from '../../src/preload/account-ui'
import { mountResearchBoardNotifications } from '../../src/preload/research-board-notifications-ui'
import { SidebarUpdateControl } from '../../src/preload/sidebar-update-control'
const h = React.createElement,
  win = window as any,
  user = new URL(location.href).searchParams.get('user') ?? '0'
const rpc = async (channel: string, ...args: unknown[]) => {
  const r = await fetch('/rpc?user=' + user, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel, args })
  })
  return r.json()
}
const sync = (channel: string, ...args: unknown[]) => {
  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/sync?user=' + user, false)
  xhr.setRequestHeader('content-type', 'application/json')
  xhr.send(JSON.stringify({ channel, args }))
  return JSON.parse(xhr.responseText)
}
const subscribers = new Set<Function>()
new EventSource('/events?user=' + user).onmessage = (e) =>
  subscribers.forEach((fn) => fn({}, JSON.parse(e.data)))
const bridge = createResearchBoardsBridge({
  invoke: rpc,
  sendSync: sync,
  on: (_, fn) => subscribers.add(fn),
  removeListener: (_, fn) => subscribers.delete(fn)
})
win.dshDesktop = {
  researchBoards: bridge,
  researchPreview: {
    restore: (value: any) => rpc('preview:restore', value),
    release: (value: any) => rpc('preview:release', value)
  },
  researchCanvasStorage: {
    getItem: (key: string) => sync('canvas:get', key),
    setItem: (key: string, value: string) => sync('canvas:set', key, value)
  },
  researchClipboard: { canRead: async () => false },
  researchLinkFrame: { releaseSession: async () => {} },
  researchVoice: { setActive: async () => ({ ok: false }) }
}
let descriptor: any
win.__ModuleLoader__ = { load: (d: any) => (descriptor = d) }
const fallback: any = new Proxy(function () {}, {
  get: () => fallback,
  apply: () => undefined,
  construct: () => ({})
})
const loaded: Record<string, any> = {
  react: React,
  'react/jsx-runtime': jsx,
  'react-dom': ReactDOM,
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
  '@deepseek-ai/dsh-client-ui-slots': slotModule
}
for (const name of ['runtime', 'conversation', 'sidebar', 'workspace']) {
  ;(0, eval)(await (await fetch('/' + name + '.js')).text())
  const mod = descriptor.factory((id: string) => loaded[id] ?? fallback)
  loaded[name] = mod
  if (name === 'runtime')
    loaded['@deepseek-ai/dsh-client-runtime/client'] = mod
}
const mod = loaded.conversation,
  sidebar = loaded.sidebar
function store(initial: any) {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe: (fn: () => void) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    set: (v: any) => {
      value = v
      listeners.forEach((fn) => fn())
    }
  }
}
const fixtureWorkspaceState = { items: [], phase: 'ready', archivedSessionIds: [] }
const fixtureWorkspaceView = { groupBy: 'flat', orderBy: 'manual', groupExpansion: {}, sessionOrderByAccount: {}, sessionUpdatedAtByAccount: {} }
const fixtureWorkspaceActions = new Proxy({}, { get: () => () => {} })
const saved = JSON.parse(localStorage.getItem('fixture-sessions') ?? 'null')
const list = store(
  saved ?? {
    current: 'original',
    byId: {
      original: {
        id: 'original',
        title: '黄金市场研究',
        displayTitle: '黄金市场研究',
        cwd: '/fixture',
        blank: false
      }
    },
    ids: ['original'],
    phase: 'ready'
  }
)
const ws = store({
  items: [
    {
      workspaceId: 'workspace',
      path: '/fixture',
      title: '研究资料',
      sessionIds: Object.keys(list.getSnapshot().byId)
    }
  ]
})
const registry = new mod.ResearchWorkspaceRegistry(),
  bindings = new Map<string, any>(),
  scopeEffects: Array<() => void> = []
const sessions: any = {
  list,
  open: (id: string) => {
    const old = list.getSnapshot().current
    // Actual Sessions.select keeps an already-selected session mounted.
    if (old === id) return
    hub.setResearchActive(old, false)
    list.set({ ...list.getSnapshot(), current: id })
    hub.setResearchActive(id, true)
  },
  create: async (options: any = {}) => {
    const id = crypto.randomUUID()
    await rpc('fixture:session-create', id, options)
    const prior = list.getSnapshot()
    list.set({
      ...prior,
      byId: {
        ...prior.byId,
        [id]: {
          id,
          title: '新研究',
          displayTitle: '新研究',
          cwd: options.cwd ?? '/fixture',
          blank: true
        }
      },
      ids: [...prior.ids, id]
    })
    return id
  },
  refresh: async () => {
    const items = await rpc('fixture:session-list')
    const prior = list.getSnapshot()
    list.set({ ...prior, ids: items.map((s: any) => s.id), byId: Object.fromEntries(items.map((s: any) => [s.id, { ...s, displayTitle: prior.byId[s.id]?.displayTitle ?? s.title }])) })
  },
  binding: (id: string) => {
    if (!bindings.has(id))
      bindings.set(id, {
        sessionId: id,
        session: {
          sessionId: id,
          getSnapshot: () => ({ queue: [] }),
          subscribe: () => () => {},
          rename: async (title: string) =>
            list.set({
              ...list.getSnapshot(),
              byId: {
                ...list.getSnapshot().byId,
                [id]: {
                  ...list.getSnapshot().byId[id],
                  title,
                  displayTitle: title
                }
              }
            }),
          prompt: async () => {
            throw Error('Fixture forbids private model execution')
          },
          queue: { getSnapshot: () => [], subscribe: () => () => {} }
        },
        ctx: {
          effect: (fn: () => () => void) => scopeEffects.push(fn()),
          on: () => () => {},
          get: () => undefined
        }
      })
    return bindings.get(id)
  },
  scope: () => undefined,
  scopeOf: (ctx: any) => ctx.sessionId
}
const ctx: any = {
  sessions,
  get: (name: string) =>
    name === 'sessions'
      ? sessions
      : name === 'conversation'
        ? { releaseDraftImage: () => {} }
        : undefined
}
const hub = new mod.InputHub(ctx, (s: string) => s, registry)
const slotsMap = new Map<string, any>(),
  slots = {
    inject: (_: string, fn: () => any) => fn(),
    register: (options: any, component: any) => {
      slotsMap.set(options.name, { options, component })
      return () => slotsMap.delete(options.name)
    }
  }
const page = mod.__page.createResearchBoardsPage({
  sessions,
  workspaces: { list: ws, api: { host: { describe: async () => ({ result: { ok: true, value: { cwd: await rpc('fixture:default-directory') } } }) } }, refresh: async () => ws.set({ items: [...ws.getSnapshot().items.filter((w: any) => w.workspaceId === 'workspace'), ...await rpc('fixture:workspace-list')] }), archiveSession: async (id: string) => { await rpc('fixture:session-archive', id); await sessions.refresh() } },
  researchWorkspaces: registry,
  inputHub: hub,
  slots,
  bridge
})
mod.__setAdapter(page)
list.subscribe(() => {
  localStorage.setItem('fixture-sessions', JSON.stringify(list.getSnapshot()))
})
const labels: Record<string, string> = {
  'toggle.open': '展开侧边栏',
  'toggle.collapse': '收起侧边栏',
  'session.new': '新对话',
  'session.new.label': '新建对话',
  'session.newResearch': '新研究',
  'session.newResearch.label': '新建研究',
  'research.canvas': '研究画板',
  'session.hierarchy': '会话层级',
  'view.research': '研究',
  'placeholder.default': '围绕画板继续研究',
  'research.context.scope': '研究范围'
}
const t = (s: string, values: Record<string, unknown> = {}) =>
  (labels[s] ?? mod.__zh[s] ?? s).replace(
    /\{(\w+)\}/g,
    (_: string, key: string) => String(values[key] ?? '')
  )
// Exercise the native Research sidebar hosts and composer seat, not a substitute flex layout.
function FixtureDiscussion({ sessionId, children }: any) {
  const [conversationHost, setConversationHost] = React.useState(null)
  const [composerHost, setComposerHost] = React.useState(null)
  const [active, setActive] = React.useState(true)
  React.useEffect(() => { win.fixture.setResearchPanelActive = setActive }, [])
  return h('div', { className: 'fixture-discussion' },
    h(mod.__ResearchConversationPanel, {
      active, sessionId, researchWorkspaces: registry,
      conversationHostRef: setConversationHost, composerHostRef: setComposerHost
    }),
    conversationHost && ReactDOM.createPortal(children[0], conversationHost),
    composerHost && ReactDOM.createPortal(h(mod.__ComposerSurface, {
      hero: false, researchEmpty: false, inputBar: children[1], pending: [], zone: sessionId,
      renderSlot: (name: string) => name === 'conversation.input.dock' && page.isShared(sessionId)
        ? h(mod.__QueueDock, { sessionId, t, notify: () => {}, useSession: (select: any) => select({queue:[],running:false,subagent:null}) }) : null,
      renderSlotChain: (_name: string, _owner: any, options: any) => options.fallback,
      t
    }), composerHost)
  )
}
function App() {
  React.useSyncExternalStore(list.subscribe, list.getSnapshot)
  React.useSyncExternalStore(page.subscribe, page.version)
  const [collapsed, setCollapsed] = React.useState(false)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const id = list.getSnapshot().current
  const shell = hub.shell(id),
    workspace = registry.for(id)
  const v = page.getView(id)
  const useInput = (selector: any) =>
    React.useSyncExternalStore(shell.state.subscribe, () =>
      selector(shell.state.getSnapshot())
    )
  const useSession = (selector: any) =>
    selector({
      blank: false,
      composerPhase: 'active',
      openState: 'open',
      running: false,
      subagent: null,
      removed: false
    })
  const renderSlot = (name: string, owner: any = {}) => {
    const r = slotsMap.get(name)
    return r
      ? h(r.component, { ...owner, ...r.options.inject(), sessionId: id })
      : null
  }
  React.useEffect(() => {
    hub.setResearchActive(id, true)
    return () => hub.setResearchActive(id, false)
  }, [id])
  return h(
    'div',
    { className: 'fixture-shell', 'data-sidebar-collapsed': collapsed },
    settingsOpen && h('div',{className:'VOzbGW_overlay',style:{position:'fixed',inset:0}},h('div',{className:'VOzbGW_panel',style:{display:'flex'}},
      h('nav',{className:'VOzbGW_nav'},h('div',{className:'VOzbGW_navList'})),
      h('div',{className:'VOzbGW_content',style:{flex:1}},h('div',{className:'VOzbGW_header'}),h('div',{className:'VOzbGW_options'})),
      h('button',{className:'VOzbGW_close',onClick:()=>setSettingsOpen(false)},'关闭设置'))),
    h(
      'aside',
      {
        className: 'fixture-sidebar',
        style: { width: collapsed ? 80 : 260 }
      },
      h(sidebar.__SidebarRoot, {
        collapsed,
        width: 260,
        t,
        toggleSidebar: () => setCollapsed(!collapsed),
        startSession: () => {},
        startResearchSession: () => {},
        renderSlot: (name: string, owner: any) =>
          name === 'sidebar.workspaces'
            ? h(
                'div',
                { className: 'fixture-workspaces', hidden: !owner.wide },
                h(loaded.workspace.__WorkspaceBrowser, {
                  wide: owner.wide, expandSidebar: owner.expandSidebar,
                  useSessions: (select: any) => select(list.getSnapshot()),
                  useWorkspaces: (select: any) => select(fixtureWorkspaceState),
                  useStore: (select: any) => select(fixtureWorkspaceView),
                  useDirectoryFlow: (select: any) => select(true),
                  actions: fixtureWorkspaceActions, open: sessions.open,
                  renderSlot: () => null, searchSessions: async () => ({ items: [], hasMore: false }), searchResultLimit: 50,
                  startSession: () => {}, createWorkspace: () => {}, renameSession: async () => {}, archiveSession: async () => {},
                  t
                })
              )
            : name === 'sidebar.settings'
              ? h(
                  'div',
                  { 'data-slot': 'sidebar.settings' },
                  h('button', { className: 'VOzbGW_trigger', onClick:()=>setSettingsOpen(true) }, '设置')
                )
              : renderSlot(name, owner)
      })
    ),
    h(
      'main',
      { className: 'fixture-main' },
      h(mod.__Header, {
        sessionId: id,
        useSession,
        useSessions: (selector: any) => selector(list.getSnapshot()),
        useStore: (selector: any) => selector({ view: 'research' }),
        actions: { setView: () => {} },
        renderSlot,
        views: {
          subscribe: () => () => {},
          version: () => 0,
          list: () => [{ id: 'chat', label: '对话' }, { id: 'research', label: '研究' }]
        },
        open: sessions.open,
        t
      }),
      h(
        'div',
        { className: 'fixture-workbench' },
        h(
          'div',
          { className: 'fixture-canvas' },
          h(mod.ResearchCanvas, {
            sessionId: id,
            t,
            researchWorkspaces: registry,
            actions: {},
            selectionGeneration: { disabled: true }
          })
        ),
        h(
          FixtureDiscussion,
          { sessionId: id },
          page.isShared(id)
            ? h(mod.__page.ResearchBoardDiscussion, {
                page,
                sessionId: id,
                MarkdownText: primitives.MarkdownText
              })
            : h(
                mod.__page.PersonalResearchHistory,
                {
                  sessionId: id,
                  empty: true,
                  MarkdownText: primitives.MarkdownText
                },
                h(
                  'div',
                  { className: 'srb-discussion' },
                  h('p', null, '在画板中整理资料，围绕选中的内容继续研究。')
                )
              ),
          h(mod.__InputBar, {
            sessionId: id,
            t,
            useInput,
            useSession,
            inputActions: shell.actions,
            keyboard: shell,
            useNotices: (sel: any) =>
              React.useSyncExternalStore(shell.notices.subscribe, () =>
                sel(shell.notices.getSnapshot())
              ),
            useLexicon: (sel: any) => sel(undefined),
            useMenuLauncher: (sel: any) => sel(null),
            useProjection: (_: string, sel: any) => sel?.(undefined),
            renderSlot: () => null,
            resolveSubmitMode: () => 'queue',
            variant: 'composer',
            blocked:
              v && !v.permissions.edit ? { reason: '仅可查看' } : undefined,
            researchCanvasWorkspace: workspace
          })
        )
      ),
      h(
        'button',
        {
          className: 'fixture-add',
          onClick: () =>
            workspace.setArtifacts([
              {
                id: 'note',
                messageId: 'note',
                kind: 'pasted-text',
                title: '金价观察',
                excerpt: '美国就业与实际利率共同影响黄金。',
                x: 330,
                y: 220,
                width: 420,
                height: 200
              }
            ])
        },
        '加入研究笔记'
      )
    )
  )
}
createRoot(document.getElementById('app')!).render(h(App))
mountAccountUi(
  document,
  async (action: string) =>
    action === 'me' ? rpc('fixture:account-me') : {},
  bridge
)
mountResearchBoardNotifications(document, bridge)
const updater = new SidebarUpdateControl(document, 'zh', {
  download: () => {},
  install: () => {},
  retry: () => {}
})
new MutationObserver(() => updater.mount()).observe(document.body, {
  subtree: true,
  childList: true
})
async function seedSavedManagerWorkbench() {
  const directory = await page.call('local.directory', {
    mode: 'reserve', title: managerWorkbenchTitle, basePath: await rpc('fixture:default-directory')
  })
  const id = await sessions.create({cwd: directory.path})
  await sessions.binding(id).session.rename(managerWorkbenchTitle)
  await page.call('local.directory', {mode:'bind', directoryId:directory.directoryId, sessionId:id})
  const canvas = createManagerWorkbenchCanvas(id)
  const workspace = registry.for(id)
  workspace.setWorkbenchStyle('dark', {scope:'board'})
  workspace.applyDirectoryCanvas(canvas)
  if (!workspace.initializeWorkbenchDocument(canvas)) throw Error('Unable to seed saved board')
  await page.call('favorite.add', {identity: {...page.identity(id), title:managerWorkbenchTitle}, dedicated:true})
  return id
}
win.fixture = { page, registry, hub, sessions, updater, ready: true, seedSavedManagerWorkbench }
