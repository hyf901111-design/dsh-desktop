import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Full native CSS and production shell order; retain every observed composer
// slot, including the empty workspace anchor and the mode trigger wrapper.
const read = path => readFileSync(path, 'utf8')
const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
const frontend = readdirSync(assets).filter(name => /^index-.*\.css$/.test(name)).map(name => read(`${assets}/${name}`)).join('\n')
const native = ['layout', 'conversation', 'agent-preset'].map(name => [...read(`node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`).matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(m => JSON.parse(m[1])).join('\n')).join('\n')
const shell = read('src/preload/shell-style.ts')
const imports = [...shell.matchAll(/import (\w+) from '(\.\/[^']+\.css)\?raw'/g)]
const css = shell.match(/style\.textContent = ([^\n]+)/)[1].split('+').map(name => name.trim() === 'desktopShellStyles'
  ? shell.match(/const desktopShellStyles = `([\s\S]*?)`/)[1]
  : read('src/preload/' + imports.find(m => m[1] === name.trim())[2].slice(2))).join('\n')
let browser
beforeAll(async () => {
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
  await page.setContent(`<style>${frontend}\n${native}\n${portalCss}\n${css}</style><body ${dark ? 'data-ds-dark-theme' : ''}>
    <div id="root"><div data-slot="root" style="display:contents"><div class="pI_x6G_frame" data-dsh-frame="true" style="grid-template-columns:280px minmax(0,1fr) 0px">
      <aside></aside><main class="pI_x6G_centerCol" data-pane="conversation"><div data-slot="conversation" style="display:contents"><div class="wSkVaW_root" data-phase="hero" data-odyssey-page="home">
        <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="true"></header></div>
        <div class="wSkVaW_scrollBody" data-conversation-scroll></div>
        <div data-center-composer-host><div data-composer-portal-host><div class="wSkVaW_composerSeat" data-composer-seat><div data-slot="conversation.composer" style="display:contents"><div data-chain-overlay-fallback="conversation.composer" style="display:contents">${hero()}</div></div></div></div></div>
      </div></div></main>
    </div></div></div><aside data-dsh-panel-host data-odyssey-panel-right="closed"></aside>
  </body>`)
  return page
}
async function measure(page) {
  return page.locator('main .wSkVaW_composerHero').evaluate(hero => {
    const row = hero.querySelector('.wSkVaW_heroWorkspaceRow'), workspace = row.querySelector('.pXSMma_workspace'), mode = row.querySelector('.cubgiG_seat')
    const card = hero.querySelector('.uV2eYG_card').getBoundingClientRect(), wr = workspace.getBoundingClientRect(), mr = mode.getBoundingClientRect(), rr = row.getBoundingClientRect()
    return { card: { x: card.x, y: card.y, width: card.width, height: card.height }, left: wr.x - card.x, gap: mr.x - wr.right,
      bottom: card.y - wr.bottom, sameTop: wr.y === mr.y, rowHeight: rr.height, controls: [wr.height, mr.height], overflow: row.scrollWidth > row.clientWidth }
  })
}
for (const dark of [false, true]) it(`${dark ? 'dark' : 'light'} native home slots preserve the input center with 8/12/8 entry spacing`, async () => {
  const page = await open(dark)
  try {
    for (const open of [false, true, false]) {
      await page.locator('[data-dsh-panel-host]').evaluate((el, open) => el.dataset.odysseyPanelRight = open ? 'open' : 'closed', open)
      expect(await measure(page)).toEqual({ card: { x: open ? 330 : 435, y: 417, width: open ? 640 : 780, height: 126 }, left: 8, gap: 12, bottom: 8, sameTop: true, rowHeight: 32, controls: [28, 28], overflow: false })
    }
  } finally { await page.close() }
})
it('keeps the same input center and entry clearance in a short, narrow home pane', async () => {
  const page = await open()
  try {
    await page.setViewportSize({ width: 1040, height: 640 })
    await page.locator('[data-dsh-panel-host]').evaluate(el => el.dataset.odysseyPanelRight = 'open')
    expect(await measure(page)).toEqual({ card: { x: 304, y: 287, width: 352, height: 126 }, left: 8, gap: 12, bottom: 8, sameTop: true, rowHeight: 32, controls: [28, 28], overflow: false })
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
