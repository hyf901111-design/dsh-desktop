import {describe,it,expect,vi} from 'vitest'
import {createComponentDataStatusStore,createComponentDataStatusMonitor,componentDataStatusView,componentDataStatusDefinitions,createPersonalChartViewSink,readPersonalChartView,patchComponentDataStatus} from '../scripts/lib/component-data-status.mjs'
import {workbenchContentRevision} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {Window} from 'happy-dom'
import * as react from 'react'
import * as react_dom from 'react-dom'
import * as react_jsx_runtime from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'

const row=(nodeId,lastSuccess=1000,extra={})=>({nodeId,status:'success',lastSuccess,enabled:true,intervalMinutes:1,...extra})
describe('component refresh status',()=>{
 it('keeps active provider names through list and compact status pushes, including failures and pauses',()=>{
  const store=createComponentDataStatusStore(),changed=vi.fn()
  store.subscribe('s','a',changed)
  store.publish('s',[row('a',1000,{intervalMinutes:1440,requests:[{sourceName:'通联 DataYes MCP / call_api'},{sourceName:'通联 DataYes MCP / fund_holdings'}]})])
  const view=()=>componentDataStatusView(store.read('s','a'))
  expect(view()).toMatchObject({source:'通联 DataYes',detail:'每 1440 分钟'})
  expect(view().title).toContain('数据源：通联 DataYes MCP / call_api')
  changed.mockClear()
  store.publish('s',[row('a',1000,{intervalMinutes:1440,sourceNames:['通联 DataYes MCP / call_api','通联 DataYes MCP / fund_holdings']})])
  expect(changed).not.toHaveBeenCalled()
  store.publish('s',[row('a',1000,{intervalMinutes:1440,status:'error',sourceNames:['通联 DataYes MCP / call_api']})])
  expect(view()).toMatchObject({source:'通联 DataYes',detail:'更新失败 · 保留上次数据'})
  store.publish('s',[row('a',1000,{intervalMinutes:1440,enabled:false,sourceNames:['新浪财经 / quote']})])
  expect(view()).toMatchObject({source:'新浪财经',detail:'已暂停'})
  expect(view().title).not.toContain('DataYes')
 })
 it('persists only the owning technical chart semantic state, preserving geometry and source while refusing stale or shared writes',()=>{
  const html='<script id="sherlock-template-data" type="application/json">{"templateId":"market.charting","version":"1"}</script>',revision=workbenchContentRevision(html)
  let nodes=[{id:'a',x:100,y:200,width:480,height:620,containerSpec:{type:'html',html},config:{interactionState:{version:'v',events:{}}}}],writable=true
  const write=vi.fn((id,config)=>{nodes=nodes.map(n=>n.id===id?{...n,config}:n);return true}),sink=createPersonalChartViewSink({read:()=>nodes,write,canWrite:()=>writable})
  const state={values:[['source-value','100'],['chart-view-key:technical-controls','{"drawings":[{"kind":"trend"}]}']],controls:[{path:[0],tag:'INPUT',value:'private query',checked:false}],scroll:[]},source=nodes[0]
  expect(sink('a',revision,state)).toBe(true)
  const durable=JSON.parse(JSON.stringify(nodes[0])),restored=readPersonalChartView(durable)
  expect(restored).toEqual({values:[state.values[1]],controls:[],scroll:[]})
  expect({...durable,config:source.config}).toEqual(source)
  expect(sink('a',revision,state)).toBe(true);expect(write).toHaveBeenCalledTimes(1)
  for(const [id,rev,v]of [['other',revision,state],['a','stale',state],['a',revision,{...state,values:[['chart-view-key:technical-controls','x'.repeat(65537)]]}]])expect(sink(id,rev,v)).toBe(false)
  writable=false;expect(sink('a',revision,state)).toBe(false)
  expect(readPersonalChartView({...durable,containerSpec:{...durable.containerSpec,html:html+'edited'}})).toBeNull()
  expect(readPersonalChartView({...durable,containerSpec:{...durable.containerSpec,html:html.replace('market.charting','market.metrics')}})).toBeNull()
 })
 it('installs the native personal view sink and preserves it through the actual canvas parser',()=>{
  const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),patched=patchComponentDataStatus(source)
  expect(patchComponentDataStatus(patched)).toBe(patched)
  expect(patched).toContain('researchPersonalChartViewSinks.set(sessionId,createPersonalChartViewSink')
  expect(patched).toContain('personalChartView:value.config.personalChartView')
  expect(patched).toContain('canWrite:()=>!sherlockShared(sessionId)&&collaborationCanWrite()')
 })
 it('publishes only changed cards and highlights changed successful reads while unchanged values only update time',()=>{
  const store=createComponentDataStatusStore(),a=vi.fn(),b=vi.fn()
  store.subscribe('s','a',a);store.subscribe('s','b',b)
  store.publish('s',[row('a'),row('b')]);a.mockClear();b.mockClear()
  expect(store.read('s','a').refreshSequence).toBe(0)
  expect(store.read('s','a').completionSequence).toBe(0)
  store.publish('s',[row('a'),row('b')]);expect(a).not.toHaveBeenCalled()
  store.publish('s',[row('a',2000,{status:'unchanged'}),row('b')])
  expect(store.read('s','a').refreshSequence).toBe(0);expect(a).toHaveBeenCalledTimes(1);expect(b).not.toHaveBeenCalled()
  expect(store.read('s','a').completionSequence).toBe(1)
  store.publish('s',[row('a',2000,{status:'error'}),row('b')])
  expect(store.read('s','a').refreshSequence).toBe(0)
  expect(store.read('s','a').completionSequence).toBe(1)
  expect(componentDataStatusView(store.read('s','a')).detail).toContain('保留')
 })
 it('does not flash historical updates on return, retains timestamps on errors and removes deleted bindings',()=>{
  const store=createComponentDataStatusStore();store.publish('s',[row('a')]);store.suspend('s')
  store.publish('s',[row('a',5000)])
  expect(store.read('s','a').refreshSequence).toBe(0)
  expect(store.read('s','a').completionSequence).toBe(0)
  store.publish('s',[row('a',5000,{status:'error'})]);expect(store.read('s','a').lastSuccess).toBe(5000)
  store.publish('s',[]);expect(store.read('s','a')).toBe(null)
  expect(componentDataStatusView(null).time).toBe('尚未刷新')
 })
 it('acknowledges successful reads at the same timestamp using the source sequence, including unchanged data',()=>{
  const store=createComponentDataStatusStore();store.publish('s',[row('a',1000,{successSequence:1})])
  store.publish('s',[row('a',1000,{successSequence:2,status:'unchanged'})])
  expect(store.read('s','a')).toMatchObject({completionSequence:1,refreshSequence:0})
  store.publish('s',[row('a',1000,{successSequence:3})])
  expect(store.read('s','a')).toMatchObject({completionSequence:2,refreshSequence:1})
  expect(componentDataStatusView(store.read('s','a'),'success').detail).toBe('已更新')
  expect(componentDataStatusView(row('a',1000,{status:'unchanged'}),'unchanged').detail).toBe('已检查 · 数据无变化')
  expect(componentDataStatusView(row('a',1000,{status:'refreshing'}),'success').detail).toBe('正在更新数据…')
 })
 it('polls once for the canvas, pauses when hidden and discards late responses after disposal',async()=>{
  vi.useFakeTimers()
  try{
   let visible=true,resolve;const store=createComponentDataStatusStore()
   const bridge={setVisible:vi.fn(async()=>{}),request:vi.fn(()=>new Promise(r=>resolve=r))}
   const monitor=createComponentDataStatusMonitor({sessionId:'s',bridge,store,isVisible:()=>visible})
   await vi.advanceTimersByTimeAsync(0);expect(bridge.request).toHaveBeenCalledTimes(1)
   await vi.advanceTimersByTimeAsync(5000);expect(bridge.request).toHaveBeenCalledTimes(1)
   resolve([row('a')]);await Promise.resolve();await Promise.resolve()
   visible=false;monitor.refresh();await vi.advanceTimersByTimeAsync(60000)
   expect(bridge.request).toHaveBeenCalledTimes(1);expect(bridge.setVisible).toHaveBeenLastCalledWith('s',false)
   visible=true;monitor.refresh();await Promise.resolve();expect(bridge.request).toHaveBeenCalledTimes(2)
   monitor.dispose();resolve([row('a',8000)]);await Promise.resolve();await Promise.resolve()
   expect(store.read('s','a')).toBe(null)
  }finally{vi.useRealTimers()}
 })
 it('renders the fixed timestamp and highlights only the changed card without remounting its content',async()=>{
  const window=new Window({settings:{disableJavaScriptEvaluation:true}}),document=window.document
  vi.stubGlobal('window',window);vi.stubGlobal('document',document);vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.useFakeTimers()
  document.body.innerHTML='<div data-research-node-id="a"><div data-research-preview-body><input value="保留筛选"><strong data-refresh-key="price">100</strong></div><footer></footer><iframe></iframe></div><div data-research-node-id="b"><div data-research-preview-body></div><footer></footer></div>'
  const {ComponentDataStatusBar,componentDataStatusStore:store}=vm.runInNewContext(componentDataStatusDefinitions()+';({ComponentDataStatusBar,componentDataStatusStore})',{react,react_dom,react_jsx_runtime,sherlockShared:()=>false,openComponentData:vi.fn(),setTimeout,clearTimeout})
  const roots=[...document.querySelectorAll('footer')].map(el=>createRoot(el)),frame=document.querySelector('iframe'),input=document.querySelector('input')
  try{
   await react.act(async()=>{store.publish('s',[row('a'),row('b')]);roots.forEach((root,i)=>root.render(react.createElement(ComponentDataStatusBar,{sessionId:'s',node:{id:i?'b':'a'},workbench:true})))})
   expect(document.querySelectorAll('time')).toHaveLength(2);expect(document.querySelector('[data-workbench-value-changed]')).toBe(null)
   expect(document.querySelector('[data-refresh-feedback]')).toBeNull()
   await react.act(async()=>store.publish('s',[row('a',1000,{status:'refreshing'}),row('b')]))
   expect(document.querySelector('[role=status]').textContent).toBe('正在更新数据…')
   expect(document.querySelector('[data-research-preview-body]').getAttribute('aria-busy')).toBe('true')
   await react.act(async()=>{vi.advanceTimersByTime(301)})
   expect(document.querySelector('[data-component-updating]')).not.toBeNull()
   document.querySelector('strong').textContent='101'
   await react.act(async()=>store.publish('s',[row('a',2000),row('b')]))
   await react.act(async()=>{vi.advanceTimersByTime(110)})
   expect(document.querySelectorAll('[data-workbench-value-changed]')).toHaveLength(1)
   expect(document.querySelector('[data-workbench-value-changed]').closest('[data-research-node-id]').getAttribute('data-research-node-id')).toBe('a')
   expect(document.querySelector('iframe')).toBe(frame);expect(document.querySelector('input')).toBe(input);expect(input.value).toBe('保留筛选')
   expect(document.querySelector('[role=status]').textContent).toBe('已更新')
   expect(document.querySelector('[data-component-updating]')).toBeNull()
   expect(document.querySelector('[aria-busy]')).toBeNull()
   await react.act(async()=>{vi.advanceTimersByTime(1200)})
   expect(document.querySelector('[data-workbench-value-changed]')).toBe(null)
   await react.act(async()=>{vi.advanceTimersByTime(1200)})
   expect(document.querySelector('[role=status]').textContent).toBe('每分钟')
   await react.act(async()=>store.publish('s',[row('a',3000,{status:'unchanged'}),row('b')]))
   expect(document.querySelector('[role=status]').textContent).toBe('已检查 · 数据无变化')
   expect(document.querySelector('[data-workbench-value-changed]')).toBeNull()
   await react.act(async()=>{vi.advanceTimersByTime(2401)})
   expect(document.querySelector('[role=status]').textContent).toBe('每分钟')
   await react.act(async()=>store.publish('s',[row('a',2000,{status:'error'}),row('b')]))
   expect(document.querySelector('[data-workbench-value-changed]')).toBe(null)
   expect(document.querySelector('[role=status]').textContent).toBe('更新失败 · 保留上次数据')
   expect(document.querySelector('strong').textContent).toBe('101')
  }finally{await react.act(async()=>roots.forEach(root=>root.unmount()));vi.useRealTimers();vi.unstubAllGlobals();await window.happyDOM.close()}
 })
})


