import {afterEach,expect,it,vi} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {runInNewContext} from 'node:vm'
import {Window} from 'happy-dom'
import * as React from 'react'
import * as jsx from 'react/jsx-runtime'
import {createRoot} from 'react-dom/client'
import * as ui from '../scripts/lib/research-grid-ui.mjs'
import {createComponentDataStatusStore,componentRssStatusView,componentDataStatusCss} from '../scripts/lib/component-data-status.mjs'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

const cleanups=[]
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close();vi.useRealTimers()})
const node=(type='table',extra={})=>({id:'card',kind:'generated-container',title:'内容标题',containerSpec:{version:1,type,...extra}})
const binding=(extra={})=>({nodeId:'card',enabled:true,intervalMinutes:5,status:'success',lastSuccess:Date.now()-86400000,...extra})
const state=(n,b,options)=>ui.workbenchRefreshState?.(n,b,options)

it('maps only an actual refresh route and enabled schedule to the header icon',()=>{
 for(const n of [node('table',{rows:[[1]]}),node('chart',{series:[1]}),node('html',{html:'<table><tr><td>实际取得数据</td></tr></table>'})]){
  expect(state(n,binding())).toMatchObject({state:'scheduled',icon:'refresh'})
  expect(state(n,binding({status:'error'}))).toMatchObject({state:'error',icon:'refresh'})
  for(const b of [binding({enabled:false}),binding({enabled:false,intervalMinutes:0,status:'error'}),binding({enabled:true,intervalMinutes:0})])expect(state(n,b)).toMatchObject({state:'manual',icon:'refresh-manual'})
  expect(state({...n,lastSuccessfulAt:Date.now(),refreshMinutes:1,sourceBinding:{enabled:true,intervalMinutes:1}},null)).toBeNull()
 }
 expect(state(node('iframe',{url:'https://example.com'}),null)).toMatchObject({state:'manual'})
 expect(state(node('iframe',{url:null}),null)).toBeNull()
 expect(state(node('calendar-tool'),null)).toMatchObject({state:'manual'})
 expect(state(node('audio',{url:null}),null)).toBeNull()
 expect(state(node('audio',{url:'https://example.com/record.mp3'}),null)).toMatchObject({state:'manual'})
 expect(state(node('files',{items:[]}),null)).toBeNull()
 expect(state(node('gallery',{items:[{relativePath:'images/actual.jpg'}]}),null)).toMatchObject({state:'manual'})
 expect(state(node(),binding({nodeId:'another-card'}))).toBeNull()
 expect(state(node('html'),null,{rss:{refreshable:true,phase:'error'}})).toMatchObject({state:'manual',icon:'refresh-manual'})
 expect(state(node('html'),null,{rss:{refreshable:false}})).toBeNull()
 for(const widget of ['watchlist','quote','indices','news','announcements']){
  const n=node('financial-widget',{widget,symbols:[{code:'600519',market:'SH'}]})
  expect(state(n,null)).toMatchObject({state:'scheduled',icon:'refresh'})
  expect(state(n,binding({status:'error'}))).toMatchObject({state:'error'})
  expect(state({...n,containerSpec:{...n.containerSpec,refreshEnabled:false}},binding({status:'error'}))).toMatchObject({state:'manual',icon:'refresh-manual'})
 }
 expect(state(node('financial-widget',{widget:'quote',symbols:[]}),null)).toBeNull()
 expect(state(node('financial-widget',{widget:'news',linkedSourceId:'upstream',symbols:[]}),null)).toBeNull()
})

it('preserves the last failed result during a pending refresh and keeps native status independent from bound-source polls',()=>{
 const store=createComponentDataStatusStore()
 store.publish('s',[binding({status:'error'})]);store.publish('s',[binding({status:'refreshing'})])
 expect(state(node(),store.read('s','card'))).toMatchObject({state:'error'})
 store.publish('s',[binding({status:'unchanged'})]);expect(state(node(),store.read('s','card'))).toMatchObject({state:'scheduled'})
 expect(store.publishNative).toBeTypeOf('function')
 store.publishNative('s','native',binding({nodeId:'native',status:'error'}));store.publish('s',[])
 expect(store.read('s','native').lastRefreshFailed).toBe(true)
 store.publishNative('s','native',binding({nodeId:'native',status:'refreshing'}));expect(store.read('s','native').lastRefreshFailed).toBe(true)
 store.publishNative('s','native',binding({nodeId:'native',status:'success'}));expect(store.read('s','native').lastRefreshFailed).toBe(false)
 store.clearNative('s','native');expect(store.read('s','native')).toBeNull()
})

