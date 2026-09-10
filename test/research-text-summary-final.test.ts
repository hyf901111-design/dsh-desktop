import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window, type HTMLElement } from 'happy-dom'
import { describe, it, expect } from 'vitest'
import { patchFigmaFinalCanvas } from '../scripts/lib/figma-canvas-client.mjs'

const requireModule = createRequire(import.meta.url)
const React = requireModule('react')
const { createRoot } = requireModule('react-dom/client')
const { act } = React
const source = patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
const originalText = '# 完整原文标题\n\n' + '每一段来源、日期 2026-09-10 和研究结论均需要保留。\n\n'.repeat(90) + '最后一段证据不可丢失 END_OF_SOURCE'

async function fixture(kind: string, sizeMode = 'auto') {
  const browser = new Window({ url: 'https://sherlock.local/' })
  const resizeCallbacks = new Set<() => void>()
  Object.defineProperty(browser, 'ResizeObserver', { value: class { constructor(private callback: () => void) {} observe() { resizeCallbacks.add(this.callback) } disconnect() { resizeCallbacks.delete(this.callback) } unobserve() {} } })
  const saved = new Map(['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, value })
  // happy-dom has no layout; content truncation and dialog transitions use the production
  // renderer here. Real pixel overflow is checked separately with Chromium.
  let descriptor: any, shared = false
  Object.assign(browser, { dshDesktop: { researchBoards: { isSharedSession: () => shared } }, __ModuleLoader__: { load(value: any) { descriptor = value } } })
  runInNewContext(source, { window: browser, document: browser.document, localStorage: browser.localStorage, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Text: browser.Text, ResizeObserver: browser.ResizeObserver, requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), URL, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout })
  const fallback: any = new Proxy(function () {}, { get: () => fallback, apply: () => fallback, construct: () => ({}) })
  const primitives = new Proxy({ MarkdownText: ({ text }: any) => React.createElement('div', { 'data-test-markdown': '' }, text) }, { get: (target, key) => Reflect.get(target, key) ?? fallback })
  const client = descriptor.factory((id: string) => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : ['react', 'react/jsx-runtime', 'react-dom'].includes(id) ? requireModule(id) : fallback)
  browser.localStorage.setItem('sherlock.research.canvas.artifacts.v1:text-final', JSON.stringify([{ id: 'text', kind, title: '正文卡片', messageId: 'origin-message', excerpt: originalText, x: 400, y: 300, width: 320, height: 220, sizeMode }]))
  const workspace = new client.ResearchWorkspaceRegistry(browser.localStorage).for('text-final')
  workspace.setCanvasSize({ width: 1200, height: 800 })
  const host = browser.document.createElement('div'); browser.document.body.append(host)
  const root = createRoot(host)
  function Harness() {
    const snapshot = React.useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
    const [editing, setEditing] = React.useState(false)
    const node = snapshot.artifacts[0]
    return React.createElement(client.ResearchCanvasArtifactCard, {
      node, sessionId: 'text-final', editingContent: editing,
      onContentEdit: () => setEditing(true), onContentCancel: () => setEditing(false),
      onContentCommit: (text: string) => { workspace.updateArtifactContent(node.id, text); setEditing(false) },
      onExpandGeneration: () => workspace.updateNodeGeometry(node.id, { width: 656, height: 456, sizeMode: 'auto' }),
      onAutoHeight: (_node: any, height: number) => workspace.updateNodeGeometry(node.id, { height, sizeMode: 'auto' })
    })
  }
  await act(async () => root.render(React.createElement(Harness)))
  return { browser, host, workspace, measure() { for (const callback of [...resizeCallbacks]) callback() }, setReadOnly() { shared = true; workspace.setCollaborationAccess(false) },
    async cleanup() { await act(async () => root.unmount()); for (const [key, value] of saved) if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as any)[key]; await browser.happyDOM.close() } }
}

for (const kind of ['pasted-text', 'assistant-result']) describe(`Final ${kind} semantic summary`, () => {
  it('upgrades automatic geometry to L, summarizes the closed card, and reads the full original including its heading', async () => {
    const f = await fixture(kind)
    try {
      expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({ width: 656, height: 456, sizeMode: 'auto', excerpt: originalText, messageId: 'origin-message' })
      expect(f.host.querySelector('[data-component-summary=true]')).not.toBeNull()
      expect(f.host.textContent).not.toContain('END_OF_SOURCE')
      const dialog = f.host.querySelector('dialog')!
      await act(async () => f.host.querySelector('[data-research-container-expand]')!.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
      expect(dialog.hasAttribute('open')).toBe(true)
      expect(f.host.querySelector('[data-component-expanded=true]')).not.toBeNull()
      expect(f.host.querySelector('[data-test-markdown]')!.textContent).toBe(originalText)
      await act(async () => f.host.querySelector('[data-research-container-expand]')!.dispatchEvent(new f.browser.MouseEvent('click', { bubbles: true })))
      expect(dialog.hasAttribute('open')).toBe(false)
      expect(f.host.textContent).not.toContain('END_OF_SOURCE')
      expect(f.workspace.getSnapshot().artifacts[0].excerpt).toBe(originalText)
    } finally { await f.cleanup() }
  })

  it('preserves manual geometry and double-click editing save, cancel, and permission enforcement', async () => {
    const f = await fixture(kind, 'manual')
    const edit = async () => {
      await act(async () => f.host.querySelector('[data-research-artifact-content]')!.dispatchEvent(new f.browser.MouseEvent('dblclick', { bubbles: true, cancelable: true })))
      return f.host.querySelector('textarea')!
    }
    try {
      const first = await edit(); expect(first.value).toBe(originalText); first.value = '取消这次更改'
      await act(async () => first.dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
      expect(f.host.querySelector('textarea')).toBeNull()
      expect(f.workspace.getSnapshot().artifacts[0].excerpt).toBe(originalText)
      const second = await edit(); second.value = '# 修订标题\n\n保存完整文本，包括最后一段。'
      await act(async () => second.dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true })))
      expect(f.host.querySelector('textarea')).toBeNull()
      expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({ width: 320, height: 220, sizeMode: 'manual', excerpt: second.value })
      f.setReadOnly()
      const frozen = JSON.stringify(f.workspace.getSnapshot().artifacts)
      const third = await edit(); third.value = '只读修改不得发布'
      await act(async () => third.dispatchEvent(new f.browser.KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true })))
      expect(JSON.stringify(f.workspace.getSnapshot().artifacts)).toBe(frozen)
    } finally { await f.cleanup() }
  })
})

it('keeps the summary patch idempotent', () => expect(patchFigmaFinalCanvas(source) === source).toBe(true))

it('measures the primary text region separately from the summary footer', async () => {
  const f = await fixture('assistant-result', 'manual')
  try {
    const content = f.host.querySelector('.odyssey-component-content')!
    const primary = f.host.querySelector('.odyssey-component-primary') as HTMLElement
    Object.defineProperties(content, { clientHeight: { get: () => 140 }, scrollHeight: { get: () => 140 } })
    Object.defineProperties(primary, { clientHeight: { get: () => 110 }, scrollHeight: { get: () => primary.textContent!.length > 45 ? 124 : 110 } })
    const originalLength = primary.textContent!.length
    await act(async () => f.measure())
    expect(primary.textContent!.length).toBeLessThan(originalLength)
    expect(primary.scrollHeight).toBe(primary.clientHeight)
    expect(f.workspace.getSnapshot().artifacts[0].excerpt).toBe(originalText)
  } finally { await f.cleanup() }
})
