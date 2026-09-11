// Focused Chromium regression for Figma panel geometry and responsive fog.
// It loads the production panel styles/assets in a controlled DOM fixture;
// packaged-client validation remains a separate integration step.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')
const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH
  || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
const playwright = await import(playwrightPath)
const chromium = playwright.chromium ?? playwright.default?.chromium
const chromeOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { executablePath: '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' }

const assetNames = [
  'figma-glass-light-base.png',
  'figma-glass-light-mesh.png',
  'figma-glass-dark-base.png',
  'figma-glass-dark-mesh.png',
  'figma-glass-dark-overlay.png'
]

const embedAssets = async source => {
  let css = source
  for (const name of assetNames) {
    const png = await readFile(resolve('build/brand', name))
    css = css.replaceAll(`/${name}`, `data:image/png;base64,${png.toString('base64')}`)
  }
  return css
}

const finalCss = await embedAssets(await readFile('src/preload/figma-final-shell.css', 'utf8'))
const panelCss = await readFile('src/preload/figma-panels.css', 'utf8')

const fixture = ({ pageKind, sidebarCollapsed, panelWidth = 340, panelHeight = 856, dark = false, bottom = false }) => {
  const viewportHeight = panelHeight + 44
  return {
    viewport: { width: 1380, height: viewportHeight },
    html: `<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing:border-box; }
      html,body,#root { width:100%; height:100%; margin:0; overflow:hidden; }
      body { background:#ff00ff; --dsh-sidebar-width:${panelWidth}px; --dsh-sidebar-height:${bottom ? 220 : 0}px; }
      [data-dsh-panel-host] { position:absolute; inset:0; }
      .t8lSSG_panel { position:absolute; width:var(--dsh-sidebar-width); }
      .t8lSSG_toggleCluster { position:absolute; display:flex; width:92px; height:28px; }
      .t8lSSG_bottomPanel { position:absolute; left:80px; height:204px; }
      .t8lSSG_bottomClose { position:absolute; width:28px; height:28px; top:3px; right:6px; padding:0; border:0; }
      .t8lSSG_bottomClose svg { width:14px; height:14px; }
    </style><style>${finalCss}</style><style>${panelCss}</style></head>
    <body${dark ? ' data-ds-dark-theme' : ''}>
      <div id="root">
        <main data-dsh-frame data-sidebar-collapsed="${sidebarCollapsed}">
          <section data-odyssey-page="${pageKind}"></section>
        </main>
      </div>
      <div data-dsh-panel-host data-odyssey-panel-right="open" data-odyssey-panel-bottom="${bottom ? 'open' : 'closed'}">
        <aside class="t8lSSG_panel"><div class="t8lSSG_tabBar"></div></aside>
        <div class="t8lSSG_toggleCluster">
          <button data-odyssey-panel-entry="bottom" aria-expanded="${bottom}"></button>
          <button data-odyssey-panel-entry="right" aria-expanded="true"></button>
        </div>
        ${bottom ? '<section class="t8lSSG_bottomPanel"><button class="t8lSSG_bottomClose"><svg viewBox="0 0 16 16"></svg></button></section>' : ''}
      </div>
    </body></html>`
  }
}

const close = (actual, expected, label, tolerance = 0.05) => {
  assert(Math.abs(actual - expected) < tolerance, `${label}: ${actual} != ${expected}`)
}

const sampleChroma = (buffer, rect, edges) => {
  const png = PNG.sync.read(buffer)
  const colors = []
  const read = (x, y) => {
    const offset = (y * png.width + x) * 4
    return [png.data[offset], png.data[offset + 1], png.data[offset + 2]]
  }
  for (let step = 0; step < 80; step += 1) {
    const x = Math.round(rect.x + 8 + (rect.width - 17) * step / 79)
    const y = Math.round(rect.y + 52 + (rect.height - 61) * step / 79)
    if (edges.includes('right')) colors.push(read(Math.round(rect.x + rect.width - 5), y))
    if (edges.includes('bottom')) colors.push(read(x, Math.round(rect.y + rect.height - 5)))
  }
  return Math.max(...colors.map(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b)))
}

