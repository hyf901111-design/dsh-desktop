import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFile,mkdir,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'

// Exercise the production ResearchCanvas and its real workspace, menu, tabs,
// keyboard listeners and financial interaction sinks. Only external IPC is fake.
let browser,script
beforeAll(async()=>{
 const require=createRequire(import.meta.url)
 let source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 if(source.includes('/* sherlock:composer-voice:v1 */'))source=require('../scripts/lib/composer-voice.mjs').stripComposerVoice(source)
 source=require('./fixtures/strip-conversation-transient-ui.mjs').stripConversationGridOverlays(source)
 for(const[file,strip]of [['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']])source=require('../scripts/lib/'+file+'.mjs')[strip](source)
 const grid=require('../scripts/lib/research-grid-workbench.mjs'),tabs=require('../scripts/lib/board-tabs-client.mjs')
 source=tabs.patchBoardTabsClient(grid.patchResearchGridWorkbench(require('../scripts/lib/calendar-tool-client.mjs').patchCalendarToolClient(require('../scripts/lib/financial-widget-client.mjs').patchFinancialWidgetClient(require('../scripts/lib/component-data-refresh.mjs').patchComponentDataRefresh(grid.restoreResearchGridWorkbench(source))))))
 expect(tabs.patchBoardTabsClient(source)).toBe(source)
 source=require('../scripts/lib/home-workbench-client.mjs').patchHomeWorkbenchClient(source)
 expect(()=>new Function(source)).not.toThrow()
 // Install the exact production host-subscription callback in the fixture; its
 // private refresh identity stays in the bundle closure and is never exported.
 const callbackStart=source.indexOf('async request=>{',source.indexOf('researchCanvasActions?.subscribe(')),callbackEnd=source.indexOf('\n        });',callbackStart)
 if(callbackStart<0||callbackEnd<0)throw Error('Real canvas subscription callback missing')
 const callback=source.slice(callbackStart,callbackEnd+10)
 source=source.replace('exports.ResearchCanvas = ResearchCanvas;', 'exports.__PreviewStudySpec=homeWorkbenchStudySpec;exports.__PreviewCalendar=CalendarTool;exports.__PreviewCalendarRequest=calendarToolRequest;exports.__registerPreviewHost=researchWorkspaces=>window.dshDesktop.researchCanvasActions.subscribe('+callback+');exports.ResearchCanvas = ResearchCanvas;')
 const entry=`import {WorkspaceSurfaceHost} from './src/preload/workspace-surface-host.ts';import {ResearchBoardHeader} from './src/preload/research-boards-ui.ts';import {installBoardUiStyles} from './src/preload/research-board-dialogs.ts';import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};window.__copies=[];window.__library=[];window.__dataRequests=[];
 window.dshDesktop={researchCanvasActions:{subscribe:handler=>{window.__trustedCanvasHandler=handler;return()=>{}}},researchBoards:{isSharedSession:id=>id.startsWith('shared-')},researchClipboard:{copy:async value=>{window.__copies.push(value);return {ok:true}},read:async()=>({kind:'text',text:'unexpected pasted component'}),inspect:async()=>({available:true})},componentLibrary:{request:async value=>{window.__library.push(value);return value.action==='list'?[]:{ok:true}}},financialWidget:{request:async value=>{window.__dataRequests.push(value);return value.action==='search'?{symbols:[{code:'MSFT',market:'US',name:'微软'}]}:{quotes:[],news:[],announcements:[],bars:[],source:'fixture',receivedAt:Date.now()}}}};
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 (0,eval)(${JSON.stringify(source)});
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake);
 const registry=new bundle.ResearchWorkspaceRegistry(localStorage),root=createRoot(document.getElementById('host')),headerHost=document.getElementById('header'),headerRoot=headerHost?createRoot(headerHost):null;if(headerHost)installBoardUiStyles(document);let sessionId='preview-board';
 const workspace=()=>registry.for(sessionId);
 const headerState={account:{user:{userId:'self'}},favorites:[],boards:[]},headerPage={workspaceFor:id=>registry.for(id),getState:()=>headerState,subscribe:()=>()=>{},version:()=>0,getView:()=>null,isResearch:()=>true,showError:error=>{throw error},favorite:async()=>{}};
 const render=(next=sessionId)=>{sessionId=next;root.render(React.createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate:async()=>({taskId:'fixture-task'})},actions:{}}));headerRoot?.render(React.createElement(ResearchBoardHeader,{page:headerPage,sessionId,active:true}))};
 const text=(id,x=180,y=170)=>({id,kind:'pasted-text',messageId:'fixture-message',title:'研究文字 '+id,excerpt:'可阅读的研究证据 '+id,x,y,width:320,height:220,sizeMode:'manual'});
 bundle.__registerPreviewHost(registry);window.fixture={bundle,registry,workspace,render,text,setHeaderState:value=>{Object.assign(headerState,value);render()},surfaceHost:new WorkspaceSurfaceHost(document),renderNoteCalendar:(owner,node)=>{const host=document.createElement('div');host.dataset.noteDocument='';const section=document.createElement('section');section.className='en-research en-native-component';section.dataset.researchNodeId=node.id;const native=document.createElement('div');native.className='en-native-component-host';native.dataset.noteSession=owner;native.dataset.noteComponent=node.id;section.append(native);host.append(section);document.body.append(host);createRoot(native).render(React.createElement(bundle.__PreviewCalendar,{sessionId:owner,node}));return host},openNoteCalendar(owner,node){const host=this.renderNoteCalendar(owner,node);host.style.cssText='position:fixed;inset:0;z-index:2000;background:white';this.surfaceHost.register('notes',host);this.surfaceHost.open('notes');return host}};document.querySelector('#preview-toggle').onclick=()=>workspace().setPreviewMode(!workspace().getPreviewMode());render();`
 script=(await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 if(process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE)await mkdir(process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE,{recursive:true})
},30000)
afterAll(async()=>browser?.close())

async function fixture({header=false}={}){
 const context=await browser.newContext({viewport:{width:1200,height:850},reducedMotion:'reduce'}),page=await context.newPage(),errors=[]
 page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://research-preview.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\n[data-workspace-surface-hidden=true]{visibility:hidden!important}html,body{margin:0}#host{height:800px;width:100vw}[data-research-canvas]{height:740px!important}#preview-toggle{position:fixed;top:0;right:0;z-index:10000}</style>${header?'<div id="header" style="position:fixed;top:0;left:0;z-index:1000"></div>':''}<div class="pI_x6G_frame"><div class="pI_x6G_centerCol"><div id="host"></div></div></div><button id="preview-toggle">fixture preview toggle</button>`}))
 await page.goto('https://research-preview.test/');await page.addScriptTag({content:script});await page.waitForSelector('[data-ework-toolbar]').catch(error=>{throw Error(error.message+'; page errors: '+JSON.stringify(errors))})
 return {page,errors,close:()=>context.close()}
}
async function preview(page){
 expect(await page.evaluate(()=>typeof window.fixture.workspace().setPreviewMode)).toBe('function')
 await page.locator('#preview-toggle').click()
 expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(true)
}
const content=page=>page.evaluate(()=>{const s=window.fixture.workspace().getSnapshot();return JSON.stringify([s.files,s.artifacts])})

it('defaults to edit and persists each board preview preference across switching and reload',async()=>{
 const {page,close,errors}=await fixture()
 try{
  expect(await page.evaluate(()=>typeof window.fixture.workspace().getPreviewMode)).toBe('function')
  expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(false)
  await preview(page);await page.evaluate(()=>window.fixture.render('second-board'))
  await expect.poll(()=>page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(false)
  await page.evaluate(()=>window.fixture.render('preview-board'))
  await expect.poll(()=>page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(true)
  await page.reload();await page.addScriptTag({content:script});await page.waitForSelector('[data-ework-toolbar]')
  expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(true)
  await page.locator('#preview-toggle').click()
  expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(false)
  expect(errors).toEqual([])
 }finally{await close()}
},20000)

it('keeps only permitted component actions and copies the serialized component without duplicating it',async()=>{
 const {page,close}=await fixture()
 try{
  const id=await page.evaluate(()=>window.fixture.workspace().createFinancialWidget('news').id)
  await page.locator('[data-workbench-more="'+id+'"]').waitFor();await preview(page)
  const before=await content(page)
  expect(await page.locator('[data-research-node-id="'+id+'"] .ew-grid-header').getByRole('button',{name:'移除组件',exact:true}).count()).toBe(0)
  await page.locator('[data-workbench-more="'+id+'"]').click()
  const menu=page.getByRole('menu',{name:'组件更多操作',exact:true})
  const labels=await menu.getByRole('menuitem').allTextContents()
  expect(labels.map(x=>x.trim().replace(/›$/,''))).toEqual(['放大阅读','复制组件','添加至组件库','导出','刷新行情与资讯','数据源与自动更新'])
  await menu.getByRole('menuitem',{name:'复制组件',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__copies.length)).toBe(1)
  const copied=await page.evaluate(()=>window.__copies[0])
  expect(copied.sessionId).toBe('preview-board');expect(copied.nodes).toHaveLength(1)
  expect(copied.nodes[0]).toMatchObject({id,kind:'generated-container',containerSpec:{type:'financial-widget',widget:'news'}})
  expect(await content(page)).toBe(before)
  await page.locator('[data-workbench-more="'+id+'"]').click()
  await menu.getByRole('menuitem',{name:'添加至组件库',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__library.filter(x=>x.action==='save').length)).toBe(1)
  expect(await content(page)).toBe(before)
 }finally{await close()}
},20000)

it('disables all four creation tools while keeping selection, native Arrange and theme controls usable',async()=>{
 const {page,close}=await fixture()
 try{
  await page.evaluate(()=>window.fixture.workspace().setArtifacts([window.fixture.text('a'),window.fixture.text('b',600,500)]));await preview(page)
  for(const selector of ['[data-financial-library]','[data-research-global-container]','[data-research-global-link]','[data-research-global-voice]']){
   expect(await page.locator(selector).count(),selector).toBe(1);expect(await page.locator(selector).isDisabled(),selector).toBe(true)
  }
  for(const selector of ['[data-research-global-select]','[data-research-global-arrange]','[data-workbench-arrange-toggle]','[data-workbench-theme-toggle]'])expect(await page.locator(selector).isDisabled(),selector).toBe(false)
  const before=await content(page)
  await page.locator('[data-workbench-theme-toggle]').click();await page.getByRole('menuitemradio',{name:'易方达模式',exact:true}).click()
  expect(await page.locator('[data-ework-grid]').getAttribute('data-workbench-style')).toBe('enterprise')
  expect(await content(page)).toBe(before)
  await page.locator('[data-workbench-arrange-toggle]').click();await page.getByRole('menuitemradio',{name:'单排整理',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.fixture.workspace().getWorkbenchCells().filter(c=>c.x!==0).length)).toBe(0)
  expect(await page.evaluate(()=>window.fixture.workspace().getWorkbenchCells().every(c=>c.w===40))).toBe(true)
  expect(await content(page)).not.toBe(before)
 }finally{await close()}
},20000)

it('hides tab More and blocks tab structural APIs while allowing the real page tabs to switch',async()=>{
 const {page,close}=await fixture()
 try{
  const tabs=await page.evaluate(()=>{const w=window.fixture.workspace();w.setArtifacts([window.fixture.text('a')]);return w.createBoardTabs().containerSpec.tabs})
  await page.locator('[data-board-tabs-more]').waitFor();await preview(page)
  expect(await page.locator('[data-board-tabs-more]').count()).toBe(0)
  const before=await content(page)
  await page.locator('[data-board-tab="'+tabs[1].id+'"]').click()
  expect(await page.evaluate(()=>window.fixture.workspace().getActiveBoardTab())).toBe(tabs[1].id)
  expect(await content(page)).toBe(before)
  const attempts=await page.evaluate(()=>{const w=window.fixture.workspace(),nav=w.getSnapshot().artifacts.find(n=>n.containerSpec?.type==='board-tabs');return [w.createBoardTabs(),w.saveBoardTabs(nav.containerSpec.revision,nav.containerSpec.tabs.map((t,i)=>({...t,name:'改名 '+i}))),w.removeBoardTabs(),w.moveToBoardTab(['a'],nav.containerSpec.tabs[0].id)]})
  expect(attempts.every(x=>!x)).toBe(true);expect(await content(page)).toBe(before)
 }finally{await close()}
},20000)

it('blocks workspace edits, clipboard insertion and AI edits including forged Arrange bypass options',async()=>{
 const {page,close}=await fixture()
 try{
  await page.evaluate(()=>{const w=window.fixture.workspace();w.setArtifacts([window.fixture.text('a')]);w.updateSelection(['a'],'replace')});await preview(page)
  const before=await content(page)
  const result=await page.evaluate(async()=>{
   const w=window.fixture.workspace(),node=w.getSnapshot().artifacts[0],failures=[]
   for(const [label,run] of [
    ['rename',()=>w.renameNode('a','意外改名')],['content',()=>w.updateArtifactContent('a','意外编辑')],['remove',()=>w.removeNodes(['a'])],
    ['create',()=>w.createContainerDraft()],['financial',()=>w.createFinancialWidget('news')],['link',()=>w.createWebLink('https://example.com')],
    ['move',()=>w.moveNodes(['a'],{x:80,y:80},1)],['resize',()=>w.resizeNode('a','se',{x:80,y:80},1)],['geometry',()=>w.updateNodeGeometry('a',{width:600,height:600,sizeMode:'manual'})],
    ['pointer',()=>w.applyPointerGeometry([{...node,x:900,y:900}])],['setArtifacts',()=>w.setArtifacts([])],
    ['cells',()=>w.applyWorkbenchCells(w.getWorkbenchCells().map(c=>({...c,x:20})),true,{skipGuard:true})],
    ['organize',()=>w.organizeCanvas(new Map(),'one',{skipGuard:true})]
   ]){try{run()}catch(error){failures.push([label,error.message])}}
   for(const kind of ['paste','insert']){try{if(kind==='paste')await w.pasteClipboardNodes(null);else await w.insertClipboardNodes({kind:'text',text:'意外插入'},null)}catch(error){failures.push([kind,error.message])}}
   const inspect=await w.canvasAction('inspect',{});let aiError='';try{await w.canvasAction('apply',{requestId:'preview-edit',revision:inspect.revision,changes:[{op:'update',id:'a',fields:{title:'AI意外改名'}}]})}catch(error){aiError=error.message}
   return {failures,writable:inspect.writable,aiError}
  })
  expect(result.writable).toBe(false);expect(result.aiError).toBeTruthy()
  expect(result.failures.some(([kind])=>kind==='paste')).toBe(true);expect(result.failures.some(([kind])=>kind==='insert')).toBe(true)
  expect(await content(page)).toBe(before)
 }finally{await close()}
},20000)

it('blocks Delete, paste, cut and duplicate keyboard commands without stealing text edits inside a component',async()=>{
 const {page,close}=await fixture()
 try{
  await page.evaluate(()=>{const w=window.fixture.workspace();w.setArtifacts([window.fixture.text('a')]);w.updateSelection(['a'],'replace')});await preview(page)
  const before=await content(page),canvas=page.locator('[data-research-canvas]')
  await canvas.focus()
  for(const key of ['Delete','Backspace','Meta+v','Control+v','Meta+x','Meta+d','Meta+z'])await page.keyboard.press(key)
  await page.waitForTimeout(150);expect(await content(page)).toBe(before)
  const id=await page.evaluate(()=>{const w=window.fixture.registry.for('editable-search');window.fixture.render('editable-search');return w.createFinancialWidget('news').id})
  await page.locator('[data-research-node-id="'+id+'"] input[aria-label="搜索相关新闻"]').waitFor();await preview(page)
  const input=page.getByRole('searchbox',{name:'搜索相关新闻',exact:true})
  await input.fill('人工智能');await page.keyboard.press('Backspace');expect(await input.inputValue()).toBe('人工智')
 }finally{await close()}
},20000)

it('keeps real financial search and symbol selection sinks working in preview mode',async()=>{
 const {page,close}=await fixture()
 try{
  const ids=await page.evaluate(()=>{const w=window.fixture.workspace();return {news:w.createFinancialWidget('news').id,quote:w.createFinancialWidget('quote').id}})
  await page.locator('[data-workbench-more="'+ids.news+'"]').waitFor();await preview(page)
  const news=page.locator('[data-research-node-id="'+ids.news+'"] input[aria-label="搜索相关新闻"]')
  expect(await news.isDisabled()).toBe(false);await news.fill('人工智能');await news.press('Enter')
  await expect.poll(()=>page.evaluate(id=>window.fixture.workspace().getSnapshot().artifacts.find(n=>n.id===id).containerSpec.query,ids.news)).toBe('人工智能')
  const quote=page.locator('[data-research-node-id="'+ids.quote+'"] input[aria-label="搜索个股代码或名字"]')
  expect(await quote.isDisabled()).toBe(false);await quote.fill('微软')
  await page.getByRole('option').filter({hasText:'MSFT'}).click()
  await expect.poll(()=>page.evaluate(id=>window.fixture.workspace().getSnapshot().artifacts.find(n=>n.id===id).containerSpec.symbols[0].code,ids.quote)).toBe('MSFT')
  expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(true)
 }finally{await close()}
},20000)

it('never elevates original collaboration write permission when preview is toggled off',async()=>{
 const {page,close}=await fixture()
 try{
  const result=await page.evaluate(async()=>{
   const w=window.fixture.registry.for('shared-viewer');w.applyRemoteCanvas({files:[],artifacts:[window.fixture.text('shared-a')]},{revision:1});w.setCollaborationAccess(false)
   if(typeof w.setPreviewMode!=='function')return {missing:true}
   w.setPreviewMode(true);w.setPreviewMode(false)
   const before=JSON.stringify(w.getSnapshot().artifacts);w.renameNode('shared-a','不应升权');w.removeNodes(['shared-a']);w.createContainerDraft()
   const inspected=await w.canvasAction('inspect',{})
   return {missing:false,writable:inspected.writable,unchanged:before===JSON.stringify(w.getSnapshot().artifacts)}
  })
  expect(result.missing).toBe(false);expect(result.writable).toBe(false);expect(result.unchanged).toBe(true)
 }finally{await close()}
},20000)

it('cancels a clipboard read already in flight when the board enters preview',async()=>{
 const {page,close}=await fixture()
 try{
  expect(await page.evaluate(()=>typeof window.fixture.workspace().setPreviewMode)).toBe('function')
  await page.evaluate(()=>{
   const w=window.fixture.workspace();w.setArtifacts([window.fixture.text('a')])
   window.dshDesktop.researchClipboard.read=()=>new Promise(resolve=>{window.__resolveClipboard=resolve})
   window.__pendingPaste=w.pasteClipboardNodes(null).then(()=>({ok:true}),error=>({ok:false,error:error.message}))
  })
  await expect.poll(()=>page.evaluate(()=>typeof window.__resolveClipboard)).toBe('function')
  const before=await content(page)
  await preview(page)
  const outcome=await page.evaluate(async()=>{window.__resolveClipboard({kind:'text',text:'不应插入的异步剪贴板内容'});return await window.__pendingPaste})
  expect(outcome.ok).toBe(false);expect(outcome.error).toBeTruthy();expect(await content(page)).toBe(before)
 }finally{await close()}
},20000)

it('cancels a real pointer drag on mode change and ignores the later pointer release',async()=>{
 const {page,close}=await fixture()
 try{
  expect(await page.evaluate(()=>typeof window.fixture.workspace().setPreviewMode)).toBe('function')
  await page.evaluate(()=>window.fixture.workspace().setArtifacts([window.fixture.text('a'),window.fixture.text('b',600,500)]))
  const handle=page.locator('[data-workbench-drag-handle="a"]'),canvas=page.locator('[data-research-canvas]')
  await handle.waitFor();const initial=await page.evaluate(()=>window.fixture.workspace().getWorkbenchCells()),box=await handle.boundingBox()
  await page.mouse.move(box.x+Math.min(60,box.width/2),box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+180,box.y+110,{steps:4})
  expect(await canvas.getAttribute('data-grid-operation')).toBe('move')
  await page.evaluate(()=>window.fixture.workspace().setPreviewMode(true))
  await expect.poll(()=>canvas.getAttribute('data-grid-operation')).toBe(null)
  expect(await page.evaluate(()=>window.fixture.workspace().getWorkbenchCells())).toEqual(initial)
  await page.mouse.up();await page.mouse.move(900,650)
  expect(await page.evaluate(()=>window.fixture.workspace().getWorkbenchCells())).toEqual(initial)
  expect(await page.locator('[data-workbench-resize]:visible').count()).toBe(0)
 }finally{await close()}
},20000)

it('locks calendar content writes and an already-open editor while retaining date and search navigation',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const id=await page.evaluate(()=>{
   const date=new Intl.DateTimeFormat('en-CA').format(new Date()),event={id:'calendar-event',title:'既有日历事项',date,time:null,timezone:'UTC',notes:'只读保留的事项备注',repeat:'none',reminderMinutes:null,completedDates:[]}
   window.__calendarRequests=[]
   window.dshDesktop.calendarTool={subscribe:()=>()=>{},request:async input=>{window.__calendarRequests.push(input);return input.action==='pending'?null:{events:[event],notices:[]}}}
   return window.fixture.workspace().createCalendarTool().id
  })
  const calendar=page.locator('[data-research-node-id="'+id+'"] [data-calendar-tool]')
  await calendar.getByRole('button',{name:'既有日历事项',exact:true}).click()
  await page.getByRole('dialog',{name:'编辑事项',exact:true}).waitFor()
  expect(await page.locator('.ew-calendar-editor input[name="title"]').isEditable()).toBe(true)
  // Avoid outside-pointer dismissal so the test exercises the live editing state.
  await page.evaluate(()=>window.fixture.workspace().setPreviewMode(true))
  await expect.poll(()=>page.locator('.ew-calendar-editor input[name="title"]:not([readonly])').count()).toBe(0)
  expect(await calendar.locator('[data-calendar-add]').isDisabled()).toBe(true)
  expect(await calendar.getByRole('textbox',{name:'快速添加事项',exact:true}).isDisabled()).toBe(true)
  expect(await calendar.locator('[data-calendar-complete]').isDisabled()).toBe(true)
  if(await page.locator('.ew-calendar-editor').count())await page.locator('.ew-calendar-editor [data-calendar-cancel]').click()
  await calendar.getByRole('button',{name:'既有日历事项',exact:true}).click()
  const detail=page.getByRole('dialog',{name:'事项详情',exact:true});await detail.waitFor()
  expect(await detail.getByRole('button',{name:'保存',exact:true}).count()).toBe(0)
  expect(await detail.getByRole('button',{name:'删除',exact:true}).count()).toBe(0)
  expect(await detail.locator('[data-calendar-detail="notes"]').textContent()).toBe('只读保留的事项备注')
  await detail.locator('[data-calendar-cancel]').click()
  const monthBefore=await calendar.locator('[data-calendar-nav]').first().getAttribute('aria-label')
  await calendar.locator('[data-calendar-nav]').last().click()
  expect(await calendar.locator('[data-calendar-nav]').first().isDisabled()).toBe(false)
  expect(monthBefore).toBeTruthy()
  await calendar.locator('[data-calendar-today]').click()
  await calendar.locator('[data-calendar-search]').click()
  const search=calendar.locator('input[type="search"]');await search.fill('既有日历')
  expect(await search.inputValue()).toBe('既有日历')
  expect(await calendar.getByRole('button',{name:'既有日历事项',exact:true}).count()).toBe(1)
  expect(await page.evaluate(()=>window.__calendarRequests.filter(r=>['save','delete','complete'].includes(r.action)))).toEqual([])
  expect(errors).toEqual([])
 }finally{await close()}
},20000)

for(const kind of ['news','quote'])it('keeps connected '+kind+' selectors readonly with an upstream hint while source-company linkage stays active',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const ids=await page.evaluate(()=>{
   const w=window.fixture.workspace(),watch=w.createFinancialWidget('watchlist'),quote=w.createFinancialWidget('quote'),news=w.createFinancialWidget('news')
   const symbols=[{code:'AAPL',market:'US',name:'苹果'},{code:'MSFT',market:'US',name:'微软'}]
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>({...n,containerSpec:n.id===watch.id?{...n.containerSpec,symbols,selectedSymbol:'US:AAPL'}:n.id===quote.id?{...n.containerSpec,linkedWatchlistId:watch.id}:{...n.containerSpec,linkedSourceId:quote.id}})))
   return {watch:watch.id,quote:quote.id,news:news.id}
  })
  await page.locator('[data-workbench-more="'+ids.news+'"]').waitFor();await preview(page)
  const input=page.locator('[data-research-node-id="'+ids[kind]+'"] input[aria-label="'+(kind==='news'?'搜索相关新闻':'搜索个股代码或名字')+'"]')
  expect(await input.isDisabled()).toBe(true)
  expect(await input.getAttribute('title')).toContain('跟随上游联动')
  const links=await page.evaluate(ids=>{
   const nodes=window.fixture.workspace().getSnapshot().artifacts
   return {quote:nodes.find(n=>n.id===ids.quote).containerSpec.linkedWatchlistId,news:nodes.find(n=>n.id===ids.news).containerSpec.linkedSourceId}
  },ids)
  expect(links).toEqual({quote:ids.watch,news:ids.quote})
  // Selecting the existing source remains a use operation and updates linked receivers.
  await page.locator('[data-research-node-id="'+ids.watch+'"] [data-stock-code="MSFT"]').click()
  await expect.poll(()=>page.evaluate(ids=>{
   const nodes=window.fixture.workspace().getSnapshot().artifacts
   return [nodes.find(n=>n.id===ids.quote).containerSpec.symbols[0]?.code,nodes.find(n=>n.id===ids.news).containerSpec.symbols[0]?.code]
  },ids)).toEqual(['MSFT','MSFT'])
  expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(true)
  expect(errors).toEqual([])
 }finally{await close()}
},20000)

