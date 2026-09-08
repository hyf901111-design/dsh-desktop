import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { RESEARCH_CAPABILITIES } from '../packages/dsh-fund-research-runtime/research-capabilities.js'
import { createYingmiResearchProvider } from '../packages/dsh-fund-research-runtime/yingmi-research-provider.js'
import { createYingmiMcpClient } from '../packages/dsh-fund-research-runtime/yingmi-mcp.js'
import { createHostedFundProvider } from '../packages/dsh-fund-research-runtime/hosted-provider.js'
import { createResearchOperationTools } from '../packages/dsh-fund-research-runtime/research-tools.js'
import { researchHash, validateServiceQuery } from '../packages/dsh-fund-research-runtime/research-operations.js'
import { argumentsMatchSchema } from '../packages/dsh-fund-research-runtime/research-schema.js'
import { FundCoordinator } from '../services/fund-data/coordinator.js'
import { handleRequest } from '../services/fund-data/http.js'

const reviewedTools = JSON.parse(readFileSync(new URL('./fixtures/yingmi-reviewed-tools.json', import.meta.url), 'utf8'))
const KEY = 'synthetic-yingmi-key-never-public'
const schema = { type: 'object', properties: {
  code: { type: 'string', pattern: '^\\d{6}$' },
  period: { type: 'string', enum: ['oneYear', 'threeYear'] },
  weights: { type: 'array', items: { type: 'number', minimum: 0, maximum: 1 }, maxItems: 6 }
}, required: ['code'], additionalProperties: false }
const args = { code: '000001', period: 'oneYear' }
const execute = (capability = 'fund_risk', arguments_ = args) => ({ operation: 'execute', capability, arguments: arguments_, schema_hash: researchHash(schema) })

function source({ names = reviewedTools, schemas = {}, result = { structuredContent: { date: '2026-09-04', value: 0.12 } }, paginate = false, sse = false, expireWith, rpcError } = {}) {
  let renewed = false
  const fetch = vi.fn(async (_url, init) => {
    expect(String(_url)).toBe('https://stargate.yingmi.com/mcp/v2')
    expect(init.headers['x-api-key']).toBe(KEY)
    expect(init.redirect).toBe('error')
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    const body = JSON.parse(init.body)
    let data
    if (body.method === 'initialize') data = { protocolVersion: '2025-06-18', capabilities: { tools: {} } }
    else if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    else if (body.method === 'tools/list') {
      const list = names.map(name => ({ name, description: `Read ${name}; 盈米 ${KEY}`, inputSchema: renewed && expireWith ? expireWith : schemas[name] ?? schema }))
      data = paginate && !body.params?.cursor ? { tools: list.slice(0, 20), nextCursor: 'page-2' } :
        { tools: paginate ? list.slice(20) : list }
    } else if (body.method === 'tools/call') {
      if (expireWith && !renewed) { renewed = true; return new Response(null, { status: 404 }) }
      data = typeof result === 'function' ? result(body.params) : result
    } else throw Error('Unexpected method')
    const error = rpcError?.(body)
    const json = JSON.stringify({ jsonrpc: '2.0', id: body.id, ...(error ? { error } : { result: data }) })
    return new Response(sse ? `event: message\r\ndata: ${json}\r\n\r\n` : json, { headers: {
      'content-type': sse ? 'text/event-stream' : 'application/json',
      ...(body.method === 'initialize' ? { 'Mcp-Session-Id': renewed ? 'new' : 'first' } : {})
    } })
  })
  const provider = createYingmiResearchProvider({ resolveCredential: async () => KEY, fetch })
  const calls = () => fetch.mock.calls.filter(([, init]) => init.method === 'POST')
    .map(([, init]) => JSON.parse(init.body)).filter(body => body.method === 'tools/call')
  return { provider, fetch, calls }
}

function state() {
  const values = new Map()
  let tail = Promise.resolve()
  const storage = {
    get: async key => values.get(key), put: async (key, value) => { values.set(key, value) },
    list: async () => new Map(), delete: async () => {},
    transaction: fn => { const result = tail.then(() => fn(storage)); tail = result.catch(() => {}); return result }
  }
  return { storage, values }
}

