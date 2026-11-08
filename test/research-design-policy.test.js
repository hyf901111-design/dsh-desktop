import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { load } from 'cheerio'
import { designPolicyIssue, normalizeGeneratedHostStyles, duplicateTitleRepairSnapshot, duplicateTitleRepairIssue } from '../packages/dsh-research-task-runtime/design-policy.js'

const fundTitle = '基金筛选表（合成数据 · 组件规范回归）'
const fundHtml = readFileSync(new URL('./fixtures/research-kimi-fund-title.html', import.meta.url), 'utf8')
const checklistHtml = readFileSync(new URL('./fixtures/research-kimi-checklist-title.html', import.meta.url), 'utf8')

const profileKpiItem = '<div class="research-metric"><div class="research-metric-label">穿透基金</div><div class="research-metric-value">8只</div><div class="research-metric-detail">合成数据</div></div>'
const profileIndustryRow = '<div class="research-industry-row"><span class="research-industry-label">电子</span><div class="research-industry-track"><div class="research-industry-bar" style="width:82%"></div></div><span class="research-industry-value">24.6%</span></div>'
const profileDocument = (profile, content) => `<main data-sherlock-profile="${profile}">${content}</main>`

it('locates the rejected CSS declaration without changing the design gate or repeating business content',()=>{
 const html='<style>p{color:var(--sherlock-text)}</style><p>保留业务原文 private-marker</p><style>\n.note {\n  color:#fff;\n}</style><aside class="note">来源说明保留</aside>'
 const issue=designPolicyIssue(html)
 expect(issue).toContain('样式块 2，第3行第3列')
 expect(issue).toContain('color 请使用宿主')
 expect(issue).not.toContain('private-marker')
 expect(designPolicyIssue(html.replace('color:#fff','color:var(--sherlock-muted)'))).toBeNull()
})

describe('explicit generated source profile contract', () => {
 it.each(['fund72_kpi','fund72-unknown',''])('rejects an unknown explicit profile %s with a narrow repair instruction', profile => {
  const issue = designPolicyIssue(profileDocument(profile, '<p>业务数据保留</p>'))
  expect(issue).toContain('未知 data-sherlock-profile')
  expect(issue).toContain('保留全部数据、来源、控件、脚本和共享回调')
 })
 it.each([
  ['fund72-kpi', '<div class="metrics"><div class="metric"><span class="value">8</span></div></div>', '.research-metrics'],
  ['fund72-kpi', '<div class="research-metrics"><div class="metric">8</div></div>', '.research-metric'],
  ['fund72-kpi', '<div class="research-metrics"><div class="research-metric"><span class="research-metric-label">基金</span><span class="value">8</span></div></div>', '.research-metric-value'],
  ['fund72-industry', '<div class="rows">电子24.6%</div>', '.research-industry-rows'],
  ['fund72-industry', '<div class="research-industry-rows">'+profileIndustryRow.replace('research-industry-bar','bar')+'</div>', '.research-industry-bar'],
  ['fund72-holdings', '<div class="table">华芯科技6.42%</div>', 'table'],
  ['fund72-holdings', '<table><tbody><tr><td>6.42%</td></tr></tbody></table>', 'thead'],
  ['fund72-holdings', '<div class="filters"><input type="search"></div><table><thead></thead><tbody></tbody></table>', '.research-filters']
 ])('rejects missing %s semantic structure without discarding its content', (profile, html, expected) => {
  expect(designPolicyIssue(profileDocument(profile, html))).toContain(expected)
 })
 it.each([0,1,7])('allows %i KPI cards and industry rows, including empty-data containers', count => {
  expect(designPolicyIssue(profileDocument('fund72-kpi', `<div class="research-metrics">${profileKpiItem.repeat(count)}</div>`))).toBeNull()
  expect(designPolicyIssue(profileDocument('fund72-industry', `<div class="research-industry-rows">${profileIndustryRow.repeat(count)}</div>`))).toBeNull()
 })
 it.each(['font-size:32px!important','line-height:40px!important','padding:20px!important','background:var(--sherlock-surface-muted)!important'])('rejects a protected profile inline override %s', style => {
  const html = profileDocument('fund72-kpi', `<div class="research-metrics">${profileKpiItem.replace('class="research-metric-value"',`class="research-metric-value" style="${style}"`)}</div>`)
  expect(designPolicyIssue(html)).toContain('内联 !important')
 })
 it('keeps data widths, visibility, neutral controls, ordinary HTML, and normal authored declarations valid', () => {
  const industry = profileDocument('fund72-industry', `<div class="research-industry-rows">${profileIndustryRow.replace('width:82%', 'width:82%!important;display:none!important').replace('class="research-industry-row"','class="research-industry-row" hidden')}</div><p>来源：合成数据</p><script>const state={selected:1};</script>`)
  expect(designPolicyIssue(industry)).toBeNull()
  expect(designPolicyIssue('<div class="value" style="font-size:32px!important">普通报告</div>')).toBeNull()
  const kpi = profileDocument('fund72-kpi', `<div class="research-metrics">${profileKpiItem.replace('class="research-metric-value"','class="research-metric-value" style="font-size:32px"')}</div>`)
  expect(designPolicyIssue(kpi)).toBeNull()
  expect(designPolicyIssue('<style>.research-metric-value{font-size:32px!important}</style>'+kpi)).toBeNull()
  expect(designPolicyIssue(profileDocument('fund72-holdings','<table><thead></thead><tbody></tbody></table><input type="button" value="查看">'))).toBeNull()
  expect(designPolicyIssue(profileDocument('fund72-kpi','<div class="research-metrics"><template>加载后的数据模板</template><script>const items=[];</script></div>'))).toBeNull()
 })
 it('accepts semantic class repair without rewriting data or scripts', () => {
  const content = `<div class="metrics">${profileKpiItem}</div><p>来源保留</p><script>const sharedState={checked:true};</script>`
  expect(designPolicyIssue(profileDocument('fund72-kpi', content))).toContain('.research-metrics')
  expect(designPolicyIssue(profileDocument('fund72-kpi', content.replace('class="metrics"','class="research-metrics"')))).toBeNull()
 })
})