it('admits trusted host data refresh while rejecting AI silent or forged preview bypass options',async()=>{
 const {page,close,errors}=await fixture()
 try{
  await page.evaluate(()=>window.fixture.workspace().setArtifacts([{...window.fixture.text('data'),kind:'generated-container',generationStatus:'completed',containerPrompt:'数据组件',refreshMinutes:0,containerSpec:{version:1,type:'markdown',title:'数据组件',content:'旧数据'}}]));await preview(page)
  const result=await page.evaluate(async()=>{
   const w=window.fixture.workspace(),inspect=await window.__trustedCanvasHandler({sessionId:'preview-board',scheduled:true,source:'component-data-refresh',method:'inspect',args:{},selectedIds:['data'],isCancelled:()=>false}),spec={version:1,type:'markdown',title:'数据组件',content:'新数据'},failures=[]
   for(const options of [{silent:true},{previewToken:true,skipGuard:true},{previewToken:Symbol('research-preview-data-refresh')}]){try{await w.canvasAction('apply',{requestId:crypto.randomUUID(),revision:inspect.revision,changes:[{op:'update',id:'data',fields:{containerSpec:spec}}]},options)}catch(e){failures.push(e.message)}}
   const applied=await window.__trustedCanvasHandler({sessionId:'preview-board',scheduled:true,source:'component-data-refresh',method:'apply',args:{requestId:crypto.randomUUID(),revision:inspect.revision,changes:[{op:'update',id:'data',fields:{containerSpec:spec}}]},selectedIds:['data'],isCancelled:()=>false})
   const refreshed=await window.__trustedCanvasHandler({sessionId:'preview-board',source:'component-data-refresh',method:'inspect',args:{},selectedIds:['data'],isCancelled:()=>false})
   let shapeError='';try{await window.__trustedCanvasHandler({sessionId:'preview-board',source:'component-data-refresh',method:'apply',args:{requestId:crypto.randomUUID(),revision:refreshed.revision,changes:[{op:'update',id:'data',fields:{title:'非法改名'}}]},selectedIds:['data'],isCancelled:()=>false})}catch(e){shapeError=e.message}
   return {failures,applied,shapeError,node:w.getSnapshot().artifacts[0],receipt:w.getCanvasActionReceipt(),normalWritable:(await w.canvasAction('inspect',{})).writable}
  })
  expect(result.failures).toHaveLength(3);expect(result.node.containerSpec.content).toBe('新数据');expect(result.node.title).toBe('研究文字 data');expect(result.shapeError).toContain('仅可更新');expect(result.normalWritable).toBe(false);expect(result.receipt).toBeNull();expect(errors).toEqual([])
 }finally{await close()}
},20000)

