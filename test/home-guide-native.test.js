import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext,Script} from 'node:vm'
import {Window} from 'happy-dom'
import {afterEach,beforeAll,expect,it} from 'vitest'
const require=createRequire(import.meta.url),React=require('react'),{createRoot}=require('react-dom/client')
const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
let patchHomeGuideNative
beforeAll(async()=>{({patchHomeGuideNative}=await import('../scripts/lib/home-guide-native.mjs'))})
const cleanup=[];afterEach(async()=>{for(const f of cleanup.splice(0))await f()})
async function fixture({sessionId='owner',subagentPanel=false}={}){
 const win=new Window({url:'https://guide.test'}),doc=win.document,previous=new Map(['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]))
 for(const[k,v]of Object.entries({window:win,document:doc,navigator:win.navigator,IS_REACT_ACT_ENVIRONMENT:true}))Object.defineProperty(globalThis,k,{value:v,configurable:true})
 doc.body.innerHTML='<main class="pI_x6G_centerCol"><div class="wSkVaW_root"><header data-srb-session-header data-ework-notes-session="owner"></header><textarea>原草稿</textarea></div><section data-home-guide="run-a"><div id="guide-host"></div></section></main><div id="outside"></div>'
 Object.defineProperty(win.HTMLElement.prototype,'clientWidth',{configurable:true,get(){return 1100}})
 Object.defineProperty(win.HTMLElement.prototype,'clientHeight',{configurable:true,get(){return 720}})
 win.HTMLElement.prototype.getBoundingClientRect=function(){return{x:0,y:0,left:0,top:0,right:1100,bottom:720,width:1100,height:720,toJSON(){return{}}}}
 win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 let descriptor,liveCalls=0;win.dshDesktop={financialWidget:{request:()=>{liveCalls++;throw Error('must not use real provider')}},componentLibrary:{request:()=>{liveCalls++;throw Error('must not read real custom library')}}};win.__ModuleLoader__={load:d=>descriptor=d}
 const patched=patchHomeGuideNative(source).replace('exports.NativeHomeGuidePortal = NativeHomeGuidePortal;','exports.NativeHomeGuidePortal = NativeHomeGuidePortal;exports.__guideResident=homeGuideNativeResidentSession;')
 runInNewContext(patched,{window:win,document:doc,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,DOMParser:win.DOMParser,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),structuredClone,AbortController,TextDecoder,TextEncoder,crypto,setTimeout,clearTimeout,setInterval,clearInterval,console})
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),native=descriptor.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):fake)
 const host=doc.createElement('div');doc.body.append(host);const root=createRoot(host)
 await React.act(async()=>root.render(React.createElement(native.NativeHomeGuidePortal,{sessionId,subagentPanel})))
 let sequence=0
 const send=(command,extra={})=>new Promise(resolve=>{const detail={requestId:'request-'+(++sequence),runId:'run-a',sessionId:'owner',command,hostId:'guide-host',...extra};const onReply=e=>{if(e.detail?.requestId!==detail.requestId)return;win.removeEventListener('sherlock:home-guide-native-reply',onReply);resolve(e.detail)};win.addEventListener('sherlock:home-guide-native-reply',onReply);win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request',{detail}))})
 const command=async(name,extra={})=>{let result;await React.act(async()=>{result=await send(name,extra)});return result}
 cleanup.push(async()=>{await React.act(async()=>root.unmount());await win.happyDOM.abort();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]})
 return{win,doc,native,root,command,send,liveCalls:()=>liveCalls}
}
it('patches installed native code idempotently and refreshes its own serialized runtime',()=>{
 const patched=patchHomeGuideNative(source);new Script(patched)
 expect(patchHomeGuideNative(patched)).toBe(patched)
 const old=patched.replace('function NativeHomeGuidePortal(', '/* previous runtime */\nfunction NativeHomeGuidePortal(')
 expect(patchHomeGuideNative(old)).toBe(patched)
 expect(()=>patchHomeGuideNative('function unrelated(){}')).toThrow(/anchor|锚点/i)
})
it('isolates only the matching live main run or an exact-session exit lease',async()=>{
 const f=await fixture(),center=f.doc.querySelector('.pI_x6G_centerCol'),root=f.doc.querySelector('.wSkVaW_root'),guide=f.doc.querySelector('[data-home-guide]'),header=root.querySelector('[data-ework-notes-session]'),html=f.doc.documentElement
 center.dataset.homeGuideActive='run-a';root.dataset.homeGuideResident='run-a';guide.dataset.kind='board'
 expect(f.native.__guideResident('owner')).toBe(true)
 expect(f.native.__guideResident('other')).toBe(false);expect(f.native.__guideResident('owner',true)).toBe(false)
 guide.dataset.homeGuide='stale-run';expect(f.native.__guideResident('owner')).toBe(false)
 guide.dataset.homeGuide='run-a';delete center.dataset.homeGuideActive;delete root.dataset.homeGuideResident
 expect(f.native.__guideResident('owner')).toBe(false)
 html.dataset.homeGuideTransition='exit-a';html.dataset.homeGuideTransitionSession='other'
 expect(f.native.__guideResident('owner')).toBe(false)
 html.dataset.homeGuideTransitionSession='owner';expect(f.native.__guideResident('owner')).toBe(true)
 header.dataset.eworkNotesSession='other';expect(f.native.__guideResident('owner')).toBe(false)
 delete html.dataset.homeGuideTransition;expect(f.native.__guideResident('other')).toBe(false)
})
it('rejects unknown commands and a host outside the matching center tutorial without mounting',async()=>{
 const f=await fixture()
 expect((await f.command('unknown')).ok).toBe(false)
 expect((await f.command('mount-board',{hostId:'outside'})).ok).toBe(false)
 expect((await f.command('mount-board',{runId:'not-owner'})).ok).toBe(false)
 expect(f.doc.querySelector('[data-home-guide-native]')).toBeNull()
 expect(f.liveCalls()).toBe(0)
})
it('uses actual native components and offline links, then unmounts only the owned tutorial',async()=>{
 const f=await fixture(),input=f.doc.querySelector('textarea')
 expect((await f.command('mount-board')).ok).toBe(true)
 expect(f.doc.querySelector('[data-home-guide-native] [data-research-canvas]')).not.toBeNull()
 for(const command of ['board-library','board-watchlist','board-quote','board-news','board-link','board-add','board-arrange'])expect(await f.command(command)).toMatchObject({ok:true})
 expect(f.doc.querySelectorAll('[data-home-guide-native] [data-financial-widget]')).toHaveLength(3)
 expect(f.doc.querySelector('[data-home-guide-native] [data-financial-link]')).not.toBeNull()
 expect(f.doc.querySelectorAll('[data-home-guide-native] .ew-watch-row')).toHaveLength(3)
 expect(f.doc.querySelector('[data-home-guide-native]').textContent).toContain('示例')
 expect(f.liveCalls()).toBe(0)
 expect(f.doc.querySelector('textarea')).toBe(input);expect(input.value).toBe('原草稿')
 expect((await f.command('dispose')).ok).toBe(true)
 expect(f.doc.querySelector('[data-home-guide-native]')).toBeNull()
 expect(f.doc.querySelector('[data-ework-toolbar-owner="odyssey-home-guide:board"]')).toBeNull()
 expect(f.doc.querySelector('textarea')).toBe(input)
})
it('cancels a pending mount when its run is disposed and rejects obsolete run commands',async()=>{
 const f=await fixture();let mounted,disposed
 await React.act(async()=>{const pending=f.send('mount-board');const end=f.send('dispose');[mounted,disposed]=await Promise.all([pending,end])})
 expect(mounted.ok).toBe(false);expect(disposed.ok).toBe(true)
 expect(f.doc.querySelector('[data-home-guide-native]')).toBeNull()
 expect((await f.command('board-watchlist')).ok).toBe(false)
})
it('keeps the ordinary financial bridge and another canvas library independent of the offline guide',async()=>{
 const f=await fixture(),calls=[]
 const request=async args=>{calls.push(args.action);return{quotes:[],source:'普通行情服务'}}
 f.win.dshDesktop.financialWidget.request=request
 f.win.dshDesktop.componentLibrary.request=async()=>[]
 const memory=new Map(),registry=new f.native.ResearchWorkspaceRegistry({getItem:key=>memory.get(key)??null,setItem:(key,value)=>{memory.set(key,value);return true}}),workspace=registry.for('ordinary-board')
 workspace.setCanvasSize({width:1100,height:720,availableWidth:1100});workspace.setWorkbenchWidth(1100)
 const node=workspace.createFinancialWidget('watchlist')
 workspace.setArtifacts([{...node,containerSpec:{...node.containerSpec,symbols:[{market:'US',code:'AAPL',name:'原看板公司'}]}}])
 const host=f.doc.createElement('div');f.doc.body.append(host);const root=createRoot(host)
 try{
  await React.act(async()=>root.render(React.createElement(f.native.ResearchCanvas,{sessionId:'ordinary-board',t:key=>key,researchWorkspaces:registry})))
  expect(calls).toContain('quotes')
  const ordinaryToolbar=[...f.doc.querySelectorAll('[data-ework-toolbar-owner]')].find(el=>el.dataset.eworkToolbarOwner==='ordinary-board')
  await React.act(async()=>ordinaryToolbar.querySelector('[data-financial-library]').click())
  const ordinaryMenu=f.doc.querySelector('.ew-financial-library:not([data-home-guide-native-library])')
  expect(ordinaryMenu).not.toBeNull()
  expect(ordinaryMenu.querySelector('[data-financial-place=calendar]').disabled).toBe(false)
  expect((await f.command('mount-board')).ok).toBe(true)
  expect((await f.command('board-watchlist')).ok).toBe(true)
  expect((await f.command('board-library')).ok).toBe(true)
  const guideMenu=f.doc.querySelector('[data-home-guide-native-library="run-a"]')
  expect(guideMenu.querySelector('[data-financial-place=calendar]').disabled).toBe(true)
  expect(f.win.dshDesktop.financialWidget.request).toBe(request)
  expect(workspace.getSnapshot().artifacts).toHaveLength(1)
  expect(workspace.getSnapshot().artifacts[0].containerSpec.symbols[0].name).toBe('原看板公司')
  expect(f.doc.body.contains(ordinaryMenu)).toBe(true)
  expect((await f.command('dispose')).ok).toBe(true)
  expect(f.doc.body.contains(ordinaryToolbar)).toBe(true)
 }finally{await React.act(async()=>root.unmount())}
})
