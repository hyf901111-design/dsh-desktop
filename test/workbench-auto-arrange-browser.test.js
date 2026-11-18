import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'
import {prepareWorkbenchWebpages} from '../packages/dsh-research-task-runtime/workbench-webpage.js'
import {workbenchWebpagePreviewSuffix} from '../packages/dsh-research-task-runtime/workbench-webpage-preview.js'

const require=createRequire(import.meta.url)
let browser,script,tabsScript
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const resident=await (await import('./helpers/financial-widget-client-fixture.js')).prepareFinancialClientSource({refreshState:true})
 const source=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{componentTypographyPatch,patchLegacyDashboardPreview}from'./scripts/lib/patch-research-board-client.mjs';process.stdout.write(patchLegacyDashboardPreview(componentTypographyPatch(readFileSync(0,'utf8'))))"],{input:resident,encoding:'utf8',maxBuffer:64*1024*1024})
 const bundle=async source=>{
 const entry=`import * as React from 'react';import * as ReactDom from 'react-dom';import * as jsx from 'react/jsx-runtime';import {createRoot} from 'react-dom/client';
 let descriptor;window.__ModuleLoader__={load:value=>descriptor=value};window.dshDesktop={};
 const fake=new Proxy(function(){},{get:()=>fake,apply:()=>fake,construct:()=>({})});
 (0,eval)(${JSON.stringify(source)});
 const bundle=descriptor.factory(id=>id==='react'?React:id==='react/jsx-runtime'?jsx:id==='react-dom'?ReactDom:id==='@deepseek-ai/dsh-client-ui-primitives'?new Proxy({MarkdownText:({text})=>React.createElement('div',null,text)},{get:(t,k)=>t[k]||(String(k).startsWith('Icon')?()=>null:fake)}):fake);
 const registry=new bundle.ResearchWorkspaceRegistry(localStorage),workspace=registry.for('auto-browser'),host=document.getElementById('host'),root=createRoot(host);
 const render=(sessionId='auto-browser')=>root.render(React.createElement(bundle.ResearchCanvas,{sessionId,t:x=>x,researchWorkspaces:registry,selectionGeneration:{disabled:false},actions:{}}));
 let calls=0;const original=workspace.organizeCanvas;workspace.organizeCanvas=function(...args){calls++;return original.apply(this,args)};
 window.fixture={bundle,workspace,registry,render,calls:()=>calls};render();`
 return (await build({stdin:{contents:entry,resolveDir:process.cwd(),sourcefile:'auto-arrange-browser-entry.js'},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'})).outputFiles[0].text
 }
 script=await bundle(source)
 tabsScript=await bundle(require('../scripts/lib/board-tabs-client.mjs').patchBoardTabsClient(source))
},30000)

it('uses automatic arrangement for a new research workspace and preserves an explicit manual choice',async()=>{
 const page=await browser.newPage({viewport:{width:1240,height:760}})
 try{
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\n#host{width:1000px;height:700px}[data-research-canvas]{width:100%!important;height:100%!important}</style><div id="host"></div>`}))
  await page.goto('https://auto-arrange.test/');await page.addScriptTag({content:script})
  await page.waitForSelector('[data-ework-grid]')
  const state=await page.evaluate(()=>{
   const {workspace,registry}=fixture
   const fresh=registry.for('new-research')
   fresh.initializeWorkbenchResponsiveArrange()
   const initial=fresh.getWorkbenchResponsiveArrange()
   fresh.setWorkbenchResponsiveArrange(false)
   fresh.initializeWorkbenchResponsiveArrange()
   return {initial,manual:fresh.getWorkbenchResponsiveArrange(),existing:workspace.getWorkbenchResponsiveArrange(),stored:localStorage.getItem('ework.research.responsive-arrange.v1:new-research')}
  })
  expect(state).toEqual({initial:true,manual:false,existing:false,stored:'manual'})
 }finally{await page.close()}
},20000)
afterAll(async()=>browser?.close())

it('preserves compact webpage layout and input across the offline file and the four board palettes',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:450}})
 const html='<!doctype html><html><head><meta charset="utf-8"></head><body><div role="tablist"><button role="tab" aria-selected="true">预算</button></div><label>人数<input type="number" value="4"></label><dl class="metrics"><div><dt>人均</dt><dd>120</dd></div></dl><div class="table-scroll"><table style="min-width:400px"><thead><tr><th>方案</th><th class="numeric">人均（元）</th></tr></thead><tbody><tr><td>方案 A</td><td class="numeric">120</td></tr></tbody></table></div><figure><svg><rect width="20" height="10" fill="var(--sherlock-chart-2)"></rect></svg><figcaption>费用构成</figcaption></figure></body></html>'
 const args={panels:[{type:'files',title:'预算',htmlFile:{name:'预算.html',html,stylePreset:'compact-v1'}}]}
 const saved=prepareWorkbenchWebpages(args,'test','').pages[0].html
 const styles=frame=>frame.evaluate(()=>{
   const css=s=>getComputedStyle(document.querySelector(s))
   const table=document.querySelector('.table-scroll')
   return {accent:css('button').borderBottomColor,series:css('rect').fill,bg:css('body').backgroundColor,
     corner:css('button').borderRadius,tabHeight:css('button').minHeight,valueSize:css('dd').fontSize,
     readoutGap:css('figcaption').marginBlockStart,numeric:css('td.numeric').textAlign,
     hasTableScroll:table.scrollWidth>table.clientWidth,pageFits:document.documentElement.scrollWidth<=innerWidth}
 })
 try {
   await page.setContent(saved)
   const geometry={corner:'0px',tabHeight:'30px',valueSize:'22px',readoutGap:'8px',numeric:'end',hasTableScroll:true,pageFits:true}
   expect(await styles(page)).toMatchObject({...geometry,accent:'rgb(0, 80, 150)',series:'rgb(30, 185, 225)'})
   await page.setContent('<style>body{margin:0}iframe{display:block;width:100%;border:0}</style><iframe title="预算预览" sandbox="allow-scripts"></iframe>')
   const iframe=page.locator('iframe')
   await iframe.evaluate((el,source)=>{el.srcdoc=source},saved+workbenchWebpagePreviewSuffix)
   const frame=await (await iframe.elementHandle()).contentFrame()
   await frame.getByLabel('人数').fill('6')
   const palettes=[
     ['enterprise','rgb(0, 80, 150)','rgb(30, 185, 225)','rgb(255, 255, 255)'],
     ['light','rgb(22, 140, 240)','rgb(242, 167, 70)','rgb(255, 255, 255)'],
     ['dark','rgb(22, 140, 240)','rgb(242, 167, 70)','rgb(21, 21, 24)'],
     ['openterminal','rgb(255, 153, 0)','rgb(79, 195, 247)','rgb(10, 10, 10)']
   ]
   for(const [mode,accent,series,bg] of palettes){
     await iframe.evaluate((el,mode)=>el.contentWindow.postMessage({type:'sherlock-workbench-style',mode,controlTheme:'dark'},'*'),mode)
     await frame.waitForFunction(mode=>document.documentElement.dataset.workbenchStyle===mode,mode)
     expect(await styles(frame)).toMatchObject({...geometry,accent,series,bg})
     expect(await frame.getByLabel('人数').inputValue()).toBe('6')
   }
   await frame.getByLabel('人数').press('Shift+Tab')
   expect(await frame.getByRole('tab').evaluate(tab=>tab.matches(':focus-visible')&&getComputedStyle(tab).outlineWidth==='2px')).toBe(true)
 } finally {await page.close()}
})

