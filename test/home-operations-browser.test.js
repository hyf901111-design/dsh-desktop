import { readFileSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, expect, it } from 'vitest'

const evidence = '/tmp/ework-home-operations-20261023'
const galleryEvidence = resolve('output/home-theme-gallery-20261025')
const read = path => readFileSync(path, 'utf8')
const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
const frontend = readdirSync(assets).filter(name => /^index-.*\.css$/.test(name)).map(name => read(`${assets}/${name}`)).join('\n')
const native = ['layout', 'conversation', 'agent-preset'].map(name => [...read(`node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`).matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match => JSON.parse(match[1])).join('\n')).join('\n')
const portalCss = [...read('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js').matchAll(/tag\.textContent \+?= ("(?:[^"\\]|\\.)*");/g)].map(match => JSON.parse(match[1])).filter(css => css.includes('.wSkVaW_root')).join('\n')
let browser, runtime
const importedImages = new Map()

beforeAll(async () => {
  const require = createRequire(import.meta.url)
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import {mountDesktopShellStyles} from './src/preload/shell-style';
      import {mountHomeOperations} from './src/preload/home-operations';
      import {mountHomeThemes,getHomeThemeController} from './src/preload/home-themes';
      import {toggleHomeAppearance} from './src/preload/home-theme-controls';
      window.homeOperations={thumbnailRequests:[],mount(themes=false){mountDesktopShellStyles(document);if(themes)this.disposeThemes=mountHomeThemes(document);this.original=document.querySelector('textarea');const before=[...document.querySelectorAll('style')];const controller=getHomeThemeController(document);this.controller=controller;this.dispose=mountHomeOperations(document,{onAction:this.onAction,onExample:this.onExample,themeController:controller?{...controller,getThumbnail:(id)=>{this.thumbnailRequests.push(id);return controller.getThumbnail(id)}}:undefined,onToggleAppearance:()=>toggleHomeAppearance(document)});this.ownStyles=[...document.querySelectorAll('style')].filter(style=>!before.includes(style))}};
    ` }, bundle: true, format: 'iife', platform: 'browser', write: false,
    plugins: [{ name: 'home-operations-assets', setup(builder) {
      builder.onResolve({ filter: /\.(?:svg|png|jpe?g|webp)\?inline$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -7)), namespace: 'home-inline' }))
      builder.onLoad({ filter: /.*/, namespace: 'home-inline' }, async args => {
        const type = args.path.endsWith('.svg') ? 'image/svg+xml' : args.path.endsWith('.png') ? 'image/png' : args.path.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
        const data = `data:${type};base64,${(await readFile(args.path)).toString('base64')}`
        importedImages.set(args.path, data)
        return { contents: 'export default ' + JSON.stringify(data), loader: 'js' }
      })
      builder.onResolve({ filter: /\.css\?raw$/ }, args => ({ path: args.path.startsWith('.') ? resolve(args.resolveDir, args.path.slice(0, -4)) : require.resolve(args.path.slice(0, -4)), namespace: 'home-css' }))
      builder.onLoad({ filter: /.*/, namespace: 'home-css' }, async args => ({ contents: 'export default ' + JSON.stringify(await readFile(args.path, 'utf8')), loader: 'js' }))
    } }]
  })
  runtime = output.outputFiles[0].text
  const module = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (module.default ?? module).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-swiftshader'] })
  await mkdir(evidence, { recursive: true })
  await mkdir(galleryEvidence, { recursive: true })
}, 30000)
afterAll(async () => browser?.close())

function hero() {
  return `<div class="wSkVaW_composerStack wSkVaW_composerHero"><div class="pXSMma_root"><div class="pXSMma_stack"><div class="pXSMma_headline">你想做什么？</div></div></div>
    <div class="wSkVaW_heroWorkspaceRow"><button class="pXSMma_workspace" aria-label="选择工作区" aria-haspopup="menu" aria-expanded="false"><svg class="pXSMma_folder" width="16" height="16"></svg><span class="pXSMma_workspaceLabel">测试集</span><svg class="pXSMma_chevron" width="12" height="12"></svg></button><div data-slot="conversation.hero.workspace" style="display:contents"><span class="_root_19372_1"></span></div><div data-slot="conversation.hero.agentPreset" style="display:contents"><span class="_root_19372_1 cubgiG_picker"><button class="cubgiG_seat" aria-haspopup="menu">标准模式</button></span></div></div>
    <div data-slot="conversation.input.dock" style="display:contents"></div><div data-slot="conversation.composer.bar" style="display:contents"><div class="uV2eYG_root"><div class="uV2eYG_card"><div class="uV2eYG_scroll"><textarea class="uV2eYG_input" aria-label="发送消息" placeholder="向智能体发送消息"></textarea></div><div class="uV2eYG_row"><button aria-label="添加附件">+</button><button aria-label="发送">↑</button></div></div></div></div>
  </div>`
}

async function fixture({ dark = false, reduced = true, width = 1380, height = 900, route = 'home', surface = '', child = false, themes = false, clock = false, panelWidth = 0, deviceScaleFactor = 1, sidebarWidth = 280 } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  if (clock) await page.clock.install({ time: new Date('2026-10-23T00:00:00Z') })
  await page.route('**/*', request => request.abort())
  if (themes) {
    await page.route('http://home-operations.test/', route => route.fulfill({contentType:'text/html',body:'<!doctype html>'}))
    await page.route('http://home-operations.test/fonts/NotoSansSC.woff2', route => route.fulfill({contentType:'font/woff2',path:resolve('build/fonts/NotoSansSC.woff2')}))
    await page.goto('http://home-operations.test/')
  }
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${frontend}\n${native}\n${portalCss}</style><body ${dark ? 'data-ds-dark-theme' : ''} ${surface ? `data-workspace-surface="${surface}"` : ''} ${panelWidth ? `style="--dsh-sidebar-width:${panelWidth}px"` : ''}>
    <div id="root"><div data-slot="root" style="display:contents"><div class="pI_x6G_frame" data-dsh-frame="true" style="grid-template-columns:${sidebarWidth}px minmax(0,1fr) 0px">
      <aside></aside><main class="pI_x6G_centerCol" data-pane="conversation"><div data-slot="conversation" style="display:contents"><div class="wSkVaW_root" data-phase="${route === 'home' ? 'hero' : 'active'}" data-odyssey-page="${route}">
        <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="true"><button aria-label="对话">对话</button></header></div>
        <div class="wSkVaW_scrollBody" data-conversation-scroll></div><div data-center-composer-host><div data-composer-portal-host><div class="wSkVaW_composerSeat" data-composer-seat><div data-slot="conversation.composer" style="display:contents"><div data-chain-overlay-fallback="conversation.composer" style="display:contents">${hero()}</div></div></div></div></div>
        ${child ? `<section data-odyssey-subagent-panel><div class="wSkVaW_root" data-phase="hero" data-odyssey-page="home">${hero()}</div></section>` : ''}
      </div></div></main>
    </div></div></div><aside data-dsh-panel-host data-odyssey-panel-right="${panelWidth ? 'open' : 'closed'}"></aside>
  </body>`)
  if (themes) await page.evaluate(() => document.fonts.ready)
  await page.locator('textarea').first().fill('保留原生输入草稿\n第二行 🔎')
  await page.addScriptTag({ content: runtime })
  await page.evaluate(themes => window.homeOperations.mount(themes), themes)
  return page
}

const region = page => page.locator('section[data-odyssey-home-operations]')
const state = page => page.locator('[data-odyssey-home-operations-state]').getAttribute('data-odyssey-home-operations-state')
const toggle = page => page.locator('[data-odyssey-home-operations-toggle]')
const root = page => page.locator('main > [data-slot="conversation"] > .wSkVaW_root')
const waitState = (page, value) => expect.poll(() => state(page), { timeout: 2500 }).toBe(value)
const waitCase = (page, index) => expect.poll(() => page.locator('.odyssey-operations-usecase').evaluate(card => { const layers = card.querySelectorAll('[data-odyssey-operations-case-layer]'); return { index: card.dataset.case, layers: layers.length || 1, opacity: Number(getComputedStyle(layers[0] || card.querySelector('.odyssey-operations-case-copy')).opacity) } }), { timeout: 1500 }).toEqual({ index: String(index), layers: 1, opacity: 1 })
const progress = page => page.locator('[data-odyssey-home-operations-state]').evaluate(host => parseFloat(getComputedStyle(host).getPropertyValue('--odyssey-operations-progress-value')))
const nextPaint = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
async function startMotionProbe(page, duration = 1500) {
  await page.evaluate(duration => {
    const host = document.querySelector('[data-odyssey-home-operations-state]'), hero = document.querySelector('.uV2eYG_card'), cards = document.querySelector('[data-odyssey-home-operations]')
    const probe = window.homeOperations.probe = { samples: [], events: [], done: false }, start = performance.now()
    const sample = time => {
      probe.samples.push({ time, raw: parseFloat(getComputedStyle(host).getPropertyValue('--odyssey-operations-progress-value')), hero: hero.getBoundingClientRect().y, cards: cards.getBoundingClientRect().y, heroVisible: !hero.hidden && getComputedStyle(hero).display !== 'none' && Number(getComputedStyle(hero.closest('.wSkVaW_composerHero')).opacity) > 0, cardsVisible: !cards.hidden && getComputedStyle(cards).display !== 'none' && Number(getComputedStyle(cards).opacity) > 0, motion: host.dataset.odysseyHomeOperationsMotion })
      if (time - start < duration) requestAnimationFrame(sample)
      else probe.done = true
    }
    sample(start)
  }, duration)
}
async function finishMotionProbe(page) {
  await page.waitForFunction(() => window.homeOperations.probe.done, undefined, { timeout: 3500 })
  return page.evaluate(() => window.homeOperations.probe.samples)
}
function curveSpeeds(samples, key) {
  if (key !== 'raw') samples = samples.filter(sample => sample[`${key}Visible`])
  const distance = Math.abs(samples.at(-1)[key] - samples[0][key])
  return samples.slice(1).map((sample, index) => ({ time: sample.time, delta: Math.abs(sample[key] - samples[index][key]) / distance, frameMs: sample.time - samples[index].time, speed: Math.abs(sample[key] - samples[index][key]) / distance / ((sample.time - samples[index].time) / 1000) })).filter(sample => sample.delta > .00001)
}
function expectSmoothTravel(samples, key) {
  const speeds = curveSpeeds(samples, key), peak = Math.max(...speeds.map(sample => sample.speed)), median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
  expect(speeds.length, `${key} has enough rendered motion frames`).toBeGreaterThanOrEqual(6)
  expect(peak, `${key} accelerates after departure`).toBeGreaterThan(median(speeds.slice(0, 3).map(sample => sample.speed)) * 1.2)
  expect(median(speeds.slice(-3).map(sample => sample.speed)), `${key} slows before arrival`).toBeLessThan(peak * .25)
  expect(Math.max(...speeds.map(sample => sample.delta * 16.667 / sample.frameMs)), `${key} has no abrupt frame jump`).toBeLessThan(.18)
}
const luminance = rgb => rgb.map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0)
const contrastRatio = (foreground, background) => { const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b); return (values[1] + .05) / (values[0] + .05) }
function patchRgb(png, x, y, radius = 1) {
  const result = [0, 0, 0]
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const offset = (Math.max(0, Math.min(png.height - 1, Math.round(y) + dy)) * png.width + Math.max(0, Math.min(png.width - 1, Math.round(x) + dx))) * 4
    for (let channel = 0; channel < 3; channel++) result[channel] += png.data[offset + channel] / (radius * 2 + 1) ** 2
  }
  return result
}
async function dispatchWheel(page, selector, deltaY) {
  return page.locator(selector).first().evaluate((target, deltaY) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }, deltaY)
}
async function dispatchKey(page, selector, key) {
  return page.locator(selector).first().evaluate((target, key) => {
    target.focus()
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key })
    target.dispatchEvent(event)
    return event.defaultPrevented
  }, key)
}

it('adds the homepage operations area while preserving the native composer node and draft', async () => {
  const page = await fixture()
  try {
    await expect.poll(() => region(page).count()).toBe(1)
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
    expect(await state(page)).toBe('input')
  } finally { await page.close() }
})

it('shows one complete region at each endpoint without an operations preview or composer ghost', async () => {
  const page = await fixture({ width: 1823, height: 1115, themes: true })
  const appearance = locator => locator.evaluate(element => {
    const style = getComputedStyle(element), rect = element.getBoundingClientRect(), hit = rect.width && rect.height ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null
    return { unpainted: element.hidden || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0, hit: hit === element || !!hit && element.contains(hit) }
  })
  try {
    expect((await appearance(region(page))).unpainted).toBe(true)
    expect((await appearance(region(page))).hit).toBe(false)
    await page.locator('textarea').click()
    expect(await page.evaluate(() => document.activeElement === window.homeOperations.original)).toBe(true)
    await page.screenshot({ path: `${evidence}/input-exclusive.png` })
    await toggle(page).click(); await waitState(page, 'operations')
    expect((await appearance(page.locator('.wSkVaW_composerHero'))).unpainted).toBe(true)
    expect((await appearance(region(page))).unpainted).toBe(false)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  } finally { await page.close() }
})

it('switches regions with the bottom button, including its Enter and Space activation', async () => {
  const page = await fixture()
  try {
    const pane = await page.locator('.pI_x6G_centerCol').boundingBox(), button = await toggle(page).boundingBox()
    expect(Math.abs(pane.y + pane.height - button.y - 104), 'the undocked toggle retains the approved raised position').toBeLessThanOrEqual(1)
    for (let index = 0; index < 12 && !await toggle(page).evaluate(button => document.activeElement === button); index++) await page.keyboard.press('Tab')
    expect(await toggle(page).evaluate(button => document.activeElement === button && button.matches(':focus-visible'))).toBe(true)
    await page.keyboard.press('Enter'); await waitState(page, 'operations')
    await writeFile(`${evidence}/toggle-keyboard-focus.json`, JSON.stringify(await toggle(page).evaluate(button => {
      const rules = []
      const scan = sheetRules => { for (const rule of sheetRules) { if (rule.selectorText && rule.style?.cssText.includes('outline')) { try { if (button.matches(rule.selectorText)) rules.push({ selector: rule.selectorText, style: rule.style.cssText.slice(0, 500) }) } catch {} } if (rule.cssRules) scan(rule.cssRules) } }
      for (const sheet of document.styleSheets) { try { scan(sheet.cssRules) } catch {} }
      return { focused: document.activeElement === button, active: document.activeElement?.outerHTML.slice(0, 300), visible: button.matches(':focus-visible'), outline: getComputedStyle(button).outlineStyle, width: getComputedStyle(button).outlineWidth, rules }
    }), null, 2))
    expect(await toggle(page).evaluate(button => getComputedStyle(button).outlineStyle)).not.toBe('none')
    await page.keyboard.press('Space'); await waitState(page, 'input')
    await toggle(page).click(); await waitState(page, 'operations')
    await toggle(page).click(); await waitState(page, 'input')
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  } finally { await page.close() }
}, 15000)







it('switches regions with outer wheel gestures while leaving arrow keys and region clicks alone', async () => {
  const page = await fixture()
  try {
    expect(await page.locator('.odyssey-operations-return-hit').count()).toBe(0)
    expect(await dispatchKey(page, 'body', 'ArrowDown')).toBe(false)
    await region(page).dispatchEvent('click')
    expect(await state(page)).toBe('input')
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', 800)).toBe(true)
    await waitState(page, 'operations')
    for (const delta of [500, 180, 60, 12]) await dispatchWheel(page, '.pI_x6G_centerCol', delta)
    expect(await state(page)).toBe('operations')
    expect(await dispatchKey(page, 'body', 'ArrowUp')).toBe(false)
    await region(page).dispatchEvent('click')
    expect(await state(page)).toBe('operations')
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', -800)).toBe(true)
    await waitState(page, 'input')
    for (const delta of [-500, -180, -60, -12]) await dispatchWheel(page, '.pI_x6G_centerCol', delta)
    expect(await state(page)).toBe('input')
    const pinchPrevented = await page.locator('.pI_x6G_centerCol').evaluate(target => { const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 800, ctrlKey: true }); target.dispatchEvent(event); return event.defaultPrevented })
    expect(pinchPrevented).toBe(false); expect(await state(page)).toBe('input')
    await page.evaluate(() => window.homeOperations.dispose())
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', 800)).toBe(false)
  } finally { await page.close() }
})

it('lets the return button immediately reverse an unfinished transition', async () => {
  const page = await fixture({ reduced: false })
  try {
    await toggle(page).click()
    await nextPaint(page)
    expect(await progress(page)).toBeGreaterThan(0)
    expect(await progress(page)).toBeLessThan(1)
    await toggle(page).click()
    await expect.poll(() => progress(page)).toBe(0)
    await waitState(page, 'input')
  } finally { await page.close() }
}, 15000)

it('lets a deliberate opposite wheel gesture reverse spring motion while same-direction inertia stays on one region', async () => {
  const page = await fixture({ reduced: false, clock: true })
  try {
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', 800)).toBe(true)
    await page.clock.runFor(80)
    const forward = await progress(page)
    expect(forward).toBeGreaterThan(0); expect(forward).toBeLessThan(1)
    for (const delta of [300, 120, 40, 12]) await dispatchWheel(page, '.pI_x6G_centerCol', delta)
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', -800)).toBe(true)
    await page.clock.runFor(180)
    expect(await progress(page)).toBeLessThan(forward)
    await page.clock.runFor(1200)
    expect(await progress(page)).toBe(0); expect(await state(page)).toBe('input')
    await page.clock.runFor(400)
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', 800)).toBe(true)
    await page.clock.runFor(1300)
    expect(await state(page)).toBe('operations')
    for (const delta of [500, 100, 30, 8]) await dispatchWheel(page, '.pI_x6G_centerCol', delta)
    await page.clock.runFor(1000)
    expect(await state(page)).toBe('operations')
  } finally { await page.close() }
}, 15000)

it('accelerates and decelerates the actual composer and cards throughout button travel', async () => {
  const page = await fixture({ reduced: false, clock: true })
  try {
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await startMotionProbe(page)
    await toggle(page).evaluate(button => button.click())
    await page.clock.runFor(1550)
    const samples = await finishMotionProbe(page)
    await writeFile(`${evidence}/motion-button-samples.json`, JSON.stringify(samples, null, 2))
    expect(samples.at(-1).raw).toBe(1)
    for (const key of ['raw', 'hero', 'cards']) expectSmoothTravel(samples, key)
  } finally { await page.close() }
}, 10000)



