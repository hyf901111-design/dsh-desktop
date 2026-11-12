import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hash } from '../services/accounts/auth.js'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { createHostedFundProvider } from '../packages/dsh-fund-research-runtime/hosted-provider.js'
import { createFundResearchTool } from '../packages/dsh-fund-research-runtime/index.js'

// This test uses workerd, SQLite Durable Object storage, and a fully local mock data source.
// It never reads the user's credentials and refuses all outbound destinations except the mocked URL.
const fakeKey = 'synthetic-worker-test-key'
const date = new Date().toISOString().slice(0, 10)
const built = await build({
  entryPoints: [fileURLToPath(new URL('../services/fund-data/worker.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:*', 'node:*']
})
for (const redirectUpstream of [false, true]) {
  let sourceCalls = 0
  const mf = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      modules: true, script: built.outputFiles[0].text,
      compatibilityDate: '2026-08-27', compatibilityFlags: ['nodejs_compat'],
      bindings: { YINGMI_API_KEY: fakeKey, VOLCENGINE_AGENT_PLAN_KEY: fakeKey, DAILY_RESEARCH_LIMIT: '1', CACHE_TTL_SECONDS: '600' },
      d1Databases: { ACCOUNTS_DB: 'test-accounts' },
      durableObjects: { FUND_COORDINATOR: { className: 'FundResearchCoordinator', useSQLite: true } },
      ratelimits: {
        FUND_REQUEST_LIMITER: { namespace_id: '2026090701', simple: { limit: 20, period: 60 } },
        VOLCENGINE_REQUEST_LIMITER: { namespace_id: '2026111201', simple: { limit: 30, period: 60 } }
      },
      outboundService: async request => {
        if (request.url === 'https://open.feedcoopapi.com/search_api/web_search') {
          assert.equal(request.headers.get('authorization'), `Bearer ${fakeKey}`)
          const { Query } = await request.json()
          if (Query === 'test redirect') return Response.redirect('https://untrusted.invalid/collect', 302)
          return Response.json({ Result: { WebResults: [{ Url: 'https://example.com/' }] } })
        }
        if (request.url === 'https://datapro.hqd.cn-beijing.volces.com/mcp') {
          assert.equal(request.headers.get('x-agent-plan-key'), fakeKey)
          const rpc = await request.json()
          if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202 })
          const result = rpc.method === 'initialize' ? { protocolVersion: '2025-03-26' }
            : { content: [{ type: 'text', text: 'professional data' }] }
          return Response.json({ jsonrpc: '2.0', id: rpc.id, result })
        }
        assert.equal(request.url, 'https://stargate.yingmi.com/mcp/v2')
        assert.equal(request.headers.get('x-api-key'), fakeKey)
        const body = await request.json()
        let result
        if (body.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
        else if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
        else if (body.method === 'tools/list') result = { tools: [{
          name: 'BatchGetFundsDetail', inputSchema: {
            type: 'object', properties: { fundCodes: { type: 'array', items: { type: 'string' } } },
            required: ['fundCodes'], additionalProperties: false
          }
        }] }
        else if (body.method === 'tools/call') {
          sourceCalls++
          assert.equal(body.params.name, 'BatchGetFundsDetail')
          if (redirectUpstream) return Response.redirect('https://untrusted.invalid/collect', 302)
          result = { structuredContent: body.params.arguments.fundCodes.map(fundCode => ({
            fundCode, data: { summary: {
              fundCode, fundName: '测试沪深300ETF', fundInvestType: '股票型', nav: 1.23,
              navDate: date, indexCode: '000300', indexName: '沪深300', oneYearReturn: '1.00%',
              netAsset: '10亿', netAssetUpdateDate: date, uiSetupDate: '2012-05-04'
            } }
          })) }
        } else throw new Error(`Unexpected mock method: ${body.method}`)
        return Response.json({ jsonrpc: '2.0', id: body.id, result })
      }
    }]
  }))
  try {
    await mf.ready
    const db=await mf.getD1Database('ACCOUNTS_DB')
    const schema=readFileSync(new URL('../services/accounts/migrations/0001_accounts.sql',import.meta.url),'utf8')
    await db.exec(schema.replaceAll('\n',' '))
    const invite='synthetic-invite-20260907'
    await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,1)').bind(hash(invite),Math.floor(Date.now()/1000)+3600).run()
    const auth=async(action,body,token)=>mf.dispatchFetch(`https://fund.local/v1/account/${action}`,{method:body?'POST':'GET',headers:{'content-type':'application/json','cf-connecting-ip':'192.0.2.40',...(token?{authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})})
    const anon=await mf.dispatchFetch('https://fund.local/v1/fund-research/query',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})
    assert.equal(anon.status,401)
    const registered=await auth('register',{username:'tester',password:'synthetic-password-123',invite})
    assert.equal(registered.status,200,await registered.clone().text())
    const {token,user}=await registered.json()
    assert.equal((await auth('register',{username:'tester2',password:'synthetic-password-123',invite})).status,400)
    assert.equal((await auth('login',{username:'tester',password:'incorrect-password'})).status,401)
    assert.equal((await auth('me',null,token)).status,200)
    const provider = createHostedFundProvider({
      fetch: async (url, init) => {
        assert.equal(init.headers.authorization, undefined)
        assert.equal(init.headers['x-api-key'], undefined)
        const response = await mf.dispatchFetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}`, 'cf-connecting-ip': '192.0.2.55' } })
        return response
      }
    })
    const tool = createFundResearchTool(provider)
    const input = { task: 'single', funds: ['510300'] }
    if (redirectUpstream) {
      await assert.rejects(() => tool.execute(input, {}), { code: 'FUND_SERVICE_UNAVAILABLE' })
      assert.equal(sourceCalls, 1)
      console.log('Workers upstream redirects: rejected without forwarding credentials.')
    } else {
      const result = await tool.execute(input, {})
      assert.equal(result.status, 'complete')
      assert.equal(result.quality_state, 'verified')
      assert.equal(result.subjects[0].fund_code, '510300')
      assert.equal(JSON.stringify(result).includes(fakeKey), false)
      const cached = await tool.execute(input, {})
      assert.equal(cached.received_at, result.received_at)
      assert.equal(sourceCalls, 1)
      await assert.rejects(() => tool.execute({ ...input, funds: ['510500'] }, {}), { code: 'FUND_SERVICE_BUSY' })
      assert.equal(sourceCalls, 1)
      const health = await mf.dispatchFetch('https://fund.local/v1/fund-research/health')
      assert.equal(health.status, 200)
      console.log('Workers runtime: no-key desktop → Worker → SQLite coordinator → mocked data source passed.')
      console.log('Original timestamps, cache reuse, global budget, secret isolation: passed.')
    }
    if (!redirectUpstream) {
      const search = (path, body) => mf.dispatchFetch(`https://fund.local/v1/${path}`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      })
      const web = await search('doubao/search', { query: 'public query' })
      assert.equal(web.status, 200)
      assert.deepEqual((await web.json()).sources, [{ url: 'https://example.com/' }])
      assert.equal((await search('doubao/search', { query: 'test redirect' })).status, 502)
      const dataset = await search('datapro/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: { name: 'dataPro_search', arguments: { query: 'public query' } } })
      assert.equal(dataset.status, 200)
      assert.equal((await dataset.json()).result.content[0].text, 'professional data')
      console.log('Workers runtime: authenticated Doubao search, DataPro MCP and redirect rejection passed.')
    }
    const usage=await (await auth('usage',null,token)).json()
    assert.ok(usage.usage[0].requests>=1)
    assert.equal((await auth('password',{currentPassword:'synthetic-password-123',password:'new-synthetic-password'},token)).status,200)
    assert.equal((await auth('me',null,token)).status,401)
    assert.equal((await auth('login',{username:'tester',password:'synthetic-password-123'})).status,401)
    const login=await auth('login',{username:'tester',password:'new-synthetic-password'})
    assert.equal(login.status,200)
    const renewed=await login.json()
    assert.equal((await auth('logout',{},renewed.token)).status,200)
    assert.equal((await auth('me',null,renewed.token)).status,401)
    console.log('Account registration, invite consumption, anonymous rejection, password/session revocation and usage: passed.')
  } finally {
    await mf.dispose()
  }
}
