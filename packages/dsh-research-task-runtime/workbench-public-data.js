import { resolveBoundComponent } from './component-source-binding.js'
import {financialWidgetDefaults,financialWidgetSpec} from './financial-widget-contract.js'
import {generalNewsScope,NEWS_CAPACITY_MARKER,NEWS_DISPLAY_INSTRUCTION} from './news-source-scope.js'
import {normalizeCryptoTickerResult} from './crypto-source-results.js'
import {NEWS_QUERY_MARKER} from './news-query-coverage.js'

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
// The metrics renderer has twelve cells. Larger crypto watchlists retain the
// same bounded queries and every field in the existing scrollable table.
export function publicDataPanelVariant(value) {
  return value?.profile==='crypto-metrics'&&value.requests?.length>2?'table':PUBLIC_DATA_PROFILES[value?.profile]?.variant
}
export function validatePublicDataPanel(value, type, { strictParameters = false } = {}) {
  if (object(value) && !Object.hasOwn(value, 'profile')) {
    const sources = [...new Set((Array.isArray(value.requests) ? value.requests : []).map(r => r?.source))]
    const hint = sources.length === 1 ? ({'kraken-ticker':'crypto-metrics','kraken-candles':'price-volume','sina-news':'news'})[sources[0]] : undefined
    throw Error(`缺少 publicData.profile；必须将${hint ? ` "profile":"${hint}" ` : '实际模板 profile '}写入 publicData 对象，写在 prompt 中不生效。保留原标的、请求及面板范围，只补齐此字段后重试，无需改交易对或查询来源目录。`)
  }
  const profile = object(value) && PUBLIC_DATA_PROFILES[value.profile]
  if (!profile || profile.type !== type || Object.keys(value).some(k => !['profile', 'requests', 'intervalMinutes', 'layoutProfile'].includes(k))) throw Error('免费源组件类型或参数无效')
  if (value.layoutProfile !== undefined && (value.layoutProfile !== 'openterminal' || !['quotes-table', 'price-volume', 'news'].includes(value.profile))) throw Error(`publicData.layoutProfile 不支持 ${value.profile}；仅 quotes-table、price-volume、news 可设 openterminal。保留 profile、原请求和 panel.layout，只移除此不兼容的 layoutProfile，不改数据范围。`)
  const intervalMinutes = value.intervalMinutes ?? 1
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 0 || intervalMinutes > 10080) throw Error('免费源组件刷新频率无效')
  // Eight is the existing data-bound request budget, not a larger metrics grid.
  if (!Array.isArray(value.requests) || !value.requests.length || value.requests.length > (value.profile === 'crypto-metrics' ? 8 : 1)) throw Error('免费源组件请求数量无效')
  const requests = value.requests.map(request => {
    if (!object(request) || Object.keys(request).some(k => !['source', 'parameters_json'].includes(k)) || !profile.sources.includes(request.source) || typeof request.parameters_json !== 'string' || request.parameters_json.length > 5000) throw Error('免费源组件只接受当前模板支持的内置来源和参数')
    let parameters
    try { parameters = JSON.parse(request.parameters_json) } catch { throw Error('parameters_json必须为JSON对象字符串') }
    if (!object(parameters)) throw Error('parameters_json必须为JSON对象字符串')
    // New plans check adapter capabilities before acceptance. Persisted tasks
    // retain their shape contract so old failed recipes remain recoverable.
    if(request.source==='kraken-ticker'||request.source==='kraken-candles'){
      const supported=Object.keys(parameters).every(key=>['pair','interval','limit'].includes(key))&&
        typeof parameters.pair==='string'&&/^[A-Z0-9]{5,14}$/u.test(parameters.pair)&&
        (!Object.hasOwn(parameters,'interval')||[1,5,15,30,60,240,1440,10080,21600].includes(parameters.interval))&&
        (!Object.hasOwn(parameters,'limit')||Number.isInteger(parameters.limit)&&parameters.limit>=1&&parameters.limit<=100)
      if(strictParameters&&!supported)throw Error('Kraken面板存在不支持的参数；仅接受合规pair及K线粒度interval、记录数limit，不接受任意URL、密钥或请求头')
      // Planners may copy a history recipe into a ticker panel. These bounded
      // candle hints have no meaning for a quote snapshot; refresh is governed
      // exclusively by intervalMinutes. Never strip unknown or invalid keys.
      if(supported&&request.source==='kraken-ticker')return {source:request.source,parameters_json:JSON.stringify({pair:parameters.pair})}
    }
    if(strictParameters&&request.source==='tencent-quotes'){
      if(Object.keys(parameters).some(key=>key!=='symbols'))throw Error('腾讯报价只支持symbols，不接受任意URL、密钥或请求头')
      if(!Array.isArray(parameters.symbols)||!parameters.symbols.length||parameters.symbols.length>12||parameters.symbols.some(symbol=>typeof symbol!=='string'||!/^(?:sh\d{6}|sz\d{6}|hk\d{5}|us[A-Z][A-Z0-9.]{0,9})$/u.test(symbol)))throw Error('腾讯报价symbols必须为1–12个合规交易代码')
    }
    if(strictParameters&&request.source==='tencent-history'){
      if(Object.keys(parameters).some(key=>!['symbol','limit'].includes(key)))throw Error('腾讯历史行情只支持symbol与limit，不接受任意URL、密钥或请求头')
      if(typeof parameters.symbol!=='string'||!/^(?:sh\d{6}|sz\d{6}|hk\d{5})$/u.test(parameters.symbol))throw Error('腾讯历史行情symbol必须为已确认的合规交易代码')
      if(parameters.limit!==undefined&&(!Number.isInteger(parameters.limit)||parameters.limit<1||parameters.limit>100))throw Error('腾讯历史行情limit必须为1–100的整数')
    }
    if(strictParameters&&value.profile==='news'){
      if(Object.keys(parameters).some(key=>key!=='limit'))throw Error('新浪新闻直通只支持limit，不支持证券筛选、任意URL、密钥或请求头；证券新闻请使用普通面板取数。')
      if(parameters.limit!==undefined&&(!Number.isInteger(parameters.limit)||parameters.limit<1||parameters.limit>100))throw Error('新浪新闻limit必须为1–100的整数')
    }
    return { source: request.source, parameters_json: request.parameters_json }
  })
  if (new Set(requests.map(r => JSON.stringify(r))).size !== requests.length) throw Error('免费源组件请求重复')
  return { profile: value.profile, requests, intervalMinutes, ...(value.layoutProfile ? { layoutProfile: value.layoutProfile } : {}) }
}

