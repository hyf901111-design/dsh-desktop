import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {queryBitfinexFinancialWidget} from '../src/main/financial/bitfinex-widget-data'

const btc = {code:'BTC/USD', market:'CRYPTO', name:'比特币'}
const eth = {code:'ETH/USD', market:'CRYPTO', name:'以太坊'}
const sol = {code:'SOL/USD', market:'CRYPTO', name:'Solana'}
const day = Date.parse('2026-10-07T00:00:00Z')
const now = Date.parse('2026-10-07T03:35:22.123Z')
const candle = (start: number, volume: number | null = 0.0123) => [start, 100, 120, 125, 95, volume]

describe('Bitfinex 现货组件数据', () => {
 beforeEach(() => {vi.spyOn(Date, 'now').mockReturnValue(now)})
 afterEach(() => vi.restoreAllMocks())

 it('使用官方公开端点和最新成交时点，保留各币对的 USD 价格和 UTC 日开盘基准', async () => {
  const json = vi.fn(async (url: URL) => url.pathname.startsWith('/v2/trades/')
   ? [[777, now - 2000, -0.012, 125]]
   : [candle(day), candle(day - 86400_000)])
  const result = await queryBitfinexFinancialWidget({action:'quotes', symbols:[btc, eth, sol]}, {json})
  expect(result).toMatchObject({source:'Bitfinex', errors:[], quotes:[btc, eth, sol].map(symbol => ({
   ...symbol, source:'Bitfinex', price:125, priceChange:25, changePercent:25, changeBasis:'较 UTC 日开盘',
   asOf:'2026-10-07', quotedAt:'2026-10-07T03:35:20.123Z', timeZone:'UTC', currency:'USD', volumeUnit:symbol.code.slice(0,3)
  }))})
  expect(json.mock.calls.map(([url]) => [url.origin, url.pathname, Object.fromEntries(url.searchParams)])).toEqual(
   ['tBTCUSD','tETHUSD','tSOLUSD'].flatMap(code => [
    ['https://api-pub.bitfinex.com', `/v2/trades/${code}/hist`, {limit:'1',sort:'-1'}],
    ['https://api-pub.bitfinex.com', `/v2/candles/trade:1D:${code}/hist`, {limit:'2',sort:'-1'}]
   ])
  )
 })

 it('保留可用报价并逐个报告失败，跨 UTC 日期不计算涨跌', async () => {
  const json = vi.fn(async (url: URL): Promise<unknown> => {
   if (url.pathname.includes('tETHUSD')) throw Error('upstream unavailable')
   return url.pathname.startsWith('/v2/trades/') ? [[777, now, 1, 125]] : [candle(day - 86400_000)]
  })
  expect(await queryBitfinexFinancialWidget({action:'quotes', symbols:[btc,eth]}, {json})).toMatchObject({
   quotes:[{...btc,price:125,priceChange:null,changePercent:null,changeBasis:null}],
   errors:[{...eth,error:expect.any(String)}]
  })
  json.mockResolvedValueOnce([[777, now + 3600_000, 1, 125]])
  expect(await queryBitfinexFinancialWidget({action:'quotes', symbols:[btc]}, {json})).toMatchObject({quotes:[],errors:[{...btc}]})
  json.mockClear()
  await expect(queryBitfinexFinancialWidget({action:'quotes', symbols:[{...btc,code:'BTC/USDT'}]}, {json})).rejects.toThrow('交易对')
  expect(json).not.toHaveBeenCalled()
 })

 it.each([
  ['1m', '1m', '2026-10-07T03:35:00.000Z', 60_000, '2026-10-07T03:34:00.000Z'],
  ['1h', '1h', '2026-10-07T03:00:00.000Z', 3600_000, '2026-10-07T02:00:00.000Z'],
  ['1d', '1D', '2026-10-07T00:00:00.000Z', 86400_000, '2026-10-06'],
  ['1w', '1W', '2026-10-05T00:00:00.000Z', 604800_000, '2026-09-28']
 ] as const)('使用原生 %s K 线，保留 OHLC、成交量和已收盘的时间戳', async (period, interval, current, duration, date) => {
  const open = Date.parse(current)
  const json = vi.fn(async (_url: URL) => [
   candle(open),
   candle(open - duration, 0),
   candle(open - 4 * duration, null),
   candle(open - duration, 42),
   [open - 2 * duration, 100, 110, 95, 80, 10]
  ])
  const result = await queryBitfinexFinancialWidget({action:'history', symbols:[btc], period, adjustment:'none'}, {json})
  expect(json.mock.calls[0]![0].pathname).toBe(`/v2/candles/trade:${interval}:tBTCUSD/hist`)
  expect(result).toMatchObject({symbol:btc,source:'Bitfinex',timeZone:'UTC',currency:'USD',volumeUnit:'BTC',nativePeriod:true})
  expect(result.bars).toHaveLength(2)
  expect(result.bars?.[0]?.volume).toBeNull()
  expect(result.bars?.[1]).toEqual({date,open:100,high:125,low:95,close:120,volume:0})
 })

 it('不支持的周期和复权无需请求，供应商错误返回空图表', async () => {
  const json = vi.fn(async (_url: URL) => ['error', 10001, 'invalid request'])
  const query = {action:'history',symbols:[sol],period:'1d',adjustment:'none'}
  expect(await queryBitfinexFinancialWidget({...query,period:'1mo'}, {json})).toMatchObject({bars:[],error:expect.stringContaining('周期')})
  expect(await queryBitfinexFinancialWidget({...query,adjustment:'forward'}, {json})).toMatchObject({bars:[],error:expect.stringContaining('复权')})
  expect(json).not.toHaveBeenCalled()
  expect(await queryBitfinexFinancialWidget(query, {json})).toMatchObject({bars:[],source:'Bitfinex',error:expect.any(String)})
 })
})
