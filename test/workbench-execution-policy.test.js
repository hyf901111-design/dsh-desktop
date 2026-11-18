import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { glmReasoningEntry, patchGlmReasoningCapabilities } from '../scripts/lib/glm-reasoning-capabilities.mjs'
import { registerWorkbenchExecutionPolicy, workbenchCreationRequest } from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const session = text => ({ header: {}, events: [{ type: 'user/message', data: { id: 'human', source: { kind: 'user' }, content: [{ type: 'text', text }] } }] })
afterEach(() => vi.unstubAllGlobals())
describe('workbench execution policy', () => {
  it('uses one concise data-first method across user domains without resident finance presets', () => {
    let prompt
    registerWorkbenchExecutionPolicy({ tools: { schemas: () => [{ name: 'public_data_query' }] }, systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    for (const request of ['使用免费源创建A股行情工作台，每分钟刷新', '使用通联MCP创建股票工作台', '创建ETF收益与回撤比较看板', '创建医疗活动排班工作台', '创建一个主流加密货币行情监控面板']) {
      const text = prompt.text({ agent: { session: session(request) } })
      expect(text).toContain('先理解需求')
      expect(text).toContain('已有真实记录')
      expect(text).toContain('sharedDatasets/view')
      expect(text.length).toBeLessThan(2300)
      expect(text).not.toContain('【已适配来源快捷路径】')
      expect(text).not.toContain('flowEstimateYi')
      expect(text).not.toContain('cn-hot-etf-live')
    }
  })

  it('keeps binding work open for accepted inline snapshots when the human requested minute updates', () => {
    let prompt
    registerWorkbenchExecutionPolicy({ systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    const current = session('创建金融工作台，每1分钟自动刷新')
    current.events.push({type:'tool/call',data:{name:'research_workbench_create',callId:'inline',arguments:JSON.stringify({panels:[{artifact:{type:'market'}}]})}},
      {type:'tool/result',data:{message:{source:{callId:'inline'},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify({planId:'p',status:'prepared'})}]}]}}})
    expect(prompt.text({agent:{session:current}})).toContain('research_component_data action=bind')
    expect(prompt.text({agent:{session:current}})).not.toContain('然后结束本轮')
    current.events[0].data.content[0].text='创建金融工作台'
    expect(prompt.text({agent:{session:current}})).toContain('然后结束本轮')
    current.events[0].data.content[0].text='创建金融工作台，每1分钟自动刷新'
    current.events[1].data.arguments=JSON.stringify({panels:[{prompt:'等待子任务取数'}]})
    expect(prompt.text({agent:{session:current}})).toContain('然后结束本轮')
  })
  it('ends parent research after the matching accepted plan while allowing a new human request', () => {
    const current = session('使用通联创建工作台')
    let prompt
    registerWorkbenchExecutionPolicy({ systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    const text = () => prompt.text({ agent: { session: current } })
    current.events.push({ type: 'tool/call', data: { name: 'research_workbench_create', callId: 'plan-call' } })
    const result = { type: 'tool/result', data: { message: { source: { kind: 'tool', callId: 'plan-call' }, content: [{ type: 'tool-result', isError: true, content: [{ type: 'text', text: JSON.stringify({ planId: 'plan', status: 'accepted' }) }] }] } } }
    current.events.push(result)
    expect(text()).toContain('调用 research_workbench_create')
    result.data.message.content[0].isError = false
    expect(text()).toContain('主会话不要再重复接口发现')
    expect(text()).toContain('刷新配置待确认')
    expect(text()).toContain('不能由计划承诺自动刷新已生效')
    const next = session('再创建另一只股票的工作台').events[0]; next.data.id = 'human-next'
    current.events.push(next)
    expect(text()).toContain('调用 research_workbench_create')
  })
  it('applies the early plan before the first human message is committed to session history', () => {
    const pending = { header: {}, events: [
      ...session('解释上一张图').events,
      { type: 'agent/inbox/spliced', data: { inserted: [session('使用通联创建宁德时代工作台').events[0].data] } },
      { type: 'agent/inbox/spliced', data: { removedCount: 1, inserted: [] } }
    ] }
    let prompt
    registerWorkbenchExecutionPolicy({ systemPrompt: { context: value => { prompt = value; return () => {} } }, on: () => () => {} })
    expect(prompt.text({ agent: { session: pending } })).toContain('调用 research_workbench_create')
    pending.events.push({ type: 'agent/inbox/spliced', data: { inserted: [{ ...session('创建工作台').events[0].data, source: { kind: 'tool' } }] } })
    expect(workbenchCreationRequest(pending).text).toBe('使用通联创建宁德时代工作台')
    pending.events.push(...session('解释一下当前数据').events)
    expect(workbenchCreationRequest(pending)).toBeNull()
  })
  it('recognizes human creation intent without changing coding questions or tool output', () => {
    expect(workbenchCreationRequest(session('使用通联mcp获取数据，创建一个股票研究工作台'))).not.toBeNull()
    for(const text of ['帮我做一个A股宽基指数观察台，比较三条走势','做一个债券监控台','创建一个主流加密货币行情监控面板','搭建ETF运营面板','帮我做个股票分析面板','帮我搭一个ETF指数运营工作台，看看最近一周规模变化和资金进出前五','搭个固收看板'])expect(workbenchCreationRequest(session(text))?.target).toBe('workbench');
    for(const text of ['把附件做成一个监管体系研究台，按机构和核查事项分三个页签','给新同事建一个入职速查台','建立客户运营分析台','搭一个供应链监测台'])expect(workbenchCreationRequest(session(text))?.target,text).toBe('workbench');
    for(const text of ['解释研究台的用法','不要创建分析台','修改当前速查台的标题'])expect(workbenchCreationRequest(session(text)),text).toBeNull();
    for(const text of ['为什么观察台会卡顿','不要创建监控台','修改当前观察台的标题','为什么监控面板生成很慢','不要创建行情监控面板','修改当前分析面板的标题','不要搭一个ETF工作台','怎么搭个固收看板','解释“搭一个工作台”的意思'])expect(workbenchCreationRequest(session(text))).toBeNull();
    for (const text of ['为什么生成工作台这么慢', '不要生成工作台', '修复组件生成逻辑', '请创建登录界面']) expect(workbenchCreationRequest(session(text))).toBeNull()
    const injected = session('创建工作台'); injected.events[0].data.source.kind = 'tool'
    expect(workbenchCreationRequest(injected)).toBeNull()
  })
  it('preserves the selected model controls during creation and ordinary requests', async () => {
    let handler, prompt
    const resolveModelInfo = vi.fn().mockResolvedValue({ reasoning: { efforts: ['low', 'high', 'max'].map(id => ({ id })) } })
    registerWorkbenchExecutionPolicy({ llm: { resolveModelInfo }, systemPrompt: { context: v => { prompt = v; return () => {} } }, on: (name, fn) => { if (name === 'agent/request') handler = fn; return () => {} } })
    const agent = { session: session('创建股票工作台') }, config = { provider: 'zai', model: 'GLM-5.3-Flash' }
    expect(prompt.text({ agent })).toContain('调用 research_workbench_create')
    const automatic = await handler({ agent }, async () => config)
    expect(automatic).toBe(config)
    expect(resolveModelInfo).not.toHaveBeenCalled()
    expect(await handler({ agent }, async () => ({ ...config, reasoningEffort: 'max' }))).toEqual({ ...config, reasoningEffort: 'max' })
    // A new default request has its own original controls, independent of the
    // preceding explicit selection.
    await handler({ agent }, async () => config)
    agent.session = session('解释一下这段代码')
    expect(await handler({ agent }, async () => automatic)).toEqual(config)
    expect(prompt.text({ agent })).toBe('')
  })
  it('declares only supported GLM 5.3 levels and leaves custom declarations / gateways intact', () => {
    const original = { id: 'GLM-5.3-Flash' }
    expect(glmReasoningEntry(original, 'zai', 'https://api.z.ai/api/coding/paas/v4').reasoningEfforts).toEqual({ low: 'low', high: 'high', max: 'max' })
    expect(glmReasoningEntry(original, 'zai', 'https://custom.example/v1')).toBe(original)
    const explicit = { ...original, reasoningEfforts: false }
    expect(glmReasoningEntry(explicit, 'zai', 'https://api.z.ai/')).toBe(explicit)
  })
  it('sends the selected Max controls to the adapter before and after acceptance', async () => {
    const filename = resolve('node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/countdown-policy-test.mjs')
    const source = patchGlmReasoningCapabilities(readFileSync(resolve('node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'), 'utf8'))
    expect(patchGlmReasoningCapabilities(source)).toBe(source)
    writeFileSync(filename, source + '\nexport { resolveProfiles };')
    try {
      const { PiAiAdapter, resolveProfiles } = await import(pathToFileURL(filename).href)
      const profiles = resolveProfiles({ zai: { models: [{ id: 'GLM-5.3-Flash' }], baseURL: 'https://api.z.ai/api/coding/paas/v4' } })
      const adapter = new PiAiAdapter({ profiles: () => profiles, resolveApiKey: async () => 'local-test-key' })
      const info = await adapter.resolveModel('zai', 'GLM-5.3-Flash')
      expect(info.reasoning.efforts.map(e => e.id)).toEqual(['low', 'high', 'max'])
      expect(info.reasoning.defaultEffort).toBe('max')
      let handler
      registerWorkbenchExecutionPolicy({ llm: { resolveModelInfo: (...args) => adapter.resolveModel(...args) }, systemPrompt: { context: () => () => {} }, on: (name, fn) => { if (name === 'agent/request') handler = fn; return () => {} } })
      const agent = { session: session('创建工作台') }, original = { provider: 'zai', model: 'GLM-5.3-Flash', reasoningEffort: 'max', maxTokens: 16384 }
      const planned = await handler({ agent }, async () => original)
      let body
      vi.stubGlobal('fetch', vi.fn(async (_, init) => {
        body = JSON.parse(init.body)
        return new Response('data: {"id":"test","choices":[{"index":0,"delta":{"content":"完成"},"finish_reason":null}]}\n\ndata: {"id":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
      }))
      const chunks = []
      for await (const chunk of adapter.stream({ ...planned, messages: [{ role: 'user', content: [{ type: 'text', text: '创建工作台' }] }] })) chunks.push(chunk)
      expect(body.model).toBe('GLM-5.3-Flash')
      expect(body.thinking.type).toBe('enabled')
      expect(body.reasoning_effort).toBe('max')
      expect(body.max_completion_tokens ?? body.max_tokens).toBe(16384)
      expect(chunks.at(-1).type).toBe('finish')
      agent.session.events.push({ type: 'tool/call', data: { name: 'research_workbench_create', callId: 'accepted' } },
        { type: 'tool/result', data: { message: { source: { callId: 'accepted' }, content: [{ type: 'tool-result', content: [{ type: 'text', text: JSON.stringify({ planId: 'p', status: 'accepted' }) }] }] } } })
      const restored = await handler({ agent }, async () => ({ ...planned }))
      expect(restored).toEqual(original)
      for await (const chunk of adapter.stream({ ...restored, messages: [{ role: 'user', content: [{ type: 'text', text: '普通聊天' }] }] })) { /* drain the restored request */ }
      expect(body.thinking.type).toBe('enabled')
      expect(body.reasoning_effort).toBe('max')
      expect(body.max_completion_tokens ?? body.max_tokens).toBe(16384)
    } finally { unlinkSync(filename) }
  })
})

describe('workbench planning continuation', () => {
  async function planningRun(text, {turn = 1, abort = new AbortController()} = {}) {
    const s = session(text)
    s.events.unshift({type:'turn/start',data:{turn}})
    const hooks = new Map()
    const agent = {session:s,steer:vi.fn()}
    const dispose = registerWorkbenchExecutionPolicy({
      tools:{guard:() => () => {}}, systemPrompt:{context:() => () => {}},
      on:(name,fn) => {hooks.set(name,fn);return () => {}}
    })
    const payload = {agent,turn,signal:abort.signal}
    const wire = await hooks.get('agent/request-context')(payload,async () => ({
      system:'base',messages:[s.events[1].data],
      tools:[{name:'research_workbench_create',parameters:{}},{name:'research_canvas_use',parameters:{}}]
    }))
    s.events.push({type:'assistant/chunk',data:{turn,chunk:{type:'finish',reason:{kind:'stop'}}}})
    return {s,agent,wire,abort,dispose,stop:() => hooks.get('agent/turn-stopping')(payload)}
  }

  it.each([
    '我想给同事做一份组织架构速查看板，按附件保留出处和待核标记。',
    '给投研组做一组美股财报观察看板。',
    '给运营组做两套不同用途的发布动态看板。',
    '我要做一版模拟义诊排班工作台。',
  ])('preserves authorized tools and bounded continuation for a production request: %s', async text => {
    const run = await planningRun(text)
    try {
      expect(run.wire.tools.map(tool => tool.name)).toEqual(['research_workbench_create', 'research_canvas_use'])
      expect(run.wire.system).toContain('准备卡只显示宿主进度')
      run.stop()
      run.stop()
      expect(run.agent.steer).toHaveBeenCalledTimes(1)
      expect(run.agent.steer.mock.calls[0][0].source).toMatchObject({kind:'plugin',plugin:'sherlock-workbench-planning'})
    } finally { run.dispose() }
  })

  it.each(['accepted','user-cancelled','superseded','permission-denied','read-only'])('leaves %s at its own boundary',async scenario => {
    const run = await planningRun(scenario === 'read-only' ? '我想看当前工作台的来源。' : '帮我做一份活动复盘看板。')
    try {
      if (scenario === 'user-cancelled') run.abort.abort()
      if (scenario === 'superseded') run.s.events.push({type:'agent/inbox/spliced',data:{inserted:[{id:'next',source:{kind:'user'},content:[{type:'text',text:'请只检查附件。'}]}]}})
      if (scenario === 'permission-denied') run.s.events.push({type:'tool/result',data:{error:{code:'PERMISSION_DENIED'}}})
      if (scenario === 'accepted') run.s.events.push(
        {type:'tool/call',data:{name:'research_workbench_create',callId:'create',arguments:'{}'}},
        {type:'tool/result',data:{message:{source:{kind:'tool',callId:'create'},content:[{type:'tool-result',content:[{type:'text',text:'{"planId":"p","status":"accepted"}'}]}]}}}
      )
      run.stop()
      expect(run.agent.steer).not.toHaveBeenCalled()
    } finally { run.dispose() }
  })
})

it('在已保存的完整、部分和已启动工作台回执处结束父轮次，保留明确的数据绑定步骤',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js')
 const {mkdtemp,rm}=await import('node:fs/promises')
 const {tmpdir}=await import('node:os')
 const {join}=await import('node:path')
 const dir=await mkdtemp(join(tmpdir(),'ework-terminal-plan-'))
 let tool
 const ctx={agents:{get:()=>({})},tools:{register:def=>{tool=def;return()=>{}}},webServer:{register:()=>()=>{}}}
 const runtime={startPreparedBatch:async({panels})=>panels.map(p=>({taskId:p.canvasNodeId})),
  startBatch:async({panels})=>panels.map(p=>({taskId:p.canvasNodeId}))}
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json')})
 const artifact={version:1,type:'table',title:'基金明细',columns:['代码','收益率'],rows:[['001',1]]}
 const cases=[
  ['创建基金工作台','prepared',true,artifact,'基金明细'],
  ['创建基金工作台，至少比较3只基金的收益率','incomplete',true,artifact,'基金明细'],
  ['创建基金工作台，每1分钟自动刷新','prepared',false,artifact,'基金明细'],
  ['创建基金工作台','accepted',true,undefined,'基金明细']
 ]
 try{
  for(const [i,[text,status,terminal,data,title]] of cases.entries()){
   const parent=session(text);parent.id='root-'+i
   const concludeTurn=vi.fn()
   const receipt=await tool.execute({requestId:'case-'+i,title:'基金工作台',panels:[{title,prompt:'比较基金明细与收益率',type:'table',...(data?{artifact:data}:{})}]},
    {agent:{session:parent},concludeTurn})
   expect(receipt.status).toBe(status)
   expect(concludeTurn).toHaveBeenCalledTimes(terminal?1:0)
  }
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
},12000)

it('拒绝把用户给定的模拟账簿替换成固定图表示例',async()=>{
 const {registerWorkbench}=await import('../packages/dsh-research-task-runtime/workbench.js')
 const {mkdtemp,rm}=await import('node:fs/promises')
 const {tmpdir}=await import('node:os')
 const {join}=await import('node:path')
 const dir=await mkdtemp(join(tmpdir(),'ework-authored-ledger-'))
 let tool
 const ctx={agents:{get:()=>({})},tools:{register:def=>{tool=def;return()=>{}}},webServer:{register:()=>()=>{}}}
 const runtime={startPreparedBatch:vi.fn()}
 const dispose=await registerWorkbench(ctx,runtime,{filePath:join(dir,'plans.json')})
 const human=session('做一个模拟归因工作台。采用以下原始数值：期初1000万元、利息+42万元、费用-5万元。禁止联网。');human.id='ledger'
 try{
  await expect(tool.execute({requestId:'ledger',dataMode:'simulated',title:'归因工作台',panels:[{title:'净值桥',type:'market',prompt:'variant: waterfall；使用账簿期初1000万元、利息+42万元、费用-5万元'}]},{agent:{session:human}})).rejects.toThrow('不要用固定模板样例替代用户记录')
  expect(runtime.startPreparedBatch).not.toHaveBeenCalled()
 }finally{await dispose();await rm(dir,{recursive:true,force:true})}
})

async function sourcePlanningHarness(text, schemas) {
  const events = new Map()
  const parent = session(text)
  parent.events[0].data.role = 'user'
  const agent = {session: parent}
  const turn = 1, signal = new AbortController().signal
  let guard
  const dispose = registerWorkbenchExecutionPolicy({
    tools: {
      guard(fn) { guard = fn; return () => {} },
      get(name) {
        if(name==='ework__tushare_read')return {[Symbol.for('ework.builtin-tushare.read')]:true}
        if(name==='ework__tushare_catalog')return {[Symbol.for('ework.builtin-tushare.catalog')]:true}
      }
    },
    systemPrompt: {context: () => () => {}},
    on(name, fn) { events.set(name, fn); return () => {} }
  })
  const request = () => events.get('agent/request-context')({agent, turn, signal}, async () => ({
    system:'base', messages:[parent.events[0].data], tools:[{name:'research_workbench_create'}, ...schemas]
  }))
  await request()
  let nextId = 0
  const start = (name, args) => {
    const callId = String(++nextId)
    const exec = {agent, signal, name, callId, arguments:args}
    parent.events.push({type:'tool/call', data:{turn, name, callId, arguments:JSON.stringify(args)}})
    return {exec, issue:guard(exec)}
  }
  const result = ({exec}, content, isError=false) => {
    const event = {type:'tool/result', data:{message:{source:{kind:'tool', callId:exec.callId}, content:[
      {type:'tool-result', toolCallId:exec.callId, isError, content:[{type:'text', text:content}]}
    ]}}}
    parent.events.push(event)
    events.get('session/event')(parent, event)
  }
  return {parent, request, start, result, dispose,
    beforeSpill: (exec, content, decision={kind:'accept'}) => events.get('tools/post-execute')(exec, {content}, async () => decision)}
}

it('reuses matching directories, rejects a proven unsupported built-in API and preserves other ranges and sources', async () => {
  const h = await sourcePlanningHarness('创建商品期货行情工作台，用真实数据。', [
    {name:'public_data_query'}, {name:'ework__tushare_catalog',description:'Tushare 目录不是业务数据'},
    {name:'ework__tushare_read'}, {name:'ework__other_catalog',description:'接口目录不是业务数据'},
    {name:'ework__datapro',description:'火山方舟专业数据集只读检索'}, {name:'web_search'}, {name:'web_fetch'}
  ])
  try {
    const first = h.start('public_data_query', {operation:'catalog', category:'market'})
    expect(first.issue).toBeUndefined()
    h.result(first, JSON.stringify({version:1,sources:[]}))
    expect(h.start('public_data_query', {category:'market', operation:'catalog'}).issue).toContain('已读取')
    expect(h.start('public_data_query', {operation:'catalog', category:'macro'}).issue).toBeUndefined()
    const otherCatalog = h.start('ework__other_catalog', {api_name:'index_daily'})
    h.result(otherCatalog, JSON.stringify({source:'Tushare',kind:'catalog',interfaces:[]}))
    const catalog = h.start('ework__tushare_catalog', {api_name:'fut_daily'})
    h.result(catalog, JSON.stringify({source:'Tushare',kind:'catalog',interfaces:[]}))
    expect(h.start('ework__tushare_read', {api_name:'fut_daily',params:{trade_date:'20261118'},fields:'close',limit:100}).issue).toContain('未提供')
    expect(h.start('ework__tushare_read', {api_name:'index_daily',params:{trade_date:'20261118'},fields:'close',limit:100}).issue).toBeUndefined()
    expect(h.start('ework__datapro', {query:'取螺纹钢期货近十个交易日的收盘价和成交量'}).issue).toBeUndefined()
    const wire = await h.request()
    expect(wire.system).toContain('火山方舟')
    expect(wire.system).toMatch(/先复用本轮已核验[\s\S]*Tushare[\s\S]*火山方舟[\s\S]*新闻[\s\S]*豆包搜索/u)
    expect(wire.system).toContain('只补缺失数据')
    expect(wire.system).toContain('适用的结构化')
    expect(wire.tools.map(tool => tool.name)).toContain('web_fetch')
  } finally { h.dispose() }
})

it('moves away from unreadable raw quote endpoints without restricting supplied URLs or ordinary public pages', async () => {
  const supplied = 'https://hq.sinajs.cn/list=nf_AG0'
  const h = await sourcePlanningHarness('建一份期货行情工作台，也核对 '+supplied, [{name:'web_fetch'}])
  try {
    const fq = h.start('web_fetch', {url:'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=a'})
    expect(fq.issue).toBeUndefined()
    h.result(fq, 'Error: The browser could not load readable webpage content. Open the URL in a research link component to inspect it.', true)
    expect(h.start('web_fetch', {url:'https://web.ifzq.gtimg.cn/appstock/app/kline/kline?param=b'}).issue).toContain('无法读取')
    const quote = h.start('web_fetch', {url:'https://qt.gtimg.cn/q=nf_RB0'})
    expect(quote.issue).toBeUndefined()
    expect(h.start('web_fetch', {url:'https://qt.gtimg.cn/q=nf_RB0#same'}).issue).toContain('相同')
    h.result(quote, 'Fetched https://qt.gtimg.cn/q=nf_RB0 (HTTP 200)\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\nv_nf_RB0="";')
    expect(h.start('web_fetch', {url:'https://hq.sinajs.cn/list=nf_RB0'}).issue).toContain('结构化来源')
    expect(h.start('web_fetch', {url:supplied}).issue).toBeUndefined()
    expect(h.start('web_fetch', {url:'https://www.shfe.com.cn/public/market-data'}).issue).toBeUndefined()
  } finally { h.dispose() }
})

it('recovers only paired successful pre-spill business evidence for the active authorized request', async () => {
  const {captureWorkbenchObservedSources} = await import('../packages/dsh-research-task-runtime/workbench-observed-sources.js')
  const schemas=[{name:'ework__datapro',description:'火山方舟专业数据集只读检索'},{name:'ework__other'}]
  const h=await sourcePlanningHarness('创建使用真实来源的商品期货工作台。',schemas)
  const raw={code:0,dataset_type:'stock_finance',items:[{证券代码:'RB00.SHF',行情:{records:Array.from({length:100},(_,i)=>({收盘价:3500+i,正文:'期货行情'.repeat(250)}))}}]}
  const content=[{type:'text',text:JSON.stringify(raw)}]
  const spill='{ "code": 0,\n(Omitted 50000 bytes. Full formatted result stored at: unavailable. Use read with offset/limit.)'
  const capture=options=>captureWorkbenchObservedSources({session:h.parent,messageId:'human',schemas,...options})
  try {
    const approved=h.start('ework__datapro',{query:'已授权行情'})
    await h.beforeSpill(approved.exec,content)
    expect(capture()).toBeUndefined()
    h.result(approved,spill)
    expect(capture()[0].response).toEqual(raw)
    expect((await h.request()).system).toContain('可交接的嵌套来源')
    const rejected=h.start('ework__datapro',{query:'已拒绝调用'})
    await h.beforeSpill(rejected.exec,content,{kind:'block'})
    h.result(rejected,spill,true)
    const notDurable=h.start('ework__other',{query:'无成功回执'})
    await h.beforeSpill(notDurable.exec,content)
    h.result(notDurable,spill,true)
    expect(capture()).toHaveLength(1)
    expect(capture({schemas:[]})).toBeUndefined()
  } finally {h.dispose()}
})
