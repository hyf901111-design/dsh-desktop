import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {readFileSync} from 'node:fs'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
let browser:any,script=''
const entry='\0notes-html-shared-state-fixture',evidence=process.env.SHERLOCK_NOTES_SHARED_HTML_EVIDENCE
beforeAll(async()=>{
 const patched=notesResidentProductionSource()
 const native=patched.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-html-shared-state-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React from 'react';import * as jsxRuntime from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';import {NotesApp} from ${JSON.stringify(resolve('src/preload/notes/editor.tsx'))};
 import blockStyles from '@blocknote/mantine/style.css?inline';import noteStyles from ${JSON.stringify(resolve('src/preload/notes/style.css')+'?inline')};
 const style=document.createElement('style');style.textContent=blockStyles+'\\n'+noteStyles;document.head.append(style);
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(native)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const nativeExports=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='react-dom'?ReactDOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 const spec={version:1,type:'html',title:'原位图表验收二',html:${JSON.stringify(readFileSync(resolve('test/fixtures/notes-offline-shared-chart.html'),'utf8'))}};
 window.noteSaved={title:'HTML交互保存验收',blocks:[{id:'upper',type:'paragraph',content:'上文保留'},{id:'chart',type:'research',props:{payload:JSON.stringify({id:'note-html',title:spec.title,kind:'generated-container',noteLibrary:true,containerSpec:spec,noteSize:{width:656,height:430}})}},{id:'tail',type:'paragraph',content:'下文保留'}],yjs:'',revision:0,updatedAt:0};
 window.noteRequests=[];window.noteAcks=[];window.noteActions=[];window.saveMode='ok';window.saveWaiters=[];window.frameLoads=0;
 document.addEventListener('sherlock:notes-component-ack',e=>window.noteAcks.push(e.detail));document.addEventListener('sherlock:notes-component-action',e=>window.noteActions.push(e.detail));
 document.addEventListener('load',e=>{if(e.target?.matches?.('iframe[data-research-html-artifact]'))window.frameLoads++},true);
 const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:window.noteSaved};if(method==='save'){const mode=window.saveMode;if(mode==='fail')throw Error('演示保存失败');if(mode==='hold'){await new Promise(resolve=>window.saveWaiters.push(resolve));if(window.saveMode==='fail')throw Error('演示保存失败')}window.noteSaved={...input.content,revision:input.revision+1};return {status:'saved',saved:window.noteSaved}}return {ok:true}},draft:async()=>{}};
 let flush=async()=>{};const saveBinding={ready:value=>{flush=value},dispose:value=>{if(flush===value)flush=async()=>{}}};window.flushNote=()=>flush();
 window.createNoteRoot=()=>{const root=createRoot(document.querySelector('#notes'));root.render(React.createElement(NotesApp,{sessionId:'html-test',bridge,dark:false,active:!window.fixtureReadOnly,saveBinding,navigate:()=>{}}));return root};window.notesRoot=window.createNoteRoot();
 const NoteViews=nativeExports.__NoteViews;createRoot(document.querySelector('#views')).render(React.createElement(NoteViews,{sessionId:'html-test',active:true}));
 `:undefined,transform(code,id){if(id.endsWith('/preload/notes/editor.tsx'))return code.replace('  const slashMenu = useMemo','  window.noteEditor=editor; const slashMenu = useMemo')}}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 const chunks=(Array.isArray(output)?output:[output]).flatMap(item=>'output'in item?item.output:[]);script=chunks.filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const playwright=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (playwright.default||playwright).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>{await browser?.close()})
async function fixture(readOnly=false){
 const context=await browser.newContext({viewport:{width:1100,height:900}}),page=await context.newPage(),errors:string[]=[]
 page.setDefaultTimeout(4000);page.on('pageerror',(error:Error)=>errors.push(error.message));page.on('console',(message:any)=>{if(message.type()==='error')errors.push(message.text())})
 await page.route('http://127.0.0.1/note-html-fixture',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="zh"><body><section class="en-root" data-dark="false" style="position:fixed;inset:0"><div id="notes" class="en-editor-host"></div></section><div id="views"></div></body></html>'}))
 await page.route('http://127.0.0.1/fonts/NotoSansSC.woff2',(route:any)=>route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
 await page.goto('http://127.0.0.1/note-html-fixture');await page.evaluate((value:boolean)=>{(window as any).fixtureReadOnly=value},readOnly)
 await page.addScriptTag({content:`var exports={};\n${script}`})
 const frame=page.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe#preview')
 try{
  await page.locator('.en-title').waitFor()
  // Materialize this synthetic note through the actual BlockNote transaction,
  // then persist a real Yjs snapshot before exercising HTML or reopening it.
  await page.evaluate(()=>{const w=window as any;w.noteEditor.replaceBlocks(w.noteEditor.document,w.noteSaved.blocks)})
  await page.evaluate(()=>(window as any).flushNote())
  await frame.getByText('查看全部数据',{exact:true}).waitFor()
  await expect.poll(()=>page.locator('iframe[data-research-html-artifact]').getAttribute('data-research-font-status')).toBe('loaded')
  // Observe the actual host-to-outer-frame state messages. This instrumentation
  // never supplies an acknowledgment or changes the sandbox runtime.
  const outer=await(await page.locator('iframe[data-research-html-artifact]').elementHandle()).contentFrame()
  await outer.evaluate(()=>{(window as any).observedInteractionStates=[];addEventListener('message',event=>{if(event.source===parent&&event.data?.type==='sherlock-interaction-state')(window as any).observedInteractionStates.push(event.data)})})
  return {context,page,frame,outer,errors}
 }catch(error){const diagnostic={errors,body:await page.locator('body').textContent(),cause:String(error)};await context.close();throw Error(JSON.stringify(diagnostic))}
}
async function select(page:any){await page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()}
async function savedEvents(page:any):Promise<any[]>{return page.evaluate(()=>{const node=JSON.parse((window as any).noteSaved.blocks.find((block:any)=>block.id==='chart').props.payload);return Object.values(node.config?.interactionState?.events??{})})}
async function opened(frame:any):Promise<boolean>{return frame.locator('details').evaluate((element:HTMLDetailsElement)=>element.open)}
async function interactionAcks(page:any):Promise<any[]>{return page.evaluate(()=>(window as any).noteAcks.filter((entry:any)=>entry.requestId?.includes(':interaction:')))}

async function semanticState(page:any):Promise<any>{return page.evaluate(()=>JSON.parse((window as any).noteSaved.blocks.find((block:any)=>block.id==='chart').props.payload).config?.sharedComponentState)}
it('switches four Notes component modes without remounting the iframe, changing its neighbor or losing the saved memo on reopen',async()=>{
 const f=await fixture();try{
  await select(f.page)
  await f.frame.getByText('查看全部数据',{exact:true}).click()
  await f.frame.locator('#accept-note').fill('切换模式仍保留的笔记备注')
  await expect.poll(async()=>(await semanticState(f.page))?.state?.note).toBe('切换模式仍保留的笔记备注')
  await f.frame.locator('body').evaluate((element:HTMLElement)=>element.dataset.modeIdentity='original')
  await f.page.evaluate(()=>{const w=window as any;w.modeFrame=document.querySelector('iframe[data-research-html-artifact]');const node=JSON.parse(w.noteEditor.getBlock('chart').props.payload);w.noteEditor.insertBlocks([{id:'neighbor',type:'research',props:{payload:JSON.stringify({...node,id:'other-component',title:'独立相邻组件',noteSize:{width:400,height:160}})}}],w.noteEditor.getBlock('tail'),'after')})
  const current=f.page.locator('[data-note-research-block=chart]')
  for(const[mode,label]of[['light','浅色模式'],['dark','深色模式'],['enterprise','易方达模式'],['openterminal','彭博模式']]){
   await current.locator('.en-component-more').click()
   await f.page.getByRole('menuitem',{name:'模式切换',exact:true}).hover()
   await f.page.getByRole('menuitemradio',{name:label,exact:true}).click()
   await expect.poll(()=>current.getAttribute('data-workbench-style')).toBe(mode)
   await expect.poll(()=>f.page.evaluate(()=>JSON.parse((window as any).noteSaved.blocks.find((block:any)=>block.id==='chart').props.payload).notePresentation?.theme)).toBe(mode)
   expect(await f.page.evaluate(()=>document.querySelector('[data-note-research-block=chart] iframe[data-research-html-artifact]')===(window as any).modeFrame)).toBe(true)
   const frame=current.frameLocator('iframe[data-research-html-artifact]').frameLocator('#preview')
   expect(await frame.locator('body').getAttribute('data-mode-identity')).toBe('original')
   expect(await frame.locator('#accept-note').inputValue()).toBe('切换模式仍保留的笔记备注')
   expect(await frame.locator('details').evaluate((element:HTMLDetailsElement)=>element.open)).toBe(true)
   expect(await f.page.evaluate(()=>JSON.parse((window as any).noteEditor.getBlock('neighbor').props.payload).notePresentation)).toBeUndefined()
   expect(await f.page.locator('[data-note-research-block=neighbor]').getAttribute('data-workbench-style')).toBe('light')
  }
  await f.page.evaluate(async()=>{const w=window as any;await w.flushNote();w.notesRoot.unmount();w.notesRoot=w.createNoteRoot()})
  const reopened=f.page.locator('[data-note-research-block=chart]'),frame=reopened.frameLocator('iframe[data-research-html-artifact]').frameLocator('#preview')
  await expect.poll(()=>reopened.getAttribute('data-workbench-style')).toBe('openterminal')
  await expect.poll(()=>frame.locator('#accept-note').inputValue()).toBe('切换模式仍保留的笔记备注')
  expect(await frame.locator('details').evaluate((element:HTMLDetailsElement)=>element.open)).toBe(true)
  expect(await f.page.evaluate(()=>document.body.hasAttribute('data-ds-dark-theme'))).toBe(false);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},40000)
it('keeps the common Notes iframe borderless without Research CSS while preserving journal, memo and document identity',async()=>{
 const f=await fixture();try{
  await select(f.page);await f.frame.getByText('查看全部数据',{exact:true}).click();await expect.poll(()=>opened(f.frame)).toBe(true)
  const input=f.frame.locator('#accept-note');await input.fill('无外部边框依赖的笔记备注');await expect.poll(async()=>(await semanticState(f.page))?.state?.note).toBe('无外部边框依赖的笔记备注');await f.page.evaluate(()=>(window as any).flushNote())
  const journal=await savedEvents(f.page);expect(journal.length).toBeGreaterThan(0);await input.focus();await f.frame.locator('body').evaluate((element:HTMLElement)=>element.dataset.frameIdentity='original')
  const original=await f.page.evaluate(()=>{const frame=document.querySelector('iframe[data-research-html-artifact]')!;(window as any).originalBorderFrame=frame;return{srcdoc:frame.getAttribute('srcdoc'),sandbox:frame.getAttribute('sandbox')}})
  await f.page.evaluate(()=>{for(const style of document.querySelectorAll('style'))if(style.getAttribute('data-plugin-css')?.includes('ResearchCanvas.module.css'))style.remove()})
  const geometry=await f.page.locator('iframe[data-research-html-artifact]').evaluate((element:HTMLIFrameElement)=>{const style=getComputedStyle(element);return{widths:[style.borderTopWidth,style.borderRightWidth,style.borderBottomWidth,style.borderLeftWidth],styles:[style.borderTopStyle,style.borderRightStyle,style.borderBottomStyle,style.borderLeftStyle],delta:element.getBoundingClientRect().width-element.clientWidth,same:element===(window as any).originalBorderFrame,srcdoc:element.getAttribute('srcdoc'),sandbox:element.getAttribute('sandbox'),inline:element.style.border}})
  expect(geometry.widths).toEqual(['0px','0px','0px','0px']);expect(geometry.styles).toEqual(['none','none','none','none']);expect(geometry.delta).toBe(0);expect(geometry.inline).toBe('0px');expect(geometry.same).toBe(true);expect(geometry.srcdoc).toBe(original.srcdoc);expect(geometry.sandbox).toBe(original.sandbox)
  expect(await f.frame.locator('body').getAttribute('data-frame-identity')).toBe('original');expect(await input.evaluate((element:HTMLTextAreaElement)=>element.ownerDocument.activeElement===element)).toBe(true);expect(await savedEvents(f.page)).toEqual(journal)
  await f.page.evaluate(()=>{const w=window as any;w.notesRoot.unmount();w.notesRoot=w.createNoteRoot()});await f.page.locator('.en-title').waitFor();await expect.poll(()=>input.inputValue()).toBe('无外部边框依赖的笔记备注');await expect.poll(()=>opened(f.frame)).toBe(true);expect(await savedEvents(f.page)).toEqual(journal);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)
it('saves guarded-register offline demo state and native disclosure together and restores both after reopening Notes',async()=>{
 const f=await fixture();try{
  await select(f.page);expect(await opened(f.frame)).toBe(false)
  await f.frame.getByText('查看全部数据',{exact:true}).click();await expect.poll(()=>opened(f.frame)).toBe(true)
  const loads=await f.page.evaluate(()=>(window as any).frameLoads)
  await f.frame.locator('#accept-note').fill('离线演示备注必须保存')
  await expect.poll(async()=>(await semanticState(f.page))?.state?.note).toBe('离线演示备注必须保存')
  await f.frame.locator('svg').press('End')
  await expect.poll(async()=>(await semanticState(f.page))?.state?.selected).toBe(2)
  await f.page.evaluate(()=>(window as any).flushNote());expect(await f.page.evaluate(()=>(window as any).frameLoads)).toBe(loads)
  expect((await savedEvents(f.page)).some(event=>event.type==='click')).toBe(true)
  expect((await savedEvents(f.page)).some(event=>event.type==='input'||event.type==='keydown')).toBe(false)
  await f.page.evaluate(()=>{const w=window as any;w.notesRoot.unmount();w.notesRoot=w.createNoteRoot()})
  await f.page.locator('.en-title').waitFor();await expect.poll(()=>opened(f.frame)).toBe(true)
  await expect.poll(()=>f.frame.locator('#accept-note').inputValue()).toBe('离线演示备注必须保存')
  await expect.poll(()=>f.frame.locator('.chart-readout').textContent()).toBe('10月3日 · 演示数据：15')
  expect(await f.frame.locator('tbody td').allTextContents()).toEqual(['10月1日','10','10月2日','20','10月3日','15'])
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)
it('does not acknowledge a semantic state before Notes save and rolls its failed update back without erasing the journal',async()=>{
 const f=await fixture();try{
  await select(f.page);await f.frame.getByText('查看全部数据',{exact:true}).click()
  await expect.poll(async()=>(await savedEvents(f.page)).some(event=>event.type==='click')).toBe(true)
  await f.page.evaluate(()=>{(window as any).saveMode='hold'})
  await f.frame.locator('#accept-note').fill('保存尚未完成')
  await expect.poll(()=>f.page.evaluate(()=>(window as any).noteActions.some((value:any)=>value.action==='shared-state'))).toBe(true)
  expect((await semanticState(f.page))?.state?.note||'').toBe('')
  expect(await f.page.evaluate(()=>(window as any).noteAcks.some((value:any)=>value.requestId?.includes(':shared-state:')&&value.ok))).toBe(false)
  await f.page.evaluate(()=>{const w=window as any;w.saveMode='fail';for(const resolve of w.saveWaiters.splice(0))resolve()})
  await expect.poll(()=>f.page.evaluate(()=>(window as any).noteAcks.some((value:any)=>value.requestId?.includes(':shared-state:')&&value.ok===false))).toBe(true)
  await expect.poll(()=>f.frame.locator('#accept-note').inputValue()).toBe('')
  expect(await opened(f.frame)).toBe(true);expect((await savedEvents(f.page)).some(event=>event.type==='click')).toBe(true)
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)
