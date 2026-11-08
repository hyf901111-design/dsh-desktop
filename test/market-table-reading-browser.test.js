import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {researchMarketContentDimensions,researchMarketDimensions,researchOptimalDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
import {createResearchGrid} from '../packages/dsh-research-task-runtime/research-grid.js'
import {Window} from 'happy-dom'
import {build} from 'esbuild'
import {parseResearchMarketNativeTable,ResearchMarketNativeTable,researchMarketNativeTableCss} from '../scripts/lib/research-market-native-table.mjs'
import {componentSourceCss} from '../scripts/lib/component-source-info.mjs'
import {WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'

// Complete semantic model retained by the actual a0d75bfa native task. No fetch,
// model, client connection or saved canvas mutation is needed to replay it.
const globalObserved=JSON.parse(readFileSync(new URL('./fixtures/workbench-three-quote-table-20261023.json',import.meta.url),'utf8'))
const observed=globalObserved
const ui=readFileSync(new URL('../scripts/lib/research-grid-ui.mjs',import.meta.url),'utf8')
const measured=vm.runInNewContext('('+ui.slice(ui.indexOf('export function workbenchMeasuredDimensions('),ui.indexOf('export function measureWorkbenchContents(')).replace(/^export /u,'')+')',{researchOptimalDimensions,researchMarketDimensions,researchCandleTemplate:()=>false})
let browser,nativeDependencies
beforeAll(async()=>{
 const pw=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
 browser=await(pw.default||pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 const bundled=await build({stdin:{resolveDir:process.cwd(),contents:"import * as react from 'react';import * as jsx from 'react/jsx-runtime';import {flushSync} from 'react-dom';import {createRoot} from 'react-dom/client';window.nativeDeps={react,jsx,flushSync,createRoot};"},bundle:true,write:false,format:'iife',platform:'browser'})
 nativeDependencies=bundled.outputFiles[0].text
},20000)
afterAll(()=>browser?.close())
async function preview(data,width,height,mode='light'){
 const spec=renderMarketArtifact(data),page=await browser.newPage({viewport:{width:Math.ceil(width),height:Math.ceil(height)},reducedMotion:'reduce'})
 await page.route('**/*',route=>route.abort())
 await page.setContent('<script>window.tableSizes=[];addEventListener("message",event=>{if(event.data?.type==="sherlock-workbench-content-size")window.tableSizes.push(event.data)})</script>'+buildResearchHtmlPreview(spec.html,spec.title,'light',{workbench:true}))
 const frame=page.frames()[1];await frame.waitForSelector('tbody tr');await frame.evaluate(()=>document.fonts.ready)
 await page.evaluate(mode=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-workbench-style',mode,controlTheme:['dark','openterminal'].includes(mode)?'dark':'light'},'*'),mode)
 await frame.waitForFunction(mode=>document.documentElement.dataset.workbenchStyle===mode,mode)
 await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-workbench-selection',selected:true},'*'))
 return{page,frame,spec}
}
async function geometry(frame){return frame.evaluate(()=>{
 const box=el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,client:el.clientHeight,total:el.scrollHeight}}
 return{wrap:box(document.querySelector('.market-table-wrap')),footer:box(document.querySelector('.market-footer')),rows:[...document.querySelectorAll('tbody tr')].map(box),viewport:innerHeight}
})}
async function fits(frame){const g=await geometry(frame);expect(g.rows).toHaveLength(3);expect(g.rows.at(-1).bottom,JSON.stringify(g)).toBeLessThanOrEqual(g.wrap.bottom+1);expect(g.wrap.total).toBeLessThanOrEqual(g.wrap.client+1);expect(g.footer.total).toBeLessThanOrEqual(g.footer.client+1);expect(g.footer.bottom).toBeLessThanOrEqual(g.viewport);return g}
it.each(['light','dark','enterprise','openterminal'])('fits initial and arranged three-row source tables in %s',async mode=>{
 const spec=renderMarketArtifact(observed),node={id:'native-table',kind:'generated-container',generationStatus:'completed',containerSpec:spec}
 // First generation uses semantic sizing before any sandbox report exists.
 const initial=researchMarketContentDimensions('table',{...observed,availableWidth:482})
 const {page,frame}=await preview(observed,482,initial.height-58,mode)
 try{
  await fits(frame)
  expect(await frame.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)))).toEqual(observed.rows.map(row=>row.map(String)))
  // Arrange must ignore old clipped measurements and estimate at actual width.
  const stale=measured(node,{width:586,height:170,chromeHeight:58},586)
  const grid=createResearchGrid(),m=grid.metrics(610),cells=grid.arrange([{...node,preferred:stale}],[{id:node.id,x:0,y:0,w:32,h:18}],610)
  const arranged=grid.project([node],cells,610)[0]
  expect(grid.arrange([{...node,preferred:stale}],cells,610)).toEqual(cells)
  await page.setViewportSize({width:Math.floor(arranged.width),height:Math.floor(arranged.height-58)})
  await fits(frame)
  const wrap=frame.locator('.market-table-wrap')
  expect(await wrap.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(100)
  await wrap.hover();await page.mouse.wheel(2000,0)
  await expect.poll(()=>wrap.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0)
  await wrap.evaluate(el=>el.scrollLeft=el.scrollWidth)
  const last=await frame.locator('tbody tr:first-child td:last-child').boundingBox(),bounds=await wrap.boundingBox()
  expect(last.x).toBeGreaterThanOrEqual(bounds.x-1);expect(last.x+last.width).toBeLessThanOrEqual(bounds.x+bounds.width+1)
  await frame.locator('thead th:last-child button').focus()
  expect(await frame.locator('thead th:last-child button').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.market-table-wrap').getBoundingClientRect();return r.left>=p.left-1&&r.right<=p.right+1})).toBe(true)
 }finally{await page.close()}
},20000)
it('measures complete rows and wrapped provenance independently of the clipped viewport, including a width change',async()=>{
 const {page,frame,spec}=await preview(observed,586,170),node={containerSpec:spec}
 try{
  await expect.poll(()=>page.evaluate(()=>window.tableSizes.at(-1)?.height||0)).toBeGreaterThan(170)
  const report=await page.evaluate(()=>window.tableSizes.at(-1)),height=measured(node,report,586).height
  expect(report.intrinsicTable).toBe(true)
  await page.setViewportSize({width:586,height:Math.ceil(height-58)});await fits(frame)
  const wide=await page.evaluate(()=>window.tableSizes.at(-1)?.height||0)
  await page.setViewportSize({width:360,height:170})
  await expect.poll(()=>page.evaluate(()=>window.tableSizes.at(-1)?.width)).toBe(360)
  const narrow=await page.evaluate(()=>window.tableSizes.at(-1))
  expect(narrow.height).toBeGreaterThan(wide)
  await page.setViewportSize({width:360,height:Math.ceil(measured(node,narrow,360).height-58)});await fits(frame)
 }finally{await page.close()}
},15000)
it('pages long sandbox tables without losing records, original links or full body and searches and sorts all pages',async()=>{
 const long={...observed,columns:['记录','日期','正文'],rows:Array.from({length:51},(_,i)=>['记录'+String(i).padStart(2,'0'),'2026-11-08','完整正文'+i+'。'.repeat(50)]),rowLinks:Array.from({length:51},(_,i)=>'https://example.com/original/'+i),note:'完整口径。'}
 const preferred=researchMarketContentDimensions('table',{...long,availableWidth:1100})
 const {page,frame,spec}=await preview(long,1100,preferred.height-58)
 try{
  frame.page().setDefaultTimeout(3000)
  expect(await frame.locator('tbody tr').count()).toBe(51)
  const delivered=[]
  for(let i=0;i<3;i++){
   await frame.getByLabel('表格页码').selectOption(String(i))
   const actual=await frame.locator('tbody tr:not([hidden])').evaluateAll(rows=>rows.map(row=>({cells:[...row.cells].map(cell=>cell.textContent),url:row.querySelector('a').href})))
   expect(actual).toHaveLength(i===2?11:20);delivered.push(...actual)
  }
  expect(delivered).toEqual(long.rows.map((cells,i)=>({cells,url:long.rowLinks[i]})))
  expect(await frame.getByLabel('下一页').isDisabled()).toBe(true)
  await frame.getByLabel('搜索表格内容').fill('完整正文50')
  expect(await frame.locator('tbody tr:not([hidden])').count()).toBe(1)
  expect(await frame.getByLabel('表格页码').inputValue()).toBe('0')
  await frame.getByLabel('搜索表格内容').fill('不存在')
  expect(await frame.locator('tbody tr:not([hidden])').count()).toBe(0)
  expect(await frame.getByLabel('上一页').isDisabled()).toBe(true);expect(await frame.getByLabel('下一页').isDisabled()).toBe(true)
  await frame.getByLabel('搜索表格内容').fill('')
  await frame.getByLabel('按记录排序').click();await frame.getByLabel('按记录排序').click()
  expect(await frame.locator('tbody tr:not([hidden]) td:first-child').first().textContent()).toBe('记录50')
  await frame.getByLabel('表格页码').selectOption('2')
  expect(await frame.locator('tbody tr:not([hidden]) td:first-child').last().textContent()).toBe('记录00')
  const wrap=frame.locator('.market-table-wrap');expect(await wrap.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1)
  for(const size of [50,100,10,20]){
   await page.evaluate(()=>window.tableSizes=[])
   await frame.getByLabel('每页显示数量').selectOption(String(size))
   expect(await frame.locator('tbody tr:not([hidden])').count()).toBe(Math.min(size,51))
   await expect.poll(()=>page.evaluate(()=>window.tableSizes.at(-1)?.height||0)).toBeGreaterThan(0)
   const natural=measured({containerSpec:spec},await page.evaluate(()=>window.tableSizes.at(-1)),1100).height
   await page.setViewportSize({width:1100,height:Math.ceil(natural-58)})
   await expect.poll(()=>wrap.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1)
   if(size===50)expect(natural).toBeGreaterThan(840)
  }
 }finally{await page.close()}
},15000)

const nativePresentation=WORKBENCH_PRESENTATION_CSS.replaceAll(':root[data-sherlock-theme="dark"]','__DARK__').replaceAll(':root','__ROOT__').replace(/\bhtml\b|\bbody\b/g,'body [data-ework-grid] .rScV5Q_containerContent').replaceAll('__DARK__','body[data-ds-dark-theme] [data-ework-grid] .rScV5Q_containerContent').replaceAll('__ROOT__','body [data-ework-grid] .rScV5Q_containerContent')
const nativeCss=componentSourceCss+readFileSync(new URL('../scripts/lib/research-grid-workbench.css',import.meta.url),'utf8')+nativePresentation+researchMarketNativeTableCss+readFileSync(new URL('../scripts/lib/workbench-style.css',import.meta.url),'utf8')
const nativeMeasure=ui.slice(ui.indexOf('export function workbenchNativeTableDimensions('),ui.indexOf('export function workbenchMeasuredDimensions(')).replace(/^export /u,'')
it.each([['light',3],['dark',3],['enterprise',3],['openterminal',3],['dark',20]])('fits actual host-native rows, full asOf/note and selected row after default sizing and Arrange in %s with %i rows',async(mode,count)=>{
 const observed=count===3?globalObserved:{...globalObserved,rows:Array.from({length:count},(_,i)=>[String(i),...globalObserved.rows[i%3].slice(1)]),note:'完整来源记录。'}
 const spec=renderMarketArtifact(observed),win=new Window(),data=parseResearchMarketNativeTable(spec.html,win.document);win.happyDOM.abort()
 expect(data.footer.map(line=>line.map(part=>part.text).join(''))).toEqual([observed.asOf,observed.note])
 const page=await browser.newPage({viewport:{width:900,height:900},reducedMotion:'reduce'})
 try{
  await page.setContent('<style>html,body{margin:0}article{display:flex;flex-direction:column;position:relative;transition:none!important}#native{width:100%;height:calc(100% - 58px);flex:none!important}header{height:34px;flex:none}.odyssey-data-stamp{height:24px;flex:none}</style><main data-ework-grid data-workbench-style="'+mode+'"><article data-research-artifact-card data-research-node-id="native-table" data-selected="true"><header></header><div id="native" class="rScV5Q_containerContent" data-research-preview-body></div><div class="odyssey-data-stamp">'+(count===20?'<span class="ew-source-actions"></span>':'')+'</div></article></main>')
  await page.addStyleTag({content:nativeCss});await page.addScriptTag({content:nativeDependencies})
  await page.addScriptTag({content:'window.react=nativeDeps.react;window.react_jsx_runtime=nativeDeps.jsx;window.NativeTable=('+ResearchMarketNativeTable.toString()+');'+researchMarketContentDimensions.toString()+'\n'+researchMarketDimensions.toString()+'\n'+nativeMeasure})
  await page.evaluate(({data,mode})=>{if(['dark','openterminal'].includes(mode))document.body.setAttribute('data-ds-dark-theme','');nativeDeps.flushSync(()=>nativeDeps.createRoot(document.querySelector('#native')).render(react.createElement(NativeTable,{data})))},{data,mode})
  await page.locator('article').evaluate(el=>el.style.setProperty('transition','none','important'))
  if(count===20)expect(await page.locator('.terminal-native-context').isVisible()).toBe(false)
  const inspect=()=>page.evaluate(()=>{
   const root=document.querySelector('[data-sherlock-market-native]'),wrap=root.querySelector('.fund-native-table-wrap'),footer=root.querySelector('footer'),readout=root.querySelector('.terminal-native-readout')
   return{rowEnd:root.querySelector('tbody tr:last-child').getBoundingClientRect().bottom,wrapEnd:wrap.getBoundingClientRect().bottom,footerEnd:footer.getBoundingClientRect().bottom,rootEnd:root.getBoundingClientRect().bottom,footerClient:footer.clientHeight,footerTotal:footer.scrollHeight,readoutClient:readout?.clientHeight,readoutTotal:readout?.scrollHeight}
  })
  for(const width of [482,586,360]){
   const height=researchMarketDimensions({containerSpec:spec},true,width).height
   await page.locator('article').evaluate((el,{width,height})=>Object.assign(el.style,{width:width+'px',height:height+'px'}),{width,height})
   // Use the same intrinsic helper as first-completion and Arrange paths.
   const natural=await page.evaluate(()=>workbenchNativeTableDimensions(document.querySelector('[data-sherlock-market-native]')))
   await page.locator('article').evaluate((el,height)=>el.style.height=height+'px',natural.height)
   for(let repeat=0;repeat<3;repeat++)expect(await page.evaluate(()=>workbenchNativeTableDimensions(document.querySelector('[data-sherlock-market-native]')))).toEqual(natural)
   let g=await inspect();expect(g.rowEnd,JSON.stringify(g)).toBeLessThanOrEqual(g.wrapEnd+1);expect(g.footerTotal).toBeLessThanOrEqual(g.footerClient+1);expect(g.footerEnd).toBeLessThanOrEqual(g.rootEnd)
   await page.locator('tbody tr:first-child').click()
   const selectedSize=await page.evaluate(()=>workbenchNativeTableDimensions(document.querySelector('[data-sherlock-market-native]')))
   await page.locator('article').evaluate((el,height)=>el.style.height=height+'px',selectedSize.height)
   g=await inspect();expect(g.rowEnd,JSON.stringify({width,height,natural,selectedSize,g})).toBeLessThanOrEqual(g.wrapEnd+1)
   expect(g.footerTotal).toBeLessThanOrEqual(g.footerClient+1)
   expect(g.readoutClient).toBeGreaterThanOrEqual(20)
   expect(natural.height).toBeLessThan(height)
   expect(g.wrapEnd-g.rowEnd).toBeLessThanOrEqual(48)
   await page.locator('tbody tr:first-child').click()
  }
  const opened=await page.locator('article').evaluate(el=>{
   el.setAttribute('open','')
   el.style.height='760px'
   el.style.setProperty('--odyssey-text','red')
   const menu=document.createElement('div')
   menu.className='ew-grid-menu'
   el.appendChild(menu)
   const ink=getComputedStyle(menu).color
   menu.remove()
   const rows=el.querySelector('tbody tr:last-child').getBoundingClientRect()
   const context=el.querySelector('footer').getBoundingClientRect()
   return {ink,gap:context.top-rows.bottom}
  })
  expect(opened.ink).toBe(['dark','openterminal'].includes(mode)?'rgb(229, 229, 229)':'rgb(37, 37, 37)')
  expect(opened.gap).toBeLessThan(40)
  expect(await page.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)))).toEqual(observed.rows.map(row=>row.map(String)))
  expect(await page.locator('footer').textContent()).toContain(observed.note)
 }finally{await page.close()}
},20000)

