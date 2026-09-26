import { describe, expect, it, vi } from 'vitest'
import { validateWorkbench, registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { generateSimulatedPanel } from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js'
import { MARKET_VARIANT_NAMES } from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const panel = (title, type, artifact) => ({ title, type, prompt: `用模拟数据展示${title}`, size: 'medium', artifact })
const mockPlan = () => ({
  requestId: 'moutai-simulated-1', title: '贵州茅台股票监控工作台', dataMode: 'simulated',
  panels: [
    panel('行情快照', 'dashboard', { version: 1, type: 'dashboard', title: '行情快照', asOf: '2026-02-06 15:00', items: [{ label: '现价', value: '1478.60 元', detail: '模拟收盘价' }, { label: '成交额', value: '42.15 亿元' }] }),
    panel('分时走势', 'chart', { version: 1, type: 'chart', title: '分时走势', variant: 'line', labels: ['09:30', '10:30', '11:30'], series: [{ name: '价格', values: [1462, 1471, 1478.6] }] }),
    panel('五档盘口', 'market', { version: 1, type: 'market', variant: 'table', title: '五档盘口', asOf: '2026-02-06 14:59:58', columns: ['档位', '价格', '委托量'], rows: [['卖一', '1478.80', '180'], ['买一', '1478.60', '220']] }),
    panel('资讯流', 'news', { version: 1, type: 'news', title: '资讯流', items: [{ title: '模拟公告', summary: '仅供演示', date: '2026-02-06', category: '公告' }] }),
    panel('模拟交易', 'table', { version: 1, type: 'table', title: '模拟交易', columns: ['订单', '价格', '数量'], rows: [['模拟买入', '1478.60', '100']] }),
    panel('持仓盈亏', 'kpi', { version: 1, type: 'kpi', title: '持仓盈亏', items: [{ label: '总资产', value: '143.57 万元' }] })
  ]
})

function memoryStorage() {
  let data = { version: 1, tasks: [] }
  const save = vi.fn(async value => { data = structuredClone(value) })
  return { save, load: async () => structuredClone(data), snapshot: () => structuredClone(data) }
}

describe('模拟工作台结构化生成', () => {
  it('prepares a single simulated market panel through the host runtime', async () => {
    const planned = validateWorkbench({ requestId:'single-waterfall', title:'利润增减瀑布图', dataMode:'simulated', panels:[{
      title:'利润增减瀑布图', prompt:'variant: waterfall；起点100亿元，收入增长25、成本增加-8、效率提升4、费用增加-5，终点由宿主计算。', type:'market', size:'large'
    }] })
    const storage = memoryStorage()
    const runtime = new ResearchTaskRuntime({ adapter: { start: vi.fn() }, storage, createId: () => 'single-task' })
    try {
      const generated = generateSimulatedPanel(planned.panels[0], planned.title)
      const ready = validateWorkbench({ ...planned, panels:[generated] })
      const receipts = await runtime.startPreparedBatch({ parentSessionId:'research-1', panels:[{canvasNodeId:'single-node', prompt:ready.panels[0].prompt, artifact:ready.panels[0].artifact}] })
      expect(receipts).toHaveLength(1)
      expect(storage.snapshot().tasks).toHaveLength(1)
    } finally { await runtime.dispose() }
  })

  it('validates every panel before any task starts, and rejects authored HTML or fake links', () => {
    const plan = validateWorkbench(mockPlan())
    expect(plan.dataMode).toBe('simulated')
    expect(plan.panels).toHaveLength(6)
    const missing = mockPlan(); delete missing.panels[2].artifact
    expect(validateWorkbench(missing).panels[2].artifact).toBeUndefined()
    const html = mockPlan(); html.panels[2].artifact = { version: 1, type: 'html', title: '五档盘口', html: '<p>test</p>' }
    expect(() => validateWorkbench(html)).toThrow(/格式|模板/)
    const link = mockPlan(); link.panels[3].artifact.items[0].url = 'https://example.com/fake'
    expect(() => validateWorkbench(link)).toThrow(/链接/)
    const badChart = mockPlan(); badChart.panels[1].artifact.series[0].values = [1]
    expect(() => validateWorkbench(badChart)).toThrow(/数据|格式/)
  })

  it('accepts the observed numeric dashboard metrics shape without losing values', () => {
    const plan = mockPlan()
    plan.panels[0].artifact = { asOf: '2026-02-06 15:00', metrics: [
      { label: '现价', value: 1478.6, unit: '元', delta: -0.86, deltaPct: -0.058 },
      { label: '成交额', value: 42.15, unit: '亿元' }
    ] }
    const artifact = validateWorkbench(plan).panels[0].artifact
    expect(artifact.type).toBe('market')
    expect(artifact.variant).toBe('metrics')
    expect(artifact.version).toBe(1)
    expect(artifact.items).toEqual([
      { label: '现价', value: '1478.6 元', detail: '变动 -0.86 元 · 变动比例 -0.058（原始模拟值）' },
      { label: '成交额', value: '42.15 亿元' }
    ])
    expect(artifact.asOf).toContain('模拟数据')
  })

  it('gives an actionable type-specific error for invalid artifact data', () => {
    const plan = mockPlan()
    plan.panels[0].artifact = { asOf: '2026-02-06 15:00', metrics: [{ label: '现价', value: null }] }
    expect(() => validateWorkbench(plan)).toThrow(/market.*metrics.*items.*label.*value/)
  })

  it('infers an omitted market variant from its unambiguous simulated data shape', () => {
    const plan = mockPlan()
    delete plan.panels[2].artifact.variant
    expect(validateWorkbench(plan).panels[2].artifact.variant).toBe('table')
  })

  it('completes six panels in one persistence operation without launching an agent, then restores them', async () => {
    const storage = memoryStorage(), adapter = { start: vi.fn() }
    const runtime = new ResearchTaskRuntime({ adapter, storage, createId: (() => { let i = 0; return () => `prepared-${++i}` })() })
    const plan = validateWorkbench(mockPlan())
    const receipts = await runtime.startPreparedBatch({ parentSessionId: 'research-1', panels: plan.panels.map((p, i) => ({ canvasNodeId: `node-${i}`, prompt: p.prompt, artifact: p.artifact })) })
    expect(receipts).toHaveLength(6)
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect(adapter.start).not.toHaveBeenCalled()
    for (const receipt of receipts) {
      const task = runtime.inspect({ parentSessionId: 'research-1', taskId: receipt.taskId })
      expect(task.state).toBe('completed')
      expect(JSON.parse(task.finalOutput).title).toContain('模拟')
    }
    expect(JSON.parse(runtime.inspect({ parentSessionId: 'research-1', taskId: receipts[2].taskId }).finalOutput).html).toContain('卖一')
    await runtime.dispose()
    const restored = new ResearchTaskRuntime({ adapter, storage })
    await restored.restore()
    expect(restored.inspect({ parentSessionId: 'research-1', taskId: receipts[0].taskId }).state).toBe('completed')
    await restored.dispose()
  })

  it('uses prepared batch for simulated workbenches and keeps legacy generation for source mode', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'structured-workbench-'))
    let tool, handler
    const ctx = { agents: { get: () => ({}) }, tools: { register: t => { tool = t; return () => {} } }, webServer: { register: route => { handler = route.handler; return () => {} } } }
    const runtime = { start: vi.fn(async ({ canvasNodeId }) => ({ taskId: `legacy-${canvasNodeId}` })), startPreparedBatch: vi.fn(async ({ panels }) => panels.map((_, i) => ({ taskId: `prepared-${i}` }))), inspect: vi.fn(() => ({ finalOutput: '{"version":1,"type":"html","title":"模拟","html":"<p>模拟内容</p>"}' })) }
    const dispose = await registerWorkbench(ctx, runtime, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({ parentSessionId: 'research-1' }) })
    try {
      const exec = { agent: { session: { id: 'research-1' } }, signal: new AbortController().signal }
      const result = await tool.execute(mockPlan(), exec)
      expect(result.status).toBe('prepared')
      expect(runtime.startPreparedBatch).toHaveBeenCalledTimes(1)
      expect(runtime.start).not.toHaveBeenCalled()
      let listed
      await handler({ method: 'POST' }, { writeHead: () => {}, end: body => { listed = JSON.parse(body) } })
      expect(listed.plans[0].panels).toHaveLength(6)
      expect(JSON.stringify(listed)).not.toContain('artifact')
      expect(listed.plans[0].panels.every(p => typeof p.preparedOutput === 'string')).toBe(true)
      const repeated = await tool.execute(mockPlan(), exec)
      expect(repeated.planId).toBe(result.planId)
      expect(repeated.status).toBe('prepared')
      expect(runtime.startPreparedBatch).toHaveBeenCalledTimes(1)
      const legacy = mockPlan(); legacy.requestId = 'source-1'; delete legacy.dataMode; legacy.panels = legacy.panels.slice(0, 2).map(({ artifact, ...p }) => p)
      expect((await tool.execute(legacy, exec)).status).toBe('accepted')
      expect(runtime.start).toHaveBeenCalledTimes(2)
      const sourced = {requestId:'source-ready',title:'接口快照',dataMode:'source',panels:[{title:'指标快照',type:'market',size:'medium',prompt:'接口已返回',artifact:{version:1,type:'market',variant:'metrics',title:'指标快照',asOf:'2026-09-25 · 数据接口',items:[{label:'收盘',value:'3000'}]}}]}
      expect((await tool.execute(sourced,exec)).status).toBe('prepared')
      expect(runtime.start).toHaveBeenCalledTimes(2)
      expect(runtime.startPreparedBatch).toHaveBeenCalledTimes(2)
      await handler({method:'POST'},{writeHead:()=>{},end:body=>{listed=JSON.parse(body)}})
      expect(listed.plans.at(-1).panels[0].preparedOutput).toBeTruthy()
    } finally { await dispose(); await rm(dir, { recursive: true, force: true }) }
  },10000)

  it('prepares a lightweight simulated plan locally, including OHLC, without panel agents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'planned-workbench-'))
    let tool, handler
    const ctx = { agents: { get: () => ({}) }, tools: { register: t => { tool = t; return () => {} } }, webServer: { register: route => { handler = route.handler; return () => {} } } }
    const runtime = { start: vi.fn(), startPreparedBatch: vi.fn(async ({ panels }) => panels.map((_, i) => ({ taskId: `task-${i}` }))), inspect: vi.fn(() => ({ finalOutput: '{"version":1,"type":"market","title":"模拟"}' })) }
    const dispose = await registerWorkbench(ctx, runtime, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({ parentSessionId: 'research-1' }) })
    try {
      const args = { requestId: 'stock-sim', title: '个股研究工作台', dataMode: 'simulated', generationMode: 'parallel', panels: [
        { title: '行情指标', prompt: 'variant: metrics；模拟价格、成交额和涨跌幅', type: 'market', size: 'medium' },
        { title: '日 K 线', prompt: 'variant: candlestick；模拟 OHLC 与成交量', type: 'market', size: 'large' }
      ] }
      const exec = { agent: { session: { id: 'research-1' } }, signal: new AbortController().signal }
      expect(validateWorkbench({ ...args, generationMode: undefined }).panels).toHaveLength(2)
      expect(() => validateWorkbench({ ...args, panels: [{ ...args.panels[0], artifact: {} }, args.panels[1]] })).toThrow(/不提交 artifact/)
      const result = await tool.execute(args, exec)
      expect(result.status).toBe('prepared')
      expect(result.panels).toEqual(['行情指标（模拟）', '日 K 线（模拟）'])
      expect(result.templateIds).toEqual(['market.metrics', 'market.candlestick'])
      expect(runtime.start).not.toHaveBeenCalled()
      expect(runtime.startPreparedBatch).toHaveBeenCalledTimes(1)
      const prepared = runtime.startPreparedBatch.mock.calls[0][0].panels
      expect(prepared.map(p => p.artifact.variant)).toEqual(['metrics', 'candlestick'])
      expect(prepared[1].artifact.candles).toHaveLength(12)
      let listed
      await handler({ method: 'POST' }, { writeHead: () => {}, end: body => { listed = JSON.parse(body) } })
      expect(listed.plans[0].panels.map(panel => panel.title)).toEqual(result.panels)
      expect(listed.plans[0].panels.every(panel => panel.taskId && panel.preparedOutput)).toBe(true)
      const repeated = await tool.execute(args, exec)
      expect(repeated.planId).toBe(result.planId)
      expect(repeated.templateIds).toEqual(result.templateIds)
      expect(runtime.startPreparedBatch).toHaveBeenCalledTimes(1)
    } finally { await dispose(); await rm(dir, { recursive: true, force: true }) }
  })

  it('returns the mounted fund template instead of the planner generic KPI type', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fund-template-result-'))
    let tool
    const ctx = { agents: { get: () => ({}) }, tools: { register: t => { tool = t; return () => {} } }, webServer: { register: () => () => {} } }
    const runtime = { startPreparedBatch: vi.fn(async () => [{ taskId: 'fund-prepared' }]) }
    const dispose = await registerWorkbench(ctx, runtime, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({}) })
    try {
      const result = await tool.execute({ requestId:'fund-template', title:'双卡研究工作台', dataMode:'simulated', panels:[
        { title:'基金核心指标', prompt:'最大回撤附完整口径', type:'kpi', size:'small' }
      ] }, { agent:{ session:{ id:'research-1' } }, signal:new AbortController().signal })
      expect(result.templateIds).toEqual(['market.fund-kpi'])
      expect(runtime.startPreparedBatch.mock.calls[0][0].panels[0].artifact.variant).toBe('fund-kpi')
    } finally { await dispose(); await rm(dir, { recursive:true, force:true }) }
  })

  it('validates locally generated examples across market, chart, lists and schedule components', () => {
    const definitions = [
      ...MARKET_VARIANT_NAMES.map(variant => ({type:'market', prompt:`variant: ${variant}`})),
      {type:'chart',prompt:'折线趋势图'}, {type:'chart',prompt:'柱状对比图'},
      ...['table','kpi','dashboard','news','reports','calendar','gantt'].map(type => ({type,prompt:type}))
    ]
    expect(definitions).toHaveLength(30)
    for (const title of ['金融研究工作台', '样本工作台']) {
      for (const [index, definition] of definitions.entries()) {
        const panel = { title:`面板 ${index}`, size:'large', ...definition }
        const generated = generateSimulatedPanel(panel, title)
        const result = validateWorkbench({ requestId:`case-${index}`, title, dataMode:'simulated', panels:[generated, { ...generated, title:`副面板 ${index}`, artifact:{ ...generated.artifact, title:`副面板 ${index}` } }] })
        expect(result.panels[0].artifact.title).toContain('模拟')
        expect(result.panels[0].artifact.version).toBe(1)
      }
    }
  })

  it('uses portfolio weights and contribution for simulated holdings rather than quote fields',()=>{
    const panel=generateSimulatedPanel({type:'market',title:'核心持仓',prompt:'variant: fund-holdings',size:'medium'},'金融终端')
    expect(panel.artifact.columns).toEqual(['证券名称','权重 / %','持仓市值 / 亿','日涨跌 / %','贡献 / bp'])
    expect(panel.artifact.rows).toHaveLength(12)
    expect(panel.artifact.rows.reduce((sum,row)=>sum+Number(row[1]),0)).toBeLessThan(100)
    for(const row of panel.artifact.rows)expect(Number(row[4])).toBeCloseTo(Number(row[1])*Number(row[3]),2)
  })

  it('accepts a preset-only tool call and prepares all six cards without panel agents', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'medical-preset-'))
    let tool
    const ctx = { agents: { get: () => ({}) }, tools: { register: t => { tool = t; return () => {} } }, webServer: { register: () => () => {} } }
    const runtime = { start: vi.fn(), startPreparedBatch: vi.fn(async ({ panels }) => panels.map((_, i) => ({ taskId: `preset-${i}` }))) }
    const dispose = await registerWorkbench(ctx, runtime, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({}) })
    try {
      const input = { requestId: 'medical-quick', title: '医药研究', dataMode: 'simulated', preset: 'medical-21h' }
      const result = await tool.execute(input, { agent: { session: { id: 'research-1' } }, signal: new AbortController().signal })
      expect(result).toMatchObject({ status: 'prepared' })
      expect(result.panels).toHaveLength(6)
      expect(runtime.start).not.toHaveBeenCalled()
      expect(runtime.startPreparedBatch).toHaveBeenCalledTimes(1)
      expect(runtime.startPreparedBatch.mock.calls[0][0].panels.map(p => p.artifact.variant)).toEqual(['metrics', 'trend', 'scatter', 'table', 'pipeline', 'events'])
    } finally { await dispose(); await rm(dir, { recursive: true, force: true }) }
  })
})
