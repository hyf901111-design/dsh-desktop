// Narrow Chromium regression for the real shell CSS and vendor portal hierarchy.
// This controlled fixture does not launch, modify, or invoke the packaged client.
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const out = join(process.cwd(), 'output/figma-settings-overlay-20260910')
const css = (await Promise.all(['figma-final-shell.css', 'figma-settings.css'].map(name => readFile('src/preload/' + name, 'utf8')))).join('\n')
const playwright = await import(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')
const chromium = playwright.chromium ?? playwright.default?.chromium
const browser = await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {})
await mkdir(out, { recursive: true })
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } })
const cdp = await page.context().newCDPSession(page)
const errors = []
page.on('pageerror', error => errors.push(error.message))
const results = []
const names = async () => (await cdp.send('Accessibility.getFullAXTree')).nodes.filter(node => !node.ignored).map(node => node.name?.value).filter(Boolean)
try {
  for (const theme of ['light', 'dark']) {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;font:14px sans-serif}[hidden]{display:none!important}
      .pI_x6G_frame{height:100vh}.VOzbGW_overlay{position:fixed;inset:0;z-index:1000;background:#eee}
      /* Sidebar headers explicitly restore visibility in the production vendor
         stylesheet. Hiding only their parent leaves them beneath the glass. */
      .qDHVXG_sectionLabel,.qDHVXG_headerActions{visibility:visible!important}
      .VOzbGW_panel{height:100vh;padding:80px 300px}button,input{padding:8px}
      [data-dsh-panel-host]{position:fixed;inset:0;z-index:40;pointer-events:none}
      .t8lSSG_panel{position:absolute;width:340px;pointer-events:auto}.sRp_root{padding:20px}
      [data-settings-model-popover]{position:fixed;left:500px;top:200px;z-index:10001;background:white;padding:12px}
      [data-ds-dark-theme] .VOzbGW_overlay{background:#292a2d;color:#eee}
    </style><style>${css}</style><body ${theme === 'dark' ? 'data-ds-dark-theme' : ''}>
      <div class="pI_x6G_frame"><main>研究画布</main>
        <aside><button class="qDHVXG_sectionLabel">研究看板</button><button class="qDHVXG_sectionLabel">工作区</button><div class="qDHVXG_headerActions"><button>看板视图选项</button></div><input aria-label="主页草稿" value="safdsa"></aside>
        <div class="VOzbGW_overlay" hidden>
        <section class="VOzbGW_panel" role="dialog" aria-modal="true" aria-label="设置">
          <h1>关于</h1><button id="check-update">检查更新</button>
        </section></div></div>
      <div data-dsh-panel-host><aside class="t8lSSG_panel" aria-label="研究面板"><div class="sRp_root">
        <button data-active-tab="conversation">共享对话</button><p>真实任务状态区域</p>
        <input aria-label="研究输入" value="尚未发送的草稿"><button>发送研究消息</button>
      </div></aside></div>
      <div data-settings-model-popover hidden><button>设置模型选项</button></div></body>`)
    const host = page.locator('[data-dsh-panel-host]')
    assert.equal(await host.isVisible(), true)
    assert((await names()).includes('研究输入'))
    assert.equal(await page.getByRole('button', { name: '工作区', exact: true }).isVisible(), true)
    await page.evaluate(() => { window.originalDraft = document.querySelector('[aria-label="主页草稿"]') })
    await page.evaluate(() => {
      document.querySelector('.VOzbGW_overlay').hidden = false
      document.querySelector('[data-settings-model-popover]').hidden = false
      document.getElementById('check-update').focus()
    })
    assert.equal(await host.isVisible(), false, 'settings must hide the external sidebar portal')
    assert.equal(await page.getByRole('button', { name: '设置模型选项' }).isVisible(), true)
    assert(!(await names()).includes('研究输入'), 'hidden research composer must leave the accessibility tree')
    assert((await names()).includes('检查更新'))
    for (const name of ['研究看板', '工作区', '看板视图选项']) {
      assert.equal(await page.getByRole('button', { name, exact: true, includeHidden: true }).isVisible(), false, name + ' must not show through the settings glass')
      assert(!(await names()).includes(name), name + ' must leave the accessibility tree')
    }
    await page.evaluate(() => {
      const portal = document.querySelector('[data-dsh-panel-host]')
      // guardAnchor reattaches this same host when the vendor portal is disturbed.
      portal.remove()
      portal.style.display = 'block'
      document.body.appendChild(portal)
      portal.querySelector('p').textContent = '后台生成已完成'
    })
    assert.equal(await host.isVisible(), false, 'background completion and portal reattachment must stay hidden')
    const topAtPanel = await page.evaluate(() => document.elementFromPoint(1100, 100)?.closest('.VOzbGW_panel') !== null)
    assert.equal(topAtPanel, true, 'the settings dialog must own the former research panel hit area')
    assert(!(await names()).includes('研究输入'))
    await page.screenshot({ path: join(out, `${theme}-settings-visible.png`) })
    await page.evaluate(() => {
      document.querySelector('.VOzbGW_overlay').remove()
      document.querySelector('[data-settings-model-popover]').hidden = true
    })
    assert.equal(await host.isVisible(), true)
    assert.equal(await page.getByRole('button', { name: '工作区', exact: true }).isVisible(), true)
    assert.equal(await page.evaluate(() => document.querySelector('[aria-label="主页草稿"]') === window.originalDraft), true)
    assert.equal(await page.getByRole('textbox', { name: '主页草稿' }).inputValue(), 'safdsa')
    assert.equal(await page.locator('[data-active-tab]').getAttribute('data-active-tab'), 'conversation')
    assert.equal(await page.getByRole('textbox', { name: '研究输入' }).inputValue(), '尚未发送的草稿')
    await page.getByRole('textbox', { name: '研究输入' }).focus()
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '研究输入')
    assert((await names()).includes('研究输入'))
    await page.screenshot({ path: join(out, `${theme}-research-restored.png`) })
    results.push({ theme, sidebarHeadersHidden: true, sidebarHeadersRestored: true, originalDraftNodePreserved: true, settingsPortalHidden: true, reattachedPortalHidden: true, researchAbsentFromAX: true, settingsPopoverVisible: true, hitAreaOwnedBySettings: true, restoredDraft: true, restoredConversation: true })
  }
  assert.deepEqual(errors, [])
  await writeFile(join(out, 'results.json'), JSON.stringify({ evidence: 'controlled Chromium fixture; production shell CSS and vendor DOM hierarchy', results, errors }, null, 2))
  console.log(JSON.stringify({ passed: true, output: out, results, errors }, null, 2))
} finally {
  await browser.close()
}
