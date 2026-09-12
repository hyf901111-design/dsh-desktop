import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { canvasCss } from '../scripts/lib/figma-canvas-client.mjs'

// Use the installed card's actual border/layout rules, including focus treatment.
const installed = readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js', 'utf8')
const baseCss = [...installed.matchAll(/\.rScV5Q_(?:richNode[^{}]*|previewBody|nodeTitle)\{[^{}]*\}/g)].map(m => m[0]).join('\n')
let browser
beforeAll(async () => {
  const { chromium } = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
const contents = {
  markdown: '<p>正文保留</p>', table: '<table><tr><td>42</td></tr></table>',
  chart: '<svg width="80" height="30"><path d="M0 20L80 0" stroke="red"/></svg>',
  metric: '<strong>4,575.02</strong>', mindmap: '<div class="rScV5Q_mindMap">研究结论</div>',
  file: '<iframe title="原始文件" srcdoc="<p>file</p>"></iframe>',
}
async function pixels(page, points) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async ({ png, points }) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode()
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height
    const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0)
    return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data].slice(0, 3))
  }, { png, points })
}
for (const dark of [false, true]) for (const dpr of [1, 2]) it(`${dark ? 'dark' : 'light'} DPR ${dpr}: native cards paint a 1.5px inside selection without moving content`, async () => {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: dpr })
  await page.route('**/*', r => r.abort())
  try {
    const color = dark ? [27, 119, 255] : [162, 196, 255]
    for (const [kind, html] of Object.entries(contents)) {
      const derived = kind === 'mindmap'
      const [width, height] = ['metric', 'file'].includes(kind) ? [320, 220] : ['table', 'chart'].includes(kind) ? [656, 220] : [656, 456]
      await page.setContent(`<style>:root{--dsw-alias-border-l2:#ddd;--dsw-alias-state-business-primary:#38f;--dsw-alias-bg-layer-1:${dark ? '#292a2d' : '#fff'};--dsw-alias-bg-layer-2:${dark ? '#292a2d' : '#fff'}}${baseCss}\n${canvasCss}</style><body ${dark ? 'data-ds-dark-theme' : ''} style="background:${dark ? '#202020' : '#eee'}"><dialog class="rScV5Q_richNode" data-research-compact-chrome="true" ${derived ? 'data-research-derived' : ''} style="display:flex;left:32px;top:32px;width:${width}px;height:${height}px;padding:0;margin:0" tabindex="0"><div class="rScV5Q_nodeTitle">${kind}</div><div class="rScV5Q_previewBody" style="background:var(--odyssey-card)">${html}<button id="action">操作</button></div></dialog></body>`)
      const card = page.locator('dialog')
      const geometry = () => card.evaluate(el => [el, ...el.children].map(n => { const r = n.getBoundingClientRect(); return [r.x, r.y, r.width, r.height] }))
      const sidePoints = [
        i => [32 * dpr + i, (32 + height / 2) * dpr],
        i => [(32 + width) * dpr - 1 - i, (32 + height / 2) * dpr],
        i => [(32 + width / 2) * dpr, 32 * dpr + i],
        i => [(32 + width / 2) * dpr, (32 + height) * dpr - 1 - i],
      ]
      const unselectedPixels = await pixels(page, sidePoints.flatMap(point => Array.from({ length: 4 * dpr }, (_, i) => point(i))))
      const before = await geometry()
      await card.evaluate(el => { el.dataset.selected = 'true'; el.focus() })
      expect(await geometry(), kind).toEqual(before)
      const style = await card.evaluate(el => { const s = getComputedStyle(el); return { border: s.borderWidth, radius: s.borderRadius, shadow: s.boxShadow } })
      expect(style.border).toBe(derived ? '0px' : '1px')
      expect(style.radius).toBe('12px')
      expect(style.shadow).toBe(dark ? 'rgba(82, 140, 255, 0.48) 0px 0px 7px 0px, rgba(64, 128, 255, 0.24) 0px 0px 26px 2px' : 'rgba(82, 140, 255, 0.28) 0px 0px 7px 0px, rgba(64, 128, 255, 0.14) 0px 0px 26px 2px')
      for (const [side, point] of sidePoints.entries()) {
        const underneath = unselectedPixels.slice(side * 4 * dpr, (side + 1) * 4 * dpr)
        const edge = await pixels(page, Array.from({ length: 4 * dpr }, (_, i) => point(i)))
        expect(edge[0], kind).toEqual(color)
        if (dpr === 1) {
          // Coverage of the second pixel must be 50%, not an aliased 1px or 2px line.
          const half = color.map((v, i) => Math.round((v + underneath[1][i]) / 2))
          edge[1].forEach((v, i) => expect(Math.abs(v - half[i]), `${kind}: half-pixel channel ${i}`).toBeLessThanOrEqual(1))
          expect(edge[2], kind).toEqual(underneath[2])
        } else {
          expect(edge.slice(0, 3), kind).toEqual([color, color, color])
          expect(edge[3], kind).toEqual(underneath[3])
        }
      }
      const corners = await pixels(page, [[32 * dpr, 32 * dpr], [48 * dpr, 32 * dpr]])
      expect(corners[0]).not.toEqual(color)
      expect(corners[1]).toEqual(color)
      if (process.env.SHERLOCK_STROKE_SCREENSHOTS && kind === 'markdown' && dpr === 1) await page.screenshot({ path: `${process.env.SHERLOCK_STROKE_SCREENSHOTS}/d64-stroke-${dark ? 'dark' : 'light'}.png` })
      // The overlay must not consume card actions or survive deselection.
      expect(await page.locator('#action').evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el })).toBe(true)
      await card.evaluate(el => { el.dataset.selected = 'false'; el.blur() })
      expect(await geometry()).toEqual(before)
      expect(await card.evaluate(el => getComputedStyle(el, '::after').content)).toBe('none')
    }
  } finally { await page.close() }
}, 30000)
