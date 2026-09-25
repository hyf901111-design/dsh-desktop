import { afterAll, beforeAll, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

let browser
beforeAll(async () => {
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(pathToFileURL(runtime).href)
  browser = await chromium.launch({ executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => browser?.close())

for (const dark of [false, true]) it(`clips ${dark ? 'dark' : 'light'} research header glass at both top corners`, async () => {
  const page = await browser.newPage()
  try {
    const styles = await Promise.all(['figma-final-shell.css', 'figma-refinements.css'].map(name => readFile(`src/preload/${name}`, 'utf8')))
    await page.setContent(`<style>${styles.join('\n')}</style><body ${dark ? 'data-ds-dark-theme' : ''}>
      <main class="pI_x6G_centerCol" style="width:740px;height:880px">
        <div class="wSkVaW_root" data-odyssey-page="research" style="height:100%">
          <header class="wSkVaW_header" data-srb-session-header>研究画布</header>
        </div>
      </main></body>`)
    const result = await page.locator('header').evaluate(header => {
      const surface = getComputedStyle(header), blur = getComputedStyle(header, '::before')
      return { radius: surface.borderRadius, clip: surface.clipPath, gradient: surface.backgroundImage,
        blurRadius: blur.borderRadius, blurMask: blur.maskImage, blurFilter: blur.backdropFilter }
    })
    expect(result.radius).toBe('16px 16px 0px 0px')
    expect(result.clip).toBe('inset(0px round 16px 16px 0px 0px)')
    expect(result.gradient).toContain('linear-gradient')
    expect(result.blurRadius).toBe('16px 16px 0px 0px')
    expect(result.blurMask).toContain('linear-gradient')
    expect(result.blurFilter).toBe('blur(8px)')
  } finally { await page.close() }
})
