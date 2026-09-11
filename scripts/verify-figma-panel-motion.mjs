// Focused Chromium regression for supplemental panel motion. It loads the
// production style sheets in a controlled shell fixture; packaged-client
// timing and screenshots remain an integration responsibility.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const playwrightPath = process.env.PLAYWRIGHT_MODULE_PATH
  || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
const playwright = await import(playwrightPath)
const chromium = playwright.chromium ?? playwright.default?.chromium
const chromeOptions = process.env.PLAYWRIGHT_EXECUTABLE_PATH
  ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
  : { executablePath: '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' }

const css = await Promise.all([
  'src/preload/figma-final-shell.css',
  'src/preload/figma-panels.css',
  'src/preload/figma-file-panel.css',
  'src/preload/figma-motion.css'
].map(path => readFile(path, 'utf8')))

const html = `<!doctype html><html data-odyssey-motion-ready="true"><head><style>
  * { box-sizing:border-box; }
  :root {
    --dsh-sidebar-width:340px;
    --dsh-sidebar-height:0px;
    --dsw-alias-label-primary:#222;
    --dsw-alias-label-secondary:#666;
    --dsw-alias-label-tertiary:#888;
    --dsw-alias-bg-layer-1:#f7f7f7;
    --dsw-alias-interactive-bg-hover:rgb(220 220 220);
    --dsw-alias-interactive-bg-active:rgb(210 210 210);
  }
  html,body,#root { width:100%; height:100%; margin:0; overflow:hidden; }
  .wSkVaW_root { display:flex; flex-direction:column; }
  [data-motion-copy] { flex:1; min-height:0; }
  [data-motion-composer] { flex:0 0 120px; width:100%; }
  [data-dsh-panel-host] { position:fixed; inset:0; pointer-events:none; }
  .t8lSSG_bottomPanel { position:absolute; left:92px; right:364px; bottom:22px; height:204px; pointer-events:auto; transform:translateY(0); transition:transform 200ms ease,height 200ms ease; }
  .t8lSSG_bottomPanelHidden { visibility:hidden; transform:translateY(102%); }
  .t8lSSG_tabBar { position:relative; display:flex; height:44px; }
  .t8lSSG_tabList { display:flex; }
  .t8lSSG_tab,.t8lSSG_tabClose,.t8lSSG_tabBarPlus,.hHd-Xa_toggle,[data-odyssey-tab-overflow-trigger],[data-odyssey-tab-overflow-option],[role=menuitem] { border:0; background:transparent; }
  .t8lSSG_tab { width:100px; height:30px; }
  .t8lSSG_tabClose,.t8lSSG_tabBarPlus,.hHd-Xa_toggle,[data-odyssey-tab-overflow-trigger] { width:28px; height:28px; }
  [data-odyssey-tab-overflow-option],[role=menuitem] { width:180px; height:36px; }
  .t8lSSG_tab:hover,.t8lSSG_tabClose:hover,.t8lSSG_tabBarPlus:hover,.hHd-Xa_toggle:hover,[data-odyssey-tab-overflow-trigger]:hover,[data-odyssey-tab-overflow-option]:hover,[role=menuitem]:hover { background:var(--dsw-alias-interactive-bg-hover); }
</style><style>${css.join('\n')}</style></head><body>
  <aside class="hHd-Xa_root"><button class="hHd-Xa_iconButton hHd-Xa_toggle" data-motion-control="left">L</button></aside>
  <div id="root"><main class="wSkVaW_root" data-odyssey-page="conversation"><article data-motion-copy></article><textarea data-motion-composer></textarea></main></div>
  <div data-dsh-panel-host data-odyssey-panel-right="open" data-odyssey-panel-bottom="closed">
    <section class="t8lSSG_bottomPanel t8lSSG_bottomPanelHidden">
      <div class="t8lSSG_tabBar"><div class="t8lSSG_tabList">
        <button class="t8lSSG_tab" data-motion-control="tab">Tab</button>
        <button class="t8lSSG_tabClose" data-motion-control="close">×</button>
        <button data-odyssey-tab-overflow-trigger data-motion-control="overflow">···</button>
      </div><button class="t8lSSG_tabBarPlus" data-motion-control="plus">+</button></div>
      <button data-odyssey-tab-overflow-option="one" data-motion-control="overflow-option">One</button>
    </section>
  </div>
</body></html>`

