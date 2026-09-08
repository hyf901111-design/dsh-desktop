import { businessText, validDate, LIMITATIONS } from '../../../packages/dsh-fund-research-runtime/financial-contract.js'
import { researchCapability } from '../../../packages/dsh-fund-research-runtime/research-capabilities.js'

// Only JSON Schema structure reaches the model. Supplier prose/examples/defaults never do.
export function publicSchema(schema) {
  const scalars = new Set(['type','format','minimum','maximum','exclusiveMinimum','exclusiveMaximum','minLength','maxLength','minItems','maxItems','uniqueItems','multipleOf','pattern','const'])
  function visit(value, key = '') {
    if (Array.isArray(value)) return value.map(v => visit(v, key))
    if (!value || typeof value !== 'object') {
      if (typeof value === 'string' && !businessText(value, 500)) throw new Error('Unsafe schema.')
      return value
    }
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      if (['properties','$defs','definitions','patternProperties'].includes(k)) {
        out[k] = Object.fromEntries(Object.entries(v).map(([name, child]) => {
          if (!businessText(name) || ['__proto__','prototype','constructor','api_key','headers','endpoint','authorization'].includes(name)) throw new Error('Unsafe schema key.')
          return [name, visit(child)]
        }))
      } else if (scalars.has(k) || ['required','enum','items','additionalProperties','anyOf','oneOf','allOf','not','if','then','else'].includes(k)) out[k] = visit(v, k)
      else if (k === '$ref') {
        if (typeof v !== 'string' || !/^#\/(?:\$defs|definitions)\/[a-zA-Z0-9_-]+$/.test(v)) throw new Error('Unsupported schema reference.')
        out[k] = v
      }
      // Unknown validation keywords cannot be silently discarded.
      else if (!['$schema','$id','title','description','examples','example','default','deprecated','$comment'].includes(k)) throw new Error('Unsupported schema keyword.')
    }
    return out
  }
  return visit(schema)
}
export function projectCatalog(value) {
  return value.entries.map(e => {
    const spec = researchCapability(e.id)
    const entry = { id: spec.id, title: spec.title, category: spec.category, state: e.state }
    if (e.arguments_schema_json !== undefined) {
      try { entry.arguments_schema_json = JSON.stringify(publicSchema(JSON.parse(e.arguments_schema_json))); entry.schema_hash = e.schema_hash }
      catch { entry.state = 'incompatible' }
    }
    return entry
  })
}

// Reviewed data fields. Numeric values without a documented unit remain unverified, in original units.
const fields = {
  nav: ['单位净值','原始单位'], unit_nav: ['单位净值','原始单位'], accumulatedNav: ['累计净值','原始单位'],
  dailyReturn: ['日收益率','原始单位'], oneYearReturn: ['近一年收益率','原始单位'],
  return: ['收益率','原始单位'], returns: ['收益率','原始单位'], annualReturn: ['年化收益率','原始单位'],
  annualizedReturn: ['年化收益率','原始单位'], maxDrawdown: ['最大回撤','原始单位'], volatility: ['波动率','原始单位'],
  sharpeRatio: ['夏普比率','ratio'], correlation: ['相关系数','ratio'], weight: ['权重','原始单位'], ratio: ['占比','原始单位'],
  stockRatio: ['股票占比','原始单位'], bondRatio: ['债券占比','原始单位'], netAsset: ['基金规模','原始单位'],
  fundSize: ['基金规模','原始单位'], turnoverRate: ['换手率','原始单位'], pe: ['市盈率','倍'], pb: ['市净率','倍'],
  feeRate: ['费率','原始单位'], amount: ['金额','原始单位'], incomePer10000: ['万份收益','原始单位'], yield7d: ['七日年化收益率','原始单位']
}
const containers = new Set(['data','structuredContent','result','results','items','list','rows','summary','funds','performance','risk','navHistory','assetPortfolios','industryPortfolios','holdings','series','allocations','metrics'])
const names = ['fundName','fund_name','securityName','stockName','name']
const codeKeys = ['fundCode','fund_code','securityCode','stockCode','code']
const dates = ['navDate','as_of','asOf','date','reportDate','reportPeriod','tradeDate','endDate']
const metadata = new Set([...names,...codeKeys,...dates,'currency','unit','indexCode','indexName','fundInvestType'])
const holdingContainers = new Set(['holdings','assetPortfolios','industryPortfolios','allocations'])
const navFields = new Set(['nav','unit_nav','accumulatedNav'])
const code = value => typeof value === 'string' && /^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(value) ? value : undefined
const number = value => typeof value === 'number' ? Number.isFinite(value) :
  typeof value === 'string' && value.length <= 60 && /^[+-]?\d+(?:\.\d+)?(?:%|万|亿)?$/.test(value)
