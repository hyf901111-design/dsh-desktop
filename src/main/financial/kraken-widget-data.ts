import {
 financialCryptoIntervals,
 financialCryptoPair,
 financialCryptoPeriods,
 findFinancialCryptoSymbol,
 type FinancialCryptoPair,
 type FinancialCryptoPeriod
} from '../../../packages/dsh-research-task-runtime/financial-crypto-catalog.js'

type Query = {action?:unknown; query?:unknown; symbols?:unknown; period?:unknown; adjustment?:unknown}
type IO = {json:(url:URL) => Promise<unknown>}
type Bar = {date:string; open:number; high:number; low:number; close:number; volume:number|null}
type Quote = ReturnType<typeof quoteFromTrade>
type Result = {
 source:string
 symbols?:FinancialCryptoPair['symbol'][]
 symbol?:FinancialCryptoPair['symbol']
 quotes?:Quote[]
 errors?:Array<FinancialCryptoPair['symbol'] & {error:string}>
 bars?:Bar[]
 basis?:string
 nativePeriod?:boolean
 currency?:string
 volumeUnit?:string
 timeZone?:string
 error?:string
}

const source = 'Kraken'
const timeZone = 'UTC'
const unavailable = 'Kraken 现货数据暂不可用，请稍后重试'
const earliestCryptoTrade = Date.UTC(2009,0,3)

function record(value: unknown): Record<string,unknown> | undefined {
 return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : undefined
}

function number(value: unknown): number | null {
 if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+(?:\.\d+)?$/.test(value))) return null
 const parsed = Number(value)
 return Number.isFinite(parsed) ? parsed : null
}

function utcTime(value: unknown): string | null {
 const seconds = number(value)
 if (seconds === null) return null
 const timestamp = seconds * 1000
 if (timestamp < earliestCryptoTrade || timestamp > Date.now() + 60_000) return null
 return new Date(timestamp).toISOString()
}

function dataFields(pair: FinancialCryptoPair) {
 return {source, timeZone, currency:pair.quote, volumeUnit:pair.base}
}

async function rows(io: IO, pair: FinancialCryptoPair, endpoint: 'OHLC'|'Trades', params: {interval:string}|{count:string}): Promise<unknown[]> {
 const url = new URL(`https://api.kraken.com/0/public/${endpoint}`)
 url.search = new URLSearchParams({pair:pair.krakenCode, assetVersion:'1', ...params}).toString()
 const envelope = record(await io.json(url))
 const values = record(envelope?.result)?.[pair.symbol.code]
 if (!Array.isArray(envelope?.error) || envelope.error.length || !Array.isArray(values)) throw Error(unavailable)
 return values
}

function quoteFromTrade(pair: FinancialCryptoPair, trade: unknown, daily: unknown) {
 if (!Array.isArray(trade)) throw Error(unavailable)
 const price = number(trade[0])
 const quotedAt = utcTime(trade[2])
 if (price === null || price <= 0 || !quotedAt) throw Error(unavailable)
 const asOf = quotedAt.slice(0,10)
 // Kraken's live daily candle starts at midnight UTC. Match its date to the
 // actual trade, since the two public responses can straddle midnight.
 const open = Array.isArray(daily) && utcTime(daily[0])?.slice(0,10) === asOf ? number(daily[1]) : null
 const priceChange = open !== null && open > 0 ? price - open : null
 const percentage = priceChange !== null && open !== null ? priceChange / open * 100 : null
 const changePercent = percentage !== null && Number.isFinite(percentage) ? percentage : null
 return {
  ...pair.symbol, ...dataFields(pair), price, priceChange, changePercent, asOf, quotedAt,
  changeBasis:priceChange === null ? null : '较 UTC 日开盘', quality:'Kraken 现货成交'
 }
}

function bar(value: unknown, timed: boolean): Bar | null {
 if (!Array.isArray(value) || !Number.isInteger(value[0])) return null
 const time = utcTime(value[0])
 const open = number(value[1]), high = number(value[2]), low = number(value[3]), close = number(value[4])
 if (!time || open === null || high === null || low === null || close === null ||
  low <= 0 || low > Math.min(open, close) || high < Math.max(open, close)) return null
 const volume = number(value[6])
 return {date:timed ? time : time.slice(0,10), open, high, low, close, volume:volume !== null && volume >= 0 ? volume : null}
}

export async function queryKrakenFinancialWidget(q: Query, io: IO): Promise<Result> {
 if (q.action === 'search') {
  const symbol = findFinancialCryptoSymbol(q.query)
  return {symbols:symbol ? [symbol] : [], source}
 }
 if (!['history','quotes'].includes(String(q.action)) || !Array.isArray(q.symbols) || q.symbols.length > 3) throw Error('Kraken 交易对参数无效')
 const pairs = q.symbols.map(value => {
  const symbol = record(value)
  const pair = symbol?.market === 'CRYPTO' ? financialCryptoPair(symbol.code) : undefined
  if (!pair) throw Error('Kraken 交易对参数无效')
  return pair
 })
 if (q.action === 'quotes') {
  const quotes:Quote[] = []
  const errors:NonNullable<Result['errors']> = []
  const results = await Promise.allSettled(pairs.map(async pair => {
   const [trades, daily] = await Promise.all([
    rows(io, pair, 'Trades', {count:'1'}),
    rows(io, pair, 'OHLC', {interval:'1440'}).catch(() => [])
   ])
   return quoteFromTrade(pair, trades.at(-1), daily.at(-1))
  }))
  results.forEach((result,index) => {
   if (result.status === 'fulfilled') quotes.push(result.value)
   else errors.push({...pairs[index]!.symbol, error:unavailable})
  })
  return {quotes, errors, source}
 }
 const pair = pairs[0]
 if (!pair || pairs.length !== 1) throw Error('Kraken 交易对参数无效')
 const data = {symbol:pair.symbol, ...dataFields(pair)}
 if (!financialCryptoPeriods.includes(q.period as FinancialCryptoPeriod)) return {...data,bars:[],error:'Kraken 暂不支持所选图表周期'}
 if (q.adjustment !== 'none') return {...data,bars:[],error:'Kraken 现货不支持复权'}
 const period = q.period as FinancialCryptoPeriod
 try {
  const values = await rows(io, pair, 'OHLC', {interval:String(financialCryptoIntervals[period])})
  // The final entry is always the current, uncommitted candle.
  const byDate = new Map<string,Bar>()
  for (const value of values.slice(0,-1)) {
   const row = bar(value, period === '1m' || period === '1h')
   if (row && !byDate.has(row.date)) byDate.set(row.date,row)
  }
  const bars = [...byDate.values()].sort((a,b) => a.date.localeCompare(b.date)).slice(-320)
  return bars.length ? {...data,bars,basis:'UTC · 已收盘',nativePeriod:true} : {...data,bars,error:'Kraken 暂无有效的已收盘 K 线'}
 } catch {
  return {...data,bars:[],error:unavailable}
 }
}
