import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

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

async function mountStatefulSidebar() {
  const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
  const patched = patchBetterSidebarClient(source)
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  Object.defineProperty(browserWindow, 'innerWidth', { configurable: true, writable: true, value: 1380 })
  Object.defineProperty(browserWindow, 'innerHeight', { configurable: true, value: 900 })
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
  store.setSession('motion-session')
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
  const sessionSnapshot = { current: 'motion-session', ids: ['motion-session'], byId: { 'motion-session': { cwd: '/tmp' } } }
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
