import {afterEach,expect,it,vi} from 'vitest'
import React,{act} from 'react'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {Window} from 'happy-dom'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'
const clean:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn()})
async function fixture(options:any={}){
 const win=new Window({url:'http://localhost/'}),keys=['window','document','navigator','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],previous=new Map(keys.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 for(const [key,value]of Object.entries({window:win,document:win.document,navigator:win.navigator,CustomEvent:win.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{configurable:true,value})
 const snapshot={scene:{slideSize:{width:800,height:450},slides:[{index:0,part:'ppt/slides/slide1.xml',nodes:[],fields:[]}]},basis:{sessionId:'actual',documentId:'document',fileVersion:'v1',name:'review.pptx'},marks:[],selectedId:null,revealSeq:0,revision:0,stale:false,busy:false,error:null}
 const listeners=new Set<()=>void>(),handle={getSnapshot:()=>snapshot,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>listeners.delete(fn)},add:vi.fn(),select:vi.fn(),updateComment:vi.fn(),remove:vi.fn(),readd:vi.fn(),undo:vi.fn(),reanchor:vi.fn(),dispose:vi.fn()},coordinator={registerViewer:vi.fn(()=>vi.fn()),open:vi.fn(async(_source:any,_options:any)=>options.pending?await options.pending:handle)}
 ;(win as any)[Symbol.for('sherlock:pptx-annotation-input')]=coordinator
 const bridge={open:vi.fn(),save:vi.fn()};Object.assign(win,{sherlockPptEditor:bridge})
 win.HTMLElement.prototype.getBoundingClientRect=function(){return new win.DOMRect(0,0,800,450)}
 const Preview=(props:any)=>{const viewer=React.useMemo(()=>({getFileVersion:async()=>snapshot.basis.fileVersion}),[]);React.useEffect(()=>{props.onPptxViewer(viewer);return()=>props.onPptxViewer(null)},[props.onPptxViewer]);return React.createElement('div',{'data-slide-index':0},React.createElement('div',{'data-mounted':'1'},React.createElement('div',{style:{width:800,height:450},'data-native-slide':''},React.createElement('div',{'data-pptx-node-id':'2','data-pptx-part':'ppt/slides/slide1.xml','data-pptx-width':200,'data-pptx-height':100},React.createElement('div',{'data-pptx-paragraph':0},'原始标题')))))}
 const Component=createPptxEditorComponent(React,Preview,undefined,createPortal),host=win.document.createElement('main');host.id='odyssey-right-workspace-panel';win.document.body.append(host);const root=createRoot(host as any)
 let controls:any,state:any
 const source={sessionId:'source-owner',source:{kind:'workspace',relativePath:'review.pptx'}}
 const props:any={scope:{sessionId:'Office-untrusted-sending',cwd:'/work'},path:'review.pptx',annotationSource:source,toolbar:'host',onToolbarState:(s:any)=>{state=s},onToolbarControls:(c:any)=>{controls=c}}
 const render=async()=>{await act(async()=>root.render(React.createElement(Component,props)))};await render()
 clean.push(async()=>{await act(async()=>root.unmount());await win.happyDOM.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as any)[key]}})
 return{win,host,source,bridge,coordinator,handle,snapshot,props,render,get controls(){return controls},get state(){return state}}
}
it('keeps the existing native preview cold and only opens read-only annotations after an explicit host toggle',async()=>{
 const f=await fixture()
 expect(f.bridge.open).not.toHaveBeenCalled();expect(f.bridge.save).not.toHaveBeenCalled();expect(f.coordinator.open).not.toHaveBeenCalled()
 expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).toBeNull()
 expect(typeof f.controls.toggleAnnotations).toBe('function')
 let result:any;await act(async()=>{result=await f.controls.toggleAnnotations()})
 expect(result).toBe(true);expect(f.coordinator.open).toHaveBeenCalledTimes(1)
 expect(f.coordinator.open.mock.calls[0]![0]).toEqual(f.source)
 expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).not.toBeNull()
 expect(f.state).toMatchObject({mode:'preview',annotationActive:true})
 expect(f.bridge.open).not.toHaveBeenCalled();expect(f.bridge.save).not.toHaveBeenCalled()
 await act(async()=>{await f.controls.toggleAnnotations()})
 expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).toBeNull();expect(f.handle.dispose).toHaveBeenCalledTimes(1)
})

it('rejects a late read-only handle after changing source and never mounts an old overlay or steals focus',async()=>{
 let resolve:(value:any)=>void=()=>{};const pending=new Promise(done=>resolve=done),f=await fixture({pending})
 let operation:any;await act(async()=>{operation=f.controls.setAnnotations(true)})
 expect(f.state.annotationBusy).toBe(true)
 const outside=f.win.document.createElement('button');f.win.document.body.append(outside);outside.focus()
 f.props.path='different.pptx';f.props.annotationSource={...f.source,source:{kind:'workspace',relativePath:'different.pptx'}};await f.render()
 await act(async()=>{resolve(f.handle);await operation})
 expect(await operation).toBe(false);expect(f.handle.dispose).toHaveBeenCalledTimes(1);expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).toBeNull();expect(f.win.document.activeElement).toBe(outside);expect(f.bridge.open).not.toHaveBeenCalled()
})

