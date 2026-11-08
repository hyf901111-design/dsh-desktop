import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'
import {stripConversationLiveUi} from './fixtures/strip-conversation-live-ui.mjs'

let browser,script
const evidence=process.env.SHERLOCK_TEST_EVIDENCE_DIR
beforeAll(async()=>{
 const require=createRequire(import.meta.url)
 let source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 // Match production unwind order, including the parallel composer layer in integration.
 source=stripConversationLiveUi(source)
 for(const [file,strip] of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput'],['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']]){if(file==='home-guide-presentation-native')source=stripWorkbenchReplay(source);source=require('../scripts/lib/'+file+'.mjs')[strip](source)}
 const grid=require('../scripts/lib/research-grid-workbench.mjs')
 source=grid.patchResearchGridWorkbench(require('../scripts/lib/financial-widget-client.mjs').patchFinancialWidgetClient(require('../scripts/lib/component-data-refresh.mjs').patchComponentDataRefresh(grid.restoreResearchGridWorkbench(source))))
 source=require('../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source)
 expect(require('../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source)).toBe(source)
 expect(()=>new Function(source)).not.toThrow()
 const entry=`import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};window.dshDesktop={};
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 (0,eval)(${JSON.stringify(source)});
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake);
 const registry=new bundle.ResearchWorkspaceRegistry(localStorage),workspace=registry.for('tab-drop-focus'),root=createRoot(document.getElementById('host'));
 window.fixture={bundle,workspace,registry};root.render(React.createElement(bundle.ResearchCanvas,{sessionId:'tab-drop-focus',t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false},actions:{}}));`
 script=(await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())
async function fixture(){
 const page=await browser.newPage({viewport:{width:1100,height:800},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://tab-drop-focus.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{height:740px;width:1000px}[data-research-canvas]{height:700px!important}</style><div id="host"></div>`}))
 await page.goto('https://tab-drop-focus.test/');await page.addScriptTag({content:script});await page.waitForSelector('[data-ework-grid]')
 const data=await page.evaluate(()=>{
  const w=fixture.workspace,first=w.createFinancialWidget('indices'),second=w.createFinancialWidget('watchlist');w.createBoardTabs()
  const nav=w.getSnapshot().artifacts.find(n=>n.containerSpec?.type==='board-tabs')
  return {first:first.id,second:second.id,source:nav.containerSpec.tabs[0].id,target:nav.containerSpec.tabs[1].id,original:first.containerSpec}
 })
 await page.waitForSelector('[data-board-tab]')
 return {page,errors,...data}
}
async function drag(page,id,target,{release=true,cancel=false}={}){
 const handle=page.locator('[data-research-node-id="'+id+'"] [data-workbench-drag-handle]').first()
 await handle.scrollIntoViewIfNeeded()
 const a=await handle.boundingBox(),b=await page.locator('[data-board-tab="'+target+'"]').boundingBox()
 await page.mouse.move(a.x+Math.min(a.width/2,80),a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:10})
 if(cancel)await page.keyboard.press('Escape')
 if(release)await page.mouse.up()
}
async function state(page){return page.evaluate(()=>{const w=fixture.workspace,s=w.getSnapshot(),nav=s.artifacts.find(n=>n.containerSpec?.type==='board-tabs');return {active:w.getActiveBoardTab(),viewport:s.viewport,tabs:nav.containerSpec.tabs,selection:s.selection,artifacts:s.artifacts,transients:document.querySelectorAll('.ew-board-tabs-live-preview,[data-release-animation],.ew-board-tabs-drag-position,.ew-board-tabs-drag-caption').length}})}

it('real pointer drop transfers ownership but keeps the source selected through reload; explicit tab click still navigates',async()=>{
 const f=await fixture(),{page}=f
 try{
  await drag(page,f.first,f.target,{release:false});expect((await state(page)).active).toBe(f.source)
  await page.mouse.up();await page.waitForFunction(()=>!document.querySelector('.ew-board-tabs-live-preview'))
  const moved=await state(page)
  expect(moved.active).toBe(f.source);expect(moved.tabs.map(t=>t.nodeIds)).toEqual([[f.second],[f.first]])
  expect(moved.selection.selectedNodeIds).not.toContain(f.first)
  expect(moved.artifacts.find(n=>n.id===f.first).containerSpec).toEqual(f.original)
  expect(await page.locator('[data-board-tab="'+f.source+'"]').getAttribute('aria-selected')).toBe('true')
  expect(await page.locator('[data-research-node-id="'+f.first+'"]').isVisible()).toBe(false)
  expect(moved.transients).toBe(0)
  if(evidence){await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'source-after-drop.json'),JSON.stringify(moved,null,2)+'\n');await page.screenshot({path:join(evidence,'source-after-drop.png')})}
  await page.reload();await page.addScriptTag({content:script});await page.waitForSelector('[data-board-tab]')
  const reopened=await state(page);expect(reopened.active).toBe(f.source);expect(reopened.tabs.map(t=>t.nodeIds)).toEqual([[f.second],[f.first]])
  await page.locator('[data-board-tab="'+f.target+'"]').click()
  expect((await state(page)).active).toBe(f.target);expect(await page.locator('[data-research-node-id="'+f.first+'"]').isVisible()).toBe(true)
  if(evidence)await page.screenshot({path:join(evidence,'target-after-manual-click.png')})
  expect(f.errors).toEqual([])
 }finally{await page.close()}
},15000)

it('consecutive drops stay on the original page and one-step undo restores the last move without selecting the target',async()=>{
 const f=await fixture(),{page}=f
 try{
  await drag(page,f.first,f.target);await page.waitForFunction(()=>!document.querySelector('.ew-board-tabs-live-preview'))
  expect((await state(page)).active).toBe(f.source)
  await drag(page,f.second,f.target);await page.waitForFunction(()=>!document.querySelector('.ew-board-tabs-live-preview'))
  const moved=await state(page);expect(moved.active).toBe(f.source);expect(moved.tabs.map(t=>t.nodeIds)).toEqual([[],[f.first,f.second]])
  await page.locator('[data-board-tabs-notice] button').click()
  const undone=await state(page);expect(undone.active).toBe(f.source);expect(undone.tabs.map(t=>t.nodeIds)).toEqual([[f.second],[f.first]])
  expect(await page.locator('[data-research-node-id="'+f.second+'"]').isVisible()).toBe(true);expect(f.errors).toEqual([])
 }finally{await page.close()}
},15000)

it('Escape cancels a real transfer without changing page, ownership, or leaving drag decorations',async()=>{
 const f=await fixture(),{page}=f
 try{
  const before=await state(page);await drag(page,f.first,f.target,{cancel:true});await page.waitForFunction(()=>!document.querySelector('.ew-board-tabs-live-preview'))
  const after=await state(page);expect(after.active).toBe(f.source);expect(after.tabs).toEqual(before.tabs);expect(after.transients).toBe(0)
  await page.locator('[data-board-tab="'+f.target+'"]').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter')
  expect((await state(page)).active).toBe(f.source)
  await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');expect((await state(page)).active).toBe(f.target)
  expect(f.errors).toEqual([])
 }finally{await page.close()}
},15000)

it('releasing in the tab bar outside a receiving label leaves ownership and the source page unchanged',async()=>{
 const f=await fixture(),{page}=f
 try{
  const before=await state(page);await drag(page,f.first,f.target,{release:false})
  const bar=await page.locator('[data-board-tabs-nav]').boundingBox()
  await page.mouse.move(bar.x+bar.width-80,bar.y+bar.height/2);await page.mouse.up()
  await page.waitForFunction(()=>!document.querySelector('.ew-board-tabs-live-preview'))
  const after=await state(page);expect(after.active).toBe(f.source);expect(after.tabs).toEqual(before.tabs);expect(after.transients).toBe(0)
  expect(await page.locator('[data-research-node-id="'+f.first+'"]').isVisible()).toBe(true);expect(f.errors).toEqual([])
 }finally{await page.close()}
},15000)

it.each(['vertical-short','vertical-overflow','vertical-bottom','horizontal-short','horizontal-overflow','horizontal-sideways'])('routes a wheel gesture over the tab list (%s)',async mode=>{
 const {page,first,second}=await fixture()
 try{
  const vertical=mode.startsWith('vertical'),many=!mode.endsWith('short')
  await page.evaluate(({vertical,many,first,second})=>{
   const w=fixture.workspace,nav=w.getSnapshot().artifacts.find(n=>n.containerSpec?.type==='board-tabs')
   if(many&&!w.saveBoardTabs(nav.containerSpec.revision,[...nav.containerSpec.tabs,...Array.from({length:90},(_,i)=>({id:'extra-'+i,name:'额外页签 '+i}))]))throw Error('fixture tabs did not save')
   if(vertical)w.setBoardTabsPresentation('vertical')
   w.applyWorkbenchCells([{id:first,x:0,y:0,w:40,h:40},{id:second,x:0,y:40,w:40,h:10}],true)
  },{vertical,many,first,second})
  const canvas=page.locator('[data-research-canvas]'),list=page.locator('[data-board-tabs-nav] [role=tablist]')
  const offset=()=>list.evaluate(el=>[el.scrollLeft,el.scrollTop])
  await expect.poll(()=>canvas.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(250)
  if(many)await expect.poll(()=>list.locator('[role=tab]').count()).toBe(92)
  const max=await list.evaluate((el,vertical)=>vertical?el.scrollHeight-el.clientHeight:el.scrollWidth-el.clientWidth,vertical)
  if(many)expect(max).toBeGreaterThan(250)
  else expect(max).toBe(0)
  if(mode==='vertical-bottom')await list.evaluate(el=>{el.scrollTop=el.scrollHeight})
  const before=await offset(),box=await list.boundingBox(),sideways=mode==='horizontal-sideways'
  await page.mouse.move(box.x+40,box.y+12)
  await page.mouse.wheel(sideways?200:0,sideways?0:200)
  if(mode==='vertical-overflow'||sideways){
   await expect.poll(async()=>(await offset())[vertical?1:0]).toBeGreaterThan(before[vertical?1:0])
   expect(await canvas.evaluate(el=>el.scrollTop)).toBe(0)
  }else{
   await expect.poll(()=>canvas.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
   expect(await offset()).toEqual(before)
  }
 }finally{await page.close()}
},15000)

it.each(['horizontal','vertical'])('keeps %s tabs in the viewport and switches pages from the bottom',async orientation=>{
 const {page,first,second,target}=await fixture()
 try{
  await page.evaluate(({first,second,target,orientation})=>{
   const w=fixture.workspace
   w.moveToBoardTab([second],target)
   w.setBoardTabsPresentation(orientation)
   w.applyWorkbenchCells([{id:first,x:0,y:0,w:40,h:70}],true)
  },{first,second,target,orientation})
  const canvas=page.locator('[data-research-canvas]'),bar=page.locator('[data-board-tabs-orientation="'+orientation+'"]')
  const tab=bar.locator('[data-board-tab="'+target+'"]'),top=async()=>Math.round((await tab.boundingBox()).y)
  await expect.poll(()=>canvas.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(700)
  const initial=await top()
  await canvas.evaluate(el=>{el.scrollTop=el.scrollHeight})
  await expect.poll(()=>canvas.evaluate(el=>el.scrollTop)).toBeGreaterThan(700)
  expect(await top()).toBe(initial)
  const viewport=await canvas.boundingBox(),nav=await bar.boundingBox()
  const strips=orientation==='vertical'?[viewport.y]:[viewport.y,nav.y+nav.height]
  const capture=()=>Promise.all(strips.map(y=>page.screenshot({clip:{x:Math.ceil(nav.x)+4,y:Math.ceil(y)+1,width:Math.floor(nav.width)-8,height:8}})))
  const gutters=await capture()
  const hideContent=await page.addStyleTag({content:'[data-research-node-id],.ew-board-tabs-rail,.ew-board-tabs-nav::before,.ew-board-tabs-nav::after{visibility:hidden!important}'})
  const bareGrid=await capture()
  await hideContent.evaluate(el=>el.remove())
  expect(gutters.every((strip,index)=>strip.equals(bareGrid[index])),'sticky navigation gutters should show only the canvas grid').toBe(true)
  const {x,y,width,height}=await tab.boundingBox()
  await page.mouse.click(x+width/2,y+height/2)
  await expect.poll(async()=>(await state(page)).active).toBe(target)
  expect(await page.locator('[data-research-node-id="'+second+'"]').isVisible()).toBe(true)
  expect(await page.locator('[data-research-node-id="'+first+'"]').isVisible()).toBe(false)
 }finally{await page.close()}
},15000)

it('the vertical list scrolls only after its tabs exceed the viewport, including on an empty page',async()=>{
 const {page,first,second,target}=await fixture()
 try{
  await page.evaluate(({first,second,target})=>{
   const w=fixture.workspace
   w.moveToBoardTab([first,second],target)
   w.setBoardTabsPresentation('vertical')
  },{first,second,target})
  const nav=page.locator('[data-board-tabs-orientation="vertical"]'),list=nav.getByRole('tablist')
  const addTabs=count=>page.evaluate(count=>{
   const w=fixture.workspace,spec=w.getSnapshot().artifacts.find(n=>n.containerSpec?.type==='board-tabs').containerSpec
   return w.saveBoardTabs(spec.revision,[...spec.tabs,...Array.from({length:count},(_,i)=>({id:`extra-${spec.tabs.length+i}`,name:`额外页签 ${spec.tabs.length+i}`}))])
  },count)
  expect(await addTabs(8)).toBe(true)
  await expect.poll(()=>list.getByRole('tab').count()).toBe(10)
  expect(await list.evaluate(el=>el.scrollHeight-el.clientHeight)).toBe(0)
  expect(await addTabs(24)).toBe(true)
  await expect.poll(()=>list.getByRole('tab').count()).toBe(34)
  const sizes=await list.evaluate(el=>({overflow:el.scrollHeight-el.clientHeight,bar:getComputedStyle(el).scrollbarWidth,navHeight:el.parentElement.offsetHeight,canvasHeight:el.closest('[data-research-canvas]').clientHeight}))
  expect(sizes.overflow).toBeGreaterThan(0)
  expect(sizes.bar).toBe('thin')
  expect(sizes.navHeight).toBe(sizes.canvasHeight-24)
  const label=list.getByRole('tab').last()
  await label.scrollIntoViewIfNeeded()
  await label.click()
  expect(await label.getAttribute('aria-selected')).toBe('true')
 }finally{await page.close()}
},15000)
