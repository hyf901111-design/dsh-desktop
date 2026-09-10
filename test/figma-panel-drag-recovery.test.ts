import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import { patchBetterSidebarClient } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
const patched = patchBetterSidebarClient(source)

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

async function mountPatchedSidebar() {
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  Object.defineProperty(browserWindow, 'innerWidth', { configurable: true, value: 1380 })
  Object.defineProperty(browserWindow, 'innerHeight', { configurable: true, value: 900 })
  const captures = new WeakMap<Element, Set<number>>()
  Object.defineProperties(browserWindow.HTMLElement.prototype, {
    setPointerCapture: { configurable: true, value(this: Element, id: number) { const set = captures.get(this) ?? new Set<number>(); set.add(id); captures.set(this, set) } },
    hasPointerCapture: { configurable: true, value(this: Element, id: number) { return captures.get(this)?.has(id) ?? false } },
    releasePointerCapture: { configurable: true, value(this: Element, id: number) { captures.get(this)?.delete(id) } }
  })
  class ResizeObserverStub { observe() {} disconnect() {} }
  class WebSocketStub { static OPEN = 1; onmessage = null; onclose = null; onerror = null; close() {} }
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
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({ Tooltip, Menu }, { get(target, key) { return Reflect.get(target, key) ?? NullPrimitive } })
    return new Proxy({}, { get: () => NullPrimitive })
  })
  const SidebarStore = client.__testSidebarStore as new () => any
  const Sidebar = client.__testSidebar as (props: Record<string, unknown>) => unknown
  const store = new SidebarStore()
  store.setPrefs({ ...store.getPrefs(), openByDefault: true, tabsEnabled: { editor: false } })
  store.setSession('session-1')
  store.reduce((state: any) => ({ ...state, panelOpen: true, width: 483 }))
  const sessionSnapshot = { current: 'session-1', ids: ['session-1'], byId: { 'session-1': { cwd: '/tmp' } } }
  const ctx = {
    locale: { subscribe: () => () => {}, getSnapshot: () => ({ active: 'zh' }) },
    sessions: { list: { subscribe: () => () => {}, getSnapshot: () => sessionSnapshot } },
    betterSidebar: { getTabs: () => [], getTab: () => undefined, isTabEnabled: () => false },
    workspaces: { startSession: () => {} }
  }
  const shellRoot = browserWindow.document.createElement('div')
  shellRoot.id = 'root'
  const center = browserWindow.document.createElement('main')
  const conversation = browserWindow.document.createElement('div')
  conversation.setAttribute('data-slot', 'conversation')
  center.appendChild(conversation)
  shellRoot.appendChild(center)
  browserWindow.document.body.appendChild(shellRoot)
  const host = browserWindow.document.createElement('div')
  browserWindow.document.body.appendChild(host)
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  Object.assign(globalThis, { window: browserWindow, document: browserWindow.document, HTMLElement: browserWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(host as unknown as Element)
  await act(async () => { root.render(createElement(Sidebar, { ctx, store })) })
  return {
    browserWindow,
    captures,
    host,
    root,
    store,
    restore: async () => {
      await act(async () => { root.unmount() })
      Object.assign(globalThis, previous)
      ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    }
  }
}

describe('Figma panel drag recovery', () => {
  it('finishes a handle drag from the window pointer stream when capture is lost', () => {
    expect(patched).toContain('/* sherlock:panel-window-pointer-fallback:v1 */')
    expect(patched).toContain('window.addEventListener("pointermove", onWindowDragMove)')
    expect(patched).toContain('window.addEventListener("pointerup", onWindowDragEnd)')
    expect(patched).toContain('window.addEventListener("pointercancel", onWindowDragCancel)')
    expect(patched).toContain('commitDrag(width, height, (s) => setWidth(s, width));')
    expect(patched).toContain('setDraggingWidth(false);')
  })

  it('uses interruption coordinates and clears every drag state once', () => {
    expect(patched).toContain('dragCommitted.current = true;\n\t\t\t\tactiveDragPointer.current = null;\n\t\t\t\tconst pending = pendingDrag.current;')
    expect(patched).toContain('onPointerCancel: (event) => {\n\t\t\t\t\t\t\t\t\tabortDrag(() => setDraggingWidth(false), event);')
    expect(patched).toContain('onLostPointerCapture: (event) => {\n\t\t\t\t\t\t\t\t\tabortDrag(() => setDraggingWidth(false), event);')
    expect(patched).toContain('setDraggingWidth(false);')
    expect(patched).toContain('setDraggingCorner(false);')
    expect(patched).toContain('setDraggingBottom(false);')
  })

  it('commits 483px to 340px when move and up finish on window without capture', async () => {
    const mounted = await mountPatchedSidebar()
    try {
      const handle = mounted.host.querySelector('[class*="_panelResize"]') as HTMLElement | null
      expect(handle).not.toBeNull()
      await act(async () => {
        handle?.dispatchEvent(new mounted.browserWindow.PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: 897 }) as unknown as Event)
      })
      mounted.captures.get(handle as Element)?.delete(7)
      await act(async () => {
        mounted.browserWindow.dispatchEvent(new mounted.browserWindow.PointerEvent('pointermove', { bubbles: true, pointerId: 7, clientX: 1040 }))
        mounted.browserWindow.dispatchEvent(new mounted.browserWindow.PointerEvent('pointerup', { bubbles: true, pointerId: 7, clientX: 1040 }))
      })
      expect(mounted.store.getSnapshot().state.width).toBe(340)
      expect(mounted.host.querySelector('[class*="_panelResizeActive"]')).toBeNull()
      expect(mounted.host.querySelector('[class*="_panel"]')?.getAttribute('style')).toContain('width: 340px')
    } finally {
      await mounted.restore()
    }
  })
})