// A valid quote request does not imply that the fixed renderer covers every
// business field. Keep the observed unsupported requirements in a source task.
const quoteExtraField=String.raw`(?:成交量|成交额|市盈率(?:\s*[(（]TTM[)）])?|市净率|(?:总)?市值|(?:昨收|前收盘)(?:价)?|涨跌额|\b(?:PE(?:[-_ ]?TTM)?|PB|volume|amount|market[ _-]?cap|previousClose|previous[ _-]close|change)\b)`
const metricsExtraField=String.raw`(?:开盘(?:价)?|最高(?:价)?|最低(?:价)?|\b(?:open|high|low)(?:Price)?\b)`
function requiredQuoteFields(requirement,profile){
  const field=profile==='quotes-metrics'?`(?:${quoteExtraField}|${metricsExtraField})`:quoteExtraField
  // Erase only complete exclusion lists ending at punctuation or the end.
  // Unknown trailing text may affirm the last field; retain the whole match.
  const exclusion=String.raw`(?:(?:不要|不需要|无需|不必|不用)(?:展示|显示|提供|包含|包括)?|不(?:展示|显示|包含|包括)|排除|\b(?:do\s+not|don't)\s+(?:need(?:\s+to)?\s+)?(?:show|display|include|provide)?|\bno\b(?:\s+need\s+(?:for|to(?:\s+(?:show|display|include))?))?|\b(?:without|exclude|omit)\b)`
  const separator=String.raw`(?:[、，,/](?:\s*\b(?:and|or)\b)?|和|与|以及|及|或者|或|\b(?:and|or)\b)`
  return requirement.replace(new RegExp(`${exclusion}\\s*${field}(?:\\s*${separator}\\s*${field})*`,'giu'),(match,offset)=>
    /^\s*(?:[，,。.;；!！?？：:\n]|$)/u.test(requirement.slice(offset+match.length))?'':match)
}
export function publicDataQuoteTaskRequirement(value,type,requirement='',{explicitTableLayout=false}={}){
  if(!['quotes-table','quotes-metrics'].includes(value?.profile))return null
  const supported=validatePublicDataPanel(value,type,{strictParameters:true})
  const required=requiredQuoteFields(requirement,value.profile)
  const missing=new RegExp(quoteExtraField,'iu').test(required)||value.profile==='quotes-metrics'&&new RegExp(metricsExtraField,'iu').test(required)
  if(!missing&&!explicitTableLayout)return null
  const layout=supported.layoutProfile?'最终使用market的variant: table，顶层保留已校验的 "layoutProfile":"openterminal"（artifact.layoutProfile）。':'最终使用table的columns/rows，原规划的market/metrics仅是路由提示，不能替代本卡字段。'
  return {type:supported.layoutProfile?'market':'table',promptPrefix:supported.layoutProfile?'market.table；variant: table；\n':'',requirement:`宿主来源能力校正：${value.profile}直通仅展示固定报价字段，不能完整表达本卡要求；改由独立表格取数任务完成。${layout}保留原面板全部标的、字段、单位、时间及交互要求，复用已校验来源参数：${JSON.stringify(supported)}。继续遵从显式来源限制，不猜接口或改请求参数；来源未提供的字段逐项标注「来源未提供」，不能删列或用股价/涨跌幅替代估值、成交量等指标，不补模拟值或声称已开启刷新。`}
}

