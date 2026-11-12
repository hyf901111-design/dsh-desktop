import {beforeAll,afterAll,it,expect} from 'vitest'
import {pathToFileURL} from 'node:url'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {retainTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {buildResearchHtmlPreview} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'
import {createWorkbenchRefreshSurface} from '../packages/dsh-research-task-runtime/workbench-refresh.js'
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},15000)
afterAll(async()=>browser?.close())
const data={version:1,type:'market',variant:'price-volume',layoutProfile:'openterminal',title:'模拟量价',asOf:'模拟数据',labels:Array.from({length:20},(_,i)=>`2026-10-${String(i+1).padStart(2,'0')}`),prices:Array.from({length:20},(_,i)=>4+i/100),volumes:Array.from({length:20},(_,i)=>i*100),priceUnit:'CNY',volumeUnit:'手',note:'模拟数据，完整保留原记录。'}
it('bounds chart height by content width rather than frame height and keeps full records accessible at both breakpoints',async()=>{
 const page=await browser.newPage({viewport:{width:832,height:440}})
 try{
  await page.setContent(renderMarketArtifact(data).html)
  await page.addStyleTag({content:WORKBENCH_PRESENTATION_CSS})
  const geometry=()=>page.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};return {chart:rect('.price-volume svg'),pane:rect('.ot-price-volume-records'),table:rect('.ot-record-scroll'),overflow:document.body.scrollWidth-innerWidth,rows:document.querySelectorAll('tbody tr').length}})
  const wide=await geometry()
  expect(wide.chart.height).toBeGreaterThanOrEqual(180);expect(wide.chart.height).toBeLessThanOrEqual(257)
  expect(wide.pane.x).toBeGreaterThan(wide.chart.x+wide.chart.width)
  expect(wide.table.height).toBeLessThanOrEqual(245);expect(wide.rows).toBe(20);expect(wide.overflow).toBeLessThanOrEqual(1)
  await page.setViewportSize({width:832,height:1200})
  expect((await geometry()).chart.height).toBeCloseTo(wide.chart.height,1)
  await page.setViewportSize({width:448,height:800})
  const narrow=await geometry()
  expect(narrow.pane.y).toBeGreaterThan(narrow.chart.y+narrow.chart.height)
  expect(narrow.table.height).toBeLessThanOrEqual(173);expect(narrow.overflow).toBeLessThanOrEqual(1)
  await page.locator('[data-price-volume-index="0"]').click()
  expect(await page.locator('svg').getAttribute('data-selected-index')).toBe('0')
  expect(await page.locator('.price-volume-readout').textContent()).toContain('成交量 0 手')
 }finally{await page.close()}
},20000)

it.each(['standard', 'saved OpenTerminal'])('aligns the %s price-volume chevron in the workbench preview', async layout => {
 const page = await browser.newPage({viewport:{width:832,height:600}})
 try {
  const standard = {...data, layoutProfile:undefined}
  const rendered = renderMarketArtifact(standard)
  const saved = layout === 'saved OpenTerminal'
  if (saved) {
   rendered.html = rendered.html
    .replace('data-sherlock-market="price-volume"', 'data-layout-profile="openterminal" data-sherlock-market="price-volume"')
    .replace('<details open data-workbench-default-open="price-volume-v1">', '<details>')
  }
  const artifact = retainTemplateModel(rendered, saved ? data : standard)
  await page.setContent(buildResearchHtmlPreview(artifact.html, artifact.title, 'dark', {workbench:true,notoFont:'runtime'}))
  const frame = page.frameLocator('#preview')
  const summary = frame.locator('.price-volume>details>summary')
  const table = frame.locator('.price-volume>details>table')
  await summary.waitFor()
  await page.evaluate(() => document.querySelector('#preview').contentWindow.postMessage({type:'sherlock-interaction-state',state:{events:{}},readOnly:false}, '*'))

  const measure = () => summary.evaluate(element => {
   const textRange = document.createRange()
   textRange.selectNodeContents(element)
   const text = textRange.getBoundingClientRect()
   const icon = getComputedStyle(element, '::before')
   const height = parseFloat(icon.height)
   const translateY = icon.translate.split(' ')[1] || '0'
   const shift = parseFloat(translateY) * (translateY.endsWith('%') ? height / 100 : 1)
   const center = element.getBoundingClientRect().top + parseFloat(icon.top) + shift + height / 2
   const rotation = new DOMMatrixReadOnly(icon.transform)
   return {offset:Math.abs(center - (text.top + text.height / 2)), angle:Math.atan2(rotation.b, rotation.a) * 180 / Math.PI}
  })

  expect(await table.isVisible()).toBe(true)
  const expanded = await measure()
  await summary.press('Enter')
  expect(await table.isVisible()).toBe(false)
  const collapsed = await measure()
  expect(expanded.angle).toBe(0)
  expect(collapsed.angle).toBe(-90)
  expect(expanded.offset).toBeLessThan(1)
  expect(collapsed.offset).toBeLessThan(1)
 } finally {
  await page.close()
 }
}, 15000)
it('also compacts saved markup through the upgraded runtime without moving its original controls',async()=>{
 const page=await browser.newPage({viewport:{width:832,height:1200}})
 try{
  const old=renderMarketArtifact({...data,layoutProfile:undefined}).html.replace('data-sherlock-market="price-volume"','data-layout-profile="openterminal" data-sherlock-market="price-volume"')
  await page.setContent(old);await page.addStyleTag({content:WORKBENCH_PRESENTATION_CSS})
  const view=await page.evaluate(()=>{const svg=document.querySelector('.price-volume svg').getBoundingClientRect(),details=document.querySelector('.price-volume>details').getBoundingClientRect();return {chartHeight:svg.height,chartRight:svg.right,detailsLeft:details.left,detailsHeight:details.height,footerTop:document.querySelector('.market-footer').getBoundingClientRect().top,rows:document.querySelectorAll('tbody tr').length,controls:[...document.querySelector('.price-volume').children].map(el=>el.tagName)}})
  expect(view.chartHeight).toBeLessThanOrEqual(257);expect(view.detailsLeft).toBeGreaterThan(view.chartRight)
  expect(view.detailsHeight).toBeLessThanOrEqual(295);expect(view.footerTop).toBeLessThan(500);expect(view.rows).toBe(20)
  expect(view.controls).toEqual(['DIV','DIV','svg','DIV','DETAILS'])
  // Real saved view restoration used to collapse the upgraded default again.
  const choices=await page.evaluate(create=>{
   const surface=(0,eval)('('+create+')')(document.body),details=document.querySelector('.price-volume>details'),old=surface.snapshot()
   const control=old.controls.find(c=>c.tag==='DETAILS');control.open=false;delete control.defaultOpen
   surface.apply(old);const migrated=details.open
   details.open=false;const collapsed=surface.snapshot();details.open=true;surface.apply(collapsed)
   const chosen=details.open;surface.dispose();return {migrated,chosen}
  },createWorkbenchRefreshSurface.toString())
  expect(choices).toEqual({migrated:true,chosen:false})
 }finally{await page.close()}
},20000)
