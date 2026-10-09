import { authenticate, authError } from '../accounts/auth.js'
import catalog from '../../config/datayes-tools.json' with { type: 'json' }

export const DATAYES_PATH = '/v1/datayes/mcp'
const UPSTREAM = 'https://gw.datayes.com/rwtracker/datayes-mcp'
const TOOL_NAMES = new Set(catalog.map(tool => tool.name))
const REQUEST_BYTES = 256 * 1024
const RESPONSE_BYTES = 8 * 1024 * 1024
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: {
  'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers
} })
const failure = (status, code) => json({ error: { code } }, status,
  [429, 503].includes(status) ? { 'retry-after': '60' } : {})

async function boundedText(body, limit, signal) {
  const reader = body?.getReader()
  if (!reader) throw new Error('Missing body')
  const chunks = []
  let size = 0
  let abort
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new Error('Request timed out'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), cancelled])
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('Response too large')
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    return new TextDecoder().decode(bytes)
  } finally {
    signal.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
  }
}

function parseRpc(text, contentType, id) {
  let values
  if (contentType.includes('text/event-stream')) {
    values = text.replace(/\r\n/g, '\n').split('\n\n').flatMap(event => {
      const data = event.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      return data ? [JSON.parse(data)] : []
    })
  } else values = [JSON.parse(text)]
  const reply = values.find(value => value?.jsonrpc === '2.0' && value.id === id && ('result' in value || 'error' in value))
  return reply
}

async function readRpc(response, id, signal) {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('text/event-stream')) {
    const reply = parseRpc(await boundedText(response.body, RESPONSE_BYTES, signal), contentType, id)
    if (!reply) throw new Error('Invalid MCP response')
    return reply
  }
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Missing body')
  const decoder = new TextDecoder()
  let buffer = '', size = 0, abort
  const cancelled = new Promise((_, reject) => {
    abort = () => reject(new Error('Request timed out'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
  try {
    while (true) {
      const { value, done } = await Promise.race([reader.read(), cancelled])
      if (done) throw new Error('Missing RPC result')
      size += value.byteLength
      if (size > RESPONSE_BYTES) throw new Error('Response too large')
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n')
      let boundary
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const reply = parseRpc(event, contentType, id)
        if (reply) return reply
      }
    }
  } finally {
    signal.removeEventListener('abort', abort)
    void reader.cancel().catch(() => {})
  }
}

async function upstreamRpc(env, method, params, id, session, signal) {
  const response = await (env.fetch ?? fetch)(UPSTREAM, {
    method: 'POST', redirect: 'error', signal,
    headers: { authorization: `Bearer ${env.DATAYES_MCP_API_KEY.trim()}`,
      'content-type': 'application/json', accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-03-26', ...(session ? { 'mcp-session-id': session } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params })
  })
  if (!response.ok) { await response.body?.cancel(); throw new Error('Upstream unavailable') }
  const sessionId = response.headers.get('mcp-session-id')
  if (sessionId && sessionId.length > 512) { await response.body?.cancel(); throw new Error('Invalid session') }
  if (id === undefined) { await response.body?.cancel(); return { session: sessionId ?? session } }
  return { reply: await readRpc(response, id, signal), session: sessionId ?? session }
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
  if (rpc.method === 'ping') return json({ jsonrpc: '2.0', id: rpc.id, result: {} })
  let usageId
  let status = 503
  try {
    if (rpc.method === 'tools/call') {
      usageId = crypto.randomUUID()
      await env.ACCOUNTS_DB.prepare('INSERT INTO usage_events(id,user_id,capability,started_at) VALUES(?,?,?,?)').bind(usageId, user.id, 'datayes-mcp', Math.floor(Date.now()/1000)).run()
    }
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(55000)])
    const initialization = await upstreamRpc(env, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'EWork', version: '1.1.1' } }, 1, undefined, signal)
    if (initialization.reply.error) throw new Error('Initialization failed')
    await upstreamRpc(env, 'notifications/initialized', {}, undefined, initialization.session, signal)
    const { reply } = await upstreamRpc(env, rpc.method, rpc.method === 'tools/call' ? { name: rpc.params.name, arguments: rpc.params.arguments } : {}, 2, initialization.session, signal)
    if (rpc.method === 'tools/list' && reply.result) {
      if (!Array.isArray(reply.result.tools)) throw new Error('Invalid tool list')
      reply.result = { tools: reply.result.tools.filter(tool => TOOL_NAMES.has(tool.name)) }
    }
    // Only the RPC payload leaves the gateway. Upstream headers and session remain private.
    const safe = JSON.parse(JSON.stringify({ ...reply, id: rpc.id }).replaceAll(env.DATAYES_MCP_API_KEY.trim(), '[redacted]'))
    status = 200
    return json(safe)
  } catch { return failure(503, 'DATAYES_SERVICE_UNAVAILABLE') }
  finally {
    if (usageId) {
      try { await env.ACCOUNTS_DB.prepare('UPDATE usage_events SET status=?,completed_at=? WHERE id=?').bind(status, Math.floor(Date.now()/1000), usageId).run() } catch { /* Usage bookkeeping does not expose upstream errors. */ }
    }
  }
}
