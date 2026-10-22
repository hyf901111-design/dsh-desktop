import {afterAll,beforeAll,expect,it} from 'vitest'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {researchMarketContentDimensions,researchMarketDimensions,researchOptimalDimensions} from '../packages/dsh-research-task-runtime/bento-layout.js'
import {createWorkbenchGridState} from '../scripts/lib/research-grid-state.mjs'

let browser
beforeAll(async()=>{
 const pw=await import(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
 browser=await(pw.default||pw).chromium.launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},20000)
afterAll(()=>browser?.close())
// The production incident had two six-field quotes, optional daily-change
// details and three provenance lines. Use synthetic values with that same shape.
const data={version:1,type:'market',variant:'metrics',title:'两标的完整报价 · 合成布局回归',asOf:'合成来源 · 报价时点未提供',
 note:'行情仅代表合成来源；24h成交量为基础资产数量。日内涨跌幅由最近成交价相对UTC 00:00开盘价计算，不等于滚动24h涨跌幅。',
 sources:[{label:'合成来源文档',url:'https://example.org/synthetic-ticker'}],
 items:['BTC','ETH'].flatMap(symbol=>['最近成交','买一','卖一','24h最高','24h最低','24h成交量'].map((label,index)=>({label:symbol+' '+label,value:index===5?'12345.6789 '+symbol:'12345.67 USD',...index===0?{detail:'日内涨跌幅 -2.76%（UTC 00:00 起）'}:{}})))}
const ui=readFileSync(new URL('../scripts/lib/research-grid-ui.mjs',import.meta.url),'utf8')
const dimensions=vm.runInNewContext('('+ui.slice(ui.indexOf('export function workbenchMeasuredDimensions('),ui.indexOf('export function measureWorkbenchContents(')).replace(/^export /u,'')+')',{researchOptimalDimensions,researchMarketDimensions,researchCandleTemplate:()=>false})
async function preview(spec,width,height,mode){
 const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'})
 await page.route('**/*',route=>route.abort())
 await page.setContent(buildResearchHtmlPreview(spec.html,spec.title,'light',{workbench:true}))
 await page.evaluate(()=>{window.metricSizes=[];addEventListener('message',event=>{if(event.data?.type==='sherlock-workbench-content-size'&&event.data.intrinsicMetrics===true)window.metricSizes.push(event.data)})})
 const frame=page.frames()[1];await frame.waitForSelector('.market-metric');await frame.evaluate(()=>document.fonts.ready)
 await page.evaluate(mode=>document.querySelector('iframe').contentWindow.postMessage({type:'sherlock-workbench-style',mode,controlTheme:['dark','openterminal'].includes(mode)?'dark':'light'},'*'),mode)
 await frame.waitForFunction(mode=>document.documentElement.dataset.workbenchStyle===mode,mode)
 return{page,frame}
}
async function geometry(frame){return frame.evaluate(()=>{
 const box=element=>{const r=element.getBoundingClientRect();return{top:r.top,bottom:r.bottom,height:r.height,client:element.clientHeight,total:element.scrollHeight}}
 const grid=document.querySelector('.market-metrics'),footer=document.querySelector('.market-footer')
 return{grid:box(grid),footer:box(footer),tiles:[...grid.children].map(box),valueFont:parseFloat(getComputedStyle(grid.querySelector('.market-value')).fontSize),footerText:footer.textContent}
})}
it.each(['light','dark','enterprise','openterminal'])('fits both six-field quotes and complete provenance in content-sized %s cards',async mode=>{
 const spec=renderMarketArtifact(data)
 for(const width of [656,400]){
  const preferred=researchMarketDimensions({containerSpec:spec},true,width),{page,frame}=await preview(spec,width,preferred.height-58,mode)
  try{const g=await geometry(frame)
   expect(g.tiles).toHaveLength(12);expect(g.valueFont).toBe(width<=480?16:18)
   expect(g.grid.total).toBeLessThanOrEqual(g.grid.client+1)
   expect(g.footer.total).toBeLessThanOrEqual(g.footer.client+1)
   expect(Math.max(...g.tiles.map(t=>t.bottom))).toBeLessThanOrEqual(g.grid.bottom+1)
   expect(g.footer.top).toBeGreaterThanOrEqual(g.grid.bottom)
   expect(g.footer.bottom).toBeLessThanOrEqual(preferred.height-58)
   expect(g.footerText).toContain(data.note);expect(g.footerText).toContain('合成来源文档')
  }finally{await page.close()}
 }
},20000)
it('uses actual intrinsic metric rows to grow the local viewport, while preserving saved geometry and explicit resizing',async()=>{
 const spec=renderMarketArtifact({...data,items:data.items.map(item=>({...item,detail:'24小时完整统计口径 · 不缩小字体，不省略任何报价字段'}))}),width=860,chrome=58
 const {page,frame}=await preview(spec,width,380,'enterprise')
 try{
  await expect.poll(async()=>page.evaluate(()=>window.metricSizes.at(-1)?.height||0)).toBeGreaterThan(380)
  const report=await page.evaluate(()=>window.metricSizes.at(-1)),before=await geometry(frame)
  expect(before.grid.total).toBeGreaterThan(before.grid.client);expect(before.footer.total).toBeLessThanOrEqual(before.footer.client+1)
  const node={id:'quotes',kind:'generated-container',sizeMode:'manual',width,height:380+chrome,x:width/2+12,y:(380+chrome)/2+12,containerSpec:spec}
  const state=createWorkbenchGridState({getItem:()=>JSON.stringify({version:2,cells:[{id:node.id,x:0,y:0,w:40,h:21}]})},'complete-quote-rows');state.enable(width+24)
  let snapshot=state.reconcile({files:[],artifacts:[node],viewport:{x:0,y:0,scale:1}})
  const saved=state.document(snapshot),measured=dimensions(node,{...report,chromeHeight:chrome})
  expect(state.contentHeight(node.id,{html:spec.html,width,height:measured.height})).toBe(true)
  snapshot=state.reconcile(snapshot)
  expect(snapshot.artifacts[0].height).toBeGreaterThanOrEqual(measured.height);expect(state.document(snapshot)).toEqual(saved)
  await page.setViewportSize({width,height:Math.ceil(snapshot.artifacts[0].height-chrome)})
  const grown=await geometry(frame)
  expect(grown.grid.total).toBeLessThanOrEqual(grown.grid.client+1);expect(grown.footer.total).toBeLessThanOrEqual(grown.footer.client+1)
  expect(grown.tiles[11].bottom).toBeLessThanOrEqual(grown.grid.bottom+1)
  expect(state.contentHeight(node.id,{html:'stale HTML',width,height:2000})).toBe(false)
  state.set(state.get().map(cell=>({...cell,h:12})));snapshot=state.reconcile(snapshot)
  expect(state.contentHeight(node.id,{html:spec.html,width,height:measured.height})).toBe(false)
  await page.setViewportSize({width,height:220})
  await frame.evaluate(()=>{const grid=document.querySelector('.market-metrics');grid.scrollTop=grid.scrollHeight})
  const small=await geometry(frame)
  expect(small.tiles[11].bottom).toBeLessThanOrEqual(small.grid.bottom+1);expect(small.tiles[11].top).toBeGreaterThanOrEqual(small.grid.top-1)
  expect(small.footer.bottom).toBeLessThanOrEqual(220);expect(small.valueFont).toBeGreaterThanOrEqual(18)
 }finally{await page.close()}
},15000)
it('bounds a maximum-size narrow metric set and a long source note with independently reachable scrolling content',async()=>{
 const crowded={...data,note:data.note.repeat(12)}
 expect(researchMarketContentDimensions('metrics',{...crowded,availableWidth:320}).height).toBe(840)
 expect(dimensions({containerSpec:renderMarketArtifact(crowded)},{width:320,height:2000,intrinsicMetrics:true}).height).toBe(840)
 const {page,frame}=await preview(renderMarketArtifact(crowded),320,220,'enterprise')
 try{
  await frame.evaluate(()=>{const grid=document.querySelector('.market-metrics'),footer=document.querySelector('.market-footer');grid.scrollTop=grid.scrollHeight;footer.scrollTop=footer.scrollHeight})
  const g=await geometry(frame)
  expect(g.tiles).toHaveLength(12);expect(g.footer.height).toBeLessThanOrEqual(220*.35+1)
  expect(g.grid.total).toBeGreaterThan(g.grid.client);expect(g.footer.total).toBeGreaterThan(g.footer.client)
  expect(g.tiles[11].bottom).toBeLessThanOrEqual(g.grid.bottom+1)
  expect(await frame.locator('.market-footer a').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('footer').getBoundingClientRect();return r.bottom<=p.bottom+1&&r.top>=p.top-1})).toBe(true)
 }finally{await page.close()}
})
