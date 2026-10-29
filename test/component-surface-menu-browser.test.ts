import {afterAll,beforeAll,expect,it} from 'vitest'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build,type Plugin} from 'vite'
import {resolveConfig} from 'electron-vite'
import {notesResidentProductionSource} from './helpers/notes-resident-production-source.mjs'

let browser:any,script=''
const entry='\0component-surface-menu-fixture'
beforeAll(async()=>{
 const source=notesResidentProductionSource({conversation:true}).replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;exports.__ConversationCard=ConversationComponentCard;exports.__DataSettings=ComponentDataSettings;')
 const config=(await resolveConfig({configFile:resolve('electron.vite.config.ts'),logLevel:'silent'},'build','production')).config!.preload!
 const fixture:Plugin={name:'component-surface-menu-fixture',resolveId:id=>id===entry?entry:undefined,load:id=>id===entry?`
 import React,{useState} from 'react';import * as JSX from 'react/jsx-runtime';import * as DOM from 'react-dom';import {createRoot} from 'react-dom/client';
 import {NativeComponentBlock} from ${JSON.stringify(resolve('src/preload/notes/native-component-block.tsx'))};
 import {financialWidgetDefaults} from ${JSON.stringify(resolve('packages/dsh-research-task-runtime/financial-widget-contract.js'))};
 import noteStyles from ${JSON.stringify(resolve('src/preload/notes/style.css')+'?inline')};import researchStyles from ${JSON.stringify(resolve('scripts/lib/research-grid-workbench.css')+'?inline')};
 const factories=new Map();window.__ModuleLoader__={load:d=>factories.set(d.id,d.factory)};new Function(${JSON.stringify(source)})();class Service{};const noop=()=>null,primitives=new Proxy({},{get:()=>noop});
 const library=factories.get('@deepseek-ai/dsh-client-ui-conversation')(id=>id==='react'?React:id==='react/jsx-runtime'?JSX:id==='react-dom'?DOM:id==='@deepseek-ai/cordis'?{Service}:primitives);
 const style=document.createElement('style');style.textContent=researchStyles+'\\n'+noteStyles;document.head.append(style);
 window.probe={queries:[],notes:[],conversation:[],canvas:[],copied:[],saved:[]};
 const symbol={market:'SZ',code:'000001',name:'合成验收证券'},spec={...financialWidgetDefaults('quote'),symbols:[symbol]},node={id:'same-node',title:'菜单验收行情',kind:'generated-container',noteLibrary:true,height:440,containerSpec:spec};
 const query=async(input,host)=>{window.probe.queries.push({host,...input});return input.action==='search'?{symbols:[symbol]}:input.action==='history'?{bars:[],source:'合成来源'}:{quotes:[{...symbol,price:100,asOf:'2026-10-28',source:'合成来源'}],source:'合成来源',receivedAt:'2026-10-28T13:00:00Z'}};
 let conversation={id:node.id,sessionId:'same-session',revision:1,node:structuredClone(node)};
 const bridge={read:async()=>structuredClone(conversation),...(window.fixtureFull?{exportContent:async()=>({status:'saved'}),rename:async input=>{conversation={...conversation,revision:conversation.revision+1,node:{...conversation.node,title:input.title,displayName:input.title}};return structuredClone(conversation)},copy:async input=>{window.probe.copied.push(input);return{ok:true}},saveLibrary:async input=>{window.probe.saved.push(input);return{id:'library-item'}},updateNativeSpec:async input=>{window.probe.conversation.push(input);conversation={...conversation,revision:conversation.revision+1,node:{...conversation.node,containerSpec:input.spec}};return structuredClone(conversation)}}:{}),...(window.fixtureQuery?{queryNative:async input=>query(input.query,'conversation')}:{})};
 window.dshDesktop={conversationComponents:bridge,financialWidget:{request:input=>query(input,'notes')},componentData:{request:async(sessionId,input)=>{window.probe.canvas.push({sessionId,...input});return input.action==='list'?[]:{}},setVisible:async()=>{}}};
 let block={id:'note-block',type:'research',props:{payload:JSON.stringify(node)}},setBlock;
 const editor={isEditable:!window.fixtureReadOnly,getBlock:()=>block,removeBlocks:()=>{},updateBlock:(_id,value)=>{block={...block,props:{...block.props,...value.props}};window.probe.notes.push(JSON.parse(block.props.payload));setBlock(block)}};
 function Note(){const [current,update]=useState(block);setBlock=update;return React.createElement(NativeComponentBlock,{block:current,node:JSON.parse(current.props.payload),context:{editor,bridge:{request:async method=>method==='component-menu-capabilities'?{copy:window.fixtureFull,saveLibrary:window.fixtureFull&&!window.fixtureReadOnly,exportContent:window.fixtureFull,rename:window.fixtureFull&&!window.fixtureReadOnly}:{}},persistComponentActions:async()=>{},sessionId:'same-session',dark:false}})}
 createRoot(document.querySelector('#note')).render(React.createElement(Note));createRoot(document.querySelector('#note-portals')).render(React.createElement(library.__NoteViews,{sessionId:'same-session',active:true}));
 createRoot(document.querySelector('#conversation')).render(React.createElement(library.__ConversationCard,{sessionId:'same-session',manifest:{componentId:node.id,sessionId:'same-session'}}));
 createRoot(document.querySelector('#settings-controller')).render(React.createElement(library.__DataSettings,{sessionId:'same-session',canvasRoot:{current:document.querySelector('#canvas')}}));
 `:undefined}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())
async function open({full=true,query=true,readOnly=false}={}){
 const context=await browser.newContext({viewport:{width:1150,height:1000}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(5000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('http://127.0.0.1/surface-menu',(route:any)=>route.fulfill({contentType:'text/html',body:'<!doctype html><html data-odyssey-locale="zh"><body><section class="en-root" data-dark="false" style="position:relative;width:500px;height:500px"><div id="note"></div></section><div id="note-portals"></div><div id="conversation" style="width:500px"></div><section id="canvas" data-research-canvas><div data-research-node-id="same-node"><button id="canvas-trigger">研究数据设置</button></div></section><div id="settings-controller"></div></body></html>'}))
 await page.goto('http://127.0.0.1/surface-menu');await page.evaluate((value:{full:boolean;query:boolean;readOnly:boolean})=>Object.assign(window,{fixtureFull:value.full,fixtureQuery:value.query,fixtureReadOnly:value.readOnly}),{full,query,readOnly});await page.addScriptTag({content:'var exports={};\n'+script});await page.locator('#note [data-financial-widget]').waitFor();await page.locator('#conversation [data-financial-widget]').waitFor()
 await page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await page.waitForTimeout(30);await page.evaluate(()=>(window as any).probe.canvas=[])
 return{page,errors,close:()=>context.close()}
}
it('hides unsupported operations in the real conversation More menu and financial settings while retaining available refresh',async()=>{
 const f=await open({full:false});try{
  const card=f.page.locator('#conversation');await card.getByRole('button',{name:'组件更多操作',exact:true}).click();const menu=f.page.getByRole('menu',{name:'组件更多操作',exact:true})
  expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['放大阅读','数据源与自动更新']);expect(await card.getByRole('button',{name:'引用到对话',exact:true}).count()).toBe(0)
  await menu.getByRole('menuitem',{name:'数据源与自动更新',exact:true}).click();const dialog=f.page.getByRole('dialog',{name:'组件数据与自动更新'})
  await dialog.waitFor();expect(await dialog.locator('select').count()).toBe(0);expect(await dialog.getByRole('button').allTextContents()).toEqual(['×','立即更新'])
  const before=await f.page.evaluate(()=>(window as any).probe.queries.length);await dialog.getByRole('button',{name:'立即更新',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.queries.length)).toBeGreaterThan(before)
  expect(await f.page.evaluate(()=>(window as any).probe.conversation.length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('hides refresh when no real conversation query bridge exists and keeps supported copy and save actions',async()=>{
 const f=await open({query:false});try{
  const card=f.page.locator('#conversation');expect(await card.getByRole('button',{name:'刷新组件',exact:true}).count()).toBe(0)
  await card.getByRole('button',{name:'组件更多操作',exact:true}).click();expect(await f.page.getByRole('menuitem',{name:'复制组件',exact:true}).count()).toBe(1);await f.page.getByRole('menuitem',{name:'复制组件',exact:true}).click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.copied.length)).toBe(1);await card.getByRole('button',{name:'组件更多操作',exact:true}).click();await f.page.getByRole('menuitem',{name:'添加至组件库',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.saved.length)).toBe(1)
  expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('shows read-only note provenance without presenting settings that cannot be saved',async()=>{
 const f=await open({readOnly:true});try{
  await f.page.locator('#note [data-financial-widget] .ew-financial-provenance').click({force:true});const dialog=f.page.getByRole('dialog',{name:'组件数据与自动更新'});await dialog.waitFor()
  expect(await dialog.locator('select').count()).toBe(0);expect(await dialog.getByRole('button').allTextContents()).toEqual(['×']);expect(await f.page.evaluate(()=>(window as any).probe.notes.length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('keeps the real conversation provider, timing, pause and manual refresh controls when both host adapters exist',async()=>{
 const f=await open();try{
  const card=f.page.locator('#conversation');await card.getByRole('button',{name:'组件更多操作',exact:true}).click();expect(await f.page.getByRole('menuitem').allTextContents()).toEqual(['放大阅读','复制组件','重命名','添加至组件库','导出›','数据源与自动更新']);await f.page.getByRole('menuitem',{name:'数据源与自动更新',exact:true}).click()
  const dialog=f.page.getByRole('dialog',{name:'组件数据与自动更新'});await dialog.waitFor();expect(await dialog.locator('select').count()).toBe(2)
  await dialog.getByRole('combobox',{name:'数据源',exact:true}).selectOption('backup');await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.conversation.at(-1)?.spec.dataSource)).toBe('backup')
  await dialog.getByRole('combobox',{name:'更新频率',exact:true}).selectOption('5');await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.conversation.at(-1)?.spec.refreshMinutes)).toBe(5)
  await dialog.getByRole('button',{name:'暂停更新',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.conversation.at(-1)?.spec.refreshEnabled)).toBe(false)
  const before=await f.page.evaluate(()=>(window as any).probe.queries.filter((q:any)=>q.host==='conversation').length);await dialog.getByRole('button',{name:'立即更新',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.queries.filter((q:any)=>q.host==='conversation').length)).toBeGreaterThan(before)
  expect(await f.page.evaluate(()=>(window as any).probe.notes.length)).toBe(0);expect(await f.page.evaluate(()=>(window as any).probe.canvas.length)).toBe(0);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)
it('routes settings only to the exact surface and mounted owner when all hosts share the same session and node',async()=>{
 const f=await open();try{
  await f.page.evaluate(()=>{const trigger=document.querySelector('#note .ew-financial-provenance');window.dispatchEvent(new CustomEvent('sherlock:component-data-open',{detail:{sessionId:'same-session',nodeId:'same-node',kind:'html',surface:'notes',action:'settings',trigger}}))})
  await f.page.evaluate(()=>{const trigger=document.querySelector('#canvas-trigger'),owner=document.querySelector('#note [data-research-node-id]');for(const extra of [{surface:'research',owner},{surface:'unknown'},{action:'unavailable'},{owner:document.querySelector('#canvas [data-research-node-id]'),trigger:document.querySelector('#note .ew-financial-provenance')}])window.dispatchEvent(new CustomEvent('sherlock:component-data-open',{detail:{sessionId:'same-session',nodeId:'same-node',kind:'html',surface:'research',action:'settings',trigger,...extra}}))})
  await f.page.waitForTimeout(70);expect(await f.page.evaluate(()=>(window as any).probe.canvas.length)).toBe(0);expect(await f.page.getByRole('dialog').count()).toBe(0)
  await f.page.evaluate(()=>{const trigger=document.querySelector('#note .ew-financial-provenance');window.dispatchEvent(new CustomEvent('sherlock:component-data-open',{detail:{sessionId:'same-session',nodeId:'same-node',kind:'financial-widget',surface:'conversation',action:'settings',trigger}}))})
  await f.page.waitForTimeout(50);expect(await f.page.getByRole('dialog').count()).toBe(0)
  await f.page.locator('#note .ew-financial-provenance').click({force:true});const dialog=f.page.getByRole('dialog',{name:'组件数据与自动更新'});await dialog.waitFor();expect(await dialog.count()).toBe(1)
  await dialog.getByRole('combobox',{name:'更新频率',exact:true}).selectOption('5');await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.notes.at(-1)?.containerSpec.refreshMinutes)).toBe(5);expect(await f.page.evaluate(()=>(window as any).probe.conversation.length)).toBe(0)
  await f.page.getByRole('dialog').getByRole('button',{name:'关闭数据设置'}).click();await f.page.evaluate(()=>{const trigger=document.querySelector('#canvas-trigger');window.dispatchEvent(new CustomEvent('sherlock:component-data-open',{detail:{sessionId:'same-session',nodeId:'same-node',kind:'html',surface:'research',action:'settings',trigger,title:'研究数据'}}))})
  await expect.poll(()=>f.page.evaluate(()=>(window as any).probe.canvas.length)).toBe(1);expect(await f.page.getByRole('dialog').count()).toBe(1);expect(f.errors).toEqual([])
 }finally{await f.close()}
},15000)

it('retains the executable Research reading, clipboard, naming, library and export entries in both surface menus',async()=>{
 const f=await open();try{
  await f.page.locator('#conversation').getByRole('button',{name:'组件更多操作',exact:true}).click();const menu=f.page.getByRole('menu',{name:'组件更多操作',exact:true})
  expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['放大阅读','复制组件','重命名','添加至组件库','导出›','数据源与自动更新'])
  await f.page.keyboard.press('Escape');expect(await f.page.locator('#note').getByRole('button',{name:'组件更多操作',exact:true}).count()).toBe(1)
  await f.page.locator('#note').getByRole('button',{name:'组件更多操作',exact:true}).click();expect(await f.page.getByRole('menu',{name:'组件更多操作',exact:true}).getByRole('menuitem').allTextContents()).toEqual(['放大阅读','复制组件','重命名','添加至组件库','导出›','数据源与自动更新']);expect(f.errors).toEqual([])
 }finally{await f.close()}
},20000)
