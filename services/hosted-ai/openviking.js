// OpenViking User keys are the isolation boundary. Agent IDs alone are not access control.
const ORIGIN = 'https://api.vikingdb.cn-beijing.volces.com/openviking'
const sensitive = /(?:sk-[A-Za-z0-9]{16,}|(?:password|api[_ -]?key|access[_ -]?token|密码|密钥|验证码)\s*[:：=]\s*\S{4,}|\b\d{15,19}\b)/iu

export function openVikingKey(env, accountId) {
  if (env.ARK_ENABLE_OPENVIKING !== 'true' || !env.OPENVIKING_USER_KEYS) return
  try {
    const map = JSON.parse(env.OPENVIKING_USER_KEYS)
    if (!Object.hasOwn(map, accountId)) return
    const key = map[accountId]
    if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key) || Object.values(map).filter(value => value === key).length !== 1) return
    return key
  } catch { return undefined }
}

export async function vikingMemory(send, request, key, accountId, input, readJson) {
  const query = typeof input?.query === 'string' ? input.query.trim() : ''
  if (!query || query.length > 1200 || sensitive.test(query)) return { memories: [] }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(3500)])
  const requestHeaders = { 'content-type': 'application/json', authorization: 'Bearer ' + key,
    'X-OpenViking-Agent': 'ework-' + accountId }
  const post = async (path, value) => {
    const response = await send(ORIGIN + path, { method: 'POST', redirect: 'manual', signal, headers: requestHeaders, body: JSON.stringify(value) })
    if (!response.ok) { await response.body?.cancel(); throw Error('OpenViking unavailable') }
    const result = await readJson(response, 128_000)
    if (result?.status !== 'ok' || !result.result) throw Error('OpenViking unavailable')
    return result.result
  }
  if (input.remember === true) {
    // Only an explicit standalone memory request; no previous turns or assistant messages.
    const text = query.match(/^(?:(?:请|帮我|请帮我)?记住|remember(?: that)?)\s*[:：,，]?\s*(.{4,500})$/iu)?.[1]
    if (!text || sensitive.test(text)) return { memories: [] }
    const session = await post('/api/v1/sessions', {})
    const id = session.session_id
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw Error('OpenViking unavailable')
    await post('/api/v1/sessions/' + id + '/messages', { role: 'user', parts: [{ type: 'text', text }] })
    await post('/api/v1/sessions/' + id + '/commit', { telemetry: false })
    return { memories: [] }
  }
  const result = await post('/api/v1/search/find', { query, context_type: 'memory', limit: 4, level: 2, read_content: false })
  return { memories: (Array.isArray(result.memories) ? result.memories : []).slice(0,4)
    .filter(item => item?.context_type === 'memory' && Number.isFinite(item.score) && item.score >= .6 && typeof item.abstract === 'string')
    .map(item => item.abstract.trim().slice(0, 320))
    .filter(text => text && !sensitive.test(text)) }
}
