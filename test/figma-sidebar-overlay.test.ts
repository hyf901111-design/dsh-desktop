import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { DOMRect, Window, type HTMLButtonElement, type HTMLElement, type HTMLInputElement } from 'happy-dom'
import { expect, it } from 'vitest'
import { patchFigmaFinalLayout } from '../scripts/lib/patch-figma-final-shell.mjs'

import { placeFigmaMenu } from '../scripts/lib/figma-menu-placement.mjs'
import { odysseyClampPanelWidth } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const require = createRequire(import.meta.url)
const React = require('react')
const { createRoot } = require('react-dom/client')
const { act, createElement: h, useSyncExternalStore } = React
const primitives = await readFile('node_modules/@deepseek-ai/dsh-client-ui-primitives/lib/index.js', 'utf8')
const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8')
function extract(source: string, name: string) {
  const start = source.indexOf(`\t\tfunction ${name}(`)
  return source.slice(start, source.indexOf('\n\t\t}', start) + 5)
}

// Exercises the patched frame and real store actions: a regression that routes
// expanded width back into the grid shrinks the main pane and fails this test.
it.each([800, 840, 841])('uses an overlay through 840 px and preserves wider sidebar behavior at %i px', async width => {
  const win = new Window({ width, url: 'https://sherlock.local/' })
  const globals = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  for (const [i, value] of [win, win.document, win.navigator, true].entries()) Object.defineProperty(globalThis, globals[i]!, { configurable: true, value })
  const bundle = patchFigmaFinalLayout(source)
  const { AppFrame, store } = runInNewContext(
    ['clampWidth', 'computeColumns', 'CenterColumn', 'DetailsColumn', 'DragHandle', 'AppFrame', 'createLayoutStore'].map(name => extract(bundle, name)).join('\n') + '\n({AppFrame,store:createLayoutStore()})', {
      react: React, react_jsx_runtime: require('react/jsx-runtime'), window: win,
      ResizeObserver: win.ResizeObserver, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
      COLLAPSED_SIDEBAR_WIDTH: 80, SIDEBAR_AUTO_COLLAPSE: 1024,
      AppFrame_module_css_default: { frame: 'frame', sidebarCol: 'pI_x6G_sidebarCol', centerCol: 'center', detailsCol: 'details', handle: 'handle' },
      _deepseek_ai_dsh_client_runtime_client: { defineStore: (spec: unknown) => spec }
    })
  const primitiveBindings = {
    ...React, ...require('react/jsx-runtime'), createPortal: require('react-dom').createPortal,
    window: win, document: win.document, Node: win.Node, placeFigmaMenu,
    clsx: (...values: unknown[]) => values.filter(Boolean).join(' '), Menu_module_css_default: {}, Modal_module_css_default: {}, MEASURE_STYLE: {},
    usePointerGrace: () => ({ arm() {}, cancel() {} }), isSeparator: () => false, isLabel: () => false
  }
  const primitive = (name: string) => {
    const start = primitives.indexOf(`function ${name}(`)
    return runInNewContext(primitives.slice(start, primitives.indexOf('\n//#endregion', start)) + `\n${name}`, primitiveBindings)
  }
  const Menu = primitive('Menu'), Modal = primitive('Modal')
  function SidebarLayers() {
    const [layer, setLayer] = React.useState('')
    // Unmount before the event reaches window, so checking only current DOM fails.
    const close = () => require('react-dom').flushSync(() => setLayer(''))
    return h(React.Fragment, null,
      h(Menu, { open: layer === 'menu', portal: true, items: [], onSelect() {}, onClose: close,
        anchor: h('button', { 'data-layer-trigger': 'menu', onClick: () => setLayer('menu') }, 'menu') }),
      h('button', { 'data-layer-trigger': 'dialog', onClick: () => setLayer('dialog') }, 'dialog'),
      h(Modal, { open: layer === 'dialog', headless: true, title: 'Sidebar dialog', onClose: close }, 'dialog content'))
  }
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
        ? h('div', { 'data-slot-width': props.width }, h('button', { className: 'hHd-Xa_toggle', onClick: actions.toggleSidebar }, props.collapsed ? 'open' : 'close'), !props.collapsed && h('input', { 'aria-label': 'sidebar search' }), !props.collapsed && h(SidebarLayers))
        : slot === 'conversation' ? h('input', { 'aria-label': 'canvas input', defaultValue: 'keep me' }) : null
    })
  }
  const host = win.document.createElement('div'); win.document.body.append(host)
  const root = createRoot(host)
  const toggle = () => host.querySelector<HTMLButtonElement>('.hHd-Xa_toggle')!
  const click = async () => act(async () => { toggle().click() })
  try {
    await act(async () => { root.render(h(Harness)) })
    const frame = host.querySelector<HTMLElement>('[data-dsh-frame]')!
    const canvas = host.querySelector<HTMLInputElement>('[aria-label="canvas input"]')!
    const grid = frame.style.gridTemplateColumns
    expect(grid).toBe('80px minmax(0, 1fr) 0px')
    await click()
    if (width > 840) {
      expect(frame.dataset.odysseySidebarOverlay).toBeUndefined()
      expect(frame.style.gridTemplateColumns).toBe('280px minmax(0, 1fr) 0px')
      expect(host.querySelector('[data-side="sidebar"]')).not.toBeNull()
      return
    }
    expect(frame.dataset.odysseySidebarOverlay).toBe('true')
    expect(frame.style.gridTemplateColumns).toBe(grid)
    host.querySelector<HTMLElement>('.pI_x6G_sidebarCol')!.getBoundingClientRect = () => new DOMRect(0, 0, 280, 759)
    expect(odysseyClampPanelWidth(340, width, win.document)).toBe(340)
    expect(host.querySelector('[data-slot-width="280"]')).not.toBeNull()
    expect(host.querySelector('[data-side="sidebar"]')).toBeNull()
    expect(host.querySelector('[aria-label="canvas input"]')).toBe(canvas)
    expect(canvas.value).toBe('keep me')
    // The real Menu/Modal register document listeners without preventDefault.
    // Opening them leaves focus on the sidebar trigger, outside menu/dialog DOM.
    for (const layer of ['menu', 'dialog']) {
      const trigger = host.querySelector<HTMLButtonElement>(`[data-layer-trigger="${layer}"]`)!
      trigger.focus()
      await act(async () => { trigger.click() })
      expect(win.document.querySelector(`[role="${layer}"]`)).not.toBeNull()
      expect(win.document.activeElement).toBe(trigger)
      const escape = new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      await act(async () => { trigger.dispatchEvent(escape) })
      expect(win.document.querySelector(`[role="${layer}"]`)).toBeNull()
      expect(frame.dataset.odysseySidebarOverlay).toBe('true')
      expect(win.document.activeElement).toBe(trigger)
      expect(escape.defaultPrevented).toBe(false)
      await act(async () => { trigger.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
      expect(frame.dataset.sidebarCollapsed).toBe('true')
      expect(win.document.activeElement).toBe(toggle())
      await click()
    }
    await act(async () => { canvas.dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true })) })
    expect(frame.dataset.sidebarCollapsed).toBe('true')
    await click()
    host.querySelector<HTMLInputElement>('[aria-label="sidebar search"]')!.focus()
    await act(async () => { win.document.activeElement!.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    expect(frame.dataset.sidebarCollapsed).toBe('true')
    expect(win.document.activeElement).toBe(toggle())
    expect(state.sidebar).toBe(280)
    expect(frame.style.gridTemplateColumns).toBe(grid)
  } finally {
    await act(async () => { root.unmount() }); await win.happyDOM.close()
    globals.forEach((key, i) => { if (previous[i]) Object.defineProperty(globalThis, key, previous[i]!); else delete (globalThis as any)[key] })
  }
})
