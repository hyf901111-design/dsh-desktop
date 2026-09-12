// D39: exercise the installed Office page layout in isolated Chromium.
// This is layout evidence, not packaged-client acceptance.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const officeSource = await readFile(new URL('../build/sherlock-plugin-profile/vendor/@huanlin/dsh-plugin-better-sidebar-plugin-office/lib/client.js', import.meta.url), 'utf8')
const panelCss = await readFile(new URL('../src/preload/figma-file-panel.css', import.meta.url), 'utf8')
const officeCssLine = officeSource.split('\n').find(line => line.includes('const css$1 = "/* Office preview styles'))
assert(officeCssLine, 'pinned Office stylesheet must exist')
const officeCss = JSON.parse(officeCssLine.slice(officeCssLine.indexOf('=') + 1).trim().replace(/;$/, ''))
const wrapperStart = officeSource.indexOf('var wrapperStyle = `') + 'var wrapperStyle = `'.length
assert(wrapperStart >= 'var wrapperStyle = `'.length, 'pinned docx-preview wrapper style must exist')
const wrapperCss = officeSource.slice(wrapperStart, officeSource.indexOf('`;', wrapperStart)).replaceAll('${c}', 'docx')
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js')
const chromium = playwright.chromium ?? playwright.default?.chromium
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
  await page.setContent(`<!doctype html><style>
    body{margin:0} [data-dsh-panel-host]{width:340px;height:731px;display:flex}
    [data-dsh-panel-host]>div{min-width:0;width:100%}
    .docx{box-sizing:border-box;flex:none;width:816px;height:1056px;padding:96px}
    .docx p{margin:0;white-space:nowrap} [data-bottom]{margin-top:600px!important}
    ${officeCss}
  </style><style>${panelCss}</style><main data-dsh-panel-host>
    <div class="dsh_32k8zk_editorDocx"><div class="dsh_32k8zk_editorDocxViewport">
      <div class="dsh_32k8zk_editorDocxWrap" style="zoom:1"><div style="width:100%;height:100%;min-width:0;min-height:0">
        <style>${wrapperCss}</style><div class="docx-wrapper">
          <section class="docx"><p>文件阅读验收样本</p></section>
          <section class="docx"><p>第二页记录</p><p data-bottom>末尾标记</p></section>
        </div>
      </div></div>
    </div></div>
  </main>`)

  const results = []
  for (const [width, zoom] of [[340, 1], [340, .5], [340, 2], [1200, 1]]) {
    const metrics = await page.evaluate(({ width, zoom }) => {
      const host = document.querySelector('[data-dsh-panel-host]')
      const viewport = document.querySelector('[class*="_editorDocxViewport"]')
      const wrap = document.querySelector('[class*="_editorDocxWrap"]')
      host.style.width = `${width}px`
      wrap.style.zoom = zoom
      viewport.scrollLeft = 0
      viewport.scrollTop = 0
      const v = viewport.getBoundingClientRect()
      const first = document.querySelector('section.docx').getBoundingClientRect()
      const content = document.querySelector('section.docx p').getBoundingClientRect()
      const origin = { left: first.left - v.left, contentLeft: content.left - v.left, pageWidth: first.width, pageHeight: first.height, scrollLeft: viewport.scrollLeft }
      viewport.scrollLeft = 1e6
      const right = document.querySelector('section.docx').getBoundingClientRect().right - v.right
      viewport.scrollLeft = -1e6
      const restoredLeft = document.querySelector('section.docx').getBoundingClientRect().left - v.left
      viewport.scrollTop = 1e6
      const bottom = document.querySelector('[data-bottom]').getBoundingClientRect().bottom - v.bottom
      return { width, zoom, ...origin, right, restoredLeft, bottom, clientWidth: viewport.clientWidth, scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight }
    }, { width, zoom })
    results.push(metrics)
    console.log(JSON.stringify(metrics))
    assert.equal(metrics.clientWidth, width, 'fixture must preserve the real viewport width')
    assert(metrics.left >= 0, `${width}px at ${zoom * 100}%: page starts ${metrics.left}px before the reachable scroll origin`)
    assert(metrics.contentLeft >= 0, 'opening text must be reachable at horizontal origin')
    assert(Math.abs(metrics.pageWidth - 816 * zoom) < .1, 'original page width must survive zoom')
    assert(Math.abs(metrics.pageHeight - 1056 * zoom) < .1, 'original page height must survive zoom')
    assert(metrics.right <= 1, 'horizontal scrolling must reach the right page edge')
    assert(metrics.restoredLeft >= 0, 'horizontal scrolling must return to the complete left page edge')
    assert(metrics.bottom <= 1, 'vertical scrolling must reach second-page final text')
  }
  assert(results[3].left > 100, 'a page that fits should remain centered')
  console.log('DOCX scroll layout passed: 340px at 50/100/200%, 1200px at 100%, original page dimensions and both scroll axes preserved')
} finally {
  await browser.close()
}
