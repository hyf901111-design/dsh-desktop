import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {createRequire} from 'node:module'
import {runInNewContext, Script} from 'node:vm'
import {Window} from 'happy-dom'
import {expect, it} from 'vitest'
import {patchBetterSidebarClient} from '../scripts/lib/patch-sherlock-better-sidebar.mjs'
import {createPptxEditorComponent} from '../scripts/lib/pptx-editor-ui.mjs'

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),{createRoot}=require('react-dom/client')
const relative='build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js'
const original=readFileSync(existsSync(relative)?relative:resolve('../..',relative),'utf8')
const source=patchBetterSidebarClient(original)
const start=source.indexOf('function EditorHost(props) {'),end=source.indexOf('\n\t\t/**',start)
if(start<0||end<0)throw Error('Real sidebar EditorHost boundary missing')

async function fixture(initial='/work/a.pptx',options:{editable?:boolean,load?:'ready'|'loading'|'error',nativeEditor?:boolean,bridge?:any,annotations?:boolean,annotationCoordinator?:any}={}){
 const win=new Window({url:'http://localhost/'}),previous=new Map<string,PropertyDescriptor|undefined>()
 for(const [key,value]of Object.entries({window:win,document:win.document,navigator:win.navigator,CustomEvent:win.CustomEvent,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value})}
 const mounted=new Map<string,any>(),requests:string[]=[],waiting:Array<(value:boolean)=>void>=[]
 function Viewer(props:any){
  React.useEffect(()=>{
   let current={modes:true,mode:'preview',editable:options.editable!==false,modeBusy:false,saveState:'idle',downloadUrl:'/download/'+props.path.split('/').at(-1),...(options.annotations?{annotations:true,annotationActive:false,annotationBusy:false,annotationIcon:'data:image/svg+xml,fixture'}:{})}
   const publish=(patch:any)=>{current={...current,...patch};props.onToolbarState(current)}
   const controls={save:()=>{},toggleAnnotations:async()=>{requests.push('annotations:'+props.path);publish({annotationBusy:true});const ok=await new Promise<boolean>(done=>waiting.push(done));publish({annotationBusy:false,...(ok?{annotationActive:!current.annotationActive}:{})});return ok},toggleMode:async()=>{requests.push(props.path);publish({modeBusy:true});const ok=await new Promise<boolean>(done=>waiting.push(done));publish({modeBusy:false,...(ok?{mode:current.mode==='edit'?'preview':'edit'}:{})});return ok},setMode:()=>{}}
   mounted.set(props.path,{publish,props,controls});props.onToolbarControls(controls);publish({})
   return()=>props.onToolbarControls(null)
  },[props.path,props.onToolbarControls,props.onToolbarState])
  return React.createElement('div',{'data-viewer':props.path},'PPT preview')
 }
 if(options.nativeEditor){
  Object.assign(win,{sherlockPptEditor:options.bridge});if(options.annotationCoordinator)(win as any)[Symbol.for('sherlock:pptx-annotation-input')]=options.annotationCoordinator
  win.HTMLElement.prototype.getBoundingClientRect=function(){return new win.DOMRect(0,0,800,600)}
 }
 const RegisteredViewer=options.nativeEditor?createPptxEditorComponent(React,(props:any)=>{const viewer=React.useMemo(()=>({getFileVersion:async()=>'v1'}),[]);React.useEffect(()=>{props.onPptxViewer(viewer);return()=>props.onPptxViewer(null)},[props.onPptxViewer]);return React.createElement('div',{'data-pptx-node-id':'2','data-pptx-part':'ppt/slides/slide1.xml','data-pptx-width':200,'data-pptx-height':100},React.createElement('div',{'data-pptx-paragraph':0},'原始标题'))},undefined,require('react-dom').createPortal):Viewer
 const empty=()=>null,primitives=new Proxy({},{get:()=>empty}),classes=new Proxy({},{get:(_t,key)=>String(key)})
 const Host=runInNewContext(source.slice(start,end)+'\nEditorHost',{react:React,react_jsx_runtime:jsx,_deepseek_ai_dsh_client_ui_primitives:primitives,sidebar_module_css_default:classes,clsx:(...items:any[])=>items.filter(Boolean).join(' '),baseName$1:(path:string)=>path.split('/').at(-1),treeWidthOf:()=>240,treeOpenOf:()=>false,clampTreeWidth:(v:number)=>v,EditorPathInput:()=>React.createElement('input'),TreePanel:empty,BinaryDownload:empty,openSidebarFile:()=>{},patchMeta:()=>{},mediaUrl:()=>'',planFirstMatch:()=>options.load==='loading'?{kind:'customLoad',viewer:{load:()=>new Promise(()=>{})}}:options.load==='error'?{kind:'customLoad',viewer:{load:async()=>{throw Error('cannot read file')}}}:{kind:'render',viewer:{id:'office-pptx',component:RegisteredViewer}},AbortController,JSON,console,t:(key:string)=>({downloadToView:'下载',editorTreeToggle:'打开文件夹',save:'保存',preview:'预览',edit:'编辑'}[key]??key)})
 const store={subscribe:()=>()=>{},getSnapshot:()=>({prefs:{editorExplorer:true}})},ctx={betterSidebar:{matchFileViewer:()=>({})}},scope={sessionId:'session-a',cwd:'/work'}
 const host=win.document.createElement('main');win.document.body.append(host);const root=createRoot(host)
 const render=async(path:string)=>{await React.act(async()=>{root.render(React.createElement(Host,{ctx,store,scope,tab:{id:'editor',path,title:path.split('/').at(-1)},expanded:false}));await Promise.resolve()})}
 await render(initial)
 return{host,win,mounted,requests,waiting,render,button:()=>host.querySelector('[data-odyssey-pptx-mode-toggle]') as any,settle:async(ok:boolean)=>{await React.act(async()=>{waiting.shift()!(ok);await Promise.resolve()})},click:async()=>{await React.act(async()=>{const button=host.querySelector('[data-odyssey-pptx-mode-toggle]') as any;button?.click();await Promise.resolve()})},close:async()=>{await React.act(async()=>root.unmount());await win.happyDOM.close();for(const[key,value]of previous){if(value)Object.defineProperty(globalThis,key,value);else delete(globalThis as any)[key]}}}
}

