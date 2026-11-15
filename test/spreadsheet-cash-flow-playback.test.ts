// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest'
import {mountCashFlowGuide} from '../src/preload/spreadsheet/cash-flow-guide'
import type {HomeGuidePointerAction} from '../src/preload/home-guide-pointer'

it('starts empty, opens the import control, and uses the Insert menu before generating the docked component',async()=>{
 const controller=new AbortController()
 const toggle=document.createElement('button')
 toggle.dataset.odysseyPanelEntry='right'
 toggle.setAttribute('aria-expanded','false')
 const form=document.createElement('section')
 const control=(copy:string,action?:()=>void)=>{
  const button=document.createElement('button')
  button.textContent=copy
  if(action)button.addEventListener('click',action)
  button.getBoundingClientRect=()=>new DOMRect(20,20,100,30)
  form.append(button)
  return button
 }
 let armed=false,picking=false,imported=false,menu=false,shown=false
 const upload=control('导入 Excel / CSV',()=>{if(armed)picking=true})
 const file=control('三家公司季度财报.xlsx',()=>{if(picking)imported=true})
 const insert=control('插入',()=>{menu=true})
 const smart=control('智能组件',()=>{if(menu)shown=true})
 const input=document.createElement('textarea')
 const submit=control('生成组件')
 form.append(input)
 document.body.append(toggle,form)
 const view={
  cashFlowGuideImportButton:()=>upload,
  armCashFlowGuideImport:()=>{armed=true},
  cashFlowGuideFileButton:()=>picking?file:undefined,
  get cashFlowGuideImported(){return imported},
  cashFlowGuideInsertButton:()=>insert,
  cashFlowGuideSmartButton:()=>menu?smart:undefined,
  cashFlowGuideComponentForm:()=>shown?{input,submit}:undefined,
  insertCashFlowGuideComponent:vi.fn(async(wait:()=>Promise<void>)=>{await wait();return undefined}),
  closeCashFlowGuideControls:vi.fn()
 }
 const point=vi.fn(async(_action:HomeGuidePointerAction)=>{})
 const adapter=mountCashFlowGuide(document,{
  signal:controller.signal,runId:'test-run',sessionId:'test-session',cwd:'/tmp/demo',fresh:true,
  wait:async()=>{},waitUntilPlaying:async()=>{},onStatus:()=>{},point
 },{cashFlowGuideView:()=>view} as unknown as Parameters<typeof mountCashFlowGuide>[2])
 try{
  await adapter.runStep('empty')
  expect(imported).toBe(false)
  await adapter.runStep('import-file')
  expect(imported).toBe(true)
  await adapter.runStep('component')
  expect(input.value).toContain('现金流拆解台')
  expect(view.insertCashFlowGuideComponent).toHaveBeenCalledOnce()
  expect(point.mock.calls.map(([action])=>action.target.textContent)).toEqual([upload,file,insert,smart,submit].map(target=>target.textContent))
 }finally{
  adapter.dispose()
  toggle.remove()
  form.remove()
 }
})
