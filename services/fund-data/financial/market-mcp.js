const ORIGIN = 'https://fuyao.aicubes.cn'
const MAX_BYTES = 1024 * 1024
const SERVICES = new Set(['a-share', 'fund', 'meta', 'a-share-index'])

export class MarketDataError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MarketDataError'
    this.code = code
  }
}
const fail = (code, message) => new MarketDataError(code, message)

async function readResponse(response, id, signal) {
  const sse = response.headers.get('content-type')?.includes('text/event-stream')
  if (!sse && !response.headers.get('content-type')?.includes('application/json'))
    throw fail('INVALID_RESPONSE', '同花顺返回了无法识别的数据格式。')
  if (Number(response.headers.get('content-length')) > MAX_BYTES)
    throw fail('RESPONSE_TOO_LARGE', '同花顺返回数据过多，请缩小查询范围。')
  const reader = response.body?.getReader()
  if (!reader) throw fail('INVALID_RESPONSE', '同花顺没有返回数据。')
  const decoder = new TextDecoder()
  let text = '', bytes = 0
  const cancel = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener('abort', cancel, { once: true })
  const unpack = (payload) => {
    if (payload.id !== id) throw fail('INVALID_RESPONSE', '同花顺响应与请求不匹配。')
    if (payload.error) throw fail('MCP_ERROR', '同花顺 MCP 请求失败，请检查参数或稍后重试。')
    if (!payload.result) throw fail('INVALID_RESPONSE', '同花顺响应缺少结果。')
    return payload.result
  }
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (value) {
        bytes += value.byteLength
        if (bytes > MAX_BYTES) throw fail('RESPONSE_TOO_LARGE', '同花顺返回数据过多，请缩小查询范围。')
        text += decoder.decode(value, { stream: true })
      }
      if (done) text += decoder.decode()
      if (!sse && done) return unpack(JSON.parse(text))
      if (sse) {
        text = text.replace(/\r\n/g, '\n')
        if (done && text) text += '\n\n'
        let end
        while ((end = text.indexOf('\n\n')) !== -1) {
          const block = text.slice(0, end)
          text = text.slice(end + 2)
          const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
          if (!data) continue
          const payload = JSON.parse(data)
          if (payload.id === id) return unpack(payload)
        }
      }
      if (done) throw fail('INVALID_RESPONSE', '同花顺连接结束前未返回请求结果。')
    }
  } finally {
    signal.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => {})
  }
}

export function createMarketClient({ resolveCredential, fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  return {
    async call(service, tool, args, { signal } = {}) {
      if (!SERVICES.has(service)) throw fail('INVALID_SERVICE', '不支持的数据服务。')
      const requestSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
      let key
      try {
        requestSignal.throwIfAborted()
        key = await resolveCredential()
        if (typeof key !== 'string' || !key.trim() || /[\r\n]/.test(key))
          throw fail('MISSING_CREDENTIAL', '同花顺密钥未配置，请配置 TONGHUASHUN_API_KEY 或本机钥匙串。')
        let session, sequence = 0
        const rpc = async (method, params, notification = false) => {
          const id = ++sequence
          const response = await fetchImpl(`${ORIGIN}/mcp/${service}`, {
            method: 'POST', redirect: 'error', signal: requestSignal,
            headers: {
              'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
              'X-api-key': key, 'MCP-Protocol-Version': '2025-03-26',
              ...(session ? { 'Mcp-Session-Id': session } : {})
            },
            body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params })
          })
          if (!response.ok) {
            await response.body?.cancel()
            const code = response.status === 401 || response.status === 403 ? 'AUTH_DENIED' : response.status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR'
            throw fail(code, `同花顺请求失败（HTTP ${response.status}），请检查权限、额度或稍后重试。`)
          }
          if (method === 'initialize') session = response.headers.get('mcp-session-id')
          if (notification) { await response.body?.cancel(); return }
          return readResponse(response, id, requestSignal)
        }
        await rpc('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'sherlock-tonghuashun', version: '0.1.0' } })
        await rpc('notifications/initialized', {}, true)
        const result = await rpc('tools/call', { name: tool, arguments: args })
        if (result.isError) throw fail('TOOL_ERROR', '同花顺未能完成查询，请核对代码、参数或权限。')
        const content = result.content?.filter(block => block.type === 'text').map(block => block.text).join('\n')
        const payload = result.structuredContent ?? JSON.parse(content)
        if (typeof payload.code !== 'number') throw fail('INVALID_RESPONSE', '同花顺返回结果缺少业务状态。')
        if (payload.code !== 0) throw fail(`PROVIDER_${payload.code}`, `同花顺查询失败（业务码 ${payload.code}）。未取得有效数据，请核对参数、权限或额度。`)
        if (!payload.data || typeof payload.data !== 'object') throw fail('INVALID_RESPONSE', '同花顺返回结果缺少数据。')
        return { source: '同花顺金融数据 API', received_at: new Date().toISOString(), request_id: payload.request_id ?? '', data: payload.data,
          data_note: 'received_at 是请求完成时间，不是行情时间。行情使用上游 timestamp，净值使用 nav_date；空 item 表示本次没有返回数据。场外基金净值不是实时价格。本接口不提供分钟 K 线。百分比字段 *_pct 已是百分数原值，不要再乘 100。'
            + (service === 'a-share' ? 'A 股行情 volume 的官方单位是股，不是手；turnover 是原始货币金额。不得把原始成交股数直接标为手。' : '未明确单位的成交量保留原始数值，不自行假设股、份或手。') }
      } catch (error) {
        if (error instanceof MarketDataError) throw error
        if (requestSignal.aborted) throw fail(signal?.aborted ? 'CANCELLED' : 'TIMEOUT', '同花顺查询已取消或超时，未取得数据。')
        throw fail('UNAVAILABLE', '同花顺连接或数据解析失败，未取得有效数据，请稍后重试。')
      } finally { key = undefined }
    }
  }
}
