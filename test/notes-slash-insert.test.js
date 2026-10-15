import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.noteRequests=[];window.noteTaskRows=[];document.addEventListener('sherlock:notes-task-state',e=>window.noteTaskRows.push(e.detail));window.pickedFiles=[{name:'picked.png',path:'/synthetic/picked.png'}];window.savedNote=null;
 const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:window.savedNote||{title:'斜杠插入验收',blocks:[{id:'before',type:'paragraph',content:'保留前文'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留后文'}],yjs:'',revision:0}};if(method==='library-list')return [];if(method==='file-pick')return new Promise(resolve=>window.finishPick=()=>resolve({files:window.pickedFiles}));if(method==='file-admit')return {...input,id:input.nodeId,source:'computer',authorizationId:'grant'};if(method==='file-bind')return {previewSessionId:'synthetic'};if(method==='generate')return new Promise((resolve,reject)=>{window.finishGenerate=resolve;window.failGenerate=()=>reject(Error('合成生成失败'))});if(method==='save'){window.savedNote={...input.content,revision:input.revision+1};return {status:'saved',saved:window.savedNote}};return {}},draft:async()=>{}};
 const root=createRoot(document.querySelector('#notes'));window.remount=()=>root.render(<NotesApp key={Date.now()} sessionId="slash-insert" bridge={bridge} dark={document.body.hasAttribute('data-ds-dark-theme')} navigate={()=>{}}/>);window.remount();
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>browser?.close())
async function fixture(dark=false){
 const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(2500);page.on('pageerror',e=>errors.push(e.message))
 await page.route('http://127.0.0.1/slash-insert',route=>route.fulfill({contentType:'text/html',body:`<body ${dark?'data-ds-dark-theme':''}><section id="notes" class="en-root" data-dark="${dark}" style="position:fixed;inset:0"><div class="en-editor-host"></div></section></body>`}));await page.goto('http://127.0.0.1/slash-insert');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'before',type:'paragraph',content:'保留前文'},{id:'anchor',type:'paragraph'},{id:'after',type:'paragraph',content:'保留后文'}]));return {context,page,errors}
}
async function slash(page,title){
 await page.locator('[data-id="anchor"] .bn-inline-content').click();await page.keyboard.type('/')
 await expect.poll(()=>page.evaluate(title=>window.noteRequests.filter(v=>v.method==='menu-sync').at(-1)?.input.items.some(item=>item.title===title),title)).toBe(true)
 await page.evaluate(title=>{const s=window.noteRequests.filter(v=>v.method==='menu-sync').at(-1).input,item=s.items.find(i=>i.title===title);document.dispatchEvent(new CustomEvent('sherlock:notes-menu-event',{detail:{sessionId:s.sessionId,menuId:s.menuId,revision:s.revision,action:'select',itemId:item.id}}))},title)
}
for(const [title,kind] of [['图片','image'],['视频','video'],['音频','audio'],['文件','file']])it(`opens ${kind} picker and imports selected files at the captured slash position`,async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,title);await expect.poll(()=>page.evaluate(()=>window.noteRequests.find(v=>v.method==='file-pick')?.input.kind)).toBe(kind)
  expect(await page.evaluate(()=>window.noteEditor.document.some(b=>b.type==='image'||b.type==='file'))).toBe(false)
  await page.evaluate(()=>{window.pickedFiles=[{name:'one.pdf',path:'/synthetic/one.pdf'},{name:'two.pdf',path:'/synthetic/two.pdf'}];window.noteEditor.setTextCursorPosition('after','end');window.finishPick()})
  await page.locator('.en-note-file').nth(1).waitFor();const blocks=await page.evaluate(()=>window.noteEditor.document)
  expect(blocks.map(b=>b.id).indexOf('before')).toBeLessThan(blocks.findIndex(b=>b.type==='attachment'));expect(blocks.findLastIndex(b=>b.type==='attachment')).toBeLessThan(blocks.findIndex(b=>b.id==='after'))
  expect(blocks.filter(b=>b.type==='attachment').map(b=>JSON.parse(b.props.payload).name)).toEqual(['one.pdf','two.pdf']);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('canceling the picker leaves the slash paragraph and surrounding text editable',async()=>{
 const {context,page}=await fixture();try{await slash(page,'文件');await expect.poll(()=>page.evaluate(()=>typeof window.finishPick)).toBe('function');await page.evaluate(()=>{window.pickedFiles=[];window.finishPick()});expect(await page.locator('.en-note-file').count()).toBe(0);expect(await page.evaluate(()=>window.noteEditor.getBlock('before').content[0].text)).toBe('保留前文');expect(await page.locator('.en-root [role=alert]').count()).toBe(0)}finally{await context.close()}
},15000)
for(const dark of [false,true])it(`creates a full-width smart draft and replaces only that block after generation (${dark?'dark':'light'})`,async()=>{
 const {context,page,errors}=await fixture(dark);try{
  await slash(page,'智能组件');const input=page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true});await input.waitFor();const draft=page.locator('[data-note-creation-draft="smart"]'),box=await draft.boundingBox(),anchor=await page.locator('[data-id="anchor"] .bn-block-content').boundingBox();expect(Math.abs(box.x-anchor.x)).toBeLessThan(2);expect(Math.abs(box.width-anchor.width)).toBeLessThan(2)
  await input.fill('两个月收入对比');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.noteRequests.find(v=>v.method==='generate')?.input.mode)).toBe('component')
  const id=await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research').id);await page.evaluate(()=>window.finishGenerate({kind:'component',node:{id:'generated-id',title:'月收入',kind:'generated-container',containerSpec:{version:1,type:'table',title:'月收入',columns:['月','收入'],rows:[['一月',10],['二月',20]]}}}))
  await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).containerSpec?.title)).toBe('月收入');const result=await page.evaluate(()=>window.noteEditor.document.filter(b=>b.type==='research'));expect(result).toHaveLength(1);expect(result[0].id).toBe(id);expect(JSON.parse(result[0].props.payload).noteDraft).toBeUndefined();expect(await page.locator('.bn-block-outer[data-id="after"]').textContent()).toBe('保留后文');expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('keeps the failed smart draft and its requirement for an in-place retry',async()=>{
 const {context,page}=await fixture();try{await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('模拟趋势图');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.failGenerate)).toBe('function');await page.evaluate(()=>window.failGenerate());await expect.poll(()=>page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).inputValue()).toBe('模拟趋势图');expect(await page.locator('[data-note-creation-draft="smart"]').count()).toBe(1)}finally{await context.close()}
},15000)
it('validates a link and loads it in the same note block without invoking AI',async()=>{
 const {context,page,errors}=await fixture();try{
  await slash(page,'链接');const input=page.getByRole('textbox',{name:'输入链接',exact:true});await input.fill('javascript:alert(1)');await page.getByRole('button',{name:'添加链接',exact:true}).click();expect(await page.locator('[data-note-creation-draft="link"] [role=alert]').textContent()).toContain('有效');expect(await page.evaluate(()=>window.noteRequests.some(v=>v.method==='generate'))).toBe(false)
  const id=await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='research').id);await input.fill('https://EXAMPLE.com/path');await page.getByRole('button',{name:'添加链接',exact:true}).click();await expect.poll(()=>page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='research').props.payload).url)).toBe('https://example.com/path');expect(await page.evaluate(()=>window.noteEditor.document.filter(b=>b.type==='research').map(b=>b.id))).toEqual([id]);expect(await page.evaluate(()=>window.noteRequests.some(v=>v.method==='generate'))).toBe(false);expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
