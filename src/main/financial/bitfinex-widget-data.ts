import {
 financialCryptoIntervals,
 financialCryptoPair,
 financialCryptoPeriods,
 type FinancialCryptoPair,
 type FinancialCryptoPeriod
} from '../../../packages/dsh-research-task-runtime/financial-crypto-catalog.js'

type Query = {action?:unknown; symbols?:unknown; period?:unknown; adjustment?:unknown}
type IO = {json:(url:URL) => Promise<unknown>}
type Bar = {date:string; open:number; high:number; low:number; close:number; volume:number|null}
type Quote = ReturnType<typeof quoteFromTrade>
type Result = {
 source:string
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

const source = 'Bitfinex'
const unavailable = 'Bitfinex 现货数据暂不可用，请稍后重试'
const periods: Record<FinancialCryptoPeriod,string> = {'1m':'1m','1h':'1h','1d':'1D','1w':'1W'}
const earliestTimestamp = Date.UTC(2009,0,1)
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const timestamp = (value: unknown): value is number => number(value) && Number.isSafeInteger(value) && value >= earliestTimestamp

function dataFields(pair: FinancialCryptoPair) {
 return {source,timeZone:'UTC',currency:pair.quote,volumeUnit:pair.base}
}

async function rows(io: IO, path: string, limit: number): Promise<unknown[]> {
 const url = new URL(`https://api-pub.bitfinex.com/v2/${path}/hist`)
 url.search = new URLSearchParams({limit:String(limit),sort:'-1'}).toString()
 const value = await io.json(url)
 if (!Array.isArray(value) || value[0] === 'error') throw Error(unavailable)
 return value
}

function quoteFromTrade(pair: FinancialCryptoPair, trade: unknown, daily: unknown[]) {
 if (!Array.isArray(trade)) throw Error(unavailable)
 const [,time,,price] = trade
 if (!timestamp(time) || time > Date.now() + 60_000 || !number(price) || price <= 0) throw Error(unavailable)
 const quotedAt = new Date(time).toISOString()
 const asOf = quotedAt.slice(0,10)
 // The trade and daily candle are separate requests and can straddle midnight.
 const start = Date.parse(asOf)
 const sameDay = daily.find((row): row is unknown[] => Array.isArray(row) && row[0] === start)
 const open = sameDay?.[1]
 const priceChange = number(open) && open > 0 ? price - open : null
 const percentage = priceChange !== null && number(open) ? priceChange / open * 100 : null
 return {
  ...pair.symbol, ...dataFields(pair), price, priceChange, changePercent:number(percentage) ? percentage : null,
  quotedAt, asOf, changeBasis:priceChange === null ? null : '较 UTC 日开盘', quality:'Bitfinex 现货成交'
 }
}

function closedBar(value: unknown, period: FinancialCryptoPeriod, closedAt: number): Bar | null {
 if (!Array.isArray(value)) return null
 const [start,open,close,high,low,volume] = value
 const duration = financialCryptoIntervals[period] * 60_000
 if (!timestamp(start) || start + duration > closedAt || !number(open) || !number(close) || !number(high) || !number(low) ||
  low <= 0 || low > Math.min(open,close) || high < Math.max(open,close)) return null
 const time = new Date(start).toISOString()
 return {date:period === '1m' || period === '1h' ? time : time.slice(0,10),open,high,low,close,volume:number(volume) && volume >= 0 ? volume : null}
}

export async function queryBitfinexFinancialWidget(q: Query, io: IO): Promise<Result> {
 if ((q.action !== 'history' && q.action !== 'quotes') || !Array.isArray(q.symbols) || q.symbols.length > 3) throw Error('Bitfinex 交易对参数无效')
 const pairs = q.symbols.map(value => {
  const pair = value?.market === 'CRYPTO' ? financialCryptoPair(value.code) : undefined
  if (!pair) throw Error('Bitfinex 交易对参数无效')
  return pair
 })
 if (q.action === 'quotes') {
  const quotes: Quote[] = []
  const errors: NonNullable<Result['errors']> = []
  const results = await Promise.allSettled(pairs.map(async pair => {
   const product = `t${pair.base}${pair.quote}`
   const [trades,daily] = await Promise.all([
    rows(io, `trades/${product}`, 1),
    rows(io, `candles/trade:1D:${product}`, 2).catch(() => [])
   ])
   return quoteFromTrade(pair, trades[0], daily)
  }))
  results.forEach((result,index) => {
   if (result.status === 'fulfilled') quotes.push(result.value)
   else errors.push({...pairs[index]!.symbol,error:unavailable})
  })
  return {quotes,errors,source}
 }

 const pair = pairs[0]
 if (!pair || pairs.length !== 1) throw Error('Bitfinex 交易对参数无效')
 const data = {symbol:pair.symbol,...dataFields(pair)}
 if (!financialCryptoPeriods.includes(q.period as FinancialCryptoPeriod)) return {...data,bars:[],error:'Bitfinex 暂不支持所选图表周期'}
 if (q.adjustment !== 'none') return {...data,bars:[],error:'Bitfinex 现货不支持复权'}
 const period = q.period as FinancialCryptoPeriod
 // A request can complete after a period rolls over. Keep the cutoff from
 // before the request so a partial bar in its response never counts as closed.
 const closedAt = Date.now()
 try {
  const values = await rows(io, `candles/trade:${periods[period]}:t${pair.base}${pair.quote}`, 321)
  const byDate = new Map<string,Bar>()
  for (const value of values) {
   const bar = closedBar(value, period, closedAt)
   if (bar && !byDate.has(bar.date)) byDate.set(bar.date,bar)
  }
  const bars = [...byDate.values()].sort((a,b) => a.date.localeCompare(b.date)).slice(-320)
  return bars.length ? {...data,bars,basis:'UTC · 已收盘',nativePeriod:true} : {...data,bars,error:'Bitfinex 暂无有效的已收盘 K 线'}
 } catch {
  return {...data,bars:[],error:unavailable}
 }
}
