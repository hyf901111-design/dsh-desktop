import {readFile,mkdir,readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {beforeAll,afterAll,it,expect} from 'vitest'
import {patchFigmaReadingConversation} from '../scripts/lib/figma-reading-client.mjs'
let browser,source,bundle,css
const liveSelector='[data-response-progress][data-state=running], [data-conversation-live-activity]'
const evidence=process.env.SHERLOCK_LIVE_ACTIVITY_EVIDENCE||'/tmp/conversation-live-activity-20261104',require=createRequire(import.meta.url)
const {patchConversationLiveActivity,stripConversationLiveActivity}=require('../scripts/lib/conversation-live-activity.mjs')
beforeAll(async()=>{
 let native=stripConversationLiveActivity(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 native=patchConversationLiveActivity(patchFigmaReadingConversation(native))
 source=native.replace(/^\s*exports\.\w+ = [^;\n]+;$/gm,'').replace('\n\t\treturn module.exports;','\n\t\texports.__responseChat=ChatView;exports.__responseAssistant=AssistantNodeView;exports.__responseExecution=ExecutionStatusGroup;exports.__responseUseProgress=useConversationResponseProgress;exports.__responseShared=SharedResearchRequest;exports.__responseDictionaries={zh,en};exports.__responseBind=()=>{sherlockBoardsPage.PersonalResearchHistory=()=>null;sherlockBoardsAdapter=null};exports.__watchSubmissions=deps=>NativeConversationSubmissions.watch(deps);return module.exports;')
 bundle=(await build({entryPoints:['test/fixtures/conversation-response-progress-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.svg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}})).outputFiles[0].text
 const assets='node_modules/@deepseek-ai/dsh-web-frontend/dist/assets',names=(await readdir(assets)).filter(name=>/^index-.*\.css$/.test(name));css=(await Promise.all(names.map(name=>readFile(assets+'/'+name,'utf8')))).join('\n')+'\n'+await readFile('src/preload/figma-reading.css','utf8')
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href);browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
})
afterAll(async()=>browser?.close())
async function fixture(locale='zh',width=980){
 const page=await browser.newPage({viewport:{width,height:720},reducedMotion:'reduce'}),errors=[];page.on('pageerror',error=>errors.push(error.stack||error.message))
 await page.setContent('<html lang="'+locale+'"><div class="sRp_root"><div class="sRp_messages" data-conversation-scroll><div id="app"></div></div><div data-odyssey-reading-status></div></div></html>')
 await page.evaluate(locale=>{window.responseLocale=locale;document.documentElement.dataset.odysseyLocale=locale;if(locale==='en')document.body.dataset.dsDarkTheme='';window.__ModuleLoader__={load:descriptor=>window.responseDescriptor=descriptor}},locale)
 await page.addScriptTag({content:source});await page.addStyleTag({content:css+'\nbody{margin:0;font-family:system-ui;background:'+(locale==='en'?'#1f1f1f':'#fafafa')+'}.sRp_root{position:relative;width:100%;height:700px}.sRp_messages{height:600px;overflow:auto;display:block}#app{max-width:760px;margin:auto}.Md3f7G_scroll{overflow:visible}.Md3f7G_column{min-height:0}[data-odyssey-reading-status]{position:absolute;bottom:10px;left:45%}'});await page.addScriptTag({content:bundle})
 await expect.poll(()=>page.locator(liveSelector).count()).toBe(1);expect(errors).toEqual([]);return{page,errors}
}
it.each([{locale:'zh',width:980},{locale:'en',width:380}])('shows actual current work below the last reply, then removes it at completion in $locale',async({locale,width})=>{
 const{page,errors}=await fixture(locale,width);try{
  const line=page.locator(liveSelector)
  for(const [phase,kind]of [['read','tool'],['thinking','thinking'],['reply','reply'],['compact','compaction'],['retry','retry'],['waiting','waiting']]){
   await page.evaluate(phase=>window.responseFixture.activity(phase),phase);await expect.poll(()=>line.evaluate(node=>node.getAttribute('data-activity-kind')??node.getAttribute('data-conversation-live-activity'))).toBe(kind)
   expect(await line.locator('[role=status]').count()).toBe(1);expect(await line.innerText()).not.toContain('private');expect(await page.locator('[data-live-activity-glyph]').count()).toBe(0)
   if(kind==='waiting')expect(await line.locator('.Md3f7G_executionText').evaluate(node=>getComputedStyle(node).animationName)).toBe('none')
  }
  await page.evaluate(()=>window.responseFixture.activity('read',true));await expect.poll(()=>line.innerText()).toMatch(locale==='en'?/Reading/:/读取/)
  await page.screenshot({path:evidence+'/'+locale+'-'+width+'.png'})
  await page.evaluate(()=>window.responseFixture.activity('done'));await expect.poll(()=>line.count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('keeps the same activity row in the shared right-panel native task and hides it when settled',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>{window.responseFixture.activity('read');window.responseFixture.shared()});await expect.poll(()=>page.locator('[data-shared-native-task] [data-response-progress][data-state=running]').count()).toBe(1)
  await page.evaluate(()=>window.responseFixture.activity('done'));await expect.poll(()=>page.locator(liveSelector).count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('shows Workbench updates in the native conversation with no reasoning visible',async()=>{
 const{page,errors}=await fixture();try{
  const update=page.locator('[data-workbench-conversation-progress]'),reading=page.locator(liveSelector)
  await page.evaluate(()=>window.responseFixture.workbenchPhase('initial'))
  await expect.poll(()=>reading.count()).toBe(1)
  expect(await update.count()).toBe(0)
  expect(await page.locator('body').innerText()).not.toContain('已收到创建工作台的请求')
  await page.evaluate(()=>window.responseFixture.workbenchPhase('reading'))
  await expect.poll(()=>update.innerText()).toContain('正在查找和核对')
  await page.evaluate(()=>window.responseFixture.workbenchPhase('sources'))
  await expect.poll(()=>update.innerText()).toContain('已读取部分来源资料')
  await reading.getByRole('button').first().click()
  const failures=reading.locator('[data-activity-read-failures]')
  await expect.poll(()=>failures.locator(':scope > summary').textContent()).toContain('2 次网页读取未成功')
  await failures.locator(':scope > summary').click()
  await expect.poll(()=>failures.locator('[data-activity-record] > summary').allTextContents()).toEqual([
   '网页读取失败，浏览器未取得可读内容','网页读取失败，浏览器未取得可读内容'
  ])
  await failures.locator('[data-activity-record] > summary').last().click()
  expect(await failures.locator('[data-response-original-detail="workbench-failure2"]').isVisible()).toBe(true)
  expect(await page.locator('body').innerText()).not.toContain('private workbench reasoning')
  await page.evaluate(()=>window.responseFixture.workbenchPhase('submitted'))
  await expect.poll(()=>update.innerText()).toContain('已受理，共 2 个组件')
  await page.screenshot({path:evidence+'/workbench-conversation-progress.png'})
  await page.evaluate(()=>window.responseFixture.workbenchPhase('done'))
  await expect.poll(()=>reading.count()).toBe(0)
  expect(await update.innerText()).toContain('已受理，共 2 个组件')
  await page.evaluate(()=>window.responseFixture.workbenchPhase('final'))
  await expect.poll(()=>update.count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await page.close()}
})
it('shows the pending status between native admission and the first token',async()=>{
 const{page,errors}=await fixture();try{
  const update=page.locator('[data-workbench-conversation-progress]')
  await page.evaluate(()=>window.responseFixture.workbenchSubmit('queued'))
  await expect.poll(()=>update.count()).toBe(0)
  await page.evaluate(()=>window.responseFixture.workbenchSubmit('request'))
  await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(1)
  expect(await update.count()).toBe(0)
  await page.evaluate(()=>window.responseFixture.workbenchSubmit('accepted'))
  await expect.poll(()=>page.locator('[data-conversation-live-activity=pending][role=status]').textContent()).toContain('等待模型响应')
  expect(await update.count()).toBe(0)
  await page.evaluate(()=>window.responseFixture.workbenchPhase('initial'))
  await expect.poll(()=>page.locator('[data-native-submitted-user]').count()).toBe(0)
  expect(await update.count()).toBe(0)
  expect(await page.locator('[data-conversation-live-activity=pending]').count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await page.close()}
})
it('shows Back to latest only for real content below and hides after content collapse, resize, removal or scrolling down',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.activity('done'))
  await page.evaluate(()=>{
   const column=document.querySelector('[data-chat-flow]'),s=document.querySelector('.sRp_messages');
   // Bottom clearance remains scrollable even when every message is visible.
   column.style.paddingBottom='700px';column.insertAdjacentHTML('beforeend','<article id="reading-test"><div style="height:80px">最后一条消息</div><details id="long-detail"><summary>执行详情</summary><p style="height:900px">可展开的真实执行过程</p></details></article>');s.scrollTop=20;s.dispatchEvent(new Event('scroll'))
  })
  const button=page.getByRole('button',{name:'回到最新',exact:true});await expect.poll(()=>button.count()).toBe(0)
  await page.locator('#long-detail').evaluate(node=>node.open=true);await expect.poll(()=>button.count()).toBe(1)
  await page.locator('.sRp_messages').evaluate(node=>{node.style.height='1600px';node.style.flex='none';node.style.maxHeight='none';node.parentElement.style.height='1800px'});await expect.poll(()=>button.count()).toBe(0)
  await page.locator('.sRp_messages').evaluate(node=>node.style.height='600px');await expect.poll(()=>button.count()).toBe(1)
  await button.click();await expect.poll(()=>button.count()).toBe(0)
  await page.locator('.sRp_messages').evaluate(node=>{node.scrollTop=0;node.dispatchEvent(new Event('scroll'))});await expect.poll(()=>button.count()).toBe(1)
  await page.locator('#long-detail').evaluate(node=>node.open=false);await expect.poll(()=>button.count()).toBe(0)
  await page.locator('#long-detail').evaluate(node=>node.open=true);await expect.poll(()=>button.count()).toBe(1)
  await page.locator('#reading-test').evaluate(node=>node.remove());await expect.poll(()=>button.count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})

it('shows an actual brief reply above one animated status, with chronological details on hover or keyboard focus',async()=>{
 const {page,errors}=await fixture();try{
  await page.evaluate(()=>{document.body.dataset.dsDarkTheme='';document.body.style.background='#1f1f1f'})
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.evaluate(()=>window.responseFixture.statusSequence('initial'))
  const active=page.locator(liveSelector),trigger=active.locator('button').first(),label=active.locator('.Md3f7G_executionText')
  await expect.poll(()=>active.count()).toBe(1)
  expect(await trigger.isDisabled()).toBe(true)
  expect(await label.evaluate(node=>getComputedStyle(node).animationName)).toBe('ework-status-shimmer')
  expect(await page.locator('[data-chat-flow-kind=assistant-step]').count()).toBe(0)
  for (const mode of ['conversation','research','notes','spreadsheet','presentation','image','knowledge','browser','trajectory']) {
   await page.evaluate(mode=>window.responseFixture.statusSequence('partial',mode),mode)
   await expect.poll(()=>page.locator('[data-chat-flow-kind=assistant-step]').getByText('我先',{exact:true}).count()).toBe(1)
   expect(await page.locator('body').innerText()).not.toMatch(/private hidden|private mixed reasoning/)
  }
  await page.screenshot({path:evidence+'/real-model-first-delta.png'})
  await page.evaluate(()=>window.responseFixture.statusSequence('ack'))
  await expect.poll(()=>page.locator('[data-chat-flow-kind=assistant-step]').filter({hasText:'我先核对资料来源'}).count()).toBe(1)
  const reply=page.locator('[data-chat-flow-kind=assistant-step]').filter({hasText:'我先核对资料来源'})
  expect(await reply.textContent()).not.toContain('private mixed reasoning')
  expect((await reply.boundingBox()).y).toBeLessThan((await active.boundingBox()).y)
  await page.evaluate(()=>window.responseFixture.statusSequence('tools'))
  await expect.poll(()=>trigger.isDisabled()).toBe(false)
  const arrow=trigger.locator('.Md3f7G_executionLeading')
  await page.mouse.move(1,1)
  await expect.poll(()=>arrow.evaluate(node=>getComputedStyle(node).opacity)).toBe('0')
  await trigger.hover();await expect.poll(()=>arrow.evaluate(node=>getComputedStyle(node).opacity)).toBe('1')
  const a=await arrow.boundingBox(),l=await label.boundingBox();expect(a.x-l.x-l.width).toBeLessThan(12)
  await trigger.focus();await page.mouse.move(1,1);await expect.poll(()=>arrow.evaluate(node=>getComputedStyle(node).opacity)).toBe('1')
  await page.screenshot({path:evidence+'/status-hover.png'})
  await page.keyboard.press('Enter');await expect.poll(()=>trigger.getAttribute('aria-expanded')).toBe('true')
  await expect.poll(()=>trigger.locator('.Md3f7G_executionChevron').evaluate(node=>getComputedStyle(node).transform)).toBe('matrix(0, 1, -1, 0, 0, 0)')
  expect(await active.locator('[data-activity-record]').evaluateAll(nodes=>nodes.map(node=>node.dataset.activityRecord))).toEqual(['status-search','status-read'])
  expect(await active.locator('[data-activity-record]').first().innerText()).toContain('已')
  expect(await page.locator('body').innerText()).not.toContain('private hidden')
  expect(await page.locator('.Md3f7G_executionProgress').count()).toBe(0)
  await page.screenshot({path:evidence+'/status-expanded-list.png'})
  await active.locator('[data-activity-record] summary').first().click()
  expect(await active.locator('[data-response-original-detail="status-search"]').isVisible()).toBe(true)
  await page.screenshot({path:evidence+'/status-expanded.png'})
  await page.emulateMedia({reducedMotion:'reduce'});expect(await label.evaluate(node=>getComputedStyle(node).animationName)).toBe('none')
  await page.evaluate(()=>window.responseFixture.statusSequence('done'));await expect.poll(()=>active.count()).toBe(0)
  expect(await reply.count()).toBe(1)
  const history=page.locator('[data-response-progress]').filter({has:page.locator('button:not(:disabled)')}).last()
  await history.locator('button').first().click();expect(await history.locator('[data-activity-record]').count()).toBe(2)
  expect(errors).toEqual([])
 }finally{await page.close()}
})


it.each(['zh','en'])('keeps the elapsed header label visible before a public reply and after a simple answer in %s',async(locale)=>{
 const {page,errors}=await fixture(locale);try{
  await page.evaluate(()=>window.responseFixture.statusSequence('ack'))
  const total=page.locator('[data-response-progress=total]').first(),label=total.locator('.Md3f7G_executionText'),trigger=total.locator('button').first()
  await expect.poll(()=>total.locator('[data-response-total-time]').count()).toBe(1)
  expect(await trigger.isDisabled()).toBe(true)
  expect(await label.isVisible()).toBe(true)
  expect((await trigger.innerText()).trim()).not.toMatch(/^[·•]/u)
  await page.screenshot({path:evidence+'/elapsed-ack-'+locale+'.png'})
  await page.evaluate(()=>window.responseFixture.simpleAnswer())
  await expect.poll(()=>page.locator(liveSelector).count()).toBe(0)
  expect(await label.isVisible()).toBe(true)
  expect((await trigger.innerText()).trim()).not.toMatch(/^[·•]/u)
  expect(await label.evaluate(node=>getComputedStyle(node).animationName)).toBe('none')
  await page.screenshot({path:evidence+'/elapsed-completed-'+locale+'.png'})
  expect(errors).toEqual([])
 }finally{await page.close()}
})