it('exposes stable readonly session facts, preserves last observations without changing footer clear semantics, and bounds summaries',()=>{
 const store=createComponentDataStatusStore(),listener=vi.fn()
 const cold=store.snapshotSession('cold')
 expect(cold).toMatchObject({ready:false,observed:false,rows:[]})
 expect(store.snapshotSession('cold')).toBe(cold)
 const stop=store.subscribeSession('s',listener)
 store.publish('s',[])
 const empty=store.snapshotSession('s')
 expect(empty).toMatchObject({ready:true,observed:true,rows:[]})
 store.publish('s',[]);expect(store.snapshotSession('s')).toBe(empty);expect(listener).toHaveBeenCalledOnce()
 store.publishNative('s','native',row('native',1000,{error:'PRIVATE',parameters:{secret:'PRIVATE'}}))
 const live=store.snapshotSession('s')
 expect(live.rows[0]).toMatchObject({nodeId:'native',native:true,lastSuccess:1000})
 expect(JSON.stringify(live)).not.toContain('PRIVATE')
 expect(Object.isFrozen(live)).toBe(true);expect(Object.isFrozen(live.rows)).toBe(true);expect(Object.isFrozen(live.rows[0])).toBe(true)
 store.clearNative('s','native');expect(store.read('s','native')).toBeNull()
 expect(store.snapshotSession('s').rows[0]).toMatchObject({nodeId:'native',lastObserved:true})
 store.suspend('s');expect(store.snapshotSession('s').ready).toBe(false)
 store.clear('s');expect(store.snapshotSession('s')).toMatchObject({ready:false,observed:true})
 stop();listener.mockClear();store.publish('s',[]);expect(listener).not.toHaveBeenCalled()
 for(let i=0;i<70;i++)store.publish('session-'+i,[])
 expect(store.snapshotSession('s')).toMatchObject({ready:false,observed:false,rows:[]})
})
