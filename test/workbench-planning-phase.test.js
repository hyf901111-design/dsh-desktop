import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerWorkbenchExecutionPolicy, workbenchCreationRequest } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'
import {componentCreationRequest} from '../packages/dsh-research-task-runtime/conversation-components-policy.js'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { validateWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { AIRLINE_REAL_WORKBENCH_REQUEST, AFFIRMATIVE_WORKBENCH_REQUESTS, NON_CREATION_WORKBENCH_REQUESTS } from './fixtures/workbench-creation-requests.js'

const session = (text, id = 'u') => ({ header: {}, events: [{ type: 'user/message', data: { id, source: { kind: 'user' }, content: [{ type: 'text', text }] } }] })
const admitResearchMode=s=>{s.events.push({type:'tool/call',data:{name:'client_capabilities',callId:'mode-catalog',arguments:'{}'}},{type:'tool/result',data:{message:{source:{kind:'tool',callId:'mode-catalog'},content:[{type:'tool-result',isError:false,content:[{type:'text',text:JSON.stringify({mode:'research',capabilities:[]})}]}]}}});return s}
const researchSession=text=>admitResearchMode(session(text))
const accepted = (s, isError = false) => s.events.push(
  { type: 'tool/call', data: { name: 'research_workbench_create', callId: 'create', arguments: { panels: [] } } },
  { type: 'tool/result', data: { message: { source: { callId: 'create' }, content: [{ type: 'tool-result', isError, content: [{ type: 'text', text: JSON.stringify({ planId: 'plan', status: 'accepted' }) }] }] } } }
)
function harness(efforts = ['low', 'high', 'max'], toolSchemas = []) {
  const hooks = new Map(), resolveModelInfo = vi.fn(async () => ({ reasoning: { efforts: efforts.map(id => ({ id })) }, defaultMaxTokens: 16384 }))
  let prompt, guard, selections = []
  const disposeGuard = vi.fn()
  const dispose = registerWorkbenchExecutionPolicy({ get: name => name === 'settings' ? { get: () => ({ selections }) } : undefined, llm: { resolveModelInfo }, tools: { schemas: () => toolSchemas, guard: fn => { guard = fn; return disposeGuard } }, on: (name, fn) => { hooks.set(name, fn); return () => {} }, systemPrompt: { context: value => { prompt = value; return () => {} } } })
  return { hooks, resolveModelInfo, dispose, disposeGuard, select: value => { selections = [value] }, guard: exec => guard?.(exec), text: agent => prompt.text({ agent }), request: (agent, config, signal) => hooks.get('agent/request')({ agent, signal }, async () => config), context: (agent, request, signal) => hooks.get('agent/request-context')({ agent, signal }, async () => request) }
}
const config = Object.freeze({ provider: 'zai', model: 'GLM-5.3-Flash', reasoningEffort: 'max', maxTokens: 16384 })
const planningTools = Object.freeze([
  { name: 'research_workbench_create', description: '完整创建规范', parameters: { type: 'object', properties: {} } },
  { name: 'public_data_query', parameters: { type: 'object', properties: { operation: { type: 'string', enum: ['catalog', 'query'] } } } },
  { name: 'financial_query', parameters: { type: 'object', properties: { intent: { type: 'string', enum: ['resolve', 'catalog', 'quote', 'history'] } } } },
  { name: 'ework__api', description: '已授权行业数据接口', parameters: {} },
  ...['web_search', 'web_fetch', 'read', 'bash', 'run_code', 'research_canvas_apply'].map(name => ({ name, parameters: {} }))
])
const wireRequest = () => Object.freeze({ ...config, system: '原系统要求', messages: [], tools: planningTools })
const invocation = (agent, name, args = {}, callId = name) => ({ agent, name, arguments: args, callId })
async function registeredCreationSchema() {
  let tool
  const dispose = await registerWorkbench({ tools: { register: value => { tool = value; return () => {} } }, webServer: { register: () => () => {} } }, {},
    { filePath: join(tmpdir(), `planning-schema-${randomUUID()}`, 'plans.json') })
  await dispose()
  return tool
}

describe('工作台数据获取与用户预算', () => {
  it('routes the research composer directly to the planner for disclosed tables and short single-card requests', async () => {
    const requests = JSON.parse(readFileSync(new URL('./fixtures/workbench-public-table-requests.json', import.meta.url), 'utf8'))
    const layoutRequests = JSON.parse(readFileSync(new URL('./fixtures/workbench-layout-delivery-requests.json', import.meta.url), 'utf8'))
    const treasury = '我是固收研究员，想在研究看板上放一张原生折线图，查看这三个交易日的美国10年期国债收益率。横轴按日期，纵轴注明年化 %，保留数据出处。\n\n来源为美国财政部 Daily Treasury Par Yield Curve Rates，数据日见表，收益率单位为年化 %。仅使用下面已核对的历史数据。\n\n日期\t2年期\t5年期\t10年期\t30年期\n2024-12-27\t4.31\t4.45\t4.62\t4.82\n2024-12-30\t4.24\t4.37\t4.55\t4.77\n2024-12-31\t4.25\t4.38\t4.58\t4.78'
    const manualTools = ['research_canvas_use', 'research_canvas_apply', 'research_canvas_inspect', 'client_capabilities', 'client_action']
    const wire = {...wireRequest(), tools: ['research_workbench_create', 'web_search', ...manualTools].map(name => ({name}))}
    const marked = text => {
      const value = session(text)
      value.events[0].data.source.clientMode = 'research'
      return value
    }
    for (const text of [...Object.values(requests), ...Object.values(layoutRequests), treasury, '请在当前研究看板放一个新的持仓明细卡', '请留一张小交接便签', '在研究看板留一张交接用的便签', '画一下这三个点', '再加一张明细', '在当前看板新增一张明细表', '再加一张上周净值的明细', '创建一个基金工作台，不要用智能容器做一张卡片']) {
      const h = harness(), agent = {session: marked(text)}
      expect(componentCreationRequest(agent.session), text).toMatchObject({target:'workbench', messageId:'u'})
      const result = await h.context(agent, wire)
      expect(result.tools.map(tool => tool.name), text).toContain('research_workbench_create')
      expect(result.tools.map(tool => tool.name).filter(name => manualTools.includes(name))).toEqual([])
      expect(h.guard(invocation(agent, 'research_canvas_use', {op:'create'}))).toContain('research_workbench_create')
      expect(h.guard(invocation(agent, 'research_canvas_use', {op:'observe'}))).toContain('research_workbench_create')
      expect(h.guard(invocation(agent, 'research_workbench_create'))).toBeUndefined()
      if ([layoutRequests.ETF逐项稽核, layoutRequests.资管例外追踪].includes(text)) expect(result.tools[0].name).toBe('research_workbench_create')
      else if (text.includes('\t')) expect(result.tools.map(tool=>tool.name), text).toEqual(['research_workbench_create'])
      else expect(result.tools.map(tool=>tool.name)).toContain('web_search')
      accepted(agent.session)
      expect((await h.context(agent,wire)).tools.map(tool=>tool.name)).not.toContain('research_canvas_use')
      expect(h.guard(invocation(agent,'research_canvas_use',{op:'create'}))).toContain('research_workbench_create')
    }
    for (const text of [
      '讨论一下在研究看板留一张便签有什么用', '请解释“在研究看板留一张交接便签”的意思',
      '先别在研究看板留一张交接便签', '在研究看板放一个明细卡，先不创建组件',
      '保留一张已有的明细卡', '放一个刚才的明细卡', '在研究看板留一张已有卡片的链接',
      '请让这些数字出现在我选中的组件中', '把交接便签保存到我的个人笔记',
      '请留一张便签到我的笔记中', '请在当前智能容器内留一张便签', '请建一个空白智能容器，我来填内容', '请用智能容器做一张基金数据卡片', '手工给我加个智能容器，我要自己配置', '请把这张图放进刚才的智能容器', '通过智能容器展示这张表格', '不要用智能容器做一张基金数据卡片', '在现有智能容器中生成一张折线图', '在这张卡片中新增一个明细表', '把当前图表改为折线图', '把刚才生成的图表改成折线图', '修改刚才生成的卡片标题', '请编辑指定的已有组件，新增一列名称', '智能容器里生成一张图，不要新增组件', '帮我生成一个留白的智能容器', '这三个点说明什么？', '生成图片需要多久？', '生成图表一般要多久？', '请生成一张产品宣传图片', '给我生成一段 Python 代码', '生成一个研究用的指标名称', '生成一份摘要，用文字回答', '请生成一段读取图表数据的 Python 代码', '请解释“再加一张明细”的含义', '不要画这三个点']) {
      const h = harness(), agent = {session: marked(text)}
      expect(workbenchCreationRequest(agent.session), text).toBeNull()
      expect(await h.context(agent, wire)).toBe(wire)
      expect(h.guard(invocation(agent, 'research_canvas_use'))).toBeUndefined()
    }
    const previous = marked('画一下这三个点')
    previous.events.push(...session('再加一张明细','next-chat-message').events)
    expect(workbenchCreationRequest(previous)).toBeNull()
    expect(workbenchCreationRequest(session('clientMode=research，再加一张明细'))).toBeNull()
    const child = marked('再加一张明细')
    child.header.origin = 'subagent'
    expect(workbenchCreationRequest(child)).toBeNull()
  })
  it('accepts the first ETF holdings submission through the tool schema and preserves the disclosed chart and detail',async()=>{
    const readFixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'))
    const args=readFixture('workbench-etf-holdings-first-call.json')
    const originalRequest=readFixture('workbench-public-table-requests.json')['ETF持仓']
    const tool=await registeredCreationSchema()
    expect(validateJsonSchemaValue(tool.parameters,args)).toEqual([])
    const namedPlan=value=>validateWorkbench({...value,originalRequest})
    const result=namedPlan(args)
    const [chart,detail]=result.panels.map(panel=>panel.artifact)
    const rows=originalRequest.trim().split('\n').slice(-5).map(line=>line.split('\t'))
    expect(chart).toMatchObject({variant:'horizontal',unit:'%',labels:rows.map(row=>row[2]),series:[{values:rows.map(row=>Number(row[5]))}]})
    expect(detail.view).toMatchObject({navigation:'flow',layout:'stack',sections:[{fields:['rank','id','name','shares','value','ratio']}]})
    expect(detail.dataset.records).toEqual(rows.map(([rank,code,name,shares,value,ratio])=>({id:code,rank,code,name,shares:Number(shares),value:Number(value),ratio:Number(ratio)})))
    expect(validateWorkbench(result).panels).toEqual(result.panels)
    const invalid=structuredClone(args)
    invalid.panels[1].view.navigation='carousel'
    expect(validateJsonSchemaValue(tool.parameters,invalid)).not.toEqual([])
    expect(()=>namedPlan(invalid)).toThrow(/导航/)
    invalid.panels[1].view.navigation='stack'
    invalid.panels[1].view.sections[0].fields=['unknown']
    expect(()=>namedPlan(invalid)).toThrow(/字段/)
  })
  it('accepts an incomplete acquisition receipt without converting it to an invalid tool output',async()=>{
    const tool=await registeredCreationSchema()
    expect(validateJsonSchemaValue(tool.output.schema,{planId:'same-plan',panels:['比较明细'],templateIds:['table'],status:'incomplete',detail:'来源暂不可用，保留当前计划。'})).toEqual([])
  })
  it('uses a native linked table for announcements and news records in both planning and per-card presentation', async () => {
    const h = harness(undefined, planningTools)
    const text = '创建动力电池权益研究工作台，整理宁德时代的公告和新闻，保留日期、标的、摘要和原文。'
    try {
      const wire = await h.context({ session: session(text) }, wireRequest())
      expect(wire.system).toContain('【资讯记录表格】')
      expect(wire.system).toContain('market.table')
      expect(wire.system).toContain('rowLinks')
      expect(wire.system).toContain('检索入口')
      const prompt = workbenchPanelPrompt({ title: '动力电池研究', originalRequest: text }, {
        type: 'markdown', title: '公告与新闻', prompt: '整理逐条资讯和原文', size: 'large'
      })
      expect(prompt).toContain('【资讯记录表格】')
      expect(prompt).toContain('时间线')
      const unrelated = await h.context({ session: session('创建行情工作台，展示三只股票的 K 线') }, wireRequest())
      expect(unrelated.system).not.toContain('【资讯记录表格】')
      const live = await h.context({ session: session('创建实时加密货币行情工作台，涵盖比特币行情和可搜索的数字资产资讯。') }, wireRequest())
      expect(live.system).toContain('market:"CRYPTO"')
      expect(live.system).toContain('dataSource:"kraken"')
      expect(live.system).toContain('dataSource:"doubao"')
      expect(live.system).toContain('组件库覆盖的实时面板直接提交配置')
    } finally { h.dispose() }
  })

  it('preserves comparison and concise progress guidance in the final model request', async () => {
    const tool=await registeredCreationSchema()
    const h=harness(undefined,[tool,...planningTools.slice(1)])
    const agent={session:session('做个A股宽基指数对比工作台，看看沪深300、中证500和创业板近三个月的表现')}
    const wire=await h.context(agent,{...wireRequest(),tools:[tool,...planningTools.slice(1)]})
    expect(wire.tools[0].parameters).toBe(tool.parameters)
    expect(wire.system).toContain('先理解用户问题和约束')
    expect(wire.system).toContain('不公开接口目录、来源选择原则')
    h.dispose()
  })
  it('rejects simulated output at the actual creation boundary for an authored real-data request', async()=>{
    const tool=await registeredCreationSchema()
    const args={requestId:'wrong-simulation',title:'航空观察',dataMode:'simulated',panels:[{title:'行情',prompt:'模拟行情记录',type:'market',size:'medium'}]}
    for(const text of [AIRLINE_REAL_WORKBENCH_REQUEST,'请创建只用实际取得数据的金融工作台，不要用模拟数字补齐。','请建立一个真实数据工作台，模拟数据一律禁止。','请建立一个真实数据工作台，不可以使用模拟数据。','Create a dashboard using real data, no simulated values.']){
      const exec={agent:{session:session(text)}}
      await expect(Promise.resolve().then(()=>tool.execute(args,exec))).rejects.toThrow('用户要求真实数据，不能降级为模拟模式')
    }
  })

  it.each(AFFIRMATIVE_WORKBENCH_REQUESTS)('preserves authorized acquisition and user controls for natural-language creation: %s', async text => {
    for (const inbox of [false, true]) {
      const s = session(text)
      if (inbox) s.events = [{ type: 'agent/inbox/spliced', data: { inserted: s.events.map(event => event.data) } }]
      const board = componentCreationRequest(s)?.target === 'component'
      if(board)admitResearchMode(s)
      s.append = (type, data) => s.events.push({ type, data })
      const h = harness(undefined, planningTools), agent = { session: s }
      expect(workbenchCreationRequest(s)?.text).toBe(text)
      expect(await h.request(agent, config)).toBe(config)
      expect(s.events.find(event => event.type === 'sherlock/workbench-planning-budget')).toBeUndefined()
      const wire = await h.context(agent, wireRequest())
      expect(wire.tools.map(tool => tool.name)).toEqual(planningTools.map(tool => tool.name).filter(name => !board || name !== 'research_canvas_apply'))
      expect(h.guard(invocation(agent, 'skill'))).toBeUndefined()
      expect(h.guard(invocation(agent, 'financial_query', { intent: 'quote' }))).toBeUndefined()
      expect(h.guard(invocation(agent, 'research_workbench_create'))).toBeUndefined()
      if (text === AIRLINE_REAL_WORKBENCH_REQUEST) expect(wire.tools[0].parameters.properties.dataMode.enum).toEqual(['source'])
      h.dispose()
    }
  })

  it.each(NON_CREATION_WORKBENCH_REQUESTS)('preserves ordinary controls and tools for existing-board requests: %s', async text => {
    const h = harness(undefined, planningTools), agent = { session: session(text) }, wire = wireRequest()
    expect(workbenchCreationRequest(agent.session)).toBeNull()
    expect(await h.request(agent, config)).toBe(config)
    expect(await h.context(agent, wire)).toBe(wire)
    expect(h.text(agent)).toBe('')
    h.dispose()
  })

  it('keeps model controls unchanged for failed-component repairs and no-add instructions',async()=>{
    for(const text of [
      '继续修复当前这个工作台，估值组件生成失败，请先做静态展示。不要新增工作台和重复组件。',
      '修复现有工作台的图表生成失败问题，保留原组件和数据。',
      '补充：不要新增组件，只修复已有图表。'
    ]){
      const h=harness(),agent={session:session(text)}
      expect(workbenchCreationRequest(agent.session)).toBeNull()
      expect(await h.request(agent,config)).toEqual(config)
    }
    expect(workbenchCreationRequest(session('修复现有工作台的图表，另外创建一个新的行业研究工作台。'))).not.toBeNull()
  })
  it('keeps read-only state checks out of creation and immediately restores canvas inspection for inbox steering', async () => {
    for (const text of [
      '请检查当前工作台各组件的生成状态与数据日期，说明仍需处理的缺失和错误，暂不修改或新建组件。',
      '查看当前工作台组件生成状态和数据日期。',
      '只读检查已有工作台中生成的组件，不做修改。',
      '请检查当前工作台生成的图表，并列出缺失。',
      '请检查当前工作台，暂不新建组件。',
      '请检查当前工作台，先不生成新卡片。',
      '本轮不创建工作台，只检查组件生成情况。'
    ]) {
      const h = harness(), agent = { session: session('创建研究工作台') }, request = wireRequest()
      const limited = await h.request(agent, config)
      await h.context(agent, request)
      agent.session.events.push({ type: 'agent/inbox/spliced', data: { inserted: session(text, 'read-state').events.map(event => event.data) } })
      expect(workbenchCreationRequest(agent.session), text).toBeNull()
      expect(h.guard(invocation(agent, 'research_canvas_inspect'))).toBeUndefined()
      expect(await h.context(agent, request)).toBe(request)
      expect(await h.request(agent, limited)).toEqual(config)
      expect(h.text(agent)).toBe('')
    }
    for (const text of [
      '请检查当前工作台组件生成状态，另外新建一个预算组件。',
      '暂不修改或新建组件，但另外创建一个独立的行业工作台。',
      '暂不新建工作台；另外创建一张排期卡片。',
      '本轮不新建工作台\n请创建一张排期卡片。',
      '本轮不修改当前工作台，同时新建一个独立行业研究工作台。',
      '请检查当前已有工作台，并创建一张折线图组件。'
    ]) expect(workbenchCreationRequest(researchSession(text)), text).not.toBeNull()
  })
  it('preserves the selected budget for explicit single components before and after acceptance', async () => {
    for (const text of ['创建一个装置撤展交接组件，用8条模拟记录，点击查看完整说明', '请生成一张古籍修复流转卡片，用虚构记录']) {
      const h = harness(), agent = { session: researchSession(text) }
      expect(workbenchCreationRequest(agent.session)?.text).toBe(text)
      const planned = await h.request(agent, config)
      expect(planned).toBe(config)
      expect(h.text(agent)).toContain('调用 research_workbench_create')
      accepted(agent.session)
      expect(await h.request(agent, planned)).toEqual(config)
    }
  })

  it('does not expand a single popular ETF quote component into the eight-panel workbench preset', () => {
    const h = harness(undefined, [{ name: 'public_data_query' }])
    const text = h.text({ session: researchSession('创建一个国内热门基金报价组件') })
    expect(text).toContain('publicData')
    expect(text).not.toContain('"preset":"cn-hot-etf-live"')
  })

  it('keeps the explicit Max and output cap through creation acceptance', async () => {
    const h = harness(), agent = { session: session('创建活动筹备工作台，使用自洽模拟数据') }
    const planned = await h.request(agent, config)
    expect(planned).toBe(config)
    expect(config).toEqual({ provider: 'zai', model: 'GLM-5.3-Flash', reasoningEffort: 'max', maxTokens: 16384 })
    accepted(agent.session)
    // The loop can reconstruct the next seed from its last execution config.
    expect(await h.request(agent, { ...planned })).toEqual(config)
    expect(await h.request(agent, config)).toEqual(config)
    expect(h.text(agent)).toContain('已成功受理')
  })

  it('keeps controls through failed creation, cancellation and a new human request', async () => {
    const h = harness(), agent = { session: session('创建展览工作台，模拟数据') }
    const first = await h.request(agent, config)
    accepted(agent.session, true)
    expect(await h.request(agent, { ...first })).toEqual(first)
    agent.session.events.push(...session('取消，不再创建工作台', 'cancel').events)
    expect(await h.request(agent, { ...first })).toEqual(config)
    expect(h.text(agent)).toBe('')
    agent.session.events.push(...session('重新创建一个工作台，用模拟数据', 'again').events)
    expect(await h.request(agent, config)).toEqual(first)
  })

  it('leaves ordinary chat, existing-board edits, child sessions and unsupported effort declarations unchanged', async () => {
    const h = harness()
    for (const text of ['解释预算应该如何分配', '修改当前工作台的预算表', '在现有看板创建一个预算组件', '修复组件生成逻辑', '为什么生成组件这么慢', '不要生成组件', '创建一个React组件，写入src/Card.tsx', '创建React仪表盘组件，写入src/Dashboard.tsx', 'Create a React dashboard component in src/Dashboard.tsx']) {
      const agent = { session: session(text) }
      expect(workbenchCreationRequest(agent.session)).toBeNull()
      expect(await h.request(agent, config)).toBe(config)
    }
    const child = { session: { ...session('创建活动工作台'), header: { origin: 'subagent' } } }
    expect(await h.request(child, config)).toBe(config)
    const unsupported = harness(['high', 'max'])
    expect(await unsupported.request({ session: session('创建活动工作台') }, config)).toBe(config)
    const minimal = harness(['minimal', 'max'])
    expect((await minimal.request({ session: session('创建活动工作台') }, { ...config, maxTokens: 2048 })).reasoningEffort).toBe('max')
    expect((await minimal.request({ session: session('创建活动工作台') }, { ...config, maxTokens: 2048 })).maxTokens).toBe(2048)
  })

  it('preserves a route/effort switch and does not continue a cancelled request', async () => {
    const h = harness(), agent = { session: session('创建医疗器械活动工作台') }
    await h.request(agent, config)
    agent.session = session('停止创建，讨论一下计划', 'stop')
    const switched = { provider: 'other', model: 'selected', reasoningEffort: 'high', maxTokens: 8192 }
    expect(await h.request(agent, switched)).toEqual(switched)
    const controller = new AbortController(); controller.abort(Error('cancelled'))
    agent.session = session('创建物流工作台', 'next')
    await expect(h.request(agent, config, controller.signal)).rejects.toThrow('cancelled')
    h.resolveModelInfo.mockRejectedValueOnce(Error('unavailable'))
    expect(await h.request(agent, config)).toEqual(config)
  })

  it('recovers original controls after runtime recreation using bounded phase metadata, without storing request headers', async () => {
    const s = session('创建活动工作台，使用模拟数据')
    s.append = (type, data) => s.events.push({ type, data })
    const agent = { session: s }, before = harness()
    const limited = { ...config, reasoningEffort: 'low', maxTokens: 4096 }
    s.append('sherlock/workbench-planning-budget', { version: 1, messageId: 'u', provider: config.provider, model: config.model, original: { reasoningEffort: config.reasoningEffort, maxTokens: config.maxTokens }, limited: { reasoningEffort: 'low', maxTokens: 4096 }, phase: 'planning' })
    const record = s.events.find(event => event.type === 'sherlock/workbench-planning-budget')
    expect(record).toBeDefined()
    expect(Object.keys(record.data).sort()).toEqual(['limited', 'messageId', 'model', 'original', 'phase', 'provider', 'version'])
    expect(record.data.original).toEqual({ reasoningEffort: 'max', maxTokens: 16384 })
    expect(record.data.limited).toEqual({ reasoningEffort: 'low', maxTokens: 4096 })
    const after = harness()
    s.events.push(...session('取消，先讨论方案', 'cancel-after-restart').events)
    expect(await after.request(agent, { ...limited })).toEqual(config)
    expect(s.events.at(-1).data.phase).toBe('restored')
  })

  it('lets newer same-model Low or default selections win over the old Max even after restart', async () => {
    for (const reasoningEffort of ['low', undefined]) {
      for (const restart of [false, true]) {
        const s = session('创建活动工作台，模拟数据'); s.id = 'selected-session'
        s.append = (type, data) => s.events.push({ type, data })
        const agent = { session: s }, before = harness(), limited = { ...config, reasoningEffort: 'low', maxTokens: 4096 }
        s.append('sherlock/workbench-planning-budget', { version: 1, messageId: 'u', provider: config.provider, model: config.model, original: { reasoningEffort: config.reasoningEffort, maxTokens: config.maxTokens }, limited: { reasoningEffort: 'low', maxTokens: 4096 }, phase: 'planning' })
        const h = restart ? harness() : before
        h.select({ sessionId: s.id, provider: config.provider, model: config.model, ...(reasoningEffort ? { reasoningEffort } : {}) })
        s.events.push(...session('取消创建，讨论人员分配', 'switch').events)
        const seed = { ...limited }; if (reasoningEffort === undefined) delete seed.reasoningEffort
        const actual = await h.request(agent, seed)
        expect(actual.reasoningEffort).toBe(reasoningEffort)
        expect(actual.maxTokens).toBe(config.maxTokens)
      }
    }
  })

  it('uses a concise shared-content contract across diverse simulated domains', () => {
    const h = harness()
    for (const domain of ['海边三天夜间艺术节', '研究生实验排期', '仓储配送', '社区义诊', '博物馆巡展']) {
      const text = h.text({ session: session(`创建${domain}工作台，用自洽模拟数据；需要排期、人员、物资、预算和风险预案。`) })
      // The shared-dataset/view contract is included once, without sample rows.
      expect(text.length).toBeLessThan(4000)
      expect(text).toContain('generationMode:"deferred"')
      expect(text).toContain('sharedContext')
      expect(text).toContain('调用 research_workbench_create')
      expect(text).not.toContain('market.pipeline')
      expect(text).not.toContain('首次调用必须同时附完整artifact')
    }
  })

  it('anchors relative dates to the host date while preserving explicitly requested fictional dates and actual interaction limits', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T12:00:00+08:00'))
    try {
      const text = harness().text({ session: session('创建三天活动工作台，允许模拟数据') })
      expect(text).toContain('2026-10-19')
      expect(text).toContain('用户明确指定')
      expect(text).toContain('跨卡自动执行')
      expect(text).toContain('冲突校验')
      expect(text).toContain('撤销')
      expect(text).not.toContain('2025-')
    } finally { vi.useRealTimers() }
  })

  it('keeps authorized tools at the final request boundary without changing the prepared model config', async () => {
    const h = harness(), agent = { session: session('创建巡展工作台，用模拟数据') }
    const originalTool = Object.freeze({ name: 'research_workbench_create', description: '旧完整规范'.repeat(1000), parameters: { type: 'object', properties: { generationMode: { enum: ['parallel', 'deferred'] } } } })
    const other = { name: 'other', description: '其他工具', parameters: {} }
    const request = Object.freeze({ ...config, system: '现有系统要求', messages: [], tools: [originalTool, other] })
    const hook = h.hooks.get('agent/request-context')
    expect(hook).toBeTypeOf('function')
    const short = await hook({ agent }, async () => request)
    expect(short.tools[0].description.length).toBeLessThan(2000)
    expect(short.tools[0].description).toContain('deferred')
    expect(short.tools[0].parameters).toBe(originalTool.parameters)
    expect(short.tools.map(tool => tool.name)).toEqual(['research_workbench_create', 'other'])
    expect(short.reasoningEffort).toBe('max')
    expect(short.maxTokens).toBe(16384)
    expect(originalTool.description.length).toBe(5000)
    accepted(agent.session)
    expect(await hook({ agent }, async () => request)).toBe(request)
  })

  it('allows complete authorized acquisition before the first submission without mutating source schemas', async () => {
    const h = harness(), agent = { session: session('创建农业病虫害监测工作台，使用真实来源') }
    const request = wireRequest(), planned = await h.context(agent, request)
    expect(planned.tools.map(tool => tool.name)).toEqual(request.tools.map(tool => tool.name))
    expect(planned.tools[1]).toBe(request.tools[1])
    expect(planned.tools[2].parameters.properties.intent.enum).toEqual(['resolve', 'catalog', 'quote', 'history'])
    for (const [name, args] of [['financial_query', { intent: 'history' }], ['public_data_query', { operation: 'query' }], ['ework__api', {}], ['web_search', {}], ['read', {}], ['run_code', {}]]) {
      expect(h.guard(invocation(agent, name, args))).toBeUndefined()
    }
    expect(planned.system).toContain('同一批对象')
    expect(planned.system).toContain('panel.content')
    expect(planned.system).toContain('原系统要求')
    expect(planned.system).not.toContain('先规划再取数')
  })

  it('does not replace acquisition with a directory budget after multiple source calls', async () => {
    const h = harness(), agent = { session: session('创建股票与宏观工作台，使用真实来源') }, request = wireRequest()
    await h.context(agent, request)
    for (let i = 0; i < 9; i++) expect(h.guard(invocation(agent, 'financial_query', { intent: 'history', query: '对象' + i }, 'data-' + i))).toBeUndefined()
    const next = await h.context(agent, request)
    expect(next.tools.map(tool => tool.name)).toEqual(request.tools.map(tool => tool.name))
    expect(next.tools.find(tool => tool.name === 'financial_query').parameters).toBe(request.tools[2].parameters)
  })

  it('restores a legacy planning cap even while the original creation is pending', async () => {
    const s = session('创建供应链工作台，使用真实来源')
    s.append = (type, data) => s.events.push({ type, data })
    s.append('sherlock/workbench-planning-budget', { version: 1, messageId: 'u', provider: config.provider, model: config.model, original: { reasoningEffort: 'max', maxTokens: 16384 }, limited: { reasoningEffort: 'low', maxTokens: 4096 }, phase: 'planning' })
    const h = harness(), agent = { session: s }
    expect(await h.request(agent, { ...config, reasoningEffort: 'low', maxTokens: 4096 })).toEqual(config)
    expect(s.events.at(-1).data.phase).toBe('restored')
    expect(h.resolveModelInfo).not.toHaveBeenCalled()
    expect((await h.context(agent, wireRequest())).tools.map(tool => tool.name)).toEqual(planningTools.map(tool => tool.name))
  })

  it('retains acquisition context for invalid receipts and releases only on the matching accepted result', async () => {
    const h = harness(), agent = { session: session('创建能源供应链工作台') }, request = wireRequest()
    await h.context(agent, request)
    accepted(agent.session, true)
    const result = agent.session.events.at(-1).data.message.content[0]
    for (const value of [{ planId: 'plan', status: 'accepted', isError: true }, { planId: 'plan', status: 'preparing' }, { planId: '', status: 'accepted' }, { status: 'accepted' }, 'not a receipt']) {
      result.isError = Boolean(value.isError)
      result.content[0].text = JSON.stringify(value)
      expect(await h.context(agent, request)).not.toBe(request)
    }
    result.content[0].text = JSON.stringify({ planId: 'plan', status: 'accepted' })
    agent.session.events.at(-1).data.message.source.callId = 'another-call'
    expect(h.guard(invocation(agent, 'web_search'))).toBeUndefined()
    agent.session.events.at(-1).data.message.source.callId = 'create'
    // Release immediately on the receipt, before another model request.
    expect(h.guard(invocation(agent, 'web_search'))).toBeUndefined()
    expect(await h.context(agent, request)).toBe(request)
  })

  it('releases when a newer human request interrupts planning and never limits other agents or component children', async () => {
    const h = harness(), agent = { session: session('创建医学文献工作台') }, request = wireRequest()
    const limited = await h.request(agent, config)
    await h.context(agent, request)
    const child = { session: { ...session('创建医学文献工作台'), header: { parentSession: 'parent', origin: 'subagent' } } }
    const other = { session: session('解释这些参考资料') }
    expect(await h.context(child, request)).toBe(request)
    expect(await h.context(other, request)).toBe(request)
    expect(h.guard(invocation(child, 'web_search'))).toBeUndefined()
    expect(h.guard(invocation(other, 'web_search'))).toBeUndefined()
    agent.session.events.push({ type: 'agent/inbox/spliced', data: { inserted: session('补充：只编辑已有组件标题', 'steering').events.map(event => event.data) } })
    expect(h.guard(invocation(agent, 'research_canvas_apply'))).toBeUndefined()
    expect(await h.context(agent, request)).toBe(request)
    expect(await h.request(agent, limited)).toEqual(config)
  })

  it('releases execution guards on abort, terminal errors, turn end and disposal without losing original model controls', async () => {
    for (const finish of ['abort', 'error', 'turn/end', 'dispose']) {
      const h = harness(), agent = { session: session('创建展览进度工作台') }, request = wireRequest(), controller = new AbortController()
      const limited = await h.request(agent, config, controller.signal)
      await h.context(agent, request, controller.signal)
      expect(h.guard(invocation(agent, 'web_search'))).toBeUndefined()
      if (finish === 'abort') controller.abort(Error('cancelled'))
      if (finish === 'error') h.hooks.get('agent/error')?.({ agent, error: Error('model failed') })
      if (finish === 'turn/end') h.hooks.get('session/event')?.(agent.session, { type: 'turn/end', data: { reason: { kind: 'error' } } })
      if (finish === 'dispose') { h.dispose(); expect(h.disposeGuard).toHaveBeenCalledOnce() }
      expect(h.guard(invocation(agent, 'web_search'))).toBeUndefined()
      agent.session.events.push(...session('解释当前数据，暂不创建', 'next').events)
      expect(await h.request(agent, limited)).toEqual(config)
    }
  })

  it('does not apply a planning gate without the creation capability or mutate any inherited tool schema', async () => {
    const h = harness(), agent = { session: session('创建物流工作台') }
    const unavailable = { ...wireRequest(), tools: planningTools.slice(1) }
    expect(await h.context(agent, unavailable)).toBe(unavailable)
    expect(h.guard(invocation(agent, 'web_search'))).toBeUndefined()
    const request = wireRequest(), original = structuredClone(request)
    await h.context(agent, request)
    expect(request).toEqual(original)
    const child = { session: { ...session('创建物流工作台'), header: { parentSession: 'parent', origin: 'subagent' } } }
    expect((await h.context(child, request)).tools).toBe(planningTools)
  })

  it('preserves explicit offline constraints without restricting unrelated simulation tools', async () => {
    const offline = harness(), agent = { session: session('创建事故记录工作台，禁止联网，只用已有记录') }
    expect((await offline.context(agent, wireRequest())).tools.map(tool => tool.name)).toEqual(['research_workbench_create'])
    expect(offline.guard(invocation(agent, 'financial_query', { intent: 'history' }))).toContain('联网限制')
    const simulation = harness(), simulated = { session: session('创建考古工作台，使用模拟数据') }
    expect((await simulation.context(simulated, wireRequest())).tools.map(tool => tool.name)).toEqual(planningTools.map(tool => tool.name))
    expect(simulation.guard(invocation(simulated, 'run_code'))).toBeUndefined()
  })

  it('offers only valid source creation parameters on the real first wire schema when simulation is explicitly forbidden', async () => {
    const originalTool = await registeredCreationSchema(), before = structuredClone(originalTool.parameters)
    const h = harness(), request = { ...wireRequest(), tools: [originalTool, ...planningTools.slice(1)] }
    for (const text of ['创建宁德时代真实数据研究工作台，只使用实际取得的真实数据；不用模拟数据。', '创建农业监测工作台，使用真实来源。', 'Create a research dashboard with real data only; no simulated data.']) {
      const agent = { session: { header: {}, events: [{ type: 'agent/inbox/spliced', data: { inserted: session(text).events.map(event => event.data) } }] } }
      const planned = await h.context(agent, request), schema = planned.tools[0].parameters
      expect(schema.properties.dataMode.enum).toEqual(['source'])
      expect(schema.additionalProperties).toBe(false)
      expect(schema.properties.preset.enum).not.toContain('openterminal-research')
      for (const key of ['generationMode', 'sharedContext', 'originalRequest']) expect(schema.properties).not.toHaveProperty(key)
      const panel = schema.properties.panels.items
      expect(panel.properties).toHaveProperty('view')
      expect(panel.properties).toHaveProperty('content')
      expect(schema.properties).toHaveProperty('sharedDatasets')
      expect(panel.properties.type.enum).toContain('view')
      for (const key of ['prompt','artifact','publicData','layout']) expect(panel.properties[key]).toEqual(originalTool.parameters.properties.panels.items.properties[key])
      const input = { requestId: 'actual-source', title: '真实记录', dataMode: 'source', panels: [{ title: '观察记录', prompt: '实际来源，缺失字段明确标注', type: 'table', size: 'large' }] }
      expect(validateJsonSchemaValue(schema, input)).toEqual([])
      const {size, ...autoSizedPanel}=input.panels[0]
      expect(validateJsonSchemaValue(schema,{...input,panels:[autoSizedPanel]})).toEqual([])
      expect(validateWorkbench({...input,panels:[autoSizedPanel]}).panels[0].size).toBeTruthy()
      expect(validateJsonSchemaValue(schema, { ...input, dataMode: 'simulated' }).length).toBeGreaterThan(0)
      expect(validateJsonSchemaValue(schema, { ...input, generationMode: 'deferred', sharedContext: '真实数据的公共约束' }).length).toBeGreaterThan(0)
      const snapshot = { ...input, panels: [{ ...input.panels[0], artifact: { version: 1, type: 'table', title: '已有真实记录', columns: ['字段', '记录'], rows: [['实测数量', '3']] } }] }
      expect(validateJsonSchemaValue(schema, snapshot)).toEqual([])
      expect(validateWorkbench(snapshot).panels[0].artifact.rows).toEqual([['实测数量', '3']])
      const contentSnapshot = { ...input, panels: [{ ...input.panels[0], content: { rows: [{ field: '实测数量', value: 3 }], columns: [{ key: 'field', label: '字段' }, { key: 'value', label: '记录' }], sources: ['实测文件'], asOf: '2026-11-11' } }] }
      expect(validateJsonSchemaValue(schema, contentSnapshot)).toEqual([])
      expect(() => validateWorkbench({ ...input, generationMode: 'deferred', sharedContext: '真实数据的公共约束' })).toThrow('仅适用于模拟数据')
      expect(planned.tools[0].description).toContain('省略 generationMode、sharedContext、originalRequest')
      expect(planned.tools[0].description).toContain('已有真实记录')
      expect(planned.tools[0].description).toContain('artifact')
      expect(planned.system).toContain('省略 generationMode、sharedContext、originalRequest')
      expect(h.text(agent)).not.toContain('generationMode:"deferred"')
      expect(planned.tools.map(tool => tool.name)).toContain('financial_query')
    }
    expect(originalTool.parameters).toEqual(before)
  })

  it('preserves generic, simulated and mixed-source schema routes, including ordinary custom HTML fallback', async () => {
    const originalTool = await registeredCreationSchema(), request = { ...wireRequest(), tools: [originalTool] }, h = harness()
    for (const text of ['创建巡展工作台', '创建巡展工作台，使用自洽模拟数据', '创建工作台，真实营收使用已有数据，未来排期允许模拟数据', '创建工作台，不使用真实数据，只使用模拟数据', '创建工作台，真实行情，其他部分允许虚构记录']) {
      const planned = await h.context({ session: session(text) }, request)
      expect(planned.tools[0].parameters).toBe(originalTool.parameters)
      expect(planned.tools[0].parameters.properties.dataMode.enum).toEqual(['simulated', 'source'])
      expect(planned.tools[0].parameters.properties.generationMode.enum).toContain('deferred')
      expect(planned.tools[0].parameters.properties.panels.items.properties.type.enum).toContain('html')
    }
    const text = h.text({ session: session('创建古籍交接工作台，允许模拟，点击行展开详情') })
    expect(text).toContain('sharedDatasets+view')
    expect(text).toContain('dataMode:"simulated"')
    expect(text).not.toContain('仅原请求为模拟数据时，省略dataMode')
  })

  it.each(['创建珊瑚礁生态监测工作台，使用真实来源', AIRLINE_REAL_WORKBENCH_REQUEST])('acquires real data through the real agent loop and tool scheduler while workers retain every parent source: %s', async text => {
    const ctx = new Context(), requests = [], bodies = [], errors = []
    new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx)
    new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 2 })
    ctx.on('agent/error', ({ error }) => errors.push(error))
    const tool = (name, execute) => ctx.tools.register({ name, description: name, parameters: name === 'financial_query' ? planningTools.find(value => value.name === name).parameters : { type: 'object', properties: {}, additionalProperties: true },
      output: { schema: {}, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }, execute })
    for (const name of ['financial_query', 'web_search']) tool(name, async (_args, exec) => { bodies.push([exec.agent.id, name]); return { records: [] } })
    let child, inherited
    tool('research_workbench_create', async (_args, exec) => {
      inherited = ctx.tools.schemas(exec.agent).map(value => value.name)
      child = (await ctx.agents.create({ sessionId: 'planning-child', meta: { parentSession: exec.agent.id, origin: 'subagent' }, agentOptions: { provider: 'local', model: 'local' } })).agent
      expect((await ctx.tools.execute({ ...invocation(child, 'web_search'), signal: exec.signal })).isError).toBe(false)
      return { planId: 'real-host-receipt', status: 'accepted' }
    })
    class Model extends LlmAdapter {
      async resolveModel(provider, id) { return { provider, id, name: id, defaultMaxTokens: 16384, reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'max', name: 'Max' }], defaultEffort: 'max' } } }
      async *stream(request) {
        requests.push(request)
        const calls = requests.length === 1 ? [['financial_query', { intent: 'history' }], ['web_search', {}]] : requests.length === 2 ? [['research_workbench_create', { title: '需求驱动规划', panels: [{ title: '来源记录', prompt: '真实来源，待取得记录', type: 'table', size: 'large' }] }]] : []
        for (const [index, [name, args]] of calls.entries()) {
          yield { type: 'block-start', index, blockType: 'tool-call' }
          yield { type: 'block-end', index, block: { type: 'tool-call', id: `step-${requests.length}-${index}`, name, arguments: JSON.stringify(args) } }
        }
        if (!calls.length) {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          yield { type: 'block-end', index: 0, block: { type: 'text', text: '规划已受理，面板生成中。' } }
        }
        yield { type: 'finish', reason: { kind: 'stop' } }
      }
    }
    ctx.llm.registerAdapter(['local'], new Model())
    const dispose = registerWorkbenchExecutionPolicy(ctx)
    try {
      const parent = (await ctx.agents.create({ sessionId: 'planning-parent', agentOptions: { provider: 'local', model: 'local', maxTokens: 16384 } })).agent
      parent.followup({ ...session(text).events[0].data, role: 'user' })
      await parent.whenIdle()
      expect(errors).toEqual([])
      expect(requests).toHaveLength(3)
      expect(requests[0].tools.map(value => value.name).sort()).toEqual(['financial_query', 'research_workbench_create', 'web_search'])
      expect(requests[0].tools[0].parameters.properties.intent.enum).toEqual(['resolve', 'catalog', 'quote', 'history'])
      expect(requests[0].reasoningEffort).toBe('max')
      expect(requests[0].maxTokens).toBe(16384)
      expect(parent.session.events.find(event => event.type === 'sherlock/workbench-planning-budget')).toBeUndefined()
      expect(bodies).toEqual([['planning-parent', 'financial_query'], ['planning-parent', 'web_search'], ['planning-child', 'web_search']])
      expect(inherited.sort()).toEqual(['financial_query', 'research_workbench_create', 'web_search'])
      expect(ctx.tools.schemas(child).map(value => value.name).sort()).toEqual(inherited)
      expect(requests[2].tools.map(value => value.name).sort()).toEqual(inherited)
      expect(requests[2].reasoningEffort).toBe('max')
      expect(requests[2].maxTokens).toBe(16384)
      expect(parent.session.events.filter(event => event.type === 'tool/result' && event.data.message.content[0].isError)).toHaveLength(0)
    } finally { dispose(); await ctx.fiber.dispose() }
  })
})
