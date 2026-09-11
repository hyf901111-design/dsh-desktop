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

async function fixture(spec: any, sizeMode = 'auto', measuredOverflow: boolean | 'kpi' = false) {
  const browser = new Window({ url: 'https://sherlock.local/' })
  if (measuredOverflow) Object.defineProperties(browser.HTMLElement.prototype, {
    clientHeight: { configurable: true, get() { return this.matches('.odyssey-component-content,.odyssey-component-primary') ? 140 : 0 } },
    clientWidth: { configurable: true, get() { return this.closest('[data-component-width="narrow"]') ? 318 : 654 } },
    scrollHeight: { configurable: true, get() { return measuredOverflow !== 'kpi' && this.closest('[data-component-width="narrow"]') ? 260 : 140 } }
  })
  if (measuredOverflow === 'kpi') Object.defineProperty(browser.HTMLCanvasElement.prototype, 'getContext', { configurable:true, value:()=>({font:'',measureText:(text:string)=>({width:text.length*13})}) })
  const resizeCallbacks = new Set<() => void>()
  Object.defineProperty(browser, 'ResizeObserver', { value: class { constructor(private callback: () => void) {} observe() { resizeCallbacks.add(this.callback) } disconnect() { resizeCallbacks.delete(this.callback) } unobserve() {} } })
  const saved = new Map(['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries({ window: browser, document: browser.document, navigator: browser.navigator, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { configurable: true, value })
  // happy-dom has no layout; content truncation and dialog transitions use the production
  // renderer here. Real pixel overflow is checked separately with Chromium.
  const upgrades: any[] = []
  let descriptor: any, shared = false
  Object.assign(browser, { dshDesktop: { researchBoards: { isSharedSession: () => shared } }, __ModuleLoader__: { load(value: any) { descriptor = value } } })
  runInNewContext(source, { window: browser, document: browser.document, localStorage: browser.localStorage, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Text: browser.Text, ResizeObserver: browser.ResizeObserver, requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), URL, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout })
  const fallback: any = new Proxy(function () {}, { get: () => fallback, apply: () => fallback, construct: () => ({}) })
  const primitives = new Proxy({ MarkdownText: ({ text }: any) => React.createElement('div', { 'data-test-markdown': '' }, text) }, { get: (target, key) => Reflect.get(target, key) ?? fallback })
  const client = descriptor.factory((id: string) => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : ['react', 'react/jsx-runtime', 'react-dom'].includes(id) ? requireModule(id) : fallback)
  browser.localStorage.setItem('sherlock.research.canvas.artifacts.v1:text-final', JSON.stringify([{ id: 'text', kind: 'generated-container', containerSpec: spec, generationStatus:'completed', containerSizePreset:'small', containerPrompt:'内容适配', refreshMinutes:0, sourceNodeIds:[], title: '正文卡片', messageId: 'origin-message', excerpt: originalText, x: 400, y: 300, width: 320, height: 220, sizeMode }]))
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
      onExpandGeneration: productionUpgrade(node, { ...workspace, updateNodeGeometry: (id: string, geometry: any) => { upgrades.push({ ...geometry }); workspace.updateNodeGeometry(id, geometry) } }),
      onAutoHeight: (_node: any, height: number) => workspace.updateNodeGeometry(node.id, { height, sizeMode: 'auto' })
    })
  }
  await act(async () => root.render(React.createElement(Harness)))
  return { browser, host, workspace, upgrades, measure() { for (const callback of [...resizeCallbacks]) callback() }, setReadOnly() { shared = true; workspace.setCollaborationAccess(false) },
    async cleanup() { await act(async () => root.unmount()); for (const [key, value] of saved) if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as any)[key]; await browser.happyDOM.close() } }
}