describe('generated HTML design policy', () => {
 it('normalizes literal theme colors only on annotated structure elements', () => {
  const html='<style>.node[data-sherlock-structure-depth="0"]{background:#005096}.node[data-sherlock-structure-depth="1"]{background:#0078B4}.badge{background:#1EB9E1;color:var(--sherlock-control-on-primary)}</style><div class="node" data-sherlock-structure="primary" data-sherlock-structure-depth="0">组织</div><div class="badge" data-sherlock-structure="info">日期与出处</div>'
  expect(designPolicyIssue(html)).toContain('background')
  const repaired=normalizeGeneratedHostStyles(html)
  expect(designPolicyIssue(repaired)).toBeNull()
  expect(repaired).toContain('background:var(--sherlock-chart-1)')
  expect(repaired).toContain('background:var(--sherlock-chart-3)')
  expect(repaired).toContain('background:var(--sherlock-surface-muted);color:var(--sherlock-text)')
  expect(repaired).toContain('日期与出处')
  expect(normalizeGeneratedHostStyles(repaired)).toBe(repaired)
  const control='<style>.badge{background:#1EB9E1}</style><button class="badge" data-sherlock-structure="info">筛选</button>'
  expect(normalizeGeneratedHostStyles(control)).toBe(control)
  expect(designPolicyIssue(control)).toContain('控件')
 })
 it('repairs known host role aliases and fixed fallbacks while preserving content and shared script', () => {
  const script='<script>const shared=window.sherlockShared.register({initialState:{selected:0},reduce:(s,a)=>({...s,selected:a.id}),render:s=>{}});</script>'
  const html='<style>body{color:var(--sherlock-text-primary,#1a1a1a)}a{color:var(--sherlock-text-link,#0969da)}button{background:var(--sherlock-control-bg,#fff);color:var(--sherlock-control-text,#333)}</style><p>真实证据 0 / 3</p><a href="https://example.org/source">原文</a><button>筛选</button>'+script
  const repaired=normalizeGeneratedHostStyles(html)
  expect(designPolicyIssue(repaired)).toBeNull()
  expect(repaired).toContain('var(--sherlock-text)')
  expect(repaired).toContain('var(--sherlock-link)')
  expect(repaired).toContain('<p>真实证据 0 / 3</p>')
  expect(repaired).toContain(script)
  expect(repaired).not.toMatch(/#[\da-f]{3,8}/i)
  const font=normalizeGeneratedHostStyles('<style>body{font:13px/20px var(--sherlock-font-sans,Arial);background:var(--sherlock-surface-secondary,rgba(127,127,127,.06))}button{color:var(--sherlock-control-fg-muted,var(--sherlock-text-secondary))}</style><button>原内容</button>')
  expect(font).toContain('font:13px/20px var(--sherlock-font-sans)')
  expect(font).toContain('var(--sherlock-surface-muted)')
  expect(designPolicyIssue(font)).toBeNull()
  for(const value of ['red','var(--custom-brand,#333)','var(--sherlock-chart-1,#333)']){
   expect(designPolicyIssue(normalizeGeneratedHostStyles(`<style>button{color:${value}}</style><button>筛选</button>`))).toContain('控件')
  }
 })
 it.each([
  '<style>:root{--sherlock-text:purple}</style><p>内容</p>',
  '<p style="--sherlock-control-primary:blue">内容</p>',
  '<style>:root{--sherlock-\\74 ext:red}</style><p>内容</p>',
  '<script>document.documentElement.style.setProperty("--sherlock-control-bg","blue")</script><p>内容</p>',
  '<button onclick="document.documentElement.style.setProperty(\'--sherlock-control-bg\',\'blue\')">筛选</button>',
  '<style>@property --sherlock-control-bg{syntax:"<color>";inherits:true;initial-value:blue}</style><button>筛选</button>'
 ])('rejects an actual host token redefinition: %s', html => expect(designPolicyIssue(html)).toContain('宿主变量'))
 it.each([
  '<style>.action:hover{background:#1677ff}</style><button class="action">筛选</button>',
  '<button><span style="color:rgb(0,0,255)">筛选</span></button>',
  '<style>input:focus{outline:1px solid var(--sherlock-chart-1)}</style><input>',
  '<style>button{color:var(--sherlock-accent)}</style><button>筛选</button>',
  '<button><svg><path fill="var(--sherlock-status-danger-fg)" d="M0 0L1 1"/></svg></button>',
  '<div role="tab" style="background:blue">月度</div>',
  '<style>.actions{color:blue}</style><div class="actions"><button>筛选</button></div>',
  '<style>button{background:cornflowerblue}</style><button>筛选</button>',
  '<style>button{&:hover{color:var(--sherlock-chart-1)}}</style><button>筛选</button>'
 ])('rejects authored color or business-color tokens on controls: %s', html => expect(designPolicyIssue(html)).toContain('控件'))
 it.each([
  '<style>body{font-family:Arial,sans-serif}</style><p>内容</p>',
  '<style>@font-face{font-family:Custom;src:url(data:font/woff2;base64,AA)}</style><p>内容</p>',
  '<style>body{font-family:var(--sherlock-font-sans),Arial}</style><p>内容</p>',
  '<p>内容</p><script>document.body.style.fontFamily="Arial"</script>'
 ])('rejects font replacement: %s', html => expect(designPolicyIssue(html)).toContain('字体'))
 it('accepts standard neutral controls and business chart/status tokens together', () => {
  expect(designPolicyIssue('<style>body{font-family:var(--sherlock-font-sans);color:var(--sherlock-text)}button:hover{background:var(--sherlock-control-primary);color:var(--sherlock-control-on-primary)}.profit{color:var(--sherlock-status-danger-fg)}</style><button>筛选</button><span class="profit" data-sherlock-status="danger">+2.4%</span><svg><path stroke="var(--sherlock-chart-1)" d="M0 0L1 1"/></svg>')).toBeNull()
 })
 it('does not interpret documentation, comments, script strings or data series as control styling', () => {
  expect(designPolicyIssue('<p>示例 button{color:blue}，数据字段 --sherlock-text</p><!-- <style>button{color:blue}</style> --><script>const documentation="button{color:blue}";</script><svg aria-label="来源报告的蓝色系列"><path fill="#1677ff" d="M0 0L1 1"/></svg>')).toBeNull()
 })
 it('accepts inherited controls without mandatory author CSS', () => expect(designPolicyIssue('<label>月份<select><option>三月</option></select></label><button>查看</button>')).toBeNull())
 it('rejects malformed author CSS with a repairable explanation', () => expect(designPolicyIssue('<style>button{color:blue</style><button>查看</button>')).toContain('CSS'))
 it('allows a business status background around a neutral source link and action', () => {
  expect(designPolicyIssue('<style>.risk{background:var(--sherlock-status-warning-bg)}.risk-message{color:var(--sherlock-status-warning-fg)}</style><section class="risk"><p class="risk-message">集中度达到预警线</p><a href="https://example.org/report">来源</a><button>查看详情</button></section>')).toBeNull()
 })
 it.each([
  'var(--sherlock-control-text,var(--sherlock-text))',
  'var(--sherlock-control-text, var(--sherlock-text, var(--sherlock-muted)))',
  'color-mix(in srgb,var(--sherlock-control-text,var(--sherlock-text)) 80%,transparent)'
 ])('accepts a neutral fallback made entirely from allowed host tokens: %s', value => {
  expect(designPolicyIssue(`<style>button{color:${value}}</style><button>筛选基金</button>`)).toBeNull()
 })
 it.each([
  'var(--sherlock-control-text,var(--sherlock-chart-1))',
  'var(--sherlock-control-text,var(--sherlock-text,var(--sherlock-status-danger-fg)))',
  'var(--sherlock-control-text,var(--untrusted-brand))',
  'var(--sherlock-control-text,var(--sherlock-text,#1677ff))'
 ])('rejects a colored or untrusted nested control fallback: %s', value => {
  expect(designPolicyIssue(`<style>button{color:${value}}</style><button>筛选基金</button>`)).toContain('控件')
 })
 it.each([
  [fundTitle, fundHtml],
  ['研究准备清单', checklistHtml],
  ['基金筛选表', '<h1>基金筛选表</h1><p>来源说明</p>'],
  ['基金筛选表', '<main><header><h1> 基金筛选表 </h1></header><table></table></main>'],
  ['基金筛选表（合成数据）', '<h1>基金筛选表</h1><p class="note">合成数据 · 组件规范回归</p><div class="toolbar"></div>'],
  ['研究准备清单', '<div class="head"><h2>研究准备清单</h2><span class="count" id="count">0 / 3 已完成</span></div><ul><li>数据核验</li></ul>'],
  ['研究准备清单', '<div class="head"><h3>研究准备清单</h3><span>0 / 3</span></div>'],
  ['研究准备清单（键盘提交回归 · 合成数据）', '<p class="lead">研究准备清单（合成数据 · 键盘提交回归样例）</p><p class="hint">共 3 项；数据为演示用合成内容。</p>'],
  ['基金筛选表（C 类）', '<div class="head"><span class="title">基金筛选表</span><span class="tag">A 类</span></div>']
 ])('rejects only a top-level page title matching the host title: %s', (title, html) => {
  expect(designPolicyIssue(html, { title })).toContain('顶部重复标题')
 })
 it.each([
  ['normal same-named section', '<section><h2>基金筛选表</h2><table></table></section>', '基金筛选表'],
  ['normal same-named h3', '<section><div class="head"><h3>基金筛选表</h3></div></section>', '基金筛选表'],
  ['section title class', '<section><h2 class="title">基金筛选表</h2></section>', '基金筛选表'],
  ['standalone section heading', '<h2>基金筛选表</h2><p>业务小节</p>', '基金筛选表'],
  ['metadata without title', '<div class="head"><span class="tag">合成数据 · 组件规范回归</span><span id="connStatus"></span></div>', fundTitle],
  ['later same-named title', '<p>来源说明</p><div class="head"><span class="title">基金筛选表</span></div>', '基金筛选表'],
  ['leading unwrapped content', '来源说明<h1>基金筛选表</h1>', '基金筛选表'],
  ['caption', '<table><caption>基金筛选表</caption></table>', '基金筛选表'],
  ['partial name', '<div class="head"><span class="title">基金筛选表说明</span></div>', '基金筛选表'],
  ['different subject', '<p class="lead">指数筛选表（合成数据）</p>', '基金筛选表（合成数据）'],
  ['ordinary introduction', '<p class="lead">研究准备清单用于登记三个步骤，请按顺序核验。</p>', '研究准备清单'],
  ['source only', '<p class="lead">来源：合成数据 · 组件规范回归</p>', fundTitle],
  ['metadata only', '<p class="lead">合成数据 · 组件规范回归</p>', fundTitle],
  ['hidden title', '<h1 hidden>基金筛选表</h1><p>内容</p>', '基金筛选表'],
  ['CSS-hidden title', '<style>.title{display:none}</style><h1 class="title">基金筛选表</h1><p>内容</p>', '基金筛选表'],
  ['no artifact context', '<h1>基金筛选表</h1>', undefined]
 ])('accepts %s without guessing a duplicate page title', (_, html, title) => {
  expect(designPolicyIssue(html, { title })).toBeNull()
 })
 it('accepts the reduced real repair while keeping status updates, shared actions and source text', () => {
  const repaired = fundHtml.replace('<span class="title">基金筛选表</span>', '')
  expect(designPolicyIssue(repaired, { title: fundTitle })).toBeNull()
  const $ = load(repaired), elements = { connStatus: { textContent: '' }, searchBtn: {} }, actions = []
  let options
  runInNewContext($('script').text(), { document: { getElementById: id => elements[id] }, window: { sherlockShared: { register(value) { options = value; return { dispatch: action => actions.push(action) } } } } })
  options.onStatus({ connected: false })
  expect(elements.connStatus.textContent).toBe('离线（本地预览）')
  options.onStatus({ connected: true })
  expect(elements.connStatus.textContent).toBe('')
  elements.searchBtn.onclick()
  expect(actions).toEqual([{ type: 'apply' }])
  expect($('.tag').text()).toBe('合成数据 · 组件规范回归')
  expect($('p').text()).toBe('来源：合成测试数据；保留业务说明。')
 })
 it('keeps the real checklist sections and synthetic-data disclaimer after its title repair', () => {
  const repaired = checklistHtml.replace('<span class="t">研究准备清单</span>', '')
  expect(designPolicyIssue(repaired, { title: '研究准备清单' })).toBeNull()
  const $ = load(repaired)
  expect($('h3').map((_, element) => $(element).text()).get()).toEqual(['数据核验', '风险检查', '来源确认'])
  expect($('.foot').text()).toBe('合成测试数据 · 未联网 · 仅供演示')
  expect($('#progressText').text()).toBe('0/9')
 })
 it('allows title-only repair with harmless formatting and attribute-order differences', () => {
  const snapshot=duplicateTitleRepairSnapshot(fundHtml,{title:fundTitle})
  const html=fundHtml.replace('<span class="title">基金筛选表</span>','')
   .replace('class="status-line" id="connStatus"','id="connStatus" class="status-line"')
   .replace('var connStatus = document.getElementById','var connStatus=document.getElementById')
   .replace('font-weight: 600;','font-weight : 600 ;')
   .replace('<p>来源：合成测试数据；保留业务说明。</p>','\n  <p>来源：合成测试数据；保留业务说明。</p>\n')
  expect(duplicateTitleRepairIssue(snapshot,{type:'html',title:fundTitle,html})).toBeNull()
 })
 it('keeps an ID-bearing title node when removing its duplicate text', () => {
  const snapshot=duplicateTitleRepairSnapshot('<h1 id="page-title">基金筛选表</h1><p>来源说明</p>',{title:'基金筛选表'})
  expect(duplicateTitleRepairIssue(snapshot,{type:'html',title:'基金筛选表',html:'<h1 id="page-title"></h1><p>来源说明</p>'})).toBeNull()
  expect(duplicateTitleRepairIssue(snapshot,{type:'html',title:'基金筛选表',html:'<p>来源说明</p>'})).toContain('ID')
 })
 it('does not create a preservation constraint for an ordinary section heading', () => {
  expect(duplicateTitleRepairSnapshot('<section><h2>基金筛选表</h2></section>',{title:'基金筛选表'})).toBeNull()
 })
 it.each(['p','h1'])('preserves the exact differently worded qualifier as visible explanation when repairing %s', tag => {
  const title='研究准备清单（键盘提交回归 · 合成数据）'
  const html=`<${tag} class="lead">研究准备清单（合成数据 · 键盘提交回归样例）</${tag}><p class="hint">来源：合成数据，保留此说明。</p><section><h3>数据核验</h3></section>`
  expect(designPolicyIssue(html,{title})).toContain('顶部重复标题')
  const snapshot=duplicateTitleRepairSnapshot(html,{title})
  const repaired='<p class="lead">合成数据 · 键盘提交回归样例</p><p class="hint">来源：合成数据，保留此说明。</p><section><h3>数据核验</h3></section>'
  expect(duplicateTitleRepairIssue(snapshot,{type:'html',title,html:repaired})).toBeNull()
  expect(designPolicyIssue(repaired,{title})).toBeNull()
  for(const changed of [repaired.replace('<p class="lead">合成数据 · 键盘提交回归样例</p>',''),repaired.replace('合成数据 · 键盘提交回归样例','合成数据'),repaired.replace('class="lead"','class="lead" hidden')]) {
   expect(duplicateTitleRepairIssue(snapshot,{type:'html',title,html:changed})).toContain('题名以外')
  }
 })
})
