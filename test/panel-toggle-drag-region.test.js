import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
let browser, script
beforeAll(async () => {
  const result = await build({ stdin: { contents: "import {mountDesktopShellStyles} from './src/preload/shell-style'; mountDesktopShellStyles(document)", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', write: false,
    plugins: [{ name: 'styles', setup(b) {
      b.onResolve({ filter: /\?raw$/ }, a => ({ path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: 'raw' }))
      b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
    } }] })
  script = result.outputFiles[0].text
  const { chromium } = await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => browser?.close())
it.each(['home', 'research'])('keeps the portaled panel button clickable over the %s drag header', async view => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<div data-odyssey-page="${view}"><header class="wSkVaW_header"><button>对话</button></header></div><div data-dsh-panel-host data-odyssey-panel-right="closed"><div class="t8lSSG_toggleCluster"><button data-odyssey-panel-entry="right">展开侧边栏</button></div></div>`)
    await page.addScriptTag({ content: script })
    expect(await page.locator('header').evaluate(e => getComputedStyle(e).webkitAppRegion)).toBe('drag')
    for (const selector of ['header button', '.t8lSSG_toggleCluster', '[data-odyssey-panel-entry]']) {
      expect(await page.locator(selector).evaluate(e => getComputedStyle(e).webkitAppRegion)).toBe('no-drag')
    }
    expect(await page.locator('[data-odyssey-panel-entry]').evaluate(e => e.closest('header'))).toBeNull()
  } finally { await page.close() }
})
