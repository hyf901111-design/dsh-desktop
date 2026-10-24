import { describe, expect, it } from 'vitest'
import { Window } from 'happy-dom'
import React, {act} from 'react'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'

const node={nodeId:'2',type:'shape',name:'标题',geometry:{x:10,y:20,width:200,height:100,rotation:0}}
const doc={id:'document',name:'demo.pptx',version:'v1',slides:[{index:0,part:'ppt/slides/slide1.xml',nodes:[{...node,id:'ppt/slides/slide1.xml#node:2',part:'ppt/slides/slide1.xml'}],fields:[{id:'title',nodeId:'2',paragraphIndex:0,label:'标题',text:'原始标题'}]},{index:1,part:'ppt/slides/slide2.xml',nodes:[{...node,id:'ppt/slides/slide2.xml#node:2',part:'ppt/slides/slide2.xml'}],fields:[{id:'cell',nodeId:'2',paragraphIndex:0,label:'表格 · 1 行 1 列',text:'100'}]}]}
function FakePreview(){return React.createElement('div',{'data-preview':''},doc.slides.map(slide=>React.createElement('div',{key:slide.index,'data-pptx-node-id':'2','data-pptx-part':slide.part,'data-pptx-width':'200','data-pptx-height':'100',style:{position:'absolute',width:200,height:100}},React.createElement('div',{'data-pptx-paragraph':'0'},slide.fields[0]!.text))))}
const editable=(host:any)=>host.querySelector('[data-pptx-field-id=title]')

async function mount(bridge:any,props:any={},Preview:any=FakePreview){
 const win=new Window({url:'http://localhost/'}),descriptors=new Map(['window','document','navigator','CustomEvent','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 // happy-dom has no layout. Model a visible pane rather than a zero-size reader.
 win.HTMLElement.prototype.getBoundingClientRect=function(){return this.hasAttribute('data-pptx-node-id')?new win.DOMRect(100,180,200,100):new win.DOMRect(0,0,win.innerWidth,win.innerHeight)}
 Object.defineProperties(globalThis,{window:{configurable:true,value:win},document:{configurable:true,value:win.document},navigator:{configurable:true,value:win.navigator},CustomEvent:{configurable:true,value:win.CustomEvent},IS_REACT_ACT_ENVIRONMENT:{configurable:true,value:true}})
 Object.assign(win,{sherlockPptEditor:bridge})
 const Component=createPptxEditorComponent(React,Preview,undefined,createPortal)
 const host=win.document.createElement('div');win.document.body.appendChild(host);const root=createRoot(host as any)
 const render=async()=>{let controls:any;await act(async()=>{root.render(React.createElement(Component,{scope:{sessionId:'s',cwd:''},path:'demo.pptx',...props,onToolbarControls:(value:any)=>{controls=value;props.onToolbarControls?.(value)}}));await Promise.resolve()});await act(async()=>{await controls.setMode('edit')})}
 await render()
 return{win,host,root,render,async close(){await act(async()=>root.unmount());for(const [k,d]of descriptors){if(d)Object.defineProperty(globalThis,k,d);else delete (globalThis as any)[k]}}}
}
async function click(host:any,text:string){
 const key=({'撤销':'z','重做':'y','保存':'s'} as Record<string,string>)[text]
 if(key){await act(async()=>host.querySelector('[data-ppt-editor]').dispatchEvent(new host.ownerDocument.defaultView.KeyboardEvent('keydown',{bubbles:true,key,metaKey:true})));return}
 const button=[...host.querySelectorAll('button')].find((b:any)=>b.textContent===text);expect(button).toBeTruthy();await act(async()=>{button.click();await Promise.resolve()})
}
async function input(win:any,element:any,value:string){await act(async()=>{element.textContent=value;element.dispatchEvent(new win.Event('input',{bubbles:true}));await Promise.resolve()})}
describe('shared PPTX content editor',()=>{
 it('edits actual slide text after explicit entry and supports undo/redo',async()=>{
  const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})})
  try{expect(editable(view.host)?.getAttribute('contenteditable')).toBe('true');expect(view.host.querySelector('textarea')).toBeNull();await act(async()=>editable(view.host).focus());await input(view.win,editable(view.host),'新标题');await click(view.host,'撤销');expect(editable(view.host)?.textContent).toBe('原始标题');await click(view.host,'重做');expect(editable(view.host)?.textContent).toBe('新标题')}finally{await view.close()}
 })
 it('preserves typing during a save and reports errors without discarding the draft',async()=>{
  let finish:(r:any)=>void=()=>{},request:any
  const view=await mount({open:async()=>({ok:true,document:doc}),save:(value:any)=>{request=value;return new Promise(resolve=>{finish=resolve})}})
  try{await input(view.win,editable(view.host),'保存快照');await click(view.host,'保存');await input(view.win,editable(view.host),'保存期间继续输入');await act(async()=>{finish({ok:true,document:{...doc,version:'v2',slides:[{...doc.slides[0],fields:[{...doc.slides[0]!.fields[0],text:'保存快照'}]},doc.slides[1]]}});await Promise.resolve()});expect(request.edits).toEqual([{id:'title',text:'保存快照'}]);expect(view.host.textContent).toContain('未保存');expect(editable(view.host)?.textContent).toBe('保存期间继续输入');await click(view.host,'保存');await act(async()=>{finish({ok:false,code:'conflict',error:'文件已更改'});await Promise.resolve()});expect(view.host.textContent).toContain('文件已更改');expect(editable(view.host)?.textContent).toBe('保存期间继续输入')}finally{await view.close()}
 })
 it('publishes the explicit mode controls while keeping manual save controls hidden',async()=>{
  let controls:any,state:any
  const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})},{toolbar:'host',onToolbarState:(v:any)=>{state=v},onToolbarControls:(v:any)=>{controls=v}})
  try{expect(state.modes).toBe(true);expect(state.mode).toBe('edit');expect(state.editable).toBe(true);expect(typeof controls.setMode).toBe('function');expect(editable(view.host)?.textContent).toBe('原始标题')}finally{await view.close()}
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

