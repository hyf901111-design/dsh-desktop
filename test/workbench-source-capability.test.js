import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { marketVariant, requestedMarketVariant, requiredMarketVariant, workbenchDesignTemplate } from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import { preparePublicDataPanel } from '../packages/dsh-research-task-runtime/workbench-public-data.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { prepareRequest } from '../skills/ework-free-data-sources/scripts/query.mjs'

// Only public research_workbench_create arguments, from the fourth native run.
const observed = JSON.parse(readFileSync(new URL('./fixtures/workbench-fourth-source-plans.json', import.meta.url), 'utf8'))
const validatePanel = panel => validateWorkbench({ requestId: 'capability', title: '真实研究', dataMode: 'source', panels: [panel] }).panels[0]
const quotePanel = (profile = 'quotes-table', type = 'market', prompt = '展示名称、代码、最新价、单位、涨跌幅、开盘、最高、最低、报价时间。') => ({
  title: '报价对比', type, size: 'medium', prompt,
  publicData: { profile, requests: [{ source: 'tencent-quotes', parameters_json: '{"symbols":["sz300308","sh000300"]}' }], intervalMinutes: 0 }
})

it.each([0, 1, 2])('accepts the actual eight-panel create attempt %i once, preserving business fields instead of substituting price metrics', index => {
  const input = structuredClone(observed[index]), plan = validateWorkbench(input)
  expect(plan.panels).toHaveLength(8)
  expect(plan.panels.map(panel => panel.type)).toEqual(['table', 'chart', 'chart', 'table', 'table', 'news', 'reports', 'calendar'])
  expect(plan.panels.every(panel => panel.artifact === undefined && panel.publicData === undefined)).toBe(true)
  input.panels.forEach((panel, i) => {
    expect(plan.panels[i].prompt).toContain(panel.prompt)
    for (const request of panel.publicData?.requests ?? []) {
      expect(() => prepareRequest(request.source, JSON.parse(request.parameters_json))).not.toThrow()
      if (request.source === 'sina-news') expect(plan.panels[i].prompt).toContain('"limit":12')
      else expect(plan.panels[i].prompt).toContain(request.parameters_json.replaceAll('"', '\\"'))
    }
  })
  for (const field of ['成交量', '成交额', '市盈率', '市净率', '总市值']) expect(plan.panels[0].prompt).toContain(field)
  for (const symbol of ['sz300308', 'sz300502', 'sh601138', 'sh000300']) expect(plan.panels[3].prompt).toContain(symbol)
  expect(validateWorkbench(plan)).toEqual(plan)
  expect(input).toEqual(observed[index])
})

it('keeps a standard table + quotes-table on the validated market.table fast path', async () => {
  const input = quotePanel('quotes-table', 'table'), panel = validatePanel(input)
  expect(panel.type).toBe('market')
  expect(panel.publicData).toEqual(input.publicData)
  const records = [
    { symbol: 'sz300308', code: '300308', name: '中际旭创', price: 1, priceUnit: 'CNY', changePercent: 2, open: 1, high: 2, low: 1, time: '2026-10-20 15:00:00' },
    { symbol: 'sh000300', code: '000300', name: '沪深300', price: 3, priceUnit: 'points', changePercent: 4, open: 3, high: 4, low: 2, time: '2026-10-20 15:00:00' }
  ]
  const result = await preparePublicDataPanel(panel, { query: async () => ({ sourceId: 'tencent-quotes', source: '腾讯财经', dataTime: records[0].time, records }) })
  const artifact = readTemplateModel(JSON.parse(result.output)).data
  expect(artifact).toMatchObject({ type: 'market', variant: 'table' })
  expect(artifact.rows.map(row => row[0])).toEqual(['中际旭创', '沪深300'])
  expect(result.recipe.intervalMinutes).toBe(0)
})

it.each(['成交量', '成交额', '市盈率(TTM)', 'PE-TTM', 'PB', '总市值', 'volume', 'amount', 'previousClose', '涨跌额'])('routes an observed unsupported quote field to a strict source task: %s', field => {
  const input = quotePanel('quotes-table', 'market', `只比较两标的${field}，无法取得就标注来源未提供。`), panel = validatePanel(input)
  expect(panel.type).toBe('table')
  expect(panel.publicData).toBeUndefined()
  expect(panel.prompt).toContain(input.prompt)
  expect(panel.prompt).toContain(input.publicData.requests[0].parameters_json.replaceAll('"', '\\"'))
  expect(panel.prompt).toContain('"intervalMinutes":0')
  expect(panel.prompt).toContain('显式来源限制')
  expect(panel.prompt).toContain('来源未提供')
})

