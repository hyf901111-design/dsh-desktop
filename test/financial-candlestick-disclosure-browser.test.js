import { expect, it } from 'vitest'
import { financialCandlestickSnapshotCss } from '../scripts/lib/financial-candlestick-snapshot.mjs'
import { WORKBENCH_DISCLOSURE_CSS } from '../packages/dsh-research-task-runtime/workbench-presentation.js'

it('aligns the native K-line disclosure icon and label in both disclosure states', async () => {
  const pw = await import(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
  const browser = await (pw.default || pw).chromium.launch({
    headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
  })
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 300 } })
    const hostCss = WORKBENCH_DISCLOSURE_CSS.replaceAll('body ', 'body [data-ework-grid] .rScV5Q_containerContent ')
    await page.setContent(`<style>@layer ework-workbench{${hostCss}}${financialCandlestickSnapshotCss}</style>
      <main data-ework-grid><div class="rScV5Q_containerContent">
        <details class="ew-candle-original-data" data-candle-original-data>
          <summary><span>完整行情数据 · 15 条</span><span>来源口径</span></summary>
          <table><tbody><tr><td>2026-11-06</td></tr></tbody></table>
        </details>
      </div></main>`)
    const summary = page.locator('summary')
    async function offsets() {
      return summary.evaluate(element => {
        const glyph = getComputedStyle(element, '::before')
        const translateY = glyph.translate.split(' ')[1] || '0'
        const offset = parseFloat(translateY) * (translateY.endsWith('%') ? parseFloat(glyph.height) / 100 : 1)
        const glyphCenter = element.getBoundingClientRect().top + parseFloat(glyph.top) + offset + parseFloat(glyph.height) / 2
        const labels = [...element.children].map(label => label.getBoundingClientRect())
        return { differences: labels.map(label => Math.abs(glyphCenter - (label.top + label.height / 2))), rotation: glyph.transform }
      })
    }
    const closed = await offsets()
    expect(Math.max(...closed.differences)).toBeLessThan(1)
    expect(await page.getByText('2026-11-06').isVisible()).toBe(false)
    await summary.press('Enter')
    const open = await offsets()
    expect(Math.max(...open.differences)).toBeLessThan(1)
    expect(open.rotation).not.toBe(closed.rotation)
    expect(await page.getByText('2026-11-06').isVisible()).toBe(true)
  } finally {
    await browser.close()
  }
}, 15000)
