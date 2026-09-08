import { createFinancialRouter } from './financial/router.js'
import { retainProvenance, expireProvenance } from './financial/provenance.js'
import { projectLegacyOperation } from './financial/projection.js'
import { validateFinancialResult } from '../../packages/dsh-fund-research-runtime/financial-contract.js'
import { createYingmiResearchProvider } from '../../packages/dsh-fund-research-runtime/yingmi-research-provider.js'
import { isOperationQuery, researchHash, validateOperationResult } from '../../packages/dsh-fund-research-runtime/research-operations.js'
import { createYingmiFundProvider } from '../../packages/dsh-fund-research-runtime/yingmi-provider.js'
import { hashPayload, isNormalizedResearchResult } from '../../packages/dsh-fund-research-runtime/contract.js'
import { failure, json, parseQuery } from './http.js'

function boundedSetting(value, fallback, max) {
  const number = Number(value ?? fallback)
  return Number.isInteger(number) && number > 0 && number <= max ? number : fallback
}

export class FundCoordinator {
  constructor(state, env, { provider, operationProvider, financialRouter, clock = () => new Date() } = {}) {
    this.state = state
    this.env = env
    this.clock = clock
    this.financialRouter = financialRouter ?? createFinancialRouter({ env, clock })
    this.inflight = new Map()
    this.dailyLimit = boundedSetting(env.DAILY_RESEARCH_LIMIT, 1000, 100000)
    this.cacheMs = boundedSetting(env.CACHE_TTL_SECONDS, 600, 600) * 1000
    const providerOptions = {
      resolveCredential: async () => env.YINGMI_API_KEY, clock,
      // Workers does not implement redirect:error. Manual mode never follows a redirect;
      // the existing MCP transport rejects every non-2xx response before parsing it.
      fetch: (url, init) => fetch(url, { ...init, redirect: 'manual' }),
      timeoutMs: 60_000, requestTimeoutMs: 15_000
    }
    this.provider = provider ?? createYingmiFundProvider(providerOptions)
    this.operationProvider = operationProvider ?? createYingmiResearchProvider(providerOptions)
  }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/query') return failure(404, 'NOT_FOUND')
    let query
    try { query = await parseQuery(request) } catch { return failure(400, 'INVALID_REQUEST') }
    const key = `${['execute','financial'].includes(query.operation) ? 'transient' : 'cache'}:${isOperationQuery(query) ? researchHash(query) : hashPayload(query)}`
    // Install the promise before the first storage await; identical requests share one lookup.
    if (!this.inflight.has(key)) {
      if (this.inflight.size >= 4) return failure(429, 'FUND_SERVICE_BUSY', 10)
      const pending = this.lookup(key, query).catch(() => ({ status: 503, code: 'FUND_SERVICE_UNAVAILABLE' }))
        .finally(() => this.inflight.delete(key))
      this.inflight.set(key, pending)
    }
    const result = await this.inflight.get(key)
    return result.value ? json(result.value) : failure(result.status, result.code, result.retryAfter ?? 60)
  }

  async lookup(key, query) {
    const now = this.clock().valueOf()
    // Generic analysis can contain user-supplied amounts or weights. Never persist its input or result.
    const financial = query.operation === 'financial'
    const persist = !isOperationQuery(query) && !financial
    const cached = persist ? await this.state.storage.get(key) : undefined
    if (cached?.expiresAt > now) return { value: cached.value }
    const cooldown = financial ? undefined : await this.state.storage.get('cooldown')
    if (cooldown > now) return { status: 503, code: 'FUND_SERVICE_UNAVAILABLE', retryAfter: 30 }
    // One persistent global budget, so changing edge locations or restarting the object cannot reset it.
    const day = this.clock().toISOString().slice(0, 10)
    const allowed = await this.state.storage.transaction(async (txn) => {
      const previous = await txn.get('budget')
      const count = previous?.day === day ? previous.count : 0
      if (count >= this.dailyLimit) return false
      await txn.put('budget', { day, count: count + 1 })
      return true
    })
    if (!allowed) return { status: 429, code: 'FUND_SERVICE_BUSY', retryAfter: 3600 }
    try {
      if (financial) {
        const { value, provenance } = await this.financialRouter.query(query)
        validateFinancialResult(value, query, this.clock)
        // Opaque evidence references retain server-only provenance; never persist quotes or user arguments.
        await retainProvenance(this.state.storage, provenance, this.clock().valueOf())
        return { value }
      }
      let value = isOperationQuery(query)
        ? await this.operationProvider.researchOperation(query) : await this.provider.research(query)
      if (isOperationQuery(query)) {
        validateOperationResult(value, query, this.clock)
        value = projectLegacyOperation(value)
        validateOperationResult(value, query, this.clock)
      }
      else if (!isNormalizedResearchResult(value)) throw new Error('Invalid provider result.')
      // Cache only validated successful/partial evidence; failures never masquerade as unchanged data.
      if (persist) await this.state.storage.put(key, { expiresAt: this.clock().valueOf() + this.cacheMs, value })
      // Bound each storage page: responses can be 64 KiB and must not all enter memory at once.
      let cursor
      while (true) {
        const page = await this.state.storage.list({ prefix: 'cache:', limit: 64,
          ...(cursor ? { startAfter: cursor } : {}) })
        const expired = [...page].filter(([, entry]) => entry.expiresAt <= now).map(([name]) => name)
        if (expired.length) await this.state.storage.delete(expired)
        if (page.size < 64) break
        cursor = [...page.keys()].at(-1)
      }
      return { value }
    } catch (error) {
      const operationErrors = { RESEARCH_ARGUMENTS_INVALID: 400, RESEARCH_SCHEMA_CHANGED: 409,
        RESEARCH_RESULT_TOO_LARGE: 413, RESEARCH_SCHEMA_UNSUPPORTED: 422, RESEARCH_CAPABILITY_UNAVAILABLE: 424, RESEARCH_QUERY_FAILED: 502 }
      if (Object.hasOwn(operationErrors, error?.code)) return { status: operationErrors[error.code], code: error.code }
      if (error?.code === 'FUND_TYPE_UNSUPPORTED') return { status: 422, code: 'FUND_TYPE_UNSUPPORTED' }
      if (!financial) await this.state.storage.put('cooldown', this.clock().valueOf() + 30_000)
      return { status: 503, code: 'FUND_SERVICE_UNAVAILABLE', retryAfter: 30 }
    }
  }

  alarm() { return expireProvenance(this.state.storage, this.clock().valueOf()) }
}
