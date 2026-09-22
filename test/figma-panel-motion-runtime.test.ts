import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import { WorkspaceSurfaceHost } from '../src/preload/workspace-surface-host'
import { IntegrationView } from '../src/preload/integrations/view'
import { patchBetterSidebarClient } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const requireModule = createRequire(import.meta.url)
const react = requireModule('react') as Record<string, unknown>
const jsxRuntime = requireModule('react/jsx-runtime') as Record<string, unknown>
const { createElement, act, useState } = react as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  act: (callback: () => void | Promise<void>) => Promise<void>
  useState: <T>(initial: T | (() => T)) => [T, (value: T) => void]
}
const { createRoot } = requireModule('react-dom/client') as {
  createRoot(container: Element): { render(node: unknown): void; unmount(): void }
}

async function mountStatefulSidebar(desktop = false, noSession = false) {
  const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
  const patched = patchBetterSidebarClient(source)
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  Object.defineProperty(browserWindow, 'innerWidth', { configurable: true, writable: true, value: 1380 })
  Object.defineProperty(browserWindow, 'innerHeight', { configurable: true, value: 900 })
  if (desktop) Object.assign(browserWindow, { dshDesktop: {} })
  class ResizeObserverStub { observe() {} disconnect() {} }
  class WebSocketStub { static OPEN = 1; close() {} }
  let descriptor: { factory(require: (id: string) => unknown): Record<string, unknown> } | undefined
  Object.assign(browserWindow, { __ModuleLoader__: { load(value: typeof descriptor) { descriptor = value } } })
  const executable = patched.replace(
    '\t\texports.apply = apply;',
    '\t\texports.__testSidebar = Sidebar;\n\t\texports.__testSidebarStore = SidebarStore;\n\t\texports.apply = apply;'
  )
  runInNewContext(executable, {
    window: browserWindow,
    document: browserWindow.document,
    navigator: browserWindow.navigator,
    localStorage: browserWindow.localStorage,
    sessionStorage: browserWindow.sessionStorage,
    location: browserWindow.location,
    CustomEvent: browserWindow.CustomEvent,
    DOMRect: browserWindow.DOMRect,
    HTMLElement: browserWindow.HTMLElement,
    MutationObserver: browserWindow.MutationObserver,
    ResizeObserver: ResizeObserverStub,
    WebSocket: WebSocketStub,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    structuredClone,
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
    queueMicrotask,
    setTimeout,
    clearTimeout,
    console
  })
  if (descriptor === undefined) throw new Error('Better Sidebar bundle did not register')

  let mounts = 0
  const StatefulProbe = ({ visible }: { visible: boolean }) => {
    const [instance] = useState(() => String(++mounts))
    const [draft, setDraft] = useState('initial')
    return createElement('section', { 'data-motion-instance': instance, 'data-visible': String(visible) },
      createElement('input', { 'data-motion-draft': true, value: draft, readOnly: true }),
      createElement('button', { 'data-motion-write': true, onClick: () => setDraft('unsent draft') }, 'write'),
      createElement('div', { 'data-motion-scroll': true, style: { height: '40px', overflow: 'auto' } },
        createElement('div', { style: { height: '400px' } }, 'scroll content'))
    )
  }
  const NullPrimitive = () => null
  const Tooltip = ({ children }: { children: unknown }) => children
  const Menu = ({ anchor }: { anchor: unknown }) => anchor
  const client = descriptor.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === 'react-dom/client') return { createRoot }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({ Tooltip, Menu }, { get(target, key) { return Reflect.get(target, key) ?? NullPrimitive } })
    return new Proxy({}, { get: () => NullPrimitive })
  })
  const SidebarStore = client.__testSidebarStore as new () => any
  const Sidebar = client.__testSidebar as (props: Record<string, unknown>) => unknown
  const store = new SidebarStore()
  store.setPrefs({ ...store.getPrefs(), openByDefault: true, bottomPanelAutoTerminal: false, tabsEnabled: { editor: false, probe: true } })
  store.setSession(noSession ? undefined : 'motion-session')
  store.reduce((state: any) => ({
    ...state,
    panelOpen: true,
    bottomOpen: true,
    bottomOpenedOnce: true,
    activePane: state.bottomSplits.id,
    bottomSplits: {
      ...state.bottomSplits,
      active: 'motion-probe',
      tabs: [{ id: 'motion-probe', type: 'probe', title: 'Motion probe' }]
    }
  }))
  const sessionSnapshot = { current: noSession ? undefined : 'motion-session', ids: ['motion-session'], byId: { 'motion-session': { cwd: '/tmp' } } }
  const ctx = {
    locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'zh' }) },
    sessions: { list: { subscribe: () => () => {}, getSnapshot: () => sessionSnapshot } },
    betterSidebar: {
      getTabs: () => [{ id: 'probe', title: 'Motion probe', component: StatefulProbe }],
      getTab: (id: string) => id === 'probe' ? { id: 'probe', title: 'Motion probe', component: StatefulProbe } : undefined,
      isTabEnabled: (id: string) => id === 'probe',
      activateTab: () => undefined,
      closeTab: () => undefined,
      openTab: () => undefined
    },
    workspaces: { startSession: () => undefined }
  }
  const shellRoot = browserWindow.document.createElement('div')
  shellRoot.id = 'root'
  const center = browserWindow.document.createElement('main')
  Object.defineProperty(center, 'getBoundingClientRect', { value: () => ({ left: 80, right: 1016, top: 10, bottom: 890, width: 936, height: 880, x: 80, y: 10, toJSON: () => ({}) }) })
  const conversation = browserWindow.document.createElement('div')
  conversation.setAttribute('data-slot', 'conversation')
  center.appendChild(conversation)
  shellRoot.appendChild(center)
  browserWindow.document.body.appendChild(shellRoot)
  const host = browserWindow.document.createElement('div')
  browserWindow.document.body.appendChild(host)
  const previous = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    HTMLElement: Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement'),
    act: Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT')
  }
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: browserWindow },
    document: { configurable: true, value: browserWindow.document },
    HTMLElement: { configurable: true, value: browserWindow.HTMLElement },
    IS_REACT_ACT_ENVIRONMENT: { configurable: true, value: true }
  })
  const root = createRoot(host as unknown as Element)
  await act(async () => { root.render(createElement(Sidebar, { ctx, store })) })
  return {
    browserWindow,
    host,
    store,
    mounts: () => mounts,
    restore: async () => {
      await act(async () => { root.unmount() })
      for (const [key, value] of Object.entries(previous)) {
        const property = key === 'act' ? 'IS_REACT_ACT_ENVIRONMENT' : key
        if (value === undefined) delete (globalThis as Record<string, unknown>)[property]
        else Object.defineProperty(globalThis, property, value)
      }
      await browserWindow.happyDOM.close()
    }
  }
}

