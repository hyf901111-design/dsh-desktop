import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import { createHostedFundProvider } from '../packages/dsh-fund-research-runtime/hosted-provider.js'
import { createFinancialTool } from '../packages/dsh-fund-research-runtime/financial-tool.js'

// Real workerd + SQLite DO + account login + hosted client. Upstreams are local fixtures only.
// Test-only DO hooks advance the retention clock and trigger the actual workerd alarm.
// They are bundled only here, never in the production worker entry.
const built=await build({stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
  import handler, { FundResearchCoordinator as ProductionCoordinator } from './services/fund-data/worker.js'
  export class FundResearchCoordinator extends ProductionCoordinator {
    async fetch(request) {
      const storage = this.service.state.storage
      const path = new URL(request.url).pathname
      if (path === '/test/expire') {
        this.service.clock = () => new Date(Date.now() + 86400000)
        await storage.setAlarm(Date.now() + 5)
        return Response.json({ scheduled: true })
      }
      if (path === '/test/storage') return Response.json({
        evidence: (await storage.list({ prefix: 'evidence:' })).size,
        expiry: (await storage.list({ prefix: 'evidence-expiry:' })).size,
        alarm: await storage.getAlarm(), budget: await storage.get('budget')
      })
      return super.fetch(request)
    }
  }
  export default handler
`},bundle:true,write:false,format:'esm',platform:'neutral',external:['cloudflare:*','node:*']})
const counts={fund:0,market:0}
const day=new Date(Date.now()+8*3600000).toISOString().slice(0,10)
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{
  modules:true,script:built.outputFiles[0].text,compatibilityDate:'2026-08-27',compatibilityFlags:['nodejs_compat'],
  bindings:{YINGMI_API_KEY:'synthetic-fund-key',TONGHUASHUN_API_KEY:'synthetic-market-key',DAILY_RESEARCH_LIMIT:'2'},
  d1Databases:{ACCOUNTS_DB:'test-accounts'},durableObjects:{FUND_COORDINATOR:{className:'FundResearchCoordinator',useSQLite:true}},
  ratelimits:{FUND_REQUEST_LIMITER:{namespace_id:'2026090801',simple:{limit:20,period:60}}},
  outboundService:async req=>{
    const url=new URL(req.url),fund=url.origin==='https://stargate.yingmi.com'
    assert.ok(fund?url.pathname==='/mcp/v2':url.origin==='https://fuyao.aicubes.cn'&&['/mcp/a-share','/mcp/meta'].includes(url.pathname))
    assert.equal(req.headers.get('x-api-key'),fund?'synthetic-fund-key':'synthetic-market-key')
    assert.equal(req.headers.get('authorization'),null)
    const body=await req.json();let result
    if(body.method==='initialize')result={protocolVersion:fund?'2025-06-18':'2025-03-26',capabilities:{tools:{}}}
    else if(body.method==='notifications/initialized')return new Response(null,{status:202})
    else if(body.method==='tools/list')result={tools:[{name:'BatchGetFundsDetail',inputSchema:{type:'object',properties:{fundCodes:{type:'array',items:{type:'string'}}},required:['fundCodes'],additionalProperties:false}}]}
    else if(body.method==='tools/call'){
      if(fund){
        counts.fund++;assert.equal(body.params.name,'BatchGetFundsDetail')
        result={structuredContent:body.params.arguments.fundCodes.map(fundCode=>({fundCode,data:{summary:{fundCode,fundName:'测试沪深300ETF',fundInvestType:'股票型',nav:2.4,navDate:day,indexCode:'000300',indexName:'沪深300'}}}))}
      }else{
        counts.market++
        const data=body.params.name==='get_meta_tickers_search'?{item:[{thscode:'510300.SH',asset_type:'fund-etf',currency:'CNY'}]}:body.params.name==='get_a_share_calendar_trading_days'?{timestamp:Date.now(),item:[{date:day.replaceAll('-','')}]}:
          {timestamp:Date.now(),item:[{thscode:body.params.arguments.thscodes,last_price:215.4,volume:20000,price_change_ratio_pct:-0.5}]}
        result={structuredContent:{code:0,request_id:'private-only-id',data}}
      }
    }else throw new Error('Unexpected outbound operation')
    return Response.json({jsonrpc:'2.0',id:body.id,result})
  }
}]}))
try{
  await mf.ready
  const db=await mf.getD1Database('ACCOUNTS_DB')
  await db.exec(readFileSync(new URL('../services/accounts/migrations/0001_accounts.sql',import.meta.url),'utf8').replaceAll('\n',' '))
  const invite='synthetic-financial-invite'
  await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,1)').bind(hash(invite),Math.floor(Date.now()/1000)+3600).run()
  const send=(path,body,token)=>mf.dispatchFetch(`https://fund.local${path}`,{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.40',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)})
  const query={operation:'financial',intent:'quote',asset:'stock',symbols:['300033.SZ']}
  assert.equal((await send('/v1/fund-research/query',query)).status,401)
  const registered=await send('/v1/account/register',{username:'financialtester',password:'synthetic-password-123',invite})
  assert.equal(registered.status,200,await registered.clone().text())
  const {token}=await registered.json()
  assert.equal((await send('/v1/fund-research/query',{...query,provider:'arbitrary'},token)).status,400)
  assert.deepEqual(counts,{fund:0,market:0})
  const provider=createHostedFundProvider({fetch:async(url,init)=>{
    assert.equal(init.headers['x-api-key'],undefined)
    return mf.dispatchFetch(url,{...init,headers:{...init.headers,authorization:`Bearer ${token}`,'cf-connecting-ip':'192.0.2.40'}})
  }})
  const tool=createFinancialTool(provider)
  const nav=await tool.execute({intent:'nav',asset:'etf',symbols:['510300.SH']},{})
  assert.equal(nav.records[0].value,2.4);assert.equal(nav.records[0].price_basis,'单位净值')
  assert.deepEqual(counts,{fund:1,market:1})
  const quote=await tool.execute({intent:'quote',asset:'stock',symbols:['300033.SZ']},{})
  assert.equal(quote.records[0].value,215.4);assert.equal(quote.records[0].price_basis,'交易价格')
  assert.deepEqual(counts,{fund:1,market:3})
  for(const value of [nav,quote])assert.doesNotMatch(JSON.stringify(value),/yingmi|同花顺|盈米|synthetic|private-only|mcp|https|provider/i)
  await assert.rejects(()=>tool.execute({intent:'quote',asset:'stock',symbols:['300033.SZ']},{}),{code:'FUND_SERVICE_BUSY'})
  assert.deepEqual(counts,{fund:1,market:3})
  const namespace=await mf.getDurableObjectNamespace('FUND_COORDINATOR')
  const coordinator=namespace.get(namespace.idFromName('fund-data-v1'))
  const inspect=async()=> (await coordinator.fetch('https://internal/test/storage')).json()
  const retained=await inspect()
  assert.equal(retained.evidence,2);assert.equal(retained.expiry,2)
  assert.ok(retained.alarm>Date.now()+86300000)
  await coordinator.fetch('https://internal/test/expire')
  let expired=await inspect()
  const deadline=Date.now()+5000
  while(expired.evidence&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,50));expired=await inspect()}
  assert.equal(expired.evidence,0);assert.equal(expired.expiry,0);assert.equal(expired.alarm,null)
  assert.equal(expired.budget.count,2)
  assert.deepEqual(counts,{fund:1,market:3})
  console.log('Financial business tool → account authorization → SQLite budget → automatic provider routing: passed.')
  console.log('Provider/key isolation, ETF price/NAV separation, malformed input and quota rejection: passed.')
  console.log('Real SQLite alarm expires provenance without another query or provider call: passed.')
}finally{await mf.dispose()}
