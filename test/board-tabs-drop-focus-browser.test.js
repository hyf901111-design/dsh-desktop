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
 source=(await import('../scripts/lib/patch-research-board-client.mjs')).canvasWheelPassThroughPatch(source)
 const grid=require('../scripts/lib/research-grid-workbench.mjs')
 source=grid.patchResearchGridWorkbench(require('../scripts/lib/financial-widget-client.mjs').patchFinancialWidgetClient(require('../scripts/lib/component-data-refresh.mjs').patchComponentDataRefresh(grid.restoreResearchGridWorkbench(source))))
 source=require('../scripts/lib/derived-preset-client.mjs').patchDerivedPresetClient(source)
 source=require('../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source)
 expect(require('../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source)).toBe(source)
 // The installed SDK may contain an earlier serialized preview. Exercise the
 // current runtime with the production sandbox bridge and canvas renderer.
 source=source.replace('function buildResearchHtmlPreview(html, title = ', 'const buildResearchHtmlPreview = window.fixtureBuildHtml;\nfunction bundledResearchHtmlPreview(html, title = ')
 expect(()=>new Function(source)).not.toThrow()
 const entry=`import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 import {buildResearchHtmlPreview} from './packages/dsh-research-task-runtime/html-artifact.js';window.fixtureBuildHtml=buildResearchHtmlPreview;
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
 page.on('pageerror',error=>{errors.push(error.message);console.error(error.stack)})
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

it.each(['horizontal','vertical'])('scrolls the %s navigation according to its orientation',async orientation=>{
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
  if(orientation==='horizontal'){
   expect(await top()).toBeLessThan(initial-700)
   return
  }
  expect(await top()).toBe(initial)
  const viewport=await canvas.boundingBox(),nav=await bar.boundingBox()
  const capture=()=>page.screenshot({clip:{x:Math.ceil(nav.x)+4,y:Math.ceil(viewport.y)+1,width:Math.floor(nav.width)-8,height:8}})
  const gutter=await capture()
  const hideContent=await page.addStyleTag({content:'.ew-board-tabs-rail{visibility:hidden}'})
  const bareGrid=await capture()
  await hideContent.evaluate(el=>el.remove())
  expect(gutter.equals(bareGrid),'the gutter above vertical navigation shows the canvas grid').toBe(true)
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

it('selected HTML cards scroll the canvas outside a scrollable region and grow around expanded details',async()=>{
 const {page,first,second,errors}=await fixture()
 try{
  page.setDefaultTimeout(4500)
  await page.evaluate(({first,second})=>{
   const w=fixture.workspace,base=w.getSnapshot().artifacts.find(n=>n.id===first)
   const html=`<html><head><style>html{overflow-y:hidden!important}#diagram{height:160px;overflow-x:auto}#diagram>div{width:125%}#records{height:52px;overflow:auto}#records p{height:180px;margin:0}</style></head><body><div id="diagram"><div>治理关系图</div></div><div id="records"><p>有独立滚动的明细</p></div><details><summary><span>说明</span></summary>${'<p>完整的治理架构说明。</p>'.repeat(14)}</details></body></html>`
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===first?{...base,kind:'generated-container',title:'组织架构',generationStatus:'completed',containerSpec:{version:1,type:'html',title:'组织架构',html}}:n))
   w.setBoardTabsPresentation('vertical')
   w.applyWorkbenchCells([{id:first,x:0,y:0,w:40,h:19},{id:second,x:0,y:19,w:40,h:40}],true)
   w.updateSelection([first],'replace')
  },{first,second})
  const canvas=page.locator('[data-research-canvas]'),card=page.locator(`[data-research-node-id="${first}"]`),below=page.locator(`[data-research-node-id="${second}"]`)
  const body=card.frameLocator('iframe[data-research-html-artifact]').frameLocator('iframe')
  const diagram=body.locator('#diagram'),records=body.locator('#records'),summary=body.locator('summary'),details=body.locator('details')
  const offset=()=>canvas.evaluate(el=>el.scrollTop)
  const geometry=async()=>[(await card.boundingBox()).height,(await below.boundingBox()).y+(await offset())]
  await body.locator('html[data-workbench-selected="true"]').waitFor({state:'attached'})
  expect(await diagram.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(0)
  await expect.poll(()=>canvas.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(250)
  await records.hover();await page.mouse.wheel(0,70)
  await expect.poll(()=>records.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  expect(await offset()).toBe(0)
  await records.evaluate(el=>{el.scrollTop=el.scrollHeight});await page.mouse.wheel(0,85)
  await expect.poll(offset).toBeGreaterThan(0)
  await canvas.evaluate(el=>{el.scrollTop=0})
  await diagram.hover();await page.mouse.wheel(25,85)
  await expect.poll(offset).toBeGreaterThan(0)
  expect(await diagram.evaluate(el=>el.scrollLeft)).toBe(0)
  await canvas.evaluate(el=>{el.scrollTop=0})
  const closed=await geometry()
  const marker=()=>summary.evaluate(el=>{const s=getComputedStyle(el,'::before');return [s.verticalAlign,s.width,s.height,s.transform]})
  const closedMarker=await marker()
  await summary.click()
  await expect.poll(async()=>(await geometry())[0]).toBeGreaterThan(closed[0]+100)
  await expect.poll(async()=>(await geometry())[1]).toBeGreaterThan(closed[1]+100)
  expect(await details.locator('p').last().evaluate(el=>el.getBoundingClientRect().bottom<=window.innerHeight)).toBe(true)
  const openMarker=await marker()
  expect(closedMarker.slice(0,3)).toEqual(['middle','12px','12px'])
  expect(openMarker.slice(0,3)).toEqual(closedMarker.slice(0,3))
  expect(openMarker[3]).not.toBe(closedMarker[3])
  await summary.click()
  await expect.poll(async()=>Math.round((await geometry())[0])).toBe(Math.round(closed[0]))
  await expect.poll(async()=>Math.round((await geometry())[1])).toBe(Math.round(closed[1]))
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)


it('native architecture disclosures grow the grid, align the chevron and release non-scrolling wheel gestures',async()=>{
 const {page,first,second,errors}=await fixture()
 try{
  page.setDefaultTimeout(4500)
  await page.evaluate(({first,second})=>{
   const w=fixture.workspace,base=w.getSnapshot().artifacts.find(n=>n.id===first)
   const spec={version:1,type:'mind-map',title:'治理架构',content:'# 治理架构\n- 会员大会\n  - 会员代表大会\n- 理事会',source:{title:'组织架构文档',text:'原始资料'},note:'说明正文完整保留。\n'.repeat(24)}
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===first?{...base,kind:'generated-container',generationStatus:'completed',containerSpec:spec}:n))
   w.setBoardTabsPresentation('vertical')
   w.applyWorkbenchCells([{id:first,x:0,y:0,w:40,h:30},{id:second,x:0,y:30,w:40,h:40}],true)
   w.updateSelection([first],'replace')
  },{first,second})
  const canvas=page.locator('[data-research-canvas]'),card=page.locator(`[data-research-node-id="${first}"]`),below=page.locator(`[data-research-node-id="${second}"]`)
  const diagram=card.locator('[data-research-mind-map]'),summary=card.locator('summary').filter({hasText:/^说明$/})
  const offset=()=>canvas.evaluate(el=>el.scrollTop),geometry=async()=>[(await card.boundingBox()).height,(await below.boundingBox()).y+await offset()]
  await diagram.hover();await page.mouse.wheel(0,80)
  await expect.poll(offset).toBeGreaterThan(0)
  await canvas.evaluate(el=>{el.scrollTop=0})
  const closed=await geometry()
  const marker=()=>summary.evaluate(el=>{const s=getComputedStyle(el,'::before');return [s.verticalAlign,s.width,s.height]})
  expect(await marker()).toEqual(['middle','12px','12px'])
  await summary.click()
  await expect.poll(async()=>(await geometry())[0]).toBeGreaterThan(closed[0]+150)
  await expect.poll(async()=>(await geometry())[1]).toBeGreaterThan(closed[1]+150)
  expect(await marker()).toEqual(['middle','12px','12px'])
  expect(await summary.locator('..').locator('pre').evaluate(el=>el.getBoundingClientRect().bottom<=el.closest('[data-research-node-id]').getBoundingClientRect().bottom)).toBe(true)
  const expanded=await geometry()
  await page.locator('#host').evaluate(el=>{el.style.width='900px'})
  await expect.poll(()=>card.evaluate(el=>el.getBoundingClientRect().width)).toBeLessThan(700)
  await expect.poll(()=>summary.locator('..').locator('pre').evaluate(el=>el.getBoundingClientRect().bottom<=el.closest('[data-research-node-id]').getBoundingClientRect().bottom)).toBe(true)
  await page.locator('#host').evaluate(el=>{el.style.width='1000px'})
  await expect.poll(async()=>Math.round((await geometry())[0])).toBe(Math.round(expanded[0]))
  await summary.click()
  await expect.poll(async()=>Math.round((await geometry())[0])).toBe(Math.round(closed[0]))
  await expect.poll(async()=>Math.round((await geometry())[1])).toBe(Math.round(closed[1]))
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it('selected oversized native maps scroll inside the card and return the wheel only at their edge',async()=>{
 const {page,first,second,errors}=await fixture()
 try{
  await page.evaluate(({first,second})=>{
   const w=fixture.workspace,base=w.getSnapshot().artifacts.find(n=>n.id===first)
   const spec={version:1,type:'mind-map',title:'大型导图',content:'# 组织机构\n'+Array.from({length:32},(_,i)=>'- 部门'+(i+1)+'\n  - 职责及负责人').join('\n'),source:{title:'组织文档',text:'完整组织资料'},note:'原文说明。\n'.repeat(20)}
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===first?{...base,kind:'generated-container',generationStatus:'completed',containerSpec:spec}:n))
   w.setBoardTabsPresentation('vertical')
   w.applyWorkbenchCells([{id:first,x:0,y:0,w:40,h:22},{id:second,x:0,y:22,w:40,h:40}],true)
   w.updateSelection([first],'replace')
  },{first,second})
  const canvas=page.locator('[data-research-canvas]'),card=page.locator(`[data-research-node-id="${first}"]`),diagram=card.locator('[data-research-mind-map]')
  const innerOffset=()=>card.evaluate(el=>[...el.querySelectorAll('*')].reduce((sum,x)=>sum+x.scrollTop,0))
  await diagram.hover()
  await card.evaluate(el=>{for(const x of el.querySelectorAll('*'))x.scrollTop=0})
  await canvas.evaluate(el=>{el.scrollTop=0})
  expect(await innerOffset()).toBe(0)
  const box=await card.boundingBox();await page.mouse.move(box.x+180,box.y+150)
  await page.mouse.wheel(0,120)
  await expect.poll(innerOffset).toBeGreaterThan(0)
  expect(await canvas.evaluate(el=>el.scrollTop)).toBe(0)
  await card.evaluate(el=>{for(const x of el.querySelectorAll('*'))if(x.scrollHeight>x.clientHeight)x.scrollTop=x.scrollHeight})
  await page.mouse.wheel(0,120)
  await expect.poll(()=>canvas.evaluate(el=>el.scrollTop)).toBeGreaterThan(0)
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it('native disclosures reserve only revealed content, keep source controls anchored and stay stable after internal scrolling',async()=>{
 const {page,first,second,errors}=await fixture()
 try{
  await page.evaluate(({first,second})=>{
   const w=fixture.workspace,base=w.getSnapshot().artifacts.find(n=>n.id===first)
   const spec={version:1,type:'mind-map',title:'完整架构',content:'# 机构\n'+Array.from({length:32},(_,i)=>'- 部门'+i+'\n  - 岗位人员').join('\n'),source:{title:'组织架构来源.docx',text:'来源正文。\n'.repeat(8)},note:'只显示两行说明。\n保留原始来源。'}
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===first?{...base,kind:'generated-container',generationStatus:'completed',containerSpec:spec}:n))
   w.setBoardTabsPresentation('vertical')
   w.applyWorkbenchCells([{id:first,x:0,y:0,w:40,h:22},{id:second,x:0,y:22,w:40,h:40}],true)
   w.updateSelection([first],'replace')
  },{first,second})
  const canvas=page.locator('[data-research-canvas]'),card=page.locator(`[data-research-node-id="${first}"]`),below=page.locator(`[data-research-node-id="${second}"]`)
  const source=card.locator('summary').filter({hasText:'查看来源原文'}),note=card.locator('summary').filter({hasText:/^说明$/})
  const height=()=>card.evaluate(el=>el.getBoundingClientRect().height)
  const position=()=>source.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('[data-research-derived-preset]').getBoundingClientRect();return [r.left-p.left,r.top-p.top]})
  const closed=await height(),anchor=await position()
  await source.click()
  await expect.poll(height).toBeGreaterThan(closed+100)
  expect(await height()).toBeLessThan(closed+250)
  expect(await position()).toEqual(anchor)
  await source.click()
  await expect.poll(height).toBe(closed)
  const belowClosed=await below.evaluate(el=>el.getBoundingClientRect().top)
  for(let cycle=0;cycle<3;cycle++){
   // An offscreen summary is reached through the real overflowing card owner.
   await card.evaluate(el=>{for(const x of el.querySelectorAll('*'))if(x.scrollHeight>x.clientHeight)x.scrollTop=x.scrollHeight})
   await note.click()
   await expect.poll(height).toBeGreaterThan(closed+20)
   expect(await height()).toBeLessThan(closed+110)
   await expect.poll(()=>below.evaluate(el=>el.getBoundingClientRect().top)).toBeGreaterThan(belowClosed)
   const opened=await height()
   // Scroll offset and resize observations must not inflate a second time.
   await card.evaluate(el=>{for(const x of el.querySelectorAll('*'))x.scrollTop=0;window.dispatchEvent(new Event('resize'))})
   await expect.poll(height).toBe(opened)
   await note.click()
   await expect.poll(height).toBe(closed)
  }
  await canvas.evaluate(el=>{el.scrollTop=0})
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it('wide native diagrams fit the card to their reflowed content and pull the next card up without losing text',async()=>{
 const {page,first,second,errors}=await fixture()
 try{
  page.setDefaultTimeout(4500)
  await page.setViewportSize({width:1800,height:1000})
  await page.locator('#host').evaluate(el=>{el.style.width='1660px'})
  await page.evaluate(({first,second})=>{
   const w=fixture.workspace,base=w.getSnapshot().artifacts.find(n=>n.id===first)
   const spec={version:1,type:'mind-map',title:'响应式架构',content:'# 完整机构\n'+Array.from({length:6},(_,i)=>'- 机构'+i+'\n  - 完整职责'+i+'\n  - 原文依据'+i).join('\n'),source:{title:'机构资料',text:'全部来源。\n'.repeat(8)},note:'完整说明。\n'.repeat(5)}
   w.setArtifacts(w.getSnapshot().artifacts.map(n=>n.id===first?{...base,x:812,y:912,width:1600,height:1800,kind:'generated-container',generationStatus:'completed',containerSpec:spec}:n))
   w.updateSelection([first],'replace')
  },{first,second})
  const card=page.locator(`[data-research-node-id="${first}"]`),map=card.locator('[data-research-mind-map]')
  await expect.poll(()=>map.getAttribute('data-research-mind-map-layout')).toBe('wide')
  await expect.poll(()=>card.evaluate(el=>el.getBoundingClientRect().height)).toBeLessThan(800)
  expect(await map.locator('[data-research-mind-map-node]').count()).toBe(19)
  const note=card.locator('summary').filter({hasText:/^说明$/}),height=()=>card.evaluate(el=>el.getBoundingClientRect().height)
  const closed=await height()
  const gap=await page.locator(`[data-research-node-id="${second}"]`).evaluate((el,id)=>el.getBoundingClientRect().top-document.querySelector('[data-research-node-id="'+id+'"]').getBoundingClientRect().bottom,first)
  expect(gap).toBeGreaterThanOrEqual(0);expect(gap).toBeLessThan(25)
  await note.click();await expect.poll(height).toBeGreaterThan(closed+40)
  expect(await height()).toBeLessThan(closed+180)
  await note.click();await expect.poll(height).toBe(closed)
  await page.locator('#host').evaluate(el=>{el.style.width='800px'})
  await expect.poll(()=>map.getAttribute('data-research-mind-map-layout')).toBe('compact')
  expect(await map.locator('[data-research-mind-map-node]').count()).toBe(19)
  await page.locator('#host').evaluate(el=>{el.style.width='1660px'})
  await expect.poll(()=>map.getAttribute('data-research-mind-map-layout')).toBe('wide')
  await expect.poll(height).toBe(closed)
  await page.evaluate(first=>{const w=fixture.workspace;w.applyWorkbenchCells(w.getWorkbenchVisibleCells().map(c=>c.id===first?{...c,h:c.h+8}:c),true)},first)
  await expect.poll(height).toBeGreaterThan(closed+200)
  const manual=await height()
  await page.evaluate(()=>window.dispatchEvent(new Event('resize')))
  await expect.poll(height).toBe(manual)
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)
