import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
const repo=process.cwd(),require=createRequire(import.meta.url),{build}=require('esbuild')
let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:repo,loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';
import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
window.calls=[];window.receipts=[];window.saved=null;window.effects=[];window.failCreate=false;const pending=new Map();
const bridge={request:async(method,input)=>{window.calls.push({method,input});
 if(method==='load')return {saved:{title:'组合验收',blocks:[{id:'p',type:'paragraph',content:[{type:'text',text:'保留我的富文本正文',styles:{bold:true}}]}],yjs:'',revision:0,updatedAt:0}};
 if(method==='save'){window.saved=input.content;return {status:'saved',saved:{...input.content,revision:input.revision+1}}}
 if(method==='render')return{html:'<p>组件数据 42</p>',document:'<!doctype html><body><p>组件数据 42</p></body>'};
 if(method==='component-render')return{ok:true};
 if(method==='capability-reply'){if(input.effect)return{ok:true};const item=pending.get(input.requestId);if(item){pending.delete(input.requestId);input.error?item.reject(Error(input.error)):item.resolve(input.result)}return{ok:true}}
 if(method==='component-snapshots')return[];
 if(method==='export'){window.effects.push({kind:'export',content:input.content});return {status:'saved',path:'/tmp/native-composition.pdf'}}
 if(method==='generate'&&input.entryPoint==='component')return new Promise(resolve=>{window.completeCard=()=>resolve(window.failCreate?{kind:'conversation',markdown:'请提供数据。'}:{kind:'component',node:{id:'generated',title:'新组件',generationStatus:'completed',containerSpec:{version:1,type:'table',title:'新组件',columns:['值'],rows:[[42]]}}})});
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
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'composed',prompt:'创建一个表格组件，然后设置易方达主题，隐藏顶栏并导出 PDF。',images:[]}})))
  await page.waitForFunction(()=>typeof window.completeCard==='function');expect(await page.evaluate(()=>window.ordinaryInput.mode)).toBe('write');expect(await page.evaluate(()=>window.effects)).toEqual([])
  await page.evaluate(()=>window.completeCard());await page.waitForFunction(()=>window.receipts.length===3)
  const result=await page.evaluate(()=>({receipts:window.receipts,saved:window.saved,effects:window.effects}));expect(result.receipts.map(r=>r.status)).toEqual(['succeeded','succeeded','succeeded']);expect(result.effects).toHaveLength(1);expect(result.saved.blocks[0].content[0]).toMatchObject({text:'保留我的富文本正文',styles:{bold:true}})
  const research=result.saved.blocks.find(b=>b.type==='research');expect(JSON.parse(research.props.payload)).toMatchObject({notePresentation:{theme:'enterprise',titleBar:false},containerSpec:{rows:[[42]]}})
  await expect.poll(()=>page.locator('[data-note-titlebar=hidden]>.en-research-header').isHidden()).toBe(true);expect(await page.locator('[data-note-presentation]').getAttribute('data-workbench-style')).toBe('enterprise');expect(errors).toEqual([])
 }catch(error){console.log('CAPABILITY DEBUG',await page.evaluate(()=>({calls:window.calls,receipts:window.receipts,body:document.body.innerText})),errors);throw error}finally{await context.close()}
},15000)
it('keeps a requested clarification in the component and does not export it as a completed result',async()=>{
 const {context,page,errors}=await fixture()
 try{await page.evaluate(()=>{window.failCreate=true;document.dispatchEvent(new CustomEvent('sherlock:notes-submit',{detail:{sessionId:'composed',prompt:'创建表格并导出PDF',images:[]}}))});await page.waitForFunction(()=>typeof window.completeCard==='function');await page.evaluate(()=>window.completeCard());await page.waitForFunction(()=>window.receipts.length===1);expect(await page.evaluate(()=>window.receipts[0].status)).toBe('pending');expect(await page.evaluate(()=>window.effects)).toEqual([]);expect(await page.locator('.en-document').innerText()).toContain('保留我的富文本正文');expect(errors).toEqual([])}finally{await context.close()}
},15000)