it('keeps the existing slide DOM after shortcut save',async()=>{
 function Preview(props:any){React.useEffect(()=>{props.onPptxViewer?.({currentSlideIndex:1,goToSlide:async()=>{}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement(FakePreview)}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:{...doc,version:'v2'}})}, {}, Preview)
 try{const preview=view.host.querySelector('[data-preview]');await input(view.win,editable(view.host),'200');await click(view.host,'保存');expect(view.host.querySelector('[data-preview]')).toBe(preview)}finally{await view.close()}
})

it('shows a movable format toolbar above selected content without a fixed control row',async()=>{
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc})})
 try{
  expect(view.host.querySelector('.sherlock-ppt-controls')).toBeNull()
  expect(view.win.document.querySelector('[aria-label="对象格式"]')).toBeNull()
  await act(async()=>editable(view.host).focus())
  const toolbar=view.win.document.querySelector('[role=toolbar][aria-label="对象格式"]')! as any
  expect(toolbar).toBeTruthy();expect(view.host.contains(toolbar)).toBe(false)
  const handle=toolbar.querySelector('[aria-label="拖动格式工具栏"]')!
  const before={left:parseFloat(toolbar.style.left),top:parseFloat(toolbar.style.top)}
  await act(async()=>{
   handle.dispatchEvent(new view.win.PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:1,clientX:100,clientY:100}))
   view.win.document.dispatchEvent(new view.win.PointerEvent('pointermove',{bubbles:true,pointerId:1,clientX:150,clientY:140}))
   view.win.document.dispatchEvent(new view.win.PointerEvent('pointerup',{bubbles:true,pointerId:1}))
  })
  expect(parseFloat(toolbar.style.left)).toBe(before.left+50)
  expect(parseFloat(toolbar.style.top)).toBe(before.top+40)
  await act(async()=>editable(view.host).dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,key:'Escape'})))
  expect(view.win.document.querySelector('[role=toolbar][aria-label="对象格式"]')).toBeNull()
 }finally{await view.close()}
})

