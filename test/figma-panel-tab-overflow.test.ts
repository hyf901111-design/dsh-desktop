import { readFile } from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'

// Replay the production Node transform; Vitest formatting changes function.toString().
const patchBetterSidebarClient=(source:string)=>execFileSync(process.execPath,['--input-type=module','-e',"import fs from 'node:fs';import{patchBetterSidebarClient}from'./scripts/lib/patch-sherlock-better-sidebar.mjs';process.stdout.write(patchBetterSidebarClient(fs.readFileSync(0,'utf8')))"],{input:source,encoding:'utf8',maxBuffer:24*1024*1024})

const source = await readFile(process.env.SHERLOCK_SIDEBAR_CLIENT_SOURCE ?? new URL('../build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js', import.meta.url), 'utf8')
const patched = patchBetterSidebarClient(source)
const start = patched.indexOf('function systemTabTitle(')
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
      'MutationObserver',
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
      browserWindow.MutationObserver,
      ResizeObserverStub,
      browserWindow,
      browserWindow.document,
      (callback: FrameRequestCallback) => { queueMicrotask(() => callback(0)); return 1 },
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
      const chatId = 'sherlock-research-conversation'
      const conversationTabs = [...tabs, {
        id: chatId, type: chatId, title: '对话', meta: { sherlockPinned: true, sherlockClosable: false }
      }]
      const renderTabs = (openTabs: typeof conversationTabs, active: string) =>
        act(async () => {
          root.render(createElement(renderTabBar, {
            paneId: 'right', tabs: openTabs, active, onActivate, onClose,
            onNewTab: vi.fn(), onDropTab: vi.fn(), newTabOptions: []
          }))
        })
      await renderTabs(conversationTabs, chatId)
      const chat = host.querySelector(`[data-odyssey-panel-tab-id="${chatId}"]`) as unknown as HTMLElement
      const scrollable = host.querySelector('.t8lSSG_tabList') as unknown as HTMLElement
      expect(chat.querySelector('[data-conversation-tab-icon]')).not.toBeNull()
      expect(chat.parentElement).toBe(scrollable.parentElement)
      expect(scrollable.contains(chat)).toBe(false)
      expect(chat.nextElementSibling).toBe(scrollable)
      expect(chat.textContent).toBe('对话')
      expect(chat.querySelector('button')).toBeNull()
      const lastTab = scrollable.querySelector<HTMLElement>('[data-odyssey-panel-tab-id="tasks"]')!
      Object.defineProperty(lastTab, 'offsetLeft', { value: 280 })
      Object.defineProperty(lastTab, 'offsetWidth', { configurable: true, value: 50 })
      Object.defineProperty(scrollable, 'clientWidth', { configurable: true, value: 110 })
      await renderTabs(conversationTabs, 'tasks')
      expect(scrollable.scrollLeft).toBe(220)
      expect(chat.hasAttribute('data-odyssey-tab-clipped')).toBe(false)
      await act(async () => { chat.click() })
      expect(onActivate).toHaveBeenCalledWith(chatId)
      await renderTabs(conversationTabs, chatId)
      expect(scrollable.scrollLeft).toBe(220)
      await renderTabs(tabs, 'gold-md')
      expect(host.querySelectorAll('[role=tab][aria-selected=true]')).toHaveLength(1)
      await act(async () => {
        browserWindow.document.body.dataset.scheduledComponent = 'true'
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel'))
      })
      expect(host.querySelectorAll('[role=tab][aria-selected=true]')).toHaveLength(0)
      expect(host.querySelector('.t8lSSG_tabActive')).toBeNull()
      await act(async () => {
        delete browserWindow.document.body.dataset.scheduledComponent
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel'))
      })
      expect(host.querySelectorAll('[role=tab][aria-selected=true]')).toHaveLength(1)
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

      await act(async () => {
        browserWindow.document.body.dataset.scheduledComponent = 'false'
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel'))
      })
      expect(menu?.querySelectorAll('[data-odyssey-tab-overflow-option]')).toHaveLength(8)
      expect(menu?.textContent).toContain('已打开的页签8')
      const scheduleOption = menu?.querySelector('[data-odyssey-tab-overflow-option="sherlock-component-schedule"]') as unknown as HTMLButtonElement
      expect(scheduleOption.getAttribute('aria-checked')).toBe('false')
      const selectSchedule = vi.fn()
      browserWindow.addEventListener('sherlock:component-schedule-select', selectSchedule)
      await act(async () => { scheduleOption.click() })
      expect(selectSchedule).toHaveBeenCalledOnce()
      expect(onActivate).not.toHaveBeenCalledWith('sherlock-component-schedule')
      expect(host.querySelector('[data-odyssey-tab-overflow-menu]')).toBeNull()
      await act(async () => {
        browserWindow.document.body.dataset.scheduledComponent = 'true'
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel'))
        trigger.click()
      })
      expect(host.querySelector('[data-odyssey-tab-overflow-option="sherlock-component-schedule"]')?.getAttribute('aria-checked')).toBe('true')
      expect(host.querySelectorAll('[role=menuitemradio][aria-checked=true]')).toHaveLength(1)
      await act(async () => {
        delete browserWindow.document.body.dataset.scheduledComponent
        browserWindow.dispatchEvent(new browserWindow.CustomEvent('sherlock:scheduled-panel'))
      })
      expect(host.querySelectorAll('[data-odyssey-tab-overflow-option]')).toHaveLength(7)
      expect(host.querySelector('[data-odyssey-tab-overflow-heading]')?.textContent).toContain('已打开的页签7')

      const tasks = host.querySelector('[data-odyssey-tab-overflow-option="tasks"]') as unknown as HTMLButtonElement
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

      // The full-name switcher stays available even when all compressed tabs fit.
      // Its 28 px target also consumes the actual 6 px toolbar gap while mounted.
      list.style.columnGap = '4px'
      list.parentElement!.style.columnGap = '6px'
      Object.defineProperty(trigger, 'offsetWidth', { configurable: true, value: 28 })
      Object.defineProperty(list, 'clientWidth', { configurable: true, get: () =>
        host.querySelector('[data-odyssey-tab-overflow-trigger]') ? 840 : 874 })
      await act(async () => { observers.forEach(observer => observer.trigger()) })
      expect(host.querySelector('[data-odyssey-tab-overflow-trigger]')).not.toBeNull()
      await act(async () => { observers.forEach(observer => observer.trigger()) })
      expect(host.querySelector('[data-odyssey-tab-overflow-trigger]')).not.toBeNull()
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