it('recalculates an editable portable cost comparison at narrow widths with missing, zero and fixed amounts',async()=>{
 const page=await browser.newPage({viewport:{width:320,height:540}})
 const plans=[{name:'店 A',costs:[{label:'包间',basis:'fixed',amount:100},{label:'菜金',basis:'perUnit'}]},
   {name:'店 B',costs:[{label:'包间',basis:'fixed',amount:40},{label:'菜金',basis:'perUnit',amount:35}]}]
 const args={panels:[{type:'files',title:'聚餐预算',htmlFile:{name:'聚餐.html',costComparison:{quantity:2,plans}}}]}
 try{
   await page.setContent(prepareWorkbenchWebpages(args,'test','聚餐预算').pages[0].html)
   expect(await page.getByRole('tab',{name:'费用明细'}).getAttribute('aria-selected')).toBe('true')
   expect(await page.locator('#values tr').first().locator('td').first().innerText()).toBe('—')
   const amount=page.getByRole('spinbutton',{name:'金额 (元)'}).nth(1)
   await amount.fill('0')
   await page.getByRole('tab',{name:'方案对比'}).click()
   expect(await page.locator('#values tr').first().locator('td').allTextContents()).toEqual(['50','100'])
   await page.getByRole('tab',{name:'方案对比'}).press('ArrowRight')
   await amount.fill('20')
   await page.getByRole('tab',{name:'费用明细'}).press('Home')
   expect(await page.locator('#values tr').first().locator('td').allTextContents()).toEqual(['70','140'])
   await page.getByRole('button',{name:'增加数量'}).click()
   await page.getByRole('button',{name:'增加数量'}).click()
   expect(await page.locator('#bars strong').allTextContents()).toEqual(['45','45'])
   await page.getByRole('tab',{name:'费用明细'}).click()
   await page.getByRole('button',{name:'添加费用项'}).first().click()
   expect(await page.getByRole('textbox',{name:'费用项目'}).nth(2).evaluate(el=>el===document.activeElement)).toBe(true)
   await page.getByRole('button',{name:'移除费用项'}).nth(2).click()
   expect(await page.getByRole('textbox',{name:'费用项目'}).count()).toBe(4)
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 }finally{await page.close()}
})