it('offers the original custom font and saves font selection automatically with undo support',async()=>{
 let saved:any
 const fontDoc={...doc,slides:doc.slides.map(s=>({...s,nodes:s.nodes.map(n=>({...n,fontFamily:'华文黑体_易方达'}))}))}
 const view=await mount({open:async()=>({ok:true,document:fontDoc}),save:async(value:any)=>{saved=value;return{ok:true,document:fontDoc}}})
 try{
  await act(async()=>editable(view.host).focus())
  const fonts=view.win.document.querySelector('select[aria-label="字体"]')! as any
  expect(fonts).toBeTruthy();expect(fonts.value).toBe('华文黑体_易方达')
  expect([...fonts.options].map((o:any)=>o.value)).toContain('Songti SC')
  await act(async()=>{fonts.value='Songti SC';fonts.dispatchEvent(new view.win.Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,350))})
  expect(saved.objects).toEqual([{id:fontDoc.slides[0]!.nodes[0]!.id,fontFamily:'Songti SC'}])
  await click(view.host,'撤销');expect(fonts.value).toBe('华文黑体_易方达')
 }finally{await view.close()}
})

it('changes bold and undoes it before a slow preview or save resolves without restarting its own preview',async()=>{
 let previews=0,finishSave:(v:any)=>void=()=>{}
 function Preview(props:any){React.useEffect(()=>{props.onPptxViewer?.({currentSlideIndex:0,open:async()=>{},goToSlide:async()=>{}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement('div',{'data-pptx-node-id':'2','data-pptx-part':'ppt/slides/slide1.xml','data-pptx-width':'200','data-pptx-height':'100'},React.createElement('div',{'data-pptx-paragraph':'0'},React.createElement('span',{style:{fontWeight:400}},'原始标题')))}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:()=>new Promise(resolve=>{finishSave=resolve}),preview:()=>{previews++;return new Promise(()=>{})}}, {}, Preview)
 try{
  // Immediate styling must not wait for the deliberately unresolved preview.
  await act(async()=>editable(view.host).focus());await click(view.win.document,'加粗')
  const span=editable(view.host).querySelector('span')
  expect(span.style.fontWeight).toBe('700')
  await act(async()=>editable(view.host).blur())
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350))});expect(previews).toBe(1)
  await act(async()=>{finishSave({ok:true,document:{...doc,version:'v2'}});await new Promise(resolve=>setTimeout(resolve,240))});expect(previews).toBe(1)
  await click(view.host,'撤销');expect(span.style.fontWeight).toBe('400')
 }finally{await view.close()}
})

it('coalesces rapid formatting while a preview is busy and renders only the latest state next',async()=>{
 const replies:Array<(value:any)=>void>=[],requests:any[]=[];let rendered=0
 function Preview(props:any){React.useEffect(()=>{props.onPptxViewer?.({currentSlideIndex:0,open:async()=>{rendered++},goToSlide:async()=>{}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement(FakePreview)}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc}),preview:(value:any)=>{requests.push(value);return new Promise(resolve=>replies.push(resolve))}}, {}, Preview)
 try{
  await act(async()=>editable(view.host).focus());await click(view.win.document,'加粗');await act(async()=>editable(view.host).blur())
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,210))});expect(requests).toHaveLength(1)
  await click(view.win.document,'取消加粗');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,210))})
  await click(view.win.document,'加粗');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,210))})
  expect(requests).toHaveLength(1)
  await act(async()=>{replies[0]!({ok:true,bytes:[1]});await new Promise(resolve=>setTimeout(resolve,220))})
  expect(rendered).toBe(0);expect(requests).toHaveLength(2);expect(requests[1].objects[0].bold).toBe(true)
  await act(async()=>{replies[1]!({ok:true,bytes:[2]});await Promise.resolve()});expect(rendered).toBe(1)
 }finally{await view.close()}
})

it('allows a fresh preview after re-reading the same file while an older preview is pending',async()=>{
 const replies:Array<(value:any)=>void>=[];let rendered=0
 function Preview(props:any){React.useEffect(()=>{props.onPptxViewer?.({currentSlideIndex:0,open:async()=>{rendered++},goToSlide:async()=>{}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement(FakePreview)}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:false,error:'保存失败'}),preview:()=>new Promise(resolve=>replies.push(resolve))}, {}, Preview)
 try{
  Object.defineProperty(view.win,'confirm',{value:()=>true})
  await act(async()=>editable(view.host).focus());await click(view.win.document,'加粗');await act(async()=>editable(view.host).blur());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,210))})
  expect(replies).toHaveLength(1);await click(view.host,'保存');await click(view.host,'重新读取文件')
  await act(async()=>editable(view.host).focus());await click(view.win.document,'加粗');await act(async()=>editable(view.host).blur());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,210))})
  expect(replies).toHaveLength(2)
  await act(async()=>{replies[0]!({ok:true,bytes:[1]});replies[1]!({ok:true,bytes:[2]});await Promise.resolve()});expect(rendered).toBe(1)
 }finally{await view.close()}
})

