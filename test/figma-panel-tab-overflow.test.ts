import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'

import { patchBetterSidebarClient } from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const source = await readFile(new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
const patched = patchBetterSidebarClient(source)
const start = patched.indexOf('\t\tfunction TabBar(props) {')
const end = patched.indexOf('\n\t\t//#endregion', start)

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

describe('Figma panel tab overflow', () => {
  it('opens the seven-tab switcher and restores focus after selection', async () => {
    const browserWindow = new Window({ url: 'https://sherlock.local/' })
    const observers: ResizeObserverStub[] = []
    class ResizeObserverStub {
      constructor(private readonly callback: () => void) { observers.push(this) }
      observe() {}
      disconnect() {}
      trigger() { this.callback() }
    }
    const NullIcon = () => createElement('span')
    const Menu = ({ anchor }: { anchor: unknown }) => anchor
    const primitives = new Proxy(
      { Menu, IconCloseFill14: NullIcon, IconPlusOutline16: NullIcon, IconCheckOutline16: NullIcon },
      { get(target, key) { return Reflect.get(target, key) ?? NullIcon } }
    )
    const renderTabBar = new Function(
      'react',
      'react_jsx_runtime',
      'sidebar_module_css_default',
      '_deepseek_ai_dsh_client_ui_primitives',
      'clsx',
      't',
      'setTabDragging',
      'parseDrag',
      'serializeDrag',
      'TAB_DRAG_TYPE',
      'ResizeObserver',
      'window',
      'document',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      `${patched.slice(start, end)}\nreturn TabBar;`
    )(
      react,
      jsxRuntime,
      new Proxy({}, { get: (_target, key) => `t8lSSG_${String(key)}` }),
      primitives,
      (...names: unknown[]) => names.filter(Boolean).join(' '),
      (key: string) => key === 'openTabs' ? '已打开的页签' : key,
      () => undefined,
      () => null,
      () => '',
      'application/x-tab',
      ResizeObserverStub,
      browserWindow,
      browserWindow.document,
      (callback: FrameRequestCallback) => { callback(0); return 1 },
      () => undefined
    ) as (props: Record<string, unknown>) => unknown

    const tabs = [
      { id: 'files', title: 'Files', meta: { sherlockPinned: true, sherlockClosable: false } },
      { id: 'gold-md', title: '黄金多因子模型研究报告.md' },
      { id: 'hs300-md', title: '沪深300指数研究报告.md' },
      { id: 'gold-pdf', title: '黄金多因子模型研究报告.pdf' },
      { id: 'tables', title: 'regime_r2_tables.xlsx' },
      { id: 'script', title: '01_download_data.py' },
      { id: 'tasks', title: '任务管理' }
    ]
    const onActivate = vi.fn()
    const onClose = vi.fn()
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
    try {
      await act(async () => {
        root.render(createElement(renderTabBar, {
          paneId: 'right',
          tabs,
          active: 'gold-md',
          onActivate,
          onClose,
          onNewTab: vi.fn(),
          onDropTab: vi.fn(),
          newTabOptions: []
        }))
      })
      const list = host.querySelector('.t8lSSG_tabList') as unknown as HTMLElement
      Object.defineProperty(list, 'clientWidth', { configurable: true, value: 226 })
      for (const [index, tab] of Array.from(host.querySelectorAll('[data-odyssey-panel-tab]')).entries()) {
        Object.defineProperty(tab, 'offsetWidth', { configurable: true, value: index === 0 ? 58 : 132 })
      }
      await act(async () => { observers.forEach(observer => observer.trigger()) })

      const trigger = host.querySelector('[data-odyssey-tab-overflow-trigger]') as unknown as HTMLButtonElement
      expect(trigger).not.toBeNull()
      expect(trigger.parentElement).toBe(list.parentElement)
      expect(list.contains(trigger)).toBe(false)
      await act(async () => { trigger.click() })
      const menu = host.querySelector('[data-odyssey-tab-overflow-menu]')
      expect(menu?.querySelectorAll('[data-odyssey-tab-overflow-option]')).toHaveLength(7)
      expect(menu?.textContent).toContain('已打开的页签7')

      const tasks = menu?.querySelector('[data-odyssey-tab-overflow-option="tasks"]') as unknown as HTMLButtonElement
      await act(async () => { tasks.click() })
      expect(onActivate).toHaveBeenCalledWith('tasks')
      expect(host.querySelector('[data-odyssey-tab-overflow-menu]')).toBeNull()
      expect(browserWindow.document.activeElement).toBe(trigger)

      const activeClose = host.querySelector('[data-odyssey-panel-tab-id="gold-md"] button') as unknown as HTMLButtonElement
      await act(async () => { activeClose.click() })
      expect(onClose).toHaveBeenCalledWith('gold-md')
      expect(browserWindow.document.activeElement?.getAttribute('data-odyssey-panel-tab-id')).toBe('hs300-md')

      const inactiveClose = host.querySelector('[data-odyssey-panel-tab-id="gold-pdf"] button') as unknown as HTMLButtonElement
      await act(async () => { inactiveClose.click() })
      expect(onClose).toHaveBeenCalledWith('gold-pdf')
      expect(browserWindow.document.activeElement?.getAttribute('data-odyssey-panel-tab-id')).toBe('gold-md')
    } finally {
      await act(async () => { root.unmount() })
      for (const [key, value] of Object.entries(previous)) {
        const property = key === 'act' ? 'IS_REACT_ACT_ENVIRONMENT' : key
        if (value === undefined) delete (globalThis as Record<string, unknown>)[property]
        else Object.defineProperty(globalThis, property, value)
      }
    }
  })
})
