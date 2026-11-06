import { authenticate, authError, handleAccountRequest } from '../accounts/auth.js'
import { validateServiceQuery, RESEARCH_REQUEST_BYTES } from '../../packages/dsh-fund-research-runtime/research-operations.js'
import { DATAYES_PATH, handleDatayesMcp } from './datayes-mcp.js'
import { TUSHARE_PATH, handleTushareMcp } from './tushare-mcp.js'

export const QUERY_PATH = '/v1/fund-research/query'
export const HEALTH_PATH = '/v1/fund-research/health'
export function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers
  } })
}
export function failure(status, code, retryAfter) {
  return json({ error: { code } }, status,
    retryAfter ? { 'retry-after': String(retryAfter) } : {})
}

export async function parseQuery(request) {
  const size = request.headers.get('content-length')
  if (size !== null && (!/^\d+$/u.test(size) || Number(size) > RESEARCH_REQUEST_BYTES)) throw new Error('Invalid body.')
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Missing body.')
  const chunks = []
  let bytes = 0
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Body timed out.')), 5000)
  })
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout])
      if (done) break
      bytes += value.byteLength
      if (bytes > RESEARCH_REQUEST_BYTES) throw new Error('Body too large.')
      chunks.push(Buffer.from(value))
    }
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (!input?.operation && bytes > 2048) throw new Error('Legacy query too large.')
    return validateServiceQuery(input)
  } finally {
    clearTimeout(timer)
    void reader.cancel().catch(() => {})
  }
}

export async function handleRequest(request, env) {
  const url = new URL(request.url)
  if (!url.search && url.pathname.startsWith('/v1/account/')) return handleAccountRequest(request, env)
  if (!url.search && url.pathname === TUSHARE_PATH) return handleTushareMcp(request, env)
  if (!url.search && url.pathname === DATAYES_PATH) return handleDatayesMcp(request, env)
  if (url.search || ![QUERY_PATH, HEALTH_PATH].includes(url.pathname)) return failure(404, 'NOT_FOUND')
  if (url.pathname === HEALTH_PATH && request.method === 'GET') {
    const ready = Boolean(env.ACCOUNTS_DB && (env.TUSHARE_TOKEN?.trim() || env.YINGMI_API_KEY?.trim() || env.TONGHUASHUN_API_KEY?.trim()) && env.FUND_REQUEST_LIMITER && env.FUND_COORDINATOR)
    return json({ status: ready ? 'ready' : 'unavailable' }, ready ? 200 : 503)
  }
  if (url.pathname !== QUERY_PATH || request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED')
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    return failure(415, 'INVALID_CONTENT_TYPE')
  }
  if (!env.ACCOUNTS_DB || !(env.TUSHARE_TOKEN?.trim() || env.YINGMI_API_KEY?.trim() || env.TONGHUASHUN_API_KEY?.trim()) || !env.FUND_REQUEST_LIMITER || !env.FUND_COORDINATOR) {
    return failure(503, 'FUND_SERVICE_UNAVAILABLE', 60)
  }
  let user
  try { user = await authenticate(request, env) } catch { return failure(503, 'ACCOUNT_SERVICE_UNAVAILABLE') }
  if (!user) return authError('LOGIN_REQUIRED')
  // CF-Connecting-IP is supplied by Cloudflare, never trust forwarded/client IDs.
  const ip = request.headers.get('cf-connecting-ip')
  if (!ip) return failure(503, 'FUND_SERVICE_UNAVAILABLE', 60)
  try {
    const { success } = await env.FUND_REQUEST_LIMITER.limit({ key: `${user.id}:${ip}` })
    if (!success) return failure(429, 'FUND_SERVICE_BUSY', 60)
    let query
    try { query = await parseQuery(request) } catch { return failure(400, 'INVALID_REQUEST') }
    const coordinator = env.FUND_COORDINATOR.get(env.FUND_COORDINATOR.idFromName('fund-data-v1'))
    // Reconstruct the internal request so user headers, credentials and IP never reach storage/upstream.
    const usageId = crypto.randomUUID()
    await env.ACCOUNTS_DB.prepare('INSERT INTO usage_events(id,user_id,capability,started_at) VALUES(?,?,?,?)').bind(usageId,user.id,'fund-research',Math.floor(Date.now()/1000)).run()
    const response = await coordinator.fetch(new Request('https://fund-internal/query', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query)
    }))
    await env.ACCOUNTS_DB.prepare('UPDATE usage_events SET status=?,completed_at=? WHERE id=?').bind(response.status,Math.floor(Date.now()/1000),usageId).run()
    return response
  } catch {
    return failure(503, 'FUND_SERVICE_UNAVAILABLE', 60)
  }
}
