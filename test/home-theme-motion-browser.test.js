import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PNG } from 'pngjs'

let browser, script, css
const evidence = '/tmp/ework-home-theme-motion-20261019'
beforeAll(async () => {
  const native = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const base = [...native.matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(match => JSON.parse(match[1])).join('\n')
  const composer = [...native.matchAll(/tag\.textContent (?:\+?=) ("(?:[^"\\]|\\.)*")/g)].map(match => JSON.parse(match[1])).filter(value => value.includes('[data-center-composer-host]')).join('\n')
  const palette = await readFile('node_modules/@deepseek-ai/dsh-client-ui-theme/lib/styles/design-platform.css', 'utf8')
  css = palette + '\n' + base + '\n' + composer
  const require = createRequire(import.meta.url)
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import {mountHomeThemes} from './src/preload/home-themes';
      import {mountDesktopShellStyles} from './src/preload/shell-style';
      const records=[];const animate=HTMLElement.prototype.animate;
      HTMLElement.prototype.animate=function(frames,options){const result=animate.call(this,frames,options);records.push({element:this,animation:result,frames,options});return result};
      const colors=[],blendColor=WebGL2RenderingContext.prototype.blendColor;
      WebGL2RenderingContext.prototype.blendColor=function(r,g,b,a){if(this.canvas.hasAttribute('data-home-theme-canvas'))colors.push({time:performance.now(),alpha:a});return blendColor.call(this,r,g,b,a)};
      const draw=WebGL2RenderingContext.prototype.drawArrays;
      WebGL2RenderingContext.prototype.drawArrays=function(...args){const result=draw.apply(this,args),capture=window.themeMotion?.captureAppearance;if(capture&&this.canvas.hasAttribute('data-home-theme-canvas')&&!this.getParameter(this.FRAMEBUFFER_BINDING)){const blend=this.isEnabled(this.BLEND),alpha=this.getParameter(this.BLEND_COLOR)[3],key=blend?(alpha>.98?'light':'middle'):'dark';if(!capture[key]){const still=document.createElement('canvas');still.width=360;still.height=280;still.getContext('2d').drawImage(this.canvas,0,0,360,280);capture[key]=still.toDataURL()}}return result};
      window.themeMotion={records,colors,captureAppearance:null,mount(){mountDesktopShellStyles(document);this.dispose=mountHomeThemes(document)},surface(value){if(value)document.body.dataset.workspaceSurface=value;else delete document.body.dataset.workspaceSurface;document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))},next(){document.querySelector('[data-home-theme-position="next"]').click()},current(){return document.querySelector('[aria-pressed="true"][data-home-theme-id]').dataset.homeThemeId}};
    ` }, bundle: true, format: 'iife', platform: 'browser', write: false,
    plugins: [{ name: 'inline-theme-images', setup(builder) {
      builder.onResolve({ filter: /\.(?:png|jpg)\?inline$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -7)), namespace: 'theme-inline' }))
      builder.onLoad({ filter: /.*/, namespace: 'theme-inline' }, async args => ({ contents: 'export default ' + JSON.stringify('data:image/' + (args.path.endsWith('.jpg') ? 'jpeg' : 'png') + ';base64,' + (await readFile(args.path)).toString('base64')), loader: 'js' }))
      builder.onResolve({ filter: /\.css\?raw$/ }, args => ({ path: args.path.startsWith('.') ? resolve(args.resolveDir, args.path.slice(0, -4)) : require.resolve(args.path.slice(0, -4)), namespace: 'raw-css' }))
      builder.onLoad({ filter: /.*/, namespace: 'raw-css' }, async args => ({ contents: 'export default ' + JSON.stringify(await readFile(args.path, 'utf8')), loader: 'js' }))
    } }]
  })
  script = output.outputFiles[0].text
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell', args: ['--enable-unsafe-swiftshader'] })
  await mkdir(evidence, { recursive: true })
}, 30000)
afterAll(async () => browser?.close())

async function fixture({ dark = false, reduced = false, theme = 'default', width = 900, height = 700, clock = false } = {}) {
  const page = await browser.newPage({ viewport: { width: Math.max(1000, width + 100), height: Math.max(800, height + 60) }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
  if (clock) {
    const time = new Date('2026-10-19T00:00:00Z')
    await page.clock.install({ time }); await page.clock.pauseAt(time)
  }
  await page.route('**/*', route => route.abort())
  await page.route('http://odyssey.test/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><style>${css}</style><style>
    html,body{margin:0;height:100%;font-family:system-ui}body{background:#c8cdcf}body[data-ds-dark-theme]{background:#242729}
    .pI_x6G_centerCol{position:absolute;left:40px;top:20px;width:${width}px;height:${height}px;margin:0;isolation:isolate;overflow:hidden}
    .wSkVaW_header{height:44px;min-height:44px;flex:0 0 44px;display:flex;align-items:center;gap:20px;padding:0 20px}
    .wSkVaW_composerHero{display:flex;flex-direction:column}.uV2eYG_grow{min-height:78px}button{font:inherit}
    .wSkVaW_root>.wSkVaW_scrollBody{pointer-events:none}.uV2eYG_input{color:var(--odyssey-text)}
    [data-settings]{position:fixed;inset:0;background:#eee;z-index:99}
  </style><body ${dark ? 'data-ds-dark-theme' : ''}><div id="root"><div data-dsh-frame><main data-pane="conversation" class="pI_x6G_centerCol" style="position:absolute;left:40px;top:20px;width:${width}px;height:${height}px;margin:0;isolation:isolate;overflow:hidden">
    <section class="wSkVaW_root" data-phase="hero" data-odyssey-page="home">
      <header class="wSkVaW_header"><span>新对话</span><button>对话</button><button>研究</button><button>笔记</button></header>
      <div class="wSkVaW_scrollBody"></div><div data-center-composer-host><div data-composer-portal-host><div class="wSkVaW_composerStack wSkVaW_composerSeat wSkVaW_composerHero">
        <div class="pXSMma_root"><div class="pXSMma_stack"><div class="pXSMma_headline">你想做什么？</div></div></div>
        <div class="wSkVaW_heroWorkspaceRow"><button class="pXSMma_workspace" aria-label="选择工作区" aria-haspopup="menu" aria-expanded="false"><svg class="pXSMma_folder" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h4l1.5 2H14l-2 7H2V4Z" stroke="currentColor" stroke-linejoin="round"/></svg><span class="pXSMma_workspaceLabel">test06</span><svg class="pXSMma_chevron" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="m4 5.5 3 3 3-3" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg></button><button class="cubgiG_seat">标准模式</button></div>
        <div class="uV2eYG_root uV2eYG_hero"><div class="uV2eYG_card"><div class="uV2eYG_scroll"><div class="uV2eYG_grow"><textarea class="uV2eYG_input" aria-label="发送消息" placeholder="向智能体发送消息"></textarea><div class="uV2eYG_mirror"></div></div></div><div class="uV2eYG_row"><div class="uV2eYG_tools"><button class="uV2eYG_add">+</button><button>工具</button></div><button class="uV2eYG_primary" aria-label="发送">↑</button></div></div></div>
      </div></div></div>
    </section></main></div></div></body>` }))
  await page.goto('http://odyssey.test/')
  await page.evaluate(theme => localStorage.setItem('ework.home-background.v1', theme), theme)
  await page.addScriptTag({ content: script })
  await page.evaluate(() => window.themeMotion.mount())
  return page
}
const current = page => page.locator('[data-odyssey-theme-dock] [aria-pressed="true"]')
const dock = page => page.locator('[data-odyssey-theme-dock]')
const pauseEntry = (page, time) => page.evaluate(time => {
  for (const record of window.themeMotion.records.filter(record => record.element.classList.contains('odyssey-theme-card-body'))) {
    record.animation.pause(); record.animation.currentTime = time
  }
  return [...document.querySelectorAll('[data-home-theme-position]')].filter(button => button.dataset.homeThemePosition !== 'outside').map(button => ({ position: button.dataset.homeThemePosition, opacity: Number(getComputedStyle(button.firstElementChild).opacity), transform: getComputedStyle(button.firstElementChild).transform }))
}, time)
const summary = buffer => {
  const { data, width, height } = PNG.sync.read(buffer)
  let mean = 0, white = 0
  for (let i = 0; i < data.length; i += 4) { mean += .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]; if (data[i] > 245 && data[i + 1] > 245 && data[i + 2] > 245) white++ }
  return { mean: mean / (width * height), white: white / (width * height) }
}

