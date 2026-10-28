import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'

let browser,script
const evidence=process.env.SHERLOCK_TEST_EVIDENCE_DIR
beforeAll(async()=>{
 const require=createRequire(import.meta.url)
 let source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 // Match production unwind order, including the parallel composer layer in integration.
 if(source.includes('/* sherlock:composer-voice:v1 */'))source=require('../scripts/lib/composer-voice.mjs').stripComposerVoice(source)
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