it('retries a preview version race after its own save without surfacing a false file-conflict error',async()=>{
 let finish:(value:any)=>void=()=>{};const requests:any[]=[]
 function Preview(props:any){React.useEffect(()=>{props.onPptxViewer?.({currentSlideIndex:0,open:async()=>{},goToSlide:async()=>{}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement(FakePreview)}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:{...doc,version:'v2'}}),preview:(value:any)=>{requests.push(value);return requests.length===1?new Promise(resolve=>{finish=resolve}):Promise.resolve({ok:true,bytes:[2]})}}, {}, Preview)
 try{
  await act(async()=>editable(view.host).focus());await click(view.win.document,'加粗');await act(async()=>editable(view.host).blur());await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350))})
  expect(requests[0].version).toBe('v1')
  await act(async()=>{finish({ok:false,error:'文件已更改'});await new Promise(resolve=>setTimeout(resolve,230))})
  expect(requests).toHaveLength(2);expect(requests[1].version).toBe('v2');expect(view.host.querySelector('[role=alert]')).toBeNull()
 }finally{await view.close()}
})

it('does not reopen or remount the presentation when leaving saved text editing',async()=>{
 let mounts=0,previewRequests=0,rendererOpens=0
 function Preview(props:any){React.useEffect(()=>{mounts++;props.onPptxViewer?.({currentSlideIndex:0,open:async()=>{rendererOpens++},goToSlide:async()=>{}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement(FakePreview)}
 const saved={...doc,version:'v2',previewUrl:'sherlock-preview://renewed/',slides:[{...doc.slides[0],fields:[{...doc.slides[0]!.fields[0],text:'直接修改'}]},doc.slides[1]]}
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:saved}),preview:async()=>{previewRequests++;return{ok:true,bytes:[1]}}},{},Preview)
 try{
  const paragraph=editable(view.host);await act(async()=>paragraph.focus());await input(view.win,paragraph,'直接修改');await click(view.host,'保存')
  await act(async()=>paragraph.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,key:'Escape'})))
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,220))})
  expect(mounts).toBe(1);expect(rendererOpens).toBe(0);expect(previewRequests).toBe(0)
  expect(editable(view.host)).toBe(paragraph);expect(paragraph.textContent).toBe('直接修改')
 }finally{await view.close()}
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

it('does not apply a pending preview from the previous file to a new viewer',async()=>{
 const props={path:'a.pptx'},requests:any[]=[],a={...doc,id:'a',version:'a-version'},b={...doc,id:'b',version:'b-version'}
 function Preview(p:any){React.useEffect(()=>{p.onPptxViewer?.({currentSlideIndex:0,goToSlide:async()=>{},open:async()=>{}});return()=>p.onPptxViewer?.(null)},[p.path]);return React.createElement(FakePreview)}
 const view=await mount({open:async(v:any)=>({ok:true,document:v.path==='a.pptx'?a:b}),preview:async(v:any)=>{requests.push(v);return{ok:false,error:'路径不匹配'}},save:async()=>({ok:true,document:b})},props,Preview)
 try{
  await act(async()=>editable(view.host).focus());await input(view.win,editable(view.host),'A的草稿');await act(async()=>editable(view.host).blur());props.path='b.pptx';await view.render()
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,220))})
  expect(requests.some(r=>r.path==='a.pptx'&&r.version==='b-version')).toBe(false);expect(view.host.textContent).not.toContain('路径不匹配')
 }finally{await view.close()}
})