it('preserves editing, textarea scrolling, and menu keyboard/wheel behavior', async () => {
  const page = await fixture()
  try {
    for (const key of ['ArrowDown', 'ArrowUp']) {
      expect(await dispatchKey(page, 'textarea', key)).toBe(false)
      expect(await state(page)).toBe('input')
    }
    expect(await dispatchWheel(page, 'textarea', 140)).toBe(false)
    expect(await state(page)).toBe('input')
    await page.evaluate(() => {
      document.querySelector('textarea').value = Array.from({ length: 60 }, (_, i) => `草稿第 ${i} 行`).join('\n')
      document.querySelector('textarea').style.cssText = 'height:64px;overflow:auto'
      const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); menu.tabIndex = 0; menu.textContent = '工作区菜单'; menu.style.cssText = 'position:fixed;left:400px;top:200px;width:180px;height:80px;overflow:auto;z-index:99999'; document.body.append(menu)
    })
    expect(await dispatchKey(page, '[role="menu"]', 'ArrowDown')).toBe(false)
    expect(await dispatchWheel(page, '[role="menu"]', 140)).toBe(false)
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', 300)).toBe(false)
    expect(await state(page)).toBe('input')
    await page.locator('textarea').focus()
    await page.locator('textarea').hover()
    await page.mouse.wheel(0, 140)
    await expect.poll(() => page.locator('textarea').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    expect(await state(page)).toBe('input')
    await page.evaluate(() => {
      document.querySelector('[role="menu"]').remove()
      const scroll = document.createElement('div'); scroll.dataset.nativeScrollTest = ''; scroll.style.cssText = 'position:absolute;left:24px;top:100px;width:120px;height:80px;overflow:auto;z-index:20'
      const content = document.createElement('div'); content.style.height = '700px'; content.textContent = '原生可滚动内容'; scroll.append(content); document.querySelector('.pI_x6G_centerCol').append(scroll)
    })
    expect(await dispatchWheel(page, '[data-native-scroll-test]', 180)).toBe(false)
    await page.locator('[data-native-scroll-test]').hover(); await page.mouse.wheel(0, 180)
    await expect.poll(() => page.locator('[data-native-scroll-test]').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    expect(await state(page)).toBe('input')
  } finally { await page.close() }
}, 15000)

it('only mounts the main conversation homepage and removes decoration while settings or another route is active', async () => {
  const page = await fixture({ child: true })
  try {
    expect(await region(page).count()).toBe(1)
    expect(await page.locator('[data-odyssey-subagent-panel] [data-odyssey-home-operations]').count()).toBe(0)
    expect(await page.locator('[data-odyssey-subagent-panel] [data-odyssey-operations-composer]').count()).toBe(0)
    await page.evaluate(() => { document.body.dataset.workspaceSurface = 'settings'; document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change')) })
    await expect.poll(() => region(page).count()).toBe(0)
    expect(await page.locator('[data-odyssey-home-operations-state]').count()).toBe(0)
    await page.evaluate(() => { delete document.body.dataset.workspaceSurface; document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change')) })
    await expect.poll(() => region(page).count()).toBe(1)
    await root(page).evaluate(element => { element.dataset.odysseyPage = 'conversation'; element.dataset.phase = 'active' })
    await expect.poll(() => region(page).count()).toBe(0)
    expect(await page.locator('[data-odyssey-home-operations-state]').count()).toBe(0)
    expect(await page.locator('textarea').first().inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
    await root(page).evaluate(element => { element.dataset.odysseyPage = 'home'; element.dataset.phase = 'hero' })
    await expect.poll(() => region(page).count()).toBe(1)
    await waitState(page, 'input')
  } finally { await page.close() }
}, 15000)

it.each([{ route: 'conversation' }, { route: 'research' }, { surface: 'settings' }])('does not add homepage controls to %j', async options => {
  const page = await fixture(options)
  try {
    expect(await region(page).count()).toBe(0)
    expect(await toggle(page).count()).toBe(0)
  } finally { await page.close() }
})

it('cleans up detached controls, styles, native markers and observers when disposed', async () => {
  const page = await fixture({ reduced: false })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    await page.locator('.odyssey-operations-quick-anchor').first().hover()
    expect(await page.locator('.odyssey-operations-quick-card').first().getAttribute('data-odyssey-operations-illustration-blending')).not.toBeNull()
    await page.evaluate(() => { window.homeOperations.oldToggle = document.querySelector('[data-odyssey-home-operations-toggle]'); window.homeOperations.oldQuickCard = document.querySelector('.odyssey-operations-quick-card'); window.homeOperations.dispose() })
    expect(await page.evaluate(() => window.homeOperations.oldQuickCard.hasAttribute('data-odyssey-operations-illustration-blending'))).toBe(false)
    expect(await region(page).count()).toBe(0)
    expect(await toggle(page).count()).toBe(0)
    expect(await page.locator('.odyssey-operations-return-hit, [data-odyssey-operations-composer], [data-odyssey-home-operations-state]').count()).toBe(0)
    expect(await page.evaluate(() => window.homeOperations.ownStyles.every(style => !style.isConnected))).toBe(true)
    await page.evaluate(() => {
      window.homeOperations.oldToggle.click()
      document.body.dataset.workspaceSurface = 'settings'
      delete document.body.dataset.workspaceSurface
      document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))
      document.querySelector('.pI_x6G_centerCol').append(document.createElement('span'))
    })
    await page.waitForTimeout(50)
    expect(await region(page).count()).toBe(0)
    expect(await page.locator('[data-odyssey-home-operations-state]').count()).toBe(0)
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
    await page.evaluate(() => window.homeOperations.mount())
    await expect.poll(() => region(page).count()).toBe(1)
    await waitState(page, 'input')
  } finally { await page.close() }
})

it('updates all four illustrations when appearance changes without replacing the composer', async () => {
  const page = await fixture()
  try {
    const sources = () => page.locator('.odyssey-operations-quick-card .odyssey-operations-illustration > img.normal').evaluateAll(images => images.map(image => image.src))
    const light = await sources()
    expect(light).toHaveLength(4)
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    await expect.poll(async () => (await sources()).every((source, index) => source !== light[index])).toBe(true)
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
    await expect.poll(sources).toEqual(light)
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  } finally { await page.close() }
})

it('pages through four use cases and keeps quick-card clicks local to the homepage preview', async () => {
  const page = await fixture()
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const dots = page.locator('.odyssey-operations-pagination button')
    expect(await dots.count()).toBe(4)
    const titles = []
    for (let index = 0; index < 4; index++) {
      await dots.nth(index).click()
      expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe(String(index))
      expect(await page.locator('.odyssey-operations-pagination [aria-pressed="true"]').count()).toBe(1)
      expect(await dots.nth(index).getAttribute('aria-pressed')).toBe('true')
      titles.push(await page.locator('.odyssey-operations-usecase .odyssey-operations-title').textContent())
    }
    expect(new Set(titles).size).toBe(4)
    expect(titles.every(Boolean)).toBe(true)
    const originalUrl = page.url()
    const cards = page.locator('.odyssey-operations-quick-card')
    expect(await cards.count()).toBe(4)
    for (const card of await cards.all()) {
      await card.click()
      expect(page.url()).toBe(originalUrl)
      expect(await state(page)).toBe('operations')
      expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
    }
  } finally { await page.close() }
}, 15000)

it('fills the active case track and automatically loops the four examples on the browser clock', async () => {
  const page = await fixture({ reduced: false, clock: true })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await page.locator('.odyssey-operations-pagination button').first().evaluate(button => button.click())
    await page.clock.runFor(3000)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('0')
    const track = await page.locator('.odyssey-operations-pagination [aria-pressed="true"] i').evaluate(track => parseFloat(getComputedStyle(track, '::before').width) / track.clientWidth)
    expect(track).toBeGreaterThan(.4)
    expect(track).toBeLessThan(.6)
    for (const nextCase of ['1', '2', '3', '0']) {
      const elapsed = await page.locator('.odyssey-operations-usecase').evaluate(card => parseFloat(getComputedStyle(card).getPropertyValue('--odyssey-operations-case-progress')))
      await page.clock.runFor((1 - elapsed) * 6000 + 500)
      expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe(nextCase)
    }
  } finally { await page.close() }
}, 20000)

it('crossfades different old and new cases together without an empty or dim interval', async () => {
  const page = await fixture({ dark: true, reduced: false, clock: true })
  const samples = []
  const snapshot = () => page.locator('.odyssey-operations-usecase').evaluate(card => {
    const actual = [...card.querySelectorAll('[data-odyssey-operations-case-layer]')]
    const layers = actual.length ? actual : [card.querySelector('.odyssey-operations-case-copy')]
    return { layers: layers.map(layer => ({ text: layer.textContent.trim(), opacity: Number(getComputedStyle(layer).opacity), hidden: layer.getAttribute('aria-hidden') === 'true', inert: layer.inert })), pages: card.querySelectorAll('.odyssey-operations-pagination').length, bounds: { width: card.clientWidth, height: card.clientHeight } }
  })
  const raster = async () => {
    const elements = page.locator('.odyssey-operations-case-copy, .odyssey-operations-description, .odyssey-operations-pagination')
    await elements.evaluateAll(elements => elements.forEach(element => element.style.visibility = 'hidden'))
    const png = PNG.sync.read(await page.locator('.odyssey-operations-usecase').screenshot())
    await elements.evaluateAll(elements => elements.forEach(element => element.style.removeProperty('visibility')))
    return png
  }
  const light = (png, baseline) => {
    let sum = 0
    for (let y = 12; y < png.height - 12; y += 3) for (let x = 12; x < png.width - 12; x += 3) sum += Math.max(0, luminance(patchRgb(png, x, y, 0)) - luminance(patchRgb(baseline, x, y, 0)))
    return sum
  }
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await page.addStyleTag({ content: '.odyssey-operations-glow { animation-play-state:paused !important; }' })
    await page.locator('.odyssey-operations-gradient-field').evaluateAll(fields => fields.forEach(field => field.style.visibility = 'hidden'))
    const baseline = await raster()
    await page.locator('.odyssey-operations-gradient-field').evaluateAll(fields => fields.forEach(field => field.style.removeProperty('visibility')))
    const start = await snapshot(), startLight = light(await raster(), baseline)
    await page.locator('.odyssey-operations-pagination button').nth(1).evaluate(button => button.click())
    let previous = 0
    for (const time of [55, 100, 160, 240, 500]) {
      await page.clock.runFor(time - previous); previous = time
      samples.push({ time, ...await snapshot(), glowLight: light(await raster(), baseline) })
      if (time === 160) await page.locator('.odyssey-operations-usecase').screenshot({ path: `${evidence}/case-crossfade-160ms.png` })
    }
    await writeFile(`${evidence}/case-crossfade-samples.json`, JSON.stringify({ start, startLight, samples }, null, 2))
    const ending = samples.at(-1), referenceLight = Math.min(startLight, ending.glowLight)
    expect(referenceLight, 'the browser raster contains the ambient glow').toBeGreaterThan(.1)
    for (const sample of samples.slice(0, -1)) {
      const painted = sample.layers.filter(layer => layer.opacity > .01)
      expect(new Set(painted.map(layer => layer.text)).size, `both cases remain painted at ${sample.time}ms`).toBeGreaterThanOrEqual(2)
      expect(painted.reduce((sum, layer) => sum + layer.opacity, 0), `case weights at ${sample.time}ms`).toBeCloseTo(1, 2)
      expect(sample.glowLight, `no glow blackout at ${sample.time}ms`).toBeGreaterThan(referenceLight * .65)
      expect(sample.pages).toBe(1); expect(sample.bounds).toEqual(start.bounds)
      expect(painted.filter(layer => !layer.hidden && !layer.inert).length).toBe(1)
      expect(painted.filter(layer => layer.hidden).every(layer => layer.inert)).toBe(true)
    }
    expect(ending.layers).toHaveLength(1); expect(ending.layers[0].opacity).toBe(1)
    expect(await page.getByRole('heading', { level: 3 }).count()).toBe(1)
    const beforeAutomatic = ending.layers[0].text
    const elapsed = await page.locator('.odyssey-operations-usecase').evaluate(card => parseFloat(getComputedStyle(card).getPropertyValue('--odyssey-operations-case-progress')))
    await page.clock.runFor((1 - elapsed) * 6000 + 160)
    const automatic = await snapshot(), painted = automatic.layers.filter(layer => layer.opacity > .01)
    expect(painted.some(layer => layer.text === beforeAutomatic)).toBe(true)
    expect(painted.some(layer => layer.text !== beforeAutomatic)).toBe(true)
    expect(painted.reduce((sum, layer) => sum + layer.opacity, 0)).toBeCloseTo(1, 2)
    await page.clock.runFor(500)
    expect((await snapshot()).layers).toHaveLength(1)
  } finally { await page.close() }
}, 20000)

it('keeps only the latest rapid case request and removes unfinished fades on disposal', async () => {
  const page = await fixture({ reduced: false, clock: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    const layers = () => page.locator('[data-odyssey-operations-case-layer]').evaluateAll(layers => layers.map(layer => ({ index: layer.dataset.case, opacity: Number(getComputedStyle(layer).opacity) })))
    await page.locator('.odyssey-operations-pagination button').nth(1).evaluate(button => button.click()); await page.clock.runFor(120)
    const beforeRetarget = await layers()
    await page.locator('.odyssey-operations-pagination button').nth(2).evaluate(button => button.click())
    const afterRetarget = await layers()
    // Retargeting can advance the last rendered frame by less than one frame,
    // but must retain the current mixture instead of clearing or restarting it.
    for (const before of beforeRetarget) expect(Math.abs(afterRetarget.find(layer => layer.index === before.index)?.opacity - before.opacity)).toBeLessThan(.06)
    expect(afterRetarget.reduce((sum, layer) => sum + layer.opacity, 0)).toBeCloseTo(1, 2)
    await page.clock.runFor(160)
    const continuing = await layers()
    expect(continuing.filter(layer => layer.opacity > .01).length).toBeGreaterThanOrEqual(2)
    expect(continuing.reduce((sum, layer) => sum + layer.opacity, 0)).toBeCloseTo(1, 2)
    await page.clock.runFor(500)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('2')
    expect(await layers()).toEqual([{ index: '2', opacity: 1 }])
    expect(await page.getByRole('heading', { level: 3 }).count()).toBe(1)
    await page.locator('.odyssey-operations-pagination button').first().evaluate(button => button.click()); await page.clock.runFor(80)
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
    expect(await layers()).toEqual([{ index: '0', opacity: 1 }])
    await page.clock.runFor(1000)
    expect(await layers()).toEqual([{ index: '0', opacity: 1 }])
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) })
    await page.locator('.odyssey-operations-pagination button').nth(1).evaluate(button => button.click()); await page.clock.runFor(80)
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.clock.runFor(16)
    expect(await layers()).toEqual([{ index: '1', opacity: 1 }])
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.clock.runFor(16)
    await page.locator('.odyssey-operations-pagination button').first().evaluate(button => button.click()); await page.clock.runFor(40)
    await page.evaluate(() => window.homeOperations.dispose()); await page.clock.runFor(1000)
    expect(await region(page).count()).toBe(0)
    await page.evaluate(() => window.homeOperations.mount()); await page.clock.runFor(64)
    expect(await page.locator('.odyssey-operations-case-copy, .odyssey-operations-description, .odyssey-operations-gradient-field').evaluateAll(elements => elements.every(element => Number(getComputedStyle(element).opacity) === 1))).toBe(true)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 15000)

it('pauses case timing for hover, keyboard focus, hidden pages, and route cleanup, and resets manual selections', async () => {
  const page = await fixture({ reduced: false, clock: true })
  const caseProgress = () => page.locator('.odyssey-operations-usecase').evaluate(card => parseFloat(getComputedStyle(card).getPropertyValue('--odyssey-operations-case-progress')))
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await page.locator('.odyssey-operations-pagination button').first().evaluate(button => button.click())
    await page.clock.runFor(1800)
    const beforeHover = await caseProgress(), bounds = await page.locator('.odyssey-operations-usecase').boundingBox()
    await page.mouse.move(bounds.x + 40, bounds.y + 40)
    await page.clock.runFor(8000)
    expect(await caseProgress()).toBeCloseTo(beforeHover, 2)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('0')
    await page.mouse.move(1, 1); await page.clock.runFor(900)
    expect(await caseProgress()).toBeGreaterThan(beforeHover + .1)
    await page.locator('.odyssey-operations-pagination button').nth(2).evaluate(button => button.click())
    await page.clock.runFor(500)
    const resetProgress = await caseProgress()
    expect(resetProgress).toBeLessThan(.09)
    await page.clock.runFor(1000)
    expect(await caseProgress() - resetProgress).toBeGreaterThan(.13)
    expect(await caseProgress() - resetProgress).toBeLessThan(.19)
    await page.locator('.odyssey-operations-pagination button').first().focus()
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement.matches(':focus-visible'))).toBe(true)
    const beforeFocus = await caseProgress()
    await page.clock.runFor(8000)
    expect(await caseProgress()).toBeCloseTo(beforeFocus, 2)
    await page.evaluate(() => document.activeElement.blur()); await page.clock.runFor(500)
    expect(await caseProgress()).toBeGreaterThan(beforeFocus)
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
    const beforeHidden = await caseProgress()
    await page.clock.runFor(8000)
    expect(await caseProgress()).toBeCloseTo(beforeHidden, 2)
    await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')) }); await page.clock.runFor(500)
    expect(await caseProgress()).toBeGreaterThan(beforeHidden)
    await page.evaluate(() => document.body.dataset.workspaceSurface = 'settings'); await page.clock.runFor(12000)
    expect(await region(page).count()).toBe(0)
    await page.evaluate(() => delete document.body.dataset.workspaceSurface); await page.clock.runFor(64)
    const inputCase = await page.locator('.odyssey-operations-usecase').getAttribute('data-case')
    await page.clock.runFor(12000)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe(inputCase)
    await page.evaluate(() => window.homeOperations.dispose()); await page.clock.runFor(12000)
    expect(await region(page).count()).toBe(0)
  } finally { await page.close() }
}, 20000)

it('keeps automatic case timing disabled for reduced motion while manual paging still works', async () => {
  const page = await fixture({ reduced: true, clock: true })
  try {
    await toggle(page).click(); await waitState(page, 'operations')
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await page.clock.runFor(18000)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('0')
    await page.locator('.odyssey-operations-pagination button').nth(2).evaluate(button => button.click())
    await page.clock.runFor(18000)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('2')
    const fill = await page.locator('.odyssey-operations-pagination [aria-pressed="true"] i').evaluate(track => parseFloat(getComputedStyle(track, '::before').width) / track.clientWidth)
    expect(fill).toBeCloseTo(1, 2)
    expect(await page.locator('.odyssey-operations-case-copy, .odyssey-operations-description, .odyssey-operations-gradient-field').evaluateAll(elements => elements.every(element => Number(getComputedStyle(element).opacity) === 1))).toBe(true)
  } finally { await page.close() }
}, 15000)

it('decodes every original light/dark normal/color illustration as a nonempty browser image', async () => {
  const illustrations = [...importedImages].filter(([path]) => /\/src\/preload\/home-operations-assets\/illustration-/.test(path))
  expect(illustrations.length).toBe(16)
  expect(new Set(illustrations.map(([, data]) => data)).size).toBe(16)
  const page = await fixture()
  try {
    const decoded = await page.evaluate(async sources => Promise.all(sources.map(async src => {
      const image = new Image(); image.src = src
      await image.decode()
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 64
      const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, 64, 64)
      const pixels = context.getImageData(0, 0, 64, 64).data
      return { width: image.naturalWidth, height: image.naturalHeight, painted: pixels.some((value, index) => index % 4 === 3 && value > 0) }
    })), illustrations.map(([, data]) => data))
    for (const illustration of decoded) {
      expect(illustration.width).toBeGreaterThan(0)
      expect(illustration.height).toBeGreaterThan(0)
      expect(illustration.painted).toBe(true)
    }
  } finally { await page.close() }
})

it('renders the exported trend arrow and distinct final Figma light fields for all three cases', async () => {
  const page = await fixture()
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const arrow = page.locator('img.odyssey-operations-trend')
    expect(await arrow.count()).toBe(1)
    expect(await arrow.evaluate(async image => { await image.decode(); return image.naturalWidth > 0 && image.naturalHeight > 0 })).toBe(true)
    const allFields = []
    for (const dark of [false, true]) {
      if (dark) {
        await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
        expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('2')
        await expect.poll(() => page.locator('.odyssey-operations-glow.two').evaluate(glow => getComputedStyle(glow).backgroundImage)).not.toContain(allFields[2].src)
      }
      const fields = []
      for (let index = 0; index < 3; index++) {
        await page.locator('.odyssey-operations-pagination button').nth(index).click()
        await waitCase(page, index)
        fields.push(await page.locator('.odyssey-operations-glow.two').evaluate(async glow => {
          const style = getComputedStyle(glow), src = style.backgroundImage.slice(4, -1).replace(/^["']|["']$/g, '')
          const image = new Image(); image.src = src; await image.decode()
          return { src, opacity: Number(style.opacity), width: image.naturalWidth, height: image.naturalHeight }
        }))
      }
      expect(new Set(fields.map(field => field.src)).size).toBe(3)
      if (dark) expect(fields.every(field => field.opacity > .5 && field.opacity <= 1)).toBe(true)
      else expect(fields.map(field => field.opacity)).toEqual([.5, .58, .58])
      allFields.push(...fields)
    }
    expect(new Set(allFields.map(field => field.src)).size).toBe(6)
    for (const field of allFields) { expect(field.width).toBeGreaterThan(0); expect(field.height).toBeGreaterThan(0) }
  } finally { await page.close() }
}, 15000)

it('colors only the hovered illustration without changing its neighbors', async () => {
  const page = await fixture({ reduced: false })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const cards = page.locator('.odyssey-operations-quick-card')
    const appearance = () => cards.evaluateAll(elements => elements.map(element => {
      const illustration = element.querySelector('.odyssey-operations-illustration')
      const transform = getComputedStyle(element).transform, matrix = new DOMMatrixReadOnly(transform)
      return { normal: Number(getComputedStyle(illustration.querySelector('img.normal')).opacity), colored: Number(getComputedStyle(illustration.querySelector('img.colored')).opacity), transform, tilt: Math.abs(matrix.m13) + Math.abs(matrix.m23) }
    }))
    await page.mouse.move(1, 1)
    await expect.poll(async () => (await appearance()).every(card => card.normal === 1 && card.colored === 0)).toBe(true)
    await cards.first().hover({ position: { x: 12, y: 12 } })
    await expect.poll(async () => { const card = (await appearance())[0]; return { normal: card.normal, colored: card.colored } }).toEqual({ normal: 0, colored: 1 })
    const hovered = await appearance()
    expect(hovered[0].normal).toBe(0)
    expect(hovered.slice(1).every(card => card.normal === 1 && card.colored === 0)).toBe(true)
    expect(hovered[0].transform).not.toBe('none')
    expect(hovered[0].tilt).toBeGreaterThan(0)
    await page.mouse.move(1, 1)
    await expect.poll(async () => (await appearance()).every(card => card.normal === 1 && card.colored === 0)).toBe(true)
  } finally { await page.close() }
}, 15000)

it('crossfades identical illustration controls without a dim middle frame or jumps on rapid reversal', async () => {
  const page = await fixture({ dark: true, reduced: false, clock: true }), card = page.locator('.odyssey-operations-quick-card').first()
  const samples = []
  const seek = time => card.evaluate((card, time) => {
    const animations = card.getAnimations({ subtree: true }).filter(animation => animation.transitionProperty === 'opacity')
    for (const animation of animations) { animation.pause(); animation.currentTime = time }
    const image = card.querySelector('img.colored')
    return { opacity: Number(getComputedStyle(image).opacity), durations: animations.map(animation => Number(animation.effect.getTiming().duration)) }
  }, time)
  const raster = async () => PNG.sync.read(await card.screenshot())
  const energy = (png, backdrop) => {
    let value = 0
    for (let y = 42; y < png.height - 8; y += 2) for (let x = 8; x < png.width - 8; x += 2) {
      const actual = patchRgb(png, x, y, 0), bare = patchRgb(backdrop, x, y, 0)
      value += actual.reduce((sum, value, channel) => sum + Math.abs(value - bare[channel]), 0)
    }
    return value
  }
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await card.evaluate(async card => {
      for (const animation of card.getAnimations({ subtree: true })) if ('animationName' in animation) { animation.pause(); animation.currentTime = 0 }
      card.style.setProperty('transform', 'none', 'important')
      card.style.setProperty('background-color', getComputedStyle(card).backgroundColor, 'important')
      const illustration = card.querySelector('.odyssey-operations-illustration')
      for (const parent of [illustration, ...illustration.querySelectorAll('.odyssey-operations-illustration-pass')]) {
        const source = parent.querySelector('img.normal').src
        for (const image of parent.querySelectorAll(':scope > img')) { image.src = source; image.style.setProperty('filter', 'grayscale(1)', 'important'); await image.decode() }
      }
      illustration.style.visibility = 'hidden'
    })
    const backdrop = await raster()
    await card.locator('.odyssey-operations-illustration').evaluate(illustration => illustration.style.removeProperty('visibility'))
    const baseline = energy(await raster(), backdrop)
    await card.hover({ position: { x: 60, y: 60 } })
    for (const time of [0, 60, 120, 180, 300]) { const phase = await seek(time); samples.push({ time, ...phase, energy: energy(await raster(), backdrop) / baseline }) }
    await writeFile(`${evidence}/hover-illustration-energy.json`, JSON.stringify(samples, null, 2))
    for (const sample of samples) {
      expect(sample.energy, `${sample.time}ms retains the identical image control's raster energy`).toBeGreaterThanOrEqual(.94)
      expect(sample.energy, `${sample.time}ms does not brighten the identical image control`).toBeLessThanOrEqual(1.06)
    }
    expect(samples.find(sample => sample.time === 180).opacity, 'the illustration still eases toward color at 180ms').toBeLessThan(1)
    expect(samples.at(-1).opacity).toBe(1)
    expect(samples.flatMap(sample => sample.durations).every(duration => duration >= 280 && duration <= 340)).toBe(true)
    await page.mouse.move(1, 1); await seek(1000); await page.clock.runFor(350)
    await card.hover({ position: { x: 60, y: 60 } }); await seek(120)
    const before = energy(await raster(), backdrop)
    await page.mouse.move(1, 1); await seek(0)
    const reversed = energy(await raster(), backdrop)
    expect(Math.abs(reversed - before) / baseline, 'rapid leave retains the current visual mixture').toBeLessThan(.04)
    await seek(60)
    expect(energy(await raster(), backdrop) / baseline).toBeGreaterThanOrEqual(.94)
    await page.mouse.move(1, 1); await seek(1000); await page.clock.runFor(350)
    await card.hover({ position: { x: 60, y: 60 } }); await seek(120)
    const beforeWheel = energy(await raster(), backdrop)
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', -800)).toBe(true)
    const afterWheel = energy(await raster(), backdrop)
    expect(Math.abs(afterWheel - beforeWheel) / baseline, 'starting a region transition retains the unfinished illustration blend').toBeLessThan(.04)
  } finally { await page.close() }
}, 15000)

it('keeps a stationary pointer at the static anchor corner colored while the card tilts away from it', async () => {
  const page = await fixture({ dark: true, reduced: false }), samples = []
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    const anchor = page.locator('.odyssey-operations-quick-anchor').first(), bounds = await anchor.boundingBox()
    const point = { x: bounds.x + 1, y: bounds.y + 12 }
    await page.mouse.move(point.x, point.y); await page.waitForTimeout(500)
    for (let index = 0; index < 12; index++) {
      samples.push(await anchor.evaluate((anchor, point) => {
        const card = anchor.querySelector('.odyssey-operations-quick-card'), hit = document.elementFromPoint(point.x, point.y)
        return { anchorHovered: anchor.matches(':hover'), hitInsideAnchor: hit === anchor || anchor.contains(hit), cardHovered: card.matches(':hover'), colored: Number(getComputedStyle(card.querySelector('img.colored')).opacity) }
      }, point))
      await page.waitForTimeout(35)
    }
    await writeFile(`${evidence}/hover-anchor-corner-samples.json`, JSON.stringify(samples, null, 2))
    expect(samples.every(sample => sample.anchorHovered && sample.hitInsideAnchor)).toBe(true)
    expect(samples.every(sample => sample.colored === 1), 'static anchor hover survives the perspective retreat of the card edge').toBe(true)
  } finally { await page.close() }
}, 15000)

