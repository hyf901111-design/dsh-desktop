import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Use the actual stylesheet order. The newer universal input rule intentionally
// makes every composer opaque; only empty-home header and corner rules differ.
const shell = readFileSync('src/preload/shell-style.ts', 'utf8')
const imports = [...shell.matchAll(/import (\w+) from '(\.\/[^']+\.css)\?raw'/g)]
const order = shell.match(/style\.textContent = ([^\n]+)/)?.[1] ?? ''
const css = order.split('+').map(name => {
  if (name.trim() === 'desktopShellStyles') return shell.match(/const desktopShellStyles = `([\s\S]*?)`/)?.[1] ?? ''
  const entry = imports.find(match => match[1] === name.trim())
  if (!entry) throw new Error('Stylesheet order anchor drifted: ' + name)
  return readFileSync('src/preload/' + entry[2].slice(2), 'utf8')
}).join('\n')

let browser
beforeAll(async () => {
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
for (const dark of [false, true]) {
  it(`${dark ? 'dark' : 'light'} home material survives the full cascade and leaves reading surfaces intact`, async () => {
    const page = await browser.newPage()
    try {
      await page.route('**/*', route => route.abort())
      await page.setContent(`<style>${css}</style><body ${dark ? 'data-ds-dark-theme' : ''}><div data-odyssey-panel-right="closed"><main class="pI_x6G_centerCol"><section class="wSkVaW_root" data-odyssey-page="home"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="true" data-odyssey-header-layout="regular"></header><div class="uV2eYG_card"></div></section></main><aside class="sRp_composer"><div class="uV2eYG_card"></div></aside></div></body>`)
      const results = await page.evaluate(() => {
        const main = document.querySelector('main'), root = document.querySelector('section'), card = root.querySelector('.uV2eYG_card'), header = root.querySelector('header')
        const measure = () => ({ color: getComputedStyle(card).backgroundColor, blur: getComputedStyle(card).backdropFilter, headerBlur: getComputedStyle(header).backdropFilter, radius: getComputedStyle(main).borderRadius })
        const home = measure()
        document.querySelector('[data-odyssey-panel-right]').setAttribute('data-odyssey-panel-right', 'open')
        const openRadius = measure().radius
        const reading = ['conversation', 'research'].map(page => { root.setAttribute('data-odyssey-page', page); return measure() })
        return { home, openRadius, reading, sideColor: getComputedStyle(document.querySelector('aside .uV2eYG_card')).backgroundColor }
      })
      expect(results.home).toEqual({ color: dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)', blur: 'none', headerBlur: 'none', radius: '12px' })
      expect(results.openRadius).toBe('16px')
      for (const reading of results.reading) expect(reading).toEqual({ color: dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)', blur: 'none', headerBlur: 'blur(32px)', radius: '16px' })
      expect(results.sideColor).toBe(dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)')
    } finally { await page.close() }
  })
}
