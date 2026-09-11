import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import { patchBetterSidebarClient } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const requireModule = createRequire(import.meta.url)
const react = requireModule('react') as Record<string, unknown>
const jsxRuntime = requireModule('react/jsx-runtime') as Record<string, unknown>
const { createElement, act } = react as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
  act: (callback: () => void | Promise<void>) => Promise<void>
}
const { createRoot } = requireModule('react-dom/client') as {
  createRoot(container: Element): { render(node: unknown): void; unmount(): void }
}

async function mountNoSession(startSession: (workspaceId: unknown, callback: (sessionId: string) => void) => void) {
  const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
  const patched = patchBetterSidebarClient(source)
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  Object.defineProperty(browserWindow, 'innerWidth', { configurable: true, value: 1380 })
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
  const NullPrimitive = () => null
  const Tooltip = ({ children }: { children: unknown }) => children
  const Menu = ({ anchor }: { anchor: unknown }) => anchor
  const client = descriptor.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === 'react-dom/client') return { createRoot }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      return new Proxy({ Tooltip, Menu }, { get(target, key) { return Reflect.get(target, key) ?? NullPrimitive } })
    }
    return new Proxy({}, { get: () => NullPrimitive })
  })
  const SidebarStore = client.__testSidebarStore as new () => any
  const Sidebar = client.__testSidebar as (props: Record<string, unknown>) => unknown
  const store = new SidebarStore()
  store.setSession(undefined)
  const sessionSnapshot = { current: undefined, ids: [], byId: {} }
  const ctx = {
    locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'zh' }) },
    sessions: { list: { subscribe: () => () => {}, getSnapshot: () => sessionSnapshot } },
    betterSidebar: { getTabs: () => [], getTab: () => undefined, isTabEnabled: () => false },
    workspaces: { startSession }
  }
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
    restore: async () => {
      await act(async () => { root.unmount() })
      for (const [key, value] of Object.entries(previous)) {
        const property = key === 'act' ? 'IS_REACT_ACT_ENVIRONMENT' : key
        if (value === undefined) delete (globalThis as Record<string, unknown>)[property]
        else Object.defineProperty(globalThis, property, value)
      }
    }
  }
}

describe('Figma no-session panel entry', () => {
  it('starts one session while pending and re-enables after the callback', async () => {
    let calls = 0
    let complete: ((sessionId: string) => void) | undefined
    const mounted = await mountNoSession((_workspaceId, callback) => {
      calls += 1
      complete = callback
    })
    let openedSession = ''
    mounted.browserWindow.addEventListener('sherlock:conversation-initial-chat', event => {
      openedSession = (event as unknown as CustomEvent<{ sessionId: string }>).detail.sessionId
    })
    try {
      const entry = mounted.host.querySelector('[data-odyssey-panel-entry="right"]') as unknown as HTMLButtonElement
      await act(async () => {
        entry.click()
        entry.click()
      })
      expect(calls).toBe(1)
      expect(entry.disabled).toBe(true)
      expect(entry.getAttribute('aria-busy')).toBe('true')

      await act(async () => { complete?.('session-created') })
      expect(entry.disabled).toBe(false)
      expect(entry.getAttribute('aria-busy')).toBeNull()
      expect(openedSession).toBe('session-created')
    } finally {
      await mounted.restore()
    }
  })
})
