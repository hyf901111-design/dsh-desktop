import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
let browser, script
beforeAll(async () => {
  const result = await build({ stdin: { contents: "import {mountDesktopShellStyles} from './src/preload/shell-style';import {mountWindowResize} from './src/preload/window-resize';import {mountWorkspaceTopbarStyles} from './src/preload/workspace-topbar';mountDesktopShellStyles(document);mountWorkspaceTopbarStyles(document);window.mountWindowResize=mountWindowResize", resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'browser', write: false,
    plugins: [{ name: 'styles', setup(b) {
      b.onResolve({ filter: /\?(raw|inline)$/ }, async a => {
        const result = await b.resolve(a.path.replace(/\?(raw|inline)$/, ''), {resolveDir:a.resolveDir,kind:'import-statement'})
        return {path:result.path,namespace:'style-text',pluginData:{inline:a.path.endsWith('?inline')}}
      })
      b.onLoad({ filter: /.*/, namespace: 'style-text' }, async a => {
        const content = await readFile(a.path, 'utf8')
        return {contents:a.pluginData.inline ? 'data:image/svg+xml,'+encodeURIComponent(content) : content,loader:'text'}
      })
    } }] })
  script = result.outputFiles[0].text
  const { chromium } = await import(pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => browser?.close())

it.each(['spreadsheet', 'research', 'conversation'])('moves the macOS window from the blank %s session header', async view => {
 const page=await browser.newPage()
 try {
  await page.setContent(`<div class="pI_x6G_centerCol"><main class="wSkVaW_root" data-odyssey-page="${view}">
   <header class="wSkVaW_header" data-srb-session-header>
    <div class="wSkVaW_titleRow"><button>会话标题</button></div>
    <div data-session-workspace-controls><button>展开工作区页签</button></div>
    <div data-srb-utilities><button>更多</button></div>
   </header>
  </main></div>`)
  await page.addScriptTag({content:script})
  await page.evaluate(()=>{window.operations=[];window.mountWindowResize(document,operation=>window.operations.push(operation))})
  const header=page.locator('[data-srb-session-header]')
  const handle=await header.boundingBox()
  const x=handle.x+handle.width/2, y=handle.y+handle.height/2
  await page.mouse.move(x,y)
  await page.mouse.down()
  await page.mouse.move(x+60,y+24)
  await page.mouse.up()
  const completed=['move',{dx:60,dy:24},null]
  expect(await page.evaluate(()=>window.operations)).toEqual(completed)
  await page.getByRole('button',{name:'展开工作区页签'}).click()
  await page.evaluate(()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');document.body.append(menu)})
  await page.mouse.click(x,y)
  expect(await page.evaluate(()=>window.operations)).toEqual(completed)
  expect(await header.evaluate(node=>getComputedStyle(node).webkitAppRegion)).toBe('no-drag')
 } finally {await page.close()}
})

it.each([false,true])('uses a continuous spreadsheet header and canvas backdrop (dark: %s)', async dark => {
 const page=await browser.newPage()
 try {
  await page.setContent(`<div class="pI_x6G_centerCol"><main class="wSkVaW_root" data-odyssey-page="spreadsheet">
   <header class="wSkVaW_header" data-srb-session-header></header>
   <div data-conversation-scroll><div class="ew-sheet"></div></div>
  </main></div>`)
  await page.addScriptTag({content:script})
  await page.addStyleTag({path:'src/preload/spreadsheet/view.css'})
  await page.evaluate(dark=>document.body.toggleAttribute('data-ds-dark-theme',dark),dark)
  const colors=await page.locator('main').evaluate(node=>{
   const style=getComputedStyle(node.querySelector('header'))
   return {canvas:getComputedStyle(node).backgroundColor, sheet:getComputedStyle(node.querySelector('.ew-sheet')).backgroundColor,
    header:style.backgroundColor, filter:style.backdropFilter}
  })
  expect(colors.canvas).toBe(colors.sheet)
  expect(colors.header).toBe('rgba(0, 0, 0, 0)')
  expect(colors.filter).toBe('none')
 } finally {await page.close()}
})

it('forwards the macOS home header space to window movement and skips it when a menu is open', async () => {
 const page=await browser.newPage()
 try {
  await page.setContent('<div style="height:42px;margin:12px 60px" data-odyssey-window-move></div><button type="button">菜单</button>')
  await page.addScriptTag({content:script})
  await page.evaluate(()=>{window.operations=[];window.mountWindowResize(document,operation=>window.operations.push(operation))})
  const drag=page.locator('[data-odyssey-window-move]')
  const handle=await drag.boundingBox()
  expect(await drag.evaluate(node=>getComputedStyle(node).webkitAppRegion)).toBe('no-drag')
  await page.mouse.move(handle.x+50,handle.y+20)
  await page.mouse.down()
  await page.mouse.move(handle.x+90,handle.y+40)
  await page.mouse.up()
  const completed=['move',{dx:40,dy:20},null]
  expect(await page.evaluate(()=>window.operations)).toEqual(completed)
  await page.evaluate(()=>{const menu=document.createElement('div');menu.setAttribute('role','menu');document.body.append(menu)})
  await drag.click()
  expect(await page.evaluate(()=>window.operations)).toEqual(completed)
 } finally {await page.close()}
})
it.each(['home', 'research'])('keeps the portaled panel button clickable over the %s drag header', async view => {
  const page = await browser.newPage()
  try {
    await page.setContent(`<div data-odyssey-page="${view}"><header class="wSkVaW_header"><button>对话</button></header></div><div data-dsh-panel-host data-odyssey-panel-right="closed"><div class="t8lSSG_toggleCluster"><button data-odyssey-panel-entry="right">展开侧边栏</button></div></div>`)
    await page.addScriptTag({ content: script })
    expect(await page.locator('header').evaluate(e => getComputedStyle(e).webkitAppRegion)).toBe('drag')
    for (const selector of ['header button', '.t8lSSG_toggleCluster', '[data-odyssey-panel-entry]']) {
      expect(await page.locator(selector).evaluate(e => getComputedStyle(e).webkitAppRegion)).toBe('no-drag')
    }
    expect(await page.locator('[data-odyssey-panel-entry]').evaluate(e => e.closest('header'))).toBeNull()
  } finally { await page.close() }
})

it('temporarily releases native header dragging while the mode menu is open', async () => {
 const page=await browser.newPage()
 try {
  await page.setContent('<header class="wSkVaW_header"><div class="wSkVaW_titleRow"><button class="cubgiG_seat" aria-expanded="false">模式</button></div></header>')
  await page.addScriptTag({content:script})
  const header=page.locator('header')
  expect(await header.evaluate(e=>getComputedStyle(e).webkitAppRegion)).toBe('drag')
  await page.locator('button').evaluate(e=>e.setAttribute('aria-expanded','true'))
  expect(await header.evaluate(e=>getComputedStyle(e).webkitAppRegion)).toBe('no-drag')
  await page.locator('button').evaluate(e=>e.setAttribute('aria-expanded','false'))
  expect(await header.evaluate(e=>getComputedStyle(e).webkitAppRegion)).toBe('drag')
 } finally {await page.close()}
})

it('makes only the reserved macOS sidebar strip draggable and keeps logo cursor neutral', async () => {
 const page=await browser.newPage()
 try {
  await page.setContent('<div id="dsh-desktop-drag-region"></div><aside class="hHd-Xa_root" style="width:306px;height:900px"><button class="hHd-Xa_brand" style="cursor:pointer"><span>Logo</span></button><button class="hHd-Xa_iconButton" style="cursor:pointer">搜索</button></aside>')
  await page.addScriptTag({content:script})
  expect(await page.locator('.dsh-sidebar-drag-region').evaluate(e=>{const s=getComputedStyle(e);return [s.webkitAppRegion,s.left,s.top,s.height]})).toEqual(['drag','80px','10px','34px'])
  await page.locator('.hHd-Xa_brand').hover()
  expect(await page.locator('.hHd-Xa_brand span').evaluate(e=>getComputedStyle(e).cursor)).toBe('default')
  expect(await page.locator('.hHd-Xa_iconButton').evaluate(e=>getComputedStyle(e).cursor)).toBe('pointer')
  await page.locator('aside').evaluate(e=>e.classList.add('hHd-Xa_collapsed'))
  expect(await page.locator('.dsh-sidebar-drag-region').evaluate(e=>getComputedStyle(e).display)).toBe('none')
 } finally {await page.close()}
})