it('preserves the unfinished illustration mix when scrolling moves its anchor away from a stationary pointer', async () => {
  const page = await fixture({ dark: true, reduced: false, clock: true }), samples = []
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    const anchor = page.locator('.odyssey-operations-quick-anchor').first(), card = page.locator('.odyssey-operations-quick-card').first(), bounds = await anchor.boundingBox()
    await anchor.evaluate(anchor => { window.homeOperations.illustrationLeaves = 0; anchor.addEventListener('pointerleave', () => window.homeOperations.illustrationLeaves++) })
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
    await card.evaluate(card => { for (const animation of card.getAnimations({ subtree: true })) if (animation.transitionProperty === 'opacity') { animation.pause(); animation.currentTime = 120 } })
    await page.mouse.wheel(0, -800); await page.waitForTimeout(20)
    let previous = 0
    for (const time of [0, 40, 80, 120, 160, 200]) {
      await page.clock.runFor(time - previous); previous = time; await page.waitForTimeout(20)
      samples.push({ time, ...await card.evaluate(card => {
        const normal = getComputedStyle(card.querySelector('img.normal')), colored = getComputedStyle(card.querySelector('img.colored'))
        return { normal: Number(normal.opacity), colored: Number(colored.opacity), blend: colored.mixBlendMode, active: card.hasAttribute('data-odyssey-operations-illustration-blending'), anchorHovered: card.parentElement.matches(':hover'), leaves: window.homeOperations.illustrationLeaves, regionOpacity: Number(getComputedStyle(card.closest('[data-odyssey-home-operations]')).opacity) }
      }) })
      await card.screenshot({ path: `${evidence}/hover-moving-wheel-${time}.png` })
    }
    await writeFile(`${evidence}/hover-moving-wheel-samples.json`, JSON.stringify(samples, null, 2))
    expect(samples.at(-1).leaves, 'the moving anchor actually leaves the fixed pointer').toBeGreaterThan(0)
    expect(samples.some(sample => sample.colored > .02 && sample.colored < .98)).toBe(true)
    for (const sample of samples) if (sample.normal > .02 && sample.colored > .02 && sample.regionOpacity > 0) {
      expect(sample.normal + sample.colored).toBeCloseTo(1, 2)
      expect(sample.active, `the ${sample.time}ms moving mixture keeps its blending scope`).toBe(true)
      expect(sample.blend).toBe('plus-lighter')
    }
  } finally { await page.close() }
}, 15000)

it.each([false, true])('adds one reversible presentation-blue glass tint to all four quick cards without pointer glow, shadows, or lift (dark=%s)', async dark => {
    const page = await fixture({ reduced: false, dark })
    try {
      await toggle(page).click()
      await waitState(page, 'operations')
      const tints = []
      const appearance = card => card.evaluate(element => { const style = getComputedStyle(element); return { background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, materialShadow: style.boxShadow, anchorShadow: getComputedStyle(element.closest('.odyssey-operations-tilt-anchor')).boxShadow } })
      for (const card of await page.locator('.odyssey-operations-usecase, .odyssey-operations-quick-card').all()) {
        await page.mouse.move(1, 1)
        const rest = await appearance(card), kind = await card.getAttribute('data-card')
        await card.hover({ position: { x: 30, y: 30 } })
        await page.waitForTimeout(320)
        await expect.poll(() => card.evaluate(element => element.getAnimations().filter(animation => animation.transitionProperty === 'background-color').every(animation => animation.playState === 'finished'))).toBe(true)
        const hover = await card.evaluate(element => {
          const style = getComputedStyle(element), matrix = new DOMMatrixReadOnly(style.transform)
          return { background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, materialShadow: style.boxShadow, anchorShadow: getComputedStyle(element.closest('.odyssey-operations-tilt-anchor')).boxShadow, verticalLift: matrix.m42, lights: [...element.querySelectorAll('.odyssey-operations-pointer-light')].map(light => { const style = getComputedStyle(light); return style.display === 'none' ? 0 : Number(style.opacity) }) }
        })
        expect(hover.lights.every(opacity => opacity === 0)).toBe(true)
        if (kind) {
          expect(`${hover.background}|${hover.image}`).not.toBe(`${rest.background}|${rest.image}`)
          tints.push(`${hover.background}|${hover.image}`)
          const [red, green, blue, alpha = 1] = hover.background.match(/[\d.]+/g).map(Number)
          expect(alpha).toBeGreaterThan(0)
          const restChannels = rest.background.match(/[\d.]+/g).map(Number)
          if (dark) expect(alpha).toBeGreaterThanOrEqual((restChannels[3] ?? 1) - .001)
          else {
            expect(alpha).toBeGreaterThanOrEqual(.7)
            expect(alpha).toBeLessThan(restChannels[3] ?? 1)
            expect(Math.min(red, green, blue), 'light hover has a pale, brighter glass face').toBeGreaterThanOrEqual(230)
            const label = await card.locator('.odyssey-operations-quick-label').evaluate(label => { const bounds = label.getBoundingClientRect(), card = label.closest('.odyssey-operations-quick-card').getBoundingClientRect(); return { x: bounds.x - card.x, y: bounds.y - card.y, width: bounds.width, height: bounds.height, color: getComputedStyle(label).color.match(/[\d.]+/g).map(Number).slice(0, 3) } })
            await card.locator('.odyssey-operations-quick-label').evaluate(label => label.style.visibility = 'hidden')
            const png = PNG.sync.read(await card.screenshot())
            await card.locator('.odyssey-operations-quick-label').evaluate(label => label.style.removeProperty('visibility'))
            for (const x of [.1, .5, .9]) expect(contrastRatio(label.color, patchRgb(png, label.x + label.width * x, label.y + label.height * .5)), 'light hovered label remains readable').toBeGreaterThanOrEqual(4.5)
          }
          expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(90)
          expect(blue).toBeGreaterThan(red + 10)
          expect(blue).toBeGreaterThan(green + 4)
        } else {
          expect(hover.background).toBe(rest.background)
          expect(hover.image).toBe(rest.image)
        }
        expect(hover.shadow).toBe(rest.shadow)
        expect(hover.materialShadow).toBe(rest.materialShadow)
        expect(hover.anchorShadow).toBe(rest.anchorShadow)
        expect(Math.abs(hover.verticalLift)).toBeLessThan(.1)
        await page.mouse.move(1, 1)
        await expect.poll(() => appearance(card)).toEqual(rest)
      }
      await writeFile(`${evidence}/hover-material-${dark ? 'dark' : 'light'}.json`, JSON.stringify(tints, null, 2))
      expect(new Set(tints).size).toBe(1)
    } finally { await page.close() }
}, 15000)

it('keeps all five card surfaces distinct and description text readable over black, white, and busy backgrounds', async () => {
  const observations = []
  for (const dark of [false, true]) {
    const page = await fixture({ dark, reduced: true })
    try {
      await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
      await page.addStyleTag({ content: '.home-operations-material-probe-off::before { visibility:hidden !important; }' })
      for (const [name, background] of [['black', '#000'], ['white', '#fff'], ['busy', 'repeating-linear-gradient(45deg,#00afff 0 18px,#ff8a00 18px 36px,#101820 36px 54px,#fcfcfc 54px 72px)']]) {
        await page.locator('.pI_x6G_centerCol').evaluate((host, background) => host.style.setProperty('background', background, 'important'), background)
        await region(page).screenshot({ path: `${evidence}/material-${dark ? 'dark' : 'light'}-${name}.png` })
        const geometry = await page.evaluate(() => {
          const description = document.querySelector('.odyssey-operations-description'), bounds = description.getBoundingClientRect()
          return { foreground: getComputedStyle(description).color.match(/[\d.]+/g).map(Number), description: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, labels: [...document.querySelectorAll('.odyssey-operations-quick-label')].map(label => { const bounds = label.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, color: getComputedStyle(label).color.match(/[\d.]+/g).map(Number).slice(0, 3) } }), cards: [...document.querySelectorAll('.odyssey-operations-usecase, .odyssey-operations-quick-card')].map(card => { const bounds = card.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width } }) }
        })
        await page.locator('.odyssey-operations-description, .odyssey-operations-quick-label').evaluateAll(elements => elements.forEach(element => element.style.visibility = 'hidden'))
        const png = PNG.sync.read(await page.screenshot())
        // Compare the underlying glass separately so a decorative color hotspot
        // is not mistaken for a change to the material's background opacity.
        await page.locator('.odyssey-operations-quick-card').evaluateAll(cards => cards.forEach(card => card.classList.add('home-operations-material-probe-off')))
        const material = PNG.sync.read(await page.screenshot())
        await page.locator('.odyssey-operations-quick-card').evaluateAll(cards => cards.forEach(card => card.classList.remove('home-operations-material-probe-off')))
        await page.locator('.odyssey-operations-description, .odyssey-operations-quick-label').evaluateAll(elements => elements.forEach(element => element.style.removeProperty('visibility')))
        const cards = geometry.cards.map(card => patchRgb(png, card.x + card.width * .65, card.y + 6))
        const materialCards = geometry.cards.map(card => patchRgb(material, card.x + card.width * .65, card.y + 6))
        const edgeSeparation = geometry.cards.map(card => {
          const outside = patchRgb(png, card.x + card.width * .65, card.y - 5)
          // Measure the material edge at native pixel resolution.
          return Math.max(...[-2, -1, 0, 1, 2].map(dy => patchRgb(png, card.x + card.width * .65, card.y + dy, 0).reduce((sum, value, channel) => sum + Math.abs(value - outside[channel]), 0) / 3))
        })
        const ratios = []
        for (const x of [.1, .5, .9]) for (const y of [.2, .5, .8]) ratios.push(contrastRatio(geometry.foreground.slice(0, 3), patchRgb(png, geometry.description.x + geometry.description.width * x, geometry.description.y + geometry.description.height * y)))
        const labelRatios = geometry.labels.flatMap(label => [.1, .5, .9].map(x => contrastRatio(label.color, patchRgb(png, label.x + label.width * x, label.y + label.height * .5))))
        observations.push({ dark, name, cards, materialCards, edgeSeparation, minimumDescriptionContrast: Math.min(...ratios), minimumLabelContrast: Math.min(...labelRatios) })
      }
    } finally { await page.close() }
  }
  await writeFile(`${evidence}/material-readability.json`, JSON.stringify(observations, null, 2))
  for (const dark of [false, true]) {
    const modes = observations.filter(observation => observation.dark === dark)
    for (let card = 0; card < 5; card++) for (let channel = 0; channel < 3; channel++) {
      const values = modes.map(observation => observation.cards[card][channel])
      expect(Math.max(...values) - Math.min(...values), `${dark ? 'dark' : 'light'} card ${card} balances backdrop transmission with a visible glass face`).toBeLessThan(dark ? 85 : 60)
    }
    for (let card = 1; card < 5; card++) {
      const black = modes.find(mode => mode.name === 'black').materialCards[card], white = modes.find(mode => mode.name === 'white').materialCards[card]
      const transmission = white.reduce((sum, value, channel) => sum + value - black[channel], 0) / 3
      expect(transmission, `${dark ? 'dark' : 'light'} quick card ${card} transmits a stronger amount of its backdrop`).toBeGreaterThanOrEqual(dark ? 60 : 25)
      if (dark) expect(transmission).toBeLessThanOrEqual(80)
      const decoratedBlack = modes.find(mode => mode.name === 'black').cards[card], decoratedWhite = modes.find(mode => mode.name === 'white').cards[card]
      const decoratedTransmission = decoratedWhite.reduce((sum, value, channel) => sum + value - decoratedBlack[channel], 0) / 3
      expect(Number(decoratedTransmission.toFixed(6)), 'the visible ambient retains most of the glass transmission').toBeGreaterThanOrEqual(Number((transmission * .8).toFixed(6)))
    }
  }
  for (const observation of observations) {
    expect(observation.minimumDescriptionContrast, `${observation.dark ? 'dark' : 'light'} ${observation.name} description contrast`).toBeGreaterThanOrEqual(4.5)
    expect(observation.minimumLabelContrast, `${observation.dark ? 'dark' : 'light'} ${observation.name} quick label contrast`).toBeGreaterThanOrEqual(4.5)
  }
}, 20000)

it('keeps idle card text planar and unfiltered while drawing no card borders', async () => {
  const alignment = []
  for (const dark of [false, true]) for (const width of [1380, 1823]) {
    const page = await fixture({ dark, width, height: 1115, reduced: false })
    try {
      await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
      const observations = await page.locator('.odyssey-operations-usecase, .odyssey-operations-quick-card').evaluateAll(cards => cards.map(card => {
        const style = getComputedStyle(card), anchor = getComputedStyle(card.closest('.odyssey-operations-tilt-anchor'))
        const copy = card.querySelector('.odyssey-operations-case-copy, .odyssey-operations-quick-label')
        const textStyles = []
        for (let element = copy; element && element !== card.parentElement; element = element.parentElement) {
          const style = getComputedStyle(element)
          textStyles.push({ filter: style.filter, opacity: Number(style.opacity), transform: style.transform })
        }
        return { transform: style.transform, borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].map(parseFloat), outline: style.outlineStyle, cardShadow: style.boxShadow, anchorShadow: anchor.boxShadow, textStyles }
      }))
      for (const observation of observations) {
        expect(observation.borders.every(width => width === 0)).toBe(true)
        expect(observation.outline).toBe('none')
        expect(`${observation.cardShadow} ${observation.anchorShadow}`).not.toContain('inset')
        expect(observation.transform, 'idle cards do not rasterize text through perspective').toBe('none')
        for (const style of observation.textStyles) {
          expect(style.filter).toBe('none'); expect(style.opacity).toBe(1)
          expect(style.transform).not.toContain('matrix3d')
          if (style.transform !== 'none') expect(style.transform).toMatch(/^matrix\(1, 0, 0, 1, /)
        }
      }
      const textPixels = await page.locator('.odyssey-operations-title, .odyssey-operations-subtitle, .odyssey-operations-description, .odyssey-operations-quick-label').evaluateAll(elements => elements.map(element => { const bounds = element.getBoundingClientRect(); return { name: element.className, x: bounds.x * devicePixelRatio, y: bounds.y * devicePixelRatio } }))
      alignment.push({ dark, width, textPixels })
      for (const text of textPixels) for (const axis of ['x', 'y']) expect(Math.abs(text[axis] - Math.round(text[axis])), `${width}px ${text.name} ${axis} aligns to device pixels`).toBeLessThanOrEqual(.03)
      await page.locator('.odyssey-operations-case-copy').screenshot({ path: `${evidence}/text-clarity-${dark ? 'dark' : 'light'}-${width}.png` })
    } finally { await page.close() }
  }
  await writeFile(`${evidence}/text-device-pixel-alignment.json`, JSON.stringify(alignment, null, 2))
}, 15000)

it('shows an outside focus ring for keyboard navigation and leaves pointer-hover cards unframed', async () => {
  const page = await fixture()
  try {
    await toggle(page).click(); await waitState(page, 'operations')
    const cards = page.locator('.odyssey-operations-quick-card')
    for (let index = 0; index < 12 && !await page.evaluate(() => !!document.activeElement.closest('.odyssey-operations-pagination')); index++) await page.keyboard.press('Shift+Tab')
    expect(await page.evaluate(() => document.activeElement.matches(':focus-visible') && getComputedStyle(document.activeElement).outlineStyle !== 'none')).toBe(true)
    for (const card of await cards.all()) {
      await page.keyboard.press('Tab')
      const focus = await card.evaluate(element => {
        const style = getComputedStyle(element.closest('.odyssey-operations-quick-anchor'))
        return { focused: document.activeElement === element, visible: element.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth), offset: parseFloat(style.outlineOffset) }
      })
      expect(focus.focused && focus.visible).toBe(true)
      expect(focus.style).not.toBe('none'); expect(focus.width).toBeGreaterThanOrEqual(2); expect(focus.offset).toBeGreaterThan(0)
    }
    await region(page).screenshot({ path: `${evidence}/keyboard-focus-quick-card.png` })
    await page.evaluate(() => document.activeElement.blur()); await page.mouse.click(1, 1)
    for (const card of await cards.all()) {
      await card.hover({ position: { x: 30, y: 30 } })
      expect(await card.evaluate(element => getComputedStyle(element.closest('.odyssey-operations-quick-anchor')).outlineStyle)).toBe('none')
      expect(await card.evaluate(element => getComputedStyle(element).outlineStyle)).toBe('none')
    }
  } finally { await page.close() }
}, 15000)

it.each([false, true])('makes quick-card perspective clear while keeping the case card restrained and a stationary pointer stable (dark=%s)', async dark => {
  const page = await fixture({ dark, reduced: false }), observations = []
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const cards = page.locator('.odyssey-operations-usecase, .odyssey-operations-quick-card')
    expect(await cards.count()).toBe(5)
    for (const card of await cards.all()) {
      const kind = await card.getAttribute('data-card')
      await page.mouse.move(1, 1)
      await page.waitForTimeout(340)
      const artworkSize = await card.evaluate(card => {
        const image = card.querySelector('.odyssey-operations-illustration')
        return image ? { width: image.offsetWidth, height: image.offsetHeight } : null
      })
      const bounds = await card.boundingBox(), point = { x: bounds.x + bounds.width * .06, y: bounds.y + bounds.height * .06 }
      await page.mouse.move(point.x, point.y)
      let previousPose, stableFrames = 0
      // Frame scheduling can stretch the damping tail during concurrent builds.
      // Observe convergence before testing a genuinely stationary pointer.
      await expect.poll(async () => {
        await nextPaint(page)
        const pose = await card.evaluate(element => ['--rx', '--ry'].map(name => parseFloat(element.style.getPropertyValue(name)) || 0))
        stableFrames = previousPose && pose.every((value, index) => Math.abs(value - previousPose[index]) < .003) ? stableFrames + 1 : 0
        previousPose = pose
        return stableFrames
      }, { timeout: 2000, intervals: [16, 32, 48] }).toBeGreaterThanOrEqual(3)
      const samples = []
      for (let index = 0; index < 12; index++) {
        await card.dispatchEvent('pointermove', { clientX: point.x, clientY: point.y, pointerType: 'mouse', bubbles: true })
        await page.waitForTimeout(18)
        samples.push(await card.evaluate(element => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
          return { rx: parseFloat(element.style.getPropertyValue('--rx')) || 0, ry: parseFloat(element.style.getPropertyValue('--ry')) || 0, tilt: Math.abs(matrix.m13) + Math.abs(matrix.m23), textTransform: getComputedStyle(element.querySelector('.odyssey-operations-case-copy, .odyssey-operations-quick-label')).transform }
        }))
      }
      expect(samples.at(-1).tilt).toBeGreaterThan(.001)
      expect(samples.every(sample => sample.textTransform === 'none')).toBe(true)
      for (const name of ['rx', 'ry']) {
        const values = samples.map(sample => sample[name])
        expect(Math.abs(values.at(-1)), 'quick-card tilt is clearly visible at the pointer corner').toBeGreaterThan(kind ? 7 : 4)
        expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(kind ? 9.2 : 5.2)
        expect(Math.max(...values) - Math.min(...values)).toBeLessThan(.03)
      }
      if (kind) {
        expect(await card.evaluate(card => { const image = card.querySelector('.odyssey-operations-illustration'); return { width: image.offsetWidth, height: image.offsetHeight, transform: getComputedStyle(image).transform } })).toEqual({ ...artworkSize, transform: 'none' })
        await region(page).screenshot({ path: `${evidence}/quick-tilt-enhanced-${dark ? 'dark' : 'light'}-${kind}.png` })
      }
      observations.push({ kind: kind || 'case', ...samples.at(-1) })
      await page.mouse.move(1, 1)
      await expect.poll(() => card.evaluate(element => ({ flag: element.hasAttribute('data-odyssey-operations-tilting'), transform: getComputedStyle(element).transform }))).toEqual({ flag: false, transform: 'none' })
      await card.dispatchEvent('pointermove', { clientX: point.x, clientY: point.y, pointerType: 'touch', bubbles: true })
      await nextPaint(page)
      expect(await card.evaluate(element => getComputedStyle(element).transform)).toBe('none')
    }
    await writeFile(`${evidence}/quick-tilt-enhanced-${dark ? 'dark' : 'light'}.json`, JSON.stringify(observations, null, 2))
  } finally { await page.close() }
}, 20000)

it('separates neutral dark glass faces from black, blue-black, and busy backgrounds', async () => {
  const page = await fixture({ dark: true, reduced: true }), observations = []
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    for (const [name, background] of [['black', '#000'], ['blue-black', '#101b2c'], ['busy', 'repeating-linear-gradient(45deg,#00afff 0 18px,#ff8a00 18px 36px,#101820 36px 54px,#fcfcfc 54px 72px)']]) {
      await page.locator('.pI_x6G_centerCol').evaluate((host, background) => host.style.setProperty('background', background, 'important'), background)
      const cards = await page.locator('.odyssey-operations-usecase, .odyssey-operations-quick-card').evaluateAll(elements => elements.map(card => { const bounds = card.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } }))
      const png = PNG.sync.read(await page.screenshot())
      await region(page).screenshot({ path: `${evidence}/material-refined-dark-${name}.png` })
      observations.push({ name, surfaces: cards.map(card => {
        const face = patchRgb(png, card.x + card.width * .65, card.y + 7), outside = patchRgb(png, card.x + card.width * .65, card.y - 5)
        return { face, channelSpread: Math.max(...face) - Math.min(...face), faceLuminance: luminance(face), backgroundContrast: contrastRatio(face, outside) }
      }) })
    }
    await writeFile(`${evidence}/material-refined-dark-readability.json`, JSON.stringify(observations, null, 2))
    for (const observation of observations) for (const [index, surface] of observation.surfaces.entries()) {
      // The case artwork has deliberate colored glows; the four resting quick
      // surfaces should remain neutral even over a mildly contaminating backdrop.
      if (index > 0 && observation.name === 'black') expect(surface.channelSpread, `${observation.name} quick card ${index} keeps a neutral black hue`).toBeLessThanOrEqual(8)
      if (observation.name !== 'busy') expect(surface.backgroundContrast, `${observation.name} card ${index} separates from its dark background`).toBeGreaterThanOrEqual(1.2)
    }
  } finally { await page.close() }
}, 15000)

