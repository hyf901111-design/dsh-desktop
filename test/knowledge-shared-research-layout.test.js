import { expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

test('reserves header space once in both research and shared preview', async () => {
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
    : await import('playwright')
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
  try {
    const page = await browser.newPage()
    const css = await readFile('scripts/lib/research-grid-workbench.css', 'utf8')
    await page.setContent(`
      <style>
        ${css}
        section { position: relative; display: flex; flex-direction: column; height: 500px; --odyssey-workspace-header-height: 44px }
        header { flex: none; height: 44px }
        [data-research-canvas] { position: absolute; inset: 0 }
      </style>
      <section>
        <header>研究</header>
        <div data-research-canvas data-ework-grid></div>
      </section>
      <section>
        <header>共享看板 · 预览</header>
        <div class="knowledge-shared-session-body" style="flex: 1; position: relative">
          <div data-research-canvas data-ework-grid></div>
        </div>
      </section>`)
    const geometry = section => {
      const canvas = section.querySelector('[data-research-canvas]').getBoundingClientRect()
      return { gap: canvas.top - section.querySelector('header').getBoundingClientRect().bottom,
        bottom: section.getBoundingClientRect().bottom - canvas.bottom }
    }
    const sections = page.locator('section')
    expect(await sections.first().evaluate(geometry)).toEqual({ gap: 0, bottom: 0 })
    const shared = sections.last()
    for (const zoom of [1, 1.5]) {
      await shared.locator('[data-research-canvas]').evaluate((canvas, zoom) => {
        canvas.style.setProperty('--srb-board-display-zoom', String(zoom))
      }, zoom)
      expect(await shared.evaluate(geometry)).toEqual({ gap: 0, bottom: 0 })
    }
  } finally {
    await browser.close()
  }
})
