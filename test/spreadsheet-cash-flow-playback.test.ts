// @vitest-environment happy-dom
import {expect,it,vi} from 'vitest'
import {mountCashFlowGuide} from '../src/preload/spreadsheet/cash-flow-guide'
import type {HomeGuidePointerAction} from '../src/preload/home-guide-pointer'

it('maintains the right chat and switches the generated component through the native More menu',async()=>{
 const controller=new AbortController()
 const toggle=document.createElement('button')
 toggle.dataset.odysseyPanelEntry='right'
 toggle.setAttribute('aria-expanded','true')
 const toggleRight=vi.fn(()=>toggle.setAttribute('aria-expanded',String(toggle.getAttribute('aria-expanded')!=='true')))
 toggle.onclick=toggleRight
 const form=document.createElement('section')
 const control=(copy:string,action?:()=>void)=>{
  const button=document.createElement('button')
  button.textContent=copy
  if(action)button.addEventListener('click',action)
  button.getBoundingClientRect=()=>new DOMRect(20,20,100,30)
  form.append(button)
  return button
 }
 let armed=false,picking=false,imported=false,menu=false,shown=false,generated=false,moreOpen=false,themesOpen=false,themed=false
 let upload=control('导入 Excel / CSV',()=>{if(armed)picking=true})
 const originalUpload=upload
 const file=control('三家公司季度财报.xlsx',()=>{if(picking)imported=true})
 const insert=control('插入',()=>{menu=true})
 const smart=control('智能组件',()=>{if(menu)shown=true})
 const input=document.createElement('textarea')
 const submit=control('生成组件')
 const more=control('组件更多操作',()=>{if(generated)moreOpen=true})
 const theme=control('模式切换',()=>{if(moreOpen)themesOpen=true})
 const enterprise=control('易方达模式',()=>{if(themesOpen)themed=true})
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
  dragCashFlowGuideRange:vi.fn(async()=>{}),
  insertCashFlowGuideComponent:vi.fn(async(wait:()=>Promise<void>)=>{await wait();generated=true;return undefined}),
  cashFlowGuideThemeControl:(action:string)=>action==='more'&&generated?more:action==='theme'&&moreOpen?theme:action==='theme-enterprise'&&themesOpen?enterprise:undefined,
  get cashFlowGuideEnterpriseThemeSaved(){return themed},
  closeCashFlowGuideControls:vi.fn()
 }
 const point=vi.fn(async(action:HomeGuidePointerAction)=>{
  if(action.target===originalUpload){
   originalUpload.remove()
   upload=control('导入 Excel / CSV',()=>{if(armed)picking=true})
  }
 })
 const adapter=mountCashFlowGuide(document,{
  signal:controller.signal,runId:'test-run',sessionId:'test-session',cwd:'/tmp/demo',fresh:true,
  wait:async()=>{},waitUntilPlaying:async()=>{},onStatus:()=>{},point
 },{cashFlowGuideView:()=>view} as unknown as Parameters<typeof mountCashFlowGuide>[2])
 try{
  await adapter.runStep('empty')
  expect(imported).toBe(false)
  await adapter.runStep('import-file')
  expect(imported).toBe(true)
  await adapter.runStep('select-component')
  await adapter.runStep('component')
  await adapter.runStep('component-theme')
  expect(toggleRight).not.toHaveBeenCalled()
  expect(themed).toBe(true)
  expect(input.value).toContain('现金流拆解台')
  expect(view.insertCashFlowGuideComponent).toHaveBeenCalledOnce()
  expect(point.mock.calls.map(([action])=>action.target.textContent)).toEqual([originalUpload,upload,file,insert,smart,submit,more,theme,enterprise].map(target=>target.textContent))
 }finally{
  adapter.dispose()
  toggle.remove()
  form.remove()
 }
})

it('types after a real range chip while its native display marker changes',async()=>{
 const controller=new AbortController()
 const toggle=document.createElement('button')
 toggle.dataset.odysseyPanelEntry='right'
 toggle.setAttribute('aria-expanded','false')
 toggle.onclick=()=>toggle.setAttribute('aria-expanded','true')
 const panel=document.createElement('section')
 panel.className='t8lSSG_panel'
 panel.innerHTML='<div class="uV2eYG_root"><div class="uV2eYG_grow"><textarea data-odyssey-file-reference-session="test-session"></textarea><button class="uV2eYG_primary">发送</button></div></div>'
 const input=panel.querySelector('textarea')!
 const send=panel.querySelector('button')!
 for(const control of [input,send])control.getBoundingClientRect=()=>new DOMRect(20,20,100,30)
 input.addEventListener('input',()=>{input.value='\uE002'+input.value.slice(1)})
 const submit=vi.fn(()=>input.value)
 send.addEventListener('click',submit)
 document.body.append(toggle,panel)
 const view={
  cashFlowGuideImportButton:()=>toggle,
  referenceCashFlowGuideRange:()=>{
   const chip=document.createElement('span')
   chip.dataset.referenceSource='spreadsheet-range'
   chip.textContent='季度分析!A1:C5'
   input.parentElement!.append(chip)
   input.value='\uE001 '
  },
  closeCashFlowGuideControls:vi.fn()
 }
 const fetch=vi.spyOn(window,'fetch').mockImplementation(async()=>new Response(JSON.stringify({ok:true})))
 const adapter=mountCashFlowGuide(document,{
  signal:controller.signal,runId:'test-run',sessionId:'test-session',cwd:'/tmp/demo',fresh:true,
  wait:async()=>{},waitUntilPlaying:async()=>{},onStatus:()=>{}
 },{cashFlowGuideView:()=>view} as unknown as Parameters<typeof mountCashFlowGuide>[2])
 try{
  await adapter.runStep('empty')
  await adapter.runStep('ask-trend')
  expect(submit.mock.results[0]?.value).toBe('\uE002 给选区画两条同比趋势线，指出利润与经营现金流背离最明显的一季。')
 }finally{
  adapter.dispose()
  fetch.mockRestore()
  toggle.remove()
  panel.remove()
 }
})