it('renders clearly moving distinct ambient gradients inside every quick card without obscuring white-backdrop labels or leaking past the corners', async () => {
  const observations = []
  const difference = (first, second, card) => {
    let sum = 0, count = 0
    for (let y = 12; y < card.height - 12; y += 3) for (let x = 12; x < card.width - 12; x += 3) {
      const a = patchRgb(first, card.x + x, card.y + y, 0), b = patchRgb(second, card.x + x, card.y + y, 0)
      sum += a.reduce((sum, value, channel) => sum + Math.abs(value - b[channel]), 0) / 3; count++
    }
    return sum / count
  }
  for (const dark of [false, true]) {
    const page = await fixture({ dark, reduced: false, clock: true })
    try {
      await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
      await page.addStyleTag({ content: '.home-operations-ambient-probe-off::before { visibility:hidden !important; }' })
      await page.locator('.pI_x6G_centerCol').evaluate(host => host.style.setProperty('background', '#fff', 'important'))
      await page.locator('.odyssey-operations-usecase').evaluate(card => { for (const animation of card.getAnimations({ subtree: true })) { animation.pause(); animation.currentTime = 0 } })
      await page.locator('.odyssey-operations-quick-card img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
      const geometry = await page.locator('.odyssey-operations-quick-card').evaluateAll(cards => cards.map(card => {
        const bounds = card.getBoundingClientRect(), label = card.querySelector('.odyssey-operations-quick-label'), text = label.getBoundingClientRect()
        return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, label: { x: text.x, y: text.y, width: text.width, height: text.height, color: getComputedStyle(label).color.match(/[\d.]+/g).map(Number).slice(0, 3) } }
      }))
      const frames = []
      const seek = fraction => page.locator('.odyssey-operations-quick-card').evaluateAll((cards, fraction) => {
        const phases = []
        for (const card of cards) for (const animation of card.getAnimations({ subtree: true })) if ('animationName' in animation) {
          const timing = animation.effect.getTiming()
          animation.pause(); animation.currentTime = Number(timing.duration) * (1 + fraction) + timing.delay
          phases.push({ direction: timing.direction, progress: animation.effect.getComputedTiming().progress })
        }
        return phases
      }, fraction)
      for (const phase of [0, .25, .5, .75]) {
        const timing = await seek(phase)
        if (phase === 0 || phase === .5) for (const sample of timing) expect(sample.progress, 'the raster samples the actual animation endpoint or peak').toBeCloseTo(phase === .5 ? .5 : sample.direction === 'reverse' ? 1 : 0, 5)
        await page.locator('.odyssey-operations-quick-label').evaluateAll(labels => labels.forEach(label => label.style.visibility = 'hidden'))
        const frame = PNG.sync.read(await page.screenshot()); frames.push(frame)
        for (const [index, card] of geometry.entries()) {
          const ratios = [.1, .5, .9].map(x => contrastRatio(card.label.color, patchRgb(frame, card.label.x + card.label.width * x, card.label.y + card.label.height * .5)))
          observations.push({ dark, index, phase, minimumLabelContrast: Math.min(...ratios) })
        }
        await page.locator('.odyssey-operations-quick-label').evaluateAll(labels => labels.forEach(label => label.style.removeProperty('visibility')))
        await region(page).screenshot({ path: `${evidence}/ambient-small-${dark ? 'dark' : 'light'}-phase-${phase * 100}.png` })
      }
      await seek(0)
      await page.locator('.odyssey-operations-quick-card').evaluateAll(cards => cards.forEach(card => card.classList.add('home-operations-ambient-probe-off')))
      await page.locator('.odyssey-operations-quick-label').evaluateAll(labels => labels.forEach(label => label.style.visibility = 'hidden'))
      const plain = PNG.sync.read(await page.screenshot())
      for (const [index, card] of geometry.entries()) {
        const phaseDifferences = []
        for (let from = 0; from < frames.length; from++) for (let to = from + 1; to < frames.length; to++) phaseDifferences.push(difference(frames[from], frames[to], card))
        const outside = [[card.x - 2, card.y + card.height / 2], [card.x + card.width + 2, card.y + card.height / 2], [card.x + card.width / 2, card.y - 2], [card.x + 1, card.y + 1]]
        const outsideDifference = Math.max(...frames.flatMap(frame => outside.map(([x, y]) => patchRgb(frame, x, y, 0).reduce((sum, value, channel) => sum + Math.abs(value - patchRgb(plain, x, y, 0)[channel]), 0) / 3)))
        const headerPatches = []
        for (let y = 8; y < 40; y += 4) for (let x = 8; x < card.width - 8; x += 4) {
          const actual = patchRgb(frames[0], card.x + x, card.y + y), bare = patchRgb(plain, card.x + x, card.y + y)
          headerPatches.push(actual.reduce((sum, value, channel) => sum + Math.abs(value - bare[channel]), 0) / 3)
        }
        const ambientSignatures = frames.map(frame => [.1, .3, .5, .7, .9].flatMap(x => [8, 16, 24, 32].flatMap(y => {
          const actual = patchRgb(frame, card.x + card.width * x, card.y + y), bare = patchRgb(plain, card.x + card.width * x, card.y + y)
          return actual.map((value, channel) => value - bare[channel])
        })))
        observations.push({ dark, index, decorationDifference: difference(frames[0], plain, card), visibleHeaderDifference: Math.max(...headerPatches), maximumPhaseDifference: Math.max(...phaseDifferences), outsideDifference, ambientSignatures })
      }
      if (dark) {
        await page.locator('.odyssey-operations-quick-label').evaluateAll(labels => labels.forEach(label => label.style.removeProperty('visibility')))
        await page.locator('.pI_x6G_centerCol').evaluate(host => host.style.setProperty('background', '#606060', 'important'))
        await page.locator('.odyssey-operations-quick-card').evaluateAll(cards => cards.forEach(card => card.classList.remove('home-operations-ambient-probe-off')))
        await region(page).screenshot({ path: `${evidence}/ambient-small-dark-gray-on.png` })
        await page.locator('.odyssey-operations-quick-card').evaluateAll(cards => cards.forEach(card => card.classList.add('home-operations-ambient-probe-off')))
        await region(page).screenshot({ path: `${evidence}/ambient-small-dark-gray-off.png` })
      }
    } finally { await page.close() }
  }
  await writeFile(`${evidence}/ambient-small-raster-readability.json`, JSON.stringify(observations, null, 2))
  for (const observation of observations) {
    if ('minimumLabelContrast' in observation) expect(observation.minimumLabelContrast, `${observation.dark ? 'dark' : 'light'} card ${observation.index} label at phase ${observation.phase}`).toBeGreaterThanOrEqual(4.5)
    else {
      expect(observation.decorationDifference, 'the ambient gradient is clearly present beyond the opaque artwork').toBeGreaterThan(5)
      expect(observation.visibleHeaderDifference, 'a visible header patch reveals the gradient instead of hiding it beneath the illustration').toBeGreaterThan(8)
      expect(observation.decorationDifference, 'the ambient layer remains restrained').toBeLessThan(16)
      expect(observation.maximumPhaseDifference, 'every gradient visibly changes over its full cycle').toBeGreaterThan(1.25)
      expect(observation.outsideDifference, 'the ambient layer remains inside the clipped card').toBeLessThanOrEqual(1)
    }
  }
  const pairDifferences = []
  const signatureDistance = (first, second) => first.reduce((sum, value, index) => sum + Math.abs(value - second[index]), 0) / first.length
  for (const dark of [false, true]) {
    const cards = observations.filter(observation => observation.dark === dark && 'ambientSignatures' in observation)
    for (const [index, first] of cards.entries()) for (const second of cards.slice(index + 1)) {
      const motion = card => card.ambientSignatures.slice(1).flatMap(signature => signature.map((value, index) => value - card.ambientSignatures[0][index]))
      pairDifferences.push({ dark, cards: [first.index, second.index], defaultDifference: signatureDistance(first.ambientSignatures[0], second.ambientSignatures[0]), motionDifference: signatureDistance(motion(first), motion(second)) })
    }
  }
  await writeFile(`${evidence}/ambient-small-card-variation.json`, JSON.stringify(pairDifferences, null, 2))
  for (const pair of pairDifferences) {
    expect(pair.defaultDifference, 'each default gradient paints a different visible field, independently of its illustration').toBeGreaterThan(.8)
    expect(pair.motionDifference, 'the four visible gradient fields do not change in identical lockstep').toBeGreaterThan(.15)
  }
}, 20000)

it('actually blurs a high-frequency checkerboard behind the translucent glass', async () => {
  const page = await fixture({ dark: true }), card = page.locator('.odyssey-operations-quick-card').first()
  const roughness = png => {
    let sum = 0, count = 0
    for (let y = 4; y < 10; y++) for (let x = 12; x < png.width - 13; x++) {
      const first = patchRgb(png, x, y, 0), next = patchRgb(png, x + 1, y, 0)
      sum += first.reduce((sum, value, channel) => sum + Math.abs(value - next[channel]), 0) / 3; count++
    }
    return sum / count
  }
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.locator('.pI_x6G_centerCol').evaluate(host => host.style.setProperty('background', 'repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0 0 / 8px 8px', 'important'))
    const filtered = PNG.sync.read(await card.screenshot({ path: `${evidence}/glass-checker-filtered.png` }))
    await card.evaluate(card => { card.style.setProperty('backdrop-filter', 'none', 'important'); card.style.setProperty('-webkit-backdrop-filter', 'none', 'important') })
    const unfiltered = PNG.sync.read(await card.screenshot({ path: `${evidence}/glass-checker-unfiltered.png` }))
    const metrics = { filtered: roughness(filtered), unfiltered: roughness(unfiltered) }
    await writeFile(`${evidence}/glass-checker-roughness.json`, JSON.stringify(metrics, null, 2))
    expect(metrics.unfiltered, 'the control exposes the checkerboard through the same material').toBeGreaterThan(.5)
    expect(metrics.filtered, 'the actual backdrop filter suppresses sharp checker edges').toBeLessThan(metrics.unfiltered * .35)
  } finally { await page.close() }
}, 15000)

it('makes ambient glow visibly evolve while keeping every case description readable at motion peaks', async () => {
  const page = await fixture({ dark: true, reduced: false, clock: true }), observations = []
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await page.locator('.pI_x6G_centerCol').evaluate(host => host.style.setProperty('background', '#fff', 'important'))
    for (let index = 0; index < 3; index++) {
      await page.locator('.odyssey-operations-pagination button').nth(index).evaluate(button => button.click()); await page.clock.runFor(500)
      const frames = []
      const phases = [0, 4000, 6000, 8000]
      for (const phase of phases) {
        await page.locator('.odyssey-operations-usecase').evaluate((card, phase) => {
          for (const animation of card.getAnimations({ subtree: true })) if (animation.effect?.target?.classList.contains('odyssey-operations-glow')) { animation.pause(); animation.currentTime = phase }
        }, phase)
        const description = await page.locator('.odyssey-operations-description').evaluate(element => { const bounds = element.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, color: getComputedStyle(element).color.match(/[\d.]+/g).map(Number).slice(0, 3) } })
        await page.locator('.odyssey-operations-description').evaluate(element => element.style.visibility = 'hidden')
        const screen = PNG.sync.read(await page.screenshot())
        const ratios = []
        for (const x of [.1, .5, .9]) for (const y of [.2, .5, .8]) ratios.push(contrastRatio(description.color, patchRgb(screen, description.x + description.width * x, description.y + description.height * y)))
        await page.locator('.odyssey-operations-case-copy, .odyssey-operations-pagination').evaluateAll(elements => elements.forEach(element => element.style.visibility = 'hidden'))
        const frame = PNG.sync.read(await page.locator('.odyssey-operations-usecase').screenshot())
        frames.push(frame)
        let brightness = 0, pixels = 0
        for (let y = 12; y < frame.height - 12; y += 3) for (let x = 12; x < frame.width - 12; x += 3) { brightness += luminance(patchRgb(frame, x, y, 0)); pixels++ }
        await page.locator('.odyssey-operations-case-copy, .odyssey-operations-description, .odyssey-operations-pagination').evaluateAll(elements => elements.forEach(element => element.style.removeProperty('visibility')))
        await page.locator('.odyssey-operations-usecase').screenshot({ path: `${evidence}/glow-contrast-dark-white-case-${index}-phase-${phase}.png` })
        observations.push({ index, phase, meanArtworkLuminance: brightness / pixels, minimumDescriptionContrast: Math.min(...ratios) })
      }
      const frameDifferences = []
      for (let from = 0; from < frames.length; from++) for (let to = from + 1; to < frames.length; to++) {
        let difference = 0, count = 0
        for (let y = 12; y < frames[0].height - 12; y += 3) for (let x = 12; x < frames[0].width - 12; x += 3) {
          const first = patchRgb(frames[from], x, y, 0), last = patchRgb(frames[to], x, y, 0)
          difference += first.reduce((sum, value, channel) => sum + Math.abs(value - last[channel]), 0) / 3; count++
        }
        frameDifferences.push({ from: phases[from], to: phases[to], meanDifference: difference / count })
      }
      observations.push({ index, frameDifferences, meanFrameDifference: Math.max(...frameDifferences.map(frame => frame.meanDifference)) })
    }
    await writeFile(`${evidence}/glow-motion-readability.json`, JSON.stringify(observations, null, 2))
    for (const observation of observations) {
      if ('minimumDescriptionContrast' in observation) expect(observation.minimumDescriptionContrast, `case ${observation.index} phase ${observation.phase} text contrast`).toBeGreaterThanOrEqual(4.5)
      if ('meanFrameDifference' in observation) expect(observation.meanFrameDifference, `case ${observation.index} has visibly changing ambient artwork`).toBeGreaterThan(2)
    }
  } finally { await page.close() }
}, 20000)

it('gives the active timer fill clear raster contrast without changing its six-second timing', async () => {
  const page = await fixture({ dark: true, reduced: false, clock: true })
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await page.locator('.odyssey-operations-pagination button').first().evaluate(button => button.click()); await page.clock.runFor(3000)
    const track = await page.locator('.odyssey-operations-pagination [aria-pressed="true"] i').evaluate(track => { const bounds = track.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, progress: parseFloat(getComputedStyle(track, '::before').width) / track.clientWidth } })
    const png = PNG.sync.read(await page.screenshot())
    const filled = patchRgb(png, track.x + track.width * .2, track.y + track.height * .5, 0), unfilled = patchRgb(png, track.x + track.width * .8, track.y + track.height * .5, 0)
    const metrics = { ...track, filled, unfilled, contrast: contrastRatio(filled, unfilled) }
    await writeFile(`${evidence}/active-timer-raster.json`, JSON.stringify(metrics, null, 2))
    await page.locator('.odyssey-operations-usecase').screenshot({ path: `${evidence}/active-timer-dark.png` })
    expect(track.progress).toBeGreaterThan(.4); expect(track.progress).toBeLessThan(.6)
    expect(metrics.contrast, 'filled timer is distinguishable from the remaining rail').toBeGreaterThanOrEqual(3)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('0')
    await page.clock.runFor(3600)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('1')
  } finally { await page.close() }
}, 15000)

it('keeps all five cards and ambient fields static for reduced motion', async () => {
  const page = await fixture({ reduced: true })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    for (const card of await page.locator('.odyssey-operations-usecase, .odyssey-operations-quick-card').all()) {
      await card.hover({ position: { x: 20, y: 20 } })
      await card.dispatchEvent('pointermove', { clientX: 20, clientY: 20, pointerType: 'mouse', bubbles: true })
      const motion = await card.evaluate(element => {
        const style = getComputedStyle(element)
        return { transform: style.transform, transition: style.transitionDuration, blending: element.hasAttribute('data-odyssey-operations-illustration-blending'), ambient: [...element.querySelectorAll('.odyssey-operations-glow')].map(glow => getComputedStyle(glow).animationName).concat(getComputedStyle(element, '::before').animationName.split(',').map(name => name.trim())) }
      })
      expect(motion.transform).toBe('none')
      expect(motion.blending).toBe(false)
      expect(motion.transition.split(',').every(value => parseFloat(value) <= .001)).toBe(true)
      expect(motion.ambient.every(name => name === 'none')).toBe(true)
    }
  } finally { await page.close() }
}, 15000)

it('keeps every moving glow image edge outside the rounded card at several animation phases', async () => {
  const page = await fixture({ reduced: false })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    await page.mouse.move(1, 1)
    const parentClip = await region(page).evaluate(section => {
      const style = getComputedStyle(section)
      return { mask: style.maskImage, clip: style.clipPath, overflowX: style.overflowX, overflowY: style.overflowY }
    })
    expect(parentClip).toEqual({ mask: 'none', clip: 'none', overflowX: 'visible', overflowY: 'visible' })
    const observations = []
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
      for (let index = 0; index < 3; index++) {
        await page.locator('.odyssey-operations-pagination button').nth(index).click()
        await waitCase(page, index)
        for (const phase of [0, 3000, 4000, 6000, 8000, 9000, 11900]) {
          await page.locator('.odyssey-operations-usecase').evaluate((card, phase) => {
            for (const animation of card.getAnimations({ subtree: true })) {
              if (animation.effect?.target?.classList.contains('odyssey-operations-glow')) { animation.pause(); animation.currentTime = phase }
            }
          }, phase)
          await nextPaint(page)
          observations.push(await page.locator('.odyssey-operations-usecase').evaluate(card => {
            const bounds = card.getBoundingClientRect(), style = getComputedStyle(card), field = getComputedStyle(card.querySelector('.odyssey-operations-gradient-field'))
            return { clipped: ['hidden', 'clip'].includes(style.overflow), radius: parseFloat(style.borderTopLeftRadius), fieldClipped: ['hidden', 'clip'].includes(field.overflow), fieldRadius: Math.max(parseFloat(field.borderTopLeftRadius), parseFloat(field.clipPath.match(/round\s+([\d.]+)px/)?.[1] || '0')), margins: [...card.querySelectorAll('.odyssey-operations-glow')].map(glow => {
              const rect = glow.getBoundingClientRect()
              return [bounds.left - rect.left, bounds.top - rect.top, rect.right - bounds.right, rect.bottom - bounds.bottom]
            }) }
          }))
          if (index === 0 && [0, 3000, 4000, 8000, 9000].includes(phase)) await page.locator('.odyssey-operations-usecase').screenshot({ path: `${evidence}/glow-${dark ? 'dark' : 'light'}-phase-${phase}.png`, animations: 'allow' })
        }
      }
    }
    for (const observation of observations) {
      expect(observation.clipped).toBe(true)
      expect(observation.radius).toBeGreaterThan(0)
      expect(observation.fieldClipped).toBe(true)
      expect(observation.fieldRadius).toBeGreaterThan(0)
      expect(observation.margins).toHaveLength(2)
      for (const margins of observation.margins) expect(Math.min(...margins)).toBeGreaterThanOrEqual(-1)
    }
    for (const dark of [false, true]) {
      await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
      await page.locator('.odyssey-operations-usecase').hover({ position: { x: 30, y: 30 } })
      await page.waitForTimeout(420)
      await page.locator('.odyssey-operations-usecase').screenshot({ path: `${evidence}/large-tilt-edge-${dark ? 'dark' : 'light'}.png`, animations: 'allow' })
    }
  } finally { await page.close() }
}, 20000)

it('centers the actual card grid in a tall homepage pane', async () => {
  const page = await fixture({ width: 1823, height: 1115, themes: true })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const geometry = await page.evaluate(() => {
      const pane = document.querySelector('.pI_x6G_centerCol').getBoundingClientRect(), grid = document.querySelector('.odyssey-operations-grid').getBoundingClientRect()
      return { paneCenter: pane.y + pane.height / 2, gridCenter: grid.y + grid.height / 2 }
    })
    expect(Math.abs(geometry.gridCenter - geometry.paneCenter)).toBeLessThanOrEqual(12)
  } finally { await page.close() }
})

it('keeps the toggle at one low fixed position throughout state changes and hover', async () => {
  const page = await fixture({ width: 1823, height: 1115, themes: true, reduced: false })
  try {
    const pane = await page.locator('.pI_x6G_centerCol').boundingBox(), initial = await toggle(page).boundingBox(), positions = [initial.y]
    expect(initial.y - pane.y).toBeGreaterThan(pane.height * .75)
    expect(initial.width).toBeGreaterThanOrEqual(32); expect(initial.height).toBeGreaterThanOrEqual(32)
    expect(await toggle(page).evaluate(button => [getComputedStyle(button).borderTopWidth, getComputedStyle(button).borderRightWidth, getComputedStyle(button).borderBottomWidth, getComputedStyle(button).borderLeftWidth].every(width => parseFloat(width) === 0))).toBe(true)
    await toggle(page).hover()
    for (const delay of [30, 80, 180]) { await page.waitForTimeout(delay); positions.push((await toggle(page).boundingBox()).y) }
    await toggle(page).click()
    for (const delay of [0, 30, 80, 180, 360]) { await page.waitForTimeout(delay); positions.push((await toggle(page).boundingBox()).y) }
    await waitState(page, 'operations')
    const expanded = await toggle(page).boundingBox()
    expect(expanded.y).toBeCloseTo(initial.y,1)
    expect(await page.locator('[data-odyssey-theme-dock]').count()).toBe(0)
    await toggle(page).click()
    await waitState(page, 'input')
    positions.push((await toggle(page).boundingBox()).y)
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(.5)
  } finally { await page.close() }
}, 15000)

