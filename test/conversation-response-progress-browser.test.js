import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {beforeAll,afterAll,expect,it} from 'vitest'
const require=createRequire(import.meta.url),baseline=process.env.SHERLOCK_RESPONSE_PROGRESS_BASELINE==='1'
let browser,bundle,nativeSource,css
const evidence='/tmp/conversation-response-progress-20261027'
beforeAll(async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patch=baseline?source=>source:require('../scripts/lib/conversation-response-progress.mjs').patchConversationResponseProgress
 nativeSource=patch(raw).replace('exports.apply = apply;','exports.apply = apply;exports.__responseChat=ChatView;exports.__responseAssistant=AssistantNodeView;exports.__responseExecution=ExecutionStatusGroup;exports.__responseShared=SharedResearchRequest;exports.__responseDictionaries={zh,en};exports.__responseBind=()=>{sherlockBoardsPage.PersonalResearchHistory=()=>null;sherlockBoardsAdapter=null};')
 const output=await build({entryPoints:['test/fixtures/conversation-response-progress-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.svg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}});bundle=output.outputFiles[0].text
 const assets='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',names=(await readdir(assets)).filter(name=>/^index-.*\.css$/.test(name));css=(await Promise.all(names.map(name=>readFile(assets+'/'+name,'utf8')))).join('\n')+'\n'+(await Promise.all(['figma-reading','figma-refinements'].map(name=>readFile('src/preload/'+name+'.css','utf8')))).join('\n')
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
})
afterAll(async()=>browser?.close())
async function fixture(mode='light',locale='zh',reducedMotion='no-preference'){
 const page=await browser.newPage({viewport:{width:980,height:800},reducedMotion}),errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message));await page.clock.install({time:new Date('2026-10-27T04:00:00Z')})
 await page.goto('about:blank');await page.setContent('<html lang="'+locale+'"><div id="app"></div><button id="outside">其它按钮</button></html>');await page.evaluate(({mode,locale})=>{window.responseLocale=locale;if(mode==='dark')document.body.dataset.dsDarkTheme='';window.__ModuleLoader__={load:value=>window.responseDescriptor=value}},{mode,locale});await page.addScriptTag({content:nativeSource});await page.addStyleTag({content:css+'\nhtml,body{margin:0;background:'+(mode==='dark'?'#1f1f1f':'#fff')+';font-family:system-ui}#app{height:700px;max-width:760px;margin:20px auto}.Md3f7G_scroll{height:100%}'});await page.addScriptTag({content:bundle});await page.clock.runFor(20);await expect.poll(()=>page.locator('.Md3f7G_executionGroup').count()).toBe(2).catch(async error=>{await writeFile(evidence+'/fixture-diagnostic-'+mode+'.json',JSON.stringify({errors,...await page.evaluate(()=>({body:document.body.innerHTML.slice(-12000),flow:window.responseFixture?.snapshot?.().chat.order}))},null,2));throw error});expect(errors).toEqual([]);return{page,errors}
}
const times=page=>page.locator('.Md3f7G_executionMeta').allTextContents()
it('keeps one turn total timer through phase updates, completion and a later turn',async()=>{
 const{page,errors}=await fixture();try{
  expect(await times(page)).toEqual(['· 用时 20秒'])
  const clock=page.locator('.Md3f7G_executionMeta').first();await page.clock.runFor(3100);expect(await clock.textContent()).toBe('· 用时 23秒')
  await page.evaluate(()=>window.responseFixture.step());await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 25秒'])
  await page.evaluate(()=>window.responseFixture.finish());await page.clock.runFor(10);const stopped=await times(page);await page.clock.runFor(4200);expect(await times(page)).toEqual(stopped)
  await page.evaluate(()=>window.responseFixture.next());await page.clock.runFor(10);expect(await times(page)).toEqual([stopped[0],'· 用时 5秒']);await page.clock.runFor(2000);expect(await times(page)).toEqual([stopped[0],'· 用时 7秒']);expect(errors).toEqual([])
 }finally{await page.close()}
})
it.each([{mode:'light',locale:'zh',reduce:'no-preference'},{mode:'dark',locale:'en',reduce:'reduce'}])('reveals existing details by pointer and keyboard without idle chevrons in $mode',async({mode,locale,reduce})=>{
 const{page,errors}=await fixture(mode,locale,reduce);try{
  const group=page.locator('.Md3f7G_executionGroup').first(),button=group.locator(':scope > button'),arrow=button.locator('.Md3f7G_executionChevron')
  await page.mouse.move(970,790);if(reduce==='reduce')expect(await arrow.evaluate(node=>getComputedStyle(node).transitionDuration)).toBe('0s');expect(await arrow.evaluate(node=>getComputedStyle(node).opacity)).toBe('0');const before=await button.boundingBox()
  await button.hover();await expect.poll(()=>arrow.evaluate(node=>getComputedStyle(node).opacity)).toBe('1');expect(await button.boundingBox()).toEqual(before)
  await button.click();await expect.poll(()=>button.getAttribute('aria-expanded')).toBe('true');expect(await group.locator('[data-response-original-detail]').count()).toBeGreaterThan(0)
  await button.focus();await page.mouse.move(970,790);await expect.poll(()=>arrow.evaluate(node=>getComputedStyle(node).opacity)).toBe('1');await page.keyboard.press('Enter');expect(await button.getAttribute('aria-expanded')).toBe('false');await page.keyboard.press('Space');expect(await button.getAttribute('aria-expanded')).toBe('true')
  await page.screenshot({path:evidence+'/'+mode+'-'+locale+'.png'});await page.locator('#outside').focus();await expect.poll(()=>arrow.evaluate(node=>getComputedStyle(node).opacity)).toBe('0');expect(errors).toEqual([])
 }finally{await page.close()}
})

