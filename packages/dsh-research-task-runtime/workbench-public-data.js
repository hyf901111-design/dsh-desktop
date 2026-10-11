import { resolveBoundComponent } from './component-source-binding.js'

// These recipes describe the bundled adapter's schema, never model-authored
// paths, executable code, arbitrary URLs or connector credentials.
export const PUBLIC_DATA_PROFILES = Object.freeze({
  'quotes-table': { type: 'market', variant: 'table', sources: ['tencent-quotes'] },
  'quotes-metrics': { type: 'market', variant: 'metrics', sources: ['tencent-quotes'] },
  'crypto-metrics': { type: 'market', variant: 'metrics', sources: ['kraken-ticker'] },
  'price-volume': { type: 'market', variant: 'price-volume', sources: ['kraken-candles', 'tencent-history'] },
  candlestick: { type: 'market', variant: 'candlestick', sources: ['tencent-history'] },
  news: { type: 'news', sources: ['sina-news'] }
})
const object = v => v && typeof v === 'object' && !Array.isArray(v)
export function validatePublicDataPanel(value, type) {
  const profile = object(value) && PUBLIC_DATA_PROFILES[value.profile]
  if (!profile || profile.type !== type || Object.keys(value).some(k => !['profile', 'requests', 'intervalMinutes'].includes(k))) throw Error('免费源组件类型或参数无效')
  const intervalMinutes = value.intervalMinutes ?? 1
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 0 || intervalMinutes > 10080) throw Error('免费源组件刷新频率无效')
  if (!Array.isArray(value.requests) || !value.requests.length || value.requests.length > (value.profile === 'crypto-metrics' ? 2 : 1)) throw Error('免费源组件请求数量无效')
  const requests = value.requests.map(request => {
    if (!object(request) || Object.keys(request).some(k => !['source', 'parameters_json'].includes(k)) || !profile.sources.includes(request.source) || typeof request.parameters_json !== 'string' || request.parameters_json.length > 5000) throw Error('免费源组件只接受当前模板支持的内置来源和参数')
    let parameters
    try { parameters = JSON.parse(request.parameters_json) } catch { throw Error('parameters_json必须为JSON对象字符串') }
    if (!object(parameters)) throw Error('parameters_json必须为JSON对象字符串')
    return { source: request.source, parameters_json: request.parameters_json }
  })
  if (new Set(requests.map(r => JSON.stringify(r))).size !== requests.length) throw Error('免费源组件请求重复')
  return { profile: value.profile, requests, intervalMinutes }
}