it.each([
  { width:800, height:640, panelWidth:0, dark:false },
  { width:800, height:640, panelWidth:0, dark:true },
  { width:1080, height:752, panelWidth:372, dark:false },
  { width:1080, height:752, panelWidth:372, dark:true }
])('retains the left-case and right-four-card composition with readable text and expansive artwork in the actual compact app window %j',async options=>{
 const page=await fixture({...options,sidebarWidth:88,themes:true,deviceScaleFactor:2})
 const label=`replacement-${options.width}-${options.height}-${options.dark?'dark':'light'}`
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 try{
  await toggle(page).click();await waitState(page,'operations');await nextPaint(page)
  const geometry=await page.evaluate(()=>{
   const section=document.querySelector('[data-odyssey-home-operations]'),rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height}}
   return {pane:rect(section.parentElement),section:rect(section),case:rect(section.querySelector('.odyssey-operations-usecase')),cards:[...section.querySelectorAll('.odyssey-operations-quick-card')].map(card=>{const label=card.querySelector('.odyssey-operations-quick-label');return {bounds:rect(card),font:parseFloat(getComputedStyle(label).fontSize)*label.getBoundingClientRect().height/label.offsetHeight,image:rect(card.querySelector('.odyssey-operations-illustration')),fit:getComputedStyle(card.querySelector('img')).objectFit}}),overflow:section.scrollHeight-section.clientHeight}
  })
  await writeFile(`${evidence}/${label}.json`,JSON.stringify(geometry,null,2))
  const withArt=PNG.sync.read(await page.screenshot({path:`${evidence}/${label}.png`,scale:'css'}))
  expect(geometry.cards[0].bounds.x,'the four quick starts stay to the right of the tall case').toBeGreaterThan(geometry.case.right+5)
  expect(geometry.case.height).toBeGreaterThanOrEqual(260)
  expect(geometry.case.width).toBeGreaterThanOrEqual(240)
  expect(geometry.overflow).toBeLessThanOrEqual(1)
  for(const card of geometry.cards){
   expect(card.bounds.height,'quick starts retain a useful artwork area').toBeGreaterThanOrEqual(120)
   expect(card.bounds.width).toBeGreaterThanOrEqual(128)
   expect(card.font,'quick-start type is not scaled down with the whole composition').toBeGreaterThanOrEqual(13)
   expect(card.fit).not.toBe('contain')
   expect(card.image.width/card.bounds.width).toBeGreaterThanOrEqual(.9)
   expect(card.bounds.bottom).toBeLessThanOrEqual(geometry.section.bottom+1)
  }
  for(const index of [0,1,2]){
   await page.locator(`.odyssey-operations-pagination [data-case="${index}"]`).click();await waitCase(page,index)
   const copy=await page.locator('.odyssey-operations-usecase').evaluate(card=>{
    const r=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,bottom:b.bottom,right:b.right}},description=card.querySelector('.odyssey-operations-description')
    return {card:r(card),title:r(card.querySelector('.odyssey-operations-title')),subtitle:r(card.querySelector('.odyssey-operations-subtitle')),description:r(description),pagination:r(card.querySelector('.odyssey-operations-pagination')),height:description.clientHeight,content:description.scrollHeight}
   })
   expect(copy.subtitle.y,'title and subtitle remain separate lines').toBeGreaterThanOrEqual(copy.title.bottom)
   expect(copy.title.x-copy.card.x).toBeGreaterThanOrEqual(18)
   expect(copy.title.y-copy.card.y).toBeGreaterThanOrEqual(18)
   expect(copy.description.y-copy.subtitle.bottom,'the title block has breathing room above the description').toBeGreaterThanOrEqual(16)
   expect(copy.pagination.y-copy.description.bottom).toBeGreaterThanOrEqual(8)
   expect(copy.card.bottom-copy.pagination.bottom).toBeGreaterThanOrEqual(12)
   expect(copy.content).toBeLessThanOrEqual(copy.height+1)
  }
  await page.addStyleTag({content:'.odyssey-operations-illustration{visibility:hidden!important}'})
  const withoutArt=PNG.sync.read(await page.screenshot({scale:'css'})),coverage=[]
  for(const card of geometry.cards){
   let painted=0,total=0,left=Infinity,right=-Infinity
   for(let y=Math.ceil(card.bounds.y+42);y<card.bounds.bottom-5;y++)for(let x=Math.ceil(card.bounds.x+5);x<card.bounds.right-5;x++){
    const at=(y*withArt.width+x)*4,difference=[0,1,2].reduce((sum,c)=>sum+Math.abs(withArt.data[at+c]-withoutArt.data[at+c]),0)/3
    total++;if(difference>3){painted++;left=Math.min(left,x);right=Math.max(right,x)}
   }
   coverage.push({fraction:painted/total,width:(right-left)/card.bounds.width})
  }
  await writeFile(`${evidence}/${label}-artwork.json`,JSON.stringify(coverage,null,2))
  for(const art of coverage){expect(art.fraction,'the real illustration occupies the card face instead of becoming a centered icon').toBeGreaterThan(.25);expect(art.width).toBeGreaterThan(.7)}
  expect(errors).toEqual([])
 }finally{await page.close()}
},20000)

it.each([
  { paneWidth:550, paneHeight:620, dark:false },
  { paneWidth:600, paneHeight:620, dark:true },
  { paneWidth:700, paneHeight:620, dark:false },
  { paneWidth:550, paneHeight:760, dark:true },
  { paneWidth:600, paneHeight:760, dark:false },
  { paneWidth:700, paneHeight:760, dark:true }
])('keeps complete English case text and every card inside a fluid center pane %j', async options => {
  const page = await fixture({ width:options.paneWidth+290, height:options.paneHeight+20, dark:options.dark, themes:true, deviceScaleFactor:2 })
  try {
    await page.evaluate(() => { document.documentElement.dataset.odysseyLocale='en' })
    await toggle(page).click(); await waitState(page,'operations')
    for (const index of [0,1,2]) {
      await page.locator(`.odyssey-operations-pagination [data-case="${index}"]`).click(); await waitCase(page,index)
      const geometry = await region(page).evaluate(section => {
        const rect = element => { const b=element.getBoundingClientRect(); return { x:b.x, y:b.y, right:b.right, bottom:b.bottom } }
        const card=section.querySelector('.odyssey-operations-usecase'), text=selector=>{
          const element=card.querySelector(selector), range=document.createRange(); range.selectNodeContents(element)
          return { ...rect(element), ink:rect(range) }
        }
        return { pane:section.parentElement.getBoundingClientRect().width, card:rect(card), title:text('.odyssey-operations-title strong'), subtitle:text('.odyssey-operations-subtitle'), copy:rect(card.querySelector('.odyssey-operations-case-copy')), description:text('.odyssey-operations-description'), pagination:rect(card.querySelector('.odyssey-operations-pagination')), region:rect(section), cards:[...section.querySelectorAll('.odyssey-operations-quick-card')].map(quick=>({ ...rect(quick), artworkWidth:quick.querySelector('.odyssey-operations-illustration').getBoundingClientRect().width, fit:getComputedStyle(quick.querySelector('img')).objectFit })), overflowX:section.scrollWidth-section.clientWidth, overflowY:section.scrollHeight-section.clientHeight }
      })
      expect(geometry.pane).toBe(options.paneWidth)
      for (const text of [geometry.title,geometry.subtitle,geometry.description]) {
        expect(text.ink.x,'English text begins inside the case').toBeGreaterThanOrEqual(geometry.card.x+12)
        expect(text.ink.right,'English words must not be clipped by the card edge').toBeLessThanOrEqual(geometry.card.right-12)
      }
      expect(geometry.subtitle.y).toBeGreaterThanOrEqual(geometry.title.bottom)
      expect(geometry.description.y).toBeGreaterThanOrEqual(geometry.copy.bottom+8)
      expect(geometry.description.bottom).toBeLessThanOrEqual(geometry.pagination.y-8)
      expect(geometry.overflowX).toBeLessThanOrEqual(1); expect(geometry.overflowY).toBeLessThanOrEqual(1)
      for (const card of geometry.cards) {
        expect(card.x).toBeGreaterThanOrEqual(geometry.region.x)
        expect(card.right).toBeLessThanOrEqual(geometry.region.right+1)
        expect(card.y).toBeGreaterThanOrEqual(geometry.region.y)
        expect(card.bottom).toBeLessThanOrEqual(geometry.region.bottom+1)
        expect(card.artworkWidth/(card.right-card.x)).toBeGreaterThanOrEqual(.9)
        expect(card.fit).not.toBe('contain')
      }
    }
  } finally { await page.close() }
},15000)

it.each([{ dark: false }, { dark: true }])('fits all five cards without scrolling in a 600px Retina center pane %j', async options => {
  const page = await fixture({ ...options, width: 1380, height: 900, panelWidth: 480, deviceScaleFactor: 2, themes: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    await nextPaint(page)
    const initial = await page.evaluate(() => {
      const host = document.querySelector('.pI_x6G_centerCol'), section = host.querySelector('[data-odyssey-home-operations]')
      const rect = element => { const bounds = element.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width, height: bounds.height } }
      return { pane: rect(host), section: rect(section), heading: rect(section.querySelector('.odyssey-operations-heading')), usecase: rect(section.querySelector('.odyssey-operations-usecase')), title: rect(section.querySelector('.odyssey-operations-title')), cards: [...section.querySelectorAll('.odyssey-operations-quick-card')].map(rect), scrollTop: section.scrollTop, scrollHeight: section.scrollHeight, clientHeight: section.clientHeight, overflow: section.scrollWidth > section.clientWidth }
    })
    await writeFile(`${evidence}/responsive-600-${options.dark ? 'dark' : 'light'}-initial.json`, JSON.stringify(initial, null, 2))
    await page.screenshot({ path: `${evidence}/responsive-600-${options.dark ? 'dark' : 'light'}-initial.png` })
    expect(initial.pane.width).toBe(600)
    expect(initial.pane.height).toBe(880)
    expect(initial.scrollTop).toBe(0)
    expect(initial.heading.y).toBeGreaterThanOrEqual(initial.section.y)
    expect(initial.heading.bottom).toBeLessThanOrEqual(initial.usecase.y)
    expect(initial.title.y).toBeGreaterThanOrEqual(initial.usecase.y)
    expect(initial.usecase.bottom).toBeLessThanOrEqual(initial.section.bottom)
    expect(initial.section.y).toBeGreaterThanOrEqual(initial.pane.y + 64)
    expect(initial.overflow).toBe(false)
    expect(initial.scrollHeight, 'a 600×880 center pane should fit the compact collection at entry').toBeLessThanOrEqual(initial.clientHeight + 1)
    for (const card of initial.cards) expect(card.bottom, 'the lower quick-start row is complete before scrolling').toBeLessThanOrEqual(initial.section.bottom + 1)
    for (const card of await page.locator('.odyssey-operations-quick-card').all()) {
      const reached = await card.evaluate(card => {
        const bounds = card.getBoundingClientRect(), clip = card.closest('[data-odyssey-home-operations]').getBoundingClientRect(), hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
        return { inside: bounds.top >= clip.top && bounds.bottom <= clip.bottom + 1, hit: card === hit || card.contains(hit), bottom: bounds.bottom, toggleTop: document.querySelector('[data-odyssey-home-operations-toggle]').getBoundingClientRect().top }
      })
      expect(reached.inside).toBe(true)
      expect(reached.hit).toBe(true)
      expect(reached.bottom).toBeLessThanOrEqual(reached.toggleTop - 16)
      await card.click()
    }
    await page.screenshot({ path: `${evidence}/responsive-600-${options.dark ? 'dark' : 'light'}-lower.png` })
    await toggle(page).click()
    await waitState(page, 'input')
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 15000)

it.each([
  { dark: false, paneWidth: 600, paneHeight: 760 },
  { dark: true, paneWidth: 600, paneHeight: 760 },
  { dark: false, paneWidth: 480, paneHeight: 704 },
  { dark: true, paneWidth: 480, paneHeight: 704 },
  { dark: false, paneWidth: 400, paneHeight: 600 },
  { dark: true, paneWidth: 400, paneHeight: 600 }
])('fits compact case text and all five cards without scrolling in a reduced-height center pane %j', async options => {
  const page = await fixture({ dark: options.dark, width: options.paneWidth + 780, height: options.paneHeight + 20, panelWidth: 480, deviceScaleFactor: 2, themes: true })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const geometry = await region(page).evaluate(section => {
      const pane = section.closest('.pI_x6G_centerCol').getBoundingClientRect()
      return { paneWidth: pane.width, paneHeight: pane.height, height: section.clientHeight, content: section.scrollHeight, overflowY: getComputedStyle(section).overflowY, scrollTop: section.scrollTop }
    })
    await writeFile(`${evidence}/compact-height-${options.paneWidth}-${options.paneHeight}-${options.dark ? 'dark' : 'light'}.json`, JSON.stringify(geometry, null, 2))
    await page.screenshot({ path: `${evidence}/compact-height-${options.paneWidth}-${options.paneHeight}-${options.dark ? 'dark' : 'light'}-entry.png` })
    expect(geometry.paneWidth).toBe(options.paneWidth); expect(geometry.paneHeight).toBe(options.paneHeight)
    expect(geometry.content, 'all five cards fit without an inner scroll container').toBeLessThanOrEqual(geometry.height + 1)
    expect(['auto', 'scroll']).not.toContain(geometry.overflowY)
    expect(geometry.scrollTop).toBe(0)
    for (const index of [0, 1, 2]) {
      await page.locator(`.odyssey-operations-pagination [data-case="${index}"]`).click()
      await waitCase(page, index)
      const copy = await page.locator('.odyssey-operations-usecase').evaluate(card => {
        const rect = element => { const b = element.getBoundingClientRect(); return { y: b.y, bottom: b.bottom } }
        const description = card.querySelector('.odyssey-operations-description')
        return { title: rect(card.querySelector('.odyssey-operations-case-copy')), description: rect(description), pagination: rect(card.querySelector('.odyssey-operations-pagination')), text: { height: description.clientHeight, content: description.scrollHeight, size: parseFloat(getComputedStyle(description).fontSize) } }
      })
      expect(copy.description.y, 'the complete description starts below the title and subtitle').toBeGreaterThanOrEqual(copy.title.bottom + 4)
      expect(copy.description.bottom).toBeLessThanOrEqual(copy.pagination.y - 4)
      expect(copy.text.content, 'the description is not silently cropped').toBeLessThanOrEqual(copy.text.height + 1)
      expect(copy.text.size).toBeGreaterThanOrEqual(14)
    }
    for (const card of await page.locator('.odyssey-operations-quick-card').all()) {
      expect(await card.evaluate(card => {
        const b = card.getBoundingClientRect(), s = card.closest('[data-odyssey-home-operations]').getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2), toggle = document.querySelector('[data-odyssey-home-operations-toggle]').getBoundingClientRect()
        const art = card.querySelector('.odyssey-operations-illustration').getBoundingClientRect(), label = card.querySelector('.odyssey-operations-quick-label').getBoundingClientRect()
        return b.top >= s.top && b.bottom <= s.bottom + 1 && b.bottom <= toggle.top - 16 && art.top >= label.bottom && art.width >= b.width * .9 && getComputedStyle(card).overflow === 'hidden' && getComputedStyle(card.querySelector('img')).objectFit !== 'contain' && (hit === card || card.contains(hit))
      })).toBe(true)
      await card.click()
    }
    await page.screenshot({ path: `${evidence}/compact-height-${options.paneWidth}-${options.paneHeight}-${options.dark ? 'dark' : 'light'}-lower.png` })
  } finally { await page.close() }
}, 15000)

it('adapts the operation collection to panel and short-pane resizing without carrying clipped content back into the full layout', async () => {
  const page = await fixture({ themes: true, deviceScaleFactor: 2 })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text() + ' ' + message.location().url) })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const original = await page.locator('.odyssey-operations-grid').boundingBox()
    await page.evaluate(() => { document.body.style.setProperty('--dsh-sidebar-width', '480px'); document.querySelector('[data-dsh-panel-host]').dataset.odysseyPanelRight = 'open' })
    await expect.poll(() => region(page).evaluate(section => section.scrollHeight - section.clientHeight)).toBeLessThanOrEqual(1)
    await page.setViewportSize({ width: 1180, height: 720 })
    await expect.poll(() => page.locator('.pI_x6G_centerCol').evaluate(pane => ({width:pane.clientWidth,layout:pane.dataset.odysseyHomeOperationsLayout}))).toEqual({width:400,layout:'stacked'})
    await nextPaint(page)
    await expect.poll(() => region(page).evaluate(section => section.scrollHeight - section.clientHeight)).toBeLessThanOrEqual(1)
    const report = page.locator('.odyssey-operations-quick-card[data-card="report"]')
    expect(await dispatchWheel(page, '.odyssey-operations-quick-card[data-card="report"]', 120)).toBe(false)
    const bottom = await report.evaluate(card => {
      const rect = card.getBoundingClientRect(), clip = card.closest('[data-odyssey-home-operations]').getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { inside: rect.top >= clip.top && rect.bottom <= clip.bottom + 1, hit: hit === card || card.contains(hit), toggleGap: document.querySelector('[data-odyssey-home-operations-toggle]').getBoundingClientRect().top - rect.bottom }
    })
    expect(bottom.inside).toBe(true); expect(bottom.hit).toBe(true); expect(bottom.toggleGap).toBeGreaterThanOrEqual(16)
    await page.screenshot({ path: `${evidence}/responsive-400-short-scrolled.png` })
    await page.setViewportSize({ width: 1380, height: 900 })
    await expect.poll(() => page.locator('.pI_x6G_centerCol').evaluate(pane => ({width:pane.clientWidth,layout:pane.dataset.odysseyHomeOperationsLayout}))).toEqual({width:600,layout:'fluid'})
    await nextPaint(page)
    await expect.poll(() => region(page).evaluate(section => ({ top: section.scrollTop, overflow: section.scrollHeight - section.clientHeight }))).toEqual({ top: 0, overflow: 0 })
    const heading = await page.locator('.odyssey-operations-heading').boundingBox(), bounds = await region(page).boundingBox()
    expect(heading.y).toBeGreaterThanOrEqual(bounds.y)
    await page.screenshot({ path: `${evidence}/responsive-600-after-resize.png` })
    await page.locator('[data-dsh-panel-host]').evaluate(element => element.dataset.odysseyPanelRight = 'closed')
    await expect.poll(() => page.locator('.pI_x6G_centerCol').getAttribute('data-odyssey-home-operations-layout')).toBe('wide')
    const restored = await page.locator('.odyssey-operations-grid').boundingBox()
    expect(restored.width).toBeCloseTo(original.width, 1); expect(restored.height).toBeCloseTo(original.height, 1)
    await page.screenshot({ path: `${evidence}/responsive-wide-restored.png` })
    expect(await state(page)).toBe('operations')
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 15000)

it('keeps every small-pane card visible without inner scrolling while the bottom button returns to input', async () => {
  const page = await fixture({ width: 1040, height: 640, reduced: true })
  try {
    await page.locator('[data-dsh-panel-host]').evaluate(element => element.dataset.odysseyPanelRight = 'open')
    await toggle(page).click()
    await waitState(page, 'operations')
    const layout = await page.evaluate(() => {
      const section = document.querySelector('[data-odyssey-home-operations]')
      return {
        fonts: [...section.querySelectorAll('.odyssey-operations-quick-label')].map(label => parseFloat(getComputedStyle(label).fontSize) * label.getBoundingClientRect().height / label.offsetHeight),
        targets: [...section.querySelectorAll('button')].map(button => { const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height } }),
        scrollHeight: section.scrollHeight,
        clientHeight: section.clientHeight
      }
    })
    expect(Math.min(...layout.fonts)).toBeGreaterThanOrEqual(12)
    for (const target of layout.targets) { expect(target.width).toBeGreaterThanOrEqual(24); expect(target.height).toBeGreaterThanOrEqual(24) }
    expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1)
    const operations = region(page)
    await operations.hover()
    await page.mouse.wheel(0, 900)
    await expect.poll(() => operations.evaluate(section => section.scrollTop)).toBe(0)
    expect(await state(page)).toBe('operations')
    await operations.evaluate(section => section.scrollTop = section.scrollHeight)
    const report = page.locator('.odyssey-operations-quick-card[data-card="report"]')
    const reachable = await report.evaluate(card => {
      const section = card.closest('[data-odyssey-home-operations]').getBoundingClientRect(), rect = card.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return { inside: rect.top >= section.top && rect.bottom <= section.bottom + 1, hit: card === hit || card.contains(hit), width: rect.width, height: rect.height }
    })
    expect(reachable.inside).toBe(true)
    expect(reachable.hit).toBe(true)
    expect(reachable.width).toBeGreaterThanOrEqual(24)
    expect(reachable.height).toBeGreaterThanOrEqual(24)
    await report.click()
    expect(await state(page)).toBe('operations')
    await page.mouse.wheel(0, 300)
    expect(await state(page)).toBe('operations')
    await operations.evaluate(section => section.scrollTop = 0)
    await operations.hover({ position: { x: 20, y: 20 } })
    await page.mouse.wheel(0, -300)
    await nextPaint(page)
    expect(await state(page)).toBe('operations')
    await toggle(page).click()
    await waitState(page, 'input')
  } finally { await page.close() }
}, 15000)

it('keeps the native wallpaper owner independent from operation snapping and cleanup', async () => {
  const page = await fixture({ themes: true })
  try {
    expect(await page.locator('[data-odyssey-theme-dock]').count()).toBe(0)
    await toggle(page).click(); await waitState(page,'operations')
    await wallpaperTab(page).click(); await wallpaperCards(page).last().click()
    expect(await state(page)).toBe('operations')
    await page.evaluate(()=>window.homeOperations.dispose())
    expect(await page.locator('[data-home-theme-canvas="koi-pond"]').count()).toBe(1)
    await page.evaluate(()=>window.homeOperations.controller.select('default'))
    expect(await page.locator('[data-home-theme-canvas="default"]').count()).toBe(1)
    expect(await page.evaluate(()=>document.querySelector('textarea')===window.homeOperations.original)).toBe(true)
  }finally{await page.close()}
},15000)

it.each([
  { width: 800, panel: false },
  { width: 1040, panel: false },
  { width: 1380, panel: false },
  { width: 1040, panel: true }
])('keeps the return arrow and complete wallpaper gallery independently clickable in a short window %j', async options => {
  const page = await fixture({ themes:true,height:640,reduced:true,...options })
  try {
    if(options.panel)await page.locator('[data-dsh-panel-host]').evaluate(element=>element.dataset.odysseyPanelRight='open')
    await toggle(page).click();await waitState(page,'operations');await wallpaperTab(page).click()
    const clickable=locator=>locator.evaluate(element=>{const rect=element.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return element===hit||element.contains(hit)})
    expect(await clickable(toggle(page))).toBe(true)
    for(const card of await wallpaperCards(page).all())expect(await clickable(card)).toBe(true)
    const selected=await page.evaluate(()=>window.homeOperations.controller.getSelected())
    await wallpaperCards(page).first().click();expect(await state(page)).toBe('operations')
    expect(await page.evaluate(()=>window.homeOperations.controller.getSelected())).toBe(selected)
    await toggle(page).click();await waitState(page,'input')
    expect(await page.locator('[data-odyssey-theme-dock]').count()).toBe(0)
  }finally{await page.close()}
},15000)

