import { RESEARCH_CAPABILITIES, researchCapability } from './research-capabilities.js'
import { createHash } from 'node:crypto'
import { serviceError } from './contract.js'

export const INTENTS = ['resolve', 'quote', 'history', 'nav', 'profile', 'research', 'catalog', 'analysis']
export const ASSETS = ['stock', 'index', 'etf', 'fund']
export const QUALITY = ['dated', 'fresh', 'delayed', 'market_closed', 'unknown', 'unconfirmed']
export const LIMITATIONS = {
  unsupported: '暂不支持所需市场、频率或指标。',
  unavailable: '此次暂未取得可用数据。',
  missing: '部分数据暂缺。',
  freshness_unknown: '尚未核实最新披露或交易时间，请以各项数据日期为准。',
  delayed: '暂未取得满足时效要求的最新数据，展示最近可用值。',
  closed: '当前不在连续交易时段，展示最近可用行情。',
  dates_differ: '数据日期不一致，不能直接比较。',
  unconfirmed: '该数据暂无法确认。',
  ambiguous: '找到多个候选，请按市场和代码确认查询对象。',
  unverified: '研究结果尚未完成口径核验，不能据此给出确定性结论。',
  truncated: '结果已截断，请缩小查询范围。'
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  return JSON.stringify(value)
}
export const financialHash = value => createHash('sha256').update(canonical(value)).digest('hex')
const invalid = () => { throw serviceError('FINANCIAL_ARGUMENTS_INVALID') }
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
}
export function validateFinancialQuery(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.operation !== 'financial' ||
      !INTENTS.includes(input.intent) || Buffer.byteLength(JSON.stringify(input)) > 16 * 1024) invalid()
  const common = ['operation', 'intent']
  const fields = {
    resolve: ['asset', 'query'], quote: ['asset', 'symbols'],
    history: ['asset', 'symbols', 'start', 'end', 'interval', 'adjustment'],
    nav: ['asset', 'symbols', 'nav_basis', 'as_of'], profile: ['asset', 'symbols'],
    research: ['symbols', 'task', 'lookback_days'], catalog: ['capability'],
    analysis: ['capability', 'schema_hash', 'arguments_json']
  }
  if (Object.keys(input).some(k => ![...common, ...fields[input.intent]].includes(k))) invalid()
  const q = { operation: 'financial', intent: input.intent }
  for (const k of fields[q.intent]) if (input[k] !== undefined) q[k] = input[k]
  if (['resolve', 'quote', 'history', 'nav', 'profile'].includes(q.intent) && !ASSETS.includes(q.asset)) invalid()
  if (q.intent === 'resolve') {
    if (typeof q.query !== 'string' || !q.query.trim() || q.query.length > 100 || /[\u0000-\u001f]/.test(q.query)) invalid()
  } else if (!['catalog', 'analysis'].includes(q.intent)) {
    if (!Array.isArray(q.symbols) || q.symbols.length < 1 || q.symbols.length > 6 || new Set(q.symbols).size !== q.symbols.length ||
        q.symbols.some(v => typeof v !== 'string' || !/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(v))) invalid()
    if (q.asset === 'etf' && q.symbols.some(v => !/^\d{6}\.(SH|SZ)$/.test(v))) invalid()
    if (q.asset === 'fund' && q.symbols.some(v => !/^\d{6}$/.test(v))) invalid()
    // Require exchange-qualified trading symbols; bare index and fund codes overlap.
    if (['quote', 'history'].includes(q.intent) && q.asset !== 'fund' && q.symbols.some(v => !v.includes('.'))) invalid()
    if (['history', 'nav', 'profile'].includes(q.intent) && q.symbols.length !== 1) invalid()
  }
  if (q.intent === 'history') {
    if (!validDate(q.start) || !validDate(q.end) || q.start > q.end || Date.parse(q.end) - Date.parse(q.start) > 366 * 86400000) invalid()
    q.interval ??= '1d'
    q.adjustment ??= 'none'
    if (!['1m', '5m', '15m', '30m', '60m', '1d', '1w', '1mo'].includes(q.interval) || !['none', 'forward', 'backward'].includes(q.adjustment)) invalid()
  }
  if (q.intent === 'nav') {
    q.nav_basis ??= 'unit'
    if (!['unit', 'accumulated', 'adjusted', 'income_per_10000', 'yield_7d'].includes(q.nav_basis) || (q.as_of !== undefined && !validDate(q.as_of))) invalid()
  }
  if (q.intent === 'research') {
    q.task ??= 'single'
    if (!['single', 'compare', 'holdings_style', 'recent_changes'].includes(q.task) || q.symbols.some(v => !/^\d{6}$/.test(v)) ||
        (q.task === 'compare' ? q.symbols.length < 2 : q.symbols.length !== 1)) invalid()
    if (q.lookback_days !== undefined && (q.task !== 'recent_changes' || !Number.isInteger(q.lookback_days) || q.lookback_days < 7 || q.lookback_days > 365)) invalid()
  }
  if (q.capability !== undefined && (typeof q.capability !== 'string' || !researchCapability(q.capability))) invalid()
  if (q.intent === 'analysis' && (!q.capability || !/^[a-f0-9]{64}$/.test(q.schema_hash) || typeof q.arguments_json !== 'string')) invalid()
  if (q.intent === 'analysis') {
    let args
    try { args = JSON.parse(q.arguments_json) } catch { invalid() }
    if (!args || typeof args !== 'object' || Array.isArray(args)) invalid()
  }
  return q
}

