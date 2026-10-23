import { decimal } from './numbers.mjs'
export const METRICS = {
  revenue: ['营业收入', 'Revenue', 'revenue'], totalRevenue: ['营业总收入', 'Total revenue', 'totalRevenue'], costOfRevenue: ['营业成本', 'Cost of revenue', 'costOfRevenue'],
  netIncome: ['净利润', 'Net income', 'netIncome'], netIncomeAttributableToParent: ['归母净利润', '归属于上市公司股东的净利润', '归属于母公司股东的净利润', 'netIncomeAttributableToParent'], operatingProfit: ['营业利润', 'Operating profit', 'operatingProfit'],
  adjustedNetIncome: ['扣除非经常性损益后的净利润', 'Adjusted net income', 'adjustedNetIncome'],
  adjustedNetIncomeAttributableToParent: ['归属于上市公司股东的扣除非经常性损益的净利润', 'adjustedNetIncomeAttributableToParent'],
  operatingCashFlow: ['经营活动产生的现金流量净额', 'Operating cash flow', 'operatingCashFlow'], capex: ['资本开支', '购建固定资产、无形资产和其他长期资产支付的现金', 'capex'],
  fcff: ['企业自由现金流', 'FCFF', 'fcff'], cash: ['货币资金', '现金及现金等价物', 'cash'], debt: ['有息债务', 'debt'],
  nonOperatingAssets: ['非经营资产', 'nonOperatingAssets'], minorityInterest: ['少数股东权益', 'minorityInterest'], shares: ['总股本', 'shares'],
  currentPrice: ['现价', '收盘价', 'currentPrice'], grossProfit: ['毛利润', 'grossProfit'], grossMargin: ['毛利率', 'grossMargin'],
  assets: ['资产总计', 'assets'], liabilities: ['负债合计', 'liabilities'],
}
export const UNITS = {
  CNY: ['CNY', '1', ['元', '人民币元', 'CNY']], CNY_10K: ['CNY', '10000', ['万元', '人民币万元']], CNY_100M: ['CNY', '100000000', ['亿元', '人民币亿元']],
  shares: ['shares', '1', ['股', 'shares']], shares_10K: ['shares', '10000', ['万股']], shares_100M: ['shares', '100000000', ['亿股']],
  ratio: ['ratio', '1', ['倍', 'ratio', '比例']], percent: ['ratio', '0.01', ['%', '％', '百分比']], CNY_per_share: ['CNY_per_share', '1', ['元/股', '人民币元/股']],
}
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export const isText = value => typeof value === 'string' && value.trim().length > 0
export const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export const isTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) && isDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value))
export const idValid = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(id)
export const diagnostic = (code, path, message, severity = 'error') => ({ severity, code, path, message })
export function periodKey(value) {
  if (typeof value !== 'string') return null
  const p = value.replace(/^(20\d{2})年(?:半年度|上半年)$/, '$1H1').replace(/^(20\d{2})年度$/, 'FY$1').replace(/^(20\d{2})年$/, 'FY$1').replace(/^(20\d{2})$/, 'FY$1')
  return /^(?:FY20\d{2}|20\d{2}(?:Q[1-4]|H[12])|20\d{2}-\d{2}-\d{2})$/.test(p) ? p : null
}
export function normalized(value, unit) {
  if (!UNITS[unit]) throw new Error('Unsupported unit')
  return { value: decimal(value).mul(UNITS[unit][1]), unit: UNITS[unit][0] }
}
export function schemaDiagnostics(packet) {
  const errors = []; const fail = (path, message) => errors.push(diagnostic('SCHEMA', path, message))
  if (!isObject(packet)) { fail('$', '研究包必须是JSON对象'); return errors }
  if (packet.schemaVersion !== 1) fail('schemaVersion', '仅支持schemaVersion: 1')
  if (typeof packet.synthetic !== 'boolean') fail('synthetic', '必须显式标记synthetic布尔值')
  if (!isObject(packet.company) || !isText(packet.company.name) || !isText(packet.company.ticker) || packet.company.currency !== 'CNY') fail('company', '必须提供name、ticker和currency:CNY；v1仅支持人民币')
  if (!isDate(packet.asOf) || !isDate(packet.financialAsOf) || packet.financialAsOf > packet.asOf) fail('asOf', 'asOf/financialAsOf必须是有效ISO日期，财务基期不得晚于报告时点')
  for (const key of ['sources', 'facts', 'calculations']) {
    if (key === 'calculations' && packet[key] === undefined) continue
    if (!Array.isArray(packet[key]) || packet[key].length > 1000 || (key !== 'calculations' && !packet[key].length)) fail(key, `${key}必须是数组，sources/facts不能为空，最多1000项`)
  }
  return errors
}
