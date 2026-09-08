import { validateFinancialQuery, validateFinancialResult } from './financial-contract.js'
import { validateServiceQuery, isOperationQuery, validateOperationResult } from './research-operations.js'
import {
  cancelledError, normalizeResearchResult, toPublicFundResearchError,
  unavailableError, validateResearchRequest, serviceError
} from './contract.js'

export const FUND_SERVICE_ORIGIN = 'https://updates.evanarts.com'
export const FUND_SERVICE_PATH = '/v1/fund-research/query'
const MAX_RESPONSE_BYTES = 64 * 1024

export function createHostedFundProvider({
  endpoint = FUND_SERVICE_ORIGIN,
  fetch: request = globalThis.fetch,
  timeoutMs = 70_000,
  bridge = process.env.SHERLOCK_ACCOUNT_BRIDGE ? JSON.parse(process.env.SHERLOCK_ACCOUNT_BRIDGE) : undefined,
  clock = () => new Date()
} = {}) {
  if (bridge) {
    const local = new URL(bridge.url)
    if (local.protocol !== 'http:' || local.hostname !== '127.0.0.1' || local.pathname !== '/fund-research' || local.username || local.password || local.search || local.hash || !/^[a-f0-9]{64}$/.test(bridge.token)) throw new TypeError('Invalid account bridge')
  }
  const origin = new URL(endpoint)
  const local = origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  if ((!local && origin.protocol !== 'https:') || origin.pathname !== '/' ||
      origin.username || origin.password || origin.search || origin.hash) {
    throw new TypeError('Invalid fund service origin.')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new TypeError('Invalid fund service timeout.')
  }
  async function send(input, { signal } = {}) {
      const query = validateServiceQuery(input)
      if (signal?.aborted) throw cancelledError()
      const controller = new AbortController()
      const abort = () => controller.abort()
      signal?.addEventListener('abort', abort, { once: true })
      let rejectStopped
      const stopped = new Promise((_, reject) => { rejectStopped = reject })
      const onStop = () => rejectStopped(signal?.aborted ? cancelledError() : unavailableError())
      controller.signal.addEventListener('abort', onStop, { once: true })
      const timer = setTimeout(abort, timeoutMs)
      let reader
      const run = (operation) => Promise.race([Promise.resolve().then(operation), stopped])
      try {
        const response = await run(() => request(bridge?.url ?? `${origin.origin}${FUND_SERVICE_PATH}`, {
          method: 'POST', redirect: 'error', cache: 'no-store', signal: controller.signal,
          headers: { 'content-type': 'application/json', accept: 'application/json', ...(bridge ? { authorization: `Bearer ${bridge.token}` } : {}) },
          body: JSON.stringify(query)
        }))
        if (response.status === 401) throw serviceError('LOGIN_REQUIRED')
        if (response.status === 429) throw serviceError('FUND_SERVICE_BUSY')
        if (response.status === 503) throw serviceError('FUND_SERVICE_UNAVAILABLE')
        if (isOperationQuery(query) || query.operation === 'financial') {
          const codes = { 400: 'RESEARCH_ARGUMENTS_INVALID', 409: 'RESEARCH_SCHEMA_CHANGED',
            413: 'RESEARCH_RESULT_TOO_LARGE', 422: 'RESEARCH_SCHEMA_UNSUPPORTED', 424: 'RESEARCH_CAPABILITY_UNAVAILABLE', 502: 'RESEARCH_QUERY_FAILED' }
          if (codes[response.status]) throw serviceError(codes[response.status])
        }
        if (response.status === 422) throw serviceError('FUND_TYPE_UNSUPPORTED')
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
          throw unavailableError()
        }
        const size = response.headers.get('content-length')
        if (size !== null && (!/^\d+$/u.test(size) || Number(size) > MAX_RESPONSE_BYTES)) throw unavailableError()
        reader = response.body?.getReader()
        if (!reader) throw unavailableError()
        const chunks = []
        let bytes = 0
        while (true) {
          const { value, done } = await run(() => reader.read())
          if (done) break
          bytes += value.byteLength
          if (bytes > MAX_RESPONSE_BYTES) throw unavailableError()
          chunks.push(Buffer.from(value))
        }
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        if (query.operation === 'financial') return validateFinancialResult(value, query, clock)
        if (isOperationQuery(query)) return validateOperationResult(value, query, clock)
        const received = Date.parse(value.received_at)
        const age = clock().valueOf() - received
        if (!Number.isFinite(received) || age < -60_000 || age > 15 * 60_000 ||
            !/^[a-f0-9]{64}$/u.test(value.raw_hash)) throw unavailableError()
        // Revalidate the wire result and preserve the original evidence receipt time/hash.
        return normalizeResearchResult({
          ...value,
          evidence: value.evidence?.map(({ label: _label, ...entry }) => entry),
          claims: value.claims?.map(({ text: _text, ...entry }) => entry),
          limitations: value.limitations?.map((item) => item.code)
        }, {
          request: query, receivedAt: value.received_at, rawHash: value.raw_hash,
          privateTerms: ['yingmi', '盈米', 'BatchGetFundsDetail', 'BatchGetFundNavHistory']
        })
      } catch (error) {
        throw toPublicFundResearchError(error, signal)
      } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', abort)
        controller.signal.removeEventListener('abort', onStop)
        if (reader) void reader.cancel().catch(() => {})
        controller.abort()
      }
  }
  return Object.freeze({
    financial(input, options) { return send(validateFinancialQuery(input), options) },
    research(input, options) { return send(validateResearchRequest(input), options) },
    researchOperation(input, options) {
      const query = validateServiceQuery(input)
      if (!isOperationQuery(query)) throw serviceError('RESEARCH_ARGUMENTS_INVALID')
      return send(query, options)
    }
  })
}
