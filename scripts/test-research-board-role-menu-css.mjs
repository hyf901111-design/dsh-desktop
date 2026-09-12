// Isolated Chromium layout fixture. No connection to the app and no UI input.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { build } from 'esbuild'
const { default: playwright } = await import(process.env.SHERLOCK_PLAYWRIGHT_MODULE ||
  '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
const fixture = await build({
  stdin: { contents: `
    import { installBoardUiStyles } from './src/preload/research-board-dialogs.ts';
    import { mountDesktopShellStyles } from './src/preload/shell-style.ts';
    installBoardUiStyles(document);
    mountDesktopShellStyles(document);
  `, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife',
  plugins: [{ name: 'production-raw-styles', setup(build) {
    build.onResolve({ filter: /\.css\?raw$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw-style' }))
    build.onLoad({ filter: /.*/, namespace: 'raw-style' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }))
  } }]
})
const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_CHROMIUM_PATH ||
  '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
try {
  for (const dark of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } })
    await page.setContent(`<body ${dark ? 'data-ds-dark-theme' : ''}><dialog open class="srb-dialog">
      <div class="srb-role-menu" popover="manual" role="menu" style="left:100px;top:100px">
        <button type="button" role="menuitemradio" aria-checked="true"><span>可编辑</span><small>查看并编辑画板中的内容。</small><span class="srb-role-check"></span></button>
        <button type="button" role="menuitemradio" aria-checked="false"><span>仅查看</span><small>查看画板内容，不能进行编辑。</small><span class="srb-role-check"></span></button>
      </div></dialog></body>`)
    await page.addScriptTag({ content: fixture.outputFiles[0].text })
    // Initial top-layer state, not a pointer/keyboard action against an app.
    await page.evaluate(() => document.querySelector('.srb-role-menu').showPopover())
    const result = await page.evaluate(() => {
      const el = document.querySelector('.srb-role-menu'), menu = getComputedStyle(el), rect = el.getBoundingClientRect()
      const rows = [...el.querySelectorAll('button')].map(row => {
        const css = getComputedStyle(row), r = row.getBoundingClientRect(), title = row.firstElementChild, desc = row.querySelector('small')
        const t = title.getBoundingClientRect(), d = desc.getBoundingClientRect(), tc = getComputedStyle(title), dc = getComputedStyle(desc)
        return { x: r.x - rect.x, y: r.y - rect.y, width: r.width, height: r.height, padding: css.padding, color: css.color,
          font: [tc.fontSize, tc.lineHeight, tc.fontWeight], label: [t.x - r.x, t.y - r.y], description: [d.x - r.x, d.y - r.y, dc.fontSize, dc.lineHeight, dc.color], background: css.backgroundColor }
      })
      return { width: rect.width, height: rect.height, padding: menu.padding, overflow: menu.overflow, color: menu.color, background: menu.backgroundColor, border: menu.borderColor,
        scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, rows }
    })
    assert.equal(result.padding, '5px')
    assert.equal(result.overflow, 'hidden')
    assert.equal(result.width, 280); assert.equal(result.height, 142)
    assert.equal(result.color, dark ? 'rgb(230, 230, 230)' : 'rgb(36, 36, 36)')
    assert.equal(result.background, dark ? 'rgba(41, 42, 45, 0.97)' : 'rgba(255, 255, 255, 0.97)')
    assert.equal(result.border, dark ? 'rgb(68, 69, 73)' : 'rgb(223, 224, 227)')
    assert.equal(result.scrollHeight, result.clientHeight); assert.equal(result.scrollWidth, result.clientWidth)
    for (const [index, row] of result.rows.entries()) {
      assert.equal(row.x, 6); assert.equal(row.y, 6 + index * 66)
      assert.equal(row.width, 268); assert.equal(row.height, 64)
      assert.equal(row.padding, '7px 10px'); assert.equal(row.color, result.color)
      assert.deepEqual(row.font, ['13px', '20px', index ? '400' : '500'])
      assert.deepEqual(row.label, [10, 7])
      assert.deepEqual(row.description, [10, 30, '11px', '18px', dark ? 'rgb(156, 156, 156)' : 'rgb(117, 117, 117)'])
    }
    assert.equal(result.rows[0].background, dark ? 'rgb(55, 55, 55)' : 'rgb(240, 240, 240)')
    console.log(JSON.stringify({ dark, ...result }))
    await page.setViewportSize({ width: 240, height: 140 })
    const small = await page.evaluate(() => {
      const el = document.querySelector('.srb-role-menu'), css = getComputedStyle(el), rect = el.getBoundingClientRect()
      return { width: rect.width, height: rect.height, overflowY: css.overflowY, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
    })
    assert.equal(small.width, 216); assert.equal(small.height, 116); assert.equal(small.overflowY, 'auto')
    assert.ok(small.scrollHeight > small.clientHeight); assert.equal(small.scrollWidth, small.clientWidth)
    console.log(JSON.stringify({ dark, constrainedViewport: small }))
    await page.close()
  }
} finally { await browser.close() }