it('production canvas waits for the batch, measures offscreen iframe content, then persists one standard arrangement without taking focus',async()=>{
 const page=await browser.newPage({viewport:{width:1240,height:760}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  // A real origin gives the production workspace its usual durable storage.
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{width:1000px;height:700px}[data-research-canvas]{width:1000px!important;height:700px!important}</style><div id="host"></div><textarea id="chat"></textarea>`}))
  await page.goto('https://auto-arrange.test/');await page.addScriptTag({content:script})
  await page.waitForSelector('[data-ework-grid]')
  const batch=await page.evaluate(()=>{
   const p={id:'browser-plan',createdAt:Date.now(),panels:Array.from({length:4},(_,i)=>({nodeId:'browser-'+i,title:'原始表 '+i,prompt:'原始长表',pending:true,width:656,height:428,x:i%2*672,y:Math.floor(i/2)*450,size:'large'}))}
   fixture.workspace.applyWorkbench(p);document.getElementById('chat').focus();return p
  })
  await page.evaluate(p=>{
   const html=i=>'<html><body><h2>实际记录 '+i+'</h2><table>'+Array.from({length:55},(_,row)=>'<tr><td>记录 '+row+'</td><td>'+row+'</td></tr>').join('')+'</table></body></html>'
   fixture.workspace.applyWorkbench({...p,panels:p.panels.map((panel,i)=>i<3?{...panel,taskId:'task-'+i,preparedOutput:JSON.stringify({version:1,type:'html',title:panel.title,html:html(i)})}:panel)})
  },batch)
  await page.waitForTimeout(180);expect(await page.evaluate(()=>fixture.calls())).toBe(0)
  await page.evaluate(p=>{
   const panel=p.panels[3],html='<html><body><h2>最后一份完整资料</h2>'+Array.from({length:70},(_,row)=>'<p>完整记录 '+row+'：原始0与-120万元。</p>').join('')+'</body></html>'
   fixture.workspace.applyWorkbench({...p,panels:p.panels.map((value,i)=>i===3?{...panel,taskId:'task-3',preparedOutput:JSON.stringify({version:1,type:'html',title:panel.title,html})}:value)})
  },batch)
  await page.waitForFunction(()=>fixture.calls()===1)
  await page.waitForFunction(()=>fixture.workspace.pendingWorkbenchArrange().length===0,null,{timeout:9000})
  const result=await page.evaluate(()=>{
   const root=document.querySelector('[data-research-canvas]'),nodes=fixture.workspace.getSnapshot().artifacts,cells=fixture.workspace.getWorkbenchCells()
   return {calls:fixture.calls(),focused:document.activeElement.id,measurements:[...root.__eworkContentMeasurements.keys()],heights:nodes.map(n=>n.height),offscreen:nodes.filter(n=>n.y-n.height/2>700).map(n=>n.id),overlap:cells.some((a,i)=>cells.some((b,j)=>i!==j&&a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y)),saved:JSON.parse(localStorage.getItem('sherlock.workbench.auto-arrange.v1:auto-browser'))}
  })
  if(process.env.SHERLOCK_TEST_EVIDENCE_DIR){await mkdir(process.env.SHERLOCK_TEST_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.SHERLOCK_TEST_EVIDENCE_DIR,'auto-arrange-browser.json'),JSON.stringify(result,null,2)+'\n');await page.screenshot({path:join(process.env.SHERLOCK_TEST_EVIDENCE_DIR,'auto-arrange-browser.png')})}
  expect(errors).toEqual([]);expect(result.calls).toBe(1);expect(result.focused).toBe('chat');expect(result.measurements.sort()).toEqual(batch.panels.map(p=>p.nodeId).sort());expect(result.heights.every(h=>h>500)).toBe(true);expect(result.offscreen.length).toBeGreaterThan(0);expect(result.overlap).toBe(false);expect(result.saved).toEqual({pending:[],done:[batch.id]})
  await page.evaluate(p=>{fixture.workspace.applyWorkbench(p);fixture.render('other')},batch);await page.waitForTimeout(80);await page.evaluate(()=>fixture.render());await page.waitForTimeout(180);expect(await page.evaluate(()=>fixture.calls())).toBe(1)
 }finally{await page.close()}
},25000)

it('production Standard keeps the note/table row filled after native and HTML refit, with the next timeline full width',async()=>{
 const page=await browser.newPage({viewport:{width:1240,height:760}}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{width:1000px;height:700px}[data-research-canvas]{width:1000px!important;height:700px!important}</style><div id="host"></div><textarea id="chat"></textarea>`}))
  await page.goto('https://auto-arrange.test/');await page.addScriptTag({content:script});await page.waitForSelector('[data-ework-grid]')
  await page.evaluate(()=>{
   const specs=[{version:1,type:'html',title:'左侧完整笔记',html:'<html><body><h2>完整笔记</h2>'+Array.from({length:42},(_,i)=>'<p>研究说明 '+i+'：完整原始资料，保持段落阅读。</p>').join('')+'</body></html>'},
    {version:1,type:'table',title:'右侧短表',columns:['字段','实际数值'],rows:[['收入',0],['同比',-120],['报告期','2026-06-30']]},
    {version:1,type:'html',title:'下行时间线',html:'<html><body><h2>后续时间线</h2><ol>'+Array.from({length:14},(_,i)=>'<li>阶段 '+i+'：完整事件记录，不挤入上方行内。</li>').join('')+'</ol></body></html>'}]
   fixture.workspace.applyWorkbench({id:'rows-plan',createdAt:Date.now(),panels:specs.map((spec,i)=>({nodeId:['note','short-table','timeline'][i],title:spec.title,prompt:'保持原资料完整',taskId:'rows-task-'+i,preparedOutput:JSON.stringify(spec),x:i===1?500:0,y:i===2?1200:0,width:480,height:i===0?1100:300,size:'large'}))})
   fixture.workspace.applyWorkbenchCells([{id:'note',x:0,y:0,w:20,h:48},{id:'short-table',x:20,y:0,w:20,h:13},{id:'timeline',x:0,y:50,w:20,h:25}],true)
   document.getElementById('chat').focus()
  })
  await page.waitForFunction(()=>fixture.calls()===1&&fixture.workspace.pendingWorkbenchArrange().length===0,null,{timeout:9000})
  const first=await page.evaluate(()=>fixture.workspace.getWorkbenchCells()),note=first.find(c=>c.id==='note'),table=first.find(c=>c.id==='short-table'),timeline=first.find(c=>c.id==='timeline')
  expect(note).toMatchObject({x:0,y:0,w:20});expect(table).toMatchObject({x:20,y:0,w:20,h:note.h});expect(timeline).toMatchObject({x:0,w:40,y:note.h});expect(note.h).toBeGreaterThan(35)
  expect(await page.evaluate(()=>document.activeElement.id)).toBe('chat');expect(errors).toEqual([])
  await page.locator('[data-research-global-arrange]').click();await page.waitForFunction(()=>!document.querySelector('[data-research-canvas]').__eworkContentFit)
  const second=await page.evaluate(()=>fixture.workspace.getWorkbenchCells());expect(second).toEqual(first);expect(await page.evaluate(()=>fixture.calls())).toBe(2)
  const bounds=await page.evaluate(()=>Object.fromEntries(['note','short-table','timeline'].map(id=>{
   const box=document.querySelector('[data-research-node-id="'+id+'"]').getBoundingClientRect()
   return [id,{top:box.top,bottom:box.bottom}]
  })))
  expect(bounds['short-table']).toEqual(bounds.note)
  expect(bounds.timeline.top-bounds.note.bottom).toBeCloseTo(10)
  const restored=await page.evaluate(()=>{
   const snapshot=fixture.workspace.getSnapshot(),cells=fixture.workspace.getWorkbenchCells(),root=document.querySelector('[data-research-canvas]');root.scrollTop=root.scrollHeight
   const reopened=new fixture.bundle.ResearchWorkspaceRegistry(localStorage).for('auto-browser');reopened.setWorkbenchWidth(1000)
   return {cells,reopenedCells:reopened.getWorkbenchCells(),savedCells:JSON.parse(localStorage.getItem('ework.research.grid.v1:auto-browser')).cells,heights:snapshot.artifacts.map(n=>({id:n.id,height:n.height})),scrollTop:root.scrollTop,done:JSON.parse(localStorage.getItem('sherlock.workbench.auto-arrange.v1:auto-browser'))}
  })
  expect(restored.scrollTop).toBeGreaterThan(0);expect(restored.savedCells).toEqual(second);expect(restored.reopenedCells).toEqual(second)
  if(process.env.SHERLOCK_TEST_EVIDENCE_DIR){await mkdir(process.env.SHERLOCK_TEST_EVIDENCE_DIR,{recursive:true});await writeFile(join(process.env.SHERLOCK_TEST_EVIDENCE_DIR,'standard-rows-browser.json'),JSON.stringify(restored,null,2)+'\n');await page.screenshot({path:join(process.env.SHERLOCK_TEST_EVIDENCE_DIR,'standard-rows-browser.png')})}
 }finally{await page.close()}
},25000)

