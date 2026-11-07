import { expect, it, vi } from 'vitest'
import { queryFinancialHistory } from '../packages/dsh-fund-research-runtime/financial-history.js'
import { financialHash, LIMITATIONS, validateFinancialQuery, validateFinancialResult } from '../packages/dsh-fund-research-runtime/financial-contract.js'
import { createFinancialRouter } from '../services/fund-data/financial/router.js'

const clock = () => new Date('2026-11-07T12:00:00Z')
const query = (overrides = {}) => validateFinancialQuery({ operation: 'financial', intent: 'history', asset: 'index', symbols: ['000300.SH'], start: '2026-08-07', end: '2026-11-06', ...overrides })
function source() {
  let active = 0, peak = 0
  const requests = []
  const router = createFinancialRouter({ clock, env: { TUSHARE_TOKEN: 'fixture-only' }, fetchImpl: async (_url, init) => {
    const body = JSON.parse(init.body), p = body.params
    requests.push(p); active++; peak = Math.max(active, peak)
    await new Promise(resolve => setTimeout(resolve, 2)); active--
    const iso = text => `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`
    const items = []
    for (let t = Date.parse(iso(p.start_date)); t <= Date.parse(iso(p.end_date)); t += 86400000) {
      const d = new Date(t)
      if (![0, 6].includes(d.getUTCDay())) items.push([p.ts_code, d.toISOString().slice(0, 10).replaceAll('-', ''), 100, 110, 90, 105])
    }
    return Response.json({ code: 0, data: { fields: ['ts_code', 'trade_date', 'open', 'high', 'low', 'close'], items } })
  } })
  return { requests, peak: () => peak, financial: async (q, options) => (await router.query(q, options)).value }
}

it('returns the whole quarter through the actual 35-bar hosted adapter, with bounded parallel requests', async () => {
  const provider = source(), q = query()
  const result = await queryFinancialHistory(provider, q, {}, clock)
  expect(result).toMatchObject({ status: 'complete', request_hash: financialHash(q), limitations: [] })
  const closes = result.records.filter(r => r.metric === '收盘价')
  expect(closes).toHaveLength(66); expect(closes[0].as_of).toBe(q.start); expect(closes.at(-1).as_of).toBe(q.end)
  expect(provider.requests).toHaveLength(3); expect(provider.peak()).toBe(3)
  expect(new Set(result.records.map(r => r.evidence_id)).size).toBe(result.records.length)
  expect(result.records.every(r => r.unit === '点' && r.price_basis === '1d 不复权')).toBe(true)
})

it('covers one year without widening the public wire budget or altering evidence values', async () => {
  const provider = source(), q = query({ start: '2025-11-06' })
  const result = await queryFinancialHistory(provider, q, {}, clock)
  expect(result.status).toBe('complete'); expect(result.records.length).toBeGreaterThan(1000)
  expect(result.records.every(r => [90, 100, 105, 110].includes(r.value))).toBe(true)
  expect(provider.peak()).toBeLessThanOrEqual(3)
  expect(() => validateFinancialResult(result, q, clock)).toThrow()
  expect(validateFinancialResult(result, q, clock, { historyAggregate: true })).toBe(result)
})

it('does not partition short or weekly requests and preserves reported gaps in aggregate results', async () => {
  const provider = source()
  const short = query({ start: '2026-11-01' })
  await queryFinancialHistory(provider, short, {}, clock)
  expect(provider.requests).toHaveLength(1)
  const response = q => ({ schema_version: 'financial-1', request_hash: financialHash(q), received_at: clock().toISOString(), status: 'unsupported', records: [], limitations: [LIMITATIONS.unsupported] })
  const financial = vi.fn(async q => response(q))
  const weekly = query({ interval: '1w' })
  expect((await queryFinancialHistory({ financial }, weekly, {}, clock)).status).toBe('unsupported')
  expect(financial).toHaveBeenCalledTimes(1)
  const partiallyAvailable = { financial: async (q, options) => q.start === '2026-08-07' ? response(q) : provider.financial(q, options) }
  const partial = await queryFinancialHistory(partiallyAvailable, query(), {}, clock)
  expect(partial.status).toBe('partial'); expect(partial.limitations).toContain(LIMITATIONS.unsupported)
  expect(partial.records[0].as_of).toBe('2026-09-11')
})

it('rejects out-of-range or duplicate rows and honors cancellation before any request', async () => {
  for (const duplicate of [false, true]) {
    const financial = async q => {
      const r = { evidence_id: '0'.repeat(32), instrument: '000300.SH', metric: '收盘价', value: 105, unit: '点', as_of: duplicate ? q.start : '2026-01-01', price_basis: '1d 不复权', quality_state: 'dated' }
      return { schema_version: 'financial-1', request_hash: financialHash(q), received_at: clock().toISOString(), status: 'complete', limitations: [], records: duplicate ? [r, { ...r, evidence_id: '1'.repeat(32) }] : [r] }
    }
    await expect(queryFinancialHistory({ financial }, query(), {}, clock)).rejects.toThrow()
  }
  const financial = vi.fn(), controller = new AbortController(); controller.abort()
  await expect(queryFinancialHistory({ financial }, query(), { signal: controller.signal }, clock)).rejects.toThrow()
  expect(financial).not.toHaveBeenCalled()
})
