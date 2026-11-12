import {describe, expect, it, vi} from 'vitest'
import {queryKrakenFinancialWidget} from '../src/main/financial/kraken-widget-data'
import {findFinancialCryptoSymbol, financialCryptoPeriods} from '../packages/dsh-research-task-runtime/financial-crypto-catalog.js'

const btc = {code:'BTC/USD', market:'CRYPTO', name:'比特币'}
const day = Date.parse('2026-10-09T00:00:00Z') / 1000
const candle = (time: number, volume = '0.0123') => [time, '100', '125', '95', '120', '112', volume, 3]
const reply = (value: unknown, code = btc.code) => ({error: [], result: {[code]: value}})

describe('Kraken 现货组件数据', () => {
 it('精确识别原生币对与别名，避免把 ETF 或其他计价币归为美元现货', () => {
  for (const query of ['BTC', 'xbt-usd', 'Bitcoin', '比特币', 'ＢＴＣ ／ ＵＳＤ']) {
   expect(findFinancialCryptoSymbol(query)).toEqual(btc)
  }
  expect(findFinancialCryptoSymbol('ETH')).toMatchObject({code:'ETH/USD', market:'CRYPTO'})
  expect(findFinancialCryptoSymbol('Solana')).toMatchObject({code:'SOL/USD', market:'CRYPTO'})
  for (const query of ['IBIT', '比特币ETF', 'BTC/USDT', 'BTC/JPY', 'ETHA']) {
   expect(findFinancialCryptoSymbol(query)).toBeUndefined()
  }
 })

 it('报价与时间取自同一笔真实成交，涨跌参照成交日期的 UTC 日开盘', async () => {
  const json = vi.fn(async (url: URL) => url.pathname.endsWith('/Trades')
   ? reply([['125', '0.5', day + 1810.25, 'b', 'm', '', 11]])
   : reply([candle(day - 86400), candle(day)]))
  const result = await queryKrakenFinancialWidget({action:'quotes', symbols:[btc]}, {json})
  expect(result).toMatchObject({source:'Kraken', errors:[], quotes:[{
   ...btc, price:125, priceChange:25, changePercent:25, changeBasis:'较 UTC 日开盘',
   asOf:'2026-10-09', quotedAt:'2026-10-09T00:30:10.250Z', timeZone:'UTC', currency:'USD', volumeUnit:'BTC'
  }]})
  expect(json.mock.calls.map(([url]) => [url.origin, url.pathname, Object.fromEntries(url.searchParams)])).toEqual([
   ['https://api.kraken.com', '/0/public/Trades', {pair:'XBTUSD', assetVersion:'1', count:'1'}],
   ['https://api.kraken.com', '/0/public/OHLC', {pair:'XBTUSD', assetVersion:'1', interval:'1440'}]
  ])
 })

 it('UTC 换日或基准失败时保留有时点的现货价，涨跌保留缺失', async () => {
  const json = vi.fn(async (url: URL) => url.pathname.endsWith('/Trades')
   ? reply([['125', '0.5', day + 2]])
   : reply([candle(day - 86400)]))
  const result = await queryKrakenFinancialWidget({action:'quotes', symbols:[btc]}, {json})
  expect(result).toMatchObject({quotes:[{price:125, priceChange:null, changePercent:null, quotedAt:'2026-10-09T00:00:02.000Z'}], errors:[]})
  json.mockImplementation(async url => {
   if (url.pathname.endsWith('/OHLC')) throw Error('OHLC unavailable')
   return reply([['125', '0.5', day + 2]])
  })
  expect(await queryKrakenFinancialWidget({action:'quotes', symbols:[btc]}, {json})).toEqual(result)
 })

 it('无效成交或返回其他交易对时保持空行情，未知币对无需请求', async () => {
  const json = vi.fn(async () => reply([['100', '1', day]], 'ETH/USD'))
  const wrongPair = await queryKrakenFinancialWidget({action:'quotes', symbols:[btc]}, {json})
  expect(wrongPair).toMatchObject({quotes:[], errors:[{code:'BTC/USD', error:expect.any(String)}]})
  json.mockResolvedValue(reply([['0', '1', day]]))
  expect(await queryKrakenFinancialWidget({action:'quotes', symbols:[btc]}, {json})).toMatchObject({quotes:[], errors:[{code:'BTC/USD'}]})
  json.mockClear()
  await expect(queryKrakenFinancialWidget({action:'quotes', symbols:[{...btc, code:'BTC/USDT'}]}, {json})).rejects.toThrow('交易对')
  expect(json).not.toHaveBeenCalled()
 })

 it('保留分钟和小时 UTC 时间、OHLC 顺序及基础币成交量，只绘制已收盘 K 线', async () => {
  const json = vi.fn(async (_url: URL) => reply([candle(day, '0'), candle(day + 3600), candle(day + 7200)]))
  expect(financialCryptoPeriods).toEqual(['1m','1h','1d','1w'])
  for (const [period, interval] of [['1m','1'], ['1h','60'], ['1d','1440'], ['1w','10080']] as const) {
   const rows = ['1m','1h'].includes(period) ? [candle(day, '0'), candle(day + Number(interval) * 60), candle(day + Number(interval) * 120)] : [candle(day, '0'), candle(day + Number(interval) * 60)]
   json.mockResolvedValueOnce(reply(rows))
   const result = await queryKrakenFinancialWidget({action:'history', symbols:[btc], period, adjustment:'none'}, {json})
   expect(json.mock.calls.at(-1)![0].searchParams.get('interval')).toBe(interval)
   expect(result).toMatchObject({symbol:btc, source:'Kraken', volumeUnit:'BTC', currency:'USD', timeZone:'UTC', nativePeriod:true})
   expect(result.bars).toHaveLength(rows.length - 1)
   expect(result.bars?.[0]).toMatchObject({date:['1m','1h'].includes(period)?'2026-10-09T00:00:00.000Z':'2026-10-09', open:100, high:125, low:95, close:120, volume:0})
  }
 })

 it('不支持的周期和复权返回显式错误，业务错误或坏 OHLC 不构成有效图表', async () => {
  const json = vi.fn(async (_url: URL): Promise<unknown> => ({error:['EQuery:Unknown asset pair'], result:{}}))
  const request = {action:'history', symbols:[btc], period:'1d', adjustment:'none'}
  expect(await queryKrakenFinancialWidget({...request, period:'1mo'}, {json})).toMatchObject({bars:[], error:expect.stringContaining('周期')})
  expect(await queryKrakenFinancialWidget({...request, adjustment:'forward'}, {json})).toMatchObject({bars:[], error:expect.stringContaining('复权')})
  expect(json).not.toHaveBeenCalled()
  expect(await queryKrakenFinancialWidget(request, {json})).toMatchObject({bars:[], error:expect.any(String)})
  json.mockResolvedValueOnce(reply([[day, '100', '95', '90', '120', '112', '10', 3], candle(day + 86400)]))
  expect(await queryKrakenFinancialWidget(request, {json})).toMatchObject({bars:[], error:expect.any(String)})
 })
})