it.each(['table','market'])('shrinks a filtered readable %s in its own row and fits its expanded body',async type=>{
 const {componentReadableDocumentTable}=await import('../packages/dsh-research-task-runtime/component-readable-snapshot.js')
 const spec=componentReadableDocumentTable({version:1,type,...type==='market'?{variant:'table',asOf:'明确标注的模拟验收数据'}:{},title:'完整原始资料',columns:['编号','机构','负责人','职务','日期','状态','备注','定位','其他'],rows:Array.from({length:180},(_,i)=>[String(i),'模拟机构','人员'+i,'职务','2026-11-05','原文记录','说明','[T1]',i===179?'完整长正文。\n'.repeat(100):'原始字段'])})
 const page=await browser.newPage({viewport:{width:1240,height:760}})
 try{
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{width:1000px;height:700px}[data-research-canvas]{width:1000px!important;height:700px!important}</style><div id="host"></div>`}))
  await page.goto('https://auto-arrange.test/');await page.addScriptTag({content:script});await page.waitForSelector('[data-ework-grid]')
  await page.evaluate(spec=>{
   fixture.workspace.applyWorkbench({id:'filtered-plan',createdAt:Date.now(),panels:[spec,{version:1,type:'html',title:'完整阅读材料',html:'<html><body>'+Array.from({length:60},(_,i)=>'<p>研究说明'+i+'</p>').join('')+'</body></html>'}].map((spec,i)=>({nodeId:['filter-table','tall-peer'][i],title:spec.title,prompt:'保留全部资料',taskId:'filtered-task-'+i,preparedOutput:JSON.stringify(spec),width:480,height:1100,x:i*500,y:0,size:'large'}))})
   fixture.workspace.applyWorkbenchCells([{id:'filter-table',x:0,y:0,w:40,h:48},{id:'tall-peer',x:0,y:48,w:40,h:48}],true)
  },spec)
  await page.waitForFunction(()=>fixture.workspace.pendingWorkbenchArrange().length===0&&fixture.calls()===1,null,{timeout:9000})
  await page.evaluate(()=>fixture.workspace.updateSelection(['filter-table'],'replace'))
  const outer=await page.locator('[data-research-node-id="filter-table"] iframe').elementHandle(),frame=await outer.contentFrame()
  const inner=frame.childFrames()[0];await inner.waitForSelector('tbody tr')
  await inner.getByRole('textbox',{name:'搜索完整数据'}).fill('人员179')
  await expect.poll(()=>inner.locator('tbody tr:visible').count()).toBe(1)
  await page.waitForTimeout(600)
  const result=await page.evaluate(()=>({measurements:[...document.querySelector('[data-research-canvas]').__eworkContentMeasurements].map(([id,{html,...size}])=>[id,size]),nodes:fixture.workspace.getSnapshot().artifacts.map(n=>({id:n.id,height:n.height,width:n.width})),cells:fixture.workspace.getWorkbenchCells()}))
  expect(result.nodes.find(n=>n.id==='filter-table').height).toBeLessThan(350)
  expect(result.nodes.find(n=>n.id==='tall-peer').height).toBeGreaterThan(900)
  await expect.poll(()=>page.evaluate(()=>{
   const bounds=id=>document.querySelector('[data-research-node-id="'+id+'"]').getBoundingClientRect()
   return bounds('tall-peer').top-bounds('filter-table').bottom
  })).toBeCloseTo(10)
  await inner.waitForFunction(()=>document.documentElement.dataset.workbenchSelected==='true')
  // The long cell extends horizontally beyond the iframe viewport; click its
  // visible disclosure edge, not the offscreen centre of the full cell.
  await inner.locator('details[data-readable-long] summary').click({position:{x:12,y:12}})
  await expect.poll(()=>page.evaluate(()=>fixture.workspace.getSnapshot().artifacts.find(n=>n.id==='filter-table').height)).toBeGreaterThan(500)
  expect(await inner.locator('[data-readable-expanded-text]').textContent()).toBe('完整长正文。\n'.repeat(100))
  expect(await inner.locator('[data-readable-expanded-text]').evaluate(element=>element.getBoundingClientRect().width<=document.documentElement.clientWidth-24)).toBe(true)
  expect(await inner.locator('[data-readable-expanded-text]').evaluate(element=>{const port=element.closest('main');return port.clientHeight>=port.scrollHeight-1})).toBe(true)
  await inner.locator('details[data-readable-long] summary').click({position:{x:12,y:12}})
  await expect.poll(()=>page.evaluate(()=>fixture.workspace.getSnapshot().artifacts.find(n=>n.id==='filter-table').height)).toBeLessThan(350)
 }finally{await page.close()}
},20000)

it('fits generated KPI cards after Arrange even when the user immediately clicks blank tab space',async()=>{
 const {acceptArtifactOutput}=await import('../packages/dsh-research-task-runtime/artifact-output.js')
 const output=JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'kpi',title:'研究概览',items:[
  {label:'项目数量',value:12,unit:'项'},{label:'合计规模',value:32,unit:'亿元'},{label:'累计变化',value:2,unit:'亿元'}
 ]})))
 const page=await browser.newPage({viewport:{width:1240,height:760}})
 try{
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}
html,body{margin:0}#host{width:1000px;height:700px}[data-research-canvas]{width:1000px!important;height:700px!important}</style><div id="host"></div>`}))
  await page.goto('https://auto-arrange.test/');await page.addScriptTag({content:tabsScript});await page.waitForSelector('[data-ework-grid]')
  const state=await page.evaluate(output=>{
   const workspace=fixture.workspace,draft=workspace.createContainerDraft()
   workspace.setArtifacts([{...draft,title:output.title,generationStatus:'completed',containerSpec:output}])
   workspace.createBoardTabs()
   workspace.setBoardTabsPresentation('vertical')
   workspace.applyWorkbenchCells([{id:draft.id,x:0,y:0,w:17,h:36}],true)
   workspace.updateSelection([draft.id],'replace')
   return {id:draft.id,tab:workspace.getActiveBoardTab()}
  },output)
  const card=page.locator('[data-research-node-id="'+state.id+'"]'),bar=page.locator('[data-board-tabs-nav]')
  const inner=card.frameLocator('iframe').frameLocator('iframe')
  await inner.locator('.indicator-grid').waitFor()
  expect((await card.boundingBox()).height).toBeGreaterThan(450)
  await page.locator('[data-research-global-arrange]').click()
  await page.evaluate(()=>{
   // Simulate a pointer down before the deferred width report arrives.
   const bar=document.querySelector('[data-board-tabs-nav]')
   bar.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0}))
  })
  expect(await page.evaluate(()=>Boolean(document.querySelector('[data-research-canvas]').__eworkContentFit))).toBe(true)
  expect(await page.evaluate(()=>fixture.workspace.getSnapshot().selection.selectedNodeIds)).toEqual([])
  await page.waitForFunction(()=>!document.querySelector('[data-research-canvas]').__eworkContentFit)
  const height=(await card.boundingBox()).height,body=(await inner.locator('body').boundingBox()).height
  expect(height).toBeLessThan(240)
  expect(height-body).toBeLessThan(110)
  expect(await page.evaluate(id=>document.querySelector('[data-research-canvas]').__eworkContentMeasurements.get(id).intrinsicMetrics,state.id)).toBe(true)
  for(const orientation of ['vertical','horizontal']){
   await page.evaluate(({orientation,id})=>{fixture.workspace.setBoardTabsPresentation(orientation);fixture.workspace.updateSelection([id],'replace')},{orientation,id:state.id})
   const list=bar.getByRole('tablist')
   const box=await list.boundingBox()
   await list.click({position:orientation==='vertical'?{x:30,y:box.height-4}:{x:box.width-4,y:12}})
   expect(await page.evaluate(()=>({ids:fixture.workspace.getSnapshot().selection.selectedNodeIds,tab:fixture.workspace.getActiveBoardTab()}))).toEqual({ids:[],tab:state.tab})
  }
  await bar.getByRole('tab').nth(1).click()
  expect(await page.evaluate(()=>fixture.workspace.getActiveBoardTab())).not.toBe(state.tab)
 }finally{await page.close()}
},20000)

