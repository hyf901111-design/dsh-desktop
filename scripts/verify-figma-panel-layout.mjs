// Figma 66: run production geometry, motion/focus and resize feedback in Chromium.
// Native preview rendering is validated separately after integration.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import pw from '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
const css=await Promise.all(['figma-final-shell','figma-home','figma-panels','figma-motion','figma-refinements'].map(f=>readFile(`src/preload/${f}.css`,'utf8')))
const runtime=await Promise.all(['figma-motion-controller','figma-resize-feedback'].map(async f=>(await transform(await readFile(`src/preload/${f}.ts`,'utf8'),{loader:'ts',format:'esm'})).code.replace(/export \{[^}]*\};/g,'')))
const browser=await pw.chromium.launch({executablePath:'/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'})
const near=(a,b,label)=>assert(Math.abs(a-b)<.2,`${label}: ${a} != ${b}`)
try {
const page=await browser.newPage({viewport:{width:1380,height:900}})
await page.setContent(`<style>
html,body,#root,.pI_x6G_frame{width:100%;height:100%;margin:0;overflow:hidden}body{--dsh-sidebar-width:340px;--dsh-sidebar-height:0px}.pI_x6G_frame{display:grid;grid-template-columns:80px minmax(0,1fr) 0}.wSkVaW_root{height:100%;display:flex;flex-direction:column}.rScV5Q_root{position:relative;flex:1;min-height:0}.toolbar{position:absolute;left:50%;bottom:24px;width:272px;height:48px;transform:translateX(-50%)}[data-dsh-panel-host]{position:fixed;inset:0;pointer-events:none}.t8lSSG_panel{position:absolute;pointer-events:auto;width:340px;display:flex;flex-direction:column}.t8lSSG_panelResize{position:absolute;top:16px;bottom:16px}.t8lSSG_panelBody{flex:1;min-height:0}.t8lSSG_toggleCluster{position:absolute;right:18px;display:flex;gap:4px;pointer-events:auto}.t8lSSG_tabBar{display:flex;align-items:center}.t8lSSG_tabList{flex:1;min-width:0;display:flex}.t8lSSG_tabBarPlus{width:28px;height:28px}.sRp_conversation{height:100%;display:flex}.sRp_messages{flex:1}.uV2eYG_card{height:120px}.scroll{height:150px;overflow:auto}button{border:0}
</style><style>${css.join('\n')}</style><div id="root"><main class="pI_x6G_frame" data-dsh-frame><aside class="pI_x6G_sidebarCol"></aside><section class="pI_x6G_centerCol" data-pane="conversation"><div class="wSkVaW_root" data-odyssey-page="research"><header class="wSkVaW_header"></header><div class="rScV5Q_root"><div class="toolbar"></div></div></div></section></main></div><div data-dsh-panel-host data-odyssey-panel-right="open"><aside class="t8lSSG_panel"><div class="t8lSSG_panelResize"></div><div class="t8lSSG_tabBar"><div class="t8lSSG_tabList"><div role="tab" class="t8lSSG_tab" data-odyssey-panel-tab-id="sherlock-research-conversation"><span class="t8lSSG_tabTitle">对话</span></div></div><span><button class="t8lSSG_tabBarPlus">+</button></span></div><div class="t8lSSG_panelBody"><div class="sRp_conversation"><div class="sRp_messages"><div class="scroll"><div style="height:600px">已打开的消息</div></div></div><div class="sRp_composer"><textarea class="uV2eYG_card">未发送的草稿</textarea></div></div></div></aside><div class="t8lSSG_toggleCluster"><button data-odyssey-panel-entry="bottom">底</button><button data-odyssey-panel-entry="right">侧</button></div></div>`)
await page.addScriptTag({content:runtime.join('\n')+`;window.disposeMotion=mountFigmaMotionController(document);window.disposeResize=mountFigmaResizeFeedback(document);document.querySelector('[data-odyssey-panel-entry="right"]').onclick=()=>{const host=document.querySelector('[data-dsh-panel-host]');const closed=host.dataset.odysseyPanelRight==='open';host.dataset.odysseyPanelRight=closed?'closed':'open';document.querySelector('.t8lSSG_panel').classList.toggle('t8lSSG_panelHidden',closed)};`})
const settle=async()=>{await page.waitForTimeout(320);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)))}
const measure=()=>page.evaluate(()=>{const get=s=>document.querySelector(s).getBoundingClientRect().toJSON();const p=document.querySelector('.t8lSSG_panel');return {main:get('.pI_x6G_centerCol'),panel:get('.t8lSSG_panel'),header:get('.wSkVaW_header'),toolbar:get('.toolbar'),canvas:get('.rScV5Q_root'),control:get('[data-odyssey-panel-entry="right"]'),plus:get('.t8lSSG_tabBarPlus'),tab:get('.t8lSSG_tab'),tint:getComputedStyle(p,'::after').backgroundColor,round:getComputedStyle(p).borderRadius,inert:p.inert}})
// Sample the actual CSS transition at deterministic frames. A diagonal
// clip/shrink can have correct endpoints, so endpoint checks alone miss it.
await settle()
const slideFrames = await page.evaluate(() => {
  const host = document.querySelector('[data-dsh-panel-host]')
  const panel = document.querySelector('.t8lSSG_panel')
  const main = document.querySelector('.pI_x6G_centerCol')
  const frames = []
  for (const open of [false, true]) {
    void panel.getBoundingClientRect()
    host.dataset.odysseyPanelRight = open ? 'open' : 'closed'
    panel.classList.toggle('t8lSSG_panelHidden', !open)
    void panel.getBoundingClientRect()
    const animations = [...panel.getAnimations(), ...main.getAnimations()]
    for (const animation of animations) animation.pause()
    for (const time of [0, 65, 130, 195, 260]) {
      for (const animation of animations) animation.currentTime = time
      const rect = panel.getBoundingClientRect()
      const style = getComputedStyle(panel)
      frames.push({ open, time, x:rect.x, y:rect.y, width:rect.width, height:rect.height,
        clip:style.clipPath, opacity:getComputedStyle(panel.querySelector('.t8lSSG_panelBody')).opacity })
    }
    for (const animation of animations) animation.finish()
  }
  return frames
})
for (const open of [false,true]) {
  const frames = slideFrames.filter(frame=>frame.open===open)
  for (const frame of frames) {
    near(frame.y,10,'horizontal slide top')
    near(frame.height,880,'horizontal slide height')
    near(frame.width,340,'horizontal slide width')
    assert.equal(frame.clip,'none','panel must not collapse into a corner')
    assert.equal(frame.opacity,'1','panel content must remain visible in motion')
  }
  assert(Math.abs(frames.at(-1).x-frames[0].x)>340,'slide must travel beyond right edge')
  for(let i=1;i<frames.length;i++) assert(open ? frames[i].x < frames[i-1].x : frames[i].x > frames[i-1].x,'slide direction')
}
for(const viewport of [{width:1380,height:900},{width:900,height:640}]) for(const left of [80,280]) for(const dark of [false,true]) {
await page.setViewportSize(viewport)
await page.evaluate(({left,dark})=>{document.querySelector('.pI_x6G_frame').style.gridTemplateColumns=`${left}px minmax(0,1fr) 0`;document.body.toggleAttribute('data-ds-dark-theme',dark)},{left,dark})
for(const width of viewport.width===900&&left===280?[280]:[340,400]) {
await page.evaluate(w=>{document.body.style.setProperty('--dsh-sidebar-width',w+'px');document.querySelector('.t8lSSG_panel').style.width=w+'px'},width)
for(const kind of ['home','conversation','research','trace']) {
await page.evaluate(kind=>document.querySelector('.wSkVaW_root').dataset.odysseyPage=kind,kind);await settle()
let g=await measure();near(g.panel.x-g.main.right,10,'pane gap');near(g.panel.top,g.main.top,'top alignment');near(g.panel.bottom,g.main.bottom,'bottom alignment');near(g.panel.right,viewport.width-10,'outer edge');near(g.panel.width,width,'panel width');near(g.header.width,g.main.width,'header width');near(g.toolbar.x+136,g.canvas.x+g.canvas.width/2,'toolbar center');near(g.plus.y,g.control.y,'control alignment');near(g.tab.width,46,'native div tab border-box width');assert.equal(g.tint,dark?'rgb(36, 36, 36)':'rgb(238, 238, 238)');assert.equal(g.round,'16px')
const anchor=g.control;await page.locator('textarea').fill('保留草稿');await page.locator('.scroll').evaluate(e=>e.scrollTop=77)
await page.locator('[data-odyssey-panel-entry="right"]').click();await settle();g=await measure();near(g.main.right,viewport.width-10,'collapsed main edge');near(g.control.x,anchor.x,'fixed anchor x');near(g.control.y,anchor.y,'fixed anchor y');assert(g.inert);assert(await page.locator('[data-odyssey-panel-entry="right"]').evaluate(e=>e===document.activeElement))
await page.locator('[data-odyssey-panel-entry="right"]').click();await settle();g=await measure();near(g.panel.x-g.main.right,10,'reopened gap');assert(!g.inert);assert.equal(await page.locator('textarea').inputValue(),'保留草稿');assert.equal(await page.locator('.scroll').evaluate(e=>e.scrollTop),77)
}
}
}
// The handle lives in the gap and the feedback is centered there, without intercepting native resize.
const g=await measure();await page.mouse.move(g.panel.left-5,330);await page.mouse.down();await page.waitForTimeout(30)
const grip=await page.locator('[data-odyssey-resize-grip]').boundingBox();near(grip.width,4,'grip width');near(grip.height,Math.round(Math.min(g.panel.height,page.viewportSize().height)*536/900),'grip height');near(grip.x+2,g.panel.left-5,'grip gap center');await page.mouse.up();assert.equal(await page.locator('[data-odyssey-resize-feedback]').count(),0)
// Reversal and reduced motion use the same anchor and final layout.
await page.locator('[data-odyssey-panel-entry="right"]').click();await page.waitForTimeout(50);await page.locator('[data-odyssey-panel-entry="right"]').click();await settle();near((await measure()).panel.left-(await measure()).main.right,10,'reversal')
await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-odyssey-panel-entry="right"]').click();assert.equal(await page.locator('.t8lSSG_panel').evaluate(e=>getComputedStyle(e).visibility),'hidden')
await page.evaluate(()=>{window.disposeMotion();window.disposeResize()})
console.log('PASS: Figma 66, 4 page modes, 2 themes, 2 window sizes, sidebar states, 280/340/400 widths, reopen/draft/scroll/focus, reversal, reduced motion, gap drag feedback')
}finally{await browser.close()}
