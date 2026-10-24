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
 // Happy DOM has no layout engine. Expose native card inline geometry here;
 // actual CSS transitions, viewport fitting and footer bounds run in Chromium.
 win.HTMLElement.prototype.getBoundingClientRect=function(){
  const card=this.hasAttribute('data-research-node-id'),width=card?parseFloat(this.style.width):1100,height=card?parseFloat(this.style.height):720,left=card?parseFloat(this.style.left)-width/2:0,top=card?parseFloat(this.style.top)-height/2:0
  return{x:left,y:top,left,top,right:left+width,bottom:top+height,width,height,toJSON(){return{left,top,width,height}}}
 }
 win.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
 let descriptor,liveCalls=0;win.dshDesktop={financialWidget:{request:()=>{liveCalls++;throw Error('must not use real provider')}},componentLibrary:{request:()=>{liveCalls++;throw Error('must not read real custom library')}}};win.__ModuleLoader__={load:d=>descriptor=d}
 const patched=patchHomeGuideNative(source).replace('exports.NativeHomeGuidePortal = NativeHomeGuidePortal;','exports.NativeHomeGuidePortal = NativeHomeGuidePortal;exports.__guideResident=homeGuideNativeResidentSession;exports.__setGuidePage=page=>{sherlockBoardsAdapter=page};')
 runInNewContext(patched,{window:win,document:doc,localStorage:win.localStorage,navigator:win.navigator,CSS:win.CSS,DOMParser:win.DOMParser,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,HTMLTextAreaElement:win.HTMLTextAreaElement,Text:win.Text,CustomEvent:win.CustomEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,MutationObserver:win.MutationObserver,requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),structuredClone,AbortController,TextDecoder,TextEncoder,crypto,setTimeout,clearTimeout,setInterval,clearInterval,console})
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),native=descriptor.factory(id=>['react','react/jsx-runtime','react-dom'].includes(id)?require(id):fake)
 const disk=new Map(),registry=new native.ResearchWorkspaceRegistry({getItem:key=>disk.get(key)??null,setItem:(key,value)=>{disk.set(key,value);return true}})
 native.__setGuidePage(new Proxy({getState:()=>({account:{status:'ready',user:{userId:'test-owner'}},favorites:[],boards:[],notifications:{}}),getHomeGuideSession:id=>id==='owner'?{kind:'board',sessionId:id,cwd:'/examples/board',title:'示例看板'}:undefined,homeGuideSessionsReady:()=>true,version:()=>0,subscribe:()=>()=>{}},{get:(target,key)=>target[key]??(()=>undefined)}))
 const host=doc.createElement('div');doc.body.append(host);const root=createRoot(host)
 await React.act(async()=>root.render(React.createElement(native.NativeHomeGuidePortal,{sessionId,subagentPanel,researchWorkspaces:registry})))
 let sequence=0
 const send=(command,extra={})=>new Promise(resolve=>{const detail={requestId:'request-'+(++sequence),runId:'run-a',sessionId:'owner',command,hostId:'guide-host',...extra};const onReply=e=>{if(e.detail?.requestId!==detail.requestId)return;win.removeEventListener('sherlock:home-guide-native-reply',onReply);resolve(e.detail)};win.addEventListener('sherlock:home-guide-native-reply',onReply);win.dispatchEvent(new win.CustomEvent('sherlock:home-guide-native-request',{detail}))})
 const command=async(name,extra={})=>{
  let result,done=false
  await React.act(async()=>{void send(name,extra).then(value=>{result=value;done=true})})
  const deadline=Date.now()+12000
  while(!done){if(Date.now()>deadline)throw Error('Native command did not reply: '+name);await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})}
  return result
 }
 cleanup.push(async()=>{await React.act(async()=>root.unmount());await win.happyDOM.abort();for(const[k,d]of previous)d?Object.defineProperty(globalThis,k,d):delete globalThis[k]})
 return{win,doc,native,root,registry,disk,workspace:registry.for(sessionId),command,send,liveCalls:()=>liveCalls}
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
 await f.command('mount-board').then(reply=>expect(reply.ok,reply.message).toBe(true))
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
 expect(f.doc.querySelector('[data-ework-toolbar-owner="owner"]')).toBeNull()
 expect(f.doc.querySelector('textarea')).toBe(input)
},20000)
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
  await f.command('mount-board').then(reply=>expect(reply.ok,reply.message).toBe(true))
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

