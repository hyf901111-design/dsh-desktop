import { financialHash, LIMITATIONS, validateFinancialResult, validDate } from './financial-contract.js'
import { serviceError } from './contract.js'

const day = 86400000

// The hosted v1 envelope fits 35 OHLC bars. Partition by calendar day so a
// source cannot silently lose the first half of a quarter. No public API or
// credential changes are needed, and weekly/monthly bars remain unsplit.
export async function queryFinancialHistory(provider, query, options = {}, clock = () => new Date()) {
  const start = Date.parse(query.start), end = Date.parse(query.end)
  if (query.interval !== '1d' || end - start < 35 * day) {
    return validateFinancialResult(await provider.financial(query, options), query, clock)
  }
  const pages = []
  for (let cursor = start; cursor <= end; cursor += 35 * day) {
    pages.push({ ...query, start: new Date(cursor).toISOString().slice(0, 10),
      end: new Date(Math.min(end, cursor + 34 * day)).toISOString().slice(0, 10) })
  }
  const results = Array(pages.length)
  let next = 0
  const worker = async () => {
    while (next < pages.length) {
      options.signal?.throwIfAborted()
      const i = next++, page = pages[i]
      const result = validateFinancialResult(await provider.financial(page, options), page, clock)
      // A structurally valid response for another range is not evidence for
      // this page. Also reject repeated metric/date rows instead of summing.
      const seen = new Set()
      for (const record of result.records) {
        const key = `${record.instrument}/${record.as_of}/${record.metric}`
        if (!validDate(record.as_of) || record.as_of < page.start || record.as_of > page.end || seen.has(key)) {
          throw serviceError('FINANCIAL_UNAVAILABLE')
        }
        seen.add(key)
      }
      results[i] = result
    }
  }
  const jobs = await Promise.allSettled(Array.from({ length: Math.min(3, pages.length) }, async () => {
    try { await worker() } catch (error) { next = pages.length; throw error }
  }))
  const failed = jobs.find(job => job.status === 'rejected')
  if (failed) throw failed.reason
  options.signal?.throwIfAborted()
  const records = results.flatMap(result => result.records).sort((a, b) => a.as_of.localeCompare(b.as_of))
  const limitations = [...new Set(results.flatMap(result => result.limitations))]
  if (results.some(result => result.status !== 'complete') && !limitations.length) limitations.push(LIMITATIONS.missing)
  const value = {
    schema_version: 'financial-1', request_hash: financialHash(query),
    // Retain the oldest source receipt; merging must not refresh stale evidence.
    received_at: results.map(result => result.received_at).sort()[0],
    status: records.length ? (limitations.length ? 'partial' : 'complete') : 'unavailable',
    records, limitations
  }
  return validateFinancialResult(value, query, clock, { historyAggregate: true })
}
