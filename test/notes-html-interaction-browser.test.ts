import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile} from 'node:fs/promises'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
let browser:any,script=''
const entry='\0notes-html-interaction-fixture',evidence=process.env.SHERLOCK_NOTES_HTML_EVIDENCE
beforeAll(async()=>{
 const current=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 // Baseline deliberately retains the installed resident renderer's old sink.
 // Both paths use the same production preload resolver and real NotesApp.
 // Packaging invokes the patch in native Node. Vitest rewrites imported names
 // inside Function.toString(), so use that same production execution boundary.
 const patched=process.env.SHERLOCK_NOTES_HTML_BASELINE?current:execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{patchNotesComponents}from'./scripts/lib/notes-components.mjs';process.stdout.write(patchNotesComponents(readFileSync(0,'utf8')))"],{input:current,encoding:'utf8',maxBuffer:64*1024*1024})
 const native=patched.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-html-interaction-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React from 'react';import * as jsxRuntime from 'react/jsx-runtime';import * as ReactDOM from 'react-dom';import {createRoot} from 'react-dom/client';import {NotesApp} from ${JSON.stringify(resolve('src/preload/notes/editor.tsx'))};
 import blockStyles from '@blocknote/mantine/style.css?inline';import noteStyles from ${JSON.stringify(resolve('src/preload/notes/style.css')+'?inline')};
 const style=document.createElement('style');style.textContent=blockStyles+'\\n'+noteStyles;document.head.append(style);
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(native)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const nativeExports=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?jsxRuntime:id==='react-dom'?ReactDOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 const spec={version:1,type:'html',title:'原生HTML交互',html:'<article><p>演示数据，保留完整</p><details><summary>查看全部数据</summary><table><tr><th>日期</th><th>演示数值</th></tr><tr><td>10月1日</td><td>10</td></tr><tr><td>10月2日</td><td>20</td></tr><tr><td>10月3日</td><td>15</td></tr></table></details><label>筛选<input aria-label="筛选" value=""></label></article>'};
 window.noteSaved={title:'HTML交互保存验收',blocks:[{id:'upper',type:'paragraph',content:'上文保留'},{id:'chart',type:'research',props:{payload:JSON.stringify({id:'note-html',title:spec.title,kind:'generated-container',noteLibrary:true,containerSpec:spec,noteSize:{width:656,height:430}})}},{id:'tail',type:'paragraph',content:'下文保留'}],yjs:'',revision:0,updatedAt:0};
 window.noteRequests=[];window.noteAcks=[];window.noteActions=[];window.saveMode='ok';window.saveWaiters=[];window.frameLoads=0;
 document.addEventListener('sherlock:notes-component-ack',e=>window.noteAcks.push(e.detail));document.addEventListener('sherlock:notes-component-action',e=>window.noteActions.push(e.detail));
 document.addEventListener('load',e=>{if(e.target?.matches?.('iframe[data-research-html-artifact]'))window.frameLoads++},true);
 const bridge={request:async(method,input)=>{window.noteRequests.push({method,input});if(method==='load')return {saved:window.noteSaved};if(method==='save'){const mode=window.saveMode;if(mode==='fail')throw Error('演示保存失败');if(mode==='hold')await new Promise(resolve=>window.saveWaiters.push(resolve));window.noteSaved={...input.content,revision:input.revision+1};return {status:'saved',saved:window.noteSaved}}return {ok:true}},draft:async()=>{}};
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

it('persists physical HTML disclosure and input in the real Notes resident renderer and replays after reopen',async()=>{
 const f=await fixture();try{
  await select(f.page);await f.frame.getByText('查看全部数据',{exact:true}).click()
  await expect.poll(()=>opened(f.frame)).toBe(true)
  await expect.poll(async()=>(await savedEvents(f.page)).filter(entry=>entry.type==='click').length).toBe(1)
  await f.frame.getByRole('textbox',{name:'筛选',exact:true}).fill('演示')
  await expect.poll(async()=>(await savedEvents(f.page)).some(entry=>entry.type==='input'&&entry.value==='演示')).toBe(true)
  await f.page.evaluate(()=>(window as any).flushNote())
  if(evidence)await f.page.screenshot({path:resolve(evidence,'notes-html-open.png')})
  await f.page.evaluate(()=>{const w=window as any;w.notesRoot.unmount();w.notesRoot=w.createNoteRoot()})
  await f.page.locator('.en-title').waitFor();await expect.poll(()=>opened(f.frame)).toBe(true)
  await expect.poll(()=>f.frame.getByRole('textbox',{name:'筛选',exact:true}).inputValue()).toBe('演示')
  expect(await f.page.evaluate(()=>(window as any).noteSaved.blocks.filter((block:any)=>block.type==='paragraph').map((block:any)=>block.content[0]?.text??block.content))).toEqual(['上文保留','下文保留'])
  expect((await interactionAcks(f.page)).every(entry=>entry.ok===true)).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)

it('keeps an optimistic disclosure open without acknowledging it before the actual Notes save completes',async()=>{
 const f=await fixture();try{
  await select(f.page);await f.page.evaluate(()=>{(window as any).saveMode='hold'})
  await f.frame.getByText('查看全部数据',{exact:true}).click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).saveWaiters.length)).toBeGreaterThan(0)
  expect(await opened(f.frame)).toBe(true);expect(await savedEvents(f.page)).toEqual([]);expect(await interactionAcks(f.page)).toEqual([])
  const action=await f.page.evaluate(()=>(window as any).noteActions.find((entry:any)=>entry.action==='interaction'))
  expect(action?.event?.type).toBe('click')
  expect(await f.outer.evaluate((id:string)=>(window as any).observedInteractionStates.some((entry:any)=>Object.hasOwn(entry.state?.events??{},id)),action.event.id)).toBe(false)
  const loads=await f.page.evaluate(()=>(window as any).frameLoads)
  await f.page.evaluate(()=>{const w=window as any;w.saveMode='ok';for(const resolve of w.saveWaiters.splice(0))resolve()})
  await expect.poll(async()=>(await interactionAcks(f.page)).some(entry=>entry.requestId===action.requestId&&entry.ok===true)).toBe(true)
  await expect.poll(async()=>(await savedEvents(f.page)).some(entry=>entry.id===action.event.id)).toBe(true)
  await expect.poll(()=>f.outer.evaluate((id:string)=>(window as any).observedInteractionStates.some((entry:any)=>Object.hasOwn(entry.state?.events??{},id)),action.event.id)).toBe(true)
  expect(await opened(f.frame)).toBe(true);expect(await f.page.evaluate(()=>(window as any).frameLoads)).toBe(loads);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)

it('rejects an actual failed Notes save and restores the last durable disclosure state',async()=>{
 const f=await fixture();try{
  await select(f.page);await f.page.evaluate(()=>{(window as any).saveMode='fail'})
  await f.frame.getByText('查看全部数据',{exact:true}).click()
  await expect.poll(async()=>(await interactionAcks(f.page)).some(entry=>entry.ok===false)).toBe(true)
  expect((await interactionAcks(f.page)).some(entry=>entry.ok===true)).toBe(false)
  await expect.poll(()=>opened(f.frame)).toBe(false);expect(await savedEvents(f.page)).toEqual([])
  expect(await f.page.evaluate(()=>JSON.parse((window as any).noteEditor.getBlock('chart').props.payload).config?.interactionState)).toBeUndefined()
  expect(await f.page.locator('.en-component-error').textContent()).toContain('未保存')
  if(evidence)await f.page.screenshot({path:resolve(evidence,'notes-html-save-failed.png')})
  await f.page.evaluate(()=>{(window as any).saveMode='ok'})
  await f.frame.getByText('查看全部数据',{exact:true}).click()
  await expect.poll(async()=>(await savedEvents(f.page)).filter(entry=>entry.type==='click').length).toBe(1)
  await expect.poll(()=>opened(f.frame)).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)

it('blocks physical HTML disclosure writes in a real read-only Notes editor',async()=>{
 const f=await fixture(true);try{
  await expect.poll(()=>f.page.evaluate(()=>(window as any).noteEditor.isEditable)).toBe(false)
  await select(f.page);const saves=await f.page.evaluate(()=>(window as any).noteRequests.filter((entry:any)=>entry.method==='save').length)
  await f.frame.getByText('查看全部数据',{exact:true}).click()
  // The trusted mouse click reached the real sandbox. Its capture guard must
  // suppress the default details action and avoid journal admission entirely.
  expect(await opened(f.frame)).toBe(false);expect(await savedEvents(f.page)).toEqual([])
  expect(await interactionAcks(f.page)).toEqual([])
  expect(await f.page.evaluate(()=>(window as any).noteRequests.filter((entry:any)=>entry.method==='save').length)).toBe(saves)
  expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)