it.each([
  { dark: false, reduced: false, name: 'light-wide' },
  { dark: true, reduced: false, name: 'dark-wide' },
  { dark: false, reduced: false, width: 1040, height: 640, panel: true, enhancedCorners: true, name: 'light-narrow-motion' },
  { dark: true, reduced: false, width: 1040, height: 640, panel: true, enhancedCorners: true, name: 'dark-narrow-motion' },
  { dark: false, reduced: true, width: 1040, height: 640, panel: true, name: 'light-narrow-reduced' },
  { dark: true, reduced: true, width: 1040, height: 640, panel: true, name: 'dark-narrow-reduced' }
])('keeps %s operations visible and every quick card reachable inside the center pane', async options => {
  const page = await fixture(options)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    if (options.panel) await page.locator('[data-dsh-panel-host]').evaluate(element => element.dataset.odysseyPanelRight = 'open')
    await page.screenshot({ path: `${evidence}/${options.name}-input.png` })
    await toggle(page).click()
    await waitState(page, 'operations')
    await page.waitForTimeout(options.reduced ? 20 : 650)
    const layout = await page.evaluate(() => {
      const host = document.querySelector('.pI_x6G_centerCol'), bounds = host.getBoundingClientRect()
      const section = host.querySelector('[data-odyssey-home-operations]')
      return { overflow: host.scrollWidth > host.clientWidth, horizontalScroll: section.scrollWidth > section.clientWidth && ['auto', 'scroll'].includes(getComputedStyle(section).overflowX), stacked: host.dataset.odysseyHomeOperationsLayout === 'stacked', cards: [...host.querySelectorAll('.odyssey-operations-quick-card')].map(card => {
        const rect = card.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return { width: rect.width, height: rect.height, inside: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1, hit: card === hit || card.contains(hit) }
      }) }
    })
    expect(layout.overflow).toBe(false)
    expect(layout.horizontalScroll).toBe(false)
    expect(layout.cards).toHaveLength(4)
    for (const card of layout.cards) {
      expect(card.width).toBeGreaterThan(80)
      expect(card.height).toBeGreaterThan(44)
      if (!layout.stacked) {
        expect(card.inside).toBe(true)
        expect(card.hit).toBe(true)
      }
    }
    if (layout.stacked) {
      for (const card of await page.locator('.odyssey-operations-quick-card').all()) {
        await card.scrollIntoViewIfNeeded()
        expect(await card.evaluate(element => {
          const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          return element === hit || element.contains(hit)
        })).toBe(true)
      }
      await region(page).evaluate(element => element.scrollTop = 0)
    }
    if (options.reduced) {
      await page.locator('.odyssey-operations-quick-card').first().hover()
      const motion = await page.locator('.odyssey-operations-quick-card').first().evaluate(element => {
        const style = getComputedStyle(element); return { transition: style.transitionDuration, animation: style.animationDuration, transform: style.transform }
      })
      expect(motion.transition.split(',').every(value => parseFloat(value) <= .001)).toBe(true)
      expect(motion.animation.split(',').every(value => parseFloat(value) <= .001)).toBe(true)
      expect(motion.transform).toBe('none')
      await region(page).evaluate(element => element.scrollTop = 0)
    }
    if (options.enhancedCorners) {
      for (const anchor of await page.locator('.odyssey-operations-quick-anchor').all()) {
        await anchor.scrollIntoViewIfNeeded()
        for (const corner of [.06, .94]) {
          const bounds = await anchor.boundingBox(), point = { x: bounds.x + bounds.width * corner, y: bounds.y + bounds.height * corner }
          await page.mouse.move(point.x, point.y)
          await expect.poll(() => anchor.locator('.odyssey-operations-quick-card').evaluate(card => Math.abs(parseFloat(card.style.getPropertyValue('--ry')) || 0))).toBeGreaterThan(7)
          await expect.poll(() => anchor.evaluate((anchor, point) => {
            const card = anchor.firstElementChild, rect = card.getBoundingClientRect(), pane = anchor.closest('.pI_x6G_centerCol').getBoundingClientRect(), hit = document.elementFromPoint(point.x, point.y)
            return { hit: hit === anchor || anchor.contains(hit), inside: rect.left >= pane.left && rect.right <= pane.right && rect.top >= pane.top && rect.bottom <= pane.bottom, colored: Number(getComputedStyle(card.querySelector('img.colored')).opacity) }
          }, point)).toEqual({ hit: true, inside: true, colored: 1 })
        }
      }
      await region(page).screenshot({ path: `${evidence}/${options.name}-tilted.png` })
    }
    await page.mouse.move(1, 1)
    await page.waitForTimeout(options.reduced ? 0 : 220)
    await page.screenshot({ path: `${evidence}/${options.name}-operations.png` })
    if (layout.stacked) {
      await region(page).evaluate(element => element.scrollTop = element.scrollHeight)
      await page.screenshot({ path: `${evidence}/${options.name}-operations-lower-cards.png` })
    }
    expect(errors).toEqual([])
  } finally { await page.close() }
}, 15000)

it('keeps the tilted glass surface free of a second fixed rectangular shadow plane', async () => {
  const observations = []
  const roundedDistance = (x, y, width, height, radius) => {
    const qx = Math.abs(x - width / 2) - (width / 2 - radius), qy = Math.abs(y - height / 2) - (height / 2 - radius)
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius
  }
  for (const dark of [false, true]) {
    const page = await fixture({ dark, reduced: false, clock: true })
    try {
      await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
      await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
      await page.locator('.pI_x6G_centerCol').evaluate((pane, dark) => pane.style.setProperty('background', dark ? 'linear-gradient(155deg,#13171c,#272d35)' : 'linear-gradient(155deg,#e3e7ed,#f4f6f9)', 'important'), dark)
      await region(page).evaluate(section => { for (const animation of section.getAnimations({ subtree: true })) if ('animationName' in animation) { animation.pause(); animation.currentTime = 0 } })
      const card = page.locator('.odyssey-operations-usecase'), anchor = page.locator('.odyssey-operations-usecase-anchor'), box = await anchor.boundingBox()
      for (const [index, fraction] of [.06, .94].entries()) {
        await page.mouse.move(box.x + box.width * fraction, box.y + box.height * fraction); await page.clock.runFor(700)
        const geometry = await card.evaluate(card => {
          const style = getComputedStyle(card), matrix = new DOMMatrixReadOnly(style.transform), anchor = card.parentElement.getBoundingClientRect(), origin = style.transformOrigin.split(' ').map(Number.parseFloat)
          return { x: anchor.x, y: anchor.y, width: card.offsetWidth, height: card.offsetHeight, radius: parseFloat(style.borderRadius), origin, matrix: [matrix.m11, matrix.m21, matrix.m41, matrix.m14, matrix.m24, matrix.m44, matrix.m12, matrix.m22, matrix.m42], transform: style.transform }
        })
        expect(geometry.transform).not.toBe('none')
        const frames = {}
        const capture = async name => { frames[name] = PNG.sync.read(await page.screenshot({ path: `${evidence}/tilt-plane-${dark ? 'dark' : 'light'}-${index}-${name}.png` })) }
        await capture('original')
        await anchor.evaluate(anchor => anchor.style.setProperty('box-shadow', 'none', 'important')); await capture('shadow-off')
        await card.evaluate(card => { card.style.setProperty('backdrop-filter', 'none', 'important'); card.style.setProperty('-webkit-backdrop-filter', 'none', 'important') }); await capture('both-off')
        await anchor.evaluate(anchor => anchor.style.removeProperty('box-shadow')); await capture('backdrop-off')
        await card.evaluate(card => { card.style.removeProperty('backdrop-filter'); card.style.removeProperty('-webkit-backdrop-filter'); card.style.setProperty('box-shadow', 'var(--odyssey-operations-card-shadow)', 'important'); card.style.setProperty('clip-path', 'none', 'important') })
        await anchor.evaluate(anchor => anchor.style.setProperty('box-shadow', 'none', 'important')); await capture('following-shadow-control')
        const points = []
        const [a, b, c, g, h, i, d, e, f] = geometry.matrix
        for (let y = Math.ceil(geometry.y - 20); y < geometry.y + geometry.height + 20; y++) for (let x = Math.ceil(geometry.x - 20); x < geometry.x + geometry.width + 20; x++) {
          const localX = x + .5 - geometry.x, localY = y + .5 - geometry.y
          const flatDistance = roundedDistance(localX, localY, geometry.width, geometry.height, geometry.radius)
          if (flatDistance < .5 || flatDistance > 18) continue
          const sx = localX - geometry.origin[0], sy = localY - geometry.origin[1]
          const A = a - sx * g, B = b - sx * h, C = sx * i - c, D = d - sy * g, E = e - sy * h, F = sy * i - f, determinant = A * E - B * D
          const px = (C * E - B * F) / determinant + geometry.origin[0], py = (A * F - C * D) / determinant + geometry.origin[1]
          if (roundedDistance(px, py, geometry.width, geometry.height, geometry.radius) > flatDistance + 1.5) points.push([x, y])
        }
        expect(points.length, 'perspective reveals part of the original flat anchor footprint').toBeGreaterThan(100)
        const difference = (first, second) => points.reduce((sum, [x, y]) => sum + patchRgb(frames[first], x, y, 0).reduce((total, value, channel) => total + Math.abs(value - patchRgb(frames[second], x, y, 0)[channel]), 0) / 3, 0) / points.length
        observations.push({ dark, angle: index, samples: points.length, fixedShadowContribution: difference('original', 'shadow-off'), outsideBackdropContribution: difference('shadow-off', 'both-off'), departureFromFollowingSurface: difference('original', 'following-shadow-control') })
        await card.evaluate(card => { card.style.removeProperty('box-shadow'); card.style.removeProperty('clip-path') }); await anchor.evaluate(anchor => anchor.style.removeProperty('box-shadow'))
      }
    } finally { await page.close() }
  }
  await writeFile(`${evidence}/tilt-plane-diagnostics.json`, JSON.stringify(observations, null, 2))
  for (const observation of observations) expect(observation.departureFromFollowingSurface, `${observation.dark ? 'dark' : 'light'} angle ${observation.angle} has no separate flat shadow plane`).toBeLessThan(.8)
}, 20000)


it('connects every quick-start card to its action once while a previous click is still pending', async () => {
  const page = await fixture({ themes: true })
  try {
    await page.evaluate(() => {
      window.homeOperations.dispose()
      window.homeOperations.actionCalls = []
      window.homeOperations.onAction = (card, context) => new Promise(resolve => {
        window.homeOperations.actionCalls.push({ card, signal: context.signal, revealComposer: context.revealComposer })
        window.homeOperations.finishAction = resolve
      })
      window.homeOperations.mount()
    })
    await toggle(page).click(); await waitState(page, 'operations')
    const selectedTheme = await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-home-theme-id')
    for (const [index, key] of ['board', 'note', 'ppt', 'report'].entries()) {
      const card = page.locator(`.odyssey-operations-quick-card[data-card="${key}"]`)
      await card.click()
      await expect.poll(() => page.evaluate(() => window.homeOperations.actionCalls.length), { timeout: 1500 }).toBe(index + 1)
      await card.dispatchEvent('click')
      expect(await page.evaluate(() => window.homeOperations.actionCalls.length)).toBe(index + 1)
      expect(await page.evaluate(() => { const action = window.homeOperations.actionCalls.at(-1); return action.signal instanceof AbortSignal && !action.signal.aborted && typeof action.revealComposer === 'function' })).toBe(true)
      await page.evaluate(() => window.homeOperations.finishAction())
      await nextPaint(page)
    }
    expect(await page.evaluate(() => window.homeOperations.actionCalls.map(action => action.card))).toEqual(['board', 'note', 'ppt', 'report'])
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
    expect(await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-home-theme-id')).toBe(selectedTheme)
  } finally { await page.close() }
}, 15000)

it.each(['ppt', 'report'])('waits for the native composer to settle before %s preparation and keeps a failed action visible', async card => {
  const page = await fixture({ themes: true, reduced: false })
  try {
    await page.evaluate(() => {
      window.homeOperations.dispose()
      window.homeOperations.actionOrder = []
      window.homeOperations.onAction = async (card, context) => {
        window.homeOperations.actionOrder.push({ step: 'clicked', state: document.querySelector('[data-odyssey-home-operations-state]').dataset.odysseyHomeOperationsState })
        await context.revealComposer()
        const hero = document.querySelector('.wSkVaW_composerHero')
        window.homeOperations.actionOrder.push({ step: 'ready', state: document.querySelector('[data-odyssey-home-operations-state]').dataset.odysseyHomeOperationsState, opacity: getComputedStyle(hero).opacity, inert: hero.inert })
        throw Error('测试动作暂不可用，原有草稿已保留')
      }
      window.homeOperations.mount()
    })
    await toggle(page).click(); await waitState(page, 'operations')
    await page.locator(`.odyssey-operations-quick-card[data-card="${card}"]`).click()
    await waitState(page, 'input')
    await expect.poll(() => page.evaluate(() => window.homeOperations.actionOrder.length)).toBe(2)
    expect(await page.evaluate(() => window.homeOperations.actionOrder)).toEqual([{ step: 'clicked', state: 'operations' }, { step: 'ready', state: 'input', opacity: '1', inert: false }])
    const alert = page.getByRole('alert')
    await alert.waitFor({ state: 'visible' })
    expect(await alert.textContent()).toContain('原有草稿已保留')
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('[data-odyssey-home-theme-background]').count()).toBe(1)
  } finally { await page.close() }
}, 15000)

it('aborts a pending quick-start action when the homepage is left or disposed', async () => {
  const page = await fixture()
  try {
    await page.evaluate(() => {
      window.homeOperations.dispose()
      window.homeOperations.onAction = (_card, context) => new Promise(resolve => { window.homeOperations.actionContext = context; window.homeOperations.finishAction = resolve })
      window.homeOperations.mount()
    })
    await toggle(page).click(); await waitState(page, 'operations')
    await page.locator('.odyssey-operations-quick-card[data-card="ppt"]').click()
    await expect.poll(() => page.evaluate(() => !!window.homeOperations.actionContext)).toBe(true)
    await page.evaluate(() => document.body.dataset.workspaceSurface = 'settings')
    await expect.poll(() => page.evaluate(() => window.homeOperations.actionContext.signal.aborted)).toBe(true)
    await page.evaluate(() => { window.homeOperations.finishAction(); window.homeOperations.previousActionContext = window.homeOperations.actionContext; delete document.body.dataset.workspaceSurface })
    await expect.poll(() => region(page).count()).toBe(1)
    await toggle(page).click(); await waitState(page, 'operations')
    await page.locator('.odyssey-operations-quick-card[data-card="ppt"]').click()
    await expect.poll(() => page.evaluate(() => window.homeOperations.actionContext !== window.homeOperations.previousActionContext)).toBe(true)
    await page.evaluate(() => window.homeOperations.dispose())
    expect(await page.evaluate(() => window.homeOperations.actionContext.signal.aborted)).toBe(true)
    await page.evaluate(() => window.homeOperations.finishAction())
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
    expect(await region(page).count()).toBe(0)
    expect(await page.getByRole('alert').count()).toBe(0)
  } finally { await page.close() }
})


it('starts only the visible large-card example by click or keyboard, never by its tracks', async () => {
  const page = await fixture()
  await page.evaluate(() => { window.examples=[]; window.homeOperations.onExample=async card=>window.examples.push(card);window.homeOperations.dispose();window.homeOperations.mount() })
  await toggle(page).click(); await waitState(page,'operations')
  const card=page.locator('.odyssey-operations-usecase')
  const open=card.locator('[data-odyssey-operations-open-example]')
  expect(await open.getAttribute('type')).toBe('button')
  await card.click({position:{x:70,y:90}})
  await expect.poll(()=>page.evaluate(()=>window.examples)).toEqual(['board'])
  await page.locator('.odyssey-operations-pagination button[data-case="1"]').click()
  await waitCase(page,1)
  expect(await page.evaluate(()=>window.examples)).toEqual(['board'])
  await open.focus(); await page.keyboard.press('Enter')
  await expect.poll(()=>page.evaluate(()=>window.examples)).toEqual(['board','note'])
  await page.locator('.odyssey-operations-pagination button[data-case="2"]').click();await waitCase(page,2)
  await open.focus();await page.keyboard.press('Space')
  await expect.poll(()=>page.evaluate(()=>window.examples)).toEqual(['board','note','ppt'])
  await page.close()
})

it.each([{index:0,kind:'board',en:false},{index:1,kind:'note',en:true},{index:2,kind:'ppt',en:false},{index:3,kind:'report',en:true}])('streams the $kind demo notice in the original description before handing off its unchanged entry',async({index,kind,en})=>{
 const page=await fixture({reduced:false,clock:true});try{
  await page.evaluate(en=>{document.documentElement.dataset.odysseyLocale=en?'en':'zh';window.examples=[];window.homeOperations.onExample=async(card,context)=>window.examples.push({card,description:document.querySelector('[data-odyssey-operations-case-layer][aria-hidden="false"] .odyssey-operations-description').textContent,origin:context.origin});window.homeOperations.dispose();window.homeOperations.mount()},en)
  await toggle(page).click();await waitState(page,'operations');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50))
  await page.locator(`.odyssey-operations-pagination [data-case="${index}"]`).evaluate(e=>e.click());await page.clock.runFor(450)
  const description=page.locator('[data-odyssey-operations-case-layer][aria-hidden="false"] .odyssey-operations-description'),original=await description.textContent(),before=await page.locator('.odyssey-operations-usecase').boundingBox(),notice=en?'Entering the example demo. This demo uses no tokens.':'即将进入实例演示，演示过程不消耗Token'
  await page.locator('[data-odyssey-operations-open-example]').evaluate(e=>e.click());await page.clock.runFor(80)
  expect(await page.evaluate(()=>window.examples)).toEqual([]);expect(parseFloat(await description.evaluate(e=>getComputedStyle(e).opacity))).toBeLessThan(.9)
  await page.clock.runFor(400);const partial=await description.textContent();expect(partial.length).toBeGreaterThan(0);expect(partial.length).toBeLessThan(notice.length);expect(notice.startsWith(partial)).toBe(true);expect(await page.evaluate(()=>window.examples)).toEqual([])
  await page.clock.runFor(700);expect(await description.textContent()).toBe(notice);expect(await page.evaluate(()=>window.examples)).toEqual([])
  const after=await page.locator('.odyssey-operations-usecase').boundingBox();expect(after).toEqual(before)
  await mkdir('/tmp/home-demo-intro-20261026',{recursive:true});await page.locator('.odyssey-operations-usecase').screenshot({path:`/tmp/home-demo-intro-20261026/${kind}-${en?'en':'zh'}.png`})
  await page.clock.runFor(1200);expect((await page.evaluate(()=>window.examples)).map(value=>value.card)).toEqual([kind]);expect((await page.evaluate(()=>window.examples))[0].description).toBe(notice);expect((await page.evaluate(()=>window.examples))[0].origin.x).toBeGreaterThan(0)
  expect(await description.textContent()).toBe(original);expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
 }finally{await page.close()}
},15000)
it.each(['owner','navigation','hidden','blur','typing','escape','locale','dispose'])('cancels the pending card intro on %s before any actor starts',async reason=>{
 const page=await fixture({reduced:false,clock:true});try{
  await page.evaluate(()=>{window.examples=[];window.homeOperations.onExample=async card=>window.examples.push(card);window.homeOperations.dispose();window.homeOperations.mount()});await toggle(page).click();await waitState(page,'operations');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50))
  const original=await page.locator('.odyssey-operations-description').textContent();await page.locator('[data-odyssey-operations-open-example]').evaluate(e=>e.click());await page.clock.runFor(400)
  if(reason==='owner')await page.locator('.wSkVaW_root').first().evaluate(e=>e.dataset.sessionId='new-owner')
  else if(reason==='navigation')await page.evaluate(()=>document.body.dataset.workspaceSurface='settings')
  else if(reason==='hidden')await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))})
  else if(reason==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')))
  else if(reason==='typing')await page.evaluate(()=>document.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,inputType:'insertText',data:'用户接管'})))
  else if(reason==='escape')await page.keyboard.press('Escape')
  else if(reason==='locale')await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
  else await page.evaluate(()=>window.homeOperations.dispose())
  await page.clock.runFor(4000);expect(await page.evaluate(()=>window.examples)).toEqual([]);expect(await page.locator('[data-home-guide-pointer]').count()).toBe(0);expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  if(['owner','blur','typing','escape'].includes(reason))expect(await page.locator('.odyssey-operations-description').textContent()).toBe(original)
 }finally{await page.close()}
},15000)
it('shows a static complete demo notice with reduced motion and keeps the four small-card actions immediate',async()=>{
 const page=await fixture({reduced:true,clock:true});try{
  await page.evaluate(()=>{window.examples=[];window.quickActions=[];window.homeOperations.onExample=async card=>window.examples.push(card);window.homeOperations.onAction=async card=>window.quickActions.push(card);window.homeOperations.dispose();window.homeOperations.mount()});await toggle(page).click();await waitState(page,'operations');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50))
  await page.locator('[data-odyssey-operations-open-example]').evaluate(e=>e.click());await page.clock.runFor(32)
  const description=page.locator('.odyssey-operations-description');expect(await description.textContent()).toBe('即将进入实例演示，演示过程不消耗Token');expect(await description.evaluate(e=>getComputedStyle(e).opacity)).toBe('1');expect(await page.evaluate(()=>window.examples)).toEqual([])
  await page.clock.runFor(700);expect(await page.evaluate(()=>window.examples)).toEqual(['board'])
  for(const kind of ['board','note','ppt','report'])await page.locator(`.odyssey-operations-quick-card[data-card="${kind}"]`).evaluate(e=>e.click())
  expect(await page.evaluate(()=>window.quickActions)).toEqual(['board','note','ppt','report']);expect(await page.evaluate(()=>window.examples)).toEqual(['board']);expect(await page.locator('[data-odyssey-operations-intro]').count()).toBe(0)
 }finally{await page.close()}
},15000)
it('keeps the actual Play click origin while its hover tilt settles during the streamed intro',async()=>{
 const page=await fixture({reduced:false,clock:true});try{
  await page.evaluate(()=>{window.exampleOrigin=null;window.homeOperations.onExample=async(_card,context)=>window.exampleOrigin=context.origin;window.homeOperations.dispose();window.homeOperations.mount();document.addEventListener('click',event=>{const button=event.target.closest?.('[data-odyssey-operations-open-example]');if(button){const r=button.getBoundingClientRect();window.clickedOrigin={x:r.left+r.width/2,y:r.top+r.height/2}}},true)})
  await toggle(page).click();await waitState(page,'operations');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50))
  const button=page.locator('[data-odyssey-operations-open-example]'),box=await button.boundingBox();await page.mouse.move(box.x+box.width*.9,box.y+box.height*.1);await page.clock.runFor(32);await page.mouse.down();await page.mouse.up();await page.clock.runFor(2600)
  const result=await page.evaluate(()=>{const r=document.querySelector('[data-odyssey-operations-open-example]').getBoundingClientRect();return{actual:window.clickedOrigin,origin:window.exampleOrigin,settled:{x:r.left+r.width/2,y:r.top+r.height/2}}})
  expect(result.origin.x).toBeCloseTo(result.actual.x,4);expect(result.origin.y).toBeCloseTo(result.actual.y,4);expect(Math.hypot(result.settled.x-result.actual.x,result.settled.y-result.actual.y)).toBeGreaterThan(.5)
 }finally{await page.close()}
},15000)

const wallpaperKeys = ['default','berber','vghodki','jarrick','lowfreez','accelbia','boz','shashidhar','haseeb','kirian','splines','antiquue','crt-warp','dither','koi-pond']
const wallpaperNamesZh = ['静谧起航','星海航迹','碧海潮汐','星门微光','银河帆影','翡翠秘境','深空讯号','星云风暴','极光之境','远星尘光','虹光跃迁','日曜航线','时空回声','墨海流岚','锦鲤浮光']
const wallpaperNamesEn = ['Quiet Departure','Star Trails','Ocean Tides','Stargate Glow','Galactic Sails','Emerald Haven','Deep Space Signal','Nebula Storm','Aurora Realm','Distant Stardust','Prismatic Drift','Solar Passage','Temporal Echo','Inksea Mist','Koi Shimmer']
const wallpaperTab = page => page.locator('[data-odyssey-operations-tab="wallpapers"]')
const quickTab = page => page.locator('[data-odyssey-operations-tab="quick"]')
const wallpaperCards = page => page.locator('[data-odyssey-theme-gallery] [data-home-theme-id]')

