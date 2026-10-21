import {afterAll,beforeAll,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {pathToFileURL} from 'node:url'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {WORKBENCH_PRESENTATION_CSS} from '../packages/dsh-research-task-runtime/workbench-presentation.js'
import {installWorkbenchTableColumns} from '../packages/dsh-research-task-runtime/workbench-table-columns.js'

// A frozen observed response in a new headless browser; no client/CDP or tools.
const observed=JSON.parse(readFileSync(new URL('./fixtures/workbench-quote-13-columns.json',import.meta.url),'utf8'))
let browser
beforeAll(async()=>{
 const pw=await import(/* @vite-ignore */pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT||'/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
 browser=await (pw.chromium||pw.default.chromium).launch({headless:true,executablePath:process.env.SHERLOCK_TEST_CHROMIUM||'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
},15000)
afterAll(async()=>browser?.close())

it.each([[420,'light'],[420,'dark'],[1100,'light'],[1100,'dark']])('shows every quote field and keeps table interaction bounded at %i px in %s theme',async(width,theme)=>{
 const accepted=acceptArtifactOutput(JSON.stringify(observed))
 expect(accepted).toBeDefined()
 const artifact=JSON.parse(accepted),page=await browser.newPage({viewport:{width,height:600},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 try{
  await page.setContent(artifact.html)
  await page.addStyleTag({content:WORKBENCH_PRESENTATION_CSS})
  await page.evaluate(theme=>{document.documentElement.dataset.sherlockTheme=theme;document.documentElement.dataset.workbenchStyle=theme},theme)
  await page.addScriptTag({content:'('+installWorkbenchTableColumns.toString()+')(document.body)'})
  const wrap=page.locator('.market-table-wrap'),cells=page.locator('tbody tr:first-child td'),headers=page.locator('thead th')
  expect(await cells.allTextContents()).toEqual(observed.rows[0])
  expect(await headers.locator('button').allTextContents()).toEqual(observed.columns)
  const first=await cells.first().boundingBox()
  expect(first.y).toBeGreaterThanOrEqual(0);expect(first.y+first.height).toBeLessThan(600)
  expect(await page.locator('tbody td,thead th').evaluateAll(items=>items.every(el=>getComputedStyle(el).whiteSpace==='nowrap'))).toBe(true)
  expect(await wrap.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeGreaterThan(100)
  await wrap.evaluate(el=>el.scrollLeft=el.scrollWidth)
  const last=await cells.last().boundingBox(),bounds=await wrap.boundingBox()
  expect(last.x).toBeGreaterThanOrEqual(bounds.x-1);expect(last.x+last.width).toBeLessThanOrEqual(bounds.x+bounds.width+1)
  // Only the table contents scroll horizontally; sources and search stay local.
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  for(const selector of ['.terminal-table-toolbar','.market-footer','.terminal-table-readout']){
   const box=await page.locator(selector).boundingBox()
   expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width)
  }
  expect(await page.locator('.market-footer').textContent()).toContain(observed.note)
  await page.screenshot({path:`/tmp/workbench-quote-wide-table-${width}-${theme}.png`,fullPage:true})
  const search=page.getByRole('searchbox',{name:'搜索行情'})
  await search.fill('新易盛')
  expect(await page.locator('tbody tr:visible').count()).toBe(1)
  expect(await page.locator('tbody tr:visible td').allTextContents()).toEqual(observed.rows[1])
  await search.fill('');await wrap.evaluate(el=>el.scrollLeft=0)
  await headers.first().locator('button').click()
  expect(await page.locator('tbody tr:first-child td:first-child').textContent()).toBe('000300（sh000300）')
  await headers.first().locator('button').click()
  expect(await page.locator('tbody tr:first-child td:first-child').textContent()).toBe('601138（sh601138）')
  const firstHandle=headers.first().locator('[data-workbench-column-resize="0"]'),initial=Number(await firstHandle.getAttribute('aria-valuenow'))
  await firstHandle.focus();await page.keyboard.press('ArrowRight')
  expect(Number(await firstHandle.getAttribute('aria-valuenow'))).toBe(initial+10)
  const handle=headers.last().locator('[data-workbench-column-resize="12"]')
  await wrap.evaluate(el=>el.scrollLeft=el.scrollWidth)
  const handleBox=await handle.boundingBox(),oldWidth=Number(await handle.getAttribute('aria-valuenow'))
  await page.mouse.move(handleBox.x+handleBox.width/2,handleBox.y+handleBox.height/2)
  await page.mouse.down();await page.mouse.move(handleBox.x+handleBox.width/2-(oldWidth-90),handleBox.y+handleBox.height/2,{steps:5});await page.mouse.up()
  expect(Number(await handle.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(91)
  expect(await cells.last().getAttribute('data-column-wrap')).toBe('true')
  expect(await cells.last().evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('normal')
  expect((await cells.last().boundingBox()).height).toBeGreaterThan(36)
  expect(await cells.nth(1).evaluate(el=>getComputedStyle(el).whiteSpace)).toBe('nowrap')
  expect(await page.locator('tbody tr').evaluateAll(rows=>rows.map(row=>[...row.cells].map(cell=>cell.textContent)))).toEqual([observed.rows[2],observed.rows[1],observed.rows[0],observed.rows[3]])
  expect(errors).toEqual([])
 }finally{await page.close()}
},15000)