it('only enters annotations through the real safe preview transition and preserves a failed dirty edit',async()=>{
 const f=await fixture(),id='ppt/slides/slide1.xml#node:2',doc={id:'edit',version:'v1',slides:[{index:0,part:'ppt/slides/slide1.xml',nodes:[{id,nodeId:'2',part:'ppt/slides/slide1.xml',type:'shape',name:'标题',geometry:{x:0,y:0,width:200,height:100,rotation:0}}],fields:[{id:'title',nodeId:'2',paragraphIndex:0,label:'标题',text:'原始标题'}]}]}
 f.bridge.open.mockResolvedValue({ok:true,document:doc});f.bridge.save.mockResolvedValue({ok:false,error:'保存失败'})
 let entered:any;await act(async()=>{entered=await f.controls.setMode('edit')});expect(entered).toBe(true)
 const paragraph=f.host.querySelector('[data-pptx-paragraph]')!
 await act(async()=>{paragraph.textContent='必须保留的新标题';paragraph.dispatchEvent(new f.win.Event('input',{bubbles:true}))})
 let result:any;await act(async()=>{result=await f.controls.setAnnotations(true)})
 expect(result).toBe(false);expect(f.bridge.save).toHaveBeenCalledTimes(1);expect(f.coordinator.open).not.toHaveBeenCalled();expect(f.state.mode).toBe('edit');expect(paragraph.textContent).toBe('必须保留的新标题')
 f.bridge.save.mockResolvedValue({ok:true,document:{...doc,version:'v2'}})
 await act(async()=>{result=await f.controls.setAnnotations(true)})
 expect(result).toBe(true);expect(f.state).toMatchObject({mode:'preview',annotationActive:true});expect(f.coordinator.open).toHaveBeenCalledTimes(1)
 await act(async()=>{result=await f.controls.setMode('edit')});expect(result).toBe(true);expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).toBeNull();expect(f.handle.dispose).toHaveBeenCalledTimes(1)
})
it('closes the old annotation generation before a same-file native save refresh or source-envelope ownership change',async()=>{
 const f=await fixture();await act(async()=>{await f.controls.setAnnotations(true)})
 await act(async()=>f.win.document.dispatchEvent(new f.win.CustomEvent('sherlock:pptx-saved',{detail:{source:{sessionId:'Office-untrusted-sending',path:'review.pptx'}}})))
 expect(f.state.annotationActive).toBe(false);expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).toBeNull();expect(f.handle.dispose).toHaveBeenCalledTimes(1)
 await act(async()=>{await f.controls.setAnnotations(true)})
 f.props.annotationSource={sessionId:'different-owner',source:f.source.source};await f.render()
 expect(f.state.annotationActive).toBe(false);expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).toBeNull();expect(f.handle.dispose).toHaveBeenCalledTimes(2)
 expect(f.bridge.open).not.toHaveBeenCalled();expect(f.bridge.save).not.toHaveBeenCalled()
})

it('registers a cold right preview without reading, then explicitly activates a matching saved mark',async()=>{
 const f=await fixture()
 expect(f.coordinator.registerViewer).toHaveBeenCalledTimes(1);expect(f.coordinator.open).not.toHaveBeenCalled();expect(f.bridge.open).not.toHaveBeenCalled()
 const registered=(f.coordinator.registerViewer.mock.calls as any)[0][0]
 expect(registered.source).toEqual(f.source);expect(registered.path).toBe('review.pptx');expect(registered.isAvailable()).toBe(true)
 ;(f.snapshot.marks as any[]).push({id:'saved',ordinal:2,fileVersion:'v1',slideIndex:0,slidePart:'ppt/slides/slide1.xml',kind:'point',region:{x:.2,y:.3},nodeIds:[],comment:'原备注',stale:false,referenced:false})
 let activation:any
 await act(async()=>{activation=await registered.activate({documentId:'document',fileVersion:'v1',markId:'saved'},{signal:new AbortController().signal})})
 expect(f.handle.select).not.toHaveBeenCalled();activation.select();expect(f.handle.select).toHaveBeenCalledWith('saved')
 expect(f.bridge.open).not.toHaveBeenCalled();expect(f.bridge.save).not.toHaveBeenCalled()
 await expect(registered.activate({documentId:'other',fileVersion:'v1',markId:'saved'},{signal:new AbortController().signal})).rejects.toThrow(/版本|身份/)
})
