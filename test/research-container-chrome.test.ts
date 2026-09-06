import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'

const requireModule = createRequire(import.meta.url)
const React = requireModule('react')
const { act, createElement, useSyncExternalStore } = React
const { createRoot } = requireModule('react-dom/client')

function fallbackModule(): any {
  const fallback: any = new Proxy(function () {}, {
    get: () => fallback, apply: () => fallback, construct: () => ({})
  })
  return fallback
}

async function mountContainer() {
  const browserWindow = new Window({ url: 'https://sherlock.local/' })
  const globals = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const previous = globals.map((key) => Object.getOwnPropertyDescriptor(globalThis, key))
  for (const [index, value] of [browserWindow, browserWindow.document, browserWindow.navigator, true].entries()) {
    Object.defineProperty(globalThis, globals[index]!, { configurable: true, value })
  }
  let descriptor: any
  Object.assign(browserWindow, { __ModuleLoader__: { load(value: any) { descriptor = value } } })
  runInNewContext(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'), {
    window: browserWindow, document: browserWindow.document, localStorage: browserWindow.localStorage,
    navigator: browserWindow.navigator, HTMLElement: browserWindow.HTMLElement,
    HTMLTextAreaElement: browserWindow.HTMLTextAreaElement, Text: browserWindow.Text,
    ResizeObserver: browserWindow.ResizeObserver,
    requestAnimationFrame: browserWindow.requestAnimationFrame.bind(browserWindow),
    cancelAnimationFrame: browserWindow.cancelAnimationFrame.bind(browserWindow),
    AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout
  })
  const client = descriptor.factory((id: string) => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return requireModule('react/jsx-runtime')
    if (id === 'react-dom') return requireModule('react-dom')
    return fallbackModule()
  })
  browserWindow.localStorage.setItem('sherlock.research.canvas.artifacts.v1:chrome', JSON.stringify([{
    id: 'html', kind: 'generated-container', messageId: 'html', title: '交互图表',
    excerpt: 'html', generationStatus: 'completed', generationLastSeq: 3,
    sourceNodeIds: [], containerPrompt: '原始需求', refreshMinutes: 0,
    lastSuccessfulAt: Date.now(), x: 500, y: 400, width: 1200, height: 1600, sizeMode: 'auto',
    containerSpec: { version: 1, type: 'html', title: '交互图表', html: '<input value="保留输入"><button>计数</button>' }
  }]))
  const workspace = new client.ResearchWorkspaceRegistry(browserWindow.localStorage).for('chrome')
  const submitted: Array<{ id: string; prompt: string }> = []
  const activated = vi.fn()
  function Harness() {
    const snapshot = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot)
    return createElement(client.ResearchCanvasArtifactCard, {
      node: snapshot.artifacts[0], sessionId: 'chrome', visible: true,
      onActivate: activated,
      onSubmitContainer: (node: any, prompt: string) => {
        submitted.push({ id: node.id, prompt })
        workspace.beginContainerGeneration(node.id, prompt)
      },
      onSetContainerRefresh: (node: any, minutes: number) => workspace.setContainerRefresh(node.id, minutes)
    })
  }
  const host = browserWindow.document.createElement('div')
  browserWindow.document.body.append(host)
  const root = createRoot(host)
  await act(async () => { root.render(createElement(Harness)) })
  const click = async (selector: string) => {
    const target = host.querySelector(selector)
    expect(target, selector).not.toBeNull()
    await act(async () => { target?.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  const key = async (target: any, value: string) => {
    await act(async () => { target.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })) })
  }
  return {
    browserWindow, host, workspace, submitted, activated, click, key,
    async cleanup() {
      await act(async () => { root.unmount() })
      await browserWindow.happyDOM.close()
      globals.forEach((key, index) => {
        const value = previous[index]
        if (value) Object.defineProperty(globalThis, key, value)
        else delete (globalThis as any)[key]
      })
    }
  }
}

