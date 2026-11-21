import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { expect, it } from 'vitest'
import { handleEditorAsset } from '../src/main/presentation/protocol'

it('aligns both empty workspaces as the pane resizes and uses the dark client palette in the slide list', async () => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { mountSpreadsheet } from './src/preload/spreadsheet/view'
      mountSpreadsheet(document, {
        request: async () => ({
          editable: true, owner: 'fixture', generation: '1',
          record: {revision: 1, workbook: null, canRedoAI: true},
          recent: Array.from({length: 6}, (_, index) => ({id: String(index), name: '周报 ' + index, sheetCount: 2}))
        }),
        subscribe: () => () => {}
      })
    ` },
    bundle: true, write: false, platform: 'browser', format: 'iife', target: 'chrome140',
    define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.svg': 'dataurl', '.css': 'text' }
  })
  const playwright = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href) : await import('playwright')
  const browser = await playwright.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(5000)
    const shellStyles = await readFile('src/preload/presentation/view.css', 'utf8')
    await page.route('http://localhost/**', async route => {
      const path = new URL(route.request().url()).pathname
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>
        ${shellStyles}
        body { margin: 0; }
        main { position: absolute; inset: 0 0 0 180px; display: flex; flex-direction: column; }
        body.chat-open main { right: 320px; }
        header { height: 48px; }
        section { flex: 1; }
        [hidden] { display: none; }
        </style><body data-ds-dark-theme>
        <button id="chat" onclick="document.body.classList.toggle('chat-open')">右侧对话</button>
        <main data-odyssey-page="spreadsheet"><header></header><section data-conversation-scroll><div data-ework-spreadsheet-view="alignment"></div></section></main>
        <main data-odyssey-page="presentation" hidden><header></header><section data-conversation-scroll><div data-ework-presentation-view><iframe></iframe></div></section></main>
        <script>
        const frame = document.querySelector('iframe')
        addEventListener('message', event => {
          if (event.source === frame.contentWindow && event.data.type === 'ready')
            frame.contentWindow.postMessage({channel: 'odyssey-presentation', type: 'load', editable: true, dark: true, record: {deck: null, revision: 0}}, location.origin)
        })
        frame.src = '/index.html?host=' + encodeURIComponent(location.origin)
        </script>` })
      const response = await handleEditorAsset(process.cwd(), new Request('odyssey-presentation://editor' + path))
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) })
    })
    await page.goto('http://localhost/')
    await page.addScriptTag({ content: bundle.outputFiles[0].text })
    const editor = page.frameLocator('iframe')
    async function positions(mode) {
      await page.locator('main').evaluateAll((nodes, active) => {
        for (const node of nodes) node.hidden = node.dataset.odysseyPage !== active
      }, mode)
      const hero = (mode === 'presentation' ? editor : page).locator('.ew-workspace-empty-hero')
      await hero.getByRole('button').first().waitFor()
      return hero.evaluate(node => [...node.querySelectorAll('.ew-workspace-empty-icon, h1, p, button')].map(element => {
        const { x, y, width, height } = element.getBoundingClientRect()
        const pane = node.parentElement.getBoundingClientRect()
        const style = getComputedStyle(element)
        return { geometry: [x + width / 2 - pane.x, y - pane.y, height], fontSize: style.fontSize, lineHeight: style.lineHeight }
      }))
    }
    for (const [width, height] of [[1400, 800], [920, 660], [790, 540]]) {
      await page.setViewportSize({ width, height })
      for (const chatOpen of [false, true]) {
        if (await page.locator('body').evaluate(node => node.classList.contains('chat-open')) !== chatOpen) await page.locator('#chat').click()
        const sheet = await positions('spreadsheet')
        const deck = await positions('presentation')
        expect(deck.length).toBe(5)
        for (let element = 0; element < deck.length; element++) {
          for (let axis = 0; axis < 3; axis++) expect(deck[element].geometry[axis], JSON.stringify({width, chatOpen, element, axis, sheet, deck})).toBeCloseTo(sheet[element].geometry[axis], 0)
          if (element > 0) {
            expect(deck[element].fontSize).toBe(sheet[element].fontSize)
            expect(deck[element].lineHeight).toBe(sheet[element].lineHeight)
          }
        }
      }
    }
    await editor.getByRole('button', { name: '新建空白演示文稿' }).click()
    const list = editor.locator('.pages')
    for (let i = 0; i < 12; i++) await list.getByTitle('新建幻灯片').click()
    expect(await list.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true)
    await page.mouse.move(5, 5)
    await expect.poll(() => list.evaluate(node => getComputedStyle(node, '::-webkit-scrollbar-thumb').backgroundColor)).toBe('rgb(51, 51, 51)')
    await list.evaluate(node => { node.scrollTop = node.scrollHeight })
    expect(await list.evaluate(node => node.scrollTop)).toBeGreaterThan(0)
  } finally {
    await browser.close()
  }
}, 30000)
