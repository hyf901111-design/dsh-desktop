import { randomUUID } from 'node:crypto'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { abortable, deadline, uniqueQuote } from './notes-challenge-bounds.js'

const TABLE = 'ASHARECONSENSUSDATA', SCHEMA = 'TYDW_FILESYNC'
const METRICS = { EPS: 'EPS', NET_PROFIT: '归母净利润', MAIN_BUS_INC: '主营业务收入' }
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const number = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null
const distinct = values => [...new Set(values)]
function date(value) {
  const text = String(value ?? '').replaceAll('-', '').replaceAll('/', '')
  if (!/^20\d{6}$/.test(text)) return null
  const iso = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  return Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso ? text : null
}
const codes = text => distinct([...text.matchAll(/\b\d{6}\.(?:SH|SZ|BJ)\b/giu)].map(match => match[0].toUpperCase()))
const dates = text => distinct([...text.matchAll(/(?:报告基准日|报告发布日期|报告发布日|报告日期|基准日|模型日|预测截止日)\s*[:：]?\s*(20\d{2}(?:[-/]\d{2}[-/]\d{2}|\d{4}))/gu)].map(match => date(match[1])).filter(Boolean))
const nonAnnual = /(?:上|下)半年|半年度|半年报|中报|季度|[一二三四1-4]季(?:度|报)?|单季|前[一二三四五六七八九十\d]+个月|\d{1,2}\s*月?\s*(?:[-—–~～]|至|到)\s*\d{1,2}\s*月|\b(?:first|second)\s+half|\bhalf[- ]?year|(?:^|[^A-Za-z])(?:Q[1-4]|H[12]|[1-4]Q|[12]H|[369]M)(?!\d)/iu
const incompatibleBasis = /扣非|(?:剔除|扣除)非经常性损益|调整后|经调整|稀释|摊薄|\badjusted\b|\bnon[- ]?GAAP\b/iu

