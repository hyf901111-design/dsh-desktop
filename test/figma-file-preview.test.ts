import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext, Script } from 'node:vm'
import { Window } from 'happy-dom'
import { describe, expect, it, vi } from 'vitest'
import { patchFigmaFilePreview } from '../scripts/lib/figma-file-preview-client.mjs'

const requireModule = createRequire(import.meta.url)
const React = requireModule('react')
const { act, createElement } = React
const { createRoot } = requireModule('react-dom/client')
const source = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const fixtureFile = (kind: string) => ({ id: kind, name: `完整资料.${kind}`, source: 'computer', authorizationId: 'original-authorization', contentType: kind === 'txt' ? 'text/plain' : kind === 'md' ? 'text/markdown' : kind === 'pdf' ? 'application/pdf' : kind === 'html' ? 'text/html' : kind === 'png' ? 'image/png' : 'application/octet-stream', x: 240, y: 200 })
function fallback(): any { let value: any; value = new Proxy(function () {}, { get: () => value, apply: () => value, construct: () => ({}) }); return value }

async function mount(node: any, options: any = {}) {
  const window = new Window({ url: 'https://preview.local/' })
  const keys = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT']
  const old = keys.map(key => Object.getOwnPropertyDescriptor(globalThis, key))
  ;[window, window.document, window.navigator, true].forEach((value, index) => Object.defineProperty(globalThis, keys[index]!, { configurable: true, value }))
  let descriptor: any
  const restore = options.restore ?? vi.fn(async () => ({ url: 'https://preview.local/authorized-document', authorizationId: 'original-authorization', capabilityToken: 'original-capability' }))
  const release = vi.fn()
  const authorize = options.authorize ?? vi.fn(async () => ({ url: node.url ?? node.containerSpec?.url, frameName: `sherlock-research-link-${'a'.repeat(32)}` }))
  Object.assign(window, { __ModuleLoader__: { load(value: any) { descriptor = value } }, dshDesktop: { researchPreview: { restore, release }, researchLinkFrame: { authorize, release, inspect: async () => ({ scrollWidth: 1800, clientWidth: 320 }) } }, fetch: async () => ({ ok: true, headers: { get: () => null }, arrayBuffer: async () => new TextEncoder().encode('原始完整正文\n第二段详细资料').buffer }) })
  runInNewContext(patchFigmaFilePreview(source), {
    window, document: window.document, localStorage: window.localStorage, navigator: window.navigator,
    HTMLElement: window.HTMLElement, ResizeObserver: window.ResizeObserver, MutationObserver: window.MutationObserver,
    requestAnimationFrame: window.requestAnimationFrame.bind(window), cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
    AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout, URL
  })
  const client = descriptor.factory((id: string) => id === 'react' ? React : id === 'react/jsx-runtime' ? requireModule('react/jsx-runtime') : id === 'react-dom' ? requireModule('react-dom') : id === '@deepseek-ai/dsh-client-ui-primitives' ? { MarkdownText: ({ text }: any) => createElement('div', null, text) } : fallback())
  let officeMounts = 0
  function OfficeReader({ sourceUrl, kind }: any) { React.useEffect(() => { officeMounts++ }, []); return createElement('section', { 'data-native-office': kind, 'data-url': sourceUrl }, createElement('input', { defaultValue: '阅读器内状态' })) }
  const host = window.document.createElement('div'); window.document.body.append(host)
  const root = createRoot(host)
  const props = { node, sessionId: 'file-qa', visible: true, officePreview: { supports: () => true, Component: OfficeReader }, onFrameAction: vi.fn(), ...options.props }
  await act(async () => { root.render(createElement(node.kind ? client.ResearchCanvasArtifactCard : client.ResearchCanvasFileCard, props)) })
  const toggle = async () => { await act(async () => { host.querySelector('[data-research-container-expand]')?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })) }) }
  const settle = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) }) }
  return { window, host, client, restore, release, authorize, toggle, settle, update: async (next: any) => { props.node = next; await act(async () => root.render(createElement(next.kind ? client.ResearchCanvasArtifactCard : client.ResearchCanvasFileCard, props))) }, officeMounts: () => officeMounts, async cleanup() { await act(async () => root.unmount()); await window.happyDOM.close(); keys.forEach((key, index) => old[index] ? Object.defineProperty(globalThis, key, old[index]!) : delete (globalThis as any)[key]) } }
}

