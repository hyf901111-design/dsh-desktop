import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
const repo=process.cwd(),require=createRequire(import.meta.url),{build}=require('esbuild')
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:repo,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';
import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
window.calls=[];window.receipts=[];window.saved=null;window.effects=[];window.failCreate=false;window.stageEffects=[];window.saveAttempts=0;const pending=new Map();
const bridge={request:async(method,input)=>{window.calls.push({method,input});
 if(method==='load')return {saved:{title:'组合验收',blocks:[{id:'p',type:'paragraph',content:[{type:'text',text:'保留我的富文本正文',styles:{bold:true}}]}],yjs:'',revision:0,updatedAt:0}};
 if(method==='save'){if(window.saveFailure){window.saveAttempts++;const fail=()=>{if(window.saveFailure==='exception')throw Error('磁盘写入失败');return{status:'conflict'}};if(window.saveAttempts===1)return fail();return new Promise((resolve,reject)=>{window.completeSave=()=>{try{resolve(fail())}catch(error){reject(error)}}})}window.saved=input.content;return {status:'saved',saved:{...input.content,revision:input.revision+1}}}
 if(method==='render')return{html:'<p>组件数据 42</p>',document:'<!doctype html><body><p>组件数据 42</p></body>'};
 if(method==='component-render')return{ok:true};
 if(method==='capability-reply'){if(input.effect){window.stageEffects.push(input.effect);return{ok:true}};const item=pending.get(input.requestId);if(item){pending.delete(input.requestId);input.error?item.reject(Error(input.error)):item.resolve(input.result)}return{ok:true}}
 if(method==='component-snapshots')return[];
 if(method==='export'){window.effects.push({kind:'export',content:input.content});return {status:'saved',path:'/tmp/native-composition.pdf'}}
 if(method==='generate'&&input.entryPoint==='component')return new Promise(resolve=>{window.completeCard=()=>resolve(window.failCreate?{kind:'conversation',markdown:'请提供数据。'}:{kind:'component',...(window.verified?{sourceResult:{status:'verified',recipe:{}}}:{}),node:{id:'generated',title:'新组件',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'新组件',columns:['值'],rows:[[42]]}}})});
 if(method==='generate'){
  window.ordinaryInput=input;
  const invoke=(action,args)=>new Promise((resolve,reject)=>{const requestId='cap-'+(window.receipts.length+1);pending.set(requestId,{resolve,reject});document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{requestId,generationId:input.requestId,sessionId:input.sessionId,context:{...input.capabilityContext,owner:'alice',mode:'notes',editable:true},action,args}}))});
  for(const [action,args] of [['notes.components.create',{prompt:'创建展示42的表格',requestContext:{images:input.images,context:input.context,title:input.title,markdown:input.markdown,selection:input.selection}}],['notes.components.style',{scope:'note',theme:'enterprise',titleBar:false}],['notes.export',{format:'pdf'}]]){const receipt=await invoke(action,args);window.receipts.push(receipt);if(receipt.status!=='succeeded')break}
  return{kind:'conversation',markdown:'操作回执已确认'}
 }
 return{}},draft:async()=>{}};