/** Conservative parsing: names, missing units, ambiguous years and multi-ticker inheritance do not become claims. */
export function extractConsensusClaims(blocks) {
  const allText = blocks.map(block => block.text).join('\n'), globalCodes = codes(allText), globalDates = dates(allText), claims = []
  for (const block of blocks) {
    const localCodes = codes(block.text), localDates = dates(block.text)
    const code = localCodes.length === 1 ? localCodes[0] : !localCodes.length && globalCodes.length === 1 ? globalCodes[0] : null
    const baseDate = localDates.length === 1 ? localDates[0] : !localDates.length && globalDates.length === 1 ? globalDates[0] : null
    if (!code || !baseDate) continue
    for (const sentence of block.text.split(/[。；;\n]/u)) {
      if (!/预计|预测|forecast|\bFY\s*20\d{2}|\b\d{2,4}E\b/iu.test(sentence) || /已实现|实际实现|滚动|未来\s*12\s*个月|FTTM|TTM/iu.test(sentence)) continue
      // The static table is annual and does not identify adjusted/diluted bases.
      // Do not strip an explicit incompatible period or basis from a metric.
      if (nonAnnual.test(sentence) || incompatibleBasis.test(sentence)) continue
      const years = distinct([...sentence.matchAll(/(?:\bFY\s*)?(20\d{2})\s*(?:年(?:度|报)?|[eE]\b)|\bFY\s*(20\d{2})\b|\b(\d{2})E\b/giu)].map(match => Number(match[1] ?? match[2] ?? ('20' + match[3]))))
      if (years.length !== 1) continue
      const metricPattern = /(EPS|每股收益|归母净利润|归属于母公司(?:股东)?的?净利润|主营业务收入|主营收入|营业总收入|营业收入)\s*(?:预测)?\s*(?:为|达|约为|约|预计|[:：=])?\s*([+-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(亿元|万元|千元|元(?:\/股)?)/giu
      for (const match of sentence.matchAll(metricPattern)) {
        const label = match[1], metric = /EPS|每股收益/iu.test(label) ? 'EPS' : /净利润/u.test(label) ? 'NET_PROFIT' : 'MAIN_BUS_INC'
        const unit = match[3].replace('/股', ''), value = Number(match[2].replaceAll(',', ''))
        if (!Number.isFinite(value) || metric === 'EPS' && unit !== '元' || !uniqueQuote(block.text, match[0])) continue
        claims.push({ blockId: block.id, quote: match[0], windCode: code, baseDate, year: years[0], metric, value, unit, ...metric === 'MAIN_BUS_INC' && !/^主营/u.test(label) ? { basis: label } : {} })
      }
    }
  }
  return claims
}

const unavailable = detail => ({ status: 'unavailable', rules: [], detail })
/** Rows here must come from the host source adapter; model output never reaches this calculation. */
export function compareConsensusClaim(claim, rows) {
  if (!METRICS[claim.metric] || !/^\d{6}\.(SH|SZ|BJ)$/.test(claim.windCode) || !date(claim.baseDate) || !Number.isInteger(claim.year) || claim.year < 2000 || claim.year > 2099 || !Number.isFinite(claim.value)) return unavailable('预测字段不完整，无法比对。')
  if (claim.basis) return { status: 'skipped', rules: [], detail: `${claim.basis}与静态表主营业务收入口径尚未确认，未作偏离判断。` }
  const scale = claim.metric === 'EPS' ? claim.unit === '元' ? 1 : null : ({ 亿元: 10000, 万元: 1, 千元: 0.1, 元: 0.0001 })[claim.unit]
  if (scale == null) return unavailable('报告单位不明确，未作换算。')
  const reportedValue = claim.value * scale, period = `${claim.year}1231`
  if (!Number.isFinite(reportedValue) || !Array.isArray(rows)) return unavailable('预测数值或数据无效。')
  const matching = rows.filter(row => record(row) && row.S_INFO_WINDCODE === claim.windCode && String(row.EST_REPORT_DT) === period && date(row.EST_DT))
  if (!matching.length) return unavailable(`${claim.windCode} ${claim.year}年度本次来源未返回可用一致预期快照，无法比对。`)
  const historical = matching.filter(row => date(row.EST_DT) <= date(claim.baseDate))
  const eligible = historical.length ? historical : matching
  const estDt = eligible.map(row => date(row.EST_DT)).sort().at(-1), candidates = eligible.filter(row => date(row.EST_DT) === estDt)
  const fields = ['S_INFO_WINDCODE', 'EST_REPORT_DT', 'EST_DT', 'NUM_EST_INST', ...['AVG', 'MEDIAN', 'MIN', 'MAX', 'DEV'].map(suffix => `${claim.metric}_${suffix}`)]
  if (distinct(candidates.map(row => JSON.stringify(fields.map(field => row[field] ?? null)))).length !== 1) return unavailable('同一预测快照返回互相冲突的记录，未作判断。')
  const row = candidates[0], median = number(row[claim.metric + '_MEDIAN']), avg = number(row[claim.metric + '_AVG']), min = number(row[claim.metric + '_MIN']), max = number(row[claim.metric + '_MAX']), std = number(row[claim.metric + '_DEV']), count = number(row.NUM_EST_INST)
  const sample = Number.isInteger(count) && count >= 5, positiveBase = median !== null && median > 0, interval = min !== null && max !== null && min <= max, deviation = positiveBase ? Math.abs(reportedValue - median) / median : null
  if (interval && median !== null && (median < min || median > max)) return unavailable('一致预期中值与极值区间互相冲突，未作偏离判断。')
  const rules = [], notes = [], fallback = !historical.length
  if (!sample) notes.push(`预测家数${count ?? '未知'}，样本有限，不作C2/C3强判断`)
  if (!positiveBase) notes.push('中值为空、零或负数，不作相对偏离及标准差强判断')
  if (!interval || std === null || std <= 0) notes.push('区间或标准差字段缺失/无效，对应规则未执行')
  if (fallback) notes.push(`报告基准日${claim.baseDate}无快照，EST_DT=${estDt}仅作事后参考，不能判断历史报告当时有误`)
  if (!fallback) {
    if (Number.isInteger(count) && count > 0 && interval && (reportedValue < min || reportedValue > max)) rules.push('C1')
    if (sample && positiveBase && Math.abs(reportedValue - median) - median * 0.20 > Math.max(1, Math.abs(reportedValue), median) * 1e-12) rules.push('C2')
    if (sample && positiveBase && std !== null && std > 0 && Math.abs(reportedValue - median) > std) rules.push('C3')
  }
  const unit = claim.metric === 'EPS' ? '元' : '万元'
  const evidence = { kind: 'consensus', label: `infodb · Wind一致预期 · ${estDt}`, data: { source: 'infodb', schema: SCHEMA, apiName: TABLE, windCode: claim.windCode, forecastYear: claim.year, estReportDt: period, estDt, reportBaseDate: claim.baseDate, fallback, metric: claim.metric, reportedValue, originalValue: claim.value, originalUnit: claim.unit, unit, avg, median, min, max, std, institutionCount: count, deviationPct: deviation === null ? null : deviation * 100, threshold: 0.20, rules, notes, direction: '未比较同比与上/下修方向；不执行C4' } }
  return { status: notes.length ? 'partial' : 'completed', rules, evidence, detail: notes.join('；') || `${claim.windCode} ${claim.year}年度${METRICS[claim.metric]}已按${estDt}快照比较。` }
}

const FIELDS = ['S_INFO_WINDCODE', 'EST_REPORT_DT', 'EST_DT', 'NUM_EST_INST', ...Object.keys(METRICS).flatMap(metric => ['AVG', 'MEDIAN', 'MIN', 'MAX', 'DEV'].map(suffix => `${metric}_${suffix}`))]
function sqlFor(claim, fallback) {
  const where = `S_INFO_WINDCODE = '${claim.windCode}' AND EST_REPORT_DT = '${claim.year}1231'`
  return `SELECT ${FIELDS.join(', ')} FROM ${SCHEMA}.${TABLE} WHERE ${where} AND EST_DT = (SELECT MAX(EST_DT) FROM ${SCHEMA}.${TABLE} WHERE ${where}${fallback ? '' : ` AND EST_DT <= '${claim.baseDate}'`})`
}

/** Support only actual managed schemas that explicitly expose infodb read-only SQL. No guessed tool or business API names. */
function sourceFor(ctx, agent, claim) {
  if (!agent || ctx.agents?.get(agent.id) !== agent || agent.session?.id !== agent.id || !ctx.tools?.execute || !ctx.tools.get) return null
  for (const schema of (ctx.tools.schemas(agent) ?? []).slice(0, 256)) {
    if (!schema?.name?.startsWith('ework__') || !/\binfodb\b/iu.test(schema.description ?? '')) continue
    const definition = ctx.tools.get(schema.name, agent), parameters = definition?.parameters, props = parameters?.properties
    if (parameters?.type !== 'object' || props?.source?.type !== 'string' || props?.schema?.type !== 'string') continue
    const key = ['sql', 'query'].find(key => props[key]?.type === 'string' && /\bSQL\b|\bSELECT\b/iu.test(`${schema.description} ${props[key].description ?? ''}`))
    if (!key) continue
    const args = { source: 'infodb', schema: SCHEMA, [key]: sqlFor(claim, false) }
    if (validateJsonSchemaValue(parameters, args).length) continue
    try { if (definition.presentCall?.(args)?.kind !== 'read') continue } catch { continue }
    return { name: schema.name, args: fallback => ({ ...args, [key]: sqlFor(claim, fallback) }) }
  }
  return null
}

function sourceRows(result) {
  if (!result || result.isError || !Array.isArray(result.content)) throw Error('来源执行失败。')
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
  if (!text || Buffer.byteLength(text) > 256000) throw Error('来源响应不完整或超出容量。')
  let value
  try { value = JSON.parse(text) } catch { throw Error('来源未返回可核验的JSON数据。') }
  let depth = 0
  while (record(value) && depth++ < 6) {
    if (value.truncated || value.has_more || value.hasMore || value.error || value.isError || typeof value.retCode === 'number' && value.retCode < 0) throw Error('来源响应包含错误、截断或未完整分页。')
    const collection = Array.isArray(value.rows) ? value.rows : Array.isArray(value.data) ? value.data : null
    if (collection && [value.total, value.totalCount, value.count].some(total => number(total) !== null && number(total) > collection.length)) throw Error('来源响应未覆盖其声明的记录总数。')
    if (Array.isArray(value.rows) && Array.isArray(value.columns)) {
      if (value.columns.some(column => typeof column !== 'string')) throw Error('来源字段名无效。')
      value = value.rows.map(row => Object.fromEntries(value.columns.map((key, index) => [key, row[index]]))); break
    }
    if (Array.isArray(value.rows)) { value = value.rows; break }
    if (Object.hasOwn(value, 'data')) value = value.data
    else if (Object.hasOwn(value, 'result')) value = value.result
    else if (Object.hasOwn(value, 'S_INFO_WINDCODE')) { value = [value]; break }
    else throw Error('来源返回字段无法识别。')
  }
  if (!Array.isArray(value) || value.length > 200 || value.some(row => !record(row))) throw Error('来源未返回有界记录。')
  return value
}

export async function reviewNoteConsensus(ctx, input, signal) {
  signal?.throwIfAborted()
  const targets = input.targetBlockIds ? new Set(input.targetBlockIds) : null
  const claims = extractConsensusClaims(input.blocks).filter(claim => !targets || targets.has(claim.blockId)), issues = [], checks = []
  if (!claims.length) return { issues, checks: [{ kind: 'consensus', status: 'skipped', detail: '本批未可靠识别证券代码、报告基准日、预测年度、指标、数值及单位；未执行一致预期比对。' }] }
  const agent = ctx.agents?.get(input.sessionId), cache = new Map()
  let groups = 0
  for (const claim of claims.slice(0, 12)) {
    signal?.throwIfAborted()
    const key = `${claim.windCode}/${claim.year}/${claim.baseDate}`
    if (!cache.has(key)) {
      if (groups++ >= 3) { checks.push({ kind: 'consensus', status: 'partial', detail: '本批已达到3组证券/年度/基准日查询预算，剩余预测未查。' }); break }
      const source = sourceFor(ctx, agent, claim)
      if (!source) return { issues, checks: [...checks, { kind: 'consensus', status: 'unavailable', detail: '当前会话没有可识别、已授权的只读infodb SQL来源；未查询、未使用其他来源替代。' }] }
      try {
        const query = async fallback => {
          const budget = deadline(signal, 4000)
          try {
            const response = await abortable(ctx.tools.execute({ name: source.name, arguments: source.args(fallback), agent, callId: randomUUID(), signal: budget.signal }), budget.signal)
            const rows = sourceRows(response)
            if (rows.some(row => row.S_INFO_WINDCODE !== claim.windCode || String(row.EST_REPORT_DT) !== `${claim.year}1231` || !date(row.EST_DT) || !fallback && date(row.EST_DT) > claim.baseDate)) throw Error('来源返回的代码、报告期或预测日期不符合查询条件。')
            return rows
          } finally { budget.dispose() }
        }
        let rows = await query(false)
        if (!rows.length) rows = await query(true)
        cache.set(key, { rows, toolName: source.name })
      } catch {
        signal?.throwIfAborted()
        cache.set(key, { error: true })
      }
    }
    const received = cache.get(key)
    if (received.error) { checks.push({ kind: 'consensus', status: 'unavailable', detail: `${claim.windCode} ${claim.year}年度来源未取得有效完整数据（可能超时、无权限或响应不符）；未作偏离判断。` }); continue }
    const comparison = compareConsensusClaim(claim, received.rows)
    checks.push({ kind: 'consensus', status: comparison.status, detail: comparison.detail })
    if (!comparison.rules.length) continue
    comparison.evidence.data.toolName = received.toolName
    const data = comparison.evidence.data
    issues.push({ blockId: claim.blockId, quote: claim.quote, category: 'research', message: `${claim.windCode} ${claim.year}年度${METRICS[claim.metric]}预测为${data.reportedValue}${data.unit}；${data.estDt}一致预期中值${data.median ?? '缺失'}${data.unit}，触发${comparison.rules.join('/')}。请说明预测假设差异${claim.metric === 'EPS' ? '及EPS股本基准是否一致' : ''}。${comparison.status === 'partial' ? comparison.detail : ''}`.slice(0, 600), evidence: [comparison.evidence] })
  }
  if (claims.length > 12) checks.push({ kind: 'consensus', status: 'partial', detail: `本批识别${claims.length}项预测，仅前12项进入专项预算。` })
  return { issues, checks }
}
