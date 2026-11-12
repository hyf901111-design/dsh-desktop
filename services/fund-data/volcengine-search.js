import { authenticate, authError } from '../accounts/auth.js'
import dataproTools from '../../config/datapro-builtin-tools.json' with { type: 'json' }
import { boundedText, readRpc } from './mcp-wire.js'

export const DATAPRO_PATH = '/v1/datapro/mcp'
export const DOUBAO_SEARCH_PATH = '/v1/doubao/search'

const DATAPRO_URL = 'https://datapro.hqd.cn-beijing.volces.com/mcp'
const DOUBAO_URL = 'https://open.feedcoopapi.com/search_api/web_search'
const PROTOCOL_VERSION = '2025-03-26'
const DATA_TOOL = dataproTools[0].name

function json(value, status = 200, headers = {}) {
  return Response.json(value, { status, headers: {
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers
  } })
}

function failure(status, code, retryAfter) {
  return json({ error: { code } }, status, retryAfter ? { 'retry-after': String(retryAfter) } : {})
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

async function authorizedRequest(request, env, service) {
  if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED')
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return failure(415, 'INVALID_CONTENT_TYPE')
  if (!env.ACCOUNTS_DB || !env.VOLCENGINE_REQUEST_LIMITER || !env.VOLCENGINE_AGENT_PLAN_KEY?.trim()) {
    return failure(503, 'VOLCENGINE_SERVICE_UNAVAILABLE', 60)
  }
  try {
    const user = await authenticate(request, env)
    if (!user) return authError('LOGIN_REQUIRED')
    const { success } = await env.VOLCENGINE_REQUEST_LIMITER.limit({ key: `${service}:${user.id}` })
    return success ? user : failure(429, 'VOLCENGINE_RATE_LIMITED', 60)
  } catch {
    return failure(503, 'VOLCENGINE_SERVICE_UNAVAILABLE', 60)
  }
}

async function requestBody(request, limit) {
  try {
    return JSON.parse(await boundedText(request.body, limit, AbortSignal.any([request.signal, AbortSignal.timeout(5000)])))
  } catch {
    return null
  }
}

async function withUsage(env, user, capability, run) {
  const id = crypto.randomUUID()
  const now = () => Math.floor(Date.now() / 1000)
  try {
    await env.ACCOUNTS_DB.prepare('INSERT INTO usage_events(id,user_id,capability,started_at) VALUES(?,?,?,?)')
      .bind(id, user.id, capability, now()).run()
  } catch {
    return failure(503, 'VOLCENGINE_SERVICE_UNAVAILABLE', 60)
  }
  let response
  try {
    response = await run(env.VOLCENGINE_AGENT_PLAN_KEY.trim())
  } catch (error) {
    const upstreamStatus = Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : null
    console.warn('volcengine-upstream-failed', { capability, upstreamStatus, kind: error?.failureKind ?? 'response' })
    response = upstreamStatus === 429
      ? failure(429, 'VOLCENGINE_UPSTREAM_RATE_LIMITED', 60)
      : failure(502, 'VOLCENGINE_UPSTREAM_UNAVAILABLE')
  }
  try {
    await env.ACCOUNTS_DB.prepare('UPDATE usage_events SET status=?,completed_at=? WHERE id=?').bind(response.status, now(), id).run()
  } catch { /* The initial usage record remains available. */ }
  return response
}

async function postUpstream(env, url, headers, body, signal) {
  const options = {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    // Workers requires manual mode to reject a redirect without forwarding auth headers.
    body: JSON.stringify(body), signal, redirect: 'manual'
  }
  let response
  try {
    response = env.fetch ? await env.fetch(url, options) : await fetch(url, options)
  } catch (error) {
    const message = String(error?.message ?? '')
    const failureKind = signal.aborted ? 'aborted' : /invocation|global scope|request context/i.test(message) ? 'worker-fetch'
      : /tls|ssl|certificate/i.test(message) ? 'tls' : /redirect/i.test(message) ? 'redirect' : 'network'
    throw Object.assign(new Error('Upstream connection failed'), { failureKind })
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw Object.assign(new Error('Upstream request failed'), { upstreamStatus: response.status, failureKind: 'http' })
  }
  return response
}

function searchText(value, length) {
  return typeof value === 'string' ? value.trim().slice(0, length) : ''
}

function searchSources(rows, count, key) {
  const urls = new Set()
  const sources = []
  for (const row of rows) {
    if (sources.length >= count) break
    if (typeof row?.Url !== 'string' || row.Url.length > 4096 || row.Url.includes(key) || !URL.canParse(row.Url)) continue
    const url = new URL(row.Url)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || urls.has(url.href)) continue
    urls.add(url.href)
    const clean = value => typeof value === 'string' ? value.replaceAll(key, '[redacted]') : value
    const title = searchText(clean(row.Title), 300)
    const snippet = searchText(clean(row.Snippet || row.Summary), 1200)
    const siteName = searchText(clean(row.SiteName), 160)
    const time = searchText(clean(row.PublishTime), 64)
    const publishedAt = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/u.test(time) && Number.isFinite(Date.parse(time)) ? time : ''
    sources.push({ url: url.href, ...(title ? { title } : {}), ...(snippet ? { snippet } : {}),
      ...(siteName ? { siteName } : {}), ...(publishedAt ? { publishedAt } : {}) })
  }
  return sources
}

