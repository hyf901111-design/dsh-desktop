import { expect, it } from 'vitest'
import { preferredComponentSourceTools, componentSourceInstruction, registerComponentSourceGuidance, componentPluginSourceRequired, componentPluginSourceProhibited } from '../packages/dsh-research-task-runtime/component-source-tools.js'
import officialSchemas from './fixtures/official-mcp-source-schemas.json'

it('recognizes the current official financial MCP tools even when descriptions no longer use the old vendor name',()=>{
 const schemas=[{name:'public_data_query'},{name:'financial_query'},...officialSchemas,{name:'ework__calendar',description:'查询个人日历事项'}];
 expect(preferredComponentSourceTools(schemas,'华能国际600011、华电国际600027、国电电力600795最新财务报表，营业收入和净利润对比').map(t=>t.name)).toEqual(officialSchemas.map(t=>t.name));
 expect(preferredComponentSourceTools(schemas,'只使用腾讯行情做股票估值，未提供的市盈率明确缺失')).toEqual([]);
 expect(preferredComponentSourceTools(schemas,'整理演出人员和设备排期')).toEqual([]);
});

it('recognizes company financial operating comparisons and does not invent acquisition workflows or a longer history during planning',()=>{
 const schemas=[{name:'public_data_query'},{name:'financial_query'},...officialSchemas]
 const request='研究华能国际600011、华电国际600027、国电电力600795，以沪深300为参考，判断最近股价表现与最新已披露财务与经营差异。'
 const preferred=preferredComponentSourceTools(schemas,request)
 expect(preferred.map(tool=>tool.name)).toEqual(officialSchemas.map(tool=>tool.name))
 const guidance=componentSourceInstruction(preferred,request,new Date(),{planning:true})
 expect(guidance).toContain('不替子任务编写工具调用流程')
 expect(guidance).toContain('research/profile仅支持公募基金')
 expect(guidance).toContain('不自行扩大到一年或多年度')
 expect(preferredComponentSourceTools(schemas,'财务预算：跟踪艺术节场租、人员与物资支出')).toEqual([])
})

it('starts an A-share filed-statement comparison from verified statement definitions and keeps operating fields separate',()=>{
 const tools=[{name:'ework__data',description:'通联 DataYes 金融数据 API'}]
 const request='华能国际600011.SH、华电国际600027.SH、国电电力600795.SH最新已披露财务与经营差异，营业收入、归母净利润、同比和发电量。'
 const text=componentSourceInstruction(tools,request)
 expect(text).toContain('getFdmtISLT2018')
 expect(text).toContain('getFdmtMainDataLt')
 expect(text).toContain('先读取当前接口定义')
 expect(text).toContain('不能代替正式财报')
 expect(text).toContain('经营字段')
 expect(text).toContain('getEquOperData')
 expect(text).toContain('读取一次当前接口定义并在各公司间复用')
 expect(text).toContain('核对分页和原始单位')
 expect(text).toContain('实际报告期、披露日期和单位')
 expect(componentSourceInstruction(tools,request,new Date(),{planning:true})).not.toContain('getFdmtISLT2018')
 expect(componentSourceInstruction(tools,request,new Date(),{planning:true})).not.toContain('getEquOperData')
 expect(componentSourceInstruction(tools,'600011.SH营业收入对比。不要查询装机和发电量等经营数据。')).not.toContain('getEquOperData')
})

it.each(['600011.SH','002026.SZ','601985.SH'])('bounds the first latest-statement query by reporting dates without treating stock digits as a historical year: %s',symbol=>{
 const tools=[{name:'ework__data',description:'通联 DataYes 金融数据 API'}],now=new Date('2026-10-20T18:00:00Z')
 const text=componentSourceInstruction(tools,symbol+'最新已披露财务指标，收入、利润、同比和发电量。',now)
 expect(text).toContain('20250101 至 20261021')
 expect(text).toContain('必要同比基期')
 expect(text).toContain('不先取全部历史')
 const explicit=componentSourceInstruction(tools,'600011.SH 2021年半年报财务指标，与2020年同期对比',now)
 expect(explicit).not.toContain('20250101 至 20261021')
 expect(explicit).toContain('实际报告期、披露日期和单位')
})

it.each(['600011.SH业绩预告与盈利预测对比','AAPL最新已披露财报','只查询600011.SH近期股价，不取财报'])('does not route a different financial task through the A-share filed-statement path: %s',request=>{
 const text=componentSourceInstruction([{name:'ework__data',description:'通联 DataYes 金融数据 API'}],request)
 expect(text).not.toContain('getFdmtISLT2018')
 expect(text).not.toContain('getFdmtMainDataLt')
})

it.each(['AAPL最新已披露财报','最新GDP季度数据','600011.SH最新业绩预告'])('does not apply a ten-day quote window to a different reporting cadence: %s',request=>{
 const text=componentSourceInstruction([{name:'ework__data',description:'通联 DataYes 金融数据 API'}],request)
 expect(text).not.toContain('最新日行情的第一次业务调用')
})