export function publicDataNewsTaskType(value,type){
  if(type!=='news'||value?.profile!=='news'||!Array.isArray(value.requests))return type
  const count=value.requests.reduce((total,request)=>{try{const limit=JSON.parse(request.parameters_json).limit??20;return Number.isInteger(limit)&&limit>0?total+limit:NaN}catch{return NaN}},0)
  return count>100?'html':count>40?value.layoutProfile==='openterminal'?'market':'table':type
}
const newsCapacityRequirement=(value,requirement)=>{
  requirement+='\n'+NEWS_DISPLAY_INSTRUCTION
  const type=publicDataNewsTaskType(value,'news')
  if(type==='news')return requirement
  const representation=type==='html'?`自包含HTML搜索、主题/日期分组与分页视图；全部真实记录保留在底层数据中，分页仅改变当前可见条目，不删除记录。${value.layoutProfile==='openterminal'?'OpenTerminal阅读布局在HTML继承宿主主题视觉；不要设置HTML不支持的artifact.layoutProfile。':''}原周期更新要求仍保留（intervalMinutes:${value.intervalMinutes??1}）；现有HTML不支持宿主data-bound自动渲染，当前为快照，尚未绑定原周期更新要求，必须明确说明，不能声称自动刷新已启用`:value.layoutProfile==='openterminal'?'market.table；variant: table；顶层保留layoutProfile:openterminal':'table的columns/rows'
  return requirement+`\n${NEWS_CAPACITY_MARKER}\nnews模板最多40条，原生table/market.table最多100行，不能为套模板裁掉本卡原请求。改用${representation}。完整展示实际取得的所有相关记录，保留原limit与每个成功来源请求，不用slice/$take裁为40条。列保留标题、时间、媒体、类别、来源已提供的摘要片段和原文链接，按日期/类别合理排序分组并支持搜索浏览；缺失字段说明来源未提供。来源实际不足请求条数时如实说明，不补造；主题、实体及用户显式来源限制继续有效。`
}

