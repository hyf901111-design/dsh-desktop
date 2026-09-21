import { readFile } from 'node:fs/promises'
import { runInNewContext, Script } from 'node:vm'
import { createRequire } from 'node:module'
import { Window } from 'happy-dom'
import { expect, it } from 'vitest'
import { patchResearchCanvasRenderPerformance } from '../scripts/lib/research-canvas-render-performance.mjs'
import { patchCanvasCreationTools } from '../scripts/lib/canvas-creation-tools.mjs'
const require = createRequire(import.meta.url), React = require('react'), jsx = require('react/jsx-runtime')
it('keeps snapshots stable for unchanged nodes and compiles the complete production patch twice', async () => {
  const source=patchCanvasCreationTools(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
  expect(patchCanvasCreationTools(source)).toBe(source)
  expect(()=>new Script(source)).not.toThrow()
  const start=source.indexOf('function researchWorkspaceSnapshot('),end=source.indexOf('function canonicalResearchGenerationEvent',start)
  const freeze=runInNewContext(source.slice(start,end)+';researchWorkspaceSnapshot')
  const before=freeze({files:[],artifacts:[{id:'x'}],selection:{selectedNodeIds:[],orderedFileIds:[]},viewport:{scale:1},canvasSize:{width:800}})
  const after=freeze({...before,canvasSize:{width:900}})
  expect(after.artifacts).toBe(before.artifacts)
  expect(after.artifacts[0]).toBe(before.artifacts[0])
})
it('memoizes card content across resize and always invokes the latest callback', async () => {
  const source=patchResearchCanvasRenderPerformance(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
  const start=source.indexOf('function stableResearchCard('),end=source.indexOf('const ResearchStableArtifactCard',start)
  const stable=runInNewContext(source.slice(start,end)+';stableResearchCard',{react:React,react_jsx_runtime:jsx})
  const win=new Window(),keys=['window','document','HTMLElement','Element','Node','navigator','IS_REACT_ACT_ENVIRONMENT']
  const old=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k))
  for(const k of keys)Object.defineProperty(globalThis,k,{configurable:true,writable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='window'?win:(win as any)[k]})
  const {createRoot}=require('react-dom/client'),host=win.document.createElement('div');win.document.body.append(host)
  let renders=0,seen=''; const node={id:'component'}
  const Card=stable(({onClick}:any)=>{renders++;return React.createElement('button',{onClick},'组件')})
  const root=createRoot(host)
  try {
    await React.act(async()=>root.render(React.createElement(Card,{node,onClick:()=>{seen='old'}})))
    for(let i=0;i<30;i++)await React.act(async()=>root.render(React.createElement(Card,{node,onClick:()=>{seen='new'}})))
    expect(renders).toBe(1)
    await React.act(async()=>host.querySelector('button')!.click());expect(seen).toBe('new')
    await React.act(async()=>root.render(React.createElement(Card,{node:{id:'updated'},onClick:()=>{}})))
    expect(renders).toBe(2)
  } finally {await React.act(async()=>root.unmount());await win.happyDOM.close();keys.forEach((k,i)=>old[i]?Object.defineProperty(globalThis,k,old[i]!):delete (globalThis as any)[k])}
})