function productionUpgrade(node: any, workspace: any) {
  const start = source.indexOf('onExpandGeneration:') + 'onExpandGeneration:'.length
  let end = source.indexOf('{', start), depth = 1
  for (end++; depth && end < source.length; end++) { if (source[end] === '{') depth++; else if (source[end] === '}') depth-- }
  return new Function('node', 'workspace', 'return ' + source.slice(start, end))(node, workspace)
}

it('upgrades a 160-character native markdown S card to M before showing a summary', async () => {
  const content = '数据'.repeat(80), spec = { version:1, type:'markdown', title:'正文卡片', content }
  const f = await fixture(spec)
  try {
    expect(f.upgrades.map(size=>[size.width,size.height])).toEqual([[656,220]])
    expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({width:656,height:220,sizeMode:'auto',containerSpec:spec})
    expect(f.host.querySelector('[data-component-summary=true]')).toBeNull()
    expect(f.host.textContent).toContain(content)
  } finally { await f.cleanup() }
})
it('recomputes the content budget at M instead of reusing S overflow measurements and unnecessarily jumping to L', async()=>{
  const f=await fixture({version:1,type:'markdown',title:'正文',content:'数据'.repeat(80)},'auto',true)
  try {
    expect(f.upgrades.map(size=>[size.width,size.height])).toEqual([[656,220]])
    expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({width:656,height:220})
    expect(f.host.querySelector('[data-component-summary=true]')).toBeNull()
  } finally {await f.cleanup()}
})
it('remeasures long KPI values after widening to M without reusing a shortened S value',async()=>{
  const value='123456789012345678901234567890',spec={version:1,type:'kpi',title:'总量',items:[{label:'总量',value}]}
  const f=await fixture(spec,'auto','kpi')
  try {
    expect(f.upgrades.map(size=>[size.width,size.height])).toEqual([[656,220]])
    expect(f.host.textContent).toContain(value)
    expect(f.host.querySelector('[data-component-summary=true]')).toBeNull()
  } finally {await f.cleanup()}
})
it('upgrades S to M to L for tall native tables, retaining every row and full source', async () => {
  const spec = {version:1,type:'table',title:'正文卡片',columns:['日期','数值','来源'],rows:Array.from({length:6},(_,i)=>['日期'+i,String(i),'来源'+i])}
  const f = await fixture(spec)
  try {
    expect(f.upgrades.map(size=>[size.width,size.height])).toEqual([[656,220],[656,456]])
    expect(f.host.querySelector('[data-component-summary=true]')).toBeNull()
    expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
  } finally { await f.cleanup() }
})
it('summarizes only after reaching L, then opens the full native markdown in the existing reader', async () => {
  const content='保留数据。'.repeat(300)+'END_OF_FULL_SOURCE',spec={version:1,type:'markdown',title:'正文卡片',content}
  const f=await fixture(spec)
  try {
    expect(f.upgrades.map(size=>[size.width,size.height])).toEqual([[656,220],[656,456]])
    expect(f.host.querySelector('[data-component-summary=true]')).not.toBeNull()
    expect(f.host.textContent).not.toContain('END_OF_FULL_SOURCE')
    await act(async()=>f.host.querySelector('[data-research-container-expand]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
    expect(f.host.querySelector('dialog')!.hasAttribute('open')).toBe(true)
    expect(f.host.querySelector('[data-test-markdown]')!.textContent).toBe(content)
    expect(f.workspace.getSnapshot().artifacts[0].containerSpec.content).toBe(content)
  } finally {await f.cleanup()}
})
it('adapts manual native markdown without changing dimensions or source content', async()=>{
  const spec={version:1,type:'markdown',title:'正文卡片',content:'原始数据。'.repeat(180)}
  const f=await fixture(spec,'manual')
  try {
    expect(f.upgrades).toEqual([])
    expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({width:320,height:220,sizeMode:'manual',containerSpec:spec})
    expect(f.host.querySelector('[data-component-summary=true]')).not.toBeNull()
  } finally {await f.cleanup()}
})
