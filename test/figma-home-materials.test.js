import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'
import sharp from 'sharp'

// Use the actual stylesheet order: empty-home glass must survive the reading
// stylesheet while ordinary conversation and side-panel inputs stay opaque.
let browser, shellRuntime
beforeAll(async () => {
  const require = createRequire(import.meta.url)
  const result = await build({
    stdin: { contents: "import {mountDesktopShellStyles} from './src/preload/shell-style'; mountDesktopShellStyles(document)", resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'browser', format: 'iife', write: false,
    plugins: [{ name: 'raw-css', setup(b) {
      b.onResolve({ filter: /\.css\?raw$/ }, a => ({ path: a.path.startsWith('.') ? resolve(a.resolveDir, a.path.slice(0, -4)) : require.resolve(a.path.slice(0, -4)), namespace: 'raw' }))
      b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
    } }]
  })
  shellRuntime = result.outputFiles[0].text
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
async function setContent(page, html) {
  await page.setContent(html)
  await page.addScriptTag({ content: shellRuntime })
}

it('research header keeps its vertical fade at both edges and covers the top-right cutout', async () => {
  const page = await browser.newPage({ viewport: { width: 720, height: 160 }, deviceScaleFactor: 1 })
  try {
    await setContent(page, `<style>
      body { margin:0 }
      .tile { position:absolute; top:0; width:30px; height:140px; background:#00c880 }
      .tile.left { left:85px }
      .tile.right { right:10px }
    </style><body data-ds-dark-theme>
      <main class="pI_x6G_centerCol" style="width:720px;height:160px;margin:0">
        <div class="wSkVaW_root" data-odyssey-page="research" style="display:flex;height:160px">
          <header class="wSkVaW_header" data-srb-session-header></header>
          <div class="wSkVaW_scrollBody" data-research-center style="position:relative;flex:1">
            <i class="tile left"></i><i class="tile right"></i>
          </div>
        </div>
      </main>
    </body>`)
    const bar = await page.locator('header').boundingBox()
    const { data, info } = await sharp(await page.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true })
    const green = (x, y) => data[(Math.round(y) * info.width + Math.round(x)) * info.channels + 1]
    const left = green(bar.x + 100, bar.y + bar.height * .8)
    const right = green(bar.x + bar.width - 25, bar.y + bar.height * .8)
    expect(Math.abs(left - right)).toBeLessThan(6)
    expect(left).toBeGreaterThan(green(bar.x + 100, bar.y + 8) + 20)
    expect(green(bar.x + bar.width - 5, bar.y + 8)).toBeLessThan(80)
  } finally { await page.close() }
})

for (const dark of [false, true]) {
  it(`${dark ? 'dark' : 'light'} research header overlays the canvas within the compact 44 px bar`, async () => {
    const page = await browser.newPage()
    try {
      await setContent(page, `<body ${dark ? 'data-ds-dark-theme' : ''}>
        <main class="pI_x6G_centerCol"><div class="wSkVaW_root" data-odyssey-page="research" style="display:flex;flex-direction:column;height:400px">
          <header class="wSkVaW_header" data-srb-session-header data-odyssey-header-layout="regular"></header>
          <div class="wSkVaW_scrollBody" data-research-center style="flex:1;position:relative"></div>
        </div></main>
      </body>`)
      const result = await page.evaluate(() => {
        const header = document.querySelector('header')
        const canvas = document.querySelector('[data-research-center]')
        const bar = header.getBoundingClientRect()
        return {
          height: bar.height,
          canvasTop: canvas.getBoundingClientRect().top,
          barTop: bar.top,
          barBottom: bar.bottom,
          blur: getComputedStyle(header, '::before').backdropFilter,
          mask: getComputedStyle(header, '::before').maskImage,
          canvasOverlay: getComputedStyle(canvas, '::after').content,
          topHit: document.elementFromPoint(bar.left + 5, bar.top + 5)?.closest('header') === header,
          belowHit: document.elementFromPoint(bar.left + 5, bar.bottom + 5)?.closest('header') === header,
        }
      })
      expect(result.height).toBe(44)
      expect(result.canvasTop).toBe(result.barTop)
      expect(result.barBottom - result.canvasTop).toBe(44)
      expect(result.canvasOverlay).toBe('none')
      expect(result.topHit).toBe(true)
      expect(result.belowHit).toBe(false)
      expect(result.blur).toBe('blur(8px)')
      expect(result.mask).toContain('linear-gradient')
    } finally { await page.close() }
  })

  it(`${dark ? 'dark' : 'light'} home material survives the full cascade and leaves reading surfaces intact`, async () => {
    const page = await browser.newPage()
    try {
      await page.route('**/*', route => route.abort())
      // These display:contents slots and the #root/frame/data-pane ancestry
      // are present in the native app; CSS child combinators still see them.
      await setContent(page, `<body ${dark ? 'data-ds-dark-theme' : ''}>
        <div id="root"><div data-slot="root" style="display:contents">
          <div class="pI_x6G_frame" data-dsh-frame="true">
            <main class="pI_x6G_centerCol" data-pane="conversation">
              <div data-slot="conversation" style="display:contents"><div class="wSkVaW_root" data-odyssey-page="home">
                <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="true" data-odyssey-header-layout="regular"></header></div>
                <div class="wSkVaW_composerHero"><div class="uV2eYG_card"></div></div>
              </div></div>
              <section data-odyssey-subagent-panel><div class="wSkVaW_root" data-odyssey-page="conversation">
                <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="false"></header></div>
                <div class="wSkVaW_composerHero"><div class="uV2eYG_card"></div></div>
              </div></section>
            </main>
          </div>
        </div></div>
        <div data-dsh-panel-host data-odyssey-panel-right="closed"><aside class="sRp_composer"><div class="uV2eYG_card"></div></aside></div>
      </body>`)

      const results = await page.evaluate(() => {
        const main = document.querySelector('main'), root = document.querySelector('main .wSkVaW_root'), card = root.querySelector('.uV2eYG_card'), header = root.querySelector('header')
        const measure = () => ({ color: getComputedStyle(card).backgroundColor, blur: getComputedStyle(card).backdropFilter, headerBlur: getComputedStyle(header).backdropFilter, radius: getComputedStyle(main).borderRadius })
        const home = measure()
        const compactHomeBlurs = ['compact', 'narrow'].map(layout => { header.dataset.odysseyHeaderLayout = layout; return measure().headerBlur })
        header.dataset.odysseyHeaderLayout = 'regular'
        const childBlur = getComputedStyle(document.querySelector('[data-odyssey-subagent-panel] header')).backdropFilter
        document.querySelector('[data-odyssey-panel-right]').setAttribute('data-odyssey-panel-right', 'open')
        const openRadius = measure().radius
        const reading = ['conversation', 'research'].flatMap(page => ['open', 'closed'].map(state => { root.setAttribute('data-odyssey-page', page); document.querySelector('[data-odyssey-panel-right]').setAttribute('data-odyssey-panel-right', state); return measure() }))
        root.setAttribute('data-odyssey-page', 'conversation')
        document.querySelector('[data-odyssey-subagent-panel] .wSkVaW_root').setAttribute('data-odyssey-page', 'home')
        const childHomeParent = measure()
        const childCard = getComputedStyle(document.querySelector('[data-odyssey-subagent-panel] .uV2eYG_card'))
        return { home, openRadius, reading, compactHomeBlurs, childHomeParent, childBlur, childColor: childCard.backgroundColor, childCardBlur: childCard.backdropFilter, sideColor: getComputedStyle(document.querySelector('aside .uV2eYG_card')).backgroundColor }
      })
      expect(results.home).toEqual({ color: dark ? 'rgba(0, 0, 0, 0.49)' : 'rgba(255, 255, 255, 0.49)', blur: 'blur(12px)', headerBlur: 'none', radius: '12px' })
      expect(results.openRadius).toBe('16px')
      expect(results.childBlur).toBe('blur(32px)')
      expect(results.compactHomeBlurs).toEqual(['none', 'none'])
      expect(results.childHomeParent).toMatchObject({ headerBlur: 'blur(32px)', radius: '16px' })
      results.reading.forEach((reading, index) => expect(reading).toEqual({ color: dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)', blur: 'none', headerBlur: index < 2 ? 'blur(32px)' : 'none', radius: '16px' }))
      expect(results.sideColor).toBe(dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)')
      expect(results.childColor).toBe(dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)')
      expect(results.childCardBlur).toBe('none')
    } finally { await page.close() }
  })

  it(`${dark ? 'dark' : 'light'} homepage glass retains background color while softening its fine texture`, async () => {
    const page = await browser.newPage({ viewport: { width: 720, height: 360 }, deviceScaleFactor: 1 })
    try {
      await page.route('**/*', route => route.abort())
      await setContent(page, `<style>
        body { margin:0 }
        .pattern { position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 2px,#ffffff99 2px 4px),linear-gradient(90deg,#204273 50%,#406c9b 50%) }
      </style><body ${dark ? 'data-ds-dark-theme' : ''}>
        <main class="pI_x6G_centerCol" style="position:relative;width:720px;height:360px;margin:0;isolation:isolate;overflow:hidden">
          <div data-odyssey-home-theme-background><div class="pattern"></div></div>
          <div class="wSkVaW_root" data-odyssey-page="home" style="position:relative;height:360px">
            <div class="wSkVaW_composerHero" style="position:absolute;left:48px;top:120px;width:624px;padding:0;margin:0">
              <div class="uV2eYG_card" style="height:126px"><textarea aria-label="首页输入" style="position:absolute;left:17px;top:15px;background:transparent;border:0;color:inherit">清晰的输入内容</textarea></div>
            </div>
          </div>
        </main>
      </body>`)
      const card = page.locator('.uV2eYG_card')
      const image = async () => sharp(await card.screenshot()).removeAlpha().raw().toBuffer({ resolveWithObject: true })
      const stats = ({ data, info }) => {
        const channel = (x, y, c) => data[(y * info.width + x) * info.channels + c]
        const mean = (from, to) => [0, 1, 2].map(c => {
          let total = 0
          for (let y = 60; y < 96; y++) for (let x = from; x < to; x++) total += channel(x, y, c)
          return total / ((to - from) * 36)
        })
        let edges = 0
        for (let y = 60; y < 96; y++) for (let x = 40; x < 240; x++) for (let c = 0; c < 3; c++) edges += Math.abs(channel(x + 1, y, c) - channel(x, y, c))
        return { left: mean(40, 240), right: mean(400, 600), texture: edges / (36 * 200 * 3) }
      }
      const blurred = stats(await image())
      await card.evaluate(node => { node.style.setProperty('backdrop-filter', 'none', 'important'); node.style.setProperty('-webkit-backdrop-filter', 'none', 'important') })
      const unblurred = stats(await image())
      expect(blurred.left.reduce((difference, value, c) => difference + Math.abs(value - blurred.right[c]), 0)).toBeGreaterThan(20)
      expect(unblurred.texture).toBeGreaterThan(8)
      expect(blurred.texture).toBeLessThan(unblurred.texture * .2)
      expect(await page.locator('textarea').inputValue()).toBe('清晰的输入内容')
      expect(await card.evaluate(node => getComputedStyle(node).filter)).toBe('none')
    } finally { await page.close() }
  })
}
