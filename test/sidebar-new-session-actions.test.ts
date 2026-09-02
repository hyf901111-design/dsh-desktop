import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

type ClientBundle = Record<string, unknown>
type BundleDescriptor = {
  factory(require: (id: string) => unknown): ClientBundle
}

const requireModule = createRequire(import.meta.url)
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
  expose: string[] = []
): Promise<ClientBundle> {
  let source = await readFile(`node_modules/@deepseek-ai/${packageName}/lib/client.js`, 'utf8')
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
    window: bundleWindow,
    document: browserWindow?.document,
    navigator: browserWindow?.navigator ?? { userAgent: '' },
    localStorage: browserWindow?.localStorage,
    sessionStorage: browserWindow?.sessionStorage,
    CustomEvent: browserWindow?.CustomEvent,
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
      'session.new': '新对话',
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
      expect(chat?.textContent).toContain('新对话')
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
    const client = await loadClientBundle('dsh-client-ui-sidebar', browserWindow)
    let registration: {
      inject: () => {
        startSession: (workspaceId?: string) => void
      }
    } | undefined
    const startSession = vi.fn((
      _workspaceId?: string,
      beforeOpen?: (sessionId: string) => void
    ) => {
      beforeOpen?.('session-reused-from-research')
    })
    const requested: Array<{ sessionId?: string }> = []
    browserWindow.addEventListener('sherlock:conversation-initial-chat', (event) => {
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

  it('renders the requested Research view on the new session first frame', async () => {
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
      view: null,
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
      list: () => [{ id: 'chat', label: '对话' }, { id: 'research', label: '研究' }]
    }
    const actions = {
      setView: vi.fn(), setDraft: vi.fn(), setInspect: vi.fn()
    }
    const renderSlot = (_name: string, _props?: unknown, options?: { only: string }) => {
      if (options?.only === undefined) return null
      renderedViews.push(options.only)
      return createElement('div', { 'data-rendered-view': options.only })
    }

    try {
      await act(async () => {
        root.render(createElement(react.Fragment as unknown as string, null,
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
      })

      expect(renderedViews.at(-1)).toBe('research')
      expect(host.querySelector('[data-rendered-view="research"]')).not.toBeNull()
      expect(host.querySelector('[data-rendered-view="chat"]')).toBeNull()
      expect(host.querySelector('header')?.getAttribute('aria-hidden')).toBeNull()
      expect(host.querySelector('[data-conversation-view-id="research"]')
        ?.getAttribute('aria-selected')).toBe('true')

      await act(async () => {
        ;(host.querySelector('[data-conversation-view-id="chat"]') as HTMLElement | null)?.click()
      })
      expect(actions.setView).toHaveBeenLastCalledWith('chat')
      expect(browserWindow.sessionStorage.getItem(
        'sherlock.conversation.initial-research-session.v1'
      )).toBeNull()
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

  it('opens a persisted zero-message Research session directly on its canvas', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    installBrowserGlobals(browserWindow)
    const sessionId = 'session-persisted-research'
    browserWindow.localStorage.setItem(
      `sherlock.research.session-engaged.v1:${sessionId}`,
      '1'
    )
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
})