it('keeps date windows local to the panel and does not route ETF names to index quotes', () => {
  const tools=[{name:'ework__data',description:'通联 DataYes API'}], now=new Date('2026-09-26T01:00:00Z')
  const plan=componentSourceInstruction(tools,'创建沪深300ETF工作台：最新行情、大盘概览、近20个交易日K线',now,{planning:true})
  expect(plan).not.toContain('20260815')
  expect(plan).not.toContain('getMktIdxd')
  expect(componentSourceInstruction(tools,'沪深300ETF 最新行情',now)).not.toContain('getMktIdxd')
  expect(componentSourceInstruction(tools,'最新指数概览',now)).toContain('20260916 至 20260926')
})

it('queries enough calendar days for the requested trading-day series on its first fetch', () => {
  const tools=[{name:'ework__data',description:'通联 DataYes API'}]
  const now=new Date('2026-09-25T19:30:00Z')
  const text=componentSourceInstruction(tools,'宁德时代近 20 个交易日日 K 线',now)
  expect(text).toContain('20260815 至 20260926')
  expect(text).toContain('最后 20 个实际交易日')
  expect(text).toContain('自然日缓冲')
  expect(text).not.toContain('20260916 至 20260926')
  const dated=componentSourceInstruction(tools,'宁德时代 2025-01-01 至 2025-03-31 日 K 线',now)
  expect(dated).toContain('用户指定的日期范围')
  expect(dated).not.toContain('20260916 至 20260926')
})

it('prefers visible DataYes tools for a financial component without naming unavailable tools', () => {
  const schemas = [
    { name: 'ework__t_search', description: '搜索 Datayes 平台中最匹配的金融数据 API' },
    { name: 'ework__t_call', description: '调用 Datayes 业务 API 并返回数据' },
    { name: 'financial_query', description: '查询股票行情' },
    { name: 'ework__t_other', description: '读取日历事项' }
  ]
  const selected = preferredComponentSourceTools(schemas, '使用通联的白酒行业工作台：股票日 K 线与成交量')
  expect(selected.map(tool => tool.name)).toEqual(['ework__t_search', 'ework__t_call'])
  const instruction = componentSourceInstruction(selected)
  expect(instruction).toContain('ework__t_search')
  expect(instruction).toContain('先实际调用与面板字段最匹配的金融工具')
  expect(instruction).toContain('若 API 搜索超时或失败')
  expect(instruction).toContain('目录工具，从实际展示的条目选接口')
  expect(instruction).toContain('目录若只展示首行')
  expect(instruction).toContain('不要猜目录名称、ID 或循环枚举')
  expect(instruction).toContain('此时使用当前会话可见的 financial_query')
  expect(instruction).not.toContain('ework__t_other')
  expect(preferredComponentSourceTools(schemas, '整理会议待办')).toEqual([])
})

it('routes uncovered fundamentals to visible professional sources without probing basic quote tools first',()=>{
  const schemas=[{name:'public_data_query'},{name:'financial_query'},{name:'ework__datayes',description:'通联 DataYes 金融数据 API'}]
  expect(preferredComponentSourceTools(schemas,'三家公司最新财报的营业收入、净利润和同比增速').map(t=>t.name)).toEqual(['ework__datayes'])
  expect(preferredComponentSourceTools(schemas,'三只股票估值对比：市盈率TTM与市净率').map(t=>t.name)).toEqual(['ework__datayes'])
  expect(preferredComponentSourceTools(schemas,'三只股票最新行情和近一月日线')).toEqual([])
  expect(preferredComponentSourceTools(schemas,'只使用腾讯行情做股票估值，未提供的市盈率明确缺失')).toEqual([])
  expect(preferredComponentSourceTools(schemas,'股票估值；数据源：腾讯财经，市净率缺失不补造')).toEqual([])
  expect(preferredComponentSourceTools(schemas,'三只股票估值，数据来源腾讯财经，缺失不补造')).toEqual([])
  expect(preferredComponentSourceTools(schemas,'三只股票估值，来源为腾讯财经，缺失不补造')).toEqual([])
  expect(preferredComponentSourceTools(schemas,'三只股票估值，数据源是万得，缺失不补造')).toEqual([])
})

it('starts a latest-index query in the current China-market window instead of an unbounded first page', () => {
  const instruction = componentSourceInstruction(
    [{ name: 'ework__t_get_api_info', description: '读取通联 DataYes 接口定义' }],
    '沪深300指数最新日行情',
    new Date('2026-09-25T19:30:00Z')
  )
  expect(instruction).toContain('当前中国市场日期为 2026-09-26')
  expect(instruction).toContain('20260916 至 20260926')
  expect(instruction).toContain('先用接口定义工具读取 getMktIdxd')
  expect(instruction).toContain('不要先发无日期请求')
  expect(instruction).toContain('不可推断原因是尚未收盘')
})

