import { describe, it, expect, vi } from 'vitest'
import { createFinancialRouter } from '../services/fund-data/financial/router.js'
import { quoteQuality } from '../services/fund-data/financial/policy.js'
import { projectCatalog, projectAnalysis, projectLegacyOperation } from '../services/fund-data/financial/projection.js'
import { validateFinancialQuery, validateFinancialResult, financialHash, LIMITATIONS } from '../packages/dsh-fund-research-runtime/financial-contract.js'
import { createFinancialTool } from '../packages/dsh-fund-research-runtime/financial-tool.js'
import { createHostedFundProvider } from '../packages/dsh-fund-research-runtime/hosted-provider.js'
import { FundCoordinator } from '../services/fund-data/coordinator.js'
import { handleRequest, QUERY_PATH } from '../services/fund-data/http.js'

const NOW = new Date('2026-09-08T02:00:00Z')
const clock = () => new Date(NOW)
const calendar = { timestamp:NOW.valueOf(),item:[{date:'20260904'},{date:'20260907'},{date:'20260908'}] }
const request = overrides => ({ operation:'financial',intent:'quote',asset:'stock',symbols:['300033.SZ'],...overrides })
function quote(thscode, timestamp=NOW.valueOf()-20000) { return { data:{timestamp,item:[{thscode,last_price:120,price_change_ratio_pct:-0.8,volume:809664,turnover:100000}]},source:'同花顺',request_id:'secret-diagnostic' } }
function marketFixture(fn) {
  return { call:vi.fn(async (service,tool,args) => {
    if (tool === 'get_a_share_calendar_trading_days') return {data:calendar}
    if (fn) return fn(service,tool,args)
    if (tool === 'get_meta_tickers_search') return {data:{item:[{thscode:args.q,name:'同花顺',asset_type:args.asset_type,currency:'CNY'}]}}
    return quote(args.thscodes ?? args.thscode)
  }) }
}
function fundResult(date='2026-09-07', overrides={}) { return {
  subjects:[{fund_code:'510300',fund_name:'沪深300ETF',fund_type:'etf',currency:'CNY'}],
  evidence:[{subject_code:'510300',field:'unit_nav',label:'单位净值',value:2.5,unit:'CNY',as_of:date}],
  limitations:[], ...overrides
} }
function memoryState() {
  const values=new Map();let queue=Promise.resolve(),alarm=null
  const storage={get:async k=>values.get(k),put:async(k,v)=>{values.set(k,v)},delete:async keys=>{for(const k of keys)values.delete(k)},
    getAlarm:async()=>alarm,setAlarm:async time=>{alarm=time},deleteAlarm:async()=>{alarm=null},
    list:async({prefix,startAfter='',limit=Infinity})=>new Map([...values].filter(([k])=>k.startsWith(prefix)&&k>startAfter).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit)),
    transaction:fn=>{const run=queue.then(()=>fn(storage));queue=run.catch(()=>{});return run}}
  return {storage,values}
}
const internal = q => new Request('https://fund-internal/query',{method:'POST',body:JSON.stringify(q)})