it('wires the real PPT host icon beside the folder and derives its action from the current viewer',async()=>{
 const f=await fixture()
 try{
  expect(f.button()).not.toBeNull()
  expect(f.button().getAttribute('aria-label')).toBe('编辑演示文稿')
  expect(f.button().getAttribute('aria-pressed')).toBe('false')
  expect(f.button().previousElementSibling?.getAttribute('aria-label')).toBe('打开文件夹')
  expect(f.host.querySelector('.editorModeToggle')).toBeNull()
  expect(f.requests).toEqual([]);expect(f.host.querySelector('[aria-label="保存"]')).toBeNull()
  await f.click();expect(f.requests).toEqual(['/work/a.pptx']);expect(f.button().disabled).toBe(true)
  await f.click();expect(f.requests).toHaveLength(1)
  await f.settle(true)
  expect(f.button().getAttribute('aria-label')).toBe('关闭编辑模式')
  expect(f.button().getAttribute('title')).toBe('关闭编辑模式')
  expect(f.button().getAttribute('aria-pressed')).toBe('true')
  expect(f.host.querySelector('[aria-label="保存"]')).not.toBeNull()
  await f.click();await f.settle(true);expect(f.button().getAttribute('aria-label')).toBe('编辑演示文稿')
 }finally{await f.close()}
})

it.each(['pdf','docx','xlsx'])('does not add the PPT action to a %s viewer',async kind=>{
 const f=await fixture('/work/report.'+kind)
 try{expect(f.button()).toBeNull();expect(f.host.querySelector('[aria-label="打开文件夹"]')).not.toBeNull();expect(f.host.querySelector('.editorModeToggle')).not.toBeNull()}finally{await f.close()}
})

it.each(['readonly','loading','error'])('keeps an unavailable PPT action disabled (%s)',async reason=>{
 const f=await fixture('/work/report.pptx',{editable:reason!=='readonly',...(reason==='loading'||reason==='error'?{load:reason}:{})})
 try{expect(f.button()).not.toBeNull();expect(f.button().disabled).toBe(true);await f.click();expect(f.requests).toEqual([]);expect(f.host.querySelector('[aria-label="保存"]')).toBeNull()}finally{await f.close()}
})

it('does not claim edit mode after a failed transition and permits retry',async()=>{
 const f=await fixture()
 try{
  await f.click();expect(f.button().getAttribute('aria-busy')).toBe('true');await f.settle(false)
  expect(f.button().getAttribute('aria-pressed')).toBe('false');expect(f.button().disabled).toBe(false)
  await f.click();await f.settle(true);expect(f.button().getAttribute('aria-pressed')).toBe('true')
 }finally{await f.close()}
})

it('ignores previous-file callbacks and pending completions after switching the same tab',async()=>{
 const f=await fixture()
 try{
  const old=f.mounted.get('/work/a.pptx');await f.click()
  await f.render('/work/b.pptx')
  expect(f.button().getAttribute('aria-pressed')).toBe('false');expect(f.button().disabled).toBe(false)
  await React.act(async()=>{old.props.onToolbarState({modes:true,mode:'edit',editable:true});old.props.onToolbarControls(old.controls)})
  expect(f.button().getAttribute('aria-pressed')).toBe('false')
  await f.settle(true);expect(f.button().getAttribute('aria-pressed')).toBe('false')
  await f.click();expect(f.requests).toEqual(['/work/a.pptx','/work/b.pptx']);await f.settle(true)
  await f.render('/work/a.pptx');expect(f.button().getAttribute('aria-pressed')).toBe('false')
 }finally{await f.close()}
})