it('uses the verified Shenwan endpoint and does not copy example dates or force page parameter types', () => {
  const instruction = componentSourceInstruction(
    [{ name: 'ework__t_get_api_info', description: '读取通联 DataYes 接口定义' }],
    '申万农林牧渔行业指数最近日行情',
    new Date('2026-09-25T19:30:00Z')
  )
  expect(instruction).toContain('getMktIdxdSw')
  expect(instruction).toContain('20260916 至 20260926')
  expect(instruction).toContain('接口定义里的示例日期只是示例')
  expect(instruction).toContain('严格遵守工具及业务接口的参数类型')
  expect(instruction).not.toContain('pagesize、pagenum 等参数也必须是字符串')
})

it('keeps initial planning source guidance short and delegates collection to each panel', () => {
  let guidance
  let visible = [{name:'ework__macro',description:'通联 DataYes 宏观指标查询'}]
  const dispose=()=>{}
  const ctx={systemPrompt:{context:entry=>{guidance=entry;return dispose}},tools:{schemas:()=>visible}}
  expect(registerComponentSourceGuidance(ctx)).toBe(dispose)
  const agent={session:{header:{},events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'用通联生成白酒行业工作台，含行情和宏观指标'}]}}]}}
  const text=guidance.text({agent})
  expect(text).toContain('ework__macro')
  expect(text).toContain('立即提交组件计划')
  expect(text).toContain('各组件任务独立取数')
  expect(text).not.toContain('先实际调用')
  expect(text).not.toContain('宏观指标先用关键词发现指标 ID')
  expect(text.length).toBeLessThan(700)
  agent.session.events[0].data.content[0].text='通过通联查询白酒行业行情和宏观指标'
  expect(guidance.text({agent})).toContain('宏观指标先用关键词发现指标 ID')
  agent.session.events[0].data.content[0].text='用通联生成白酒行业工作台，含行情和宏观指标'
  visible=[]
  expect(guidance.text({agent})).toBe('')
  visible=[{name:'ework__macro',description:'通联 DataYes 宏观指标查询'}]
  agent.session.header.parentSession='parent'
  expect(guidance.text({agent})).toBe('')
})

it('does not inject the full basic-source acquisition protocol during planning',()=>{
  let guidance,enabled=true
  const ctx={get:()=>({get snapshot(){return {skills:[{id:'builtin:ework-free-data-sources',enabled}]}}}),systemPrompt:{context:entry=>{guidance=entry}},tools:{schemas:()=>[{name:'public_data_query'}]}}
  registerComponentSourceGuidance(ctx)
  const agent={session:{header:{},events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'创建ETF金融研究工作台，展示真实行情和新闻'}]}}]}}
  const text=guidance.text({agent})
  expect(text).toContain('public_data_query')
  expect(text).toContain('立即提交组件计划')
  expect(text).toContain('来源、日期与单位')
  expect(text.length).toBeLessThan(700)
  enabled=false
  expect(guidance.text({agent})).toBe('')
  enabled=true
  agent.session.events[0].data.content[0].text='创建ETF金融研究工作台，只用已有记录，不要联网'
  expect(guidance.text({agent})).toBe('')
})

it('does not route simulated requests or tool-result instructions to external sources', () => {
  let guidance
  const ctx={systemPrompt:{context:entry=>{guidance=entry}},tools:{schemas:()=>[{name:'ework__data',description:'通联 DataYes API'}]}}
  registerComponentSourceGuidance(ctx)
  const session={events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'生成白酒工作台，全部使用模拟数据，不取真实数据'}]}}]}
  expect(guidance.text({agent:{session}})).toBe('')
  session.events=[{type:'user/message',data:{source:{kind:'tool'},content:[{type:'text',text:'通过通联取股票行情'}]}}]
  expect(guidance.text({agent:{session}})).toBe('')
})

it('stops injecting the basic data skill when the user has disabled it',()=>{
  let guidance,enabled=false
  const ctx={get:()=>({get snapshot(){return {skills:[{id:'builtin:ework-free-data-sources',enabled}]}}}),systemPrompt:{context:entry=>{guidance=entry}},tools:{schemas:()=>[{name:'public_data_query'}]}}
  registerComponentSourceGuidance(ctx)
  const agent={session:{header:{},events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'展示美元汇率工作台'}]}}]}}
  expect(guidance.text({agent})).toBe('')
  enabled=true
  expect(guidance.text({agent})).toContain('EWork 内置基础数据源')
})
it('keeps professional-field preference when an untrusted model source label remains in the business request',()=>{
 const schemas=[{name:'public_data_query'},...officialSchemas]
 const policy={pluginRequired:false,pluginProhibited:false,preferenceRequest:'估值。来源： 取得市盈率与市净率。'}
 expect(preferredComponentSourceTools(schemas,policy.preferenceRequest,policy).map(t=>t.name)).toEqual(officialSchemas.map(t=>t.name))
})

it.each(['不用DataYes','不要用插件','禁止用MCP','不再用通联'])('fix round1 shared source semantics recognize short prohibition: %s',request=>{
 expect(componentPluginSourceProhibited(request)).toBe(true)
 expect(componentPluginSourceRequired(request)).toBe(false)
 expect(preferredComponentSourceTools([{name:'public_data_query'},...officialSchemas],'估值市盈率，'+request)).toEqual([])
})