it('opens all fifteen native wallpaper previews only in the visible gallery and matches the standard Figma grid', async () => {
  const page = await fixture({themes:true,deviceScaleFactor:2})
  try {
    expect(await page.evaluate(() => window.homeOperations.thumbnailRequests)).toEqual([])
    await toggle(page).click(); await waitState(page,'operations')
    expect(await page.evaluate(() => window.homeOperations.thumbnailRequests)).toEqual([])
    expect(await wallpaperTab(page).count()).toBe(1)
    await wallpaperTab(page).click()
    expect(await wallpaperCards(page).evaluateAll(cards=>cards.map(card=>card.dataset.homeThemeId))).toEqual(wallpaperKeys)
    expect(await wallpaperCards(page).locator('.odyssey-wallpaper-name').allTextContents()).toEqual(wallpaperNamesZh)
    expect(await wallpaperCards(page).locator('img').evaluateAll(images=>Promise.all(images.map(async image=>{await image.decode();return image.naturalWidth>0&&image.naturalHeight>0})))).toEqual(Array(15).fill(true))
    expect(await page.locator('[data-odyssey-theme-dock]').count()).toBe(0)
    expect(await page.locator('[data-home-theme-canvas]').count()).toBe(1)
    const geometry=await wallpaperCards(page).evaluateAll(cards=>cards.map(card=>{const preview=card.querySelector('.odyssey-wallpaper-preview').getBoundingClientRect(),label=card.querySelector('.odyssey-wallpaper-name'),style=getComputedStyle(label);return {x:preview.x,y:preview.y,width:preview.width,height:preview.height,font:parseFloat(style.fontSize),line:parseFloat(style.lineHeight)}}))
    expect(new Set(geometry.map(card=>Math.round(card.x))).size).toBe(5)
    expect(new Set(geometry.map(card=>Math.round(card.y))).size).toBe(3)
    for(const card of geometry){expect(card.width).toBeCloseTo(146.4,0);expect(card.height).toBeCloseTo(78,0);expect(card.font).toBe(12);expect(card.line).toBe(18)}
    expect(await wallpaperCards(page).locator('svg').count()).toBe(0)
    expect(await wallpaperCards(page).filter({has:page.locator('.odyssey-wallpaper-preview')}).count()).toBe(15)
    expect(await wallpaperCards(page).first().locator('.odyssey-wallpaper-preview').evaluate(element=>getComputedStyle(element).boxShadow)).toMatch(/0px 0px 0px 3px$/)
    const count=await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)
    await quickTab(page).click()
    await page.evaluate(()=>document.body.setAttribute('data-ds-dark-theme',''))
    await nextPaint(page)
    expect(await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)).toBe(count)
    await page.evaluate(()=>window.homeOperations.dispose())
    expect(await page.locator('[data-home-theme-canvas]').count()).toBe(1)
    expect(await page.locator('[data-odyssey-theme-gallery]').count()).toBe(0)
  }finally{await page.close()}
},30000)

it('keeps the gallery tab, native wallpaper and Quick Start instances through appearance and locale changes',async()=>{
  const page=await fixture({themes:true})
  try{
    await toggle(page).click();await waitState(page,'operations')
    await page.locator('.odyssey-operations-pagination button').nth(2).click();await waitCase(page,2)
    await page.evaluate(()=>{window.homeOperations.retained=[document.querySelector('.odyssey-operations-grid'),document.querySelector('.odyssey-operations-usecase'),document.querySelector('.odyssey-operations-quick-card')];window.homeOperations.appearanceRequests=[];document.addEventListener('sherlock:home-appearance-request',event=>window.homeOperations.appearanceRequests.push(event.detail))})
    await wallpaperTab(page).click();await wallpaperCards(page).last().click()
    expect(await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-home-theme-id')).toBe('koi-pond')
    const mode=page.locator('[data-odyssey-operations-appearance]')
    expect(await mode.getAttribute('aria-label')).toBe('切换为深色')
    expect(await mode.evaluate(element=>({button:element.offsetWidth,image:element.querySelector('img').offsetWidth}))).toEqual({button:32,image:18})
    expect(await mode.locator('img').evaluate(async image=>{await image.decode();return [image.naturalWidth,image.naturalHeight]})).toEqual([18,18])
    await mode.click();await mode.evaluate(element=>element.click())
    expect(await page.evaluate(()=>window.homeOperations.appearanceRequests.length)).toBe(1)
    expect(await page.locator('body').getAttribute('data-ds-dark-theme')).toBeNull()
    await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en');await nextPaint(page)
    expect(await wallpaperCards(page).locator('.odyssey-wallpaper-name').allTextContents()).toEqual(wallpaperNamesEn)
    await page.evaluate(()=>{document.body.setAttribute('data-ds-dark-theme','');document.dispatchEvent(new CustomEvent('sherlock:home-appearance-reply',{detail:{requestId:window.homeOperations.appearanceRequests[0].requestId,ok:true}}))})
    await expect.poll(()=>mode.getAttribute('aria-label')).toBe('Switch to light mode')
    expect(await mode.locator('img').evaluate(async image=>{await image.decode();return [image.naturalWidth,image.naturalHeight]})).toEqual([18,18])
    expect(await wallpaperTab(page).getAttribute('aria-selected')).toBe('true')
    expect(await wallpaperCards(page).last().getAttribute('aria-pressed')).toBe('true')
    expect(await page.evaluate(()=>localStorage.getItem('ework.home-background.v1'))).toBe('koi-pond')
    await quickTab(page).click();await waitCase(page,2)
    expect(await page.evaluate(()=>window.homeOperations.retained.every(element=>element.isConnected)&&window.homeOperations.retained[0]===document.querySelector('.odyssey-operations-grid'))).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  }finally{await page.close()}
},30000)

it('navigates wallpaper tabs and the five-column gallery by keyboard and keeps a failed appearance request recoverable',async()=>{
  const page=await fixture({themes:true})
  try{
    await toggle(page).click();await waitState(page,'operations')
    await quickTab(page).focus();await page.keyboard.press('ArrowRight')
    expect(await wallpaperTab(page).getAttribute('aria-selected')).toBe('true')
    await page.keyboard.press('Tab');expect(await page.locator('[data-odyssey-operations-appearance]').evaluate(element=>element===document.activeElement)).toBe(true)
    await page.keyboard.press('Tab');expect(await wallpaperCards(page).first().evaluate(element=>element===document.activeElement)).toBe(true)
    await page.keyboard.press('ArrowDown');expect(await wallpaperCards(page).nth(5).evaluate(element=>element===document.activeElement)).toBe(true)
    await page.keyboard.press('End');expect(await wallpaperCards(page).last().evaluate(element=>element===document.activeElement)).toBe(true)
    expect(await wallpaperCards(page).last().evaluate(element=>getComputedStyle(element).outlineStyle)).toBe('solid')
    await page.keyboard.press('Space')
    expect(await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-home-theme-id')).toBe('koi-pond')
    await page.evaluate(()=>document.addEventListener('sherlock:home-appearance-request',event=>document.dispatchEvent(new CustomEvent('sherlock:home-appearance-reply',{detail:{requestId:event.detail.requestId,ok:false,error:'原生明暗设置暂不可用'}}))))
    const mode=page.locator('[data-odyssey-operations-appearance]');await mode.click()
    await expect.poll(()=>page.getByRole('alert').textContent()).toContain('原生明暗设置暂不可用')
    expect(await mode.isEnabled()).toBe(true)
    expect(await wallpaperTab(page).getAttribute('aria-selected')).toBe('true')
    expect(await wallpaperCards(page).last().getAttribute('aria-pressed')).toBe('true')
    expect(await page.locator('body').getAttribute('data-ds-dark-theme')).toBeNull()
  }finally{await page.close()}
},30000)

it.each([
  {width:1380,height:900,dark:false,en:false}, {width:1380,height:900,dark:true,en:false},
  {width:1380,height:900,dark:false,en:true}, {width:1380,height:900,dark:true,en:true},
  ...[400,550,780].flatMap(contentWidth=>[480,640].flatMap(contentHeight=>[false,true].map(dark=>({width:contentWidth+(contentWidth<502?322:338),height:contentHeight+20,contentWidth,contentHeight,dark,en:dark}))))
])('keeps all wallpaper previews and full names readable and clickable without inner scrolling %j',async options=>{
  const page=await fixture({...options,themes:true})
  try{
    if(options.en)await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
    await toggle(page).click();await waitState(page,'operations')
    const quickReturnTop=(await toggle(page).boundingBox()).y
    await wallpaperTab(page).click();await nextPaint(page)
    expect((await toggle(page).boundingBox()).y).toBeCloseTo(quickReturnTop,1)
    const geometry=await page.evaluate(()=>{
      const section=document.querySelector('[data-odyssey-home-operations]'),pane=document.querySelector('.pI_x6G_centerCol').getBoundingClientRect(),button=document.querySelector('[data-odyssey-home-operations-toggle]').getBoundingClientRect()
      return {galleryWidth:document.querySelector('[data-odyssey-theme-gallery]').getBoundingClientRect().width,columns:getComputedStyle(document.querySelector('[data-odyssey-theme-gallery]')).gridTemplateColumns.split(' ').length,returnClearance:pane.bottom-button.top,pane:{x:pane.x,y:pane.y,width:pane.width,height:pane.height},scrollX:section.scrollWidth>section.clientWidth+1,scrollY:section.scrollHeight>section.clientHeight+1,cards:[...document.querySelectorAll('[data-odyssey-theme-gallery] [data-home-theme-id]')].map(card=>{const rect=card.getBoundingClientRect(),label=card.querySelector('.odyssey-wallpaper-name'),preview=card.querySelector('.odyssey-wallpaper-preview').getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2),range=document.createRange();range.selectNodeContents(label);return {id:card.dataset.homeThemeId,width:rect.width,height:rect.height,inside:rect.left>=pane.left&&rect.right<=pane.right&&rect.top>=pane.top&&rect.bottom<=Math.min(pane.bottom,button.top-12),hit:hit===card||card.contains(hit),previewHeight:preview.height,previewWidth:preview.width,font:parseFloat(getComputedStyle(label).fontSize),nameLines:range.getClientRects().length,nameClipped:label.scrollWidth>label.clientWidth+1||label.scrollHeight>label.clientHeight+1}})}
    })
    if(options.contentWidth)expect(geometry.galleryWidth).toBeCloseTo(options.contentWidth,0)
    if(options.contentHeight)expect(geometry.returnClearance).toBeCloseTo(options.contentHeight===480?48:104,1)
    expect(geometry.scrollX).toBe(false);expect(geometry.scrollY).toBe(false);expect(geometry.cards).toHaveLength(15)
    for(const card of geometry.cards){expect(card.inside,card.id).toBe(true);expect(card.hit,card.id).toBe(true);expect(card.nameClipped,card.id).toBe(false);expect(card.font).toBe(12);expect(card.previewHeight).toBeGreaterThanOrEqual(24);expect(card.previewWidth/card.previewHeight).toBeCloseTo(146.4/78,1);expect(card.nameLines).toBeLessThanOrEqual(2)}
    expect(await wallpaperCards(page).locator('.odyssey-wallpaper-name').allTextContents()).toEqual(options.en?wallpaperNamesEn:wallpaperNamesZh)
    const name=`${options.dark?'dark':'light'}-${options.en?'en':'zh'}-${options.width}x${options.height}-${options.panelWidth||0}`
    await region(page).screenshot({path:`${galleryEvidence}/${name}.png`})
    await page.locator('.pI_x6G_centerCol').screenshot({path:`${galleryEvidence}/${name}-pane.png`})
    await writeFile(`${galleryEvidence}/${name}.json`,JSON.stringify(geometry,null,2))
  }finally{await page.close()}
},30000)

it('returns from a complete narrow wallpaper gallery with the native outer wheel gesture while preserving stacked Quick Start gestures',async()=>{
  const page=await fixture({width:722,height:660,themes:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await wallpaperTab(page).click()
    expect(await dispatchWheel(page,'[data-odyssey-theme-gallery] [data-home-theme-id]',-800)).toBe(true)
    await waitState(page,'input')
    expect(await page.evaluate(()=>document.querySelector('.wSkVaW_composerHero').inert)).toBe(false)
    await toggle(page).click();await waitState(page,'operations');await quickTab(page).click()
    expect(await dispatchWheel(page,'.odyssey-operations-quick-card',-800)).toBe(false)
    expect(await state(page)).toBe('operations')
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  }finally{await page.close()}
},15000)

it.each([{width:722,height:500,en:true,name:'400-en'},{width:1380,height:900,en:false,name:'780-zh'}])('keeps the inactive dark tab readable over the unchanged native gray wallpaper %j',async options=>{
  const page=await fixture({...options,dark:true,themes:true})
  try{
    if(options.en)await page.evaluate(()=>document.documentElement.dataset.odysseyLocale='en')
    await toggle(page).click();await waitState(page,'operations');await wallpaperTab(page).click();await nextPaint(page)
    const rect=await quickTab(page).boundingBox()
    const enhanced=PNG.sync.read(await page.screenshot())
    await region(page).screenshot({path:`${galleryEvidence}/readability-${options.name}-enhanced.png`})
    const appearances=await page.locator('[data-odyssey-operations-tab]').evaluateAll(tabs=>tabs.map(tab=>{const style=getComputedStyle(tab);return {selected:tab.getAttribute('aria-selected')==='true',color:style.color,background:style.backgroundColor,border:style.borderTopWidth}}))
    expect(appearances[0].color).not.toBe(appearances[1].color)
    for(const tab of appearances){expect(tab.background).toBe('rgba(0, 0, 0, 0)');expect(tab.border).toBe('0px')}
    await page.locator('[data-odyssey-operations-tab]').evaluateAll(tabs=>tabs.forEach(tab=>{tab.style.setProperty('text-shadow','none','important');tab.style.setProperty('color',tab.getAttribute('aria-selected')==='true'?'#ededed':'#999','important')}))
    const control=PNG.sync.read(await page.screenshot())
    await region(page).screenshot({path:`${galleryEvidence}/readability-${options.name}-control.png`})
    await quickTab(page).evaluate(tab=>tab.style.setProperty('color','transparent','important'))
    const bare=PNG.sync.read(await page.screenshot())
    const energy=frame=>{
      let sum=0,count=0
      for(let y=Math.ceil(rect.y);y<rect.y+rect.height;y++)for(let x=Math.ceil(rect.x);x<rect.x+rect.width;x++){
        const pixel=patchRgb(frame,x,y,0),background=patchRgb(bare,x,y,0)
        sum+=pixel.reduce((total,value,channel)=>total+Math.abs(value-background[channel]),0)/3;count++
      }
      return sum/count
    }
    const metrics={enhanced:energy(enhanced),control:energy(control),ratio:energy(enhanced)/energy(control),appearances}
    await writeFile(`${galleryEvidence}/readability-${options.name}.json`,JSON.stringify(metrics,null,2))
    expect(metrics.ratio,'the real gray-background tab gains visible ink contrast without a backing').toBeGreaterThan(1.25)
  }finally{await page.close()}
},20000)

async function operationTabRects(page) {
  return page.evaluate(()=>Object.fromEntries(['.odyssey-operations-heading','[data-odyssey-operations-tab="quick"]','[data-odyssey-operations-tab="wallpapers"]','[data-odyssey-operations-appearance]','[data-odyssey-operations-appearance] img','[data-odyssey-home-operations-toggle]'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return [selector,{x:r.x,y:r.y,width:r.width,height:r.height}]})))
}
async function tabPanels(page) {
  return page.evaluate(()=>['.odyssey-operations-grid','[data-odyssey-theme-gallery]'].map(selector=>{const element=document.querySelector(selector),style=getComputedStyle(element);return {hidden:element.hidden,inert:element.inert,opacity:Number(style.opacity),x:parseFloat(style.translate)||0,pointable:style.pointerEvents!=='none'}}))
}

it.each([{width:1380,height:900},{width:888,height:660},{width:722,height:660},{width:1118,height:500},{width:888,height:500},{width:722,height:500},{width:888,height:900}])('holds a single unscaled tab/header anchor across both views without clipping Quick Start %j',async options=>{
  const page=await fixture({...options,themes:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await nextPaint(page)
    const before=await operationTabRects(page)
    await page.locator('.pI_x6G_centerCol').screenshot({path:`${galleryEvidence}/09-anchor-${options.width}x${options.height}-quick.png`})
    if(options.width<1000&&options.height>800)expect((await page.locator('.odyssey-operations-grid').boundingBox()).height,'the gallery must not stretch the narrow tall Quick Start composition').toBeLessThanOrEqual(346)
    expect(before['[data-odyssey-operations-appearance]'].width).toBe(32)
    for(const card of await page.locator('.odyssey-operations-quick-card').all())expect(await card.evaluate(card=>{const r=card.getBoundingClientRect(),pane=card.closest('.pI_x6G_centerCol').getBoundingClientRect(),label=card.querySelector('.odyssey-operations-quick-label');return r.left>=pane.left&&r.right<=pane.right&&r.bottom<=pane.bottom&&label.scrollWidth<=label.clientWidth+1&&label.scrollHeight<=label.clientHeight+1})).toBe(true)
    await wallpaperTab(page).click();await nextPaint(page)
    const after=await operationTabRects(page)
    await page.locator('.pI_x6G_centerCol').screenshot({path:`${galleryEvidence}/09-anchor-${options.width}x${options.height}-wallpapers.png`})
    for(const [selector,rect] of Object.entries(before))for(const axis of ['x','y','width','height'])expect(after[selector][axis],`${selector} ${axis}`).toBeCloseTo(rect[axis],0)
    await quickTab(page).click();await nextPaint(page)
    expect(await operationTabRects(page)).toEqual(before)
  }finally{await page.close()}
},20000)

it.each([{dark:false,reduced:false},{dark:true,reduced:false},{dark:false,reduced:true}])('adds a bounded wallpaper hover within a static button and leaves its label steady %j',async options=>{
  const page=await fixture({...options,themes:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await wallpaperTab(page).click()
    await expect.poll(()=>page.locator('[data-odyssey-theme-gallery]').evaluate(element=>element.inert)).toBe(false)
    const card=wallpaperCards(page).nth(1),preview=card.locator('.odyssey-wallpaper-preview'),label=card.locator('.odyssey-wallpaper-name')
    await page.mouse.move(1,1)
    const before={card:await card.boundingBox(),label:await label.boundingBox(),preview:await preview.boundingBox()}
    await card.hover({position:{x:20,y:20}})
    await expect.poll(()=>preview.evaluate(element=>parseFloat(getComputedStyle(element).translate.split(/\s+/).at(-1))||0)).toBe(options.reduced?0:-2)
    const after={card:await card.boundingBox(),label:await label.boundingBox(),preview:await preview.boundingBox(),style:await preview.evaluate(element=>{const style=getComputedStyle(element),matrix=new DOMMatrixReadOnly(getComputedStyle(element.querySelector('img')).transform);return {overflow:style.overflow,radius:parseFloat(style.borderRadius),scale:matrix.m11}})}
    expect(after.card).toEqual(before.card);expect(after.label).toEqual(before.label)
    expect(before.preview.y-after.preview.y).toBeCloseTo(options.reduced?0:2,1)
    if(!options.reduced){await expect.poll(()=>preview.locator('img').evaluate(image=>new DOMMatrixReadOnly(getComputedStyle(image).transform).m11)).toBeGreaterThanOrEqual(1.025);expect(await preview.locator('img').evaluate(image=>new DOMMatrixReadOnly(getComputedStyle(image).transform).m11)).toBeLessThanOrEqual(1.035)}
    expect(after.style.overflow).toBe('hidden');expect(after.style.radius).toBe(7)
    if(options.reduced)expect(after.style.scale).toBe(1)
    await region(page).screenshot({path:`${galleryEvidence}/09-hover-${options.dark?'dark':'light'}-${options.reduced?'reduced':'motion'}.png`})
  }finally{await page.close()}
},20000)

it.each([false,true])('uses a translucent broad Light selected stroke and preserves the dark selected stroke (dark=%s)',async dark=>{
  const page=await fixture({dark,themes:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await wallpaperTab(page).click()
    const stroke=await wallpaperCards(page).first().locator('.odyssey-wallpaper-preview').evaluate(element=>getComputedStyle(element).boxShadow)
    if(dark)expect(stroke).toMatch(/0px 0px 0px 1\.5px$/)
    else{expect(stroke).toBe('rgba(145, 145, 145, 0.32) 0px 0px 0px 3px')}
    expect(await wallpaperCards(page).locator('svg').count()).toBe(0)
    await region(page).screenshot({path:`${galleryEvidence}/11-selected-${dark?'dark':'light'}.png`})
  }finally{await page.close()}
},20000)

it('reverses tab slides from the visible mixture while the header, instances and native wallpaper remain stable',async()=>{
  const page=await fixture({themes:true,reduced:false,clock:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await page.mouse.move(1,1)
    await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100))
    await page.evaluate(()=>{window.homeOperations.retainedPanels=[document.querySelector('.odyssey-operations-grid'),document.querySelector('[data-odyssey-theme-gallery]')];window.homeOperations.controller.select('koi-pond')})
    const header=await operationTabRects(page)
    await wallpaperTab(page).evaluate(element=>element.click());await page.clock.runFor(90)
    const first=await tabPanels(page)
    await region(page).screenshot({path:`${galleryEvidence}/09-tab-flight.png`})
    expect(first.every(panel=>!panel.hidden&&panel.inert)).toBe(true)
    expect(first[0].opacity).toBeGreaterThan(0);expect(first[0].opacity).toBeLessThan(1)
    expect(first[1].opacity).toBeGreaterThan(0);expect(first[1].opacity).toBeLessThan(1)
    expect(first[0].opacity+first[1].opacity).toBeCloseTo(1,2)
    expect(first[0].x).toBeLessThan(0);expect(first[1].x).toBeGreaterThan(0)
    expect(await operationTabRects(page)).toEqual(header)
    const oldCard=await page.locator('.odyssey-operations-quick-card').first().boundingBox()
    await page.mouse.click(oldCard.x+oldCard.width/2,oldCard.y+oldCard.height/2)
    expect(await page.evaluate(()=>window.homeOperations.controller.getSelected())).toBe('koi-pond')
    await quickTab(page).evaluate(element=>element.click())
    const immediate=await tabPanels(page)
    for(let index=0;index<2;index++)expect(immediate[index].opacity).toBeCloseTo(first[index].opacity,2)
    await page.clock.runFor(100)
    const reversed=await tabPanels(page)
    await region(page).screenshot({path:`${galleryEvidence}/09-tab-reverse.png`})
    expect(reversed[0].opacity).toBeGreaterThan(first[0].opacity)
    expect(reversed[0].opacity+reversed[1].opacity).toBeCloseTo(1,2)
    await wallpaperTab(page).evaluate(element=>element.click());await page.clock.runFor(40)
    await quickTab(page).evaluate(element=>element.click());await page.clock.runFor(40)
    await wallpaperTab(page).evaluate(element=>element.click());await page.clock.runFor(1200)
    const settled=await tabPanels(page)
    expect(settled[0].hidden).toBe(true);expect(settled[1].hidden).toBe(false);expect(settled[1].inert).toBe(false);expect(settled[1].opacity).toBe(1);expect(settled[1].x).toBe(0)
    expect(await operationTabRects(page)).toEqual(header)
    expect(await page.evaluate(()=>window.homeOperations.retainedPanels.every(element=>element.isConnected))).toBe(true)
    expect(await page.evaluate(()=>window.homeOperations.controller.getSelected())).toBe('koi-pond')
    await page.evaluate(()=>window.homeOperations.dispose());await page.clock.runFor(1500)
    expect(await region(page).count()).toBe(0)
  }finally{await page.close()}
},30000)

it('retains carousel elapsed reading time while tab slides and the wallpaper view are paused',async()=>{
  const page=await fixture({themes:true,reduced:false,clock:true})
  const elapsed=()=>page.locator('.odyssey-operations-usecase').evaluate(card=>parseFloat(card.style.getPropertyValue('--odyssey-operations-case-progress')))
  try{
    await toggle(page).click();await waitState(page,'operations');await page.mouse.move(1,1)
    await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100));await page.clock.runFor(1900)
    const before=await elapsed(),index=await page.locator('.odyssey-operations-usecase').getAttribute('data-case')
    await wallpaperTab(page).evaluate(element=>element.click());await page.clock.runFor(1200);await page.clock.runFor(4500)
    expect(await elapsed()).toBeCloseTo(before,2)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe(index)
    await quickTab(page).evaluate(element=>element.click());await page.clock.runFor(500)
    const after=await elapsed();expect(after).toBeGreaterThan(before+.005);expect(after).toBeLessThan(before+.09)
  }finally{await page.close()}
},30000)

it('settles tab motion immediately for reduced motion and releases pending animation/subscription work on hide and disposal',async()=>{
  const page=await fixture({themes:true,reduced:false,clock:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100))
    await wallpaperTab(page).evaluate(element=>element.click());await page.clock.runFor(80)
    expect((await tabPanels(page)).every(panel=>!panel.hidden)).toBe(true)
    await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(40)
    const reduced=await tabPanels(page);expect(reduced[0].hidden).toBe(true);expect(reduced[1].opacity).toBe(1);expect(reduced[1].x).toBe(0);expect(reduced[1].inert).toBe(false)
    await quickTab(page).evaluate(element=>element.click())
    const quick=await tabPanels(page);expect(quick[0].opacity).toBe(1);expect(quick[0].x).toBe(0);expect(quick[1].hidden).toBe(true)
    const thumbnails=await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));window.homeOperations.dispose();document.body.setAttribute('data-ds-dark-theme','');window.homeOperations.controller.select('jarrick')})
    await page.clock.runFor(1500)
    expect(await region(page).count()).toBe(0);expect(await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)).toBe(thumbnails)
    expect(await page.locator('[data-odyssey-home-theme-background]').count()).toBe(1)
  }finally{await page.close()}
},30000)


