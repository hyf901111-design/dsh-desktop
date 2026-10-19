import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')
let browser, shellScript, splash

beforeAll(async () => {
  const raw = { name: 'raw-css', setup(b) {
    b.onResolve({ filter: /\.css\?raw$/ }, a => ({ path: a.path.startsWith('.') ? resolve(a.resolveDir, a.path.slice(0, -4)) : require.resolve(a.path.slice(0, -4)), namespace: 'raw' }))
    b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
  } }
  const output = await build({ stdin: { contents: "import {mountDesktopShellStyles} from './src/preload/shell-style';mountDesktopShellStyles(document)", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', plugins: [raw] })
  shellScript = output.outputFiles[0].text
  const logo = await readFile('build/sherlock-logo.svg')
  splash = (await readFile('build/splash.html', 'utf8')).replaceAll('src="sherlock-logo.svg"', `src="data:image/svg+xml;base64,${logo.toString('base64')}"`)
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(pathToFileURL(runtime).href)
  browser = await chromium.launch({ executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => browser?.close())

it('keeps the startup logo readable when desktop shell initialization runs in either theme', async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 375 }, reducedMotion: 'reduce' })
  try {
    await page.setContent(splash)
    await page.addScriptTag({ content: shellScript })
    for (const colorScheme of ['light', 'dark', 'light']) {
      await page.emulateMedia({ colorScheme })
      const dark = colorScheme === 'dark'
      const pixels = PNG.sync.read(await page.locator('.logo-stage').screenshot())
      let foreground = 0, background = 0
      for (let i = 0; i < pixels.data.length; i += 4) {
        const brightness = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3
        if (dark ? brightness > 200 : brightness < 55) foreground++
        if (dark ? brightness < 55 : brightness > 200) background++
      }
      expect(foreground, `${colorScheme}: visible logo pixels`).toBeGreaterThan(400)
      expect(background, `${colorScheme}: contrasting backdrop pixels`).toBeGreaterThan(1000)
      expect(await page.locator('#status').textContent()).toBe('Starting…')
    }
  } finally { await page.close() }
})

it('still applies the desktop shell background to the loaded main page', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent('<main class="pI_x6G_centerCol">EWork Odyssey</main>')
    await page.addScriptTag({ content: shellScript })
    const background = () => page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor)
    expect(await background()).toBe('rgb(242, 242, 242)')
    await page.locator('body').evaluate(el => el.setAttribute('data-ds-dark-theme', ''))
    expect(await background()).toBe('rgb(31, 31, 31)')
  } finally { await page.close() }
})
