import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {JSDOM} from 'jsdom'
import {createServer} from 'node:http'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {buildResearchHtmlPreview,compactHostDashboardHtml,researchInteractionVersion} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const spec={version:1,type:'market',variant:'trend',title:'四标的同口径比较',asOf:'历史日线 · 2026-09-15 至 2026-10-20',
 labels:Array.from({length:20},(_,i)=>'2026-09-'+String(i+1).padStart(2,'0')),
 series:[
  {name:'华能国际 600011.SH（前复权，基期100）',values:[100,98.71,97.41,97.84,97.7,97.84,97.27,96.98,99.86,100,101.29,104.17,105.47,104.46,104.6,109.21,108.2,108.06,110.22,107.63]},
  {name:'华电国际 600027.SH（前复权，基期100）',values:[100,100.41,98.15,98.77,98.36,98.56,98.56,99.18,100.41,99.79,101.64,105.95,106.57,105.75,104.31,106.37,105.54,106.37,106.98,106.37]},
  {name:'国电电力 600795.SH（前复权，基期100）',values:[100,99.81,98.69,98.69,98.5,97.37,96.06,98.31,101.31,100.56,100.19,102.25,102.06,101.88,100.75,101.5,100.75,101.13,100.94,98.87]},
  {name:'沪深300 000300.SH（不复权，基期100）',values:[100,100.68,100.23,101.29,102.01,102.12,101.51,99.76,97.54,97.64,97.92,96.86,97.02,96.36,96.08,94.78,93.62,93.72,93.81,93.31]}
 ],note:'来源：financial_query / financial-1。各序列20个实际时点，日期逐项对齐。\n相对 000300.SH 的区间涨跌幅差（百分点，由高到低）：600011.SH +14.32；600027.SH +13.06；600795.SH +5.57。\n宿主按各价格/各自首值×100计算；获取时间（非报价时间）：2026-10-20T18:45:00.380Z',
 sources:[{label:'原始日线来源',url:'https://example.com/original-daily'}]}
const artifact=()=>JSON.parse(acceptArtifactOutput(JSON.stringify(spec)))
let browser,server,url,documentHtml=''
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
 server=createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(documentHtml)})
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port
},30000)
afterAll(async()=>{await browser?.close();await new Promise(resolve=>server?.close(resolve))})

