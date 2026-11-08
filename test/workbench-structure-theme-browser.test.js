import { afterAll, beforeAll, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { readFileSync } from 'node:fs'
import { canvasCss } from '../scripts/lib/figma-canvas-client.mjs'
import { workbenchModeCss } from '../packages/dsh-research-task-runtime/workbench-style.js'
import { buildResearchHtmlPreview } from '../packages/dsh-research-task-runtime/html-artifact.js'
import { WORKBENCH_PRESENTATION_CSS } from '../packages/dsh-research-task-runtime/workbench-presentation.js'
import { nativeMindMapDepthCss } from '../scripts/lib/research-grid-workbench.mjs'

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
.chart .node { background:var(--sherlock-surface-raised);border:1px solid var(--sherlock-border);border-radius:8px;box-shadow:inset 0 0 0 1px blue }
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
<section data-sherlock-structure="node" data-sherlock-structure-depth="2" id="custom-third"><span>三级部门</span></section>
<section data-sherlock-structure="node" data-sherlock-structure-depth="3" id="custom-fourth">四级部门</section>
<section data-sherlock-structure="info" id="info" style="border-left:4px solid red;box-shadow:inset 1px 0 red"><h3>资料卡片</h3><a href="https://example.com/source">原始出处</a></section>
<svg viewBox="0 0 100 45" aria-label="关系图">
  <path id="path" data-sherlock-structure="connector" d="M 10 20 L 50 20" stroke="#777777"/>
  <g data-sherlock-structure="primary">
    <rect id="svg-node" x="50" y="10" width="40" height="30" rx="6" fill="#777777" stroke="#777777"/>
    <path id="nested-connector" data-sherlock-structure="connector" d="M 50 25 L 80 25" stroke="#777777"/>
    <text id="svg-label" x="52" y="25" fill="#222222">根节点</text>
  </g>
  <circle id="svg-peer" data-sherlock-structure="node" data-sherlock-structure-depth="2" cx="30" cy="25" r="6" fill="#777777" stroke="#777777"/>
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
    expect(await read('#custom-primary .custom-label', 'color')).toMatch(/^color\(srgb 0\.88 /u)
    expect(await read('#peer', 'backgroundColor')).toBe('rgb(0, 120, 180)')
    expect(await read('#peer .role', 'color')).toBe('rgb(255, 255, 255)')
    expect(await read('#rail', 'backgroundColor')).toBe('rgb(150, 150, 150)')
    expect(await read('#tree-root', 'backgroundColor')).toBe('rgb(0, 80, 150)')
    expect(await read('#tree-root .node-sub', 'color')).toBe('rgb(255, 255, 255)')
    expect(await read('#tree-peer', 'backgroundColor')).toBe(await read('#peer', 'backgroundColor'))
    expect(await read('#tree-card', 'backgroundColor')).toBe('rgb(30, 185, 225)')
    expect(await read('#custom-third', 'backgroundColor')).toBe('rgb(30, 185, 225)')
    expect(await read('#custom-third span', 'color')).toBe('rgb(37, 37, 43)')
    expect(await read('#custom-fourth', 'backgroundColor')).toBe('rgb(179, 235, 255)')
    expect(await read('#tree-rail', 'backgroundColor')).toBe(await read('#rail', 'backgroundColor'))
    expect(await read('#tree-drop', 'backgroundColor')).toBe(await read('#rail', 'backgroundColor'))
    for (const selector of ['#root','#peer','#tree-root','#tree-card','#department','#info','#custom-primary']) {
      expect(await read(selector, 'borderLeftWidth')).toBe('0px')
      expect(await read(selector, 'borderTopWidth')).toBe('0px')
      expect(await read(selector, 'borderRadius')).toBe('0px')
      expect(await read(selector, 'boxShadow')).toBe('none')
    }
    expect(await read('#control', 'borderRadius')).toBe('6px')
    expect(await read('#path', 'stroke')).toBe('rgb(150, 150, 150)')
    expect(await read('#nested-connector', 'stroke')).toBe('rgb(150, 150, 150)')
    expect(await read('#svg-node', 'fill')).toBe('rgb(0, 80, 150)')
    expect(await read('#svg-node', 'stroke')).toBe('none')
    expect(await read('#svg-node', 'rx')).toBe('0px')
    expect(await read('#svg-peer', 'fill')).toBe('rgb(30, 185, 225)')
    expect(await read('#svg-peer', 'stroke')).toBe('none')
    expect(await read('#svg-label', 'fill')).toBe('rgb(255, 255, 255)')
    expect(await frame.locator('#department').textContent()).toContain('负责人待核')
    expect(await frame.locator('#info a').getAttribute('href')).toBe('https://example.com/source')

    await switchMode('light')
    expect(await read('#root', 'backgroundColor')).toBe(lightRoot)
    expect(await read('#tree-root', 'backgroundColor')).toBe(lightTreeRoot)
    expect(await read('#department', 'borderRadius')).toBe('6px')
    expect(await read('#info', 'borderLeftWidth')).toBe('4px')
    expect(await read('#svg-node', 'fill')).toBe('rgb(119, 119, 119)')
    expect(await read('#svg-node', 'stroke')).toBe('rgb(119, 119, 119)')
    expect(await read('#svg-node', 'rx')).toBe('6px')
  } finally {
    await page.close()
  }
}, 15000)


