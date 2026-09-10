import { existsSync, readFileSync } from 'node:fs'
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

async function mountPatchedTabBar(onNewTab: (id: string) => void) {
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  let descriptor: { factory(require: (id: string) => unknown): Record<string, unknown> } | undefined
  Object.assign(browserWindow, { __ModuleLoader__: { load(value: typeof descriptor) { descriptor = value } } })
  const executable = patched.replace(
    '\t\texports.apply = apply;',
    '\t\texports.__testTabBar = TabBar;\n\t\texports.apply = apply;'
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
    ResizeObserver: class { observe() {} disconnect() {} },
    WebSocket: class { static OPEN = 1; close() {} },
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
  const Menu = ({ className, open, anchor, items, onSelect }: any) => createElement('span', { className },
    anchor,
    open && createElement('div', { role: 'menu' }, ...items.map((item: any) => createElement('button', {
      key: item.id,
      role: 'menuitem',
      disabled: item.disabled,
      onClick: () => onSelect(item.id)
    }, item.label)))
  )
  const client = descriptor.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === 'react-dom/client') return { createRoot }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({ Menu }, { get(target, key) { return Reflect.get(target, key) ?? NullPrimitive } })
    return new Proxy({}, { get: () => NullPrimitive })
  })
  const TabBar = client.__testTabBar as (props: Record<string, unknown>) => unknown
  const host = browserWindow.document.createElement('div')
  browserWindow.document.body.appendChild(host)
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  Object.assign(globalThis, { window: browserWindow, document: browserWindow.document, HTMLElement: browserWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(host as unknown as Element)
  await act(async () => {
    root.render(createElement(TabBar, {
      paneId: 'pane-1',
      tabs: [],
      active: null,
      onActivate: () => {},
      onClose: () => {},
      onNewTab,
      newTabOptions: [{ id: 'editor', label: 'Files' }],
      onDropTab: () => {}
    }))
  })
  return {
    browserWindow,
    host,
    restore: async () => {
      await act(async () => { root.unmount() })
      Object.assign(globalThis, previous)
      ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
    }
  }
}

describe('Figma Files panel', () => {
  it('marks the real explorer controls and preserves refresh as an accessible action', () => {
    expect(patched).toContain('/* sherlock:figma-file-panel:v1 */')
    expect(patched).toContain('"data-odyssey-file-search": true')
    expect(patched).toContain('"data-odyssey-file-search-icon": true')
    expect(patched).toContain('"data-odyssey-file-refresh": true')
    expect(patched).toContain('"data-odyssey-project-root": true')
    expect(patched).toContain('"data-odyssey-file-row": "directory"')
    expect(patched).toContain('"data-odyssey-file-row": sherlockFigmaFileKind(entry.name)')
    expect(patched).toContain('style: { paddingLeft: depth * 22 }')
  })

  it('keeps the registry menu functional while exposing its measured surface', () => {
    expect(patched).toContain('className: "odyssey-file-new-tab-menu"')
    expect(patched).toContain('"aria-expanded": menuOpen')
    expect(patched).toContain('"data-odyssey-file-menu-label": true')
    expect(patched).toContain('portal: true')
    expect(patched).toContain('onNewTab(id);')
  })

  it('opens the patched real tab bar menu and selects the registered panel type', async () => {
    const selected: string[] = []
    const mounted = await mountPatchedTabBar(id => selected.push(id))
    try {
      const trigger = mounted.host.querySelector('[aria-label="New tab"]') as HTMLElement | null
      expect(trigger).not.toBeNull()
      expect(trigger?.getAttribute('aria-expanded')).toBe('false')
      await act(async () => { trigger?.click() })
      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
      expect(mounted.host.querySelector('[role="menu"] [data-odyssey-file-menu-label]')).not.toBeNull()
      await act(async () => { (mounted.host.querySelector('[role="menuitem"]') as HTMLElement | null)?.click() })
      expect(selected).toEqual(['editor'])
      expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    } finally {
      await mounted.restore()
    }
  })

  it('ships the measured tree, document, menu and native-scroll boundaries in a late stylesheet', () => {
    const url = new URL('../src/preload/figma-file-panel.css', import.meta.url)
    expect(existsSync(url)).toBe(true)
    if (!existsSync(url)) return
    const css = readFileSync(url, 'utf8')
    expect(css).toContain('[data-odyssey-file-search]')
    expect(css).toContain('height:34px')
    expect(css).toContain('[data-odyssey-project-root]')
    expect(css).toContain('height:28px')
    expect(css).toContain('[data-odyssey-file-row]')
    expect(css).toContain('height:38px')
    expect(css).toContain('[role="menu"]:has([data-odyssey-file-menu-label])')
    expect(css).toContain('width:238px')
    expect(css).toContain('height:42px')
    expect(css).toContain('overflow:auto')
    expect(css).not.toContain('scrollbar-width:none')
    expect(css).not.toContain('::-webkit-scrollbar')
  })
})
