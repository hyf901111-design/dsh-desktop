import { pathToFileURL } from 'node:url'
import { it, expect } from 'vitest'
import { handleEditorAsset } from '../src/main/presentation/protocol'
import { blankDeck } from '../src/main/presentation/store'

it('shows and hit-tests the slide title inside the scaled PPTist artboard', async () => {
  const playwright = await import(
    process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright'
  )
  const browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } })
    const deck = blankDeck('季度经营复盘')
    deck.slides[0]!.elements = [
      {
        type: 'text',
        id: 'headline',
        left: 48,
        top: 64,
        width: 420,
        height: 84,
        rotate: 0,
        content: '<p style="font-size:36px">季度经营表现</p>',
        defaultFontName: 'Arial',
        defaultColor: '#005298'
      }
    ]
    await page.route('http://localhost/**', async (route: any) => {
      const path = new URL(route.request().url()).pathname
      if (path === '/')
        return route.fulfill({
          contentType: 'text/html',
          body: '<html><body style="margin:0"></body></html>'
        })
      const response = await handleEditorAsset(
        process.cwd(),
        new Request('odyssey-presentation://editor' + path)
      )
      return route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer())
      })
    })
    await page.goto('http://localhost/')
    await page.evaluate((deck: any) => {
      const editor = document.createElement('iframe')
      editor.style.cssText = 'width:100vw;height:100vh;border:0;display:block'
      window.addEventListener('message', (event) => {
        const packet = event.data
        if (event.source !== editor.contentWindow || packet?.channel !== 'odyssey-presentation') return
        if (packet.type === 'ready')
          editor.contentWindow!.postMessage(
            {
              channel: packet.channel,
              type: 'load',
              record: { deck, revision: 1 },
              editable: true,
              dark: true
            },
            location.origin
          )
        if (packet.type === 'selection') document.body.dataset.selected = packet.reference?.id ?? ''
      })
      editor.src = '/index.html?host=' + encodeURIComponent(location.origin)
      document.body.append(editor)
    }, deck)
    const frame = page.frameLocator('iframe')
    const plane = frame.locator('.slide-area .viewport')
    await plane.waitFor()
    const bounds = await plane.boundingBox()
    expect(bounds!.width).toBeGreaterThan(500)
    expect(bounds!.width / bounds!.height).toBeCloseTo(16 / 9, 1)
    await plane.locator('[data-pptx-node-id=headline] .element-content').click()
    await expect.poll(() => page.locator('body').getAttribute('data-selected')).toBe('headline')
  } finally {
    await browser.close()
  }
}, 20000)
