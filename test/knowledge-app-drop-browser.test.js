import { beforeAll, afterAll, expect, it } from 'vitest'
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'

let browser, code
const fileId = 'e3cb5df3-65ab-4fad-9b85-1033a55a0b01'
beforeAll(async () => {
  const pw = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright')
  browser = await pw.chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  const result = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import { mountKnowledgeAppDrop } from './src/preload/knowledge/app-drop'
      import { KNOWLEDGE_FILE_DRAG_TYPE } from './src/shared/knowledge-drag'
      const row = document.querySelector('[draggable]')
      window.events = []
      row.ondragstart = event => event.dataTransfer.setData(KNOWLEDGE_FILE_DRAG_TYPE, JSON.stringify({
        id: row.dataset.knowledgeFileId, label: row.querySelector('[title]').title
      }))
      row.querySelector('button').onclick = () => window.events.push('reference')
      mountKnowledgeAppDrop(document, {
        async openPresentation(id, session, current) { if (current()) window.events.push(['presentation', id, session]) },
        async openImage(id, current) { if (current()) window.events.push(['image', id]) },
      })
    ` }, bundle: true, write: false, format: 'iife', platform: 'browser',
  })
  code = result.outputFiles[0].text
})
afterAll(async () => { await browser?.close() })

async function surface(mode, file, welcome = '') {
  const page = await browser.newPage({ viewport: { width: 960, height: 640 } })
  await page.setContent(`<style>main{width:600px;height:540px}aside{position:absolute;top:12px;right:10px;width:280px}.knowledge-app-drop{position:fixed;z-index:30}</style>
    <div class="pI_x6G_centerCol"><main data-odyssey-page="${mode}">${welcome}</main></div>
    <aside id="odyssey-right-workspace-panel"><div data-knowledge-panel-host data-knowledge-panel-session="s1">
    <div draggable="true" data-knowledge-file-id="${fileId}"><div class="knowledge-panel-name"><span title="${file}">${file}</span></div>
    <div class="knowledge-panel-action"><button>引用</button></div></div></div></aside>`)
  await page.addScriptTag({ content: code })
  return page
}
async function drag(page) {
  const rect = await page.locator('[draggable]').boundingBox()
  await page.mouse.move(rect.x + 12, rect.y + 8)
  await page.mouse.down()
  await page.mouse.move(rect.x + 42, rect.y + 8, { steps: 8 })
  await page.mouse.move(320, 260, { steps: 8 })
  await page.mouse.move(319, 260)
}

it.each([
  ['presentation', '上次的演示.pptx', '', ['presentation', fileId, 's1']],
  ['conversation', '参考图片.png', '<div data-mode-welcome="image-factory"></div>', ['image', fileId]],
  ['spreadsheet', '数据说明.pdf', '', 'reference'],
])('routes the panel drag into %s for %s', async (mode, name, welcome, expected) => {
  const page = await surface(mode, name, welcome)
  try {
    await drag(page)
    await page.locator('[data-knowledge-app-drop][data-over]').waitFor({timeout:3000})
    await page.mouse.up()
    await expect.poll(() => page.evaluate(() => window.events)).toEqual([expected])
    expect(await page.locator('[data-knowledge-app-drop]').count()).toBe(0)
  } finally { await page.close() }
})

it('rejects a stale drop after the knowledge pane changes session', async () => {
  const page = await surface('presentation', '投资计划.pptx')
  try {
    await drag(page)
    await page.locator('[data-knowledge-app-drop][data-over]').waitFor()
    await page.locator('[data-knowledge-panel-host]').evaluate(el => el.dataset.knowledgePanelSession = 's2')
    await page.mouse.up()
    expect(await page.evaluate(() => window.events)).toEqual([])
  } finally { await page.close() }
})
