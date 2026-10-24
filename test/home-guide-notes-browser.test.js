import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NotesStore} from '../src/main/notes/store'
import {HOME_NOTES_GUIDE_TITLE} from '../src/preload/home-guide-notes-data'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';
 import React from'react';import{createRoot}from'react-dom/client';import{NotesApp}from'./src/preload/notes/editor';
 import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';import'./src/preload/notes/challenge.css';
 window.guideNativeEvents=[];for(const name of ['notes-edited','notes-composer-state','notes-composer-draft','notes-task-state'])document.addEventListener('sherlock:'+name,()=>window.guideNativeEvents.push(name));window.mountAnotherGuide=signal=>mountHomeNotesGuide(document,document.querySelector('#guide'),{signal});window.abortGuide=new AbortController();window.guideStatuses=[];window.guideGate=()=>Promise.resolve();window.readyGuide=mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:window.abortGuide.signal,onStatus:text=>window.guideStatuses.push(text),waitUntilPlaying:()=>window.guideGate()}).then(api=>window.guide=api);
 window.guideCues=[];window.addEventListener('sherlock:home-guide-cue',event=>window.guideCues.push({label:event.detail.label,connected:event.detail.target.isConnected,runId:event.detail.runId}));
 window.persistentBridge={request:(method,input)=>window.noteStorageRequest(method,input),draft:input=>window.noteStorageRequest('draft',input)};
 window.startPersistentGuide=async fresh=>{window.guide.dispose();await new Promise(resolve=>setTimeout(resolve,50));window.guide=await mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:new AbortController().signal,sessionId:'real-guide-session',runId:'notes-natural-run',fresh,persistence:window.persistentBridge});};
 window.openSavedNativeNote=()=>{window.nativeRoot=createRoot(document.querySelector('#guide'));window.nativeRoot.render(React.createElement(NotesApp,{sessionId:'real-guide-session',bridge:window.persistentBridge,dark:false,navigate:()=>{}}));};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(storage){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],network=[],logs=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.text())});page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1/notes-guide'))network.push(request.url())})
 await page.route('http://127.0.0.1/notes-guide',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>笔记用例教程</title><body data-workspace-surface="notes"><div id="guide" class="en-root" data-home-guide-notes="" style="left:0;top:0;right:0;bottom:0"></div>'}))
 await page.goto('http://127.0.0.1/notes-guide');if(storage)await page.exposeFunction('noteStorageRequest',storage);await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>window.readyGuide);return{context,page,errors,network,logs}
}
it('streams into the actual NotesApp, reviews in the real strict picker and applies the native optimization',async()=>{
 const{context,page,errors,network,logs}=await fixture();try{
  expect(await page.title()).toBe('笔记用例教程');await page.evaluate(()=>window.guide.runStep('write'))
  expect(await page.locator('.en-title').inputValue()).toContain('AI算力产业链');expect(await page.locator('.bn-editor').innerText()).toContain('同比增长20%')
  await page.evaluate(()=>window.guide.runStep('challenge'))
  expect(await page.locator('.en-challenge-trigger').innerText()).toContain('严格');expect(await page.locator('.en-challenge-popover').count()).toBe(1)
  await page.evaluate(()=>window.guide.runStep('review'));expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBeGreaterThanOrEqual(3)
  await page.evaluate(()=>window.guide.runStep('select'));expect(await page.locator('.en-challenge-card').innerText()).toContain('增幅应为10%')
  await page.screenshot({path:'/tmp/home-guide-notes-strict-challenge-20261024.png'})
  await page.evaluate(()=>window.guide.runStep('optimize'));expect(await page.locator('.bn-editor').innerText()).toContain('同比增长20%');expect(await page.locator('.en-challenge-replace').count()).toBe(1)
  await page.evaluate(()=>window.guide.runStep('replace'));expect(await page.locator('.bn-editor').innerText()).toContain('同比增长10%');expect(await page.locator('.bn-editor').innerText()).not.toContain('同比增长20%')
  expect(await page.locator('[data-en-replacement-id]').count()).toBeGreaterThan(0);expect(await page.locator('.en-error').count()).toBe(0)
  await page.screenshot({path:'/tmp/home-guide-notes-native-replacement-20261024.png'})
  await page.evaluate(()=>window.guide.dispose());expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([]);expect(network).toEqual([]);expect(await page.evaluate(()=>window.guideNativeEvents)).toEqual([]);expect(logs).toEqual([])
 }finally{await context.close()}
},50000)
it('keeps the saved Yjs note and native challenge discussion editable after the tutorial surface is removed',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-browser-')),store=new NotesStore(directory),calls=[]
 const storage=async(method,input)=>{calls.push(method);if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft'){store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}};if(method==='challenge')throw Error('教程不能调用真实模型');return{ok:true}}
 const{context,page,errors,logs}=await fixture(storage);try{
  await page.evaluate(()=>window.startPersistentGuide(true))
  for(const step of ['write','challenge','review','select','optimize','replace'])await page.evaluate(step=>window.guide.runStep(step),step)
  expect(await page.locator('.bn-editor').innerText()).toContain('同比增长10%')
  await page.evaluate(()=>window.guide.flush());await page.evaluate(()=>window.guide.dispose());await expect.poll(()=>page.locator('.bn-editor').count()).toBe(0)
  const saved=store.load('owner','real-guide-session');expect(saved.saved.yjs.length).toBeGreaterThan(1000);expect(saved.draft).toBeUndefined();expect(calls).not.toContain('challenge')
  const cues=await page.evaluate(()=>window.guideCues);expect(cues.length).toBeGreaterThanOrEqual(5);expect(cues.every(cue=>cue.connected&&cue.runId==='notes-natural-run')).toBe(true)
  await page.evaluate(()=>window.openSavedNativeNote());await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain('同比增长10%')
  expect(await page.locator('.en-challenge-grade').innerText()).toContain('严格');expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBeGreaterThanOrEqual(2)
  await page.waitForTimeout(3000);expect(calls).not.toContain('challenge')
  const paragraph=page.locator('[data-id="guide-note-intro"] .bn-inline-content');await paragraph.click();await page.keyboard.press('End');await page.keyboard.type(' 保留的补充观察。')
  await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain('保留的补充观察')
  await expect.poll(()=>JSON.stringify(store.load('owner','real-guide-session').saved.blocks),{timeout:3000}).toContain('保留的补充观察')
  await expect.poll(()=>calls.includes('challenge'),{timeout:6000}).toBe(true)
  expect(errors).toEqual([]);expect(logs).toEqual([]);await page.evaluate(()=>window.nativeRoot.unmount())
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},50000)
it('confirms a partial note even when navigation has already hidden the guide surface',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-hidden-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.evaluate(()=>window.startPersistentGuide(true));await page.evaluate(()=>{window.partialWrite=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain('研究摘要')
  await page.evaluate(()=>{window.guideGate=()=>new Promise(resolve=>window.resumeNoteGuide=resolve)});await page.waitForTimeout(130)
  await page.evaluate(async()=>{document.querySelector('#guide').style.display='none';await window.guide.flush();window.guide.dispose();window.resumeNoteGuide?.()})
  expect(await page.evaluate(()=>window.partialWrite)).toBe('AbortError');expect(store.load('owner','real-guide-session').saved.title).toBe(HOME_NOTES_GUIDE_TITLE);expect(store.load('owner','real-guide-session').draft).toBeUndefined();expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},15000)
it('aborts a partial stream without editor or challenge mutations after disposal',async()=>{
 const{context,page,errors}=await fixture();try{
  const result=await page.evaluate(async()=>{const pending=window.guide.runStep('write');setTimeout(()=>window.abortGuide.abort(),120);try{await pending;return'completed'}catch(error){return error.name}})
  expect(result).toBe('AbortError');await expect.poll(()=>page.locator('.bn-editor').count()).toBe(0);await page.waitForTimeout(800);expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('pauses a streaming batch and cancels a paused gate without late content',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.streamPending=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain('研究摘要')
  await page.evaluate(()=>{window.guideGate=()=>new Promise(resolve=>window.resumeNoteGuide=resolve)})
  await page.waitForTimeout(120);const paused=await page.locator('.bn-editor').innerText();await page.waitForTimeout(300)
  expect(await page.locator('.bn-editor').innerText()).toBe(paused)
  await page.evaluate(()=>window.abortGuide.abort());expect(await page.evaluate(()=>window.streamPending)).toBe('AbortError')
  await page.evaluate(()=>window.resumeNoteGuide?.());await page.waitForTimeout(200);expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('cleans up a signal that was already aborted before mounting',async()=>{
 const{context,page,errors}=await fixture();try{
  const result=await page.evaluate(async()=>{window.guide.dispose();const controller=new AbortController();controller.abort();try{await window.mountAnotherGuide(controller.signal);return'completed'}catch(error){return error.name}})
  expect(result).toBe('AbortError');await page.waitForTimeout(100);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)

it('still times out a genuinely unavailable editor while the guide is playing',async()=>{
 const{context,page,errors}=await fixture();try{
  const result=await page.evaluate(async()=>{
   window.guide.dispose();const host=document.querySelector('#guide'),query=host.querySelector
   // Hold the real mounted editor's readiness boundary closed, without replacing
   // the editor, scheduler or the guide's timing code with a test implementation.
   host.querySelector=function(selector){return selector==='.bn-editor'?null:query.call(this,selector)}
   const started=performance.now()
   try{await window.mountAnotherGuide(new AbortController().signal);return{completed:true}}
   catch(error){return{message:error.message,elapsed:performance.now()-started}}
   finally{host.querySelector=query}
  })
  expect(result.message).toContain('未就绪');expect(result.elapsed).toBeGreaterThanOrEqual(6900);expect(result.elapsed).toBeLessThan(9500);expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