const close = (actual, expected, label, tolerance = 1) => {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`)
}

const browser = await chromium.launch(chromeOptions)
try {
  const context = await browser.newContext({ viewport: { width: 1380, height: 900 }, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await page.setContent(html, { waitUntil: 'load' })

  const contract = await page.evaluate(() => {
    const root = document.querySelector('.wSkVaW_root')
    const bottom = document.querySelector('.t8lSSG_bottomPanel')
    return {
      rootProperties: getComputedStyle(root).transitionProperty,
      rootDurations: getComputedStyle(root).transitionDuration,
      bottomProperties: getComputedStyle(bottom).transitionProperty,
      bottomDurations: getComputedStyle(bottom).transitionDuration
    }
  })
  assert(contract.rootProperties.split(',').map(value => value.trim()).includes('height'), `root transition properties: ${contract.rootProperties}`)
  assert(contract.rootDurations.includes('0.26s'), `root transition durations: ${contract.rootDurations}`)
  assert(contract.bottomProperties.includes('transform') && contract.bottomProperties.includes('height'), `bottom transition properties: ${contract.bottomProperties}`)
  assert(contract.bottomDurations.includes('0.26s'), `bottom transition durations: ${contract.bottomDurations}`)

  const setBottom = async open => page.evaluate(value => {
    const host = document.querySelector('[data-dsh-panel-host]')
    const bottom = document.querySelector('.t8lSSG_bottomPanel')
    host.setAttribute('data-odyssey-panel-bottom', value ? 'open' : 'closed')
    document.documentElement.style.setProperty('--dsh-sidebar-height', value ? '220px' : '0px')
    bottom.classList.toggle('t8lSSG_bottomPanelHidden', !value)
  }, open)
  const measureLayout = async () => page.evaluate(() => {
    const root = document.querySelector('.wSkVaW_root').getBoundingClientRect()
    const copy = document.querySelector('[data-motion-copy]').getBoundingClientRect()
    const composer = document.querySelector('[data-motion-composer]').getBoundingClientRect()
    const bottom = document.querySelector('.t8lSSG_bottomPanel')
    return {
      rootHeight: root.height,
      copyHeight: copy.height,
      composerTop: composer.top,
      composerHeight: composer.height,
      composerBottom: composer.bottom,
      rootBottom: root.bottom,
      bottomTransform: getComputedStyle(bottom).transform
    }
  })

  const closed = await measureLayout()
  close(closed.rootHeight, 900, 'closed conversation height')
  close(closed.composerHeight, 120, 'closed composer height')
  await setBottom(true)
  await page.waitForTimeout(120)
  const opening = await measureLayout()
  assert(opening.rootHeight < 880 && opening.rootHeight > 690, `opening conversation height: ${opening.rootHeight}`)
  assert(opening.copyHeight < closed.copyHeight, `opening copy height: ${opening.copyHeight}`)
  close(opening.composerBottom, opening.rootBottom, 'opening composer follows conversation')
  close(opening.composerHeight, 120, 'opening composer geometry')
  await page.waitForTimeout(220)
  const opened = await measureLayout()
  close(opened.rootHeight, 680, 'opened conversation height')
  close(opened.composerBottom, opened.rootBottom, 'opened composer follows conversation')

  await setBottom(false)
  await page.waitForTimeout(320)
  await setBottom(true)
  await page.waitForTimeout(70)
  const beforeReverse = await measureLayout()
  await setBottom(false)
  const atReverse = await measureLayout()
  assert(Math.abs(atReverse.rootHeight - beforeReverse.rootHeight) < 4, `rapid reverse jumped: ${beforeReverse.rootHeight} -> ${atReverse.rootHeight}`)
  await page.waitForTimeout(55)
  const reversing = await measureLayout()
  assert(reversing.rootHeight > atReverse.rootHeight && reversing.rootHeight < 900, `rapid reverse did not continue from current frame: ${atReverse.rootHeight} -> ${reversing.rootHeight}`)
  close(reversing.composerBottom, reversing.rootBottom, 'reversing composer follows conversation')
  await page.waitForTimeout(280)
  close((await measureLayout()).rootHeight, 900, 'rapid reverse final height')

  await setBottom(true)
  await page.waitForTimeout(280)

  for (const name of ['left', 'plus', 'tab', 'close', 'overflow', 'overflow-option']) {
    const locator = page.locator(`[data-motion-control="${name}"]`)
    const before = await locator.boundingBox()
    await locator.hover()
    await page.waitForTimeout(155)
    assert.notEqual(await locator.evaluate(node => getComputedStyle(node).backgroundColor), 'rgba(0, 0, 0, 0)', `${name} hover background`)
    await page.mouse.down()
    await page.waitForTimeout(100)
    assert.notEqual(await locator.evaluate(node => getComputedStyle(node).transform), 'none', `${name} pressed transform`)
    await page.mouse.up()
    await page.waitForTimeout(110)
    const after = await locator.boundingBox()
    close(after.width, before.width, `${name} released width`, 0.1)
    close(after.height, before.height, `${name} released height`, 0.1)
  }

  const menuStart = await page.evaluate(() => {
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    menu.innerHTML = '<button role="menuitem"><span data-odyssey-file-menu-label>Files</span></button>'
    document.body.appendChild(menu)
    return { opacity: Number(getComputedStyle(menu).opacity), animation: getComputedStyle(menu).animationName }
  })
  assert(menuStart.animation.includes('odyssey-panel-menu-enter'), `menu animation: ${menuStart.animation}`)
  assert(menuStart.opacity < 1, `menu initial opacity: ${menuStart.opacity}`)
  await page.waitForTimeout(190)
  close(Number(await page.locator('[role="menu"]').evaluate(node => getComputedStyle(node).opacity)), 1, 'menu final opacity', 0.02)
  await context.close()

  const reduced = await browser.newContext({ viewport: { width: 1380, height: 900 }, reducedMotion: 'reduce' })
  const reducedPage = await reduced.newPage()
  await reducedPage.setContent(html, { waitUntil: 'load' })
  const reducedState = await reducedPage.evaluate(() => {
    const tab = document.querySelector('[data-motion-control="tab"]')
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    menu.innerHTML = '<button role="menuitem"><span data-odyssey-file-menu-label>Files</span></button>'
    document.body.appendChild(menu)
    return {
      tabTransition: getComputedStyle(tab).transitionDuration,
      menuAnimation: getComputedStyle(menu).animationName,
      menuOpacity: getComputedStyle(menu).opacity
    }
  })
  assert.equal(reducedState.tabTransition, '0s')
  assert.equal(reducedState.menuAnimation, 'none')
  assert.equal(reducedState.menuOpacity, '1')
  const reducedControl = reducedPage.locator('[data-motion-control="left"]')
  await reducedControl.hover()
  await reducedPage.mouse.down()
  assert.equal(await reducedControl.evaluate(node => getComputedStyle(node).transform), 'none')
  await reducedPage.mouse.up()
  await reduced.close()

  console.log('Figma panel motion passed in controlled Chromium')
} finally {
  await browser.close()
}
