import {afterAll, beforeAll, expect, it} from 'vitest'
import {build} from 'esbuild'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'

let browser,script,css
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React from 'react';import {createRoot} from 'react-dom/client';import {createPortal} from 'react-dom';import {NotesApp} from './src/preload/notes/editor';import {attachPptxDirectEditor} from './scripts/lib/pptx-direct-editor.mjs';import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
 window.attachPpt=attachPptxDirectEditor;window.noteRequests=[];const views=new Map(),portal=createRoot(document.querySelector('#portals'));const publish=()=>portal.render(<>{[...views.values()].map(entry=><React.Fragment key={entry.instanceId}>{createPortal(<header className="ew-grid-header"><strong>导入后标题</strong><button onPointerDown={e=>e.stopPropagation()}>菜单</button></header>,entry.header)}{createPortal(<div className="en-file-native-reader" data-ppt-editor style={{height:180}}>原生合成预览</div>,entry.host)}</React.Fragment>)}</>);document.addEventListener('sherlock:notes-file-view',event=>{const value=event.detail;if(value.remove)views.delete(value.instanceId);else{const host=document.getElementById(value.hostId),header=document.getElementById(value.headerId);if(host&&header){host.dataset.noteFileRendered='true';header.dataset.noteFileRendered='true';views.set(value.instanceId,{...value,host,header})}}publish()});
 const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:{title:'导入生命周期验收',blocks:[],yjs:'',revision:0}};if(method==='file-bind')return {previewSessionId:'synthetic'};if(method==='file-admit')return await new Promise(resolve=>window.finishAdmit=()=>resolve({id:input.nodeId,name:input.name,source:'computer',authorizationId:'synthetic-grant',noteSize:{height:180}}));if(method==='save')return {status:'saved',saved:{...input.content,revision:input.revision+1}};if(method==='library-list')return [];return {}},draft:async()=>{}};createRoot(document.querySelector('#notes')).render(<NotesApp sessionId="import-test" bridge={bridge} dark={false} navigate={()=>{}}/>);
 `},bundle:true,platform:'browser',conditions:['browser','import','style'],format:'iife',write:false,outfile:'fixture.js',define:{'process.env.NODE_ENV':'"production"'},loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},plugins:[{name:'import-test-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const runtime=process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(runtime).href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
})
afterAll(async()=>browser?.close())
async function admittedFile(){
 const context=await browser.newContext({viewport:{width:1200,height:900}}),page=await context.newPage()
 await page.route('http://127.0.0.1/notes-import-interaction',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,interactive-widget=resizes-content"><section id="notes" class="en-root" style="position:fixed;inset:0"><div class="en-editor-host"></div></section><div id="portals"></div>'}));await page.goto('http://127.0.0.1/notes-import-interaction');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.locator('.en-title').waitFor()
 await page.evaluate(()=>{const target=document.querySelector('.bn-inline-content'),r=target.getBoundingClientRect(),transfer=new DataTransfer();transfer.setData('application/x-sherlock-file',JSON.stringify({sessionId:'import-test',name:'新导入.pptx',relativePath:'synthetic.pptx'}));target.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer,clientX:r.left+5,clientY:r.bottom-1}))})
 await page.locator('.en-file-import').waitFor();await page.evaluate(()=>window.finishAdmit());await page.locator('.en-file-native-reader').waitFor()
 return {context,page}
}
it('selects the header after a real NotesApp file drop transitions from importing to an admitted reader',async()=>{
 const {context,page}=await admittedFile();try{await page.getByText('导入后标题',{exact:true}).click();expect(await page.locator('.en-note-file').getAttribute('data-selected')).toBe('true');expect(await page.evaluate(()=>window.noteEditor.document.filter(x=>x.type==='attachment').length)).toBe(1)}finally{await context.close()}
},15000)
it('uses the paragraph alignment commands on an imported file frame while preserving the file authorization',async()=>{
 const {context,page}=await admittedFile();try{
  const frame=page.locator('.en-note-file');await frame.getByText('导入后标题',{exact:true}).click();await frame.getByRole('separator',{name:'调整组件宽度',exact:true}).press('Home')
  const positions=[]
  for(const [label,value] of [['左对齐','left'],['居中','center'],['右对齐','right']]){
   await frame.locator('.en-file-header').hover();await page.getByRole('button',{name:'段落操作',exact:true}).click();await page.locator('.en-block-menu').getByRole('button',{name:label,exact:true}).click();positions.push((await frame.boundingBox()).x)
   expect(await page.evaluate(()=>window.noteEditor.document.find(b=>b.type==='attachment').props.textAlignment)).toBe(value)
  }
  expect(positions[1]).toBeGreaterThan(positions[0]);expect(positions[2]).toBeGreaterThan(positions[1]);expect(await page.evaluate(()=>JSON.parse(window.noteEditor.document.find(b=>b.type==='attachment').props.payload).authorizationId)).toBe('synthetic-grant')
 }finally{await context.close()}
},15000)
for(const overlap of [true,false])it(`keeps the outside note handle and inside PPT object handle independent after file admission (${overlap?'overlapping outside':'inside object'})`,async()=>{
 const {context,page}=await admittedFile();try{
  await page.getByRole('button',{name:'选中文件并操作预览',exact:true}).click()
  const geometry=await page.evaluate(overlap=>{const root=document.querySelector('.en-note-file'),host=root.querySelector('.en-file-native-reader'),r=root.getBoundingClientRect(),h=host.getBoundingClientRect(),resize=root.querySelector('.en-component-resize-width').getBoundingClientRect(),x=overlap?resize.left+resize.width/2:r.right-2,y=resize.top+resize.height/2,shape=document.createElement('div');shape.dataset.pptxPart='slide1';shape.dataset.pptxNodeId='shape';shape.style.cssText='position:absolute;right:'+(h.right-x)+'px;top:'+(y-h.top-50)+'px;width:160px;height:100px;';host.append(shape);const node={id:'slide1#node:shape',part:'slide1',nodeId:'shape',geometry:{x:0,y:0,width:160,height:100}},entry={document:{slides:[{part:'slide1',nodes:[node],fields:[]}]},objects:{},values:{}};window.objectChanges=[];window.ppt=window.attachPpt(host,{getEntry:()=>entry,changeObject:(_id,change)=>window.objectChanges.push(change),begin(){},end(){},render(){}});window.ppt.selectId(node.id);return {x,y,width:r.width,hit:document.elementFromPoint(x,y)?.dataset.pptxHandle}},overlap)
  // The accepted PPT viewport clips its object handles at the reader edge;
  // the note handle lives outside it and remains directly reachable.
  if(overlap)expect(await page.locator('.en-component-resize-width').evaluate(el=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===el})).toBe(true)
  else expect(geometry.hit).toBe('e')
  await page.mouse.move(geometry.x,geometry.y);await page.mouse.down();await page.mouse.move(geometry.x-100,geometry.y,{steps:5});await page.mouse.up()
  expect(await page.locator('.en-note-file').boundingBox().then(r=>r.width)).toBe(overlap?geometry.width-100:geometry.width)
  if(overlap)expect(await page.evaluate(()=>window.objectChanges)).toEqual([]);else expect(await page.evaluate(()=>window.objectChanges.at(-1)?.geometry.width)).toBe(60)
  expect(await page.locator('.en-note-file').getAttribute('data-selected')).toBe('true')
 }finally{await context.close()}
},15000)
