import {afterAll,beforeAll,expect,it} from 'vitest'
import {build,type PluginBuild} from 'esbuild'
import {readFile,mkdtemp,mkdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {NotesStore} from '../src/main/notes/store'
// @ts-expect-error JavaScript browser-fixture loader.
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
let browser:any,script:string,css:string,store:NotesStore,serial=0
const evidence=process.env.SHERLOCK_NATIVE_TABLE_EVIDENCE
beforeAll(async()=>{
 store=new NotesStore(await mkdtemp(resolve(tmpdir(),'sherlock-native-table-store-')))
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import {getDefaultReactSlashMenuItems} from '@blocknote/react';import {TableHandlesExtension} from '@blocknote/core/extensions';import {CellSelection,TableMap} from 'prosemirror-tables';import React from 'react';import {flushSync} from 'react-dom';import {createRoot} from 'react-dom/client';import {NotesApp} from './src/preload/notes/editor';import {withNativeTableSizing} from './src/preload/notes/native-table';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 const query=new URLSearchParams(location.search),sessionId=query.get('session');window.tableCalls=[];window.tableActive=true;window.tableDragTrace=[];for(const type of ['dragstart','dragover','drop','dragend'])document.addEventListener(type,event=>{const state=window.tableEditor?.getExtension(TableHandlesExtension)?.store.state;window.tableDragTrace.push({type,row:event.target?.closest?.('tr')?.rowIndex,x:event.clientX,y:event.clientY,state:state?{rowIndex:state.rowIndex,colIndex:state.colIndex,dragging:state.draggingState}:undefined})},true);
 const bridge={request:async(method,input)=>{window.tableCalls.push({method,input});if(method==='load'||method==='save')return window.tableStore(method,input);if(method==='library-list')return[];return{}},draft:async input=>window.tableStore('draft',input)};
 const saveBinding={ready:flush=>window.tableFlush=flush};let root;const render=()=>{root=createRoot(document.querySelector('#root'));root.render(<NotesApp sessionId={sessionId} bridge={bridge} dark={false} active={window.tableActive} saveBinding={saveBinding} navigate={()=>{}}/>)};
 window.tableSetDark=dark=>{document.querySelector('.en-root').dataset.dark=String(dark);flushSync(()=>root.render(<NotesApp sessionId={sessionId} bridge={bridge} dark={dark} active={window.tableActive} saveBinding={saveBinding} navigate={()=>{}}/>))};window.tableReopen=()=>{root.unmount();render()};window.tableSetActive=active=>{window.tableActive=active;flushSync(()=>root.render(<NotesApp sessionId={sessionId} bridge={bridge} dark={false} active={active} saveBinding={saveBinding} navigate={()=>{}}/>))};render();
 window.tableInsert=()=>withNativeTableSizing(window.tableEditor,()=>window.tableEditor.insertBlocks([{id:'native-table',type:'table',content:{type:'tableContent',headerRows:0,rows:Array.from({length:8},()=>({cells:Array(8).fill('')}))}}],'anchor','after'));
 window.tableSlashInsert=()=>{const editor=window.tableEditor;editor.focus();editor.setTextCursorPosition('anchor','start');withNativeTableSizing(editor,getDefaultReactSlashMenuItems(editor).find(item=>item.key==='table').onItemClick);return editor.getBlock('anchor')};window.tableNativeState=()=>window.tableEditor.getExtension(TableHandlesExtension).store.state;window.tableRange=()=>{const editor=window.tableEditor,state=editor.prosemirrorState,$from=state.selection.$from;for(let depth=$from.depth;depth>0;depth--)if($from.node(depth).type.spec.tableRole==='table'){const map=TableMap.get($from.node(depth)),start=$from.start(depth);editor.prosemirrorView.dispatch(state.tr.setSelection(new CellSelection(state.doc.resolve(start+map.map[0]),state.doc.resolve(start+map.map[9]))));break}};
 window.tableLayout=()=>{const table=document.querySelector('[data-id="native-table"] table'),wrapper=table.closest('.tableWrapper'),rect=table.getBoundingClientRect();return{tableWidth:rect.width,wrapperWidth:wrapper.clientWidth,scrollWidth:wrapper.scrollWidth,scrollLeft:wrapper.scrollLeft,columns:window.tableEditor.getBlock('native-table').content.columnWidths,bodyWidth:document.documentElement.scrollWidth,fontSize:getComputedStyle(table.querySelector('p')).fontSize}};
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'table-fixture.js',logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[esbuildRawSource(),{name:'native-table-immutable-source',setup(b:PluginBuild){if(process.env.SHERLOCK_NATIVE_TABLE_SOURCE)b.onLoad({filter:/preload\/notes\/native-table\.tsx$/},async()=>({loader:'tsx',contents:await readFile(process.env.SHERLOCK_NATIVE_TABLE_SOURCE!,'utf8')}))}},{name:'native-table-editor-observer',setup(b:PluginBuild){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({loader:'tsx',contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.tableEditor=editor;window.tableDoc=doc; const slashMenu = useMemo')}))}},{name:'native-table-inline-css',setup(b:PluginBuild){b.onResolve({filter:/\.css\?inline$/},args=>({path:resolve(args.resolveDir,args.path.slice(0,-7)),namespace:'css-inline'}));b.onLoad({filter:/.*/,namespace:'css-inline'},async args=>({loader:'text',contents:await readFile(args.path,'utf8')}))}}]})
 script=output.outputFiles.find(file=>file.path.endsWith('.js'))!.text;css=output.outputFiles.find(file=>file.path.endsWith('.css'))!.text
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
async function open(width=1100,existing?:number[],frame?:{left:number;right:number}){
 const session='table-'+(++serial),context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',(error:Error)=>errors.push(error.message));page.setDefaultTimeout(3500)
 await page.exposeBinding('tableStore',async(_:unknown,method:string,input:any)=>{if(method==='load')return store.load('table-fixture',session);if(method==='save')return store.save('table-fixture',session,input.revision,input.content,input.clientId);if(method==='draft')return store.draft('table-fixture',session,input.clientId,input.revision,input.content)})
 await page.route('https://native-table.test/**',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="zh"><body data-workspace-surface="notes" style="margin:0"><header data-srb-session-header data-ework-notes-session="'+session+'"></header><section class="en-root" style="left:'+(frame?.left??0)+'px;right:'+(frame?.right??0)+'px"><div id="root" class="en-editor-host"></div></section><button id="outside" style="position:fixed;right:4px;bottom:4px;z-index:999">外部</button></body></html>'}))
 await page.goto('https://native-table.test/?session='+session);await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.bn-editor').waitFor()
 await page.evaluate((existing?:number[])=>{const w=window as any,blocks:any[]=[{id:'intro',type:'paragraph',content:'表格前的原始正文。'},{id:'anchor',type:'paragraph'},{id:'tail',type:'paragraph',content:'表格后的原始正文。'}];if(existing)blocks.splice(2,0,{id:'native-table',type:'table',content:{type:'tableContent',columnWidths:existing,headerRows:0,rows:Array.from({length:8},()=>({cells:Array(8).fill('')}))}});w.tableEditor.replaceBlocks(w.tableEditor.document,blocks)},existing)
 await save(page);await page.evaluate(()=>(window as any).tableReopen());await page.locator('.bn-editor').waitFor();expect(errors).toEqual([])
 return{page,context,session,errors,close:()=>context.close()}
}
async function save(page:any){await page.evaluate(async()=>{await (window as any).tableFlush()})}
async function commandMenu(page:any,kind:'row'|'column'){await page.getByRole('button',{name:'表格操作',exact:true}).click();await page.getByRole('menuitem',{name:kind==='row'?'行操作':'列操作',exact:true}).click()}
async function clickCell(page:any,row=0,col=0){await page.locator('[data-id="native-table"] tr').nth(row).locator('td,th').nth(col).locator('p').click()}
async function proof(page:any,name:string,value:any){if(!evidence)return;await expect.poll(()=>page.evaluate(()=>{const nodes=[...document.querySelectorAll<HTMLElement>('.en-native-table-layer [role=menu]')];return nodes.length?Math.min(...nodes.map(node=>{let opacity=1;for(let item:HTMLElement|null=node;item;item=item.parentElement)opacity*=Number(getComputedStyle(item).opacity);return opacity})):1})).toBeGreaterThan(.95);await mkdir(evidence,{recursive:true});await writeFile(resolve(evidence,name+'.json'),JSON.stringify(value,null,2)+'\n');await page.screenshot({path:resolve(evidence,name+'.png')})}

it('fits a newly inserted editable 8×8 table to the note and persists real cell edits and widths across reopen',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page);await f.page.keyboard.type('收入');await clickCell(f.page,1,1);await f.page.keyboard.type('2026年')
  const layout=await f.page.evaluate(()=>(window as any).tableLayout());await proof(f.page,'new-eight-column-layout',layout)
  expect(layout.tableWidth).toBeLessThanOrEqual(layout.wrapperWidth);expect(layout.columns).toHaveLength(8);expect(layout.columns.every((width:number)=>Number.isFinite(width)&&width>=35)).toBe(true);expect(layout.fontSize).toBe('16px')
  await f.page.getByRole('button',{name:'表格操作',exact:true}).waitFor();await save(f.page);const saved=store.load('table-fixture',f.session).saved,table=saved.blocks.find((block:any)=>block.id==='native-table') as any
  expect(table.content.rows).toHaveLength(8);expect(table.content.rows.every((row:any)=>row.cells.length===8)).toBe(true);expect(JSON.stringify(table.content.rows[0].cells[0])).toContain('收入');expect(JSON.stringify(table.content.rows[1].cells[1])).toContain('2026年')
  await f.page.evaluate(()=>(window as any).tableReopen());await f.page.locator('[data-id="native-table"] table').waitFor();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(table);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('preserves a saved wide table until Fit is requested and keeps its menu clickable in a narrow note',async()=>{
 const old=[180,160,140,120,100,90,80,70],f=await open(476,old);try{
  await clickCell(f.page,2,2);const original=await f.page.evaluate(()=>(window as any).tableLayout());expect(original.columns).toEqual(old);expect(original.tableWidth).toBeGreaterThanOrEqual(940)
  await f.page.getByRole('button',{name:'表格操作',exact:true}).click();const menu=f.page.getByRole('menu',{name:'表格操作',exact:true}),fit=menu.getByRole('menuitem',{name:'适应正文',exact:true})
  expect(await fit.evaluate((node:HTMLElement)=>{const box=node.getBoundingClientRect();return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2))})).toBe(true)
  expect(await menu.evaluate((node:HTMLElement)=>!!node.closest('[popover]:popover-open'))).toBe(true);expect(await f.page.evaluate(()=>(window as any).tableEditor.isWithinEditor(document.activeElement))).toBe(true)
  await proof(f.page,'narrow-top-layer-menu',{old,layout:await f.page.evaluate(()=>(window as any).tableLayout())});await fit.click();const fitLayout=await f.page.evaluate(()=>(window as any).tableLayout());expect(fitLayout.tableWidth).toBeLessThanOrEqual(Math.max(fitLayout.wrapperWidth,281));expect(fitLayout.scrollWidth).toBeGreaterThan(fitLayout.wrapperWidth);expect(fitLayout.bodyWidth).toBe(476)
  await f.page.evaluate(()=>(window as any).tableEditor.undo());expect((await f.page.evaluate(()=>(window as any).tableLayout())).columns).toEqual(old);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('uses native row and column commands, preserves neighboring paragraphs, and supports keyboard menus',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page,2,2);await f.page.keyboard.type('定位格')
  await f.page.getByRole('button',{name:'表格操作',exact:true}).focus();await f.page.keyboard.press('Enter');await f.page.getByRole('menuitem',{name:'行操作',exact:true}).focus();await f.page.keyboard.press('Enter');const row=f.page.getByRole('menu',{name:'行操作',exact:true});await row.waitFor();expect(await row.evaluate((node:HTMLElement)=>node.contains(document.activeElement))).toBe(true)
  await f.page.keyboard.press('ArrowDown');await f.page.keyboard.press('Enter');await expect.poll(()=>f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.rows.length)).toBe(9)
  await commandMenu(f.page,'row');await f.page.getByRole('menuitem',{name:'删除此行',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.rows.length)).toBe(8)
  await clickCell(f.page,1,1);await f.page.keyboard.type('移动格');await commandMenu(f.page,'row');await f.page.getByRole('menuitem',{name:'下移此行',exact:true}).click();expect(await f.page.evaluate(()=>JSON.stringify((window as any).tableEditor.getBlock('native-table').content.rows[2].cells[1]))).toContain('移动格')
  await clickCell(f.page,2,1);await commandMenu(f.page,'column');await f.page.getByRole('menuitem',{name:'右移此列',exact:true}).click();expect(await f.page.evaluate(()=>JSON.stringify((window as any).tableEditor.getBlock('native-table').content.rows[2].cells[2]))).toContain('移动格')
  await clickCell(f.page,2,2);await commandMenu(f.page,'column');await f.page.getByRole('menuitem',{name:'在右侧插入列',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.rows[0].cells.length)).toBe(9)
  await commandMenu(f.page,'column');await f.page.getByRole('menuitem',{name:'删除此列',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.rows[0].cells.length)).toBe(8)
  const blocks=await f.page.evaluate(()=>(window as any).tableEditor.document);expect(blocks.filter((block:any)=>['intro','tail'].includes(block.id)).map((block:any)=>block.content[0].text)).toEqual(['表格前的原始正文。','表格后的原始正文。']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('commits one whole-table resize, cancels previews, and restores that one action with Undo and reopen',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page,1,1);await f.page.keyboard.type('保留单元格');await save(f.page)
  const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table')),separator=f.page.getByRole('separator',{name:'调整表格整体宽度'}),box=await separator.boundingBox()
  await f.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await f.page.mouse.down();await f.page.mouse.move(box.x-160,box.y,{steps:8})
  expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before);const previewEdge=await separator.boundingBox(),previewTable=await f.page.locator('[data-id="native-table"] table').boundingBox();expect(Math.abs(previewEdge.x-previewTable.x-previewTable.width)).toBeLessThan(12);await f.page.keyboard.press('Escape');await f.page.mouse.up();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before)
  const second=await separator.boundingBox();await f.page.mouse.move(second.x+second.width/2,second.y+second.height/2);await f.page.mouse.down();await f.page.mouse.move(second.x-120,second.y,{steps:8});await f.page.mouse.up();const after=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))
  expect(after.content.columnWidths.reduce((a:number,b:number)=>a+b,0)).toBeLessThan(before.content.columnWidths.reduce((a:number,b:number)=>a+b,0));expect(after.content.rows).toEqual(before.content.rows)
  await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before);await f.page.evaluate(()=>(window as any).tableEditor.redo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(after)
  await save(f.page);await f.page.evaluate(()=>(window as any).tableReopen());await f.page.locator('[data-id="native-table"] table').waitFor();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(after);await proof(f.page,'whole-table-drag',{before,after});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps table UI scoped to the current editable note and closes on outside, Escape, mode and active changes',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page);const trigger=f.page.getByRole('button',{name:'表格操作',exact:true})
  await trigger.click();await f.page.getByRole('menu',{name:'表格操作',exact:true}).waitFor();await f.page.keyboard.press('Escape');expect(await f.page.getByRole('menu').count()).toBe(0);expect(await trigger.evaluate((node:HTMLElement)=>node===document.activeElement)).toBe(true)
  await trigger.click();await f.page.locator('#outside').click();expect(await f.page.getByRole('menu').count()).toBe(0)
  await trigger.click();await f.page.evaluate(()=>{document.body.dataset.workspaceSurface='research'});await expect.poll(()=>f.page.locator('.en-native-table-layer:popover-open').count()).toBe(0);expect(await f.page.getByRole('menu').count()).toBe(0)
  await f.page.evaluate(()=>{document.body.dataset.workspaceSurface='notes'});await trigger.waitFor();await trigger.click();await f.page.evaluate(()=>(window as any).tableSetActive(false));await expect.poll(()=>f.page.getByRole('menu').count()).toBe(0);expect(await f.page.getByRole('toolbar',{name:'原生表格操作'}).count()).toBe(0)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps the full row menu inside a short viewport and permits keyboard width adjustments without stealing focus',async()=>{
 const f=await open(600);try{
  await f.page.setViewportSize({width:600,height:360});await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page)
  await commandMenu(f.page,'row');const last=f.page.getByRole('menuitem',{name:'删除此行',exact:true})
  const bounds=await last.boundingBox();await proof(f.page,'short-viewport-menu',{bounds});expect(bounds.y+bounds.height).toBeLessThanOrEqual(360);expect(await last.evaluate((node:HTMLElement)=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})).toBe(true)
  await f.page.keyboard.press('Escape');const handle=f.page.getByRole('separator',{name:'调整表格整体宽度'});await handle.focus();const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths.reduce((a:number,b:number)=>a+b,0));await handle.press('ArrowRight');expect(await handle.evaluate((node:HTMLElement)=>node===document.activeElement)).toBe(true);await handle.press('Shift+ArrowRight');expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths.reduce((a:number,b:number)=>a+b,0))).toBe(before+48);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps the native single-column resize and row drag working through the registered top layer',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page);await f.page.keyboard.type('第一行');await clickCell(f.page,1,0);await f.page.keyboard.type('第二行')
  const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths),first=f.page.locator('[data-id="native-table"] tr').first().locator('td').first(),box=await first.boundingBox()
  await f.page.mouse.move(box.x+box.width-1,box.y+box.height/2);await f.page.mouse.down();await f.page.mouse.move(box.x+box.width+31,box.y+box.height/2,{steps:8});await f.page.mouse.up()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths[0])).toBeGreaterThan(before[0]);const resized=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths);expect(resized.slice(1)).toEqual(before.slice(1))
  await first.locator('p').hover();const grip=f.page.locator('.en-native-table-edge-row .bn-table-handle');await grip.waitFor();expect(await grip.evaluate((node:HTMLElement)=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})).toBe(true)
  await expect.poll(()=>f.page.evaluate(()=>(window as any).tableNativeState().rowIndex)).toBe(0)
  await expect.poll(async()=>{const a=await grip.boundingBox(),b=await first.boundingBox();return Math.abs(a.y+a.height/2-b.y-b.height/2)}).toBeLessThan(2)
  const source=await grip.boundingBox(),destination=await f.page.locator('[data-id="native-table"] tr').nth(2).locator('td').first().boundingBox();await f.page.mouse.move(source.x+source.width/2,source.y+source.height/2);await f.page.mouse.down();await f.page.mouse.move(source.x+source.width+8,source.y+source.height/2,{steps:3});await f.page.mouse.move(destination.x+10,destination.y+destination.height-3,{steps:8});await f.page.mouse.up();await proof(f.page,'native-drag-attempt',await f.page.evaluate(()=>({trace:(window as any).tableDragTrace,rows:(window as any).tableEditor.getBlock('native-table').content.rows})));await expect.poll(()=>f.page.evaluate(()=>JSON.stringify((window as any).tableEditor.getBlock('native-table').content.rows[2].cells[0]))).toContain('第一行')
  await proof(f.page,'native-column-and-row-drag',{before,resized,rows:await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.rows)});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('cancels pointer capture without changing saved widths and leaves Space and composition in cells native',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page,1,1);await f.page.keyboard.press('Space');await f.page.keyboard.type('原生编辑');expect(await f.page.locator('.en-space-ai').count()).toBe(0)
  await save(f.page);const before=store.load('table-fixture',f.session).saved.blocks,handle=f.page.getByRole('separator',{name:'调整表格整体宽度'}),box=await handle.boundingBox()
  await f.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await f.page.mouse.down();await f.page.mouse.move(box.x-80,box.y,{steps:5});await handle.evaluate((node:HTMLElement)=>node.releasePointerCapture(1));await f.page.mouse.up();await save(f.page);expect(store.load('table-fixture',f.session).saved.blocks).toEqual(before)
  await clickCell(f.page,2,2);const cell=f.page.locator('[data-id="native-table"] tr').nth(2).locator('td').nth(2).locator('p');await cell.dispatchEvent('compositionstart',{data:'中'});await cell.dispatchEvent('keydown',{key:' ',code:'Space',isComposing:true});await cell.dispatchEvent('compositionend',{data:'中文'});await f.page.keyboard.type('中文');expect(await f.page.locator('.en-space-ai').count()).toBe(0);expect(await cell.innerText()).toContain('中文');expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)


