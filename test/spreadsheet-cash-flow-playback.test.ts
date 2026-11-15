// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest'
import {mountCashFlowGuide} from '../src/preload/spreadsheet/cash-flow-guide'

it('generates from the native docked form when a pointer cue cannot locate its paint region',async()=>{
 const controller=new AbortController()
 const toggle=document.createElement('button')
 toggle.dataset.odysseyPanelEntry='right'
 toggle.setAttribute('aria-expanded','true')
 const form=document.createElement('section')
 const input=document.createElement('textarea')
 const submit=document.createElement('button')
 form.append(input,submit)
 document.body.append(toggle,form)
 const view={
  applyCashFlowGuide:vi.fn(async()=>undefined),
  openCashFlowGuideComponent:()=>({input,submit}),
  insertCashFlowGuideComponent:vi.fn(async(wait:()=>Promise<void>)=>{await wait();return undefined}),
  closeCashFlowGuideComponent:vi.fn()
 }
 const fetch=vi.spyOn(window,'fetch').mockImplementation(async()=>new Response(JSON.stringify({ok:true})))
 const adapter=mountCashFlowGuide(document,{
  signal:controller.signal,runId:'test-run',sessionId:'test-session',cwd:'/tmp/demo',fresh:true,
  wait:async()=>{},waitUntilPlaying:async()=>{},onStatus:()=>{},point:vi.fn(async()=>{})
 },{cashFlowGuideView:()=>view} as unknown as Parameters<typeof mountCashFlowGuide>[2])
 try{
  await adapter.runStep('source')
  toggle.setAttribute('aria-expanded','false')
  await adapter.runStep('component')
  expect(input.value).toContain('现金流拆解台')
  expect(view.insertCashFlowGuideComponent).toHaveBeenCalledOnce()
  expect(fetch.mock.calls.map(call=>JSON.parse(String(call[1]?.body)).action)).toEqual(['advance','flush'])
 }finally{
  adapter.dispose()
  fetch.mockRestore()
  toggle.remove()
  form.remove()
 }
})
