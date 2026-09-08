import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { Miniflare, convertV4MiniflareOptions } from 'miniflare'
import { hash } from '../services/accounts/auth.js'
import { createHostedFundProvider } from '../packages/dsh-fund-research-runtime/hosted-provider.js'
import { createResearchOperationTools } from '../packages/dsh-fund-research-runtime/research-tools.js'

// Actual workerd + D1 + SQLite coordinator; synthetic upstream only, no real keys.
const reviewed = JSON.parse(readFileSync(new URL('../test/fixtures/yingmi-reviewed-tools.json', import.meta.url), 'utf8'))
const schema = { type: 'object', $defs: { code: { type: 'string', pattern: '^\\d{6}$' } }, properties: {
  fundCode: { $ref: '#/$defs/code' }, query: { type: 'string', maxLength: 5000 },
  weights: { type: 'array', items: { type: 'number', minimum: 0, maximum: 1 } }
}, required: ['fundCode'], additionalProperties: false }
const key = 'synthetic-worker-research-key'
const seen = []
const built = await build({ entryPoints: [fileURLToPath(new URL('../services/fund-data/worker.js', import.meta.url))],
  bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:*', 'node:*'] })
const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
  modules: true, script: built.outputFiles[0].text, compatibilityDate: '2026-08-27', compatibilityFlags: ['nodejs_compat'],
  bindings: { YINGMI_API_KEY: key, DAILY_RESEARCH_LIMIT: '20', CACHE_TTL_SECONDS: '600' },
  d1Databases: { ACCOUNTS_DB: 'test-accounts' },
  durableObjects: { FUND_COORDINATOR: { className: 'FundResearchCoordinator', useSQLite: true } },
  ratelimits: { FUND_REQUEST_LIMITER: { namespace_id: '2026090701', simple: { limit: 100, period: 60 } } },
  outboundService: async request => {
    assert.equal(request.url, 'https://stargate.yingmi.com/mcp/v2')
    assert.equal(request.headers.get('x-api-key'), key)
    const body = await request.json()
    let result
    if (body.method === 'initialize') result = { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
    else if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    else if (body.method === 'tools/list') result = { tools: reviewed.map(name => ({ name, inputSchema: schema })) }
    else if (body.method === 'tools/call') {
      assert.ok(reviewed.includes(body.params.name))
      seen.push(body.params.name)
      if (body.params.arguments.query === 'error') result = { isError: true, content: [{ type: 'text', text: key }] }
      else result = { structuredContent: { asOf: '2026-09-04', fundCode: body.params.arguments.fundCode, value: 0.12 } }
    } else throw Error('Unexpected upstream method')
    return Response.json({ jsonrpc: '2.0', id: body.id, result })
  }
}] }))
try {
  await mf.ready
  const db = await mf.getD1Database('ACCOUNTS_DB')
  await db.exec(readFileSync(new URL('../services/accounts/migrations/0001_accounts.sql', import.meta.url), 'utf8').replaceAll('\n', ' '))
  const invite = 'synthetic-research-invite'
  await db.prepare('INSERT INTO invites(hash,expires_at,max_uses) VALUES(?,?,1)').bind(hash(invite), Math.floor(Date.now()/1000)+3600).run()
  const registered = await mf.dispatchFetch('https://fund.local/v1/account/register', { method: 'POST', headers: {
    'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1'
  }, body: JSON.stringify({ username: 'researchtester', password: 'synthetic-password-123', invite }) })
  assert.equal(registered.status, 200)
  const { token } = await registered.json()
  const provider = createHostedFundProvider({ fetch: (url, init) => mf.dispatchFetch(url, { ...init, headers: {
    ...init.headers, authorization: `Bearer ${token}`, 'cf-connecting-ip': '192.0.2.1'
  } }) })
  const [catalog, query] = createResearchOperationTools(provider)
  const all = await catalog.execute({})
  assert.equal(all.entries.length, 60)
  assert.ok(all.entries.every(entry => entry.state === 'available'))
  for (const capability of ['search_funds', 'equity_valuation', 'brinson_attribution', 'portfolio_backtest', 'bond_credit_ratings', 'manager_views', 'strategy_holdings', 'asset_allocation_plan']) {
    const detail = await catalog.execute({ capability })
    const result = await query.execute({ capability, schema_hash: detail.entries[0].schema_hash,
      arguments_json: JSON.stringify({ fundCode: '000001', query: 'x'.repeat(3000), weights: [0.4, 0.6] }) })
    assert.equal(result.status, 'received')
    assert.equal(result.quality_state, 'unverified')
    assert.equal(JSON.parse(result.data_json).fundCode, '000001')
    assert.ok(!JSON.stringify(result).includes(key))
  }
  const detail = await catalog.execute({ capability: 'financial_news' })
  await assert.rejects(() => query.execute({ capability: 'financial_news', schema_hash: detail.entries[0].schema_hash,
    arguments_json: JSON.stringify({ fundCode: '000001', query: 'error' }) }), { code: 'RESEARCH_QUERY_FAILED' })
  assert.equal((await query.execute({ capability: 'financial_news', schema_hash: detail.entries[0].schema_hash,
    arguments_json: JSON.stringify({ fundCode: '000001' }) })).status, 'received')
  await assert.rejects(() => catalog.execute({}), { code: 'FUND_SERVICE_BUSY' })
  assert.equal(seen.length, 10)
  console.log('Workers research operations: 60 available definitions; 8 representative categories, refs/arrays, >2 KiB authenticated bodies, isolated query errors and persistent budget passed.')
} finally { await mf.dispose() }
