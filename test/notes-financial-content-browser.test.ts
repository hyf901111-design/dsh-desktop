import {afterAll,beforeAll,expect,it} from 'vitest'
import {writeFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'
let browser:any,script=''
const entry='\0notes-financial-content-fixture',evidence=process.env.SHERLOCK_NOTES_FINANCIAL_EVIDENCE
beforeAll(async()=>{
 const patched=notesResidentProductionSource()
 const native=patched.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'notes-financial-content-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React,{useState} from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {NativeComponentBlock} from ${JSON.stringify(resolve('src/preload/notes/native-component-block.tsx'))};
 import {financialWidgetDefaults} from ${JSON.stringify(resolve('packages/dsh-research-task-runtime/financial-widget-contract.js'))};
 import {workbenchModeCss} from ${JSON.stringify(resolve('packages/dsh-research-task-runtime/workbench-style.js'))};
 import noteStyles from ${JSON.stringify(resolve('src/preload/notes/style.css')+'?inline')};import researchStyles from ${JSON.stringify(resolve('scripts/lib/research-grid-workbench.css')+'?inline')};
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(native)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 const style=document.createElement('style');style.textContent=researchStyles+'\\n'+workbenchModeCss('body [data-ework-grid]')+'\\n'+noteStyles;document.head.append(style);
 window.fixtureCalls=[];window.fixtureChanges=[];
 window.dshDesktop={financialWidget:{request:async input=>{window.fixtureCalls.push(input);return input.action==='search'?{symbols:[{code:'000001',market:'SZ',name:'合成验收证券'}]}:input.action==='history'?{bars:[],error:'合成缺失状态'}:{quotes:[],source:'合成空响应',receivedAt:'2026-10-28T11:51:00Z'}}}};
 const spec={...financialWidgetDefaults(window.fixtureWidget),symbols:[]},node={id:'note-financial',title:spec.title,kind:'generated-container',noteLibrary:true,height:600,containerSpec:spec};let block={id:'note-block',type:'research',props:{payload:JSON.stringify(node)}};let setBlock;
 const editor={isEditable:true,getBlock:()=>block,removeBlocks:()=>{},updateBlock:(_id,value)=>{block={...block,props:{...block.props,...value.props}};window.fixtureChanges.push(JSON.parse(block.props.payload));setBlock(block)}};
 function Note(){const [current,update]=useState(block);setBlock=update;return React.createElement(NativeComponentBlock,{block:current,node:JSON.parse(current.props.payload),context:{editor,bridge:{request:async()=>({})},sessionId:'notes-financial-content',dark:window.fixtureDark}})}
 createRoot(document.querySelector('#note')).render(React.createElement(Note));createRoot(document.querySelector('#note-portals')).render(React.createElement(library.__NoteViews,{sessionId:'notes-financial-content',active:true}));
 `:undefined}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())
async function open(widget:'quote'|'indices',dark:boolean){
 const context=await browser.newContext({viewport:{width:1000,height:850}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(5000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('http://127.0.0.1/notes-financial-content',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><body><section class="en-root" data-dark="${dark}" style="position:relative;width:716px;height:650px;margin:24px"><div id="note" class="en-editor-host"></div></section><div id="note-portals"></div></body></html>`}))
 await page.goto('http://127.0.0.1/notes-financial-content');await page.evaluate(({widget,dark}:any)=>{(window as any).fixtureWidget=widget;(window as any).fixtureDark=dark;if(dark)document.body.dataset.dsDarkTheme='true'},{widget,dark});await page.addScriptTag({content:'var exports={};\n'+script});try{await page.locator('[data-financial-widget]').waitFor({timeout:2500})}catch(error){if(evidence)writeFileSync(resolve(evidence,'browser-mount-error.json'),JSON.stringify({widget,errors,text:await page.locator('body').textContent()},null,2));await context.close();throw error}return{context,page,errors}
}
it.each([false,true])('renders an operable unselected library quote with its actual controls and no fabricated price in dark=%s',async dark=>{
 const f=await open('quote',dark);try{
  const card=f.page.locator('[data-financial-widget="quote"]');await expect.poll(()=>card.locator('.ew-financial-empty').textContent()).toContain('选择个股')
  await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  for(const name of ['分时','日K','周K','月K','年K','MA','VOL','MACD'])expect(await card.getByRole('button',{name,exact:true}).isVisible()).toBe(true)
  await card.getByRole('button',{name:'周K',exact:true}).click();await card.getByRole('button',{name:'MA',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureChanges.at(-1)?.containerSpec)).toMatchObject({period:'1w',indicators:['VOL','MACD']})
  expect(await card.locator('.ew-quote-price-line strong').textContent()).toBe('—');expect(await f.page.evaluate(()=>(window as any).fixtureCalls.length)).toBe(0)
  if(evidence)await f.page.screenshot({path:resolve(evidence,`quote-selector-${dark?'dark':'light'}.png`)})
  const search=f.page.getByRole('combobox',{name:'搜索个股代码或名字',exact:true});await search.fill('验收');await f.page.locator('.ew-financial-suggestions [role="option"]').click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureChanges.at(-1)?.containerSpec.symbols)).toEqual([{code:'000001',market:'SZ',name:'合成验收证券'}]);await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureCalls.some((call:any)=>call.action==='quotes'&&call.symbols[0]?.code==='000001'))).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it.each([false,true])('renders a configuration state for empty indices and a real missing-data retry after choosing indices in dark=%s',async dark=>{
 const f=await open('indices',dark);try{
  const card=f.page.locator('[data-financial-widget="indices"]');await expect.poll(()=>card.locator('.ew-financial-empty').textContent()).toContain('配置指数');expect(await f.page.evaluate(()=>(window as any).fixtureCalls.length)).toBe(0);expect(await card.locator('footer').textContent()).not.toMatch(/获取 \d|合成空响应/)
  if(evidence)await f.page.screenshot({path:resolve(evidence,`indices-unconfigured-${dark?'dark':'light'}.png`)})
  await f.page.getByRole('button',{name:'配置指数',exact:true}).click();await f.page.getByRole('button',{name:'恢复默认',exact:true}).click();await f.page.getByRole('button',{name:'应用',exact:true}).click()
  await expect.poll(()=>card.locator('.ew-financial-empty').textContent()).toContain('未取得');expect(await card.locator('footer').textContent()).not.toMatch(/获取 \d|合成空响应/)
  await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  const count=await f.page.evaluate(()=>(window as any).fixtureCalls.length);await card.locator('footer').getByRole('button',{name:'重试获取数据',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureCalls.length)).toBeGreaterThan(count)
  if(evidence){await f.page.screenshot({path:resolve(evidence,`indices-data-missing-${dark?'dark':'light'}.png`)});writeFileSync(resolve(evidence,`indices-status-${dark?'dark':'light'}.json`),JSON.stringify({footer:await card.locator('footer').textContent(),requests:await f.page.evaluate(()=>(window as any).fixtureCalls)},null,2))}expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
