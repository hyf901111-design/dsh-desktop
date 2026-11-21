import {readFileSync} from 'node:fs'
import {describe, it, expect} from 'vitest'
import {registerFirstResponseEffort} from '../packages/dsh-research-task-runtime/first-response-effort.js'
import {patchFirstResponseEffort} from '../scripts/lib/first-response-effort.mjs'

import {registerModelTaskReplies, wantsTaskOpening} from '../packages/dsh-research-task-runtime/model-task-replies.js'
import {clientModeTurn,routeModeTools} from '../packages/dsh-research-task-runtime/client-mode-profile.js'

const treasury = '把美国财政部三日10年期国债收益率写入工作表 A1:B4，2024-12-27 4.62%、2024-12-30 4.55%、2024-12-31 4.58%。'
function turn(text, mode = 'spreadsheet') {
  return {events:[{type:'user/message',data:{source:{kind:'user',clientMode:mode},content:[{type:'text',text}]}}]}
}

describe('first model response', () => {
  it('uses only an advertised default for the first step of a direct spreadsheet edit', async () => {
    let handler, lookup = 0
    registerFirstResponseEffort({
      on: (_event,callback) => { handler = callback },
      llm: {resolveModelInfo: async () => {lookup++;return {reasoning:{defaultEffort:'max',efforts:[{id:'low'},{id:'max'}]}}}}
    })
    const suggestions=[]
    const apply = (session,step,config) => handler({agent:{session},step,suggestFirstResponseEffort:value=>suggestions.push(value)},async()=>config)
    const base={provider:'ework-ark',model:'deepseek-v4.1-flash'}
    const session=turn(treasury)
    expect(await apply(session,1,base)).toBe(base)
    expect(suggestions).toEqual(['low'])
    await apply(session,2,base)
    await apply(session,1,{...base,reasoningEffort:'max'})
    await apply(turn(treasury+'需要严谨推导。'),1,base)
    expect(lookup).toBe(1)
  })
  it('expires a suggested budget in the installed agent loop before the next request', () => {
    const sdk=readFileSync('node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js','utf8')
    const installed=patchFirstResponseEffort(sdk)
    expect(patchFirstResponseEffort(installed)).toEqual(installed)
    const proposal=Function('return ('+installed.match(/function requestProposal\(header\) \{[\s\S]*?\n\}/)[0]+')')()
    const config={provider:'ework-ark',model:'deepseek-v4.1-flash',reasoningEffort:'low',maxTokens:8192}
    expect(proposal({config,adapterDefaults:{reasoningEffort:true}})).toEqual({provider:config.provider,model:config.model,maxTokens:8192})
    expect(proposal({config,adapterDefaults:{}})).toEqual(config)
  })
})

const curveReview = '固收组要复盘这张表里的 2024 年 12 月美国国债曲线。请把 10 年减 2 年、30 年减 5 年的利差逐日写入空白列，使用可复算的公式，再找出同期变化最大的一天。'

it('streams the selected model’s brief first step, then restores tools and passes execution to the same turn', async () => {
  const handlers = {}
  const ctx = {on:(name,fn)=>{handlers[name]=fn},llm:{resolveModelInfo:async()=>({reasoning:{defaultEffort:'high',efforts:[{id:'low'}]}})}}
  registerModelTaskReplies(ctx)
  registerFirstResponseEffort(ctx)
  const session = turn(curveReview)
  session.events[0].data.id = 'treasury-dec'
  const agent = {session}
  const request = {provider:'selected',model:'selected',system:'existing instructions',tools:[{name:'client_action'}],messages:[{role:'user',id:'treasury-dec'}]}
  const run = (step) => handlers['agent/request-context']({agent,turn:1,step},async()=>request)
  expect((await run(1)).tools).toEqual(request.tools) // Older loops execute the ordinary request.
  const suggestions = []
  await handlers['agent/request']({agent,step:1,supportsTaskOpening:true,suggestFirstResponseEffort:e=>suggestions.push(e)},async()=>request)
  const intro = await run(1)
  expect(suggestions).toEqual(['low'])
  expect(intro[Symbol.for('ework.model-task-opening')]).toBe(true)
  expect(intro.tools).toEqual([])
  expect(intro.messages).toMatchObject([{id:'treasury-dec',role:'user',source:{kind:'user'},content:[{type:'text',text:curveReview}]}])
  expect(intro.model).toBe(request.model)
  request.messages.push({role:'assistant',content:[{type:'text',text:'这次复盘要定位两组期限利差在十二月变化最大的一天。'}]})
  const execute = await run(2)
  expect(execute.tools).toBe(request.tools)
  expect(execute.messages.at(-1).source.form).toBe('instructions')
  expect(request.messages).toHaveLength(2)
  expect(execute[Symbol.for('ework.model-task-opening')]).toBeUndefined()
})

it('uses one model answer for discussion and honors strict output even on complex work', () => {
  for (const text of ['什么是基点？','只讨论怎么比较国债利差，不要修改表格。',curveReview+'只返回最终结果。']) {
    expect(wantsTaskOpening(clientModeTurn(turn(text)))).toBe(false)
  }
  const payroll = clientModeTurn(turn('帮我做一个模拟的工资表'))
  expect(payroll.appEdit).toBe(true)
  expect(wantsTaskOpening(payroll)).toBe(true)
  const tools = routeModeTools({tools:[{name:'client_action'}]},payroll).tools
  expect(tools[0].parameters.properties.capability.enum).toContain('spreadsheet.apply')
})

