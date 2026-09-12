import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { afterAll, beforeAll, expect, it } from 'vitest'

let browser, script
const css = ['figma-settings.css', 'figma-refinements.css'].map(n => readFileSync(`src/preload/${n}`, 'utf8')).join('\n')
beforeAll(async () => {
  script = (await build({ stdin: { resolveDir: process.cwd(), contents: `import {mountFigmaScrollbars} from './src/preload/figma-scrollbars'; window.disposeBars=mountFigmaScrollbars(document,true);` }, bundle: true, platform: 'browser', format: 'iife', write: false })).outputFiles[0].text
  const mod = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (mod.default ?? mod).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
async function open(width, settings = true) {
  const page = await browser.newPage({ viewport: { width, height: 641 } })
  await page.route('**/*', route => route.abort())
  // Settings is a fixed surface mounted inside the live sidebar footer, not a
  // body portal. The collapsed main/sidebar stay mounted behind it, as in v16.
  await page.setContent(`<style>
    *{box-sizing:border-box}body{margin:0;--odyssey-scroll-ink:0 0 0}
    [data-dsh-sidebar-root]{position:fixed;left:0;top:0;width:${width <= 1025 ? 80 : 280}px;height:100vh}
    #sidebar-list{height:200px;margin-top:100px;overflow-y:auto;padding-right:16px}
    .VOzbGW_overlay{position:fixed;inset:0;display:flex}.VOzbGW_panel{display:flex}.VOzbGW_content{flex:1}.VOzbGW_options{height:100%}
    .VOzbGW_nav{display:flex;flex-direction:column}.settings-fixture-content{height:1000px}
    #main-conversation{position:fixed;left:300px;top:66px;width:360px;height:480px;overflow:auto}
    .t8lSSG_panel{position:fixed;right:10px;top:10px;width:340px;height:621px}
    .t8lSSG_panelBody{height:100%}#reader{position:absolute;left:16px;right:16px;top:56px;height:240px;overflow:auto}
    .sRp_messages{position:absolute;left:16px;right:16px;top:320px;height:240px}.Md3f7G_scroll{height:100%;overflow:auto}
    .long{height:1400px} ${css}
    </style><div class="pI_x6G_frame"><div class="pI_x6G_sidebarCol"><div>
    <div data-dsh-sidebar-root class="hHd-Xa_root ${width <= 1025 ? 'hHd-Xa_collapsed hHd-Xa_railIn' : ''}">
      <div class="hHd-Xa_regionArea"><div id="sidebar-list"><div class="long">会话列表</div></div></div>
      <div class="hHd-Xa_footArea"><div class="hHd-Xa_settingsArea"><div>
      ${settings ? `<div class="VOzbGW_overlay"><div class="VOzbGW_mask"></div><div class="VOzbGW_panel"><nav class="VOzbGW_nav"><button>返回应用</button><button>通用设置</button></nav><main class="VOzbGW_content"><div class="VOzbGW_options"><div class="settings-fixture-content"><h1>通用设置</h1><button>主题</button></div></div></main></div></div>` : ''}
      </div></div></div></div></div></div>
      <main id="main-conversation"><div class="long">普通主会话</div></main>
      <aside class="t8lSSG_panel"><section class="t8lSSG_panelBody"><article id="reader"><div class="long">文件预览</div></article><div class="sRp_messages"><div class="Md3f7G_scroll"><div class="long">右侧对话</div></div></div></section></aside>
    </div>`)
  await page.addScriptTag({ content: script })
  return page
}
async function geometry(page, selector) {
  return page.locator(selector).evaluate(port => {
    const r=port.getBoundingClientRect()
    const track=[...document.querySelectorAll('.odyssey-scroll-track')].find(t=>!t.hidden && Math.abs(t.getBoundingClientRect().top-r.top)<.1 && Math.abs(t.getBoundingClientRect().height-r.height)<.1)
    const t=track.getBoundingClientRect(), thumb=track.firstElementChild.getBoundingClientRect()
    return {port:{left:r.left,right:r.right,top:r.top,height:r.height},track:{left:t.left,right:t.right},thumb:{x:thumb.x,y:thumb.y,width:thumb.width,height:thumb.height},hit:document.elementFromPoint(thumb.x+thumb.width/2,thumb.y+thumb.height/2)?.className,scroll:port.scrollTop}
  })
}
for (const width of [840,1025,1380]) it(`keeps Settings scrollbar on its own visible content edge at ${width}px with the main sidebar mounted`, async () => {
  const page=await open(width)
  try {
    await expect.poll(async()=> (await geometry(page,'.VOzbGW_options')).track.right).toBe(width-12)
    const start=await geometry(page,'.VOzbGW_options')
    expect(start.port.left).toBe(width <= 900 ? 200 : 240)
    await expect.poll(async()=> (await geometry(page,'.VOzbGW_options')).hit).toBe('odyssey-scroll-thumb')
    await page.mouse.move(start.thumb.x+2,start.thumb.y+20); await page.mouse.down(); await page.mouse.move(start.thumb.x+2,start.thumb.y+100,{steps:5}); await page.mouse.up()
    expect((await geometry(page,'.VOzbGW_options')).scroll).toBeGreaterThan(0)
    await page.locator('.VOzbGW_options').evaluate(el=>{el.scrollTop=el.scrollHeight})
    await expect.poll(async()=> (await geometry(page,'.VOzbGW_options')).track.right).toBe(width-12)
    await page.locator('body').evaluate(el=>el.setAttribute('data-ds-dark-theme',''))
    await expect.poll(async()=> (await geometry(page,'.VOzbGW_options')).hit).toBe('odyssey-scroll-thumb')
    // The Settings navigation is also independent from the main sidebar. A
    // long navigation list must use its own edge, not the content's edge.
    await page.locator('.VOzbGW_nav').evaluate(el=>{
      const content=document.createElement('div');content.style.cssText='height:1000px;flex:none';el.append(content)
    })
    await expect.poll(async()=> (await geometry(page,'.VOzbGW_nav')).track.right).toBe(width <= 900 ? 200 : 240)
    await page.locator('.VOzbGW_overlay').evaluate(el=>el.remove())
    await expect.poll(()=>page.locator('.odyssey-scroll-track:not([hidden])').count()).toBe(3)
    expect(await page.locator('#main-conversation').getAttribute('data-odyssey-scrollport')).toBeNull()
  } finally { await page.close() }
})
it('preserves sidebar, inset file reader and panel-edge conversation placement and disposal', async () => {
  const page=await open(1380,false)
  try {
    expect((await geometry(page,'#sidebar-list')).track.right).toBe(280)
    expect((await geometry(page,'#reader')).track.right).toBe(1354)
    expect((await geometry(page,'.Md3f7G_scroll')).track.right).toBe(1370)
    expect(await page.locator('#main-conversation').getAttribute('data-odyssey-scrollport')).toBeNull()
    await page.evaluate(()=>window.disposeBars())
    expect(await page.locator('.odyssey-scroll-track,[data-odyssey-scrollport]').count()).toBe(0)
  } finally { await page.close() }
})
