import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ResearchCanvasStorage } from '../src/main/state/research-canvas-storage'
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

it('restores order and mode from desktop userData on a different loopback port and migrates legacy records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'odyssey-sidebar-visits-'))
  const modeKey = 'ework.sidebar.session-view.v1', visits = 'ework.sidebar.visits.v1'
  const contexts = []
  async function start(port, migrate = false) {
    const disk = new ResearchCanvasStorage(directory)
    const context = await browser.newContext()
    contexts.push(context)
    await context.route(/^http:\/\/127\.0\.0\.1:/, route => {
      if (new URL(route.request().url()).pathname !== '/desktop-storage')
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><div id="root"></div>' })
      const [op, key, value] = route.request().postDataJSON()
      const reply = op === 'read' ? disk.getItem(key) : disk.setItem(key, value)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(reply) })
    })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:' + port)
    await page.evaluate(({ sources, migrate }) => {
      window.native = sources
      // The production preload exposes synchronous IPC to these native methods.
      const ipc = (op, key, value) => {
        const request = new XMLHttpRequest()
        request.open('POST', '/desktop-storage', false)
        request.setRequestHeader('Content-Type', 'application/json')
        request.send(JSON.stringify([op, key, value]))
        return JSON.parse(request.responseText)
      }
      window.dshDesktop = { researchCanvasStorage: {
        getItem: key => ipc('read', key), setItem: (key, value) => ipc('write', key, value)
      } }
      if (migrate) {
        localStorage.setItem('ework.sidebar.session-view.v1', 'recent')
        localStorage.setItem('ework.sidebar.visit.v1:review', '150')
        localStorage.setItem('sherlock.sidebar.activity.v2', JSON.stringify({ product: 140 }))
      }
    }, { sources: native, migrate })
    await page.addScriptTag({ content: bundle })
    await page.addStyleTag({ content: style })
    return { page, disk, context, rows: page.locator('[data-sidebar-recent-list] [data-recent-key]'),
      toggle: page.locator('[data-sidebar-session-view]') }
  }
  try {
    const first = await start(4317, true)
    await first.rows.first().waitFor()
    expect(await first.rows.first().getAttribute('data-recent-key')).toBe('session:review')
    expect(first.disk.getItem(modeKey)).toBe('recent')
    expect(new Map(JSON.parse(first.disk.getItem(visits))).get('product')).toBe(140)
    await first.page.locator('[data-recent-key="session:image"]').click()
    await first.page.evaluate(() => {
      const at = Date.now() + 10
      localStorage.setItem('sherlock.sidebar.activity.v2', JSON.stringify({ product: at }))
      document.dispatchEvent(new Event('sherlock-sidebar-recency'))
    })
    await first.context.close()

    const second = await start(5726)
    await second.rows.first().waitFor()
    expect(await second.page.evaluate(() => localStorage.length)).toBe(0)
    expect(await second.rows.evaluateAll(rows => rows.slice(0, 3).map(row => row.dataset.recentKey)))
      .toEqual(['session:product', 'session:image', 'session:review'])
    await second.toggle.click()
    expect(second.disk.getItem(modeKey)).toBe('directory')
    await second.context.close()

    const third = await start(3914)
    await third.toggle.waitFor()
    expect(await third.toggle.getAttribute('aria-pressed')).toBe('false')
    // An older renderer may submit a delayed write for one session only.
    expect(third.disk.setItem(visits, JSON.stringify([['review', 100], ['elsewhere', 80]]))).toBe(true)
    expect(third.disk.setItem(visits, '[["invalid","now"]]')).toBe(false)
    expect(third.disk.setItem(modeKey, 'other')).toBe(false)
    const restored = new Map(JSON.parse(new ResearchCanvasStorage(directory).getItem(visits)))
    expect(restored.get('review')).toBe(150)
    expect(restored.get('image')).toBeGreaterThan(150)
    expect(restored.get('elsewhere')).toBe(80)
  } finally {
    for (const context of contexts) await context.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15000)
