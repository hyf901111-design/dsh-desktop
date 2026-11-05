import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {join} from 'node:path'
import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {stripWorkbenchReplay} from './fixtures/strip-workbench-replay.mjs'
import {stripConversationLiveUi} from './fixtures/strip-conversation-live-ui.mjs'

let browser,script
const evidence=process.env.SHERLOCK_TEST_EVIDENCE_DIR
beforeAll(async()=>{
 const require=createRequire(import.meta.url)
 let source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 // Unwind the resident install in production order, then serialize native Node functions.
 // A parallel composer feature may wrap the same resident bundle in integration.
 source=stripConversationLiveUi(source)
 for(const [file,strip] of [['board-tabs-client','stripBoardTabsClient'],['conversation-history-page','stripConversationHistoryClient'],['conversation-submission','stripConversationSubmission'],['conversation-response-progress','stripConversationResponseProgress'],['plain-slash-input','stripPlainSlashInput'],['sidebar-new-note','stripSidebarNewNoteConversation'],['pptx-annotation-message','stripPptxAnnotationMessages'],['pptx-annotation-native','stripPptxAnnotationInput'],['home-guide-presentation-native','stripHomeGuidePresentationNative'],['home-guide-native','stripHomeGuideNative']]){if(file==='home-guide-presentation-native')source=stripWorkbenchReplay(source);source=require('../scripts/lib/'+file+'.mjs')[strip](source)}
 const grid=require('../scripts/lib/research-grid-workbench.mjs')
 source=grid.patchResearchGridWorkbench(require('../scripts/lib/financial-widget-client.mjs').patchFinancialWidgetClient(require('../scripts/lib/component-data-refresh.mjs').patchComponentDataRefresh(grid.restoreResearchGridWorkbench(source))))
 expect(grid.patchResearchGridWorkbench(source)).toBe(source)
 expect(()=>new Function(source)).not.toThrow()
 const entry=`import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};window.dshDesktop={};
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 (0,eval)(${JSON.stringify(source)});
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake);
 const registry=new bundle.ResearchWorkspaceRegistry(localStorage),root=createRoot(document.getElementById('host'));
 let sessionId='theme-menu';
 const workspace=()=>registry.for(sessionId);
 const render=(next=sessionId)=>{sessionId=next;root.render(React.createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false},actions:{}}))};
 window.fixture={bundle,workspace,registry,render};render();`
 script=(await build({stdin:{contents:entry,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},30000)
afterAll(async()=>browser?.close())

async function fixture({width=1000,dark=false,english=false}={}){
 const page=await browser.newPage({viewport:{width,height:720},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://theme-menu.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{height:680px;width:100vw}[data-research-canvas]{height:620px!important}</style><div id="host"></div><button id="outside">outside</button>`}))
 await page.goto('https://theme-menu.test/')
 await page.evaluate(({dark,english})=>{document.body.toggleAttribute('data-ds-dark-theme',dark);document.documentElement.dataset.odysseyLocale=english?'en':'zh'},{dark,english})
 await page.addScriptTag({content:script});await page.waitForSelector('[data-ework-toolbar]')
 return {page,errors,trigger:page.locator('[data-workbench-theme-toggle]'),menu:page.locator('[data-workbench-theme-menu]')}
}
const labels=['浅色模式','深色模式','彭博模式','易方达模式']
const modes=['light','dark','openterminal','enterprise']

for(const dark of [false,true])it('keeps toolbar appearance on the app theme with hover-only padded theme control in '+(dark?'dark':'light'),async()=>{
 const {page,trigger,menu,errors}=await fixture({dark})
 const toolbar=page.locator('[data-ework-toolbar]'),link=toolbar.getByRole('button',{name:'链接',exact:true})
 const appearance=async()=>toolbar.evaluate(el=>{const s=getComputedStyle(el),toggle=el.querySelector('[data-workbench-theme-toggle]'),divider=el.querySelector('.ew-workbench-mode-divider'),other=el.querySelector('button[aria-label="链接"]');return {background:s.backgroundColor,border:s.borderColor,otherColor:getComputedStyle(other).color,toggleColor:getComputedStyle(toggle).color,divider:getComputedStyle(divider).backgroundColor}})
 try{
  await page.mouse.move(1,1)
  const original=await appearance()
  for(const [index,mode] of modes.entries()){
   await trigger.click();await menu.getByRole('menuitemradio',{name:labels[index],exact:true}).click();await page.mouse.move(1,1)
   expect(await page.locator('[data-ework-grid]').getAttribute('data-workbench-style')).toBe(mode)
   expect(await appearance()).toEqual(original)
   expect(await trigger.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
   const padding=await trigger.evaluate(el=>{const r=el.getBoundingClientRect(),icon=el.querySelector('.ew-workbench-mode-icon').getBoundingClientRect(),arrow=el.querySelector('svg').getBoundingClientRect();return {left:icon.left-r.left,right:r.right-arrow.right}})
   expect(padding.left).toBeGreaterThanOrEqual(8);expect(padding.right).toBeGreaterThanOrEqual(8)
   await link.hover();const hover=await link.evaluate(el=>getComputedStyle(el).backgroundColor)
   await trigger.hover();expect(await trigger.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(hover)
   await trigger.click();await menu.waitFor();await page.mouse.move(1,1)
   expect(await trigger.getAttribute('aria-expanded')).toBe('true')
   expect(await trigger.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
   await page.keyboard.press('Escape')
  }
  expect(errors).toEqual([])
 }finally{await page.close()}
})

it('opens the four production theme modes from one compact trigger and persists the chosen mode across reload',async()=>{
 const {page,trigger,menu,errors}=await fixture()
 try{
  expect(await trigger.count()).toBe(1)
  expect(await page.locator('[data-workbench-style-option]').count()).toBe(0)
  await trigger.click();await menu.waitFor()
  expect(await menu.getByRole('menuitemradio').allTextContents()).toEqual(labels)
  expect(await menu.getByRole('menuitemradio',{checked:true}).textContent()).toBe('浅色模式')
  for(const [index,mode] of modes.entries()){
   if(index)await trigger.click()
   await menu.getByRole('menuitemradio',{name:labels[index]}).click()
   expect(await menu.count()).toBe(0)
   expect(await page.locator('[data-ework-grid]').getAttribute('data-workbench-style')).toBe(mode)
   expect(await trigger.getAttribute('data-current-workbench-style')).toBe(mode)
  }
  await page.reload();await page.addScriptTag({content:script});await trigger.waitFor()
  expect(await trigger.getAttribute('data-current-workbench-style')).toBe('enterprise')
  await trigger.click();expect(await menu.getByRole('menuitemradio',{checked:true}).textContent()).toBe('易方达模式')
  expect(errors).toEqual([])
 }finally{await page.close()}
})

it('uses arrow/Home/End navigation, Enter selection, Escape return focus, and outside dismissal',async()=>{
 const {page,trigger,menu,errors}=await fixture({dark:true})
 try{
  await trigger.focus();await page.keyboard.press('ArrowUp');await menu.waitFor()
  expect(await page.evaluate(()=>document.activeElement.dataset.workbenchStyleOption)).toBe('dark')
  await page.keyboard.press('ArrowDown');expect(await page.evaluate(()=>document.activeElement.dataset.workbenchStyleOption)).toBe('openterminal')
  expect(await trigger.getAttribute('data-current-workbench-style')).toBe('dark')
  await page.keyboard.press('End');expect(await page.evaluate(()=>document.activeElement.dataset.workbenchStyleOption)).toBe('enterprise')
  await page.keyboard.press('Home');expect(await page.evaluate(()=>document.activeElement.dataset.workbenchStyleOption)).toBe('light')
  await page.keyboard.press('ArrowUp');expect(await page.evaluate(()=>document.activeElement.dataset.workbenchStyleOption)).toBe('enterprise')
  await page.keyboard.press('Enter');expect(await menu.count()).toBe(0)
  expect(await trigger.getAttribute('data-current-workbench-style')).toBe('enterprise')
  expect(await trigger.evaluate(el=>el===document.activeElement)).toBe(true)
  await trigger.click();await page.keyboard.press('Escape');expect(await menu.count()).toBe(0)
  expect(await trigger.evaluate(el=>el===document.activeElement)).toBe(true)
  await trigger.click();await page.locator('#outside').click();expect(await menu.count()).toBe(0)
  expect(errors).toEqual([])
 }finally{await page.close()}
})

for(const dark of [false,true])for(const width of [1000,380])it(`matches the Arrange menu materials, spacing and selected treatment at ${width}px in ${dark?'dark':'light'}`,async()=>{
 const {page,trigger,menu,errors}=await fixture({dark,width})
 try{
  // A real production draft enables Arrange without an asynchronous generation/refit.
  await page.evaluate(()=>fixture.workspace().createContainerDraft())
  await page.locator('[data-workbench-arrange-toggle]').click();await page.locator('[data-workbench-arrange-menu]').waitFor()
  const material=el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {background:s.backgroundColor,color:s.color,border:s.border,borderRadius:s.borderRadius,shadow:s.boxShadow,padding:s.padding,gap:s.gap,font:s.font,top:r.top,height:r.height}}
  const arrange=await page.locator('[data-workbench-arrange-menu]').evaluate(material)
  const arrangeRow=await page.locator('[data-workbench-arrange-menu] [aria-checked=true]').evaluate(el=>{el.blur();const s=getComputedStyle(el);return {background:s.backgroundColor,padding:s.padding,gap:s.gap,height:el.getBoundingClientRect().height}})
  await page.keyboard.press('Escape');await trigger.click();await menu.waitFor()
  const theme=await menu.evaluate(material)
  for(const key of ['background','color','border','borderRadius','shadow','padding','gap','font'])expect(theme[key],key).toBe(arrange[key])
  const row=await menu.locator('[aria-checked=true]').evaluate(el=>{el.blur();const s=getComputedStyle(el);return {background:s.backgroundColor,padding:s.padding,gap:s.gap,height:el.getBoundingClientRect().height}})
  expect(row).toEqual(arrangeRow)
  const columns=await menu.getByRole('menuitemradio').evaluateAll(buttons=>buttons.map(button=>{const icon=button.querySelector('.ew-workbench-mode-icon'),label=button.lastElementChild,r=icon.getBoundingClientRect(),s=getComputedStyle(icon);return {iconX:r.x,iconWidth:r.width,labelX:label.getBoundingClientRect().x,flexGrow:s.flexGrow,flexShrink:s.flexShrink}}))
  expect(new Set(columns.map(item=>item.iconX)).size).toBe(1)
  expect(new Set(columns.map(item=>item.labelX)).size).toBe(1)
  for(const item of columns){expect(item.iconWidth).toBe(16);expect(item.flexGrow).toBe('0');expect(item.flexShrink).toBe('0')}
  const rect=await menu.boundingBox(),button=await trigger.boundingBox()
  const toolbar=await page.locator('[data-ework-toolbar]').boundingBox()
  const slot=await page.locator('.ew-workbench-mode-slot').boundingBox()
  expect(toolbar.x+toolbar.width-slot.x-slot.width).toBeLessThanOrEqual(8)
  expect(rect.x).toBeGreaterThanOrEqual(8);expect(rect.x+rect.width).toBeLessThanOrEqual(width-8)
  expect(rect.y+rect.height).toBeLessThanOrEqual(button.y-7)
  expect(await page.locator('[data-ework-toolbar]').evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1)
  if(evidence){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,`theme-menu-${width}-${dark?'dark':'light'}.png`)});await writeFile(join(evidence,`theme-menu-${width}-${dark?'dark':'light'}.json`),JSON.stringify({arrange,theme,row,columns,rect,button,toolbar,errors},null,2)+'\n')}
  expect(errors).toEqual([])
 }finally{await page.close()}
})

it('translates all menu labels and keeps board contents intact while changing mode and changing sessions',async()=>{
 const {page,trigger,menu,errors}=await fixture({english:true})
 try{
  const before=await page.evaluate(()=>{fixture.workspace().createContainerDraft();return JSON.stringify(fixture.workspace().getSnapshot().artifacts)})
  await trigger.click();expect(await menu.getByRole('menuitemradio').allTextContents()).toEqual(['Light mode','Dark mode','Bloomberg mode','EFund mode'])
  await menu.getByRole('menuitemradio',{name:'Dark mode'}).click()
  expect(await page.evaluate(()=>JSON.stringify(fixture.workspace().getSnapshot().artifacts))).toBe(before)
  await trigger.click();await page.evaluate(()=>fixture.render('other-board'))
  await menu.waitFor({state:'detached'})
  expect(await trigger.getAttribute('data-current-workbench-style')).toBe('light')
  await page.evaluate(()=>fixture.render('theme-menu'))
  await page.waitForFunction(()=>document.querySelector('[data-workbench-theme-toggle]')?.dataset.currentWorkbenchStyle==='dark')
  expect(await page.evaluate(()=>JSON.stringify(fixture.workspace().getSnapshot().artifacts))).toBe(before)
  expect(errors).toEqual([])
 }finally{await page.close()}
})