const browser = await chromium.launch(chromeOptions)
try {
  for (const pageKind of ['conversation', 'research']) {
    for (const sidebarCollapsed of [false, true]) {
      const setup = fixture({ pageKind, sidebarCollapsed })
      const context = await browser.newContext({ viewport: setup.viewport, deviceScaleFactor: 1 })
      const page = await context.newPage()
      await page.setContent(setup.html, { waitUntil: 'load' })
      const geometry = await page.evaluate(() => ({
        panel: document.querySelector('.t8lSSG_panel').getBoundingClientRect().toJSON(),
        controls: document.querySelector('.t8lSSG_toggleCluster').getBoundingClientRect().toJSON()
      }))
      const expectedRight = pageKind === 'conversation' ? 20 : 24
      close(geometry.panel.x, 1380 - expectedRight - 340, `${pageKind}/${sidebarCollapsed} panel x`)
      close(geometry.controls.x, 1380 - expectedRight - 8 - 92, `${pageKind}/${sidebarCollapsed} controls x`)
      await context.close()
    }
  }

  {
    const setup = fixture({ pageKind: 'conversation', sidebarCollapsed: true, dark: true, bottom: true })
    const context = await browser.newContext({ viewport: setup.viewport, deviceScaleFactor: 1, colorScheme: 'dark' })
    const page = await context.newPage()
    await page.setContent(setup.html, { waitUntil: 'load' })
    const bottom = await page.evaluate(() => {
      const panel = document.querySelector('.t8lSSG_bottomPanel').getBoundingClientRect()
      const closeButton = document.querySelector('.t8lSSG_bottomClose').getBoundingClientRect()
      const glyph = document.querySelector('.t8lSSG_bottomClose svg').getBoundingClientRect()
      const active = getComputedStyle(document.querySelector('[data-odyssey-panel-entry="bottom"]')).backgroundColor
      return {
        panel: panel.toJSON(),
        close: closeButton.toJSON(),
        glyph: glyph.toJSON(),
        active
      }
    })
    close(bottom.panel.x, 92, 'bottom panel x')
    close(bottom.panel.y, 674, 'bottom panel y')
    close(bottom.panel.width, 904, 'bottom panel width')
    close(bottom.close.x - bottom.panel.x, 864, 'bottom close local x')
    close(bottom.close.y - bottom.panel.y, 6, 'bottom close local y')
    close(bottom.glyph.width, 16, 'bottom glyph width')
    close(bottom.glyph.height, 16, 'bottom glyph height')
    assert.equal(bottom.active, 'rgba(255, 255, 255, 0.12)')
    await context.close()
  }

  for (const dark of [false, true]) {
    for (const panelWidth of [340, 400]) {
      for (const panelHeight of [856, 1100]) {
        const setup = fixture({ pageKind: 'research', sidebarCollapsed: false, panelWidth, panelHeight, dark })
        const context = await browser.newContext({ viewport: setup.viewport, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' })
        const page = await context.newPage()
        await page.setContent(setup.html, { waitUntil: 'load' })
        await page.evaluate(() => document.fonts.ready)
        const rect = await page.evaluate(() => document.querySelector('.t8lSSG_panel').getBoundingClientRect().toJSON())
        const screenshot = await page.screenshot()
        const maxChroma = sampleChroma(screenshot, rect, ['right', 'bottom'])
        // The translucent glass tint contributes up to seven RGB levels even
        // over the grayscale fog. Exposed base pixels in the legacy crop reach
        // 19 at 400 px wide and 94 in the tall fixture.
        assert(maxChroma <= 8, `${dark ? 'dark' : 'light'} ${panelWidth}x${panelHeight} panel edge chroma ${maxChroma}`)
        await context.close()
      }
    }
  }

  console.log('Figma panel geometry and responsive fog passed in controlled Chromium')
} finally {
  await browser.close()
}
