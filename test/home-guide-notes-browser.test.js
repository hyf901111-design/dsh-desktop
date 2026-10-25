import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NotesStore} from '../src/main/notes/store'
import {HOME_NOTES_GUIDE_TITLE,HOME_NOTES_CONSENSUS_REPLACEMENT} from '../src/preload/home-guide-notes-data'
import {homeNoteChallengeSidebarSource} from './fixtures/home-note-challenge-sidebar.js'
let browser,script,css
beforeAll(async()=>{
 const challengeSidebar=await homeNoteChallengeSidebarSource()
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';
 import React from'react';import{createRoot}from'react-dom/client';import{NotesApp}from'./src/preload/notes/editor';
 import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';import'./src/preload/notes/challenge.css';
 ${challengeSidebar}
 import{HOME_NOTES_TASK_PROMPT,HOME_NOTES_REWRITE_PROMPT,HOME_NOTES_TASK_RESULT,HOME_NOTES_REWRITE_RESULT}from'./packages/dsh-research-task-runtime/home-notes-guide-contract.js';
 window.guideNativeEvents=[];for(const name of ['notes-edited','notes-composer-state','notes-composer-draft','notes-task-state'])document.addEventListener('sherlock:'+name,()=>window.guideNativeEvents.push(name));window.mountAnotherGuide=signal=>mountHomeNotesGuide(document,document.querySelector('#guide'),{signal});window.abortGuide=new AbortController();window.guideStatuses=[];window.guideGate=()=>Promise.resolve();window.readyGuide=mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:window.abortGuide.signal,runId:'standalone-note-run',onStatus:text=>window.guideStatuses.push(text),waitUntilPlaying:()=>window.guideGate()}).then(api=>window.guide=api);
 window.cueTarget=token=>typeof token==='string'?document.querySelector('[data-home-guide-cue-target="'+CSS.escape(token)+'"]'):null;
 window.guideCues=[];window.guidePointerPending=[];window.addEventListener('sherlock:home-guide-cue',event=>{const wire=event.detail,target=wire.target||window.cueTarget(wire.targetToken),fromTarget=wire.fromTarget||window.cueTarget(wire.fromTargetToken);window.guideCues.push({label:wire.label,connected:target?.isConnected===true,runId:wire.runId,requestId:wire.requestId,action:wire.action});if(wire.requestId)window.guidePointerPending.push({...wire,target,fromTarget,wire})});
 window.persistentBridge={request:(method,input)=>window.noteStorageRequest(method,input),draft:input=>window.noteStorageRequest('draft',input)};
 window.startPersistentGuide=async fresh=>{window.guide.dispose();await new Promise(resolve=>setTimeout(resolve,50));window.guide=await mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:new AbortController().signal,sessionId:'real-guide-session',runId:'notes-natural-run',fresh,persistence:window.persistentBridge});};
 window.openSavedNativeNote=()=>{window.nativeRoot=createRoot(document.querySelector('#guide'));window.nativeRoot.render(React.createElement(NotesApp,{sessionId:'real-guide-session',bridge:window.persistentBridge,dark:false,navigate:()=>{}}));};
 window.startNativeGuide=async()=>{window.guide.dispose();await new Promise(resolve=>setTimeout(resolve,50));document.documentElement.dataset.homeGuidePointerRun='notes-natural-run';window.nativeGuideRequests=[];const native={type:async stage=>{document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'real-guide-session',prompt:stage==='note'?HOME_NOTES_TASK_PROMPT:HOME_NOTES_REWRITE_PROMPT,images:[],submissionId:window.nativeGuideRequests.length}}))},generate:async input=>{window.nativeGuideRequests.push(input);await new Promise(resolve=>setTimeout(resolve,80));return{kind:'text',markdown:input.selection?HOME_NOTES_REWRITE_RESULT:HOME_NOTES_TASK_RESULT}},stop:async()=>{},dispose:()=>{window.nativeGuideDisposed=true}};window.guide=await mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:new AbortController().signal,sessionId:'real-guide-session',runId:'notes-natural-run',fresh:true,persistence:window.persistentBridge,native,wait:async ms=>{if(window.recordNativeScroll)await new Promise(resolve=>setTimeout(resolve,ms))}});window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(cue.requestId)window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))});};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(storage){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],network=[],logs=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.text())});page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1/notes-guide'))network.push(request.url())})
 await page.route('http://127.0.0.1/notes-guide',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>笔记用例教程</title><body data-workspace-surface="notes"><div id="guide" class="en-root" data-home-guide-notes="" style="left:0;top:0;right:360px;bottom:0"></div>'}))
 await page.goto('http://127.0.0.1/notes-guide');if(storage)await page.exposeFunction('noteStorageRequest',storage);await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>window.readyGuide);return{context,page,errors,network,logs}
}
it('checks three actual evidence cards, corrects the consensus and returns the same native editor smoothly to its title',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-consensus-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of ['write','challenge','review','select','optimize','replace','consensus-select','consensus-evidence','consensus-optimize','consensus-replace','note-task-compose','note-task-review','note-task-apply','note-select-paragraph','note-rewrite','note-rewrite-apply']){
   await page.evaluate(step=>window.guide.runStep(step),step)
   if(step==='review')expect(await page.locator('.bn-editor [data-bn-thread-id]').evaluateAll(nodes=>new Set(nodes.map(node=>node.dataset.bnThreadId)).size)).toBe(4)
   if(step==='consensus-evidence'){
    const panel=page.locator('[data-notes-challenge-panel]');expect(await panel.locator('article').count()).toBe(3)
    expect(await panel.innerText()).toContain('甲证券 · 2026E盈利预测');expect(await panel.innerText()).toContain('1.72十亿元');expect(await panel.innerText()).toContain('17.2亿元');expect(await panel.innerText()).toContain('2027E');expect(await panel.innerText()).toContain('演示样本')
   }
   if(step==='consensus-replace')expect(await page.locator('[data-id="guide-note-consensus"] .bn-inline-content').innerText()).toBe(HOME_NOTES_CONSENSUS_REPLACEMENT)
  }
  expect((await page.evaluate(()=>window.nativeGuideRequests))[0].markdown).toContain('样本均值为17.0亿元')
  await page.emulateMedia({reducedMotion:'no-preference'})
  const start=await page.evaluate(()=>{window.beforeReturnEditor=document.querySelector('#guide .bn-editor');window.beforeReturnArea=document.querySelector('#guide .en-document-scroll');window.beforeReturnArea.scrollTop=window.beforeReturnArea.scrollHeight-window.beforeReturnArea.clientHeight;window.scrollSamples=[];window.recordNativeScroll=true;const sample=()=>{window.scrollSamples.push(window.beforeReturnArea.scrollTop);if(window.recordNativeScroll)requestAnimationFrame(sample)};requestAnimationFrame(sample);return window.beforeReturnArea.scrollTop})
  expect(start).toBeGreaterThan(200)
  await page.evaluate(()=>window.guide.runStep('note-return-top'))
  const finish=await page.evaluate(()=>{window.recordNativeScroll=false;return{sameEditor:window.beforeReturnEditor===document.querySelector('#guide .bn-editor'),sameArea:window.beforeReturnArea===document.querySelector('#guide .en-document-scroll'),top:window.beforeReturnArea.scrollTop,samples:window.scrollSamples}})
  expect(finish.sameEditor).toBe(true);expect(finish.sameArea).toBe(true);expect(finish.top).toBe(0);expect(finish.samples.filter(value=>value>0&&value<start).length).toBeGreaterThan(6)
  await page.evaluate(()=>window.guide.flush())
  const saved=store.load('owner','real-guide-session'),body=JSON.stringify(saved.saved.blocks)
  expect(body).toContain('样本均值为17.0亿元');expect(body).toContain('两家样本不能代表市场整体一致预期');expect(body).toContain('不能直接推导全年净利润翻倍');expect(saved.draft).toBeUndefined()
  expect(await page.locator('[data-en-replacement-id]').evaluateAll(nodes=>new Set(nodes.map(node=>node.dataset.enReplacementId)).size)).toBeGreaterThanOrEqual(2)
  await page.evaluate(()=>{window.guide.dispose();delete document.documentElement.dataset.homeGuidePointerRun;window.openSavedNativeNote()})
  await expect.poll(()=>page.locator('[data-id="guide-note-consensus"] .bn-inline-content').innerText()).toBe(HOME_NOTES_CONSENSUS_REPLACEMENT)
  expect(await page.locator('[data-en-replacement-id]').evaluateAll(nodes=>new Set(nodes.map(node=>node.dataset.enReplacementId)).size)).toBeGreaterThanOrEqual(2)
  expect(errors).toEqual([]);await page.evaluate(()=>window.nativeRoot.unmount())
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},45000)
it('opens the actual evidence action in English without relying on its Chinese button text',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-consensus-en-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(async()=>{document.documentElement.dataset.odysseyLocale='en';await window.startNativeGuide()})
  for(const step of ['write','challenge','review','select','optimize','replace','consensus-select'])await page.evaluate(step=>window.guide.runStep(step),step)
  expect(await page.getByRole('button',{name:'View evidence',exact:true}).count()).toBeGreaterThan(0)
  await page.evaluate(()=>window.guide.runStep('consensus-evidence'))
  expect(await page.locator('[data-notes-challenge-panel] article').count()).toBe(3);expect(errors).toEqual([])
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},20000)
it('extends the saved native note with a research summary and an actual paragraph rewrite without replacing the original document',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'home-guide-note-native-')),store=new NotesStore(directory)
 const storage=async(method,input)=>{if(method==='load')return store.load('owner',input.sessionId);if(method==='save')return store.save('owner',input.sessionId,input.revision,input.content,input.clientId);if(method==='draft')store.draft('owner',input.sessionId,input.clientId,input.revision,input.content);return{ok:true}}
 const{context,page,errors}=await fixture(storage);try{
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.startNativeGuide())
  for(const step of ['write','challenge','review','select','optimize','replace','consensus-select','consensus-evidence','consensus-optimize','consensus-replace','note-task-compose','note-task-review','note-task-apply','note-select-paragraph','note-rewrite','note-rewrite-apply','note-return-top']){
   await page.evaluate(step=>window.guide.runStep(step),step)
   if(step==='note-select-paragraph'){await page.evaluate(()=>{const next=document.createElement('button');next.textContent='下一步';next.id='native-note-next';document.body.append(next);next.click();next.focus()});await page.waitForTimeout(300)}
  }
  const requests=await page.evaluate(()=>window.nativeGuideRequests)
  expect(requests).toHaveLength(2);expect(requests[0].context.scope).toBe('note');expect(requests[0].selection).toBe('');expect(requests[0].markdown).toContain('同比增长10%')
  expect(requests[1].context.scope).toBe('selection');expect(requests[1].markdown).toBe('');expect(requests[1].selection).toContain('订单同比增长即可保证全年净利润翻倍')
  expect(await page.locator('[data-id="guide-note-intro"] .bn-inline-content').innerText()).toContain('虚构公司与演示数据')
  expect(await page.locator('[data-id="guide-note-logic"] .bn-inline-content').innerText()).toContain('不能直接推导全年净利润翻倍')
  expect(await page.locator('.bn-editor').innerText()).toContain('研究摘要');expect(await page.locator('.bn-editor').innerText()).toContain('同比增长10%');expect(await page.locator('[data-en-replacement-id]').count()).toBeGreaterThan(0)
  await page.evaluate(()=>window.guide.flush());await page.evaluate(()=>window.guide.dispose())
  const saved=store.load('owner','real-guide-session');expect(JSON.stringify(saved.saved.blocks)).toContain('不能直接推导全年净利润翻倍');expect(JSON.stringify(saved.saved.blocks)).toContain('样本公司收入由120亿元增至132亿元');expect(saved.draft).toBeUndefined()
  await page.evaluate(()=>{delete document.documentElement.dataset.homeGuidePointerRun;window.openSavedNativeNote()});await expect.poll(()=>page.locator('.bn-editor').innerText()).toContain('不能直接推导全年净利润翻倍')
  expect(errors).toEqual([]);await page.evaluate(()=>window.nativeRoot.unmount())
 }finally{await context.close();rmSync(directory,{recursive:true,force:true})}
},35000)
it('waits for the matching pointer acknowledgement before title and body input and cancels a pending click',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.pointerWrite=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  expect(await page.locator('.en-title').inputValue()).toBe('')
  expect((await page.locator('.bn-editor').innerText()).trim()).toBe('')
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.classList.contains('en-title'))).toBe(true)
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:'stale',requestId:cue.requestId,ok:true}}))})
  await page.waitForTimeout(100);expect(await page.locator('.en-title').inputValue()).toBe('')
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(2)
  expect(await page.locator('.en-title').inputValue()).toBe(HOME_NOTES_GUIDE_TITLE)
  expect((await page.locator('.bn-editor').innerText()).trim()).toBe('')
  await page.evaluate(()=>{window.abortGuide.abort();const cue=window.guidePointerPending[1];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})
  expect(await page.evaluate(()=>window.pointerWrite)).toBe('AbortError');expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('sends JSON-only pointer tokens and removes its exact target markers after acknowledgement and abort',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.tokenWrite=window.guide.runStep('write').catch(error=>error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  const observed=await page.evaluate(()=>{const {wire,target}=window.guidePointerPending[0];let json,error;try{json=JSON.parse(JSON.stringify(wire))}catch(value){error=value.message}return{wire:json,error,keys:Object.keys(wire),token:target.getAttribute('data-home-guide-cue-target')}})
  expect(observed.error).toBeUndefined()
  expect(observed.keys.sort()).toEqual(['runId','requestId','label','action','targetToken'].sort())
  expect(observed.wire).toMatchObject({runId:'standalone-note-run',action:'click',targetToken:`standalone-note-run:${observed.wire.requestId}:target`})
  expect(observed.token).toBe(observed.wire.targetToken)
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.hasAttribute('data-home-guide-cue-target'))).toBe(false)
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(2)
  await page.evaluate(()=>window.abortGuide.abort());expect(await page.evaluate(()=>window.tokenWrite)).toBe('AbortError')
  expect(await page.evaluate(()=>window.guidePointerPending[1].target.hasAttribute('data-home-guide-cue-target'))).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('cleans a rejected pointer token without deleting a newer owner marker',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.tokenReject=window.guide.runStep('write').catch(error=>error.message)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  await page.evaluate(()=>{const cue=window.guidePointerPending[0];cue.target.setAttribute('data-home-guide-cue-target','newer-owner-token');window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:false,message:'目标已取消'}}))})
  expect(await page.evaluate(()=>window.tokenReject)).toBe('目标已取消')
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.getAttribute('data-home-guide-cue-target'))).toBe('newer-owner-token');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('sends both JSON-only strict-slider endpoints and cleans both on failure',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(cue.requestId&&cue.action!=='drag')window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})})
  await page.evaluate(()=>window.guide.runStep('write'))
  await page.evaluate(()=>{window.tokenSlider=window.guide.runStep('challenge').catch(error=>error.message)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.some(cue=>cue.action==='drag'))).toBe(true)
  const observed=await page.evaluate(()=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');let json,error;try{json=JSON.parse(JSON.stringify(cue.wire))}catch(value){error=value.message}return{wire:json,error,keys:Object.keys(cue.wire),target:cue.target.getAttribute('data-home-guide-cue-target'),from:cue.fromTarget.getAttribute('data-home-guide-cue-target')}})
  expect(observed.error).toBeUndefined()
  expect(observed.keys.sort()).toEqual(['runId','requestId','label','action','targetToken','fromTargetToken'].sort())
  expect(observed.target).toBe(`standalone-note-run:${observed.wire.requestId}:target`);expect(observed.from).toBe(`standalone-note-run:${observed.wire.requestId}:from`)
  await page.evaluate(()=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:false,message:'滑块位置已变化'}}))})
  expect(await page.evaluate(()=>window.tokenSlider)).toBe('滑块位置已变化')
  expect(await page.evaluate(()=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');return[cue.target.getAttribute('data-home-guide-cue-target'),cue.fromTarget.getAttribute('data-home-guide-cue-target')]})).toEqual([null,null]);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('completes the real note actor when every JSON-only target survives delayed acknowledgement',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.addEventListener('sherlock:home-guide-cue',event=>{const cue=JSON.parse(JSON.stringify(event.detail));if(!cue.requestId)return;setTimeout(()=>{const target=window.cueTarget(cue.targetToken),from=cue.fromTargetToken?window.cueTarget(cue.fromTargetToken):null;window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:!!target?.isConnected&&(!cue.fromTargetToken||!!from?.isConnected),message:'操作目标必须在移动期间保持存活'}}))},90)})})
  for(const step of ['write','challenge','review','select','optimize','replace'])await page.evaluate(step=>window.guide.runStep(step),step)
  expect(await page.locator('.bn-editor').innerText()).toContain('同比增长10%');expect(await page.locator('[data-en-replacement-id]').count()).toBeGreaterThan(0)
  expect(await page.locator('[data-home-guide-cue-target]').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},30000)
it('refuses another pointer owner instead of treating it as an isolated legacy fixture',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='another-run';window.ownerResult='';void window.guide.runStep('write').then(()=>window.ownerResult='completed',error=>window.ownerResult=error.name)})
  await expect.poll(()=>page.evaluate(()=>window.ownerResult)).toBe('AbortError')
  expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it.each(['offscreen','hidden','inert'])('does not write after an acknowledged title becomes %s',async invalid=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.invalidResult='';void window.guide.runStep('write').then(()=>window.invalidResult='completed',error=>window.invalidResult=error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.length)).toBe(1)
  await page.evaluate(invalid=>{const cue=window.guidePointerPending[0];if(invalid==='offscreen')cue.target.style.transform='translateX(-4000px)';else if(invalid==='hidden')cue.target.style.visibility='hidden';else cue.target.parentElement.inert=true;window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))},invalid)
  await expect.poll(()=>page.evaluate(()=>window.invalidResult)).toBe('Error')
  expect(await page.evaluate(()=>window.guidePointerPending[0].target.value)).toBe('');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it.each(['source','destination'])('checks the strict-slider drag %s again after acknowledgement',async endpoint=>{
 const{context,page,errors}=await fixture();try{
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(()=>{document.documentElement.dataset.homeGuidePointerRun='standalone-note-run';window.addEventListener('sherlock:home-guide-cue',event=>{const cue=event.detail;if(cue.requestId&&cue.action!=='drag')window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))})})
  await page.evaluate(()=>window.guide.runStep('write'))
  await page.evaluate(()=>{window.invalidSliderResult='';void window.guide.runStep('challenge').then(()=>window.invalidSliderResult='completed',error=>window.invalidSliderResult=error.name)})
  await expect.poll(()=>page.evaluate(()=>window.guidePointerPending.some(cue=>cue.action==='drag'))).toBe(true)
  await page.evaluate(endpoint=>{const cue=window.guidePointerPending.find(cue=>cue.action==='drag');window.invalidSlider=document.querySelector('.en-challenge-slider');(endpoint==='source'?cue.fromTarget:cue.target).style.transform='translateX(-4000px)';window.dispatchEvent(new CustomEvent('sherlock:home-guide-cue-reply',{detail:{runId:cue.runId,requestId:cue.requestId,ok:true}}))},endpoint)
  await expect.poll(()=>page.evaluate(()=>window.invalidSliderResult)).toBe('Error')
  expect(await page.evaluate(()=>window.invalidSlider.getAttribute('aria-valuenow'))).toBe('0');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('streams into the actual NotesApp, reviews in the real strict picker and applies the native optimization',async()=>{
 const{context,page,errors,network,logs}=await fixture();try{
  expect(await page.title()).toBe('笔记用例教程');await page.evaluate(()=>window.guide.runStep('write'))
  expect(await page.locator('.en-title').inputValue()).toContain('AI算力产业链');expect(await page.locator('.bn-editor').innerText()).toContain('同比增长20%')
  await page.evaluate(()=>window.guide.runStep('challenge'))
  expect(await page.locator('.en-challenge-trigger').innerText()).toContain('严格');expect(await page.locator('.en-challenge-popover').count()).toBe(1)
  await page.evaluate(()=>{window.reviewStep=window.guide.runStep('review')})
  await expect.poll(()=>page.locator('.en-challenge-trigger').getAttribute('aria-busy'),{timeout:6000}).toBe('true')
  await page.evaluate(()=>{window.noteResumes=[];window.guideGate=()=>new Promise(resolve=>window.noteResumes.push(resolve))})
  await page.waitForTimeout(2200)
  expect(await page.locator('.en-challenge-trigger').getAttribute('aria-busy')).toBe('true');expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBe(0)
  await page.evaluate(()=>{window.guideGate=()=>Promise.resolve();for(const resume of window.noteResumes)resume()})
  await page.evaluate(()=>window.reviewStep);expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBeGreaterThanOrEqual(3)
  await page.evaluate(()=>window.guide.runStep('select'));expect(await page.locator('.en-challenge-card').innerText()).toContain('增幅应为10%')
  await page.screenshot({path:'/tmp/home-guide-notes-strict-challenge-20261024.png'})
  await page.evaluate(()=>{window.optimizeStep=window.guide.runStep('optimize')})
  await expect.poll(()=>page.getByRole('progressbar',{name:'正在优化'}).count(),{timeout:4000}).toBe(1)
  expect(await page.locator('.en-challenge-replace').count()).toBe(0)
  await page.evaluate(()=>window.optimizeStep);expect(await page.locator('.bn-editor').innerText()).toContain('同比增长20%');expect(await page.locator('.en-challenge-replace').count()).toBe(1)
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
  await expect.poll(()=>page.locator('.bn-editor').innerText(),{timeout:5000}).toContain('研究摘要')
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
  await expect.poll(()=>page.locator('.bn-editor').innerText(),{timeout:5000}).toContain('研究摘要')
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
