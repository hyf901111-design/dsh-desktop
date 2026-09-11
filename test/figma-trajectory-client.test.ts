import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

import { patchFigmaTrajectory } from '../scripts/lib/figma-trajectory-client.mjs'

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

const packageSource = readFileSync(
  new URL('../node_modules/@deepseek-ai/dsh-client-ui-trajectory/lib/client.js', import.meta.url),
  'utf8'
)
const patched = patchFigmaTrajectory(packageSource)

async function mountToolbar(props: Record<string, unknown>) {
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  let descriptor: { factory(require: (id: string) => unknown): Record<string, unknown> } | undefined
  Object.assign(browserWindow, { __ModuleLoader__: { load(value: typeof descriptor) { descriptor = value } } })
  const executable = patched.replace(
    '\t\texports.apply = apply;',
    '\t\texports.__testTrajectoryToolbar = TrajectoryToolbar;\n\t\texports.apply = apply;'
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
  if (descriptor === undefined) throw new Error('Trajectory bundle did not register')
  const NullPrimitive = () => null
  const client = descriptor.factory((id) => {
    if (id === 'react') return react
    if (id === 'react/jsx-runtime') return jsxRuntime
    if (id === 'react-dom/client') return { createRoot }
    return new Proxy({}, { get: () => NullPrimitive })
  })
  const Toolbar = client.__testTrajectoryToolbar as (value: Record<string, unknown>) => unknown
  const host = browserWindow.document.createElement('div')
  browserWindow.document.body.appendChild(host)
  const previous = { window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement }
  Object.assign(globalThis, { window: browserWindow, document: browserWindow.document, HTMLElement: browserWindow.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true })
  const root = createRoot(host as unknown as Element)
  await act(async () => { root.render(createElement(Toolbar, props)) })
  return {
    browserWindow,
    host,
    rerender: async (next: Record<string, unknown>) => {
      await act(async () => { root.render(createElement(Toolbar, next)) })
    },
    restore: async () => {
      await act(async () => { root.unmount() })
      Object.assign(globalThis, previous)
      ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
      await browserWindow.happyDOM.close()
    }
  }
}

const copy: Record<string, string> = {
  'toolbar.aria': '轨迹工具栏',
  'toolbar.duration': '真实时长',
  'toolbar.useActualDuration': '使用真实时长',
  'toolbar.useEqualWidth': '使用等宽事件',
  'toolbar.actualTime': '实际时间',
  'toolbar.turns': '轮次',
  'toolbar.expandTurns': '展开轮次',
  'toolbar.collapseTurns': '折叠轮次',
  'toolbar.calls': '调用',
  'toolbar.expandCalls': '展开调用',
  'toolbar.collapseCalls': '折叠调用',
  'toolbar.search': '搜索轨迹',
  'toolbar.searchPlaceholder': '搜索'
}

describe('Figma trajectory client patch', () => {
  it('patches the installed package once and exposes stable surface selectors', () => {
    expect(patched).toContain('/* sherlock:figma-trajectory:v1 */')
    expect(patchFigmaTrajectory(patched)).toBe(patched)
    for (const marker of [
      'data-odyssey-trajectory-toolbar',
      'data-odyssey-trajectory-timeline',
      'data-odyssey-trajectory-table-scroll',
      'data-odyssey-trajectory-table',
      'data-odyssey-trajectory-ledger',
      'data-odyssey-trajectory-event',
      'data-odyssey-trajectory-kind-slot',
      'data-odyssey-trajectory-content'
    ]) expect(patched).toContain(marker)
    expect(patched).toContain('laneLabels: [t("timeline.input"), t("timeline.model"), t("timeline.tools")]')
  })

  it('keeps the real persisted store, history, virtual table, selection and inspector paths', () => {
    for (const behavior of [
      'createTrajectoryDurationStore()',
      'session.loadOlder()',
      'rowVirtualizer.scrollToIndex',
      'rowVirtualizer.scrollToEnd',
      'onRangeChange: handleTimelineRangeChange',
      'recordSelection: timelineRecordSelection',
      'recordFocus: timelineRecordFocus',
      'inspectCallId: inspect?.callId ?? null'
    ]) expect(patched).toContain(behavior)
  })

  it('renders and operates the real toolbar controls with the Figma labels', async () => {
    const actualDurationChanges: boolean[] = []
    let turnToggles = 0
    let callToggles = 0
    const baseProps = {
      actualDuration: false,
      onActualDurationChange: (value: boolean) => actualDurationChanges.push(value),
      actualTime: false,
      onActualTimeChange: () => {},
      allTurnsCollapsed: false,
      onToggleAllTurns: () => { turnToggles += 1 },
      allAssistantsCollapsed: false,
      onToggleAllAssistants: () => { callToggles += 1 },
      searchQuery: '',
      onSearchQueryChange: () => {},
      t: (key: string) => copy[key] ?? key
    }
    const mounted = await mountToolbar(baseProps)
    try {
      const lateStyle = mounted.browserWindow.document.createElement('style')
      lateStyle.textContent = readFileSync(new URL('../src/preload/figma-trajectory.css', import.meta.url), 'utf8')
      mounted.browserWindow.document.head.appendChild(lateStyle)
      expect(mounted.host.querySelector('[data-odyssey-trajectory-toolbar]')).not.toBeNull()
      expect(mounted.host.textContent).toContain('真实时长')
      expect(mounted.host.textContent).toContain('折叠轮次')
      expect(mounted.host.textContent).toContain('折叠调用')
      const duration = mounted.host.querySelector('[data-odyssey-trajectory-control="duration"]')
      const search = mounted.host.querySelector('[data-odyssey-trajectory-search]')
      if (duration === null || search === null) throw new Error('Patched trajectory controls were not rendered')
      expect(mounted.browserWindow.getComputedStyle(duration).width).toBe('92px')
      expect(mounted.browserWindow.getComputedStyle(duration).height).toBe('30px')
      expect(mounted.browserWindow.getComputedStyle(search).width).toBe('200px')
      expect(mounted.browserWindow.getComputedStyle(search).height).toBe('30px')
      await act(async () => {
        ;(duration as unknown as { click(): void }).click()
        ;(mounted.host.querySelector('[data-odyssey-trajectory-control="turns"]') as unknown as { click(): void }).click()
        ;(mounted.host.querySelector('[data-odyssey-trajectory-control="calls"]') as unknown as { click(): void }).click()
      })
      expect(actualDurationChanges).toEqual([true])
      expect(turnToggles).toBe(1)
      expect(callToggles).toBe(1)
      await mounted.rerender({ ...baseProps, allTurnsCollapsed: true, allAssistantsCollapsed: true })
      expect(mounted.host.textContent).toContain('展开轮次')
      expect(mounted.host.textContent).toContain('展开调用')
    } finally {
      await mounted.restore()
    }
  })

  it('matches the measured Figma geometry while retaining table scrolling', () => {
    const css = readFileSync(new URL('../src/preload/figma-trajectory.css', import.meta.url), 'utf8')
    for (const measurement of [
      'flex: 0 0 34px',
      'width: 92px',
      'height: 30px',
      'flex: 0 0 200px',
      'flex: 0 0 82px',
      'grid-template-columns: 40px minmax(0, 1fr)',
      'margin-right: 16px',
      'height: 33px',
      'width: 152px',
      'width: 88px'
    ]) expect(css).toContain(measurement)
    expect(css).toContain('[data-odyssey-trajectory-table-scroll]')
    expect(css).toContain('overflow: hidden auto')
    expect(css).not.toContain('scrollbar-width: none')
    expect(css).not.toContain('::-webkit-scrollbar')
  })

  it('fails closed when an installed package anchor drifts', () => {
    expect(() => patchFigmaTrajectory('function TrajectoryToolbar() {}')).toThrow(/Chinese locale boundary/)
  })
})