it('expands all twenty ordinary source rows when they fit the reading height budget, even after a clipped viewport',async()=>{
 const data={...observed,rows:Array.from({length:20},(_,i)=>[String(i),...observed.rows[i%3].slice(1)]),note:'完整来源记录。'}
 const {page,frame,spec}=await preview(data,1100,260)
 try{
  await expect.poll(()=>page.evaluate(()=>window.tableSizes.at(-1)?.intrinsicTable)).toBe(true)
  const report=await page.evaluate(()=>window.tableSizes.at(-1)),height=measured({containerSpec:spec},report,1100).height
  await page.setViewportSize({width:1100,height:Math.ceil(height-58)})
  const wrap=frame.locator('.market-table-wrap')
  await expect.poll(()=>wrap.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1)
  expect(await frame.locator('tbody tr').count()).toBe(20)
  const end=await frame.locator('tbody tr:last-child').boundingBox(),box=await wrap.boundingBox()
  expect(end.y+end.height).toBeLessThanOrEqual(box.y+box.height+1)
 }finally{await page.close()}
},15000)

it.each(['light','dark','enterprise','openterminal'])('pages actual host-native complete data and refits the last page in %s',async mode=>{
 const model={...observed,columns:['记录','日期','正文'],rows:Array.from({length:51},(_,i)=>['记录'+String(i).padStart(2,'0'),'2026-11-08','完整正文'+i+'。'.repeat(30)]),rowLinks:Array.from({length:51},(_,i)=>'https://example.com/original/'+i),note:'完整口径。'}
 const spec=renderMarketArtifact(model),win=new Window(),data=parseResearchMarketNativeTable(spec.html,win.document);win.happyDOM.abort()
 expect(data.rows).toHaveLength(51)
 const page=await browser.newPage({viewport:{width:1100,height:1000},reducedMotion:'reduce'})
 try{
  await page.setContent('<style>html,body{margin:0}article{display:flex;flex-direction:column;position:relative}#native{height:calc(100% - 58px);flex:none!important}header{height:34px;flex:none}.odyssey-data-stamp{height:24px;flex:none}</style><main data-ework-grid data-workbench-style="'+mode+'"><article data-research-artifact-card data-research-node-id="table" data-selected="true"><header></header><div id="native" class="rScV5Q_containerContent" data-research-preview-body></div><div class="odyssey-data-stamp"><span class="ew-source-actions"></span></div></article></main>')
  await page.addStyleTag({content:nativeCss});await page.addScriptTag({content:nativeDependencies})
  await page.addScriptTag({content:'window.react=nativeDeps.react;window.react_jsx_runtime=nativeDeps.jsx;window.NativeTable=('+ResearchMarketNativeTable.toString()+');'+nativeMeasure})
  await page.evaluate(({data,mode})=>{if(['dark','openterminal'].includes(mode))document.body.setAttribute('data-ds-dark-theme','');nativeDeps.flushSync(()=>nativeDeps.createRoot(document.querySelector('#native')).render(react.createElement(NativeTable,{data})))},{data,mode})
  const delivered=[],heights=[]
  for(let i=0;i<3;i++){
   await page.getByLabel('表格页码').selectOption(String(i))
   const h=await page.evaluate(()=>workbenchNativeTableDimensions(document.querySelector('[data-sherlock-market-native]')).height);heights.push(h)
   await page.locator('article').evaluate((el,h)=>el.style.height=h+'px',h)
   const actual=await page.locator('tbody tr').evaluateAll(rows=>rows.map(row=>({cells:[...row.cells].map(cell=>cell.textContent),url:row.querySelector('a').href})))
   expect(actual).toHaveLength(i===2?11:20);delivered.push(...actual)
   expect(await page.locator('.fund-native-table-wrap').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1)
  }
  expect(heights[2]).toBeLessThan(heights[0])
  expect(delivered).toEqual(model.rows.map((cells,i)=>({cells,url:model.rowLinks[i]})))
  expect(await page.getByLabel('下一页').isDisabled()).toBe(true)
  await page.getByLabel('搜索表格内容').fill('完整正文50');expect(await page.locator('tbody tr').count()).toBe(1)
  await page.getByLabel('搜索表格内容').fill('不存在');expect(await page.locator('tbody tr').count()).toBe(0)
  expect(await page.getByLabel('上一页').isDisabled()).toBe(true);expect(await page.getByLabel('下一页').isDisabled()).toBe(true)
  await page.getByLabel('搜索表格内容').fill('')
  await page.getByLabel('按记录排序').click();await page.getByLabel('按记录排序').click()
  expect(await page.locator('tbody tr:first-child td:first-child').textContent()).toBe('记录50')
  await page.getByLabel('表格页码').selectOption('2')
  expect(await page.locator('tbody tr:last-child td:first-child').textContent()).toBe('记录00')
  const sizes=[]
  for(const size of [50,100,10,20]){
   await page.getByLabel('每页显示数量').selectOption(String(size))
   expect(await page.locator('tbody tr').count()).toBe(Math.min(size,51))
   expect(await page.getByLabel('表格页码').inputValue()).toBe('0')
   const h=await page.evaluate(()=>workbenchNativeTableDimensions(document.querySelector('[data-sherlock-market-native]')).height);sizes.push(h)
   await page.locator('article').evaluate((el,h)=>el.style.height=h+'px',h)
   expect(await page.locator('.fund-native-table-wrap').evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(1)
  }
  expect(sizes[0]).toBeGreaterThan(840);expect(sizes[1]).toBeGreaterThan(sizes[0]);expect(sizes[2]).toBeLessThan(sizes[3])
  expect(await page.locator('.terminal-table-pagination').evaluate(el=>el.getBoundingClientRect().top-el.previousElementSibling.getBoundingClientRect().bottom)).toBeGreaterThanOrEqual(10)
  await page.screenshot({path:'/tmp/ework-live-rail/pagination-native-'+mode+'.png'})
 }finally{await page.close()}
},20000)