describe('Research container chrome', () => {
  it('keeps only the title chrome and moves component actions to More', async () => {
    const mounted = await mountContainer()
    try {
      const { host, click } = mounted
      expect(host.querySelector('.rScV5Q_containerControls')).toBeNull()
      expect(host.querySelector('.rScV5Q_artifactMeta')).toBeNull()
      expect(host.querySelector('[data-research-node-title] [data-research-container-more]')).not.toBeNull()
      expect(host.querySelector('[role="menu"]')).toBeNull()
      await click('[data-research-container-more]')
      expect(host.querySelector('[role="menu"] [data-research-container-edit]')?.textContent).toBe('编辑需求')
      expect(host.querySelector('[role="menu"] [data-research-container-refresh]')?.textContent).toBe('刷新')
      expect(host.querySelectorAll('[role="menuitemradio"]')).toHaveLength(5)
      expect(host.querySelector('[data-research-container-refresh-minutes="0"]')?.getAttribute('aria-checked')).toBe('true')
    } finally { await mounted.cleanup() }
  })

  it.each(['button', 'Escape'])('cancels prompt editing with %s without changing content, prompt, geometry or iframe identity', async (method) => {
    const mounted = await mountContainer()
    try {
      const { host, browserWindow, workspace, click, key, submitted } = mounted
      const before = JSON.stringify(workspace.getSnapshot().artifacts)
      const iframe = host.querySelector('[data-research-html-artifact]')
      const srcdoc = iframe?.getAttribute('srcdoc')
      await click('[data-research-container-more]')
      await click('[data-research-container-edit]')
      const prompt = host.querySelector('[data-research-container-prompt]') as any
      expect(prompt.value).toBe('原始需求')
      expect(browserWindow.document.activeElement).toBe(prompt)
      await act(async () => {
        prompt.value = '放弃的修改'
        prompt.dispatchEvent(new browserWindow.Event('input', { bubbles: true }))
      })
      expect(host.querySelector('[data-research-html-artifact]')).toBe(iframe)
      if (method === 'button') await click('[data-research-container-cancel]')
      else await key(prompt, 'Escape')
      expect(host.querySelector('[data-research-container-prompt]')).toBeNull()
      expect(host.querySelector('[data-research-html-artifact]')).toBe(iframe)
      expect(iframe?.getAttribute('srcdoc')).toBe(srcdoc)
      expect(JSON.stringify(workspace.getSnapshot().artifacts)).toBe(before)
      expect(submitted).toEqual([])
      await click('[data-research-container-more]')
      await click('[data-research-container-edit]')
      expect((host.querySelector('[data-research-container-prompt]') as any).value).toBe('原始需求')
    } finally { await mounted.cleanup() }
  })

  it('keeps More keyboard-accessible and isolates its pointer and key events from the canvas', async () => {
    const mounted = await mountContainer()
    try {
      const { host, browserWindow, key, activated } = mounted
      const pointer = vi.fn()
      browserWindow.document.body.addEventListener('pointerdown', pointer)
      const trigger = host.querySelector('[data-research-container-more]') as any
      expect(trigger).not.toBeNull()
      await act(async () => {
        trigger.focus()
        trigger.dispatchEvent(new browserWindow.PointerEvent('pointerdown', { bubbles: true }))
      })
      await key(trigger, 'ArrowDown')
      expect(browserWindow.document.activeElement).toBe(host.querySelector('[data-research-container-edit]'))
      await key(browserWindow.document.activeElement, 'ArrowDown')
      expect(browserWindow.document.activeElement).toBe(host.querySelector('[data-research-container-refresh]'))
      await key(browserWindow.document.activeElement, 'End')
      expect(browserWindow.document.activeElement).toBe(host.querySelector('[data-research-container-refresh-minutes="30"]'))
      await key(browserWindow.document.activeElement, 'Escape')
      expect(host.querySelector('[role="menu"]')).toBeNull()
      expect(browserWindow.document.activeElement).toBe(trigger)
      expect(pointer).not.toHaveBeenCalled()
      expect(activated).not.toHaveBeenCalled()
      await key(trigger, 'Enter')
      expect(host.querySelector('[role="menu"]')).not.toBeNull()
      await act(async () => { browserWindow.document.body.dispatchEvent(new browserWindow.PointerEvent('pointerdown', { bubbles: true })) })
      expect(host.querySelector('[role="menu"]')).toBeNull()
    } finally { await mounted.cleanup() }
  })

  it('persists automatic refresh from the menu and refreshes using the original prompt while retaining the iframe', async () => {
    const mounted = await mountContainer()
    try {
      const { host, workspace, click, submitted } = mounted
      const iframe = host.querySelector('[data-research-html-artifact]')
      await click('[data-research-container-more]')
      await click('[data-research-container-refresh-minutes="5"]')
      expect(workspace.getSnapshot().artifacts[0].refreshMinutes).toBe(5)
      expect(host.querySelector('[role="menu"]')).toBeNull()
      await click('[data-research-container-more]')
      await click('[data-research-container-refresh]')
      expect(submitted).toEqual([{ id: 'html', prompt: '原始需求' }])
      expect(workspace.getSnapshot().artifacts[0]).toMatchObject({ generationStatus: 'queued', width: 1200, height: 1600 })
      expect(host.querySelector('[data-research-html-artifact]')).toBe(iframe)
      await click('[data-research-container-more]')
      await click('[data-research-container-refresh-minutes="0"]')
      expect(workspace.getSnapshot().artifacts[0].refreshMinutes).toBe(0)
      expect(submitted).toHaveLength(1)
    } finally { await mounted.cleanup() }
  })

  it('submits the edited prompt once only after the explicit update action', async () => {
    const mounted = await mountContainer()
    try {
      const { host, browserWindow, workspace, click, submitted } = mounted
      const iframe = host.querySelector('[data-research-html-artifact]')
      await click('[data-research-container-more]')
      await click('[data-research-container-edit]')
      const prompt = host.querySelector('[data-research-container-prompt]') as any
      await act(async () => {
        prompt.value = '  更新后的需求  '
        prompt.dispatchEvent(new browserWindow.Event('input', { bubbles: true }))
      })
      expect(workspace.getSnapshot().artifacts[0].containerPrompt).toBe('原始需求')
      expect(submitted).toEqual([])
      expect(host.querySelector('[data-research-container-submit]')?.textContent).toBe('更新组件')
      await click('[data-research-container-submit]')
      expect(submitted).toEqual([{ id: 'html', prompt: '更新后的需求' }])
      expect(workspace.getSnapshot().artifacts[0]).toMatchObject({ containerPrompt: '更新后的需求', generationStatus: 'queued', width: 1200, height: 1600 })
      expect(host.querySelector('[data-research-container-prompt]')).toBeNull()
      expect(host.querySelector('[data-research-html-artifact]')).toBe(iframe)
    } finally { await mounted.cleanup() }
  })
})