it.each([true, false])('原生导图有无旧外层标记均切换配色（%s）', async legacy => {
  const page = await browser.newPage()
  try {
    const content = ' .rScV5Q_containerContent'
    const nativePresentation = WORKBENCH_PRESENTATION_CSS
      .replaceAll(':root[data-sherlock-theme="dark"]', 'body[data-ds-dark-theme] [data-ework-grid]' + content)
      .replaceAll('body .rScV5Q_mindMap', 'body [data-ework-grid]' + content + ' .rScV5Q_mindMap')
    const css = canvasCss + nativePresentation +
      '@layer ework-workbench{' + workbenchModeCss('body [data-ework-grid]', content) + nativeMindMapDepthCss + '}' +
      readFileSync('scripts/lib/workbench-style.css', 'utf8')
    await page.setContent(`<style>${css}</style><div data-ework-grid data-workbench-style="dark">
      <article data-research-node-id="mind" data-research-compact-chrome ${legacy?'data-research-generated-mind-map':'data-research-container-type="mind-map"'}>
        <div class="rScV5Q_containerContent">
        <div class="rScV5Q_mindMap"><svg data-research-mind-map-edges></svg>
          <span class="rScV5Q_mindMapNode" data-research-mind-map-node data-research-mind-map-depth="0">根节点</span>
          <span class="rScV5Q_mindMapNode" data-research-mind-map-node data-research-mind-map-depth="1">下属节点</span>
          <span class="rScV5Q_mindMapNode" data-research-mind-map-node data-research-mind-map-depth="2">三级节点</span>
          <span class="rScV5Q_mindMapNode" data-research-mind-map-node data-research-mind-map-depth="3">四级节点</span>
          <span class="rScV5Q_mindMapNode" data-research-mind-map-node data-research-mind-map-depth="9">扩展层级</span>
        </div>
        </div>
      </article>
    </div>`)
    const board = page.locator('[data-ework-grid]')
    const style = () => page.locator('.rScV5Q_mindMapNode').evaluateAll(nodes => nodes.map(node => {
      const {backgroundColor,color,borderRadius,borderLeftWidth} = getComputedStyle(node)
      return {backgroundColor,color,borderRadius,borderLeftWidth}
    }))
    const dark = await style()
    await board.evaluate(node => node.dataset.workbenchStyle='enterprise')
    const enterprise = await style()
    expect(enterprise[0]).toEqual({backgroundColor:'rgb(0, 80, 150)',color:'rgb(255, 255, 255)',borderRadius:'0px',borderLeftWidth:'0px'})
    expect(enterprise.slice(1).map(node=>node.backgroundColor)).toEqual(['rgb(0, 120, 180)','rgb(30, 185, 225)','rgb(179, 235, 255)','rgb(204, 204, 204)'])
    expect(enterprise[1].color).toBe('rgb(255, 255, 255)')
    expect(enterprise[2].color).toBe('rgb(37, 37, 43)')
    expect(enterprise.every(node=>node.borderLeftWidth==='0px'&&node.borderRadius==='0px')).toBe(true)
    expect(await page.locator('[data-research-mind-map-edges]').evaluate(node => getComputedStyle(node).color)).toBe('rgb(150, 150, 150)')
    await board.evaluate(node => node.dataset.workbenchStyle='dark')
    expect(await style()).toEqual(dark)
    expect(await page.locator('.rScV5Q_mindMapNode').allTextContents()).toEqual(['根节点','下属节点','三级节点','四级节点','扩展层级'])
  } finally {
    await page.close()
  }
}, 15000)