describe('Figma file entries and complete readers', () => {
  it('uses S for new non-image files and keeps historical manual geometry', async () => {
    const mounted = await mount(fixtureFile('pdf'))
    try {
      for (const kind of ['pdf', 'docx', 'xlsx', 'pptx', 'html', 'md', 'txt', 'unknown']) {
        expect(mounted.client.normalizeResearchCanvasNodeGeometry(fixtureFile(kind))).toMatchObject({ width: 320, height: 220 })
        expect(mounted.client.normalizeResearchCanvasNodeGeometry({ ...fixtureFile(kind), width: 530, height: 317, sizeMode: 'manual' })).toMatchObject({ width: 530, height: 317, sizeMode: 'manual' })
      }
      expect(mounted.client.normalizeResearchCanvasNodeGeometry(fixtureFile('png'))).toMatchObject({ width: 320, height: 306, aspectRatio: 4 / 3 })
      const pdf = { ...fixtureFile('pdf'), width: 320, height: 220, aspectRatio: 0.75 }
      const restored = mounted.client.parseResearchCanvasFileNodes(JSON.stringify([pdf]))[0]
      expect(restored).toMatchObject({ width: 320, height: 220, aspectRatio: 0.75 })
      expect(mounted.client.researchPdfGeometryForPage(restored, 600, 800)).toBeNull()
      expect(mounted.client.resizeResearchCanvasNode(restored, 'se', { x: 40, y: 10 }, 1)).toMatchObject({ width: 360, height: 230, aspectRatio: 0.75 })
    } finally { await mounted.cleanup() }
  })

  it.each(['pdf', 'docx', 'xlsx', 'pptx', 'html', 'md', 'txt'])('does not authorize or render %s readers before explicit reading', async kind => {
    const mounted = await mount(fixtureFile(kind))
    try {
      expect(mounted.host.querySelector('[data-research-file-entry]')).not.toBeNull()
      expect(mounted.host.querySelector('iframe,[data-native-office],[data-research-pdf-scroll],[data-research-text-preview],[data-research-markdown-preview]')).toBeNull()
      expect(mounted.restore).not.toHaveBeenCalled()
      expect(mounted.host.textContent).not.toContain('正在载入')
      expect(mounted.host.querySelector('[data-research-file-entry]')?.textContent).not.toContain('完整资料')
    } finally { await mounted.cleanup() }
  })

  it.each(['docx', 'xlsx', 'pptx'])('restores the same %s reader and authorization after closing', async kind => {
    const mounted = await mount(fixtureFile(kind))
    try {
      await mounted.toggle(); await mounted.settle()
      const reader = mounted.host.querySelector('[data-native-office]')!
      expect(reader.getAttribute('data-url')).toBe('https://preview.local/authorized-document')
      const input = reader.querySelector('input')!; input.value = '保留的阅读器状态'
      await mounted.toggle(); await mounted.toggle(); await mounted.settle()
      expect(mounted.host.querySelector('[data-native-office]')).toBe(reader)
      expect(mounted.host.querySelector('input')?.value).toBe('保留的阅读器状态')
      expect(mounted.restore).toHaveBeenCalledTimes(1)
      expect(mounted.officeMounts()).toBe(1)
    } finally { await mounted.cleanup() }
  })

  it('keeps the authorized HTML iframe mounted across reading and does not intercept images', async () => {
    const mounted = await mount(fixtureFile('html'))
    try {
      await mounted.toggle(); await mounted.settle()
      const frame = mounted.host.querySelector('[data-research-html-preview]')!
      expect(frame.getAttribute('src')).toBe('https://preview.local/authorized-document')
      await mounted.toggle(); await mounted.toggle()
      expect(mounted.host.querySelector('[data-research-html-preview]')).toBe(frame)
      expect(mounted.restore).toHaveBeenCalledWith({ sessionId: 'file-qa', nodeId: 'html', authorizationId: 'original-authorization' })
      expect(mounted.restore).toHaveBeenCalledTimes(1)
    } finally { await mounted.cleanup() }
    const image = await mount(fixtureFile('png'))
    try { expect(image.host.querySelector('[data-research-file-entry]')).toBeNull(); expect(image.restore).toHaveBeenCalledTimes(1) } finally { await image.cleanup() }
  })

  it.each(['data-command-pressed', 'data-space-pressed', 'data-dragging'])('lets expanded readers receive pointers while canvas %s is retained', async attribute => {
    const mounted = await mount(fixtureFile('html'))
    try {
      mounted.host.classList.add('rScV5Q_root'); mounted.host.setAttribute(attribute, 'true')
      const shield = mounted.host.querySelector('[data-research-preview-shield]')!
      expect(mounted.window.getComputedStyle(shield).pointerEvents).toBe('auto')
      await mounted.toggle(); await mounted.settle()
      expect(mounted.window.getComputedStyle(shield).display).toBe('none')
      expect(mounted.window.getComputedStyle(shield).pointerEvents).toBe('none')
      const reader = mounted.host.querySelector('[data-research-original-reader]')!
      expect(reader.hasAttribute('inert')).toBe(false)
      await mounted.toggle()
      expect(mounted.window.getComputedStyle(shield).display).not.toBe('none')
      expect(mounted.window.getComputedStyle(shield).pointerEvents).toBe('auto')
    } finally { await mounted.cleanup() }
  })

  it('also releases the shared shield for an expanded generated summary', async () => {
    const node = { id: 'summary-reader', kind: 'generated-container', messageId: 'summary-reader', title: '总结提炼', x: 350, y: 220, width: 656, height: 456, generationStatus: 'completed', refreshMinutes: 0, containerSpec: { version: 1, type: 'markdown', title: '总结提炼', content: '原始完整总结正文' } }
    const mounted = await mount(node)
    try {
      mounted.host.classList.add('rScV5Q_root'); mounted.host.setAttribute('data-command-pressed', 'true')
      expect(mounted.host.querySelector('[data-research-file-presentation]')).toBeNull()
      const shield = mounted.host.querySelector('[data-research-preview-shield]')!
      expect(mounted.window.getComputedStyle(shield).pointerEvents).toBe('auto')
      await mounted.toggle(); await mounted.settle()
      expect(mounted.host.querySelector('dialog')?.open).toBe(true)
      expect(mounted.host.textContent).toContain('原始完整总结正文')
      expect(mounted.window.getComputedStyle(shield).display).toBe('none')
      expect(mounted.window.getComputedStyle(shield).pointerEvents).toBe('none')
      await mounted.toggle()
      expect(mounted.window.getComputedStyle(shield).display).not.toBe('none')
      expect(mounted.window.getComputedStyle(shield).pointerEvents).toBe('auto')
    } finally { await mounted.cleanup() }
  })

  it('shows original loading and unavailable states only after opening', async () => {
    let finish!: (value: null) => void
    const restore = vi.fn(() => new Promise(resolve => { finish = resolve }))
    const mounted = await mount(fixtureFile('pdf'), { restore })
    try {
      expect(restore).not.toHaveBeenCalled()
      await mounted.toggle()
      expect(mounted.host.querySelector('[data-research-preview-loading]')?.textContent).toBe('正在载入 PDF…')
      await act(async () => finish(null)); await mounted.settle()
      expect(mounted.host.querySelector('[data-research-pdf-error]')?.textContent).toBe('PDF 预览不可用')
      await mounted.toggle(); await mounted.settle()
      expect(mounted.host.querySelector('[data-research-file-entry]')?.textContent).toContain('PDF 预览不可用')
    } finally { await mounted.cleanup() }
  })

  it.each(['web-link', 'generated-container'])('shows source instead of a closed %s iframe and retains unscaled reading', async kind => {
    const url = 'https://example.com/source'
    const node = { id: kind, kind, messageId: kind, title: '原始网页', excerpt: '已有的真实来源摘要', url, x: 350, y: 200, width: 656, height: 220, generationStatus: 'completed', refreshMinutes: 0, containerSpec: { version: 1, type: 'web', title: '原始网页', url } }
    const mounted = await mount(node)
    try {
      expect(mounted.host.querySelector('iframe')).toBeNull()
      expect(mounted.authorize).not.toHaveBeenCalled()
      expect(mounted.host.querySelector('[data-research-file-entry]')?.textContent).toContain(url)
      await mounted.toggle(); await mounted.settle()
      const frame = mounted.host.querySelector('[data-research-web-frame]')!
      expect(frame.getAttribute('src')).toBe(url)
      expect(frame.getAttribute('style') ?? '').not.toContain('scale(')
      await mounted.toggle(); await mounted.toggle()
      expect(mounted.host.querySelector('[data-research-web-frame]')).toBe(frame)
      expect(mounted.authorize).toHaveBeenCalledTimes(1)
    } finally { await mounted.cleanup() }
  })

  it.each(['cancel', 'submit'])('keeps generated-web editing visible and preserves the original %s action', async action => {
    const node = { id: 'editable-web', kind: 'generated-container', messageId: 'editable-web', title: '网页概览', excerpt: '已有摘要', x: 350, y: 220, width: 656, height: 456, generationStatus: 'completed', refreshMinutes: 0, containerPrompt: '原始需求', containerSpec: { version: 1, type: 'web', title: '网页概览', url: 'https://example.com/source' } }
    const submit = vi.fn(), mounted = await mount(node, { props: { onSubmitContainer: submit } })
    const click = async (selector: string) => { await act(async () => mounted.host.querySelector(selector)?.dispatchEvent(new mounted.window.MouseEvent('click', { bubbles: true }))) }
    try {
      expect(mounted.authorize).not.toHaveBeenCalled()
      await click('[data-research-container-more]'); await click('[data-research-container-edit]'); await mounted.settle()
      expect(mounted.host.querySelector('dialog')?.open).toBe(true)
      const prompt = mounted.host.querySelector('[data-research-container-prompt]') as any
      expect(prompt.value).toBe('原始需求'); expect(prompt.closest('[hidden]')).toBeNull()
      const frame = mounted.host.querySelector('[data-research-web-frame]')
      if (action === 'submit') {
        await act(async () => { prompt.value = '更新后的需求'; prompt.dispatchEvent(new mounted.window.Event('input', { bubbles: true })) })
        await click('[data-research-container-submit]')
        expect(submit).toHaveBeenCalledExactlyOnceWith(node, '更新后的需求')
      } else {
        await click('[data-research-container-cancel]'); expect(submit).not.toHaveBeenCalled()
      }
      expect(mounted.host.querySelector('[data-research-container-prompt]')).toBeNull()
      expect(mounted.host.querySelector('[data-research-web-frame]')).toBe(frame)
    } finally { await mounted.cleanup() }
  })

  it('keeps the existing generated-web refresh controller active before first reading and after closing', async () => {
    const node = { id: 'scheduled-web', kind: 'generated-container', messageId: 'scheduled-web', title: '自动刷新网页', excerpt: '已有摘要', x: 350, y: 220, width: 656, height: 456, generationStatus: 'completed', refreshMinutes: 1, lastSuccessfulAt: Date.now() - 120000, containerPrompt: '原始需求', containerSpec: { version: 1, type: 'web', title: '自动刷新网页', url: 'https://example.com/source' } }
    const submit = vi.fn(), mounted = await mount(node, { props: { onSubmitContainer: submit } })
    try {
      expect(mounted.authorize).not.toHaveBeenCalled(); expect(submit).toHaveBeenCalledExactlyOnceWith(node, '原始需求')
      await mounted.toggle(); await mounted.settle(); await mounted.toggle(); await mounted.settle()
      await mounted.update({ ...node, lastSuccessfulAt: node.lastSuccessfulAt + 1 })
      expect(submit).toHaveBeenCalledTimes(2)
      expect(mounted.host.querySelector('.rScV5Q_generatedContainer')?.closest('[inert]')).toBeNull()
    } finally { await mounted.cleanup() }
  })

  it.each([{ generationStatus: 'running', expected: '正在刷新，当前内容继续可用' }, { generationStatus: 'completed', refreshError: '真实刷新失败', expected: '真实刷新失败' }])('keeps generated-web status visible in its closed entry: $generationStatus', async state => {
    const node = { id: 'status-web', kind: 'generated-container', messageId: 'status-web', title: '网页概览', excerpt: '已有摘要', x: 350, y: 220, width: 656, height: 456, refreshMinutes: 0, ...state, containerSpec: { version: 1, type: 'web', title: '网页概览', url: 'https://example.com/source' } }
    const mounted = await mount(node)
    try {
      const notice = mounted.host.querySelector('.rScV5Q_containerNotice')!
      expect(notice.textContent).toBe(state.expected)
      expect(mounted.host.querySelector('[data-research-file-entry]')?.textContent).toContain(state.expected)
      expect(mounted.authorize).not.toHaveBeenCalled()
    } finally { await mounted.cleanup() }
  })

  it('installs once and refuses malformed marker boundaries', () => {
    const installed = patchFigmaFilePreview(source)
    expect(patchFigmaFilePreview(installed)).toBe(installed)
    expect(() => new Script(installed)).not.toThrow()
    expect(() => patchFigmaFilePreview(installed.replace('/* ODYSSEY_FILE_PREVIEW_END */', ''))).toThrow('marker')
  })
})
