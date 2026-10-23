import {readFileSync} from 'node:fs'
import {mkdir} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {afterAll,beforeAll,expect,it} from 'vitest'
import {patchHomeGuidePresentationNative,patchHomeGuidePresentationOffice,stripHomeGuidePresentationOffice} from '../scripts/lib/home-guide-presentation-native.mjs'
import {ResearchFilePreviewRegistry} from '../src/main/state/research-file-preview'
import {createHomeGuideAssetService} from '../src/main/home-guide-assets'

const vendor='/Users/heyafeng/Documents/ChatGPT/sherlock-desktop/build/sherlock-plugin-profile/vendor'
const runtimeSource=readFileSync('node_modules/@deepseek-ai/dsh-client-runtime/lib/client.js','utf8')
const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const conversationSource=patchHomeGuidePresentationNative(source).replace('exports.NativeHomePresentationPortal = NativeHomePresentationPortal;','exports.NativeHomePresentationPortal = NativeHomePresentationPortal;exports.__input=InputBar;exports.__bind=deps=>{HomePresentationNativeDeps=deps};')
const sidebarSource=readFileSync(vendor+'/dsh-better-sidebar/lib/client.js','utf8').replace('exports.apply = apply;','exports.apply = apply;exports.__store=createSidebarStore;exports.__service=createBetterSidebarService;exports.__content=TabContent;')
const officeSource=patchHomeGuidePresentationOffice(stripHomeGuidePresentationOffice(readFileSync(vendor+'/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8')))
const evidence='/tmp/home-presentation-guide-20261024'
let browser,entry
beforeAll(async()=>{
 const result=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';
 import {mountHomePresentationGuide} from './src/preload/home-guide-presentation';
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})}),empty=()=>null;
 const primitives=new Proxy({Tooltip:({children})=>children},{get:(target,key)=>target[key]??empty});
 const modules=id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?primitives:id==='@deepseek-ai/dsh-client-ui-attachment'?{DropOverlay:empty,AttachmentRail:empty}:fake;
 const runtime=window.descriptors.runtime.factory(modules),native=window.descriptors.conversation.factory(id=>id==='@deepseek-ai/dsh-client-runtime/client'?runtime:modules(id)),sidebar=window.descriptors.sidebar.factory(modules),office=window.descriptors.office.factory(modules);
 const shell=new native.SessionInputShell({actx:{},defaultSink:()=>{window.probe.sent++}});shell.setDraft('原生草稿：保留光标与节点');
 const store=sidebar.__store();store.setSession('owner');const service=sidebar.__service(store);
 service.registerTab({id:'existing-file',title:'原文件',hidden:true,component:()=> <div data-existing-file>原有用户标签</div>});service.openTab({id:'user-file',type:'existing-file',title:'原文件'},{sessionId:'owner'});
 const flat=node=>!node?[]:node.kind==='leaf'||Array.isArray(node.tabs)?[node]:[...flat(node.first??node.a??node.children?.[0]),...flat(node.second??node.b??node.children?.[1])];
 window.probe={sent:0,assets:0,service,store,native,shell,flat,guide:null,releaseGrant:null};
 native.__bind({researchSidebar:{service},researchOfficePreview:{service:office.officePreviewService}});
 const props={useSession:select=>select({running:false,promptError:null,subagent:null,removed:false}),useInput:select=>React.useSyncExternalStore(shell.state.subscribe,()=>select(shell.snapshot),()=>select(shell.snapshot)),inputActions:shell.actions,keyboard:shell,renderSlot:()=>null,useNotices:select=>select(null),useLexicon:select=>select(new Map()),useMenuLauncher:select=>select(null),useProjection:(_key,select)=>select?.(undefined),sessionId:'owner',t:key=>key,variant:'hero'};
 function App(){const [context,setContext]=React.useState({sessionId:'owner',subagentPanel:false});window.probe.context=setContext;return <><native.__input {...props}/><native.NativeHomePresentationPortal {...context}/></>}
 function Right(){const snapshot=React.useSyncExternalStore(fn=>store.subscribe(fn),()=>store.getSnapshot(),()=>store.getSnapshot());const leaves=flat(snapshot.state?.splits);return <>{leaves.flatMap(leaf=>leaf.tabs.map(tab=><div key={tab.id} data-native-sidebar-tab={tab.id} style={{display:leaf.active===tab.id?'block':'none',height:'100%'}}><sidebar.__content tab={tab} sessionId="owner" cwd="" visible={leaf.active===tab.id} store={store} ctx={{betterSidebar:service}}/></div>))}</>}
 const root=createRoot(document.querySelector('#ordinary')),right=createRoot(document.querySelector('#right'));root.render(<App/>);right.render(<Right/>);
 Object.assign(window.probe,{async mount(){this.guide=await mountHomePresentationGuide(document,document.querySelector('#guide-host'),{signal:(this.controller=new AbortController()).signal,sessionId:'owner',runId:'run-ppt'})},step:name=>window.probe.guide.runStep(name),dispose(){this.guide?.dispose()},unmount(){root.unmount();right.unmount()},tabs(){return flat(store.getSnapshot().state?.splits).flatMap(leaf=>leaf.tabs.map(tab=>tab.id))}});
 `},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}})
 entry=result.outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await pw.chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',args:['--enable-unsafe-swiftshader']})
 await mkdir(evidence,{recursive:true})
},30000)
afterAll(()=>browser?.close())
async function fixture(){
 const registry=new ResearchFilePreviewRegistry({storage:{load:()=>[],save:()=>true}}),service=createHomeGuideAssetService({registry,companyPresentationPath:resolve('skills/efund-ppt-maker/assets/efund-ework-onepage.pptx')})
 const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[],requests=[]
 page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(6000)
 await page.exposeFunction('__assetRequest',async input=>{requests.push(input);return service.request(input)})
 await page.route('https://presentation-guide.test/**',async route=>{
  const url=new URL(route.request().url())
  if(url.pathname==='/capability'){const response=await registry.handle(new Request(url.searchParams.get('url')));return route.fulfill({status:response.status,contentType:response.headers.get('content-type')??'',body:Buffer.from(await response.arrayBuffer())})}
  return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><main class="pI_x6G_centerCol"><header data-srb-session-header data-ework-notes-session="owner"></header><div id="ordinary"></div><section data-home-guide="run-ppt"><div id="guide-host"></div></section></main><aside id="right"></aside>'})
 })
 await page.goto('https://presentation-guide.test/')
 await page.evaluate(()=>{window.descriptors={};window.__ModuleLoader__={load:d=>window.descriptor=d};window.dshDesktop={homeGuideAssets:{request:input=>window.__assetRequest(input)}};const original=window.fetch;window.fetch=(url,options)=>original(String(url).startsWith('sherlock-preview:')?'/capability?url='+encodeURIComponent(url):url,options)})
 for(const[name,script]of Object.entries({runtime:runtimeSource,conversation:conversationSource,sidebar:sidebarSource,office:officeSource})){await page.addScriptTag({content:script});await page.evaluate(name=>{window.descriptors[name]=window.descriptor},name)}
 const nativeCSS=[...source.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match=>JSON.parse(match[1])).join('\n')
 const styles=['figma-final-shell','figma-home','figma-panels','figma-inline-references','figma-reading'].map(name=>readFileSync('src/preload/'+name+'.css','utf8')).join('\n')
 await page.addStyleTag({content:nativeCSS+'\n'+styles+'\nhtml,body{margin:0;height:100%}.pI_x6G_centerCol{position:relative;width:860px;height:100vh}#ordinary{padding:20px}#guide-host{position:absolute;inset:180px 10px 20px;background:#f5f5f5}#right{position:absolute;left:860px;top:0;width:580px;height:100vh;overflow:hidden}[data-home-presentation-native]>.uV2eYG_root{flex:none}.uV2eYG_root{max-width:780px}body{--odyssey-font-ui:system-ui;--dsw-font-family:system-ui;--dsw-alias-bg-base:#fff;--dsw-alias-label-primary:#222}'})
 await page.addScriptTag({content:entry});await page.waitForSelector('#ordinary textarea')
 await page.evaluate(()=>{window.probe.original=document.querySelector('#ordinary textarea')})
 const baselineTabs=await page.evaluate(()=>window.probe.tabs())
 return{page,errors,requests,service,baselineTabs,close:async()=>{await page.close();service.dispose()}}
}
it('runs real native InputBar/TodoPanel and previews the exact PPTX in a real sidebar tab without touching the user draft',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.mount());await page.evaluate(()=>window.probe.step('brief'))
  expect(await page.locator('#guide-host textarea').inputValue()).toContain('EWork Odyssey')
  await page.waitForSelector('#guide-host .uV2eYG_chip[data-reference-source="ework-managed-skill"]')
  await page.evaluate(()=>window.probe.step('plan'));expect(await page.locator('#guide-host [data-testid="todo-panel"]').count()).toBe(1)
  expect(await page.locator('#guide-host [data-status="in_progress"]').count()).toBe(1)
  await page.evaluate(()=>window.probe.step('layout'));await page.evaluate(()=>window.probe.step('deliver'))
  expect(await page.locator('#guide-host [data-status="completed"]').count()).toBe(3)
  await page.evaluate(()=>window.probe.step('open'))
  await page.waitForFunction(()=>document.querySelectorAll('#right [data-slide-index]').length>0)
  expect(await page.locator('#right .sherlock-ppt-editor').count()).toBe(0)
  expect(await page.locator('#right [data-pptx-node-id]').count()).toBeGreaterThan(0)
  expect(await page.evaluate(()=>window.probe.tabs().includes('user-file'))).toBe(true)
  expect(await page.evaluate(()=>window.probe.original===document.querySelector('#ordinary textarea'))).toBe(true)
  expect(await page.locator('#ordinary textarea').inputValue()).toBe('原生草稿：保留光标与节点')
  expect(await page.evaluate(()=>window.probe.sent)).toBe(0)
  await page.screenshot({path:evidence+'/real-input-todo-office.png'})
  await page.evaluate(()=>window.probe.dispose())
  expect(await page.locator('#guide-host textarea').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.tabs())).toEqual(f.baselineTabs)
  expect(f.requests.map(r=>r.action)).toEqual(['grant','release']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)

it('cancels an in-flight grant, rejects stale commands and cleans only its tab on session/context changes',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{const request=window.dshDesktop.homeGuideAssets.request;window.dshDesktop.homeGuideAssets.request=input=>input.action==='grant'?new Promise(resolve=>{window.probe.releaseGrant=()=>request(input).then(resolve)}):request(input)})
  await page.evaluate(()=>window.probe.mount())
  for(const step of ['brief','plan','layout','deliver'])await page.evaluate(step=>window.probe.step(step),step)
  await page.evaluate(()=>{window.probe.opening=window.probe.step('open').then(()=>true,()=>false)})
  await page.waitForFunction(()=>typeof window.probe.releaseGrant==='function')
  await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('sherlock:home-action-context-changed',{detail:{sessionId:'other'}}));window.probe.releaseGrant()})
  expect(await page.evaluate(()=>window.probe.opening)).toBe(false)
  expect(await page.evaluate(()=>window.probe.tabs())).toEqual(f.baselineTabs)
  expect(await page.locator('#guide-host textarea').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.original===document.querySelector('#ordinary textarea'))).toBe(true)
  expect(f.requests.at(-1).action).toBe('release');expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('cleans a late native tab open after abort without closing any pre-existing user tab',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.locator('#ordinary textarea').focus();await page.locator('#ordinary textarea').evaluate(input=>input.setSelectionRange(2,4))
  await page.evaluate(()=>window.probe.mount())
  expect(await page.evaluate(()=>document.activeElement===window.probe.original&&window.probe.original.selectionStart===2&&window.probe.original.selectionEnd===4)).toBe(true)
  for(const step of ['brief','plan','layout','deliver'])await page.evaluate(step=>window.probe.step(step),step)
  await page.evaluate(()=>{const original=window.probe.service.openTab;window.probe.service.openTab=(seed,scope)=>new Promise(resolve=>{window.probe.lateOpen=()=>{original(seed,scope);resolve()}});window.probe.opening=window.probe.step('open').then(()=>true,()=>false)})
  await page.waitForFunction(()=>typeof window.probe.lateOpen==='function')
  await page.evaluate(()=>{window.probe.controller.abort();window.probe.lateOpen()})
  expect(await page.evaluate(()=>window.probe.opening)).toBe(false)
  await expect.poll(()=>page.evaluate(()=>window.probe.tabs())).toEqual(f.baselineTabs)
  expect(await page.locator('#guide-host textarea').count()).toBe(0)
  expect(await page.evaluate(()=>window.probe.sent)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('restores the original closed panel and exact active user tab when the tutorial still owns the sidebar',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{const {service}=window.probe;service.openTab({id:'later-user-file',type:'existing-file',title:'稍后文件'},{sessionId:'owner'});service.activateTab('user-file',{sessionId:'owner'});service.setPanelState({open:false},{sessionId:'owner'})})
  await page.evaluate(()=>window.probe.mount())
  for(const step of ['brief','plan','layout','deliver','open'])await page.evaluate(step=>window.probe.step(step),step)
  expect(await page.evaluate(()=>window.probe.store.getSnapshot().state.panelOpen)).toBe(true)
  await page.evaluate(()=>window.probe.dispose())
  expect(await page.evaluate(()=>window.probe.store.getSnapshot().state.panelOpen)).toBe(false)
  expect(await page.evaluate(()=>{const s=window.probe.store.getSnapshot().state;return window.probe.flat(s.splits).find(leaf=>leaf.id===s.activePane)?.active})).toBe('user-file')
  expect(await page.evaluate(()=>window.probe.tabs())).toEqual([...f.baselineTabs,'later-user-file'])
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('preserves a user tab or panel change including a complete away-and-back revision during the tutorial',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>window.probe.service.setPanelState({open:false},{sessionId:'owner'}))
  await page.evaluate(()=>window.probe.mount())
  for(const step of ['brief','plan','layout','deliver','open'])await page.evaluate(step=>window.probe.step(step),step)
  await page.evaluate(()=>{const {service}=window.probe;service.activateTab('user-file',{sessionId:'owner'});service.setPanelState({open:false},{sessionId:'owner'});service.activateTab('home-presentation:run-ppt',{sessionId:'owner'});service.setPanelState({open:true},{sessionId:'owner'})})
  await page.evaluate(()=>window.probe.dispose())
  expect(await page.evaluate(()=>window.probe.store.getSnapshot().state.panelOpen)).toBe(true)
  expect(await page.evaluate(()=>window.probe.tabs())).toEqual(f.baselineTabs)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('does not reopen the panel when the user changes it during a delayed asset grant',async()=>{
 const f=await fixture(),{page}=f
 try{
  await page.evaluate(()=>{window.probe.service.setPanelState({open:false},{sessionId:'owner'});const request=window.dshDesktop.homeGuideAssets.request;window.dshDesktop.homeGuideAssets.request=input=>input.action==='grant'?new Promise(resolve=>{window.probe.releaseGrant=()=>request(input).then(resolve)}):request(input)})
  await page.evaluate(()=>window.probe.mount())
  for(const step of ['brief','plan','layout','deliver'])await page.evaluate(step=>window.probe.step(step),step)
  await page.evaluate(()=>{window.probe.opening=window.probe.step('open').then(()=>true,()=>false)})
  await page.waitForFunction(()=>typeof window.probe.releaseGrant==='function')
  await page.evaluate(()=>{const {service}=window.probe;service.setPanelState({open:true},{sessionId:'owner'});service.setPanelState({open:false},{sessionId:'owner'});window.probe.releaseGrant()})
  expect(await page.evaluate(()=>window.probe.opening)).toBe(false)
  expect(await page.evaluate(()=>window.probe.store.getSnapshot().state.panelOpen)).toBe(false)
  expect(await page.evaluate(()=>window.probe.tabs())).toEqual(f.baselineTabs)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