it('locks manual media/content editors before import side effects while retaining their readable body',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const cases=[
   {type:'audio',url:null,selector:'[data-research-audio-preset]',hook:'__eworkEditAudio'},
   {type:'iframe',url:null,selector:'[data-research-iframe-preset]',hook:'__eworkEditIframe'},
   {type:'youtube',url:null,selector:'[data-research-youtube-preset]',hook:'__eworkEditYoutube'},
   {type:'summary',content:'完整研究结果',source:{title:'原文',text:'完整原始内容'},selector:'[data-research-derived-preset]',hook:'__eworkEditDerived'},
   {type:'files',items:[],selector:'[data-research-attachment-preset]'}
  ]
  for(const item of cases){
   await page.evaluate(item=>{const {selector,hook,...spec}=item;const w=window.fixture.workspace();w.setPreviewMode(false);w.setArtifacts([{...window.fixture.text('manual'),kind:'generated-container',generationStatus:'completed',containerPrompt:'手工内容',refreshMinutes:0,containerSpec:{version:1,title:'手工内容',...spec}}])},item)
   const body=page.locator(item.selector);await body.waitFor()
   if(item.hook)await body.evaluate((el,hook)=>el[hook]?.(),item.hook)
   await preview(page)
   if(item.hook)await body.evaluate((el,hook)=>el[hook]?.(),item.hook)
   const editable=body.locator('form input:not([disabled]),form textarea:not([disabled]),button:has-text("添加音频"):not([disabled]),button:has-text("添加网址"):not([disabled]),button:has-text("添加视频"):not([disabled])')
   expect(await editable.count(),item.type).toBe(0)
   if(item.type==='files')expect(await body.locator('input[type=file]').isDisabled()).toBe(true)
   expect(await body.count()).toBe(1)
  }
  expect(errors).toEqual([])
 }finally{await close()}
},30000)

