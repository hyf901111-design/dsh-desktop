import { createYingmiFundProvider } from '../../packages/dsh-fund-research-runtime/yingmi-provider.js'
import { hashPayload, isNormalizedResearchResult } from '../../packages/dsh-fund-research-runtime/contract.js'
import { failure, json, parseQuery } from './http.js'

function boundedSetting(value, fallback, max) {
  const number = Number(value ?? fallback)
  return Number.isInteger(number) && number > 0 && number <= max ? number : fallback
}

export class FundCoordinator {
  constructor(state, env, { provider, clock = () => new Date() } = {}) {
    this.state = state
    this.env = env
    this.clock = clock
    this.inflight = new Map()
    this.dailyLimit = boundedSetting(env.DAILY_RESEARCH_LIMIT, 1000, 100000)
    this.cacheMs = boundedSetting(env.CACHE_TTL_SECONDS, 600, 600) * 1000
    this.provider = provider ?? createYingmiFundProvider({
      resolveCredential: async () => env.YINGMI_API_KEY, clock,
      // Workers does not implement redirect:error. Manual mode never follows a redirect;
      // the existing MCP transport rejects every non-2xx response before parsing it.
      fetch: (url, init) => fetch(url, { ...init, redirect: 'manual' }),
      timeoutMs: 60_000, requestTimeoutMs: 15_000
    })
  }

  async fetch(request) {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/query') return failure(404, 'NOT_FOUND')
    let query
    try { query = await parseQuery(request) } catch { return failure(400, 'INVALID_REQUEST') }
    const key = `cache:${hashPayload(query)}`
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
    const cached = await this.state.storage.get(key)
    if (cached?.expiresAt > now) return { value: cached.value }
    const cooldown = await this.state.storage.get('cooldown')
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
      const value = await this.provider.research(query)
      if (!isNormalizedResearchResult(value)) throw new Error('Invalid provider result.')
      // Cache only validated successful/partial evidence; failures never masquerade as unchanged data.
      await this.state.storage.put(key, { expiresAt: this.clock().valueOf() + this.cacheMs, value })
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
      if (error?.code === 'FUND_TYPE_UNSUPPORTED') return { status: 422, code: 'FUND_TYPE_UNSUPPORTED' }
      await this.state.storage.put('cooldown', this.clock().valueOf() + 30_000)
      return { status: 503, code: 'FUND_SERVICE_UNAVAILABLE', retryAfter: 30 }
    }
  }
}
