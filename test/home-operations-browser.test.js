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
const waitCase = (page, index) => expect.poll(() => page.locator('.odyssey-operations-usecase').evaluate(card => ({ index: card.dataset.case, opacity: Number(getComputedStyle(card.querySelector('.odyssey-operations-case-copy')).opacity) })), { timeout: 1500 }).toEqual({ index: String(index), opacity: 1 })
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

it('switches regions only with the bottom button, including its Enter and Space activation', async () => {
  const page = await fixture()
  try {
    await toggle(page).focus(); await page.keyboard.press('Enter'); await waitState(page, 'operations')
    await page.keyboard.press('Space'); await waitState(page, 'input')
    await toggle(page).click(); await waitState(page, 'operations')
    await toggle(page).click(); await waitState(page, 'input')
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  } finally { await page.close() }
}, 15000)







it('leaves page wheel, arrow keys, and region clicks alone instead of navigating between regions', async () => {
  const page = await fixture()
  try {
    expect(await page.locator('.odyssey-operations-return-hit').count()).toBe(0)
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', 800)).toBe(false)
    expect(await dispatchKey(page, 'body', 'ArrowDown')).toBe(false)
    await region(page).dispatchEvent('click')
    expect(await state(page)).toBe('input')
    await toggle(page).click(); await waitState(page, 'operations')
    expect(await dispatchWheel(page, '.pI_x6G_centerCol', -800)).toBe(false)
    expect(await dispatchKey(page, 'body', 'ArrowUp')).toBe(false)
    await region(page).dispatchEvent('click')
    expect(await state(page)).toBe('operations')
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
    expect(await state(page)).toBe('input')
    await page.locator('textarea').focus()
    await page.locator('textarea').hover()
    await page.mouse.wheel(0, 140)
    await expect.poll(() => page.locator('textarea').evaluate(element => element.scrollTop)).toBeGreaterThan(0)
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
  const page = await fixture()
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    await page.evaluate(() => { window.homeOperations.oldToggle = document.querySelector('[data-odyssey-home-operations-toggle]'); window.homeOperations.dispose() })
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
      await page.clock.runFor((1 - elapsed) * 6000 + 350)
      expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe(nextCase)
    }
  } finally { await page.close() }
}, 20000)

it('fades old case content out before committing and fades new content in for manual and automatic changes', async () => {
  const page = await fixture({ reduced: false, clock: true })
  const title = () => page.locator('.odyssey-operations-title strong').textContent()
  const opacity = () => page.locator('.odyssey-operations-case-copy').evaluate(copy => Number(getComputedStyle(copy).opacity))
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    const oldTitle = await title()
    await page.locator('.odyssey-operations-pagination button').nth(1).evaluate(button => button.click())
    expect(await title()).toBe(oldTitle)
    await page.clock.runFor(55)
    expect(await title()).toBe(oldTitle)
    expect(await opacity()).toBeGreaterThan(0); expect(await opacity()).toBeLessThan(1)
    await page.clock.runFor(70)
    expect(await title()).not.toBe(oldTitle)
    expect(await opacity()).toBeGreaterThan(0); expect(await opacity()).toBeLessThan(1)
    await page.clock.runFor(200); expect(await opacity()).toBe(1)
    const beforeAutomatic = await title()
    const elapsed = await page.locator('.odyssey-operations-usecase').evaluate(card => parseFloat(getComputedStyle(card).getPropertyValue('--odyssey-operations-case-progress')))
    await page.clock.runFor((1 - elapsed) * 6000 + 55)
    expect(await title()).toBe(beforeAutomatic)
    expect(await opacity()).toBeGreaterThan(0); expect(await opacity()).toBeLessThan(1)
    await page.clock.runFor(80)
    expect(await title()).not.toBe(beforeAutomatic)
    expect(await opacity()).toBeGreaterThan(0); expect(await opacity()).toBeLessThan(1)
    await page.clock.runFor(220); expect(await opacity()).toBe(1)
  } finally { await page.close() }
}, 20000)

