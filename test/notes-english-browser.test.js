import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.requests=[];window.views=[];window.tasks=[];window.composer=[];window.jobs={};document.addEventListener('sherlock:notes-component-view',e=>window.views.push(e.detail));document.addEventListener('sherlock:notes-task-state',e=>window.tasks.push(e.detail));document.addEventListener('sherlock:notes-composer-state',e=>window.composer.push(e.detail));
 const bridge={request:async(method,input)=>{window.requests.push({method,input});if(method==='load')return {saved:{title:'',blocks:[{id:'anchor',type:'paragraph'}],yjs:'',revision:0}};if(method==='generate')return new Promise((resolve,reject)=>window.jobs[input.requestId]={input,resolve,reject});if(method==='library-list')return [];if(method==='save')return {status:'saved',saved:{...input.content,revision:input.revision+1}};return {}},draft:async()=>{}};
 createRoot(document.querySelector('#notes')).render(<NotesApp sessionId="inline-generation" bridge={bridge} dark={false} navigate={()=>{}}/>);
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.editor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},60000)
afterAll(async()=>browser?.close())
it('changes note menus, placeholders and component drafts live without replacing unsaved content',async()=>{
 const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(4000)
 try{
  await page.route('http://127.0.0.1/english-notes',route=>route.fulfill({contentType:'text/html',body:'<html data-odyssey-locale="en"><section id="notes" class="en-root" style="position:fixed;inset:0"></section></html>'}));await page.goto('http://127.0.0.1/english-notes');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
  expect(await page.locator('.en-title').getAttribute('placeholder')).toBe('Untitled document')
  expect(await page.locator('.bn-block-content').evaluate(el=>getComputedStyle(el,':after').content)).toMatch(/commands|insert/i)
  await page.locator('.en-title').fill('用户标题保留')
  await page.evaluate(()=>{window.originalEditor=window.editor;window.editor.replaceBlocks(window.editor.document,[{id:'text',type:'paragraph',content:'用户正文：图片、文件、智能组件'},{id:'draft',type:'research',props:{payload:JSON.stringify({id:'note-component-test',noteDraft:'smart',containerPrompt:'中文需求原样保留',generationStatus:'draft'})}},{id:'anchor',type:'paragraph'}]);window.beforeLocale=JSON.stringify(window.editor.document)})
  expect(await page.locator('.en-creation-component strong').textContent()).toBe('Smart component')
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='zh')
  await expect.poll(()=>page.locator('.en-title').getAttribute('placeholder')).toBe('无标题文档')
  expect(await page.locator('.en-creation-component strong').textContent()).toBe('智能组件')
  await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
  await expect.poll(()=>page.locator('.en-creation-component strong').textContent()).toBe('Smart component')
  expect(await page.locator('.en-title').inputValue()).toBe('用户标题保留');expect(await page.locator('.en-creation-component textarea').inputValue()).toBe('中文需求原样保留')
  expect(await page.evaluate(()=>window.originalEditor===window.editor&&window.beforeLocale===JSON.stringify(window.editor.document))).toBe(true)
  await page.getByRole('button',{name:'Show outline'}).click();expect(await page.locator('.en-toc-heading').textContent()).toBe('Outline');await page.keyboard.press('Escape')
  await page.evaluate(()=>{window.editor.setTextCursorPosition('anchor','start');window.editor.focus()});await page.keyboard.type('/')
  await expect.poll(()=>page.evaluate(()=>window.requests.filter(r=>r.method==='menu-sync').at(-1)?.input.items.some(i=>i.title==='Smart component'))).toBe(true)
  const menu=await page.evaluate(()=>window.requests.filter(r=>r.method==='menu-sync').at(-1).input);expect(menu.locale).toBe('en');for(const title of ['Image','Video','Audio','File','Link','Component library'])expect(menu.items.some(i=>i.title===title)).toBe(true)
  expect(errors).toEqual([])
 }finally{await context.close()}
},20000)