it('rerenders resized group contents while text deselection keeps the current renderer',async()=>{
 let previewRequest:any,opens=0
 const groupDoc={...doc,slides:[{...doc.slides[0],nodes:[{...doc.slides[0]!.nodes[0],type:'group'}]}]}
 function Preview(props:any){React.useEffect(()=>{props.onPptxViewer?.({currentSlideIndex:0,goToSlide:async()=>{},open:async()=>{opens++}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement(FakePreview)}
 const view=await mount({open:async()=>({ok:true,document:groupDoc}),save:async()=>({ok:true,document:groupDoc}),preview:async(r:any)=>{previewRequest=r;return{ok:true,bytes:[0]}}},{},Preview)
 try{
  const object=view.host.querySelector('[data-pptx-node-id]')!
  await act(async()=>object.dispatchEvent(new view.win.PointerEvent('pointerdown',{bubbles:true,button:0})))
  await act(async()=>{
   view.win.document.querySelector('[data-pptx-handle=e]')!.dispatchEvent(new view.win.PointerEvent('pointerdown',{bubbles:true,button:0,clientX:200,clientY:100,pointerId:1}))
   view.win.document.dispatchEvent(new view.win.PointerEvent('pointermove',{bubbles:true,clientX:300,clientY:100,pointerId:1}))
   view.win.document.dispatchEvent(new view.win.PointerEvent('pointerup',{bubbles:true,pointerId:1}))
   await new Promise(resolve=>setTimeout(resolve,220))
  })
  expect(previewRequest.objects[0].geometry.width).toBe(300);expect(opens).toBe(1)
  await act(async()=>object.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,key:'Escape'})))
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,220))})
  expect(opens).toBe(1)
 }finally{await view.close()}
})

it('does not restore a stale selection when an earlier format preview finishes',async()=>{
 let finish:(r:any)=>void=()=>{},requests=0
 const namedDoc={...doc,slides:[doc.slides[0],{...doc.slides[1],nodes:[{...doc.slides[1]!.nodes[0],name:'另一个对象'}]}]}
 function Preview(props:any){React.useEffect(()=>{props.onPptxViewer?.({currentSlideIndex:0,goToSlide:async()=>{},open:async()=>{}});return()=>props.onPptxViewer?.(null)},[]);return React.createElement(FakePreview)}
 const view=await mount({open:async()=>({ok:true,document:namedDoc}),save:async()=>({ok:true,document:namedDoc}),preview:()=>{requests++;return new Promise(resolve=>{finish=resolve})}},{},Preview)
 try{
  await act(async()=>{editable(view.host).focus();editable(view.host).blur()})
  await act(async()=>([...view.win.document.querySelectorAll('[role=toolbar] button')].find(b=>b.textContent==='加粗')! as any).click())
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,220))});expect(requests).toBe(1)
  await act(async()=>view.host.querySelector('[data-pptx-part="ppt/slides/slide2.xml"]')!.dispatchEvent(new view.win.PointerEvent('pointerdown',{bubbles:true,button:0})))
  expect(view.win.document.querySelector('[role=toolbar]')!.textContent).toContain('另一个对象')
  await act(async()=>{finish({ok:true,bytes:[0]});await Promise.resolve()})
  expect(view.win.document.querySelector('[role=toolbar]')!.textContent).toContain('另一个对象')
 }finally{await view.close()}
})

it('restores the dragged toolbar position after closing chart data editing',async()=>{
 const chart={part:'ppt/charts/chart1.xml',title:'图表',legend:true,categories:['Q1'],series:[{name:'收入',values:[10]}]},chartDoc={...doc,slides:[{...doc.slides[0],nodes:[{...doc.slides[0]!.nodes[0],type:'chart',chart}]}]}
 const view=await mount({open:async()=>({ok:true,document:chartDoc}),save:async()=>({ok:true,document:chartDoc})})
 try{
  const object=view.host.querySelector('[data-pptx-node-id]')!
  Object.defineProperty(object,'getBoundingClientRect',{value:()=>({left:300,top:400,right:500,bottom:500,width:200,height:100})})
  await act(async()=>object.dispatchEvent(new view.win.PointerEvent('pointerdown',{bubbles:true,button:0})))
  let bar=view.win.document.querySelector('[role=toolbar]')! as any
  await act(async()=>{
   bar.querySelector('[aria-label="拖动格式工具栏"]').dispatchEvent(new view.win.PointerEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100,pointerId:1}))
   view.win.document.dispatchEvent(new view.win.PointerEvent('pointermove',{bubbles:true,clientX:150,clientY:140,pointerId:1}));view.win.document.dispatchEvent(new view.win.PointerEvent('pointerup',{bubbles:true,pointerId:1}))
  })
  const location=[bar.style.left,bar.style.top];expect(location).toEqual(['350px','360px'])
  await act(async()=>[...bar.querySelectorAll('button')].find((b:any)=>b.textContent==='编辑图表数据').click())
  expect(view.win.document.querySelector('[role=toolbar]')).toBeNull()
  await click(view.host,'关闭');bar=view.win.document.querySelector('[role=toolbar]')
  expect([bar.style.left,bar.style.top]).toEqual(location)
 }finally{await view.close()}
})