it('reuses the hidden gallery measurement across tab frames and mode changes without requesting hidden thumbnails',async()=>{
  const page=await fixture({themes:true,reduced:false,clock:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100))
    await page.evaluate(()=>{
      window.homeOperations.galleryLabelReads=0
      const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetHeight')
      Object.defineProperty(HTMLElement.prototype,'offsetHeight',{...descriptor,get(){if(this.matches('.odyssey-wallpaper-name'))window.homeOperations.galleryLabelReads++;return descriptor.get.call(this)}})
    })
    expect(await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)).toBe(0)
    await wallpaperTab(page).evaluate(element=>element.click());await page.clock.runFor(1000)
    expect(await page.evaluate(()=>window.homeOperations.galleryLabelReads)).toBe(0)
    expect(await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)).toBeGreaterThanOrEqual(15)
    await quickTab(page).evaluate(element=>element.click());await page.clock.runFor(1000)
    const requests=await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)
    await page.evaluate(()=>document.body.toggleAttribute('data-ds-dark-theme'));await page.clock.runFor(300)
    expect(await page.evaluate(()=>window.homeOperations.galleryLabelReads)).toBe(0)
    expect(await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)).toBe(requests)
    expect((await tabPanels(page))[1].hidden).toBe(true)
    await page.evaluate(async()=>{
      const font=new FontFace('GalleryLate','url(http://home-operations.test/fonts/NotoSansSC.woff2)')
      document.fonts.add(font)
      const style=document.createElement('style');style.textContent='.odyssey-wallpaper-name{font-family:GalleryLate,sans-serif}';document.head.append(style)
      await document.fonts.load('12px GalleryLate');await document.fonts.ready
    })
    await page.clock.runFor(200)
    expect(await page.evaluate(()=>window.homeOperations.galleryLabelReads),'a real late font must invalidate the cached metrics').toBeGreaterThan(0)
    expect(await page.evaluate(()=>window.homeOperations.thumbnailRequests.length)).toBe(requests)
  }finally{await page.close()}
},20000)

it('keeps the painted tab mixture continuous when returning to input during a slide and reopening the collection',async()=>{
  const page=await fixture({themes:true,reduced:false,clock:true})
  try{
    await toggle(page).click();await waitState(page,'operations');await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100))
    await page.evaluate(()=>window.homeOperations.controller.select('berber'))
    await wallpaperTab(page).evaluate(element=>element.click());await page.clock.runFor(80)
    const before=await tabPanels(page)
    expect(before.every(panel=>!panel.hidden&&panel.opacity>0&&panel.opacity<1)).toBe(true)
    await toggle(page).evaluate(element=>element.click())
    const leaving=await tabPanels(page)
    for(let index=0;index<2;index++)expect(leaving[index].opacity,'returning must not force the target tab into the fully visible departing region').toBeCloseTo(before[index].opacity,2)
    expect(leaving.every(panel=>panel.inert)).toBe(true)
    await page.clock.runFor(1200);expect(await state(page)).toBe('input')
    await toggle(page).evaluate(element=>element.click());await page.clock.runFor(1200)
    expect(await state(page)).toBe('operations')
    const reopened=await tabPanels(page);expect(reopened[0].hidden).toBe(true);expect(reopened[1].opacity).toBe(1);expect(reopened[1].inert).toBe(false)
    expect(await page.evaluate(()=>window.homeOperations.controller.getSelected())).toBe('berber')
  }finally{await page.close()}
},20000)


it.each([{id:'haseeb',tone:'current-aurora'},{id:'default',tone:'white'},{id:'vghodki',tone:'blue'},{id:'antiquue',tone:'warm'}])('uses a broad neutral-gray Light outline on the actual native wallpaper and selected preview %j',async options=>{
  const page=await fixture({themes:true,deviceScaleFactor:2})
  try{
    await toggle(page).click();await waitState(page,'operations');await wallpaperTab(page).click()
    const card=page.locator(`[data-odyssey-theme-gallery] [data-home-theme-id="${options.id}"]`),preview=card.locator('.odyssey-wallpaper-preview')
    await card.click();await page.mouse.move(1,1);await nextPaint(page)
    expect(await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-home-theme-id')).toBe(options.id)
    expect(await page.locator('[data-home-theme-canvas]').count()).toBe(1)
    expect(await card.getAttribute('aria-pressed')).toBe('true')
    expect(await page.locator('[data-odyssey-theme-gallery] [aria-pressed="true"]').count()).toBe(1)
    expect(await page.locator('body').getAttribute('data-ds-dark-theme')).toBeNull()
    const properties=await preview.evaluate(element=>{const s=getComputedStyle(element);return {shadow:s.boxShadow,filter:s.filter,border:s.borderWidth}})
    const pane=page.locator('.pI_x6G_centerCol'),bounds=await pane.boundingBox(),rect=await preview.boundingBox()
    const stableRects=await operationTabRects(page)
    const candidate=PNG.sync.read(await pane.screenshot({path:`${galleryEvidence}/11-${options.id}-candidate-pane.png`}))
    const controlStyle=await page.addStyleTag({content:'.odyssey-wallpaper-card[aria-pressed="true"] .odyssey-wallpaper-preview{box-shadow:0 0 0 1.25px rgba(78,129,234,.6)!important}'})
    const control=PNG.sync.read(await pane.screenshot({path:`${galleryEvidence}/11-${options.id}-blue-control-pane.png`}))
    await controlStyle.evaluate(element=>element.textContent='.odyssey-wallpaper-card[aria-pressed="true"] .odyssey-wallpaper-preview{box-shadow:none!important}')
    expect(await preview.boundingBox()).toEqual(rect);expect(await operationTabRects(page)).toEqual(stableRects)
    const bare=PNG.sync.read(await pane.screenshot())
    await controlStyle.evaluate(element=>element.remove())
    const scale=candidate.width/bounds.width,points=[]
    for(const fraction of [.25,.375,.5,.625,.75]){
      points.push([Math.floor((rect.x-bounds.x-2)*scale),Math.floor((rect.y-bounds.y+rect.height*fraction)*scale)])
      points.push([Math.floor((rect.x-bounds.x+rect.width*fraction)*scale),Math.floor((rect.y-bounds.y-2)*scale)])
    }
    const fitGrayBand=image=>{
      let numerator=0,denominator=0,error=0,difference=0
      for(const [x,y] of points)for(let channel=0;channel<3;channel++){const offset=(y*image.width+x)*4+channel,base=bare.data[offset],delta=image.data[offset]-base,target=145-base;numerator+=delta*target;denominator+=target*target;difference+=Math.abs(delta)}
      const alpha=numerator/denominator
      for(const [x,y] of points)for(let channel=0;channel<3;channel++){const offset=(y*image.width+x)*4+channel,expected=bare.data[offset]+alpha*(145-bare.data[offset]);error+=(image.data[offset]-expected)**2}
      return {alpha,rms:Math.sqrt(error/(points.length*3)),difference:difference/(points.length*3)}
    }
    const crop=image=>{
      const x=Math.floor((rect.x-bounds.x-6)*scale),y=Math.floor((rect.y-bounds.y-6)*scale),width=Math.ceil((rect.width+12)*scale),height=Math.ceil((rect.height+36)*scale),result=new PNG({width,height})
      for(let row=0;row<height;row++)image.data.copy(result.data,row*width*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4)
      return PNG.sync.write(result)
    }
    await writeFile(`${galleryEvidence}/11-${options.id}-candidate-detail.png`,crop(candidate))
    await writeFile(`${galleryEvidence}/11-${options.id}-blue-control-detail.png`,crop(control))
    const metrics={...options,properties,scale,points,candidateOuterBand:fitGrayBand(candidate),blueControlOuterBand:fitGrayBand(control),stableRects,nativeWallpaper:options.id}
    await writeFile(`${galleryEvidence}/11-${options.id}-outline.json`,JSON.stringify(metrics,null,2))
    expect(properties.shadow).toBe('rgba(145, 145, 145, 0.32) 0px 0px 0px 3px')
    expect(properties.filter).toBe('none');expect(properties.border).toBe('0px')
    expect(metrics.candidateOuterBand.alpha,'the actual 2px outer band is visibly broad and translucent').toBeGreaterThanOrEqual(.25)
    expect(metrics.candidateOuterBand.alpha).toBeLessThanOrEqual(.38)
    expect(metrics.candidateOuterBand.rms,'the ring blends a neutral light gray rather than blue').toBeLessThan(2)
    expect(metrics.blueControlOuterBand.difference,'the previous narrow blue outline does not occupy this outer band').toBeLessThan(2)
    expect(await card.locator('svg').count()).toBe(0)
  }finally{await page.close()}
},30000)

it('offers the fourth report example with exact copy, four keyboard tracks and a distinct large-card entry',async()=>{
 const page=await fixture();try{
  await page.evaluate(()=>{window.examples=[];window.quickActions=[];window.homeOperations.onExample=async kind=>window.examples.push(kind);window.homeOperations.onAction=async kind=>window.quickActions.push(kind);window.homeOperations.dispose();window.homeOperations.mount()})
  await toggle(page).click();await waitState(page,'operations');const tracks=page.locator('.odyssey-operations-pagination button')
  expect(await tracks.count()).toBe(4)
  await tracks.first().focus();await page.keyboard.press('End');await waitCase(page,3)
  expect(await tracks.nth(3).evaluate(el=>el===document.activeElement)).toBe(true)
  expect(await page.locator('.odyssey-operations-title strong').textContent()).toBe('研究报告')
  expect(await page.locator('.odyssey-operations-subtitle').textContent()).toBe('从问题到研报')
  expect(await page.locator('.odyssey-operations-description').textContent()).toBe('从检索资料到形成观点，\n回看研究过程，查看完整研报。')
  expect(await page.locator('[data-odyssey-operations-case-layer] img').count()).toBe(1)
  expect(await page.locator('[data-odyssey-operations-case-layer] img').getAttribute('class')).toBe('odyssey-operations-trend')
  await page.locator('[data-odyssey-operations-open-example]').focus();await page.keyboard.press('Enter');await expect.poll(()=>page.evaluate(()=>window.examples)).toEqual(['report'])
  await page.locator('.odyssey-operations-quick-card[data-card="report"]').click();await expect.poll(()=>page.evaluate(()=>window.quickActions)).toEqual(['report']);expect(await page.evaluate(()=>window.examples)).toEqual(['report'])
  await tracks.nth(3).focus();await page.keyboard.press('ArrowRight');await waitCase(page,0);await page.keyboard.press('ArrowLeft');await waitCase(page,3);await page.keyboard.press('Home');await waitCase(page,0)
  expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
 }finally{await page.close()}
},15000)

it.each([
 {width:1380,height:900,dark:false,locale:'zh'},{width:1380,height:900,dark:true,locale:'zh'},
 {width:830,height:640,dark:false,locale:'zh'},{width:830,height:640,dark:true,locale:'zh'},
 {width:680,height:480,dark:false,locale:'zh'},{width:680,height:480,dark:true,locale:'zh'},
 {width:680,height:640,dark:false,locale:'en'},{width:680,height:640,dark:true,locale:'en'},
])('keeps the picture-free fourth report card readable in its unchanged shell %j',async options=>{
 const page=await fixture({...options,themes:true,deviceScaleFactor:2});try{
  await page.evaluate(locale=>document.documentElement.dataset.odysseyLocale=locale,options.locale)
  await toggle(page).click();await waitState(page,'operations');await page.mouse.move(1,1)
  const before=await page.locator('.odyssey-operations-usecase').evaluate(card=>{const r=card.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,background:getComputedStyle(card).backgroundColor,border:getComputedStyle(card).borderWidth,overflowX:card.closest('section').scrollWidth-card.closest('section').clientWidth,overflowY:card.closest('section').scrollHeight-card.closest('section').clientHeight}})
  await page.locator('.odyssey-operations-pagination [data-case="3"]').click();await waitCase(page,3);await page.mouse.move(1,1)
  const geometry=await region(page).evaluate(section=>{
   const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}},card=section.querySelector('.odyssey-operations-usecase'),layer=card.querySelector('[data-case="3"]'),text=selector=>{const e=layer.querySelector(selector),range=document.createRange();range.selectNodeContents(e);return{...rect(e),ink:rect(range),font:parseFloat(getComputedStyle(e).fontSize)}}
   return{window:{width:innerWidth,height:innerHeight},content:rect(section.parentElement),section:rect(section),card:{...rect(card),background:getComputedStyle(card).backgroundColor,border:getComputedStyle(card).borderWidth},title:text('.odyssey-operations-title strong'),subtitle:text('.odyssey-operations-subtitle'),description:text('.odyssey-operations-description'),tracks:rect(card.querySelector('.odyssey-operations-pagination')),images:layer.querySelectorAll('img').length,source:layer.querySelector('img').src,glows:[...layer.querySelectorAll('.glow')].map(e=>({animation:getComputedStyle(e).animationName,image:getComputedStyle(e).backgroundImage})),overflowX:section.scrollWidth-section.clientWidth,overflowY:section.scrollHeight-section.clientHeight}
  })
  expect({x:geometry.card.x,y:geometry.card.y,width:geometry.card.width,height:geometry.card.height,background:geometry.card.background,border:geometry.card.border}).toEqual({x:before.x,y:before.y,width:before.width,height:before.height,background:before.background,border:before.border});expect(geometry.overflowX).toBeLessThanOrEqual(Math.max(1,before.overflowX));expect(geometry.overflowY).toBeLessThanOrEqual(Math.max(1,before.overflowY))
  for(const text of[geometry.title,geometry.subtitle,geometry.description]){expect(text.ink.x).toBeGreaterThanOrEqual(geometry.card.x+10);expect(text.ink.right).toBeLessThanOrEqual(geometry.card.right-10)}
  expect(geometry.description.y).toBeGreaterThanOrEqual(geometry.subtitle.bottom+8);expect(geometry.description.bottom).toBeLessThanOrEqual(geometry.tracks.y-4);expect(geometry.images).toBe(1);expect(geometry.glows.every(g=>g.animation==='none'&&g.image.startsWith('url("data:image/svg+xml;'))).toBe(true)
  const label=`report-${options.dark?'dark':'light'}-${options.locale}-window${options.width}x${options.height}`;await mkdir('output/ppt-markup-design-20261025/report-card-validation',{recursive:true});await writeFile(`output/ppt-markup-design-20261025/report-card-validation/${label}.json`,JSON.stringify(geometry,null,2));await region(page).screenshot({path:`output/ppt-markup-design-20261025/report-card-validation/${label}.png`})
 }finally{await page.close()}
},20000)
it('retargets smoothly through the fourth report pane while preserving four-track clock and reduced motion semantics',async()=>{
 const page=await fixture({reduced:false,clock:true});try{
  await toggle(page).click();await waitState(page,'operations');await page.mouse.move(1,1);await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+100))
  for(const index of[3,1,3]){
   await page.locator(`.odyssey-operations-pagination [data-case="${index}"]`).evaluate(e=>e.click());await page.clock.runFor(80)
   const weights=await page.locator('[data-odyssey-operations-case-layer]').evaluateAll(els=>els.map(e=>({opacity:parseFloat(getComputedStyle(e).opacity),inert:e.inert,hidden:e.getAttribute('aria-hidden')})))
   expect(weights.reduce((a,w)=>a+w.opacity,0)).toBeCloseTo(1,3);expect(weights.filter(w=>!w.inert&&w.hidden==='false')).toHaveLength(1)
  }
  await page.clock.runFor(450);await waitCase(page,3)
  const timing=await page.locator('[data-odyssey-operations-case-layer=""][data-case="3"] .glow').evaluateAll(els=>els.map(e=>e.getAnimations()[0].effect.getTiming()))
  expect(timing.map(t=>[t.duration,t.direction])).toEqual([[2000,'alternate'],[2000,'alternate']])
  await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(20);expect(await page.locator('[data-case="3"] .glow').evaluateAll(els=>els.every(e=>e.getAnimations().length===0))).toBe(true)
  await page.clock.runFor(12000);expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('3')
 }finally{await page.close()}
},20000)

it('pulses only the homepage down-button background once per real hero/session entry and keeps its geometry fixed',async()=>{
 const page=await fixture({reduced:false,clock:true});try{
  await page.clock.pauseAt(new Date(await page.evaluate(()=>Date.now())+50))
  await page.evaluate(()=>document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='session-one');await page.clock.runFor(32)
  expect(await toggle(page).getAttribute('data-odyssey-home-attention')).not.toBeNull()
  const before=await toggle(page).boundingBox(),timing=await toggle(page).evaluate(button=>button.getAnimations({subtree:true}).find(a=>a.animationName==='odyssey-home-toggle-attention').effect.getTiming())
  expect(timing.iterations).toBe(3);expect(timing.duration*timing.iterations).toBeCloseTo(4000,1)
  for(const time of[0,666,1333,2666]){
   await toggle(page).evaluate((button,time)=>{const a=button.getAnimations({subtree:true}).find(a=>a.animationName==='odyssey-home-toggle-attention');a.pause();a.currentTime=time},time)
   expect(await toggle(page).boundingBox()).toEqual(before);expect(await toggle(page).evaluate(button=>getComputedStyle(button).borderWidth)).toBe('0px')
   await mkdir('output/ppt-markup-design-20261025/report-card-validation',{recursive:true});await toggle(page).screenshot({path:`output/ppt-markup-design-20261025/report-card-validation/down-button-background-${time}.png`})
  }
  await page.clock.runFor(1000);await page.evaluate(()=>{document.body.setAttribute('data-ds-dark-theme','');document.documentElement.dataset.odysseyLocale='en'});await page.clock.runFor(3100)
  expect(await toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull()
  await page.evaluate(()=>{const hero=document.querySelector('.wSkVaW_composerHero');hero.replaceWith(hero.cloneNode(true))});await page.clock.runFor(64)
  expect(await toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull()
  await page.evaluate(()=>document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='session-two');await page.clock.runFor(32)
  expect(await toggle(page).getAttribute('data-odyssey-home-attention')).not.toBeNull()
  await toggle(page).evaluate(e=>e.click());expect(await toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull();await page.clock.runFor(1500);await waitState(page,'operations')
  await toggle(page).evaluate(e=>e.click());await page.clock.runFor(1500);await waitState(page,'input');expect(await toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull()
  await page.evaluate(()=>document.body.dataset.workspaceSurface='settings');await page.clock.runFor(32);expect(await toggle(page).count()).toBe(0)
  await page.evaluate(()=>delete document.body.dataset.workspaceSurface);await page.clock.runFor(64);expect(await toggle(page).getAttribute('data-odyssey-home-attention')).not.toBeNull()
  await page.evaluate(()=>window.homeOperations.dispose());await page.clock.runFor(5000);expect(await toggle(page).count()).toBe(0)
 }finally{await page.close()}
},20000)
it('keeps the homepage button hint static for reduced motion and clears an active hint when the preference or document visibility changes',async()=>{
 const page=await fixture({reduced:true,clock:true});try{
  await page.evaluate(()=>{document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='initial-session';window.homeOperations.dispose();window.homeOperations.mount()})
  expect(await toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull()
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='new-session');await page.clock.runFor(48)
  expect(await toggle(page).getAttribute('data-odyssey-home-attention')).not.toBeNull()
  await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(48);await expect.poll(()=>toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull()
  expect(await toggle(page).evaluate(button=>button.getAnimations({subtree:true}).some(a=>a.animationName==='odyssey-home-toggle-attention'))).toBe(false)
  await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>document.querySelector('[data-srb-session-header]').dataset.eworkNotesSession='third-session');await page.clock.runFor(48)
  expect(await toggle(page).getAttribute('data-odyssey-home-attention')).not.toBeNull()
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});expect(await toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull()
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))});await page.clock.runFor(5000);expect(await toggle(page).getAttribute('data-odyssey-home-attention')).toBeNull()
 }finally{await page.close()}
},15000)
it('decodes the fourth report Figma assets locally at their native slots without adding an illustration',async()=>{
 const page=await fixture();try{
  const assets=[...importedImages].filter(([path])=>/\/home-operations-assets\/case-report-/.test(path));expect(assets).toHaveLength(3)
  const decoded=await page.evaluate(async values=>Promise.all(values.map(async([path,src])=>{const image=new Image();image.src=src;await image.decode();return{path,width:image.naturalWidth,height:image.naturalHeight}})),assets)
  for(const item of decoded){if(item.path.includes('glow'))expect([item.width,item.height]).toEqual([380,448]);else{expect(Math.abs(item.width-16.9)).toBeLessThan(1);expect(Math.abs(item.height-16.9)).toBeLessThan(1)}}
  await toggle(page).click();await waitState(page,'operations');await page.locator('.odyssey-operations-pagination [data-case="3"]').click();await waitCase(page,3)
  const backgrounds=await page.locator('[data-odyssey-operations-case-layer][data-case="3"] .glow').evaluateAll(async els=>Promise.all(els.map(async el=>{const url=JSON.parse(getComputedStyle(el).backgroundImage.slice(4,-1)),image=new Image();image.src=url;await image.decode();return{width:image.naturalWidth,height:image.naturalHeight,slot:el.getBoundingClientRect().width}})))
  expect(backgrounds.every(image=>image.width>0&&image.height>0&&image.slot>0)).toBe(true)
 }finally{await page.close()}
},15000)
