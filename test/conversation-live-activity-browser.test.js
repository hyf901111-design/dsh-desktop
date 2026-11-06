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
 source=native.replace(/^\s*exports\.\w+ = [^;\n]+;$/gm,'').replace('\n\t\treturn module.exports;','\n\t\texports.__responseChat=ChatView;exports.__responseAssistant=AssistantNodeView;exports.__responseExecution=ExecutionStatusGroup;exports.__responseUseProgress=useConversationResponseProgress;exports.__responseShared=SharedResearchRequest;exports.__responseDictionaries={zh,en};exports.__responseBind=()=>{sherlockBoardsPage.PersonalResearchHistory=()=>null;sherlockBoardsAdapter=null};return module.exports;')
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
