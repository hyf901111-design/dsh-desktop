import {readFile,mkdir,readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {beforeAll,afterAll,it,expect} from 'vitest'
import {patchConversationLiveActivity,stripConversationLiveActivity} from '../scripts/lib/conversation-live-activity.mjs'
import {patchFigmaReadingConversation} from '../scripts/lib/figma-reading-client.mjs'
let browser,source,bundle,css
const evidence=process.env.SHERLOCK_LIVE_ACTIVITY_EVIDENCE||'/tmp/conversation-live-activity-20261104',require=createRequire(import.meta.url)
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
 await expect.poll(()=>page.locator('[data-conversation-live-activity]').count()).toBe(1);expect(errors).toEqual([]);return{page,errors}
}
it.each([{locale:'zh',width:980},{locale:'en',width:380}])('shows actual current work below the last reply, then removes it at completion in $locale',async({locale,width})=>{
 const{page,errors}=await fixture(locale,width);try{
  const line=page.locator('[data-conversation-live-activity]')
  for(const [phase,kind]of [['read','tool'],['thinking','thinking'],['reply','reply'],['compact','compaction'],['retry','retry'],['waiting','waiting']]){
   await page.evaluate(phase=>window.responseFixture.activity(phase),phase);await expect.poll(()=>line.getAttribute('data-conversation-live-activity')).toBe(kind)
   expect(await line.getAttribute('role')).toBe('status');expect(await line.innerText()).not.toContain('private');expect(await line.evaluate(node=>node===node.parentElement.lastElementChild)).toBe(true)
  }
  await page.evaluate(()=>window.responseFixture.activity('read',true));await expect.poll(()=>line.innerText()).toMatch(locale==='en'?/Reading/:/读取/)
  await page.screenshot({path:evidence+'/'+locale+'-'+width+'.png'})
  await page.evaluate(()=>window.responseFixture.activity('done'));await expect.poll(()=>line.count()).toBe(0);expect(errors).toEqual([])
 }finally{await page.close()}
})
it('keeps the same activity row in the shared right-panel native task and hides it when settled',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>{window.responseFixture.activity('read');window.responseFixture.shared()});await expect.poll(()=>page.locator('[data-shared-native-task] [data-conversation-live-activity]').count()).toBe(1)
  await page.evaluate(()=>window.responseFixture.activity('done'));await expect.poll(()=>page.locator('[data-conversation-live-activity]').count()).toBe(0);expect(errors).toEqual([])
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