it('distinguishes quote-metrics display capability and preserves an explicitly supported table layout', () => {
  const metrics = quotePanel('quotes-metrics', 'market', '展示两标的最新价格和涨跌幅。')
  expect(validatePanel(metrics).publicData).toEqual(metrics.publicData)
  metrics.prompt = '展示两标的开盘价、最高价、最低价。'
  expect(validatePanel(metrics).type).toBe('table')
  expect(validatePanel(metrics).publicData).toBeUndefined()
  const layout = quotePanel('quotes-table', 'table', '比较两标的PE、PB、总市值。')
  layout.publicData.layoutProfile = 'openterminal'
  const panel = validatePanel(layout)
  expect(panel.type).toBe('market')
  expect(panel.publicData).toBeUndefined()
  expect(panel.prompt).toContain('variant: table')
  expect(panel.prompt).toContain('"layoutProfile":"openterminal"')
  expect(panel.prompt).toContain('artifact.layoutProfile')
})

it.each(['variant: metrics；', 'market.metrics；', 'market.metrics；variant: metrics；'])('keeps the final OpenTerminal fallback contract on market.table despite the old route %s', route => {
  const input = quotePanel('quotes-table', 'market', `${route}比较PE、PB、总市值，保留缺失说明与原来源。`)
  input.publicData.layoutProfile = 'openterminal'
  const panel = validatePanel(input), contract = workbenchPanelPrompt({ title: '真实研究', dataMode: 'source' }, panel)
  expect(panel.type).toBe('market')
  expect(panel.publicData).toBeUndefined()
  expect(panel.prompt).toContain(input.prompt)
  expect(panel.prompt).toContain(input.publicData.requests[0].parameters_json.replaceAll('"', '\\"'))
  expect(panel.prompt).toContain('"layoutProfile":"openterminal"')
  expect(marketVariant(panel)).toBe('table')
  expect(requestedMarketVariant(panel.prompt)).toBe('table')
  expect(workbenchDesignTemplate(panel).variant).toBe('table')
  expect(requiredMarketVariant(contract)).toBe('table')
  expect(requestedMarketVariant(contract)).toBe('table')
  expect(contract).toContain('必须输出 market.table 的结构化数据')
  expect(contract).not.toContain('必须输出 market.metrics 的结构化数据')
  expect(validatePanel(panel)).toEqual(panel)
})

it.each([
  ['quotes-table', '只展示名称、代码、最新价、涨跌幅和报价时间；不要成交量、成交额、市盈率、市净率或市值。'],
  ['quotes-table', '只展示最新价；不需要 PE、PB、volume、amount。'],
  ['quotes-table', '只展示最新价；无需显示市盈率(TTM)、市净率和总市值。'],
  ['quotes-table', 'Only show name, code, price, changePercent and time; do not show PE, PB, volume or amount.'],
  ['quotes-table', 'Only show price; do not need to show PE, PB, volume, or amount.'],
  ['quotes-table', 'Only show price; no PE/PB/volume/amount.'],
  ['quotes-table', 'Only show price; without volume and amount.'],
  ['quotes-metrics', '只展示最新价格和涨跌幅；不要开盘、最高价、最低价。'],
  ['quotes-metrics', 'Only show price and changePercent; do not display open, high or low.']
])('keeps explicit excluded fields on the standard quote fast path: %s / %s', (profile, prompt) => {
  const input = quotePanel(profile, 'market', prompt), panel = validatePanel(input)
  expect(panel.publicData).toEqual(input.publicData)
  expect(panel.type).toBe('market')
  expect(panel.prompt).toContain(input.prompt)
})

it.each([
  ['quotes-table', '展示成交额；不要PE、PB。'],
  ['quotes-table', '不要PE、PB，但要成交额。'],
  ['quotes-table', '不需要成交量，另外要PB。'],
  ['quotes-table', '不需要修改PE的数据来源。'],
  ['quotes-table', 'Show amount; do not show PE or PB.'],
  ['quotes-table', 'Do not show volume or amount, but include PB.'],
  ['quotes-table', 'No PE/PB; show volume.'],
  ['quotes-table', 'Do not change the PE data source.'],
  ['quotes-metrics', '不要开盘、最高价，但要最低价。'],
  ['quotes-metrics', 'Do not display open or high, but show low.']
])('retains required fields before or after an exclusion clause: %s / %s', (profile, prompt) => {
  const input = quotePanel(profile, 'market', prompt), panel = validatePanel(input)
  expect(panel.publicData).toBeUndefined()
  expect(panel.type).toBe('table')
  expect(panel.prompt).toContain(input.prompt)
})

it.each([
  ['quotes-table', '不要PE，PB必须保留。'],
  ['quotes-table', '不需要成交量，成交额必须显示。'],
  ['quotes-table', 'Only show price. No PE, PB is required.'],
  ['quotes-table', 'Only show price. No PE, PB is needed.'],
  ['quotes-table', 'Only show price. No PE, PB should remain visible.'],
  ['quotes-table', '不要PE、PB待核实。'],
  ['quotes-metrics', '不要开盘，最高价必须保留。'],
  ['quotes-metrics', 'Do not show open, high is required.']
])('conservatively retains fields with unknown or affirmative text after an exclusion list: %s / %s', (profile, prompt) => {
  const input = quotePanel(profile, 'market', prompt), panel = validatePanel(input)
  expect(panel.publicData).toBeUndefined()
  expect(panel.type).toBe('table')
  expect(panel.prompt).toContain(input.prompt)
})