it('preserves a native multi-cell selection when changing whole-table widths',async()=>{
 const f=await open(1100,[180,160,140,120,100,90,80,70]);try{
  await clickCell(f.page);await f.page.evaluate(()=>(window as any).tableRange());const before=await f.page.evaluate(()=>(window as any).tableEditor.prosemirrorState.selection.toJSON());expect(before.type).toBe('cell')
  await f.page.getByRole('button',{name:'表格操作',exact:true}).click();await f.page.getByRole('menuitem',{name:'适应正文',exact:true}).click();expect(await f.page.evaluate(()=>(window as any).tableEditor.prosemirrorState.selection.toJSON())).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('sizes insertion before its after-snapshot and undoes insertion as one native transaction',async()=>{
 const f=await open();try{
  const before=await f.page.evaluate(()=>(window as any).tableEditor.document)
  const immediate=await f.page.evaluate(()=>{const w=window as any;w.tableInsert();return w.tableEditor.getBlock('native-table')});expect(immediate.content.columnWidths.every((width:number)=>Number.isFinite(width)&&width>=35)).toBe(true)
  await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.document)).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)


it.each(['mode','active'])('unfreezes native handles after %s retirement and applies the next real menu action to the newly hovered row',async transition=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page,2,1);await f.page.keyboard.type('旧行');await clickCell(f.page,5,4);await f.page.keyboard.type('新行');await clickCell(f.page,6,0);await f.page.keyboard.type('后一行')
  await f.page.locator('[data-id="native-table"] tr').nth(2).locator('td').nth(1).locator('p').hover();const grip=f.page.locator('.en-native-table-edge-row .bn-table-handle');await grip.click();await f.page.locator('.bn-table-handle-menu').waitFor()
  if(transition==='mode')await f.page.evaluate(()=>{document.body.dataset.workspaceSurface='research';document.body.dataset.workspaceSurface='notes'})
  else{await f.page.evaluate(()=>(window as any).tableSetActive(false));await f.page.evaluate(()=>(window as any).tableSetActive(true))}
  await expect.poll(()=>f.page.locator('.bn-table-handle-menu').count()).toBe(0)
  const cell=f.page.locator('[data-id="native-table"] tr').nth(5).locator('td').nth(4);await cell.locator('p').hover();await expect.poll(()=>f.page.evaluate(()=>{const state=(window as any).tableNativeState();return[state?.rowIndex,state?.colIndex]})).toEqual([5,4])
  await expect.poll(async()=>{const a=await grip.boundingBox(),b=await cell.boundingBox();return a?Math.abs(a.y+a.height/2-b.y-b.height/2):999}).toBeLessThan(2)
  await grip.click();await f.page.locator('.bn-table-handle-menu').getByRole('menuitem',{name:'下方添加行',exact:true}).click();const rows=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.rows)
  expect(rows).toHaveLength(9);expect(JSON.stringify(rows[2].cells[1])).toContain('旧行');expect(JSON.stringify(rows[5].cells[4])).toContain('新行');expect(rows[6].cells.every((cell:any)=>!cell.content.length)).toBe(true);expect(JSON.stringify(rows[7].cells[0])).toContain('后一行');await proof(f.page,'unfrozen-'+transition,{rows});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)


it('sizes the original native Slash conversion even when the empty paragraph keeps its block ID',async()=>{
 const f=await open();try{
  const table=await f.page.evaluate(()=>(window as any).tableSlashInsert());expect(table.id).toBe('anchor');expect(table.type).toBe('table');expect(table.content.columnWidths.every((width:number)=>Number.isFinite(width)&&width>=35)).toBe(true)
  expect(table.content.columnWidths.reduce((a:number,b:number)=>a+b,0)).toBe(300);expect(table.content.rows).toHaveLength(2);expect(table.content.rows[0].cells).toHaveLength(3);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('retires a native row drag when its note becomes inactive before drop',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page);await f.page.keyboard.type('拖动前保留');const before=await f.page.evaluate(()=>(window as any).tableEditor.document),first=f.page.locator('[data-id="native-table"] tr').first().locator('td').first();await first.locator('p').hover()
  const grip=f.page.locator('.en-native-table-edge-row .bn-table-handle');await expect.poll(()=>f.page.evaluate(()=>(window as any).tableNativeState().rowIndex)).toBe(0);await expect.poll(async()=>{const a=await grip.boundingBox(),b=await first.boundingBox();return Math.abs(a.y+a.height/2-b.y-b.height/2)}).toBeLessThan(2)
  const source=await grip.boundingBox();await f.page.mouse.move(source.x+source.width/2,source.y+source.height/2);await f.page.mouse.down();await f.page.mouse.move(source.x+source.width+20,source.y+source.height/2,{steps:5});await expect.poll(()=>f.page.evaluate(()=>!!(window as any).tableNativeState()?.draggingState)).toBe(true)
  await f.page.evaluate(()=>(window as any).tableSetActive(false));expect(await f.page.evaluate(()=>(window as any).tableEditor.isEditable)).toBe(false);await expect.poll(()=>f.page.evaluate(()=>!!(window as any).tableNativeState()?.draggingState)).toBe(false);await f.page.mouse.up();expect(await f.page.evaluate(()=>(window as any).tableEditor.document)).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('keeps controls icon-only and selects a real native row or column from its thin edge handle',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page,2,2)
  const toolbar=f.page.getByRole('toolbar',{name:'原生表格操作'});expect((await toolbar.innerText()).trim()).toBe('');expect(await toolbar.locator('button').count()).toBe(1)
  const cell=f.page.locator('[data-id="native-table"] tr').nth(2).locator('td').nth(2);await cell.locator('p').hover();const row=f.page.locator('.en-native-table-edge-row .bn-table-handle');await row.click()
  expect(await f.page.evaluate(()=>(window as any).tableEditor.prosemirrorState.selection.toJSON().type)).toBe('cell');expect(await f.page.locator('[data-id="native-table"] tr').nth(2).locator('.selectedCell').count()).toBe(8)
  await f.page.keyboard.press('Escape');await cell.locator('p').hover();const column=f.page.locator('.en-native-table-edge-column .bn-table-handle');await column.click();expect(await f.page.locator('[data-id="native-table"] .selectedCell').count()).toBe(8)
  expect(await f.page.evaluate(()=>{const cells=[...document.querySelectorAll<HTMLTableCellElement>('[data-id="native-table"] .selectedCell')];return cells.every(cell=>cell.cellIndex===2)})).toBe(true)
  await proof(f.page,'column-edge-selection',{selection:await f.page.evaluate(()=>(window as any).tableEditor.prosemirrorState.selection.toJSON())});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('uses a short ten-pixel width grip, keeps the separate add-column target, and persists header toggles',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page,1,1)
  const handle=f.page.getByRole('separator',{name:'调整表格整体宽度'}),bounds=await handle.boundingBox(),table=await f.page.locator('[data-id="native-table"] table').boundingBox()
  expect(bounds.width).toBe(10);expect(bounds.height).toBe(20);expect(bounds.y).toBeGreaterThan(table.y+table.height-50)
  expect(await handle.evaluate((node:HTMLElement)=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})).toBe(true)
  await f.page.getByRole('button',{name:'表格操作',exact:true}).click();await f.page.getByRole('menuitemcheckbox',{name:'标题行',exact:true}).click();expect(await f.page.locator('[data-id="native-table"] tr').first().locator('th').count()).toBe(8)
  await f.page.getByRole('button',{name:'表格操作',exact:true}).click();await f.page.getByRole('menuitemcheckbox',{name:'标题列',exact:true}).click();const block=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'));expect(block.content.headerRows).toBe(1);expect(block.content.headerCols).toBe(1)
  await save(f.page);await f.page.evaluate(()=>(window as any).tableReopen());await f.page.locator('[data-id="native-table"] table').waitFor();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(block)
  await clickCell(f.page,1,1);await f.page.getByRole('button',{name:'表格操作',exact:true}).click();await f.page.getByRole('menuitem',{name:'删除表格',exact:true}).click();expect(await f.page.locator('[data-id="native-table"]').count()).toBe(0);expect(await f.page.locator('.en-native-table-layer [role=menu]').count()).toBe(0);await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(block);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('starts a three-column Slash table at a compact natural width without placeholder text',async()=>{
 const f=await open();try{
  const block=await f.page.evaluate(()=>(window as any).tableSlashInsert());expect(block.content.columnWidths).toEqual([100,100,100]);const table=f.page.locator('[data-id="anchor"] table');expect((await table.innerText()).trim()).toBe('');expect((await table.boundingBox()).width).toBeGreaterThanOrEqual(300);expect((await table.boundingBox()).width).toBeLessThanOrEqual(301)
  await proof(f.page,'compact-empty-table',{columns:block.content.columnWidths});expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)


it('double-clicks the visible width edge to fit an old wide table and prevents accidental oversize whole-table drags',async()=>{
 const f=await open(800,[180,160,140,120,100,90,80,70]);try{
  await clickCell(f.page,2,2);const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table')),handle=f.page.getByRole('separator',{name:'调整表格整体宽度'})
  expect(await handle.count()).toBe(0);await f.page.locator('[data-id="native-table"] .tableWrapper').evaluate((node:HTMLElement)=>{node.scrollLeft=node.scrollWidth});await handle.dblclick();const fit=await f.page.evaluate(()=>(window as any).tableLayout());expect(fit.tableWidth).toBeLessThanOrEqual(fit.wrapperWidth);expect(fit.bodyWidth).toBe(800)
  const box=await handle.boundingBox();await f.page.mouse.move(box.x+box.width/2,box.y+box.height/2);await f.page.mouse.down();await f.page.mouse.move(1800,box.y+box.height/2,{steps:8});await f.page.mouse.up();const after=await f.page.evaluate(()=>(window as any).tableLayout());expect(after.columns.reduce((a:number,b:number)=>a+b,0)).toBe(fit.columns.reduce((a:number,b:number)=>a+b,0));expect(after.bodyWidth).toBe(800)
  await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)


it('keeps compact edge controls and the whole-table menu readable in the real dark note palette',async()=>{
 const f=await open(800);try{
  await f.page.evaluate(()=>(window as any).tableInsert());await f.page.evaluate(()=>(window as any).tableSetDark(true));await clickCell(f.page,2,2);await f.page.getByRole('button',{name:'表格操作',exact:true}).click();const menu=f.page.getByRole('menu',{name:'表格操作',exact:true})
  const colors=await menu.evaluate((node:HTMLElement)=>({background:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color,border:getComputedStyle(node).borderTopColor}));const palette=await f.page.evaluate(()=>{const probe=document.createElement('div');probe.style.cssText='background:var(--en-popup);color:var(--en-ink);border:1px solid var(--en-border)';document.querySelector('.en-root')!.append(probe);const style=getComputedStyle(probe),value={background:style.backgroundColor,color:style.color,border:style.borderTopColor};probe.remove();return value});expect(colors).toEqual(palette);expect(Number(colors.background.match(/\d+/)![0])).toBeLessThan(70);expect(Number(colors.color.match(/\d+/)![0])).toBeGreaterThan(180)
  await proof(f.page,'dark-table-menu',{colors});await f.page.keyboard.press('Escape');expect(await f.page.getByRole('menu').count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)


it.each([false,true])('keeps wide-table add controls inside the note viewport through horizontal scrolling without rewriting saved widths in dark=%s',async dark=>{
 const old=[180,160,140,120,100,90,80,70],f=await open(1200,old,{left:220,right:504});try{
  if(dark)await f.page.evaluate(()=>(window as any).tableSetDark(true));await clickCell(f.page,2,1)
  const table=f.page.locator('[data-id="native-table"] table'),wrapper=f.page.locator('[data-id="native-table"] .tableWrapper'),note=f.page.locator('.en-document-scroll')
  const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))
  for(const fraction of[0,.5,1]){
   await wrapper.evaluate((node:HTMLElement,fraction:number)=>{node.scrollLeft=(node.scrollWidth-node.clientWidth)*fraction},fraction)
   const bounds=await table.boundingBox(),clip=await note.boundingBox(),wrap=await wrapper.boundingBox()
   await f.page.mouse.move(Math.max(bounds.x,wrap.x)+28,bounds.y+bounds.height+8)
   const add=f.page.locator('.bn-extend-button-add-remove-rows');await add.waitFor({state:'visible'});const button=await add.boundingBox()
   await proof(f.page,'wide-add-row-'+dark+'-'+fraction,{dark,fraction,button,clip,wrap})
   expect(button.x).toBeGreaterThanOrEqual(clip.x);expect(button.x+button.width).toBeLessThanOrEqual(clip.x+clip.width)
   expect(button.y+button.height).toBeLessThanOrEqual(clip.y+clip.height)
   expect(await add.evaluate((node:HTMLElement)=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})).toBe(true)
   expect(await add.evaluate((node:HTMLElement)=>getComputedStyle(node).cursor)).toBe('pointer')
   expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before)
  }
  await save(f.page);await f.page.evaluate(()=>(window as any).tableReopen());await table.waitFor();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('preserves existing unequal column widths when adding a column and resizing by keyboard',async()=>{
 const old=[180,160,140,120,100,90,80,70],f=await open(1200,old,{left:220,right:504});try{
  await clickCell(f.page,2,1)
  const wrapper=f.page.locator('[data-id="native-table"] .tableWrapper'),table=f.page.locator('[data-id="native-table"] table')
  await wrapper.evaluate((node:HTMLElement)=>{node.scrollLeft=node.scrollWidth})
  const box=await table.boundingBox();await f.page.mouse.move(box.x+box.width+16,box.y+45)
  const add=f.page.locator('.bn-extend-button-add-remove-columns');await add.waitFor({state:'visible'});await add.click()
  const columns=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths)
  await wrapper.evaluate((node:HTMLElement)=>{node.scrollLeft=node.scrollWidth})
  expect(columns).toHaveLength(9);expect(columns.slice(0,8)).toEqual(old);expect(columns[8]).toBeGreaterThanOrEqual(35)
  const handle=f.page.getByRole('separator',{name:'调整表格整体宽度'});await handle.focus();await handle.press('ArrowLeft')
  const resized=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths)
  expect(resized.reduce((a:number,b:number)=>a+b,0)).toBe(columns.reduce((a:number,b:number)=>a+b,0)-8);expect(resized[0]).toBeGreaterThan(resized[7]*2)
  await save(f.page);await f.page.evaluate(()=>(window as any).tableReopen());await table.waitFor();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths)).toEqual(resized)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('keeps native row and column rails, plus buttons and the short resize grip inside a scrolled note between side panels',async()=>{
 const old=[180,160,140,120,100,90,80,70],f=await open(1200,old,{left:220,right:504});try{
  await f.page.evaluate(()=>{const w=window as any;w.tableEditor.insertBlocks(Array.from({length:10},(_,i)=>({type:'paragraph',content:'滚动前正文 '+i})),'intro','after')})
  await clickCell(f.page,3,1)
  const table=f.page.locator('[data-id="native-table"] table'),wrapper=f.page.locator('[data-id="native-table"] .tableWrapper'),scroll=f.page.locator('.en-document-scroll')
  const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))
  await scroll.evaluate((node:HTMLElement)=>{const table=node.querySelector('[data-id="native-table"] table')!;node.scrollTop+=table.getBoundingClientRect().top-node.getBoundingClientRect().top+60})
  for(const fraction of[0,.5,1]){
   await wrapper.evaluate((node:HTMLElement,fraction:number)=>{node.scrollLeft=(node.scrollWidth-node.clientWidth)*fraction},fraction)
   const row=await table.locator('tr').nth(3).boundingBox(),wrap=await wrapper.boundingBox(),clip=await scroll.boundingBox()
   const hoverX=await table.locator('tr').nth(3).evaluate((node:HTMLTableRowElement)=>{const wrapper=node.closest('.tableWrapper')!.getBoundingClientRect();const cells=[...node.cells].map(cell=>cell.getBoundingClientRect()).map(rect=>({left:Math.max(rect.left,wrapper.left),right:Math.min(rect.right,wrapper.right)})).sort((a,b)=>(b.right-b.left)-(a.right-a.left));return(cells[0]!.left+cells[0]!.right)/2});await f.page.mouse.move(hoverX,row.y+row.height/2)
   const rail=f.page.locator('.en-native-table-edge-row .bn-table-handle');await rail.waitFor({state:'visible'})
   const grip=f.page.getByRole('separator',{name:'调整表格整体宽度'}),actual=await table.boundingBox(),endVisible=actual.x+actual.width<=wrap.x+wrap.width+.5;expect(await grip.count()).toBe(endVisible?1:0)
   for(const control of[rail,f.page.locator('.en-native-table-edge-column .bn-table-handle'),f.page.getByRole('button',{name:'添加列',exact:true}),...(endVisible?[grip]:[])]){
    const bounds=await control.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(clip.x);expect(bounds.x+bounds.width).toBeLessThanOrEqual(clip.x+clip.width);expect(bounds.y).toBeGreaterThanOrEqual(clip.y);expect(bounds.y+bounds.height).toBeLessThanOrEqual(clip.y+clip.height)
    expect(await control.evaluate((node:HTMLElement)=>{const b=node.getBoundingClientRect();return node.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))})).toBe(true)
   }
   const add=f.page.getByRole('button',{name:'添加列',exact:true}),a=await add.boundingBox(),b=endVisible?await grip.boundingBox():undefined;if(b)expect(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y).toBe(true)
   await proof(f.page,'nested-scroll-rails-'+fraction,{clip,wrap,add:a,resize:b,table:await table.boundingBox()})
   expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before)
  }
  await f.page.getByRole('button',{name:'添加行',exact:true}).click();expect(await table.locator('tr').count()).toBe(9);expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths)).toEqual(old)
  await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('fills a newly inserted native menu column on width adjustment without flattening earlier unequal columns',async()=>{
 const old=[180,160,140,120,100,90,80,70],f=await open(1200,old,{left:220,right:504});try{
  await clickCell(f.page,2,1);await commandMenu(f.page,'column');await f.page.getByRole('menuitem',{name:'在右侧插入列',exact:true}).click()
  const columns=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths);expect(columns.slice(0,2)).toEqual(old.slice(0,2));expect(columns.slice(3)).toEqual(old.slice(2))
  await f.page.locator('[data-id="native-table"] .tableWrapper').evaluate((node:HTMLElement)=>{node.scrollLeft=node.scrollWidth});const grip=f.page.getByRole('separator',{name:'调整表格整体宽度'});await grip.focus();await grip.press('ArrowLeft');const after=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths)
  expect(after.every((width:number)=>Number.isFinite(width)&&width>=35)).toBe(true);expect(after[0]).toBeGreaterThan(after[8]*2);expect(after[0]).toBeGreaterThan(170)
  await save(f.page);await f.page.evaluate(()=>(window as any).tableReopen());await f.page.locator('[data-id="native-table"] table').waitFor();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table').content.columnWidths)).toEqual(after);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('inserts from Feishu-style blue boundary hotspots with native undo and preserves the original hundred-pixel columns',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableSlashInsert());const table=f.page.locator('[data-id="anchor"] table')
  await table.locator('tr').nth(0).locator('td').nth(1).locator('p').click();await f.page.keyboard.type('原第二列')
  await table.locator('tr').nth(1).locator('td').nth(0).locator('p').click();await f.page.keyboard.type('原第二行')
  const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('anchor'));const toolbar=await f.page.getByRole('toolbar',{name:'原生表格操作'}).boundingBox();expect(toolbar.width).toBe(44);expect(toolbar.height).toBe(30);expect((await table.locator('tr').first().boundingBox()).height).toBe(40)
  const insert=f.page.locator('[data-note-table-insert-column="1"]');await insert.hover();await expect.poll(()=>insert.evaluate((node:HTMLElement)=>Number(getComputedStyle(node).opacity))).toBe(1)
  const hot=await insert.boundingBox();expect(hot.width).toBe(22);expect(hot.height).toBe(24);expect(await insert.evaluate((node:HTMLElement)=>getComputedStyle(node).cursor)).toBe('pointer')
  const line=await f.page.locator('.en-native-table-insert-line').boundingBox();expect(line.width).toBe(1);expect(line.height).toBeGreaterThan(55);await proof(f.page,'blue-column-boundary',{hot,line});await insert.click()
  const after=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('anchor'));expect(after.content.columnWidths).toEqual([100,100,100,100]);expect(after.content.rows[0].cells).toHaveLength(4);expect(JSON.stringify(after.content.rows[0].cells[2])).toContain('原第二列')
  expect(await f.page.evaluate(()=>(window as any).tableEditor.prosemirrorState.selection.$from.parent.textContent)).toBe('')
  await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('anchor'))).toEqual(before);await f.page.evaluate(()=>(window as any).tableEditor.redo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('anchor'))).toEqual(after);await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('anchor'))).toEqual(before)
  const addRow=f.page.locator('[data-note-table-insert-row="1"]');await addRow.hover();await expect.poll(()=>addRow.evaluate((node:HTMLElement)=>Number(getComputedStyle(node).opacity))).toBe(1);await addRow.click()
  const row=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('anchor'));expect(row.content.rows).toHaveLength(3);expect(row.content.columnWidths).toEqual([100,100,100]);expect(JSON.stringify(row.content.rows[2].cells[0])).toContain('原第二行')
  await save(f.page);await f.page.evaluate(()=>(window as any).tableReopen());await table.waitFor();expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('anchor'))).toEqual(row);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('opens the real native row menu by right-clicking its ten-pixel rail and leaves column hover transitions lightweight',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>(window as any).tableInsert());await clickCell(f.page,2,2)
  const cell=f.page.locator('[data-id="native-table"] tr').nth(2).locator('td').nth(2);await cell.locator('p').hover()
  const rail=f.page.locator('.en-native-table-edge-row .bn-table-handle');await rail.click({button:'right'});const menu=f.page.locator('.bn-table-handle-menu');await menu.waitFor();expect(await menu.getByRole('menuitem',{name:'下方添加行',exact:true}).count()).toBe(1)
  await menu.getByRole('menuitem',{name:'下方添加行',exact:true}).click();expect(await f.page.locator('[data-id="native-table"] tr').count()).toBe(9);await expect.poll(()=>menu.count()).toBe(0)
  await cell.locator('p').hover();const column=f.page.locator('.en-native-table-edge-column .bn-table-handle');await column.hover();expect((await column.boundingBox()).height).toBe(10);expect(await column.evaluate((node:HTMLElement)=>getComputedStyle(node).transitionDuration)).not.toBe('0s');await column.click({button:'right'});await menu.waitFor();expect(await menu.getByRole('menuitem',{name:'右侧添加列',exact:true}).count()).toBe(1)
  await f.page.keyboard.press('Escape');await expect.poll(()=>menu.count()).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)

