import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {afterEach,expect,it,vi} from 'vitest'
import {Window} from 'happy-dom'
import React,{act} from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import {createPortal} from 'react-dom'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'
const {patchResearchOfficeResize}=createRequire(import.meta.url)('../scripts/lib/research-office-resize.mjs')
const {patchComponentPptxMode}=createRequire(import.meta.url)('../scripts/lib/component-pptx-mode.mjs')
const {stripComponentPptxMode}=createRequire(import.meta.url)('../scripts/lib/component-pptx-mode.mjs')
const {patchResearchGridWorkbench,restoreResearchGridWorkbench}=createRequire(import.meta.url)('../scripts/lib/research-grid-workbench.mjs')
const {stripHomeGuideNative}=createRequire(import.meta.url)('../scripts/lib/home-guide-native.mjs')
const ui=createRequire(import.meta.url)('../scripts/lib/research-grid-ui.mjs')
const {EWorkNoteFileView}=createRequire(import.meta.url)('../scripts/lib/notes-files.mjs')
const {ResearchAttachmentLocalPreview}=createRequire(import.meta.url)('../scripts/lib/attachment-client.mjs')
const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup()})

const pptxDocument={id:'native-component',version:'1',editToken:'edit-token',slides:[{index:0,part:'ppt/slides/slide1.xml',nodes:[{id:'ppt/slides/slide1.xml#node:2',nodeId:'2',part:'ppt/slides/slide1.xml',type:'shape',name:'标题',geometry:{x:0,y:0,width:200,height:100,rotation:0}}],fields:[{id:'title',nodeId:'2',paragraphIndex:0,label:'标题',text:'原始标题'}]}]}
async function fixture(readOnly=false,surface='reader',actual=false,storedInline=false){
 const win=new Window({url:'https://component-pptx.test/'}),previous=new Map(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]))
 for(const[key,value]of Object.entries({window:win,document:win.document,navigator:win.navigator,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,key,{configurable:true,value})
 win.HTMLElement.prototype.getBoundingClientRect=function(){return new win.DOMRect(0,0,800,600)}
 const restore=vi.fn(async(input:any)=>({url:'sherlock-preview://'+input.nodeId+'/',authorizationId:'a',capabilityToken:'preview-token'}))
 Object.assign(win,{dshDesktop:{researchPreview:{restore,release:vi.fn()}}})
 const source=patchComponentPptxMode(patchResearchOfficeResize(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')))
 const start=source.indexOf('function freezeOfficePreviewDuringResize('),end=source.indexOf('function ResearchCanvasFileCard(',start)
 const api:any=runInNewContext(source.slice(start,end)+'\n'+Object.values(ui).map((fn:any)=>fn.toString()).join('\n')+'\n'+EWorkNoteFileView.toString()+'\n'+ResearchAttachmentLocalPreview.toString()+';({Office:ResearchCanvasOfficePreview,Menu:WorkbenchMenu,Note:EWorkNoteFileView})',{react:React,react_dom:{createPortal},react_jsx_runtime:jsx,window:win,document:win.document,CSS:win.CSS,useWorkbenchLocale:()=>{},workbenchText:(value:string)=>value,supportsResearchOfficePreview:()=>true,ResearchOfficePreviewErrorBoundary:({children}:any)=>children,sherlockShared:()=>false,sherlockBoardsAdapter:null,MutationObserver:win.MutationObserver,ResizeObserver:win.ResizeObserver,componentDataStatusStore:{subscribe:()=>()=>{},read:()=>null},componentRssStatusView:()=>null,canSaveCustomComponent:()=>false,RESEARCH_MIND_MAP_DETAIL_OPTIONS:[],RESEARCH_ACTIVE_GENERATION_STATUSES:new Set(),clearTimeout,setTimeout,requestAnimationFrame:win.requestAnimationFrame.bind(win)})
 const modes:any[]=[],previewMounts:any[]=[]
 function Service(props:any){
  const [mode,setMode]=React.useState('preview')
  React.useEffect(()=>{props.onToolbarState?.({modes:true,mode,editable:props.readOnly!==true,modeBusy:false});props.onToolbarControls?.({setMode:async(next:string)=>{setMode(next);return true},toggleMode:async()=>{setMode(mode==='edit'?'preview':'edit');return true},save:async()=>true})})
  modes.push(mode)
  return React.createElement('div',{'data-native-pptx-preview':'','data-mode':mode})
 }
 const bridge={open:vi.fn(async()=>({ok:true,document:structuredClone(pptxDocument)})),save:vi.fn(async()=>({ok:true,document:structuredClone(pptxDocument)}))}
 Object.assign(win,{sherlockPptEditor:bridge})
 function Preview(props:any){React.useEffect(()=>{previewMounts.push(props.path)},[]);return React.createElement('div',{'data-native-pptx-preview':'','data-pptx-node-id':'2','data-pptx-part':'ppt/slides/slide1.xml','data-pptx-width':200,'data-pptx-height':100},React.createElement('div',{'data-pptx-paragraph':0},'原始标题'))}
 const Central=createPptxEditorComponent(React,Preview,undefined,createPortal)
 const Adapter=(props:any)=>React.createElement(Central,{...props,scope:{sessionId:'s',cwd:''},path:props.sourceUrl})
 const officePreview={Component:actual?Adapter:Service}
 const host=win.document.createElement('section');host.dataset.researchNodeId='ppt';win.document.body.append(host)
 const mount=win.document.createElement('div');win.document.body.append(mount);const root=createRoot(mount as any),node={id:'ppt',name:'demo.pptx',path:'/work/demo.pptx',authorizationId:'a',previewSessionId:'s'}
 let showMenu:()=>void=()=>{}
 function Research(){const[menu,setMenu]=React.useState(false);showMenu=()=>setMenu(true);return React.createElement(React.Fragment,null,createPortal(React.createElement(api.Office,{node,sessionId:'s',kind:'pptx',visible:true,service:officePreview,readOnly}),host as unknown as Element),menu&&React.createElement(api.Menu,{target:{node,root:host,left:0,top:0,sessionId:'s'},workspace:{},readOnly,onClose:()=>setMenu(false)}))}
 const header=win.document.createElement('header'),reader=win.document.createElement('div');if(surface==='notes'){host.append(header,reader)}
 const entry={instanceId:'note-instance',sessionId:'s',host:reader,header,node,readOnly,inline:storedInline}
 await act(async()=>root.render(surface==='notes'?React.createElement(api.Note,{entry,officePreview}):React.createElement(Research)))
 cleanups.push(async()=>{await act(async()=>root.unmount());await win.happyDOM.abort();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as any)[key]}})
 return{win,host,header,entry,root,api,modes,previewMounts,restore,bridge,officePreview,async menu(){await act(async()=>{if(surface==='notes')(header.querySelector('[data-workbench-more]') as any).click();else showMenu()})}}
}

it('forwards native PPT mode controls to a right-aligned component footer',async()=>{
 const f=await fixture(),button=f.host.querySelector('[data-component-pptx-edit]') as any
 expect(button).not.toBeNull();expect(button.getAttribute('aria-label')).toBe('编辑')
 await act(async()=>button.click())
 expect(f.host.querySelector('[data-native-pptx-preview]')?.getAttribute('data-mode')).toBe('edit')
 expect(f.host.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('关闭编辑模式')
})
it('keeps a readonly PPT preview without editable component controls',async()=>{
 const f=await fixture(true)
 expect(f.host.querySelector('[data-native-pptx-preview]')).not.toBeNull()
 expect(f.host.querySelector('[data-component-pptx-edit]')).toBeNull()
})
it.each([false,true])('gives an existing inline PPT a full shared header and one real-info footer (readonly %s)',async readOnly=>{
 const f=await fixture(readOnly,'notes',true,true),before=JSON.stringify(f.entry.node)
 expect(f.header.querySelector('.ew-grid-header')).not.toBeNull()
 expect(f.header.querySelector('[data-workbench-more]')).not.toBeNull()
 expect(f.header.querySelector('.en-inline-document-caption')).toBeNull()
 expect(f.host.querySelectorAll('[data-component-pptx-footer]')).toHaveLength(1)
 expect(f.host.querySelector('[data-component-pptx-file-info]')?.textContent).toContain('demo.pptx')
 expect(f.host.querySelector('[data-component-pptx-file-info]')?.getAttribute('title')).toContain('/work/demo.pptx')
 expect(Boolean(f.host.querySelector('[data-component-pptx-edit]'))).toBe(!readOnly)
 expect(f.bridge.open).not.toHaveBeenCalled();expect(f.bridge.save).not.toHaveBeenCalled()
 expect(JSON.stringify(f.entry.node)).toBe(before)
})
it.each(['research','notes'])('shares real central mode between %s menu and footer and saves safely before leaving edit',async surface=>{
 const f=await fixture(false,surface,true)
 expect(f.bridge.open).not.toHaveBeenCalled()
 const paragraph=f.host.querySelector('[data-pptx-paragraph]') as any
 expect(paragraph.hasAttribute('contenteditable')).toBe(false)
 await f.menu();const edit=[...f.win.document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='编辑') as any
 expect(edit).toBeTruthy();await act(async()=>edit.click())
 expect(f.bridge.open).toHaveBeenCalledTimes(1);expect(paragraph.getAttribute('contenteditable')).toBe('true')
 expect(f.host.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('关闭编辑模式')
 await f.menu();expect([...f.win.document.querySelectorAll('[role=menuitem]')].some(button=>button.textContent==='关闭编辑模式')).toBe(true)
 await act(async()=>{paragraph.textContent='保存后退出';paragraph.dispatchEvent(new f.win.Event('input',{bubbles:true}))})
 f.bridge.save.mockResolvedValueOnce({ok:false,error:'保存失败'} as any)
 await act(async()=>(f.host.querySelector('[data-component-pptx-edit]') as any).click())
 expect(paragraph.getAttribute('contenteditable')).toBe('true');expect(paragraph.textContent).toBe('保存后退出')
 expect(f.host.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('关闭编辑模式')
 await act(async()=>(f.host.querySelector('[data-component-pptx-edit]') as any).click())
 expect(f.bridge.save).toHaveBeenCalledTimes(2);expect(paragraph.hasAttribute('contenteditable')).toBe(false)
 expect(f.host.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('编辑')
 expect([...f.win.document.querySelectorAll('[role=menuitem]')].some(button=>button.textContent==='编辑')).toBe(true)
})
it.each(['research','notes'])('does not expose edit entries for a readonly %s PPT',async surface=>{
 const f=await fixture(true,surface,true);await f.menu()
 expect(f.host.querySelector('[data-component-pptx-edit]')).toBeNull()
 expect([...f.win.document.querySelectorAll('[role=menuitem]')].some(button=>['编辑','关闭编辑模式'].includes(button.textContent??''))).toBe(false)
 expect(f.bridge.open).not.toHaveBeenCalled()
})
it('keeps both entry points busy during the single explicit preparation',async()=>{
 const f=await fixture(false,'research',true);let finish:(value:any)=>void=()=>{}
 f.bridge.open.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 await act(async()=>(f.host.querySelector('[data-component-pptx-edit]') as any).click())
 expect((f.host.querySelector('[data-component-pptx-edit]') as any).disabled).toBe(true)
 await f.menu();const button=[...f.win.document.querySelectorAll('[role=menuitem]')].find(button=>button.textContent==='编辑') as any
 expect(button.disabled).toBe(true);expect(f.bridge.open).toHaveBeenCalledTimes(1)
 await act(async()=>finish({ok:true,document:structuredClone(pptxDocument)}))
 expect(f.host.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('关闭编辑模式')
 expect([...f.win.document.querySelectorAll('[role=menuitem]')].some(button=>button.textContent==='关闭编辑模式')).toBe(true)
})
it('does not share mode with a second PPT instance',async()=>{
 const f=await fixture(false,'research',true),other=f.win.document.createElement('article');f.win.document.body.append(other)
 const otherRoot=createRoot(other as any)
 cleanups.push(async()=>{await act(async()=>otherRoot.unmount())})
 await act(async()=>otherRoot.render(React.createElement(f.api.Office,{node:{id:'second',name:'second.pptx',path:'/work/second.pptx',authorizationId:'b'},sessionId:'s',kind:'pptx',visible:true,service:f.officePreview})))
 await act(async()=>(other.querySelector('[data-component-pptx-edit]') as any).click())
 expect(other.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('关闭编辑模式')
 expect(f.host.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('编辑')
 await f.menu();expect([...f.win.document.querySelectorAll('[role=menuitem]')].some(button=>button.textContent==='编辑')).toBe(true)
})
it('refreshes another opaque preview of the same known path without opening its editor',async()=>{
 const f=await fixture(false,'research',true),other=f.win.document.createElement('article');f.win.document.body.append(other)
 const otherRoot=createRoot(other as any);cleanups.push(async()=>{await act(async()=>otherRoot.unmount())})
 await act(async()=>otherRoot.render(React.createElement(f.api.Office,{node:{id:'same-file',name:'demo.pptx',path:'/work/demo.pptx',authorizationId:'c'},sessionId:'notes-bound-session',kind:'pptx',visible:true,service:f.officePreview})))
 expect(f.previewMounts).toHaveLength(2);expect(f.bridge.open).not.toHaveBeenCalled()
 await act(async()=>(f.host.querySelector('[data-component-pptx-edit]') as any).click())
 const paragraph=f.host.querySelector('[data-pptx-paragraph]') as any
 await act(async()=>{paragraph.textContent='同步已有预览';paragraph.dispatchEvent(new f.win.Event('input',{bubbles:true}))})
 await act(async()=>(f.host.querySelector('[data-component-pptx-edit]') as any).click())
 expect(f.bridge.save).toHaveBeenCalledTimes(1);expect(f.bridge.open).toHaveBeenCalledTimes(1)
 expect(f.previewMounts.filter(path=>path==='sherlock-preview://same-file/')).toHaveLength(2)
 expect(other.querySelector('[data-pptx-paragraph]')?.hasAttribute('contenteditable')).toBe(false)
 expect(other.querySelector('[data-component-pptx-edit]')?.getAttribute('aria-label')).toBe('编辑')
})
it('installs and strips the actual resident representation without changing grid restore metadata',()=>{
 const resident=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'),source=stripComponentPptxMode(resident),patched=patchComponentPptxMode(source)
 expect(stripComponentPptxMode(source)).toBe(source)
 expect(patchComponentPptxMode(resident)).toBe(patched)
 expect(stripComponentPptxMode(patched)).toBe(source);expect(patchComponentPptxMode(patched)).toBe(patched)
 const metadata=(text:string)=>text.slice(text.indexOf('/* EWORK_GRID_RESTORE '))
 expect(metadata(source)).toBe(metadata(resident))
 expect(metadata(patched)).toBe(metadata(source))
 const base=restoreResearchGridWorkbench(stripHomeGuideNative(source)),installed=patchResearchGridWorkbench(base)
 expect(restoreResearchGridWorkbench(installed).trim()).toBe(base.trim())
 expect(patchResearchGridWorkbench(installed)).toBe(installed)
 expect(()=>patchComponentPptxMode(patched.replace('Component: service.Component, readOnly:','Component: null, readOnly:'))).toThrow(/drifted/)
 const currentBinding=patched.match(/\.\.\.\(kind === "pptx" \? \{ Component: service\.Component, readOnly:[^\n]+\n\s*sourceUrl: preview\.descriptor\.url,/)! [0]
 const oldBinding=currentBinding.replace('fileInfo: { name: node.name, path: node.path }, ','')
 const mixed=patched.replace('/* EWORK_GRID_RESTORE ','/* duplicated legacy props\n'+oldBinding+'\n'+oldBinding+'\n*/\n/* EWORK_GRID_RESTORE ')
 expect(()=>stripComponentPptxMode(mixed)).toThrow(/drifted/)
 expect(()=>patchComponentPptxMode(mixed)).toThrow(/drifted/)
},15000)
