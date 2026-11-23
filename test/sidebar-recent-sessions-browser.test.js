import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { patchResearchBoardSidebar, patchResearchBoardWorkspace } from '../scripts/lib/patch-research-board-client.mjs'

let browser, bundle, style, native
beforeAll(async () => {
  const pw = await import(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
  browser = await pw.chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM ||
    '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
  const vendor = name => readFile('node_modules/@deepseek-ai/' + name + '/lib/client.js', 'utf8')
  const sidebar = patchResearchBoardSidebar(await vendor('dsh-client-ui-sidebar'))
  const workspace = patchResearchBoardWorkspace(await vendor('dsh-client-ui-workspace'))
  expect(patchResearchBoardSidebar(sidebar)).toBe(sidebar)
  expect(patchResearchBoardWorkspace(workspace)).toBe(workspace)
  native = [await vendor('dsh-client-runtime'), workspace, sidebar.replace('exports.apply = apply;', 'exports.Root = SidebarRoot; exports.zh = zh; exports.apply = apply;')]
  style = (await Promise.all(['figma-final-shell.css', 'figma-refinements.css', 'figma-b-icons.css'].map(f => readFile('src/preload/' + f, 'utf8')))).join('\n')
  bundle = (await build({ entryPoints: ['test/fixtures/sidebar-recent-sessions-browser.tsx'], bundle: true, platform: 'browser',
    format: 'iife', write: false, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })).outputFiles[0].text
})
afterAll(() => browser?.close())

it('persists a flat recent list across folders, restores app history, and leaves the directory order intact', async () => {
  const page = await browser.newPage(), errors = []
  page.setDefaultTimeout(1500)
  page.on('pageerror', e => errors.push(e.message))
  await page.route('https://recent.test/**', route => route.fulfill({ contentType: 'text/html',
    body: '<!doctype html><meta charset=utf-8><style>html,body,#root{height:100%;margin:0;font:14px system-ui}</style><div id="root"></div>' }))
  await page.addInitScript(sources => { window.native = sources }, native)
  async function load() {
    await page.goto('https://recent.test'); await page.addScriptTag({ content: bundle }); await page.addStyleTag({ content: style })
  }
  try {
    await load()
    const toggle = page.getByRole('button', { name: '最近使用的会话', exact: true })
    const recent = page.getByRole('navigation', { name: '最近使用的会话' })
    const titles = () => recent.locator('button > span[data-ui-preserve]').allTextContents()
    const row = id => recent.locator('[data-recent-key="session:' + id + '"]')
    const directories = page.getByRole('button', { name: '测试目录' })
    await expect.poll(async () => errors.length ? errors.join(' | ') : await directories.count()).toBe(1)
    await directories.waitFor()
    expect(await toggle.getAttribute('aria-pressed')).toBe('false')
    const modeBox = await toggle.boundingBox(), searchBox = await page.getByRole('button', { name: '搜索会话' }).boundingBox()
    expect(modeBox.x + modeBox.width).toBeLessThanOrEqual(searchBox.x)
    await toggle.focus(); await page.keyboard.press('Enter')
    await recent.waitFor()
    expect(await directories.count()).toBe(0)
    expect(await titles()).toEqual(['简报', '同名', '同名', '个人看板', '图像画布'])
    expect(await row('review').innerText()).toContain('工作区二')
    expect(await row('product').innerText()).toContain('工作区一')
    expect(await row('product').getByRole('img', { name: '等待审批' }).isVisible()).toBe(true)
    await row('review').click()
    expect(await page.locator('main').textContent()).toBe('review')
    expect(await recent.locator('button').first().getAttribute('aria-current')).toBe('true')
    expect(await recent.locator('button').first().getAttribute('data-recent-key')).toBe('session:review')
    await row('product').click()
    expect(await page.locator('main').textContent()).toBe('product')
    await row('image').click()
    await expect.poll(() => page.locator('main').textContent()).toBe('图像应用 image')
    await recent.getByRole('button', { name: '个人看板' }).click()
    expect(await page.locator('main').textContent()).toBe('研究画板 pin')
    await page.evaluate(() => window.fixture.remove('newest'))
    await expect.poll(titles).not.toContain('简报')
    expect(await page.evaluate(() => localStorage.getItem('sherlock.sidebar.activity.v2'))).toBeNull()
    await page.getByRole('button', { name: '收起侧边栏' }).click()
    await page.waitForSelector('[data-dsh-sidebar-wide=false]')
    expect(await toggle.count()).toBe(0)
    expect(await recent.count()).toBe(0)
    await page.getByRole('button', { name: '打开侧边栏' }).click()
    await recent.waitFor()
    await load()
    await recent.waitFor()
    expect(await recent.locator('button').first().getAttribute('data-recent-key')).toBe('favorite:f')
    await toggle.click()
    await directories.waitFor()
    await directories.click()
    await toggle.click()
    expect(await recent.locator('button').first().getAttribute('data-recent-key')).toBe('session:review')
    expect(errors).toEqual([])
  } catch (error) { if (errors.length) throw new Error(errors.join(" | "), { cause: error }); throw error } finally { await page.close() }
}, 15000)
