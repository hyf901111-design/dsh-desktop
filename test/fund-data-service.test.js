import { describe, expect, it, vi } from 'vitest'
import { normalizeResearchResult, serviceError } from '../packages/dsh-fund-research-runtime/contract.js'
import { createHostedFundProvider } from '../packages/dsh-fund-research-runtime/hosted-provider.js'
import { createFundResearchTool } from '../packages/dsh-fund-research-runtime/index.js'
import { FundCoordinator } from '../services/fund-data/coordinator.js'
import { handleRequest, QUERY_PATH } from '../services/fund-data/http.js'

const NOW = '2026-09-07T01:00:00.000Z'
const QUERY = { task: 'single', funds: ['510300'] }
function normalized(query = QUERY, overrides = {}) {
  return normalizeResearchResult({
    task: query.task, status: 'partial', as_of: '2026-09-04', frequency: 'daily',
    source_type: 'aggregate', quality_state: 'verified',
    subjects: query.funds.map(fund_code => ({ fund_code, fund_name: '测试指数基金', fund_type: 'etf', currency: 'CNY' })),
    evidence: query.funds.map((subject_code, i) => ({ id: `nav${i}`, subject_code, field: 'unit_nav', value: 1.2, unit: 'CNY', as_of: '2026-09-04' })),
    claims: [], limitations: ['unsupported_metric'], ...overrides
  }, { request: query, receivedAt: NOW, rawHash: 'a'.repeat(64) })
}
function memoryState() {
  const values = new Map()
  let queue = Promise.resolve()
  const storage = {
    get: async k => structuredClone(values.get(k)),
    put: async (k, v) => { values.set(k, structuredClone(v)) },
    delete: async keys => { for (const k of Array.isArray(keys) ? keys : [keys]) values.delete(k) },
    list: async ({ prefix, startAfter = '', limit = Infinity }) => new Map([...values]
      .filter(([key]) => key.startsWith(prefix) && key > startAfter)
      .sort(([a], [b]) => a.localeCompare(b)).slice(0, limit)),
    transaction: fn => {
      const next = queue.then(() => fn(storage))
      queue = next.catch(() => {})
      return next
    }
  }
  return { storage, values }
}
function internalRequest(query = QUERY) {
  return new Request('https://fund-internal/query', { method: 'POST', body: JSON.stringify(query) })
}
function publicRequest(query = QUERY, headers = {}) {
  return new Request(`https://updates.evanarts.com${QUERY_PATH}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', authorization: `Bearer ${'a'.repeat(64)}`, ...headers }, body: JSON.stringify(query)
  })
}
function bindings(coordinator = { fetch: vi.fn(async () => Response.json(normalized())) }) {
  return {
    ACCOUNTS_DB: { prepare: () => ({ bind: () => ({ first: async () => ({ id: 'user-1' }), run: async () => ({success:true}) }) }) },
    YINGMI_API_KEY: 'server-only-fixture-key',
    FUND_REQUEST_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    FUND_COORDINATOR: { idFromName: vi.fn(x => x), get: vi.fn(() => coordinator) }
  }
}

describe('public fund service boundary', () => {
  it('authenticates account credentials and strips all client headers before the coordinator', async () => {
    const coordinator = { fetch: vi.fn(async req => {
      expect(await req.json()).toEqual(QUERY)
      expect([...req.headers.keys()]).toEqual(['content-type'])
      return Response.json(normalized())
    }) }
    const env = bindings(coordinator)
    const response = await handleRequest(publicRequest(QUERY, { authorization: `Bearer ${'a'.repeat(64)}`, 'x-forwarded-for': 'spoof' }), env)
    expect(response.status).toBe(200)
    expect(env.FUND_REQUEST_LIMITER.limit).toHaveBeenCalledWith({ key: 'user-1:192.0.2.1' })
    expect(await response.text()).not.toMatch(/server-only|user-key|192\.0\.2/)
  })

  it.each([
    { ...QUERY, endpoint: 'https://attacker.invalid' },
    { ...QUERY, apiKey: 'private-key' },
    { task: 'raw', funds: ['510300'] },
    { task: 'single', funds: ['../../etc/passwd'] },
    { task: 'compare', funds: Array.from({ length: 7 }, (_, i) => `00000${i}`) }
  ])('rejects unapproved requests before provider access', async query => {
    const env = bindings()
    expect((await handleRequest(publicRequest(query), env)).status).toBe(400)
    expect(env.FUND_COORDINATOR.get).not.toHaveBeenCalled()
  })

  it('fails closed on missing secret, limiter, or trusted IP', async () => {
    const env = bindings()
    for (const binding of ['ACCOUNTS_DB', 'YINGMI_API_KEY', 'FUND_REQUEST_LIMITER', 'FUND_COORDINATOR']) {
      expect((await handleRequest(publicRequest(), { ...env, [binding]: undefined })).status).toBe(503)
    }
    const req = publicRequest(); req.headers.delete('cf-connecting-ip')
    expect((await handleRequest(req, env)).status).toBe(503)
    expect(env.FUND_COORDINATOR.get).not.toHaveBeenCalled()
  })

  it('enforces IP limits before reading/querying and rejects oversized chunked bodies', async () => {
    const env = bindings()
    env.FUND_REQUEST_LIMITER.limit.mockResolvedValueOnce({ success: false })
    expect((await handleRequest(publicRequest(), env)).status).toBe(429)
    const req = new Request(`https://updates.evanarts.com${QUERY_PATH}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.1', authorization: `Bearer ${'a'.repeat(64)}` }, body: 'x'.repeat(4096)
    })
    expect((await handleRequest(req, env)).status).toBe(400)
    expect(env.FUND_COORDINATOR.get).not.toHaveBeenCalled()
  })

  it('does not proxy other routes, cross-origin preflights, or leak upstream error text', async () => {
    const env = bindings({ fetch: async () => { throw new Error('Bearer server-only-fixture-key') } })
    expect((await handleRequest(new Request('https://updates.evanarts.com/download/file'), env)).status).toBe(404)
    expect((await handleRequest(new Request(`https://updates.evanarts.com${QUERY_PATH}`, { method: 'OPTIONS' }), env)).status).toBe(405)
    const result = await handleRequest(publicRequest(), env)
    expect(result.status).toBe(503)
    expect(await result.text()).not.toMatch(/Bearer|fixture/)
  })
})