it('automatically saves chart changes without an apply button and undoes saved chart data',async()=>{
 const chart={part:'ppt/charts/chart1.xml',title:'图表',legend:true,categories:['Q1'],series:[{name:'收入',values:[10]}]},chartDoc={...doc,basisToken:'base',slides:[{...doc.slides[0],nodes:[{...doc.slides[0]!.nodes[0],type:'chart',chart}]}]},saves:any[]=[]
 const view=await mount({open:async()=>({ok:true,document:chartDoc}),save:async(r:any)=>{saves.push(r);return{ok:true,document:{...chartDoc,version:'v'+(saves.length+1)}}}})
 try{
  await act(async()=>view.host.querySelector('[data-pptx-node-id]')!.dispatchEvent(new view.win.PointerEvent('pointerdown',{bubbles:true,button:0})))
  await act(async()=>([...view.win.document.querySelectorAll('[role=toolbar] button')].find((b:any)=>b.textContent==='编辑图表数据') as any).click())
  expect(view.host.textContent).not.toContain('应用到幻灯片')
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))});expect(saves).toHaveLength(0)
  const field=view.host.querySelector('input[type=checkbox]') as any
  await act(async()=>field.click())
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves[0]).toMatchObject({basisToken:'base',objects:[{id:chartDoc.slides[0]!.nodes[0]!.id,chart:{legend:false}}]})
  await click(view.host,'撤销');expect(field.checked).toBe(true)
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves[1]).toMatchObject({version:'v2',objects:[]})
 }finally{await view.close()}
})

it('keeps redo and save shortcuts in the selected editor after undo releases text focus',async()=>{
 let saved:any
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async(r:any)=>{saved=r;return{ok:true,document:doc}}})
 try{
  await act(async()=>editable(view.host).focus());await input(view.win,editable(view.host),'快捷键连续编辑')
  await act(async()=>editable(view.host).dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true})))
  expect(view.win.document.activeElement).toBe(view.win.document.body);expect(editable(view.host).textContent).toBe('原始标题')
  await act(async()=>view.win.document.body.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true,shiftKey:true})))
  expect(editable(view.host).textContent).toBe('快捷键连续编辑')
  await act(async()=>view.win.document.body.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'s',metaKey:true})))
  expect(saved.edits).toEqual([{id:'title',text:'快捷键连续编辑'}])
  const outside=view.win.document.createElement('textarea');view.win.document.body.appendChild(outside);outside.focus()
  const outsideUndo=new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true})
  await act(async()=>outside.dispatchEvent(outsideUndo));expect(outsideUndo.defaultPrevented).toBe(false)
  outside.blur();await act(async()=>view.win.document.body.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Escape'})))
  const canvasUndo=new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true})
  await act(async()=>view.win.document.body.dispatchEvent(canvasUndo));expect(canvasUndo.defaultPrevented).toBe(false)
 }finally{await view.close()}
})

it('routes body shortcuts to the editor most recently focused through the keyboard',async()=>{
 const saves:any[]=[],bridge={open:async(r:any)=>({ok:true,document:{...doc,id:r.path}}),save:async(r:any)=>{saves.push(r);return{ok:true,document:{...doc,id:r.path}}}}
 const view=await mount(bridge,{path:'a.pptx'}),other=view.win.document.createElement('div');view.win.document.body.appendChild(other)
 const otherRoot=createRoot(other as any),Other=createPptxEditorComponent(React,FakePreview,undefined,createPortal)
 try{
  let otherControls:any;await act(async()=>{otherRoot.render(React.createElement(Other,{scope:{sessionId:'s',cwd:''},path:'b.pptx',onToolbarControls:(v:any)=>{otherControls=v}}));await Promise.resolve()});await act(async()=>{await otherControls.setMode('edit')})
  await act(async()=>editable(view.host).focus());await input(view.win,editable(view.host),'A草稿')
  await act(async()=>editable(other).focus());await input(view.win,editable(other),'B草稿')
  await act(async()=>editable(other).dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true})))
  await act(async()=>view.win.document.body.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'z',metaKey:true,shiftKey:true})))
  expect(editable(other).textContent).toBe('B草稿');expect(editable(view.host).textContent).toBe('A草稿')
  await act(async()=>view.win.document.body.dispatchEvent(new view.win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'s',metaKey:true})))
  expect(saves.map(r=>r.path)).toEqual(['b.pptx']);expect(saves[0].edits).toEqual([{id:'title',text:'B草稿'}])
 }finally{await act(async()=>otherRoot.unmount());await view.close()}
})

