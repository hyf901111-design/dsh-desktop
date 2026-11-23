import { beforeAll, afterAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const { PNG } = createRequire(import.meta.url)('pngjs') as {
  PNG: { sync: { read(buffer: Buffer): { width: number; data: Buffer } } }
}

let browser: any, script: string, sidebarSource: string, layoutSource: string, style: string
beforeAll(async () => {
  const runtime = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT ||
    '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await runtime.chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM ||
    '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
  sidebarSource = (await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js', 'utf8'))
    .replace('exports.apply = apply;', 'exports.Root = SidebarRoot; exports.zh = zh; exports.apply = apply;')
  layoutSource = await readFile('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js', 'utf8')
  style = (await Promise.all(['figma-panels.css', 'figma-b-icons.css', 'navigation-shortcuts.css']
    .map(file => readFile('src/preload/' + file, 'utf8')))).join('\n')
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import React from 'react'
      import * as jsx from 'react/jsx-runtime'
      import {createRoot} from 'react-dom/client'
      import * as reactDOM from 'react-dom'
      import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
      import {SidebarSessionSearch} from './src/preload/research-boards-ui'
      import {sidebarSearchResults} from './src/preload/sidebar-session-search'
      const plugins={}
      const modules={'react':React,'react/jsx-runtime':jsx,'react-dom':reactDOM,'@deepseek-ai/dsh-client-ui-primitives':primitives}
      window.__ModuleLoader__={load:({id,factory})=>{plugins[id]=factory(name=>modules[name]??{})}}
      new Function(window.layoutSource)()
      new Function(window.sidebarSource)()
      const sidebar=plugins['@deepseek-ai/dsh-client-ui-sidebar'], layout=plugins['@deepseek-ai/dsh-client-ui-layout']
      const records=Object.fromEntries(Array.from({length:8},(_,i)=>['s'+i,{title:'会话 '+i,updatedAt:20-i}]))
      records.orphan={title:'独立会话'}; records.other={title:'回顾会话'}; records.archived={title:'已归档'}; records.sub={title:'子代理',origin:'subagent'}
      const boards={favorites:[{favoriteId:'f',sessionId:'personal',title:'个人看板',createdAt:90}],boards:[{boardId:'team',localSessionId:'shared',title:'共享看板',pinned:true,createdAt:100}]}
      let current='s1',collapsed=true,empty=false
      const events=[],listeners=new Set()
      const workspace={workspaceId:'a',title:'产品研究',path:'/product',sessionIds:Object.keys(records).filter(id=>id!=='orphan'&&id!=='other')}
      const page={current:()=>current,searchSessions:q=>empty?[]:sidebarSearchResults(boards,records,['archived'],q),
        sidebarWorkspaces:()=>[workspace,{workspaceId:'b',title:'阶段回顾',path:'/review',sessionIds:['other']}],subscribeSearch:f=>{listeners.add(f);return()=>listeners.delete(f)},
        openSearchSession:id=>{current=id;events.push(['session',id])},openBoard:id=>events.push(['board',id]),openPersonal:id=>events.push(['favorite',id]),
        showError:e=>{throw e}}
      document.addEventListener('sherlock:search-session-opened',e=>events.push(['opened',e.detail.sessionId??null]))
      const root=createRoot(document.querySelector('#root'))
      const actions={setNarrow:()=>{},toggleSidebar:()=>{collapsed=!collapsed;render()}}
      const renderSlot=(slot,props)=>{
        if(slot==='conversation') return React.createElement('button',{style:{alignSelf:'flex-end'}},'其他')
        if(slot==='sidebar') return React.createElement(sidebar.Root,{...props,openHome:()=>events.push(['home']),
          startSession:()=>{},startResearchSession:()=>{},toggleSidebar:actions.toggleSidebar,t:k=>sidebar.zh[k]??k,
          renderSlot:(name,owner)=>name==='sidebar.sessionSearch'?React.createElement(SidebarSessionSearch,{page,...owner}):null})
        return null
      }
      const render=()=>root.render(React.createElement(layout.AppFrame,{actions,renderSlot,
        useStore:select=>select({sidebar:collapsed?0:240,narrowExpanded:!collapsed}),useSessions:select=>select({})}))
      render()
      window.fixture={events,listeners,clear:()=>{empty=true;listeners.forEach(f=>f())},rename:()=>{records.s1.title='更新后的标题';listeners.forEach(f=>f())},expand:()=>{collapsed=false;render()}}
    ` },
    bundle: true, platform: 'browser', format: 'iife', write: false, logLevel: 'silent', loader: { '.css': 'empty' },
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = bundle.outputFiles[0]!.text
})
afterAll(() => browser?.close())
async function fixture() {
  const page = await browser.newPage({ viewport: { width: 780, height: 480 } })
  const errors: string[] = []
  page.on('pageerror', (error: Error) => errors.push(error.message))
  page.setDefaultTimeout(2000)
  await page.route('https://sidebar.test/**', (route: any) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><title>Sidebar</title><style>html,body,#root{height:100%;margin:0;font:14px system-ui}</style><div id="root"></div>'
  }))
  await page.goto('https://sidebar.test')
  await page.evaluate((sources: Record<string, string>) => { Object.assign(window, sources) }, { sidebarSource, layoutSource })
  await page.addScriptTag({ content: script })
  await page.addStyleTag({ content: style })
  const home = page.locator('[data-sidebar-home]'), panel = page.getByRole('navigation', { name: '切换会话' })
  await expect.poll(async () => (errors.length ? errors.join(' | ') : await home.count() ? home.getAttribute('aria-controls') : 'initializing'), { timeout: 2000 }).toBe('ework-sidebar-session-switcher')
  return { page, home, panel }
}
it('switches in live board and workspace groups while the native sidebar stays folded', async () => {
  const { page, home, panel } = await fixture()
  try {
    await page.setViewportSize({ width: 780, height: 340 })
    await home.hover()
    await panel.waitFor()
    const box = await home.boundingBox(), list = await panel.boundingBox()
    const pane = await page.locator('[data-dsh-frame] > [data-pane="conversation"]').boundingBox()
    const rail = await page.locator('.pI_x6G_sidebarCol').boundingBox()
    expect(pane.y).toBeGreaterThan(0)
    expect(list.y).toBe(pane.y)
    expect(list.x).toBe(rail.x + rail.width)
    expect(list.x).toBe(pane.x)
    expect(await panel.evaluate((el: HTMLElement) => ({
      border: getComputedStyle(el).borderWidth,
      radius: getComputedStyle(el).borderRadius,
      scrollbar: getComputedStyle(el).scrollbarWidth,
      blur: getComputedStyle(el).backdropFilter
    }))).toEqual({ border: '0px', radius: '12px', scrollbar: 'none', blur: 'blur(32px)' })
    const homeRight = box.x + box.width, crossingY = box.y + box.height / 2
    expect(homeRight).toBeLessThan(list.x)
    await page.mouse.move(homeRight + 1, crossingY, { steps: 8 })
    await page.mouse.move((homeRight + list.x) / 2, crossingY + box.height, { steps: 8 })
    await page.waitForTimeout(240)
    expect(await panel.isVisible()).toBe(true)
    await page.mouse.move(list.x + 4, crossingY + box.height, { steps: 4 })
    await panel.hover()
    await page.mouse.wheel(0, 250)
    await expect.poll(() => panel.evaluate((el: HTMLElement) => el.scrollTop)).toBeGreaterThan(0)
    await page.mouse.wheel(0, -600)
    await expect.poll(() => panel.evaluate((el: HTMLElement) => el.scrollTop)).toBe(0)
    expect(list.y + list.height).toBe(332)
    expect(await panel.getByRole('heading').allTextContents()).toEqual(['看板区', '产品研究', '阶段回顾', '未分组'])
    expect(await panel.getByRole('button', { name: '会话 7' }).count()).toBe(0)
    expect(await panel.getByRole('button', { name: /已归档|子代理/ }).count()).toBe(0)
    expect(await panel.locator('[aria-current=true]').textContent()).toBe('会话 1')
    await page.evaluate(() => (window as any).fixture.rename())
    await panel.getByRole('button', { name: '更新后的标题' }).waitFor()
    await panel.getByRole('button', { name: '展开显示' }).click()
    await panel.getByRole('button', { name: '会话 7' }).click()
    await panel.waitFor({ state: 'detached' })
    expect(await page.locator('[data-dsh-sidebar-root]').getAttribute('data-dsh-sidebar-wide')).toBe('false')
    expect(await page.evaluate(() => (window as any).fixture.events)).toEqual([['session','s7'], ['opened','s7']])
    await home.hover(); await panel.getByRole('button', { name: '共享看板' }).click()
    await home.hover(); await panel.getByRole('button', { name: '个人看板' }).click()
    expect(await page.evaluate(() => (window as any).fixture.events.slice(-4))).toEqual([['board','team'],['opened',null],['favorite','personal'],['opened',null]])
  } finally { await page.close() }
})
it('collapses each group independently and keeps the active group reachable from the keyboard', async () => {
  const { page, home, panel } = await fixture()
  try {
    await home.hover()
    const boards = panel.getByRole('button', { name: '看板区' })
    const product = panel.getByRole('button', { name: '产品研究' })
    const review = panel.getByRole('button', { name: '阶段回顾' })
    const ungrouped = panel.getByRole('button', { name: '未分组' })
    await panel.getByRole('button', { name: '展开显示' }).click()
    await product.click()
    await boards.click()
    await ungrouped.click()
    expect(await product.getAttribute('aria-expanded')).toBe('false')
    expect(await review.getAttribute('aria-expanded')).toBe('true')
    expect(await panel.getByRole('button', { name: '会话 7' }).count()).toBe(0)
    expect(await panel.getByRole('button', { name: '共享看板' }).count()).toBe(0)
    expect(await panel.getByRole('button', { name: '独立会话' }).count()).toBe(0)
    await panel.getByRole('button', { name: '回顾会话' }).waitFor()

    await product.focus()
    await page.keyboard.press('Space')
    expect(await page.locator(':focus').textContent()).toBe('产品研究')
    await panel.getByRole('button', { name: '会话 7' }).waitFor()
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    expect(await page.locator(':focus').textContent()).toBe('阶段回顾')

    await page.keyboard.press('Escape')
    await page.keyboard.press('ArrowDown')
    expect(await page.locator(':focus').textContent()).toBe('产品研究')
    expect(await product.getAttribute('aria-expanded')).toBe('false')
    await page.evaluate(() => (window as any).fixture.rename())
    expect(await product.getAttribute('aria-expanded')).toBe('false')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    expect(await page.locator(':focus').textContent()).toBe('更新后的标题')
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => (window as any).fixture.events)).toEqual([['session','s1'], ['opened','s1']])
  } finally { await page.close() }
})

it('softens fine background detail while transmitting a muted background color through the native popover', async () => {
  const { page, home, panel } = await fixture()
  try {
    await page.locator('[data-pane="conversation"]').evaluate((pane: HTMLElement) => {
      pane.style.position = 'relative'
      pane.style.background = 'linear-gradient(90deg,rgb(32,78,130) 154px,rgb(228,180,42) 154px)'
      const grid = document.createElement('div')
      grid.id = 'switcher-texture'
      grid.style.cssText = 'position:absolute;inset:50% 0 0;background:repeating-conic-gradient(black 0 25%,white 0 50%) 0/8px 8px'
      pane.append(grid)
      ;(window as any).fixture.clear()
    })
    await home.hover()
    await panel.getByText('暂无会话').waitFor()
    const bounds = await panel.boundingBox()
    const picture = PNG.sync.read(await page.screenshot({ clip: bounds, scale: 'css' }))
    const red = (x: number, y: number) => picture.data[(y * picture.width + x) * 4]!
    const transmitted = red(256, 110) - red(52, 110)
    expect(transmitted).toBeGreaterThan(30)
    expect(transmitted).toBeLessThan(42)
    expect(red(52, 110)).toBeLessThan(10)
    const fine = Array.from({ length: 20 }, (_, x) => red(80 + x, 320))
    expect(Math.max(...fine) - Math.min(...fine)).toBeLessThan(3)
    await page.locator('[data-pane="conversation"]').evaluate((pane: HTMLElement) => {
      pane.style.cssText += ';background:white;border-radius:0'
      pane.querySelector('#switcher-texture')!.remove()
    })
    const corners = PNG.sync.read(await page.screenshot({ clip: bounds, scale: 'css' }))
    for (const x of [1, bounds.width - 2]) {
      for (const y of [1, bounds.height - 2]) {
        expect(corners.data[(y * corners.width + x) * 4]).toBeGreaterThan(180)
        const insetX = x === 1 ? x + 14 : x - 14
        expect(corners.data[(y * corners.width + insetX) * 4]).toBeLessThan(70)
      }
    }
    expect(await panel.evaluate((el: HTMLElement) => getComputedStyle(el.parentElement!, '::backdrop').backgroundColor)).toBe('rgba(0, 0, 0, 0)')
  } finally { await page.close() }
})

it('follows the rounded workspace while the panel is open across window sizes and frame insets', async () => {
  const { page, home, panel } = await fixture()
  try {
    await home.focus()
    await page.keyboard.press('ArrowDown')
    const pane = page.locator('[data-dsh-frame] > [data-pane="conversation"]')
    const viewports = [[1440, 900], [780, 480], [360, 400]] as const
    for (const [width, height] of viewports) {
      await page.setViewportSize({ width, height })
      const bounds = await pane.boundingBox(), list = await panel.boundingBox()
      expect([list.x, list.y, list.width, list.y + list.height]).toEqual([
        bounds.x, bounds.y, Math.min(308, width - bounds.x - 8), height - 8
      ])
      expect(await panel.locator('[aria-current=true]').evaluate((el: HTMLElement) => el === document.activeElement)).toBe(true)
    }
    await page.locator('[data-dsh-frame]').evaluate((frame: HTMLElement) => {
      frame.style.gridTemplateColumns = '96px minmax(0, 1fr) 0px'
      frame.querySelector<HTMLElement>('[data-pane="conversation"]')!.style.marginTop = '22px'
    })
    const moved = await panel.boundingBox()
    expect([moved.x, moved.y]).toEqual([96, 22])
    await page.keyboard.press('Escape')
    expect(await home.evaluate((el: HTMLElement) => el === document.activeElement)).toBe(true)
  } finally { await page.close() }
})
it('preserves Home activation and releases the floating panel on leave, Escape, outside click and expansion', async () => {
  const { page, home, panel } = await fixture()
  try {
    await home.focus(); await page.keyboard.press('ArrowDown')
    expect(await page.locator(':focus').textContent()).toBe('会话 1')
    await page.keyboard.press('ArrowDown')
    expect(await page.locator(':focus').textContent()).toBe('会话 2')
    await page.keyboard.press('Escape')
    expect(await home.evaluate((el: HTMLElement) => el === document.activeElement)).toBe(true)
    expect(await home.getAttribute('aria-expanded')).toBe('false')
    await page.keyboard.press('Enter')
    expect(await page.evaluate(() => (window as any).fixture.events)).toEqual([['home']])
    await home.hover(); await panel.waitFor()
    await page.mouse.move(730,300); await panel.waitFor({ state: 'detached' })
    await home.hover(); await panel.waitFor()
    await page.getByRole('button', { name: '其他' }).click(); await panel.waitFor({ state: 'detached' })
    await home.hover(); await panel.waitFor()
    await page.evaluate(() => (window as any).fixture.expand())
    await home.waitFor({ state: 'detached' }); await panel.waitFor({ state: 'detached' })
    expect(await page.evaluate(() => (window as any).fixture.listeners.size)).toBe(0)
  } finally { await page.close() }
})

it('keeps the empty panel usable in English and dark appearance', async () => {
  const { page, home, panel } = await fixture()
  try {
    await home.hover(); await panel.waitFor()
    await page.evaluate(() => {
      document.body.setAttribute('data-ds-dark-theme', '')
      document.documentElement.dataset.odysseyLocale = 'en'
      ;(window as any).fixture.clear()
    })
    const empty = page.getByRole('navigation', { name: 'Switch conversation' })
    await empty.getByText('No conversations yet').waitFor()
    expect(await empty.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0.82)')
    await home.focus(); await page.keyboard.press('ArrowDown')
    expect(await empty.evaluate((el: HTMLElement) => el === document.activeElement)).toBe(true)
    await page.keyboard.press('Escape')
    expect(await home.getAttribute('aria-expanded')).toBe('false')
  } finally { await page.close() }
})