describe('global durable budget and cache', () => {
  it('cleans expired entries in bounded pages', async () => {
    const state = memoryState()
    for (let i = 0; i < 130; i++) await state.storage.put(`cache:expired${i}`, { expiresAt: 0 })
    const service = new FundCoordinator(state, {}, { provider: { research: async () => normalized() }, clock: () => new Date(NOW) })
    expect((await service.fetch(internalRequest())).status).toBe(200)
    expect([...state.values.keys()].filter(k => k.startsWith('cache:'))).toHaveLength(1)
  })
  it('shares identical concurrent lookups and preserves receipt time across cache hits', async () => {
    const state = memoryState()
    const provider = { research: vi.fn(async () => normalized()) }
    const service = new FundCoordinator(state, {}, { provider, clock: () => new Date(NOW) })
    const results = await Promise.all(Array.from({ length: 8 }, () => service.fetch(internalRequest())))
    expect(results.every(x => x.status === 200)).toBe(true)
    expect(provider.research).toHaveBeenCalledTimes(1)
    const restarted = new FundCoordinator(state, {}, { provider, clock: () => new Date(Date.parse(NOW) + 60_000) })
    const cached = await (await restarted.fetch(internalRequest())).json()
    expect(cached.received_at).toBe(NOW)
    expect(provider.research).toHaveBeenCalledTimes(1)
  })

  it('enforces the budget atomically across different queries and restarts, resetting next UTC day', async () => {
    const state = memoryState()
    const provider = { research: vi.fn(async q => normalized(q)) }
    const env = { DAILY_RESEARCH_LIMIT: '1' }
    const service = new FundCoordinator(state, env, { provider, clock: () => new Date(NOW) })
    const responses = await Promise.all(['510300', '510500'].map(code => service.fetch(internalRequest({ ...QUERY, funds: [code] }))))
    expect(responses.map(r => r.status).sort()).toEqual([200, 429])
    const restarted = new FundCoordinator(state, env, { provider, clock: () => new Date(NOW) })
    expect((await restarted.fetch(internalRequest({ ...QUERY, funds: ['159915'] }))).status).toBe(429)
    const tomorrow = new FundCoordinator(state, env, { provider, clock: () => new Date(Date.parse(NOW) + 86400000) })
    expect((await tomorrow.fetch(internalRequest({ ...QUERY, funds: ['159915'] }))).status).toBe(200)
  })

  it('expires cache and never serves stale evidence as a successful refresh', async () => {
    const state = memoryState()
    const provider = { research: vi.fn().mockResolvedValueOnce(normalized()).mockRejectedValue(new Error('secret-upstream-failure')) }
    const first = new FundCoordinator(state, {}, { provider, clock: () => new Date(NOW) })
    await first.fetch(internalRequest())
    const next = new FundCoordinator(state, {}, { provider, clock: () => new Date(Date.parse(NOW) + 601_000) })
    const response = await next.fetch(internalRequest())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret-upstream')
    await next.fetch(internalRequest())
    expect(provider.research).toHaveBeenCalledTimes(2)
  })

  it('limits parallel upstream work, rejects unvalidated output, and preserves unsupported scope', async () => {
    const state = memoryState()
    let release
    const gate = new Promise(resolve => { release = resolve })
    const provider = { research: vi.fn(async () => { await gate; return {} }) }
    const service = new FundCoordinator(state, {}, { provider, clock: () => new Date(NOW) })
    const pending = ['510300', '510500', '159915', '159919'].map(code => service.fetch(internalRequest({ ...QUERY, funds: [code] })))
    expect((await service.fetch(internalRequest({ ...QUERY, funds: ['510050'] }))).status).toBe(429)
    release()
    expect((await Promise.all(pending)).every(r => r.status === 503)).toBe(true)
    const unsupported = new FundCoordinator(memoryState(), {}, {
      clock: () => new Date(NOW), provider: { research: async () => { throw serviceError('FUND_TYPE_UNSUPPORTED') } }
    })
    expect((await unsupported.fetch(internalRequest())).status).toBe(422)
  })
})