it('keeps an in-flight preview copy as clipboard-only after switching to edit and blocks late edit-mode duplication after switching to preview',async()=>{
 const {page,close}=await fixture()
 try{
  await page.evaluate(()=>{const w=window.fixture.workspace();w.setArtifacts([window.fixture.text('copy-race')]);w.updateSelection(['copy-race'],'replace');window.dshDesktop.researchClipboard.copy=async value=>{window.__copies.push(value);return new Promise(resolve=>window.__finishCopy=()=>resolve({ok:true}))}})
  const before=await content(page);await preview(page)
  for(const startPreview of [true,false]){
   expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(startPreview)
   await page.locator('[data-workbench-more="copy-race"]').click();await page.getByRole('menu',{name:'组件更多操作'}).getByRole('menuitem',{name:'复制组件',exact:true}).click()
   await expect.poll(()=>page.evaluate(()=>typeof window.__finishCopy)).toBe('function')
   await page.locator('#preview-toggle').click();await page.evaluate(()=>{window.__finishCopy();window.__finishCopy=null});await page.waitForTimeout(80)
   expect(await content(page)).toBe(before)
  }
  expect(await page.evaluate(()=>window.__copies.length)).toBe(2)
 }finally{await close()}
},20000)

it('does not roll back board history in preview and retains that history for the next edit session',async()=>{
 const {page,close}=await fixture()
 try{
  await page.evaluate(()=>{const w=window.fixture.workspace();w.setArtifacts([window.fixture.text('history')]);w.renameNode('history','已确认标题')});const before=await content(page);await preview(page)
  expect(await page.evaluate(()=>{const w=window.fixture.workspace();return [w.undo(),w.redo()]})).toEqual([false,false]);expect(await content(page)).toBe(before)
  await page.locator('#preview-toggle').click();expect(await page.evaluate(()=>window.fixture.workspace().undo())).toBe(true)
  expect(await page.evaluate(()=>window.fixture.workspace().getSnapshot().artifacts[0].title)).toBe('研究文字 history')
 }finally{await close()}
},20000)

