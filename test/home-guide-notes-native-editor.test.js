import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from'react';import{createRoot}from'react-dom/client';import{NotesApp}from'./src/preload/notes/editor';
 import'@blocknote/mantine/style.css';import'./src/preload/notes/style.css';import'./src/preload/notes/challenge.css';
 document.documentElement.dataset.homeGuidePointerRun='native-note-run';window.events=[];window.requests=[];window.results=[];
 for(const name of ['notes-composer-state','notes-composer-draft','notes-submit-accepted','notes-task-state','notes-reference-state'])document.addEventListener('sherlock:'+name,event=>window.events.push({name,detail:event.detail}));
 const bridge={request:async(method,input)=>{window.requests.push({method,input});if(method==='load')return{saved:{title:'',blocks:[],yjs:'',revision:0,updatedAt:0}};if(method==='save')return{status:'saved',saved:{...input.content,revision:input.revision+1}};if(method==='generate')return new Promise(resolve=>window.results.push({resolve,input}));return{}},draft:async()=>{}};
 window.noteRoot=createRoot(document.querySelector('#note'));window.noteRoot.render(<NotesApp sessionId='native-note-session' bridge={bridge} dark={false} navigate={()=>{}} guide={{native:{runId:'native-note-run'},ready:api=>window.noteApi=api,dispose:()=>window.noteApi=undefined}}/>);
 window.submitNative=(prompt='请整理专业研究摘要。',sessionId='native-note-session')=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId,prompt,images:[],submissionId:window.requests.length,admission:{draft:prompt,draftRev:1,imageIds:[]}}}));
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',logLevel:'silent',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'}})
 script=built.outputFiles.find(file=>file.path.endsWith('.js')).text;css=built.outputFiles.find(file=>file.path.endsWith('.css'))?.text||''
 const playwright=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await(playwright.chromium??playwright.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
async function fixture(){
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',error=>errors.push(error.message))
 await page.route('http://127.0.0.1/note-native-guide',route=>route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body data-workspace-surface="notes"><section class="en-root" style="left:0;right:340px;top:0;bottom:0"><div id="note" class="en-editor-host"></div></section>'}))
 await page.goto('http://127.0.0.1/note-native-guide');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.waitForFunction(()=>window.noteApi)
 await page.evaluate(()=>window.noteApi.setDocument('研究笔记',[{id:'intro',type:'paragraph',content:'原文摘要必须保留。'},{id:'logic',type:'paragraph',content:'订单增长不能保证利润翻倍，仍需验证产品价格和回款。'}]))
 return{context,page,errors}
}
it('admits its native composer only for its explicit run and appends the actual generated preview',async()=>{
 const{context,page,errors}=await fixture();try{
  await expect.poll(()=>page.evaluate(()=>window.events.some(event=>event.name==='notes-composer-state'&&event.detail.ready))).toBe(true)
  await page.evaluate(()=>{window.noteApi.prepareNative();window.submitNative('其他会话','another-session');window.submitNative()})
  await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  expect(await page.evaluate(()=>window.results[0].input)).toMatchObject({sessionId:'native-note-session',selection:'',context:{scope:'note',components:[]}})
  expect(await page.evaluate(()=>window.results[0].input.markdown)).toContain('原文摘要必须保留')
  await page.evaluate(()=>window.results[0].resolve({kind:'text',markdown:'### 专业研究摘要\n\n跟踪订单转化、毛利率与经营现金流，逐季核验盈利兑现。'}))
  await page.getByRole('button',{name:'添加至正文',exact:true}).click();await page.evaluate(()=>window.noteApi.flush())
  const saved=await page.evaluate(()=>window.requests.findLast(row=>row.method==='save').input.content)
  expect(JSON.stringify(saved.blocks)).toContain('原文摘要必须保留');expect(JSON.stringify(saved.blocks)).toContain('跟踪订单转化');expect(saved.yjs.length).toBeGreaterThan(100)
  expect(await page.evaluate(()=>window.events.filter(event=>event.name==='notes-task-state').map(event=>event.detail.phase))).toEqual(['preparing','generating','ready','accepted']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('uses the real paragraph selection and AI rewrite control before replacing only that paragraph',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>window.noteApi.selectParagraph('logic','订单增长不能保证利润翻倍，仍需验证产品价格和回款。'))
  // The tutorial's visual pointer acknowledges a target, then its actor calls
  // that native button once; it never synthesizes an OS pointer drag.
  await page.getByRole('button',{name:'AI 改写',exact:true}).evaluate(button=>{button.click();button.focus({preventScroll:true})})
  expect(await page.evaluate(()=>window.events.findLast(event=>event.name==='notes-composer-draft').detail.text)).toContain('改写选中文字')
  await page.evaluate(()=>window.submitNative('改写选中文字，保留原意并让表达更清晰。'))
  await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  expect(await page.evaluate(()=>window.results[0].input)).toMatchObject({selection:'订单增长不能保证利润翻倍，仍需验证产品价格和回款。',markdown:'',context:{scope:'selection',components:[]}})
  await page.evaluate(()=>window.results[0].resolve({kind:'text',markdown:'订单增长为收入扩张提供线索，利润兑现仍取决于价格、毛利率与回款质量。'}))
  await page.getByRole('button',{name:'替换所选',exact:true}).click();await page.evaluate(()=>window.noteApi.flush())
  expect(await page.locator('[data-id="intro"] .bn-inline-content').innerText()).toBe('原文摘要必须保留。')
  expect(await page.locator('[data-id="logic"] .bn-inline-content').innerText()).toBe('订单增长为收入扩张提供线索，利润兑现仍取决于价格、毛利率与回款质量。');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('rejects stale paragraph text and a replaced run without moving or editing its document',async()=>{
 const{context,page,errors}=await fixture();try{
  const before=await page.evaluate(()=>JSON.stringify(window.noteApi.snapshot().blocks))
  expect(await page.evaluate(()=>{try{window.noteApi.selectParagraph('logic','旧版本原文');return'accepted'}catch(error){return error.message}})).toContain('变化')
  await page.evaluate(()=>document.documentElement.dataset.homeGuidePointerRun='newer-run')
  expect(await page.evaluate(()=>{try{window.noteApi.prepareNative();return'accepted'}catch(error){return error.name}})).toBe('AbortError')
  await page.evaluate(()=>window.submitNative());await page.waitForTimeout(100)
  expect(await page.evaluate(()=>window.results.length)).toBe(0);expect(await page.evaluate(()=>JSON.stringify(window.noteApi.snapshot().blocks))).toBe(before);expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
it('keeps newer user edits when an older generated suggestion is applied',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.selectParagraph('logic','订单增长不能保证利润翻倍，仍需验证产品价格和回款。');window.submitNative()})
  await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  await page.evaluate(()=>window.results[0].resolve({kind:'text',markdown:'较早生成的改写。'}));await page.locator('.en-preview').waitFor()
  await page.evaluate(()=>window.noteApi.updateText('logic','用户已经更新这一段。'))
  await page.getByRole('button',{name:'替换所选',exact:true}).click()
  expect(await page.locator('[data-id="logic"] .bn-inline-content').innerText()).toBe('用户已经更新这一段。');expect(await page.getByRole('alert').innerText()).toContain('变化');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('does not surface a late generation after its run has been cancelled',async()=>{
 const{context,page,errors}=await fixture();try{
  await page.evaluate(()=>{window.noteApi.prepareNative();window.submitNative()});await expect.poll(()=>page.evaluate(()=>window.results.length)).toBe(1)
  await page.evaluate(()=>{delete document.documentElement.dataset.homeGuidePointerRun;window.results[0].resolve({kind:'text',markdown:'取消后不应该出现。'})});await page.waitForTimeout(100)
  expect(await page.locator('.en-preview').count()).toBe(0);expect(await page.locator('.bn-editor').innerText()).not.toContain('取消后');expect(errors).toEqual([])
 }finally{await context.close()}
},12000)
