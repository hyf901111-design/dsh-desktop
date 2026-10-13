import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'

const doc={id:'document',name:'demo.pptx',version:'v1',slides:[{index:0,fields:[{id:'title',label:'标题',text:'原始标题'}]},{index:1,fields:[{id:'cell',label:'表格 · 1 行 1 列',text:'100'}]}]}
async function mount(bridge:any,props:any={},Preview:any=()=>React.createElement('div',{'data-preview':''},'幻灯片预览')){
 const win=new Window({url:'http://localhost/'}),descriptors=new Map(['window','document','navigator','CustomEvent','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 Object.defineProperties(globalThis,{window:{configurable:true,value:win},document:{configurable:true,value:win.document},navigator:{configurable:true,value:win.navigator},CustomEvent:{configurable:true,value:win.CustomEvent},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}})
 Object.assign(win,{sherlockPptEditor:bridge})
 const Component=createPptxEditorComponent(React,Preview)
 const host=win.document.createElement('div');win.document.body.appendChild(host);const root=createRoot(host as any)
 const render=async()=>{await act(async()=>{root.render(React.createElement(Component,{scope:{sessionId:'s',cwd:''},path:'demo.pptx',...props}));await Promise.resolve()})}
 await render()
 return{win,host,root,render,async close(){await act(async()=>root.unmount());for(const [k,d]of descriptors){if(d)Object.defineProperty(globalThis,k,d);else delete (globalThis as any)[k]}}}
}
async function click(host:any,text:string){const button=[...host.querySelectorAll('button')].find((b:any)=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>{button.click();await Promise.resolve()})}
async function input(win:any,element:any,value:string){await act(async()=>{element.value=value;element.dispatchEvent(new win.Event('input',{bubbles:true}));await Promise.resolve()})}
describe('shared PPTX content editor',()=>{
 it('edits by slide and retains draft while switching back to preview',async()=>{
  const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})})
  try{await click(view.host,'编辑内容');expect(view.host.querySelector('textarea')?.value).toBe('原始标题');await input(view.win,view.host.querySelector('textarea'),'新标题');await click(view.host,'预览');await click(view.host,'编辑内容');expect(view.host.querySelector('textarea')?.value).toBe('新标题');await act(async()=>{const select=view.host.querySelector('select')!;select.value='1';select.dispatchEvent(new view.win.Event('change',{bubbles:true}))});expect(view.host.querySelector('textarea')?.value).toBe('100')}finally{await view.close()}
 })
 it('preserves typing during a save and reports errors without discarding the draft',async()=>{
  let finish:(r:any)=>void=()=>{},request:any
  const view=await mount({open:async()=>({ok:true,document:doc}),save:(value:any)=>{request=value;return new Promise(resolve=>{finish=resolve})}})
  try{await click(view.host,'编辑内容');await input(view.win,view.host.querySelector('textarea'),'保存快照');await click(view.host,'保存');await input(view.win,view.host.querySelector('textarea'),'保存期间继续输入');await act(async()=>{finish({ok:true,document:{...doc,version:'v2',slides:[{index:0,fields:[{id:'title',label:'标题',text:'保存快照'}]},doc.slides[1]]}});await Promise.resolve()});expect(request.edits).toEqual([{id:'title',text:'保存快照'}]);expect(view.host.textContent).toContain('未保存');expect(view.host.querySelector('textarea')?.value).toBe('保存期间继续输入');await click(view.host,'保存');await act(async()=>{finish({ok:false,code:'conflict',error:'文件已更改'});await Promise.resolve()});expect(view.host.textContent).toContain('文件已更改');expect(view.host.querySelector('textarea')?.value).toBe('保存期间继续输入')}finally{await view.close()}
 })
 it('publishes existing sidebar mode and save controls while keeping Research buttons available',async()=>{
  let controls:any,state:any
  const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})},{toolbar:'host',onToolbarState:(v:any)=>{state=v},onToolbarControls:(v:any)=>{controls=v}})
  try{expect(state.modes).toBe(true);expect(controls.setMode).toBeTypeOf('function');await act(async()=>{controls.setMode('edit');await Promise.resolve()});expect(view.host.querySelector('textarea')?.value).toBe('原始标题')}finally{await view.close()}
 })
})

it('reopens a draft after its editor unmounts',async()=>{
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})})
 try{
  await click(view.host,'编辑内容');await input(view.win,view.host.querySelector('textarea'),'保留编辑稿')
  await act(async()=>view.root.render(React.createElement('div',null,'另一份文件')))
  await view.render();await click(view.host,'编辑内容')
  expect(view.host.querySelector('textarea')?.value).toBe('保留编辑稿')
 }finally{await view.close()}
})

it('uses a revocable edit session for saving and re-reading after preview expiry',async()=>{
 const tokenDocument={...doc,editToken:'edit-session'};let opened=false,failOnce=true
 const view=await mount({open:async(value:any)=>{if(opened&&value.editToken!=='edit-session')return{ok:false,error:'preview expired'};opened=true;return{ok:true,document:tokenDocument}},save:async(value:any)=>value.editToken==='edit-session'?(failOnce?(failOnce=false,{ok:false,error:'重试保存'}):{ok:true,document:{...tokenDocument,slides:[{index:0,fields:[{id:'title',label:'标题',text:value.edits[0]?.text??'原始标题'}]},doc.slides[1]]}}):{ok:false,error:'preview expired'}},{path:'sherlock-preview://example/'})
 try{Object.defineProperty(view.win,'confirm',{value:()=>true});await click(view.host,'编辑内容');await input(view.win,view.host.querySelector('textarea'),'长时间编辑');await click(view.host,'保存');await click(view.host,'重新读取文件');await input(view.win,view.host.querySelector('textarea'),'重读后编辑');await click(view.host,'保存');expect(view.host.textContent).toContain('已保存');expect(view.host.textContent).not.toContain('preview expired')}finally{await view.close()}
})

it('moves the preview to the selected slide and retains it after save refresh',async()=>{
 function Preview(props:any){const [index,setIndex]=React.useState(0);React.useEffect(()=>{props.onPptxViewer?.({goToSlide:async(value:number)=>setIndex(value)});return()=>props.onPptxViewer?.(null)},[]);return React.createElement('div',{'data-preview':''},'幻灯片 '+(index+1))}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:{...doc,version:'v2'}})}, {}, Preview)
 try{await click(view.host,'编辑内容');await act(async()=>{const select=view.host.querySelector('select')!;select.value='1';select.dispatchEvent(new view.win.Event('change',{bubbles:true}));await Promise.resolve()});expect(view.host.querySelector('[data-preview]')?.textContent).toBe('幻灯片 2');await input(view.win,view.host.querySelector('textarea'),'200');await click(view.host,'保存');expect(view.host.querySelector('[data-preview]')?.textContent).toBe('幻灯片 2')}finally{await view.close()}
})
