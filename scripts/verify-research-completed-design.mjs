// Focused CSS contract in real Chromium; no app build, profile or production data.
// PLAYWRIGHT_MODULE_PATH and PLAYWRIGHT_EXECUTABLE_PATH may select local runtimes.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canvasCss } from './lib/figma-canvas-client.mjs'
import { researchCompletedDesignCss } from './lib/research-completed-design.mjs'

const modulePath = process.env.PLAYWRIGHT_MODULE_PATH || 'playwright'
const playwright = await import(isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath)
const chromium = playwright.chromium ?? playwright.default.chromium
const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || process.env.SHERLOCK_TEST_CHROMIUM
const output = resolve(process.env.SHERLOCK_COMPLETED_DESIGN_EVIDENCE || 'output/research-completed-design')
await mkdir(output, { recursive: true })

const card = (id, type, body, extra = '') => `<article id="${id}" data-research-compact-chrome data-research-generated-container data-research-artifact-card="${id}" data-research-generation-state="completed" ${extra}><header class="rScV5Q_nodeTitle"><span class="rScV5Q_nodeTitleText">持仓穿透 / 组合风险</span>${id === 'kpi' ? '<span data-research-component-header-note title="09.22 · 研究模拟"><span data-header-note-numeric>09.22</span> · 研究模拟</span>' : ''}<div class="rScV5Q_nodeTitleActions"><button class="rScV5Q_containerExpand" aria-label="展开组件">⛶</button><button class="rScV5Q_containerMenuTrigger" aria-label="更多操作">⋯</button></div></header><div class="rScV5Q_previewBody"><div class="rScV5Q_artifactBody"><div class="rScV5Q_generatedContainer" data-research-container-type="${type}"><div class="rScV5Q_containerContent"><div class="odyssey-component-content" data-component-width="wide"><div class="odyssey-component-primary">${body}</div></div></div></div></div></div></article>`
const kpi = `<div class="rScV5Q_containerKpis">${['穿透基金', '穿透覆盖率', '底层证券', '前十大集中度'].map((label, index) => `<div><span>${label}</span><strong data-research-metric-positive="true">${['8只', '92.6%', '186', '38.4%'][index]}</strong><em>基于已披露权益持仓</em></div>`).join('')}</div>`
const table = '<div class="rScV5Q_containerTableScroll"><table><thead><tr><th>证券 / 模拟简称</th><th data-numeric="true">穿透权重</th><th>操作</th></tr></thead><tbody><tr><td><span>华芯科技 S001</span></td><td data-numeric="true">6.42%</td><td><a href="#compare">对比</a></td></tr><tr><td>远航装备 S002</td><td data-numeric="true">5.18%</td><td>中等</td></tr></tbody></table></div>'
const chart = '<div class="rScV5Q_containerChart" data-research-container-chart="line"><svg viewBox="0 0 860 100"><polyline id="series" points="0,90 200,60 400,80 830,15" fill="none" stroke="#005096" stroke-width="1.6"></polyline><text class="rScV5Q_chartLabel" x="8" y="98">2026</text></svg><div class="rScV5Q_chartLegend"><i style="background:#1eb9e1"></i>基金收益</div></div>'
// Inline iframe styling proves that shell rules do not restyle its document.
const iframe = '<iframe class="rScV5Q_webFrame" title="HTML 组件" srcdoc="<p style=\'color:rgb(19,29,39);font:17px/25px serif\'>HTML 正文保持沙箱样式</p>"></iframe>'
const markup = card('kpi', 'kpi', kpi, 'data-selected="true"') + card('table', 'table', table) + card('chart', 'chart', chart) + card('markdown', 'markdown', '<div class="rScV5Q_containerMarkdown"><p>当前持仓覆盖 92.6%，其余 7.4% 暂未披露。</p><a href="#source">查看来源</a></div>') + card('html', 'html', iframe) + card('news', 'news', '<p>资讯转换后的组件外壳</p>') + card('web', 'web', '<p>网页组件外壳</p>') + card('mindmap', 'mind-map', '<div class="rScV5Q_mindMap">不在本次 CSS 范围</div>', 'data-research-generated-mind-map') + card('draft', 'draft', '<div class="rScV5Q_containerDraft"><textarea>创建组件</textarea></div>') + card('generation', '', '<div data-research-generation-process data-generation-ui-state="running">正在生成</div>')
// Fixture layout only supplies DOM geometry otherwise provided by the client.
const fixtureCss = `body{margin:24px;background:#eee;display:grid;grid-template-columns:896px;gap:20px}body[data-ds-dark-theme]{background:#242424}article{box-sizing:border-box;display:flex;flex-direction:column;width:896px;position:relative;border:1px solid transparent}.rScV5Q_nodeTitle{display:flex;flex:none;position:relative}.rScV5Q_nodeTitleActions{position:absolute;display:flex}.rScV5Q_previewBody{flex:1}.rScV5Q_containerKpis{display:grid}.rScV5Q_containerKpis>div{display:flex;flex-direction:column}table{width:100%}#kpi{height:132px}#table{height:174px}#chart{height:220px}#markdown{height:132px}#html,#web,#news,#mindmap,#draft,#generation{height:160px}#html :is(.rScV5Q_artifactBody,.rScV5Q_generatedContainer,.rScV5Q_containerContent,.odyssey-component-content,.odyssey-component-primary){height:100%;min-height:0}.rScV5Q_webFrame{width:100%;height:100%;border:0}`
const legacyCss = canvasCss.replaceAll(researchCompletedDesignCss, '')
const html = `<!doctype html><html><meta charset="utf-8"><title>Completed component CSS contract</title><style>${fixtureCss + legacyCss}</style><body>${markup}</body></html>`
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const report = { scope: 'Pure CSS fixture; not packaged-client acceptance or font-file validation', checks: [], failures: [] }
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } })
  await page.setContent(html)
  const baseline = await page.evaluate(() => {
    const pick = selector => { const s = getComputedStyle(document.querySelector(selector)); return [s.borderRadius, s.padding, s.fontSize, s.lineHeight, s.backgroundColor, s.color] }
    return { draft: pick('#draft'), mindmap: pick('#mindmap'), generation: pick('#generation'), selection: getComputedStyle(document.querySelector('#kpi')).getPropertyValue('--odyssey-select') }
  })
  await page.addStyleTag({ content: researchCompletedDesignCss })
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => document.body.toggleAttribute('data-ds-dark-theme', theme === 'dark'), theme)
    const checks = await page.evaluate(({ theme, baseline }) => {
      const q = selector => document.querySelector(selector), s = selector => getComputedStyle(q(selector))
      const checks = [], check = (name, actual, expected) => checks.push({ name: `${theme}/${name}`, actual, expected })
      const pick = selector => { const a = s(selector); return [a.borderRadius, a.padding, a.fontSize, a.lineHeight, a.backgroundColor, a.color] }
      for (const id of ['kpi', 'html', 'news', 'web']) {
        check(`${id}/radius`, s(`#${id}`).borderRadius, '8px')
        check(`${id}/header-height`, q(`#${id} .rScV5Q_nodeTitle`).getBoundingClientRect().height, 48)
        check(`${id}/title`, s(`#${id} .rScV5Q_nodeTitleText`).fontSize, '13px')
        check(`${id}/title-line`, s(`#${id} .rScV5Q_nodeTitleText`).lineHeight, '20px')
      }
      check('kpi/cell', q('#kpi .rScV5Q_containerKpis>div').getBoundingClientRect().height, 64)
      check('kpi/cell-radius', s('#kpi .rScV5Q_containerKpis>div').borderRadius, '5px')
      check('kpi/value', s('#kpi strong').fontSize, '23px')
      check('kpi/value-line', s('#kpi strong').lineHeight, '26px')
      check('kpi/header-note-font', s('#kpi [data-research-component-header-note]').fontSize, '9px')
      check('kpi/header-note-line', s('#kpi [data-research-component-header-note]').lineHeight, '20px')
      check('kpi/header-note-top', q('#kpi [data-research-component-header-note]').getBoundingClientRect().top - q('#kpi').getBoundingClientRect().top, 14)
      check('kpi/header-note-readable', s('#kpi [data-research-component-header-note]').color, theme === 'dark' ? 'rgb(185, 190, 195)' : 'rgb(101, 113, 122)')
      check('kpi/no-inferred-positive-color', s('#kpi strong').color, theme === 'dark' ? 'rgb(244, 245, 246)' : 'rgb(32, 38, 41)')
      check('table/header-row', q('#table th').getBoundingClientRect().height, 25)
      check('table/row', q('#table td').getBoundingClientRect().height, 34)
      check('table/header-gap', q('#table td').getBoundingClientRect().top - q('#table th').getBoundingClientRect().bottom, 4)
      check('table/text-header-align', s('#table th').textAlign, 'left')
      check('table/font', s('#table td').fontSize, '9px')
      check('table/numeric', s('#table td[data-numeric]').textAlign, 'right')
      check('table/stripe', s('#table tbody tr').backgroundColor, theme === 'dark' ? 'rgb(53, 59, 64)' : 'rgb(240, 243, 245)')
      check('table/action', s('#table a').color, theme === 'dark' ? 'rgb(245, 245, 245)' : 'rgb(51, 51, 51)')
      check('markdown/color', s('#markdown p').color, theme === 'dark' ? 'rgb(244, 245, 246)' : 'rgb(32, 38, 41)')
      check('chart/series-preserved', s('#series').stroke, 'rgb(0, 80, 150)')
      check('chart/label-neutral', s('.rScV5Q_chartLabel').fill, theme === 'dark' ? 'rgb(185, 190, 195)' : 'rgb(101, 113, 122)')
      check('html/frame-bottom-radius', s('#html iframe').borderBottomRightRadius, '8px')
      const inner = q('#html iframe').contentDocument.querySelector('p')
      check('html/inner-font-preserved', getComputedStyle(inner).fontSize, '17px')
      check('html/inner-color-preserved', getComputedStyle(inner).color, 'rgb(19, 29, 39)')
      if (theme === 'light') {
        for (const id of ['draft', 'mindmap', 'generation']) check(`${id}/unchanged`, JSON.stringify(pick(`#${id}`)), JSON.stringify(baseline[id]))
        check('canvas/selection-preserved', s('#kpi').getPropertyValue('--odyssey-select'), baseline.selection)
      }
      for (const id of ['kpi', 'html']) {
        q(`#${id}`).dataset.researchGenerationState = 'running'
        check(`${id}/refresh-preserves-title`, s(`#${id} .rScV5Q_nodeTitleText`).fontSize, '13px')
        q(`#${id}`).dataset.researchGenerationState = 'completed'
      }
      return checks
    }, { theme, baseline })
    report.checks.push(...checks)
    const headerGeometry = () => page.evaluate(() => {
      const rect=selector=>{const n=document.querySelector(selector),r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,scrollWidth:n.scrollWidth,text:n.textContent}}
      return {note:rect('#kpi [data-research-component-header-note]'),title:rect('#kpi .rScV5Q_nodeTitleText'),body:rect('#kpi .rScV5Q_previewBody')}
    })
    for (const width of [896,328]) {
      await page.locator('#kpi').evaluate((card,width)=>card.style.width=width+'px',width)
      await page.mouse.move(999,999)
      await page.locator('#kpi .rScV5Q_containerMenuTrigger').evaluate(button=>button.blur())
      const geometry=await headerGeometry()
      for (const state of ['hover','focus']) {
        if(state==='hover') await page.locator('#kpi').hover()
        else {await page.mouse.move(999,999);await page.locator('#kpi .rScV5Q_containerMenuTrigger').focus()}
        report.checks.push({name:`${theme}/header-note-${width}-${state}-preserves-layout`,actual:JSON.stringify(await headerGeometry()),expected:JSON.stringify(geometry)})
        const overlay=await page.evaluate(()=>{
          const note=document.querySelector('#kpi [data-research-component-header-note]'),actions=document.querySelector('#kpi .rScV5Q_nodeTitleActions'),s=getComputedStyle(actions)
          return s.position==='absolute' && Number(s.zIndex)>0 && actions.getBoundingClientRect().left<note.getBoundingClientRect().right
        })
        report.checks.push({name:`${theme}/header-actions-${width}-${state}-float-above-text`,actual:overlay,expected:true})
      }
    }
    await page.locator('#kpi').evaluate(card=>card.style.width='896px')
    await page.locator('#kpi .rScV5Q_containerMenuTrigger').evaluate(button=>button.blur())
    await page.mouse.move(999,999)
    await page.screenshot({ path: resolve(output, `${theme}.png`), fullPage: true })
  }
  report.failures = report.checks.filter(check => check.actual !== check.expected)
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
  assert.deepEqual(report.failures, [], 'completed component CSS contracts')
  console.log(`PASS ${report.checks.length} completed component CSS checks; evidence ${output}`)
} finally {
  await browser.close()
}