it('recognizes the actual related latest real news wording without expanding it to the market feed', () => {
  const input = structuredClone(observed[1].panels[5]), panel = validatePanel(input)
  expect(panel.publicData).toBeUndefined()
  expect(panel.prompt).toContain(input.prompt)
  expect(panel.prompt).toContain('不得扩大为全市场新闻')
  expect(panel.prompt).toContain('显式来源限制')
  expect(panel.prompt).toContain('无法取得时明确缺失')
  input.title = '财经要闻'; input.prompt = '展示最新真实财经新闻，保留来源、时间和链接。'
  expect(validatePanel(input).publicData).toMatchObject({ profile: 'news' })
})

it('normalizes only absent or completely empty source artifact slots, retaining strict supplied-data and simulation checks', () => {
  for (const artifact of [null, {}]) {
    expect(validatePanel({ ...quotePanel('quotes-table', 'table'), artifact }).publicData).toBeDefined()
    expect(validatePanel({ title: '真实列表', prompt: '按真实资料列出记录。', type: 'table', size: 'medium', artifact }).artifact).toBeUndefined()
  }
  for (const artifact of [{ note: '' }, { metadata: {} }, { rows: [] }, { observations: [] }, []]) {
    expect(() => validatePanel({ ...quotePanel('quotes-table', 'table'), artifact })).toThrow()
    expect(() => validatePanel({ title: '真实列表', prompt: '按真实资料列出记录。', type: 'table', size: 'medium', artifact })).toThrow()
  }
  for (const artifact of [null, {}]) expect(() => validateWorkbench({ requestId: 'sim', title: '模拟', dataMode: 'simulated', panels: [{ ...quotePanel('quotes-table', 'table'), artifact }] })).toThrow()
  const artifact = { version: 1, type: 'table', title: '真实记录', columns: ['数值'], rows: [['7']], note: '来源的原始说明' }
  expect(validatePanel({ title: '真实记录', type: 'table', size: 'medium', prompt: '保留已取得记录。', artifact }).artifact).toEqual(artifact)
})

it.each([
  {}, { symbols: [] }, { symbols: ['https://private.test'] }, { symbols: ['sz300308'], url: 'https://private.test' },
  { symbols: ['sz300308'], headers: {} }, { symbols: ['sz300308'], api_key: 'secret' },
  { symbols: ['sz300308'], fields: ['PE'] }, { symbols: Array.from({ length: 13 }, () => 'sz300308') }
])('rejects unsupported quote parameters before either direct delivery or source fallback: %o', parameters => {
  for (const prompt of ['展示最新价和涨跌幅。', '比较PE与成交额。']) {
    const panel = quotePanel('quotes-table', 'table', prompt)
    panel.publicData.requests[0].parameters_json = JSON.stringify(parameters)
    expect(() => validatePanel(panel)).toThrow()
  }
})

it('does not turn unknown quote profiles, sources, extra request fields or incompatible render types into source tasks', () => {
  for (const mutate of [
    p => { p.publicData.profile = 'unknown-quotes' },
    p => { p.publicData.requests[0].source = 'unknown-quotes' },
    p => { p.publicData.requests[0].url = 'https://private.test' },
    p => { p.publicData.layoutProfile = 'unknown-layout' },
    p => { p.type = 'news' },
    p => { p.publicData.profile = 'quotes-metrics'; p.type = 'table' }
  ]) {
    const panel = quotePanel('quotes-table', 'table', '比较PE与成交额。'); mutate(panel)
    expect(() => validatePanel(panel)).toThrow()
  }
})

it('negotiates unsupported source options before mounting a generated financial component without changing user requirements',()=>{
 const artifact={version:1,type:'financial-widget',widget:'quote',title:'行情',symbols:[{code:'511010',market:'SH',name:'国债ETF'}],dataSource:'backup',adjustment:'forward'}
 const input={requestId:'source-option',title:'研究',dataMode:'source',originalRequest:'生成一个固收研究工作台',panels:[{type:'financial-widget',title:'行情',prompt:'观察行情与走势',size:'large',artifact}]}
 const original=structuredClone(input),plan=validateWorkbench(input)
 expect(plan.panels[0].artifact).toMatchObject({widget:'quote',dataSource:'backup',adjustment:'none'})
 expect(input).toEqual(original);expect(validateWorkbench(plan)).toEqual(plan)
 expect(()=>validateWorkbench({...input,originalRequest:'用前复权展示国债ETF的K线'})).toThrow(/备用.*不支持.*复权/)
 expect(()=>validateWorkbench({...input,originalRequest:'use forward adjusted prices'})).toThrow(/备用.*不支持.*复权/)
 const explicit=validateWorkbench({...input,originalRequest:'用前复权展示K线',panels:[{...input.panels[0],artifact:{...artifact,dataSource:'default'}}]})
 expect(explicit.panels[0].artifact).toMatchObject({adjustment:'forward',dataSource:'default'})
})
