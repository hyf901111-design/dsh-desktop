import {afterAll,beforeAll,expect,it} from 'vitest'
import {build,type PluginBuild} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
// @ts-expect-error The shared browser-fixture helper is JavaScript without declarations.
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'

const evidence=process.env.SHERLOCK_NOTE_HEADER_EVIDENCE
let browser:any,script:string,css:string
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import {createRoot} from 'react-dom/client';
  import {NotesApp} from './src/preload/notes/editor';import '@blocknote/mantine/style.css';import './scripts/lib/research-grid-workbench.css';import './src/preload/notes/style.css';
  window.headerTrace={references:[],states:[],removals:[],requests:[],selectedChanges:[]};
  document.addEventListener('sherlock:notes-reference-component',event=>window.headerTrace.references.push(event.detail));
  document.addEventListener('sherlock:notes-reference-state',event=>{window.headerReferences=event.detail;window.headerTrace.states.push(event.detail)});
  const card=(id,title)=>({id,type:'research',props:{payload:JSON.stringify({id:'node-'+id,kind:'generated-container',title,noteLibrary:true,height:190,containerSpec:{version:1,type:'markdown',title,content:'只用于隔离验收的组件正文。'}})}});
  const initial={title:'组件按钮隔离验收',blocks:[{id:'intro',type:'paragraph',content:'组件前的原始正文。'},card('card-a','组件甲'),card('card-b','组件乙'),{id:'tail',type:'paragraph',content:'组件后的原始正文。'}],yjs:'',revision:0,updatedAt:0};
  window.headerInitial=initial;const readOnly=new URLSearchParams(location.search).has('readonly');
  const bridge={request:async(method,input)=>{window.headerTrace.requests.push({method,input});if(method==='load')return{saved:initial,...readOnly?{draft:{...initial,clientId:'recovery-fixture',baseRevision:0,savedAt:1}}:{}};if(method==='save')return{status:'saved',saved:{...input.content,revision:input.revision+1}};if(method==='component-menu-capabilities')return{copy:true,rename:!readOnly,saveLibrary:!readOnly,exportContent:false};if(method==='component-copy')return{ok:true};return{}},draft:async()=>{}};
  createRoot(document.querySelector('#root')).render(<NotesApp sessionId="header-fixture" bridge={bridge} dark={false} navigate={()=>{}}/>);
  window.headerSnapshot=()=>{const editor=window.headerEditor,selection=editor._tiptapEditor.state.selection;return{selection:selection.toJSON(),selected:[...document.querySelectorAll('.en-research[data-selected="true"]')].map(node=>node.dataset.noteResearchBlock),references:(window.headerReferences?.references||[]).filter(item=>['research','attachment'].includes(item.type)).map(item=>item.blockId),blocks:editor.document,focusTag:document.activeElement?.tagName,sameFocus:window.headerFocus===document.activeElement}};
  window.headerCaret=async()=>{window.headerEditor.focus();window.headerEditor.setTextCursorPosition('intro','end');await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));window.headerFocus=document.activeElement;window.headerTrace.references=[];window.headerTrace.selectedChanges=[]};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'header-fixture.js',logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[esbuildRawSource(),{name:'header-fixture-editor',setup(b:PluginBuild){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({loader:'tsx',contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.headerEditor=editor; const slashMenu = useMemo')}))}},{name:'header-fixture-css',setup(b:PluginBuild){b.onResolve({filter:/\.css\?inline$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'css-inline'}));b.onLoad({filter:/.*/,namespace:'css-inline'},async args=>({loader:'text',contents:await readFile(args.path,'utf8')}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js'))!.text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))!.text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close()})

