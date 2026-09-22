import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { Window } from 'happy-dom'
import { createOfficeSpreadsheetTheme } from '../scripts/lib/office-spreadsheet-theme.mjs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { patchSherlockOfficePreviewClient } from '../scripts/lib/patch-sherlock-office-preview.mjs'
import { patchPptxResize, stripPptxResizePatch } from '../scripts/lib/pptx-resize-settle.mjs'

let browser, bootstrap, client
beforeAll(async () => {
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
  bootstrap = (await build({ stdin: { contents: `import * as r from 'react';import * as d from 'react-dom';import * as c from 'react-dom/client';import * as j from 'react/jsx-runtime';window.req=id=>({'react':r,'react-dom':d,'react-dom/client':c,'react/jsx-runtime':j,util:{}}[id]);`, resolveDir: process.cwd() }, bundle: true, write: false, platform: 'browser', format: 'iife' })).outputFiles[0].text
  client = patchPptxResize(patchSherlockOfficePreviewClient(stripPptxResizePatch(readFileSync('build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js', 'utf8'))))
  // Instrument the actual installed engine, never replace createUniver or its renderer.
  client = client.replace('univerRef.current = univer;', `univerRef.current = univer; window.engineCreations=(window.engineCreations||0)+1; window.testEngine={univer,api:univerAPI,engine:{...univerCore,...spreadsheetEngine}};
    workbookData.sheets['sheet-0'].cellData[0][1].s={bg:{rgb:'#FFFFFF'},cl:{rgb:'#000000'}};
    workbookData.sheets['sheet-0'].cellData[0][2].s={bg:{rgb:'#ED7D31'},cl:{rgb:'#123456'}};`)
  client = client.replace('\t\treturn module.exports;\n\t}', `\t\texports.fixture=()=>{const x=require_xlsx_full_min();const w=x.utils.book_new();x.utils.book_append_sheet(w,x.utils.aoa_to_sheet([['Default','White','Color'],[1,2,3]]),'Data');return x.write(w,{type:'array',bookType:'xlsx'});};\n\t\treturn module.exports;\n\t}`)
})
afterAll(async () => { await browser?.close() })
async function open(dark) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
  page.errors = []
  page.on('pageerror', error => page.errors.push(error.message))
  await page.route('**/*', route => route.abort())
  await page.setContent(`<style>html,body,#root{margin:0;width:100%;height:100%} [aria-label="theme.xlsx"]{height:100%}</style><body ${dark ? 'data-ds-dark-theme' : ''}><div id="root"></div></body>`)
  await page.addScriptTag({ content: bootstrap })
  await page.addScriptTag({ content: 'window.__ModuleLoader__={load:d=>window.office=d.factory(window.req)};window.fileRequests=[];' })
  await page.addScriptTag({ content: client })
  await page.evaluate(() => {
    const bytes = office.fixture(); window.fileBytes = Array.from(new Uint8Array(bytes))
    window.fetch = async (url, options) => { fileRequests.push({ url, method: options?.method ?? 'GET' }); return new Response(bytes) }
    window.root = req('react-dom/client').createRoot(document.querySelector('#root'))
    root.render(office.officePreviewService.Component({ sourceUrl: 'sherlock-preview://theme_fixture/', kind: 'xlsx', title: 'theme.xlsx' }))
  })
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 3 && window.testEngine?.api.getActiveWorkbook()?.getActiveSheet())
  await page.waitForTimeout(150)
  return page
}
async function snapshot(page) {
  return page.evaluate(() => {
    const api = testEngine.api, wb = api.getActiveWorkbook(), sheet = wb.getActiveSheet()
    const canvas = [...document.querySelectorAll('canvas')].sort((a,b) => b.width*b.height-a.width*a.height)[0]
    const context = canvas.getContext('2d'), pixel = (x,y) => [...context.getImageData(x,y,1,1).data]
    const textPixels = context.getImageData(48,21,85,20).data
    const textColor = document.body.hasAttribute('data-ds-dark-theme') ? 229 : 43
    let foregroundPixels = 0
    for (let i=0;i<textPixels.length;i+=4) if(textPixels[i]===textColor && textPixels[i+1]===textColor && textPixels[i+2]===textColor && textPixels[i+3]===255) foregroundPixels++
    return { foregroundPixels, creations: engineCreations, dark: document.documentElement.classList.contains('univer-dark'), workbook: wb.getId(), data: wb.save(),
      selection: sheet.getActiveRange()?.getRange(), background: getComputedStyle(canvas.parentElement).backgroundColor,
      // Actual converter uses 46px header, 96px columns, 20px column header, 22px rows.
      white: pixel(46+96+80,20+10), color: pixel(46+192+80,20+10), header: pixel(46+96+80,10), grid: pixel(46+96,20+22+10),
      requests: fileRequests, bytes: fileBytes }
  })
}
for (const initialDark of [false,true]) it(`actual bundled XLSX retains its workbook, selection and explicit colors through ${initialDark ? 'dark-light-dark' : 'light-dark-light'}`, async () => {
  const page = await open(initialDark)
  try {
    await page.evaluate(() => testEngine.api.getActiveWorkbook().getActiveSheet().setActiveRange(testEngine.api.getActiveWorkbook().getActiveSheet().getRange('D4')))
    const initial = await snapshot(page)
    expect(initial.selection).toMatchObject({startRow:3,endRow:3,startColumn:3,endColumn:3})
    expect(initial.data.sheets['sheet-0'].cellData[0][0].v).toBe('Default')
    expect(initial.data.sheets['sheet-0'].cellData[0][0].s).toBeUndefined()
    for (const dark of [initialDark, !initialDark, initialDark]) {
      await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme',dark), dark)
      await page.waitForTimeout(150)
      const current = await snapshot(page)
      expect(current.dark).toBe(dark)
      expect(current.foregroundPixels).toBeGreaterThan(5)
      expect(current.creations).toBe(1)
      expect(current.background).toBe(dark ? 'rgb(51, 51, 51)' : 'rgb(255, 255, 255)')
      expect(current.white).toEqual([255,255,255,255])
      expect(current.color).toEqual([237,125,49,255])
      expect(current.header).toEqual(dark ? [57,57,57,255] : [230,230,230,255])
      expect(current.grid.slice(0,3)).toEqual(dark ? [66,66,66] : [225,225,225])
      expect(current.data).toEqual(initial.data)
      expect(current.selection).toEqual(initial.selection)
      expect(current.bytes).toEqual(initial.bytes)
      expect(current.requests).toEqual([{url:'sherlock-preview://theme_fixture/',method:'GET'}])
      if (process.env.SHERLOCK_OFFICE_THEME_EVIDENCE) await page.screenshot({path: process.env.SHERLOCK_OFFICE_THEME_EVIDENCE + '/d55-engine-' + (dark ? 'dark' : 'light') + '.png'})
    }
    await page.evaluate(() => root.unmount())
    await page.waitForTimeout(100)
    expect(await page.locator('canvas').count()).toBe(0)
    expect(page.errors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.classList.contains('univer-dark'))).toBe(false)
    await page.evaluate(() => document.body.toggleAttribute('data-ds-dark-theme'))
    await page.waitForTimeout(30)
    expect(await page.evaluate(() => document.documentElement.classList.contains('univer-dark'))).toBe(false)
  } finally { await page.close() }
}, 20000)

