import { readFileSync, readdirSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { PNG } from 'pngjs'
import { afterAll, beforeAll, expect, it } from 'vitest'

const evidence = '/tmp/ework-home-operations-20261023'
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
      import {mountHomeThemes} from './src/preload/home-themes';
      window.homeOperations={mount(themes=false){mountDesktopShellStyles(document);if(themes)this.disposeThemes=mountHomeThemes(document);this.original=document.querySelector('textarea');const before=[...document.querySelectorAll('style')];this.dispose=mountHomeOperations(document);this.ownStyles=[...document.querySelectorAll('style')].filter(style=>!before.includes(style))}};
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
}, 30000)
afterAll(async () => browser?.close())

function hero() {
  return `<div class="wSkVaW_composerStack wSkVaW_composerHero"><div class="pXSMma_root"><div class="pXSMma_stack"><div class="pXSMma_headline">你想做什么？</div></div></div>
    <div class="wSkVaW_heroWorkspaceRow"><button class="pXSMma_workspace" aria-label="选择工作区" aria-haspopup="menu" aria-expanded="false"><svg class="pXSMma_folder" width="16" height="16"></svg><span class="pXSMma_workspaceLabel">测试集</span><svg class="pXSMma_chevron" width="12" height="12"></svg></button><div data-slot="conversation.hero.workspace" style="display:contents"><span class="_root_19372_1"></span></div><div data-slot="conversation.hero.agentPreset" style="display:contents"><span class="_root_19372_1 cubgiG_picker"><button class="cubgiG_seat" aria-haspopup="menu">标准模式</button></span></div></div>
    <div data-slot="conversation.input.dock" style="display:contents"></div><div data-slot="conversation.composer.bar" style="display:contents"><div class="uV2eYG_root"><div class="uV2eYG_card"><div class="uV2eYG_scroll"><textarea class="uV2eYG_input" aria-label="发送消息" placeholder="向智能体发送消息"></textarea></div><div class="uV2eYG_row"><button aria-label="添加附件">+</button><button aria-label="发送">↑</button></div></div></div></div>
  </div>`
}

