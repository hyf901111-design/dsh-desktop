import { isDeepStrictEqual } from 'node:util'
import { componentDiscoveryToolNames, emptyDataProFinanceResult } from './component-source-binding.js'

const CATALOG_REUSE = '本轮已读取相同目录或接口定义。复用已返回的定义，或按原授权改用覆盖所需字段的其他来源。'
const UNSUPPORTED_API = '本轮目录确认未提供该接口。按用户限定的来源补查；没有适用来源时保留缺失。'
const WEB_UNREADABLE = '网页读取器无法读取该行情接口格式。改用适用的结构化数据工具，或读取可核验的公开网页正文。'
const MAX_RAW_PROBES = 2
const MAX_MISSING_APIS = 64
const apiName = /^[a-z][a-z0-9_]{0,63}$/u
const toolName = /^ework__[a-zA-Z0-9_]{1,57}$/u
const dataProNoData = '火山专业数据对此请求未返回有效业务记录。核对交易日、合约月份和所需字段，只补查缺项。'
const dataProMissingTarget = '火山专业数据未识别该标的。先核实交易所和证券或合约代码，再用准确代码补查。'

function observeTushareDirectory(missing, args, value) {
  const api = args?.api_name
  if (typeof api !== 'string' || !apiName.test(api) || value?.source !== 'Tushare' ||
      value.kind !== 'catalog' || !Array.isArray(value.interfaces)) return
  if (value.interfaces.length) missing.delete(api)
  else if (missing.size < MAX_MISSING_APIS) missing.add(api)
}

export function missingTushareGuidance(apis) {
  return apis.length ? '本轮 Tushare 目录已确认未提供 '+apis.join('、')+'。跳过这些接口的目录和业务调用，在用户允许的来源中只补缺项。' : ''
}

// Derive the handoff from successful, paired receipts for the same authored
// request. Bind it to the exact provider tools that the parent could resolve.
export function workbenchTushareDirectory(registry, agent, schemas) {
  let catalog, read
  for (const {name} of schemas) {
    if (!name.startsWith('ework__')) continue
    const tool=registry?.get?.(name,agent)
    if (tool?.[Symbol.for('ework.builtin-tushare.catalog')]===true) catalog=name
    if (tool?.[Symbol.for('ework.builtin-tushare.read')]===true) read=name
    if (catalog && read) break
  }
  if (!catalog || !read) return
  const missing=new Set()
  return { catalog, observe:(args,value)=>observeTushareDirectory(missing,args,value),
    snapshot:()=>missing.size ? {catalog,read,apis:[...missing]} : undefined }
}

export function restoreUnavailableTushare(value) {
  if (value===undefined) return
  if (typeof value?.catalog!=='string' || !toolName.test(value.catalog) ||
      typeof value?.read!=='string' || !toolName.test(value.read) || value.catalog===value.read ||
      !Array.isArray(value.apis) || !value.apis.length || value.apis.length>MAX_MISSING_APIS ||
      !value.apis.every(api=>typeof api==='string'&&apiName.test(api)) || new Set(value.apis).size!==value.apis.length)
    throw Error('工作台来源目录交接无效。')
  return Object.freeze({catalog:value.catalog,read:value.read,apis:Object.freeze([...value.apis])})
}

export function inheritedTushareIssue(scope, registry, exec) {
  if (!scope?.apis.includes(exec.arguments?.api_name)) return
  const kind = exec.name===scope.catalog?'catalog':exec.name===scope.read?'read':undefined
  if (kind && registry.get?.(exec.name,exec.agent)?.[Symbol.for('ework.builtin-tushare.'+kind)]===true) return UNSUPPORTED_API
}

function httpUrl(value) {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return
    url.hash = ''
    return url
  } catch {}
}

