import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import { patchBetterSidebarClient, patchBetterSidebarServer } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const requireModule = createRequire(import.meta.url)
const react = requireModule('react') as Record<string, unknown>
const jsxRuntime = requireModule('react/jsx-runtime') as Record<string, unknown>
const { createRoot } = requireModule('react-dom/client') as { createRoot: unknown }

async function loadPatchedStore() {
  const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
  const patched = patchBetterSidebarClient(source)
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  Object.defineProperty(browserWindow, 'innerWidth', { configurable: true, value: 1380 })
  let descriptor: { factory(require: (id: string) => unknown): Record<string, unknown> } | undefined
  Object.assign(browserWindow, { __ModuleLoader__: { load(value: typeof descriptor) { descriptor = value } } })
  runInNewContext(patched.replace(
    '\t\texports.apply = apply;',
    '\t\texports.__testSidebarStore = SidebarStore;\n\t\texports.apply = apply;'
  ), {
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
  const client = descriptor.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === 'react-dom/client') return { createRoot }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return new Proxy({}, { get: () => NullPrimitive })
    return new Proxy({}, { get: () => NullPrimitive })
  })
  return {
    browserWindow,
    Store: client.__testSidebarStore as new () => any,
    patched
  }
}

describe('Figma panel default width', () => {
  it('uses an explicit sentinel for the fixed 340px default and keeps custom percentages', async () => {
    const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
    const patched = patchBetterSidebarClient(source)

    expect(patched).toContain('/* sherlock:figma-panel-default-width:v1 */')
    expect(patched).toContain('defaultWidthPercent: 0')
    expect(patched).toContain('if (value === 0) return 0;')
    expect(patched).toContain('if (percent === 0) return Math.min(viewport, 340);')
    expect(patched).toContain('const [widthDraft, setWidthDraft] = (0, react.useState)(() => sidebarWidthDraft(store.getPrefs().defaultWidthPercent))')
    expect(patched).toContain('placeholder: "340 px"')
    expect(patched).toContain('const useFixedDefault = widthDraft.trim() === "";')
    expect(patched).toContain('commit({ defaultWidthPercent: useFixedDefault ? 0 : clamped })')
  })

  it('allows the fixed-default sentinel through the real settings schema', async () => {
    const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/index.js', import.meta.url), 'utf8')
    const patched = patchBetterSidebarServer(source)

    expect(patched).toContain('/* sherlock:figma-panel-default-width-schema:v1 */')
    expect(patched).toContain('defaultWidthPercent: z.number().step(1).min(0).max(60).default(0)')
  })

  it('creates fixed and percentage sessions truthfully while persisted session width wins', async () => {
    const { browserWindow, Store } = await loadPatchedStore()

    const fixed = new Store()
    fixed.setSession('fixed-session')
    expect(fixed.getSnapshot().state.width).toBe(340)

    const custom = new Store()
    custom.setPrefs({ ...custom.getPrefs(), defaultWidthPercent: 35 })
    custom.setSession('custom-session')
    expect(custom.getSnapshot().state.width).toBe(483)
    custom.reduce((state: any) => ({ ...state, width: 400 }))
    await new Promise(resolve => browserWindow.setTimeout(resolve, 250))

    const restored = new Store()
    restored.setPrefs({ ...restored.getPrefs(), defaultWidthPercent: 0 })
    restored.setSession('custom-session')
    expect(restored.getSnapshot().state.width).toBe(400)
  })
})
