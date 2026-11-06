import { queryTushare } from '../tushare-mcp.js'
import { validDate, businessText } from '../../../packages/dsh-fund-research-runtime/financial-contract.js'

const date = value => {
  if (typeof value !== 'string' || !/^\d{8}$/.test(value)) return null
  const iso = `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`
  return validDate(iso) ? iso : null
}
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0

// Only bridge like-for-like business semantics. Intraday quotes, adjusted bars,
// and provider-specific analysis keep their existing routes.
export async function tushareFinancial(q, env, fetchImpl, signal) {
  if (!env.TUSHARE_TOKEN?.trim()) return null
  const history = q.intent === 'history' && ['stock','index','etf'].includes(q.asset) && q.interval === '1d' && q.adjustment === 'none'
  const nav = q.intent === 'nav' && ['fund','etf'].includes(q.asset) && ['unit','accumulated','adjusted'].includes(q.nav_basis)
  const profile = q.intent === 'profile' && ['fund','etf'].includes(q.asset)
  if (!history && !nav && !profile) return null
  const code = q.asset === 'fund' ? `${q.symbols[0]}.OF` : q.symbols[0]
  const api_name = history ? {stock:'daily',index:'index_daily',etf:'fund_daily'}[q.asset] : nav ? 'fund_nav' : 'fund_basic'
  const navField = {unit:'unit_nav',accumulated:'accum_nav',adjusted:'adj_nav'}[q.nav_basis]
  const fields = history ? 'ts_code,trade_date,open,high,low,close' : nav ? `ts_code,nav_date,${navField}` : 'ts_code,name,management,found_date'
  const params = {ts_code:code,...history ? {start_date:q.start.replaceAll('-',''),end_date:q.end.replaceAll('-','')} : {},
    ...nav && q.as_of ? {nav_date:q.as_of.replaceAll('-','')} : {},...profile ? {market:q.asset === 'fund' ? 'O' : 'E'} : {}}
  const response = await queryTushare({api_name,params,fields,limit:1000}, {...env,fetch:fetchImpl}, signal)
  const raw = response.structuredContent
  if (response.isError || !raw?.records?.length || raw.records.some(row => row.ts_code !== code)) return null
  const rows = []
  const add = (metric,value,unit,as_of,price_basis) => rows.push({instrument:q.symbols[0],metric,value,unit,as_of,price_basis,quality_state:as_of ? 'dated' : 'unknown'})
  if (history) {
    const dates = new Set()
    for (const row of raw.records) {
      const at = date(row.trade_date)
      if (!at || at < q.start || at > q.end || dates.has(at) || ![row.open,row.high,row.low,row.close].every(positive) || row.low > Math.min(row.open,row.close) || row.high < Math.max(row.open,row.close)) return null
      dates.add(at)
    }
    for (const row of [...raw.records].sort((a,b)=>a.trade_date.localeCompare(b.trade_date)).slice(-35)) {
      for (const [field,label] of [['open','开盘价'],['high','最高价'],['low','最低价'],['close','收盘价']]) add(label,row[field],q.asset === 'index' ? '点' : 'CNY',date(row.trade_date),'1d 不复权')
    }
  } else if (nav) {
    const candidates = raw.records.filter(row => date(row.nav_date) && positive(row[navField]) && (!q.as_of || date(row.nav_date) === q.as_of))
      .sort((a,b)=>b.nav_date.localeCompare(a.nav_date))
    if (!candidates.length) return null
    const row = candidates[0], label = {unit:'单位净值',accumulated:'累计净值',adjusted:'复权净值'}[q.nav_basis]
    add(label,row[navField],'CNY',date(row.nav_date),label)
  } else {
    if (raw.records.length !== 1 || !businessText(raw.records[0].name)) return null
    const row = raw.records[0]
    add('基金名称',row.name,'text',null,'基金资料')
    if (businessText(row.management)) add('基金管理人',row.management,'text',null,'基金资料')
    if (date(row.found_date)) add('成立日期',date(row.found_date),'date',date(row.found_date),'基金资料')
  }
  return {rows,raw,truncated:history && (raw.records.length > 35 || raw.pagination.possiblyMore)}
}