// A total feed cannot satisfy a topic; fixed native feed capacity also must
// not delete a valid request's content. Preserve both in an ordinary worker.
export function publicDataNewsTaskRequirement(value,type,requirement=''){
  // A planner may spell each company filter as symbol in separate requests.
  // These are source intents, not executable parameters for Sina's total feed.
  if(value?.profile==='news'&&Array.isArray(value.requests)&&value.requests.some(r=>{
    try{return Object.hasOwn(JSON.parse(r.parameters_json),'symbol')}catch{return false}
  })){
    if(type!=='news'||!value.requests.length||value.requests.length>8)throw Error('证券新闻面板需要1–8个已校验来源请求')
    const requests=value.requests.map(request=>{
      let parameters;try{parameters=JSON.parse(request.parameters_json)}catch{throw Error('证券新闻参数无效')}
      if(!object(parameters)||typeof parameters.symbol!=='string'||!/^(?:sh\d{6}|sz\d{6}|hk\d{5}|us[A-Z][A-Z0-9.]{0,9})$/u.test(parameters.symbol)||Object.keys(parameters).some(k=>!['symbol','limit'].includes(k)))throw Error('证券新闻只保留合规symbol与limit，不支持其他参数')
      const {symbol,...supportedParameters}=parameters
      const checked=validatePublicDataPanel({...value,requests:[{...request,parameters_json:JSON.stringify(supportedParameters)}]},type,{strictParameters:true})
      return {source:checked.requests[0].source,symbol,limit:parameters.limit??20}
    })
    if(new Set(requests.map(r=>r.symbol)).size!==requests.length)throw Error('免费源组件请求重复')
    const scope=JSON.stringify({requests,intervalMinutes:value.intervalMinutes??1,...(value.layoutProfile?{layoutProfile:value.layoutProfile}:{})})
    return newsCapacityRequirement(value,`宿主来源能力校正：内置sina-news不支持symbol证券筛选，本卡改由一个独立news取数任务；不要把这些筛选参数再次提交给sina-news。保留原面板全部主题与字段；以下证券筛选元信息仅供执行和验证，不写入note：${scope}。不得扩大为全市场新闻；仅使用原需求允许且能按标的检索的来源中实际取得的相关报道、原始标题、时间和原文链接，无法取得时明确缺失，不编造新闻或声称已开启刷新。${value.layoutProfile&&publicDataNewsTaskType(value,type)!=='html'?'最终artifact.layoutProfile保留已校验的 "layoutProfile":"openterminal"。':''}`)
  }
  // Observed planners group company keyword searches in one news panel. The
  // adapter cannot execute them; retain their validated scope for a worker.
  if(value?.profile==='news'&&Array.isArray(value.requests)&&value.requests.some(r=>{
    try{return Object.hasOwn(JSON.parse(r.parameters_json),'query')}catch{return false}
  })){
    if(type!=='news'||!value.requests.length||value.requests.length>8)throw Error('公司新闻面板需要1–8个已校验来源请求')
    const queries=value.requests.map(request=>{
      let parameters;try{parameters=JSON.parse(request.parameters_json)}catch{throw Error('公司新闻参数无效')}
      if(!object(parameters)||typeof parameters.query!=='string'||!parameters.query.trim()||parameters.query.length>100||Object.keys(parameters).some(k=>!['query','limit'].includes(k)))throw Error('公司新闻只保留query与limit，不支持其他参数')
      const {query,...supportedParameters}=parameters
      if(['eastmoney-news','gdelt-news'].includes(request.source)){
        if(Object.keys(request).some(key=>!['source','parameters_json'].includes(key))||request.source==='gdelt-news'&&query.trim().length<2)throw Error('主题新闻来源参数无效')
        validatePublicDataPanel({...value,requests:[{source:'sina-news',parameters_json:JSON.stringify(supportedParameters)}]},type,{strictParameters:true})
        return {query:query.trim(),limit:parameters.limit??20,source:request.source}
      }
      const checked=validatePublicDataPanel({...value,requests:[{...request,parameters_json:JSON.stringify(supportedParameters)}]},type,{strictParameters:true})
      return {query:query.trim(),limit:parameters.limit??20,source:checked.requests[0].source}
    })
    if(new Set(queries.map(v=>JSON.stringify(v))).size!==queries.length)throw Error('免费源组件请求重复')
    const scope=JSON.stringify({queries,intervalMinutes:value.intervalMinutes??1,...(value.layoutProfile?{layoutProfile:value.layoutProfile}:{})})
    const coverage=queries.map(row=>({...row,source:row.source==='sina-news'?'eastmoney-news':row.source}))
    return newsCapacityRequirement(value,`宿主来源能力校正：sina-news不支持主题关键词查询；已声明的定向新闻查询由一个独立news取数任务按对应来源能力执行。保留原面板全部主题与字段；以下筛选元信息仅供执行和验证，不写入note：${scope}。不得扩大为全市场新闻；仅使用原需求允许的来源中实际取得的相关报道、时间、摘要和原文链接，无法取得时明确缺失，不编造新闻或声称已开启刷新。${value.layoutProfile&&publicDataNewsTaskType(value,type)!=='html'?'最终artifact.layoutProfile保留已校验的 "layoutProfile":"openterminal"。':''}\n${NEWS_QUERY_MARKER}\n${JSON.stringify(coverage)}`)
  }
  if(value?.profile!=='news'||!Array.isArray(value.requests)||value.requests.length!==1)return null
  const request=value.requests[0]
  if(typeof request?.parameters_json!=='string'||request.parameters_json.length>5000)return null
  let parameters
  try{parameters=JSON.parse(request?.parameters_json)}catch{return null}
  if(!object(parameters))return null
  const hasSymbols=Object.hasOwn(parameters,'symbols')
  const themed=!generalNewsScope(requirement)
  const capacity=publicDataNewsTaskType(value,type)!==type
  if(!hasSymbols&&!themed&&!capacity)return null
  const {symbols,...supportedParameters}=parameters
  if(hasSymbols&&(!Array.isArray(symbols)||!symbols.length||symbols.length>12||new Set(symbols).size!==symbols.length||symbols.some(symbol=>typeof symbol!=='string'||!/^(?:sh\d{6}|sz\d{6}|hk\d{5}|us[A-Z][A-Z0-9.]{0,9})$/u.test(symbol))))throw Error('证券新闻symbols必须为1–12个唯一合规交易代码，不接受网址或其他指令')
  const supported=validatePublicDataPanel({...value,requests:[{...request,parameters_json:JSON.stringify(supportedParameters)}]},type,{strictParameters:true})
  const scope=JSON.stringify({source:request.source,...(hasSymbols?{symbols}:{}),limit:parameters.limit??20,intervalMinutes:supported.intervalMinutes,...(supported.layoutProfile?{layoutProfile:supported.layoutProfile}:{})})
  if(!hasSymbols&&!themed)return newsCapacityRequirement(value,`本卡明确要求全市场财经总流。由普通单卡任务复用已校验请求取得全部真实记录：${scope}。保留来源、日期、原文链接和实际返回数量。`)
  const layout=supported.layoutProfile&&publicDataNewsTaskType(value,type)!=='html'?'最终news数据对象顶层必须保留已校验的 "layoutProfile":"openterminal"（即artifact.layoutProfile），沿用该内部布局。':''
  return newsCapacityRequirement(value,`宿主来源能力校正：内置sina-news仅支持财经总流，不能按证券或公司/行业主题筛选；本卡改由独立取数任务完成。保留原面板全部需求；以下筛选元信息仅供执行和验证，不写入note：${scope}。${layout}${hasSymbols?'不得删除证券筛选后交付全市场新闻；':''}不得扩大为全市场新闻；只保留与原面板公司/行业主题及已声明证券匹配的真实报道、时间、摘要和原文链接。使用当前已授权且能按标的检索的来源，继续遵从原需求的显式来源限制；无法取得时明确缺失，不编造新闻或声称已开启刷新。`)
}

