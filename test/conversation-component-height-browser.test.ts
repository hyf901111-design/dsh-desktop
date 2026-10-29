import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdtemp,readFile,rm,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {createConversationComponentService} from '../src/main/conversation-components/service'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

let browser:any,script=''
const entry='\0conversation-height-fixture',evidence=process.env.SHERLOCK_CONVERSATION_HEIGHT_EVIDENCE
beforeAll(async()=>{
 const source=notesResidentProductionSource({conversation:true}).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__ConversationCard=ConversationComponentCard;exports.__SetOwner=value=>sherlockBoardsAdapter=value;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const plugin:Plugin={name:'conversation-height-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';import {createConversationComponentsBridge} from ${JSON.stringify(resolve('src/preload/conversation-components.ts'))};
 import grid from ${JSON.stringify(resolve('scripts/lib/research-grid-workbench.css')+'?inline')};import financial from ${JSON.stringify(resolve('scripts/lib/financial-widget.css')+'?inline')};import palette from ${JSON.stringify(resolve('scripts/lib/workbench-style.css')+'?inline')};
 const style=document.createElement('style');style.textContent=[grid,financial,palette].join(String.fromCharCode(10));document.head.append(style);
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(source)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 library.__SetOwner({getState:()=>({account:{generation:1,user:{userId:'owner'}}}),getView:()=>({connection:'online',permissions:{edit:true}}),subscribe:()=>()=>{}});
 window.dshDesktop={conversationComponents:createConversationComponentsBridge(async(channel,input)=>{const response=await fetch('/conversation-height-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,input})}),value=await response.json();if(value.error)throw Error(value.error);return value.result})};
 window.cardRoot=createRoot(document.querySelector('#card'));window.cardRoot.render(React.createElement(library.__ConversationCard,{sessionId:'height-session',manifest:window.fixtureManifest}));
 `:undefined}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),plugin],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const{chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())

const html=(body:string)=>({version:1,type:'html',title:'内容高度验收',html:'<!doctype html><html><body>'+body+'</body></html>'})
const symbols=(count:number)=>Array.from({length:count},(_,i)=>({market:'SH',code:String(600000+i),name:'合成标的 '+(i+1)}))
async function fixture(artifact:any,width=680,{delayFont=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'conversation-height-')),file=join(directory,'cards.json'),store=new ConversationComponentStore(file);await store.load()
 const requests:any[]=[],service:any=createConversationComponentService({store,owner:()=> 'owner',canReadSession:id=>id==='height-session',currentVisibleContext:()=>({ownerAccountId:'owner',sessionId:'height-session',mode:'conversation',generation:'window-a'}),nativeQuery:async(input:any)=>({...(input.action==='history'?{bars:Array.from({length:18},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),open:10+i/10,high:10.3+i/10,low:9.8+i/10,close:10.2+i/10,volume:1000+i}))}:{quotes:(input.symbols??[]).map((s:any)=>({...s,price:12.34,changePercent:1.2,quotedAt:'2026-10-29T01:30:00Z'}))}),source:'合成行情',receivedAt:'2026-10-29T01:30:01Z'}),clipboard:()=>undefined,library:()=>undefined})
 const receipt=await service.create({artifact},{ownerAccountId:'owner',sessionId:'height-session',turnId:'1',mode:'conversation',windowGeneration:'window-a',current:()=>true},new AbortController().signal,'height-component'),target={sessionId:'height-session',componentId:receipt.effect.componentId}
 const initial=structuredClone(store.read('owner',target)),context=await browser.newContext({viewport:{width:1000,height:850}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(4000);page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('console',(message:any)=>{if(message.type()==='error')errors.push(message.text())})
 let releaseFont=()=>{};const fontReady=new Promise<void>(resolve=>{releaseFont=resolve});if(!delayFont)releaseFont()
 await page.route('http://127.0.0.1/conversation-height',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><title>对话组件内容高度</title><body style="margin:0;padding:20px;background:#edf0f3"><main id="card" style="width:${width}px;max-width:100%"></main></body></html>`}))
 await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',async(route:any)=>{await fontReady;await route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')})})
 await page.route('http://127.0.0.1/conversation-height-api',async(route:any)=>{const input=route.request().postDataJSON(),method=input.channel.replace('conversation-components:','');requests.push({method,input:input.input});try{await route.fulfill({contentType:'application/json',body:JSON.stringify({result:await service[method](input.input)})})}catch(error){await route.fulfill({contentType:'application/json',body:JSON.stringify({error:(error as Error).message})})}})
 await page.goto('http://127.0.0.1/conversation-height');await page.evaluate((value:any)=>{(window as any).fixtureManifest=value},receipt.data.renderManifest);await page.addScriptTag({content:'var exports={};\n'+script});await page.locator('.ew-conversation-component-body').waitFor()
 return{page,errors,requests,initial,view:()=>store.read('owner',target),releaseFont,frame:page.frameLocator('iframe[data-research-html-artifact]').frameLocator('#preview'),resize:async(width:number,height=850)=>{await page.setViewportSize({width:Math.max(380,width+40),height});await page.locator('#card').evaluate((element:HTMLElement,width:number)=>{element.style.width=width+'px'},width)},close:async()=>{releaseFont();await context.close();await rm(directory,{recursive:true,force:true})}}
}
const bodyHeight=async(f:any)=>(await f.page.locator('.ew-conversation-component-body').boundingBox())!.height
async function capture(f:any,name:string){if(evidence){await mkdir(evidence,{recursive:true});await f.page.screenshot({path:join(evidence,name+'.png'),fullPage:true});await writeFile(join(evidence,name+'.json'),JSON.stringify({height:await bodyHeight(f),view:f.view(),requests:f.requests,errors:f.errors},null,2))}}