it('reveals Add Row only at the actual bottom of a long native table and reaches it by normal note scrolling',async()=>{
 const f=await open(1200,[180,160,140,120,100,90,80,70],{left:220,right:504});try{
  await f.page.evaluate(()=>{const w=window as any,block=w.tableEditor.getBlock('native-table');w.tableEditor.updateBlock(block,{content:{...block.content,rows:Array.from({length:30},()=>({cells:Array(8).fill('')}))}})});await clickCell(f.page,2,1)
  const scroll=f.page.locator('.en-document-scroll'),add=f.page.getByRole('button',{name:'添加行',exact:true});expect(await add.count()).toBe(0)
  await scroll.evaluate((node:HTMLElement)=>{node.scrollTop=node.scrollHeight});await add.waitFor({state:'visible'});const box=await add.boundingBox(),note=await scroll.boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(note.y+note.height)
  const before=await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'));await add.click();expect(await f.page.locator('[data-id="native-table"] tr').count()).toBe(31);expect(await f.page.evaluate(()=>(window as any).tableEditor.prosemirrorState.selection.$from.parent.textContent)).toBe('')
  await f.page.evaluate(()=>(window as any).tableEditor.undo());expect(await f.page.evaluate(()=>(window as any).tableEditor.getBlock('native-table'))).toEqual(before);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)


it('keeps the native last-column context menu fully readable and clickable inside a narrow note',async()=>{
 const f=await open(1200,[180,160,140,120,100,90,80,70],{left:220,right:504});try{
  await clickCell(f.page,2,1);await f.page.locator('[data-id="native-table"] .tableWrapper').evaluate((node:HTMLElement)=>{node.scrollLeft=node.scrollWidth})
  const cell=f.page.locator('[data-id="native-table"] tr').nth(2).locator('td').nth(7);await cell.locator('p').hover();const rail=f.page.locator('.en-native-table-edge-column .bn-table-handle');await rail.click({button:'right'})
  const menu=f.page.getByRole('menu',{name:'列操作',exact:true});await menu.waitFor();const note=await f.page.locator('.en-document-scroll').boundingBox(),bounds=await menu.boundingBox();await proof(f.page,'narrow-last-column-menu',{note,bounds})
  expect(bounds.x).toBeGreaterThanOrEqual(note.x);expect(bounds.x+bounds.width).toBeLessThanOrEqual(note.x+note.width);expect(bounds.y).toBeGreaterThanOrEqual(note.y);expect(bounds.y+bounds.height).toBeLessThanOrEqual(note.y+note.height)
  const last=menu.getByRole('menuitem',{name:'右侧添加列',exact:true});expect(await last.evaluate((node:HTMLElement)=>{const box=node.getBoundingClientRect();return node.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2))})).toBe(true);await last.click();expect(await f.page.locator('[data-id="native-table"] tr').first().locator('td').count()).toBe(9);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
