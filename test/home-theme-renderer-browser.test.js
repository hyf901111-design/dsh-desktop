import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { build } from 'esbuild'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

let browser, script, evidence
beforeAll(async () => {
  const output = await build({
    stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import {createHomeThemeRenderer} from './src/preload/home-theme-renderer';
      window.createTheme=createHomeThemeRenderer;
    ` }, bundle: true, platform: 'browser', format: 'iife', write: false,
    plugins: [{ name: 'inline-theme-images', setup(builder) {
      builder.onResolve({ filter: /\.png\?inline$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -7)), namespace: 'theme-inline' }))
      builder.onLoad({ filter: /.*/, namespace: 'theme-inline' }, async args => ({ contents: 'export default ' + JSON.stringify('data:image/png;base64,' + (await readFile(args.path)).toString('base64')), loader: 'js' }))
    } }]
  })
  script = output.outputFiles[0].text
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell',
    args: ['--enable-unsafe-swiftshader']
  })
  evidence = await mkdtemp(join(tmpdir(), 'odyssey-home-themes-'))
}, 30000)
afterAll(async () => browser?.close())

async function fixture() {
  const page = await browser.newPage({ viewport: { width: 1040, height: 1420 }, deviceScaleFactor: 1 })
  await page.setContent('<main></main>')
  await page.addScriptTag({ content: script })
  return page
}

it('renders the Koi Pond assets offline, moves fish and water, changes appearance, and releases pending and active contexts', async () => {
  const page = await fixture(), errors = [], requests = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => requests.push(request.url()))
  try {
    await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      document.querySelector('main').append(canvas)
      window.koiCanvas = canvas
      window.koiRenderer = window.createTheme(canvas, 'koi-pond', { dark: false })
      if (!window.koiRenderer) throw new Error('Koi Pond renderer unavailable')
      window.koiRenderer.resize(920, 600)
      window.koiRenderer.render(0, false)
    })
    await page.waitForFunction(() => window.koiCanvas.dataset.homeKoiState === 'ready')
    const result = await page.evaluate(() => {
      const renderer = window.koiRenderer, canvas = window.koiCanvas, gl = canvas.getContext('webgl')
      const stats = () => {
        const bytes = new Uint8Array(canvas.width * canvas.height * 4)
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
        let luma = 0, blue = 0, red = 0, neutralWater = 0, hash = 2166136261
        for (let i = 0; i < bytes.length; i += 4) {
          luma += .2126 * bytes[i] + .7152 * bytes[i + 1] + .0722 * bytes[i + 2]
          blue += bytes[i + 2] > bytes[i] * 1.3 ? 1 : 0
          red += bytes[i] > bytes[i + 2] * 1.2 && bytes[i] > 90 ? 1 : 0
          neutralWater += Math.min(bytes[i], bytes[i + 1], bytes[i + 2]) >= 210 &&
            Math.max(bytes[i], bytes[i + 1], bytes[i + 2]) - Math.min(bytes[i], bytes[i + 1], bytes[i + 2]) <= 3 ? 1 : 0
          hash = Math.imul(hash ^ bytes[i], 16777619)
        }
        return { luma: luma / (bytes.length / 4), blue, red, neutralWaterFraction: neutralWater / (bytes.length / 4), hash }
      }
      renderer.render(0, false)
      const first = stats()
      for (let frame = 1; frame <= 36; frame++) renderer.render(frame / 24, false)
      const moving = stats()
      renderer.render(1.5, true)
      const dark = stats()
      renderer.resize(1600, 1000)
      renderer.render(1.5, true)
      const pixels = canvas.width * canvas.height
      const backend = renderer.backend
      renderer.dispose(); renderer.dispose()
      const disposed = renderer.render(2, true), released = gl.isContextLost()
      const pendingCanvas = document.createElement('canvas')
      const pending = window.createTheme(pendingCanvas, 'koi-pond', { dark: true })
      pending.resize(920, 600); pending.dispose()
      return { first, moving, dark, pixels, backend, disposed, released, pendingState: pendingCanvas.dataset.homeKoiState }
    })
    expect(result.backend).toBe('webgl')
    expect(result.first.luma).toBeGreaterThan(210)
    expect(result.first.neutralWaterFraction).toBeGreaterThan(.85)
    expect(result.first.red).toBeGreaterThan(1_000)
    expect(result.moving.hash).not.toBe(result.first.hash)
    expect(result.dark.luma).toBeLessThan(result.moving.luma * .65)
    expect(result.dark.blue).toBeGreaterThan(100_000)
    expect(result.dark.red).toBeGreaterThan(1_000)
    expect(result.pixels).toBeLessThanOrEqual(2_400_000)
    expect(result.disposed).toBe(false)
    expect(result.released).toBe(true)
    expect(result.pendingState).toBe('disposed')
    expect(errors).toEqual([])
    expect(requests.filter(url => /^https?:/.test(url))).toEqual([])
    await writeFile(join(evidence, 'koi-renderer.json'), JSON.stringify(result, null, 2))
  } finally { await page.close() }
}, 30000)

describe('original theme shaders in real WebGL2', () => {
  it('renders all eleven OpenShaders designs in light and dark with distinct textures and moving fields', async () => {
    const page = await fixture(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const result = await page.evaluate(() => {
        document.body.style.cssText = 'margin:0;background:#888;font:15px system-ui'
        document.querySelector('main').style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px'
        const names = ['berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'haseeb', 'kirian', 'splines', 'antiquue'], result = []
        const stats = (gl, canvas) => {
          const bytes = new Uint8Array(canvas.width * canvas.height * 4)
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
          let luminance = 0, hash = 2166136261, min = 255, max = 0
          for (let i = 0; i < bytes.length; i += 4) {
            const value = .2126 * bytes[i] + .7152 * bytes[i + 1] + .0722 * bytes[i + 2]
            luminance += value; min = Math.min(min, value); max = Math.max(max, value)
            hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0
            hash = Math.imul(hash ^ bytes[i + 1], 16777619) >>> 0
          }
          return { luminance: luminance / (bytes.length / 4), hash, min, max, bytes }
        }
        for (const name of names) for (const dark of [true, false]) {
          const box = document.createElement('section'), label = document.createElement('div'), canvas = document.createElement('canvas')
          box.style.cssText = 'background:white'; label.textContent = name + (dark ? ' · Dark' : ' · Light'); label.style.padding = '8px'
          canvas.style.cssText = 'display:block;width:500px;height:300px'; box.append(label, canvas); document.querySelector('main').append(box)
          const renderer = window.createTheme(canvas, name, { dark })
          if (!renderer) throw new Error(name + ' did not create WebGL2 renderer')
          renderer.resize(500, 300)
          if (!renderer.render(0, dark)) throw new Error(name + ' first draw failed')
          const gl = canvas.getContext('webgl2'), first = stats(gl, canvas)
          if (!renderer.render(8, dark)) throw new Error(name + ' moving draw failed')
          const moving = stats(gl, canvas)
          let changed = 0
          for (let i = 0; i < first.bytes.length; i += 4) if (Math.abs(first.bytes[i] - moving.bytes[i]) + Math.abs(first.bytes[i + 1] - moving.bytes[i + 1]) > 5) changed++
          renderer.render(0, dark)
          const still = document.createElement('img'); still.src = canvas.toDataURL(); still.style.cssText = canvas.style.cssText; canvas.replaceWith(still)
          renderer.dispose()
          const { bytes: _, ...summary } = first
          result.push({ name, dark, ...summary, changedFraction: changed / (first.bytes.length / 4), afterDispose: renderer.render(9, dark) })
        }
        return result
      })
      expect(errors).toEqual([])
      expect(result).toHaveLength(22)
      for (const entry of result) {
        expect(entry.max - entry.min).toBeGreaterThan(25)
        expect(entry.changedFraction).toBeGreaterThan(.04)
        expect(entry.afterDispose).toBe(false)
      }
      for (const name of ['berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'haseeb', 'kirian', 'splines', 'antiquue']) {
        const dark = result.find(entry => entry.name === name && entry.dark), light = result.find(entry => entry.name === name && !entry.dark)
        expect(light.luminance - dark.luminance).toBeGreaterThan(50)
      }
      expect(new Set(result.filter(entry => entry.dark).map(entry => entry.hash)).size).toBe(11)
      await page.screenshot({ path: join(evidence, 'all-themes.png'), fullPage: true })
      await writeFile(join(evidence, 'render-results.json'), JSON.stringify(result, null, 2))
      console.log('Theme render evidence:', evidence)
    } finally { await page.close() }
  }, 90000)

  it('renders the retained original React Bits effects in both modes with real motion', async () => {
    const page = await fixture(), errors = []
    page.on('pageerror', error => errors.push(error.message))
    try {
      const result = await page.evaluate(() => {
        document.body.style.cssText = 'margin:0;background:#888;font:15px system-ui'
        document.querySelector('main').style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px'
        const names = ['crt-warp', 'dither'], results = []
        const sample = (gl, canvas) => {
          const bytes = new Uint8Array(canvas.width * canvas.height * 4)
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes)
          let hash = 2166136261, low = 255, high = 0
          for (let i = 0; i < bytes.length; i += 4) {
            const value = .2126 * bytes[i] + .7152 * bytes[i + 1] + .0722 * bytes[i + 2]
            low = Math.min(low, value); high = Math.max(high, value)
            hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0
          }
          return { bytes, hash, spread: high - low }
        }
        for (const name of names) for (const dark of [true, false]) {
          const box = document.createElement('section'), label = document.createElement('div'), canvas = document.createElement('canvas')
          box.style.background = dark ? '#120f17' : '#f7f8fc'; box.style.color = dark ? 'white' : 'black'
          label.textContent = name + (dark ? ' · Dark' : ' · Light')
          canvas.style.cssText = 'display:block;width:500px;height:300px'; box.append(label, canvas); document.querySelector('main').append(box)
          const renderer = window.createTheme(canvas, name, { dark })
          if (!renderer) throw new Error(name + ' failed to create')
          renderer.resize(500, 300)
          if (!renderer.render(0, dark)) throw new Error(name + ' initial draw failed')
          const gl = canvas.getContext('webgl2'), first = sample(gl, canvas)
          if (!renderer.render(8, dark)) throw new Error(name + ' animated draw failed')
          const moving = sample(gl, canvas)
          let changed = 0
          for (let i = 0; i < first.bytes.length; i += 4) if (Math.abs(first.bytes[i] - moving.bytes[i]) + Math.abs(first.bytes[i + 1] - moving.bytes[i + 1]) > 5) changed++
          const still = document.createElement('img'); still.src = canvas.toDataURL(); still.style.cssText = canvas.style.cssText; canvas.replaceWith(still)
          renderer.resize(360, 640); const narrow = renderer.render(9, !dark)
          renderer.dispose(); renderer.dispose()
          results.push({ name, dark, hash: first.hash, spread: first.spread, changed: changed / (first.bytes.length / 4), narrow, afterDispose: renderer.render(10, dark), released: gl.isContextLost() })
        }
        return results
      })
      expect(result).toHaveLength(4)
      expect(errors).toEqual([])
      for (const item of result) {
        expect(item.spread, item.name).toBeGreaterThan(15)
        expect(item.changed, item.name).toBeGreaterThan(.01)
        expect(item.narrow).toBe(true)
        expect(item.afterDispose).toBe(false)
        expect(item.released).toBe(true)
      }
      expect(new Set(result.filter(item => item.dark).map(item => item.hash)).size).toBe(2)
      await page.screenshot({ path: join(evidence, 'react-bits-themes.png'), fullPage: true })
      await writeFile(join(evidence, 'react-bits-results.json'), JSON.stringify(result, null, 2))
      console.log('React Bits render evidence:', evidence)
    } finally { await page.close() }
  }, 90000)

  it('exports stable thumbnails, bounds Retina allocations and changes theme while paused', async () => {
    const page = await fixture()
    try {
      const result = await page.evaluate(() => {
        const canvas = document.createElement('canvas'); document.body.append(canvas)
        const thumbnail = window.createTheme(canvas, 'lowfreez', { dark: true, thumbnail: true })
        thumbnail.resize(600, 400)
        const sized = [canvas.width, canvas.height]
        thumbnail.render(0, true); const first = canvas.toDataURL()
        thumbnail.render(600, true); const later = canvas.toDataURL()
        thumbnail.render(600, false); const light = canvas.toDataURL()
        thumbnail.dispose()
        const large = document.createElement('canvas'), renderer = window.createTheme(large, 'berber', { dark: true })
        renderer.resize(8000, 6000); const mainSize = [large.width, large.height]
        const readPixel = () => {
          const gl = large.getContext('webgl2'), data = new Uint8Array(4)
          gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data)
          return [...data]
        }
        renderer.render(0, true); const darkPixel = readPixel()
        const smoothRender = renderer.render(.04, false), transitionPixel = readPixel()
        renderer.render(.04, false); const lightPixel = readPixel()
        renderer.dispose()
        return { sized, stable: first === later, themed: first !== light, image: first.startsWith('data:image/png;base64,'), mainSize, darkPixel, transitionPixel, lightPixel, smoothRender }
      })
      expect(result.sized[0]).toBe(320)
      expect(result.sized[1]).toBeLessThanOrEqual(214)
      expect(result.stable).toBe(true); expect(result.themed).toBe(true); expect(result.image).toBe(true)
      expect(result.mainSize[0] * result.mainSize[1]).toBeLessThanOrEqual(2_400_000)
      expect(result.darkPixel).not.toEqual(result.lightPixel)
      expect(result.smoothRender).toBe(true)
      expect(result.transitionPixel[0]).toBeGreaterThan(result.darkPixel[0])
      expect(result.transitionPixel[0]).toBeLessThan(result.lightPixel[0])
    } finally { await page.close() }
  }, 30000)

  it('releases every GL object after compile failure and normal disposal, and reports context loss', async () => {
    const page = await fixture()
    try {
      const result = await page.evaluate(async () => {
        const probe = (fail, theme = 'boz') => {
          const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2'), counts = {}
          for (const type of ['Shader', 'Program', 'Texture', 'Framebuffer', 'VertexArray']) {
            counts[type] = 0
            for (const [verb, delta] of [['create', 1], ['delete', -1]]) {
              const original = gl[verb + type].bind(gl)
              gl[verb + type] = (...args) => { const value = original(...args); if (verb === 'create' ? value : args[0]) counts[type] += delta; return value }
            }
          }
          if (fail) gl.getShaderParameter = () => false
          const renderer = window.createTheme(canvas, theme, { dark: true })
          if (renderer) { renderer.resize(400, 300); renderer.render(0); renderer.dispose(); renderer.dispose() }
          return { failed: !renderer, counts }
        }
        const failure = probe(true), normal = probe(false)
        const canvas = document.createElement('canvas'), renderer = window.createTheme(canvas, 'vghodki', { dark: true })
        renderer.resize(400, 300); renderer.render(0)
        const gl = canvas.getContext('webgl2'), lose = gl.getExtension('WEBGL_lose_context')
        await new Promise(resolve => { canvas.addEventListener('webglcontextlost', resolve, { once: true }); lose.loseContext() })
        const contextLost = renderer.render(1) === false
        renderer.dispose()
        return { failure, normal, contextLost }
      })
      expect(result.failure.failed).toBe(true)
      expect(result.normal.failed).toBe(false)
      expect(Object.values(result.failure.counts)).toEqual([0, 0, 0, 0, 0])
      expect(Object.values(result.normal.counts)).toEqual([0, 0, 0, 0, 0])
      expect(result.contextLost).toBe(true)
    } finally { await page.close() }
  }, 30000)

  it('releases context slots through 25 rapid switches without evicting the active renderer', async () => {
    const page = await fixture(), warnings = []
    page.on('console', message => {
      if (/too many|oldest context|context limit/i.test(message.text())) warnings.push(message.text())
    })
    try {
      const result = await page.evaluate(async () => {
        const activeCanvas = document.createElement('canvas'), active = window.createTheme(activeCanvas, 'berber', { dark: true })
        active.resize(80, 48)
        const first = active.render(0), losses = []
        for (let i = 0; i < 25; i++) {
          const canvas = document.createElement('canvas')
          const renderer = window.createTheme(canvas, ['berber', 'vghodki', 'jarrick', 'lowfreez', 'accelbia', 'boz', 'shashidhar', 'haseeb', 'kirian', 'splines', 'antiquue'][i % 11], { dark: i % 2 === 0 })
          if (!renderer) throw new Error('Renderer creation failed at switch ' + i)
          renderer.resize(80, 48)
          if (!renderer.render(i / 24)) throw new Error('Renderer failed at switch ' + i)
          renderer.dispose(); renderer.dispose()
          losses.push(canvas.getContext('webgl2').isContextLost())
        }
        // Let contextlost events and browser warnings queued by this turn run.
        await new Promise(resolve => setTimeout(resolve, 0))
        const current = active.render(1), activeLost = activeCanvas.getContext('webgl2').isContextLost()
        active.dispose()
        return { first, current, activeLost, losses }
      })
      expect(result.first).toBe(true); expect(result.current).toBe(true)
      expect(result.activeLost).toBe(false)
      expect(result.losses).toHaveLength(25)
      expect(result.losses.every(Boolean)).toBe(true)
      expect(warnings).toEqual([])
    } finally { await page.close() }
  }, 30000)
})