async function chromeFixture(){
 const win=new Window(),keys=['window','document','navigator','IS_REACT_ACT_ENVIRONMENT'],descriptors=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k))
 keys.forEach((k,i)=>Object.defineProperty(globalThis,k,{configurable:true,value:[win,win.document,win.navigator,true][i]}))
 const store=createComponentDataStatusStore(),call=vi.fn(async(_id,args)=>args.action==='refresh'?{status:'success'}:[binding({enabled:false,intervalMinutes:0})])
 win.dshDesktop={componentData:{request:call}}
 const Chrome=runInNewContext('('+ui.WorkbenchChrome.toString()+')',{...ui,react:React,react_jsx_runtime:jsx,componentDataStatusStore:store,componentRssStatusView,workbenchRefreshState:ui.workbenchRefreshState,workbenchRefreshTooltip:ui.workbenchRefreshTooltip,WorkbenchTitle:({title})=>React.createElement('span',{className:'ew-grid-title'},title),WorkbenchIcon:({name})=>React.createElement('span',{'data-workbench-icon':name}),window:win,document:win.document,Event:win.Event})
 const host=win.document.createElement('div');win.document.body.append(host);const root=createRoot(host)
 cleanups.push(async()=>{await React.act(async()=>root.unmount());await win.happyDOM.abort();keys.forEach((k,i)=>descriptors[i]?Object.defineProperty(globalThis,k,descriptors[i]):delete globalThis[k])})
 return {store,call,host,render:async n=>React.act(async()=>root.render(React.createElement(Chrome,{node:n,sessionId:'s',onAsk:vi.fn(),onMore:vi.fn(),onRemove:vi.fn()})))}
}

it('removes the entire refresh slot for static cards and preserves the real manual refresh button operation',async()=>{
 const f=await chromeFixture();await f.render(node('table',{rows:[['静态内容']]}))
 expect(f.host.querySelector('[data-workbench-refresh]')).toBeNull()
 expect(f.host.querySelector('.ew-grid-header').firstElementChild.className).toBe('ew-grid-title')
 expect(f.host.querySelector('.ew-grid-refresh')).toBeNull()
 expect(f.host.querySelectorAll('button')).toHaveLength(3)
 await React.act(async()=>f.store.publish('s',[binding({enabled:false,intervalMinutes:0})]))
 const button=f.host.querySelector('[data-workbench-refresh]')
 expect(button.dataset.refreshState).toBe('manual');expect(button.querySelector('[data-workbench-icon]').dataset.workbenchIcon).toBe('refresh-manual')
 await React.act(async()=>await button.__eworkRefresh())
 expect(f.call.mock.calls.map(value=>value[1].action)).toEqual(['refresh','list'])
 expect(button.dataset.refreshState).toBe('manual')
})

