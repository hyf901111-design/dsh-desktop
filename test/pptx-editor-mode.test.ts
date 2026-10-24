import {afterEach,describe,expect,it,vi} from 'vitest'
import {Window,type HTMLElement as HappyHTMLElement} from 'happy-dom'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'
import {freezeNoteSnapshotElement} from '../src/shared/note-component-snapshot'

const id='ppt/slides/slide1.xml#node:2'
const documentFixture={id:'mode-fixture',version:'v1',slides:[{index:0,part:'ppt/slides/slide1.xml',nodes:[{id,nodeId:'2',part:'ppt/slides/slide1.xml',type:'shape',name:'标题',geometry:{x:0,y:0,width:200,height:100,rotation:0}}],fields:[{id:'title',nodeId:'2',paragraphIndex:0,label:'标题',text:'原始标题'}]}]}
const clean:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const close of clean.splice(0).reverse())await close();vi.useRealTimers()})
async function mount(bridge:any,props:any={},Preview:any=()=>React.createElement('div',{'data-pptx-node-id':'2','data-pptx-part':'ppt/slides/slide1.xml','data-pptx-width':200,'data-pptx-height':100},React.createElement('div',{'data-pptx-paragraph':0},'原始标题'))){
 const win=new Window({url:'http://localhost/'}),keys=['window','document','navigator','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 win.HTMLElement.prototype.getBoundingClientRect=function(){return new win.DOMRect(0,0,800,600)}
 Object.defineProperties(globalThis,Object.fromEntries(keys.map(k=>[k,{configurable:true,value:k==='IS_REACT_ACT_ENVIRONMENT'?true:k==='window'?win:(win as any)[k]}])))
 Object.assign(win,{sherlockPptEditor:bridge})
 const Component=createPptxEditorComponent(React,Preview,undefined,createPortal),host=win.document.createElement('div');win.document.body.append(host)
 const root=createRoot(host as any);let state:any,controls:any
 function Parent(){const[,redraw]=React.useState(0),last=React.useRef('');return React.createElement(Component,{scope:{sessionId:'fixture',cwd:''},path:'fixture.pptx',toolbar:'host',...props,onToolbarState:(s:any)=>{state=s;const serialized=JSON.stringify(s);if(props.rerenderOnToolbar&&last.current!==serialized){last.current=serialized;redraw(n=>n+1)}},onToolbarControls:(c:any)=>{controls=c}})}
 const render=async()=>{await act(async()=>root.render(React.createElement(Parent)))}
 await render();clean.push(async()=>{await act(async()=>root.unmount());for(const[k,v]of previous){if(v)Object.defineProperty(globalThis,k,v);else delete(globalThis as any)[k]}})
 return{win,host,props,render,get state(){return state},get controls(){return controls},async mode(value:string){let result:any;await act(async()=>{result=await controls.setMode(value)});return result}}
}
const bridge=()=>({open:vi.fn(async(_value:any)=>({ok:true,document:structuredClone(documentFixture)})),save:vi.fn(async(_value:any)=>({ok:true,document:structuredClone(documentFixture)})),preview:vi.fn(async(_value:any)=>({ok:true,bytes:[0]}))})
const paragraph=(v:any)=>v.host.querySelector('[data-pptx-paragraph]') as HappyHTMLElement
const input=async(v:any,text:string)=>{await act(async()=>{paragraph(v).textContent=text;paragraph(v).dispatchEvent(new v.win.Event('input',{bubbles:true}))})}

describe('lazy PPTX preview and explicit editing',()=>{
 it('defaults to preview without opening or annotating an editor and leaves shortcuts untouched',async()=>{
  const b=bridge(),v=await mount(b)
  expect(v.state).toMatchObject({modes:true,mode:'preview',editable:true,modeBusy:false})
  expect(b.open).not.toHaveBeenCalled();expect(b.preview).not.toHaveBeenCalled()
  expect(paragraph(v).hasAttribute('contenteditable')).toBe(false);expect(v.win.document.querySelector('.sherlock-ppt-selection')).toBeNull()
  for(const key of ['s','z','y']){const event=new v.win.KeyboardEvent('keydown',{key,metaKey:true,bubbles:true,cancelable:true});v.host.querySelector('[data-ppt-editor]')!.dispatchEvent(event);expect(event.defaultPrevented).toBe(false)}
  expect(v.host.querySelector('[role=status]')).toBeNull()
 })
 it('only announces successful explicit changes and expires the in-view notice',async()=>{
  vi.useFakeTimers();const b=bridge(),v=await mount(b)
  expect(await v.mode('edit')).toBe(true);expect(b.open).toHaveBeenCalledTimes(1)
  expect(paragraph(v).getAttribute('contenteditable')).toBe('true');expect(v.host.querySelector('[role=status]')?.textContent).toContain('编辑模式')
  await act(async()=>vi.advanceTimersByTimeAsync(2100));expect(v.host.querySelector('[role=status]')).toBeNull()
  await act(async()=>paragraph(v).focus());expect(v.win.document.querySelector('[aria-label=对象格式]')).not.toBeNull()
  expect(await v.mode('preview')).toBe(true);expect(v.state.mode).toBe('preview')
  expect(v.win.document.querySelector('[aria-label=对象格式]')).toBeNull();expect(v.win.document.querySelector('.sherlock-ppt-selection')).toBeNull();expect(paragraph(v).hasAttribute('contenteditable')).toBe(false)
  expect(await v.mode('edit')).toBe(true);expect(b.open).toHaveBeenCalledTimes(1)
 })
 it('omits a live mode notice from the real note snapshot while retaining slide text',async()=>{
  const v=await mount(bridge());await v.mode('edit')
  expect(v.host.querySelector('[role=status]')?.textContent).toBe('已进入编辑模式')
  const frozen=await freezeNoteSnapshotElement(v.host.querySelector('[data-ppt-editor]') as any,'mode-notice-export')
  expect(frozen.html).toContain('原始标题');expect(frozen.html).not.toContain('已进入编辑模式')
 })
 it('does not announce or attach editing after an open failure or a source change',async()=>{
  const b=bridge();b.open.mockResolvedValueOnce({ok:false,error:'读取失败'} as any);const v=await mount(b)
  expect(await v.mode('edit')).toBe(false);expect(v.state.mode).toBe('preview');expect(v.host.querySelector('[role=status]')).toBeNull();expect(v.host.textContent).toContain('读取失败')
  let finish:(v:any)=>void=()=>{};b.open.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  let operation:any;await act(async()=>{operation=v.controls.setMode('edit')});expect(v.state.modeBusy).toBe(true)
  v.props.path='other.pptx';await v.render();await act(async()=>finish({ok:true,document:documentFixture}));expect(await operation).toBe(false)
  expect(v.state.mode).toBe('preview');expect(paragraph(v).hasAttribute('contenteditable')).toBe(false);expect(b.open).toHaveBeenCalledTimes(2)
 })
 it('preserves saved edits and undo through mode changes and refuses to interrupt IME or saving',async()=>{
  const b=bridge(),v=await mount(b);await v.mode('edit')
  await act(async()=>paragraph(v).dispatchEvent(new v.win.CompositionEvent('compositionstart',{bubbles:true})))
  expect(await v.mode('preview')).toBe(false);expect(v.state.mode).toBe('edit')
  await input(v,'输入中');await act(async()=>paragraph(v).dispatchEvent(new v.win.CompositionEvent('compositionend',{bubbles:true})))
  let finish:(v:any)=>void=()=>{};b.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  let saving:any;await act(async()=>{saving=v.controls.save()});expect(await v.mode('preview')).toBe(false)
  await act(async()=>{finish({ok:true,document:{...documentFixture,version:'v2'}});await saving})
  expect(await v.mode('preview')).toBe(true);expect(paragraph(v).textContent).toBe('输入中');expect(await v.mode('edit')).toBe(true)
  await act(async()=>v.host.querySelector('[data-ppt-editor]')!.dispatchEvent(new v.win.KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true})))
  expect(paragraph(v).textContent).toBe('原始标题');expect(b.open).toHaveBeenCalledTimes(1)
 })
 it('keeps read-only and unavailable previews outside the edit bridge',async()=>{
  const b=bridge(),v=await mount(b,{readOnly:true})
  expect(v.state.editable).toBe(false);expect(await v.mode('edit')).toBe(false);expect(b.open).not.toHaveBeenCalled()
 })
 it('waits for dirty saves before exiting and keeps the draft editable after a failed save',async()=>{
  const b=bridge(),v=await mount(b);await v.mode('edit');await input(v,'保留失败稿')
  let finish:(v:any)=>void=()=>{};b.save.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  let operation:any;await act(async()=>{operation=v.controls.setMode('preview')})
  expect(v.state).toMatchObject({mode:'edit',modeBusy:true});expect(await v.mode('preview')).toBe(false)
  await act(async()=>finish({ok:false,error:'写入失败'}));expect(await operation).toBe(false)
  expect(v.state.mode).toBe('edit');expect(paragraph(v).textContent).toBe('保留失败稿');expect(v.host.querySelector('[role=status]')?.textContent).not.toContain('预览模式')
  expect(await v.mode('preview')).toBe(true);expect(v.state.mode).toBe('preview')
 })
 it('keeps the new source on its light preview path and rejects edit permission lost during opening',async()=>{
  const b=bridge(),paths:string[]=[];function Preview(p:any){paths.push(p.path);return React.createElement('div',null,p.path)}
  const v=await mount(b,{},Preview);v.props.path='another.pptx';await v.render();expect(paths.at(-1)).toBe('another.pptx');expect(b.open).not.toHaveBeenCalled()
  let finish:(v:any)=>void=()=>{};b.open.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  let operation:any;await act(async()=>{operation=v.controls.setMode('edit')});v.props.readOnly=true;await v.render()
  await act(async()=>finish({ok:true,document:documentFixture}));expect(await operation).toBe(false)
  expect(v.state).toMatchObject({mode:'preview',editable:false,modeBusy:false});expect(v.host.querySelector('[role=status]')).toBeNull()
 })
 it('refreshes same-file preview saves without opening an editor and keeps the viewport',async()=>{
  const b=bridge(),readers:any[]=[]
  function Preview(p:any){const mount=React.useRef<any>(null);React.useEffect(()=>{const scroll=mount.current;scroll.scrollTop=0;const viewer={container:scroll,viewerOptions:{scrollContainer:scroll},currentSlideIndex:2,zoomPercent:150,destroy(){},goToSlide:vi.fn(async()=>{}),setZoom:vi.fn(async()=>{})};readers.push(viewer);p.onPptxViewer(viewer);return()=>p.onPptxViewer(null)},[]);return React.createElement('div',{ref:mount})}
  const v=await mount(b,{},Preview);readers[0].viewerOptions.scrollContainer.scrollTop=280
  await act(async()=>v.win.document.dispatchEvent(new v.win.CustomEvent('sherlock:pptx-saved',{detail:{id:'other',source:{sessionId:'unrelated',path:'fixture.pptx'}}})));expect(readers).toHaveLength(1)
  await act(async()=>v.win.document.dispatchEvent(new v.win.CustomEvent('sherlock:pptx-saved',{detail:{id:'saved',source:{sessionId:'fixture',path:'fixture.pptx'}}})))
  expect(readers).toHaveLength(2);expect(readers[1].goToSlide).toHaveBeenCalledWith(2,{behavior:'auto',block:'nearest'});expect(readers[1].setZoom).toHaveBeenCalledWith(150);expect(readers[1].viewerOptions.scrollContainer.scrollTop).toBe(280)
  expect(b.open).not.toHaveBeenCalled();expect(b.preview).not.toHaveBeenCalled();expect(v.state.mode).toBe('preview')
 })
 it('rejects old mode and save controls after the source changes',async()=>{
  const b=bridge(),v=await mount(b),old=v.controls;v.props.path='second.pptx';await v.render()
  let result:any;await act(async()=>{result=await old.setMode('edit');await old.save()})
  expect(result).toBe(false);expect(b.open).not.toHaveBeenCalled();expect(b.save).not.toHaveBeenCalled()
  expect(await v.mode('edit')).toBe(true);expect(b.open).toHaveBeenCalledWith({sessionId:'fixture',path:'second.pptx'})
 })
 it('suspends new writes when the same source becomes read-only and resumes its retained draft explicitly',async()=>{
  vi.useFakeTimers();const b=bridge(),v=await mount(b);await v.mode('edit');await input(v,'只读前的草稿')
  v.props.readOnly=true;await v.render();await act(async()=>vi.advanceTimersByTimeAsync(400))
  expect(v.state).toMatchObject({mode:'preview',editable:false,dirty:true});expect(b.save).not.toHaveBeenCalled()
  await act(async()=>v.controls.save());expect(b.save).not.toHaveBeenCalled()
  v.props.readOnly=false;await v.render();expect(await v.mode('edit')).toBe(true);expect(paragraph(v).textContent).toBe('只读前的草稿')
  await act(async()=>vi.advanceTimersByTimeAsync(400));expect(b.save).toHaveBeenCalledTimes(1);expect(b.open).toHaveBeenCalledTimes(1)
 })
 it('preserves page, zoom and scrolling when entering edit renews the URL and the host rerenders',async()=>{
  vi.useFakeTimers();const b=bridge(),readers:any[]=[]
  b.open.mockResolvedValue({ok:true,document:{...documentFixture,previewUrl:'sherlock-preview://fresh/'}} as any)
  function Preview(p:any){const mount=React.useRef<any>(null);React.useEffect(()=>{const timer=setTimeout(()=>{const scroll=mount.current,viewer:any={container:scroll,viewerOptions:{scrollContainer:scroll},currentSlideIndex:0,zoomPercent:100,destroy(){},async goToSlide(n:number){viewer.currentSlideIndex=n},async setZoom(n:number){viewer.zoomPercent=n}};readers.push(viewer);p.onPptxViewer(viewer)},10);return()=>{clearTimeout(timer);p.onPptxViewer(null)}},[p.path]);return React.createElement('div',{ref:mount})}
  const v=await mount(b,{rerenderOnToolbar:true},Preview);await act(async()=>vi.advanceTimersByTimeAsync(20))
  readers[0].currentSlideIndex=5;readers[0].zoomPercent=150;readers[0].viewerOptions.scrollContainer.scrollTop=280
  expect(await v.mode('edit')).toBe(true);await act(async()=>vi.advanceTimersByTimeAsync(20))
  expect(readers).toHaveLength(2);expect(readers[1]).toMatchObject({currentSlideIndex:5,zoomPercent:150});expect(readers[1].viewerOptions.scrollContainer.scrollTop).toBe(280)
  expect(await v.mode('preview')).toBe(true);expect(readers[1]).toMatchObject({currentSlideIndex:5,zoomPercent:150})
 })
 it('retains the final IME draft locally when read-only arrives during composition',async()=>{
  vi.useFakeTimers();const b=bridge(),v=await mount(b);await v.mode('edit')
  await act(async()=>paragraph(v).dispatchEvent(new v.win.CompositionEvent('compositionstart',{bubbles:true})));await input(v,'组合中')
  v.props.readOnly=true;await v.render()
  await act(async()=>{paragraph(v).textContent='完成输入';paragraph(v).dispatchEvent(new v.win.CompositionEvent('compositionend',{bubbles:true}))})
  await act(async()=>vi.advanceTimersByTimeAsync(400));expect(v.state).toMatchObject({mode:'preview',editable:false,dirty:true});expect(b.save).not.toHaveBeenCalled()
  v.props.readOnly=false;await v.render();await v.mode('edit');expect(paragraph(v).textContent).toBe('完成输入')
 })
 it('keeps captured authorized autosave for file A when only the new file B is read-only',async()=>{
  vi.useFakeTimers();const b=bridge(),v=await mount(b);await v.mode('edit');await input(v,'A的修改')
  v.props.path='read-only-B.pptx';v.props.readOnly=true;await v.render();await act(async()=>vi.advanceTimersByTimeAsync(400))
  expect(b.save).toHaveBeenCalledTimes(1);expect(b.save.mock.calls[0]?.[0]).toMatchObject({sessionId:'fixture',path:'fixture.pptx',edits:[{id:'title',text:'A的修改'}]})
  expect(v.state).toMatchObject({mode:'preview',editable:false});expect(b.open).toHaveBeenCalledTimes(1)
 })
 it('matches existing canonical paths across opaque and sidebar previews without using them as edit authority',async()=>{
  const b=bridge();let mounts=0
  function Preview(){React.useEffect(()=>{mounts++},[]);return React.createElement('div',{'data-pptx-node-id':'2','data-pptx-part':'ppt/slides/slide1.xml','data-pptx-width':200,'data-pptx-height':100},React.createElement('div',{'data-pptx-paragraph':0},'原始标题'))}
  const v=await mount(b,{path:'sherlock-preview://capability/',refreshSource:{sessionId:'component-owner',path:'/workspace/slides/../same.pptx'}},Preview)
  await act(async()=>v.win.document.dispatchEvent(new v.win.CustomEvent('sherlock:pptx-saved',{detail:{source:{sessionId:'sidebar-owner',path:'same.pptx'},refreshSource:{sessionId:'sidebar-owner',path:'same.pptx',cwd:'/workspace'}}})))
  expect(mounts).toBe(2);expect(b.open).not.toHaveBeenCalled()
  await v.mode('edit');expect(b.open).toHaveBeenCalledWith({sourceUrl:'sherlock-preview://capability/'})
  await input(v,'组件修改');let detail:any;v.win.document.addEventListener('sherlock:pptx-saved',((e:any)=>{detail=e.detail}) as any)
  await act(async()=>v.controls.save());expect(detail.refreshSource).toEqual({sessionId:'component-owner',path:'/workspace/slides/../same.pptx'})
  expect(b.save.mock.calls[0]?.[0]).toMatchObject({sourceUrl:'sherlock-preview://capability/'});expect(b.save.mock.calls[0]?.[0]).not.toHaveProperty('refreshSource')
 })
})