describe('Figma panel production lifecycle', () => {
  it('reuses one native pane control in both states and preserves focus and drafts through real clicks', async () => {
    const mounted=await mountStatefulSidebar(true)
    const {browserWindow,host: nativeHost,store}=mounted, doc=browserWindow.document as unknown as Document
    const workspace=new WorkspaceSurfaceHost(doc)
    const view=new IntegrationView(doc,{request:async()=>({type:'snapshot',snapshot:{revision:0,rows:[]}})},workspace)
    try {
      for (const path of ['figma-panels.css','figma-refinements.css']) {
        const style=doc.createElement('style');style.textContent=await readFile(new URL('../src/preload/'+path,import.meta.url),'utf8');doc.head.append(style)
      }
      const before=structuredClone(store.getSnapshot().state)
      await act(async()=>{view.mount();await view.open()})
      const click=async(selector:string)=>{await act(async()=>{doc.querySelector<HTMLButtonElement>(selector)!.click()})}
      await click('[data-tab=apps]');await click('[data-action=add]');await click('[data-add=api]')
      const draft=doc.querySelector<HTMLInputElement>('[name=url]')!
      draft.value='https://unsaved.example.test';draft.dispatchEvent(new browserWindow.Event('input',{bubbles:true}) as unknown as Event)
      expect(doc.querySelector('.ig-root [data-action=panel]')).toBeNull()
      const nativeButton=nativeHost.querySelector('[data-odyssey-panel-entry=right]') as unknown as HTMLButtonElement
      const nativeCluster=nativeButton.parentElement!
      const style=(element:Element)=>doc.defaultView!.getComputedStyle(element)
      expect(nativeHost.querySelector('[data-workspace-panel=integrations]')).not.toBeNull()
      expect(doc.querySelectorAll('[data-odyssey-panel-entry=right]')).toHaveLength(1)
      expect(nativeButton.getAttribute('aria-expanded')).toBe('false')
      expect(nativeButton.getAttribute('aria-label')).toBe('展开右侧屏')
      expect(style(nativeCluster).visibility).toBe('visible')
      nativeButton.focus()
      await click('[data-odyssey-panel-entry=right]')
      expect(nativeHost.querySelector('[data-odyssey-panel-entry=right]')).toBe(nativeButton)
      expect(nativeButton.getAttribute('aria-expanded')).toBe('true')
      expect(nativeButton.getAttribute('aria-label')).toBe('收起右侧屏')
      expect(workspace.isRightPaneExpanded()).toBe(true)
      expect(doc.activeElement).toBe(nativeButton)
      expect(style(nativeCluster).visibility).toBe('visible')
      expect(style(nativeCluster).top).toBe('24px')
      expect(style(nativeButton).width).toBe('28px')
      expect(style(doc.querySelector('.workspace-back-button')!).display).not.toBe('none')
      await click('[data-odyssey-panel-entry=right]')
      expect(nativeButton.getAttribute('aria-expanded')).toBe('false')
      expect(workspace.isRightPaneExpanded()).toBe(false)
      expect(doc.activeElement).toBe(nativeButton)
      expect(style(nativeCluster).visibility).toBe('visible')
      expect(doc.querySelectorAll('[data-odyssey-panel-entry=right]')).toHaveLength(1)
      expect(doc.querySelector<HTMLInputElement>('[name=url]')).toBe(draft)
      expect(draft.value).toBe('https://unsaved.example.test')
      expect(store.getSnapshot().state).toEqual(before)
    } finally {await act(async()=>{view.dispose();workspace.dispose()});await mounted.restore()}
  })
  it('connects the integrations workspace toggle to real shell geometry and restores native state', async () => {
    const mounted=await mountStatefulSidebar(true)
    try {
      const {browserWindow,host,store}=mounted
      const before=structuredClone(store.getSnapshot().state)
      await act(async()=>{browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:workspace-surface-change',{detail:{surface:'integrations',active:true}}))})
      await act(async()=>{browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:workspace-panel',{detail:{surface:'integrations',open:false}}))})
      expect(host.querySelector('[data-dsh-panel-host]')!.getAttribute('data-odyssey-panel-right')).toBe('closed')
      expect(browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-width')).toBe('0px')
      await act(async()=>{browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:workspace-panel',{detail:{surface:'integrations',open:true}}))})
      expect(host.querySelector('[data-dsh-panel-host]')!.getAttribute('data-odyssey-panel-right')).toBe('open')
      expect(Number.parseFloat(browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-width'))).toBeGreaterThan(0)
      expect(store.getSnapshot().state).toEqual(before)
      await act(async()=>{browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:workspace-surface-change',{detail:{active:false}}))})
      expect(store.getSnapshot().state).toEqual(before)
    } finally {await mounted.restore()}
  })
  it('opens and closes the integrations pane without creating a conversation when no session exists', async () => {
    const mounted=await mountStatefulSidebar(true,true)
    try {
      const {browserWindow,host,store}=mounted
      await act(async()=>{browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:workspace-surface-change',{detail:{surface:'integrations',active:true}}))})
      await act(async()=>{browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:workspace-panel',{detail:{surface:'integrations',open:true}}))})
      expect(host.querySelector('[data-dsh-panel-host]')!.getAttribute('data-odyssey-panel-right')).toBe('open')
      expect(store.getSnapshot().sessionId).toBeUndefined()
      expect(store.getSnapshot().state).toBeUndefined()
      await act(async()=>{browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:workspace-surface-change',{detail:{active:false}}))})
      expect(host.querySelector('#odyssey-right-workspace-panel')).toBeNull()
    } finally {await mounted.restore()}
  })
  it('opens the global shell without creating or selecting a session', async () => {
    const mounted = await mountStatefulSidebar(true, true)
    try {
      const {browserWindow, host, store} = mounted
      await act(async () => {
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel', {detail:{active:true,open:true}}))
      })
      expect(host.querySelector('#odyssey-right-workspace-panel')).not.toBeNull()
      expect(host.querySelector('[data-scheduled-panel-slot]')!.hasAttribute('hidden')).toBe(false)
      expect(store.getSnapshot().sessionId).toBeUndefined()
      expect(store.getSnapshot().state).toBeUndefined()
      await act(async () => {
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel', {detail:{active:false,open:false}}))
      })
      expect(host.querySelector('#odyssey-right-workspace-panel')).toBeNull()
    } finally { await mounted.restore() }
  })
  it('hosts global task detail in the native shell and restores workspace panel state', async () => {
    const mounted = await mountStatefulSidebar(true)
    try {
      const {browserWindow, host, store} = mounted
      const before = structuredClone(store.getSnapshot().state)
      const panel = host.querySelector('#odyssey-right-workspace-panel')!
      const probe = host.querySelector('[data-motion-instance]')!
      const request = async (active: boolean, open: boolean) => act(async () => {
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel', {detail:{active,open}}))
      })
      await request(true, true)
      expect(host.querySelector('#odyssey-right-workspace-panel')).toBe(panel)
      expect(host.querySelector('[data-motion-instance]')).toBe(probe)
      expect(host.querySelector('[data-scheduled-panel-slot]')!.hasAttribute('hidden')).toBe(false)
      expect(host.querySelectorAll('[data-odyssey-panel-entry="right"]')).toHaveLength(1)
      expect(host.querySelector('[data-odyssey-panel-entry="bottom"]')).toBeNull()
      expect(store.getSnapshot().state).toEqual(before)
      const toggle = host.querySelector('[data-odyssey-panel-entry="right"]') as unknown as HTMLButtonElement
      await act(async () => { toggle.click() })
      expect(host.querySelector('[data-dsh-panel-host]')!.getAttribute('data-odyssey-panel-right')).toBe('closed')
      await act(async () => { toggle.click() })
      expect(host.querySelector('[data-dsh-panel-host]')!.getAttribute('data-odyssey-panel-right')).toBe('open')
      const handle = host.querySelector('.t8lSSG_panelResize') as unknown as HTMLElement
      let captured = false
      Object.assign(handle, {setPointerCapture: () => {captured=true}, hasPointerCapture: () => captured, releasePointerCapture: () => {captured=false}})
      const pointer = (type: string, x: number) => handle.dispatchEvent(new browserWindow.PointerEvent(type, {bubbles:true,pointerId:1,clientX:x,clientY:200,button:0}) as unknown as Event)
      await act(async () => { pointer('pointerdown', 1000) })
      await act(async () => { pointer('pointermove', 920) })
      await act(async () => { pointer('pointerup', 920) })
      expect(store.getSnapshot().state.width).toBe(before.width + 80)
      expect(store.getSnapshot().state.panelOpen).toBe(before.panelOpen)
      expect(store.getSnapshot().state.bottomOpen).toBe(before.bottomOpen)
      await request(false, false)
      expect(store.getSnapshot().state).toEqual({...before,width:before.width+80})
      expect(host.querySelector('[data-scheduled-panel-slot]')!.hasAttribute('hidden')).toBe(true)
      expect(host.querySelector('[data-motion-instance]')).toBe(probe)
    } finally { await mounted.restore() }
  })

  it('reserves an independent desktop pane when manually opened below 840 px and preserves stored state', async () => {
    const mounted = await mountStatefulSidebar(true)
    try {
      const { browserWindow, host, store } = mounted
      const before = structuredClone(store.getSnapshot().state)
      const probe = host.querySelector('[data-motion-instance]')!
      await act(async () => {
        Object.defineProperty(browserWindow, 'innerWidth', { configurable:true, writable:true, value:801 })
        browserWindow.dispatchEvent(new browserWindow.Event('resize'))
        await new Promise(resolve => browserWindow.setTimeout(resolve, 24))
      })
      const panelHost = host.querySelector('[data-dsh-panel-host]')!
      const right = host.querySelector('[data-odyssey-panel-entry="right"]') as unknown as HTMLButtonElement
      expect(panelHost.getAttribute('data-odyssey-panel-right')).toBe('closed')
      expect(browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-width')).toBe('0px')
      await act(async () => { right.click() })
      expect(panelHost.getAttribute('data-odyssey-panel-right')).toBe('open')
      expect(panelHost.hasAttribute('data-odyssey-panel-overlay')).toBe(false)
      expect(browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-width')).toBe('340px')
      expect(host.querySelector('[data-motion-instance]')).toBe(probe)
      expect(store.getSnapshot().state).toEqual(before)
      await act(async () => { right.click() })
      expect(browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-width')).toBe('0px')
      await act(async () => {
        Object.defineProperty(browserWindow, 'innerWidth', { configurable:true, writable:true, value:1380 })
        browserWindow.dispatchEvent(new browserWindow.Event('resize'))
        await new Promise(resolve => browserWindow.setTimeout(resolve, 24))
      })
      expect(panelHost.getAttribute('data-odyssey-panel-right')).toBe('open')
      expect(browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-width')).toBe('340px')
      expect(store.getSnapshot().state).toEqual(before)
      expect(host.querySelector('[data-motion-instance]')).toBe(probe)
    } finally {
      await mounted.restore()
    }
  })

  it('keeps the same bottom view, draft and scroll through right-closed/bottom-open and rapid reversals', async () => {
    const mounted = await mountStatefulSidebar()
    try {
      const probe = mounted.host.querySelector('[data-motion-instance]') as unknown as HTMLElement
      const write = probe.querySelector('[data-motion-write]') as unknown as HTMLButtonElement
      const scroll = probe.querySelector('[data-motion-scroll]') as unknown as HTMLElement
      await act(async () => { write.click() })
      scroll.scrollTop = 137
      expect((probe.querySelector('[data-motion-draft]') as unknown as HTMLInputElement).value).toBe('unsent draft')

      const right = mounted.host.querySelector('[data-odyssey-panel-entry="right"]') as unknown as HTMLButtonElement
      await act(async () => { right.click() })
      expect(mounted.host.querySelector('[data-dsh-panel-host]')?.getAttribute('data-odyssey-panel-right')).toBe('closed')
      expect(mounted.host.querySelector('[data-dsh-panel-host]')?.getAttribute('data-odyssey-panel-bottom')).toBe('open')
      expect(mounted.host.querySelector('[data-motion-instance]')).toBe(probe)

      await act(async () => { right.click(); right.click() })
      expect(mounted.host.querySelector('[data-motion-instance]')).toBe(probe)
      expect(mounted.mounts()).toBe(1)

      await act(async () => { right.click() })
      const bottomEntry = mounted.host.querySelector('[data-odyssey-panel-entry="bottom"]') as unknown as HTMLButtonElement
      await act(async () => { bottomEntry.click() })
      expect(mounted.host.querySelector('[data-motion-instance]')).toBe(probe)
      expect(mounted.browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-height')).toBe('0px')
      await act(async () => { bottomEntry.click() })
      expect(mounted.host.querySelector('[data-motion-instance]')).toBe(probe)
      expect(mounted.browserWindow.document.documentElement.style.getPropertyValue('--dsh-sidebar-height')).toBe('220px')
      expect((probe.querySelector('[data-motion-draft]') as unknown as HTMLInputElement).value).toBe('unsent draft')
      expect(scroll.scrollTop).toBe(137)
      expect(mounted.mounts()).toBe(1)
    } finally {
      await mounted.restore()
    }
  })

  it('reports the existing narrow migration as a rendered re-home with a new view instance', async () => {
    const mounted = await mountStatefulSidebar()
    try {
      const desktopProbe = mounted.host.querySelector('[data-motion-instance]')
      Object.defineProperty(mounted.browserWindow, 'innerWidth', { configurable: true, writable: true, value: 700 })
      await act(async () => {
        mounted.browserWindow.dispatchEvent(new mounted.browserWindow.Event('resize'))
        await new Promise(resolve => mounted.browserWindow.setTimeout(resolve, 24))
      })
      const narrowProbe = mounted.host.querySelector('[data-motion-instance]')
      expect(mounted.host.querySelector('#odyssey-bottom-workspace-panel')).toBeNull()
      expect(narrowProbe).not.toBeNull()
      expect(narrowProbe).not.toBe(desktopProbe)
      expect(mounted.mounts()).toBe(2)
      const state = mounted.store.getSnapshot().state
      expect(state.bottomOpen).toBe(false)
      expect(state.bottomSplits.tabs).toHaveLength(0)
      expect(state.splits.tabs.some((tab: { id: string }) => tab.id === 'motion-probe')).toBe(true)
    } finally {
      await mounted.restore()
    }
  })
})
