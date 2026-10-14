import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { patchFigmaFinalLayout } from '../scripts/lib/patch-figma-final-shell.mjs'

const require = createRequire(import.meta.url)
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act, createElement: h, useSyncExternalStore } = React
const source = patchFigmaFinalLayout(await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8'))
function extract(name: string) {
  const start = source.indexOf(`\t\tfunction ${name}(`)
  return source.slice(start, source.indexOf('\n\t\t}', start) + 5)
}

it.each([1023, 1136, 1279, 1280, 1484])('honors the research threshold and manual expansion at %i px', async width => {
  const win = new Window({ width, url: 'https://sherlock.local/' })
  const globals = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  for (const [i, value] of [win, win.document, win.navigator, true].entries()) Object.defineProperty(globalThis, globals[i]!, { configurable: true, value })
  const { AppFrame, store } = runInNewContext(
    ['clampWidth', 'computeColumns', 'CenterColumn', 'DetailsColumn', 'DragHandle', 'SidebarDragHandle', 'AppFrame', 'createLayoutStore'].map(extract).join('\n') + '\n({AppFrame,store:createLayoutStore()})', {
      react: React, react_dom: require('react-dom'), react_jsx_runtime: require('react/jsx-runtime'), window: win,
      ResizeObserver: win.ResizeObserver, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
      COLLAPSED_SIDEBAR_WIDTH: 80, SIDEBAR_AUTO_COLLAPSE: 1024,
      AppFrame_module_css_default: { frame: 'frame', sidebarCol: 'pI_x6G_sidebarCol', centerCol: 'center', detailsCol: 'details', handle: 'handle' },
      _deepseek_ai_dsh_client_runtime_client: { defineStore: (spec: unknown) => spec }
    })
  let state = store.init()
  const listeners = new Set<() => void>()
  const actions = Object.fromEntries(Object.entries(store.actions).map(([name, fn]: any) => [name, (...args: unknown[]) => {
    const next = { ...state }; fn(next, ...args)
    if (JSON.stringify(next) !== JSON.stringify(state)) { state = next; listeners.forEach(listener => listener()) }
  }]))
  function Harness() {
    return h(AppFrame, {
      actions, useStore: () => useSyncExternalStore((fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn) }, () => state),
      useSessions: (select: (s: unknown) => unknown) => select({ byId: {} }),
      renderSlot: (slot: string, props: any) => slot === 'sidebar'
        ? h('button', { className: 'hHd-Xa_toggle', onClick: actions.toggleSidebar }, props.collapsed ? 'open' : 'close')
        : slot === 'conversation' ? h('div', { 'data-odyssey-page': 'home' }, h('input', { defaultValue: '保留草稿' })) : null
    })
  }
  const host = win.document.createElement('div'); win.document.body.append(host)
  const root = createRoot(host)
  const settle = async (fn: () => void) => { await act(async () => { fn(); await new Promise(resolve => setTimeout(resolve, 10)) }) }
  try {
    await act(async () => { root.render(h(Harness)) })
    const frame = host.querySelector('[data-dsh-frame]')!
    const page = host.querySelector('[data-odyssey-page]')!
    const input = host.querySelector('input')!
    const collapsed = () => frame.getAttribute('data-sidebar-collapsed') === 'true'
    expect(collapsed()).toBe(width < 1024)
    // A child-agent view must not shrink the main conversation.
    await settle(() => { const child = win.document.createElement('aside'); child.setAttribute('data-odyssey-subagent-panel',''); child.innerHTML='<div data-odyssey-page="research"></div>';page.append(child) })
    expect(collapsed()).toBe(width < 1024)
    await settle(() => page.setAttribute('data-odyssey-page', 'research'))
    expect(collapsed()).toBe(width < 1280)
    if (width >= 1280) return
    await settle(() => host.querySelector('button')!.click())
    expect(collapsed()).toBe(false)
    for (const mode of ['conversation', 'research', 'home', 'research']) {
      await settle(() => page.setAttribute('data-odyssey-page', mode))
      expect(collapsed()).toBe(false)
    }
    // Mounting a new board must also preserve the user's explicit choice.
    await settle(() => page.replaceWith(page.cloneNode(true)))
    expect(collapsed()).toBe(false)
    expect(host.querySelector('input')!.value).toBe(input.value)
    // Crossing the pre-existing narrow breakpoint keeps manual expansion.
    await act(async () => { actions.setNarrow(!state.narrow) })
    expect(collapsed()).toBe(false)
    await settle(() => host.querySelector('button')!.click())
    expect(state.sidebarManuallyExpanded).toBe(false)
    await act(async () => { actions.collapseSidebarForResearch() })
    expect(collapsed()).toBe(true)
  } finally {
    await act(async () => { root.unmount() }); await win.happyDOM.close()
    globals.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]!); else delete (globalThis as any)[key] })
  }
})
