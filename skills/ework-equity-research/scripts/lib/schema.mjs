import { decimal } from './numbers.mjs'
export const METRICS = {
  revenue: ['营业收入', 'Revenue', 'revenue'], totalRevenue: ['营业总收入', 'Total revenue', 'totalRevenue'], costOfRevenue: ['营业成本', 'Cost of revenue', 'costOfRevenue'],
  netIncome: ['净利润', 'Net income', 'netIncome'], netIncomeAttributableToParent: ['归母净利润', '归属于上市公司股东的净利润', '归属于母公司股东的净利润', 'netIncomeAttributableToParent'], operatingProfit: ['营业利润', 'Operating profit', 'operatingProfit'],
  adjustedNetIncome: ['扣除非经常性损益后的净利润', 'Adjusted net income', 'adjustedNetIncome'],
  adjustedNetIncomeAttributableToParent: ['归属于上市公司股东的扣除非经常性损益的净利润', 'adjustedNetIncomeAttributableToParent'],
  operatingCashFlow: ['经营活动产生的现金流量净额', 'Operating cash flow', 'operatingCashFlow'], capex: ['资本开支', '购建固定资产、无形资产和其他长期资产支付的现金', 'capex'],
  fcff: ['企业自由现金流', 'FCFF', 'fcff'], cash: ['货币资金', '现金及现金等价物', '期末现金及现金等价物余额', 'cash'], debt: ['有息债务', 'debt'],
  nonOperatingAssets: ['非经营资产', 'nonOperatingAssets'], minorityInterest: ['少数股东权益', 'minorityInterest'], shares: ['总股本', '股份总数', 'shares'],
  currentPrice: ['现价', '收盘价', 'currentPrice'], grossProfit: ['毛利润', 'grossProfit'], grossMargin: ['毛利率', 'grossMargin'],
  basicEarningsPerShare: ['基本每股收益','Basic earnings per share','basicEarningsPerShare'],
  dilutedEarningsPerShare: ['稀释每股收益','Diluted earnings per share','dilutedEarningsPerShare'],
  netAssetsPerShare: ['每股净资产','Net assets per share','netAssetsPerShare'],
  returnOnEquity: ['加权平均净资产收益率','净资产收益率','Return on equity','returnOnEquity'],
  assets: ['资产总计', 'assets'], liabilities: ['负债合计', 'liabilities'],
  sellingExpenses: ['销售费用','Selling expenses'], administrativeExpenses: ['管理费用','Administrative expenses'],
  taxesAndSurcharges: ['税金及附加'], inventory: ['存货'], contractLiabilities: ['合同负债'],
  researchExpenses: ['研发费用'], financeExpenses: ['财务费用'],
  depreciationAmortization: ['折旧摊销','D&A','depreciationAmortization'], tradeNwc: ['贸易营运资本','tradeNwc'],
  financialNetAssets: ['金融子公司净资产','净资产','financialNetAssets'], indexLevel: ['收盘指数','指数收盘','indexLevel'],
  cashDividendPerShare: ['每股现金红利','每股现金股利','cashDividendPerShare'],
  sharesChange:['股份变动','股本变动'], sharesCancelled:['本次注销股份数量','注销股份数量','注销股份数'], sharesIssued:['新增股份数量','发行股份数量'],
  ebit:['息税前利润','EBIT'],
  depreciation:['固定资产折旧、油气资产折耗、生产性生物资产折旧'],rightOfUseAmortization:['使用权资产摊销'],intangibleAmortization:['无形资产摊销'],deferredExpenseAmortization:['长期待摊费用摊销'],
  tradeReceivables:['应收账款'],receivablesFinancing:['应收款项融资'],prepayments:['预付款项'],tradePayables:['应付账款'],
  leaseLiabilities:['长期租赁负债','租赁负债'],currentLeaseLiabilities:['一年内到期的租赁负债'],
}
export const UNITS = {
  CNY: ['CNY', '1', ['元', '人民币元', 'CNY']], CNY_10K: ['CNY', '10000', ['万元', '人民币万元']], CNY_100M: ['CNY', '100000000', ['亿元', '人民币亿元']],
  shares: ['shares', '1', ['股', 'shares']], shares_10K: ['shares', '10000', ['万股']], shares_100M: ['shares', '100000000', ['亿股']],
  ratio: ['ratio', '1', ['倍', 'ratio', '比例']], percent: ['ratio', '0.01', ['%', '％', '百分比']], CNY_per_share: ['CNY_per_share', '1', ['元/股', '人民币元/股']],
  index_points: ['index_points','1',['点','指数点']],
}
export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
export const isText = value => typeof value === 'string' && value.trim().length > 0
export const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
export const isTimestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value) && isDate(value.slice(0, 10)) && !Number.isNaN(Date.parse(value))
export const idValid = id => typeof id === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(id)
export const reservedResultId = id => /^(?:dcf|market|quarter|forecast|assumption)\./.test(id??'')
export const diagnostic = (code, path, message, severity = 'error') => ({ severity, code, path, message })
export function periodKey(value) {
  if (typeof value !== 'string') return null
  value=value.replace(/\s/g,'').replace(/^(20\d{2})年(\d{1,2})月(\d{1,2})日$/,(_,y,m,d)=>`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`)
  if(/^20\d{2}-\d{2}-\d{2}$/.test(value))return isDate(value)?value:null
  const range=value.match(/^(20\d{2})年1(?:月)?[-—–－至](3|6|9|12)月$/)
  if(range)return range[2]==='12'?'FY'+range[1]:range[1]+({3:'Q1',6:'H1',9:'Q3'}[range[2]])
  const annotated=value.match(/^(20\d{2})年(第一季度|前三季度)[（(]1[-—–－至](3|9)月[）)]$/)
  if(annotated)return annotated[2]==='第一季度'&&annotated[3]==='3'?annotated[1]+'Q1':annotated[2]==='前三季度'&&annotated[3]==='9'?annotated[1]+'Q3':null
  const quarter=value.match(/^(20\d{2})年(?:第([一二三四])季度|前(三)季度)(?:报告)?$/)
  if(quarter)return quarter[1]+'Q'+({一:1,二:2,三:3,四:4}[quarter[2]??quarter[3]])
  const p = value.replace(/^(20\d{2})年(?:半年度|上半年|中期)(?:报告)?$/, '$1H1').replace(/^(20\d{2})年(?:年度(?:报告)?|度)$/, 'FY$1').replace(/^(20\d{2})年$/, 'FY$1').replace(/^(20\d{2})$/, 'FY$1')
  return /^(?:FY20\d{2}|20\d{2}(?:Q[1-4]|H[12])|20\d{2}-\d{2}-\d{2})$/.test(p) ? p : null
}
export function normalized(value, unit) {
  if (!UNITS[unit]) throw new Error('Unsupported unit')
  return { value: decimal(value).mul(UNITS[unit][1]), unit: UNITS[unit][0] }
}
export function schemaDiagnostics(packet) {
  const errors = []; const fail = (path, message) => errors.push(diagnostic('SCHEMA', path, message))
  if (!isObject(packet)) { fail('$', '研究包必须是JSON对象'); return errors }
  if (![1,2].includes(packet.schemaVersion)) fail('schemaVersion', '仅支持schemaVersion: 1或2')
  if(packet.schemaVersion===2){
    if(!isDate(packet.valuationAsOf)||packet.valuationAsOf>packet.asOf||packet.financialAsOf>packet.valuationAsOf)fail('valuationAsOf','v2需独立估值日，financialAsOf≤valuationAsOf≤asOf')
    const allowed=['schemaVersion','synthetic','company','asOf','valuationAsOf','financialAsOf','sources','facts','calculations','observations','report','dcf','market','quarterly','entityScopes','methodGap']
    if(Object.keys(packet).some(k=>!allowed.includes(k)))fail('$','v2不接受未声明的顶层字段')
    if(packet.entityScopes!==undefined&&(!Array.isArray(packet.entityScopes)||packet.entityScopes.length>30||new Set(packet.entityScopes).size!==packet.entityScopes.length||packet.entityScopes.some(s=>!isText(s)||s.length>120)))fail('entityScopes','实体范围需唯一、非空且受长度限制的名称数组')
  }
  if (typeof packet.synthetic !== 'boolean') fail('synthetic', '必须显式标记synthetic布尔值')
  if (!isObject(packet.company) || !isText(packet.company.name) || !isText(packet.company.ticker) || packet.company.currency !== 'CNY') fail('company', '必须提供name、ticker和currency:CNY；v1仅支持人民币')
  if (!isDate(packet.asOf) || !isDate(packet.financialAsOf) || packet.financialAsOf > packet.asOf) fail('asOf', 'asOf/financialAsOf必须是有效ISO日期，财务基期不得晚于报告时点')
  for (const key of ['sources', 'facts', 'calculations']) {
    if (key === 'calculations' && packet[key] === undefined) continue
    const limit=key==='facts'&&packet.schemaVersion===2?3000:1000
    if (!Array.isArray(packet[key]) || packet[key].length > limit || (key !== 'calculations' && !packet[key].length)) fail(key, `${key}必须是数组，sources/facts不能为空，最多${limit}项`)
  }
  if(packet.report!==undefined&&!isObject(packet.report))fail('report','report必须是JSON对象')
  if(packet.observations!==undefined&&(!Array.isArray(packet.observations)||packet.observations.length>300))fail('observations','原文观察必须是最多300项的数组')
  return errors
}