it('keeps another live XLSX dark when one preview closes and clears ownership after the last closes', async () => {
  const page = await open(true)
  try {
    await page.evaluate(() => {
      const host = document.createElement('div'); host.style.cssText='width:700px;height:600px'; document.body.appendChild(host)
      window.secondRoot = req('react-dom/client').createRoot(host)
      secondRoot.render(office.officePreviewService.Component({sourceUrl:'sherlock-preview://theme_fixture_second/',kind:'xlsx',title:'theme.xlsx'}))
    })
    await page.waitForFunction(() => engineCreations===2 && document.querySelectorAll('canvas').length>=6)
    await page.waitForTimeout(150)
    await page.evaluate(() => root.unmount())
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => document.documentElement.classList.contains('univer-dark'))).toBe(true)
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => document.documentElement.classList.contains('univer-dark'))).toBe(false)
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme',''))
    await page.waitForTimeout(100)
    expect(await page.evaluate(() => document.documentElement.classList.contains('univer-dark'))).toBe(true)
    await page.evaluate(() => secondRoot.unmount())
    await page.waitForTimeout(100)
    expect(await page.locator('canvas').count()).toBe(0)
    expect(await page.evaluate(() => document.documentElement.classList.contains('univer-dark'))).toBe(false)
    expect(page.errors).toEqual([])
  } finally { await page.close() }
},20000)

it('releases ownership and the engine even if a theme subscription cleanup fails', async () => {
  const win = new Window(), host = win.document.createElement('div')
  win.document.body.appendChild(host)
  const failure = new Error('subscription cleanup failed')
  const calls = []
  const engine = {Plugin:class{},Inject:()=>()=>{},Injector:Symbol(),defaultTheme:{gray:{}},SheetInterceptorService:Symbol(),IRenderManagerService:Symbol(),ThemeService:Symbol(),INTERCEPTOR_POINT:{CELL_CONTENT:'cell'},InterceptorEffectEnum:{Style:1}}
  const manager = {created$:{subscribe:()=>({unsubscribe(){calls.push('created')}})},getRenderAll:()=>new Map(),getRenderById:()=>null}
  const services = new Map([[engine.SheetInterceptorService,{intercept:()=>({dispose(){calls.push('interceptor');throw failure}})}],[engine.IRenderManagerService,manager],[engine.ThemeService,{setTheme(){}}]])
  const theme = createOfficeSpreadsheetTheme(engine,host)
  theme.setEngine({__getInjector:()=>({get:key=>services.get(key)}),dispose(){calls.push('engine')}})
  theme.bind({toggleDarkMode(){calls.push('theme')}},{getId:()=> 'test'})
  win.document.documentElement.classList.add('univer-dark')
  expect(()=>theme.dispose()).toThrow(failure)
  expect(calls).toEqual(['theme','interceptor','created','engine'])
  expect(win.document.documentElement.classList.contains('univer-dark')).toBe(false)
  expect(createOfficeSpreadsheetTheme.owners.has(win.document)).toBe(false)
  theme.dispose()
  win.document.body.setAttribute('data-ds-dark-theme','')
  await win.happyDOM.whenAsyncComplete()
  expect(calls).toEqual(['theme','interceptor','created','engine'])
})
