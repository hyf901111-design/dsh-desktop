import { expect, test } from 'vitest'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { patchKnowledgeSharedResearch, stripKnowledgeSharedResearch } from '../scripts/lib/knowledge-shared-research.mjs'

async function launchBrowser() {
  const { chromium } = process.env.PLAYWRIGHT_MODULE_PATH
    ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href)
    : await import('playwright')
  return chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH })
}

test('reserves header space once in both research and shared preview', async () => {
  const browser = await launchBrowser()
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

test('temporarily hides the resident right pane while a shared original is visible', async () => {
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage()
    const css = await readFile('src/preload/figma-panels.css', 'utf8')
    await page.setContent(`
      <style>${css} #root { width: 900px; }</style>
      <div id="root">
        <main data-dsh-frame><section data-pane="conversation" data-odyssey-page="spreadsheet">项目会话</section></main>
      </div>
      <div data-dsh-panel-host data-odyssey-panel-right="open">
        <button data-odyssey-panel-entry="right">折叠侧边栏</button>
        <aside id="odyssey-right-workspace-panel">
          <h2>开始一张表格。</h2>
          <textarea aria-label="给智能体发消息">上一会话草稿</textarea>
        </aside>
      </div>`)
    const right = page.locator('#odyssey-right-workspace-panel')
    const toggle = page.getByRole('button', { name: '折叠侧边栏' })
    const width = () => page.locator('[data-pane="conversation"]').evaluate(el => el.getBoundingClientRect().width)
    const before = await width()
    await page.evaluate(() => { document.body.dataset.workspaceSurface = 'shared-session' })
    expect(await right.isVisible()).toBe(false)
    expect(await toggle.isVisible()).toBe(false)
    expect(await width()).toBeGreaterThan(before)
    await page.evaluate(() => { document.body.dataset.workspaceSurface = 'knowledge' })
    expect(await right.isVisible()).toBe(true)
    expect(await toggle.isVisible()).toBe(true)
    expect(await width()).toBe(before)
    expect(await right.locator('textarea').inputValue()).toBe('上一会话草稿')
  } finally {
    await browser.close()
  }
})

test('reflows shared research cards without editing or persisting the source', async () => {
  const installed = await readFile('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
  const base = stripKnowledgeSharedResearch(installed)
  const source = patchKnowledgeSharedResearch(base)
  expect(stripKnowledgeSharedResearch(source)).toBe(base)
  const script = await build({
    stdin: { resolveDir: process.cwd(), contents: `
      import * as React from 'react'
      import * as ReactDom from 'react-dom'
      import * as jsx from 'react/jsx-runtime'
      import { createRoot } from 'react-dom/client'
      let descriptor
      window.__ModuleLoader__ = { load: value => { descriptor = value } }
      window.dshDesktop = {}
      const stub = new Proxy(function () {}, { get: () => stub, apply: () => stub, construct: () => ({}) })
      ;(0, eval)(${JSON.stringify(source)})
      const primitives = new Proxy({ MarkdownText: ({ text }) => React.createElement('div', null, text) }, {
        get: (target, key) => target[key] || (String(key).startsWith('Icon') ? () => null : stub)
      })
      const modules = { react: React, 'react-dom': ReactDom, 'react-dom/client': { createRoot },
        'react/jsx-runtime': jsx, '@deepseek-ai/dsh-client-ui-primitives': primitives }
      descriptor.factory(id => modules[id] || stub)
    ` },
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  const browser = await launchBrowser()
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, reducedMotion: 'reduce' })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('https://shared-research.test/', route => route.fulfill({
      contentType: 'text/html',
      body: '<style>[data-knowledge-shared-mode]{height:700px;width:1000px;position:relative}[data-knowledge-shared-mode]>[data-research-canvas]{position:absolute;inset:0}</style>'
    }))
    await page.goto('https://shared-research.test/')
    await page.addScriptTag({ content: script.outputFiles[0].text })
    const original = await page.evaluate(() => {
      const target = document.createElement('div')
      const scope = target.id = 'knowledge-view:' + crypto.randomUUID()
      target.dataset.knowledgeSharedMode = 'research'
      document.body.append(target)
      const canvas = { files: [], artifacts: [220, 1100].map((y, index) => ({
        id: 'card-' + index, x: 300, y, width: 340, height: 210, sizeMode: 'manual',
        kind: 'pasted-text', messageId: 'message-' + index, title: '共享卡片 ' + index, excerpt: '发布时的正文'
      })) }
      window.originalCanvas = canvas
      return { canvas, opened: !document.dispatchEvent(new CustomEvent('sherlock:knowledge-research-view', {
        detail: { scope, canvas }, cancelable: true
      })) }
    })
    expect(original.opened).toBe(true)
    const cards = page.locator('[data-knowledge-shared-mode] [data-research-node-id]')
    const geometry = () => cards.evaluateAll(nodes => nodes.map(node => {
      const card = node.getBoundingClientRect()
      const canvas = node.closest('[data-research-canvas]').getBoundingClientRect()
      return { top: card.top - canvas.top, right: card.right - canvas.left, width: canvas.width }
    }))
    const fits = async () => {
      const boxes = await geometry()
      return boxes.length === 2 && boxes.every(box => box.top < 450 && box.right <= box.width + 1)
    }
    await expect.poll(fits).toBe(true)
    const wide = await geometry()
    await page.locator('[data-knowledge-shared-mode]').evaluate(el => { el.style.width = '480px' })
    await expect.poll(fits).toBe(true)
    expect(await geometry()).not.toEqual(wide)
    await page.locator('[data-knowledge-shared-mode] [data-research-canvas]').focus()
    await page.keyboard.press('Delete')
    expect(await cards.count()).toBe(2)
    expect(await page.evaluate(() => ({
      canvas: window.originalCanvas, stored: Object.keys(localStorage).filter(key => key.includes('knowledge-view:'))
    }))).toEqual({ canvas: original.canvas, stored: [] })
    expect(errors).toEqual([])
  } finally {
    await browser.close()
  }
}, 15000)
