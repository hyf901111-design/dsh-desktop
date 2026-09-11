import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { Window, type HTMLElement } from 'happy-dom'
import { describe, it, expect } from 'vitest'
import { patchFigmaFinalCanvas } from '../../scripts/lib/figma-canvas-client.mjs'

const requireModule = createRequire(import.meta.url)
const React = requireModule('react')
const { createRoot } = requireModule('react-dom/client')
const { act } = React
export const source = patchFigmaFinalCanvas(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8'))
export async function derivedFixture(kind = 'generated-summary', count = 1, overrides: any = {}) {
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
  const sources = Array.from({length:count},(_,i)=>({id:'source-'+i,kind:'pasted-text',title:'冻结材料'+i,messageId:'source-message-'+i,excerpt:'冻结正文'+i,x:100+i*400,y:160,width:320,height:220,sizeMode:'manual'}));
  const derived={id:'derived',kind,title:'派生结果',messageId:'derived',excerpt:'# 关键结论\n\n真实研究结论。',generationStatus:'completed',sourceNodeIds:sources.map(x=>x.id),generationSources:sources.map(x=>({id:x.id,type:'artifact',title:x.title,text:x.excerpt})),x:700,y:350,width:656,height:456,sizeMode:'manual',...(kind==='generated-container'?{creationMode:'selection',containerPrompt:'比较资料',refreshMinutes:0,containerSpec:{version:1,type:'markdown',title:'比较结果',content:'正文'}}:{}),...overrides};
  browser.localStorage.setItem('sherlock.research.canvas.artifacts.v1:text-final', JSON.stringify([...sources,derived]));
  const workspace = new client.ResearchWorkspaceRegistry(browser.localStorage).for('text-final')
  workspace.setCanvasSize({ width: 1200, height: 800, availableWidth:728 })
  const host = browser.document.createElement('div'); browser.document.body.append(host)
  const root = createRoot(host)
  const statuses:string[]=[],cancellations:any[]=[];
  workspace.setGenerationCancelSink((request:any)=>{cancellations.push(request);return Promise.resolve({ok:true})});
  const upgradeStart=source.indexOf('onExpandGeneration:')+'onExpandGeneration:'.length;let upgradeEnd=source.indexOf('{',upgradeStart),depth=1;for(upgradeEnd++;depth;upgradeEnd++){if(source[upgradeEnd]==='{')depth++;else if(source[upgradeEnd]==='}')depth--}
  const upgrade=(node:any)=>new Function('node','workspace','return '+source.slice(upgradeStart,upgradeEnd))(node,workspace);

  const begin=source.indexOf('const onResearchReferenceClickCapture ='), body=source.indexOf('(event) => {',begin), end=source.indexOf('}, [research, researchWorkspace]);',body)+1;
  const locate=new Function('research','researchWorkspace','setResearchReferenceStatus','return '+source.slice(body,end))(true,workspace,(message:string)=>statuses.push(message));
  function Harness() {
    const snapshot = React.useSyncExternalStore(workspace.subscribe, workspace.getSnapshot)
    const [editing, setEditing] = React.useState(false)
    const node = snapshot.artifacts.find((node:any)=>node.id==='derived')
    return React.createElement('div',{onClickCapture:locate},React.createElement(client.ResearchCanvasArtifactCard, {
      node, sessionId: 'text-final', editingContent: editing,
      onMindMapNodeCommit:(line:number,label:string)=>workspace.updateMindMapNodeLabel(node.id,line,label),
      onContentEdit: () => setEditing(true), onContentCancel: () => setEditing(false),
      onContentCommit: (text: string) => { workspace.updateArtifactContent(node.id, text); setEditing(false) },
      onExpandGeneration: upgrade(node),onCancelGeneration:()=>workspace.cancelGeneration(node.id),
      onAutoHeight: (_node: any, height: number) => workspace.updateNodeGeometry(node.id, { height, sizeMode: 'auto' })
    }))
  }
  await act(async () => root.render(React.createElement(Harness)))
  return { browser, host, workspace, statuses, cancellations, client, measure() { for (const callback of [...resizeCallbacks]) callback() }, setReadOnly() { shared = true; workspace.setCollaborationAccess(false) },
    async cleanup() { await act(async () => root.unmount()); for (const [key, value] of saved) if (value) Object.defineProperty(globalThis, key, value); else delete (globalThis as any)[key]; await browser.happyDOM.close() } }
}

