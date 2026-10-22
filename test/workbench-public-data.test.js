import { describe, expect, it, vi } from 'vitest'
import { validateWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { ResearchTaskRuntime } from '../packages/dsh-research-task-runtime/index.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { registerWorkbench } from '../packages/dsh-research-task-runtime/workbench.js'
import { preserveWorkbenchRefreshPreference } from '../packages/dsh-research-task-runtime/component-refresh-policy.js'
import { publicDataNewsTaskRequirement } from '../packages/dsh-research-task-runtime/workbench-public-data.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { runInNewContext } from 'node:vm'
import { componentPromptSource } from '../scripts/lib/figma-generation-client.mjs'

const spec = (profile, source, parameters = {}, type = 'market') => ({
  title: profile==='news'?'全市场财经资讯':profile, type, size: 'large', prompt: '真实免费来源，每分钟自动刷新',
  publicData: { profile, requests: [{ source, parameters_json: JSON.stringify(parameters) }], intervalMinutes: 1 }
})
const filteredNews = () => ({...spec('news','sina-news',{symbols:['sz300308','sz300502','sh601138'],limit:12},'news'),title:'算力公司新闻',prompt:'只检索中际旭创、 新易盛与工业富联最近一周的重要新闻，保留日期、摘要与原文链接；不得混入其他公司的新闻。',publicData:{profile:'news',requests:[{source:'sina-news',parameters_json:'{"symbols":["sz300308","sz300502","sh601138"],"limit":12}'}],intervalMinutes:5}})
const quote = { sourceId: 'tencent-quotes', source: '腾讯财经', dataTime: '2026-10-09 16:15:00', units: {}, records: [
  { symbol: 'sh600519', code: '600519', name: '贵州茅台', price: 1263, priceUnit: 'CNY', changePercent: 0.57, open: 1255.42, high: 1282, low: 1255.42, time: '2026-10-09 16:15:00' }
] }
const news = { sourceId: 'sina-news', source: '新浪财经', dataTime: '2026-10-11T00:10:00Z', units: {}, records: [
  { title: '市场快讯', time: '2026-10-11T00:10:00Z', publisher: '', url: 'https://finance.sina.com.cn/news/test.shtml' }
] }
const candles = { sourceId: 'kraken-candles', source: 'Kraken', dataTime: '2026-10-11T00:11:00Z', units: { price: 'USD', volume: 'BTC' }, records: [
  { time: '2026-10-11T00:10:00Z', open: 10, high: 11, low: 9, close: 10.5, volume: 0 },
  { time: '2026-10-11T00:11:00Z', open: 10.5, high: 12, low: 10, close: 11, volume: 0.1 }
] }
const ticker = { sourceId: 'kraken-ticker', source: 'Kraken', dataTime: null, units: { price: 'USD', volume24h: 'BTC' }, records: [
  { pair: 'XXBTZUSD', price: 123.456, bid: 123, ask: 124, high24h: 125, low24h: 120, volume24h: 5.123456789, time: null }
] }
function runtime(query = vi.fn(async args => ({ 'tencent-quotes': quote, 'sina-news': news, 'kraken-candles': candles, 'kraken-ticker': ticker })[args.source])) {
  const adapter = { start: vi.fn(), bindData: vi.fn(async () => {}) }, save = vi.fn(async () => {})
  const r = new ResearchTaskRuntime({ adapter, storage: { save }, publicDataClient: { query } })
  return { r, adapter, query, save }
}
async function settled(r, receipts) {
  await Promise.all(receipts.map(receipt => r.tasks.get(receipt.taskId).runPromise))
  return receipts.map(receipt => r.inspect({ parentSessionId: 'p', taskId: receipt.taskId }))
}

describe('宿主免费源工作台直通', () => {
  it('recovers a metadata-only financial-widget spelling when the explicit quote-table recipe already defines its layout',()=>{
    const original={...spec('quotes-table','tencent-quotes',{symbols:['sh600029','sh601111','sh601021']}),type:'financial-widget',prompt:'三家公司最新价和涨跌幅对比'}
    const panel=validateWorkbench({requestId:'quote-layout-alias',title:'航空观察',dataMode:'source',panels:[original]}).panels[0]
    expect(panel.type).toBe('market')
    expect(panel.publicData.requests).toEqual(original.publicData.requests)
    expect(panel.artifact).toBeUndefined()
    expect(original.type).toBe('financial-widget')
  })

  it('routes a multi-security market history comparison once without collapsing the series',()=>{
    const requests=['sh600029','sh601111','sh601021','sh000300'].map(symbol=>({source:'tencent-history',parameters_json:JSON.stringify({symbol,limit:22})}))
    const original={title:'三家航司量价对比',type:'market',size:'large',prompt:'同一基期100归一化比较三家公司与沪深300，仅真实数据，缺失保留',publicData:{profile:'price-volume',requests,intervalMinutes:0}}
    const panel=validateWorkbench({requestId:'airline-history',title:'航空观察',dataMode:'source',panels:[original]}).panels[0]
    expect(panel.type).toBe('chart')
    expect(panel.publicData).toBeUndefined()
    for(const symbol of ['sh600029','sh601111','sh601021','sh000300'])expect(panel.prompt).toContain(symbol)
    expect(workbenchPanelPrompt({title:'航空观察'},panel)).toContain('必须输出 chart.line')
    expect(workbenchPanelPrompt({title:'航空观察'},panel)).not.toContain('必须输出 market.price-volume')
    expect(validateWorkbench({requestId:'again',title:'航空观察',panels:[panel]}).panels[0]).toEqual(panel)
  })

  it('preserves several company queries as a normal news task instead of broadening them to the general feed',()=>{
    const original={...spec('news','sina-news',{limit:12},'news'),title:'三家公司近期新闻',prompt:'仅南方航空、中国国航、春秋航空相关新闻，不用全市场新闻替代'}
    original.publicData.requests=['南方航空','中国国航','春秋航空'].map(query=>({source:'sina-news',parameters_json:JSON.stringify({query,limit:12})}))
    const panel=validateWorkbench({requestId:'airline-news',title:'航空观察',dataMode:'source',panels:[original]}).panels[0]
    expect(panel.type).toBe('news')
    expect(panel.publicData).toBeUndefined()
    expect(panel.prompt).toContain(original.prompt)
    for(const query of ['南方航空','中国国航','春秋航空'])expect(panel.prompt).toContain(JSON.stringify(query))
    expect(panel.prompt).toContain('不得扩大为全市场新闻')
    for(const parameters of [{query:'南方航空',url:'http://private.test'},{query:'南方航空',limit:101},{query:'南方航空',symbols:['sh600029']}]){
      expect(()=>validateWorkbench({requestId:'invalid-topic',title:'新闻',panels:[{...original,publicData:{...original.publicData,requests:[{source:'sina-news',parameters_json:JSON.stringify(parameters)}]}}]})).toThrow()
    }
  })

  it.each([1,3])('retains singular security filters in %i news requests without rejecting or replanning the whole workbench',count=>{
    const symbols=['sh600011','sh600027','sh600795'].slice(0,count)
    const original={...spec('news','sina-news',{},'news'),title:'近期公告与煤电政策动态',prompt:'三家火电公司近期公告及煤电政策，仅真实日期和原文链接，不扩大到全市场。',publicData:{profile:'news',intervalMinutes:30,layoutProfile:'openterminal',requests:symbols.map((symbol,i)=>({source:'sina-news',parameters_json:JSON.stringify({symbol,limit:12+i})}))}}
    const before=structuredClone(original)
    const panel=validateWorkbench({requestId:'thermal-news',title:'火电利润弹性观察',dataMode:'source',panels:[original]}).panels[0]
    expect(panel.type).toBe('news');expect(panel.publicData).toBeUndefined()
    expect(panel.prompt).toContain(original.prompt)
    for(const [i,symbol]of symbols.entries())expect(panel.prompt).toContain(JSON.stringify({source:'sina-news',symbol,limit:12+i}))
    expect(panel.prompt).toContain('"intervalMinutes":30')
    expect(panel.prompt).toContain('"layoutProfile":"openterminal"')
    expect(panel.prompt).toContain('不得扩大为全市场新闻')
    expect(panel.prompt).toContain('不支持symbol')
    expect(validateWorkbench({requestId:'thermal-news-again',title:'火电利润弹性观察',panels:[panel]}).panels[0]).toEqual(panel)
    expect(original).toEqual(before)
  })

  it.each([
    {symbol:'sh600011',url:'https://private.test'},
    {symbol:'sh600011',headers:{authorization:'secret'}},
    {symbol:'sh600011',query:'另一个主题'},
    {symbol:'sh600011',symbols:['sh600027']},
    {symbol:'https://private.test'}, {symbol:'600011'}, {symbol:[]},
    {symbol:'sh600011',limit:101}, {symbol:'sh600011',limit:'12'}
  ])('rejects an invalid singular news filter without silently deleting it: %o',parameters=>{
    const original=spec('news','sina-news',parameters,'news')
    expect(()=>validateWorkbench({requestId:'invalid-singular-news',title:'新闻',panels:[original]})).toThrow()
  })

  it('rejects mixed, duplicate, wrong-source or excessive singular news requests',()=>{
    const request=symbol=>({source:'sina-news',parameters_json:JSON.stringify({symbol,limit:12})})
    for(const requests of [
      [request('sh600011'),{source:'sina-news',parameters_json:'{"limit":12}'}],
      [request('sh600011'),request('sh600011')],
      [{...request('sh600011'),source:'tencent-quotes'}],
      Array.from({length:9},(_,i)=>request('sh'+String(600010+i)))
    ]){
      const original={...spec('news','sina-news',{},'news'),publicData:{profile:'news',requests,intervalMinutes:30}}
      expect(()=>validateWorkbench({requestId:'invalid-news-requests',title:'新闻',panels:[original]})).toThrow()
    }
  })

  it('keeps an existing history comparison chart variant requested by the user',()=>{
    const original={title:'航司近一月收益比较',type:'chart',size:'large',prompt:'chart.bar；用户明确要求柱状图比较南方航空、中国国航的月收益率，使用实际取得的记录。',publicData:{profile:'price-volume',requests:['sh600029','sh601111'].map(symbol=>({source:'tencent-history',parameters_json:JSON.stringify({symbol,limit:22})})),intervalMinutes:0}}
    const panel=validateWorkbench({requestId:'history-bar',title:'航空观察',panels:[original]}).panels[0]
    const prompt=workbenchPanelPrompt({title:'航空观察'},panel)
    expect(prompt).toContain('必须输出 chart.bar')
    expect(prompt).not.toContain('必须输出 chart.line')
  })

  it('routes unsupported security-filtered news to a normal task without losing the original scope',()=>{
    const original=filteredNews()
    const input={requestId:'filtered-news',title:'算力研究',panels:[original]}
    const validated=validateWorkbench(input),panel=validated.panels[0]
    expect(panel.publicData).toBeUndefined()
    expect(panel.artifact).toBeUndefined()
    expect(panel.type).toBe('news')
    expect(panel.prompt).toContain(original.prompt)
    for(const symbol of ['sz300308','sz300502','sh601138'])expect(panel.prompt).toContain(symbol)
    expect(panel.prompt).toContain('"limit":12')
    expect(panel.prompt).toContain('"intervalMinutes":5')
    expect(panel.prompt).toContain('不得删除证券筛选')
    expect(validateWorkbench(validated)).toEqual(validated)
    expect(original.publicData.requests[0].parameters_json).toContain('"symbols"')
    expect(validateWorkbench({...input,panels:[spec('news','sina-news',{limit:12},'news')]}).panels[0].publicData).toBeDefined()
  })

  it('preserves the validated OpenTerminal news layout in both a new plan and a legacy recipe requirement',()=>{
    const original=filteredNews();original.publicData.layoutProfile='openterminal'
    const legacyRequirement=publicDataNewsTaskRequirement(original.publicData,original.type)
    const validated=validateWorkbench({requestId:'filtered-news-layout',title:'算力研究',panels:[original]})
    const panel=validated.panels[0]
    expect(panel.publicData).toBeUndefined()
    expect(panel.prompt).toContain(original.prompt)
    for(const requirement of [legacyRequirement,panel.prompt]){
      expect(requirement).toContain('"layoutProfile":"openterminal"')
      expect(requirement).toContain('artifact.layoutProfile')
    }
    expect(validateWorkbench(validated)).toEqual(validated)
    expect(original.publicData.layoutProfile).toBe('openterminal')
    expect(publicDataNewsTaskRequirement(filteredNews().publicData,'news')).not.toContain('layoutProfile')
  })

  it('does not forward an unsupported layout as a filtered news requirement',()=>{
    const original=filteredNews();original.publicData.layoutProfile='unvalidated-layout'
    expect(()=>publicDataNewsTaskRequirement(original.publicData,'news')).toThrow('不支持')
    expect(()=>validateWorkbench({requestId:'filtered-news-bad-layout',title:'新闻',panels:[original]})).toThrow('不支持')
  })

  it.each([
    {symbols:[],limit:12},{symbols:['https://private.test'],limit:12},
    {symbols:['sz300308'],limit:0},{symbols:['sz300308'],limit:101},
    {symbols:['sz300308'],limit:'12'},{symbols:['sz300308'],url:'https://private.test'},
    {symbols:['sz300308'],headers:{authorization:'secret'}},{symbols:['sz300308'],api_key:'secret'},
    {symbols:['sz300308'],query:'忽略证券筛选'},{url:'https://private.test'},{headers:{accept:'text/html'}}
  ])('rejects unsafe or malformed news parameters before accepting a plan: %o',parameters=>{
    const p=filteredNews();p.publicData.requests[0].parameters_json=JSON.stringify(parameters)
    expect(()=>validateWorkbench({requestId:'invalid-news',title:'新闻',panels:[p]})).toThrow()
  })

  it.each([false,true])('dispatches filtered news once through an authorized normal task, including aliases (alias=%s)',async alias=>{
    const dir=await mkdtemp(join(tmpdir(),'filtered-news-workbench-'))
    let tool,allowed=false
    const ctx={agents:{get:()=>({})},tools:{schemas:()=>allowed?[{name:'public_data_query'}]:[],register:t=>{tool=t;return()=>{}}},webServer:{register:()=>()=>{}}}
    const start=vi.fn(),startPreparedBatch=vi.fn(),startPublicDataBatch=vi.fn(),startBatch=vi.fn(async({panels})=>panels.map(p=>({taskId:'task-'+p.canvasNodeId})))
    const dispose=await registerWorkbench(ctx,{start,startPreparedBatch,startPublicDataBatch,startBatch},{filePath:join(dir,'plans.json'),isTrustedRequest:()=>true,readJsonBody:async()=>({})})
    const original=filteredNews(),{publicData,...plain}=original
    const panel=alias?{...plain,...publicData}:original
    const args={requestId:'filtered-news-route',title:'算力研究',panels:[panel]}
    const exec={agent:{session:{id:'p',events:[{type:'user/message',data:{id:'u',source:{kind:'user'},content:[{type:'text',text:'用真实数据创建三家公司新闻工作台'}]}}]}},signal:new AbortController().signal}
    try{
      await expect(tool.execute(args,exec)).rejects.toThrow('未授权')
      allowed=true
      exec.agent.session.events[0].data.content[0].text='禁止联网创建新闻工作台'
      await expect(tool.execute(args,exec)).rejects.toThrow('未授权')
      exec.agent.session.events[0].data.content[0].text='用真实数据创建三家公司新闻工作台'
      const receipt=await tool.execute(args,exec)
      expect(receipt.status).toBe('accepted')
      expect((await tool.execute(args,exec)).planId).toBe(receipt.planId)
      expect(startBatch).toHaveBeenCalledOnce()
      const child=startBatch.mock.calls[0][0].panels[0]
      expect(child.kind).toBe('container')
      expect(child.prompt).toContain(original.prompt)
      for(const symbol of ['sz300308','sz300502','sh601138'])expect(child.prompt).toContain(symbol)
      expect(startPublicDataBatch).not.toHaveBeenCalled()
      expect(start).not.toHaveBeenCalled()
      expect(startPreparedBatch).not.toHaveBeenCalled()
      const saved=JSON.parse(await readFile(join(dir,'plans.json'),'utf8'))[0]
      expect(saved.panels[0].publicData).toBeUndefined()
      expect(saved.panels[0].prompt).toContain(original.prompt)
    }finally{await dispose();await rm(dir,{recursive:true,force:true})}
  })

  it('keeps legacy failed news recipes restorable without executing an invalid source again',async()=>{
    const original=filteredNews(),adapter={start:vi.fn(),bindData:vi.fn()},query=vi.fn()
    const document={version:1,tasks:[{taskId:'legacy-news',parentSessionId:'p',canvasNodeId:'news-card',kind:'container',prompt:original.prompt,state:'failed',createdAt:1,lastSeq:1,error:'存在不支持的参数',publicData:original.publicData,publicDataPrompt:original.prompt,title:original.title,type:original.type}]}
    const r=new ResearchTaskRuntime({adapter,storage:{load:async()=>document,save:async()=>{}},publicDataClient:{query}})
    try{
      await r.restore()
      expect(r.inspect({parentSessionId:'p',taskId:'legacy-news'})).toMatchObject({state:'failed',error:'存在不支持的参数'})
      expect(adapter.start).not.toHaveBeenCalled()
      expect(query).not.toHaveBeenCalled()
    }finally{await r.dispose()}
  })

  it('keeps the declarative source through validation without treating it as a snapshot', () => {
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    const validated = validateWorkbench({ requestId: 'source', title: '行情', panels: [p] }).panels[0]
    expect(validated.publicData).toEqual(p.publicData)
    expect(validated.artifact).toBeUndefined()
    expect(validated.prompt).toContain('variant: table')
    for (const publicData of [
      { ...p.publicData, profile: 'unknown' },
      { ...p.publicData, requests: [{ source: 'arbitrary', parameters_json: '{}' }] },
      { ...p.publicData, requests: [{ source: 'tencent-quotes', parameters_json: '{}', url: 'https://private.test' }] },
      { ...p.publicData, intervalMinutes: -1 }
    ]) expect(() => validateWorkbench({ requestId: 'bad', title: '行情', panels: [{ ...p, publicData }] })).toThrow()
    expect(() => validateWorkbench({ requestId: 'minute-candle', title: '行情', panels: [spec('candlestick', 'kraken-candles', { pair: 'XBTUSD', interval: 1 })] })).toThrow()
    expect(() => validateWorkbench({ requestId: 'bad', title: '行情', dataMode: 'simulated', panels: [p] })).toThrow()
  })

  it('accepts the observed redundant refresh field, rejects conflicts and keeps direct manual intent authoritative', () => {
    const p = spec('crypto-metrics', 'kraken-ticker', { pair: 'XBTUSD' })
    const normalize = panel => validateWorkbench({ requestId: 'refresh-alias', title: '行情', panels: [panel] }).panels[0]
    expect(normalize({ ...p, intervalMinutes: 1 })).toEqual(normalize(p))
    const { intervalMinutes, ...publicData } = p.publicData
    expect(normalize({ ...p, publicData, intervalMinutes: 2 }).publicData.intervalMinutes).toBe(2)
    expect(() => normalize({ ...p, intervalMinutes: 2 })).toThrow('冲突')
    expect(() => normalize({ ...p, publicData, intervalMinutes: -1 })).toThrow()
    const manual = preserveWorkbenchRefreshPreference({ panels: [{ ...p, intervalMinutes: 1 }] }, '全部只手动刷新')
    expect(normalize(manual.panels[0]).publicData.intervalMinutes).toBe(0)
  })

  it('renders three panels and stores all minute recipes without any model call', async () => {
    const { r, adapter, query } = runtime()
    const panels = [spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] }), spec('price-volume', 'kraken-candles', { pair: 'XBTUSD', interval: 1, limit: 60 }), spec('news', 'sina-news', { limit: 12 }, 'news')]
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: panels.map((p, i) => ({ ...p, canvasNodeId: `n${i}` })) })
    const completed = await settled(r, receipts)
    expect(completed.map(t => t.state)).toEqual(['completed', 'completed', 'completed'])
    expect(adapter.start).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(3)
    expect(adapter.bindData).toHaveBeenCalledTimes(3)
    expect(adapter.bindData.mock.calls.every(c => c[1].intervalMinutes === 1 && c[1].requests[0].toolId === 'public_data_query')).toBe(true)
    expect(completed.map(t => readTemplateModel(JSON.parse(t.finalOutput)).templateId)).toEqual(['market.table', 'market.price-volume', 'news'])
    const data = adapter.bindData.mock.calls.map(c => readTemplateModel(JSON.parse(c[2])).data)
    expect(data[0].rows[0]).toContain('1263.00')
    expect(data[1]).toMatchObject({ prices: [10.5, 11], volumes: [0, 0.1], priceUnit: 'USD', volumeUnit: 'BTC' })
    expect(data[2].items[0]).toMatchObject({ category: '媒体未提供', url: news.records[0].url })
    await r.dispose()
  })

  it('isolates a failed source and a failed binding without calling a model or faking data', async () => {
    const { r, adapter } = runtime(vi.fn(async args => { if (args.source === 'sina-news') throw Error('SOURCE_UNAVAILABLE'); return quote }))
    adapter.bindData.mockImplementation(async task => { if (task.canvasNodeId === 'bind-failed') throw Error('WORKSPACE_DENIED') })
    const panels = [spec('quotes-table', 'tencent-quotes'), spec('news', 'sina-news', {}, 'news'), spec('quotes-metrics', 'tencent-quotes')]
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: panels.map((p, i) => ({ ...p, canvasNodeId: ['good', 'source-failed', 'bind-failed'][i] })) })
    const completed = await settled(r, receipts)
    expect(completed.map(t => t.state)).toEqual(['completed', 'failed', 'failed'])
    expect(completed[1].finalOutput).toBeUndefined()
    expect(completed[2].finalOutput).toBeUndefined()
    expect(adapter.start).not.toHaveBeenCalled()
    await r.dispose()
  })

  it('honors manual refresh and preserves unknown quote time and decimal precision', async () => {
    const { r, adapter } = runtime()
    const p = spec('crypto-metrics', 'kraken-ticker', { pair: 'XBTUSD' }); p.publicData.intervalMinutes = 0
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'ticker' }] })
    expect((await settled(r, receipts))[0].state).toBe('completed')
    const [, recipe, output] = adapter.bindData.mock.calls[0]
    const data = readTemplateModel(JSON.parse(output)).data
    expect(recipe.intervalMinutes).toBe(0)
    expect(data.asOf).toContain('报价时点未提供')
    expect(data.items.map(i => i.value)).toContain('123.46 USD')
    expect(data.items.map(i => i.value)).toContain('5.1235 BTC')
    await r.dispose()
  })

  it('bounds a ten-card batch to four source tasks and cancels without publishing or binding', async () => {
    let active = 0, peak = 0
    const query = vi.fn(async (_args, signal) => {
      active++; peak = Math.max(peak, active)
      await new Promise(resolve => setTimeout(resolve, 5)); active--
      signal.throwIfAborted(); return quote
    })
    const { r, adapter } = runtime(query)
    const panels = Array.from({ length: 10 }, (_, i) => ({ ...spec('quotes-table', 'tencent-quotes'), canvasNodeId: `batch-${i}` }))
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels })
    await r.cancel({ parentSessionId: 'p', taskId: receipts[1].taskId })
    await vi.waitFor(() => expect(receipts.every(x => ['completed','cancelled'].includes(r.tasks.get(x.taskId).state))).toBe(true))
    expect(peak).toBeLessThanOrEqual(4)
    expect(adapter.bindData).toHaveBeenCalledTimes(9)
    expect(r.inspect({ parentSessionId: 'p', taskId: receipts[1].taskId }).finalOutput).toBeUndefined()
    await r.dispose()
  })

  it('preserves completed public-source tasks across restore, without rerunning any source or model', async () => {
    const { r, save } = runtime()
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'saved' }] })
    await settled(r, receipts)
    const document = save.mock.calls.at(-1)[0]
    const adapter = { start: vi.fn(), bindData: vi.fn() }, query = vi.fn()
    const restored = new ResearchTaskRuntime({ adapter, storage: { load: async () => document, save: async () => {} }, publicDataClient: { query } })
    await restored.restore()
    expect(restored.inspect({ parentSessionId: 'p', taskId: receipts[0].taskId }).state).toBe('completed')
    expect(query).not.toHaveBeenCalled(); expect(adapter.start).not.toHaveBeenCalled()
    expect(restored.tasks.get(receipts[0].taskId).publicData).toEqual(p.publicData)
    await r.dispose(); await restored.dispose()
  })

  it('retries an unchanged saved source component directly, while edited requirements still use the model path', async () => {
    const { r, adapter, query } = runtime()
    query.mockRejectedValueOnce(Error('SOURCE_UNAVAILABLE'))
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    const receipts = await r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'retry', publicDataPrompt: p.prompt, prompt: '完整模板契约：' + p.prompt }] })
    expect((await settled(r, receipts))[0].state).toBe('failed')
    const retry = await r.start({ parentSessionId: 'p', canvasNodeId: 'retry', kind: 'container', prompt: p.prompt })
    expect((await settled(r, [retry]))[0].state).toBe('completed')
    expect(adapter.start).not.toHaveBeenCalled()
    expect(adapter.bindData).toHaveBeenCalledTimes(1)
    // A changed authored requirement must not silently retain the old query.
    adapter.start.mockResolvedValue({ childSessionId: 'edited', result: Promise.resolve({ output: [{ type: 'text', text: '新需求结果' }] }), dispose: async () => {} })
    const edited = await r.start({ parentSessionId: 'p', canvasNodeId: 'retry', kind: 'container', prompt: '只需整理我上传的资料，不再联网' })
    await settled(r, [edited])
    expect(adapter.start).toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(2)
    await r.dispose()
  })

  it('restores and retries source cards through the actual client size wrapper without launching a model', async () => {
    const original = runtime()
    original.query.mockRejectedValueOnce(Error('SOURCE_UNAVAILABLE'))
    const p = spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })
    await settled(original.r, await original.r.startPublicDataBatch({ parentSessionId: 'p', panels: [{ ...p, canvasNodeId: 'sized', publicDataPrompt: p.prompt, prompt: '完整模板契约：' + p.prompt }] }))
    const document = original.save.mock.calls.at(-1)[0]
    await original.r.dispose()
    const adapter = { start: vi.fn(), bindData: vi.fn(async () => {}) }, query = vi.fn(async () => quote)
    const restored = new ResearchTaskRuntime({ adapter, storage: { load: async () => document, save: async () => {} }, publicDataClient: { query } })
    const wrap = runInNewContext('(' + componentPromptSource + ')', { researchComponentSize: () => 'large', RESEARCH_BENTO_SIZES: { large: { width: 656, height: 456 } } })
    try {
      await restored.restore()
      for (const node of [{ sizeMode: 'auto' }, { sizeMode: 'manual', x: 803.05, y: 171.7, width: 484.1, height: 319.4 }]) {
        const retry = await restored.start({ parentSessionId: 'p', canvasNodeId: 'sized', kind: 'container', prompt: wrap(node, p.prompt) })
        expect((await settled(restored, [retry]))[0].state).toBe('completed')
      }
      expect(adapter.start).not.toHaveBeenCalled(); expect(query).toHaveBeenCalledTimes(2)
      adapter.start.mockResolvedValue({ childSessionId: 'edited', result: Promise.resolve({ output: [{ type: 'text', text: '新需求结果' }] }), dispose: async () => {} })
      const edited = await restored.start({ parentSessionId: 'p', canvasNodeId: 'sized', kind: 'container', prompt: wrap({ sizeMode: 'auto' }, p.prompt + '\n不再联网，只用上传记录') })
      await settled(restored, [edited])
      expect(adapter.start).toHaveBeenCalledOnce(); expect(query).toHaveBeenCalledTimes(2)
    } finally { await restored.dispose() }
  })

  it('dispatches native source tasks once, rejects unavailable tools and no-network requests before creating a plan', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'free-workbench-'))
    let tool, allowed = false
    const ctx = { agents: { get: () => ({}) }, tools: { schemas: () => allowed ? [{ name: 'public_data_query' }] : [], register: t => { tool = t; return () => {} } }, webServer: { register: () => () => {} } }
    const start = vi.fn(), startPreparedBatch = vi.fn(), startPublicDataBatch = vi.fn(async ({ panels }) => panels.map(p => ({ taskId: 'task-' + p.canvasNodeId })))
    const dispose = await registerWorkbench(ctx, { start, startPreparedBatch, startPublicDataBatch }, { filePath: join(dir, 'plans.json'), isTrustedRequest: () => true, readJsonBody: async () => ({}) })
    const args = { requestId: 'direct', title: '免费行情', panels: [spec('quotes-table', 'tencent-quotes', { symbols: ['sh600519'] })] }
    const exec = { agent: { session: { id: 'p', events: [{ type: 'user/message', data: { id: 'u', source: { kind: 'user' }, content: [{ type: 'text', text: '创建免费行情工作台，每分钟刷新' }] } }] } }, signal: new AbortController().signal }
    try {
      expect(tool.parameters.properties.panels.items.properties.intervalMinutes?.type).toBe('number')
      await expect(tool.execute(args, exec)).rejects.toThrow('未授权')
      const candleArgs={...args,requestId:'live-candle-permission',panels:[spec('candlestick','tencent-history',{symbol:'sh510300',limit:30})]}
      await expect(tool.execute(candleArgs,exec)).rejects.toThrow('未授权')
      allowed = true
      exec.agent.session.events[0].data.content[0].text = '禁止联网创建行情工作台'
      await expect(tool.execute(args, exec)).rejects.toThrow('未授权')
      await expect(tool.execute(candleArgs,exec)).rejects.toThrow('未授权')
      exec.agent.session.events[0].data.content[0].text = '创建免费行情工作台，每分钟刷新'
      const receipt = await tool.execute(args, exec)
      expect(receipt.status).toBe('accepted')
      expect((await tool.execute(args, exec)).planId).toBe(receipt.planId)
      expect(startPublicDataBatch).toHaveBeenCalledTimes(1)
      expect(start).not.toHaveBeenCalled(); expect(startPreparedBatch).not.toHaveBeenCalled()
      expect(JSON.parse(await readFile(join(dir, 'plans.json'), 'utf8'))).toHaveLength(1)
    } finally { dispose(); await rm(dir, { recursive: true, force: true }) }
  })
})