it('keeps only the latest rapid case request and removes unfinished fades on disposal', async () => {
  const page = await fixture({ reduced: false, clock: true })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await toggle(page).click(); await waitState(page, 'operations'); await page.mouse.move(1, 1)
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 100))
    await page.evaluate(() => {
      const card = document.querySelector('.odyssey-operations-usecase'); window.homeOperations.committedCases = []
      new MutationObserver(() => window.homeOperations.committedCases.push(card.dataset.case)).observe(card, { attributes: true, attributeFilter: ['data-case'] })
    })
    await page.locator('.odyssey-operations-pagination button').nth(1).evaluate(button => button.click()); await page.clock.runFor(40)
    await page.locator('.odyssey-operations-pagination button').nth(2).evaluate(button => button.click()); await page.clock.runFor(350)
    expect(await page.locator('.odyssey-operations-usecase').getAttribute('data-case')).toBe('2')
    expect(await page.evaluate(() => window.homeOperations.committedCases.includes('1'))).toBe(false)
    expect(await page.locator('.odyssey-operations-case-copy').evaluate(copy => Number(getComputedStyle(copy).opacity))).toBe(1)
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
    await page.clock.runFor(350)
    const resetProgress = await caseProgress()
    expect(resetProgress).toBeLessThan(.06)
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
      expect(fields.map(field => field.opacity)).toEqual(dark ? [.5, .5, .5] : [.5, .58, .58])
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