it('persists tutorial steps into its real registered workspace and reopens ordinary native components offline',async()=>{
 const f=await fixture();await f.command('mount-board').then(reply=>expect(reply.ok,reply.message).toBe(true))
 expect((await f.command('board-watchlist')).ok).toBe(true)
 expect(f.workspace.getSnapshot().artifacts).toHaveLength(1)
 expect(JSON.parse(f.disk.get('sherlock.research.canvas.artifacts.v1:owner'))).toHaveLength(1)
 const ids=f.workspace.getSnapshot().artifacts.map(node=>node.id)
 expect((await f.command('dispose')).ok).toBe(true)
 await f.command('mount-board').then(reply=>expect(reply.ok,reply.message).toBe(true))
 expect(f.workspace.getSnapshot().artifacts.map(node=>node.id)).toEqual(ids)
 expect((await f.command('dispose')).ok).toBe(true)
 const reopened=new f.native.ResearchWorkspaceRegistry({getItem:key=>f.disk.get(key)??null,setItem:(key,value)=>{f.disk.set(key,value);return true}}),host=f.doc.createElement('div'),root=createRoot(host);f.doc.body.append(host)
 try{await React.act(async()=>root.render(React.createElement(f.native.ResearchCanvas,{sessionId:'owner',t:key=>key,researchWorkspaces:reopened})));await new Promise(resolve=>setTimeout(resolve,50));expect(host.querySelector('[data-financial-widget=watchlist]').textContent).toContain('1,456.80');expect(f.liveCalls()).toBe(0)}finally{await React.act(async()=>root.unmount())}
},15000)
it('cues real controls before clicking and pauses the pre-action delay without losing its run',async()=>{
 const f=await fixture(),cues=[];await f.command('mount-board').then(reply=>expect(reply.ok,reply.message).toBe(true))
 f.win.addEventListener('sherlock:home-guide-cue',event=>cues.push(event.detail))
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{runId:'run-a',sessionId:'owner',playing:false}}))
 let done=false,pending;await React.act(async()=>{pending=f.send('board-library').then(reply=>{done=true;return reply});await new Promise(resolve=>setTimeout(resolve,80))})
 expect(done).toBe(false);expect(f.doc.querySelector('[data-financial-library]').getAttribute('aria-expanded')).toBe('false')
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{runId:'run-a',sessionId:'owner',playing:true}}))
 await React.act(async()=>expect((await pending).ok).toBe(true))
 expect(cues.some(cue=>cue.runId==='run-a'&&cue.target?.matches('[data-financial-library]')&&cue.label)).toBe(true)
},10000)
it('adds the example stock through native search controls while retaining the saved component IDs',async()=>{
 const f=await fixture(),cues=[];f.workspace.setCanvasSize({width:1100,height:720,availableWidth:1100});f.workspace.setWorkbenchWidth(1100)
 const watch=f.workspace.createFinancialWidget('watchlist'),quote=f.workspace.createFinancialWidget('quote'),news=f.workspace.createFinancialWidget('news')
 f.workspace.setArtifacts([{...watch,containerSpec:{...watch.containerSpec,symbols:[{market:'SH',code:'600519',name:'贵州茅台'},{market:'SZ',code:'000001',name:'平安银行'}]}},{...quote,containerSpec:{...quote.containerSpec,linkedWatchlistId:watch.id}},{...news,containerSpec:{...news.containerSpec,linkedSourceId:quote.id}}])
 await f.command('mount-board').then(reply=>expect(reply.ok,reply.message).toBe(true))
 f.win.addEventListener('sherlock:home-guide-cue',event=>cues.push(event.detail))
 await f.command('board-add').then(reply=>expect(reply.ok,reply.message).toBe(true))
 expect(cues.some(cue=>cue.target?.getAttribute('aria-label')==='添加自选股')).toBe(true)
 expect(cues.some(cue=>cue.target?.getAttribute('aria-label')==='搜索个股代码或名字')).toBe(true)
 expect(f.workspace.getSnapshot().artifacts.map(node=>node.id).sort()).toEqual([watch.id,quote.id,news.id].sort())
 expect(f.workspace.getSnapshot().artifacts.find(node=>node.id===watch.id).containerSpec.symbols).toHaveLength(3)
},15000)