it('updates the actual installed sidebar once and refuses a partial mode-toolbar installation',()=>{
 expect(()=>new Script(source)).not.toThrow()
 expect(patchBetterSidebarClient(source)).toBe(source)
 expect(()=>patchBetterSidebarClient(source.replace('data-odyssey-pptx-mode-toggle','data-drifted-mode-toggle'))).toThrow(/PPT.*toolbar.*drift/i)
})

it('connects the real PPT editor to the sidebar icon without opening its edit bridge for initial preview',async()=>{
 const opens:any[]=[],documentFixture={id:'sidebar-mode-document',version:'v1',slides:[{index:0,part:'ppt/slides/slide1.xml',nodes:[{id:'ppt/slides/slide1.xml#node:2',nodeId:'2',part:'ppt/slides/slide1.xml',type:'shape',name:'标题',geometry:{x:0,y:0,width:200,height:100,rotation:0}}],fields:[{id:'title',nodeId:'2',paragraphIndex:0,label:'标题',text:'原始标题'}]}]}
 const f=await fixture('/work/native.pptx',{nativeEditor:true,bridge:{open:async(value:any)=>{opens.push(value);return{ok:true,document:structuredClone(documentFixture)}},save:async()=>({ok:true,document:documentFixture})}})
 try{
  expect(opens).toEqual([]);expect(f.button().disabled).toBe(false);expect(f.host.querySelector('[contenteditable=true]')).toBeNull();expect(f.host.querySelector('[role=status]')).toBeNull()
  await f.click()
  expect(opens).toHaveLength(1);expect(opens[0]).toMatchObject({path:'/work/native.pptx'})
  expect(f.button().getAttribute('aria-pressed')).toBe('true');expect(f.host.querySelector('[contenteditable=true]')).not.toBeNull()
  expect(f.host.querySelector('[data-ppt-editor] [role=status]')?.textContent).toContain('编辑模式')
  await f.click();expect(f.button().getAttribute('aria-label')).toBe('编辑演示文稿');expect(f.host.querySelector('[contenteditable=true]')).toBeNull()
  await f.render('/work/next.pptx');expect(opens).toHaveLength(1);expect(f.button().getAttribute('aria-pressed')).toBe('false');expect(f.host.querySelector('[role=status]')).toBeNull()
 }finally{await f.close()}
})

it('keeps the annotation icon in the same native header row and follows only the current viewer state',async()=>{
 const f=await fixture('/work/a.pptx',{annotations:true});try{
  const button=()=>f.host.querySelector('[data-odyssey-pptx-annotation-toggle]') as any
  expect(button()?.previousElementSibling).toBe(f.button());expect(button()?.getAttribute('aria-label')).toBe('标注演示文稿');expect(button()?.querySelector('img')?.width).toBe(16)
  await React.act(async()=>{button().click();button().click()});expect(f.requests).toEqual(['annotations:/work/a.pptx']);expect(button().disabled).toBe(true)
  await f.settle(true);expect(button().getAttribute('aria-pressed')).toBe('true');expect(button().getAttribute('aria-label')).toBe('关闭标注模式');expect(f.button().getAttribute('aria-pressed')).toBe('false')
  const old=f.mounted.get('/work/a.pptx');await f.render('/work/b.pptx');await React.act(async()=>old.publish({annotationActive:true}));expect(button().getAttribute('aria-pressed')).toBe('false')
 }finally{await f.close()}
})
it('opens actual read-only annotations from the real header without opening or saving the manual editor',async()=>{
 let disposed=0;const bridge={open:()=>{throw Error('must stay cold')},save:()=>{throw Error('must not save')}}
 const handle={getSnapshot:()=>({scene:{slides:[],slideSize:{width:800,height:450}},basis:{documentId:'doc',fileVersion:'v1'},marks:[],selectedId:null,revealSeq:0}),subscribe:()=>()=>{},dispose:()=>disposed++}
 const opened:any[]=[],f=await fixture('/work/a.pptx',{nativeEditor:true,bridge,annotationCoordinator:{open:async(source:any)=>{opened.push(source);return handle}}});try{
  await React.act(async()=>{(f.host.querySelector('[data-odyssey-pptx-annotation-toggle]') as any).click();await Promise.resolve()})
  expect(opened).toEqual([{sessionId:'session-a',source:{kind:'workspace',relativePath:'a.pptx'}}]);expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).not.toBeNull();expect(f.button().getAttribute('aria-pressed')).toBe('false')
  await React.act(async()=>{(f.host.querySelector('[data-odyssey-pptx-annotation-toggle]') as any).click()});expect(f.host.querySelector('[data-pptx-annotation-toolbar]')).toBeNull();expect(disposed).toBe(1)
 }finally{await f.close()}
})