const path = (key, field, extra = {}) => ({ $from: key, $path: field, ...extra })
const array = (key, map, extra = {}) => ({ $from: key, $each: 'records', $map: map, ...extra })
const number = (field, digits = 2, suffix = '') => ({ $path: field, $as: 'string', $digits: digits, $suffix: suffix, $optional: true })
const provenance = responses => responses.map(response => ({ label: response.source ?? response.sourceId, ...(response.documentation ? { url: response.documentation } : {}) }))
function mappingFor(panel, responses) {
  const profile = PUBLIC_DATA_PROFILES[panel.publicData.profile]
  const first = responses[0], base = { version: 1, type: profile.type, title: panel.title, ...(profile.variant ? { variant: profile.variant } : {}), sources: provenance(responses) }
  if (panel.publicData.profile === 'news') return { ...base,
    asOf: path('q0', 'dataTime', { $default: '发布时间未提供', $prefix: '新浪财经 · 资讯 ' }),
    items: array('q0', { title: { $path: 'title' }, date: { $path: 'time', $optional: true }, category: { $path: 'publisher', $default: '媒体未提供' }, summary: { $default: '来源未提供摘要' }, url: { $path: 'url', $optional: true } }, { $sortBy: 'time', $order: 'desc' })
  }
  if (panel.publicData.profile.startsWith('quotes-')) {
    const units = [...new Set(first.records.map(r => r.priceUnit))]
    const asOf = path('q0', 'dataTime', { $default: '时点未知（来源未提供）', $prefix: '腾讯财经 · 最后报价 ' })
    const note = '各记录保留原报价单位与时间。休市报价可能不变，获取时间不等于报价时间。'
    if (panel.publicData.profile === 'quotes-table') return { ...base, asOf, note,
      columns: ['名称', '代码', units.length === 1 ? `最新价（${units[0]}）` : '最新价', '单位', '涨跌幅', '开盘', '最高', '最低', '最后报价'],
      rows: array('q0', [{ $path: 'name' }, { $path: 'code' }, number('price'), { $path: 'priceUnit' }, number('changePercent', 2, '%'), number('open'), number('high'), number('low'), { $path: 'time', $default: '未知' }])
    }
    // Filter by the observed identity, so an omitted quote cannot move another
    // security into its position on a later refresh.
    const field = (record, name, extra = {}) => array('q0', { $path: name }, { $filter: { symbol: record.symbol }, $single: true, ...extra })
    return { ...base, asOf, note, items: first.records.map(record => ({
      label: field(record, 'name'), value: field(record, 'price', { $as: 'string', $digits: 2, $suffix: ` ${record.priceUnit === 'points' ? '点' : record.priceUnit}` }),
      detail: field(record, 'changePercent', { $as: 'string', $digits: 2, $prefix: '涨跌幅 ', $suffix: '%' })
    })) }
  }
  if (panel.publicData.profile === 'crypto-metrics') {
    const fields = [['price', '最近成交'], ['bid', '买一'], ['ask', '卖一'], ['high24h', '24h最高'], ['low24h', '24h最低'], ['volume24h', '24h成交量']]
    return { ...base, asOf: 'Kraken · 报价时点未提供', note: '行情仅代表Kraken交易所；24h成交量为基础资产数量。',
      items: responses.flatMap((response, i) => fields.map(([field, label]) => ({
        label: `${response.units.volume24h ?? response.records[0].pair} ${label}`,
        value: path(`q${i}`, `records.0.${field}`, { $as: 'string', $digits: field === 'volume24h' ? 4 : 2, $suffix: ` ${response.units[field === 'volume24h' ? 'volume24h' : 'price']}`, $optional: true })
      })))
    }
  }
  const series = (map) => array('q0', map, { $sortBy: 'time', $order: 'asc' })
  const asOf = path('q0', 'dataTime', { $default: '时点未提供', $prefix: `${first.source ?? first.sourceId} · 数据 ` })
  if (panel.publicData.profile === 'candlestick') return { ...base, asOf,
    candles: series({ date: { $path: 'time' }, open: { $path: 'open' }, high: { $path: 'high' }, low: { $path: 'low' }, close: { $path: 'close' }, volume: { $path: 'volume', $optional: true } }),
    note: `价格单位 ${first.units.price}；量单位 ${first.units.volume}。${first.note ?? ''}`
  }
  return { ...base, asOf, priceUnit: first.units.price, volumeUnit: first.units.volume,
    labels: series({ $path: 'time' }), prices: series({ $path: 'close' }), volumes: series({ $path: 'volume' }),
    note: first.note ?? '来源历史记录；频率以接口实际记录为准，不将日线称为分钟线。'
  }
}

export async function preparePublicDataPanel(panel, client, signal, now = new Date()) {
  const publicData = validatePublicDataPanel(panel.publicData, panel.type)
  const requests = publicData.requests.map((request, i) => ({ key: `q${i}`, tool: 'public_data_query', args: { operation: 'query', source: request.source, parameters_json: request.parameters_json } }))
  const responses = await Promise.all(requests.map(request => client.query(request.args, signal)))
  signal?.throwIfAborted()
  if (responses.some((response, i) => response?.sourceId !== requests[i].args.source || !Array.isArray(response.records) || !response.records.length)) throw Error('免费来源没有返回该组件所需的真实记录')
  const mapping = mappingFor({ ...panel, publicData }, responses)
  const result = resolveBoundComponent(JSON.stringify({ version: 1, type: 'data-bound', requests, mapping }), requests.map((r, i) => ({ tool: r.tool, args: r.args, response: responses[i] })), now)
  if (!result) throw Error('免费来源映射未通过模板校验')
  result.recipe.intervalMinutes = publicData.intervalMinutes
  return result
}
