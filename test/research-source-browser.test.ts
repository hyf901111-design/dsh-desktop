import { afterEach, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window } from 'happy-dom'

const native = vi.hoisted(() => ({ views: [] as any[], external: vi.fn() }))
vi.mock('electron', () => ({
  shell: { openExternal: native.external },
  BrowserWindow: vi.fn(), webContents: {},
  session: { fromPartition: () => ({ on: vi.fn(), setPermissionRequestHandler: vi.fn(), setPermissionCheckHandler: vi.fn() }) },
  WebContentsView: class {
    setVisible = vi.fn(); setBounds = vi.fn()
    webContents = {
      url: '', isDestroyed: () => false, getURL: () => this.webContents.url, getTitle: () => '来源文章',
      loadURL: vi.fn(async (url: string) => { this.webContents.url = url }),
      setAudioMuted: vi.fn(), setWindowOpenHandler: vi.fn(), on: vi.fn(), close: vi.fn()
    }
    constructor() { native.views.push(this) }
  }
}))
import { registerConversationBrowser } from '../src/main/search/conversation-browser'

const require = createRequire(import.meta.url), React = require('react'), { act } = React
// These patchers serialize functions; load the production Node implementation
// without Vitest rewriting its imported function references.
const { patchConversationBrowser } = require('../scripts/lib/conversation-browser-client.mjs')
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { while (cleanups.length) await cleanups.pop()!(); vi.clearAllMocks(); native.views.length = 0 })

