import { beforeAll, afterAll, it, expect } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const evidence = process.env.SHERLOCK_PLUGIN_BACK_EVIDENCE || '/tmp/plugin-back-sticky-20261027'
let browser, script, sharedStyles
beforeAll(async () => {
  await mkdir(evidence, { recursive: true })
  sharedStyles = await readFile('src/preload/figma-refinements.css', 'utf8')
  const result = await build({ entryPoints: ['test/fixtures/plugin-back-sticky-browser.ts'], bundle: true, write: false,
    format: 'iife', platform: 'browser', loader: { '.svg': 'dataurl' }, logLevel: 'silent', define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
  const { chromium } = await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({ headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
}, 40000)
afterAll(async () => browser?.close())

async function fixture({ dark = false, width = 1280, sidebar = 280, right = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width, height: 800 } }), errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.route('**/*', route => route.abort())
  await page.setContent(`<html style="--odyssey-right-occupancy:${right}px"><head><title>Plugin workspace native fixture</title><style>
    html,body{margin:0;height:100%;overflow:hidden}body{background:${dark ? '#0d0e0e' : '#e9e9e9'};color:${dark ? '#eee' : '#222'}}
    .pI_x6G_frame{position:fixed;inset:0;backdrop-filter:blur(1px)}
    [data-dsh-sidebar-root]{position:fixed;inset:0 auto 0 0;width:${sidebar}px}
    .pI_x6G_centerCol{position:fixed;inset:10px 10px 10px ${sidebar}px}
    [data-odyssey-panel-entry=right]{position:fixed;top:18px;right:calc(18px + var(--odyssey-right-occupancy));z-index:901;width:28px;height:28px}
    ${sharedStyles}</style></head><body ${dark ? 'data-ds-dark-theme' : ''}><div class="pI_x6G_frame">
    <aside data-dsh-sidebar-root aria-label="侧栏"></aside><main class="pI_x6G_centerCol"><textarea>保留的会话草稿</textarea></main>
    <button data-odyssey-panel-entry="right" aria-label="展开右侧屏">▣</button></div></body></html>`)
  await page.addScriptTag({ content: script })
  await page.locator('.ig-row').first().waitFor()
  await expect.poll(() => page.locator('.ig-root').getAttribute('data-dark')).toBe(String(dark))
  return { page, errors }
}
async function geometry(page) {
  return page.evaluate(() => {
    const root = document.querySelector('.ig-root'), back = root.querySelector('.workspace-back-button'), heading = root.querySelector('.ig-heading'), scroll = root.querySelector('.ig-scroll') || root
    const box = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
    const track = document.querySelector('.odyssey-scroll-track[data-workspace-surface=integrations]:not([hidden])')
    return { root: box(root), chrome: box(root.querySelector('.ig-chrome')), scroll: box(scroll), back: box(back), expand: box(document.querySelector('[data-odyssey-panel-entry=right]')), heading: box(heading), scrollTop: scroll.scrollTop, rootScrollTop: root.scrollTop,
      track: track && box(track), thumb: track && box(track.firstElementChild),
      hit: document.elementFromPoint(back.getBoundingClientRect().x + 14, back.getBoundingClientRect().y + 14)?.closest('button')?.className }
  })
}
async function scrollTo(page, value) {
  await page.locator('.ig-scroll').evaluate((scroll, value) => scroll.scrollTop = value, value)
  await page.waitForTimeout(40)
}

for (const dark of [false, true]) for (const sidebar of [88, 280]) {
  it(`keeps aligned plugin controls above the shared scrollbar while only content scrolls (${dark ? 'dark' : 'light'}, sidebar ${sidebar})`, async () => {
    const { page, errors } = await fixture({ dark, sidebar })
    try {
      expect(await page.title()).toBe('Plugin workspace native fixture')
      expect(await page.locator('.ig-heading h1').textContent()).toBe('插件')
      const before = await geometry(page)
      expect(before.chrome.height).toBe(44)
      expect(before.back.y).toBe(before.expand.y)
      expect(before.scroll.y).toBe(before.chrome.y + before.chrome.height)
      expect(before.track?.y).toBe(before.scroll.y)
      expect(before.thumb?.width).toBe(4)
      await page.screenshot({ path: `${evidence}/${dark ? 'dark' : 'light'}-${sidebar}-before.png` })
      await page.mouse.move(before.scroll.x + before.scroll.width / 2, before.scroll.y + 120)
      await page.mouse.wheel(0, 320)
      await expect.poll(() => page.locator('.ig-scroll').evaluate(scroll => scroll.scrollTop)).toBe(320)
      await scrollTo(page, 700)
      const after = await geometry(page)
      await page.screenshot({ path: `${evidence}/${dark ? 'dark' : 'light'}-${sidebar}-scrolled.png` })
      expect(after.scrollTop).toBe(700)
      expect(after.rootScrollTop).toBe(0)
      expect(after.track.y).toBe(before.track.y)
      expect(after.back.x).toBe(before.back.x)
      expect(after.back.y).toBe(before.back.y)
      expect(after.back.width).toBe(28)
      expect(after.back.height).toBe(28)
      expect(before.heading.y - after.heading.y).toBe(700)
      expect(after.hit).toContain('workspace-back-button')
      await page.evaluate(() => window.pluginBackFixture.view.refresh(true))
      await expect.poll(() => page.locator('.ig-scroll').evaluate(scroll => scroll.scrollTop)).toBe(700)
      await expect.poll(() => page.locator('.odyssey-scroll-track[data-workspace-surface=integrations]:not([hidden])').count()).toBe(1)
      const thumb = page.locator('.odyssey-scroll-track[data-workspace-surface=integrations]:not([hidden]) .odyssey-scroll-thumb'), thumbBox = await thumb.boundingBox()
      await page.mouse.move(thumbBox.x + 2, thumbBox.y + 16)
      await page.mouse.down(); await page.mouse.move(thumbBox.x + 2, thumbBox.y + 86, { steps: 4 }); await page.mouse.up()
      await expect.poll(() => page.locator('.ig-scroll').evaluate(scroll => scroll.scrollTop)).toBeGreaterThan(700)
      const maximum = await page.locator('.ig-scroll').evaluate(scroll => scroll.scrollHeight - scroll.clientHeight)
      await scrollTo(page, maximum)
      const bottom = await geometry(page)
      expect(bottom.scrollTop).toBe(maximum)
      expect(bottom.back).toEqual(before.back)
      expect(bottom.hit).toContain('workspace-back-button')
      await writeFile(`${evidence}/${dark ? 'dark' : 'light'}-${sidebar}.json`, JSON.stringify({ before, after, bottom }, null, 2))
      await page.getByRole('button', { name: '展开右侧屏', exact: true }).click()
      expect(await page.evaluate(() => window.pluginBackFixture.paneClicks)).toBe(1)
      await page.getByRole('button', { name: '返回工作区', exact: true }).click()
      await expect.poll(() => page.locator('.ig-root').isVisible()).toBe(false)
      expect(await page.locator('.pI_x6G_centerCol').evaluate(element => element.inert)).toBe(false)
      expect(await page.locator('textarea').inputValue()).toBe('保留的会话草稿')
      expect(errors).toEqual([])
    } finally { await page.evaluate(() => window.pluginBackFixture.dispose()); await page.close() }
  })
}

it('tracks sidebar and right-pane resizing without moving the back control vertically or pinning page headings', async () => {
  const { page, errors } = await fixture({ width: 1050, sidebar: 280, dark: true })
  try {
    await scrollTo(page, 400)
    const before = await geometry(page)
    await page.evaluate(() => { window.pluginBackFixture.setSidebar(88); window.pluginBackFixture.setRight(280) })
    await expect.poll(() => page.locator('.ig-root').evaluate(root => root.getBoundingClientRect().x)).toBe(88)
    await page.setViewportSize({ width: 720, height: 700 })
    const after = await geometry(page)
    expect(after.root.width).toBe(342)
    expect(after.back.x - after.root.x).toBe(19)
    expect(after.back.y - after.root.y).toBe(8)
    expect(after.back.y).toBe(after.expand.y)
    expect(after.track.y).toBe(after.chrome.y + after.chrome.height)
    expect(after.back.y).toBe(before.back.y)
    expect(after.heading.y).toBeLessThan(after.root.y)
    await page.getByRole('button', { name: '展开右侧屏', exact: true }).click()
    expect(await page.evaluate(() => window.pluginBackFixture.paneClicks)).toBe(1)
    await page.screenshot({ path: `${evidence}/narrow-right-pane.png` })
    expect(errors).toEqual([])
  } finally { await page.evaluate(() => window.pluginBackFixture.dispose()); await page.close() }
})

it('preserves real nested-route back navigation and skill-document scrolling', async () => {
  const { page, errors } = await fixture()
  try {
    await page.locator('.ig-row-main').first().click()
    await expect.poll(() => page.locator('.ig-heading h1').textContent()).toBe('插件详情')
    await page.getByRole('button', { name: '返回工作区', exact: true }).click()
    await expect.poll(() => page.locator('.ig-row').count()).toBe(36)
    await page.locator('[data-tab=skills]').click()
    await page.locator('.ig-row-main').first().click()
    await page.locator('.ig-skill-document h2').first().waitFor()
    const before = await geometry(page)
    await page.locator('.ig-skill-document').evaluate(element => element.scrollTop = 600)
    const after = await geometry(page)
    expect(after.back).toEqual(before.back)
    expect(await page.locator('.ig-skill-document').evaluate(element => element.scrollTop)).toBe(600)
    await page.getByRole('button', { name: '返回工作区', exact: true }).click()
    await expect.poll(() => page.locator('.ig-row-main').textContent()).toContain('研究写作技能')
    expect(errors).toEqual([])
  } finally { await page.evaluate(() => window.pluginBackFixture.dispose()); await page.close() }
})

it('keeps scrolled list controls and their menus clickable below the back-control gutter', async () => {
  const { page, errors } = await fixture({ width: 720, sidebar: 88, right: 280, dark: true })
  try {
    const maximum = await page.locator('.ig-scroll').evaluate(scroll => scroll.scrollHeight - scroll.clientHeight)
    await scrollTo(page, maximum)
    await page.getByRole('button', { name: '研究资料插件 36的更多操作', exact: true }).click()
    expect(await page.getByRole('menu').isVisible()).toBe(true)
    await page.mouse.move(200, 500); await page.mouse.wheel(0, -120)
    await expect.poll(() => page.getByRole('menu').count()).toBe(0)
    await scrollTo(page, maximum)
    await page.getByRole('button', { name: '研究资料插件 36的更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '查看详情', exact: true }).click()
    await expect.poll(() => page.locator('.ig-heading h1').textContent()).toBe('插件详情')
    await page.getByRole('button', { name: '返回工作区', exact: true }).click()
    await expect.poll(() => page.locator('.ig-row').count()).toBe(36)
    expect(errors).toEqual([])
  } finally { await page.evaluate(() => window.pluginBackFixture.dispose()); await page.close() }
})
