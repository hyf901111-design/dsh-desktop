import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import{mountHomeNotesGuide}from'./src/preload/home-guide-notes';
 import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';import'./src/preload/notes/challenge.css';
 window.guideNativeEvents=[];for(const name of ['notes-edited','notes-composer-state','notes-composer-draft','notes-task-state'])document.addEventListener('sherlock:'+name,()=>window.guideNativeEvents.push(name));window.mountAnotherGuide=signal=>mountHomeNotesGuide(document,document.querySelector('#guide'),{signal});window.abortGuide=new AbortController();window.guideStatuses=[];window.guideGate=()=>Promise.resolve();window.readyGuide=mountHomeNotesGuide(document,document.querySelector('#guide'),{signal:window.abortGuide.signal,onStatus:text=>window.guideStatuses.push(text),waitUntilPlaying:()=>window.guideGate()}).then(api=>window.guide=api);
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})
 script=output.outputFiles.find(file=>file.path.endsWith('.js')).text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(){
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[],network=[],logs=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['warning','error'].includes(message.type()))logs.push(message.text())});page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1/notes-guide'))network.push(request.url())})
 await page.route('http://127.0.0.1/notes-guide',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, interactive-widget=resizes-content"><title>笔记用例教程</title><body data-workspace-surface="notes"><div id="guide" class="en-root" data-home-guide-notes="" style="left:0;top:0;right:0;bottom:0"></div>'}))
 await page.goto('http://127.0.0.1/notes-guide');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>window.readyGuide);return{context,page,errors,network,logs}
}
it('streams into the actual NotesApp, reviews in the real strict picker and applies the native optimization',async()=>{
 const{context,page,errors,network,logs}=await fixture();try{
  expect(await page.title()).toBe('笔记用例教程');await page.evaluate(()=>window.guide.runStep('write'))
  expect(await page.locator('.en-title').inputValue()).toContain('AI算力产业链');expect(await page.locator('.bn-editor').innerText()).toContain('同比增长20%')
  await page.evaluate(()=>window.guide.runStep('challenge'))
  expect(await page.locator('.en-challenge-trigger').innerText()).toContain('严格');expect(await page.locator('.bn-editor [data-bn-thread-id]').count()).toBeGreaterThanOrEqual(3)
  await page.evaluate(()=>window.guide.runStep('select'));expect(await page.locator('.en-challenge-card').innerText()).toContain('增幅应为10%')
  await page.screenshot({path:'/tmp/home-guide-notes-strict-challenge-20261024.png'})
  await page.evaluate(()=>window.guide.runStep('replace'));expect(await page.locator('.bn-editor').innerText()).toContain('同比增长10%');expect(await page.locator('.bn-editor').innerText()).not.toContain('同比增长20%')
  expect(await page.locator('[data-en-replacement-id]').count()).toBeGreaterThan(0);expect(await page.locator('.en-error').count()).toBe(0)
  await page.screenshot({path:'/tmp/home-guide-notes-native-replacement-20261024.png'})
  await page.evaluate(()=>window.guide.dispose());expect(await page.locator('.bn-editor').count()).toBe(0);expect(errors).toEqual([]);expect(network).toEqual([]);expect(await page.evaluate(()=>window.guideNativeEvents)).toEqual([]);expect(logs).toEqual([])
 }finally{await context.close()}
},30000)
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