it('automatically saves text and preserves undo and redo after saving',async()=>{
 const saves:any[]=[],baseline={...doc,basisToken:'base'}
 const view=await mount({open:async()=>({ok:true,document:baseline}),save:async(r:any)=>{saves.push(r);return{ok:true,document:{...baseline,version:'v'+(saves.length+1)}}}})
 try{
  await act(async()=>editable(view.host).focus());await input(view.win,editable(view.host),'自动保存文本')
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves).toHaveLength(1);expect(saves[0]).toMatchObject({basisToken:'base',edits:[{id:'title',text:'自动保存文本'}]})
  expect(view.host.textContent).toContain('已保存')
  await click(view.host,'撤销');expect(editable(view.host).textContent).toBe('原始标题')
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves[1]).toMatchObject({version:'v2',basisToken:'base',edits:[]})
  await click(view.host,'重做');expect(editable(view.host).textContent).toBe('自动保存文本')
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves[2]).toMatchObject({version:'v3',edits:[{id:'title',text:'自动保存文本'}]})
 }finally{await view.close()}
})
it('queues the latest typing behind an in-flight automatic save and retains the caret',async()=>{
 const saves:any[]=[],replies:Array<(r:any)=>void>=[],baseline={...doc,basisToken:'base'}
 const view=await mount({open:async()=>({ok:true,document:baseline}),save:(r:any)=>{saves.push(r);return new Promise(resolve=>replies.push(resolve))}})
 try{
  const paragraph=editable(view.host);await act(async()=>paragraph.focus());await input(view.win,paragraph,'第一段')
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))});expect(saves).toHaveLength(1)
  await input(view.win,paragraph,'继续输入');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))});expect(saves).toHaveLength(1)
  await act(async()=>{replies[0]!({ok:true,document:{...baseline,version:'v2'}});await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves[1]).toMatchObject({version:'v2',edits:[{id:'title',text:'继续输入'}]});expect(view.win.document.activeElement).toBe(paragraph);expect(editable(view.host)).toBe(paragraph)
  await act(async()=>{replies[1]!({ok:true,document:{...baseline,version:'v3'}});await Promise.resolve()})
 }finally{await view.close()}
})
it('flushes automatic edits to the captured file when the component switches sources',async()=>{
 const props={path:'a.pptx'},saves:any[]=[]
 const view=await mount({open:async(r:any)=>({ok:true,document:{...doc,id:r.path,basisToken:r.path}}),save:async(r:any)=>{saves.push(r);return{ok:true,document:{...doc,id:r.path,basisToken:r.path,version:'v2'}}}},props)
 try{
  await input(view.win,editable(view.host),'A的修改');props.path='b.pptx';await view.render()
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves).toHaveLength(1);expect(saves[0]).toMatchObject({path:'a.pptx',basisToken:'a.pptx',edits:[{id:'title',text:'A的修改'}]})
  expect(editable(view.host).textContent).toBe('原始标题')
 }finally{await view.close()}
})
it('cancels pending automatic writes when the user explicitly discards a failed draft',async()=>{
 const saves:any[]=[],view=await mount({open:async()=>({ok:true,document:{...doc,basisToken:'base'}}),save:async(r:any)=>{saves.push(r);return{ok:false,error:'保存失败'}}})
 try{
  Object.defineProperty(view.win,'confirm',{value:()=>true})
  await input(view.win,editable(view.host),'失败稿');await click(view.host,'保存')
  await input(view.win,editable(view.host),'明确放弃的修改');await click(view.host,'重新读取文件')
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(saves).toHaveLength(1);expect(editable(view.host).textContent).toBe('原始标题')
 }finally{await view.close()}
})

