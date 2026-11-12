import { authenticate, authError } from '../accounts/auth.js'
import catalog from '../../config/datayes-builtin-tools.json' with { type: 'json' }
import { officialDatayesRoute, officialDatayesResult } from './datayes-official.js'
import { boundedText, readRpc } from './mcp-wire.js'

export const DATAYES_PATH = '/v1/datayes/mcp'
const TOOL_NAMES = new Set(catalog.map(tool => tool.name))
const REQUEST_BYTES = 256 * 1024
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers
} })
const failure = (status, code) => json({ error: { code } }, status,
  [429, 503].includes(status) ? { 'retry-after': '60' } : {})

async function upstreamRpc(env, method, params, id, session, signal, endpoint) {
  let response
  try { response = await (env.fetch ?? fetch)(endpoint, {
    method: 'POST', redirect: 'manual', signal,
    headers: { authorization: `Bearer ${env.DATAYES_MCP_API_KEY.trim()}`,
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-03-26', ...(session ? { 'mcp-session-id': session } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params })
  }) } catch (error) {
    const message = String(error?.message ?? '')
    throw Object.assign(new Error('Upstream fetch failed'), { failureKind:
      error?.name === 'AbortError' ? 'timeout' : /redirect/i.test(message) ? 'redirect' : /ssl|tls|certificate/i.test(message) ? 'tls' : /different request|global scope/i.test(message) ? 'request-context' : 'network' })
  }
  if (!response.ok) { await response.body?.cancel(); throw Object.assign(new Error('Upstream unavailable'), { upstreamStatus: response.status }) }
  const sessionId = response.headers.get('mcp-session-id')
  if (sessionId && sessionId.length > 512) { await response.body?.cancel(); throw new Error('Invalid session') }
  if (id === undefined) { await response.body?.cancel(); return { session: sessionId ?? session } }
  try { return { reply: await readRpc(response, id, signal), session: sessionId ?? session } }
  catch (error) { throw Object.assign(new Error('Upstream response failed'), { failureKind: error?.name === 'SyntaxError' ? 'invalid-json' : signal.aborted ? 'timeout' : 'invalid-rpc' }) }
}

export async function handleDatayesMcp(request, env) {
  if (request.method !== 'POST') return failure(405, 'METHOD_NOT_ALLOWED')
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return failure(415, 'INVALID_CONTENT_TYPE')
  if (!env.ACCOUNTS_DB || !env.DATAYES_REQUEST_LIMITER || !env.DATAYES_MCP_API_KEY?.trim()) return failure(503, 'DATAYES_SERVICE_UNAVAILABLE')
  let user
  try { user = await authenticate(request, env) } catch { return failure(503, 'ACCOUNT_SERVICE_UNAVAILABLE') }
  if (!user) return authError('LOGIN_REQUIRED')
  const ip = request.headers.get('cf-connecting-ip')
  if (!ip) return failure(503, 'DATAYES_SERVICE_UNAVAILABLE')
  let rpc
  try {
    const { success } = await env.DATAYES_REQUEST_LIMITER.limit({ key: `${user.id}:${ip}` })
    if (!success) return failure(429, 'DATAYES_SERVICE_BUSY')
    const size = request.headers.get('content-length')
    if (size !== null && (!/^\d+$/.test(size) || Number(size) > REQUEST_BYTES)) return failure(400, 'INVALID_REQUEST')
    rpc = JSON.parse(await boundedText(request.body, REQUEST_BYTES, AbortSignal.timeout(5000)))
  } catch { return failure(400, 'INVALID_REQUEST') }
  if (!rpc || rpc.jsonrpc !== '2.0' || Array.isArray(rpc) || !['initialize', 'notifications/initialized', 'ping', 'tools/list', 'tools/call'].includes(rpc.method)
      || (rpc.id !== undefined && !['number', 'string'].includes(typeof rpc.id))) return failure(400, 'INVALID_REQUEST')
  if (rpc.method === 'notifications/initialized') return new Response(null, { status: 202, headers: { 'cache-control': 'no-store' } })
  if (rpc.id === undefined) return failure(400, 'INVALID_REQUEST')
  if (rpc.method === 'tools/call' && (!TOOL_NAMES.has(rpc.params?.name) || !rpc.params?.arguments || typeof rpc.params.arguments !== 'object' || Array.isArray(rpc.params.arguments))) return failure(400, 'INVALID_REQUEST')
  if (rpc.method === 'tools/list' && rpc.params?.cursor) return failure(400, 'INVALID_REQUEST')
  if (rpc.method === 'initialize') return json({ jsonrpc: '2.0', id: rpc.id, result: {
    protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'EWork DataYes', version: '1.0.0' }
  } })
  if (rpc.method === 'tools/list') return json({jsonrpc:'2.0',id:rpc.id,result:{tools:catalog}})
  if (rpc.method === 'ping') return json({ jsonrpc: '2.0', id: rpc.id, result: {} })
  let usageId
  let stage = 'usage'
  let status = 503
  try {
    if (rpc.method === 'tools/call') {
      usageId = crypto.randomUUID()
      await env.ACCOUNTS_DB.prepare('INSERT INTO usage_events(id,user_id,capability,started_at) VALUES(?,?,?,?)').bind(usageId, user.id, 'datayes-mcp', Math.floor(Date.now()/1000)).run()
    }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)])
    const route = officialDatayesRoute(rpc)
    if (route?.result) {
      status = 200
      return json({ jsonrpc: '2.0', id: rpc.id, result: route.result })
    }
    const endpoint = route?.endpoint
    if(!endpoint)throw new Error('Unsupported official MCP route')
    stage = 'initialize'
    const initialization = await upstreamRpc(env, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'EWork', version: '1.1.1' } }, 1, undefined, signal, endpoint)
    if (initialization.reply.error) throw new Error('Initialization failed')
    stage = 'initialized'
    await upstreamRpc(env, 'notifications/initialized', {}, undefined, initialization.session, signal, endpoint)
    stage = rpc.method
    const { reply } = await upstreamRpc(env, rpc.method, route?.params ?? (rpc.method === 'tools/call' ? { name: rpc.params.name, arguments: rpc.params.arguments } : {}), 2, initialization.session, signal, endpoint)
    if (reply.result && route) reply.result = officialDatayesResult(reply.result, route)
    if (rpc.method === 'tools/list' && reply.result) {
      if (!Array.isArray(reply.result.tools)) throw new Error('Invalid tool list')
      reply.result = { tools: reply.result.tools.filter(tool => TOOL_NAMES.has(tool.name)) }
    }
    // Only the RPC payload leaves the gateway. Upstream headers and session remain private.
    const safe = JSON.parse(JSON.stringify({ ...reply, id: rpc.id }).replaceAll(env.DATAYES_MCP_API_KEY.trim(), '[redacted]'))
    status = 200
    return json(safe)
  } catch (error) {
    const upstreamStatus = Number.isInteger(error?.upstreamStatus) ? error.upstreamStatus : null
    const kind = error?.failureKind ?? (upstreamStatus ? 'http' : 'rpc')
    console.warn('datayes-unavailable', { stage, httpStatus: upstreamStatus, errorType: kind })
    return json({ error: { code: 'DATAYES_SERVICE_UNAVAILABLE' } }, 503, {
      'retry-after': '60', 'x-ework-datayes-stage': stage, 'x-ework-datayes-error': kind,
      ...(upstreamStatus ? { 'x-ework-datayes-status': String(upstreamStatus) } : {})
    })
  }
  finally {
    if (usageId) {
      try { await env.ACCOUNTS_DB.prepare('UPDATE usage_events SET status=?,completed_at=? WHERE id=?').bind(status, Math.floor(Date.now()/1000), usageId).run() } catch { /* Usage bookkeeping does not expose upstream errors. */ }
    }
  }
}