describe('desktop without a data key', () => {
  it('validates the wire response, keeps original dates, and accepts partial evidence limitations', async () => {
    const provider = createHostedFundProvider({ clock: () => new Date(NOW), fetch: async () => Response.json(normalized()) })
    const result = await createFundResearchTool(provider).execute(QUERY, {})
    expect(result.received_at).toBe(NOW)
    expect(result.raw_hash).toBe('a'.repeat(64))
    expect(result.limitations[0].code).toBe('unsupported_metric')
  })
  it.each([[429, 'FUND_SERVICE_BUSY'], [503, 'FUND_SERVICE_UNAVAILABLE'], [422, 'FUND_TYPE_UNSUPPORTED']])('returns an actionable safe error for status %s', async (status, code) => {
    const provider = createHostedFundProvider({ fetch: async () => new Response('Bearer secret-from-server', { status }) })
    await expect(createFundResearchTool(provider).execute(QUERY, {})).rejects.toMatchObject({ code })
  })
  it('rejects stale or unrelated data and oversized responses', async () => {
    for (const value of [normalized({ ...QUERY, funds: ['510500'] }), { ...normalized(), received_at: '2025-01-01' }, { ...normalized(), subjects: [{ ...normalized().subjects[0], fund_name: '盈米秘密' }] }]) {
      const provider = createHostedFundProvider({ clock: () => new Date(NOW), fetch: async () => Response.json(value) })
      await expect(provider.research(QUERY)).rejects.toBeTruthy()
    }
    const provider = createHostedFundProvider({ fetch: async () => new Response('x'.repeat(65537), { headers: { 'content-type': 'application/json' } }) })
    await expect(provider.research(QUERY)).rejects.toBeTruthy()
  })
  it('bounds hung transports and response bodies, supports cancellation, and never retries automatically', async () => {
    const fetch = vi.fn(() => new Promise(() => {}))
    await expect(createHostedFundProvider({ fetch, timeoutMs: 10 }).research(QUERY)).rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const controller = new AbortController()
    const pending = createHostedFundProvider({ fetch }).research(QUERY, { signal: controller.signal })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'FUND_RESEARCH_CANCELLED' })
    const streaming = createHostedFundProvider({ timeoutMs: 10, fetch: async () => new Response(new ReadableStream(), { headers: { 'content-type': 'application/json' } }) })
    await expect(streaming.research(QUERY)).rejects.toMatchObject({ code: 'FUND_DATA_UNAVAILABLE' })
  })
  it('runs the entire desktop → public boundary → durable coordinator flow with account authentication', async () => {
    const coordinator = new FundCoordinator(memoryState(), {}, { provider: { research: async q => normalized(q) }, clock: () => new Date(NOW) })
    const env = bindings(coordinator)
    const desktop = createHostedFundProvider({ clock: () => new Date(NOW), fetch: (url, init) => {
      expect(init.headers).not.toHaveProperty('authorization')
      return handleRequest(new Request(url, { ...init, headers: { ...init.headers, 'cf-connecting-ip': '192.0.2.2', authorization: `Bearer ${'a'.repeat(64)}` } }), env)
    } })
    expect((await createFundResearchTool(desktop).execute(QUERY, {})).subjects[0].fund_code).toBe('510300')
  })
})
