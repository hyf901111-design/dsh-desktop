import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import playwright from '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
const source=await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
const vendor=JSON.parse(source.match(/const css\$6 = ("(?:\\.|[^"\\])*");/)[1])
const sidebarSource=await readFile('build/sherlock-plugin-profile/vendor/dsh-better-sidebar/lib/client.js','utf8')
const sidebarCss=JSON.parse(sidebarSource.match(/const css\$3 = ("(?:\\.|[^"\\])*");/)[1])
const css=(await Promise.all(['figma-final-shell','figma-panels','figma-home'].map(n=>readFile(`src/preload/${n}.css`,'utf8')))).join('\n')
const browser=await playwright.chromium.launch({executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
try{
 const page=await browser.newPage({viewport:{width:1380,height:900}})
 for(const dark of [false,true])for(const kind of ['home','conversation','research']){
  await page.setContent(`<style>body{margin:0;--dsh-sidebar-width:340px;--dsh-sidebar-height:0px}.pI_x6G_centerCol{position:absolute;left:80px;top:0;right:0;height:880px}.rScV5Q_root{flex:1;position:relative;min-height:0}.wSkVaW_viewArea{height:100%}.toolbar{position:absolute;width:272px;height:48px;bottom:24px;left:464px;transform:translateX(-50%)}.t8lSSG_bottomPanel{position:absolute;left:80px;width:auto;height:204px}.card{position:absolute;left:140px;top:100px;width:320px;height:220px}</style><style>${vendor}${sidebarCss}</style><style>${css}</style><body ${dark?'data-ds-dark-theme':''}><div class="pI_x6G_centerCol"><main class="wSkVaW_root" data-odyssey-page="${kind}" data-phase="${kind==='home'?'hero':'active'}"><header class="wSkVaW_header"><div class="wSkVaW_titleRow">新研究</div><nav class="wSkVaW_tabs">对话 研究 轨迹</nav></header><div class="wSkVaW_scrollBody"><div class="wSkVaW_viewArea"><div class="rScV5Q_root"><div class="card"></div><div class="toolbar" data-research-global-toolbar></div></div></div></div><div data-center-composer-host></div></main></div><div data-dsh-panel-host data-odyssey-panel-right="open" data-odyssey-panel-bottom="closed"><div class="t8lSSG_bottomPanel"><div class="t8lSSG_panelBody"><div class="t8lSSG_workbench"><div class="t8lSSG_pane"><div class="t8lSSG_tabBar"><div class="t8lSSG_tabList"><div class="t8lSSG_tab t8lSSG_tabActive">zsh</div></div><span><button class="t8lSSG_tabBarPlus">+</button></span></div></div></div></div></div></div></body>`)
  const measure=()=>page.evaluate(()=>{const rect=s=>document.querySelector(s).getBoundingClientRect().toJSON(),h=document.querySelector('.wSkVaW_header'),hs=getComputedStyle(h);return {center:rect('.pI_x6G_centerCol'),root:rect('.wSkVaW_root'),header:rect('.wSkVaW_header'),body:rect('.wSkVaW_scrollBody'),canvas:rect('.rScV5Q_root'),card:rect('.card'),toolbar:rect('.toolbar'),bottom:rect('.t8lSSG_bottomPanel'),tab:rect('.t8lSSG_tabBar'),tabList:rect('.t8lSSG_tabList'),plus:rect('.t8lSSG_tabBarPlus'),clip:getComputedStyle(document.querySelector('.t8lSSG_panelBody')).overflow,glass:hs.backdropFilter,corner:hs.borderTopLeftRadius,line:getComputedStyle(h,'::after').display}})
  const before=await measure();assert.equal(before.header.right,before.center.right);assert.equal(before.header.height,82);assert.equal(before.glass,'blur(32px)');assert.equal(before.line,'none');assert.equal(before.corner,kind==='home'?'12px':'16px')
  if(kind==='conversation')assert.equal(before.body.width,before.root.width-360)
  if(kind==='home')assert.equal(before.body.top,before.root.top,'overlay header must not displace home hero')
  if(kind==='research'){
   await page.evaluate(()=>{document.body.style.setProperty('--dsh-sidebar-height','220px');document.querySelector('[data-dsh-panel-host]').dataset.odysseyPanelBottom='open'})
   await page.waitForTimeout(250)
   const after=await measure();assert.deepEqual(after.canvas,before.canvas,'bottom overlay must not resize canvas');assert.deepEqual(after.card,before.card,'component must remain in place');assert.equal(before.toolbar.y-after.toolbar.y,220);assert.equal(after.bottom.x,92);assert.equal(after.bottom.width,904);assert.equal(after.bottom.height,204);assert.equal(after.tab.height,40);assert.equal(after.plus.width,28);assert.equal(after.plus.height,28);assert.equal(after.plus.x-after.tabList.right,8);assert.equal(after.clip,'hidden')
  }
 }
 console.log('PASS: 3 modes × 2 themes; full-width 82px glass header, clipped corners, home overlay, 220px bottom overlay preserves canvas and shifts toolbar only')
}finally{await browser.close()}
