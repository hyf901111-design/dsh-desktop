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

async function mountContainer(overrides: Record<string, unknown> = {}) {
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
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: ({ text }: any) => createElement('div', null, text) }
    return fallbackModule()
  })
  browserWindow.localStorage.setItem('sherlock.research.canvas.artifacts.v1:chrome', JSON.stringify([{
    id: 'html', kind: 'generated-container', messageId: 'html', title: '交互图表',
    excerpt: 'html', generationStatus: 'completed', generationLastSeq: 3,
    sourceNodeIds: [], containerPrompt: '原始需求', refreshMinutes: 0,
    lastSuccessfulAt: Date.now(), x: 500, y: 400, width: 1200, height: 1600, sizeMode: 'auto',
    containerSpec: { version: 1, type: 'html', title: '交互图表', html: '<input value="保留输入"><button>计数</button>' },
    ...overrides
  }]))
  const workspace = new client.ResearchWorkspaceRegistry(browserWindow.localStorage).for('chrome')
  const submitted: Array<{ id: string; prompt: string }> = []
  const activated = vi.fn()
  const frameAction = vi.fn()
  function Harness() {
    const snapshot = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot, workspace.getSnapshot)
    return createElement(client.ResearchCanvasArtifactCard, {
      node: snapshot.artifacts[0], sessionId: 'chrome', visible: true,
      onActivate: activated, onFrameAction: frameAction,
      onAutoHeight: (node: any, height: number) => workspace.updateNodeGeometry(node.id, { height, sizeMode: "auto" }),
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
    const target = browserWindow.document.body.querySelector(selector)
    expect(target, selector).not.toBeNull()
    await act(async () => { target?.dispatchEvent(new browserWindow.MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  const key = async (target: any, value: string) => {
    await act(async () => { target.dispatchEvent(new browserWindow.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })) })
  }
  return {
    browserWindow, host: browserWindow.document.body, workspace, submitted, activated, frameAction, click, key,
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
  it.each([
    { version: 1, type: 'markdown', title: '资料来源', content: '> 已保留来源摘要。\n\nSources: [来源](https://example.com)' },
    { version: 1, type: 'kpi', title: '核心指标', items: [{ label: '指标', value: 42 }] }
  ])('owns a draggable title before every content type, including source fallbacks', async spec => {
    const mounted = await mountContainer({ title: spec.title, containerSpec: spec })
    try {
      const header = mounted.host.querySelector('[data-research-node-move-handle]')!
      expect(header.querySelector('.rScV5Q_nodeTitleText')?.textContent).toBe(spec.title)
      expect(header.nextElementSibling?.hasAttribute('data-research-preview-body')).toBe(true)
      expect(mounted.host.querySelectorAll('.rScV5Q_nativeCardContent h3')).toHaveLength(0)
      const resize = mounted.host.querySelector('[data-research-resize-handle="se"] svg path')!
      expect(resize.getAttribute('stroke-linecap')).toBe('round')
      expect(resize.getAttribute('stroke-width')).toBe('5')
    } finally { await mounted.cleanup() }
  })

  it('keeps only the title chrome and moves component actions to More', async () => {
    const mounted = await mountContainer()
    try {
      const { host, click } = mounted
      expect(host.querySelector('.rScV5Q_containerControls')).toBeNull()
      expect(host.querySelector('.rScV5Q_artifactMeta')).toBeNull()
      expect(Array.from(host.querySelectorAll('[data-research-resize-handle]')).map((handle) => handle.getAttribute('data-research-resize-handle'))).toEqual(['nw', 'ne', 'sw', 'se'])
      expect(host.querySelector('[data-research-node-title] [data-research-container-more]')).not.toBeNull()
      expect(host.querySelector('[role="menu"]')).toBeNull()
      await click('[data-research-container-more]')
      expect(host.querySelector('[role="menu"] [data-research-container-edit]')?.textContent).toBe('编辑需求')
      expect(host.querySelector('[role="menu"] [data-research-container-refresh]')?.textContent).toBe('刷新')
      expect(host.querySelectorAll('[role="menuitemradio"]')).toHaveLength(0)
      await click('[data-research-container-refresh-submenu]')
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
      expect(browserWindow.document.activeElement).toBe(host.querySelector('[data-research-container-refresh-submenu]'))
      await key(browserWindow.document.activeElement, 'ArrowRight')
      expect(browserWindow.document.activeElement).toBe(host.querySelector('[data-research-container-refresh-minutes="0"]'))
      await key(browserWindow.document.activeElement, 'End')
      expect(browserWindow.document.activeElement).toBe(host.querySelector('[data-research-container-refresh-minutes="30"]'))
      await key(browserWindow.document.activeElement, 'Escape')
      expect(browserWindow.document.activeElement).toBe(host.querySelector('[data-research-container-refresh-submenu]'))
      await key(browserWindow.document.activeElement, 'Escape')
      expect(host.querySelector('[role="menu"]')).toBeNull()
      expect(host.querySelector('.rScV5Q_containerMenuPopup[data-state="closed"]')?.hasAttribute('inert')).toBe(true)
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
      await click('[data-research-container-refresh-submenu]')
      await click('[data-research-container-refresh-minutes="5"]')
      expect(workspace.getSnapshot().artifacts[0].refreshMinutes).toBe(5)
      expect(host.querySelector('[role="menu"]')).toBeNull()
      await click('[data-research-container-more]')
      await click('[data-research-container-refresh]')
      expect(submitted).toEqual([{ id: 'html', prompt: '原始需求' }])
      expect(workspace.getSnapshot().artifacts[0]).toMatchObject({ generationStatus: 'queued', width: 1200, height: 1600 })
      expect(host.querySelector('[data-research-html-artifact]')).toBe(iframe)
      await click('[data-research-container-more]')
      await click('[data-research-container-refresh-submenu]')
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

describe('Research generation event retention', () => {
  it.each(['receipt', 'inspection', 'streamed inspections'])('retains structured history across 100 deltas from %s without losing text or sequence state', async (delivery) => {
    let descriptor: any
    runInNewContext(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'), {
      window: { __ModuleLoader__: { load(value: any) { descriptor = value } } },
      document: undefined, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout
    })
    const client = descriptor.factory((id: string) => {
      if (id === 'react') return React
      if (id === 'react/jsx-runtime') return requireModule('react/jsx-runtime')
      if (id === 'react-dom') return requireModule('react-dom')
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return { MarkdownText: ({ text }: any) => createElement('div', null, text) }
      return fallbackModule()
    })
    const stored = new Map([['sherlock.research.canvas.artifacts.v1:retention', JSON.stringify([{
      id: 'html', kind: 'generated-container', messageId: 'html', title: '页面', excerpt: '准备中',
      generationStatus: 'queued', generationLastSeq: 0, containerPrompt: '生成页面',
      sourceNodeIds: [], refreshMinutes: 0, x: 0, y: 0, width: 480, height: 300, sizeMode: 'auto'
    }])]])
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => stored.set(key, value) }
    const workspace = new client.ResearchWorkspaceRegistry(storage).for('retention')
    const identity = { taskId: 'task-html', canvasNodeId: 'html' }
    const structured = [
      { ...identity, seq: 1, type: 'queued' },
      { ...identity, seq: 2, type: 'started' },
      { ...identity, seq: 3, type: 'tool-started', tool: 'web_search' },
      { ...identity, seq: 4, type: 'tool-finished', failed: false }
    ]
    const deltas = Array.from({ length: 100 }, (_, index) => ({ ...identity, seq: index + 5, type: 'assistant-delta', text: `[${index}]` }))
    const receive = (events: any[], lastSeq: number) => ({ ...identity, state: 'running', lastSeq, events })
    if (delivery === 'receipt') {
      expect(workspace.attachGenerationTask('html', receive([...structured, ...deltas], 104))).toBe(true)
    } else {
      expect(workspace.attachGenerationTask('html', receive(structured, 4))).toBe(true)
      const chunkSize = delivery === 'inspection' ? 100 : 10
      for (let index = 0; index < deltas.length; index += chunkSize) {
        const chunk = deltas.slice(index, index + chunkSize)
        expect(workspace.applyGenerationInspection('html', receive(chunk, chunk.at(-1)!.seq))).toBe(true)
      }
    }
    const running = workspace.getSnapshot().artifacts[0]
    expect(running.generationEvents.filter((event: any) => event.type !== 'assistant-delta')).toEqual(structured)
    expect(running.generationEvents.filter((event: any) => event.type === 'assistant-delta').length).toBeLessThanOrEqual(8)
    expect(running.generationEvents.at(-1)).toMatchObject({ seq: 104, type: 'assistant-delta' })
    expect(running.generationPartialText).toBe(deltas.map((event) => event.text).join(''))
    expect(running.generationLastSeq).toBe(104)
    expect(workspace.applyGenerationInspection('html', receive(deltas, 104))).toBe(false)
    expect(workspace.getSnapshot().artifacts[0].generationPartialText).toBe(running.generationPartialText)
    expect(workspace.applyGenerationInspection('html', receive([
      deltas[0], { ...identity, taskId: 'wrong-task', seq: 105, type: 'assistant-delta', text: '错误' },
      { ...identity, seq: 105, type: 'assistant-delta', text: '末尾' },
      { ...identity, seq: 105, type: 'assistant-delta', text: '重复' }
    ], 105))).toBe(true)
    expect(workspace.getSnapshot().artifacts[0]).toMatchObject({
      generationLastSeq: 105, generationPartialText: `${running.generationPartialText}末尾`
    })
    const manyTools = Array.from({ length: 100 }, (_, index) => index % 2 === 0
      ? { ...identity, seq: index + 106, type: 'tool-started', tool: 'read_file' }
      : { ...identity, seq: index + 106, type: 'tool-finished', failed: false })
    expect(workspace.applyGenerationInspection('html', receive(manyTools, 205))).toBe(true)
    const bounded = workspace.getSnapshot().artifacts[0]
    expect(bounded.generationEvents.length).toBeLessThanOrEqual(80)
    expect(bounded.generationEvents.slice(0, 2)).toEqual(structured.slice(0, 2))
    expect(bounded.generationEvents.some((event: any) => event.seq === 105)).toBe(true)
    expect(bounded.generationEvents.at(-1)).toMatchObject({ seq: 205, type: 'tool-finished' })
    expect(bounded.generationPartialText).toBe(`${running.generationPartialText}末尾`)
    const finalOutput = { version: 1, type: 'html', title: '完成页面', html: '<main>完整结果</main>' }
    expect(workspace.applyGenerationInspection('html', { ...identity, state: 'completed', lastSeq: 206, events: [], finalOutput })).toBe(true)
    expect(workspace.getSnapshot().artifacts[0]).toMatchObject({ generationStatus: 'completed', generationLastSeq: 206, containerSpec: finalOutput })
    expect(workspace.getSnapshot().artifacts[0]).not.toHaveProperty('generationPartialText')
  })
})


describe('completed container content sizing', () => {
  it('caps native report content at L on completion and preserves later manual resizing', async () => {
    const mounted = await mountContainer({ containerSpec: undefined, generationStatus: 'running', generationTaskId: 'task-native', generationLastSeq: 1, width: 640, height: 420, sizeMode: 'manual' })
    const prototype = mounted.browserWindow.HTMLElement.prototype
    const previous = Object.getOwnPropertyDescriptor(prototype, 'scrollHeight')
    Object.defineProperty(prototype, 'scrollHeight', { configurable: true, get() { return 3250 } })
    try {
      await act(async () => {
        mounted.workspace.applyGenerationInspection('html', { taskId: 'task-native', canvasNodeId: 'html', state: 'completed', lastSeq: 2, finalOutput: JSON.stringify({ version: 1, type: 'markdown', title: '黄金报告', content: '# 黄金报告\n完整研究内容' }), events: [] })
      })
      expect(mounted.workspace.getSnapshot().artifacts[0]).toMatchObject({ sizeMode: 'auto', height: 456, generationStatus: 'completed' })
      await act(async () => { mounted.workspace.updateNodeGeometry('html', { height: 500, sizeMode: 'manual' }) })
      expect(mounted.workspace.getSnapshot().artifacts[0]).toMatchObject({ sizeMode: 'manual', height: 500 })
    } finally {
      if (previous) Object.defineProperty(prototype, 'scrollHeight', previous)
      else delete (prototype as any).scrollHeight
      await mounted.cleanup()
    }
  })
})

describe('shared canvas frames', () => {
  it.each(['generated-summary', 'generated-mind-map', 'pasted-text', 'assistant-result'])('keeps %s content mounted when expanded and exposes its own menu actions', async kind => {
    const mounted = await mountContainer({ kind, sourceNodeIds: ['source-a'], containerSpec: undefined, title: '研究成果', excerpt: '# 研究成果\n\n- 趋势\n  - 关键依据' })
    try {
      const { host, click, key, frameAction, browserWindow } = mounted
      const content = host.querySelector('[data-research-artifact-content]')
      expect(host.querySelectorAll('[data-research-resize-handle]')).toHaveLength(4)
      await click('[data-research-container-expand]')
      expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true)
      expect(host.querySelector('[data-research-artifact-content]')).toBe(content)
      await click('[data-research-frame-more]')
      expect(browserWindow.document.activeElement?.getAttribute('data-research-frame-action')).toBe('rename')
      await key(browserWindow.document.activeElement, 'End')
      expect(browserWindow.document.activeElement?.getAttribute('data-research-frame-action')).toBe('remove')
      await key(browserWindow.document.activeElement, 'Escape')
      expect(host.querySelector('dialog')?.hasAttribute('open')).toBe(true)
      await click('[data-research-frame-more]')
      await click('[data-research-frame-action="rename"]')
      expect(frameAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'html', kind }), 'rename')
    } finally { await mounted.cleanup() }
  })
})

describe('component focus view', () => {
  it('opens and closes in the top layer without replacing the live iframe or stored geometry', async () => {
    const mounted = await mountContainer()
    try {
      const {host, click, workspace, browserWindow} = mounted
      const frame = host.querySelector('iframe')
      const before = workspace.getSnapshot().artifacts[0]
      await click('[data-research-container-expand]')
      const dialog = host.querySelector('dialog')!
      expect(dialog.hasAttribute('open')).toBe(true)
      expect(dialog.getAttribute('role')).toBe('dialog')
      expect(host.querySelector('iframe')).toBe(frame)
      await act(async () => { dialog.dispatchEvent(new browserWindow.Event('cancel', { cancelable: true })) })
      expect(dialog.hasAttribute('open')).toBe(false)
      expect(host.querySelector('iframe')).toBe(frame)
      expect(workspace.getSnapshot().artifacts[0]).toEqual(before)
      expect(host.querySelector('[data-research-resize-handle="se"]')).not.toBeNull()
    } finally { await mounted.cleanup() }
  })
})


describe('Figma component content hierarchy', () => {
  it('summarizes a narrow short table while its expanded reader restores every row and column', async () => {
    const spec={version:1,type:'table',title:'数据表',columns:['名称','数值','变化','来源'],rows:Array.from({length:8},(_,i)=>['项目'+i,i,i+'%','[完整市场研究数据与出处说明](https://example.com/market/source)'])};
    const mounted=await mountContainer({containerSpec:spec,width:320,height:220,sizeMode:'manual'});
    try {
      expect(mounted.host.querySelectorAll('thead th')).toHaveLength(2);
      expect(mounted.host.querySelectorAll('tbody tr')).toHaveLength(3);
      expect(mounted.host.querySelector('[data-component-summary=true]')).not.toBeNull();
      expect(mounted.host.querySelector('tbody a')?.getAttribute('href')).toBe('https://example.com/market/source');
      expect(mounted.workspace.getSnapshot().artifacts[0].containerSpec.rows).toHaveLength(8);
      await mounted.click('[data-research-container-expand]');
      expect(mounted.host.querySelectorAll('thead th')).toHaveLength(4);
      expect(mounted.host.querySelectorAll('tbody tr')).toHaveLength(8);
      expect(mounted.host.querySelector('[data-component-summary=true]')).toBeNull();
    } finally {await mounted.cleanup()}
  });
  it('shows actual generation steps, starts with a collapsed process and exposes stopping', async () => {
    const mounted=await mountContainer({containerSpec:undefined,generationStatus:'running',generationTaskId:'running',width:656,height:456,sizeMode:'auto'});
    try {
      expect(mounted.host.querySelector('[data-research-generation-process]')?.getAttribute('aria-busy')).toBe('true');
      expect(mounted.host.querySelector('[data-research-generation-toggle]')?.getAttribute('aria-expanded')).toBe('false');
      expect(mounted.host.querySelector('.odyssey-generation-skeleton')).not.toBeNull();
      await mounted.click('[data-research-generation-toggle]');
      expect(mounted.host.querySelector('.odyssey-generation-skeleton')).toBeNull();
      expect(mounted.host.querySelector('.odyssey-generation-records')).not.toBeNull();
    } finally {await mounted.cleanup()}
  });
});

describe('Figma packaged canvas placement and late styles', () => {
  it.each([
    ['展示比特币当前价格核心指标', 'small', 320, 220],
    ['制作一张近期走势短表格', 'medium', 656, 220],
    ['制作比特币综合概览看板', 'large', 656, 456]
  ])('selects the initial content size before starting: %s', async (prompt, size, width, height) => {
    const mounted = await mountContainer({ sizeMode: 'manual', width: 656, height: 456 })
    try {
      let created: any
      await act(async () => {
        mounted.workspace.setCanvasSize({ width: 1288, height: 798, availableWidth: 928 })
        mounted.workspace.setArtifacts([])
        created = mounted.workspace.createContainerDraft()
        mounted.workspace.beginContainerGeneration(created.id, prompt)
      })
      const node = mounted.workspace.getSnapshot().artifacts[0]
      expect(node).toMatchObject({ generationStatus: 'queued', containerSizePreset: size, width, height })
      expect(node.x - node.width / 2).toBeGreaterThanOrEqual(32)
      expect(node.x + node.width / 2).toBeLessThanOrEqual(896)
      expect(node.y + node.height / 2).toBeLessThanOrEqual(678)
    } finally { await mounted.cleanup() }
  })

  it('keeps automatic growth above the toolbar and leaves manually sized creation unchanged', async () => {
    const mounted = await mountContainer({ sizeMode: 'auto', width: 656, height: 220 })
    try {
      await act(async () => {
        mounted.workspace.setCanvasSize({ width: 1288, height: 798, availableWidth: 928 })
        mounted.workspace.setArtifacts([{ ...mounted.workspace.getSnapshot().artifacts[0], x: 700, y: 650 }])
        mounted.workspace.updateNodeGeometry('html', { width: 656, height: 456, sizeMode: 'auto' })
      })
      const grown = mounted.workspace.getSnapshot().artifacts[0]
      expect(grown.x + grown.width / 2).toBeLessThanOrEqual(896)
      expect(grown.y + grown.height / 2).toBeLessThanOrEqual(678)
      await act(async () => {
        mounted.workspace.updateNodeGeometry('html', { x: 1000, y: 1100, width: 700, height: 500, sizeMode: 'manual' })
        mounted.workspace.beginContainerGeneration('html', '制作复杂市场综合看板')
      })
      expect(mounted.workspace.getSnapshot().artifacts[0]).toMatchObject({ x: 1000, y: 1100, width: 700, height: 500, sizeMode: 'manual' })
    } finally { await mounted.cleanup() }
  })

  it('retains the final style after compact chrome and the module stylesheet load lazily', async () => {
    const mounted = await mountContainer({ sizeMode: 'manual', width: 656, height: 456 })
    try {
      const doc = mounted.browserWindow.document
      const finalStyle = doc.querySelector('style[data-sherlock-figma-canvas]')!
      for (const attribute of ['data-research-compact-style', 'data-plugin-css']) {
        const legacy = doc.createElement('style')
        legacy.setAttribute(attribute, attribute === 'data-plugin-css' ? '@deepseek-ai/dsh-client-ui-conversation/ResearchCanvas.module.css' : '')
        legacy.textContent = '.rScV5Q_globalToolbar{height:38px}'
        doc.head.append(legacy)
        await new Promise(resolve => setTimeout(resolve, 20))
        expect(doc.head.lastElementChild).toBe(finalStyle)
      }
      expect(finalStyle.textContent).toContain('box-sizing:border-box;width:272px;height:48px')
    } finally { await mounted.cleanup() }
  })
})


describe('Figma derived summary sizing', () => {
  it('caps a previously oversized automatic summary at L while retaining its complete source', async () => {
    const excerpt = '市场概览。\n\n' + '保留完整的生成内容与所有来源。'.repeat(60)
    const mounted = await mountContainer({ kind: 'generated-summary', sourceNodeIds: ['source'], generationSources: [{ id: 'source', type: 'artifact', title: '来源', text: '原始资料' }], containerSpec: undefined, width: 656, height: 640, sizeMode: 'auto', excerpt })
    try {
      expect(mounted.workspace.getSnapshot().artifacts[0]).toMatchObject({ width: 656, height: 456, excerpt })
      expect(mounted.host.querySelector('[data-component-summary=true]')).not.toBeNull()
      await mounted.click('[data-research-container-expand]')
      expect(mounted.host.querySelector('[data-research-derived-summary]')?.textContent).toContain(excerpt)
    } finally { await mounted.cleanup() }
  })

  it('keeps manual derived dimensions when their content needs a reading summary', async () => {
    const mounted = await mountContainer({ kind: 'generated-summary', sourceNodeIds: ['source'], generationSources: [{ id: 'source', type: 'artifact', title: '来源', text: '原始资料' }], containerSpec: undefined, width: 320, height: 220, sizeMode: 'manual', excerpt: '概览。'.repeat(160) })
    try {
      expect(mounted.workspace.getSnapshot().artifacts[0]).toMatchObject({ width: 320, height: 220, sizeMode: 'manual' })
      expect(mounted.host.querySelector('[data-component-summary=true]')).not.toBeNull()
    } finally { await mounted.cleanup() }
  })
})
