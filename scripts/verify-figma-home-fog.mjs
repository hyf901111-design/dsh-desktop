// Focused Chromium regression for the responsive, grayscale home fog layer.
// This controlled fixture mirrors the vendor shell's center-column geometry and
// never launches or modifies the packaged application.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { PNG } = require('pngjs')
const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH
  || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
const playwright = await import(playwrightPath)
const chromium = playwright.chromium ?? playwright.default?.chromium

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1)
const cssPath = resolve(arg('--css') || 'src/preload/figma-home.css')
const expectRegression = process.argv.includes('--expect-regression')
const outputRoot = resolve(arg('--output') || 'output/figma-full-acceptance/home-fog-regression')
const runLabel = expectRegression ? 'legacy' : 'current'
const output = join(outputRoot, runLabel)
const viewports = [
  { width: 1380, height: 900 },
  { width: 1583, height: 926 },
  { width: 1920, height: 1080 },
  { width: 1000, height: 1300 }
]
const sampleTimes = [0, 6, 12, 18]
const themes = ['light', 'dark']
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
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`
    css = css.replaceAll(`/${name}`, dataUrl)
  }
  return css
}

const sourceCss = await embedAssets(await readFile(cssPath, 'utf8'))
const chromeOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : {
      executablePath: '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
    }

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
const browser = await chromium.launch(chromeOptions)
const results = []
const errors = []

const fixture = (theme, css) => `<!doctype html>
<html data-odyssey-home-motion="running">
<head><meta charset="utf-8"><style>
  * { box-sizing:border-box; }
  html,body { width:100%; height:100%; margin:0; overflow:hidden; }
  body { background:#ddd; }
  .vendor-frame { width:calc(100vw - 12px); height:100vh; display:grid; grid-template-columns:280px minmax(0,1fr); }
  .vendor-sidebar { width:280px; height:100%; background:#e8e8e8; }
  [data-ds-dark-theme] .vendor-sidebar { background:#111; }
  .pI_x6G_centerCol { position:relative; isolation:isolate; min-width:0; height:calc(100vh - 20px); margin-block:10px; overflow:hidden; }
  .wSkVaW_root { position:absolute; inset:0; }
  .vendor-foreground { position:absolute; left:50%; bottom:32px; width:min(640px,calc(100% - 48px)); height:126px; transform:translateX(-50%); border-radius:10.5px; background:rgb(255 255 255 / .49); }
  [data-ds-dark-theme] .vendor-foreground { background:rgb(0 0 0 / .49); }
</style><style>${css}</style><style>
  /* Pause at deterministic offsets while retaining Chromium's real keyframe interpolation. */
  html[data-sample-time] .pI_x6G_centerCol::before {
    animation-delay:calc(var(--sample-time) * -1s) !important;
    animation-play-state:paused !important;
  }
</style></head>
<body${theme === 'dark' ? ' data-ds-dark-theme' : ''}>
  <div class="vendor-frame">
    <nav class="vendor-sidebar"></nav>
    <main class="pI_x6G_centerCol">
      <section class="wSkVaW_root" data-odyssey-page="home">
        <div class="vendor-foreground" data-foreground></div>
      </section>
    </main>
  </div>
</body></html>`

const imageStats = (buffer, rect) => {
  const png = PNG.sync.read(buffer)
  const x0 = Math.round(rect.x)
  const y0 = Math.round(rect.y)
  const width = Math.round(rect.width)
  const height = Math.round(rect.height)
  const edgePixels = []
  const steps = 96
  const read = (x, y) => {
    const offset = (y * png.width + x) * 4
    return [png.data[offset], png.data[offset + 1], png.data[offset + 2]]
  }
  for (let index = 0; index < steps; index += 1) {
    const horizontal = x0 + 20 + Math.round((width - 41) * index / (steps - 1))
    const vertical = y0 + 20 + Math.round((height - 41) * index / (steps - 1))
    for (const inset of [1, 2, 3]) {
      edgePixels.push(read(horizontal, y0 + inset))
      edgePixels.push(read(horizontal, y0 + height - 1 - inset))
      edgePixels.push(read(x0 + inset, vertical))
      edgePixels.push(read(x0 + width - 1 - inset, vertical))
    }
  }
  const chroma = edgePixels.map(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b))
  const magenta = edgePixels.filter(([r, g, b]) => r > 220 && b > 220 && g < 40).length
  return {
    sampled: edgePixels.length,
    maxChroma: Math.max(...chroma),
    colorfulPixels: chroma.filter(value => value > 1).length,
    magentaPixels: magenta
  }
}

const rectClose = (actual, expected, message) => {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(actual[key] - expected[key]) < 0.05, `${message}: ${key} ${actual[key]} != ${expected[key]}`)
  }
}

try {
  for (const viewport of viewports) {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme })
      const page = await context.newPage()
      page.on('pageerror', error => errors.push(error.message))
      await page.setContent(fixture(theme, sourceCss), { waitUntil: 'load' })
      const layout = await page.evaluate(() => {
        const center = document.querySelector('.pI_x6G_centerCol')
        const foreground = document.querySelector('[data-foreground]')
        return {
          center: center.getBoundingClientRect().toJSON(),
          foreground: foreground.getBoundingClientRect().toJSON(),
          containerType: getComputedStyle(center).containerType
        }
      })
      const expectedCenter = { x: 280, y: 10, width: viewport.width - 292, height: viewport.height - 20 }
      rectClose(layout.center, expectedCenter, `${viewport.width}x${viewport.height} ${theme} vendor center`)
      assert.equal(layout.containerType, expectRegression ? 'normal' : 'size')
      const foregroundAtStart = layout.foreground
      const transforms = []

      for (const seconds of sampleTimes) {
        await page.evaluate(seconds => {
          document.documentElement.dataset.sampleTime = String(seconds)
          document.documentElement.style.setProperty('--sample-time', String(seconds))
        }, seconds)
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const geometry = await page.evaluate(() => ({
          center: document.querySelector('.pI_x6G_centerCol').getBoundingClientRect().toJSON(),
          foreground: document.querySelector('[data-foreground]').getBoundingClientRect().toJSON(),
          fog: {
            width: getComputedStyle(document.querySelector('.pI_x6G_centerCol'), '::before').width,
            height: getComputedStyle(document.querySelector('.pI_x6G_centerCol'), '::before').height,
            transform: getComputedStyle(document.querySelector('.pI_x6G_centerCol'), '::before').transform
          }
        }))
        rectClose(geometry.center, expectedCenter, `${viewport.width}x${viewport.height} ${theme} ${seconds}s center`)
        rectClose(geometry.foreground, foregroundAtStart, `${viewport.width}x${viewport.height} ${theme} ${seconds}s foreground`)
        transforms.push(geometry.fog.transform)
        if (!expectRegression) {
          const fogWidth = Number.parseFloat(geometry.fog.width)
          const fogHeight = Number.parseFloat(geometry.fog.height)
          const minimumDesignSize = theme === 'light' ? 1136 : 1122
          const minimumCoverSize = Math.max(minimumDesignSize, expectedCenter.width + 16, expectedCenter.height + 16)
          assert(fogWidth >= minimumCoverSize - 0.1, `${viewport.width}x${viewport.height} ${theme} ${seconds}s fog is too narrow`)
          assert(Math.abs(fogHeight - fogWidth) < 0.1, `${viewport.width}x${viewport.height} ${theme} ${seconds}s fog is not square`)
        }

        const name = `${viewport.width}x${viewport.height}-${theme}-${seconds}s`
        const normalPng = await page.screenshot({ path: join(output, `${name}.png`) })
        const normalEdges = imageStats(normalPng, geometry.center)

        await page.evaluate(() => document.querySelector('.pI_x6G_centerCol').style.setProperty('background', '#ff00ff', 'important'))
        const probePng = await page.screenshot({ path: join(output, `${name}-seam-probe.png`) })
        const probeEdges = imageStats(probePng, geometry.center)
        await page.evaluate(() => document.querySelector('.pI_x6G_centerCol').style.removeProperty('background'))

        results.push({ viewport, theme, seconds, geometry, normalEdges, probeEdges })
      }

      if (!expectRegression) {
        assert.notEqual(transforms[0], transforms[2], `${viewport.width}x${viewport.height} ${theme} fog did not move by 12s`)
        assert.notEqual(transforms[0], transforms[1], `${viewport.width}x${viewport.height} ${theme} fog did not move by 6s`)
      }

      await page.emulateMedia({ reducedMotion: 'reduce' })
      const reduced = await page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('.pI_x6G_centerCol'), '::before')
        return { animationName: style.animationName, transform: style.transform, willChange: style.willChange }
      })
      if (!expectRegression) {
        assert.equal(reduced.animationName, 'none')
        assert.equal(reduced.willChange, 'auto')
        assert.equal(reduced.transform, theme === 'light' ? 'matrix(0, 1, -1, 0, 0, 0)' : 'none')
      }
      results.push({ viewport, theme, reduced })
      await context.close()
    }
  }

  const frameResults = results.filter(result => Number.isFinite(result.seconds))
  const targetLegacy = frameResults.filter(result => result.viewport.width === 1583 && result.viewport.height === 926)
  if (expectRegression) {
    assert(targetLegacy.some(result => result.normalEdges.colorfulPixels > 0), 'legacy 1583x926 fixture did not reproduce colored edge exposure')
    assert(targetLegacy.some(result => result.probeEdges.magentaPixels > 0), 'legacy 1583x926 fixture did not reproduce uncovered background edges')
  } else {
    for (const result of frameResults) {
      assert.equal(result.normalEdges.colorfulPixels, 0, `${result.viewport.width}x${result.viewport.height} ${result.theme} ${result.seconds}s contains colored edge pixels`)
      assert.equal(result.probeEdges.magentaPixels, 0, `${result.viewport.width}x${result.viewport.height} ${result.theme} ${result.seconds}s exposes the backing color`)
    }
  }
  assert.deepEqual(errors, [])
  const evidence = {
    passed: true,
    mode: expectRegression ? 'expected legacy regression reproduced' : 'current responsive fog accepted',
    evidenceBoundary: 'controlled Chromium fixture using production home CSS/assets and vendor center geometry; packaged client validation remains separate',
    css: basename(cssPath),
    viewports,
    themes,
    sampleTimes,
    frames: frameResults.length,
    results,
    errors
  }
  await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2))
  console.log(JSON.stringify({ ...evidence, results: undefined }, null, 2))
} finally {
  await browser.close()
}
