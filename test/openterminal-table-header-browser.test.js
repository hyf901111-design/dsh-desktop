import {afterAll,beforeAll,expect,it} from 'vitest'
import {pathToFileURL} from 'node:url'
import {renderMarketArtifact} from '../packages/dsh-research-task-runtime/market-artifact.js'
import {WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'
import {installWorkbenchTableColumns} from '../packages/dsh-research-task-runtime/workbench-table-columns.js'

let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},15000)
afterAll(async()=>browser?.close())

async function fixture(){
 const artifact=renderMarketArtifact({version:1,type:'market',variant:'table',layoutProfile:'openterminal',title:'冻结列表头',asOf:'模拟数据 · 2026-10-19',columns:['证券名称','最新价（元）','涨跌幅（%）','成交量（万股）','成交额（亿元）','报价时间'],rows:[['长名称测试B','20','1.2%','1200','2.4','2026-10-19 15:00:00'],['长名称测试A','10','-1.2%','800','0.8','2026-10-19 15:00:00']]})
 const page=await browser.newPage({viewport:{width:420,height:330},reducedMotion:'reduce'})
 await page.setContent(artifact.html)
 // Preserve the real cascade layer, artifact controls and table runtime.
 await page.addStyleTag({content:WORKBENCH_PRESENTATION_CSS})
 await page.addScriptTag({content:'('+installWorkbenchTableColumns.toString()+')(document.body)'})
 return page
}

it('uses the same readable header palette for frozen and scrolling columns in all four modes',async()=>{
 const page=await fixture()
 const palettes={enterprise:{header:'rgb(30, 185, 225)',text:'rgb(255, 255, 255)',body:'rgb(255, 255, 255)',bodyText:'rgb(60, 60, 60)'},dark:{header:'rgb(36, 36, 43)',text:'rgb(232, 232, 237)',body:'rgb(21, 21, 24)',bodyText:'rgb(232, 232, 237)'},light:{header:'rgb(244, 244, 246)',text:'rgb(37, 37, 43)',body:'rgb(255, 255, 255)',bodyText:'rgb(37, 37, 43)'},openterminal:{header:'rgb(17, 17, 17)',text:'rgb(217, 217, 217)',body:'rgb(10, 10, 10)',bodyText:'rgb(217, 217, 217)'}}
 try{
  for(const mode of ['enterprise','dark','light','openterminal','enterprise']){
   await page.evaluate(mode=>document.documentElement.dataset.workbenchStyle=mode,mode)
   const values=await page.locator('thead th').evaluateAll(cells=>cells.map(cell=>({background:getComputedStyle(cell).backgroundColor,color:getComputedStyle(cell).color,buttonColor:getComputedStyle(cell.querySelector('button')).color})))
   for(const value of values)expect(value,mode).toEqual({background:palettes[mode].header,color:palettes[mode].text,buttonColor:palettes[mode].text})
   const body=await page.locator('tbody tr:first-child td:first-child').evaluate(cell=>({background:getComputedStyle(cell).backgroundColor,color:getComputedStyle(cell).color}))
   expect(body,mode).toEqual({background:palettes[mode].body,color:palettes[mode].bodyText})
  }
 }finally{await page.close()}
},15000)

it('keeps the first column frozen while horizontal scrolling, sorting and resizing remain usable',async()=>{
 const page=await fixture()
 try{
  await page.evaluate(()=>document.documentElement.dataset.workbenchStyle='enterprise')
  const wrap=page.locator('.market-table-wrap'),first=page.locator('thead th').nth(0),second=page.locator('thead th').nth(1)
  const geometry=async()=>({first:(await first.boundingBox()).x,second:(await second.boundingBox()).x})
  const before=await geometry()
  expect(await wrap.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(120)
  await wrap.evaluate(el=>el.scrollLeft=120)
  const after=await geometry()
  expect(Math.abs(after.first-before.first)).toBeLessThanOrEqual(1)
  expect(before.second-after.second).toBeGreaterThanOrEqual(119)
  await wrap.evaluate(el=>el.scrollLeft=0)
  await second.locator('button').click()
  expect(await page.locator('tbody tr:first-child td:first-child').textContent()).toBe('长名称测试A')
  const handle=first.locator('[data-workbench-column-resize="0"]'),width=Number(await handle.getAttribute('aria-valuenow'))
  await handle.focus();await page.keyboard.press('ArrowRight')
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBe(width+10)
  expect(await first.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(30, 185, 225)')
  expect(await first.evaluate(el=>getComputedStyle(el).position)).toBe('sticky')
  expect(await first.evaluate(el=>getComputedStyle(el).left)).toBe('0px')
  expect(await first.locator('button').textContent()).toBe('证券名称')
 }finally{await page.close()}
},15000)

it('shows sort direction without inflating headers or sorting while a column is dragged',async()=>{
 const page=await fixture()
 try{
  const header=page.locator('thead th').nth(1),button=header.locator('button')
  const arrow=()=>button.evaluate(el=>getComputedStyle(el,'::after').content)
  for(const mode of ['enterprise','dark','light','openterminal']){
   await page.evaluate(mode=>document.documentElement.dataset.workbenchStyle=mode,mode)
   expect(await arrow()).toBe('"↕"')
   expect((await header.boundingBox()).height).toBeLessThanOrEqual(28)
  }
  await button.click();expect(await arrow()).toBe('"↑"')
  expect(await page.locator('tbody tr:first-child td').nth(1).textContent()).toBe('10')
  await button.click();expect(await arrow()).toBe('"↓"')
  expect(await page.locator('tbody tr:first-child td').nth(1).textContent()).toBe('20')
  const handle=header.locator('[data-workbench-column-resize]'),box=await handle.boundingBox(),before=(await header.boundingBox()).width
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down()
  await page.mouse.move(box.x+box.width/2+45,box.y+box.height/2,{steps:5});await page.mouse.up()
  expect((await header.boundingBox()).width).toBeGreaterThan(before+35)
  expect(await header.getAttribute('aria-sort')).toBe('descending')
  await page.locator('thead th').first().locator('button').click()
  expect(await arrow()).toBe('"↕"')
 }finally{await page.close()}
},15000)
