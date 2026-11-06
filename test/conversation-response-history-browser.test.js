import {readFile,mkdir,readdir} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {beforeAll,afterAll,it,expect} from 'vitest'
import {patchFigmaReadingConversation} from '../scripts/lib/figma-reading-client.mjs'
let browser,source,bundle,css
const liveSelector='[data-response-progress][data-state=running], [data-conversation-live-activity]'
const evidence=process.env.SHERLOCK_LIVE_ACTIVITY_EVIDENCE||'/tmp/conversation-response-history-20261106',require=createRequire(import.meta.url)
const {patchConversationLiveActivity,stripConversationLiveActivity}=require('../scripts/lib/conversation-live-activity.mjs')
beforeAll(async()=>{
 let native=stripConversationLiveActivity(await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8'))
 native=require('../scripts/lib/conversation-response-history.mjs').patchConversationResponseHistory(patchConversationLiveActivity(patchFigmaReadingConversation(native)))
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

it.each(['zh','en'])('folds chronological progress and tools under a compact elapsed header in %s',async(locale)=>{
 const{page,errors}=await fixture(locale,980);try{
  await page.evaluate(()=>window.responseFixture.historyReports(false))
  const header=page.locator('[data-response-progress=total]').first(),button=header.locator('button').first()
  await expect.poll(()=>header.count()).toBe(1)
  expect(await button.innerText()).toMatch(locale==='en'?/20s/:/20秒/)
  expect(await button.innerText()).not.toMatch(/^[·•]/u)
  expect(await button.isDisabled()).toBe(false)
  expect(await page.getByText('第一条实际进度回报', {exact:true}).isVisible()).toBe(false)
  expect(await page.getByText('最终答复保留在正文', {exact:true}).isVisible()).toBe(true)
  const style=await button.evaluate(node=>({font:getComputedStyle(node).fontSize,line:getComputedStyle(node).lineHeight,gap:getComputedStyle(node).gap,arrow:getComputedStyle(node.querySelector('.Md3f7G_executionLeading')).opacity,border:getComputedStyle(node).borderBottomWidth}))
  expect(style).toEqual({font:'13px',line:'20px',gap:'4px',arrow:'1',border:'1px'})
  await page.screenshot({path:evidence+'/folded-'+locale+'.png'})
  await button.focus();await page.keyboard.press('Enter')
  expect(await button.getAttribute('aria-expanded')).toBe('true')
  const keys=await header.locator('[data-response-history-report],[data-activity-record]').evaluateAll(nodes=>nodes.map(node=>node.dataset.responseHistoryReport||node.dataset.activityRecord))
  expect(keys).toEqual(['report-1','history-search','report-2','history-read'])
  expect(await header.innerText()).not.toContain('private')
  await header.locator('[data-activity-record] summary').first().click()
  expect(await header.locator('[data-response-original-detail=history-search]').isVisible()).toBe(true)
  expect(await page.getByText('最终答复保留在正文', {exact:true}).count()).toBe(1)
  await page.screenshot({path:evidence+'/expanded-'+locale+'.png'})
  await button.click();expect(await page.getByText('第一条实际进度回报', {exact:true}).isVisible()).toBe(false)
  await page.evaluate(()=>window.responseFixture.historyReports(true))
  expect(await page.getByText('第二条实际进度回报', {exact:true}).isVisible()).toBe(true)
  expect(await page.locator(liveSelector).count()).toBe(1)
  expect(errors).toEqual([])
 }finally{await page.close()}
})
it('does not offer disclosure for a simple answer without public progress or actions',async()=>{
 const{page}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.simpleAnswer())
  const button=page.locator('[data-response-progress=total]').first().locator('button').first()
  expect(await button.isDisabled()).toBe(true)
  expect(await button.locator('.Md3f7G_executionLeading').isVisible()).toBe(false)
  expect(await button.innerText()).toContain('用时')
 }finally{await page.close()}
})
it('keeps the total header above an initial reply and live tools, with no elapsed bullet',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.responseFixture.statusSequence('initial'))
  expect(await page.locator('[data-response-progress=total] button').first().innerText()).not.toMatch(/[·•]/u)
  await page.evaluate(()=>window.responseFixture.firstReplyWithTools())
  const header=page.locator('[data-response-progress=total]').first(),reply=page.getByText('我先查京津冀三地的数据。',{exact:true}),live=page.locator(liveSelector)
  expect(await header.innerText()).toMatch(/用时.*20秒/)
  expect(await live.count()).toBe(1)
  const boxes=await Promise.all([header,reply,live].map(node=>node.boundingBox()))
  expect(boxes[0].y+boxes[0].height).toBeLessThanOrEqual(boxes[1].y)
  expect(boxes[1].y+boxes[1].height).toBeLessThanOrEqual(boxes[2].y)
  expect(await page.locator('[data-response-total-time]').count()).toBe(0)
  await page.screenshot({path:evidence+'/running-header-first.png'});expect(errors).toEqual([])
 }finally{await page.close()}
})
