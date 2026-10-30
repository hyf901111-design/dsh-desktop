import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {beforeAll,afterAll,expect,it} from 'vitest'
// Read the production patch without Vite rewriting imported function.toString().
const require=createRequire(import.meta.url),{patchNotesActivity}=require('../scripts/lib/notes-activity.mjs')

const evidence=process.env.SHERLOCK_NOTES_PROGRESS_EVIDENCE||'/tmp/sherlock-notes-concise-progress-20261030'
let browser,source,bundle
beforeAll(async()=>{
 const raw=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const patched=process.env.SHERLOCK_NOTES_PROGRESS_BASELINE==='1'?raw:patchNotesActivity(raw)
 // This focused fixture mounts only Notes and ExecutionStatusGroup. It exposes
 // only those real functions, omitting unrelated exports from outer shell patches
 // that the full installer reapplies after Notes (guide, canvas and home menus).
 source=patched.replace(/^\s*exports\.\w+ = [^;\n]+;$/gm,'').replace('\n\t\treturn module.exports;','\n\t\texports.__notesProgressRow=EWorkNoteConversationRow;exports.__notesProgressRows=useNotesConversationRows;exports.__notesProgressExecution=ExecutionStatusGroup;exports.__notesProgressDictionary=zh;return module.exports;')
 const result=await build({entryPoints:['test/fixtures/notes-concise-progress-browser.tsx'],bundle:true,platform:'browser',format:'iife',write:false,loader:{'.svg':'dataurl','.css':'empty'},define:{'process.env.NODE_ENV':'"development"'}});bundle=result.outputFiles[0].text
 const pw=await import(pathToFileURL('/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(pw.default??pw).chromium.launch({headless:true,executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 await mkdir(evidence,{recursive:true})
})
afterAll(async()=>browser?.close())
async function fixture(){
 const page=await browser.newPage({viewport:{width:900,height:650}}),errors=[]
 page.on('pageerror',error=>errors.push(error.stack||error.message))
 await page.goto('about:blank');await page.setContent('<html><div id="app"></div></html>')
 await page.evaluate(()=>{window.__ModuleLoader__={load:value=>window.notesProgressDescriptor=value}})
 await page.addScriptTag({content:source});await page.addScriptTag({content:bundle})
 await expect.poll(()=>page.locator('[data-chat-anchor-key="canvas:1"]').count()).toBe(1).catch(async error=>{await writeFile(evidence+'/fixture-errors.json',JSON.stringify({errors,body:await page.locator('body').innerHTML()},null,2));throw error})
 expect(errors).toEqual([]);return{page,errors}
}
it('keeps a live Notes stage concise and nonexpandable while canvas disclosure still works',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>{window.notesProgressFixture.send('preparing',{prompt:'创建一个3乘3的表格'});window.notesProgressFixture.send('generating',{stage:'writing',reasoning:'Let me analyze this situation. INTERNAL_PROMPT wireToken notes.components.create'})})
  await writeFile(evidence+'/live-diagnostic.json',JSON.stringify({errors,body:await page.locator('#app').innerHTML()},null,2))
  const progress=page.locator('[data-chat-anchor-key="note:live"][data-chat-flow-kind="execution"]'),trigger=progress.locator(':scope > button')
  await expect.poll(()=>progress.textContent()).toContain('正在撰写内容')
  expect(await trigger.isDisabled()).toBe(true);expect(await trigger.getAttribute('aria-expanded')).toBeNull()
  expect((await page.locator('body').textContent()).includes('INTERNAL_PROMPT')).toBe(false)
  await page.locator('[data-chat-anchor-key="canvas:1"] > button').click()
  await expect.poll(()=>page.locator('[data-chat-anchor-key="canvas:1"]').textContent()).toContain('画布任务公开阶段')
  await page.evaluate(()=>window.notesProgressFixture.send('accepted',{result:{kind:'text',markdown:'已核对原生表格内容。'}}))
  await expect.poll(()=>page.locator('[data-note-task="live"]').textContent()).toContain('已核对原生表格内容。')
  expect((await page.locator('body').textContent()).includes('INTERNAL_PROMPT')).toBe(false)
  await writeFile(evidence+'/live-render.txt',await page.locator('#app').innerText());expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
it('hides historical internal reasoning while retaining the real error and stopped operation receipts',async()=>{
 const{page,errors}=await fixture();try{
  await page.evaluate(()=>window.notesProgressFixture.replay([{requestId:'history',phase:'failed',prompt:'旧任务',startedAt:1,finishedAt:2,reasoning:'HISTORICAL_PRIVATE_PROTOCOL',error:'模型服务响应超时（TIMEOUT；主生成）。'}]))
  await writeFile(evidence+'/history-diagnostic.json',JSON.stringify({errors,body:await page.locator('#app').innerHTML()},null,2))
  const row=page.locator('[data-note-task="history"]'),trigger=row.locator('[data-chat-flow-kind="execution"] > button')
  await expect.poll(()=>row.textContent()).toContain('TIMEOUT');expect(await trigger.isDisabled()).toBe(true)
  expect((await row.textContent()).includes('HISTORICAL_PRIVATE_PROTOCOL')).toBe(false)
  await page.evaluate(()=>{window.notesProgressFixture.send('preparing',{prompt:'保存组件样式'});window.notesProgressFixture.send('generating',{reasoning:'PRIVATE',capabilityProgress:[{requestId:'style',capability:'notes.components.style',status:'succeeded',message:'已保存 1 个组件的样式。',effect:{state:'saved',changedBlockIds:['r']}}]});window.notesProgressFixture.send('stopped')})
  await expect.poll(()=>page.locator('[data-note-task="live"]').textContent()).toContain('已停止')
  expect(await page.locator('[data-note-task="live"] [data-note-client-progress]').count()).toBe(1)
  expect((await page.locator('#app').textContent()).includes('PRIVATE')).toBe(false)
  await writeFile(evidence+'/history-render.txt',await page.locator('#app').innerText());expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
