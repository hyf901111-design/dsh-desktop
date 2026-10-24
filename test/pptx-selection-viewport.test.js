import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {readPptxScene} from '../src/main/pptx/scene'

const requireModule=createRequire(import.meta.url)
const {patchSherlockOfficePreviewClient}=requireModule('../scripts/lib/patch-sherlock-office-preview.mjs')
const {patchPptxResize,stripPptxResizePatch}=requireModule('../scripts/lib/pptx-resize-settle.mjs')
const {patchPptxEditor}=requireModule('../scripts/lib/pptx-editor-ui.mjs')
const {ResearchAttachmentLocalPreview}=requireModule('../scripts/lib/attachment-client.mjs')
let browser,script,css,officeScript,bytes,model

beforeAll(async()=>{
 const conversation=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const reader=conversation.slice(conversation.indexOf('function supportsResearchOfficePreview('),conversation.indexOf('function ResearchCanvasFileCard('))
 const sharedIdentity=conversation.match(/const sherlockShared = [^\n]+/)[0]
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
  import React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';
  import {WorkbenchChrome,WorkbenchTitle,WorkbenchIcon} from './scripts/lib/research-grid-ui.mjs';
  import {createNoteFileViewStore,EWorkNoteFileViews} from './scripts/lib/notes-files.mjs';import {NotesApp} from './src/preload/notes/editor';
  import '@blocknote/mantine/style.css';import './src/preload/notes/style.css';
  const react=React,react_jsx_runtime=jsx,useWorkbenchLocale=()=>{},workbenchText=x=>x;${sharedIdentity}${reader}
  window.useComponentPptxMode=useComponentPptxMode;window.componentPptxModeHost=componentPptxModeHost;window.sherlockShared=sherlockShared;
  window.react=React;window.react_jsx_runtime=jsx;window.react_dom=dom;window.WorkbenchChrome=WorkbenchChrome;window.WorkbenchTitle=WorkbenchTitle;window.WorkbenchIcon=WorkbenchIcon;
  window.componentDataStatusStore={subscribe:()=>()=>{},read:()=>null};window.componentRssStatusView=()=>null;
  window.ResearchAttachmentLocalPreview=${ResearchAttachmentLocalPreview.toString()};window.eworkNoteFileViews=createNoteFileViewStore(document);
  window.eworkNoteOfficePreview={subscribe:()=>()=>{},getSnapshot:()=>window.office.officePreviewService};
  window.dshDesktop={researchPreview:{restore:async()=>({url:'sherlock-preview://selection-fixture/',authorizationId:'fixture-grant',capabilityToken:'fixture'}),release(){}}};
  window.__ModuleLoader__={load:descriptor=>{window.office=descriptor.factory(id=>({'react':React,'react/jsx-runtime':jsx,'react-dom':dom}[id]))}};
  window.mountNotes=width=>{
   const views=document.createElement('div');document.body.append(views);createRoot(views).render(<EWorkNoteFileViews sessionId="selection-fixture" active/>);
   window.fixtureBlocks=[{id:'fixture-file-block',type:'attachment',props:{payload:JSON.stringify({id:'fixture-file',name:'多页演示.pptx',source:'computer',authorizationId:'fixture-grant',noteSize:{width,height:520}})}},...Array.from({length:30},(_,i)=>({id:'tail-'+i,type:'paragraph',content:'后续笔记段落 '+i}))];
   const bridge={request:async(method,input)=>method==='load'?{saved:{title:'选择边界验收',blocks:window.fixtureBlocks,yjs:'',revision:0}}:method==='file-bind'?{previewSessionId:'selection-fixture'}:method==='save'?{status:'saved',saved:{...input.content,revision:input.revision+1}}:method==='library-list'?[]:{},draft:async()=>{}};
   createRoot(document.querySelector('.en-editor-host')).render(<NotesApp sessionId="selection-fixture" bridge={bridge} dark={false} navigate={()=>{}}/>);
  };
 `},bundle:true,conditions:['browser','import','style'],platform:'browser',format:'iife',write:false,outfile:'selection-fixture.js',loader:{'.woff':'dataurl','.woff2':'dataurl','.svg':'dataurl'},define:{'process.env.NODE_ENV':'"production"'},plugins:[{name:'expose-fixture-note-editor',setup(b){b.onLoad({filter:/preload\/notes\/editor\.tsx$/},async args=>({contents:(await readFile(args.path,'utf8')).replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo'),loader:'tsx'}))}}]})
 script=output.outputFiles.find(f=>f.path.endsWith('.js')).text;css=output.outputFiles.find(f=>f.path.endsWith('.css')).text
 const raw=await readFile('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js','utf8')
 officeScript=patchPptxEditor(patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(raw))))
 bytes=await readFile('skills/efund-ppt-maker/assets/efund-ai-platform-v21.pptx');model={...readPptxScene(bytes),id:'selection-fixture',name:'多页演示.pptx',version:'1'.repeat(64)}
 const imported=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (imported.chromium||imported.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>{await browser?.close()})

async function fixture(width){
 const context=await browser.newContext({viewport:{width:1100,height:850}}),page=await context.newPage(),errors=[]
 page.setDefaultTimeout(5000)
 page.on('pageerror',error=>errors.push(error.message))
 try{
 await page.route('http://127.0.0.1/pptx-selection-fixture',route=>route.fulfill({contentType:'text/html',body:'<style>html,body{margin:0}#notes{position:fixed;top:90px;left:30px;width:1030px;height:680px;overflow:hidden}.en-editor-host{height:100%}.en-file-native-reader{width:100%;height:100%;min-height:0}</style><section id="notes" class="en-root"><div class="en-editor-host"></div></section>'}))
 await page.route('http://127.0.0.1/fixture.pptx',route=>route.fulfill({body:bytes}))
 await page.goto('http://127.0.0.1/pptx-selection-fixture');await page.addStyleTag({content:css})
 await page.evaluate(model=>{window.pptSaves=[];window.pptOpenCalls=0;window.sherlockPptEditor={open:async()=>{window.pptOpenCalls++;return{ok:true,document:model}},save:async request=>{window.pptSaves.push(request);return{ok:true,document:{...model,version:'2'.repeat(64)}}}};const original=window.fetch;window.fetch=(url,options)=>original(String(url).startsWith('sherlock-preview:')?'/fixture.pptx':url,options)},model)
 await page.addScriptTag({content:script});await page.addScriptTag({content:officeScript});await page.evaluate(width=>window.mountNotes(width),width)
 await page.locator('.en-title').waitFor();await page.evaluate(()=>window.noteEditor.replaceBlocks(window.noteEditor.document,window.fixtureBlocks))
 try{
  await page.locator('[data-pptx-paragraph]').first().waitFor()
  expect(await page.evaluate(()=>window.pptOpenCalls)).toBe(0)
  expect(await page.locator('[data-pptx-paragraph][contenteditable=true]').count()).toBe(0)
  expect(await page.locator('.sherlock-ppt-selection').count()).toBe(0)
  // Use the actual Notes file component footer rather than bypassing its host.
  await page.getByRole('button',{name:'选中文件并操作预览',exact:true}).click()
  const edit=page.locator('.en-file-native-reader [data-component-pptx-edit]')
  await edit.waitFor();expect(await edit.getAttribute('aria-pressed')).toBe('false')
  await edit.click()
  await page.locator('[data-pptx-paragraph][contenteditable=true]').first().waitFor()
  expect(await page.evaluate(()=>window.pptOpenCalls)).toBe(1)
  expect(await edit.getAttribute('aria-pressed')).toBe('true')
 }catch(error){console.log({errors,body:await page.locator('body').innerText()});throw error}
 // This Notes baseline fills the document width; size the component viewport
 // explicitly so both cases exercise the claimed native-reader dimensions.
 await page.locator('.en-note-file').evaluate((el,width)=>{el.style.width=width+'px'},width)
 await expect.poll(()=>page.locator('.dsh_32k8zk_editorPptxHost').evaluate(el=>el.clientWidth)).toBe(width)
 const paragraph=page.locator('[data-pptx-paragraph][contenteditable=true]').first();await paragraph.click()
 await page.getByRole('toolbar',{name:'对象格式'}).waitFor()
 await page.evaluate(()=>{window.selectedPptNode=document.querySelector('[data-pptx-field-id]').closest('[data-pptx-node-id]')})
 return{page,context,errors,reader:page.locator('.dsh_32k8zk_editorPptxHost'),toolbar:page.getByRole('toolbar',{name:'对象格式',includeHidden:true}),outline:page.locator('.sherlock-ppt-selection')}
 }catch(error){await context.close();throw error}
}

for(const width of [360,686])it(`clips selection to the ${width}px Notes reader while keeping the draggable toolbar outside the card`,async()=>{
 const v=await fixture(width),{page,reader,toolbar,outline}=v
 try{
  expect(await toolbar.evaluate(el=>el.parentElement===document.body)).toBe(true)
  const name=await toolbar.locator('.sherlock-ppt-object-name').textContent()
  // Keep the user's manually chosen toolbar offset through hide/restore.
  const handle=toolbar.getByRole('button',{name:'拖动格式工具栏'})
  await handle.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown')
  const offset=await toolbar.boundingBox()
  const half=await page.evaluate(()=>{const node=window.selectedPptNode.getBoundingClientRect(),root=document.querySelector('.dsh_32k8zk_editorPptxHost').getBoundingClientRect();return node.top-root.top+node.height/2})
  await reader.hover();await page.mouse.wheel(0,half)
  await expect.poll(()=>page.evaluate(()=>window.selectedPptNode.getBoundingClientRect().top<document.querySelector('.dsh_32k8zk_editorPptxHost').getBoundingClientRect().top)).toBe(true)
  const clipping=await page.evaluate(()=>{const root=document.querySelector('.dsh_32k8zk_editorPptxHost').getBoundingClientRect(),bar=document.querySelector('.sherlock-ppt-format').getBoundingClientRect(),corner=document.querySelector('[data-pptx-handle=nw]').getBoundingClientRect();return{top:root.top,left:root.left,bottom:Math.min(root.bottom,770),right:root.right,bar:bar.toJSON(),cornerHit:document.elementsFromPoint(corner.x+corner.width/2,corner.y+corner.height/2).some(el=>el.closest('.sherlock-ppt-selection'))}})
  expect(clipping.cornerHit).toBe(false)
  // The selection belongs to the reader, but its body portal toolbar must use
  // the whole client window. A narrow card must not force a second tool row.
  expect(clipping.bar.width).toBeGreaterThan(width)
  expect(clipping.bar.height).toBeLessThanOrEqual(48)
  expect(clipping.bar.left).toBeGreaterThanOrEqual(8);expect(clipping.bar.right).toBeLessThanOrEqual(1092)
  expect(clipping.bar.top).toBeGreaterThanOrEqual(8);expect(clipping.bar.bottom).toBeLessThanOrEqual(842)
  if(width===686&&process.env.SHERLOCK_PPT_SELECTION_SCREENSHOT)await page.screenshot({path:process.env.SHERLOCK_PPT_SELECTION_SCREENSHOT})
  await page.mouse.wheel(0,100)
  await expect.poll(()=>toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden')
  expect(await outline.evaluate(el=>getComputedStyle(el).display)).toBe('none')
  expect(await page.evaluate(()=>window.selectedPptNode.isConnected)).toBe(true)
  await page.mouse.wheel(0,-half-100)
  await expect.poll(()=>toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
  expect(await toolbar.locator('.sherlock-ppt-object-name').textContent()).toBe(name)
  const restored=await toolbar.boundingBox();expect(restored.x).toBeCloseTo(offset.x,0);expect(restored.y).toBeCloseTo(offset.y,0)
  await reader.hover();await page.mouse.wheel(0,10000)
  await expect.poll(()=>page.evaluate(()=>window.selectedPptNode.isConnected)).toBe(false)
  expect(await toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden');expect(await outline.evaluate(el=>getComputedStyle(el).display)).toBe('none')
  await page.mouse.wheel(0,-10000)
  await expect.poll(()=>toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
  expect(await toolbar.locator('.sherlock-ppt-object-name').textContent()).toBe(name)
  expect(await page.locator('[data-pptx-field-id][contenteditable=true]').count()).toBeGreaterThan(0)
  expect(await page.evaluate(()=>window.pptSaves.length)).toBe(0);expect(v.errors).toEqual([])
 }finally{await v.context.close()}
},20000)

it('keeps the toolbar floating above a reader with only a small visible slice',async()=>{
 const v=await fixture(686),{page,reader,toolbar,outline}=v
 try{
  const delta=await page.evaluate(()=>window.selectedPptNode.getBoundingClientRect().top-document.querySelector('.dsh_32k8zk_editorPptxHost').getBoundingClientRect().top-5)
  await reader.hover();await page.mouse.wheel(0,delta)
  await expect.poll(()=>reader.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  const bounds=await reader.boundingBox();await page.setViewportSize({width:1100,height:Math.floor(bounds.y+14)})
  await expect.poll(()=>toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
  expect(await outline.evaluate(el=>getComputedStyle(el).display)).toBe('block')
  const bar=await toolbar.boundingBox()
  expect(bar.y).toBeGreaterThanOrEqual(8);expect(bar.y+bar.height).toBeLessThanOrEqual(Math.floor(bounds.y+14)-8)
  await page.setViewportSize({width:1100,height:850})
  await expect.poll(()=>toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
  expect(v.errors).toEqual([])
 }finally{await v.context.close()}
},20000)

it('hides and restores the retained selection when real outer Notes wheel clips the reader',async()=>{
 const v=await fixture(686),{page,toolbar,outline}=v
 try{
  const name=await toolbar.locator('.sherlock-ppt-object-name').textContent(),outer=page.locator('.en-document-scroll')
  const delta=await page.evaluate(()=>window.selectedPptNode.getBoundingClientRect().bottom-document.querySelector('.en-document-scroll').getBoundingClientRect().top+20)
  const bounds=await outer.boundingBox();await page.mouse.move(bounds.x+8,bounds.y+bounds.height/2);await page.mouse.wheel(0,delta)
  await expect.poll(()=>outer.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  await expect.poll(()=>toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('hidden')
  expect(await outline.evaluate(el=>getComputedStyle(el).display)).toBe('none')
  // The selected element can remain inside window while clipped by Notes.
  expect(await page.evaluate(()=>window.selectedPptNode.getBoundingClientRect().bottom)).toBeGreaterThan(0)
  await page.mouse.wheel(0,-delta)
  await expect.poll(()=>toolbar.evaluate(el=>getComputedStyle(el).visibility)).toBe('visible')
  expect(await toolbar.locator('.sherlock-ppt-object-name').textContent()).toBe(name)
  expect(await page.evaluate(()=>window.pptSaves.length)).toBe(0);expect(v.errors).toEqual([])
 }finally{await v.context.close()}
},20000)