it('restores an interrupted smart draft as an editable requirement instead of a permanently running frame',async()=>{
 const {context,page}=await fixture();try{
  await page.evaluate(()=>window.noteEditor.insertBlocks([{id:'stale-draft',type:'research',props:{payload:JSON.stringify({id:'note-component-stale',kind:'generated-container',title:'智能组件',noteDraft:'smart',containerPrompt:'上次输入',generationStatus:'running'})}}],'anchor','before'))
  const input=page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true});await input.waitFor();expect(await input.isEnabled()).toBe(true);expect(await input.inputValue()).toBe('上次输入');expect(await page.getByRole('button',{name:'创建',exact:true}).isEnabled()).toBe(true)
 }finally{await context.close()}
},15000)
for(const changed of ['stop','newer','resize'])it(`does not replace a ${changed} smart draft with a late result`,async()=>{
 const {context,page}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('待生成内容');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.finishGenerate)).toBe('function')
  if(changed==='stop')await page.locator('[data-note-creation-draft="smart"]').getByRole('button',{name:'停止',exact:true}).click()
  else await page.evaluate(changed=>{const b=window.noteEditor.document.find(b=>b.type==='research'),node=JSON.parse(b.props.payload);window.noteEditor.updateBlock(b.id,{props:{payload:JSON.stringify(changed==='resize'?{...node,noteSize:{height:300}}:{...node,containerPrompt:'较新的需求',generationStatus:'draft'})}})},changed)
  await page.evaluate(()=>window.finishGenerate({kind:'component',node:{id:'late',title:'不应写入的结果',containerSpec:{version:1,type:'table',title:'晚到结果',columns:['值'],rows:[[1]]}}}))
  await expect.poll(()=>page.locator('.en-ai-loading').count()).toBe(0);expect(await page.locator('[data-note-creation-draft="smart"]').count()).toBe(1);expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).inputValue()).toBe(changed==='newer'?'较新的需求':'待生成内容');expect(await page.evaluate(()=>window.noteEditor.document.filter(b=>b.type==='research').length)).toBe(1);expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).isEnabled()).toBe(true)
 }finally{await context.close()}
},15000)

it('shows a model clarification in conversation and preserves the editable smart draft',async()=>{
 const {context,page}=await fixture();try{
  await slash(page,'智能组件');await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).fill('按我的数据做图');await page.getByRole('button',{name:'创建',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof window.finishGenerate)).toBe('function');await page.evaluate(()=>window.finishGenerate({kind:'conversation',markdown:'请补充月份和收入数据。'}))
  await expect.poll(()=>page.evaluate(()=>window.noteTaskRows.find(row=>row.phase==='replied')?.result.markdown)).toBe('请补充月份和收入数据。');expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).isEnabled()).toBe(true);expect(await page.getByRole('textbox',{name:'描述要创建的组件内容',exact:true}).inputValue()).toBe('按我的数据做图');expect(await page.locator('.en-error').count()).toBe(0)
 }finally{await context.close()}
},15000)
