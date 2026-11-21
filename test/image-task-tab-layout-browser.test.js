import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { build } from 'vite'

let browser, script

beforeAll(async () => {
  const entry = resolve('test/image-tab-layout-fixture.jsx')
  const file = value => JSON.stringify(resolve(value))
  const result = await build({
    configFile: false,
    logLevel: 'error',
    esbuild: { jsx: 'automatic', jsxDev: false },
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: entry,
      resolveId: id => id === entry ? '\0' + entry : undefined,
      load: id => id === '\0' + entry ? `
        import { createElement as h, useRef, useState } from 'react'
        import { createRoot } from 'react-dom/client'
        import { ImageTaskTabs } from ${file('src/preload/image-factory/task-tabs.tsx')}
        import { mountWorkspaceTopbarStyles } from ${file('src/preload/workspace-topbar.ts')}
        mountWorkspaceTopbarStyles(document)
        function Toolbar() {
          const header = useRef(null)
          const [tabs, setTabs] = useState(['山海长跑','城际视野','迎着风向','产业在转动','主动有章法','城际视野'].map((title,i) => ({ scope: String(i), title })))
          return h('header', {ref: header, className: 'if-top eb-tabs workspace-app-topbar'},
            h(ImageTaskTabs, {doc: document, header, state: {tabs,active:'0',busy:false}, current:'0', t: zh=>zh,
              action: event => { if (event.kind === 'close') setTabs(items => items.filter(t => t.scope !== event.scope)) }}))
        }
        const root = createRoot(document.getElementById('root'))
        root.render(h(Toolbar))
        window.unmountToolbar = () => root.unmount()
      ` : undefined,
    }],
    build: { write: false, minify: false, lib: { entry, name: 'ImageTabsFixture', formats: ['iife'] } },
  })
  script = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code
  const runtime = process.env.SHERLOCK_TEST_PLAYWRIGHT || join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(runtime).href)
  browser = await chromium.launch({
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || join(homedir(), 'Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'),
    headless: true,
  })
})
afterAll(() => browser?.close())

async function measure(page) {
  return page.locator('.eb-tab').evaluateAll(nodes => nodes.map(node => ({
    inline: node.style.width,
    width: node.getBoundingClientRect().width,
    textWidth: node.querySelector('.eb-tab-title').getBoundingClientRect().width,
  })))
}

it.each(['resize while hovered', 'leave the header', 'keep pointer inside'])('releases measured close widths after %s', async scenario => {
  const page = await browser.newPage({ viewport: { width: 600, height: 160 }, reducedMotion: 'no-preference' })
  try {
    await page.setContent('<main id="root"></main>')
    await page.addScriptTag({ content: script })
    const tabs = page.getByRole('tab')
    await tabs.last().waitFor({ timeout: 2200 })
    // The background macOS headless shell does not report OS :hover. Track its actual pointer events.
    await page.locator('header').evaluate(bar => {
      const matches = bar.matches.bind(bar)
      let hovered = false
      bar.addEventListener('pointerenter', () => { hovered = true })
      bar.addEventListener('pointerleave', () => { hovered = false })
      bar.matches = selector => selector === ':hover' ? hovered : matches(selector)
    })
    const initial = await measure(page)
    const first = await tabs.first().boundingBox()
    await tabs.nth(3).getByRole('button').click({ timeout: 2200 })
    await page.mouse.move(first.x + 8, first.y + 8)
    await expect.poll(() => tabs.count()).toBe(5)
    expect(await page.locator('header').evaluate(bar => bar.matches(':hover'))).toBe(true)
    if (scenario.startsWith('resize')) await page.setViewportSize({ width: 990, height: 160 })
    if (scenario === 'leave the header') await page.mouse.move(20, 140)
    await expect.poll(async () => (await measure(page)).every(tab => !tab.inline), { timeout: 1300 }).toBe(true)
    const settled = await measure(page)
    expect(settled[0].width).toBeGreaterThan(initial[0].width + 10)
    expect(settled[0].textWidth).toBeGreaterThan(initial[0].textWidth + 10)
    await expect.poll(() => page.locator('header').evaluate(bar => bar.style.getPropertyValue('--eb-tabs-right'))).toBe('12px')
  } finally {
    await page.close()
  }
})

it('releases captured widths and cancels the pending close on unmount', async () => {
  const page = await browser.newPage({ reducedMotion: 'no-preference' })
  try {
    await page.setContent('<main id="root"></main>')
    await page.addScriptTag({ content: script })
    await page.getByRole('tab').first().waitFor()
    const result = await page.evaluate(async () => {
      const nodes = [...document.querySelectorAll('[role=tab]')]
      nodes[2].querySelector('button').click()
      const [animation] = nodes[2].getAnimations()
      const hadMeasuredWidths = nodes.every(n => n.style.width)
      window.unmountToolbar()
      await Promise.resolve()
      return { hadMeasuredWidths, animation: animation?.playState, clean: nodes.every(n => !n.style.width && !n.style.flex) }
    })
    expect(result).toEqual({ hadMeasuredWidths: true, animation: 'idle', clean: true })
  } finally {
    await page.close()
  }
})