it.each([680,320])('fits a short HTML paragraph instead of reserving a default canvas at %ipx',async width=>{
 const f=await fixture(html('<p>一条简洁的内容说明。</p>'),width);try{
  await f.frame.getByText('一条简洁的内容说明。',{exact:true}).waitFor()
  await expect.poll(()=>bodyHeight(f)).toBeLessThan(120)
  expect(await bodyHeight(f)).toBeGreaterThan(35);expect(f.view()).toEqual(f.initial);expect(f.errors).toEqual([]);await capture(f,'short-'+width)
 }finally{await capture(f,'short-'+width);await f.close()}
},20000)
it.each([680,320])('sizes a short native list from its rows and lets a long list remain fully reachable at %ipx',async width=>{
 const short=await fixture({...financialWidgetDefaults('watchlist'),title:'两项合成自选',symbols:symbols(2)},width);try{
  await short.page.getByText('合成标的 2',{exact:true}).waitFor();expect.soft(await bodyHeight(short)).toBeLessThan(270)
  const last=short.page.locator('.ew-watch-table [data-code]').last();if(await last.count())expect((await last.boundingBox())!.height).toBeGreaterThan(20)
  expect(short.requests.filter(row=>row.method==='updateNativeSpec')).toEqual([]);expect(short.errors).toEqual([]);await capture(short,'native-short-'+width)
 }finally{await short.close()}
 const long=await fixture({...financialWidgetDefaults('watchlist'),title:'多项合成自选',symbols:symbols(30)},width);try{
  await long.page.getByText('合成标的 30',{exact:true}).waitFor();await expect.poll(()=>bodyHeight(long)).toBeGreaterThan(350);expect(await bodyHeight(long)).toBeLessThanOrEqual(613)
  const last=long.page.getByText('合成标的 30',{exact:true});await last.scrollIntoViewIfNeeded();expect(await last.isVisible()).toBe(true);const bounds=(await last.boundingBox())!,body=(await long.page.locator('.ew-conversation-component-body').boundingBox())!;expect(bounds.y+bounds.height).toBeLessThanOrEqual(body.y+body.height+1);expect(bounds.y).toBeGreaterThanOrEqual(body.y-1);expect(long.errors).toEqual([]);await capture(long,'native-long-'+width)
 }finally{await long.close()}
},30000)
it.each([680,320])('fits the quote empty state and keeps the actual price chart and controls readable at %ipx',async width=>{
 const empty=await fixture({...financialWidgetDefaults('quote'),title:'未选证券行情'},width);try{
  await empty.page.getByText('在标题栏搜索并选择个股',{exact:true}).waitFor();expect.soft(await bodyHeight(empty)).toBeLessThan(240);expect(empty.errors).toEqual([]);await capture(empty,'quote-empty-'+width)
 }finally{await empty.close()}
 const f=await fixture({...financialWidgetDefaults('quote'),title:'合成证券行情',symbols:symbols(1)},width);try{
  const plot=f.page.locator('.ew-price-chart');await plot.waitFor();await expect.poll(()=>f.page.locator('[data-financial-chart] svg').count()).toBe(1)
  const size=(await plot.boundingBox())!;expect(size.height).toBeGreaterThanOrEqual(220);expect(size.height).toBeLessThanOrEqual(361)
  const controls=f.page.locator('.ew-quote-controls');expect(await controls.getByRole('button',{name:'日K',exact:true}).isVisible()).toBe(true)
  await f.page.locator('.ew-financial-footer').scrollIntoViewIfNeeded();expect(await f.page.locator('.ew-financial-footer').isVisible()).toBe(true)
  expect(f.requests.filter(row=>row.method==='updateNativeSpec')).toEqual([]);expect(f.errors).toEqual([]);await capture(f,'quote-'+width)
 }finally{await f.close()}
},30000)
it('gives long tables a useful bounded viewport, reaches the final row and shrinks when filtered',async()=>{
 const f=await fixture({version:1,type:'table',title:'长表内容验收',columns:['项目','数量'],rows:Array.from({length:80},(_,i)=>['记录 '+(i+1),i-5])});try{
  const search=f.page.getByRole('searchbox',{name:'搜索表格'});await search.waitFor();expect(await bodyHeight(f)).toBeGreaterThan(350);expect(await bodyHeight(f)).toBeLessThanOrEqual(613)
  const last=f.page.getByText('记录 80',{exact:true});await last.scrollIntoViewIfNeeded();expect(await last.isVisible()).toBe(true);const bounds=(await last.boundingBox())!,body=(await f.page.locator('.ew-conversation-component-body').boundingBox())!;expect(bounds.y+bounds.height).toBeLessThanOrEqual(body.y+body.height+1);expect(bounds.y).toBeGreaterThanOrEqual(body.y-1)
  await search.fill('记录 80');await expect.poll(()=>bodyHeight(f)).toBeLessThan(190)
  await f.resize(320,500);expect(await bodyHeight(f)).toBeLessThanOrEqual(361);expect(await search.inputValue()).toBe('记录 80');expect(f.view()).toEqual(f.initial);expect(f.errors).toEqual([]);await capture(f,'table-filtered-narrow')
 }finally{await f.close()}
},20000)
it('keeps a native chart plot, legend and readout readable at wide and narrow widths without a fixed canvas height',async()=>{
 const f=await fixture({version:1,type:'chart',variant:'line',title:'三点合成趋势',labels:['第一期','第二期','第三期'],series:[{name:'合成数据',values:[10,20,15]}]});try{
  const svg=f.page.locator('.odyssey-native-chart>svg');await svg.waitFor();let widePlot=0
  for(const width of [680,320]){await f.resize(width,650);await expect.poll(async()=>(await svg.boundingBox())!.height).toBeGreaterThanOrEqual(180);const plot=(await svg.boundingBox())!.height;expect(plot).toBeLessThanOrEqual(340);if(width===680)widePlot=plot;else expect(plot).toBeLessThan(widePlot-40)
   await f.page.getByRole('button',{name:'合成数据',exact:true}).click();await f.page.getByRole('button',{name:'合成数据',exact:true}).click();expect(await f.page.locator('.odyssey-native-chart-readout').innerText()).toContain('10');expect(await bodyHeight(f)).toBeLessThanOrEqual(469);await capture(f,'native-chart-'+width)}
  expect(f.view()).toEqual(f.initial);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
it('grows and shrinks with disclosure and delayed image/font layout while preserving the same iframe document',async()=>{
 const markup='<p>动态内容高度与延迟字体。</p><details><summary>展开长说明</summary>'+Array.from({length:16},(_,i)=>'<p>第 '+(i+1)+' 条说明内容。</p>').join('')+'</details><img id="late-image" alt="延迟数据图">'
 const f=await fixture(html(markup),500,{delayFont:true});try{
  await f.frame.getByText('展开长说明',{exact:true}).waitFor();await f.page.locator('iframe[data-research-html-artifact]').evaluate((element:HTMLIFrameElement)=>{(window as any).beforeHeightFrame=element});await f.frame.locator('body').evaluate((element:HTMLElement)=>{element.dataset.heightIdentity='original'})
  f.releaseFont();await expect.poll(()=>bodyHeight(f)).toBeLessThan(180);const collapsed=await bodyHeight(f)
  await f.frame.getByText('展开长说明',{exact:true}).click();await expect.poll(()=>bodyHeight(f)).toBeGreaterThan(350)
  await f.frame.getByText('展开长说明',{exact:true}).click();await expect.poll(()=>bodyHeight(f)).toBeLessThanOrEqual(collapsed+4)
  await f.frame.locator('#late-image').evaluate((element:HTMLImageElement)=>{element.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="350" height="240"><rect width="350" height="240" fill="#249bfa"/></svg>')});await expect.poll(()=>bodyHeight(f)).toBeGreaterThan(collapsed+180)
  expect(await f.frame.locator('body').getAttribute('data-height-identity')).toBe('original');expect(await f.page.evaluate(()=>(window as any).beforeHeightFrame===document.querySelector('iframe[data-research-html-artifact]'))).toBe(true)
  expect(f.view().node.containerSpec).toEqual(f.initial.node.containerSpec);expect(f.errors).toEqual([]);await capture(f,'dynamic-content')
 }finally{await capture(f,'dynamic-content');await f.close()}
},30000)