it('keeps an explicit close action for the expanded reader in preview while hiding canvas removal',async()=>{
 const {page,close}=await fixture()
 try{
  await page.evaluate(()=>window.fixture.workspace().setArtifacts([window.fixture.text('reader')]))
  await preview(page);await page.locator('[data-workbench-more="reader"]').click();await page.getByRole('menu',{name:'组件更多操作'}).getByRole('menuitem',{name:'放大阅读',exact:true}).click()
  await page.locator('[data-research-node-id="reader"][open]').waitFor()
  const finish=page.getByRole('button',{name:'关闭阅读',exact:true});expect(await finish.count()).toBe(1);await finish.click()
  expect(await page.locator('[data-research-node-id="reader"][open]').count()).toBe(0)
  expect(await page.locator('[data-research-node-id="reader"] button[aria-label="移除组件"]').count()).toBe(0)
  expect(await page.evaluate(()=>window.fixture.workspace().getSnapshot().artifacts.map(n=>n.id))).toEqual(['reader'])
 }finally{await close()}
},20000)

it('keeps a note calendar editable after leaving a research board whose local preview choice stays enabled',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const node=await page.evaluate(()=>{const w=window.fixture.workspace();const node=w.createCalendarTool();w.setPreviewMode(true);window.fixture.render('other-visible-board');window.__noteCalendarRequests=[];window.dshDesktop.calendarTool={request:async value=>{window.__noteCalendarRequests.push(value);return {events:[],notices:[]}},subscribe:()=>()=>{}};return node})
  await expect.poll(()=>page.evaluate(()=>document.querySelector('[data-research-preview-session]')?.dataset.researchPreviewSession)).toBe('other-visible-board')
  await page.evaluate(node=>window.fixture.renderNoteCalendar('preview-board',node),node)
  const note=page.locator('[data-note-document]'),quick=note.getByRole('textbox',{name:'快速添加事项',exact:true});await quick.waitFor();expect(await quick.isDisabled()).toBe(false)
  await quick.fill('笔记中的独立事项');await note.getByRole('button',{name:'保存快速事项',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__noteCalendarRequests.filter(r=>r.action==='save').length)).toBe(1)
  expect(await page.evaluate(()=>window.fixture.registry.for('preview-board').getPreviewMode())).toBe(true);expect(errors).toEqual([])
 }finally{await close()}
},20000)

it('allows an existing queued generation to finish after entering preview without admitting another component',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const id=await page.evaluate(()=>{const w=window.fixture.workspace(),node=w.createContainerDraft();const queued=w.beginContainerGeneration(node.id,'已开始的研究任务');if(!queued)throw Error('未建立占位任务');return node.id})
  await preview(page)
  const result=await page.evaluate(id=>{const w=window.fixture.workspace(),attached=w.attachGenerationTask(id,{taskId:'existing-task',canvasNodeId:id,state:'running',lastSeq:0,events:[]}),applied=w.applyGenerationInspection(id,{taskId:'existing-task',canvasNodeId:id,state:'completed',lastSeq:1,events:[],finalOutput:{version:1,type:'markdown',title:'已完成的研究',content:'真实完成结果'}}),extra=w.createContainerDraft();return {attached,applied,extra,node:w.getSnapshot().artifacts.find(n=>n.id===id),count:w.getSnapshot().artifacts.length}},id)
  expect(result.attached).toBe(true);expect(result.applied).toBe(true);expect(result.extra).toBeNull();expect(result.node.generationStatus).toBe('completed');expect(result.node.containerSpec.content).toBe('真实完成结果');expect(result.count).toBe(1);expect(errors).toEqual([])
 }finally{await close()}
},20000)


