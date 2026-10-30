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
import {researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
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
async function fixture({readOnly=false,noCommit=false,componentTheme='',globalDark=false,slowFrames=false,checklist=false,checklistEvents='',legacyClicks=false,radioChecklist=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'conversation-html-state-')),file=join(directory,'cards.json')
 let html=await readFile(checklist?'test/fixtures/conversation-research-checklist.html':'test/fixtures/conversation-local-counter.html','utf8')
 if(checklistEvents){
  html=html.replace('input.onclick=',checklistEvents==='all'?'input.onclick=input.oninput=input.onchange=':'input.onchange=')
   .replace('</section>','<label><input id="native-check" type="checkbox">仅本地清单</label><output id="native-count">0</output></section>')
   +'<script>let nativeChanges=0;document.getElementById("native-check").onchange=()=>document.getElementById("native-count").textContent=String(++nativeChanges);</script>'
  if(checklistEvents==='microtask'||checklistEvents==='timer')html=html.replace("input.onchange=()=>shared.dispatch({type:'check',index,checked:input.checked});",`input.onchange=()=>{const action={type:'check',index,checked:input.checked};${checklistEvents==='timer'?'setTimeout':'queueMicrotask'}(()=>shared.dispatch(action));};`)
 }
 if(radioChecklist){
  html=html.replaceAll('type="checkbox" data-check=','type="radio" name="shared-check" data-check=')
   .replace('index===action.index?!!action.checked:value','index===action.index?!!action.checked:false')
 }
 let store=new ConversationComponentStore(file),owner='owner',generation='window-a',mode='ok';await store.load()
 let service:any;const makeService=()=>createConversationComponentService({store,owner:()=>owner,canReadSession:session=>session==='conversation-html',currentVisibleContext:()=>({ownerAccountId:owner,sessionId:'conversation-html',mode:'conversation',generation,readOnly}),nativeQuery:async()=>{throw Error('Unexpected financial query')},clipboard:()=>undefined,library:()=>undefined})
 service=makeService();const receipt=await service.create({title:checklist?'对话组件交互验收':'对话本地计数与备注',artifact:{version:1,type:'html',html}},{ownerAccountId:owner,sessionId:'conversation-html',turnId:'1',mode:'conversation',windowGeneration:generation,current:()=>true},new AbortController().signal,'initial-counter'),target={sessionId:'conversation-html',componentId:receipt.effect.componentId}
 if(legacyClicks){
  const htmlVersion=researchInteractionVersion(html)
  await service.commitHtmlInteraction({...target,expectedRevision:store.read(owner,target).revision,htmlVersion,kind:'shared',revision:3,state:{checked:[false,false,true]}})
  for(const[clock,targetRoute]of[[1,[1,0,0]],[2,[1,2,0]],[3,[1,0,0]],[4,[1,4,0]]] as const)
   await service.commitHtmlInteraction({...target,expectedRevision:store.read(owner,target).revision,htmlVersion,kind:'journal',event:{id:'legacy-check-'+clock,clock,targetRoute:[...targetRoute],tag:'INPUT',type:'click',x:0.5,y:0.5}})
 }
 if(componentTheme)await service.setTheme({...target,expectedRevision:store.read('owner',target).revision,theme:componentTheme})
 const requests:any[]=[],releases:Array<()=>void>=[],context=await browser.newContext({viewport:{width:1000,height:850}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(5000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 if(slowFrames)await context.addInitScript(()=>{if(window!==parent){const end=performance.now()+80;while(performance.now()<end){/* Delay real iframe parsing, not the production sender. */}}})
 await page.route('http://127.0.0.1/conversation-html',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="zh"><body'+(globalDark?' data-ds-dark-theme':'')+'><main id="card" style="width:656px"></main></body></html>'}))
 await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
 await page.route('http://127.0.0.1/conversation-html-api',async(route:any)=>{
  const value=route.request().postDataJSON(),method=value.channel.replace('conversation-components:','');requests.push({method,input:value.input})
  try{if(method==='setTheme'&&mode==='hold-theme')await new Promise<void>(resolve=>releases.push(resolve));if(method==='commitHtmlInteraction'){if(mode==='hold')await new Promise<void>(resolve=>releases.push(resolve));if(mode==='fail')throw Error('合成保存失败')}
   const result=await service[method](value.input);await route.fulfill({contentType:'application/json',body:JSON.stringify({result})})
  }catch(error){await route.fulfill({contentType:'application/json',body:JSON.stringify({error:(error as Error).message})})}
 })
 await page.goto('http://127.0.0.1/conversation-html');await page.evaluate(({value,noCommit}:any)=>{(window as any).fixtureManifest=value;(window as any).fixtureNoCommit=noCommit},{value:receipt.data.renderManifest,noCommit});await page.addScriptTag({content:'var exports={};\n'+script})
 const frame=page.frameLocator('iframe[data-research-html-artifact]').frameLocator('#preview');await(checklist?frame.getByRole(radioChecklist?'radio':'checkbox',{name:'核对数据时点',exact:true}):frame.getByRole('button',{name:'增加计数',exact:true})).waitFor()
 return{page,frame,errors,requests,view:()=>store.read('owner',target),mode:(value:string)=>{mode=value},release:()=>{for(const next of releases.splice(0))next()},changeOwner:()=>{owner='other';generation='window-b'},reopen:async()=>{store=new ConversationComponentStore(file);await store.load();service=makeService();await page.evaluate(()=>{const w=window as any;w.cardRoot.unmount();w.cardRoot=w.mountCard()})},close:async()=>{await context.close();await rm(directory,{recursive:true,force:true})}}
}
const config=(f:any)=>f.view().node.config as any
it('shows every requested checklist item and initial count before any JavaScript runs',async()=>{
 const context=await browser.newContext({javaScriptEnabled:false}),page=await context.newPage();try{
  await page.setContent(await readFile('test/fixtures/conversation-research-checklist.html','utf8'))
  expect(await page.getByRole('checkbox').count()).toBe(3)
  for(const name of ['核对数据时点','检查统计口径','复核风险假设'])expect(await page.getByRole('checkbox',{name,exact:true}).isVisible()).toBe(true)
  expect(await page.locator('#completed').textContent()).toBe('0');expect(await page.getByText('已完成 0/3',{exact:true}).isVisible()).toBe(true)
 }finally{await context.close()}
})
it('saves a progressively enhanced research checklist through the real Conversation host and restores only the checked items after cold reopen',async()=>{
 const f=await fixture({checklist:true});try{
  const checks=['核对数据时点','检查统计口径','复核风险假设'].map(name=>f.frame.getByRole('checkbox',{name,exact:true}))
  await expect.poll(()=>checks[0].isEnabled()).toBe(true)
  for(const[index,checked,state]of [[0,true,[true,false,false]],[2,true,[true,false,true]],[0,false,[false,false,true]]] as const){
   await checks[index].setChecked(checked)
   await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([...state])
   expect(await f.frame.locator('#completed').textContent()).toBe(String(state.filter(Boolean).length))
  }
  await expect.poll(()=>f.page.getByText('交互已保存',{exact:true}).count()).toBeGreaterThan(0)
  const revision=f.view().revision;await f.reopen()
  await expect.poll(()=>f.frame.locator('#completed').textContent()).toBe('1')
  for(const[index,check]of checks.entries())expect(await check.isChecked()).toBe(index===2)
  expect(f.view().revision).toBe(revision);expect(config(f).sharedComponentState.state.checked).toEqual([false,false,true]);expect(f.requests.filter(row=>row.method==='commitHtmlInteraction')).toHaveLength(3)
  expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
  if(process.env.SHERLOCK_CHECKLIST_SCREENSHOT)await f.page.screenshot({path:process.env.SHERLOCK_CHECKLIST_SCREENSHOT})
 }finally{await f.close()}
},30000)
it.each(['change','all'])('deduplicates one checkbox activation across %s handlers while preserving native-only controls after cold reopen',async checklistEvents=>{
 const f=await fixture({checklist:true,checklistEvents});try{
  const checks=['核对数据时点','检查统计口径','复核风险假设'].map(name=>f.frame.getByRole('checkbox',{name,exact:true}))
  await expect.poll(()=>checks[0].isEnabled()).toBe(true)
  await checks[0].check();await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([true,false,false])
  await checks[2].focus();await checks[2].press('Space');await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([true,false,true])
  await f.frame.getByText('核对数据时点',{exact:true}).click();await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([false,false,true])
  await checks[0].check();await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([true,false,true])
  await checks[0].uncheck();await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([false,false,true])
  await f.frame.getByRole('checkbox',{name:'仅本地清单',exact:true}).check()
  await expect.poll(()=>Object.values(config(f)?.interactionState?.events??{}).length).toBe(1)
  await expect.poll(()=>f.requests.filter(row=>row.method==='commitHtmlInteraction'&&row.input.kind==='shared').length).toBe(5)
  expect(await f.frame.locator('#native-count').textContent()).toBe('1')
  const revision=f.view().revision,commits=f.requests.filter(row=>row.method==='commitHtmlInteraction').length
  for(let i=0;i<2;i++){
   await f.reopen();await expect.poll(()=>f.frame.locator('#completed').textContent()).toBe('1')
   await expect.poll(()=>f.frame.locator('#native-count').textContent()).toBe('1')
   for(const[index,check]of checks.entries())expect(await check.isChecked()).toBe(index===2)
   expect(await f.frame.getByRole('checkbox',{name:'仅本地清单',exact:true}).isChecked()).toBe(true)
   await f.page.waitForTimeout(150)
   expect(f.view().revision).toBe(revision);expect(f.requests.filter(row=>row.method==='commitHtmlInteraction')).toHaveLength(commits)
  }
  expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it.each(['change','all','microtask','timer'])('replays legacy mixed checkbox journals with %s handlers without new shared writes or losing saved state',async checklistEvents=>{
 const f=await fixture({checklist:true,checklistEvents,legacyClicks:true});try{
  const revision=f.view().revision
  for(let i=0;i<2;i++){
   if(i)await f.reopen()
   await expect.poll(()=>f.frame.locator('#completed').textContent()).toBe('1')
   await expect.poll(()=>f.frame.locator('#native-count').textContent()).toBe('1')
   for(const[index,name]of ['核对数据时点','检查统计口径','复核风险假设','仅本地清单'].entries())
    expect(await f.frame.getByRole('checkbox',{name,exact:true}).isChecked()).toBe(index>=2)
   await f.page.waitForTimeout(150)
   expect(f.view().revision).toBe(revision);expect(config(f).sharedComponentState).toMatchObject({revision:3,state:{checked:[false,false,true]}})
   expect(Object.keys(config(f).interactionState.events)).toHaveLength(4)
   expect(f.requests.filter(row=>row.method==='commitHtmlInteraction')).toHaveLength(0)
  }
  await f.frame.getByRole('checkbox',{name:'仅本地清单',exact:true}).uncheck()
  await expect.poll(()=>Object.keys(config(f).interactionState.events).length).toBe(5)
  await f.reopen();await expect.poll(()=>f.frame.locator('#native-count').textContent()).toBe('2')
  expect(await f.frame.getByRole('checkbox',{name:'仅本地清单',exact:true}).isChecked()).toBe(false)
  expect(config(f).sharedComponentState).toMatchObject({revision:3,state:{checked:[false,false,true]}})
  expect(f.requests.filter(row=>row.method==='commitHtmlInteraction')).toHaveLength(1)
  await f.frame.getByRole('checkbox',{name:'核对数据时点',exact:true}).check()
  await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([true,false,true])
  expect(config(f).sharedComponentState.revision).toBe(4)
  expect(f.requests.filter(row=>row.method==='commitHtmlInteraction'&&row.input.kind==='shared')).toHaveLength(1)
  expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('keeps radio arrow activation and repeated independent choices distinct from their input/change duplicates',async()=>{
 const f=await fixture({checklist:true,checklistEvents:'all',radioChecklist:true});try{
  const radios=['核对数据时点','检查统计口径','复核风险假设'].map(name=>f.frame.getByRole('radio',{name,exact:true}))
  await expect.poll(()=>radios[0].isEnabled()).toBe(true)
  await radios[0].check();await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([true,false,false])
  await radios[0].press('ArrowDown');await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([false,true,false])
  await radios[1].press('ArrowDown');await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([false,false,true])
  await radios[0].check();await expect.poll(()=>config(f)?.sharedComponentState?.state?.checked).toEqual([true,false,false])
  await expect.poll(()=>f.requests.filter(row=>row.method==='commitHtmlInteraction').length).toBe(4)
  expect(config(f)?.interactionState).toBeUndefined()
  const revision=f.view().revision;await f.reopen();await expect.poll(()=>radios[0].isChecked()).toBe(true)
  await f.page.waitForTimeout(150);expect(f.view().revision).toBe(revision);expect(f.requests.filter(row=>row.method==='commitHtmlInteraction')).toHaveLength(4)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},30000)
it('restores saved local Light through dark cold mount, delayed iframe load and global broadcasts without resetting Conversation state',async()=>{
 const f=await fixture({componentTheme:'light',globalDark:true,slowFrames:true});try{
  const check=async()=>{await expect.poll(()=>f.frame.locator('html').getAttribute('data-workbench-style')).toBe('light');await expect.poll(()=>f.frame.locator('html').getAttribute('data-workbench-control-theme')).toBe('light');expect(await f.frame.locator('html').getAttribute('data-sherlock-theme')).toBe('light');await expect.poll(()=>f.frame.locator('body').evaluate((body:HTMLElement)=>getComputedStyle(body).backgroundColor)).toBe('rgb(255, 255, 255)')}
  expect(f.view().node.componentTheme).toBe('light');expect(await f.page.locator('[data-conversation-component-id]').getAttribute('data-workbench-style')).toBe('light');await check()
  for(let i=0;i<3;i++)await f.frame.getByRole('button',{name:'增加计数',exact:true}).click()
  await f.frame.getByRole('textbox',{name:'备注',exact:true}).fill('冷重开后保留计数3与完整备注')
  await expect.poll(()=>config(f)?.sharedComponentState?.state?.memo).toBe('冷重开后保留计数3与完整备注')
  for(const reopened of [false,true]){
   if(reopened){await f.reopen();await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('3');await check()}
   await f.frame.locator('body').evaluate((body:HTMLElement)=>body.dataset.themeIdentity='same-live-frame')
   const outer=await(await f.page.locator('iframe[data-research-html-artifact]').elementHandle()).contentFrame()
   await outer.evaluate(()=>{(window as any).themeMessages=[];addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='sherlock-workbench-style')(window as any).themeMessages.push(event.data)})})
   for(const dark of [false,true,false,true]){
    const before=await outer.evaluate(()=>(window as any).themeMessages.length)
    await f.page.evaluate((value:boolean)=>document.body.toggleAttribute('data-ds-dark-theme',value),dark)
    await expect.poll(()=>outer.evaluate(()=>(window as any).themeMessages.length)).toBeGreaterThan(before)
    expect(await outer.evaluate(()=>(window as any).themeMessages.at(-1))).toMatchObject({mode:'light',controlTheme:'light'})
    await check();expect(await f.frame.locator('body').getAttribute('data-theme-identity')).toBe('same-live-frame');expect(await f.frame.locator('#count').textContent()).toBe('3');expect(await f.frame.getByRole('textbox',{name:'备注',exact:true}).inputValue()).toBe('冷重开后保留计数3与完整备注')
   }
  }
  expect(f.requests.filter(row=>row.method==='setTheme')).toEqual([]);expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},35000)
it('switches all four modes on the current Conversation component without replacing its live iframe and restores mode with saved interactions',async()=>{
 const f=await fixture();try{
  for(let i=0;i<3;i++)await f.frame.getByRole('button',{name:'增加计数',exact:true}).click()
  await f.frame.getByRole('textbox',{name:'备注',exact:true}).fill('切换模式后保留的对话备注')
  await expect.poll(()=>config(f)?.sharedComponentState?.state?.memo).toBe('切换模式后保留的对话备注')
  await f.frame.locator('body').evaluate((element:HTMLElement)=>element.dataset.modeIdentity='original')
  await f.page.evaluate(()=>(window as any).modeFrame=document.querySelector('iframe[data-research-html-artifact]'))
  for(const[mode,label]of[['light','浅色模式'],['dark','深色模式'],['enterprise','易方达模式'],['openterminal','彭博模式']]){
   await f.page.getByRole('button',{name:'组件更多操作',exact:true}).click()
   await f.page.getByRole('menuitem',{name:'模式切换',exact:true}).hover()
   await f.page.getByRole('menuitemradio',{name:label,exact:true}).click()
   await expect.poll(()=>f.view().node.componentTheme).toBe(mode)
   await expect.poll(()=>f.page.locator('[data-conversation-component-id]').getAttribute('data-workbench-style')).toBe(mode)
   await expect.poll(()=>f.frame.locator('html').getAttribute('data-workbench-style')).toBe(mode)
   expect(await f.page.evaluate(()=>document.querySelector('iframe[data-research-html-artifact]')===(window as any).modeFrame)).toBe(true)
   expect(await f.frame.locator('body').getAttribute('data-mode-identity')).toBe('original')
   expect(await f.frame.locator('#count').textContent()).toBe('3')
   expect(await f.frame.getByRole('textbox',{name:'备注',exact:true}).inputValue()).toBe('切换模式后保留的对话备注')
   expect(await f.page.locator('[data-component-menu-surface]').count()).toBe(0)
  }
  await f.frame.getByRole('button',{name:'增加计数',exact:true}).click();await expect.poll(()=>config(f)?.sharedComponentState?.state?.count).toBe(4)
  await f.reopen();await expect.poll(()=>f.page.locator('[data-conversation-component-id]').getAttribute('data-workbench-style')).toBe('openterminal')
  await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('4')
  expect(await f.frame.getByRole('textbox',{name:'备注',exact:true}).inputValue()).toBe('切换模式后保留的对话备注')
  expect(await f.page.evaluate(()=>document.body.hasAttribute('data-ds-dark-theme'))).toBe(false)
  expect(await f.page.evaluate(()=>(window as any).canvasCalls)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},35000)
it('keeps a later menu open when an earlier authorized theme response finishes after outside dismissal',async()=>{
 const f=await fixture();try{
  f.mode('hold-theme')
  await f.page.getByRole('button',{name:'组件更多操作',exact:true}).click();await f.page.getByRole('menuitem',{name:'模式切换',exact:true}).hover();await f.page.getByRole('menuitemradio',{name:'深色模式',exact:true}).click()
  await expect.poll(()=>f.requests.filter(row=>row.method==='setTheme').length).toBe(1)
  await f.page.mouse.click(950,800);await expect.poll(()=>f.page.locator('[data-component-menu-surface]').count()).toBe(0)
  await f.page.getByRole('button',{name:'组件更多操作',exact:true}).click();await expect.poll(()=>f.page.locator('[data-component-menu-surface]').count()).toBe(1)
  f.mode('ok');f.release();await expect.poll(()=>f.view().node.componentTheme).toBe('dark')
  await expect.poll(()=>f.page.locator('[data-conversation-component-id]').getAttribute('data-workbench-style')).toBe('dark')
  expect(await f.page.locator('[data-component-menu-surface]').count()).toBe(1)
  await f.page.keyboard.press('Escape');expect(f.errors).toEqual([])
 }finally{f.release();await f.close()}
},20000)
it('shows a disabled mode submenu for an actual read-only Conversation component',async()=>{
 const f=await fixture({readOnly:true});try{
  await f.page.getByRole('button',{name:'组件更多操作',exact:true}).click()
  const item=f.page.getByRole('menuitem',{name:'模式切换',exact:true});expect(await item.isDisabled()).toBe(true)
  await item.hover();expect(await f.page.getByRole('menuitemradio').count()).toBe(0)
  expect(f.view().node.componentTheme).toBeUndefined();expect(f.requests.filter(row=>row.method==='setTheme')).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('settles an existing HTML interaction before writing a theme revision and preserves both after reopen',async()=>{
 const f=await fixture();try{
  f.mode('hold');await f.frame.getByRole('button',{name:'增加计数',exact:true}).click()
  await expect.poll(()=>f.requests.filter(row=>row.method==='commitHtmlInteraction').length).toBe(1)
  await f.page.getByRole('button',{name:'组件更多操作',exact:true}).click();await f.page.getByRole('menuitem',{name:'模式切换',exact:true}).hover();await f.page.getByRole('menuitemradio',{name:'深色模式',exact:true}).click()
  await f.page.waitForTimeout(100);expect(f.requests.filter(row=>row.method==='setTheme')).toHaveLength(0)
  f.mode('ok');f.release();await expect.poll(()=>f.view().node.componentTheme).toBe('dark')
  await expect.poll(()=>config(f)?.sharedComponentState?.state?.count).toBe(1)
  await f.reopen();await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('1')
  expect(f.view().node.componentTheme).toBe('dark');expect(f.errors).toEqual([])
 }finally{f.release();await f.close()}
},25000)
it('queues a later HTML interaction behind an authorized in-flight theme without clearing dirty content',async()=>{
 const f=await fixture();try{
  f.mode('hold-theme')
  await f.page.getByRole('button',{name:'组件更多操作',exact:true}).click();await f.page.getByRole('menuitem',{name:'模式切换',exact:true}).hover();await f.page.getByRole('menuitemradio',{name:'深色模式',exact:true}).click()
  await expect.poll(()=>f.requests.filter(row=>row.method==='setTheme').length).toBe(1)
  await f.frame.getByRole('button',{name:'增加计数',exact:true}).click()
  await f.page.waitForTimeout(100);expect(f.requests.filter(row=>row.method==='commitHtmlInteraction')).toHaveLength(0)
  f.mode('ok');f.release();await expect.poll(()=>config(f)?.sharedComponentState?.state?.count).toBe(1)
  expect(f.view().node.componentTheme).toBe('dark');await f.reopen();await expect.poll(()=>f.frame.locator('#count').textContent()).toBe('1')
  expect(f.view().node.componentTheme).toBe('dark');expect(f.errors).toEqual([])
 }finally{f.release();await f.close()}
},25000)
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
