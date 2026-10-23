const object = value => value && typeof value === 'object' && !Array.isArray(value)
const providerFailures = new Map([
  ['NETWORK_ERROR', '无法连接来源'], ['SOURCE_UNAVAILABLE', '来源暂不可用'],
  ['RATE_LIMITED', '来源暂时限流'], ['TIMEOUT', '来源响应超时'],
  ['INVALID_RESPONSE', '来源未返回可核验行情'], ['RESPONSE_TOO_LARGE', '来源响应超过容量']
])
const missing = '来源未提供'

// This partial-result path is exclusive to the fixed, credential-free ticker
// adapter. Never admit arbitrary connector requests or strip unknown arguments.
export function isCryptoTickerRequest(request) {
  const args = request?.args
  if ((request?.toolId ?? request?.tool) !== 'public_data_query' || !object(args) ||
    Object.keys(args).some(key => !['operation', 'source', 'parameters_json'].includes(key)) ||
    args.operation !== 'query' || args.source !== 'kraken-ticker' || typeof args.parameters_json !== 'string' || args.parameters_json.length > 5000) return false
  try {
    const parameters = JSON.parse(args.parameters_json)
    return !!object(parameters) && Object.keys(parameters).length === 1 && typeof parameters.pair === 'string' && /^[A-Z0-9]{5,14}$/u.test(parameters.pair)
  } catch { return false }
}

// Display fields are host formatting of observed numbers, not synthetic quote
// rows. Empty/failed requests retain records:[] and their exact request identity.
// Rebuild these fields on every refresh so a missing pair can recover normally.
export function normalizeCryptoTickerResult(request, outcome) {
  if (!isCryptoTickerRequest(request)) throw Error('Kraken部分行情只支持已校验的pair报价请求')
  const pair = JSON.parse(request.args.parameters_json).pair
  let response, missingDetail
  if (outcome?.status === 'rejected') {
    const failure = providerFailures.get(outcome.reason?.code)
    if (!failure || outcome.reason?.name === 'AbortError') throw outcome.reason
    missingDetail = `本次未取得：${failure}`
    response = { sourceId: 'kraken-ticker', source: 'Kraken 公开报价', records: [], units: {}, dataTime: null }
  } else {
    response = outcome?.value
    if (outcome?.status !== 'fulfilled' || response?.sourceId !== 'kraken-ticker' || !Array.isArray(response.records)) throw Error('免费来源没有返回该组件所需的真实记录')
    if (!response.records.length) missingDetail = '本次未取得：来源未返回该交易对行情'
  }
  const record = response.records[0], units = object(response.units) ? response.units : {}
  const unit = key => typeof units[key] === 'string' && units[key].trim() ? units[key] : undefined
  const assetLabel = unit('volume24h') ?? pair
  const display = { pair, assetLabel, changeTodayDetail: missingDetail ?? record?.changeTodayDetail ?? '日内涨跌幅：来源未提供有效UTC开盘价' }
  for (const field of ['price', 'bid', 'ask', 'high24h', 'low24h', 'volume24h']) {
    const value = record?.[field], suffix = unit(field === 'volume24h' ? 'volume24h' : 'price')
    display[field] = typeof value === 'number' && Number.isFinite(value)
      ? value.toFixed(field === 'volume24h' ? 4 : 2) + (suffix ? ` ${suffix}` : `（${missing}单位）`)
      : field === 'price' && missingDetail ? '本次未取得' : missing
  }
  return { ...response, ...(missingDetail ? { missingDetail } : {}), display }
}
