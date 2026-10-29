import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
import {ConversationComponentStore} from '../src/main/state/conversation-components'
import {createConversationComponentService} from '../src/main/conversation-components/service'
let browser:any,script=''
const entry='\0conversation-html-state-fixture'
beforeAll(async()=>{
 const source=notesResidentProductionSource({conversation:true}).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__ConversationCard=ConversationComponentCard;exports.__SetOwner=value=>sherlockBoardsAdapter=value;exports.__TrapCanvas=(session,fn)=>{researchSharedStateSinks.set(session,fn);researchInteractionSinks.set(session,fn);};')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const plugin:Plugin={name:'conversation-html-state-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';import {createConversationComponentsBridge} from ${JSON.stringify(resolve('src/preload/conversation-components.ts'))};
 import css from ${JSON.stringify(resolve('scripts/lib/research-grid-workbench.css')+'?inline')};const style=document.createElement('style');style.textContent=css;document.head.append(style);
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(source)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 window.canvasCalls=[];library.__SetOwner({getState:()=>({account:{generation:1,user:{userId:'owner'}}}),getView:()=>({connection:'online',permissions:{edit:true},boardId:'unrelated-canvas'}),subscribe:()=>()=>{},call:async(...args)=>window.canvasCalls.push(args)});library.__TrapCanvas('conversation-html',(...args)=>window.canvasCalls.push(args));
 const bridge=createConversationComponentsBridge(async(channel,input)=>{const response=await fetch('/conversation-html-api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel,input})}),value=await response.json();if(value.error)throw Error(value.error);return value.result});window.dshDesktop={conversationComponents:window.fixtureNoCommit?{read:bridge.read}:bridge};
 window.mountCard=()=>{const root=createRoot(document.querySelector('#card'));root.render(React.createElement(library.__ConversationCard,{sessionId:'conversation-html',manifest:window.fixtureManifest}));return root};window.cardRoot=window.mountCard();
 `:undefined}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),plugin],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const{chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())
async function fixture({readOnly=false,noCommit=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'conversation-html-state-')),file=join(directory,'cards.json'),html=await readFile('test/fixtures/conversation-local-counter.html','utf8')
 let store=new ConversationComponentStore(file),owner='owner',generation='window-a',mode='ok';await store.load()
 let service:any;const makeService=()=>createConversationComponentService({store,owner:()=>owner,canReadSession:session=>session==='conversation-html',currentVisibleContext:()=>({ownerAccountId:owner,sessionId:'conversation-html',mode:'conversation',generation,readOnly}),nativeQuery:async()=>{throw Error('Unexpected financial query')},clipboard:()=>undefined,library:()=>undefined})
 service=makeService();const receipt=await service.create({title:'对话本地计数与备注',artifact:{version:1,type:'html',html}},{ownerAccountId:owner,sessionId:'conversation-html',turnId:'1',mode:'conversation',windowGeneration:generation,current:()=>true},new AbortController().signal,'initial-counter'),target={sessionId:'conversation-html',componentId:receipt.effect.componentId}
 const requests:any[]=[],releases:Array<()=>void>=[],context=await browser.newContext({viewport:{width:1000,height:850}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(5000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('http://127.0.0.1/conversation-html',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="zh"><body><main id="card" style="width:656px"></main></body></html>'}))
 await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
 await page.route('http://127.0.0.1/conversation-html-api',async(route:any)=>{
  const value=route.request().postDataJSON(),method=value.channel.replace('conversation-components:','');requests.push({method,input:value.input})
  try{if(method==='commitHtmlInteraction'){if(mode==='hold')await new Promise<void>(resolve=>releases.push(resolve));if(mode==='fail')throw Error('合成保存失败')}
   const result=await service[method](value.input);await route.fulfill({contentType:'application/json',body:JSON.stringify({result})})
  }catch(error){await route.fulfill({contentType:'application/json',body:JSON.stringify({error:(error as Error).message})})}
 })
 await page.goto('http://127.0.0.1/conversation-html');await page.evaluate(({value,noCommit}:any)=>{(window as any).fixtureManifest=value;(window as any).fixtureNoCommit=noCommit},{value:receipt.data.renderManifest,noCommit});await page.addScriptTag({content:'var exports={};\n'+script})
 const frame=page.frameLocator('iframe[data-research-html-artifact]').frameLocator('#preview');await frame.getByRole('button',{name:'增加计数',exact:true}).waitFor()
 return{page,frame,errors,requests,view:()=>store.read('owner',target),mode:(value:string)=>{mode=value},release:()=>{for(const next of releases.splice(0))next()},changeOwner:()=>{owner='other';generation='window-b'},reopen:async()=>{store=new ConversationComponentStore(file);await store.load();service=makeService();await page.evaluate(()=>{const w=window as any;w.cardRoot.unmount();w.cardRoot=w.mountCard()})},close:async()=>{await context.close();await rm(directory,{recursive:true,force:true})}}
}
const config=(f:any)=>f.view().node.config as any
it('keeps the common Conversation iframe borderless without Research CSS and preserves live counter, memo and focus',async()=>{
 const f=await fixture();try{
  for(let i=0;i<3;i++)await f.frame.getByRole('button',{name:'增加计数',exact:true}).click()
  await expect.poll(()=>config(f)?.sharedComponentState?.state?.count).toBe(3)
  const input=f.frame.getByRole('textbox',{name:'备注',exact:true});await input.fill('外框保存的备注');await expect.poll(()=>config(f)?.sharedComponentState?.state?.memo).toBe('外框保存的备注')
  await f.frame.locator('body').evaluate((element:HTMLElement)=>element.dataset.frameIdentity='original');await input.focus()
  const original=await f.page.evaluate(()=>{const frame=document.querySelector('iframe[data-research-html-artifact]')!;(window as any).originalBorderFrame=frame;return{srcdoc:frame.getAttribute('srcdoc'),sandbox:frame.getAttribute('sandbox')}})
  const removed=await f.page.evaluate(()=>{const names:string[]=[];for(const style of document.querySelectorAll('style'))if(style.getAttribute('data-plugin-css')?.includes('ResearchCanvas.module.css')){names.push(style.getAttribute('data-plugin-css')!);style.remove()}return names});expect(removed.length).toBeGreaterThan(0)
  const geometry=await f.page.locator('iframe[data-research-html-artifact]').evaluate((element:HTMLIFrameElement)=>{const style=getComputedStyle(element);return{widths:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],styles:[style.borderTopStyle,style.borderRightStyle,style.borderBottomStyle,style.borderLeftStyle],delta:element.getBoundingClientRect().width-element.clientWidth,same:element===(window as any).originalBorderFrame,srcdoc:element.getAttribute('srcdoc'),sandbox:element.getAttribute('sandbox'),inline:element.style.border}})
  expect(geometry.widths).toEqual(['0px','0px','0px','0px']);expect(geometry.styles).toEqual(['none','none','none','none']);expect(geometry.delta).toBe(0);expect(geometry.inline).toBe('0px');expect(geometry.same).toBe(true);expect(geometry.srcdoc).toBe(original.srcdoc);expect(geometry.sandbox).toBe(original.sandbox)
  expect(await f.frame.locator('body').getAttribute('data-frame-identity')).toBe('original');expect(await input.evaluate((element:HTMLInputElement)=>element.ownerDocument.activeElement===element)).toBe(true)
  expect(config(f)?.sharedComponentState?.state).toMatchObject({count:3,memo:'外框保存的备注'});await f.reopen();await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('3');expect(await f.frame.getByRole('textbox',{name:'备注',exact:true}).inputValue()).toBe('外框保存的备注');expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('persists real Conversation shared state and native disclosure through the actual service/store and restores after reopen without Canvas writes',async()=>{
 const f=await fixture();try{
  f.mode('hold');await f.frame.getByRole('button',{name:'增加计数',exact:true}).click();await expect.poll(()=>f.requests.filter(value=>value.method==='commitHtmlInteraction').length).toBe(1)
  await f.frame.getByRole('textbox',{name:'备注',exact:true}).fill('当前对话的离线备注');await f.frame.getByText('查看说明',{exact:true}).click()
  expect(config(f)).toBeUndefined();f.mode('ok');f.release()
  await expect.poll(()=>config(f)?.sharedComponentState?.state?.count).toBe(1);await expect.poll(()=>config(f)?.sharedComponentState?.state?.memo).toBe('当前对话的离线备注');await expect.poll(()=>Object.values(config(f)?.interactionState?.events??{}).length).toBeGreaterThan(0)
  const revision=f.view().revision;await f.reopen();await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('1');await expect.poll(()=>f.frame.getByRole('textbox',{name:'备注'}).inputValue()).toBe('当前对话的离线备注')
  expect(await f.frame.locator('details').evaluate((element:HTMLDetailsElement)=>element.open)).toBe(true);expect(f.view().revision).toBe(revision)
  expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it.each([{readOnly:true},{noCommit:true}])('keeps actual read-only or partially connected Conversation HTML non-editable: %j',async options=>{
 const f=await fixture(options);try{
  await expect.poll(()=>f.frame.getByRole('button',{name:'增加计数',exact:true}).isDisabled()).toBe(true)
  expect(await f.frame.getByRole('textbox',{name:'备注',exact:true}).isDisabled()).toBe(true)
  expect(f.requests.filter(value=>value.method==='commitHtmlInteraction')).toEqual([]);expect(config(f)).toBeUndefined();expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('does not save a delayed old-owner Conversation action into the new account',async()=>{
 const f=await fixture();try{
  f.mode('hold');await f.frame.getByRole('button',{name:'增加计数',exact:true}).click();await expect.poll(()=>f.requests.some(value=>value.method==='commitHtmlInteraction')).toBe(true)
  f.changeOwner();f.mode('ok');f.release();await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('0')
  expect(config(f)).toBeUndefined();expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('does not claim a held or failed Conversation save, restores durable state and retains native journal content',async()=>{
 const f=await fixture();try{
  await f.frame.getByText('查看说明',{exact:true}).click();await expect.poll(()=>Object.values(config(f)?.interactionState?.events??{}).length).toBeGreaterThan(0)
  f.mode('hold');await f.frame.getByRole('button',{name:'增加计数',exact:true}).click();await expect.poll(()=>f.requests.filter(value=>value.method==='commitHtmlInteraction'&&value.input.kind==='shared').length).toBe(1)
  expect(config(f)?.sharedComponentState).toBeUndefined();expect(await f.frame.locator('#count').textContent()).toBe('1')
  f.mode('fail');f.release();await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('0');await expect.poll(()=>f.page.locator('[role=alert]').first().textContent()).toContain('失败')
  expect(config(f)?.sharedComponentState).toBeUndefined();expect(Object.keys(config(f)?.interactionState?.events??{})).not.toHaveLength(0);expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('keeps the same iframe document and textbox focus through sequential saved input and content-width changes',async()=>{
 const f=await fixture();try{
  const input=f.frame.getByRole('textbox',{name:'备注',exact:true});await input.focus()
  await f.page.locator('iframe[data-research-html-artifact]').evaluate((element:HTMLIFrameElement)=>{(window as any).originalConversationFrame=element})
  await f.frame.locator('body').evaluate((element:HTMLElement)=>{element.dataset.inputIdentity='original'})
  let text=''
  for(const character of ['a','b','c']){text+=character;await input.press(character);await expect.poll(()=>config(f)?.sharedComponentState?.state?.memo).toBe(text);expect(await input.evaluate((element:HTMLElement)=>element.ownerDocument.activeElement===element)).toBe(true)}
  await f.page.locator('#card').evaluate((element:HTMLElement)=>{element.style.width='320px'})
  await input.press('d');await expect.poll(()=>config(f)?.sharedComponentState?.state?.memo).toBe('abcd')
  expect(await input.evaluate((element:HTMLElement)=>element.ownerDocument.activeElement===element)).toBe(true);expect(await f.frame.locator('body').getAttribute('data-input-identity')).toBe('original')
  expect(await f.page.evaluate(()=>(window as any).originalConversationFrame===document.querySelector('iframe[data-research-html-artifact]'))).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
