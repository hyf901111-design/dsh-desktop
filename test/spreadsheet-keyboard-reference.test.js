import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('projects Shift + arrows from the native workbook into the chat and restores whole-workbook scope on collapse', async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import {mountSpreadsheet} from './src/preload/spreadsheet/view'
      import {blankWorkbook} from './src/shared/spreadsheet/workbook'
      import {installSpreadsheetReferences} from './scripts/lib/spreadsheet-inline-references.mjs'
      const sessionId='keyboard-reference',record={revision:1,workbook:blankWorkbook('book')}
      const shell={snapshot:{draft:'',draftRev:0,phase:'plain',occurrences:[]}}
      const sessions={list:{getSnapshot:()=>({current:sessionId}),subscribe:()=>()=>{}}}
      installSpreadsheetReferences({win:window,doc:document,sessions,getInput:()=>shell})
      mountSpreadsheet(document,{
        request:async method=>method==='load'?{owner:'test',generation:'1',editable:true,recent:[],record}:record,
        subscribe:()=>()=>{}
      })
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'chrome140',
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.svg': 'dataurl' },
    plugins: [{
      name: 'inline-css',
      setup(builder) {
        builder.onResolve({ filter: /\?raw$/ }, async args => ({
          path: (await builder.resolve(args.path.slice(0, -4), { resolveDir: args.resolveDir, kind: args.kind })).path,
          namespace: 'inline-css'
        }))
        builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({
          contents: await readFile(args.path, 'utf8'), loader: 'text'
        }))
      }
    }]
  })
  const playwright = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href) : await import('playwright')
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    page.setDefaultTimeout(5000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('http://127.0.0.1/spreadsheet-fixture', route => route.fulfill({ contentType: 'text/html',
      body: `<!doctype html><main data-odyssey-page="spreadsheet" style="position:fixed;inset:0 330px 0 0">
      <div data-ework-spreadsheet-view="keyboard-reference"></div></main>
      <aside data-research-composer-host style="position:fixed;inset:0 0 0 auto;width:320px">
        <div data-composer-card><div data-sheet-context-anchor>参考当前表格内容</div>
          <div><div data-input-backdrop></div><textarea data-odyssey-file-reference-session="keyboard-reference"></textarea></div>
        </div>
      </aside>` }))
    await page.goto('http://127.0.0.1/spreadsheet-fixture')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    expect(errors).toEqual([])
    const grid = page.locator('.ew-sheet-grid canvas:visible').first()
    const reference = page.locator('.ew-sheet-pending-reference')
    const wholeWorkbook = page.locator('[data-sheet-context-anchor]')
    await wholeWorkbook.waitFor()
    await grid.click({ position: { x: 65, y: 45 } })
    await page.keyboard.down('Shift')
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => reference.textContent({ timeout: 1000 })).toBe('Sheet1!A1:B1')
    expect(await wholeWorkbook.isVisible()).toBe(false)
    await page.keyboard.press('ArrowDown')
    await expect.poll(() => reference.textContent({ timeout: 1000 })).toBe('Sheet1!A1:B2')
    await page.keyboard.press('ArrowUp')
    await expect.poll(() => reference.textContent({ timeout: 1000 })).toBe('Sheet1!A1:B1')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.up('Shift')
    await wholeWorkbook.waitFor()
    expect(await reference.count()).toBe(0)
    expect(errors).toEqual([])
    await page.keyboard.press('Shift+ArrowRight')
    await reference.waitFor()
    await page.keyboard.press('ArrowRight')
    await wholeWorkbook.waitFor()
    expect(await reference.count()).toBe(0)
  } finally {
    await browser.close()
  }
}, 30000)