const pump=async predicate=>{for(let i=0;i<150;i++){if(predicate())return;await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})}throw Error('Pointer fixture timed out')}
function pointerFixture(f,{automatic=false}={}){
 f.doc.documentElement.dataset.homeGuidePointerRun='run-a'
 const cues=[],reply=(cue,extra={})=>f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true,...extra}}))
 f.win.addEventListener('sherlock:home-guide-cue',event=>{cues.push(event.detail);if(automatic)reply(event.detail)})
 return{cues,reply}
}
function seedBoard(f){
 f.workspace.setCanvasSize({width:1100,height:720,availableWidth:1100});f.workspace.setWorkbenchWidth(1100)
 const watch=f.workspace.createFinancialWidget('watchlist'),quote=f.workspace.createFinancialWidget('quote'),news=f.workspace.createFinancialWidget('news')
 f.workspace.setArtifacts([{...watch,containerSpec:{...watch.containerSpec,symbols:[{market:'SH',code:'600519',name:'贵州茅台'},{market:'SZ',code:'000001',name:'平安银行'}]}},quote,news])
 return{watch,quote,news}
}
it('waits for matching pointer acknowledgement and resumed playback before the native library click',async()=>{
 const f=await fixture();await f.command('mount-board');const p=pointerFixture(f)
 let reply;await React.act(async()=>{void f.send('board-library').then(value=>{reply=value})})
 await pump(()=>p.cues.length>0);const cue=p.cues[0],button=f.doc.querySelector('[data-financial-library]')
 expect(cue).toMatchObject({runId:'run-a',action:'click',requestId:expect.any(String)})
 expect(button.getAttribute('aria-expanded')).toBe('false')
 p.reply(cue,{requestId:'another-request'});await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,30))});expect(button.getAttribute('aria-expanded')).toBe('false')
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{runId:'run-a',sessionId:'owner',playing:false}}));p.reply(cue)
 await React.act(async()=>{await new Promise(resolve=>setTimeout(resolve,80))});expect(button.getAttribute('aria-expanded')).toBe('false');expect(reply).toBeUndefined()
 f.win.dispatchEvent(new f.win.CustomEvent('sherlock:home-guide-playback',{detail:{runId:'run-a',sessionId:'owner',playing:true}}))
 await pump(()=>reply);expect(reply.ok).toBe(true);expect(button.getAttribute('aria-expanded')).toBe('true')
},10000)
it.each(['dispose','disabled','pointer-owner','detached','rejected'])('rejects a late pointer acknowledgement after %s without clicking',async invalid=>{
 const f=await fixture();await f.command('mount-board');const p=pointerFixture(f)
 let reply;await React.act(async()=>{void f.send('board-library').then(value=>{reply=value})});await pump(()=>p.cues.length>0)
 expect(p.cues[0].requestId).toEqual(expect.any(String))
 const button=f.doc.querySelector('[data-financial-library]');let clicks=0;button.addEventListener('click',()=>clicks++)
 if(invalid==='dispose')await f.command('dispose');else if(invalid==='disabled')button.disabled=true;else if(invalid==='pointer-owner')f.doc.documentElement.dataset.homeGuidePointerRun='another-run';else if(invalid==='detached')button.remove()
 p.reply(p.cues[0],invalid==='rejected'?{ok:false,message:'指针目标不可用'}:{});await pump(()=>reply);expect(reply.ok).toBe(false);expect(clicks).toBe(0)
},10000)
it('shows and commits each port connection separately and cancels the second without a late apply',async()=>{
 const f=await fixture(),{watch,quote,news}=seedBoard(f);await f.command('mount-board');const p=pointerFixture(f)
 let reply;await React.act(async()=>{void f.send('board-link').then(value=>{reply=value})});await pump(()=>p.cues.length>0)
 expect(p.cues[0]).toMatchObject({action:'drag',requestId:expect.any(String)})
 expect(p.cues[0].fromTarget.dataset).toMatchObject({financialPort:'output',financialPortNode:watch.id});expect(p.cues[0].target.dataset).toMatchObject({financialPort:'input',financialPortNode:quote.id})
 const spec=id=>f.workspace.getSnapshot().artifacts.find(node=>node.id===id).containerSpec
 expect(spec(quote.id).linkedWatchlistId).toBeUndefined();expect(spec(news.id).linkedSourceId).toBeUndefined()
 p.reply(p.cues[0]);await pump(()=>p.cues.length===2)
 expect(spec(quote.id).linkedWatchlistId).toBe(watch.id);expect(spec(news.id).linkedSourceId).toBeUndefined()
 expect(p.cues[1].fromTarget.dataset.financialPortNode).toBe(quote.id);expect(p.cues[1].target.dataset.financialPortNode).toBe(news.id)
 await f.command('dispose');p.reply(p.cues[1]);await pump(()=>reply);expect(reply.ok).toBe(false);expect(spec(news.id).linkedSourceId).toBeUndefined()
},10000)
it('types the stock code character by character through actual search and keeps three linked widgets persisted',async()=>{
 const f=await fixture(),{watch,quote,news}=seedBoard(f);await f.command('mount-board');const p=pointerFixture(f,{automatic:true}),typed=[]
 f.doc.addEventListener('input',event=>{if(event.target.getAttribute?.('role')==='combobox')typed.push(event.target.value)},true)
 expect((await f.command('board-link')).ok).toBe(true);expect(p.cues.filter(cue=>cue.action==='drag')).toHaveLength(2)
 expect((await f.command('board-add')).ok).toBe(true)
 expect(typed).toEqual(['0','00','007','0070','00700'])
 const nodes=f.workspace.getSnapshot().artifacts
 expect(nodes.map(node=>node.id).sort()).toEqual([watch.id,quote.id,news.id].sort());expect(nodes.find(node=>node.id===watch.id).containerSpec.symbols).toHaveLength(3)
 expect(nodes.find(node=>node.id===quote.id).containerSpec.symbols[0].code).toBe('00700')
 expect(JSON.parse(f.disk.get('sherlock.research.canvas.artifacts.v1:owner')).map(node=>node.id).sort()).toEqual([watch.id,quote.id,news.id].sort());expect(f.liveCalls()).toBe(0)
},15000)