it('saves a same-id Notes calendar while the real surface host retains hidden preview Research DOM',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const node=await page.evaluate(()=>{
   const date=new Intl.DateTimeFormat('en-CA').format(new Date()),event={id:'same-owner-event',title:'笔记中的原有事项',date,time:null,timezone:'UTC',notes:'独立笔记日历',repeat:'none',reminderMinutes:null,completedDates:[]}
   window.__noteCalendarRequests=[];window.dshDesktop.calendarTool={request:async value=>{window.__noteCalendarRequests.push(value);return value.action==='pending'?null:{events:[event],notices:[]}},subscribe:()=>()=>{}}
   const node=window.fixture.workspace().createCalendarTool();window.fixture.workspace().setPreviewMode(true);return node
  })
  await page.locator('[data-research-node-id="'+node.id+'"] [data-calendar-tool]').waitFor()
  await page.evaluate(node=>{window.__retainedResearchRoot=document.querySelector('[data-research-canvas]');window.fixture.openNoteCalendar('preview-board',node)},node)
  const note=page.locator('[data-note-document]'),quick=note.getByRole('textbox',{name:'快速添加事项',exact:true});await quick.waitFor();expect(await quick.isDisabled()).toBe(false)
  const state=await page.evaluate(()=>({sameRoot:window.__retainedResearchRoot===document.querySelector('[data-research-canvas]'),preview:window.fixture.workspace().getPreviewMode(),hidden:window.__retainedResearchRoot.closest('[data-workspace-surface-hidden=true]')?.className,visibility:getComputedStyle(window.__retainedResearchRoot).visibility,surface:document.body.dataset.workspaceSurface}))
  expect(state).toEqual({sameRoot:true,preview:true,hidden:'pI_x6G_centerCol',visibility:'hidden',surface:'notes'})
  await quick.fill('Notes快速新增');await note.getByRole('button',{name:'保存快速事项',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__noteCalendarRequests.filter(r=>r.action==='save').length)).toBe(1)
  await note.getByRole('button',{name:'笔记中的原有事项',exact:true}).click()
  let editor=page.getByRole('dialog',{name:'编辑事项',exact:true});await editor.locator('input[name="title"]').fill('Notes编辑保存');await editor.getByRole('button',{name:'保存',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__noteCalendarRequests.filter(r=>r.action==='save').length)).toBe(2)
  await expect.poll(()=>editor.count()).toBe(0)
  await note.getByRole('button',{name:'笔记中的原有事项',exact:true}).click();editor=page.getByRole('dialog',{name:'编辑事项',exact:true});await editor.getByRole('button',{name:'删除',exact:true}).click();await editor.getByRole('button',{name:'确认删除',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>window.__noteCalendarRequests.filter(r=>r.action==='delete').length)).toBe(1)
  await expect.poll(()=>editor.count()).toBe(0);await note.locator('[data-calendar-complete]').click()
  await expect.poll(()=>page.evaluate(()=>window.__noteCalendarRequests.filter(r=>r.action==='complete').length)).toBe(1)
  const writes=await page.evaluate(()=>window.__noteCalendarRequests.filter(r=>['save','delete','complete'].includes(r.action)))
  expect(writes.map(r=>r.action)).toEqual(['save','save','delete','complete']);expect(writes.every(r=>r.sessionId==='preview-board'&&r.nodeId===node.id&&!Object.hasOwn(r,'origin'))).toBe(true)
  expect(await page.evaluate(()=>window.fixture.workspace().getPreviewMode())).toBe(true);expect(errors).toEqual([])
 }finally{await close()}
},20000)

it('rejects a hidden Research calendar origin and unknown owners despite an active same-id Notes surface',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const node=await page.evaluate(()=>{window.__noteCalendarRequests=[];window.dshDesktop.calendarTool={request:async value=>{window.__noteCalendarRequests.push(value);return {events:[],notices:[]}},subscribe:()=>()=>{}};const node=window.fixture.workspace().createCalendarTool();window.fixture.workspace().setPreviewMode(true);return node})
  await page.locator('[data-research-node-id="'+node.id+'"] [data-calendar-tool]').waitFor()
  await page.evaluate(node=>{window.__hiddenResearchCalendar=document.querySelector('[data-research-canvas] [data-research-node-id="'+node.id+'"] [data-calendar-tool]');window.fixture.openNoteCalendar('preview-board',node)},node)
  await page.locator('[data-note-document] [data-calendar-tool]').waitFor()
  const result=await page.evaluate(async node=>{
   const origin=window.__hiddenResearchCalendar,request=window.fixture.bundle.__PreviewCalendarRequest,errors=[]
   for(const action of ['save','delete','complete'])try{await request('preview-board',node.id,action,{surface:'notes'},origin);errors.push('unexpected success')}catch(error){errors.push(error.message)}
   for(const invalid of [undefined,origin.cloneNode(true)])try{await request('preview-board',node.id,'save',{},invalid);errors.push('unexpected success')}catch(error){errors.push(error.message)}
   const noteOrigin=document.querySelector('[data-note-document] [data-calendar-tool]'),native=noteOrigin.closest('.en-native-component-host');native.dataset.noteSession='wrong-session'
   try{await request('preview-board',node.id,'save',{},noteOrigin);errors.push('unexpected success')}catch(error){errors.push(error.message)}
   native.dataset.noteSession='preview-board';native.dataset.noteComponent='wrong-node'
   try{await request('preview-board',node.id,'save',{},noteOrigin);errors.push('unexpected success')}catch(error){errors.push(error.message)}
   return {errors,hidden:origin.isConnected&&getComputedStyle(origin).visibility==='hidden',writes:window.__noteCalendarRequests.filter(r=>['save','delete','complete'].includes(r.action))}
  },node)
  expect(result.hidden).toBe(true);expect(result.errors).toHaveLength(7);expect(result.errors.every(error=>error.includes('预览模式'))).toBe(true);expect(result.writes).toEqual([]);expect(errors).toEqual([])
 }finally{await close()}
},20000)

