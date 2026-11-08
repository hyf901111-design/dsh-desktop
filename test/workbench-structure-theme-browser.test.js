import { afterAll, beforeAll, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { buildResearchHtmlPreview } from '../packages/dsh-research-task-runtime/html-artifact.js'

let browser
beforeAll(async () => {
  const path = process.env.SHERLOCK_TEST_PLAYWRIGHT || '/Users/heyafeng/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.js'
  const { chromium } = await import(/* @vite-ignore */pathToFileURL(path).href)
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SHERLOCK_TEST_CHROMIUM || '/Users/heyafeng/Library/Caches/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-mac-arm64/chrome-headless-shell'
  })
}, 30000)
afterAll(async () => browser?.close())

const html = `<style>
.chart .node { background:var(--sherlock-surface-raised);border:1px solid var(--sherlock-border);border-radius:8px }
.chart .role { color:var(--sherlock-text-muted) }
.chart .vline { background:var(--sherlock-border);width:1px;height:20px }
</style><main>
<div class="chart">
  <div class="node root" id="root"><span class="role">负责人</span><strong class="name">原有人员</strong></div>
  <div class="vline" id="rail"></div>
  <div class="node" id="peer"><span class="role">部门</span><strong class="name">原有部门</strong></div>
</div>
<div style="display:grid;grid-template-columns:repeat(2,1fr)">
  <div id="department" style="border:1px solid var(--sherlock-border);border-radius:6px"><div>综合部门</div><div>负责人待核</div></div>
  <div id="control" style="border:1px solid var(--sherlock-border);border-radius:6px"><button>普通控制</button></div>
</div>
<section data-sherlock-structure="info" id="info"><h3>资料卡片</h3><a href="https://example.com/source">原始出处</a></section>
<svg viewBox="0 0 100 45" aria-label="关系图">
  <path id="path" data-sherlock-structure="connector" d="M 10 20 L 50 20" stroke="#777777"/>
  <g data-sherlock-structure="primary">
    <rect id="svg-node" x="50" y="10" width="40" height="30" fill="#777777"/>
    <text id="svg-label" x="52" y="25" fill="#222222">根节点</text>
  </g>
</svg></main>`

it('已保存的组织图和资料卡与新组件一起响应易方达模式', async () => {
  const page = await browser.newPage()
  try {
    await page.setContent(buildResearchHtmlPreview(html, '组织结构', 'light', {workbench:true,notoFont:'runtime'}))
    const frame = page.frameLocator('iframe')
    const read = (selector, property) => frame.locator(selector).evaluate((element, key) => getComputedStyle(element)[key], property)
    const switchMode = mode => frame.locator('html').evaluate((element, style) => element.dataset.workbenchStyle = style, mode)
    const lightRoot = await read('#root', 'backgroundColor')
    expect(lightRoot).not.toBe('rgb(0, 80, 150)')
    expect(await read('#department', 'borderRadius')).toBe('6px')

    await switchMode('enterprise')
    expect(await read('#root', 'backgroundColor')).toBe('rgb(0, 80, 150)')
    expect(await read('#root .role', 'color')).toBe('rgb(255, 255, 255)')
    expect(await read('#peer', 'backgroundColor')).toMatch(/^color\(srgb /u)
    expect(await read('#rail', 'backgroundColor')).toMatch(/^color\(srgb /u)
    expect(await read('#department', 'borderLeftColor')).toBe('rgb(0, 120, 180)')
    expect(await read('#info', 'borderLeftWidth')).toBe('2px')
    expect(await read('#control', 'borderRadius')).toBe('6px')
    expect(await read('#path', 'stroke')).toBe('rgb(0, 120, 180)')
    expect(await read('#svg-node', 'fill')).toBe('rgb(0, 80, 150)')
    expect(await read('#svg-label', 'fill')).toBe('rgb(255, 255, 255)')
    expect(await frame.locator('#department').textContent()).toContain('负责人待核')
    expect(await frame.locator('#info a').getAttribute('href')).toBe('https://example.com/source')

    await switchMode('light')
    expect(await read('#root', 'backgroundColor')).toBe(lightRoot)
    expect(await read('#department', 'borderRadius')).toBe('6px')
    expect(await read('#svg-node', 'fill')).toBe('rgb(119, 119, 119)')
  } finally {
    await page.close()
  }
}, 15000)