async function fixture({ dark = false, reduced = true, width = 1380, height = 900, route = 'home', surface = '', child = false, themes = false, clock = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  if (clock) await page.clock.install({ time: new Date('2026-10-23T00:00:00Z') })
  await page.route('**/*', request => request.abort())
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${frontend}\n${native}\n${portalCss}</style><body ${dark ? 'data-ds-dark-theme' : ''} ${surface ? `data-workspace-surface="${surface}"` : ''}>
    <div id="root"><div data-slot="root" style="display:contents"><div class="pI_x6G_frame" data-dsh-frame="true" style="grid-template-columns:280px minmax(0,1fr) 0px">
      <aside></aside><main class="pI_x6G_centerCol" data-pane="conversation"><div data-slot="conversation" style="display:contents"><div class="wSkVaW_root" data-phase="${route === 'home' ? 'hero' : 'active'}" data-odyssey-page="${route}">
        <div data-slot="conversation.session.header" style="display:contents"><header class="wSkVaW_header" data-srb-session-header data-odyssey-home-header="true"><button aria-label="对话">对话</button></header></div>
        <div class="wSkVaW_scrollBody" data-conversation-scroll></div><div data-center-composer-host><div data-composer-portal-host><div class="wSkVaW_composerSeat" data-composer-seat><div data-slot="conversation.composer" style="display:contents"><div data-chain-overlay-fallback="conversation.composer" style="display:contents">${hero()}</div></div></div></div></div>
        ${child ? `<section data-odyssey-subagent-panel><div class="wSkVaW_root" data-phase="hero" data-odyssey-page="home">${hero()}</div></section>` : ''}
      </div></div></main>
    </div></div></div><aside data-dsh-panel-host data-odyssey-panel-right="closed"></aside>
  </body>`)
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
    expect(Math.abs(pane.y + pane.height - button.y - 104), 'the undocked toggle is raised by 32px').toBeLessThanOrEqual(1)
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

it('pages through three use cases and keeps quick-card clicks local to the homepage preview', async () => {
  const page = await fixture()
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const dots = page.locator('.odyssey-operations-pagination button')
    expect(await dots.count()).toBe(3)
    const titles = []
    for (let index = 0; index < 3; index++) {
      await dots.nth(index).click()
      expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe(String(index))
      expect(await page.locator('.odyssey-operations-pagination [aria-pressed="true"]').count()).toBe(1)
      expect(await dots.nth(index).getAttribute('aria-pressed')).toBe('true')
      titles.push(await page.locator('.odyssey-operations-usecase .odyssey-operations-title').textContent())
    }
    expect(new Set(titles).size).toBe(3)
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

it('fills the active case track and automatically loops the three examples on the browser clock', async () => {
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
    for (const nextCase of ['1', '2', '0']) {
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
    await expect.poll(async () => (await appearance())[0].colored).toBe(1)
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

it('adds one reversible presentation-blue glass tint to all four quick cards without pointer glow, shadows, or lift', async () => {
  for (const dark of [false, true]) {
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
  }
}, 15000)

it('keeps all five card surfaces distinct and description text readable over black, white, and busy backgrounds', async () => {
  const observations = []
  for (const dark of [false, true]) {
    const page = await fixture({ dark, reduced: true })
    try {
      await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
      for (const [name, background] of [['black', '#000'], ['white', '#fff'], ['busy', 'repeating-linear-gradient(45deg,#00afff 0 18px,#ff8a00 18px 36px,#101820 36px 54px,#fcfcfc 54px 72px)']]) {
        await page.locator('.pI_x6G_centerCol').evaluate((host, background) => host.style.setProperty('background', background, 'important'), background)
        await region(page).screenshot({ path: `${evidence}/material-${dark ? 'dark' : 'light'}-${name}.png` })
        const geometry = await page.evaluate(() => {
          const description = document.querySelector('.odyssey-operations-description'), bounds = description.getBoundingClientRect()
          return { foreground: getComputedStyle(description).color.match(/[\d.]+/g).map(Number), description: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, labels: [...document.querySelectorAll('.odyssey-operations-quick-label')].map(label => { const bounds = label.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, color: getComputedStyle(label).color.match(/[\d.]+/g).map(Number).slice(0, 3) } }), cards: [...document.querySelectorAll('.odyssey-operations-usecase, .odyssey-operations-quick-card')].map(card => { const bounds = card.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width } }) }
        })
        await page.locator('.odyssey-operations-description, .odyssey-operations-quick-label').evaluateAll(elements => elements.forEach(element => element.style.visibility = 'hidden'))
        const png = PNG.sync.read(await page.screenshot())
        await page.locator('.odyssey-operations-description, .odyssey-operations-quick-label').evaluateAll(elements => elements.forEach(element => element.style.removeProperty('visibility')))
        const cards = geometry.cards.map(card => patchRgb(png, card.x + card.width * .65, card.y + 6))
        const edgeSeparation = geometry.cards.map(card => {
          const outside = patchRgb(png, card.x + card.width * .65, card.y - 5)
          // Measure the material edge at native pixel resolution.
          return Math.max(...[-2, -1, 0, 1, 2].map(dy => patchRgb(png, card.x + card.width * .65, card.y + dy, 0).reduce((sum, value, channel) => sum + Math.abs(value - outside[channel]), 0) / 3))
        })
        const ratios = []
        for (const x of [.1, .5, .9]) for (const y of [.2, .5, .8]) ratios.push(contrastRatio(geometry.foreground.slice(0, 3), patchRgb(png, geometry.description.x + geometry.description.width * x, geometry.description.y + geometry.description.height * y)))
        const labelRatios = geometry.labels.flatMap(label => [.1, .5, .9].map(x => contrastRatio(label.color, patchRgb(png, label.x + label.width * x, label.y + label.height * .5))))
        observations.push({ dark, name, cards, edgeSeparation, minimumDescriptionContrast: Math.min(...ratios), minimumLabelContrast: Math.min(...labelRatios) })
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
      const black = modes.find(mode => mode.name === 'black').cards[card], white = modes.find(mode => mode.name === 'white').cards[card]
      const transmission = white.reduce((sum, value, channel) => sum + value - black[channel], 0) / 3
      expect(transmission, `${dark ? 'dark' : 'light'} quick card ${card} transmits a stronger amount of its backdrop`).toBeGreaterThanOrEqual(dark ? 60 : 25)
      if (dark) expect(transmission).toBeLessThanOrEqual(80)
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

it('gives all five cards a stronger bounded tilt and keeps a stationary pointer stable', async () => {
  const page = await fixture({ reduced: false })
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    const cards = page.locator('.odyssey-operations-usecase, .odyssey-operations-quick-card')
    expect(await cards.count()).toBe(5)
    for (const card of await cards.all()) {
      await page.mouse.move(1, 1)
      await page.waitForTimeout(340)
      const bounds = await card.boundingBox(), point = { x: bounds.x + bounds.width * .06, y: bounds.y + bounds.height * .06 }
      await page.mouse.move(point.x, point.y)
      await page.waitForTimeout(420)
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
        expect(Math.abs(values.at(-1))).toBeGreaterThan(4)
        expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(5.2)
        expect(Math.max(...values) - Math.min(...values)).toBeLessThan(.03)
      }
      await page.mouse.move(1, 1)
      await expect.poll(() => card.evaluate(element => ({ flag: element.hasAttribute('data-odyssey-operations-tilting'), transform: getComputedStyle(element).transform }))).toEqual({ flag: false, transform: 'none' })
      await card.dispatchEvent('pointermove', { clientX: point.x, clientY: point.y, pointerType: 'touch', bubbles: true })
      await nextPaint(page)
      expect(await card.evaluate(element => getComputedStyle(element).transform)).toBe('none')
    }
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

it('renders a faint moving ambient gradient inside every quick card without obscuring white-backdrop labels or leaking past the corners', async () => {
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
        for (const card of cards) for (const animation of card.getAnimations({ subtree: true })) if ('animationName' in animation) { animation.pause(); animation.currentTime = Number(animation.effect.getTiming().duration) * fraction }
      }, fraction)
      for (const phase of [0, .25, .5, .75]) {
        await seek(phase)
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
        const outsideDifference = Math.max(...outside.map(([x, y]) => patchRgb(frames[0], x, y, 0).reduce((sum, value, channel) => sum + Math.abs(value - patchRgb(plain, x, y, 0)[channel]), 0) / 3))
        observations.push({ dark, index, decorationDifference: difference(frames[0], plain, card), maximumPhaseDifference: Math.max(...phaseDifferences), outsideDifference })
      }
    } finally { await page.close() }
  }
  await writeFile(`${evidence}/ambient-small-raster-readability.json`, JSON.stringify(observations, null, 2))
  for (const observation of observations) {
    if ('minimumLabelContrast' in observation) expect(observation.minimumLabelContrast, `${observation.dark ? 'dark' : 'light'} card ${observation.index} label at phase ${observation.phase}`).toBeGreaterThanOrEqual(4.5)
    else {
      expect(observation.decorationDifference, 'the ambient layer changes real painted pixels').toBeGreaterThan(.02)
      expect(observation.decorationDifference, 'the ambient layer remains faint').toBeLessThan(8)
      expect(observation.maximumPhaseDifference, 'the ambient layer moves subtly over its full cycle').toBeGreaterThan(.02)
      expect(observation.outsideDifference, 'the ambient layer remains inside the clipped card').toBeLessThanOrEqual(1)
    }
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
    const dock = await page.locator('[data-odyssey-theme-dock]').boundingBox(), expanded = await toggle(page).boundingBox()
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(dock.y - 42)
    await toggle(page).click()
    await waitState(page, 'input')
    positions.push((await toggle(page).boundingBox()).y)
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThan(.5)
  } finally { await page.close() }
}, 15000)

it('keeps small-pane content natively scrollable while only the bottom button returns to input', async () => {
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
    expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight)
    const operations = region(page)
    await operations.hover()
    await page.mouse.wheel(0, 900)
    await expect.poll(() => operations.evaluate(section => section.scrollTop)).toBeGreaterThan(0)
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

it('keeps the native theme dock independent from operation snapping and preserves it on cleanup', async () => {
  const page = await fixture({ themes: true })
  try {
    const themeDock = page.locator('[data-odyssey-theme-dock]')
    expect(await themeDock.count()).toBe(1)
    expect(await page.locator('[data-home-theme-canvas="default"]').count()).toBe(1)
    expect(await dispatchKey(page, '[data-odyssey-theme-dock] [aria-pressed="true"]', 'ArrowDown')).toBe(false)
    expect(await dispatchWheel(page, '[data-odyssey-theme-dock]', 120)).toBe(false)
    expect(await state(page)).toBe('input')
    await toggle(page).click()
    await waitState(page, 'operations')
    expect(await dispatchKey(page, '[data-odyssey-theme-dock] [aria-pressed="true"]', 'ArrowUp')).toBe(false)
    expect(await dispatchWheel(page, '[data-odyssey-theme-dock]', -120)).toBe(false)
    expect(await state(page)).toBe('operations')
    await page.mouse.move(1, 1)
    await page.screenshot({ path: `${evidence}/theme-integrated-light-operations.png` })
    await region(page).screenshot({ path: `${evidence}/region-light.png` })
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
    await page.screenshot({ path: `${evidence}/theme-integrated-dark-operations.png` })
    await region(page).screenshot({ path: `${evidence}/region-dark.png` })
    await page.locator('[data-odyssey-theme-dock] [aria-pressed="true"]').press('ArrowRight')
    await expect.poll(() => themeDock.getAttribute('data-current-theme')).not.toBe('default')
    expect(await state(page)).toBe('operations')
    await page.evaluate(() => window.homeOperations.dispose())
    expect(await themeDock.count()).toBe(1)
    expect(await page.locator('canvas[data-home-theme-canvas]').count()).toBe(1)
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
  } finally { await page.close() }
}, 15000)

it.each([
  { width: 800, panel: false },
  { width: 1040, panel: false },
  { width: 1380, panel: false },
  { width: 1040, panel: true }
])('keeps the return arrow and expanded theme dock independently clickable in a short window %j', async options => {
  const page = await fixture({ themes: true, height: 640, reduced: true, ...options })
  try {
    if (options.panel) await page.locator('[data-dsh-panel-host]').evaluate(element => element.dataset.odysseyPanelRight = 'open')
    const themeDock = page.locator('[data-odyssey-theme-dock]')
    await themeDock.hover()
    await toggle(page).click()
    await waitState(page, 'operations')
    const centerIsClickable = locator => locator.evaluate(element => {
      const rect = element.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return element === hit || element.contains(hit)
    })
    await expect.poll(() => centerIsClickable(toggle(page))).toBe(true)
    const arrowBounds = await toggle(page).boundingBox(), dockBounds = await themeDock.boundingBox()
    expect(arrowBounds.width).toBeGreaterThanOrEqual(32); expect(arrowBounds.height).toBeGreaterThanOrEqual(32)
    expect(arrowBounds.y + arrowBounds.height).toBeLessThanOrEqual(dockBounds.y - 42)
    const currentTheme = page.locator('[data-odyssey-theme-dock] [aria-pressed="true"]')
    expect(await centerIsClickable(currentTheme)).toBe(true)
    const selected = await themeDock.getAttribute('data-current-theme')
    await currentTheme.click()
    expect(await themeDock.getAttribute('data-current-theme')).toBe(selected)
    expect(await state(page)).toBe('operations')
    await toggle(page).click()
    await waitState(page, 'input')
  } finally { await page.close() }
}, 15000)

it.each([
  { dark: false, reduced: false, name: 'light-wide' },
  { dark: true, reduced: false, name: 'dark-wide' },
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
