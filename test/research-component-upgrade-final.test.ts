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
  runInNewContext(source, { window: browser, document: browser.document, localStorage: browser.localStorage, navigator: browser.navigator, HTMLElement: browser.HTMLElement, Element: browser.Element, Node: browser.Node, Event: browser.Event, MutationObserver: browser.MutationObserver, getComputedStyle: browser.getComputedStyle.bind(browser), Text: browser.Text, ResizeObserver: browser.ResizeObserver, requestAnimationFrame: browser.requestAnimationFrame.bind(browser), cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), URL, AbortController, TextEncoder, TextDecoder, setTimeout, clearTimeout })
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
it('keeps four complete KPI values in a short 320 × 220 card without shrinking text or hiding a row', async () => {
  const spec = { version:1, type:'kpi', title:'行情快照', items:[
    {label:'最新点位',value:'4,575.02'}, {label:'涨跌幅',value:'+0.59%'},
    {label:'今开',value:'4,567.89'}, {label:'昨收',value:'4,548.05'}
  ] }
  const f = await fixture(spec, 'manual')
  try {
    for (const item of spec.items) expect(f.host.textContent).toContain(item.value)
    expect(f.host.querySelector('[data-research-metric-positive=true]')?.textContent).toBe('+0.59%')
    expect(f.host.querySelector('[data-component-summary=true]')).toBeNull()
    expect(f.upgrades).toEqual([])
    expect(f.workspace.getSnapshot().artifacts[0]).toMatchObject({width:320,height:220,containerSpec:spec})
  } finally { await f.cleanup() }
})
it('reserves the full-reader hint without clipping a fifth KPI into the short card', async () => {
  const spec={version:1,type:'kpi',title:'核心指标',items:Array.from({length:6},(_,i)=>({label:'指标'+i,value:String(100+i)}))}
  const f=await fixture(spec,'manual')
  try {
    expect(f.host.querySelectorAll('[data-research-container-kpi] strong')).toHaveLength(4)
    expect(f.host.textContent).toContain('放大查看完整内容')
    expect(f.workspace.getSnapshot().artifacts[0].containerSpec.items).toHaveLength(6)
  } finally {await f.cleanup()}
})
it('aligns formatted numeric columns with their headings while keeping dates, codes and source text unchanged', async()=>{
  const spec={version:1,type:'table',title:'行情',columns:['日期','代码','当前值','变化','成交额','来源'],rows:[['09-01','000300','4,575.02','+0.59%','186.2 亿','交易所'],['09-02','000905','4,548.05','−0.47%','—','交易所']]}
  const f=await fixture(spec,'manual')
  try{
    await act(async()=>f.host.querySelector('[data-research-container-expand]')!.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true})))
    const aligned=new Map<string,boolean>()
    for(let page=0;page<spec.columns.length;page++){
      for(const header of f.host.querySelectorAll('[role=columnheader]')){
        const label=header.querySelector('.ag-header-cell-text')?.textContent ?? ''
        aligned.set(label,header.classList.contains('sherlock-ag-grid-numeric'))
      }
      const next=f.host.querySelector('[aria-label="下一列"]') as unknown as HTMLButtonElement | null
      if(!next||next.disabled)break
      await act(async()=>next.dispatchEvent(new f.browser.MouseEvent('click',{bubbles:true}) as unknown as Event))
    }
    expect(spec.columns.map(title=>aligned.get(title))).toEqual([false,false,true,true,true,false])
    expect(f.host.querySelector('[data-research-grid-engine]')?.getAttribute('data-research-grid-engine')).toBe('ag-grid-community')
    expect(f.workspace.getSnapshot().artifacts[0].containerSpec).toEqual(spec)
  }finally{await f.cleanup()}
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
it('keeps tall native tables in the S viewport while retaining every source row', async () => {
  const spec = {version:1,type:'table',title:'正文卡片',columns:['日期','数值','来源'],rows:Array.from({length:6},(_,i)=>['日期'+i,String(i),'来源'+i])}
  const f = await fixture(spec)
  try {
    expect(f.upgrades).toEqual([])
    expect(f.host.querySelector('[data-research-grid-engine]')).not.toBeNull()
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

// Use the real native renderer and theme rules: parent-only colors previously
// passed inspection while the final paragraph/table leaves remained #fafafa.
it.each([
  { type:'markdown', content:'最终正文', selector:'.rScV5Q_containerMarkdown [data-test-markdown]', color:'#ececed', lightColor:'#242529' }
].flatMap(item=>['light','dark'].map(theme=>({...item,theme}))))('applies the generated $type $theme theme through to its final text leaves', async item => {
  const {selector,color,lightColor,theme,...spec}=item
  const f=await fixture({version:1,title:'内容样式',...spec})
  try {
    if(theme==='dark') f.browser.document.body.setAttribute('data-ds-dark-theme','')
    const style=(selector:string)=>f.browser.getComputedStyle(f.host.querySelector(selector)!)
    expect(style(selector).color).toBe(theme==='dark'?color:lightColor)
  } finally {await f.cleanup()}
})
it('keeps S labels at 10/18 and L line plots on the card surface without recoloring data series',async()=>{
  const f=await fixture({version:1,type:'kpi',title:'指标',items:[{label:'样本数',value:120}]})
  try {
    expect(f.browser.getComputedStyle(f.host.querySelector('.rScV5Q_containerKpis span')!).fontSize).toBe('10px')
    expect(f.browser.getComputedStyle(f.host.querySelector('.rScV5Q_containerKpis span')!).lineHeight).toBe('18px')
    expect(f.browser.getComputedStyle(f.host.querySelector('.rScV5Q_containerKpis strong')!).fontSize).toBe('24px')
  } finally {await f.cleanup()}
  const chart=await fixture({version:1,type:'chart',title:'月度样本',variant:'line',labels:['一月','二月'],series:[{name:'甲',values:[0,120]},{name:'乙',values:[1,72]}]})
  try {
    chart.browser.document.body.setAttribute('data-ds-dark-theme','')
    const label=chart.browser.getComputedStyle(chart.host.querySelector('.rScV5Q_chartLabel')!)
    expect(label.fontSize).toBe('10px');expect(label.lineHeight).toBe('18px')
    expect(chart.browser.getComputedStyle(chart.host.querySelector('[data-research-container-chart=line]')!).backgroundColor).toBe('transparent')
    expect([...chart.host.querySelectorAll('polyline')].map(line=>line.getAttribute('stroke'))).toEqual(['var(--sherlock-chart-1)','var(--sherlock-chart-2)'])
  } finally {await chart.cleanup()}
})