it('keeps one continuous clock in the actual shared native multi-phase request',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.shared());await page.clock.runFor(10);expect(errors).toEqual([]);await expect.poll(()=>page.locator('[data-shared-native-task]').count()).toBe(1);expect(await times(page)).toEqual(['· 用时 20秒']);await page.clock.runFor(2200);expect(await times(page)).toEqual(['· 用时 22秒']);await page.evaluate(()=>window.responseFixture.finish());await page.clock.runFor(10);const stopped=await times(page);await page.clock.runFor(2000);expect(await times(page)).toEqual(stopped);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('retains independent native Notes and canvas task clocks and their original details',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.standalone());await page.clock.runFor(10);await expect.poll(()=>page.locator('[data-chat-anchor-key="note:1"]').count()).toBe(1);expect(await times(page)).toEqual(['· 用时 20秒','· 用时 20秒']);await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 22秒','· 用时 22秒']);await page.locator('[data-chat-anchor-key="note:1"] > button').click();await expect.poll(()=>page.locator('[data-chat-anchor-key="note:1"]').textContent()).toContain('笔记任务原始详情');expect(errors).toEqual([])
 }finally{await page.close()}
})

it('continues the actual pending clock when the first durable turn start arrives later',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.pending());await page.clock.runFor(10);await expect.poll(()=>page.locator('.Md3f7G_executionGroup').count()).toBe(1);expect(await times(page)).toEqual(['· 用时 0秒']);await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 2秒'])
  await page.evaluate(()=>window.responseFixture.admit());await page.clock.runFor(10);expect(await times(page)).toEqual(['· 用时 2秒']);await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 4秒']);await page.evaluate(()=>window.responseFixture.finish());await page.clock.runFor(10);const stopped=await times(page);await page.clock.runFor(3000);expect(await times(page)).toEqual(stopped);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('drops a failed pre-turn clock lease before a later retry starts',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.pending());await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 2秒']);await page.evaluate(()=>window.responseFixture.failPending());await page.clock.runFor(20);await page.clock.runFor(3000)
  await page.evaluate(()=>window.responseFixture.pending());await page.clock.runFor(20);expect(await times(page)).toEqual(['· 用时 0秒']);await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 2秒']);await page.evaluate(()=>window.responseFixture.admit());await page.clock.runFor(20);expect(await times(page)).toEqual(['· 用时 2秒']);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('resets a preparation clock when the same mounted view changes session or native owner',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.pending());await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 2秒']);await page.evaluate(()=>window.responseFixture.switchSession());await page.clock.runFor(20);expect(await times(page)).toEqual(['· 用时 0秒']);await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 2秒'])
  await page.evaluate(()=>window.responseFixture.switchOwner());await page.clock.runFor(20);expect(await times(page)).toEqual(['· 用时 0秒']);await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 2秒']);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('carries only the pending preparation into a newly completed turn delivered in one batch',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.pending(true));await page.clock.runFor(2100);expect(await times(page)).toEqual(['· 用时 2秒']);await page.evaluate(()=>window.responseFixture.completeAdmit());await page.clock.runFor(20);expect(await times(page)).toEqual(['· 用时 2秒']);await page.clock.runFor(3000);expect(await times(page)).toEqual(['· 用时 2秒']);expect(errors).toEqual([])
 }finally{await page.close()}
})
