import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'

const node={nodeId:'2',type:'shape',name:'标题',geometry:{x:10,y:20,width:200,height:100,rotation:0}}
const doc={id:'document',name:'demo.pptx',version:'v1',slides:[{index:0,part:'ppt/slides/slide1.xml',nodes:[{...node,id:'ppt/slides/slide1.xml#node:2',part:'ppt/slides/slide1.xml'}],fields:[{id:'title',nodeId:'2',paragraphIndex:0,label:'标题',text:'原始标题'}]},{index:1,part:'ppt/slides/slide2.xml',nodes:[{...node,id:'ppt/slides/slide2.xml#node:2',part:'ppt/slides/slide2.xml'}],fields:[{id:'cell',nodeId:'2',paragraphIndex:0,label:'表格 · 1 行 1 列',text:'100'}]}]}
function FakePreview(){return React.createElement('div',{'data-preview':''},doc.slides.map(slide=>React.createElement('div',{key:slide.index,'data-pptx-node-id':'2','data-pptx-part':slide.part,'data-pptx-width':'200','data-pptx-height':'100',style:{position:'absolute',width:200,height:100}},React.createElement('div',{'data-pptx-paragraph':'0'},slide.fields[0]!.text))))}
const editable=(host:any)=>host.querySelector('[data-pptx-field-id=title]')

async function mount(bridge:any,props:any={},Preview:any=FakePreview){
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
async function input(win:any,element:any,value:string){await act(async()=>{element.textContent=value;element.dispatchEvent(new win.Event('input',{bubbles:true}));await Promise.resolve()})}
describe('shared PPTX content editor',()=>{
 it('edits actual slide text by default and supports undo/redo',async()=>{
  const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})})
  try{expect(editable(view.host)?.getAttribute('contenteditable')).toBe('true');expect(view.host.querySelector('textarea')).toBeNull();await act(async()=>editable(view.host).focus());await input(view.win,editable(view.host),'新标题');await click(view.host,'撤销');expect(editable(view.host)?.textContent).toBe('原始标题');await click(view.host,'重做');expect(editable(view.host)?.textContent).toBe('新标题')}finally{await view.close()}
 })
 it('preserves typing during a save and reports errors without discarding the draft',async()=>{
  let finish:(r:any)=>void=()=>{},request:any
  const view=await mount({open:async()=>({ok:true,document:doc}),save:(value:any)=>{request=value;return new Promise(resolve=>{finish=resolve})}})
  try{await input(view.win,editable(view.host),'保存快照');await click(view.host,'保存');await input(view.win,editable(view.host),'保存期间继续输入');await act(async()=>{finish({ok:true,document:{...doc,version:'v2',slides:[{...doc.slides[0],fields:[{...doc.slides[0]!.fields[0],text:'保存快照'}]},doc.slides[1]]}});await Promise.resolve()});expect(request.edits).toEqual([{id:'title',text:'保存快照'}]);expect(view.host.textContent).toContain('未保存');expect(editable(view.host)?.textContent).toBe('保存期间继续输入');await click(view.host,'保存');await act(async()=>{finish({ok:false,code:'conflict',error:'文件已更改'});await Promise.resolve()});expect(view.host.textContent).toContain('文件已更改');expect(editable(view.host)?.textContent).toBe('保存期间继续输入')}finally{await view.close()}
 })
 it('publishes existing sidebar mode and save controls while keeping Research buttons available',async()=>{
  let controls:any,state:any
  const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})},{toolbar:'host',onToolbarState:(v:any)=>{state=v},onToolbarControls:(v:any)=>{controls=v}})
  try{expect(state.modes).toBe(true);expect(controls.setMode).toBeTypeOf('function');await act(async()=>{controls.setMode('edit');await Promise.resolve()});expect(editable(view.host)?.textContent).toBe('原始标题')}finally{await view.close()}
 })
})

it('reopens a draft after its editor unmounts',async()=>{
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})})
 try{
  await input(view.win,editable(view.host),'保留编辑稿')
  await act(async()=>view.root.render(React.createElement('div',null,'另一份文件')))
  await view.render();await Promise.resolve()
  expect(editable(view.host)?.textContent).toBe('保留编辑稿')
 }finally{await view.close()}
})