// A comparison chart may need several valid history requests, while the
// direct price/volume renderer only accepts one security. Preserve the exact
// requests for an ordinary chart worker; never squeeze them into one series.
export function publicDataHistoryTaskRequirement(value,type){
  if(!['chart','market'].includes(type)||value?.profile!=='price-volume'||!Array.isArray(value.requests)||type==='market'&&value.requests.length===1||value.requests.some(r=>r?.source!=='tencent-history'))return null
  if(!value.requests.length||value.requests.length>8)throw Error('历史对比面板需要1–8个已校验来源请求')
  const supported=value.requests.map(request=>validatePublicDataPanel({...value,requests:[request]},'market',{strictParameters:true}))
  if(new Set(value.requests.map(r=>JSON.stringify(r))).size!==value.requests.length)throw Error('免费源组件请求重复')
  if(value.layoutProfile!==undefined)throw Error('当前chart对比模板不支持该专用布局，不能静默移除layoutProfile')
  const scope=JSON.stringify({profile:value.profile,requests:supported.map(v=>v.requests[0]),intervalMinutes:supported[0].intervalMinutes})
  return `宿主来源能力校正：price-volume直通仅支持单标的量价，不能表达本卡的对比分析；改由一个独立chart取数任务完成，保留原面板全部问题与以下已校验来源参数：${scope}。复用这些来源与原参数读取真实记录，不猜接口、交易所或字段；仅按原需求计算归一化、相对强弱与基准对比，不压成单标的量价。同轴比较需同单位和可比尺度；混合价格单位时采用共同基期100（值/共同起点值×100）或分面或单系列，说明公式和基期；用户明确要求原始值时用分面或单系列保留原值，禁止元与点直接同轴。需求包含超额收益时，按对齐日期的个股区间涨幅减基准区间涨幅计算并以%标注，不能仅用基期100曲线替代；缺失共同日期或起点值时明确缺失，不补值。保留真实日期、原单位、来源与缺失说明；不得将尚未取数写成已取得，或声称已开启刷新。`
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
    const metadata={asOf:'Kraken · 报价时点未提供',note:'行情仅代表Kraken交易所；24h成交量为基础资产数量。日内涨跌幅由最近成交价相对UTC 00:00开盘价计算，不等于滚动24h涨跌幅。',
      sources:base.sources.filter((source,i,all)=>all.findIndex(item=>item.label===source.label&&item.url===source.url)===i)}
    if(publicDataPanelVariant(panel.publicData)==='table'){
      // One row per fixed pair request makes refresh independent of list order.
      // Explicit text defaults keep genuine missing fields visible; no numeric
      // values are invented or dropped to fit the compact metrics renderer.
      const cell=(i,field)=>path(`q${i}`,field,{$as:'string',$default:'来源未提供'})
      return {...base,...metadata,variant:'table',
        columns:['交易对','最近成交','日内涨跌幅（UTC 00:00 起）','买一','卖一','24h最高','24h最低','24h成交量','价格单位','量单位','报价时点','获取时点'],
        rows:responses.map((_response,i)=>[
          JSON.parse(panel.publicData.requests[i].parameters_json).pair,path(`q${i}`,'records.0.price',{$as:'string',$default:'本次未取得'}),path(`q${i}`,'display.changeTodayDetail',{$default:'来源未提供'}),
          ...['bid','ask','high24h','low24h','volume24h'].map(field=>cell(i,`records.0.${field}`)),
          cell(i,'units.price'),cell(i,'units.volume24h'),cell(i,'dataTime'),cell(i,'receivedAt')
        ])}
    }
    return { ...base, ...metadata,
      items: responses.flatMap((_response, i) => fields.map(([field, label]) => ({
        label: path(`q${i}`,'display.assetLabel',{$suffix:` ${label}`}),
        value: path(`q${i}`, `display.${field}`, { $default: '来源未提供' }),
        ...(field==='price'?{detail:path(`q${i}`,'display.changeTodayDetail',{$default:'日内涨跌幅：来源未提供有效UTC开盘价'})}:{})
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
  const crypto = panel.publicData?.profile === 'crypto-metrics'
  const publicData = validatePublicDataPanel(panel.publicData, panel.type, { strictParameters: crypto })
  if(publicDataNewsTaskRequirement(publicData,panel.type,[panel.title,panel.prompt,panel.publicDataPrompt].filter(Boolean).join('\n')))throw Error('该新闻组件需要按原主题定向检索，不能直接读取无主题的财经总流；请重试以恢复相关取数。')
  const requests = publicData.requests.map((request, i) => ({ key: `q${i}`, tool: 'public_data_query', args: { operation: 'query', source: request.source, parameters_json: request.parameters_json } }))
  const outcomes = await Promise.allSettled(requests.map(request => client.query(request.args, signal)))
  signal?.throwIfAborted()
  const responses = outcomes.map((outcome,i) => {
    if(crypto)return normalizeCryptoTickerResult(requests[i],outcome)
    if(outcome.status==='rejected')throw outcome.reason
    return outcome.value
  })
  if (responses.some((response, i) => response?.sourceId !== requests[i].args.source || !Array.isArray(response.records) || !crypto&&!response.records.length) || !responses.some(response=>response.records.length)) throw Error('免费来源没有返回该组件所需的真实记录')
  const mapping = mappingFor({ ...panel, publicData }, responses)
  const result = resolveBoundComponent(JSON.stringify({ version: 1, type: 'data-bound', requests, mapping }), requests.map((r, i) => ({ tool: r.tool, args: r.args, response: responses[i] })), now)
  if (!result) throw Error('免费来源映射未通过模板校验')
  result.recipe.intervalMinutes = publicData.intervalMinutes
  return result
}