it('opens an explicit research board from the supplied quarterly holdings despite the analysis scope', async () => {
  const text = `我是指数投资部的组合经理，晨会上要判断易方达沪深300 ETF（510310）这五项季末重仓有多集中。请把下面的持仓做成研究看板，让我一眼比较五家公司的净值占比和排名，知道前五合计多少。会上会追问第一名比第二名高多少个百分点，结果要能回到五个披露数复核。只分析这五项，百分比按季报披露的精度。

来源为上交所披露的《易方达沪深300交易型开放式指数发起式证券投资基金2025年第4季度报告》，持仓日2025-12-31，第10页第5.3.1节前五行。
https://www.sse.com.cn/disclosure/fund/announcement/c/new/2026-01-22/510310_20260122_JCA4.pdf

序号	股票代码	股票名称	数量（股）	公允价值（元）	占基金资产净值比例（%）
1	300750	宁德时代	31173566	11448803849.16	3.81
2	600519	贵州茅台	7377868	10160652252.24	3.38
3	601318	中国平安	125580047	8589675214.80	2.86
4	300308	中际旭创	13089026	7984305860.00	2.66
5	601899	紫金矿业	194034163	6688357598.61	2.23`
  const session = turn(text,'research')
  const profile = clientModeTurn(session)
  expect(profile.readOnly).toBe(true)
  expect(wantsTaskOpening(profile)).toBe(true)
  const hooks = {}
  const ctx = {on:(name,fn)=>{hooks[name]=fn},llm:{resolveModelInfo:async()=>({reasoning:{}})}}
  registerFirstResponseEffort(ctx)
  registerModelTaskReplies(ctx)
  const args = {agent:{session},step:1,turn:1,supportsTaskOpening:true}
  await hooks['agent/request'](args,async()=>({provider:'ework-ark',model:'deepseek-v4.1-flash'}))
  const request = {provider:'ework-ark',model:'deepseek-v4.1-flash',messages:[session.events[0].data],tools:[{name:'research_workbench_create'}]}
  const intro = await hooks['agent/request-context'](args,async()=>request)
  expect(intro[Symbol.for('ework.model-task-opening')]).toBe(true)
  expect(intro.tools).toEqual([])
  expect(wantsTaskOpening(clientModeTurn(turn(text+'\n只返回最终结果。','research')))).toBe(false)
  for (const discussion of ['请只讨论如何把这五项持仓做成研究看板，不用操作。', '客户说“把这些做成研究看板”，这是什么意思？只讨论。', '我只分析现有研究看板，结果要如何解释？不要新建。']) {
    expect(wantsTaskOpening(clientModeTurn(turn(discussion,'research')))).toBe(false)
  }
})

it('stages a substantive read-only document review without adding any write capabilities', () => {
  const deck = '请逐页核对这份美国财政部收益率演示的图表、正文与备注，比较不同期限在 12 月 27 日和 31 日的变化，指出不一致并注明页码。不要修改演示。'
  const workbook = '只分析当前工作簿。先核对各工作表的美国国债原始收益率，再比较两年期至三十年期的利差，列出异常日期和对应单元格。'
  for (const [mode,text] of [['presentation',deck], ['spreadsheet',workbook]]) {
    const profile = clientModeTurn(turn(text,mode))
    expect(profile).toMatchObject({readOnly:true, appRead:true, appEdit:false})
    expect(wantsTaskOpening(profile)).toBe(true)
    const tools = routeModeTools({tools:[{name:'client_action'},{name:'image_generate'},{name:'research_workbench_create'}]},profile).tools
    expect(tools).toHaveLength(1)
    expect(tools[0].parameters.properties.capability.enum).toEqual([mode+'.inspect'])
    expect(wantsTaskOpening(clientModeTurn(turn(text+'只返回最终结果。',mode)))).toBe(false)
  }
  for (const text of ['这份演示有几页？','只讨论怎么比较国债利差，不要修改演示。','教我如何逐页核对演示中的数据差异，不要修改演示。','3.81% 等于多少个基点？用一句话说明。']) {
    expect(wantsTaskOpening(clientModeTurn(turn(text,'presentation')))).toBe(false)
  }
})

it('requests a substantive progress paragraph after a real result and a period of silence', async () => {
  let wire
  registerModelTaskReplies({on:(_name,fn)=>{wire=fn}})
  const session = turn(curveReview)
  const now=Date.now()
  session.events.unshift({type:'turn/start',time:now-20000,data:{turn:1}})
  const request = {system:'fund review',tools:[{name:'client_action'}]}
  const run = () => wire({agent:{session},turn:1,step:3},async()=>request)
  expect(await run()).toBe(request)
  session.events.push({type:'tool/result',time:now,data:{}})
  expect((await run()).system).toContain('真实回执')
  session.events.push({type:'assistant/message',time:now,data:{message:{content:[{type:'text',text:'已核对月末两个期限的观测日。'}]}}})
  expect(await run()).toBe(request)
})
