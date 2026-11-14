import { readFileSync, readdirSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Full native CSS and production shell order; retain the empty workspace
// anchor and mode wrapper. The current client hides the mode trigger, so only
// visible controls contribute to spacing; workspace clearance stays exact.
const read = path => readFileSync(path, 'utf8')
const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
const frontend = readdirSync(assets).filter(name => /^index-.*\.css$/.test(name)).map(name => read(`${assets}/${name}`)).join('\n')
const native = ['layout', 'conversation', 'agent-preset'].map(name => [...read(`node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`).matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(m => JSON.parse(m[1])).join('\n')).join('\n')
let browser, shellRuntime
beforeAll(async () => {
  // Compile the actual mount, resolving both local and package raw styles.
  // This retains generated palette rules and their production cascade order.
  const require = createRequire(import.meta.url)
  const result = await build({
    stdin: { contents: `
      import { mountDesktopShellStyles } from './src/preload/shell-style'
      import { mountHomeAppShortcuts } from './src/preload/home-app-shortcuts'
      mountDesktopShellStyles(document)
      window.mountShortcuts = () => mountHomeAppShortcuts(document, app => { window.openedHomeApp = app })
    `, resolveDir: process.cwd(), loader: 'ts' },
    bundle: true, platform: 'browser', format: 'iife', write: false,
    loader: { '.svg': 'dataurl' },
    plugins: [{ name: 'raw-css', setup(b) {
      b.onResolve({ filter: /\.css\?raw$/ }, a => ({ path: a.path.startsWith('.') ? resolve(a.resolveDir, a.path.slice(0, -4)) : require.resolve(a.path.slice(0, -4)), namespace: 'raw' }))
      b.onLoad({ filter: /.*/, namespace: 'raw' }, async a => ({ contents: 'export default ' + JSON.stringify(await readFile(a.path, 'utf8')), loader: 'js' }))
    } }]
  })
  shellRuntime = result.outputFiles[0].text
  const module = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (module.default ?? module).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
const conversation = read('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js')
const portalCss = [...conversation.matchAll(/tag\.textContent \+?= ("(?:[^"\\]|\\.)*");/g)].map(m => JSON.parse(m[1])).filter(css => css.includes('.wSkVaW_root')).join('\n')
function row() {
  return `<div class="wSkVaW_heroWorkspaceRow">
    <button class="pXSMma_workspace" type="button" aria-haspopup="menu"><svg class="pXSMma_folder" width="16" height="16"></svg><span class="pXSMma_workspaceLabel">测试集</span><svg class="pXSMma_chevron" width="12" height="12"></svg></button>
    <div data-slot="conversation.hero.workspace" style="display:contents"><span class="_root_19372_1"></span><div data-slot="conversation.hero.workspace.directoryFlow" style="display:contents"></div></div>
    <div data-slot="conversation.hero.agentPreset" style="display:contents"><span class="_root_19372_1 cubgiG_picker"><button class="cubgiG_seat" type="button" aria-haspopup="menu"><svg class="cubgiG_seatIcon" width="16" height="16"></svg><span class="odyssey-mode-label">标准模式</span><svg class="cubgiG_chevron" width="12" height="12"></svg></button></span></div>
  </div>`
}
function hero() {
  return `<div class="wSkVaW_composerStack wSkVaW_composerHero"><div class="pXSMma_root"></div>${row()}
    <div data-slot="conversation.input.dock" style="display:contents"></div>
    <div data-slot="conversation.composer.bar" style="display:contents"><div class="uV2eYG_root"><div class="uV2eYG_card"><div class="uV2eYG_scroll"><textarea class="uV2eYG_input"></textarea></div><div class="uV2eYG_row"></div></div></div></div>
  </div>`
}
async function open(dark = false) {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 }, reducedMotion: 'reduce' })
  await page.route('**/*', r => r.abort())
  await page.setContent(`<style>${frontend}\n${native}\n${portalCss}</style><body ${dark ? 'data-ds-dark-theme' : ''}>
    <div id="root"><div data-slot="root" style="display:contents"><div class="pI_x6G_frame" data-dsh-frame="true" style="grid-template-columns:280px minmax(0,1fr) 0px">
      <aside></aside><main class="pI_x6G_centerCol" data-pane="conversation"><div data-slot="conversation" style="display:contents"><div class="wSkVaW_root" data-phase="hero" data-odyssey-page="home">
        <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="true"></header></div>
        <div class="wSkVaW_scrollBody" data-conversation-scroll></div>
        <div data-center-composer-host><div data-composer-portal-host><div class="wSkVaW_composerSeat" data-composer-seat><div data-slot="conversation.composer" style="display:contents"><div data-chain-overlay-fallback="conversation.composer" style="display:contents">${hero()}</div></div></div></div></div>
      </div></div></main>
    </div></div></div><aside data-dsh-panel-host data-odyssey-panel-right="closed"></aside>
  </body>`)
  await page.addScriptTag({ content: shellRuntime })
  return page
}
async function measure(page) {
  return page.locator('main .wSkVaW_composerHero').evaluate(hero => {
    const row = hero.querySelector('.wSkVaW_heroWorkspaceRow'), workspace = row.querySelector('.pXSMma_workspace'), mode = row.querySelector('.cubgiG_seat')
    const card = hero.querySelector('.uV2eYG_card').getBoundingClientRect(), wr = workspace.getBoundingClientRect(), mr = mode.getBoundingClientRect(), rr = row.getBoundingClientRect()
    const visible = [workspace, mode].filter(control => getComputedStyle(control).display !== 'none').map(control => control.getBoundingClientRect())
    return { card: { x: card.x, y: card.y, width: card.width, height: card.height }, left: wr.x - card.x,
      gap: visible.length > 1 ? visible[1].x - visible[0].right : null,
      bottom: card.y - wr.bottom, sameTop: visible.every(control => control.y === visible[0].y), rowHeight: rr.height,
      controls: [wr.height, mr.height], modeDisplay: getComputedStyle(mode).display, overflow: row.scrollWidth > row.clientWidth }
  })
}
for (const dark of [false, true]) it(`${dark ? 'dark' : 'light'} home preserves the input center and 8 px workspace clearance with the mode trigger hidden`, async () => {
  const page = await open(dark)
  try {
    for (const open of [false, true, false]) {
      await page.locator('[data-dsh-panel-host]').evaluate((el, open) => el.dataset.odysseyPanelRight = open ? 'open' : 'closed', open)
      expect(await measure(page)).toEqual({ card: { x: open ? 330 : 435, y: 417, width: open ? 640 : 780, height: 126 }, left: 8, gap: null, bottom: 8, sameTop: true, rowHeight: 32, controls: [28, 0], modeDisplay: 'none', overflow: false })
    }
  } finally { await page.close() }
})
it('keeps input geometry and workspace clearance in a short, narrow home pane with the mode trigger hidden', async () => {
  const page = await open()
  try {
    await page.setViewportSize({ width: 1040, height: 640 })
    await page.locator('[data-dsh-panel-host]').evaluate(el => el.dataset.odysseyPanelRight = 'open')
    expect(await measure(page)).toEqual({ card: { x: 304, y: 287, width: 352, height: 126 }, left: 8, gap: null, bottom: 8, sameTop: true, rowHeight: 32, controls: [28, 0], modeDisplay: 'none', overflow: false })
  } finally { await page.close() }
})
it('does not apply the new entry spacing to started sessions, right-side or child composers', async () => {
  const page = await open()
  try {
    await page.evaluate(html => { const root = document.querySelector('.wSkVaW_root'); root.dataset.odysseyPage = 'conversation'; root.dataset.phase = 'active'; root.insertAdjacentHTML('beforeend', `<aside class="sRp_composer">${html}</aside><section data-odyssey-subagent-panel><div class="wSkVaW_root" data-odyssey-page="home">${html}</div></section>`) }, hero())
    const states = await page.evaluate(() => [...document.querySelectorAll('.wSkVaW_heroWorkspaceRow')].map(row => {
      const s = getComputedStyle(row); return { gap: s.gap, padding: s.paddingLeft, align: s.alignItems, mode: getComputedStyle(row.querySelector('.cubgiG_seat')).display }
    }))
    expect(states).toEqual([
      { gap: '2px', padding: '20px', align: 'center', mode: 'none' },
      { gap: '8px', padding: '0px', align: 'center', mode: 'none' },
      { gap: '8px', padding: '0px', align: 'center', mode: 'none' }
    ])
  } finally { await page.close() }
})

it('keeps each shortcut painted on first hover while new icon requests are pending', async () => {
  const page = await open(true)
  let holdRequests = false
  let releaseRequests
  const waiting = new Promise(resolve => { releaseRequests = resolve })
  try {
    await page.evaluate(() => {
      const base = document.createElement('base')
      base.href = 'https://home-shortcuts.test/'
      document.head.prepend(base)
    })
    await page.route('https://home-shortcuts.test/odyssey-home-*.svg', async route => {
      if (holdRequests) await waiting
      const filename = new URL(route.request().url()).pathname.slice(1)
      await route.fulfill({ path: resolve('build/brand', filename), contentType: 'image/svg+xml' })
    })
    const apps = ['browser', 'plugin', 'scheduled', 'research', 'note']
    const loaded = apps.map(app => page.waitForResponse(response =>
      response.ok() && new URL(response.url()).pathname.startsWith(`/odyssey-home-${app}-`)))
    await page.evaluate(() => window.mountShortcuts())
    await Promise.all(loaded)
    const nav = page.getByRole('navigation', { name: '应用快捷入口' })
    const brightPixels = async icon => {
      const { data } = PNG.sync.read(await icon.screenshot())
      let count = 0
      for (let offset = 0; offset < data.length; offset += 4) {
        if (Math.min(data[offset], data[offset + 1], data[offset + 2]) > 128) count++
      }
      return count
    }
    const order = ['browser', 'knowledge', ...apps.slice(1), 'spreadsheet']
    expect(await nav.locator('[data-home-app]').evaluateAll(buttons => buttons.map(button => button.dataset.homeApp))).toEqual(order)
    const knowledge = nav.getByRole('button', { name: '知识库', exact: true })
    await knowledge.click()
    expect(await page.evaluate(() => window.openedHomeApp)).toBe('knowledge')
    const spreadsheet = page.locator('[data-home-app=spreadsheet]')
    expect(await spreadsheet.getAttribute('aria-label')).toBe('表格')
    expect(await spreadsheet.locator('.home-app-shortcut-tooltip').textContent()).toBe('表格')
    await page.evaluate(() => document.documentElement.dataset.odysseyLocale = 'en')
    await spreadsheet.getByText('Spreadsheet', { exact: true }).waitFor({ state: 'attached' })
    expect(await spreadsheet.getAttribute('aria-label')).toBe('Spreadsheet')
    await page.evaluate(() => document.documentElement.dataset.odysseyLocale = 'zh')
    await spreadsheet.getByText('表格', { exact: true }).waitFor({ state: 'attached' })
    holdRequests = true
    for (const app of order) {
      const button = nav.locator(`[data-home-app="${app}"]`)
      const icon = button.locator('.home-app-shortcut-icon')
      const restingPixels = await brightPixels(icon)
      expect(restingPixels, app).toBeGreaterThan(40)
      await button.hover()
      expect(await button.locator('.home-app-shortcut-tooltip').isVisible(), app).toBe(true)
      expect(await brightPixels(icon), app).toBeGreaterThanOrEqual(restingPixels)
    }
  } finally {
    releaseRequests()
    await page.close()
  }
})