it.each(['workspace','listed-board'])('shows a quiet borderless mode pill after the right actions in four themes (%s)',async view=>{
 const {page,close,errors}=await fixture({header:true})
 try{
  await page.evaluate(view=>window.fixture.setHeaderState({favorites:view==='listed-board'?[{favoriteId:'real-favorite',sessionId:'preview-board',pinned:true}]:[],boards:[]}),view)
  const header=page.locator('#header'),pill=header.locator('[data-research-preview-toggle]'),collaboration=header.locator('[aria-label="创建协作"]');await pill.waitFor()
  expect(await header.locator('.srb-favorite-button').count()).toBe(view==='workspace'?1:0)
  for(const theme of ['light','dark','enterprise','openterminal']){
   await page.evaluate(theme=>{document.body.toggleAttribute('data-ds-dark-theme',['dark','openterminal'].includes(theme));window.fixture.workspace().setWorkbenchStyle(theme,{scope:'board'})},theme)
   for(const mode of ['编辑模式','预览模式']){
    expect(await pill.textContent()).toBe(mode);expect(await pill.locator('[data-research-preview-switch]').count()).toBe(1)
    const box=await pill.evaluate(el=>{const s=getComputedStyle(el);return{left:el.getBoundingClientRect().left,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,scroll:el.scrollWidth,client:el.clientWidth,color:s.color,border:s.borderTopWidth,borderStyle:s.borderTopStyle,radius:parseFloat(s.borderTopLeftRadius),background:s.backgroundColor}})
    expect(box.height).toBe(30);expect(box.width).toBeGreaterThanOrEqual(96);expect(box.width).toBeLessThanOrEqual(112);expect(box.scroll).toBeLessThanOrEqual(box.client);expect(box.border).toBe('0px');expect(box.borderStyle).toBe('none');expect(box.radius).toBeGreaterThanOrEqual(15);expect(box.background).not.toBe('rgba(0, 0, 0, 0)');expect(box.color).not.toBe('rgba(0, 0, 0, 0)')
    expect(box.left).toBeGreaterThanOrEqual((await collaboration.boundingBox()).x+(await collaboration.boundingBox()).width)
    if(mode==='编辑模式')expect(await pill.locator('[data-research-preview-glyph="pencil-line"]').count()).toBe(1)
    if(process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE)await header.screenshot({path:process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE+'/'+view+'-'+theme+'-'+(mode==='编辑模式'?'edit':'preview')+'.png'})
    const target=mode==='编辑模式'?'预览模式':'编辑模式';expect(await pill.getAttribute('aria-label')).toBe('切换到'+target);expect(await pill.getAttribute('title')).toBe('当前为'+mode+'，点击切换到'+target)
    await pill.click();await expect.poll(()=>pill.textContent()).toBe(target)
   }
  }
  expect(errors).toEqual([])
 }finally{await close()}
},30000)

it('hides only preview canvas selection and connection decoration while preserving links and selected watchlist rows in every theme',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const ids=await page.evaluate(()=>{
   const w=window.fixture.workspace(),tabs=w.createBoardTabs().containerSpec.tabs,watch=w.createFinancialWidget('watchlist');w.selectBoardTab(tabs[1].id);const quote=w.createFinancialWidget('quote')
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===watch.id?{...n,containerSpec:{...n.containerSpec,symbols:[{code:'AAPL',market:'US',name:'苹果'},{code:'MSFT',market:'US',name:'微软'}],selectedSymbol:'US:AAPL'}}:n.id===quote.id?{...n,containerSpec:{...n.containerSpec,linkedWatchlistId:watch.id}}:n));w.selectBoardTab(tabs[0].id);w.updateSelection([watch.id],'replace');return{watch:watch.id,quote:quote.id}
  })
  const canvas=page.locator('[data-research-canvas]'),card=page.locator('[data-research-node-id="'+ids.watch+'"]'),svg=canvas.locator(':scope > svg.ew-financial-connections'),stem=canvas.locator('[data-board-tabs-nav] > [data-financial-connection-stem]'),target=canvas.locator('[data-financial-connection-target]'),row=card.locator('[data-stock-code="AAPL"]')
  await expect.poll(()=>svg.locator('[data-financial-link="'+ids.quote+'"]').count()).toBe(1);await stem.waitFor();expect(await target.count()).toBe(1)
  for(const mode of ['light','dark','enterprise','openterminal']){
   await page.evaluate(mode=>window.fixture.workspace().setWorkbenchStyle(mode,{scope:'board'}),mode)
   await expect.poll(()=>canvas.getAttribute('data-workbench-style')).toBe(mode)
   const selected=await page.evaluate(()=>window.fixture.workspace().getSnapshot().selection),rowBefore=await row.evaluate(el=>({selected:el.getAttribute('aria-selected'),background:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow}))
   expect(rowBefore.selected).toBe('true');expect(await svg.isVisible()).toBe(true)
   await page.evaluate(()=>window.fixture.workspace().setPreviewMode(true))
   await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');expect(await svg.isVisible()).toBe(false);expect(await stem.isVisible()).toBe(false);expect(await card.locator(':scope > .ew-grid-chrome-host > .ew-grid-selection-ring').isVisible()).toBe(false)
   await expect.poll(()=>target.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe('rgba(0, 0, 0, 0)')
   if(mode==='openterminal'){await expect.poll(()=>card.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe('rgb(48, 48, 48)');expect(await card.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px')}
   expect(await row.evaluate(el=>({selected:el.getAttribute('aria-selected'),background:getComputedStyle(el).backgroundColor,shadow:getComputedStyle(el).boxShadow}))).toEqual(rowBefore)
   expect(await page.evaluate(()=>window.fixture.workspace().getSnapshot().selection)).toEqual(selected);expect(await page.evaluate(id=>window.fixture.workspace().getSnapshot().artifacts.find(n=>n.id===id).containerSpec.linkedWatchlistId,ids.quote)).toBe(ids.watch)
   await page.evaluate(()=>window.fixture.workspace().setPreviewMode(false));expect(await svg.isVisible()).toBe(true);expect(await stem.isVisible()).toBe(true)
  }
  await page.evaluate(()=>window.fixture.workspace().setPreviewMode(true));await card.locator('[data-stock-code="MSFT"]').click();await expect.poll(()=>page.evaluate(id=>window.fixture.workspace().getSnapshot().artifacts.find(n=>n.id===id).containerSpec.symbols[0]?.code,ids.quote)).toBe('MSFT');expect(errors).toEqual([])
 }finally{await close()}
},25000)

const footerGeometry=(page,id,kind)=>page.locator('[data-research-node-id="'+id+'"]').evaluate((card,kind)=>{
 const footer=card.querySelector(kind==='financial'?'.ew-financial-footer':kind==='study'?'.hws-footer':kind==='smart'?'.ew-smart-create-footer':'.odyssey-data-stamp')
 const source=footer.querySelector(kind==='financial'?'.ew-financial-provenance':kind==='study'?'.hws-footer-source':kind==='smart'?'.ew-smart-create-status':'.odyssey-data-frequency')
 const state=kind==='smart'?null:footer.querySelector(kind==='financial'?':scope > span':kind==='study'?'.hws-footer-state':'time')
 const f=footer.getBoundingClientRect(),s=source.getBoundingClientRect(),r=state?.getBoundingClientRect(),style=getComputedStyle(footer)
 return{source:source.textContent,state:state?.textContent,left:s.left-f.left,right:r?f.right-r.right:null,paddingLeft:parseFloat(style.paddingLeft),paddingRight:parseFloat(style.paddingRight),ports:[...card.querySelectorAll('[data-financial-port]')].map(el=>({side:el.dataset.financialPort,display:getComputedStyle(el).display,width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})),sourceTextInset:s.left-card.getBoundingClientRect().left+parseFloat(getComputedStyle(source).paddingLeft)}
},kind)

it('opens native news data settings only from the footer label or explicit menu',async()=>{
 const {page,close,errors}=await fixture()
 try{
  const id=await page.evaluate(()=>window.fixture.workspace().createFinancialWidget('news').id)
  const card=page.locator('[data-research-node-id="'+id+'"]'),footer=card.locator('.ew-financial-footer')
  const source=footer.getByRole('button',{name:'数据源与自动更新',exact:true})
  const dialog=page.getByRole('dialog',{name:'组件数据与自动更新',exact:true})
  await expect.poll(()=>source.innerText()).toContain('fixture')
  for(const mode of ['edit','preview']){
   if(mode==='preview')await preview(page)
   const bounds=await footer.boundingBox()
   const x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2
   await page.mouse.click(x,y)
   expect(await dialog.count(),mode).toBe(0)
   expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('button')?.className??null,{x,y}),mode).toBeNull()
   await source.click();await dialog.waitFor()
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'})
   await source.focus();await page.keyboard.press('Enter');await dialog.waitFor()
   await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'})
  }
  await card.locator('[data-workbench-more]').click()
  await page.getByRole('menuitem',{name:'数据源与自动更新',exact:true}).click()
  await dialog.waitFor()
  expect(errors).toEqual([])
 }finally{await close()}
},20000)