window.root=createRoot(document.querySelector('#notes'));window.root.render(<NotesApp sessionId='composed' bridge={bridge} dark={false} navigate={()=>{}}/>);
`},bundle:true,platform:'browser',format:'iife',write:false,outfile:'fixture.js',conditions:['browser','import','style'],define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'expose-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}},{name:'svg',setup(b){b.onResolve({filter:/\.svg\?inline$/},a=>({path:require('node:path').resolve(a.resolveDir,a.path.slice(0,-7)),namespace:'svg'}));b.onLoad({filter:/.*/,namespace:'svg'},async a=>({contents:'export default '+JSON.stringify('data:image/svg+xml;base64,'+Buffer.from(await readFile(a.path)).toString('base64')),loader:'js'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const pw=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js');browser=await (pw.default||pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
async function fixture(){const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(3500);page.on('pageerror',e=>errors.push(e.message));await page.route('http://127.0.0.1/note-capability',route=>route.fulfill({contentType:'text/html',body:'<body><section class="en-root" style="left:10px;right:10px"><div id="notes" class="en-editor-host"></div></section></body>'}));await page.goto('http://127.0.0.1/note-capability');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor();await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,[{id:'p',type:'paragraph',content:[{type:'text',text:'保留我的富文本正文',styles:{bold:true}}]}]));return{context,page,errors}}
it('routes creation through the generic composer and waits before persistent theme and export',async()=>{
 const {context,page,errors}=await fixture()
 try{
  await page.evaluate(()=>{window.verified=true;document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'composed',prompt:'创建一个表格组件，然后设置易方达主题，隐藏顶栏并导出 PDF。',images:[]}}))})
  await page.waitForFunction(()=>typeof window.completeCard==='function');expect(await page.evaluate(()=>window.ordinaryInput.mode)).toBe('write');expect(await page.evaluate(()=>window.effects)).toEqual([])
  await page.evaluate(()=>window.completeCard());await page.waitForFunction(()=>window.receipts.length===3)
  const result=await page.evaluate(()=>({receipts:window.receipts,saved:window.saved,effects:window.effects}));expect(result.receipts.map(r=>r.status)).toEqual(['succeeded','succeeded','succeeded']);expect(result.effects).toHaveLength(1);expect(result.saved.blocks[0].content[0]).toMatchObject({text:'保留我的富文本正文',styles:{bold:true}})
  const research=result.saved.blocks.find(b=>b.type==='research');expect(JSON.parse(research.props.payload)).toMatchObject({notePresentation:{theme:'enterprise',titleBar:false},containerSpec:{rows:[[42]]}})
  await expect.poll(()=>page.locator('[data-note-titlebar=hidden]>.en-research-header').isHidden()).toBe(true);expect(await page.locator('[data-note-presentation]').getAttribute('data-workbench-style')).toBe('enterprise')
  const original=await page.evaluate(()=>{window.originalEditor=window.noteEditor;return JSON.stringify(window.noteEditor.document)})
  for(const locale of ['en','zh','en']){
   await page.evaluate(locale=>document.documentElement.dataset.odysseyLocale=locale,locale)
   await page.getByRole('textbox',{name:locale==='en'?'Note title':'笔记标题',exact:true}).waitFor()
   const card=page.locator('[data-id="'+research.id+'"]'),guard=card.locator('.en-component-scroll-guard')
   await expect.poll(()=>card.locator('.en-component-scroll-guard,.en-component-presentation-controls').count()).toBeGreaterThan(0)
   if(await guard.count())await guard.click()
   const controls=card.locator('.en-component-presentation-controls')
   await expect.poll(()=>controls.locator('summary').getAttribute('aria-label')).toBe(locale==='en'?'Component style':'组件样式')
   if(await controls.getAttribute('open')===null)await controls.locator('summary').click()
   expect(await controls.getByRole('combobox',{name:locale==='en'?'Component color theme':'组件配色'}).inputValue()).toBe('enterprise')
   expect(await controls.getByRole('checkbox',{name:locale==='en'?'Show component title bar':'显示组件顶栏'}).isChecked()).toBe(false)
   expect(await controls.locator('option[value=enterprise]').textContent()).toBe(locale==='en'?'EFund':'易方达')
   expect(await page.evaluate(()=>window.originalEditor===window.noteEditor)).toBe(true)
   expect(await page.evaluate(()=>JSON.stringify(window.noteEditor.document))).toBe(original)
  }
  expect(errors).toEqual([])
 }catch(error){console.log('CAPABILITY DEBUG',await page.evaluate(()=>({calls:window.calls,receipts:window.receipts,body:document.body.innerText})),errors);throw error}finally{await context.close()}
},15000)
it('keeps a requested clarification in the component and does not export it as a completed result',async()=>{
 const {context,page,errors}=await fixture()
 try{await page.evaluate(()=>{window.failCreate=true;document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'composed',prompt:'创建表格并导出PDF',images:[]}}))});await page.waitForFunction(()=>typeof window.completeCard==='function');await page.evaluate(()=>window.completeCard());await page.waitForFunction(()=>window.receipts.length===1);expect(await page.evaluate(()=>window.receipts[0].status)).toBe('pending');expect(await page.evaluate(()=>window.effects)).toEqual([]);expect(await page.locator('.en-document').innerText()).toContain('保留我的富文本正文');expect(errors).toEqual([])}finally{await context.close()}
},15000)

it.each(['conflict','exception'])('retains only applied creation after a real editor %s save failure and cancellation',async(saveFailure)=>{
 const {context,page,errors}=await fixture()
 try{
  await page.evaluate(saveFailure=>{window.saveFailure=saveFailure;window.verified=true;document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'composed',prompt:'创建表格并导出PDF',images:[]}}))},saveFailure)
  await page.waitForFunction(()=>typeof window.completeCard==='function');await page.evaluate(()=>window.completeCard())
  // The first, inner save has failed. Hold the outer save until cancellation,
  // exercising the real editor queue and both callers of its persistence API.
  await page.waitForFunction(()=>typeof window.completeSave==='function')
  await page.evaluate(()=>{document.dispatchEvent(new CustomEvent('sherlock:notes-capability-action',{detail:{sessionId:'composed',requestId:'cap-1',cancel:true}}));window.completeSave()})
  await page.waitForFunction(()=>window.receipts.length===1)
  const result=await page.evaluate(()=>({receipt:window.receipts[0],stages:window.stageEffects,saved:window.saved,blocks:window.noteEditor.document,exports:window.effects,calls:window.calls}))
  expect(result.saved).toBeNull();expect(result.exports).toEqual([])
  expect(result.receipt).toMatchObject({status:'cancelled',effect:{state:'applied'}})
  expect(result.stages.every(effect=>effect.state!=='saved')).toBe(true)
  expect(result.receipt.message).toContain('尚未确认保存');expect(result.receipt.message).not.toContain('已生成并保存')
  const created=result.blocks.find(block=>block.id===result.receipt.blockId)
  expect(JSON.parse(created.props.payload).containerSpec.rows).toEqual([[42]])
  expect(result.blocks[0].content[0]).toMatchObject({text:'保留我的富文本正文',styles:{bold:true}})
  expect(result.calls.some(call=>call.method==='component-data'&&call.input.action==='bind-generated')).toBe(false)
  expect(await page.locator('.en-error').innerText()).toContain(saveFailure==='conflict'?'已有较新保存版本':'磁盘写入失败')
  expect(errors).toEqual([])
 }finally{await context.close()}
},15000)
