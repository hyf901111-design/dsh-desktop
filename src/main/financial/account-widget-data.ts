import { readRpc } from '../../../services/fund-data/mcp-wire.js'
import type { BrowserSearchResult } from '../search/browser-search-controller'
import { normalizeFinancialBars } from './widget-data'

type Row = Record<string, any>
type SymbolRef = { code: string; market: string; name: string }
type McpRequest = (body: string, signal: AbortSignal) => Promise<Response>
export type AccountFinancialSources = {
  tushare?: McpRequest
  datapro?: McpRequest
  doubao?: (query: string, count: number, signal: AbortSignal) => Promise<BrowserSearchResult>
}

const names = { tushare: 'Tushare', datapro: '火山方舟专业数据集', doubao: '豆包搜索' }
const dayInChina = (date: Date) => date.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
const mainland = (symbol: SymbolRef) => ['SH', 'SZ', 'BJ'].includes(symbol.market)
const exchangeTradedFund = (symbol: SymbolRef) =>
  symbol.market === 'SH' && /^(?:50|51|56|58)\d{4}$/.test(symbol.code) ||
  symbol.market === 'SZ' && /^(?:15|16)\d{4}$/.test(symbol.code)

async function callFinancialMcp(request: McpRequest, tool: string, args: Row, source: string, signal: AbortSignal): Promise<Row> {
  const response = await request(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } }), signal)
  if (!response.ok) {
    await response.body?.cancel()
    throw Error(response.status === 429 ? `${source}请求过于频繁，请稍后重试` : `${source}暂时不可用`)
  }
  const reply = await readRpc(response, 1, signal)
  const result = reply.result
  if (!result || result.isError) {
    const detail = result?.content?.find((entry: Row) => entry.type === 'text')?.text
    throw Error(typeof detail === 'string' && /权限|积分/.test(detail) ? `${source}当前行情接口权限不足` : `${source}未返回可用行情`)
  }
  if (result.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent
  const text = result.content?.find((entry: Row) => entry.type === 'text')?.text
  try {
    if (typeof text === 'string') return JSON.parse(text)
  } catch {}
  throw Error(`${source}返回了无法解析的数据`)
}

