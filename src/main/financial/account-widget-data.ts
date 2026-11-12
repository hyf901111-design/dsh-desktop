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

export async function queryAccountFinancialWidget(
  query: Row, options: AccountFinancialSources, signal: AbortSignal, now = new Date()
): Promise<Row> {
  const source = query.source as keyof AccountFinancialSources
  const label = names[source]
  if (source === 'doubao') {
    if (query.action !== 'news') throw Error('豆包搜索仅用于资讯查询')
    if (!options.doubao) throw Error('豆包搜索暂不可用')
    const topic = query.query?.trim() || '财经市场'
    const keyword = Array.from(topic).length <= 93 && !/新闻|要闻|资讯/.test(topic) ? topic + ' 最新新闻' : topic
    const result = await options.doubao(keyword, 8, signal)
    const news = result.sources.flatMap(item => {
      if (typeof item.url !== 'string' || item.url.length > 4096 || !URL.canParse(item.url)) return []
      const url = new URL(item.url)
      const title = item.title?.trim()
      if (!title || !['https:', 'http:'].includes(url.protocol) || url.username || url.password) return []
      const time = item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)) ? item.publishedAt : null
      return [{ id: url.href, title: title.slice(0, 300), source: item.siteName?.trim() || url.hostname, time, url: url.href, summary: item.snippet?.slice(0, 1200) || '' }]
    })
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