it('adds one reversible presentation-blue glass tint to all four quick cards without pointer glow, shadows, or lift', async () => {
  for (const dark of [false, true]) {
    const page = await fixture({ reduced: false, dark })
    try {
      await toggle(page).click()
      await waitState(page, 'operations')
      const tints = []
      const appearance = card => card.evaluate(element => { const style = getComputedStyle(element); return { background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, anchorShadow: getComputedStyle(element.closest('.odyssey-operations-tilt-anchor')).boxShadow } })
      for (const card of await page.locator('.odyssey-operations-usecase, .odyssey-operations-quick-card').all()) {
        await page.mouse.move(1, 1)
        const rest = await appearance(card), kind = await card.getAttribute('data-card')
        await card.hover({ position: { x: 30, y: 30 } })
        await page.waitForTimeout(320)
        const hover = await card.evaluate(element => {
          const style = getComputedStyle(element), matrix = new DOMMatrixReadOnly(style.transform)
          return { background: style.backgroundColor, image: style.backgroundImage, shadow: style.boxShadow, anchorShadow: getComputedStyle(element.closest('.odyssey-operations-tilt-anchor')).boxShadow, verticalLift: matrix.m42, lights: [...element.querySelectorAll('.odyssey-operations-pointer-light')].map(light => { const style = getComputedStyle(light); return style.display === 'none' ? 0 : Number(style.opacity) }) }
        })
        expect(hover.lights.every(opacity => opacity === 0)).toBe(true)
        if (kind) {
          expect(`${hover.background}|${hover.image}`).not.toBe(`${rest.background}|${rest.image}`)
          tints.push(`${hover.background}|${hover.image}`)
          const [red, green, blue, alpha = 1] = hover.background.match(/[\d.]+/g).map(Number)
          expect(alpha).toBeGreaterThan(0)
          const restChannels = rest.background.match(/[\d.]+/g).map(Number)
          expect(alpha).toBeGreaterThanOrEqual((restChannels[3] ?? 1) - .001)
          expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThan(90)
          expect([red, green, blue]).toEqual(dark ? [25, 36, 64] : [221, 230, 249])
        } else {
          expect(hover.background).toBe(rest.background)
          expect(hover.image).toBe(rest.image)
        }
        expect(hover.shadow).toBe(rest.shadow)
        expect(hover.anchorShadow).toBe(rest.anchorShadow)
        expect(Math.abs(hover.verticalLift)).toBeLessThan(.1)
        await page.mouse.move(1, 1)
        await expect.poll(() => appearance(card)).toEqual(rest)
      }
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
          return { foreground: getComputedStyle(description).color.match(/[\d.]+/g).map(Number), description: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }, cards: [...document.querySelectorAll('.odyssey-operations-usecase, .odyssey-operations-quick-card')].map(card => { const bounds = card.getBoundingClientRect(); return { x: bounds.x, y: bounds.y, width: bounds.width } }) }
        })
        await page.locator('.odyssey-operations-description').evaluate(description => description.style.visibility = 'hidden')
        const png = PNG.sync.read(await page.screenshot())
        await page.locator('.odyssey-operations-description').evaluate(description => description.style.removeProperty('visibility'))
        const cards = geometry.cards.map(card => patchRgb(png, card.x + card.width * .65, card.y + 6))
        const edgeSeparation = geometry.cards.map(card => {
          const outside = patchRgb(png, card.x + card.width * .65, card.y - 5)
          // A one-pixel outline must remain distinguishable at fractional layout coordinates.
          return Math.max(...[-2, -1, 0, 1, 2].map(dy => patchRgb(png, card.x + card.width * .65, card.y + dy, 0).reduce((sum, value, channel) => sum + Math.abs(value - outside[channel]), 0) / 3))
        })
        const ratios = []
        for (const x of [.1, .5, .9]) for (const y of [.2, .5, .8]) ratios.push(contrastRatio(geometry.foreground.slice(0, 3), patchRgb(png, geometry.description.x + geometry.description.width * x, geometry.description.y + geometry.description.height * y)))
        observations.push({ dark, name, cards, edgeSeparation, minimumDescriptionContrast: Math.min(...ratios) })
      }
    } finally { await page.close() }
  }
  await writeFile(`${evidence}/material-readability.json`, JSON.stringify(observations, null, 2))
  for (const dark of [false, true]) {
    const modes = observations.filter(observation => observation.dark === dark)
    for (let card = 0; card < 5; card++) for (let channel = 0; channel < 3; channel++) {
      const values = modes.map(observation => observation.cards[card][channel])
      expect(Math.max(...values) - Math.min(...values), `${dark ? 'dark' : 'light'} card ${card} suppresses background variation`).toBeLessThan(40)
    }
  }
  for (const observation of observations) {
    expect(observation.minimumDescriptionContrast, `${observation.dark ? 'dark' : 'light'} ${observation.name} description contrast`).toBeGreaterThanOrEqual(4.5)
    expect(Math.min(...observation.edgeSeparation), `${observation.dark ? 'dark' : 'light'} ${observation.name} card edge separation`).toBeGreaterThan(4)
  }
}, 20000)

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
      const bounds = await card.boundingBox(), point = { x: bounds.x + bounds.width * .16, y: bounds.y + bounds.height * .16 }
      await page.mouse.move(point.x, point.y)
      await page.waitForTimeout(420)
      const samples = []
      for (let index = 0; index < 12; index++) {
        await card.dispatchEvent('pointermove', { clientX: point.x, clientY: point.y, pointerType: 'mouse', bubbles: true })
        await page.waitForTimeout(18)
        samples.push(await card.evaluate(element => {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform)
          return { rx: parseFloat(element.style.getPropertyValue('--rx')) || 0, ry: parseFloat(element.style.getPropertyValue('--ry')) || 0, tilt: Math.abs(matrix.m13) + Math.abs(matrix.m23) }
        }))
      }
      expect(samples.at(-1).tilt).toBeGreaterThan(.001)
      for (const name of ['rx', 'ry']) {
        const values = samples.map(sample => sample[name])
        expect(Math.abs(values.at(-1))).toBeGreaterThan(1.7)
        expect(Math.max(...values.map(Math.abs))).toBeLessThanOrEqual(3.1)
        expect(Math.max(...values) - Math.min(...values)).toBeLessThan(.03)
      }
    }
  } finally { await page.close() }
}, 20000)

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
        return { transform: style.transform, transition: style.transitionDuration, ambient: [...element.querySelectorAll('.odyssey-operations-glow')].map(glow => getComputedStyle(glow).animationName) }
      })
      expect(motion.transform).toBe('none')
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
            return { clipped: ['hidden', 'clip'].includes(style.overflow), radius: parseFloat(style.borderTopLeftRadius), fieldClipped: ['hidden', 'clip'].includes(field.overflow), fieldRadius: parseFloat(field.borderTopLeftRadius), margins: [...card.querySelectorAll('.odyssey-operations-glow')].map(glow => {
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
    await toggle(page).hover()
    for (const delay of [30, 80, 180]) { await page.waitForTimeout(delay); positions.push((await toggle(page).boundingBox()).y) }
    await toggle(page).click()
    for (const delay of [0, 30, 80, 180, 360]) { await page.waitForTimeout(delay); positions.push((await toggle(page).boundingBox()).y) }
    await waitState(page, 'operations')
    const dock = await page.locator('[data-odyssey-theme-dock]').boundingBox(), expanded = await toggle(page).boundingBox()
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(dock.y - 10)
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
    expect(arrowBounds.y + arrowBounds.height).toBeLessThanOrEqual(dockBounds.y - 10)
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
