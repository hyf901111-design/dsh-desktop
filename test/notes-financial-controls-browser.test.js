import {afterAll,beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {mkdtemp,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {execFileSync} from 'node:child_process'
import {EWorkNoteComponentView} from '../scripts/lib/notes-components.mjs'
import {financialWidgetDefaults} from '../packages/dsh-research-task-runtime/financial-widget-contract.js'

let browser,client,runtime,notesCss,evidence
beforeAll(async()=>{
 const output=await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
 import * as React from 'react';import * as jsx from 'react/jsx-runtime';import * as dom from 'react-dom';import {createRoot} from 'react-dom/client';import {mountUiLocalization} from './src/preload/ui-localization';
 window.noteFinancialRuntime={React,jsx,dom,createRoot,mountUiLocalization};
 `},bundle:true,platform:'browser',format:'iife',write:false,define:{'process.env.NODE_ENV':'"production"'}})
 runtime=output.outputFiles[0].text
 // Production serializes native functions. Keep Vitest's SSR import wrappers
 // out of those function bodies while still exercising the current patcher.
 client=execFileSync(process.execPath,['--input-type=module','-e',`
 import {readFileSync} from 'node:fs';import {patchFinancialWidgetClient} from './scripts/lib/financial-widget-client.mjs';
 process.stdout.write(patchFinancialWidgetClient(readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')));
 `],{encoding:'utf8',maxBuffer:32_000_000})
 const start=client.indexOf('function EWorkNoteComponentView('),end=client.indexOf('function EWorkNoteComponentViews(',start)
 if(start<0||end<0)throw Error('Actual note component portal is missing')
 client=client.slice(0,start)+EWorkNoteComponentView.toString()+'\n'+client.slice(end)
 client=client.replace('exports.ResearchCanvas = ResearchCanvas;','exports.EWorkNoteComponentViews=EWorkNoteComponentViews;exports.ResearchCanvas = ResearchCanvas;')
 notesCss=await readFile('src/preload/notes/style.css','utf8')
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 evidence=await mkdtemp(join(tmpdir(),'odyssey-note-watchlist-'))
},30000)
afterAll(async()=>browser?.close())

async function fixture(){
 const page=await browser.newPage({viewport:{width:1000,height:660}})
 page.setDefaultTimeout(5000)
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 await page.setContent('<div id="outlet"></div><section class="en-root en-editor-host" data-dark="true"><section class="en-research en-native-component" data-research-node-id="watch" data-financial-theme="dark" style="width:856px"><header id="watch-title" class="en-research-header"></header><div id="watch-host" class="en-native-component-host" data-note-component="watch" data-note-session="note-watchlist" style="height:300px"></div></section></section>')
 await page.addStyleTag({content:notesCss+'\nbody{margin:20px;background:#888}.en-root{max-width:856px}.en-research{margin:0}'})
 await page.addScriptTag({content:runtime})
 await page.evaluate(()=>{window.__ModuleLoader__={load:descriptor=>window.noteFinancialDescriptor=descriptor}})
 await page.addScriptTag({content:client})
 const spec={...financialWidgetDefaults('watchlist'),symbols:[{market:'SH',code:'600519',name:'沪市测试'},{market:'HK',code:'00700',name:'港股测试'}]}
 await page.evaluate(spec=>{
  const {React,jsx,dom,createRoot,mountUiLocalization}=window.noteFinancialRuntime
  const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
  const bundle=window.noteFinancialDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake)
  window.dshDesktop={financialWidget:{request:async input=>input.action==='search'?{symbols:[{market:'SZ',code:'000001',name:'新增测试'}]}:{quotes:(input.symbols||[]).map(symbol=>({...symbol,price:100,changePercent:1})),source:'聚焦验证来源'}}}
  window.watchEntry={instanceId:'watch-view',hostId:'watch-host',headerId:'watch-title',sessionId:'note-watchlist',node:{id:'watch',title:'自选股',noteLibrary:true,containerSpec:spec},dark:true,refresh:0}
  window.watchActions=[]
  window.publishWatch=()=>document.dispatchEvent(new CustomEvent('sherlock:notes-component-view',{detail:structuredClone(window.watchEntry)}))
  document.addEventListener('sherlock:notes-component-action',event=>{const action=event.detail;if(action.action!=='spec')return;window.watchActions.push(structuredClone(action));window.watchEntry.node.containerSpec=action.next;window.publishWatch();document.dispatchEvent(new CustomEvent('sherlock:notes-component-ack',{detail:{instanceId:action.instanceId,sessionId:action.sessionId,requestId:action.requestId,ok:true}}))})
  mountUiLocalization(document)
  createRoot(document.getElementById('outlet')).render(React.createElement(bundle.EWorkNoteComponentViews,{sessionId:'note-watchlist',active:true}))
 },spec)
 await page.waitForTimeout(25)
 await page.evaluate(()=>window.publishWatch())
 await page.locator('#watch-host .ew-watch-meta select').waitFor().catch(error=>{throw Error(errors.join('\n')||error.message)})
 return page
}

it('keeps the note watchlist market label, chevron and add control separate in both themes and narrow widths',async()=>{
 const page=await fixture(),errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  const results=[]
  for(const dark of [true,false])for(const locale of ['zh','en'])for(const width of [856,320,220,160]){
   await page.evaluate(({dark,locale,width})=>{document.documentElement.dataset.odysseyLocale=locale;const root=document.querySelector('.en-root'),card=root.querySelector('.en-research');root.dataset.dark=String(dark);card.dataset.financialTheme=dark?'dark':'light';card.style.width=width+'px'}, {dark,locale,width})
   await page.waitForTimeout(20)
   const metrics=await page.locator('.ew-watch-meta').evaluate(meta=>{
    const select=meta.querySelector('select'),add=meta.querySelector('button'),s=getComputedStyle(select),r=select.getBoundingClientRect(),a=add.getBoundingClientRect(),m=meta.getBoundingClientRect(),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');ctx.font=s.font
    const icon=add.querySelector('.ew-financial-icon').getBoundingClientRect()
    return {appearance:s.appearance,paddingRight:parseFloat(s.paddingRight),paddingLeft:parseFloat(s.paddingLeft),background:s.backgroundImage,textWidth:ctx.measureText(select.selectedOptions[0].textContent).width,contentWidth:r.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight),gap:a.left-r.right,addWidth:a.width,addHeight:a.height,iconOffset:Math.abs(icon.left+icon.width/2-a.left-a.width/2),metaOverflow:Math.max(0,a.right-m.right),color:s.color,selected:select.selectedOptions[0].textContent}
   })
   results.push({dark,locale,width,...metrics})
   expect(metrics.appearance).toBe('none')
   expect(metrics.background).toContain('data:image/svg+xml')
   expect(metrics.paddingRight).toBeGreaterThanOrEqual(22)
   expect(metrics.contentWidth+.5).toBeGreaterThanOrEqual(metrics.textWidth)
   expect(metrics.gap).toBeGreaterThanOrEqual(8)
   expect(metrics.addWidth).toBe(24);expect(metrics.addHeight).toBe(24)
   expect(metrics.iconOffset).toBeLessThanOrEqual(.5)
   expect(metrics.metaOverflow).toBeLessThanOrEqual(.5)
   expect(metrics.color).toBe(dark?'rgb(157, 165, 178)':'rgb(102, 112, 133)')
  }
  await page.screenshot({path:join(evidence,'watchlist-narrow-english.png')})
  await page.evaluate(()=>{document.querySelector('.en-research').style.width='856px';document.documentElement.dataset.odysseyLocale='zh'})
  await page.screenshot({path:join(evidence,'watchlist-light.png')})
  await page.evaluate(()=>{document.querySelector('.en-root').dataset.dark='true';document.querySelector('.en-research').dataset.financialTheme='dark'})
  await page.screenshot({path:join(evidence,'watchlist-dark.png')})
  await writeFile(join(evidence,'layout.json'),JSON.stringify(results,null,2))
  expect(errors).toEqual([]);console.log('Note watchlist evidence:',evidence)
 }finally{await page.close()}
},30000)

it('preserves market filtering, keyboard focus and adding a stock through the actual note component portal',async()=>{
 const page=await fixture()
 try{
  const market=page.locator('.ew-watch-meta select')
  await market.selectOption('HK')
  await expect.poll(()=>page.locator('[data-stock-code]').count()).toBe(1)
  expect(await page.locator('[data-stock-code]').getAttribute('data-stock-code')).toBe('00700')
  expect(await page.evaluate(()=>window.watchEntry.node.containerSpec.market)).toBe('HK')
  await market.selectOption('all');await expect.poll(()=>page.locator('[data-stock-code]').count()).toBe(2)
  await market.focus();await page.keyboard.press('Tab')
  expect(await page.evaluate(()=>document.activeElement.getAttribute('aria-label'))).toBe('添加自选股')
  await page.keyboard.press('Enter');await page.locator('.ew-financial-search-line input').fill('000001')
  await page.locator('.ew-financial-suggestions [role=option]').waitFor()
  await page.locator('.ew-financial-suggestions [role=option]').click()
  await expect.poll(()=>page.locator('[data-stock-code]').count()).toBe(3)
  expect(await page.evaluate(()=>window.watchEntry.node.containerSpec.symbols.some(s=>s.code==='000001'&&s.market==='SZ'))).toBe(true)
  expect(await page.locator('.ew-watch-meta select').inputValue()).toBe('all')
  expect(await page.locator('.ew-financial-search-line').count()).toBe(0)
 }finally{await page.close()}
},15000)

it('opens shared source settings in notes, saves provider and timing, and stays usable in both themes and narrow windows',async()=>{
 const page=await fixture(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.evaluate(()=>{window.sourceRequests=[];const original=window.dshDesktop.financialWidget.request;window.dshDesktop.financialWidget.request=q=>{window.sourceRequests.push(q);return original(q)}})
  const entry=page.locator('button.ew-financial-provenance')
  expect(await entry.evaluate(el=>[el,...el.querySelectorAll('span')].every(n=>getComputedStyle(n).cursor==='pointer'))).toBe(true)
  await entry.click();const dialog=page.getByRole('dialog',{name:'组件数据与自动更新'})
  await dialog.waitFor();expect(await dialog.getByRole('combobox',{name:'数据源',exact:true}).locator('option').count()).toBe(2)
  await dialog.getByRole('combobox',{name:'数据源',exact:true}).selectOption('backup')
  await expect.poll(()=>page.evaluate(()=>window.watchEntry.node.containerSpec.dataSource)).toBe('backup')
  await expect.poll(()=>page.evaluate(()=>window.sourceRequests.some(q=>q.source==='backup'))).toBe(true)
  await dialog.getByRole('combobox',{name:'更新频率'}).selectOption('5')
  await dialog.getByRole('button',{name:'暂停更新'}).click()
  expect(await page.evaluate(()=>({source:window.watchEntry.node.containerSpec.dataSource,minutes:window.watchEntry.node.containerSpec.refreshMinutes,enabled:window.watchEntry.node.containerSpec.refreshEnabled}))).toEqual({source:'backup',minutes:5,enabled:false})
  await dialog.getByRole('button',{name:'关闭数据设置'}).focus();await page.keyboard.press('Shift+Tab')
  expect(await page.evaluate(()=>document.activeElement.textContent)).toBe('立即更新')
  await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.activeElement.getAttribute('aria-label'))).toBe('关闭数据设置')
  await page.keyboard.press('Delete');expect(await page.locator('[data-stock-code]').count()).toBe(2)
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});expect(await entry.evaluate(el=>document.activeElement===el)).toBe(true)
  const metrics=[]
  for(const dark of [true,false])for(const width of [1000,360]){
   await page.setViewportSize({width,height:660})
   await page.evaluate(dark=>document.querySelector('.en-research').dataset.financialTheme=dark?'dark':'light',dark)
   await entry.click();await dialog.waitFor()
   const m=await dialog.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom,width:innerWidth,background:getComputedStyle(el).backgroundColor,overflow:el.scrollWidth-el.clientWidth,source:el.querySelector('[aria-label="数据源"]').value}})
   const selects=await dialog.locator('select').evaluateAll(els=>els.map(el=>{const s=getComputedStyle(el);return {appearance:s.appearance,right:s.backgroundPositionX,paddingRight:parseFloat(s.paddingRight),image:s.backgroundImage}}))
   expect(selects).toHaveLength(2)
   for(const select of selects){expect(select.appearance).toBe('none');expect(select.right).toContain('14px');expect(select.paddingRight).toBeGreaterThanOrEqual(40);expect(select.image).toContain('data:image/svg+xml')}
   expect(selects[0].right).toBe(selects[1].right)
   expect(m.left).toBeGreaterThanOrEqual(15);expect(m.right).toBeLessThanOrEqual(m.width-15);expect(m.bottom).toBeLessThanOrEqual(645);expect(m.overflow).toBeLessThanOrEqual(1);expect(m.source).toBe('backup');expect(m.background).toBe(dark?'rgb(36, 36, 36)':'rgb(255, 255, 255)')
   metrics.push({dark,width,...m});await page.screenshot({path:join(evidence,`data-settings-${dark?'dark':'light'}-${width}.png`)})
   await page.keyboard.press('Escape')
  }
  await writeFile(join(evidence,'data-settings.json'),JSON.stringify(metrics,null,2));expect(errors).toEqual([])
  console.log('Data settings browser evidence:',evidence)
 }finally{await page.close()}
},20000)

it('opens the corresponding generated workbench source panel and refreshes after selecting its registered alternative',async()=>{
 const page=await fixture(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.evaluate(()=>{
   document.querySelector('.en-root').style.display='none'
   const {React,jsx,dom,createRoot}=window.noteFinancialRuntime,fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})})
   const bundle=window.noteFinancialDescriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?dom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake)
   const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
   const registry=new bundle.ResearchWorkspaceRegistry(storage),workspace=registry.for('source-browser'),node=workspace.createContainerDraft()
   workspace.setArtifacts([{...node,title:'沪深300行业配置',generationStatus:'completed',containerSpec:{version:1,type:'html',title:'沪深300行业配置',html:'<h2>沪深300行业配置</h2><p>来自已绑定接口</p><script id="sherlock-template-data" type="application/json">{"templateId":"market.metrics","version":"1"}</script>'}}])
   window.generatedSourceCalls=[];window.generatedBinding={nodeId:node.id,sourceId:'default',status:'error',error:'接口暂不可用',intervalMinutes:1,enabled:true,requests:[{sourceName:'通联 DataYes MCP / call_api'}],sources:[{id:'default',name:'通联 DataYes MCP'},{id:'backup',name:'已登记备用来源'}]}
   window.dshDesktop.componentData={setVisible:async()=>{},request:async(sessionId,q)=>{window.generatedSourceCalls.push({sessionId,...q});if(q.action==='list')return [window.generatedBinding];if(q.action==='configure'){Object.assign(window.generatedBinding,q.settings);if(q.settings.sourceId)window.generatedBinding.requests=[{sourceName:q.settings.sourceId==='backup'?'新浪财经 / quote':'通联 DataYes MCP / call_api'}]}if(q.action==='refresh')Object.assign(window.generatedBinding,{status:'success',error:'',lastSuccess:Date.now()});return {...window.generatedBinding}}}
   const host=document.createElement('div');host.id='source-canvas';host.style.cssText='position:fixed;inset:0;z-index:10;background:#151518';document.body.append(host)
   createRoot(host).render(React.createElement(bundle.ResearchCanvas,{sessionId:'source-browser',t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false,generate:async()=>({ok:true})},actions:{setResearchRightTab(){}}}))
  })
  const status=page.locator('#source-canvas button[data-component-data-status]');await status.waitFor()
  await expect.poll(()=>status.textContent()).toContain('通联 DataYes · 更新失败')
  expect(await status.getAttribute('title')).toContain('数据源：通联 DataYes MCP / call_api')
  const cursors=await status.evaluate(el=>[el,...el.querySelectorAll('*')].map(n=>getComputedStyle(n).cursor));expect(cursors.every(c=>c==='pointer')).toBe(true)
  await status.click()
  const dialog=page.getByRole('dialog',{name:'组件数据与自动更新'});await dialog.waitFor();expect(await dialog.textContent()).toContain('沪深300行业配置')
  await dialog.getByRole('combobox',{name:'数据源',exact:true}).selectOption('backup')
  await expect.poll(()=>page.evaluate(()=>window.generatedSourceCalls.some(q=>q.action==='refresh'&&q.nodeId===window.generatedBinding.nodeId))).toBe(true)
  expect(await page.evaluate(()=>window.generatedBinding.sourceId)).toBe('backup')
  await dialog.getByRole('combobox',{name:'更新频率'}).selectOption('15');expect(await page.evaluate(()=>window.generatedBinding.intervalMinutes)).toBe(15)
  await expect.poll(()=>status.textContent(),{timeout:6000}).toContain('新浪财经 · 每 15 分钟')
  await page.screenshot({path:join(evidence,'generated-component-source-settings.png')})
  await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});expect(await status.evaluate(el=>document.activeElement===el)).toBe(true);expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
