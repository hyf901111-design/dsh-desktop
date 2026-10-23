import { readFileSync, readdirSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
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

async function fixture({ dark = false, reduced = true, width = 1380, height = 900, route = 'home', surface = '', child = false, themes = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
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
const waitState = (page, value) => expect.poll(() => state(page)).toBe(value)
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

it('snaps in both directions with the arrow, exposed composer area, and non-editing arrow keys', async () => {
  const page = await fixture()
  try {
    await toggle(page).click()
    await waitState(page, 'operations')
    await page.locator('.odyssey-operations-return-hit').click()
    await waitState(page, 'input')
    await page.locator('textarea').blur()
    await page.keyboard.press('ArrowDown')
    await waitState(page, 'operations')
    await page.keyboard.press('ArrowUp')
    await waitState(page, 'input')
    expect(await page.evaluate(() => document.querySelector('textarea') === window.homeOperations.original)).toBe(true)
    expect(await page.locator('textarea').inputValue()).toBe('保留原生输入草稿\n第二行 🔎')
  } finally { await page.close() }
}, 15000)

it('groups one wheel gesture into one snap and allows a later reverse gesture', async () => {
  const page = await fixture()
  try {
    await page.locator('textarea').blur()
    for (let index = 0; index < 8; index++) await dispatchWheel(page, '.pI_x6G_centerCol', 48)
    await waitState(page, 'operations')
    for (let index = 0; index < 8; index++) await dispatchWheel(page, '.pI_x6G_centerCol', 48)
    expect(await state(page)).toBe('operations')
    await page.waitForTimeout(850)
    await dispatchWheel(page, '.pI_x6G_centerCol', -80)
    await waitState(page, 'input')
  } finally { await page.close() }
}, 15000)

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

it('colors only the hovered card and applies restrained perspective without shifting its neighbors', async () => {
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
    const rotation = await cards.first().evaluate(card => ['--rx', '--ry'].map(name => Math.abs(parseFloat(card.style.getPropertyValue(name)))))
    for (const angle of rotation) { expect(angle).toBeGreaterThan(1.8); expect(angle).toBeLessThanOrEqual(3) }
    await page.mouse.move(1, 1)
    await expect.poll(async () => (await appearance()).every(card => card.normal === 1 && card.colored === 0)).toBe(true)
  } finally { await page.close() }
}, 15000)

it('keeps small-pane text readable and scrolls to the lower quick cards before returning to input', async () => {
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
    await page.mouse.wheel(0, -120)
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
      return { overflow: host.scrollWidth > host.clientWidth || section.scrollWidth > section.clientWidth, stacked: host.dataset.odysseyHomeOperationsLayout === 'stacked', cards: [...host.querySelectorAll('.odyssey-operations-quick-card')].map(card => {
        const rect = card.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
        return { width: rect.width, height: rect.height, inside: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1, hit: card === hit || card.contains(hit) }
      }) }
    })
    expect(layout.overflow).toBe(false)
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