it('publishes real builtin quote/news/announcement outcomes to their headers and keeps orange until recovery resolves',async()=>{
 let resolve
 const service={request:vi.fn(async args=>args.action==='history'?{bars:[],source:'真实接口'}:args.action==='news'?{news:[],source:'真实接口'}:args.action==='announcements'?{announcements:[],source:'真实接口'}:{quotes:[{code:'600519',market:'SH',price:100}],source:'真实接口'})}
 const f=await financialClientFixture({financialWidget:service},{refreshState:true});cleanups.push(f.dispose)
 for(const widget of ['quote','news','announcements']){
  let n;await f.act(async()=>{n=f.workspace.createFinancialWidget(widget);if(widget!=='news')f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(value=>value.id===n.id?{...value,containerSpec:{...value.containerSpec,symbols:[{code:'600519',market:'SH',name:'测试标的'}]}}:value))})
  const card=f.host.querySelector('[data-research-node-id="'+n.id+'"]'),button=()=>card.querySelector('[data-workbench-refresh]'),body=card.querySelector('[data-financial-widget]')
  expect(button().dataset.refreshState).toBe('scheduled')
  const before=service.request.mock.calls.length;await f.event('click',button())
  expect(service.request.mock.calls.length).toBeGreaterThan(before)
  expect(service.request.mock.calls.slice(before).every(([request])=>request.refresh===true)).toBe(true)
  service.request.mockRejectedValueOnce(Error('来源取数失败'));await f.event('click',button())
  expect(button().dataset.refreshState).toBe('error')
  service.request.mockImplementationOnce(()=>new Promise(done=>{resolve=done}));let pending
  await f.act(async()=>{pending=body.__eworkRefreshFinancial()});expect(button().dataset.refreshState).toBe('error')
  expect(button().getAttribute('aria-busy')).toBe('true')
  await f.act(async()=>{resolve(widget==='quote'?{quotes:[{code:'600519',market:'SH',price:101}],source:'真实接口'}:widget==='news'?{news:[],source:'真实接口'}:{announcements:[],source:'真实接口'});await pending})
  expect(button().dataset.refreshState).toBe('scheduled')
  expect(button().hasAttribute('aria-busy')).toBe(false)
  await f.act(async()=>f.workspace.setArtifacts(f.workspace.getSnapshot().artifacts.map(value=>value.id===n.id?{...value,containerSpec:{...value.containerSpec,refreshMinutes:0,refreshEnabled:false}}:value)))
  expect(button().dataset.refreshState).toBe('manual')
  service.request.mockRejectedValueOnce(Error('手动取数失败'));await f.act(async()=>await body.__eworkRefreshFinancial())
  expect(button().dataset.refreshState).toBe('manual');expect(button().querySelector('[data-workbench-icon]').dataset.workbenchIcon).toBe('refresh-manual')
 }
},20000)

it('keeps a completed builtin failure orange through visibility changes until a new request really succeeds',async()=>{
 const article={id:'actual-news',title:'已经实际取得的新闻',source:'真实接口',time:'2026-10-20T10:00:00+08:00',url:'https://example.com/news'}
 const service={request:vi.fn(async()=>({news:[article],source:'真实接口',receivedAt:Date.now()}))}
 const f=await financialClientFixture({financialWidget:service},{refreshState:true});cleanups.push(f.dispose)
 let n;await f.act(async()=>{n=f.workspace.createFinancialWidget('news')})
 const card=f.host.querySelector('[data-research-node-id="'+n.id+'"]'),button=()=>card.querySelector('[data-workbench-refresh]'),body=card.querySelector('[data-financial-widget]')
 expect(button().dataset.refreshState).toBe('scheduled');expect(body.textContent).toContain(article.title)
 service.request.mockRejectedValueOnce(Error('最近一次刷新失败'))
 await f.act(async()=>await body.__eworkRefreshFinancial())
 expect(button().dataset.refreshState).toBe('error');expect(body.textContent).toContain(article.title)
 const states=[],observer=new f.win.MutationObserver(()=>states.push(button().dataset.refreshState))
 observer.observe(card,{subtree:true,attributes:true,attributeFilter:['data-refresh-state']});cleanups.push(()=>observer.disconnect())
 Object.defineProperty(f.document,'visibilityState',{configurable:true,value:'hidden'});await f.event('visibilitychange',f.document)
 expect(button().dataset.refreshState).toBe('error')
 let resolve
 service.request.mockImplementationOnce(()=>new Promise(done=>{resolve=done}))
 const before=service.request.mock.calls.length
 Object.defineProperty(f.document,'visibilityState',{configurable:true,value:'visible'});await f.event('visibilitychange',f.document)
 expect(service.request.mock.calls.length).toBe(before+1)
 expect(button().dataset.refreshState).toBe('error');expect(body.textContent).toContain(article.title)
 expect(states).not.toContain('scheduled')
 await f.act(async()=>{resolve({news:[{...article,title:'本次真实刷新取得的新闻'}],source:'真实接口',receivedAt:Date.now()})})
 expect(button().dataset.refreshState).toBe('scheduled');expect(body.textContent).toContain('本次真实刷新取得的新闻')
},20000)

