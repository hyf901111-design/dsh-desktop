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
 const patched=notesResidentProductionSource({conversation:true})
 const native=patched.replace('exports.SessionInputShell = SessionInputShell;','exports.SessionInputShell = SessionInputShell;exports.__NoteViews=EWorkNoteComponentViews;exports.__Conversation=ConversationComponentCard;')
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
 const spec={...financialWidgetDefaults(window.fixtureWidget),symbols:window.fixtureReadOnly?[{code:'000001',market:'SZ',name:'合成只读证券'}]:[]},node={id:'note-financial',title:spec.title,kind:'generated-container',noteLibrary:true,height:600,containerSpec:spec};let block={id:'note-block',type:'research',props:{payload:JSON.stringify(node)}};let setBlock;
 const editor={isEditable:!window.fixtureReadOnly,getBlock:()=>block,removeBlocks:()=>{},updateBlock:(_id,value)=>{block={...block,props:{...block.props,...value.props}};window.fixtureChanges.push(JSON.parse(block.props.payload));setBlock(block)}};
 function Note(){const [current,update]=useState(block);setBlock=update;return React.createElement(NativeComponentBlock,{block:current,node:JSON.parse(current.props.payload),context:{editor,bridge:{request:async()=>({})},sessionId:'notes-financial-content',dark:window.fixtureDark}})}
 createRoot(document.querySelector('#note')).render(React.createElement(Note));createRoot(document.querySelector('#note-portals')).render(React.createElement(library.__NoteViews,{sessionId:'notes-financial-content',active:true}));
 window.mountSurfacePeers=(widget='quote')=>{
  const sessionId='notes-financial-content',registry=new library.ResearchWorkspaceRegistry(localStorage),workspace=registry.for(sessionId),first={market:'SZ',code:'000001',name:'合成甲'},second={market:'SZ',code:'000002',name:'合成乙'};
  workspace.setCanvasSize({width:1000,height:600,availableWidth:1000});workspace.setWorkbenchWidth(1000);
  const watch=workspace.createFinancialWidget('watchlist'),quote=workspace.createFinancialWidget('quote');
  workspace.setArtifacts(workspace.getSnapshot().artifacts.map(n=>({...n,id:n.id===quote.id?node.id:n.id,x:n.id===watch.id?160:660,y:200,width:n.id===watch.id?300:500,height:340,containerSpec:{...n.containerSpec,symbols:n.id===watch.id?[first,second]:[first]}})));
  const legacy={...financialWidgetDefaults(widget),symbols:[first],...(widget==='news'?{linkedSourceId:watch.id,query:'原本本地查询'}:{linkedWatchlistId:watch.id})};block={...block,props:{...block.props,payload:JSON.stringify({...node,containerSpec:legacy})}};setBlock(block);
  window.readNote=()=>JSON.parse(block.props.payload);window.readResearch=()=>workspace.getSnapshot().artifacts;
  let view={id:node.id,sessionId,revision:1,node:{...node,containerSpec:legacy}};window.conversationSaves=[];window.readConversation=()=>view;
  window.dshDesktop.conversationComponents={read:async()=>structuredClone(view),queryNative:async input=>window.dshDesktop.financialWidget.request(input.query),updateNativeSpec:async input=>{window.conversationSaves.push(input);view={...view,revision:view.revision+1,node:{...view.node,containerSpec:input.spec}};return structuredClone(view)}};
  for(const id of ['research-peers','conversation-peer']){const host=document.createElement('div');host.id=id;host.style.cssText=id==='research-peers'?'position:relative;width:1000px;height:600px;':'width:716px;';document.body.append(host)}
  createRoot(document.querySelector('#research-peers')).render(React.createElement(library.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:true},actions:{setResearchRightTab(){}}}));
  createRoot(document.querySelector('#conversation-peer')).render(React.createElement(library.__Conversation,{sessionId,manifest:{version:1,kind:'conversation-component',componentId:node.id,sessionId,turnId:'1',requestId:'surface-peer',status:'ready'}}));
  window.surfaceIds={watch:watch.id,quote:node.id};
 };
 `:undefined}
 const output=await build({...config,configFile:false,plugins:[...(config.plugins||[]),fixture],build:{...config.build,write:false,rollupOptions:{...config.build?.rollupOptions,input:entry}}})
 script=(Array.isArray(output)?output:[output]).flatMap(value=>'output'in value?value.output:[]).filter(chunk=>chunk.type==='chunk').map(chunk=>chunk.code).join('\n')
 const {chromium}=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},90000)
afterAll(async()=>browser?.close())
async function open(widget:'quote'|'indices',dark:boolean,readOnly=false){
 const context=await browser.newContext({viewport:{width:1000,height:850}}),page=await context.newPage(),errors:string[]=[];page.setDefaultTimeout(5000);page.on('pageerror',(error:Error)=>errors.push(error.message))
 await page.route('http://127.0.0.1/notes-financial-content',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html data-odyssey-locale="zh"><body><section class="en-root" data-dark="${dark}" style="position:relative;width:716px;height:650px;margin:24px"><div id="note" class="en-editor-host"></div></section><div id="note-portals"></div></body></html>`}))
 await page.goto('http://127.0.0.1/notes-financial-content');await page.evaluate(({widget,dark,readOnly}:any)=>{(window as any).fixtureWidget=widget;(window as any).fixtureDark=dark;(window as any).fixtureReadOnly=readOnly;if(dark)document.body.dataset.dsDarkTheme='true'},{widget,dark,readOnly});await page.addScriptTag({content:'var exports={};\n'+script});try{await page.locator('[data-financial-widget]').waitFor({timeout:2500})}catch(error){if(evidence)writeFileSync(resolve(evidence,'browser-mount-error.json'),JSON.stringify({widget,errors,text:await page.locator('body').textContent()},null,2));await context.close();throw error}return{context,page,errors}
}
it.each([false,true])('renders an operable unselected library quote with its actual controls and no fabricated price in dark=%s',async dark=>{
 const f=await open('quote',dark);try{
  const card=f.page.locator('[data-financial-widget="quote"]');await expect.poll(()=>card.locator('.ew-financial-empty').textContent()).toContain('选择个股')
  // A hidden canvas port is still an unsupported interaction in a note.
  await f.page.addStyleTag({content:'.en-native-component-host .ew-financial-port{display:block!important}'})
  expect(await card.locator('[data-financial-port]').count()).toBe(0)
  await f.page.getByRole('button',{name:'选中组件并操作内容',exact:true}).click()
  for(const name of ['分时','日K','周K','月K','年K','MA','VOL','MACD'])expect(await card.getByRole('button',{name,exact:true}).isVisible()).toBe(true)
  await card.getByRole('button',{name:'周K',exact:true}).click();await card.getByRole('button',{name:'MA',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureChanges.at(-1)?.containerSpec)).toMatchObject({period:'1w',indicators:['VOL','MACD']})
  expect(await card.locator('.ew-quote-price-line strong').textContent()).toBe('—');expect(await f.page.evaluate(()=>(window as any).fixtureCalls.length)).toBe(0)
  if(evidence)await f.page.screenshot({path:resolve(evidence,`quote-selector-${dark?'dark':'light'}.png`)})
  const search=f.page.getByRole('combobox',{name:'搜索个股代码或名字',exact:true});await search.fill('验收');await f.page.locator('.ew-financial-suggestions [role="option"]').click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureChanges.at(-1)?.containerSpec.symbols)).toEqual([{code:'000001',market:'SZ',name:'合成验收证券'}]);await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureCalls.some((call:any)=>call.action==='quotes'&&call.symbols[0]?.code==='000001'))).toBe(true);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