export async function handleDoubaoSearch(request, env) {
  const user = await authorizedRequest(request, env, 'doubao')
  if (user instanceof Response) return user
  const input = await requestBody(request, 4096)
  const query = typeof input?.query === 'string' ? input.query.trim() : ''
  const count = input?.maxResults ?? 5
  if (!query || Array.from(query).length > 100 || !Number.isInteger(count) || count < 1 || count > 8) {
    return failure(400, 'INVALID_SEARCH_QUERY')
  }
  return withUsage(env, user, 'doubao-search', async key => {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(20000)])
    const upstream = await postUpstream(env, DOUBAO_URL, { authorization: `Bearer ${key}` }, {
      Query: query, SearchType: 'web', Count: count, Filter: { NeedUrl: true }, QueryControl: { QueryRewrite: false }
    }, signal)
    const result = JSON.parse(await boundedText(upstream.body, 2 * 1024 * 1024, signal))
    if (result.ResponseMetadata?.Error || !Array.isArray(result.Result?.WebResults)) throw new Error('Invalid search result')
    const sources = searchSources(result.Result.WebResults, count, key)
    return json({ provider: 'doubao', sources, truncated: false, ...(!sources.length ? { status: 'no_results' } : {}) })
  })
}

async function dataproRpc(env, key, rpc, signal, version = PROTOCOL_VERSION, session) {
  const response = await postUpstream(env, DATAPRO_URL, {
    'X-Agent-Plan-Key': key,
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': version,
    ...(session ? { 'mcp-session-id': session } : {})
  }, { jsonrpc: '2.0', ...rpc }, signal)
  if (rpc.id === undefined) {
    await response.body?.cancel()
    return {}
  }
  const nextSession = response.headers.get('mcp-session-id')
  if (nextSession && !/^[!-~]{1,512}$/.test(nextSession)) {
    await response.body?.cancel()
    throw new Error('Invalid MCP session')
  }
  return { reply: await readRpc(response, rpc.id, signal), session: nextSession }
}

export async function handleDataproMcp(request, env) {
  const user = await authorizedRequest(request, env, 'datapro')
  if (user instanceof Response) return user
  const rpc = await requestBody(request, 256 * 1024)
  if (!isRecord(rpc) || rpc.jsonrpc !== '2.0') return failure(400, 'INVALID_REQUEST')
  if (rpc.method === 'notifications/initialized' && rpc.id === undefined) {
    return new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } })
  }
  if (!(typeof rpc.id === 'string' && rpc.id.length <= 128) && !Number.isSafeInteger(rpc.id)) {
    return failure(400, 'INVALID_REQUEST')
  }
  const respond = result => json({ jsonrpc: '2.0', id: rpc.id, result })
  if (rpc.method === 'initialize') return respond({
    protocolVersion: PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: 'EWork 火山方舟专业数据集', version: '1.0.0' }
  })
  if (rpc.method === 'ping') return respond({})
  if (rpc.method === 'tools/list' && !rpc.params?.cursor) return respond({ tools: dataproTools })
  if (rpc.method !== 'tools/call' || rpc.params?.name !== DATA_TOOL) return failure(400, 'INVALID_REQUEST')
  const query = typeof rpc.params.arguments?.query === 'string' ? rpc.params.arguments.query.trim() : ''
  if (!query || query.length > 20000) return failure(400, 'INVALID_DATA_QUERY')
  return withUsage(env, user, 'datapro-mcp', async key => {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45000)])
    const init = await dataproRpc(env, key, { id: 1, method: 'initialize', params: {
      protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'EWork', version: '1.0.0' }
    } }, signal)
    const version = init.reply?.result?.protocolVersion
    if (typeof version !== 'string' || !/^20\d\d-\d\d-\d\d$/.test(version)) throw new Error('Invalid MCP version')
    await dataproRpc(env, key, { method: 'notifications/initialized' }, signal, version, init.session)
    const { reply, session } = await dataproRpc(env, key, {
      id: 2, method: 'tools/call', params: { name: DATA_TOOL, arguments: { query } }
    }, signal, version, init.session)
    if (!isRecord(reply?.result)) throw new Error('Invalid MCP result')
    let payload = JSON.stringify(reply.result)
    for (const secret of new Set([key, init.session, session].filter(Boolean))) {
      payload = payload.replaceAll(JSON.stringify(secret).slice(1, -1), '[redacted]')
    }
    return respond(JSON.parse(payload))
  })
}
