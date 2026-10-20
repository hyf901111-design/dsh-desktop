import { resolveBoundComponent } from './component-source-binding.js'
import {financialWidgetDefaults,financialWidgetSpec} from './financial-widget-contract.js'

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
export function validatePublicDataPanel(value, type, { strictParameters = false } = {}) {
  const profile = object(value) && PUBLIC_DATA_PROFILES[value.profile]
  if (!profile || profile.type !== type || Object.keys(value).some(k => !['profile', 'requests', 'intervalMinutes', 'layoutProfile'].includes(k))) throw Error('免费源组件类型或参数无效')
  if (value.layoutProfile !== undefined && (value.layoutProfile !== 'openterminal' || !['quotes-table', 'price-volume', 'news'].includes(value.profile))) throw Error('当前免费源模板不支持此专用布局')
  const intervalMinutes = value.intervalMinutes ?? 1
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 0 || intervalMinutes > 10080) throw Error('免费源组件刷新频率无效')
  if (!Array.isArray(value.requests) || !value.requests.length || value.requests.length > (value.profile === 'crypto-metrics' ? 2 : 1)) throw Error('免费源组件请求数量无效')
  const requests = value.requests.map(request => {
    if (!object(request) || Object.keys(request).some(k => !['source', 'parameters_json'].includes(k)) || !profile.sources.includes(request.source) || typeof request.parameters_json !== 'string' || request.parameters_json.length > 5000) throw Error('免费源组件只接受当前模板支持的内置来源和参数')
    let parameters
    try { parameters = JSON.parse(request.parameters_json) } catch { throw Error('parameters_json必须为JSON对象字符串') }
    if (!object(parameters)) throw Error('parameters_json必须为JSON对象字符串')
    // New plans check adapter capabilities before acceptance. Persisted tasks
    // retain their shape contract so old failed recipes remain recoverable.
    if(strictParameters&&value.profile==='news'){
      if(Object.keys(parameters).some(key=>key!=='limit'))throw Error('新浪新闻直通只支持limit，不支持证券筛选、任意URL、密钥或请求头；证券新闻请使用普通面板取数。')
      if(parameters.limit!==undefined&&(!Number.isInteger(parameters.limit)||parameters.limit<1||parameters.limit>100))throw Error('新浪新闻limit必须为1–100的整数')
    }
    return { source: request.source, parameters_json: request.parameters_json }
  })
  if (new Set(requests.map(r => JSON.stringify(r))).size !== requests.length) throw Error('免费源组件请求重复')
  return { profile: value.profile, requests, intervalMinutes, ...(value.layoutProfile ? { layoutProfile: value.layoutProfile } : {}) }
}

// Sina's bundled feed cannot filter securities. Preserve a narrowly recognized
// planner intent as a normal source task, rather than deleting symbols and
// silently replacing company news with an unrelated market-wide feed.
export function publicDataNewsTaskRequirement(value,type){
  if(value?.profile!=='news'||!Array.isArray(value.requests)||value.requests.length!==1)return null
  const request=value.requests[0]
  if(typeof request?.parameters_json!=='string'||request.parameters_json.length>5000)return null
  let parameters
  try{parameters=JSON.parse(request?.parameters_json)}catch{return null}
  if(!object(parameters)||!Object.hasOwn(parameters,'symbols'))return null
  const {symbols,...supportedParameters}=parameters
  if(!Array.isArray(symbols)||!symbols.length||symbols.length>12||new Set(symbols).size!==symbols.length||symbols.some(symbol=>typeof symbol!=='string'||!/^(?:sh\d{6}|sz\d{6}|hk\d{5}|us[A-Z][A-Z0-9.]{0,9})$/u.test(symbol)))throw Error('证券新闻symbols必须为1–12个唯一合规交易代码，不接受网址或其他指令')
  const supported=validatePublicDataPanel({...value,requests:[{...request,parameters_json:JSON.stringify(supportedParameters)}]},type,{strictParameters:true})
  const scope=JSON.stringify({source:request.source,symbols,limit:parameters.limit??20,intervalMinutes:supported.intervalMinutes})
  return `宿主来源能力校正：内置sina-news仅支持财经总流，不能按证券symbols筛选；本卡改由独立取数任务完成。保留原面板全部需求及筛选元信息：${scope}。不得删除证券筛选后交付全市场新闻；只保留与上述证券及原主题匹配的真实报道、时间、摘要和原文链接。使用当前已授权且能按标的检索的来源，继续遵从原需求的显式来源限制；无法取得时明确缺失，不编造新闻或声称已开启刷新。`
}

// Live single-security K lines use the actual library renderer. Keep explicit
// manual snapshots and index/unknown identifiers on their original data path.
export function publicDataQuoteSpec(title,value,prompt=''){
 if(value?.profile!=='candlestick'||value.intervalMinutes!==1||value.requests?.length!==1||value.requests[0].source!=='tencent-history')return null
 if(/快照|snapshot|回测|复盘|固定(?:历史|日期|区间)|(?:19|20)\d{2}[-/年]\d{1,2}[-/月]\d{1,2}/iu.test(title+' '+prompt))return null
 let p;try{p=JSON.parse(value.requests[0].parameters_json)}catch{return null}
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['symbol','limit'].includes(k)))return null
 const match=typeof p.symbol==='string'&&p.symbol.match(/^(sh|sz|hk)(\d{5,6})$/)
 if(!match||match[2].length!==(match[1]==='hk'?5:6)||/^(sh000\d{3}|sz399\d{3})$/.test(p.symbol))return null
 const visibleBars=p.limit??20;if(!Number.isInteger(visibleBars)||visibleBars<1||visibleBars>100)return null
 const name=title.replace(/(?:日|周|月|年)?K\s*(?:线|走势).*$/iu,'').trim()||match[2]
 return financialWidgetSpec({...financialWidgetDefaults('quote'),title,symbols:[{code:match[2],market:match[1].toUpperCase(),name}],visibleBars})
}

const path = (key, field, extra = {}) => ({ $from: key, $path: field, ...extra })
const array = (key, map, extra = {}) => ({ $from: key, $each: 'records', $map: map, ...extra })
const number = (field, digits = 2, suffix = '') => ({ $path: field, $as: 'string', $digits: digits, $suffix: suffix, $optional: true })
const provenance = responses => responses.map(response => ({ label: response.source ?? response.sourceId, ...(response.documentation ? { url: response.documentation } : {}) }))
function mappingFor(panel, responses) {
  const profile = PUBLIC_DATA_PROFILES[panel.publicData.profile]
  const first = responses[0], base = { version: 1, type: profile.type, title: panel.title, ...(profile.variant ? { variant: profile.variant } : {}), ...(panel.publicData.layoutProfile ? { layoutProfile: panel.publicData.layoutProfile } : {}), sources: provenance(responses) }
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