it('reclaims financial footer port slots in preview and restores edit geometry in all four themes',async()=>{
 const {page,close,errors}=await fixture(),evidence=[]
 try{
  const ids=await page.evaluate(()=>Object.fromEntries(['watchlist','quote','news'].map(kind=>[kind,window.fixture.workspace().createFinancialWidget(kind).id])))
  await page.locator('[data-research-node-id="'+ids.quote+'"] .ew-financial-footer').waitFor()
  for(const theme of ['light','dark','enterprise','openterminal']){
   await page.evaluate(theme=>window.fixture.workspace().setWorkbenchStyle(theme,{scope:'board'}),theme)
   const before=Object.fromEntries(await Promise.all(Object.entries(ids).map(async([kind,id])=>[kind,await footerGeometry(page,id,'financial')])))
   for(const value of Object.values(before))expect(value.ports.every(port=>port.width===20&&port.height===20)).toBe(true)
   const stored=await content(page);await preview(page)
   const after=Object.fromEntries(await Promise.all(Object.entries(ids).map(async([kind,id])=>[kind,await footerGeometry(page,id,'financial')])))
   for(const[kind,value]of Object.entries(after)){
    expect(value.ports.every(port=>port.display==='none'&&port.width===0&&port.height===0),kind).toBe(true)
    expect(value.left,kind).toBe(0);expect(value.right,kind).toBe(0)
    expect(value.source).toBe(before[kind].source);expect(value.state).toBe(before[kind].state)
    expect(value.sourceTextInset).toBe(theme==='openterminal'?13:12)
   }
   expect(before.quote.left-after.quote.left).toBe(28);expect(before.quote.right-after.quote.right).toBe(28)
   expect(before.news.left-after.news.left).toBe(28);expect(before.watchlist.right-after.watchlist.right).toBe(28)
   expect(await content(page)).toBe(stored)
   await page.locator('#preview-toggle').click()
   for(const[kind,id]of Object.entries(ids))expect(await footerGeometry(page,id,'financial')).toEqual(before[kind])
   evidence.push({theme,before,preview:after})
  }
  if(process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE)await writeFile(process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE+'/financial-footer-geometry.json',JSON.stringify(evidence,null,2))
  expect(errors).toEqual([])
 }finally{await close()}
},30000)

it('reclaims connected footer reserves while preserving port-free study and HTML padding in research preview',async()=>{
 const {page,close,errors}=await fixture(),evidence=[]
 try{
  const ids=await page.evaluate(()=>{
   const w=window.fixture.workspace(),study={...window.fixture.text('footer-study'),messageId:'footer-study',kind:'generated-container',generationStatus:'completed',containerPrompt:'研究组件',refreshMinutes:0,containerSpec:window.fixture.bundle.__PreviewStudySpec('directory')},html={...window.fixture.text('footer-html'),messageId:'footer-html',kind:'generated-container',generationStatus:'completed',containerPrompt:'正文组件',refreshMinutes:0,containerSpec:{version:1,type:'html',title:'生成 HTML',html:'<article><p>正文可正常浏览</p></article>'}}
   const peer={...study,id:'footer-peer',messageId:'footer-peer',containerSpec:window.fixture.bundle.__PreviewStudySpec('peers')},customHtml={...html,id:'footer-html-custom',messageId:'footer-html-custom'}
   const smart=w.createContainerDraft();w.setArtifacts([study,html,peer,customHtml,smart]);return{study:study.id,html:html.id,peer:peer.id,customHtml:customHtml.id,smart:smart.id}
  })
  await page.locator('[data-research-node-id="'+ids.study+'"] .hws-footer').waitFor().catch(async error=>{throw Error(error.message+'; '+JSON.stringify({errors,snapshot:await page.evaluate(()=>window.fixture.workspace().getSnapshot().artifacts.map(n=>({id:n.id,type:n.containerSpec?.type}))),dom:await page.locator('#host').innerText()}))});await page.locator('[data-research-node-id="'+ids.html+'"] .odyssey-data-stamp').waitFor();await page.locator('[data-research-node-id="'+ids.smart+'"] .ew-smart-create-footer').waitFor()
  await page.locator('[data-research-node-id="'+ids.peer+'"] .hws-footer').waitFor();await page.locator('[data-research-node-id="'+ids.customHtml+'"] .odyssey-data-stamp').waitFor()
  // Lower-specificity host customizations must survive when no connection slot
  // exists. The former unconditional preview reset overrides both real owners.
  await page.addStyleTag({content:'body [data-ework-grid] [data-research-node-id="'+ids.peer+'"] .hws-footer{padding-left:18px!important;padding-right:22px!important}@layer ework-workbench{body [data-research-canvas][data-ework-grid] [data-research-node-id="'+ids.customHtml+'"] .odyssey-data-stamp{padding-left:18px!important;padding-right:22px!important}}'})
  const kinds={study:'study',html:'html',peer:'study',customHtml:'html',smart:'smart'},measure=async()=>Object.fromEntries(await Promise.all(Object.entries(ids).map(async([key,id])=>[key,await footerGeometry(page,id,kinds[key])])))
  for(const theme of ['light','dark','enterprise','openterminal']){
   await page.evaluate(theme=>window.fixture.workspace().setWorkbenchStyle(theme,{scope:'board'}),theme)
   const before=await measure()
   expect(before.study.ports.map(port=>port.side)).toEqual(['input','output']);expect(before.study.left).toBe(24);expect(before.study.right).toBe(24)
   expect(before.smart.ports).toHaveLength(1);expect(before.smart.left).toBe(36)
   for(const key of ['peer','customHtml']){expect(before[key].ports).toEqual([]);expect(before[key].left).toBe(18);expect(before[key].right).toBe(22)}
   expect(before.html.ports).toEqual([])
   const stored=await content(page);await preview(page)
   const after=await measure()
   expect(after.study.left).toBe(12);expect(after.study.right).toBe(12)
   expect(after.smart.left).toBe(10)
   for(const key of ['html','peer','customHtml'])expect(after[key]).toEqual(before[key])
   for(const[kind,value]of Object.entries(after)){
    expect(value.ports.every(port=>port.display==='none'&&port.width===0&&port.height===0),kind).toBe(true)
    expect(value.source).toBe(before[kind].source);expect(value.state).toBe(before[kind].state)
   }
   expect(await content(page)).toBe(stored);await page.locator('#preview-toggle').click()
   expect(await measure()).toEqual(before)
   evidence.push({theme,before,preview:after})
  }
  if(process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE)await writeFile(process.env.SHERLOCK_TEST_RESEARCH_PREVIEW_EVIDENCE+'/generated-footer-geometry.json',JSON.stringify(evidence,null,2))
  expect(errors).toEqual([])
 }finally{await close()}
},30000)