it('uses a revocable edit session for saving and re-reading after preview expiry',async()=>{
 const tokenDocument={...doc,editToken:'edit-session'};let opened=false,failOnce=true
 const view=await mount({open:async(value:any)=>{if(opened&&value.editToken!=='edit-session')return{ok:false,error:'preview expired'};opened=true;return{ok:true,document:tokenDocument}},save:async(value:any)=>value.editToken==='edit-session'?(failOnce?(failOnce=false,{ok:false,error:'重试保存'}):{ok:true,document:{...tokenDocument,slides:[{...doc.slides[0],fields:[{...doc.slides[0]!.fields[0],text:value.edits[0]?.text??'原始标题'}]},doc.slides[1]]}}):{ok:false,error:'preview expired'}},{path:'sherlock-preview://example/'})
 try{Object.defineProperty(view.win,'confirm',{value:()=>true});await input(view.win,editable(view.host),'长时间编辑');await click(view.host,'保存');await click(view.host,'重新读取文件');await input(view.win,editable(view.host),'重读后编辑');await click(view.host,'保存');expect(view.host.textContent).toContain('已保存');expect(view.host.textContent).not.toContain('preview expired')}finally{await view.close()}
})

it('moves the preview to the selected slide and retains it after save refresh',async()=>{
 function Preview(props:any){const [index,setIndex]=React.useState(0);React.useEffect(()=>{props.onPptxViewer?.({goToSlide:async(value:number)=>setIndex(value)});return()=>props.onPptxViewer?.(null)},[]);return React.createElement('div',{'data-preview':''},'幻灯片 '+(index+1),React.createElement(FakePreview))}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:{...doc,version:'v2'}})}, {}, Preview)
 try{await act(async()=>{const select=view.host.querySelector('select')!;select.value='1';select.dispatchEvent(new view.win.Event('change',{bubbles:true}));await Promise.resolve()});expect(view.host.querySelector('[data-preview]')?.textContent).toContain('幻灯片 2');await input(view.win,editable(view.host),'200');await click(view.host,'保存');expect(view.host.querySelector('[data-preview]')?.textContent).toContain('幻灯片 2')}finally{await view.close()}
})

it('keeps the caret and undo for continued typing when a save resolves',async()=>{
 let finish:(r:any)=>void=()=>{}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:()=>new Promise(resolve=>{finish=resolve})})
 try{
  const paragraph=editable(view.host);await act(async()=>paragraph.focus());await input(view.win,paragraph,'已保存快照')
  await act(async()=>paragraph.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,key:'s',metaKey:true})))
  await input(view.win,paragraph,'保存时继续输入')
  await act(async()=>{finish({ok:true,document:{...doc,previewUrl:'sherlock-preview://renewed/',version:'v2',slides:[{...doc.slides[0],fields:[{...doc.slides[0]!.fields[0],text:'已保存快照'}]},doc.slides[1]]}});await Promise.resolve()})
  expect(view.win.document.activeElement).toBe(paragraph);expect(editable(view.host)).toBe(paragraph);expect(paragraph.textContent).toBe('保存时继续输入')
  await click(view.host,'撤销');expect(editable(view.host)?.textContent).toBe('已保存快照')
  await click(view.host,'重做');expect(editable(view.host)?.textContent).toBe('保存时继续输入')
 }finally{await view.close()}
})
it('closes a chart draft when the same viewer switches to another file',async()=>{
 const props={path:'a.pptx'},chart={part:'ppt/charts/chart1.xml',title:'A图表',legend:true,categories:['Q1'],series:[{name:'收入',values:[10]}]},a={...doc,id:'a',slides:[{...doc.slides[0],nodes:[{...doc.slides[0]!.nodes[0],type:'chart',chart}]}]},b={...a,id:'b',slides:[{...a.slides[0]!,nodes:[{...a.slides[0]!.nodes[0],chart:{...chart,title:'B图表'}}]}]}
 const view=await mount({open:async(v:any)=>({ok:true,document:v.path==='a.pptx'?a:b}),save:async()=>({ok:true,document:b})},props)
 try{
  await act(async()=>view.host.querySelector('[data-pptx-node-id]')!.dispatchEvent(new view.win.MouseEvent('dblclick',{bubbles:true})))
  expect(view.host.querySelector('[role=dialog]')).toBeTruthy();props.path='b.pptx';await view.render()
  expect(view.host.querySelector('[role=dialog]')).toBeNull()
 }finally{await view.close()}
})
