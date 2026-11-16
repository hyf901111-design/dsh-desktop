import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { expect, it } from 'vitest'
import { efundImageFactoryFont } from '../scripts/lib/image-factory-web-font.mjs'

it('loads the poster typefaces in the editor and embeds their glyphs in exported pixels', async () => {
  const playwright = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href) : await import('playwright')
  const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), contents: `
        import { drawLayers, textLayerStyle } from './src/preload/image-factory/layers'
        import { imageFactoryFontFaces } from './src/preload/image-factory/fonts'
        window.fixture = { drawLayers, textLayerStyle, imageFactoryFontFaces }
      ` },
      bundle: true, write: false, format: 'iife', platform: 'browser',
    })
    const page = await browser.newPage()
    const warnings = []
    page.on('console', message => { if (message.type() === 'warning') warnings.push(message.text()) })
    await page.route('https://image-factory-fonts.test/**', async route => {
      const name = new URL(route.request().url()).pathname.split('/').at(-1)
      if (!name) return route.fulfill({ contentType: 'text/html; charset=utf-8', body: '<!doctype html>' })
      const path = name === 'STHeiti_YFD.ttf' ? 'skills/efund-ppt-maker/assets/fonts/STHeiti_YFD.ttf' : 'build/fonts/image-factory/' + name
      const file = await readFile(path)
      const body = name === 'STHeiti_YFD.ttf' ? efundImageFactoryFont(file) : file
      return route.fulfill({ contentType: name.endsWith('.woff2') ? 'font/woff2' : 'font/ttf', body })
    })
    await page.goto('https://image-factory-fonts.test/')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const result = await page.evaluate(async () => {
      const { drawLayers, textLayerStyle, imageFactoryFontFaces } = window.fixture
      const stylesheet = document.createElement('style')
      stylesheet.textContent = imageFactoryFontFaces
      document.head.append(stylesheet)
      const output = document.createElement('canvas')
      output.width = 700; output.height = 134
      const context = output.getContext('2d', { willReadFrequently: true })
      const scene = { width: output.width, height: output.height, layers: [] }
      const testFace = async (family, text) => {
        const layer = { kind: 'text', text, x: .02, y: .02, width: .9, family, fontSize: 55, weight: 700, align: 'left', color: '#000000' }
        const preview = document.createElement('div')
        Object.assign(preview.style, textLayerStyle(layer, scene))
        preview.textContent = text
        document.body.append(preview)
        const loaded = await document.fonts.load(preview.style.font, text)
        const pixels = async family => {
          context.clearRect(0, 0, output.width, output.height)
          await drawLayers(context, { ...scene, layers: [{ ...layer, family }] })
          return context.getImageData(0, 0, output.width, output.height).data
        }
        const rendered = await pixels(family), fallback = await pixels('system-ui')
        const different = rendered.some((value, index) => value !== fallback[index])
        preview.remove()
        return { family, loaded: loaded.some(face => face.family.includes(family) && face.status === 'loaded'), different }
      }
      const results = []
      for (const [family, text] of [
        ['Source Han Sans CN', '春日海报 财经精选'], ['STHeiti_YFD', '春日海报 财经精选'], ['ZCOOL XiaoWei', '春日海报 财经精选'],
        ['Montserrat', 'SUMMER FESTIVAL'], ['Archivo Black', 'SUMMER FESTIVAL'], ['Playfair Display', 'SUMMER FESTIVAL'],
      ]) {
        try { results.push(await testFace(family, text)) }
        catch (error) { throw Error(family + ': ' + error.message) }
      }
      return results
    }).catch(error => {
      throw Error([error.message, ...warnings].join('\n'))
    })
    for (const face of result) expect(face, face.family).toMatchObject({ loaded: true, different: true })
  } finally {
    await browser.close()
  }
}, 20_000)