describe('financial routing and public evidence',()=>{
  it('returns complete OHLC bars, validates the full series, and retains the requested basis',async()=>{
    const data={thscode:'300033.SZ',interval:'1d',adjust:'forward',item:[{date_ms:Date.parse('2026-09-07T00:00:00+08:00'),open_price:2,high_price:3,low_price:1,close_price:2.5}]}
    const market=marketFixture(()=>({data})),router=createFinancialRouter({market,clock})
    const q=request({intent:'history',start:'2026-09-01',end:'2026-09-07',interval:'1d',adjustment:'forward'})
    const {value}=await router.query(q)
    expect(value.records).toHaveLength(4)
    expect(value.records.every(r=>r.price_basis==='1d 前复权'&&r.as_of==='2026-09-07')).toBe(true)
    data.item.push({...data.item[0]})
    const duplicate=await router.query(q)
    expect(duplicate.value.records).toEqual([])
    expect(duplicate.value.limitations).toContain(LIMITATIONS.unconfirmed)
  })
  it('does not label a newer NAV as the requested historical date',async()=>{
    const {value}=await createFinancialRouter({fund:{research:async()=>fundResult('2026-09-07')},market:marketFixture(),clock})
      .query(request({intent:'nav',asset:'etf',symbols:['510300.SH'],as_of:'2026-09-04'}))
    expect(value.records[0]).toMatchObject({as_of:'2026-09-07',quality_state:'unconfirmed'})
    expect(value.limitations).toContain(LIMITATIONS.unconfirmed)
  })
  it('applies the business projection to older operation envelopes too',()=>{
    const value=projectLegacyOperation({operation:'execute',data_json:JSON.stringify({fundCode:'000001',navDate:'2026-09-07',nav:1.2,source:'盈米',content:[{type:'text',text:'同花顺 API'}]}),limitations:[]})
    expect(JSON.parse(value.data_json).records[0]).toMatchObject({instrument:'000001',value:1.2,as_of:'2026-09-07'})
    expect(JSON.stringify(value)).not.toMatch(/盈米|同花顺|API|content/)
    expect(value.limitations).toContain(LIMITATIONS.missing)
  })
  it('uses the stock adapter, individual data times and share/% units; exposes no transport metadata',async()=>{
    const market=marketFixture();const fund={research:vi.fn()}
    const {value,provenance}=await createFinancialRouter({market,fund,clock}).query(request())
    expect(value.status).toBe('complete')
    expect(value.records.find(r=>r.metric==='成交量')).toMatchObject({value:809664,unit:'股'})
    expect(value.records.find(r=>r.metric==='涨跌幅')).toMatchObject({value:-0.8,unit:'%'})
    expect(value.records[0]).toMatchObject({quality_state:'fresh',as_of:'2026-09-08T01:59:40.000Z'})
    expect(fund.research).not.toHaveBeenCalled()
    expect(JSON.stringify(value)).not.toMatch(/同花顺|yingmi|provider|secret|request_id|mcp|https/i)
    expect(provenance[0]).toMatchObject({source:'tonghuashun',evidence_id:value.records[0].evidence_id})
  })
  it('does not use the newest batch timestamp for other securities',async()=>{
    const market=marketFixture((_s,_t,a)=>quote(a.thscodes,a.thscodes==='300033.SZ'?NOW.valueOf()-10000:NOW.valueOf()-300000))
    const {value}=await createFinancialRouter({market,clock}).query(request({symbols:['300033.SZ','600519.SH']}))
    expect(market.call.mock.calls.filter(([,t])=>t==='get_a_share_prices_snapshot').map(([, ,a])=>a.thscodes)).toEqual(['300033.SZ','600519.SH'])
    expect(value.records.find(r=>r.instrument==='600519.SH').quality_state).toBe('delayed')
    expect(value.limitations).toContain(LIMITATIONS.delayed)
  })
  it.each(['1m','5m','15m','60m'])('rejects %s before any provider request',async interval=>{
    const market=marketFixture();const {value}=await createFinancialRouter({market,clock}).query(request({intent:'history',start:'2026-09-01',end:'2026-09-08',interval}))
    expect(value.status).toBe('unsupported');expect(market.call).not.toHaveBeenCalled()
  })
  it.each(['accumulated','income_per_10000','yield_7d'])('never substitutes unit NAV for %s',async nav_basis=>{
    const market=marketFixture(),fund={research:vi.fn()}
    const {value}=await createFinancialRouter({market,fund,clock}).query(request({intent:'nav',asset:'etf',symbols:['510300.SH'],nav_basis}))
    expect(value.status).toBe('unsupported');expect(market.call).not.toHaveBeenCalled();expect(fund.research).not.toHaveBeenCalled()
  })
  it('uses fund evidence for NAV but exchange prices for ETF quotes',async()=>{
    const market=marketFixture(),fund={research:vi.fn(async()=>fundResult())}
    const router=createFinancialRouter({market,fund,clock})
    const nav=await router.query(request({intent:'nav',asset:'etf',symbols:['510300.SH']}))
    expect(nav.value.records[0]).toMatchObject({instrument:'510300.SH',value:2.5,price_basis:'单位净值',as_of:'2026-09-07',quality_state:'unknown'})
    expect(market.call.mock.calls.map(([,tool])=>tool)).toEqual(['get_meta_tickers_search'])
    const price=await router.query(request({asset:'etf',symbols:['510300.SH']}))
    expect(price.value.records[0]).toMatchObject({value:120,price_basis:'交易价格'})
    expect(fund.research).toHaveBeenCalledTimes(1)
    expect(price.value.records.some(r=>r.metric==='成交量')).toBe(false)
  })
  it('falls back once for a confirmed network failure, verifies currency, and keeps NAV date',async()=>{
    const fund={research:vi.fn(async()=>{throw Object.assign(new Error('secret'),{reason:'network_timeout'})})}
    const market=marketFixture((_s,t,a)=>t==='get_meta_tickers_search'?{data:{item:[{thscode:a.q,asset_type:a.asset_type,currency:'CNY'}]}}:{data:{timestamp:NOW.valueOf(),item:[{nav_date:Date.parse('2026-09-07T00:00:00+08:00'),unit_nav:2.4}]}})
    const {value,provenance}=await createFinancialRouter({market,fund,clock}).query(request({intent:'nav',asset:'etf',symbols:['510300.SH']}))
    expect(value.records[0]).toMatchObject({value:2.4,as_of:'2026-09-07',price_basis:'单位净值'})
    expect(provenance[0].source).toBe('tonghuashun')
    expect(market.call.mock.calls.filter(([,t])=>t==='get_fund_performance_nav')).toHaveLength(1)
  })
  it('uses the real fund adapter gap classification while rejecting authentication failures',async()=>{
    for (const status of [200,401,429]) {
      const fetchImpl=vi.fn(async(_url,init)=>{
        if(status!==200)return new Response(null,{status})
        const body=JSON.parse(init.body);let result
        if(body.method==='initialize')result={protocolVersion:'2025-06-18',capabilities:{tools:{}}}
        else if(body.method==='notifications/initialized')return new Response(null,{status:202})
        else if(body.method==='tools/list')result={tools:[{name:'BatchGetFundsDetail',inputSchema:{type:'object',properties:{fundCodes:{type:'array',items:{type:'string'}}},required:['fundCodes']}}]}
        else result={structuredContent:[{fundCode:'510300',data:{summary:{fundCode:'510300',fundName:'沪深300ETF',fundInvestType:'股票型',nav:null,navDate:'2026-09-07'}}}]}
        return Response.json({jsonrpc:'2.0',id:body.id,result})
      })
      const market=marketFixture((_s,t,a)=>t==='get_meta_tickers_search'?{data:{item:[{thscode:a.q,asset_type:a.asset_type,currency:'CNY'}]}}:{data:{item:[{nav_date:Date.parse('2026-09-07T00:00:00+08:00'),unit_nav:2.4}]}})
      const {value}=await createFinancialRouter({env:{YINGMI_API_KEY:'synthetic-key-only'},fetchImpl,market,clock}).query(request({intent:'nav',asset:'etf',symbols:['510300.SH']}))
      if(status===200)expect(value.records[0].value).toBe(2.4)
      else {expect(value.records).toEqual([]);expect(market.call).not.toHaveBeenCalled()}
    }
  })
  it.each(['auth','quota','invalid','cancelled','unconfirmed'])('does not switch source after %s',async reason=>{
    const market=marketFixture(),fund={research:async()=>{throw Object.assign(new Error('secret'),{reason})}}
    const {value}=await createFinancialRouter({market,fund,clock}).query(request({intent:'nav',asset:'etf',symbols:['510300.SH']}))
    expect(value.records).toEqual([]);expect(market.call).not.toHaveBeenCalled()
  })
  it('prefers an exact requested NAV date and never splices fund fields',async()=>{
    const fund={research:async()=>fundResult('2026-09-04')}
    const market=marketFixture((_s,t,a)=>t==='get_meta_tickers_search'?{data:{item:[{thscode:a.q,asset_type:a.asset_type,currency:'CNY'}]}}:{data:{item:[{nav_date:Date.parse('2026-09-07T00:00:00+08:00'),unit_nav:2.8}]}})
    const {value,provenance}=await createFinancialRouter({fund,market,clock}).query(request({intent:'nav',asset:'etf',symbols:['510300.SH'],as_of:'2026-09-07'}))
    expect(value.records).toHaveLength(1);expect(value.records[0].value).toBe(2.8)
    expect(new Set(provenance.map(p=>p.source))).toEqual(new Set(['tonghuashun']))
  })
  it('does not treat stale/absent calendars as proof of live prices',()=>{
    expect(quoteQuality(NOW.valueOf(),null,NOW.valueOf())).toBe('unknown')
    expect(quoteQuality(NOW.valueOf(),{...calendar,timestamp:NOW.valueOf()-86400000},NOW.valueOf())).toBe('unknown')
    expect(quoteQuality(null,calendar,NOW.valueOf())).toBe('unknown')
    const holiday={...calendar,item:[{date:'20260907'}]}
    expect(quoteQuality(Date.parse('2026-09-07T07:00:00Z'),holiday,NOW.valueOf())).toBe('market_closed')
    expect(quoteQuality(Date.parse('2026-09-04T07:00:00Z'),holiday,NOW.valueOf())).toBe('delayed')
  })
  it('preserves 同花顺 as a legitimate security name and reports multiple candidates',async()=>{
    const market=marketFixture((_s,_t)=>({data:{item:[{thscode:'300033.SZ',name:'同花顺',asset_type:'a-share'},{thscode:'600519.SH',name:'贵州茅台',asset_type:'a-share'}]}}))
    const {value}=await createFinancialRouter({market,clock}).query({operation:'financial',intent:'resolve',asset:'stock',query:'同花顺'})
    expect(value.records[0].value).toBe('同花顺');expect(value.status).toBe('ambiguous')
  })
  it('returns no data when identity is wrong or empty, not an unchanged result',async()=>{
    for (const data of [{timestamp:NOW.valueOf(),item:[]},quote('000001.SZ').data]) {
      const {value}=await createFinancialRouter({market:marketFixture(()=>({data})),clock}).query(request())
      expect(value.records).toEqual([]);expect(value.status).toBe('unavailable')
    }
  })
  it('drops upstream prose and URLs; keeps reviewed business fields explicitly unverified',()=>{
    const records=[]
    const projected=projectAnalysis([{fundCode:'300033',fundName:'同花顺',navDate:'2026-09-07',nav:1.2,provider:'同花顺 MCP',source_url:'https://secret.invalid',content:'盈米建议买入'}],r=>records.push(r))
    expect(projected.omitted).toBe(true);expect(records.find(r=>r.metric==='单位净值')).toMatchObject({value:1.2,unit:'原始单位',quality_state:'unconfirmed'})
    expect(JSON.stringify(records)).not.toMatch(/MCP|盈米|https|建议/)
    const entries=projectCatalog({entries:[{id:'fund_detail',state:'available',description:'盈米',schema_hash:'a'.repeat(64),arguments_schema_json:JSON.stringify({type:'object',description:'同花顺 API',properties:{fundCodes:{type:'array',items:{type:'string'},description:'盈米文档'}},required:['fundCodes']})}]})
    expect(JSON.stringify(entries)).not.toMatch(/盈米|同花顺|API|description/)
    expect(entries[0].state).toBe('available')
  })
  it.each([
    {provider:'tonghuashun'}, {symbols:['000001']}, {symbols:['AAPL']}, {symbols:['300033.SZ','300033.SZ']},
    {intent:'history',start:'2026-02-30',end:'2026-09-08'}, {intent:'history',start:'2026-09-09',end:'2026-09-08'},
  ])('rejects ambiguous or injected requests %j',overrides=>expect(()=>validateFinancialQuery(request(overrides))).toThrow())
  it('rejects additional DTO fields and leaked transport text even on an otherwise valid response',async()=>{
    const {value}=await createFinancialRouter({market:marketFixture(),clock}).query(request())
    expect(()=>validateFinancialResult({...value,provider:'x'},request(),clock)).toThrow()
    expect(()=>validateFinancialResult({...value,records:[{...value.records[0],value:'Bearer secret'}]},request(),clock)).toThrow()
  })
})