it('keeps the visible slide while a deferred format refresh runs after text loses focus',async()=>{
 let release:()=>void=()=>{},started=0
 function Preview(props:any){
  const root=React.useRef<HTMLDivElement>(null)
  React.useEffect(()=>{
   const markup='<div data-pptx-node-id="2" data-pptx-part="ppt/slides/slide1.xml" style="width:200px;height:100px"><div data-pptx-paragraph="0">原始标题</div></div>'
   class Viewer{
    container:HTMLElement;viewerOptions:any={};currentSlideIndex=0;zoomPercent=100
    constructor(container:HTMLElement,options:any={}){this.container=container;this.viewerOptions=options}
    destroy(){this.container.replaceChildren()}
    async open(){started++;this.destroy();await new Promise<void>(resolve=>{release=resolve});this.container.innerHTML=markup}
    async goToSlide(){};async setZoom(){}
   }
   const mount=document.createElement('div');root.current!.appendChild(mount);mount.innerHTML=markup
   const viewer=new Viewer(mount);props.onPptxViewer?.(viewer)
   return()=>{viewer.destroy();props.onPptxViewer?.(null)}
  },[])
  return React.createElement('div',{ref:root})
 }
 const view=await mount({open:async()=>({ok:true,document:doc}),save:async()=>({ok:true,document:doc}),preview:async()=>({ok:true,bytes:[0]})},{},Preview)
 try{
  const paragraph=editable(view.host);await act(async()=>paragraph.focus())
  await act(async()=>([...view.win.document.querySelectorAll('[role=toolbar] button')].find((b:any)=>b.textContent==='加粗') as any).click())
  await input(view.win,paragraph,'编辑后的内容')
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,380))})
  expect(started).toBe(0)
  await act(async()=>{paragraph.blur();await new Promise(resolve=>setTimeout(resolve,220))})
  expect(started).toBe(1)
  expect(paragraph.isConnected).toBe(true)
  expect(paragraph.textContent).toBe('编辑后的内容')
  await act(async()=>{release();await Promise.resolve()})
  expect(editable(view.host)?.textContent).toBe('编辑后的内容')
 }finally{release();await view.close()}
})


it('renews an unchanged cached editing basis when reopening the component',async()=>{
 let opens=0;const saves:any[]=[]
 const view=await mount({open:async()=>({ok:true,document:{...doc,basisToken:'base-'+(++opens)}}),save:async(r:any)=>{saves.push(r);return r.basisToken==='base-'+opens?{ok:true,document:{...doc,basisToken:r.basisToken,version:'v2'}}:{ok:false,error:'编辑基线已失效'}}})
 try{
  await input(view.win,editable(view.host),'重新打开后继续修改')
  await act(async()=>view.root.render(React.createElement('div',null,'研究模式')))
  await view.render()
  expect(editable(view.host).textContent).toBe('重新打开后继续修改')
  await click(view.host,'保存')
  expect(saves[0]).toMatchObject({basisToken:'base-2',edits:[{id:'title',text:'重新打开后继续修改'}]})
  expect(view.host.textContent).toContain('已保存')
  expect(view.host.textContent).not.toContain('编辑基线已失效')
 }finally{await view.close()}
})

it('retains the original cumulative basis for undo after a saved component reopens',async()=>{
 const saves:any[]=[];let version='v1',opens=0
 const view=await mount({open:async()=>({ok:true,document:opens++?{...doc,version,basisToken:'fresh-file',slides:[{...doc.slides[0],fields:[{...doc.slides[0]!.fields[0],text:'已保存文字'}]},doc.slides[1]]}:{...doc,basisToken:'original'}}),save:async(r:any)=>{saves.push(r);version='v'+(saves.length+1);return{ok:true,document:{...doc,version,basisToken:'original'}}}})
 try{
  await input(view.win,editable(view.host),'已保存文字');await click(view.host,'保存')
  await act(async()=>view.root.render(React.createElement('div',null,'研究模式')));await view.render()
  await click(view.host,'撤销');await click(view.host,'保存')
  expect(editable(view.host).textContent).toBe('原始标题')
  expect(saves[1]).toMatchObject({basisToken:'original',edits:[]})
 }finally{await view.close()}
})
