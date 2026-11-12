import {afterAll,beforeAll,expect,it} from 'vitest'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'esbuild'
import {canvasCss} from '../scripts/lib/figma-canvas-client.mjs'

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