it('keeps semantic icon colors across all four themes, hover and selection, and reclaims the hidden slot width',async()=>{
 // Browser plugin not available; use the existing bundled Chromium for a local CSS-only document.
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 const browser=await playwright.chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const css=(await Promise.all(['research-grid-workbench.css','workbench-style.css','financial-widget.css'].map(name=>readFile(new URL('../scripts/lib/'+name,import.meta.url),'utf8')))).join('\n')+'\n'+componentDataStatusCss
 const [clockIcon,manualIcon]=await Promise.all(['refresh','refresh-manual'].map(name=>readFile(new URL('../build/figma-workbench-icons/'+name+'.svg',import.meta.url),'utf8')))
 expect(clockIcon).toContain('M8 4.33337V8.00004L10 9.33337');expect(manualIcon).not.toContain('M8 4.33337')
 try{
  const page=await browser.newPage({viewport:{width:960,height:600}})
  for(const theme of ['light','dark','openterminal','enterprise']){
   const card=(state,clock)=>'<section data-research-node-id="'+state+'" data-selected="true"><header class="ew-grid-header">'+(clock?'<span class="ew-grid-refresh"><button data-workbench-refresh="'+state+'" data-refresh-state="'+state+'"><span class="ew-grid-icon ew-grid-icon-'+(state==='manual'?'refresh-manual':'refresh')+'"></span></button></span>':'')+'<span class="ew-grid-title">内容标题</span><button aria-label="组件更多操作">…</button></header></section>'
   await page.setContent('<style>'+css+'</style><main data-research-canvas data-ework-grid data-workbench-style="'+theme+'">'+card('scheduled',true)+card('error',true)+card('manual',true)+card('none',false)+'</main>')
   for(const [state,color]of [['scheduled','rgb(34, 160, 107)'],['error','rgb(197, 128, 79)'],['manual','rgb(133, 139, 149)']]){
    const button=page.locator('[data-workbench-refresh="'+state+'"]');await button.hover()
    expect(await button.evaluate(el=>getComputedStyle(el).color)).toBe(color)
    await button.evaluate(el=>el.dataset.busy='true')
    expect(await button.evaluate(el=>getComputedStyle(el).color)).toBe(color)
    expect(await button.locator('.ew-grid-icon').evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden')
    const ring=await button.evaluate(el=>{const s=getComputedStyle(el,'::after');return{content:s.content,width:s.width,height:s.height,radius:s.borderRadius,mask:s.maskImage,animation:s.animationName}})
    expect(ring).toMatchObject({content:'""',width:'14px',height:'14px',radius:'50%',mask:'none',animation:'ew-grid-spin'})
    expect(await button.locator('.ew-grid-icon').evaluate(el=>getComputedStyle(el).animationName)).toBe('none')
    await button.evaluate(el=>delete el.dataset.busy)
    expect(await button.locator('.ew-grid-icon').evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
    // Native/automatic refresh feedback can arrive before the React binding poll.
    await button.evaluate(el=>el.closest('[data-research-node-id]').setAttribute('data-component-refreshing',''))
    expect(await button.locator('.ew-grid-icon').evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden')
    expect(await button.evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('ew-grid-spin')
    await button.evaluate(el=>el.closest('[data-research-node-id]').removeAttribute('data-component-refreshing'))
   }
   const x=await page.locator('.ew-grid-title').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().left))
   expect(x[0]-x[3]).toBe(26)
   await page.locator('[data-research-node-id="scheduled"] .ew-grid-header').evaluate(header=>{header.style.width='180px';const selector=document.createElement('span');selector.className='ew-financial-header-selector';selector.textContent='测试行情 · 600519';header.append(selector)})
   expect(await page.locator('[data-workbench-refresh="scheduled"]').isVisible()).toBe(true)
   expect(await page.locator('[data-workbench-refresh="scheduled"] .ew-grid-icon').evaluate(el=>{const r=el.getBoundingClientRect();return[r.width,r.height]})).toEqual([16,16])
   expect(await page.locator('[data-research-node-id="scheduled"] .ew-grid-refresh').evaluate(el=>getComputedStyle(el).flexShrink)).toBe('0')
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.locator('[data-workbench-refresh="scheduled"]').evaluate(el=>el.dataset.busy='true')
  expect(await page.locator('[data-workbench-refresh="scheduled"]').evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none')
 }finally{await browser.close()}
},30000)