it('keeps Notes and Conversation detached with old link fields while Research can really connect and disconnect',async()=>{
 const f=await open('quote',false);try{
  await f.page.setViewportSize({width:1100,height:1500});await f.page.evaluate(()=>(window as any).mountSurfacePeers())
  const note=f.page.locator('.en-native-component'),conversation=f.page.locator('.ew-conversation-component'),canvas=f.page.locator('#research-peers [data-research-canvas]')
  await conversation.locator('[data-financial-widget]').waitFor();await canvas.locator('[data-financial-port]').first().waitFor()
  await f.page.addStyleTag({content:'.ew-financial-port{display:block!important;opacity:1!important}'})
  expect(await note.locator('[data-financial-port]').count()).toBe(0);expect(await conversation.locator('[data-financial-port]').count()).toBe(0)
  const ids=await f.page.evaluate(()=>(window as any).surfaceIds),before=await f.page.evaluate(()=>({note:(window as any).readNote(),conversation:(window as any).readConversation()}))
  const output=canvas.locator(`[data-financial-port-node="${ids.watch}"][data-financial-port="output"]`),input=canvas.locator(`[data-financial-port-node="${ids.quote}"][data-financial-port="input"]`)
  await canvas.scrollIntoViewIfNeeded();await output.hover();const a=(await output.boundingBox())!,b=(await input.boundingBox())!
  await f.page.mouse.move(a.x+a.width/2,a.y+a.height/2);await f.page.mouse.down();await f.page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await f.page.mouse.up()
  await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).readResearch().find((n:any)=>n.id===id).containerSpec.linkedWatchlistId,ids.quote)).toBe(ids.watch)
  await canvas.locator('[data-stock-code="000002"]').click()
  await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).readResearch().find((n:any)=>n.id===id).containerSpec.symbols[0]?.code,ids.quote)).toBe('000002')
  expect(await f.page.evaluate(()=>(window as any).readNote())).toEqual(before.note);expect(await f.page.evaluate(()=>(window as any).readConversation())).toEqual(before.conversation)
  expect(await f.page.evaluate(()=>(window as any).conversationSaves.length)).toBe(0)
  const line=canvas.getByRole('button',{name:'断开组件数据连接',exact:true});await line.focus();await line.press('Delete')
  await expect.poll(()=>f.page.evaluate((id:string)=>(window as any).readResearch().find((n:any)=>n.id===id).containerSpec.linkedWatchlistId,ids.quote)).toBeUndefined()
  for(const target of [note,conversation]){
   const previous=await f.page.evaluate(()=>(window as any).readResearch())
   await target.evaluate((root:HTMLElement,id:string)=>{const fake=document.createElement('button');fake.dataset.financialPort='input';fake.dataset.financialPortNode=id;fake.dataset.surfaceProbe='';fake.textContent='合成跨面端口';fake.style.cssText='position:fixed;left:8px;top:8px;width:100px;height:32px;z-index:9000';root.append(fake)},ids.quote)
   await output.scrollIntoViewIfNeeded();const from=(await output.boundingBox())!,to=(await target.locator('[data-surface-probe]').boundingBox())!
   await f.page.mouse.move(from.x+from.width/2,from.y+from.height/2);await f.page.mouse.down();await f.page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:8});await f.page.mouse.up()
   expect(await f.page.evaluate(()=>(window as any).readResearch())).toEqual(previous);await target.locator('[data-surface-probe]').evaluate((el:HTMLElement)=>el.remove())
  }
  // A note's local edit still uses its own ACK and keeps unrelated legacy fields.
  await note.getByRole('button',{name:'选中组件并操作内容',exact:true}).click();await note.getByRole('button',{name:'周K',exact:true}).click()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).readNote().containerSpec.period)).toBe('1w');expect(await f.page.evaluate(()=>(window as any).readNote().containerSpec.linkedWatchlistId)).toBe(ids.watch)
  if(evidence)await f.page.screenshot({path:resolve(evidence,'detached-surfaces-research-link.png'),fullPage:true});expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},30000)
