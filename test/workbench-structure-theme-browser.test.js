import { afterAll, beforeAll, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { canvasCss } from '../scripts/lib/figma-canvas-client.mjs'
import { workbenchModeCss } from '../packages/dsh-research-task-runtime/workbench-style.js'
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
.custom-label { color:var(--sherlock-muted) }
.chart .vline { background:var(--sherlock-border);width:1px;height:20px }
</style><main>
<div class="chart">
  <div class="node root" id="root"><span class="role">负责人</span><strong class="name">原有人员</strong></div>
  <div class="vline" id="rail"></div>
  <div class="node" id="peer"><span class="role">部门</span><strong class="name">原有部门</strong></div>
</div>
<div class="tree">
  <div class="node" id="tree-root"><div class="node-title">会员大会</div><div class="node-sub">权力机构</div></div>
  <div class="vline" id="tree-rail"></div>
  <div class="node" id="tree-peer"><div class="node-title">会员代表大会</div><div class="node-sub">选举</div></div>
  <div class="branches"><div class="branch"><div class="drop" id="tree-drop"></div><div class="card" id="tree-card"><h3>理事会</h3></div></div></div>
</div>
<div style="display:grid;grid-template-columns:repeat(2,1fr)">
  <div id="department" style="border:1px solid var(--sherlock-border);border-radius:6px"><div>综合部门</div><div>负责人待核</div></div>
  <div id="control" style="border:1px solid var(--sherlock-border);border-radius:6px"><button>普通控制</button></div>
</div>
<section data-sherlock-structure="primary" id="custom-primary"><div class="custom-label">职位与出处</div></section>
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

    const lightTreeRoot = await read('#tree-root', 'backgroundColor')
    await switchMode('enterprise')
    expect(await read('#root', 'backgroundColor')).toBe('rgb(0, 80, 150)')
    expect(await read('#root .role', 'color')).toBe('rgb(255, 255, 255)')
    expect(await read('#custom-primary .custom-label', 'color')).toMatch(/^color\(srgb 0\.8 /u)
    expect(await read('#peer', 'backgroundColor')).toMatch(/^color\(srgb /u)
    expect(await read('#rail', 'backgroundColor')).toMatch(/^color\(srgb /u)
    expect(await read('#tree-root', 'backgroundColor')).toBe('rgb(0, 80, 150)')
    expect(await read('#tree-root .node-sub', 'color')).toBe('rgb(255, 255, 255)')
    expect(await read('#tree-peer', 'backgroundColor')).toBe(await read('#peer', 'backgroundColor'))
    expect(await read('#tree-card', 'backgroundColor')).toBe(await read('#peer', 'backgroundColor'))
    expect(await read('#tree-rail', 'backgroundColor')).toBe(await read('#rail', 'backgroundColor'))
    expect(await read('#tree-drop', 'backgroundColor')).toBe(await read('#rail', 'backgroundColor'))
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
    expect(await read('#tree-root', 'backgroundColor')).toBe(lightTreeRoot)
    expect(await read('#department', 'borderRadius')).toBe('6px')
    expect(await read('#svg-node', 'fill')).toBe('rgb(119, 119, 119)')
  } finally {
    await page.close()
  }
}, 15000)


it.each([true, false])('原生导图有无旧外层标记均切换配色（%s）', async legacy => {
  const page = await browser.newPage()
  try {
    const css = canvasCss + workbenchModeCss('body [data-ework-grid]', ' [data-research-node-id]') +
      readFileSync('scripts/lib/workbench-style.css', 'utf8')
    await page.setContent(`<style>${css}</style><div data-ework-grid data-workbench-style="dark">
      <article data-research-node-id="mind" data-research-compact-chrome ${legacy?'data-research-generated-mind-map':'data-research-container-type="mind-map"'}>
        <div class="rScV5Q_mindMap"><svg data-research-mind-map-edges></svg>
          <div class="rScV5Q_mindMapNode" data-research-mind-map-depth="0">根节点</div>
          <div class="rScV5Q_mindMapNode" data-research-mind-map-depth="1">下属节点</div>
        </div>
      </article>
    </div>`)
    const board = page.locator('[data-ework-grid]')
    const style = () => page.locator('.rScV5Q_mindMapNode').evaluateAll(nodes => nodes.map(node => {
      const {backgroundColor,color,borderRadius} = getComputedStyle(node)
      return {backgroundColor,color,borderRadius}
    }))
    const dark = await style()
    await board.evaluate(node => node.dataset.workbenchStyle='enterprise')
    const enterprise = await style()
    expect(enterprise[0]).toEqual({backgroundColor:'rgb(0, 80, 150)',color:'rgb(255, 255, 255)',borderRadius:'0px'})
    expect(enterprise[1].backgroundColor).toMatch(/^color\(srgb /u)
    expect(enterprise[1].color).toBe('rgb(60, 60, 60)')
    expect(await page.locator('[data-research-mind-map-edges]').evaluate(node => getComputedStyle(node).color)).toMatch(/^color\(srgb /u)
    await board.evaluate(node => node.dataset.workbenchStyle='dark')
    expect(await style()).toEqual(dark)
    expect(await page.locator('.rScV5Q_mindMapNode').allTextContents()).toEqual(['根节点','下属节点'])
  } finally {
    await page.close()
  }
}, 15000)
