import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import playwright from '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
const { chromium } = playwright
const vendor = (await readFile('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/src/client/sidebar.module.css','utf8'))
  .replace(/\.([a-zA-Z][\w-]*)/g, '.t8lSSG_$1')
const sheets = await Promise.all(['figma-final-shell','figma-panels','figma-file-panel'].map(n=>readFile(`src/preload/${n}.css`,'utf8')))
const browser = await chromium.launch({executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try {
  const page = await browser.newPage({viewport:{width:1380,height:900}})
  for(const dark of [false,true]) for(const width of [340,400,700]) {
    await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;--dsh-sidebar-width:${width}px;--dsw-alias-label-primary:#eee;--dsw-alias-interactive-bg-hover:#333} [data-dsh-panel-host]{position:fixed;inset:0}.t8lSSG_panel{width:${width}px}.t8lSSG_explorerBody{width:100%}</style><style>${vendor}</style><style>${sheets.join('\n')}</style><body ${dark?'data-ds-dark-theme':''}><main data-odyssey-page="research"></main><div data-dsh-panel-host data-odyssey-panel-right="open"><aside class="t8lSSG_panel"><div class="t8lSSG_tabBar"><div class="t8lSSG_tabList"><button class="t8lSSG_tab">文件</button></div><div style="position:relative;display:inline-block"><button class="t8lSSG_tabBarPlus"><svg width="16" height="16"></svg></button></div></div><div class="t8lSSG_explorerBody"><div data-odyssey-project-root class="t8lSSG_explorerRow"><svg></svg><span class="t8lSSG_explorerName">黄金价格研究</span><button class="t8lSSG_explorerRef">@文件</button></div></div></aside><div class="t8lSSG_toggleCluster"><button data-odyssey-panel-entry="bottom" class="t8lSSG_toggleButton"></button><button data-odyssey-panel-entry="right" class="t8lSSG_toggleButton"></button></div></div></body>`)
    const geometry = await page.evaluate(()=>['.t8lSSG_tabBarPlus','[data-odyssey-panel-entry="bottom"]','[data-odyssey-panel-entry="right"]'].map(s=>{
      const r=document.querySelector(s).getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}
    }))
    assert.deepEqual(geometry,[{x:1256,y:29,w:28,h:28},{x:1288,y:29,w:28,h:28},{x:1320,y:29,w:28,h:28}])
    const before = await page.locator('.t8lSSG_explorerName').boundingBox()
    await page.locator('[data-odyssey-project-root]').hover()
    const after = await page.locator('.t8lSSG_explorerName').boundingBox()
    assert.deepEqual(after,before,'hover must not move or reflow the name')
    const ref = await page.locator('.t8lSSG_explorerRef').boundingBox()
    assert(ref.x > after.x+after.width+20,'reference belongs at trailing edge')
    assert.equal(await page.locator('.t8lSSG_explorerRef').evaluate(e=>getComputedStyle(e).visibility),'visible')
  }
  console.log('PASS: 3 widths × 2 themes; header 28px/4px/y29, file hover keeps text geometry and trailing action')
} finally { await browser.close() }