async function fixture() {
  const win = new Window({ url: 'https://ework.local' }), document = win.document
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const original = keys.map(k => Object.getOwnPropertyDescriptor(globalThis, k))
  keys.forEach((k, i) => Object.defineProperty(globalThis, k, { configurable: true, value: [win, document, win.navigator, true][i] }))
  const openSource = vi.fn(async () => ({ status: 'opened' })); (win as any).dshDesktop = { conversationBrowser: { openSource } }
  win.open = vi.fn() as any
  let descriptor: any
  ;(win as any).__ModuleLoader__ = { load: (value: any) => { descriptor = value } }
  win.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any
  const source = patchConversationBrowser(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
  runInNewContext(source, { window: win, document, localStorage: win.localStorage, navigator: win.navigator, CSS: win.CSS, DOMParser: win.DOMParser, HTMLElement: win.HTMLElement, HTMLTextAreaElement: win.HTMLTextAreaElement, Text: win.Text, CustomEvent: win.CustomEvent, Event: win.Event, ResizeObserver: win.ResizeObserver, MutationObserver: win.MutationObserver, requestAnimationFrame: win.requestAnimationFrame.bind(win), cancelAnimationFrame: win.cancelAnimationFrame.bind(win), structuredClone, AbortController, TextDecoder, TextEncoder, setTimeout, clearTimeout, setInterval, clearInterval, console })
  const fake: any = new Proxy(function () {}, { get: () => fake, apply: () => fake, construct: () => ({}) })
  const bundle = descriptor.factory((id: string) => id === 'react' ? React : ['react/jsx-runtime', 'react-dom'].includes(id) ? require(id) : id === '@deepseek-ai/dsh-client-ui-primitives' ? new Proxy({ MarkdownText: ({ text }: any) => React.createElement('div', null, text) }, { get: (t: any, k) => t[k] || (String(k).startsWith('Icon') ? () => null : fake) }) : fake)
  const registry = new bundle.ResearchWorkspaceRegistry(win.localStorage), host = document.createElement('div')
  document.body.append(host)
  const root = require('react-dom/client').createRoot(host)
  const render = async (sessionId = 'source-session', news = true) => {
    const html = `${news ? '<body data-research-kind="news">' : '<body>'}<h2><a href="https://example.org/news?original=1&amp;lang=zh">原始新闻标题</a></h2></body>`
    const workspace = registry.for(sessionId)
    await act(async () => {
      workspace.setArtifacts([{ id: 'source-news', kind: 'generated-container', messageId: 'source-news', title: '新闻', excerpt: '新闻', x: 400, y: 300, width: 720, height: 600, sizeMode: 'manual', generationStatus: 'completed', generationLastSeq: 1, containerPrompt: '新闻', refreshMinutes: 0, containerSpec: { version: 1, type: 'html', title: '新闻', html } }])
      root.render(React.createElement(bundle.ResearchCanvas, { sessionId, t: (v: string) => v, researchWorkspaces: registry, selectionGeneration: { disabled: false, generate: vi.fn() }, actions: { setResearchRightTab: vi.fn() } }))
    })
    const frame = host.querySelector('[data-research-html-artifact]')!, ownWindow = { postMessage: vi.fn() }
    Object.defineProperty(frame, 'contentWindow', { configurable: true, value: ownWindow })
    return { frame, ownWindow }
  }
  const send = async (url: string, source: any, extra = {}) => act(async () => { win.dispatchEvent(new win.MessageEvent('message', { source, data: { type: 'sherlock-source-request', url, ...extra } })) })
  cleanups.push(async () => { await act(async () => root.unmount()); await win.happyDOM.abort(); keys.forEach((k, i) => original[i] ? Object.defineProperty(globalThis, k, original[i]!) : delete (globalThis as any)[k]) })
  return { source, win, host, openSource, render, send }
}

it('opens a verified news source once for its rendered session without an extra toast or an external browser', async () => {
  const f = await fixture(), { ownWindow } = await f.render()
  await f.send('https://example.org/news?original=1&lang=zh', ownWindow)
  expect(f.openSource).toHaveBeenCalledExactlyOnceWith({ sessionId: 'source-session', url: 'https://example.org/news?original=1&lang=zh' })
  expect(f.host.textContent).not.toContain('打开来源：')
  expect(f.win.open).not.toHaveBeenCalled()
  expect(patchConversationBrowser(f.source)).toBe(f.source)
})

it('keeps ordinary source links on their existing host confirmation path', async () => {
  const f = await fixture(), { ownWindow } = await f.render('source-session', false)
  await f.send('https://example.org/news?original=1&lang=zh', ownWindow)
  expect(f.openSource).not.toHaveBeenCalled()
  expect(f.host.textContent).toContain('打开来源：原始新闻标题')
})

it('rejects undeclared URLs, foreign frames, forged session fields and a frame from an earlier conversation', async () => {
  const f = await fixture(), first = await f.render()
  const url = 'https://example.org/news?original=1&lang=zh'
  await f.send('https://attacker.invalid', first.ownWindow)
  await f.send('javascript:alert(1)', first.ownWindow)
  await f.send(url, f.win)
  await f.send(url, first.ownWindow, { sessionId: 'attacker-session' })
  expect(f.openSource).not.toHaveBeenCalled()
  const next = await f.render('next-session')
  await f.send(url, first.ownWindow)
  expect(f.openSource).not.toHaveBeenCalled()
  await f.send(url, next.ownWindow)
  expect(f.openSource).toHaveBeenCalledExactlyOnceWith({ sessionId: 'next-session', url })
})

it('reports browser failure locally without falling back to an external link', async () => {
  const f = await fixture(), { ownWindow } = await f.render()
  f.openSource.mockRejectedValueOnce(Error('navigation failed'))
  await f.send('https://example.org/news?original=1&lang=zh', ownWindow)
  expect(f.host.querySelector('[data-research-source-error]')?.textContent).toContain('打开失败')
  expect(f.host.textContent).not.toContain('打开来源：')
  expect(f.win.open).not.toHaveBeenCalled()
})

it('navigates a trusted source request into the existing right-side conversation browser and rejects unsafe IPC callers', async () => {
  const handlers = new Map<string, Function>(), frame = { processId: 1, routingId: 2 }
  const sent: any[] = [], main = { isDestroyed: () => false, once: vi.fn(), contentView: { addChildView: vi.fn(), removeChildView: vi.fn() }, webContents: { mainFrame: frame, send: (...args: any[]) => sent.push(args) } }
  const browser = registerConversationBrowser({ ipcMain: { handle: (channel: string, fn: Function) => handlers.set(channel, fn) } as any, getMainWindow: () => main as any })
  try {
    const handler = handlers.get('conversation:browser:open-source')
    expect(handler).toBeTypeOf('function')
    const event = { sender: main.webContents, senderFrame: frame }
    expect(() => handler!({ ...event, senderFrame: { processId: 1, routingId: 3 } }, { sessionId: 'source-session', url: 'https://example.org/news' })).toThrow()
    for (const value of [{ url: 'https://example.org/news' }, { sessionId: 's', url: 'javascript:alert(1)' }, { sessionId: 's', url: 'https://user:secret@example.org' }, { sessionId: 's', url: 'http://127.0.0.1:4000' }, { sessionId: 's', url: 'https://example.org', op: 'evaluate' }])
      await expect(handler!(event, value)).rejects.toThrow()
    await handler!(event, { sessionId: 'source-session', url: 'https://example.org/news?original=1' })
    const opened = sent.filter(([channel, value]) => channel === 'conversation:browser' && value.open)
    expect(opened).toEqual([['conversation:browser', { sessionId: 'source-session', url: 'https://example.org/news?original=1', title: '浏览器', open: true }]])
    expect(native.views).toHaveLength(1)
    expect(native.views[0].webContents.loadURL.mock.calls).toEqual([['about:blank'], ['https://example.org/news?original=1']])
    const source = patchConversationBrowser('class ResearchSidebarCoordinator { attach(){ const unregisterGenerated=service.registerTab({}); return()=>{unregisterGenerated?.();}; }}')
    const code = source.slice(source.indexOf('const browserSessions='), source.indexOf('const unregisterGenerated='))
    let receive: any
    const service = { openTab: vi.fn(), setPanelState: vi.fn() }
    new Function('sessions', 'window', 'sherlockBoardsAdapter', 'canvasTaskStore', 'service', code)(
      { list: { getSnapshot: () => ({ byId: {} }), subscribe: () => () => {} } },
      { dshDesktop: { conversationBrowser: { subscribe: (fn: Function) => { receive = fn }, activity: async () => {} } } },
      null, () => ({ value: [], retain: () => () => {}, subscribe: () => () => {} }), service)
    receive(opened[0][1])
    expect(service.openTab).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'sherlock-conversation-browser', meta: expect.objectContaining({ sherlockPanel: 'right', url: 'https://example.org/news?original=1' }) }), { sessionId: 'source-session' })
    expect(native.external).not.toHaveBeenCalled()
  } finally { browser.dispose() }
})