function dateRange(period: string, now: Date, source: 'tushare' | 'datapro') {
  const day = 86400000
  // Ask DataPro for a bounded interval ending at the latest plausible close.
  // Its source publishes a limited date sequence, independently of Tushare.
  const hour = Number(now.toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', hour: '2-digit', hourCycle: 'h23' }))
  const end = source === 'datapro' && hour < 16 ? new Date(now.getTime() - day) : now
  const days = source === 'datapro' ? 19 : period === '1w' ? 370 : 180
  return [dayInChina(new Date(end.getTime() - days * day)), dayInChina(end)] as const
}

function quoteFromBar(symbol: SymbolRef, bars: ReturnType<typeof normalizeFinancialBars>, source: string, reported?: Row) {
  const last = bars.at(-1)!
  return { ...symbol, price: last.close,
    priceChange: typeof reported?.change === 'number' && Number.isFinite(reported.change) ? reported.change : null,
    changePercent: typeof reported?.pct_chg === 'number' && Number.isFinite(reported.pct_chg) ? reported.pct_chg : null,
    asOf: last.date, quotedAt: null, timeZone: 'Asia/Shanghai', currency: 'CNY', source, quality: '收盘日线' }
}

function newsDisplayText(value?: string): string {
  const text = value?.trim() ?? ''
  // Some search snippets split Chinese into search terms, including the headline.
  if ((text.match(/\p{Script=Han}[ \t]+(?=\p{Script=Han})/gu)?.length ?? 0) < 2) return text
  return text.replace(/(\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, '$1')
    .replace(/[ \t]+([，。！？；：、）”’,;!?])/gu, '$1')
    .replace(/([，。！？；：、（“‘])[ \t]+/gu, '$1')
}

function publisherSectionIndex(path: string, title: string): boolean {
  if (/\/(?:articles?|posts?|stor(?:y|ies)|details?|20\d{2}(?:[-/]?\d{2})*)\//i.test(path)) return false
  if (/\/(?:list|channel|category)[_-]\d+(?:\.s?html?)?\/?$/i.test(path)) return true
  const indexFile = /\/(?:index|node_\d+)\.s?html?$/i.test(path)
  const sectionPath = /(?:\/|[-_])(?:news|latest|updates|archives?)\/?$/i.test(path)
  const directory = /\/[a-z]+(?:_[a-z]+)*\/$/i.test(path)
  if (!indexFile && !sectionPath && !directory) return false
  const [heading] = title.split(/[_|｜]|\s+[-–—]\s+|[-—]{2,}/u)
  const label = heading?.replace(/\s+/gu, '') ?? ''
  return /^[\p{Script=Han}A-Za-z]{0,10}(?:新闻|快讯|资讯|要闻|频道|首页|热点|推荐|扫描)$/u.test(label) ||
    /(?:^|[_|｜])[\p{Script=Han}A-Za-z]{0,8}频道(?:[_|｜]|$)/u.test(title)
}

export async function queryAccountFinancialWidget(
  query: Row, options: AccountFinancialSources, signal: AbortSignal, now = new Date()
): Promise<Row> {
  const source = query.source as keyof AccountFinancialSources
  const label = names[source]
  if (source === 'doubao') {
    if (query.action !== 'news') throw Error('豆包搜索仅用于资讯查询')
    if (!options.doubao) throw Error('豆包搜索暂不可用')
    const topic = query.query?.trim() || '财经市场'
    const hasWindow = /\d{4}年|\d{4}[-/]\d|回顾|历史|昨天|今天|本[周月年]|上[周月]|去[年冬]|(?:近|过去)[一二两三四五六七八九十半\d]+[天周年月]/u.test(topic)
    const suffix = hasWindow ? ' 新闻报道原文' : ` 近一周新闻报道原文（截至${dayInChina(now)}）`
    const keyword = Array.from(topic + suffix).length <= 100 ? topic + suffix : topic
    const result = await options.doubao(keyword, 8, signal)
    const seenTitles = new Set<string>()
    const seenUrls = new Set<string>()
    const news = result.sources.flatMap(item => {
      if (typeof item.url !== 'string' || item.url.length > 4096 || !URL.canParse(item.url)) return []
      const url = new URL(item.url)
      const title = newsDisplayText(item.title)
      if (!title || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) return []
      // A search hit can be a feed, a search form or a profile instead of a story.
      const canonical = new URL(url)
      canonical.hash = ''
      for (const key of [...canonical.searchParams.keys()]) {
        if (/^(?:utm_|spm$|fbclid$)/i.test(key)) canonical.searchParams.delete(key)
      }
      const path = canonical.pathname.replace(/\/+$/, '')
      const indexPage = /^(?:\/(?:zh(?:-cn)?|en))?(?:\/(?:news|daily|latest|index(?:\.html?)?))?$/i.test(path)
      const searchPage = /(?:^|\/)(?:search|searchresult)(?:\/|$)/i.test(path)
      const articleKey = [...canonical.searchParams].some(([key, value]) => /^(?:p|post|article|story|item|aid|id)(?:_?id)?$/i.test(key) && value.trim())
      const pagedFeed = /(?:^|[/-])(?:[a-z]+[_-])?(?:news|archive[s]?|category|tag)(?:$|\/)/i.test(path) && canonical.searchParams.has('page')
      const archiveTitle = /\barchives?\s*[|·]|(?:的\s*微博|的\s*个人主页)$/i.test(title)
      if (searchPage || !articleKey && (indexPage || publisherSectionIndex(canonical.pathname, title)) || pagedFeed || archiveTitle) return []
      // An undated story has no verified publication time. A dated story must fit the requested rolling week.
      const published = Date.parse(item.publishedAt ?? '')
      const time = item.publishedAt && Number.isFinite(published) && published !== 0 ? item.publishedAt : null
      if (!hasWindow && time && (published < now.getTime() - 7 * 86400_000 || published > now.getTime())) return []
      const titleKey = title.replace(/\s+/gu, '').toLowerCase()
      if (seenTitles.has(titleKey) || seenUrls.has(canonical.href)) return []
      seenTitles.add(titleKey)
      seenUrls.add(canonical.href)
      return [{ id: url.href, title: title.slice(0, 300), source: item.siteName?.trim() || url.hostname, time, url: url.href, summary: newsDisplayText(item.snippet).slice(0, 1200) }]
    }).sort((a, b) => (Date.parse(b.time ?? '') || 0) - (Date.parse(a.time ?? '') || 0))
    return { source: label, news }
  }
  if (source !== 'tushare' && source !== 'datapro') throw Error('未登记的金融数据源')
  const request = options[source]
  if (!request) throw Error(`${label}暂时不可用`)
  if (!['quotes', 'history'].includes(query.action) || query.symbols.length !== 1 || !mainland(query.symbols[0]) ||
      query.asset !== undefined || query.action === 'history' && (query.adjustment !== 'none' || !['1d', '1w'].includes(query.period)))
    throw Error(`${label}当前提供沪深北证券的未复权日线及周线`)
  const symbol: SymbolRef = query.symbols[0]
  const ticker = `${symbol.code}.${symbol.market}`
  const [start, end] = dateRange(query.period, now, source)
  let rows: Row[], basis = '收盘日线 · 不复权', volumeUnit: string, sourceUrl: string | undefined
  if (source === 'tushare') {
    const api = exchangeTradedFund(symbol) ? 'fund_daily' : 'daily'
    const result = await callFinancialMcp(request, 'tushare_query', {
      api_name: api, params: { ts_code: ticker, start_date: start.replaceAll('-', ''), end_date: end.replaceAll('-', '') },
      fields: 'ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol', limit: 320
    }, label, signal)
    if (result.source !== 'Tushare' || result.api !== api || !Array.isArray(result.records)) throw Error('Tushare 未返回所选行情接口的数据')
    rows = result.records.filter(row => row?.ts_code === ticker && /^\d{8}$/.test(row.trade_date ?? ''))
      .map(row => ({ ...row, date: row.trade_date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'), volume: row.vol }))
    volumeUnit = '手'
    sourceUrl = api === 'fund_daily' ? 'https://tushare.pro/document/2?doc_id=127' : 'https://tushare.pro/document/2?doc_id=27'
  } else {
    const name = /^[\p{L}\p{N} .·()（）-]{1,40}$/u.test(symbol.name) ? symbol.name + ' ' : ''
    const result = await callFinancialMcp(request, 'dataPro_search', {
      query: `${name}${ticker} ${start} 至 ${end} 日线行情：交易日、开盘价、最高价、最低价、收盘价、成交量、成交额，未复权口径`
    }, label, signal)
    if (result.code !== 0 || result.dataset_type !== 'stock_finance' || !Array.isArray(result.items))
      throw Error('火山方舟专业数据集未返回所选证券日线')
    rows = result.items.flatMap(item => item?.证券代码 === ticker && Array.isArray(item.records) ? item.records : [])
      .filter(row => row && (row.证券代码 === undefined || row.证券代码 === ticker) && !row.是否休市 && !row.是否停牌 && !row.是否未上市 && !row.是否已退市)
      .map(row => ({ date: row.日期, open: row.开盘价, high: row.最高价, low: row.最低价, close: row.收盘价, volume: row.成交量 }))
    if (result.query_info?.result_coverage?.status === 'partial') basis += ' · 部分日期，以实际返回为准'
    volumeUnit = '股'
    sourceUrl = 'https://docs.volcengine.com/docs/ark/agent-plan-personal-datapro'
  }
  const inRange = rows.filter(row => typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.date >= start && row.date <= end)
  const bars = normalizeFinancialBars(inRange)
  if (!bars.length) throw Error(`${label}未返回该证券的有效收盘日线`)
  const last = bars.at(-1)!
  const quotes = [quoteFromBar(symbol, bars, label, inRange.find(row => row.date === last.date))]
  return { source: label, sourceUrl, quotes, errors: [],
    ...(query.action === 'history' ? { symbol, bars, basis, volumeUnit, nativePeriod: query.period === '1d' } : {}) }
}
