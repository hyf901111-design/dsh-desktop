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
  it(`${dark ? 'dark' : 'light'} research header overlays the canvas within the Figma 56 px bar`, async () => {
    const page = await browser.newPage()
    try {
      await page.setContent(`<style>${css}</style><body ${dark ? 'data-ds-dark-theme' : ''}>
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
          background: getComputedStyle(header).backgroundImage,
          blur: getComputedStyle(header, '::before').backdropFilter,
          mask: getComputedStyle(header, '::before').maskImage,
          canvasOverlay: getComputedStyle(canvas, '::after').content,
          topHit: document.elementFromPoint(bar.left + 5, bar.top + 5)?.closest('header') === header,
          belowHit: document.elementFromPoint(bar.left + 5, bar.bottom + 5)?.closest('header') === header,
        }
      })
      expect(result.height).toBe(56)
      expect(result.canvasTop).toBe(result.barTop)
      expect(result.barBottom - result.canvasTop).toBe(56)
      expect(result.canvasOverlay).toBe('none')
      expect(result.topHit).toBe(true)
      expect(result.belowHit).toBe(false)
      expect(result.blur).toBe('blur(8px)')
      expect(result.mask).toContain('linear-gradient')
      if (dark) {
        expect(result.background).toContain('38.462%')
        expect(result.background).toContain('rgba(31, 31, 31, 0)')
      }
    } finally { await page.close() }
  })

  it(`${dark ? 'dark' : 'light'} home material survives the full cascade and leaves reading surfaces intact`, async () => {
    const page = await browser.newPage()
    try {
      await page.route('**/*', route => route.abort())
      // These display:contents slots and the #root/frame/data-pane ancestry
      // are present in the native app; CSS child combinators still see them.
      await page.setContent(`<style>${css}</style><body ${dark ? 'data-ds-dark-theme' : ''}>
        <div id="root"><div data-slot="root" style="display:contents">
          <div class="pI_x6G_frame" data-dsh-frame="true">
            <main class="pI_x6G_centerCol" data-pane="conversation">
              <div data-slot="conversation" style="display:contents"><div class="wSkVaW_root" data-odyssey-page="home">
                <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="true" data-odyssey-header-layout="regular"></header></div>
                <div class="uV2eYG_card"></div>
              </div></div>
              <section data-odyssey-subagent-panel><div class="wSkVaW_root" data-odyssey-page="conversation">
                <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="false"></header></div>
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
        return { home, openRadius, reading, compactHomeBlurs, childHomeParent, childBlur, sideColor: getComputedStyle(document.querySelector('aside .uV2eYG_card')).backgroundColor }
      })
      expect(results.home).toEqual({ color: dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)', blur: 'none', headerBlur: 'none', radius: '12px' })
      expect(results.openRadius).toBe('16px')
      expect(results.childBlur).toBe('blur(32px)')
      expect(results.compactHomeBlurs).toEqual(['none', 'none'])
      expect(results.childHomeParent).toMatchObject({ headerBlur: 'blur(32px)', radius: '16px' })
      results.reading.forEach((reading, index) => expect(reading).toEqual({ color: dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)', blur: 'none', headerBlur: index < 2 ? 'blur(32px)' : 'none', radius: '16px' }))
      expect(results.sideColor).toBe(dark ? 'rgb(41, 41, 41)' : 'rgb(249, 249, 249)')
    } finally { await page.close() }
  })
}