// The failure this catches is a tall, narrow card spending its height on
// repeated series names while its legend no longer identifies curve colors.
it('uses a compact, colored legend and aligned point values without reducing the chart data or interactions',async()=>{
 const page=await browser.newPage({viewport:{width:388,height:746},reducedMotion:'reduce'})
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  documentHtml=buildResearchHtmlPreview(artifact().html,spec.title,'dark',{notoFont:'runtime',workbench:true})
  await page.goto(url)
  const content=page.frameLocator('#preview'),legend=content.locator('.trend-legend'),svg=content.locator('.market-trend svg')
  await svg.waitFor()
  // A native component becomes interactive only after its host supplies the
  // journal. Use that same bridge rather than disabling the sandbox guard.
  await page.evaluate(()=>document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'))
  expect((await legend.boundingBox()).height).toBeLessThan(55)
  expect((await svg.boundingBox()).height).toBeGreaterThan(250)
  expect(await content.locator('[data-trend-series]').allTextContents()).toEqual(['华能国际 600011.SH','华电国际 600027.SH','国电电力 600795.SH','沪深300 000300.SH'])
  expect(await content.locator('[data-trend-series]').first().getAttribute('title')).toBe(spec.series[0].name)
  for(const mode of ['light','dark','enterprise','openterminal']){
   await page.evaluate(mode=>document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-workbench-style',mode,controlTheme:'dark'},'*'),mode)
   await expect.poll(()=>content.locator('html').getAttribute('data-workbench-style')).toBe(mode)
   const swatches=await content.locator('.trend-swatch').evaluateAll(els=>els.map(el=>getComputedStyle(el).backgroundColor))
   const curves=await content.locator('.trend-line').evaluateAll(els=>els.map(el=>getComputedStyle(el).stroke))
   expect(swatches).toHaveLength(4);expect(swatches).toEqual(curves)
   expect(new Set(swatches).size).toBe(4)
  }
  const values=content.locator('[data-trend-point-value]')
  expect(errors).toEqual([])
  expect(await values.allTextContents()).toEqual(['107.63','106.37','98.87','93.31'])
  await svg.focus();await page.keyboard.press('ArrowLeft')
  expect(await content.locator('[data-trend-selected-date]').textContent()).toBe('2026-09-19')
  expect(await values.allTextContents()).toEqual(['110.22','106.98','100.94','93.81'])
  await content.locator('[data-trend-series="1"]').click()
  expect(await content.locator('[data-trend-readout-row="1"]').isVisible()).toBe(false)
  expect(await svg.getAttribute('aria-label')).toContain(spec.series[0].name)
  await page.setViewportSize({width:980,height:746})
  expect(await content.locator('[data-trend-selected-date]').textContent()).toBe('2026-09-19')
  expect((await legend.boundingBox()).height).toBeLessThan(30)
  const provenance=content.locator('[data-trend-provenance]')
  expect(await provenance.isVisible()).toBe(true)
  expect(await provenance.getAttribute('open')).toBeNull()
  expect(await content.locator('.trend-comparison').isVisible()).toBe(true)
  await provenance.locator('summary').click()
  expect(await provenance.locator('.trend-provenance-copy').textContent()).toBe(spec.note)
  const raw=content.locator('.market-trend details')
  await raw.locator('summary').click()
  expect(await raw.locator('tbody tr').count()).toBe(20)
  expect(await raw.locator('tbody tr').last().locator('td').allTextContents()).toEqual(['2026-09-20','107.63','106.37','98.87','93.31'])
  expect(await content.getByRole('link',{name:'原始日线来源 ↗'}).getAttribute('href')).toBe('https://example.com/original-daily')
  expect(errors).toEqual([])
 }finally{await page.close()}
},30000)

it('upgrades a saved native trend without modifying its source model, data table or existing control routes',()=>{
 const current=artifact(),legacy=current.html.replace(/<div class="trend-head"[^]*?(?=<svg)/,'<div class="trend-head"><span>归一化基期 = 100</span><div class="trend-legend">'+spec.series.map((s,i)=>'<button class="trend-key trend-'+(i+1)+'" data-trend-series="'+i+'">'+s.name+'</button>').join('')+'</div></div><div class="trend-readout" role="status">旧读数</div>').replace(/<style data-trend-presentation="v2">[^]*?<\/style>/,'')
 const upgraded=compactHostDashboardHtml(legacy),before=new JSDOM(legacy),after=new JSDOM(upgraded)
 try{
  expect(after.window.document.querySelector('.trend-head').dataset.trendLayout).toBe('v2')
  expect(readTemplateModel({...current,html:upgraded})).toEqual(readTemplateModel({...current,html:legacy}))
  expect(after.window.document.querySelector('tbody').textContent).toBe(before.window.document.querySelector('tbody').textContent)
  const route=el=>{const indices=[];for(;el?.parentElement;el=el.parentElement)indices.push([...el.parentElement.children].indexOf(el));return indices.reverse()}
  for(const selector of ['[data-trend-series="0"]','.market-trend details summary','.market-footer a'])expect(route(after.window.document.querySelector(selector))).toEqual(route(before.window.document.querySelector(selector)))
  expect(researchInteractionVersion(upgraded)).toBe(researchInteractionVersion(legacy))
  expect(compactHostDashboardHtml(upgraded)).toBe(upgraded)
  expect(compactHostDashboardHtml('<body><div class="market-trend">自定义业务图表</div></body>')).toBe('<body><div class="market-trend">自定义业务图表</div></body>')
 }finally{before.window.close();after.window.close()}
})

it('keeps business qualifiers and custom analytical notes visible instead of treating them as redundant provenance',()=>{
 const custom={...spec,note:'业务判断：收入改善，但燃料成本压力仍在。',series:spec.series.map((s,i)=>({...s,name:i===0?'华能国际（压力情景，基期100）':s.name}))}
 const result=JSON.parse(acceptArtifactOutput(JSON.stringify(custom))),dom=new JSDOM(result.html)
 try{
  expect(dom.window.document.querySelector('[data-trend-series="0"]').textContent).toBe('华能国际（压力情景，基期100）')
  expect(dom.window.document.querySelector('[data-trend-series="1"]').textContent).toBe('华电国际 600027.SH')
  expect(dom.window.document.querySelector('.market-footer').textContent).toContain(custom.note)
  expect(dom.window.document.querySelector('[data-trend-provenance]')).toBeNull()
 }finally{dom.window.close()}
})

it('keeps small daily NAV moves distinguishable on the axis and exact in the point readout',async()=>{
 const nav={version:1,type:'market',variant:'trend',title:'短债组合日净值',asOf:'模拟估值',labels:['周一','周二','周三','周四','周五'],series:[{name:'单位净值（元）',values:[1.0234,1.0236,1.0235,1.0237,1.0239]}]}
 const source=JSON.parse(acceptArtifactOutput(JSON.stringify(nav)))
 const staticDom=new JSDOM(source.html)
 try{
  const labels=[...staticDom.window.document.querySelectorAll('.trend-grid:not(.trend-vertical)')].map(line=>line.nextElementSibling.textContent)
  expect(new Set(labels).size).toBe(5)
 }finally{staticDom.window.close()}
 documentHtml=buildResearchHtmlPreview(source.html,nav.title,'light',{notoFont:'runtime',workbench:true})
 const page=await browser.newPage({viewport:{width:320,height:360},reducedMotion:'reduce'})
 try{
  await page.goto(url)
  const content=page.frameLocator('#preview'),svg=content.locator('.market-trend svg')
  await svg.waitFor()
  await page.evaluate(()=>document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false},'*'))
  for(const width of [320,656]){
   await page.setViewportSize({width,height:360})
   await expect.poll(()=>svg.evaluate(node=>Math.abs(node.viewBox.baseVal.width-node.getBoundingClientRect().width))).toBeLessThan(1)
   const ticks=await svg.locator('.trend-grid:not(.trend-vertical)').evaluateAll(lines=>lines.map(line=>({label:line.nextElementSibling.textContent,left:line.nextElementSibling.getBoundingClientRect().left})))
   expect(new Set(ticks.map(t=>t.label)).size).toBe(5)
   expect(ticks.every(t=>t.left>=0)).toBe(true)
  }
  await svg.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowRight')
  expect(await content.locator('[data-trend-point-value]').textContent()).toBe('1.0236')
 }finally{await page.close()}
},20000)
