// @vitest-environment happy-dom
// The DOM must exist before React DOM initializes its native input event support.
import {expect,it} from 'vitest'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'

it('does not automatically save chart preedit text before composition completes',async()=>{
 const part='ppt/slides/slide1.xml'
 const chart={part:'ppt/charts/chart1.xml',title:'原始标题',legend:true,categories:['Q1'],series:[{name:'收入',values:[10]}]}
 const node={id:part+'#node:5',nodeId:'5',part,type:'chart',name:'图表',geometry:{x:0,y:0,width:200,height:100,rotation:0},chart}
 const documentModel={id:'chart-composition',name:'demo.pptx',version:'1'.repeat(64),basisToken:'chart-composition-basis',slides:[{index:0,part,nodes:[node],fields:[]}]}
 const requests:any[]=[]
 const previousBridge=Object.getOwnPropertyDescriptor(window,'sherlockPptEditor')
 const previousActFlag=Object.getOwnPropertyDescriptor(globalThis,'IS_REACT_ACT_ENVIRONMENT')
 Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',{configurable:true,value:true})
 Object.assign(window,{sherlockPptEditor:{
  open:async()=>({ok:true,document:documentModel}),
  save:async(request:any)=>{requests.push(request);return{ok:true,document:{...documentModel,version:'2'.repeat(64)}}}
 }})
 function Preview(){
  return React.createElement('div',{'data-pptx-node-id':'5','data-pptx-part':part,style:{width:200,height:100}},'图表')
 }
 const Component=createPptxEditorComponent(React,Preview,undefined,createPortal)
 const host=document.createElement('div');document.body.appendChild(host)
 const root=createRoot(host)
 const waitForAutosave=()=>new Promise(resolve=>setTimeout(resolve,380))
 const nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!
 try{
  await act(async()=>{root.render(React.createElement(Component,{scope:{sessionId:'composition'},path:'demo.pptx'}));await Promise.resolve()})
  await act(async()=>host.querySelector('[data-pptx-node-id]')!.dispatchEvent(new MouseEvent('dblclick',{bubbles:true})))
  const title=host.querySelector<HTMLInputElement>('[aria-label="图表标题"]')!
  expect(title.value).toBe('原始标题')
  await act(async()=>{
   title.focus()
   title.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))
   nativeValue.call(title,'zhong')
   title.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'zhong'}))
  })
  await act(async()=>{await waitForAutosave()})
  expect(title.value).toBe('zhong')
  expect(requests).toHaveLength(0)

  await act(async()=>{
   nativeValue.call(title,'中文图表标题')
   title.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文图表标题'}))
   title.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:false,inputType:'insertText',data:'中文图表标题'}))
  })
  await act(async()=>{await waitForAutosave()})
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatchObject({
   path:'demo.pptx',basisToken:'chart-composition-basis',
   objects:[{id:part+'#node:5',chart:{title:'中文图表标题'}}]
  })
  expect(document.activeElement).toBe(title)
  expect(title.value).toBe('中文图表标题')
 }finally{
  await act(async()=>root.unmount())
  host.remove()
  if(previousBridge)Object.defineProperty(window,'sherlockPptEditor',previousBridge)
  else delete (window as any).sherlockPptEditor
  if(previousActFlag)Object.defineProperty(globalThis,'IS_REACT_ACT_ENVIRONMENT',previousActFlag)
  else delete (globalThis as any).IS_REACT_ACT_ENVIRONMENT
 }
})
