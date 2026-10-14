import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script,css
beforeAll(async()=>{
 const built=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.noteSaved={title:'首段缩进验收',blocks:[{id:'first',type:'paragraph',content:[{type:'text',text:'沙俄',styles:{bold:true,textColor:'red'}},{type:'text',text:'大多数正文',styles:{}}]},{id:'second',type:'paragraph',content:'第二段保留'}],yjs:'',revision:0};
 const bridge={request:async(method,input)=>method==='load'?{saved:window.noteSaved}:method==='save'?{status:'saved',saved:window.noteSaved={...input.content,revision:input.revision+1}}:{},draft:async()=>{}};
 window.reopen=()=>{window.root?.unmount();window.root=createRoot(document.querySelector('#notes'));window.root.render(<NotesApp sessionId='indent-test' bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>)};window.reopen();
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'observe-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=built.outputFiles.find(f=>f.path.endsWith('.js')).text;css=built.outputFiles.find(f=>f.path.endsWith('.css')).text
 const {chromium}=await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>browser?.close())
async function fixture(dark){
 const context=await browser.newContext({viewport:{width:1000,height:800}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(e.message))
 await page.route('http://127.0.0.1/indent',r=>r.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section class='en-root' data-dark='${dark}'><div id='notes'></div></section></body>`}));await page.goto('http://127.0.0.1/indent');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
 await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,window.noteSaved.blocks));await expect.poll(()=>page.evaluate(()=>window.noteSaved.revision)).toBeGreaterThan(0)
 return {context,page,errors}
}
async function menu(page,id,action){await page.locator(`[data-id='${id}'] .bn-block-content`).hover();await page.getByRole('button',{name:'段落操作',exact:true}).click();await page.getByRole('button',{name:action,exact:true}).click()}
const x=page=>page.locator('[data-id="first"] .bn-inline-content').evaluate(el=>el.getBoundingClientRect().left)
for(const dark of [false,true])it(`indents the first paragraph through the real menu and saves/reopens its styles (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  const before=await x(page);await menu(page,'first','增加缩进');await expect.poll(()=>x(page)).toBe(before+32)
  await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0]?.props?.noteIndent)).toBe(1)
  expect(await page.evaluate(()=>window.noteEditor.document.map(b=>({id:b.id,children:b.children.length})))).toEqual([{id:'first',children:0},{id:'second',children:0}])
  expect((await page.evaluate(()=>window.noteEditor.document))[0].content).toEqual([{type:'text',text:'沙俄',styles:{bold:true,textColor:'red'}},{type:'text',text:'大多数正文',styles:{}}])
  await page.evaluate(()=>window.reopen());await expect.poll(()=>x(page)).toBe(before+32)
  await menu(page,'first','减少缩进');await expect.poll(()=>x(page)).toBe(before);await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0]?.props?.noteIndent||0)).toBe(0)
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('supports repeated indentation, Undo, and keeps another paragraph as a sibling',async()=>{
 const {context,page,errors}=await fixture(false);try{
  const before=await x(page);await menu(page,'first','增加缩进');await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0]?.props?.noteIndent)).toBe(1)
  await menu(page,'first','增加缩进');await expect.poll(()=>x(page)).toBe(before+64);await expect.poll(()=>page.evaluate(()=>window.noteSaved.blocks[0]?.props?.noteIndent)).toBe(2)
  await page.keyboard.press('ControlOrMeta+z');await expect.poll(()=>x(page)).toBe(before+32)
  await menu(page,'second','增加缩进');expect((await page.evaluate(()=>window.noteEditor.document)).map(b=>b.id)).toEqual(['first','second']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps native list nesting and outdenting while allowing the first list item to indent',async()=>{
 const {context,page,errors}=await fixture(false);try{
  await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'first',type:'bulletListItem',content:'首项'},{id:'second',type:'bulletListItem',content:'第二项'}]))
  await menu(page,'second','增加缩进');expect(await page.evaluate(()=>window.noteEditor.document[0].children.map(b=>b.id))).toEqual(['second'])
  await menu(page,'second','减少缩进');expect(await page.evaluate(()=>window.noteEditor.document.map(b=>b.id))).toEqual(['first','second'])
  const before=await x(page);await menu(page,'first','增加缩进');await expect.poll(()=>x(page)).toBe(before+32)
  expect(await page.evaluate(()=>window.noteEditor.document[0].props.noteIndent)).toBe(1);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('outdents an existing nested attachment without changing its payload or identity',async()=>{
 const {context,page,errors}=await fixture(false);try{
  const payload=JSON.stringify({id:'nested',name:'合成附件.pdf',importStatus:'failed',error:'仅测试嵌套移出'})
  await page.evaluate(payload=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'first',type:'paragraph',content:'父段落保留',children:[{id:'nested',type:'attachment',props:{payload}}]},{id:'second',type:'paragraph',content:'后段保留'}]),payload)
  await menu(page,'nested','减少缩进');expect(await page.evaluate(()=>window.noteEditor.document.map(b=>b.id))).toEqual(['first','nested','second'])
  expect(await page.evaluate(()=>window.noteEditor.document[1].props.payload)).toBe(payload);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