function rawQuoteFamily(url) {
  if (!url) return
  const {hostname, pathname} = url
  if (hostname === 'qt.gtimg.cn' && (/^\/q=/u.test(pathname) || pathname === '/' && url.searchParams.has('q'))) return 'tencent-quote'
  if (hostname === 'web.ifzq.gtimg.cn' && /^\/appstock\/app\/(?:fqkline\/get|kline\/kline)\/?$/u.test(pathname)) return 'tencent-kline'
  if (hostname === 'hq.sinajs.cn' && (/^\/list=/u.test(pathname) || pathname === '/' && url.searchParams.has('list'))) return 'sina-quote'
}

function normalizedDirectoryArgs(args) {
  return Object.fromEntries(Object.entries(args ?? {}).map(([key, value]) => [
    key,
    typeof value === 'string' && ['query', 'api_name'].includes(key) ? value.trim().replace(/\s+/gu, ' ') : value,
  ]))
}

export function workbenchSourceProgress(request) {
  const suppliedUrls = new Set([...request.matchAll(/https?:\/\/[^\s<>"'`，。；！？、）)\]]+/giu)]
    .map(match => httpUrl(match[0])?.href).filter(Boolean))
  const pending = new Map(), directoryReads = new Map(), emptySearches = new Map(), unsupportedTushare = new Set()
  const failedRawFamilies = new Set(), rawReads = new Set()
  const failedDataPro = new Map()
  let directoryTools = new Set(), latestDataProIssue = ''
  return {
    guidance() {
      return missingTushareGuidance([...unsupportedTushare]) + latestDataProIssue
    },
    updateTools(tools) {
      directoryTools = componentDiscoveryToolNames(tools.filter(tool => tool.name.startsWith('ework__')))
    },
    guard(exec, {tushareRead, tushareCatalog, dataProRead}) {
      const {name, arguments:args, callId} = exec
      if (tushareRead && unsupportedTushare.has(args?.api_name)) return UNSUPPORTED_API
      if (dataProRead && typeof args?.query==='string') {
        const query = JSON.stringify([name,args.query.trim()])
        if (failedDataPro.has(query)) return failedDataPro.get(query)
        if (pending.size<128) pending.set(callId,{name,query})
        return
      }
      if (tushareCatalog || directoryTools.has(name) || name === 'public_data_query' && args?.operation === 'catalog') {
        const key = normalizedDirectoryArgs(args)
        if (directoryReads.get(name)?.some(previous => isDeepStrictEqual(previous, key)) ||
            [...pending.values()].some(call => call.name === name && call.directory && isDeepStrictEqual(call.key, key))) return CATALOG_REUSE
        if (!key.api_name && (emptySearches.get(name) ?? 0) >= 2) return CATALOG_REUSE
        if (pending.size < 128) pending.set(callId, {name, directory:true, tushareCatalog, key})
        return
      }
      if (name !== 'web_fetch') return
      const url = httpUrl(args?.url)
      const family = rawQuoteFamily(url)
      if (!family || suppliedUrls.has(url.href)) return
      if (failedRawFamilies.has(family)) return WEB_UNREADABLE
      if (rawReads.has(url.href)) return '本轮已尝试相同的原始行情地址。复用取得的结果，或通过其他可用来源补查。'
      if (rawReads.size >= MAX_RAW_PROBES) return '本轮已尝试两次原始行情地址。优先复用已取数据，只用适用的结构化来源或可核验的公开网页补齐缺项。'
      rawReads.add(url.href)
      pending.set(callId, {name, family})
    },
    accept(event) {
      if (event.type !== 'tool/result') return
      const message = event.data?.message
      const id = message?.source?.callId
      const call = pending.get(id)
      if (!call) return
      pending.delete(id)
      const result = message?.source?.kind === 'tool' && message.content?.find(block => block.type === 'tool-result' && block.toolCallId === id)
      if (!result) return
      const body = (result.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n')
      if (call.query!==undefined) {
        let value
        try { value=JSON.parse(body.replace(/^Error:\s*/u,'')) } catch { return }
        if (value?.dataset_type!=='stock_finance') return
        const issue=value.error_info?.error_type==='missing_target' && !value.items?.length ? dataProMissingTarget :
          !result.isError && !result.error && value.code===0 && emptyDataProFinanceResult(value) ? dataProNoData : undefined
        if (issue) {
          latestDataProIssue=issue
          if (failedDataPro.size<32) failedDataPro.set(call.query,issue)
        } else if (!result.isError && !result.error && value.code===0 && value.items?.length) {
          latestDataProIssue=''
        }
        return
      }
      if (call.family) {
        if (/^(?:Error:\s*)?The browser could not load readable webpage content\./u.test(body) ||
            /\[网页读取状态：[^\]]+\]\s*(?:(?:var\s+)?(?:v_|hq_str_)[\w]+="";\s*)+$/u.test(body)) failedRawFamilies.add(call.family)
        return
      }
      if (result.isError || result.error || !body.trim()) return
      const calls = directoryReads.get(call.name) ?? []
      if (calls.length < 32) directoryReads.set(call.name, [...calls, call.key])
      let value
      try { value = JSON.parse(body) } catch { return }
      if (value?.kind !== 'catalog' || !Array.isArray(value.interfaces)) return
      if (value.interfaces.length) emptySearches.delete(call.name)
      else if (!call.key.api_name) emptySearches.set(call.name, (emptySearches.get(call.name) ?? 0) + 1)
      if (call.tushareCatalog) observeTushareDirectory(unsupportedTushare,call.key,value)
    }
  }
}

export function workbenchStructuredSourceGuidance(tools, request) {
  const integrations = tools.filter(tool => tool.name.startsWith('ework__'))
  const hasTushare = integrations.some(tool => /\bTushare\b/iu.test(tool.description ?? ''))
  const datapro = integrations.find(tool => /火山方舟专业数据集/u.test(tool.description ?? ''))
  const webSearch = tools.some(tool => tool.name === 'web_search')
  const futures = /期货|\bfutures\b/iu.test(request)
  return [
    '按用户指定来源和联网限制执行。先复用本轮已核验且覆盖同一标的、字段和区间的真实记录。没有缺项就直接交付，有缺项只补缺失数据。行情、时间序列及成批记录优先选择适用的结构化来源。',
    tools.some(tool => tool.name === 'public_data_query') && /美元(?:兑|对)人民币|USD\s*\/?\s*CNY/iu.test(request) ? '美元兑人民币日参考汇率：如果该口径满足需求和来源约束，直接调用 research_workbench_create 提交一张 type:"chart"、publicData:{"profile":"ecb-usd-cny"} 的面板，宿主用 public_data_query 的 ecb-fx 读取 USD 和 CNY、按同一公布日计算交叉汇率，在同一卡展示走势和明细并按日滚动刷新。一次提交即可；省略预查、脚本计算、逐行抄写和额外概览卡。只有用户需要中间价、盘中价格或指定其他来源时才另查对应口径。' : '',
    hasTushare ? 'Tushare 适用于其目录覆盖的国内行情、财报、基金及 ETF 数据。接口已知就直接查询；覆盖不确定时按需求查目录一次，收到空定义后切换到适用且已授权的来源。' : '',
    datapro ? '火山方舟专业数据集（' + datapro.name + '）适用于其覆盖的行情和金融数据。写清市场、证券或合约代码、字段和时间区间，以返回的实际记录核验覆盖与交易日。' : '',
    futures && datapro ? '期货先确定交易所、目标交易日仍在市的合约和所需字段，主力身份须由来源证实。来源约束允许时，用具体代码和已收盘交易日向火山专业数据查询。未指定合约时先从获准的来源核实合约清单及月份。用返回的代码、交易日、逐行行情和覆盖信息核对结果。未识别标的先纠正代码，全空指标及仅有标识的条目按缺失处理，部分有效记录继续复用。' : '',
    webSearch ? '新闻、市场事件、公告或公开原文用 web_search（登录且可用时优先走豆包搜索），关键词简短明确。已给出原链接或已有命中时直接读取相关正文。只有结构化来源无法覆盖所需数值时，才用可核验的公开正文补足。' : '',
    '不要用网页阅读器试探原始报价、K线或 JSONP 接口。不要为已取得的数据重新发现接口或搜索。'
  ].filter(Boolean).join('')
}