it('keeps automatic arrangement selected and repacks the current page after live width changes',async()=>{
 const page=await browser.newPage({viewport:{width:1440,height:860}})
 const errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{width:1180px;height:760px}[data-research-canvas]{width:100%!important;height:100%!important}</style><div id="host"></div>`}))
  await page.goto('https://auto-arrange.test/')
  await page.addScriptTag({content:tabsScript})
  await page.waitForSelector('[data-ework-grid]')
  await page.evaluate(()=>{
   const notes=Array.from({length:3},(_,i)=>({id:'responsive-'+i,messageId:'responsive-'+i,kind:'pasted-text',title:'资料 '+i,excerpt:'对齐视图和真实内容 '.repeat(35+i*25),x:200,y:160+i*300,width:380,height:280,sizeMode:'manual'}))
   const chart={...notes[0],id:'height-chart',kind:'generated-container',title:'行业分布',y:1100,containerPrompt:'行业分布',generationStatus:'completed',refreshMinutes:0,containerSpec:{version:1,type:'chart',variant:'bar',title:'行业分布',labels:['医药','科技'],series:[{name:'报告 / 篇',values:[12,9]}]}}
   fixture.workspace.setArtifacts([...notes,chart])
   fixture.workspace.createBoardTabs()
   fixture.workspace.setBoardTabsPresentation('horizontal')
  })
  const menuToggle=page.locator('[data-workbench-arrange-toggle]')
  await menuToggle.click()
  const automatic=page.getByRole('menuitemradio',{name:'自动整理',exact:true})
  expect(await automatic.count()).toBe(1)
  expect(await page.getByRole('menuitemradio').allTextContents()).toEqual(['自动整理','标准整理','三排整理','双排整理','单排整理'])
  await automatic.click()
  const columns=()=>page.evaluate(()=>new Set(fixture.workspace.getWorkbenchCells().map(cell=>cell.x)).size)
  const cardHeights=()=>page.evaluate(()=>fixture.workspace.getSnapshot().artifacts.filter(node=>node.id.startsWith('responsive-')).map(node=>Math.round(node.height)))
  const settled=()=>page.waitForFunction(()=>!document.querySelector('[data-research-canvas]').__eworkContentFit)
  await expect.poll(columns).toBe(3)
  await settled()
  const wideHeights=await cardHeights()
  const chartHeight=()=>page.evaluate(()=>fixture.workspace.getSnapshot().artifacts.find(node=>node.id==='height-chart').height)
  const tallChart=await chartHeight()
  await page.locator('#host').evaluate(el=>el.style.height='340px')
  await expect.poll(()=>page.evaluate(()=>fixture.workspace.getSnapshot().canvasSize.visibleHeight)).toBeLessThan(400)
  await expect.poll(chartHeight).toBeLessThan(tallChart)
  expect(await columns()).toBe(3)
  await page.locator('#host').evaluate(el=>el.style.height='760px')
  await expect.poll(chartHeight).toBe(tallChart)
  await page.locator('#host').evaluate(el=>el.style.width='800px')
  await expect.poll(columns).toBe(2)
  await page.locator('#host').evaluate(el=>el.style.width='550px')
  await expect.poll(columns).toBe(1)
  await settled()
  expect(await cardHeights()).not.toEqual(wideHeights)
  await page.locator('#host').evaluate(el=>el.style.width='1180px')
  await expect.poll(columns).toBe(3)
  await page.evaluate(()=>fixture.workspace.setBoardTabsPresentation('vertical',320))
  await expect.poll(columns).toBe(2)
  await page.evaluate(()=>fixture.workspace.setBoardTabsPresentation('horizontal'))
  await expect.poll(columns).toBe(3)
  await settled()

  await page.reload()
  await page.addScriptTag({content:tabsScript})
  await page.waitForSelector('[data-ework-grid]')
  await expect.poll(columns).toBe(3)
  await menuToggle.click()
  expect(await automatic.getAttribute('aria-checked')).toBe('true')
  await page.getByRole('menuitemradio',{name:'单排整理',exact:true}).click()
  await expect.poll(columns).toBe(1)
  await settled()
  await page.locator('#host').evaluate(el=>el.style.width='800px')
  await page.waitForFunction(()=>fixture.workspace.getSnapshot().canvasSize.availableWidth<900)
  expect(await columns()).toBe(1)
  expect(errors).toEqual([])
 }finally{await page.close()}
},30000)

it('warns above the toolbar only when auto arrange overrides a committed manual resize',async()=>{
 const page=await browser.newPage({viewport:{width:1240,height:820}})
 page.setDefaultTimeout(4500)
 try{
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:`<style>${canvasCss}\nhtml,body{margin:0}#host{width:1000px;height:760px}[data-research-canvas]{width:100%!important;height:100%!important}</style><div id="host"></div>`}))
  await page.goto('https://auto-arrange.test/')
  await page.addScriptTag({content:script})
  await page.waitForSelector('[data-ework-grid]')
  await page.evaluate(()=>{
   fixture.workspace.setArtifacts(['resize-note','peer'].map((id,i)=>({id,messageId:id,kind:'pasted-text',title:id,excerpt:'测试手动调整组件尺寸',x:240+i*490,y:160,width:460,height:280,sizeMode:'manual'})))
   fixture.workspace.setWorkbenchResponsiveArrange(true)
   fixture.workspace.updateSelection(['resize-note'],'replace')
  })
  await page.waitForFunction(()=>fixture.calls()>0&&!document.querySelector('[data-research-canvas]').__eworkContentFit)
  const handle=page.locator('[data-workbench-resize="resize-note"][data-workbench-resize-axis="y"]')
  const toolbar=page.locator('[data-ework-toolbar]')
  const notice=page.locator('[data-workbench-auto-resize-notice]')
  const height=()=>page.evaluate(()=>fixture.workspace.getWorkbenchVisibleCells().find(c=>c.id==='resize-note').h)
  const drag=async(cancel=false)=>{
   await page.evaluate(()=>fixture.workspace.updateSelection(['resize-note'],'replace'))
   const before=await height(),box=await handle.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+128,{steps:4})
   await expect.poll(height).toBeGreaterThan(before)
   if(cancel)await page.keyboard.press('Escape')
   await page.mouse.up()
   return before
  }
  await handle.click()
  await drag(true)
  expect(await notice.count()).toBe(0)
  const before=await drag()
  await expect.poll(height).toBe(before)
  await notice.waitFor({state:'visible',timeout:1600})
  expect(await notice.getByRole('status').textContent()).toBe('当前已开启自动整理，手动整理可能失效')
  const top=(await toolbar.boundingBox()).y,box=await notice.boundingBox()
  expect(top-(box.y+box.height)).toBeGreaterThan(0)
  await notice.getByRole('button',{name:'关闭提示'}).click()
  await notice.waitFor({state:'hidden',timeout:600})
  await drag()
  await notice.waitFor({state:'visible',timeout:1600})
  await page.waitForTimeout(1100)
  expect(await notice.isVisible()).toBe(true)
  await notice.waitFor({state:'hidden',timeout:1300})
  await page.evaluate(()=>fixture.workspace.setWorkbenchResponsiveArrange(false))
  const manual=await drag()
  await expect.poll(height).toBeGreaterThan(manual)
  expect(await notice.count()).toBe(0)
 }finally{await page.close()}
},15000)

