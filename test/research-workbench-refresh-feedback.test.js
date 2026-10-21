import {expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {runInNewContext,Script} from 'node:vm'
import {Window} from 'happy-dom'
import * as react from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {patchComponentDataRefresh} from '../scripts/lib/component-data-refresh.mjs'
import {patchResearchCreationProgress} from '../scripts/lib/research-creation-progress.mjs'
import {restoreResearchGridWorkbench} from '../scripts/lib/research-grid-workbench.mjs'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'
import {installResearchGenerationWatch} from '../scripts/lib/research-generation-watch.mjs'

it('mounts the injected feedback with the native workspace, host bridge and builtin store through active, unmounted and Notes states',async()=>{
 const window=new Window(),document=window.document
 vi.stubGlobal('window',window);vi.stubGlobal('document',document);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true)
 let descriptor,stopWatch,monitor,root
 try{
  let source=patchComponentDataRefresh(patchResearchCreationProgress(restoreResearchGridWorkbench(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))))
  // Run the real current-store block replacement, rather than a second fixture store.
  const stale=source.replace('snapshotSession:sessionId=>summaries.get(sessionId)??empty,','snapshotSession:sessionId=>null,')
  expect(patchComponentDataRefresh(stale)).toBe(source)
  source=source.replace('const componentDataStatusStore=createComponentDataStatusStore();','const componentDataStatusStore=createComponentDataStatusStore();window.__refreshTest={Component:ResearchWorkbenchProgress,store:componentDataStatusStore,createMonitor:createComponentDataStatusMonitor,publishInactive:publishInactiveResearchWorkbenchProgress,publish:publishResearchWorkbenchProgress};')
  new Script(source)
  window.__ModuleLoader__={load:value=>descriptor=value}
  runInNewContext(source,{window,document,crypto,Event,CustomEvent:window.CustomEvent,AbortController,TextEncoder,TextDecoder,setTimeout,clearTimeout,setInterval,clearInterval})
  let fallback;fallback=new Proxy(function(){},{get:()=>fallback,apply:()=>fallback})
  const client=descriptor.factory(id=>id==='react'?react:id==='react/jsx-runtime'?jsx:fallback)
  const {Component,store,createMonitor,publishInactive,publish}=window.__refreshTest
  const ids=['static','manual','paused','configured','failure','success','native']
  const artifacts=ids.map((id,index)=>({id,messageId:id,title:id,excerpt:'PRIVATE SOURCE',refreshMinutes:0,workbenchIndex:index,kind:'generated-container',workbenchId:'plan',generationStatus:'completed',generationTaskId:'task-'+id,containerSpec:id==='native'?{...financialWidgetDefaults('news'),title:id}:{version:1,type:'html',title:id,html:'<p>PRIVATE SOURCE '+id+'</p>'},x:index*400,y:0,width:400,height:280,containerPrompt:'PRIVATE PROMPT'}))
  const values=new Map([['sherlock.research.canvas.artifacts.v1:s',JSON.stringify(artifacts)]]),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}
  const workspace=client.createResearchWorkspaceSession(storage,'s')
  expect(workspace.getSnapshot().artifacts).toHaveLength(7)
  document.body.innerHTML='<main></main>';root=createRoot(document.querySelector('main'))
  const plans=[{id:'plan',count:7}]
  await react.act(async()=>{
   stopWatch=installResearchGenerationWatch({workspace,sessionId:'s',eventTarget:window,publishProgress:publish,inspect:()=>{throw Error('No generation pending')}})
   root.render(react.createElement(Component,{sessionId:'s',plans,footer:true}))
  })
  expect(document.body.textContent).toContain('刷新状态待确认 7')
  let push,resolveList,visible=true
  const bridge={setVisible:vi.fn(async()=>{}),request:vi.fn(()=>new Promise(resolve=>resolveList=resolve)),subscribe:fn=>{push=fn;return()=>{push=null}}}
  await react.act(async()=>{monitor=createMonitor({sessionId:'s',bridge,store,isVisible:()=>visible})})
  expect(bridge.request).toHaveBeenCalledTimes(1)
  const rows=[{nodeId:'manual',status:'idle',enabled:false,intervalMinutes:0},{nodeId:'paused',status:'idle',enabled:false,intervalMinutes:1},{nodeId:'configured',status:'idle',enabled:true,intervalMinutes:1},{nodeId:'failure',status:'error',enabled:true,intervalMinutes:1,lastSuccess:1000,error:'PRIVATE ERROR'},{nodeId:'success',status:'success',enabled:true,intervalMinutes:5,lastSuccess:2000}]
  await react.act(async()=>{resolveList(rows);await Promise.resolve()})
  for(const label of ['静态内容 1','仅手动刷新 1','刷新已暂停 1','尚无成功记录 1','最近刷新失败 1','每 5 分钟刷新，最近刷新成功 1','刷新状态待确认 1'])expect(document.body.textContent).toContain(label)
  await react.act(async()=>store.publishNative('s','native',{status:'success',enabled:true,intervalMinutes:1,lastSuccess:3000,error:'PRIVATE ERROR',requests:[{args:'PRIVATE ARGS'}]}))
  expect(document.body.textContent).toContain('已配置每分钟刷新，最近刷新成功 1')
  await react.act(async()=>{store.clearNative('s','native');push({sessionId:'s',rows:[]})})
  expect(store.read('s','native')).toBeNull()
  expect(window.__sherlockWorkbenchGenerationV1.get('s').active).toBe(true)
  expect(document.body.textContent).toContain('上次观察：已配置每分钟刷新，最近刷新成功 1')
  expect(document.body.textContent).toContain('静态内容 6')
  await react.act(async()=>{push({sessionId:'s',rows});visible=false;await monitor.refresh();stopWatch();monitor.dispose();monitor=null;stopWatch=null})
  expect(document.body.textContent).toContain('上次观察：仅手动刷新 1')
  expect(document.body.textContent).toContain('上次观察：已配置每 5 分钟刷新，最近刷新成功 1')
  expect(document.body.textContent).toContain('已完成')
  expect(document.querySelector('svg')).toBeNull()
  // A cold restored Notes session has generation facts but no refresh facts.
  await react.act(async()=>{publishInactive(window,'cold',workspace.getSnapshot().artifacts);root.render(react.createElement(Component,{sessionId:'cold',plans,footer:true}))})
  expect(document.body.textContent).toContain('刷新状态待确认 7')
  expect(document.body.textContent).not.toContain('静态内容')
  await react.act(async()=>store.publish('s',[{nodeId:'success',status:'success',enabled:true,intervalMinutes:1,lastSuccess:4000}]))
  expect(document.body.textContent).toContain('刷新状态待确认 7')
  await react.act(async()=>{
   stopWatch=installResearchGenerationWatch({workspace,sessionId:'s',eventTarget:window,publishProgress:publish,inspect:()=>{throw Error('No generation pending')}})
   root.render(react.createElement(Component,{sessionId:'s',plans,footer:true}))
  })
  expect(document.body.textContent).toContain('已配置每分钟刷新，最近刷新成功 1')
  await react.act(async()=>store.publishNative('s','native',{status:'error',enabled:true,intervalMinutes:1,lastSuccess:3000,error:'PRIVATE ERROR'}))
  expect(document.body.textContent).toContain('已配置每分钟刷新，最近刷新失败 1')
  expect(document.body.textContent).not.toContain('上次观察：已配置每分钟刷新，最近刷新失败')
  expect(JSON.stringify(store.snapshotSession('s'))).not.toContain('PRIVATE')
  expect(JSON.stringify(window.__sherlockWorkbenchGenerationV1.get('s'))).not.toContain('PRIVATE')
 }finally{await react.act(async()=>{stopWatch?.();monitor?.dispose();root?.unmount()});vi.unstubAllGlobals();window.happyDOM.abort()}
},15000)