export function projectAnalysis(data, add, { defaultInstrument = '组合' } = {}) {
  let omitted = false, emitted = 0, visited = 0
  const emit = row => { if (emitted >= 150) { omitted = true; return }; add(row); emitted++ }
  function visit(value, inherited = {}, depth = 0) {
    if (++visited > 8000 || depth > 12 || emitted >= 150) { omitted = true; return }
    if (Array.isArray(value)) { for (const row of value.slice(0,150)) visit(row, inherited, depth + 1); if (value.length > 150) omitted = true; return }
    if (!value || typeof value !== 'object') { if (value !== null) omitted = true; return }
    const ownFund = code(value.fundCode) ?? code(value.fund_code)
    const security = code(value.securityCode) ?? code(value.stockCode)
    const rawCode = ownFund ?? code(value.code) ?? security
    // A holding belongs to its parent fund; its security identity is a dimension, not the owner's name.
    const holding = inherited.domain === 'holdings'
    const instrument = holding && inherited.instrument ? inherited.instrument : rawCode ?? inherited.instrument ?? defaultInstrument
    const changed = rawCode && !holding && rawCode !== inherited.instrument
    const ownName = businessText(value.fundName) ?? businessText(value.fund_name) ?? businessText(value.name) ?? businessText(value.securityName) ?? businessText(value.stockName)
    const name = holding ? inherited.name : ownName ?? (changed ? undefined : inherited.name)
    const parent = changed ? {} : inherited
    const readDate = keys => keys.map(k => value[k]).find(validDate)
    const navDate = readDate(['navDate']) ?? parent.navDate
    const reportDate = readDate(['reportDate','reportPeriod']) ?? parent.reportDate
    const observation = readDate(['as_of','asOf','date','tradeDate','endDate']) ?? (holding ? undefined : parent.observation)
    const dimensions = holding ? {...(inherited.dimensions ?? {})} : {}
    if (holding) {
      if (rawCode) {
        dimensions.security_code = rawCode
        const securityName = businessText(value.securityName) ?? businessText(value.stockName) ?? businessText(value.fundName) ?? businessText(value.name)
        if (securityName) dimensions.security_name = securityName
      } else if (inherited.container === 'industryPortfolios' && businessText(value.name)) dimensions.industry = value.name
      else if (inherited.container === 'assetPortfolios' && businessText(value.name)) dimensions.asset_class = value.name
    }
    if (rawCode && name && !holding) emit({ instrument, name, metric:'证券名称', value:name, unit:'text', as_of:null, price_basis:'名称与代码', quality_state:'unknown' })
    for (const [key, child] of Object.entries(value)) {
      if (Object.hasOwn(fields,key)) {
        if (!number(child)) { omitted = true; continue }
        const [metric, unit] = fields[key]
        const as_of = holding ? reportDate ?? observation ?? null : navFields.has(key) ? navDate ?? observation ?? null : observation ?? reportDate ?? null
        emit({ instrument, ...(name ? {name} : {}), metric, value:child, unit, as_of, price_basis:'待核验原始口径', quality_state:'unconfirmed',
          ...(Object.keys(dimensions).length ? {dimensions} : {}) })
      } else if (containers.has(key)) visit(child, { instrument, name, navDate, reportDate, observation,
        domain:holdingContainers.has(key) || holding ? 'holdings' : 'entity', container:key, ...(holding ? {dimensions} : {}) }, depth + 1)
      else if (!metadata.has(key)) omitted = true
    }
  }
  visit(data)
  return { omitted, emitted }
}

// Older clients share the same privacy boundary. Keep their wire envelope but never return supplier prose.
export function projectLegacyOperation(value) {
  if (value.operation === 'catalog') return { ...value, entries:projectCatalog(value), limitations:[] }
  const records=[]
  const { omitted }=projectAnalysis(JSON.parse(value.data_json),r=>records.push(r))
  return { ...value, data_json:JSON.stringify({records}), limitations:[LIMITATIONS.unverified,...(omitted || !records.length ? [LIMITATIONS.missing] : [])] }
}
