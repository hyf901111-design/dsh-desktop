import {describe,it,expect,vi} from 'vitest'
import {createComponentDataStatusStore,createComponentDataStatusMonitor,componentDataStatusView,componentDataStatusDefinitions} from '../scripts/lib/component-data-status.mjs'
import vm from 'node:vm'
import {Window} from 'happy-dom'
import * as react from 'react'
import * as react_dom from 'react-dom'
import * as react_jsx_runtime from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'

const row=(nodeId,lastSuccess=1000,extra={})=>({nodeId,status:'success',lastSuccess,enabled:true,intervalMinutes:1,...extra})
describe('component refresh status',()=>{
 it('publishes only changed cards and highlights fresh successful reads, including unchanged values',()=>{
  const store=createComponentDataStatusStore(),a=vi.fn(),b=vi.fn()
  store.subscribe('s','a',a);store.subscribe('s','b',b)
  store.publish('s',[row('a'),row('b')]);a.mockClear();b.mockClear()
  expect(store.read('s','a').refreshSequence).toBe(0)
  store.publish('s',[row('a'),row('b')]);expect(a).not.toHaveBeenCalled()
  store.publish('s',[row('a',2000,{status:'unchanged'}),row('b')])
  expect(store.read('s','a').refreshSequence).toBe(1);expect(a).toHaveBeenCalledTimes(1);expect(b).not.toHaveBeenCalled()
  store.publish('s',[row('a',2000,{status:'error'}),row('b')])
  expect(store.read('s','a').refreshSequence).toBe(1)
  expect(componentDataStatusView(store.read('s','a')).detail).toContain('保留')
 })
 it('does not flash historical updates on return, retains timestamps on errors and removes deleted bindings',()=>{
  const store=createComponentDataStatusStore();store.publish('s',[row('a')]);store.suspend('s')
  store.publish('s',[row('a',5000)])
  expect(store.read('s','a').refreshSequence).toBe(0)
  store.publish('s',[row('a',5000,{status:'error'})]);expect(store.read('s','a').lastSuccess).toBe(5000)
  store.publish('s',[]);expect(store.read('s','a')).toBe(null)
  expect(componentDataStatusView(null).time).toBe('尚未刷新')
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
  document.body.innerHTML='<div data-research-node-id="a"><div data-research-preview-body><input value="保留筛选"><iframe></iframe></div><footer></footer></div><div data-research-node-id="b"><div data-research-preview-body></div><footer></footer></div>'
  const {ComponentDataStatusBar,componentDataStatusStore:store}=vm.runInNewContext(componentDataStatusDefinitions()+';({ComponentDataStatusBar,componentDataStatusStore})',{react,react_dom,react_jsx_runtime,sherlockShared:()=>false,openComponentData:vi.fn(),setTimeout,clearTimeout})
  const roots=[...document.querySelectorAll('footer')].map(el=>createRoot(el)),frame=document.querySelector('iframe'),input=document.querySelector('input')
  try{
   await react.act(async()=>{store.publish('s',[row('a'),row('b')]);roots.forEach((root,i)=>root.render(react.createElement(ComponentDataStatusBar,{sessionId:'s',node:{id:i?'b':'a'}})))})
   expect(document.querySelectorAll('time')).toHaveLength(2);expect(document.querySelector('.odyssey-data-update-highlight')).toBe(null)
   await react.act(async()=>store.publish('s',[row('a',2000),row('b')]))
   expect(document.querySelectorAll('.odyssey-data-update-highlight')).toHaveLength(1)
   expect(document.querySelector('.odyssey-data-update-highlight').closest('[data-research-node-id]').getAttribute('data-research-node-id')).toBe('a')
   expect(document.querySelector('iframe')).toBe(frame);expect(document.querySelector('input')).toBe(input);expect(input.value).toBe('保留筛选')
   await react.act(async()=>{vi.advanceTimersByTime(1200)})
   expect(document.querySelector('.odyssey-data-update-highlight')).toBe(null)
   await react.act(async()=>store.publish('s',[row('a',2000,{status:'error'}),row('b')]))
   expect(document.querySelector('.odyssey-data-update-highlight')).toBe(null)
  }finally{await react.act(async()=>roots.forEach(root=>root.unmount()));vi.useRealTimers();vi.unstubAllGlobals();await window.happyDOM.close()}
 })
})
