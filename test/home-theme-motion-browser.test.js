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
      import {mountHomeThemes,getHomeThemeController} from './src/preload/home-themes';
      import {HOME_THEMES} from './src/shared/home-themes';
      import {mountDesktopShellStyles} from './src/preload/shell-style';
      const records=[];const animate=HTMLElement.prototype.animate;
      HTMLElement.prototype.animate=function(frames,options){const result=animate.call(this,frames,options);records.push({element:this,animation:result,frames,options});return result};
      const colors=[],blendColor=WebGL2RenderingContext.prototype.blendColor;
      WebGL2RenderingContext.prototype.blendColor=function(r,g,b,a){if(this.canvas.hasAttribute('data-home-theme-canvas'))colors.push({time:performance.now(),alpha:a});return blendColor.call(this,r,g,b,a)};
      const draw=WebGL2RenderingContext.prototype.drawArrays;
      WebGL2RenderingContext.prototype.drawArrays=function(...args){const result=draw.apply(this,args),capture=window.themeMotion?.captureAppearance;if(capture&&this.canvas.hasAttribute('data-home-theme-canvas')&&!this.getParameter(this.FRAMEBUFFER_BINDING)){const blend=this.isEnabled(this.BLEND),alpha=this.getParameter(this.BLEND_COLOR)[3],key=blend?(alpha>.98?'light':'middle'):'dark';if(!capture[key]){const still=document.createElement('canvas');still.width=360;still.height=280;still.getContext('2d').drawImage(this.canvas,0,0,360,280);capture[key]=still.toDataURL()}}return result};
      window.themeMotion={records,colors,captureAppearance:null,mount(){mountDesktopShellStyles(document);this.dispose=mountHomeThemes(document)},surface(value){if(value)document.body.dataset.workspaceSurface=value;else delete document.body.dataset.workspaceSurface;document.dispatchEvent(new CustomEvent('sherlock:workspace-surface-change'))},next(){const c=getHomeThemeController(document);c.select(HOME_THEMES[(HOME_THEMES.indexOf(c.getSelected())+1)%HOME_THEMES.length])},select(id){getHomeThemeController(document).select(id)},thumbnail(){const c=getHomeThemeController(document);return c.getThumbnail(c.getSelected())},current(){return getHomeThemeController(document).getSelected()}};
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
const current = page => page.evaluate(() => window.themeMotion.current())
const background = page => page.locator('[data-odyssey-home-theme-background]')
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
      expect(await current(page)).toBe('koi-pond')
      await page.screenshot({ path: `${evidence}/koi-home-dark-${reduced}.png` })
      await page.evaluate(() => { window.koiSurface = document.querySelector('canvas[data-home-theme-canvas="koi-pond"]'); document.body.removeAttribute('data-ds-dark-theme') })
      await expect.poll(() => page.evaluate(() => window.koiSurface === document.querySelector('canvas[data-home-theme-canvas="koi-pond"]'))).toBe(true)
      await page.screenshot({ path: `${evidence}/koi-home-light-${reduced}.png` })
      await page.evaluate(() => window.themeMotion.surface('settings'))
      await expect.poll(() => page.locator('[data-odyssey-home-theme-background]').getAttribute('data-render-state')).toBe('paused')
      await page.evaluate(() => window.themeMotion.surface())
      await expect.poll(() => page.locator('[data-odyssey-home-theme-background]').getAttribute('data-render-state')).toBe(reduced ? 'paused' : 'running')
      await page.evaluate(() => window.themeMotion.next())
      expect(await current(page)).toBe('default')
      expect(await page.evaluate(() => window.koiSurface.dataset.homeKoiState)).toBe('disposed')
      await page.evaluate(() => window.themeMotion.select('koi-pond'))
      await expect.poll(() => canvas.getAttribute('data-home-koi-state')).toBe('ready')
      expect(await page.evaluate(() => localStorage.getItem('ework.home-background.v1'))).toBe('koi-pond')
      expect(errors).toEqual([])
    } finally { await page.close() }
  }, 20000)

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

  it('keeps only the background owner, pauses away from home and ignores ordinary DOM updates', async () => {
    const page=await fixture()
    try {
      expect(await page.locator('[data-odyssey-theme-dock]').count()).toBe(0)
      const initial=await page.evaluate(()=>{window.originalThemeCanvas=document.querySelector('[data-home-theme-canvas]');return window.themeMotion.records.length})
      await page.locator('textarea').fill('普通 DOM 更新不重建主题')
      await page.evaluate(()=>{const node=document.createElement('span');node.textContent='status';document.querySelector('.wSkVaW_scrollBody').append(node)})
      expect(await page.evaluate(()=>document.querySelector('[data-home-theme-canvas]')===window.originalThemeCanvas)).toBe(true)
      expect(await page.evaluate(()=>window.themeMotion.records.length)).toBe(initial)
      await page.evaluate(()=>window.themeMotion.surface('notes'));await expect.poll(()=>background(page).isVisible()).toBe(false)
      await page.evaluate(()=>window.themeMotion.surface());await expect.poll(()=>background(page).isVisible()).toBe(true)
      await page.evaluate(()=>{const settings=document.createElement('div');settings.dataset.sherlockSettingsPanel='';document.body.append(settings)})
      await expect.poll(()=>background(page).isVisible()).toBe(false)
      await page.locator('[data-sherlock-settings-panel]').evaluate(node=>node.remove());await expect.poll(()=>background(page).isVisible()).toBe(true)
      expect(await page.locator('textarea').inputValue()).toBe('普通 DOM 更新不重建主题')
    } finally { await page.close() }
  },30000)

  it('cycles every theme, keeps rapid-switch visual and aria state aligned, and freezes the displayed blend', async () => {
    const page = await fixture({ dark: true , width: 520, height: 440 }), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
            const ids = []
      for (let i = 0; i < 15; i++) {
        await page.evaluate(() => window.themeMotion.next())
        await expect.poll(() => page.locator('[data-theme-freeze]').count()).toBe(0)
        const id = await current(page); ids.push(id)
        expect(await page.locator('[data-home-theme-canvas]').getAttribute('data-home-theme-canvas')).toBe(id)
        expect(await page.locator('[data-odyssey-home-theme-background]').getAttribute('data-home-theme-id')).toBe(id)
      }
      expect(ids).toEqual(['berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'haseeb', 'kirian', 'splines', 'antiquue', 'crt-warp', 'dither', 'koi-pond', 'default'])
      const rapid = await page.evaluate(() => {
        for (let i = 0; i < 16; i++) window.themeMotion.next()
        const freeze = document.querySelector('[data-theme-freeze]'), bytes = freeze.getContext('2d').getImageData(0, 0, freeze.width, freeze.height).data
        let transparent = 0, chroma = 0
        for (let i = 0; i < bytes.length; i += 4) { if (bytes[i + 3] < 255) transparent++; chroma += Math.max(bytes[i], bytes[i + 1], bytes[i + 2]) - Math.min(bytes[i], bytes[i + 1], bytes[i + 2]) }
        return { current: window.themeMotion.current(), freeze: [freeze.width, freeze.height], transparent: transparent / (bytes.length / 4), chroma: chroma / (bytes.length / 4), canvases: document.querySelectorAll('[data-home-theme-canvas]').length }
      })
      expect(rapid.current).toBe('berber'); expect(rapid.canvases).toBe(1)
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
      expect(await current(page)).toBe('berber')
      expect(await page.locator('[data-home-theme-canvas]').getAttribute('data-home-theme-canvas')).toBe('berber')
      await page.screenshot({ path: `${evidence}/rapid-final-dark.png` })
      expect(errors).toEqual([])
      await writeFile(`${evidence}/rapid-state.json`, JSON.stringify(rapid, null, 2))
    } finally { await page.close() }
  }, 60000)

  it('crossfades dark themes without a white flash, and eases dark-to-light through actual intermediate colors', async () => {
    const page = await fixture({ dark: true, theme: 'berber' })
    const clip = { x: 60, y: 70, width: 190, height: 140 }
    try {
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
      await page.evaluate(() => window.themeMotion.next())
      expect(await current(page)).toBe('berber')
      expect(await page.locator('[data-theme-freeze]').count()).toBe(0)
      expect(await page.evaluate(() => window.themeMotion.records.length)).toBe(0)
      expect(await page.locator('[data-odyssey-theme-dock]').count()).toBe(0)
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
      await page.waitForTimeout(30)
      expect(await page.evaluate(() => window.themeMotion.records.length)).toBe(0)
    } finally { await page.close() }
  }, 30000)

  it('refreshes theme thumbnails after appearance changes while the home is hidden by notes or settings', async () => {
    const page = await fixture({ reduced: true, theme: 'berber' })
    try {
      const light = await page.evaluate(() => window.themeMotion.thumbnail())
      await page.evaluate(() => { window.themeMotion.surface('notes'); document.body.setAttribute('data-ds-dark-theme', '') })
      await expect.poll(() => background(page).isVisible()).toBe(false)
      await page.evaluate(() => window.themeMotion.surface())
      await expect.poll(() => page.evaluate(() => window.themeMotion.thumbnail())).not.toBe(light)
      const dark = await page.evaluate(() => window.themeMotion.thumbnail())
      expect(dark).toContain('data:image/png;base64,')
      await page.evaluate(() => { const settings = document.createElement('div'); settings.dataset.sherlockSettingsPanel = ''; document.body.append(settings) })
      await expect.poll(() => background(page).isVisible()).toBe(false)
      await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
      await page.locator('[data-sherlock-settings-panel]').evaluate(node => node.remove())
      await expect.poll(() => page.evaluate(() => window.themeMotion.thumbnail())).toBe(light)
      expect(await current(page)).toBe('berber')
    } finally { await page.close() }
  }, 30000)

})