describe('real homepage theme motion and interaction', () => {
  it.each([false, true])('keeps Koi Pond behind the usable composer and pauses away from home (reduced: %s)', async reduced => {
    const page = await fixture({ theme: 'koi-pond', dark: true, reduced })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const canvas = page.locator('canvas[data-home-theme-canvas="koi-pond"]')
      await expect.poll(() => canvas.getAttribute('data-home-koi-state')).toBe('ready')
      await page.locator('textarea').fill('检查锦鲤主题下的输入与切换')
      expect(await page.locator('textarea').inputValue()).toBe('检查锦鲤主题下的输入与切换')
      expect(await current(page).getAttribute('aria-label')).toBe('当前背景：锦鲤水面')
      await page.screenshot({ path: `${evidence}/koi-home-dark-${reduced}.png` })
      await page.evaluate(() => { window.koiSurface = document.querySelector('canvas[data-home-theme-canvas="koi-pond"]'); document.body.removeAttribute('data-ds-dark-theme') })
      await expect.poll(() => page.evaluate(() => window.koiSurface === document.querySelector('canvas[data-home-theme-canvas="koi-pond"]'))).toBe(true)
      await page.screenshot({ path: `${evidence}/koi-home-light-${reduced}.png` })
      await page.evaluate(() => window.themeMotion.surface('settings'))
      await expect.poll(() => page.locator('[data-odyssey-home-theme-background]').getAttribute('data-render-state')).toBe('paused')
      await page.evaluate(() => window.themeMotion.surface())
      await expect.poll(() => page.locator('[data-odyssey-home-theme-background]').getAttribute('data-render-state')).toBe(reduced ? 'paused' : 'running')
      await current(page).press('ArrowRight')
      expect(await current(page).getAttribute('data-home-theme-id')).toBe('default')
      expect(await page.evaluate(() => window.koiSurface.dataset.homeKoiState)).toBe('disposed')
      await current(page).press('ArrowLeft')
      await expect.poll(() => canvas.getAttribute('data-home-koi-state')).toBe('ready')
      expect(await page.evaluate(() => localStorage.getItem('ework.home-background.v1'))).toBe('koi-pond')
      expect(errors).toEqual([])
    } finally { await page.close() }
  }, 20000)

  it.each([[900, 700, false, false], [280, 400, true, false], [680, 500, true, true]])('auto-hides to one third and rebounds on hover at %ix%i (dark: %s, reduced: %s)', async (width, height, dark, reduced) => {
    const page = await fixture({ width, height, dark, reduced, clock: true })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const bounds = () => page.evaluate(() => {
      const pane = document.querySelector('.pI_x6G_centerCol').getBoundingClientRect()
      const card = document.querySelector('[data-home-theme-position="current"]').getBoundingClientRect()
      return { pane: pane.toJSON(), card: card.toJSON(), visible: (pane.bottom - card.top) / card.height }
    })
    try {
      await page.clock.runFor(2999)
      const expanded = await bounds()
      expect(expanded.card.bottom).toBeLessThan(expanded.pane.bottom)
      await page.screenshot({ path: `${evidence}/dock-${width}-expanded.png` })
      await page.clock.runFor(601)
      // The clock controls the idle timer; CSS transitions use compositor time.
      await expect.poll(async () => (await bounds()).visible).toBeCloseTo(1 / 3, 2)
      const collapsed = await bounds()
      expect(collapsed.visible).toBeCloseTo(1 / 3, 2)
      await page.screenshot({ path: `${evidence}/dock-${width}-collapsed.png` })
      // Keep the pointer at the exposed bottom edge while the cards move up.
      // The hover area must continue down to that edge to avoid bouncing shut.
      await page.mouse.move(collapsed.card.x + collapsed.card.width / 2, collapsed.pane.bottom - 3)
      await page.clock.runFor(600)
      await expect.poll(async () => (await bounds()).card.top).toBeCloseTo(expanded.card.top, 1)
      await page.clock.runFor(4000)
      expect((await bounds()).card.top).toBeCloseTo(expanded.card.top, 1)
      await page.screenshot({ path: `${evidence}/dock-${width}-hover.png` })
      await page.locator('[data-home-theme-position="next"]').click()
      expect(await current(page).getAttribute('data-home-theme-id')).toBe('berber')
      await page.mouse.move(5, 5)
      await page.clock.runFor(3600)
      await expect.poll(async () => (await bounds()).visible).toBeCloseTo(1 / 3, 2)
      // Pointer focus stays on the current card; starting keyboard interaction
      // must reveal it even though no new focusin event is dispatched.
      await page.keyboard.press('Space')
      await page.clock.runFor(4600)
      await expect.poll(async () => (await bounds()).card.top).toBeCloseTo(expanded.card.top, 1)
      await current(page).press('ArrowRight')
      expect(await current(page).getAttribute('data-home-theme-id')).toBe('vghodki')
      await page.locator('textarea').focus()
      await page.clock.runFor(3600)
      await expect.poll(async () => (await bounds()).visible).toBeCloseTo(1 / 3, 2)
      const entry = Number(await dock(page).getAttribute('data-entry-generation'))
      await page.evaluate(() => window.themeMotion.surface('notes'))
      await page.clock.runFor(4000)
      expect(await dock(page).isVisible()).toBe(false)
      await page.evaluate(() => window.themeMotion.surface())
      await page.clock.runFor(2999)
      expect(Number(await dock(page).getAttribute('data-entry-generation'))).toBe(entry + 1)
      await expect.poll(async () => (await bounds()).card.top).toBeCloseTo(expanded.card.top, 1)
      await page.clock.runFor(601)
      await expect.poll(async () => (await bounds()).visible).toBeCloseTo(1 / 3, 2)
      expect(errors).toEqual([])
    } finally { await page.close() }
  }, 30000)

  for (const theme of ['default', 'jarrick']) for (const dark of [false, true]) it(`matches the workspace chevron to its label and folder in ${theme} ${dark ? 'dark' : 'light'}`, async () => {
    const page = await fixture({ theme, dark, reduced: true })
    try {
      const appearance = await page.locator('.pXSMma_workspace').evaluate(button => {
        const arrow = button.querySelector('.pXSMma_chevron'), bounds = arrow.getBoundingClientRect()
        return {
          arrow: getComputedStyle(arrow).color,
          label: getComputedStyle(button.querySelector('.pXSMma_workspaceLabel')).color,
          folder: getComputedStyle(button.querySelector('.pXSMma_folder')).color,
          width: bounds.width, height: bounds.height,
        }
      })
      expect(appearance.arrow).toBe(appearance.label)
      expect(appearance.arrow).toBe(appearance.folder)
      expect(appearance.width).toBe(12)
      expect(appearance.height).toBe(12)
    } finally { await page.close() }
  })

  it('stagger-pops three cards, re-enters from notes/settings, and leaves ordinary DOM edits alone', async () => {
    const page = await fixture()
    try {
      const timings = await page.evaluate(() => window.themeMotion.records.filter(record => record.element.classList.contains('odyssey-theme-card-body')).map(record => ({ position: record.element.closest('button').dataset.homeThemePosition, ...record.animation.effect.getTiming() })))
      expect(timings).toHaveLength(3)
      expect(timings.find(timing => timing.position === 'previous').delay).toBe(35)
      expect(timings.find(timing => timing.position === 'current').delay).toBe(100)
      expect(timings.find(timing => timing.position === 'next').delay).toBe(175)
      expect(timings.every(timing => timing.duration === 570)).toBe(true)
      let sample = await pauseEntry(page, 80)
      expect(sample.find(item => item.position === 'previous').opacity).toBeGreaterThan(0)
      expect(sample.find(item => item.position === 'current').opacity).toBe(0)
      expect(sample.find(item => item.position === 'next').opacity).toBe(0)
      await page.screenshot({ path: `${evidence}/entry-080.png` })
      sample = await pauseEntry(page, 140)
      expect(sample.find(item => item.position === 'current').opacity).toBeGreaterThan(0)
      expect(sample.find(item => item.position === 'next').opacity).toBe(0)
      await page.screenshot({ path: `${evidence}/entry-140.png` })
      await pauseEntry(page, 745)
      await page.screenshot({ path: `${evidence}/entry-rest.png` })
      const first = Number(await dock(page).getAttribute('data-entry-generation'))
      await page.locator('textarea').fill('合成输入，不应重播背景卡片')
      await page.evaluate(() => { const status = document.createElement('span'); status.textContent = '普通 DOM 更新'; document.querySelector('.wSkVaW_scrollBody').append(status) })
      await page.waitForTimeout(40)
      expect(Number(await dock(page).getAttribute('data-entry-generation'))).toBe(first)
      await page.evaluate(() => window.themeMotion.surface('notes'))
      expect(await dock(page).isVisible()).toBe(false)
      await page.evaluate(() => window.themeMotion.surface())
      await expect.poll(async () => Number(await dock(page).getAttribute('data-entry-generation'))).toBe(first + 1)
      await page.evaluate(() => { const settings = document.createElement('div'); settings.dataset.sherlockSettingsPanel = ''; settings.dataset.settings = ''; document.body.append(settings) })
      await expect.poll(() => dock(page).isVisible()).toBe(false)
      await page.locator('[data-sherlock-settings-panel]').evaluate(node => node.remove())
      await expect.poll(async () => Number(await dock(page).getAttribute('data-entry-generation'))).toBe(first + 2)
      expect(await page.locator('textarea').inputValue()).toBe('合成输入，不应重播背景卡片')
      await writeFile(`${evidence}/entry-timings.json`, JSON.stringify(timings, null, 2))
    } finally { await page.close() }
  }, 30000)

  it('cycles every theme, keeps rapid-switch visual and aria state aligned, and freezes the displayed blend', async () => {
    const page = await fixture({ dark: true , width: 520, height: 440 }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      await pauseEntry(page, 745)
      const ids = []
      for (let i = 0; i < 14; i++) {
        await page.locator('[data-home-theme-position="next"]').click()
        await expect.poll(() => page.locator('[data-theme-freeze]').count()).toBe(0)
        const id = await current(page).getAttribute('data-home-theme-id'); ids.push(id)
        expect(await page.locator('[data-home-theme-canvas]').getAttribute('data-home-theme-canvas')).toBe(id)
        expect(await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-home-theme-id')).toBe(id)
      }
      expect(ids).toEqual(['berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'haseeb', 'kirian', 'splines', 'antiquue', 'crt-warp', 'dither', 'default'])
      const rapid = await page.evaluate(() => {
        for (let i = 0; i < 16; i++) window.themeMotion.next()
        const freeze = document.querySelector('[data-theme-freeze]'), bytes = freeze.getContext('2d').getImageData(0, 0, freeze.width, freeze.height).data
        let transparent = 0, chroma = 0
        for (let i = 0; i < bytes.length; i += 4) { if (bytes[i + 3] < 255) transparent++; chroma += Math.max(bytes[i], bytes[i + 1], bytes[i + 2]) - Math.min(bytes[i], bytes[i + 1], bytes[i + 2]) }
        return { current: window.themeMotion.current(), freeze: [freeze.width, freeze.height], transparent: transparent / (bytes.length / 4), chroma: chroma / (bytes.length / 4), canvases: document.querySelectorAll('[data-home-theme-canvas]').length }
      })
      expect(rapid.current).toBe('vghodki'); expect(rapid.canvases).toBe(1)
      expect(rapid.transparent).toBe(0)
      // All sixteen clicks happen before any new GL frame gains opacity. The
      // frozen composite must therefore still show the original grayscale.
      expect(rapid.chroma).toBeLessThan(.1)
      await page.evaluate(() => {
        const animation = document.querySelector('[data-home-theme-canvas]').getAnimations()[0]
        if (animation) { animation.pause(); animation.currentTime = 0 }
      })
      await page.screenshot({ path: `${evidence}/rapid-first-frame-dark.png` })
      await expect.poll(() => page.locator('[data-theme-freeze]').count()).toBe(0)
      expect(await current(page).getAttribute('data-home-theme-id')).toBe('vghodki')
      expect(await page.locator('[data-home-theme-canvas]').getAttribute('data-home-theme-canvas')).toBe('vghodki')
      await page.screenshot({ path: `${evidence}/rapid-final-dark.png` })
      expect(errors).toEqual([])
      await writeFile(`${evidence}/rapid-state.json`, JSON.stringify(rapid, null, 2))
    } finally { await page.close() }
  }, 60000)

  it('crossfades dark themes without a white flash, and eases dark-to-light through actual intermediate colors', async () => {
    const page = await fixture({ dark: true, theme: 'berber' })
    const clip = { x: 60, y: 70, width: 190, height: 140 }
    try {
      await pauseEntry(page, 745)
      const before = summary(await page.screenshot({ clip }))
      await page.evaluate(() => window.themeMotion.next())
      const blend = await page.evaluate(() => {
        const animation = document.querySelector('[data-home-theme-canvas]').getAnimations()[0]
        animation.pause(); animation.currentTime = 140
        return Number(getComputedStyle(animation.effect.target).opacity)
      })
      expect(blend).toBeGreaterThan(0); expect(blend).toBeLessThan(1)
      const fading = summary(await page.screenshot({ path: `${evidence}/crossfade-dark.png`, clip }))
      expect(fading.white).toBe(0)
      expect(fading.mean).toBeLessThan(190)
      await expect.poll(() => page.locator('[data-theme-freeze]').count()).toBe(0)
      const dark = summary(await page.screenshot({ clip }))
      await page.evaluate(() => { window.themeMotion.colors.length = 0; window.themeMotion.captureAppearance = {}; document.body.removeAttribute('data-ds-dark-theme') })
      await page.waitForTimeout(90)
      const middle = summary(await page.screenshot({ path: `${evidence}/appearance-middle.png`, clip }))
      await page.waitForTimeout(1000)
      const light = summary(await page.screenshot({ path: `${evidence}/appearance-light.png`, clip }))
      const colors = await page.evaluate(() => window.themeMotion.colors)
      const capture = await page.evaluate(() => window.themeMotion.captureAppearance)
      expect(colors.length).toBeGreaterThanOrEqual(3)
      expect(colors[0].alpha).toBeGreaterThan(0)
      expect(colors[0].alpha).toBeLessThan(.8)
      expect(colors.at(-1).alpha).toBeGreaterThan(colors[0].alpha)
      const actual = {}
      for (const key of ['dark', 'middle', 'light']) {
        expect(capture[key]).toContain('data:image/png;base64,')
        const image = Buffer.from(capture[key].split(',')[1], 'base64')
        actual[key] = summary(image)
        await writeFile(`${evidence}/actual-appearance-${key}.png`, image)
      }
      expect(actual.middle.mean).toBeGreaterThan(actual.dark.mean + 10)
      expect(actual.light.mean).toBeGreaterThan(actual.middle.mean + 5)
      expect(light.mean).toBeGreaterThan(dark.mean + 50)
      await page.screenshot({ path: `${evidence}/homepage-light.png` })
      await writeFile(`${evidence}/crossfade-colors.json`, JSON.stringify({ before, fading, dark, middle, light, actual, colors }, null, 2))
    } finally { await page.close() }
  }, 30000)

  it('keeps reduced-motion still, interactive and free from entry or crossfade animations', async () => {
    const page = await fixture({ reduced: true, dark: true })
    try {
      expect(await page.evaluate(() => window.themeMotion.records.length)).toBe(0)
      expect(await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-render-state')).toBe('paused')
      await page.locator('[data-home-theme-position="next"]').click()
      expect(await current(page).getAttribute('data-home-theme-id')).toBe('berber')
      expect(await page.locator('[data-theme-freeze]').count()).toBe(0)
      expect(await page.evaluate(() => window.themeMotion.records.length)).toBe(0)
      expect(await current(page).evaluate(button => getComputedStyle(button).transitionDuration)).toBe('0s')
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
      await page.waitForTimeout(30)
      expect(await page.evaluate(() => window.themeMotion.records.length)).toBe(0)
    } finally { await page.close() }
  }, 30000)

  it('refreshes theme thumbnails after appearance changes while the home is hidden by notes or settings', async () => {
    const page = await fixture({ reduced: true, theme: 'berber' })
    try {
      const light = await current(page).evaluate(button => button.style.getPropertyValue('--theme-thumbnail'))
      await page.evaluate(() => { window.themeMotion.surface('notes'); document.body.setAttribute('data-ds-dark-theme', '') })
      await expect.poll(() => dock(page).isVisible()).toBe(false)
      await page.evaluate(() => window.themeMotion.surface())
      await expect.poll(() => current(page).evaluate(button => button.style.getPropertyValue('--theme-thumbnail'))).not.toBe(light)
      const dark = await current(page).evaluate(button => button.style.getPropertyValue('--theme-thumbnail'))
      expect(dark).toContain('data:image/png;base64,')
      await page.evaluate(() => { const settings = document.createElement('div'); settings.dataset.sherlockSettingsPanel = ''; document.body.append(settings) })
      await expect.poll(() => dock(page).isVisible()).toBe(false)
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
      await page.locator('[data-sherlock-settings-panel]').evaluate(node => node.remove())
      await expect.poll(() => current(page).evaluate(button => button.style.getPropertyValue('--theme-thumbnail'))).toBe(light)
      expect(await current(page).getAttribute('data-home-theme-id')).toBe('berber')
    } finally { await page.close() }
  }, 30000)

  it.each([[900, 700], [280, 400]])('centers every glass backing on its thumbnail at %ix%i', async (width, height) => {
    const page = await fixture({ reduced: true, width, height })
    try {
      // Native styles may contribute line boxes and button sizing; compare the
      // actually painted child bounds, including both neighboring cards.
      const bounds = await page.evaluate(() => [...document.querySelectorAll('[data-odyssey-theme-dock] [aria-hidden="false"]')].map(button => {
        const glass = button.querySelector('.odyssey-theme-glass').getBoundingClientRect()
        const preview = button.querySelector('.odyssey-theme-preview').getBoundingClientRect()
        return { top: preview.top - glass.top, bottom: glass.bottom - preview.bottom, left: preview.left - glass.left, right: glass.right - preview.right }
      }))
      for (const b of bounds) {
        expect(b.top).toBeGreaterThan(0)
        expect(Math.abs(b.top - b.bottom)).toBeLessThan(.1)
        expect(Math.abs(b.left - b.right)).toBeLessThan(.1)
      }
    } finally { await page.close() }
  })

  it.each([[900, 700], [1560, 900], [560, 700]])('centers the current card and both neighbors on the %ix%i background', async (width, height) => {
    const page = await fixture({ reduced: true, width, height })
    try {
      for (let i = 0; i < 14; i++) {
        const bounds = await page.evaluate(() => {
          const bg = document.querySelector('[data-odyssey-home-theme-background]').getBoundingClientRect()
          const cards = [...document.querySelectorAll('[data-odyssey-theme-dock] [aria-hidden="false"]')].map(button => ({position:button.dataset.homeThemePosition,rect:button.getBoundingClientRect().toJSON()}))
          const center = rect => rect.x + rect.width / 2
          const byPosition = value => cards.find(card => card.position === value).rect
          return { background:center(bg), current:center(byPosition('current')), neighbors:(center(byPosition('previous'))+center(byPosition('next')))/2 }
        })
        expect(Math.abs(bounds.background - bounds.current)).toBeLessThan(.6)
        expect(Math.abs(bounds.background - bounds.neighbors)).toBeLessThan(.6)
        await page.locator('[data-home-theme-position="next"]').click()
      }
    } finally { await page.close() }
  }, 30000)

  it.each([[180, 700], [280, 700], [320, 400], [380, 360]])('keeps all three cards inside a %ix%i pane and below the native composer', async (width, height) => {
    const page = await fixture({ reduced: true, width, height })
    try {
      const measurements = []
      for (const dark of [false, true]) {
        await page.evaluate(dark => document.body.toggleAttribute('data-ds-dark-theme', dark), dark)
        await page.waitForTimeout(30)
        const bounds = await page.evaluate(() => {
          const pane = document.querySelector('.pI_x6G_centerCol').getBoundingClientRect(), composer = document.querySelector('.uV2eYG_card').getBoundingClientRect()
          const cards = [...document.querySelectorAll('[data-odyssey-theme-dock] [aria-hidden="false"]')].map(button => { const rect = button.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, hit: button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) } })
          const rect = document.querySelector('textarea').getBoundingClientRect()
          return { pane: pane.toJSON(), composer: composer.toJSON(), cards, inputHit: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.tagName, typedDivision: CSS.supports('transform', 'scale(clamp(.25, calc((100cqw - 24px) / 292px), 1))'), stripScale: new DOMMatrix(getComputedStyle(document.querySelector('.odyssey-theme-strip')).transform).a }
        })
        measurements.push({ dark, ...bounds })
        expect(bounds.typedDivision).toBe(true)
        if (width < 316) { expect(bounds.stripScale).toBeGreaterThan(0); expect(bounds.stripScale).toBeLessThan(1) }
        expect(bounds.cards).toHaveLength(3)
        for (const card of bounds.cards) {
          expect(card.left).toBeGreaterThanOrEqual(bounds.pane.left)
          expect(card.right).toBeLessThanOrEqual(bounds.pane.right)
          expect(card.bottom).toBeLessThanOrEqual(bounds.pane.bottom)
          expect(card.top).toBeGreaterThanOrEqual(bounds.composer.bottom)
          expect(card.hit).toBe(true)
        }
        expect(bounds.inputHit).toBe('TEXTAREA')
        await page.screenshot({ path: `${evidence}/pane-${width}x${height}-${dark ? 'dark' : 'light'}.png` })
      }
      await writeFile(`${evidence}/pane-${width}x${height}.json`, JSON.stringify(measurements, null, 2))
    } finally { await page.close() }
  }, 30000)
})