const technical = /(?:https?:\/\/|mcp__|\b(?:api[_ -]?key|authorization|bearer|endpoint|provider|server|request[_ -]?id)\b|fuyao|aicubes|stargate|yingmi|盈米|服务商|供应商|数据来源|来源[:：]|同花顺[ _-]*(?:MCP|API)|同花顺(?:金融|数据|接口|服务)|get_[a-z_]+|BatchGet[A-Z])/i
export function businessText(value, max = 120) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && !technical.test(value) && !/[\u0000-\u001f]/.test(value) ? value : undefined
}
// Strict public envelope. Unknown keys and provider prose are rejected at both boundaries.
export function validateFinancialResult(value, query, clock = () => new Date(), { historyAggregate = false } = {}) {
  const expected = validateFinancialQuery(query)
  // Wire responses keep their existing budget. Only the local, individually
  // validated daily-history pages may use the one-year aggregate budget.
  const aggregate = historyAggregate && expected.intent === 'history' && expected.interval === '1d'
  const fail = () => { throw serviceError('FINANCIAL_UNAVAILABLE') }
  if (!value || value.schema_version !== 'financial-1' || value.request_hash !== financialHash(validateFinancialQuery(query)) ||
      !['complete', 'partial', 'unavailable', 'unsupported', 'ambiguous'].includes(value.status) ||
      Object.keys(value).some(k => !['schema_version','request_hash','received_at','status','records','catalog','limitations'].includes(k)) ||
      Buffer.byteLength(JSON.stringify(value)) > (aggregate ? 512 : 64) * 1024) fail()
  const now = clock().valueOf()
  if (typeof value.received_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value.received_at)) fail()
  const age = now - Date.parse(value.received_at)
  if (!Number.isFinite(age) || age < -60000 || age > 15 * 60000) fail()
  if (!Array.isArray(value.records) || value.records.length > (aggregate ? 1468 : 500) || !Array.isArray(value.limitations) ||
      value.limitations.some(s => !Object.values(LIMITATIONS).includes(s))) fail()
  if (value.status === 'complete' && (value.limitations.length || (!value.records.length && expected.intent !== 'catalog'))) fail()
  if (['unavailable','unsupported'].includes(value.status) && value.records.length) fail()
  if (value.status === 'partial' && !value.limitations.length) fail()
  if (value.status === 'ambiguous' && (expected.intent !== 'resolve' || new Set(value.records.map(r => r.instrument)).size < 2)) fail()
  const ids = new Set()
  for (const r of value.records) {
    if (!r || Object.keys(r).some(k => !['evidence_id','instrument','name','metric','value','unit','as_of','period_start','period_end','price_basis','quality_state','dimensions'].includes(k)) ||
        !/^[a-f0-9]{32}$/.test(r.evidence_id) || !businessText(r.instrument) || !businessText(r.metric) || !businessText(r.unit) || !businessText(r.price_basis) ||
        !QUALITY.includes(r.quality_state) || !(r.as_of === null || validDate(r.as_of) || (typeof r.as_of === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(r.as_of) && Number.isFinite(Date.parse(r.as_of)))) ||
        !(typeof r.value === 'number' ? Number.isFinite(r.value) : Boolean(businessText(r.value, 300)))) fail()
    if (ids.has(r.evidence_id)) fail()
    ids.add(r.evidence_id)
    if (r.as_of !== null) {
      const isDate = validDate(r.as_of)
      if (isDate ? r.as_of > new Date(now + 8 * 3600000 + 60000).toISOString().slice(0,10) : new Date(r.as_of).toISOString() !== r.as_of || Date.parse(r.as_of) > now + 60000) fail()
    }
    if (r.quality_state === 'fresh' && (expected.intent !== 'quote' || r.as_of === null || validDate(r.as_of) || now - Date.parse(r.as_of) > 60000)) fail()
    if (expected.symbols && !expected.symbols.includes(r.instrument)) fail()
    if (r.name !== undefined && !businessText(r.name)) fail()
    for (const k of ['period_start', 'period_end']) if (r[k] !== undefined && !validDate(r[k])) fail()
    if (r.dimensions !== undefined && (!r.dimensions || typeof r.dimensions !== 'object' || Array.isArray(r.dimensions) ||
        Object.entries(r.dimensions).some(([k,v]) => !['security_code','security_name','asset_class','industry','region','benchmark_code','comparison_group','direction','rank'].includes(k) || !(typeof v === 'number' ? Number.isFinite(v) : businessText(v))))) fail()
  }
  if (value.catalog !== undefined) {
    if (expected.intent !== 'catalog' || !Array.isArray(value.catalog) || value.catalog.length !== (expected.capability ? 1 : RESEARCH_CAPABILITIES.length)) fail()
    const entries = new Set()
    for (const e of value.catalog) {
      const spec = researchCapability(e?.id)
      if (!spec || entries.has(e.id) || e.title !== spec.title || e.category !== spec.category ||
          (expected.capability && e.id !== expected.capability) ||
          Object.keys(e).some(k => !['id','title','category','state','arguments_schema_json','schema_hash'].includes(k)) ||
          !['available','unavailable','incompatible'].includes(e.state)) fail()
      entries.add(e.id)
      if (e.state === 'available' && expected.capability) {
        if (typeof e.arguments_schema_json !== 'string' || Buffer.byteLength(e.arguments_schema_json) > 32 * 1024 || technical.test(e.arguments_schema_json) || !/^[a-f0-9]{64}$/.test(e.schema_hash)) fail()
        let schema
        try { schema = JSON.parse(e.arguments_schema_json) } catch { fail() }
        if (!schema || schema.type !== 'object') fail()
      } else if (e.arguments_schema_json !== undefined || e.schema_hash !== undefined) fail()
    }
  } else if (expected.intent === 'catalog' && ['complete','partial'].includes(value.status)) fail()
  return Object.freeze(value)
}