it('fits a portable webpage at its current width and switches all board palettes without reloading its form',async()=>{
 const {workbenchStylePalette}=require('../packages/dsh-research-task-runtime/workbench-style.js')
 const page=await browser.newPage({viewport:{width:1220,height:780}})
 const errors=[]
 page.on('pageerror',err=>errors.push(err.message))
 const documentHtml='<!doctype html><meta charset=utf-8><style>:root{--card:#fff;--ink:#0f172a;--a:#2563eb}*{box-sizing:border-box}body{margin:0;padding:18px;color:var(--ink)}main{background:var(--card)}.piece{height:360px}button{background:#fff;color:#0f172a}@media(max-width:680px){.piece{height:500px}}</style><main><input value="4" aria-label="人数"><button onclick="more.hidden=!more.hidden">展开行程</button><div class="piece">费用</div><div id="more" class="piece" hidden>更多行程</div><svg height="22"><path id="series" stroke="#2563eb" d="M0 10h35"/></svg><footer>正文末尾</footer></main>'
 try{
  await page.route('https://auto-arrange.test/',route=>route.fulfill({contentType:'text/html',body:'<style>'+canvasCss+'\nhtml,body{margin:0}#host{width:1000px;height:700px}[data-research-canvas]{width:100%!important;height:100%!important}</style><div id="host"></div>'}))
  await page.route('https://preview.test/**',route=>route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-ancestors https://auto-arrange.test"},body:documentHtml+(new URL(route.request().url()).search==='?workbench'?workbenchWebpagePreviewSuffix:'')}))
  await page.goto('https://auto-arrange.test/');await page.addScriptTag({content:script})
  await page.waitForSelector('[data-ework-grid]')
  await page.evaluate(()=>{
   const file={name:'行程.workbench.html',authorizationId:'page-file',capabilityToken:'preview',url:'https://preview.test/'}
   window.dshDesktop.researchPreview={admitSidebarFile:async()=>file,restore:async()=>file,release:()=>{}}
   window.dshDesktop.researchCanvasExport={save:async v=>{window.pageExport=v;return{status:'saved'}}}
   const workspace=fixture.workspace
   workspace.setWorkbenchResponsiveArrange(true)
   const spec={version:1,type:'files',title:'费用计算器',presentation:'webpage',items:[{id:'page',name:'行程.html',relativePath:file.name}]}
   const draft=workspace.createContainerDraft()
   workspace.setArtifacts([{...draft,title:spec.title,generationStatus:'completed',containerSpec:spec}])
  })
  const card=page.locator('[data-research-node-id]').filter({has:page.locator('[data-research-attachment-preset="webpage"]')}),iframe=card.locator('iframe')
  await iframe.waitFor()
  const child=await (await iframe.elementHandle()).contentFrame()
  const settled=async()=>{
   await expect.poll(async()=>child.evaluate(()=>Math.abs(document.body.getBoundingClientRect().height-innerHeight)),{timeout:10000}).toBeLessThan(32)
   await expect.poll(()=>page.evaluate(()=>!!document.querySelector('[data-ework-grid]').__eworkContentFit),{timeout:9000}).toBe(false)
  }
  await settled()
  expect(await card.locator('.ew-grid-header').count()).toBe(1)
  expect(await card.locator('.odyssey-data-stamp').count()).toBe(1)
  expect(await card.locator('.ew-attachment-webpage > footer').count()).toBe(0)
  await child.getByLabel('人数').fill('6')
  for(const mode of ['light','dark','enterprise','openterminal']){
   await page.evaluate(mode=>fixture.workspace.setWorkbenchStyle(mode,{scope:'board'}),mode)
   await child.waitForFunction(mode=>document.documentElement.dataset.workbenchStyle===mode,mode)
   const palette=workbenchStylePalette(mode)
   const colors=await child.evaluate(()=>{
    const color=el=>getComputedStyle(el)
    return [color(document.body).backgroundColor,color(document.body).color,color(document.querySelector('#series')).stroke]
   })
   const rgb=hex=>'rgb('+hex.replace('#','').replace(/^([\da-f])([\da-f])([\da-f])$/i,'$1$1$2$2$3$3').match(/../g).map(pair=>parseInt(pair,16)).join(', ')+')'
   expect(colors).toEqual([palette.bg,palette.text,palette['chart-1']].map(rgb))
   expect(await child.getByLabel('人数').inputValue()).toBe('6')
  }
  const before=(await card.boundingBox()).height
  await child.getByText('展开行程').click();await settled()
  expect((await card.boundingBox()).height).toBeGreaterThan(before+320)
  await child.getByText('展开行程').click();await settled()
  expect(Math.abs((await card.boundingBox()).height-before)).toBeLessThan(32)
  await page.evaluate(()=>document.querySelector('#host').style.width='515px');await settled()
  await page.locator('[data-research-global-arrange]').click()
  await settled()
  const arrangedHeight=(await card.boundingBox()).height
  await page.locator('[data-research-global-arrange]').click()
  await settled()
  expect((await card.boundingBox()).height).toBe(arrangedHeight)
  expect(await child.evaluate(()=>document.querySelector('footer').getBoundingClientRect().bottom<=innerHeight+1)).toBe(true)
  await card.locator('[data-workbench-more]').click()
  await page.getByRole('menuitem',{name:'导出',exact:true}).click()
  await page.getByRole('menuitem',{name:'HTML',exact:true}).click()
  expect(await page.evaluate(()=>window.pageExport)).toMatchObject({kind:'original',suggestedName:'行程.html',authorizationId:'page-file'})
  expect(errors).toEqual([])
 }finally{await page.close()}
},35000)
