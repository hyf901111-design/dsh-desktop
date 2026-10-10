import { expect, it } from 'vitest'
import { preferredComponentSourceTools, componentSourceInstruction, registerComponentSourceGuidance } from '../packages/dsh-research-task-runtime/component-source-tools.js'

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
  expect(instruction).toContain('先实际调用与面板字段最匹配的通联工具')
  expect(instruction).toContain('若 API 搜索超时或失败')
  expect(instruction).toContain('目录工具，从实际展示的条目选接口')
  expect(instruction).toContain('目录若只展示首行')
  expect(instruction).toContain('不要猜目录名称、ID 或循环枚举')
  expect(instruction).toContain('此时使用当前会话可见的 financial_query')
  expect(instruction).not.toContain('ework__t_other')
  expect(preferredComponentSourceTools(schemas, '整理会议待办')).toEqual([])
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

it('guides the main conversation using its current request and live scoped sources', () => {
  let guidance
  let visible = [{name:'ework__macro',description:'通联 DataYes 宏观指标查询'}]
  const dispose=()=>{}
  const ctx={systemPrompt:{context:entry=>{guidance=entry;return dispose}},tools:{schemas:()=>visible}}
  expect(registerComponentSourceGuidance(ctx)).toBe(dispose)
  const agent={session:{header:{},events:[{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'用通联生成白酒行业工作台，含行情和宏观指标'}]}}]}}
  const text=guidance.text({agent})
  expect(text).toContain('ework__macro')
  expect(text).toContain('宏观指标先用关键词发现指标 ID')
  expect(text).toContain('不代表其他数据类别不可用')
  expect(text).toContain('不重复相同参数')
  visible=[]
  expect(guidance.text({agent})).toBe('')
  visible=[{name:'ework__macro',description:'通联 DataYes 宏观指标查询'}]
  agent.session.header.parentSession='parent'
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
