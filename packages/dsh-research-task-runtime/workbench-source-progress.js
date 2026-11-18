import { isDeepStrictEqual } from 'node:util'
import { componentDiscoveryToolNames } from './component-source-binding.js'

const CATALOG_REUSE = '本轮已读取相同目录或接口定义。复用已返回的定义，或按原授权改用覆盖所需字段的其他来源。'
const UNSUPPORTED_API = '本轮目录确认未提供该接口。请按原授权选择其他可用来源。'
const WEB_UNREADABLE = '网页读取器无法读取该行情接口格式。改用适用的结构化数据工具，或读取可核验的公开网页正文。'
const MAX_RAW_PROBES = 2

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
  let directoryTools = new Set()
  return {
    updateTools(tools) {
      directoryTools = componentDiscoveryToolNames(tools.filter(tool => tool.name.startsWith('ework__')))
    },
    guard(exec, {tushareRead, tushareCatalog}) {
      const {name, arguments:args, callId} = exec
      if (tushareRead && unsupportedTushare.has(args?.api_name)) return UNSUPPORTED_API
      if (directoryTools.has(name) || name === 'public_data_query' && args?.operation === 'catalog') {
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
      else if (call.tushareCatalog && value.source === 'Tushare') unsupportedTushare.add(call.key.api_name)
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
    hasTushare ? 'Tushare 适用于其已覆盖的国内行情、合约历史、财报、基金及 ETF 数据。接口已知就直接查询；接口不确定时只查一次对应定义，按支持的参数、字段和批量范围取数。' : '',
    datapro ? '火山方舟专业数据集（' + datapro.name + '）适用于其覆盖的行情和金融数据。写清市场、证券或合约代码、字段和时间区间，以返回的实际记录核验覆盖与交易日。' : '',
    futures && datapro && hasTushare ? '期货优先使用已知支持目标市场和频率的接口。Tushare 未覆盖的市场可用火山专业数据只补缺项；逐条核对代码和日期，目录和检索摘要不算交易记录。' : '',
    webSearch ? '新闻、市场事件、公告或公开原文用 web_search（登录且可用时优先走豆包搜索），关键词简短明确。已给出原链接或已有命中时直接读取相关正文。只有结构化来源无法覆盖所需数值时，才用可核验的公开正文补足。' : '',
    '不要用网页阅读器试探原始报价、K线或 JSONP 接口。不要为已取得的数据重新发现接口或搜索。'
  ].filter(Boolean).join('')
}