it('ignores legacy feed links on both detached surfaces and saves local search through their own handlers',async()=>{
 const f=await open('quote',false);try{
  await f.page.evaluate(()=>(window as any).mountSurfacePeers('news'))
  const note=f.page.locator('.en-native-component'),conversation=f.page.locator('.ew-conversation-component');await conversation.locator('[data-financial-widget="news"]').waitFor()
  await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureCalls.filter((call:any)=>call.action==='news').length)).toBeGreaterThan(1)
  expect(await f.page.evaluate(()=>(window as any).fixtureCalls.filter((call:any)=>call.action==='news').every((call:any)=>call.query==='原本本地查询'))).toBe(true)
  const original=await f.page.evaluate(()=>(window as any).readResearch()),link=await f.page.evaluate(()=>(window as any).surfaceIds.watch)
  expect(await f.page.evaluate(()=>(window as any).readNote().containerSpec.linkedSourceId)).toBe(link);expect(await f.page.evaluate(()=>(window as any).readConversation().node.containerSpec.linkedSourceId)).toBe(link)
  const local=note.getByRole('searchbox',{name:'搜索相关新闻',exact:true});expect(await local.inputValue()).toBe('原本本地查询');await local.fill('笔记本地词');await local.press('Enter')
  await expect.poll(()=>f.page.evaluate(()=>(window as any).readNote().containerSpec.query)).toBe('笔记本地词')
  const other=conversation.getByRole('searchbox',{name:'搜索相关新闻',exact:true});expect(await other.inputValue()).toBe('原本本地查询');await other.fill('对话本地词');await other.press('Enter')
  await expect.poll(()=>f.page.evaluate(()=>(window as any).readConversation().node.containerSpec.query)).toBe('对话本地词')
  expect(await f.page.evaluate(()=>(window as any).readResearch())).toEqual(original);expect(f.errors).toEqual([])
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

it('guards the public manual refresh entry when the Notes host is read-only',async()=>{
 const f=await open('quote',false,true);try{
  await expect.poll(()=>f.page.evaluate(()=>(window as any).fixtureCalls.length)).toBe(2)
  const result=await f.page.locator('[data-financial-widget]').evaluate((el:any)=>el.__eworkRefreshFinancial())
  expect(result.error).toContain('不可手动刷新');expect(await f.page.evaluate(()=>(window as any).fixtureCalls.length)).toBe(2);expect(f.errors).toEqual([])
 }finally{await f.context.close()}
},20000)
