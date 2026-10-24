import {existsSync, readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {createRequire} from 'node:module'
import {runInNewContext, Script} from 'node:vm'
import {Window} from 'happy-dom'
import {expect, it} from 'vitest'
import {patchBetterSidebarClient} from '../scripts/lib/patch-sherlock-better-sidebar.mjs'

const require=createRequire(import.meta.url),React=require('react'),jsx=require('react/jsx-runtime'),{createRoot}=require('react-dom/client')
const relative='build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js'
const original=readFileSync(existsSync(relative)?relative:resolve('../..',relative),'utf8')
const source=patchBetterSidebarClient(original)
const start=source.indexOf('function EditorHost(props) {'),end=source.indexOf('\n\t\t/**',start)
if(start<0||end<0)throw Error('Real sidebar EditorHost boundary missing')

async function fixture(initial='/work/a.pptx',options:{editable?:boolean,load?:'ready'|'loading'|'error'}={}){
 const win=new Window({url:'http://localhost/'}),previous=new Map<string,PropertyDescriptor|undefined>()
 for(const [key,value]of Object.entries({window:win,document:win.document,navigator:win.navigator,IS_REACT_ACT_ENVIRONMENT:true})){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,value})}
 const mounted=new Map<string,any>(),requests:string[]=[],waiting:Array<(value:boolean)=>void>=[]
 function Viewer(props:any){
  React.useEffect(()=>{
   let current={modes:true,mode:'preview',editable:options.editable!==false,modeBusy:false,saveState:'idle',downloadUrl:'/download/'+props.path.split('/').at(-1)}
   const publish=(patch:any)=>{current={...current,...patch};props.onToolbarState(current)}
   const controls={save:()=>{},toggleMode:async()=>{requests.push(props.path);publish({modeBusy:true});const ok=await new Promise<boolean>(done=>waiting.push(done));publish({modeBusy:false,...(ok?{mode:current.mode==='edit'?'preview':'edit'}:{})});return ok},setMode:()=>{}}
   mounted.set(props.path,{publish,props,controls});props.onToolbarControls(controls);publish({})
   return()=>props.onToolbarControls(null)
  },[props.path,props.onToolbarControls,props.onToolbarState])
  return React.createElement('div',{'data-viewer':props.path},'PPT preview')
 }
 const empty=()=>null,primitives=new Proxy({},{get:()=>empty}),classes=new Proxy({},{get:(_t,key)=>String(key)})
 const Host=runInNewContext(source.slice(start,end)+'\nEditorHost',{react:React,react_jsx_runtime:jsx,_deepseek_ai_dsh_client_ui_primitives:primitives,sidebar_module_css_default:classes,clsx:(...items:any[])=>items.filter(Boolean).join(' '),baseName$1:(path:string)=>path.split('/').at(-1),treeWidthOf:()=>240,treeOpenOf:()=>false,clampTreeWidth:(v:number)=>v,EditorPathInput:()=>React.createElement('input'),TreePanel:empty,BinaryDownload:empty,openSidebarFile:()=>{},patchMeta:()=>{},mediaUrl:()=>'',planFirstMatch:()=>options.load==='loading'?{kind:'customLoad',viewer:{load:()=>new Promise(()=>{})}}:options.load==='error'?{kind:'customLoad',viewer:{load:async()=>{throw Error('cannot read file')}}}:{kind:'render',viewer:{id:'office-pptx',component:Viewer}},AbortController,JSON,console,t:(key:string)=>({downloadToView:'下载',editorTreeToggle:'打开文件夹',save:'保存',preview:'预览',edit:'编辑'}[key]??key)})
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
