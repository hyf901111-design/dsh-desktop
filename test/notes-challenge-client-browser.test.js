import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {build} from 'esbuild'
import {patchBetterSidebarClient} from '../scripts/lib/patch-sherlock-better-sidebar.mjs'
let browser,script,theme
beforeAll(async()=>{
 const source=patchBetterSidebarClient(await readFile(process.env.SHERLOCK_TEST_SIDEBAR_SOURCE||'build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8'))
 const start=source.indexOf('const SIDEBAR_PREFS_DEFAULTS ='),end=source.indexOf('//#region src/client/chunk-loader.ts',start)
 if(start<0||end<0)throw Error('Real sidebar service fixture boundary missing')
 const serviceSource=source.slice(start,end)
 const built=await build({stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {createNotesChallengeSidebar,NotesChallengeTab} from './scripts/lib/notes-challenge-client.mjs';
 const {SidebarStore,createBetterSidebarService}=new Function(${JSON.stringify(serviceSource)}+';return {SidebarStore,createBetterSidebarService}')();
 const store=new SidebarStore();store.setSession('s');const service=createBetterSidebarService(store);window.sidebarStore=store;window.sidebarService=service;
 service.registerTab({id:'chat',single:true,component:()=>React.createElement('p',null,'既有对话内容')});service.openTab({id:'chat',type:'chat',title:'对话',meta:{sherlockPanel:'right'}},{sessionId:'s'});
 const sessions={list:{getSnapshot:()=>({current:'s',byId:{s:{},other:{}}})}};
 const controller=createNotesChallengeSidebar({service,sessions,document,window,render:props=>React.createElement(NotesChallengeTab,{...props,react:React})});window.challengeController=controller;
 const leaves=node=>node.kind==='leaf'?[node]:node.children.flatMap(leaves);window.sidebarTabs=()=>leaves(store.getSnapshot().state.splits).flatMap(leaf=>leaf.tabs);
 function Panel(){const snapshot=React.useSyncExternalStore(service.subscribeState,service.getSnapshot);const state=snapshot.state,leaf=leaves(state.splits).find(leaf=>leaf.id===state.activePane)||leaves(state.splits)[0],tab=leaf.tabs.find(tab=>tab.id===leaf.active),descriptor=tab&&service.getTab(tab.type);return React.createElement(React.Fragment,null,React.createElement('nav',null,leaf.tabs.map(tab=>React.createElement('span',{key:tab.id},React.createElement('button',{onClick:()=>service.activateTab(tab.id,{sessionId:'s'})},tab.title),tab.id!=='chat'&&React.createElement('button',{'aria-label':'关闭'+tab.title,onClick:()=>service.closeTab(tab.id,{sessionId:'s'})},'×')))),React.createElement('div',{style:{height:450,minHeight:0}},tab&&React.createElement(descriptor.component,{scope:{sessionId:'s'},tab})));}
 createRoot(document.querySelector('#right')).render(React.createElement(Panel));
 window.located=[];window.rechecks=[];window.sources=[];document.addEventListener('sherlock:notes-challenge-locate',event=>window.located.push(event.detail));document.addEventListener('sherlock:notes-challenge-recheck',event=>window.rechecks.push(event.detail));window.dshDesktop={conversationBrowser:{openSource:async value=>window.sources.push(value)}};
 window.openEvidence=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-open',{detail:{sessionId:'s',threadId:'thread',quote:'<img src=x onerror=alert(1)> 报告原句',evidence:[{kind:'note',label:'相关原文',blockId:'original',quote:'相关段落，营收为100亿元。'},{kind:'consensus',label:'infodb查询与计算',data:{source:'infodb/TYDW_FILESYNC/ASHARECONSENSUSDATA',sourceUrl:'https://example.com/report',calculation:'100亿元 × 10000 = 1000000万元',raw:'<script>window.unsafe=1</script>',detail:'依据原文。'.repeat(1000)}}],checks:[{kind:'source',status:'completed',detail:'已查询实际快照'},{kind:'consensus',status:'partial',detail:'报告基准日历史快照缺失，仅事后参考'}]}}));
 window.updateChallenge=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-challenge-state',{detail:{sessionId:'s',level:2,coverage:{checked:2,total:7},checks:[{kind:'consensus',status:'unavailable',detail:'infodb连接当前不可用，尚未完成'}],issues:[{threadId:'thread',quote:'更新后的原句',category:'research',message:'口径仍需确认',evidence:[{kind:'note',label:'相关原文',blockId:'original',quote:'更新依据'}]}]}}));
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 script=built.outputFiles[0].text;theme=await readFile('node_modules/@deepseek-ai/dsh-client-ui-theme/lib/styles/design-platform.css','utf8')
 const playwright=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
 browser=await (playwright.default||playwright).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close()})
async function fixture(dark){
 const context=await browser.newContext({viewport:{width:900,height:700}}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://127.0.0.1/challenge-fixture',route=>route.fulfill({contentType:'text/html',body:`<html><head><meta charset="utf-8"></head><body ${dark?'data-ds-dark-theme':''}><header data-ework-notes-session="s"></header><textarea id="draft">未发送草稿</textarea><aside id="right" style="width:340px;height:500px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)"></aside></body></html>`}));await page.goto('http://127.0.0.1/challenge-fixture');await page.addStyleTag({content:theme});await page.addScriptTag({content:script});await page.getByRole('button',{name:'对话',exact:true}).waitFor();return {context,page,errors}
}
for(const dark of [false,true])it(`opens real right-panel tabs, scrolls complete evidence and routes location/source/recheck (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  const before=await page.evaluate(()=>window.sidebarTabs().map(tab=>({id:tab.id,meta:tab.meta})))
  await page.evaluate(()=>window.openEvidence());await page.locator('[data-notes-challenge-panel]').waitFor()
  expect(await page.locator('[data-notes-challenge-panel] img,[data-notes-challenge-panel] script').count()).toBe(0)
  expect(await page.locator('[data-notes-challenge-panel]').textContent()).toContain('100亿元 × 10000 = 1000000万元')
  await page.getByRole('button',{name:'定位原文',exact:true}).click();expect(await page.evaluate(()=>window.located)).toEqual([{sessionId:'s',blockId:'original',quote:'相关段落，营收为100亿元。'}])
  await page.getByRole('link',{name:'https://example.com/report',exact:true}).click();expect(await page.evaluate(()=>window.sources)).toEqual([{sessionId:'s',url:'https://example.com/report'}]);expect(page.url()).toBe('http://127.0.0.1/challenge-fixture')
  await page.getByRole('button',{name:'重新检查',exact:true}).click();expect(await page.evaluate(()=>window.rechecks)).toEqual([{sessionId:'s'}])
  expect(await page.locator('[data-notes-challenge-panel]').evaluate(el=>({scroll:el.scrollHeight>el.clientHeight,horizontal:el.scrollWidth<=el.clientWidth+1}))).toEqual({scroll:true,horizontal:true})
  expect(await page.evaluate(()=>({unsafe:window.unsafe,tabs:window.sidebarTabs().map(tab=>({id:tab.id,meta:tab.meta})),open:window.sidebarStore.getSnapshot().state.panelOpen})) ).toEqual({unsafe:undefined,tabs:[...before,{id:'notes-challenge:s',meta:{sherlockPanel:'right'}}],open:true})
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('refreshes coverage without stealing input focus or a selected conversation, and closes through the native service',async()=>{
 const {context,page,errors}=await fixture(false);try{
  await page.evaluate(()=>window.openEvidence());await page.getByRole('button',{name:'定位原文',exact:true}).waitFor()
  await page.getByRole('button',{name:'对话',exact:true}).click();await page.locator('#draft').focus();await page.evaluate(()=>window.updateChallenge())
  expect(await page.locator('#draft').evaluate(el=>document.activeElement===el)).toBe(true);expect(await page.locator('#draft').inputValue()).toBe('未发送草稿');expect(await page.getByText('既有对话内容').isVisible()).toBe(true)
  await page.getByRole('button',{name:'挑战',exact:true}).click();expect(await page.locator('[data-notes-challenge-panel]').textContent()).toContain('2 / 7 段');expect(await page.locator('[data-notes-challenge-panel]').textContent()).toContain('infodb连接当前不可用，尚未完成')
  await page.getByRole('button',{name:'关闭挑战',exact:true}).click();expect(await page.locator('[data-notes-challenge-panel]').count()).toBe(0)
  await page.evaluate(()=>window.updateChallenge());expect(await page.getByRole('button',{name:'挑战',exact:true}).count()).toBe(0)
  expect(await page.evaluate(()=>window.challengeController.storeFor('s').getSnapshot())).toBeNull();expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('does not show a delayed source failure from a cleared identity in newly opened evidence',async()=>{
 const {context,page,errors}=await fixture(false);try{
  await page.evaluate(()=>{window.openEvidence();window.dshDesktop.conversationBrowser.openSource=()=>new Promise((_resolve,reject)=>window.rejectOldSource=reject)})
  await page.getByRole('link',{name:'https://example.com/report',exact:true}).click()
  await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('sherlock:notes-reset'));window.openEvidence();window.rejectOldSource(Error('old account failure'))})
  await page.getByRole('button',{name:'定位原文',exact:true}).waitFor()
  expect(await page.getByRole('alert').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