describe('reviewed research capabilities and live schemas', () => {
  it('covers exactly the independently reviewed 60 tools and discovers pagination without registering unrelated tools', async () => {
    expect(RESEARCH_CAPABILITIES.map(item => item.tool).sort()).toEqual([...reviewedTools].sort())
    const { provider, calls } = source({ paginate: true, names: [...reviewedTools, 'PlaceOrder', 'AnalyzeCashFlow'] })
    const result = await provider.researchOperation({ operation: 'catalog' })
    expect(result.entries).toHaveLength(60)
    expect(result.entries.every(entry => entry.state === 'available')).toBe(true)
    expect(result.entries.every(entry => entry.arguments_schema_json === undefined)).toBe(true)
    expect(calls()).toHaveLength(0)
    const detail = await provider.researchOperation({ operation: 'catalog', capability: 'fund_risk' })
    expect(JSON.parse(detail.entries[0].arguments_schema_json)).toEqual(schema)
    expect(detail.entries[0].schema_hash).toBe(researchHash(schema))
    expect(JSON.stringify(detail)).not.toContain(KEY)
    expect(detail.entries[0].description).toBe('Read AnalyzeFundRisk; 盈米 [已隐藏]')
  })

  it('routes every reviewed capability to its exact upstream tool with validated arguments', async () => {
    const { provider, calls } = source({ sse: true })
    for (const spec of RESEARCH_CAPABILITIES) {
      const result = await provider.researchOperation(execute(spec.id))
      expect(result).toMatchObject({ capability: spec.id, status: 'received', quality_state: 'unverified' })
      expect(JSON.parse(result.data_json)).toEqual({ date: '2026-09-04', value: 0.12 })
    }
    expect(calls().map(call => call.params.name).sort()).toEqual([...reviewedTools].sort())
    expect(calls().every(call => JSON.stringify(call.params.arguments) === JSON.stringify({ code: '000001', period: 'oneYear' }))).toBe(true)
  })

  it('marks missing and incompatible account tools separately', async () => {
    const remoteRef = { type: 'object', $ref: 'https://untrusted.invalid/schema' }
    const { provider } = source({ names: ['SearchFunds'], schemas: { SearchFunds: remoteRef } })
    const result = await provider.researchOperation({ operation: 'catalog', category: 'discovery' })
    expect(result.entries.find(e => e.id === 'search_funds').state).toBe('incompatible')
    expect(result.entries.find(e => e.id === 'guess_fund_code').state).toBe('unavailable')
    await expect(provider.researchOperation(execute())).rejects.toMatchObject({ code: 'RESEARCH_CAPABILITY_UNAVAILABLE' })
  })

  it.each([{}, { code: 'bad' }, { code: '000001', period: 'bogus' }, { code: '000001', weights: [1.1] }, { code: '000001', extra: true }])('rejects invalid schema arguments before tools/call', async arguments_ => {
    const { provider, calls } = source()
    await expect(provider.researchOperation(execute('fund_risk', arguments_))).rejects.toMatchObject({ code: 'RESEARCH_ARGUMENTS_INVALID' })
    expect(calls()).toHaveLength(0)
  })

  it('validates local refs, unions, required nested values and scalar constraints without coercion', () => {
    const definition = { type: 'object', $defs: { holding: { type: 'object', properties: {
      code: { type: 'string', pattern: '^\\d{6}$' }, weight: { type: 'number', minimum: 0, maximum: 1 }
    }, required: ['code', 'weight'], additionalProperties: false } }, properties: {
      holdings: { type: 'array', items: { $ref: '#/$defs/holding' }, minItems: 1 },
      day: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }
    }, required: ['holdings'], additionalProperties: false }
    expect(argumentsMatchSchema(definition, { holdings: [{ code: '000001', weight: 0.2 }], day: null })).toBe(true)
    expect(argumentsMatchSchema(definition, { holdings: [{ code: '000001', weight: '0.2' }] })).toBe(false)
    expect(argumentsMatchSchema(definition, { holdings: [], day: '2026-15-40' })).toBe(false)
  })

  it('rejects stale definitions initially and after session renewal', async () => {
    const first = source()
    await expect(first.provider.researchOperation({ ...execute(), schema_hash: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'RESEARCH_SCHEMA_CHANGED' })
    expect(first.calls()).toHaveLength(0)
    const second = source({ expireWith: { ...schema, required: ['code', 'period'] } })
    await expect(second.provider.researchOperation(execute())).rejects.toMatchObject({ code: 'RESEARCH_SCHEMA_CHANGED' })
    expect(second.calls()).toHaveLength(1)
  })

  it.each([
    { operation: 'execute', capability: 'PlaceOrder', arguments: {}, schema_hash: 'a'.repeat(64) },
    { operation: 'catalog', category: 'not_real' },
    { operation: 'catalog', category: 'news', capability: 'fund_risk' },
    { ...execute(), arguments: { authorization: 'private' } },
    { ...execute(), arguments: JSON.parse('{"__proto__":{}}') },
    { ...execute(), endpoint: 'https://untrusted.invalid' }
  ])('rejects unapproved request shape before network access', async input => {
    const { provider, fetch } = source()
    await expect(provider.researchOperation(input)).rejects.toMatchObject({ code: 'RESEARCH_ARGUMENTS_INVALID' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('continues rejecting trading and out-of-scope tools at the MCP transport boundary', async () => {
    const fetch = vi.fn()
    const client = createYingmiMcpClient({ apiKey: KEY, fetch })
    await expect(client.callToolResult('PlaceOrder', {})).rejects.toThrow()
    await expect(client.callToolResult('AnalyzeCashFlow', {})).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('research output boundary', () => {
  const link = { type: 'resource_link', uri: 'https://yingmi.cn/archives/877', name: '盈米基金原文', mimeType: 'text/html' }
  const summary = { type: 'text', text: '盈米基金经理观点摘要' }
  const article = { type: 'resource', resource: { uri: 'https://yingmi.cn/archives/877', mimeType: 'text/plain', text: '原始观点与披露日期：2026-09-04' } }

  it.each([
    [{ content: [{ type: 'text', text: '[1]:\n  - code: 000001' }] }, '[1]:\n  - code: 000001', 'received'],
    [{ content: [{ type: 'text', text: '{"items":[]}' }] }, { items: [] }, 'received'],
    [{ content: [{ type: 'text', text: '第一段' }, { type: 'text', text: '第二段' }] }, ['第一段', '第二段'], 'received'],
    [{ structuredContent: [] }, [], 'empty'], [{ content: [] }, null, 'empty']
  ])('preserves JSON, textual, multi-block and empty responses without claiming financial verification', async (result, data, status) => {
    const { provider } = source({ result })
    const value = await provider.researchOperation(execute())
    expect(JSON.parse(value.data_json)).toEqual(data)
    expect(value.status).toBe(status)
    expect(value.quality_state).toBe('unverified')
    expect(value.limitations.length).toBeGreaterThan(0)
  })

  it.each([
    [{ content: [summary, link] }, { content: [summary, link] }],
    [{ content: [link] }, { content: [link] }],
    [{ content: [summary, article] }, { content: [summary, article] }],
    [{ structuredContent: { value: 0.12 }, content: [summary, link] }, { structuredContent: { value: 0.12 }, content: [summary, link] }],
    [{ structuredContent: { value: 0.12 }, content: [summary] }, { structuredContent: { value: 0.12 }, content: [summary] }],
    [{ structuredContent: { value: 0.12 }, content: [{ type: 'text', text: '{ "value": 0.12 }' }] }, { value: 0.12 }]
  ])('retains source links, embedded text and supplementary content without fetching their URIs', async (result, expected) => {
    const { provider, fetch } = source({ result })
    const value = await provider.researchOperation(execute('financial_news'))
    expect(JSON.parse(value.data_json)).toEqual(expected)
    expect(value.status).toBe('received')
    expect(fetch.mock.calls.every(([url]) => url === 'https://stargate.yingmi.com/mcp/v2')).toBe(true)
  })

  it('reports omitted media explicitly when usable content is returned', async () => {
    const { provider } = source({ result: { content: [summary, link, { type: 'image', data: 'unavailable-image' }] } })
    const value = await provider.researchOperation(execute('financial_news'))
    expect(JSON.parse(value.data_json)).toEqual({ content: [summary, link] })
    expect(value.limitations.some(item => /未包含.*image/.test(item))).toBe(true)
    expect(value.quality_state).toBe('unverified')
  })

  it('redacts credential-bearing fields and text while retaining dates and source URLs', async () => {
    const { provider } = source({ result: { structuredContent: {
      title: '盈米基金经理观点', date: '2026-09-04', url: 'https://yingmi.cn/article?apiKey=do-not-return',
      source: '盈米基金', yingmi: '公开字段', apiKey: KEY, authorization: `Bearer ${KEY}`,
      text: `SearchManagerViewpoint ${KEY} Bearer synthetic-other-token`
    } } })
    const value = await provider.researchOperation(execute('manager_views'))
    expect(JSON.stringify(value)).not.toMatch(/do-not-return|synthetic-yingmi-key|synthetic-other-token/)
    expect(JSON.parse(value.data_json)).toEqual({ title: '盈米基金经理观点', date: '2026-09-04',
      url: 'https://yingmi.cn/article?apiKey=[已隐藏]', source: '盈米基金', yingmi: '公开字段',
      text: 'SearchManagerViewpoint [已隐藏] Bearer [已隐藏]' })
  })

  it('redacts credentials in mixed content while preserving public provenance', async () => {
    const { provider } = source({ result: { structuredContent: { title: '盈米基金', apiKey: KEY },
      content: [{ ...link, uri: `${link.uri}?token=private-url-token` },
        { ...article, resource: { ...article.resource, text: `盈米观点 ${KEY}`, authorization: `Bearer ${KEY}` } }] } })
    const value = await provider.researchOperation(execute('financial_news'))
    expect(value.data_json).not.toMatch(/private-url-token|synthetic-yingmi-key|authorization|apiKey/)
    expect(JSON.parse(value.data_json)).toEqual({ structuredContent: { title: '盈米基金' },
      content: [{ ...link, uri: `${link.uri}?token=[已隐藏]` },
        { ...article, resource: { ...article.resource, text: '盈米观点 [已隐藏]' } }] })
  })

  it('rejects MCP errors, unsupported media and oversized results as distinct failures', async () => {
    for (const [result, code] of [
      [{ isError: true, content: [{ type: 'text', text: KEY }] }, 'RESEARCH_QUERY_FAILED'],
      [{ content: [{ type: 'image', data: 'ignored' }] }, 'RESEARCH_SCHEMA_UNSUPPORTED'],
      [{ structuredContent: { value: 'x'.repeat(70 * 1024) } }, 'RESEARCH_RESULT_TOO_LARGE']
    ]) {
      const { provider } = source({ result })
      await expect(provider.researchOperation(execute())).rejects.toMatchObject({ code })
    }
  })

  it('cancels before I/O and bounds a credential resolver that never completes', async () => {
    const { provider, fetch } = source()
    await expect(provider.researchOperation(execute(), { signal: AbortSignal.abort() })).rejects.toMatchObject({ code: 'FUND_RESEARCH_CANCELLED' })
    expect(fetch).not.toHaveBeenCalled()
    const stalled = createYingmiResearchProvider({ resolveCredential: () => new Promise(() => {}), fetch, timeoutMs: 10 })
    await expect(stalled.researchOperation(execute())).rejects.toMatchObject({ code: 'FUND_SERVICE_UNAVAILABLE' })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('hosted research path and model tools', () => {
  function hosted(options = {}) {
    const upstream = source(options)
    const storage = state()
    const coordinator = new FundCoordinator(storage, { DAILY_RESEARCH_LIMIT: '200' }, { operationProvider: upstream.provider })
    const env = {
      ACCOUNTS_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ id: 'test-user' }), run: async () => ({ success: true }) }) }) },
      YINGMI_API_KEY: KEY,
      FUND_REQUEST_LIMITER: { limit: async () => ({ success: true }) },
      FUND_COORDINATOR: { idFromName: x => x, get: () => coordinator }
    }
    const bridge = { url: 'http://127.0.0.1:9999/fund-research', token: 'a'.repeat(64) }
    const wire = vi.fn(async (url, init) => {
      expect(url).toBe(bridge.url)
      expect(init.headers.authorization).toBe(`Bearer ${bridge.token}`)
      expect(JSON.stringify(init)).not.toContain(KEY)
      return handleRequest(new Request('https://updates.evanarts.com/v1/fund-research/query', { ...init,
        headers: { ...init.headers, 'cf-connecting-ip': '192.0.2.1' } }), env)
    })
    const provider = createHostedFundProvider({ bridge, fetch: wire })
    return { ...upstream, storage, coordinator, provider, wire, tools: createResearchOperationTools(provider) }
  }

  it('completes schema discovery and execution through model → bridge → HTTP → durable budget → MCP', async () => {
    const { tools: [catalog, query], storage, calls } = hosted()
    const list = await catalog.execute({ category: 'performance' })
    expect(list.entries).toHaveLength(5)
    expect(validateJsonSchemaValue(catalog.output.schema, list)).toEqual([])
    const detail = await catalog.execute({ capability: 'fund_risk' })
    const result = await query.execute({ capability: 'fund_risk', schema_hash: detail.entries[0].schema_hash, arguments_json: JSON.stringify(args) })
    expect(validateJsonSchemaValue(query.output.schema, result)).toEqual([])
    expect(result.status).toBe('received')
    expect(calls()).toHaveLength(1)
    expect(storage.values.get('budget').count).toBe(3)
    expect([...storage.values.keys()].some(key => /cache:|transient:/.test(key))).toBe(false)
  })

  it('preserves retryable schema changes and query failures without activating global cooldown', async () => {
    const { provider, storage } = hosted()
    await expect(provider.researchOperation({ ...execute(), schema_hash: 'a'.repeat(64) })).rejects.toMatchObject({ code: 'RESEARCH_SCHEMA_CHANGED' })
    expect(storage.values.has('cooldown')).toBe(false)
    expect((await provider.researchOperation(execute())).status).toBe('received')
    const failing = hosted({ result: { isError: true, content: [{ type: 'text', text: KEY }] } })
    await expect(failing.provider.researchOperation(execute())).rejects.toMatchObject({ code: 'RESEARCH_QUERY_FAILED' })
    expect(failing.storage.values.has('cooldown')).toBe(false)
  })

  it.each([false, true])('isolates JSON-RPC invalid arguments over JSON/SSE (SSE=%s)', async sse => {
    const setup = hosted({ sse, rpcError: body => body.method === 'tools/call' && body.params.arguments.code === '000001'
      ? { code: -32602, message: `Invalid arguments ${KEY}`, data: { apiKey: KEY } } : undefined })
    await expect(setup.provider.researchOperation(execute())).rejects.toMatchObject({
      code: 'RESEARCH_ARGUMENTS_INVALID', message: expect.not.stringContaining(KEY)
    })
    expect(setup.storage.values.has('cooldown')).toBe(false)
    const detail = await setup.provider.researchOperation({ operation: 'catalog', capability: 'fund_risk' })
    expect(detail.entries[0].state).toBe('available')
    expect((await setup.provider.researchOperation(execute('fund_risk', { code: '000002' }))).status).toBe('received')
    expect(setup.calls()).toHaveLength(2)
  })

  it.each([
    ['tools/call', -32603], ['initialize', -32602], ['tools/list', -32602]
  ])('retains global outage protection for %s errors with code %s', async (method, code) => {
    const setup = hosted({ rpcError: body => body.method === method ? { code, message: KEY } : undefined })
    await expect(setup.provider.researchOperation(execute())).rejects.toMatchObject({ code: 'FUND_SERVICE_UNAVAILABLE' })
    expect(setup.storage.values.has('cooldown')).toBe(true)
    const count = setup.fetch.mock.calls.length
    await expect(setup.provider.researchOperation({ operation: 'catalog' })).rejects.toMatchObject({ code: 'FUND_SERVICE_UNAVAILABLE' })
    expect(setup.fetch).toHaveBeenCalledTimes(count)
  })

  it('never persists private combination inputs or results, even on repeated queries', async () => {
    const setup = hosted()
    await setup.provider.researchOperation(execute('portfolio_risk', { ...args, weights: [0.4, 0.6] }))
    await setup.provider.researchOperation(execute('portfolio_risk', { ...args, weights: [0.4, 0.6] }))
    expect(setup.calls()).toHaveLength(2)
    expect(JSON.stringify([...setup.storage.values])).not.toMatch(/weights|value|000001/)
  })

  it('rejects malformed model argument JSON and response substitution', async () => {
    const setup = hosted()
    await expect(async () => setup.tools[1].execute({ capability: 'fund_risk', schema_hash: 'a'.repeat(64), arguments_json: 'not JSON' })).rejects.toMatchObject({ code: 'RESEARCH_ARGUMENTS_INVALID' })
    expect(setup.wire).not.toHaveBeenCalled()
    const value = await setup.provider.researchOperation(execute())
    const tampered = createHostedFundProvider({ fetch: async () => Response.json({ ...value, capability: 'fund_performance' }) })
    await expect(tampered.researchOperation(execute())).rejects.toMatchObject({ code: 'FUND_SERVICE_UNAVAILABLE' })
  })

  it('canonicalizes input ordering while rejecting oversized request payloads', () => {
    expect(researchHash(validateServiceQuery(execute()))).toBe(researchHash(validateServiceQuery({ schema_hash: researchHash(schema), arguments: { period: 'oneYear', code: '000001' }, capability: 'fund_risk', operation: 'execute' })))
    expect(() => validateServiceQuery(execute('financial_news', { code: 'x'.repeat(17000) }))).toThrow()
  })
})
