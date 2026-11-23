import { beforeAll, afterAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

let browser: any, script: string, sidebarSource: string, style: string
beforeAll(async () => {
  const runtime = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT ||
    '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await runtime.chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM ||
    '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
  sidebarSource = (await readFile('node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js', 'utf8'))
    .replace('exports.apply = apply;', 'exports.Root = SidebarRoot; exports.zh = zh; exports.apply = apply;')
  style = await readFile('src/preload/navigation-shortcuts.css', 'utf8')
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import React from 'react'
      import * as jsx from 'react/jsx-runtime'
      import {createRoot} from 'react-dom/client'
      import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
      import {SidebarSessionSearch} from './src/preload/research-boards-ui'
      import {sidebarSearchResults} from './src/preload/sidebar-session-search'
      let sidebar
      window.__ModuleLoader__={load:({factory})=>{sidebar=factory(name=>name==='react'?React:name==='react/jsx-runtime'?jsx:name==='@deepseek-ai/dsh-client-ui-primitives'?primitives:{})}}
      new Function(window.sidebarSource)()
      const records=Object.fromEntries(Array.from({length:8},(_,i)=>['s'+i,{title:'会话 '+i,updatedAt:20-i}]))
      records.orphan={title:'独立会话'}; records.archived={title:'已归档'}; records.sub={title:'子代理',origin:'subagent'}
      const boards={favorites:[{favoriteId:'f',sessionId:'personal',title:'个人看板',createdAt:90}],boards:[{boardId:'team',localSessionId:'shared',title:'共享看板',pinned:true,createdAt:100}]}
      let current='s1',collapsed=true,empty=false
      const events=[],listeners=new Set()
      const workspace={workspaceId:'a',title:'产品研究',path:'/product',sessionIds:Object.keys(records).filter(id=>id!=='orphan')}
      const page={current:()=>current,searchSessions:q=>empty?[]:sidebarSearchResults(boards,records,['archived'],q),
        sidebarWorkspaces:()=>[workspace],subscribeSearch:f=>{listeners.add(f);return()=>listeners.delete(f)},
        openSearchSession:id=>{current=id;events.push(['session',id])},openBoard:id=>events.push(['board',id]),openPersonal:id=>events.push(['favorite',id]),
        showError:e=>{throw e}}
      document.addEventListener('sherlock:search-session-opened',e=>events.push(['opened',e.detail.sessionId??null]))
      const root=createRoot(document.querySelector('#root'))
      const render=()=>root.render(React.createElement(sidebar.Root,{collapsed,width:240,openHome:()=>events.push(['home']),
        startSession:()=>{},startResearchSession:()=>{},toggleSidebar:()=>{collapsed=!collapsed;render()},t:k=>sidebar.zh[k]??k,
        renderSlot:(name,owner)=>name==='sidebar.sessionSearch'?React.createElement(SidebarSessionSearch,{page,...owner}):null}))
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
    contentType: 'text/html', body: '<!doctype html><meta charset=utf-8><style>body{margin:0;font:14px system-ui}[data-dsh-sidebar-root]{box-sizing:border-box;width:64px;height:100vh;padding:12px}button{height:32px}[data-sidebar-home]{width:36px}main{position:fixed;right:10px;top:10px}</style><div id="root"></div><main><button>其他</button></main>'
  }))
  await page.goto('https://sidebar.test')
  await page.addStyleTag({ content: style })
  await page.evaluate((text: string) => { (window as any).sidebarSource = text }, sidebarSource)
  await page.addScriptTag({ content: script })
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
    expect(list.y).toBe(0)
    expect(await panel.evaluate((el: HTMLElement) => ({
      scrollbar: getComputedStyle(el).scrollbarWidth,
      blur: getComputedStyle(el).backdropFilter
    }))).toEqual({ scrollbar: 'none', blur: 'blur(24px)' })
    await panel.hover()
    await page.mouse.wheel(0, 250)
    await expect.poll(() => panel.evaluate((el: HTMLElement) => el.scrollTop)).toBeGreaterThan(0)
    await page.mouse.wheel(0, -600)
    await expect.poll(() => panel.evaluate((el: HTMLElement) => el.scrollTop)).toBe(0)
    expect(list.x).toBeGreaterThan(box.x + box.width)
    expect(list.y + list.height).toBe(332)
    await page.mouse.move((box.x + box.width + list.x) / 2, box.y + 10)
    await page.waitForTimeout(280)
    await panel.getByRole('heading', { name: '产品研究' }).hover()
    expect(await panel.getByRole('heading').allTextContents()).toEqual(['看板区', '产品研究', '未分组'])
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
    expect(await empty.evaluate((el: HTMLElement) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0.66)')
    await home.focus(); await page.keyboard.press('ArrowDown')
    expect(await empty.evaluate((el: HTMLElement) => el === document.activeElement)).toBe(true)
    await page.keyboard.press('Escape')
    expect(await home.getAttribute('aria-expanded')).toBe('false')
  } finally { await page.close() }
})