describe('financial admission, hosted transport and storage',()=>{
  it('does not cache quotes; an existing fund cooldown cannot disable stock routing',async()=>{
    const state=memoryState();await state.storage.put('cooldown',NOW.valueOf()+30000)
    const market=marketFixture(),router=createFinancialRouter({market,clock})
    const service=new FundCoordinator(state,{}, {financialRouter:router,clock})
    expect((await service.fetch(internal(request()))).status).toBe(200)
    expect((await service.fetch(internal(request()))).status).toBe(200)
    expect(market.call.mock.calls.filter(([,t])=>t==='get_a_share_prices_snapshot')).toHaveLength(2)
    expect([...state.values.keys()].some(k=>k.startsWith('cache:'))).toBe(false)
    const audits=[...state.values].filter(([k])=>k.startsWith('evidence:'))
    expect(audits).toHaveLength(2)
    expect(JSON.stringify(audits)).not.toMatch(/120|809664|300033|api.key|arguments/)
  })
  it('checks the shared persistent budget before the router',async()=>{
    const state=memoryState(),router={query:vi.fn()}
    await state.storage.put('budget',{day:'2026-09-08',count:1})
    const service=new FundCoordinator(state,{DAILY_RESEARCH_LIMIT:'1'},{financialRouter:router,clock})
    expect((await service.fetch(internal(request()))).status).toBe(429)
    expect(router.query).not.toHaveBeenCalled()
  })
  it('allows a configured stock service without a fund key but still rejects anonymous users',async()=>{
    const env={TONGHUASHUN_API_KEY:'fake-secret',ACCOUNTS_DB:{prepare:()=>({bind:()=>({first:async()=>null})})},FUND_COORDINATOR:{},FUND_REQUEST_LIMITER:{}}
    expect((await handleRequest(new Request('https://x/v1/fund-research/health'),env)).status).toBe(200)
    const response=await handleRequest(new Request(`https://x${QUERY_PATH}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request())}),env)
    expect(response.status).toBe(401)
  })
  it('accepts a redundant fund discriminator for research without dropping other invalid arguments',async()=>{
    const evidence=['510300','159919'].flatMap((subject_code,i)=>[
      {subject_code,field:'unit_nav',label:'单位净值',value:4+i,unit:'CNY',as_of:'2026-09-07'},
      {subject_code,field:'return_1y',label:'近一年收益率',value:5+i,unit:'%',as_of:'2026-09-07'}
    ])
    const fund={research:vi.fn(async()=>fundResult('2026-09-07',{
      subjects:['510300','159919'].map(fund_code=>({fund_code,fund_name:'沪深300ETF',fund_type:'etf',currency:'CNY'})),evidence
    }))}
    const router=createFinancialRouter({fund,clock})
    const fetch=vi.fn(async(_url,init)=>Response.json((await router.query(JSON.parse(init.body))).value))
    const tool=createFinancialTool(createHostedFundProvider({fetch,clock,bridge:undefined}))
    const args={intent:'research',asset:'fund',symbols:['510300','159919'],task:'compare'}
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW)
    try {
      const value=await tool.execute(args,{})
      expect(value.records.map(r=>[r.instrument,r.metric,r.as_of])).toEqual(expect.arrayContaining([
        ['510300','单位净值','2026-09-07'],['159919','单位净值','2026-09-07'],
        ['510300','近一年收益率','2026-09-07'],['159919','近一年收益率','2026-09-07']
      ]))
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({operation:'financial',intent:'research',symbols:args.symbols,task:'compare'})
      expect(args.asset).toBe('fund')
      for (const invalid of [{asset:'stock'},{asset:'etf'},{provider:'x'},{lookback_days:365},{operation:'financial'}]) {
        await expect(tool.execute({...args,...invalid},{})).rejects.toThrow()
      }
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {vi.useRealTimers()}
  })
  it('runs the business tool through the no-secret hosted transport and rejects unknown inputs',async()=>{
    const router=createFinancialRouter({market:marketFixture(),clock})
    const fetch=vi.fn(async(_url,init)=>{
      expect(init.headers['x-api-key']).toBeUndefined()
      return Response.json((await router.query(JSON.parse(init.body))).value)
    })
    const provider=createHostedFundProvider({fetch,clock,bridge:undefined})
    const tool=createFinancialTool(provider)
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW)
    try {
      const value=await tool.execute({intent:'quote',asset:'stock',symbols:['300033.SZ']},{})
      expect(value.records[0].value).toBe(120)
      expect(tool.name).toBe('financial_query')
      await expect(tool.execute({intent:'quote',asset:'stock',symbols:['300033.SZ'],provider:'x'},{})).rejects.toThrow()
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {vi.useRealTimers()}
  })
  it('infers the asset for resolve discovery without changing explicit asset choices', async()=>{
    const calls=[]
    const tool=createFinancialTool({ financial: async query => {
      calls.push(query)
      return { schema_version:'financial-1',request_hash:financialHash(query),received_at:NOW.toISOString(),status:'unavailable',records:[],limitations:['部分数据暂缺。'] }
    } })
    vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(NOW)
    try {
      for (const [query,asset] of [['中证全指电力指数','index'],['H30199','index'],['长江电力','stock'],['沪深300ETF','etf'],['电力主题基金','fund']]) {
        await tool.execute({intent:'resolve',query},{})
        expect(calls.at(-1)).toMatchObject({intent:'resolve',query,asset})
      }
      await tool.execute({intent:'resolve',asset:'stock',query:'沪深300'},{})
      expect(calls.at(-1).asset).toBe('stock')
      const args={intent:'resolve',asset:'stock',query:'中芯国际',symbols:['688981']}
      await tool.execute(args,{})
      expect(calls.at(-1)).toEqual({operation:'financial',intent:'resolve',asset:'stock',query:'中芯国际'})
      expect(args.symbols).toEqual(['688981'])
      const count=calls.length
      for(const invalid of [{symbols:'688981'},{symbols:['bad']},{provider:'other'}])await expect(tool.execute({...args,...invalid},{})).rejects.toThrow()
      expect(calls).toHaveLength(count)
    } finally {vi.useRealTimers()}
  })
})
