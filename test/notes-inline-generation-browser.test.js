import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.requests=[];window.views=[];window.tasks=[];window.composer=[];window.jobs={};document.addEventListener('sherlock:notes-component-view',e=>window.views.push(e.detail));document.addEventListener('sherlock:notes-task-state',e=>window.tasks.push(e.detail));document.addEventListener('sherlock:notes-composer-state',e=>window.composer.push(e.detail));
 const bridge={request:async(method,input)=>{window.requests.push({method,input});if(method==='load')return {saved:{title:'卡片与会话隔离',blocks:[{id:'anchor',type:'paragraph'}],yjs:'',revision:0}};if(method==='generate')return new Promise((resolve,reject)=>window.jobs[input.requestId]={input,resolve,reject});if(method==='library-list')return [];if(method==='save')return {status:'saved',saved:{...input.content,revision:input.revision+1}};return {}},draft:async()=>{}};
 createRoot(document.querySelector('#notes')).render(<NotesApp sessionId="inline-generation" bridge={bridge} dark={false} navigate={()=>{}}/>);
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
it('keeps local prompts and card stops separate from a concurrent ordinary conversation',async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(3000);page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('http://127.0.0.1/inline-generation',route=>route.fulfill({contentType:'text/html',body:'<section id="notes" class="en-root" style="position:fixed;inset:0"></section>'}));await page.goto('http://127.0.0.1/inline-generation');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
  await page.evaluate(()=>{window.editor.replaceBlocks(window.editor.document,[{id:'anchor',type:'paragraph'}]);window.editor.insertBlocks(['one','two'].map(id=>({id,type:'research',props:{payload:JSON.stringify({id:'note-component-'+id,noteDraft:'smart',containerPrompt:'卡片需求 '+id,generationStatus:'draft'})}})),'anchor','after')})
  for(const id of ['one','two'])await page.locator('[data-id="'+id+'"] button').filter({hasText:'创建'}).click()
  await expect.poll(()=>page.evaluate(()=>Object.values(window.jobs).filter(job=>job.input.entryPoint==='component').length)).toBe(2)
  expect(await page.evaluate(()=>window.tasks)).toEqual([]);expect(await page.locator('.en-ai-loading').count()).toBe(0);expect(await page.evaluate(()=>window.composer.some(state=>state.running))).toBe(false)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'inline-generation',prompt:'右侧独立问题',images:[],submissionId:1}})))
  await expect.poll(()=>page.evaluate(()=>Object.values(window.jobs).filter(job=>!job.input.entryPoint).length)).toBe(1)
  expect(await page.evaluate(()=>window.tasks.filter(task=>task.prompt).map(task=>task.prompt))).toEqual(['右侧独立问题'])
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-stop',{detail:{sessionId:'inline-generation'}})))
  expect(await page.locator('.en-note-generation').count()).toBe(2)
  await page.evaluate(()=>{const view=window.views.filter(value=>value.mode==='generation'&&value.node.id==='note-component-one').at(-1);document.dispatchEvent(new CustomEvent('sherlock:notes-component-action',{detail:{instanceId:view.instanceId,sessionId:'inline-generation',requestId:'card-stop',nodeId:view.node.id,taskId:view.node.generationTaskId,action:'generation-stop'}}))})
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.editor.getBlock('one').props.payload).generationStatus)).toBe('interrupted')
  expect(await page.locator('[data-id="two"] .en-note-generation').count()).toBe(1)
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'inline-generation',prompt:'右侧第二个问题',images:[],submissionId:2}})))
  await expect.poll(()=>page.evaluate(()=>Object.values(window.jobs).some(job=>job.input.prompt==='右侧第二个问题'))).toBe(true)
  await page.evaluate(()=>Object.values(window.jobs).find(job=>job.input.prompt==='右侧第二个问题').resolve({kind:'conversation',markdown:'右侧独立回答。'}))
  await expect.poll(()=>page.evaluate(()=>window.tasks.find(task=>task.phase==='replied')?.result?.markdown)).toBe('右侧独立回答。')
  expect(await page.locator('[data-id="two"] .en-note-generation').count()).toBe(1)
  await page.evaluate(()=>Object.values(window.jobs).find(job=>job.input.prompt==='卡片需求 two').resolve({kind:'conversation',markdown:'请补充当前卡片的数据。'}))
  await expect.poll(()=>page.locator('[data-id="two"] .en-creation-feedback').textContent()).toBe('请补充当前卡片的数据。')
  const stopped=await page.evaluate(()=>window.requests.filter(call=>call.method==='stop').map(call=>window.jobs[call.input.requestId].input.prompt));expect(stopped).toEqual(['右侧独立问题','卡片需求 one']);expect(await page.evaluate(()=>window.tasks.some(task=>task.prompt?.includes('卡片需求')||task.result?.markdown?.includes('当前卡片')))).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