async function fixture(readOnly=false){
 const context=await browser.newContext({viewport:{width:1100,height:1000}}),page=await context.newPage(),errors:string[]=[]
 page.on('pageerror',(error:any)=>errors.push(error.message))
 await page.route('https://note-header.test/**',(route:any)=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><body data-workspace-surface="notes"><header data-srb-session-header data-ework-notes-session="header-fixture"></header><section class="en-root" style="left:0;right:120px"><div id="root" class="en-editor-host"></div></section><button id="outside" style="position:fixed;right:8px;top:30px">外部操作</button></body>'}))
 await page.goto('https://note-header.test/'+(readOnly?'?readonly':''));await page.addStyleTag({content:css});await page.addScriptTag({content:script})
 // A collaborative editor's cached blocks are not its Yjs document. Seed the
 // isolated document through the real editor API before observing user actions.
 await page.locator('.bn-editor').waitFor();await page.evaluate(()=>{const w=window as any;w.headerEditor.replaceBlocks(w.headerEditor.document,w.headerInitial.blocks)})
 await page.locator('[data-note-research-block="card-b"] .en-component-more:not(:disabled)').waitFor({timeout:7000}).catch(async(error:any)=>{throw Error(JSON.stringify({errors,debug:await page.evaluate(()=>({blocks:(window as any).headerEditor?.document,editor:document.querySelector('.bn-editor')?.outerHTML.slice(0,2200),title:document.querySelector('input')?.value})),body:await page.locator('body').innerText()})+error.message)})
 await page.evaluate(()=>{const w=window as any,editor=w.headerEditor,remove=editor.removeBlocks.bind(editor);editor.removeBlocks=(blocks:any[])=>{w.headerTrace.removals.push(blocks.map(block=>typeof block==='string'?block:block.id));return remove(blocks)};w.headerObserver=new MutationObserver((records:MutationRecord[])=>{for(const record of records)if(record.type==='attributes')w.headerTrace.selectedChanges.push({blockId:(record.target as HTMLElement).dataset.noteResearchBlock,selected:(record.target as HTMLElement).dataset.selected})});w.headerObserver.observe(document.querySelector('#root'),{subtree:true,attributes:true,attributeFilter:['data-selected']})})
 expect(errors).toEqual([])
 return{context,page,errors,close:async()=>{await page.evaluate(()=>(window as any).headerObserver.disconnect());await context.close()}}
}
const card=(page:any,id='card-b')=>page.locator('[data-note-research-block="'+id+'"]')
async function headerControls(page:any){
 await page.evaluate(()=>{
  const header=document.querySelector('[data-note-research-block="card-b"] .en-native-component-title')!,input=document.createElement('input'),refresh=document.createElement('button');input.type='search';input.setAttribute('role','combobox');input.setAttribute('aria-label','顶栏搜索验收');refresh.textContent='刷新验收';refresh.addEventListener('click',()=>{(window as any).headerRefreshes=((window as any).headerRefreshes||0)+1});header.append(input,refresh)
 })
}
async function press(page:any,button:any){await button.scrollIntoViewIfNeeded();await button.hover();const box=await button.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down()}
async function snapshot(page:any){return page.evaluate(()=>(window as any).headerSnapshot())}
async function saveEvidence(page:any,name:string,value:any){if(!evidence)return;const{mkdir,writeFile}=await import('node:fs/promises');await mkdir(evidence,{recursive:true});await writeFile(resolve(evidence,name+'.json'),JSON.stringify(value,null,2)+'\n');await page.screenshot({path:resolve(evidence,name+'.png')})}

it('opens More on the first click without selecting the card or moving the retained editor caret on press',async()=>{
 const f=await fixture();try{
  await f.page.evaluate(()=>(window as any).headerCaret());const before=await snapshot(f.page)
  await press(f.page,card(f.page).getByRole('button',{name:'组件更多操作',exact:true}));const pressed=await snapshot(f.page),trace=await f.page.evaluate(()=>(window as any).headerTrace)
  await f.page.mouse.up();await f.page.getByRole('menu',{name:'组件更多操作',exact:true}).waitFor();const after=await snapshot(f.page)
  await saveEvidence(f.page,'more-first-click',{before,pressed,after,trace})
  expect(pressed.selection).toEqual(before.selection);expect(pressed.sameFocus).toBe(true);expect(pressed.selected).toEqual([]);expect(pressed.references).toEqual([]);expect(trace.references).toEqual([]);expect(trace.selectedChanges).toEqual([])
  expect(after.selection).toEqual(before.selection);expect(after.selected).toEqual([]);expect(after.references).toEqual([])
  const menu=f.page.getByRole('menu',{name:'组件更多操作',exact:true}),copy=menu.locator('[data-component-menu-action="copy"]');expect(await menu.count()).toBe(1);expect(await copy.evaluate((node:HTMLElement)=>{const box=node.getBoundingClientRect();return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2))})).toBe(true)
  await copy.click();await expect.poll(()=>menu.count()).toBe(0);expect(await f.page.evaluate(()=>(window as any).headerTrace.requests.filter((request:any)=>request.method==='component-copy').length)).toBe(1);expect((await snapshot(f.page)).selected).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('closes only its own block once without selecting it or disturbing the caret first',async()=>{
 const f=await fixture();try{
  await f.page.evaluate(()=>(window as any).headerCaret());const before=await snapshot(f.page)
  await press(f.page,card(f.page).getByRole('button',{name:'移除笔记中的组件',exact:true}));const pressed=await snapshot(f.page),trace=await f.page.evaluate(()=>(window as any).headerTrace)
  await f.page.mouse.up();await expect.poll(()=>card(f.page).count()).toBe(0);const after=await snapshot(f.page)
  await saveEvidence(f.page,'close-once',{before,pressed,after,trace,removals:await f.page.evaluate(()=>(window as any).headerTrace.removals)})
  expect(pressed.selection).toEqual(before.selection);expect(pressed.sameFocus).toBe(true);expect(pressed.selected).toEqual([]);expect(pressed.references).toEqual([]);expect(trace.references).toEqual([])
  expect(after.selection).toEqual(before.selection);expect(after.sameFocus).toBe(true);expect(after.blocks.map((block:any)=>block.id)).toEqual(['intro','card-a','tail']);expect(after.blocks).toEqual(before.blocks.filter((block:any)=>block.id!=='card-b'));expect(await f.page.evaluate(()=>(window as any).headerTrace.removals)).toEqual([['card-b']]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('focuses and types in header search directly without selecting a card or emitting a reference',async()=>{
 const f=await fixture();try{
  await headerControls(f.page);await f.page.evaluate(()=>(window as any).headerCaret());const before=await snapshot(f.page),search=card(f.page).getByRole('combobox',{name:'顶栏搜索验收'})
  await search.click();await search.pressSequentially('300308');const after=await snapshot(f.page)
  expect(await search.inputValue()).toBe('300308');expect(await search.evaluate((node:HTMLElement)=>node===document.activeElement)).toBe(true)
  expect(after.selected).toEqual([]);expect(after.references).toEqual([]);expect(after.selection).toEqual(before.selection)
  expect(await f.page.evaluate(()=>(window as any).headerTrace.references)).toEqual([])
  await card(f.page).getByRole('button',{name:'刷新验收',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).headerRefreshes)).toBe(1);expect((await snapshot(f.page)).selected).toEqual([])
  await saveEvidence(f.page,'search-direct',{before,after});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('preserves another selected card while focusing header search and still selects the title explicitly',async()=>{
 const f=await fixture();try{
  await headerControls(f.page);await card(f.page,'card-a').getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await expect.poll(async()=>(await snapshot(f.page)).selected).toEqual(['card-a'])
  await f.page.evaluate(()=>{(window as any).headerTrace.references=[]});const before=await snapshot(f.page),search=card(f.page).getByRole('combobox',{name:'顶栏搜索验收'})
  await search.click();await search.pressSequentially('MSFT');const after=await snapshot(f.page)
  expect(after.selected).toEqual(['card-a']);expect(after.references).toEqual(['card-a']);expect(after.selection).toEqual(before.selection);expect(await search.inputValue()).toBe('MSFT');expect(await f.page.evaluate(()=>(window as any).headerTrace.references)).toEqual([])
  await card(f.page).locator('.en-research-header strong').click();await expect.poll(async()=>(await snapshot(f.page)).selected).toEqual(['card-b']);expect((await snapshot(f.page)).references).toEqual(['card-b']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps an already selected different component through More and Close without adding a reference',async()=>{
 const f=await fixture();try{
  await card(f.page,'card-a').getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await expect.poll(async()=> (await snapshot(f.page)).selected).toEqual(['card-a'])
  await f.page.evaluate(()=>{(window as any).headerTrace.references=[]});const before=await snapshot(f.page)
  await card(f.page).getByRole('button',{name:'组件更多操作',exact:true}).click();await f.page.getByRole('menu',{name:'组件更多操作',exact:true}).waitFor()
  const afterMore=await snapshot(f.page);expect(afterMore.selected).toEqual(['card-a']);expect(afterMore.references).toEqual(['card-a']);expect(await f.page.evaluate(()=>(window as any).headerTrace.references)).toEqual([])
  await f.page.keyboard.press('Escape');await card(f.page).getByRole('button',{name:'移除笔记中的组件',exact:true}).click();await expect.poll(()=>card(f.page).count()).toBe(0)
  const after=await snapshot(f.page);await saveEvidence(f.page,'preserved-selection',{before,afterMore,after,trace:await f.page.evaluate(()=>(window as any).headerTrace)});expect(after.selected).toEqual(['card-a']);expect(after.references).toEqual(['card-a']);expect(after.blocks).toEqual(before.blocks.filter((block:any)=>block.id!=='card-b'));expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('retains body selection, outside closing, mode-change closing and keyboard menu and close actions',async()=>{
 const f=await fixture();try{
  await card(f.page,'card-a').getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await expect.poll(async()=> (await snapshot(f.page)).selected).toEqual(['card-a'])
  const more=card(f.page).getByRole('button',{name:'组件更多操作',exact:true});await more.focus();await more.press('Enter');await f.page.getByRole('menu',{name:'组件更多操作',exact:true}).waitFor();await f.page.keyboard.press('ArrowDown');expect(await f.page.getByRole('menu').evaluate((node:HTMLElement)=>node.contains(document.activeElement))).toBe(true)
  await f.page.getByRole('button',{name:'外部操作',exact:true}).click();await expect.poll(()=>f.page.getByRole('menu').count()).toBe(0)
  await more.click();await f.page.getByRole('menu',{name:'组件更多操作',exact:true}).waitFor();await f.page.evaluate(()=>{document.body.dataset.workspaceSurface='research'});await expect.poll(()=>f.page.getByRole('menu').count()).toBe(0);await f.page.evaluate(()=>{document.body.dataset.workspaceSurface='notes'})
  await card(f.page).getByRole('button',{name:'移除笔记中的组件',exact:true}).focus();await f.page.keyboard.press('Space');await expect.poll(()=>card(f.page).count()).toBe(0);expect(await f.page.evaluate(()=>(window as any).headerTrace.removals)).toEqual([['card-b']]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps readonly controls from removing content or selecting the component',async()=>{
 const f=await fixture(true);try{
  await expect.poll(()=>f.page.evaluate(()=>(window as any).headerEditor.isEditable)).toBe(false);const before=await snapshot(f.page),close=card(f.page).getByRole('button',{name:'移除笔记中的组件',exact:true})
  expect(await close.isDisabled()).toBe(true);await press(f.page,close);await f.page.mouse.up();await card(f.page).getByRole('button',{name:'组件更多操作',exact:true}).click();await f.page.getByRole('menu',{name:'组件更多操作',exact:true}).waitFor()
  const after=await snapshot(f.page);expect(after.blocks).toEqual(before.blocks);expect(after.selected).toEqual([]);expect(after.references).toEqual([]);expect(await f.page.evaluate(()=>(window as any).headerTrace.removals)).toEqual([]);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
