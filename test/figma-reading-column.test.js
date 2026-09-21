import { readFileSync, readdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'

// Full installed frontend and native layout/conversation styles, followed by
// every shell sheet in production order. The fixture follows the native
// display:contents slot ancestry observed in the packaged conversation.
const read = path => readFileSync(path, 'utf8')
const assets = 'node_modules/@deepseek-ai/dsh-web-frontend/dist/assets'
const frontend = readdirSync(assets).filter(name => /^index-.*\.css$/.test(name)).map(name => read(`${assets}/${name}`)).join('\n')
const native = ['layout', 'conversation'].map(name => [...read(`node_modules/@deepseek-ai/dsh-client-ui-${name}/lib/client.js`).matchAll(/const css(?:\$\d+)? = ("(?:[^"\\]|\\.)*");/g)].map(m => JSON.parse(m[1])).join('\n')).join('\n')
const shell = read('src/preload/shell-style.ts')
const imports = [...shell.matchAll(/import (\w+) from '(\.\/[^']+\.css)\?raw'/g)]
const css = shell.match(/style\.textContent = ([^\n]+)/)[1].split('+').map(name => name.trim() === 'desktopShellStyles'
  ? shell.match(/const desktopShellStyles = `([\s\S]*?)`/)[1]
  : read('src/preload/' + imports.find(m => m[1] === name.trim())[2].slice(2))).join('\n')
let browser
beforeAll(async () => {
  const module = await import(/* @vite-ignore */ pathToFileURL(process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js').href)
  browser = await (module.default ?? module).chromium.launch({ headless: true, executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell' })
})
afterAll(async () => { await browser?.close() })
function html(long = false) {
  const paragraph = '正文列宽验收，保留原始段落和滚动行为。'.repeat(long ? 80 : 1)
  return `<div id="root">
    <div class="pI_x6G_frame" data-dsh-frame="true" style="grid-template-columns:280px 1fr">
      <aside></aside><main class="pI_x6G_centerCol" data-pane="conversation">
        <div class="wSkVaW_root" data-phase="active" data-odyssey-page="conversation">
          <header style="height:56px;flex:none"></header>
          <div class="wSkVaW_scrollBody" data-conversation-scroll>
            <div data-slot="conversation.session" style="display:contents"><div class="wSkVaW_viewArea">
              <div data-slot="conversation.view" style="display:contents"><div class="Md3f7G_root">
                <div class="Md3f7G_scroll"><div class="Md3f7G_column" data-chat-flow>
                  <div class="Md3f7G_flowItem" data-chat-flow-kind="assistant-step">
                    <div data-slot="conversation.chat.node" style="display:contents"><div data-assistant-message-id="fixture">
                      <div class="Sxvs8a_root"><div class="Sxvs8a_body"><div class="_markdown_1nba0_5"><p>${paragraph}</p></div></div></div>
                    </div></div>
                  </div>
                </div></div>
              </div></div>
            </div></div>
          </div>
          <div data-center-composer-host><div class="wSkVaW_composerSeat"><div class="wSkVaW_composerStack">
            <div class="lXshSW_root"><div class="lXshSW_header">任务</div></div>
            <div class="uV2eYG_root"><div class="uV2eYG_card">
              <div class="uV2eYG_scroll"><textarea class="uV2eYG_input"></textarea></div><div class="uV2eYG_row"></div>
            </div><div class="odyssey-run-info">1轮</div></div>
          </div></div></div>
        </div>
      </main>
    </div>
  </div><aside data-dsh-panel-host data-odyssey-panel-right="closed"></aside>`
}

async function open(dark = false, long = false) {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 }, reducedMotion: 'reduce' })
  await page.route('**/*', r => r.abort())
  await page.setContent(`<style>${frontend}\n${native}\n${css}</style><body ${dark ? 'data-ds-dark-theme' : ''}>${html(long)}</body>`)
  return page
}
async function columns(page) {
  return page.evaluate(() => {
    const measure = selector => { const el = document.querySelector(selector), r = el.getBoundingClientRect(); return { x: r.x, width: r.width } }
    return { body: measure('.Md3f7G_column'), input: measure('.uV2eYG_card'), task: measure('.lXshSW_root'), stats: measure('.odyssey-run-info') }
  })
}
for (const dark of [false, true]) it(`${dark ? 'dark' : 'light'} main reading aligns with the input for long/short replies and an open right panel`, async () => {
  const page = await open(dark)
  try {
    for (const rightOpen of [false, true]) for (const long of [false, true]) {
      await page.locator('[data-dsh-panel-host]').evaluate((el, open) => el.dataset.odysseyPanelRight = open ? 'open' : 'closed', rightOpen)
      await page.locator('._markdown_1nba0_5 > p').evaluate((el, long) => el.textContent = '正文列宽验收，保留原始段落和滚动行为。'.repeat(long ? 80 : 1), long)
      const m = await columns(page), expected = rightOpen ? { x: 296, width: 708 } : { x: 435, width: 780 }
      for (const column of Object.values(m)) expect(column).toEqual(expected)
      expect(await page.locator('._markdown_1nba0_5 > p').evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el).lineHeight, getComputedStyle(el).color])).toEqual(['15px', '26px', dark ? 'rgb(229, 229, 229)' : 'rgb(43, 43, 43)'])
      expect(await page.locator('.wSkVaW_scrollBody').evaluate(el => ({ horizontalOverflow: el.scrollWidth > el.clientWidth, gutter: el.getBoundingClientRect().width - el.clientWidth, overflows: el.scrollHeight > el.clientHeight }))).toEqual({ horizontalOverflow: false, gutter: 16, overflows: long })
    }
    // Width correction preserves the native scroll range and wheel scrolling.
    const port = page.locator('.wSkVaW_scrollBody')
    expect(await port.evaluate(el => { el.scrollTop = el.scrollHeight; return el.scrollTop + el.clientHeight >= el.scrollHeight - 1 })).toBe(true)
    await port.evaluate(el => { el.scrollTop = 0 })
    await port.hover()
    await page.mouse.wheel(0, 250)
    await expect.poll(() => port.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
  } finally { await page.close() }
})
for (const dark of [false, true]) it(`${dark ? 'dark' : 'light'} wide tables remain inside the shared responsive reading column`, async () => {
  const page = await open(dark, true)
  try {
    const cells = Array.from({ length: 12 }, (_, i) => `<th>Quarter_2026_${i}_Annual_Comparison</th>`).join('')
    await page.locator('._markdown_1nba0_5').evaluate((el, cells) => el.insertAdjacentHTML('beforeend', `<div class="odyssey-table-block"><div class="_tableScroll_1nba0_174"><table><thead><tr>${cells}</tr></thead><tbody><tr><td>123456.78</td></tr></tbody></table></div><div class="odyssey-table-actions"><span>可左右滚动</span><button>展开完整表格</button></div></div>`), cells)
    for (const width of [1380, 1040, 640]) {
      await page.setViewportSize({ width, height: 640 })
      const m = await columns(page)
      expect(m.body).toEqual(m.input)
      expect(m.task).toEqual(m.input)
      const table = await page.locator('._tableScroll_1nba0_174').evaluate(el => { const r = el.getBoundingClientRect(); el.scrollLeft = el.scrollWidth; return { x: r.x, width: r.width, overflows: el.scrollWidth > el.clientWidth, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 } })
      expect(table).toEqual({ ...m.input, overflows: true, end: true })
      expect(await page.locator('.wSkVaW_scrollBody').evaluate(el => el.scrollWidth === el.clientWidth)).toBe(true)
    }
  } finally { await page.close() }
})
it('keeps trajectory, child, Research and right-side reading on their own geometry', async () => {
  for (const scope of ['trajectory', 'child', 'research', 'side']) {
    const page = await open()
    try {
      await page.evaluate(scope => {
        const root = document.querySelector('.wSkVaW_root')
        if (scope === 'trajectory') { const mark = document.createElement('div'); mark.dataset.odysseyTrajectory = ''; root.append(mark) }
        if (scope === 'child') { const wrapper = document.createElement('section'); wrapper.dataset.odysseySubagentPanel = ''; wrapper.style.width = '340px'; root.before(wrapper); wrapper.append(root) }
        if (scope === 'research') root.dataset.odysseyPage = 'research'
        if (scope === 'side') document.querySelector('main').className = 'sRp_messages'
      }, scope)
      const result = await page.evaluate(() => {
        const port = document.querySelector('.wSkVaW_scrollBody'), inner = document.querySelector('.Md3f7G_scroll')
        return { widthVar: getComputedStyle(port).getPropertyValue('--dsh-chat-content-width'), gutter: getComputedStyle(port).scrollbarGutter, padding: getComputedStyle(inner).padding, input: document.querySelector('.uV2eYG_card').getBoundingClientRect().width }
      })
      expect(result.widthVar).toBe('748px')
      expect(result.gutter).toBe('stable')
      expect(result.padding).toBe(scope === 'child' ? '0px 16px' : scope === 'side' ? '16px 0px' : '16px 32px')
      if (scope === 'trajectory') expect(result.input).toBe(652)
      if (scope === 'child') expect(result.input).toBe(308)
    } finally { await page.close() }
  }
})

it('keeps research message gutters after all production sheets without moving the composer', async () => {
  const page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
  try {
    await page.setContent(`<style>${frontend}\n${native}\n${css}</style><div class="sRp_conversation" style="position:absolute;left:990px;top:10px;width:380px;height:880px;box-sizing:border-box"><div class="sRp_messages"><div class="Md3f7G_scroll"><div class="Md3f7G_column"><button>正在准备任务上下文…</button></div></div></div><div class="sRp_composer"><div class="uV2eYG_card">输入框</div></div></div>`)
    const layout = await page.evaluate(() => {
      const messages = document.querySelector('.sRp_messages'), composer = document.querySelector('.sRp_composer')
      const style = getComputedStyle(messages), box = document.querySelector('.sRp_conversation').getBoundingClientRect(), input = composer.getBoundingClientRect()
      return { left: style.paddingLeft, right: style.paddingRight, inputLeft: input.left-box.left, inputRight: box.right-input.right }
    })
    expect(layout).toEqual({left:'8px',right:'8px',inputLeft:12,inputRight:12})
  } finally { await page.close() }
})
