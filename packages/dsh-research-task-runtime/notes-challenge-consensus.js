import { randomUUID } from 'node:crypto'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { abortable, deadline, uniqueQuote } from './notes-challenge-bounds.js'
import { consensusDate as date, consensusSql } from './notes-challenge-consensus-query.js'
import { managedInfodbSource } from './notes-challenge-infodb-skill.js'

const TABLE = 'ASHARECONSENSUSDATA', SCHEMA = 'TYDW_FILESYNC'
const METRICS = { EPS: 'EPS', NET_PROFIT: '归母净利润', MAIN_BUS_INC: '主营业务收入' }
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const number = value => (typeof value === 'number' || typeof value === 'string' && value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null
const distinct = values => [...new Set(values)]
const codes = text => distinct([...text.matchAll(/\b\d{6}\.(?:SH|SZ|BJ)\b/giu)].map(match => match[0].toUpperCase()))
const reportDate = value => {
  const parts = value.match(/^(20\d{2})年(\d{1,2})月(\d{1,2})日$/u) ?? value.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})$/u)
  return date(parts ? parts[1]+parts[2].padStart(2,'0')+parts[3].padStart(2,'0') : value)
}
// Keep an invalid explicitly labelled date as an ambiguity marker. It must not
// borrow a different paragraph's valid cutoff or accept a valid numeric prefix.
const dates = text => distinct([...text.matchAll(/(?:报告基准日|报告发布日期|报告发布日|报告日期|基准日|模型日|预测截止日)\s*[:：]?\s*(20[^\s。；;，,]*)/gu)].map(match => reportDate(match[1])))
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
      const metricPattern = /(EPS|每股收益|归母净利润|归属于母公司(?:股东)?的?净利润|主营业务收入|主营收入|营业总收入|营业收入)\s*(?:预测)?\s*(?:为|达|至|约为|约|预计|[:：=])?\s*([+-]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(亿元|万元|千元|元(?:\/股)?)/giu
      let previousMetricEnd=0
      for (const match of sentence.matchAll(metricPattern)) {
        const revision=sentence.slice(previousMetricEnd,match.index).match(/(?:较|相较)(?:上月|一个月前)\s*[，,]?\s*(?:我们|本报告)?\s*(上调|调高|上修|下调|调低|下修)\s*(?:对)?\s*(?:20\d{2}\s*年(?:度)?)?\s*$/u)
        previousMetricEnd=match.index+match[0].length
        const label = match[1], metric = /EPS|每股收益/iu.test(label) ? 'EPS' : /净利润/u.test(label) ? 'NET_PROFIT' : 'MAIN_BUS_INC'
        const unit = match[3].replace('/股', ''), value = Number(match[2].replaceAll(',', ''))
        if (!Number.isFinite(value) || metric === 'EPS' && unit !== '元' || !uniqueQuote(block.text, match[0])) continue
        claims.push({ blockId: block.id, quote: match[0], windCode: code, baseDate, year: years[0], metric, value, unit, ...metric === 'MAIN_BUS_INC' && !/^主营/u.test(label) ? { basis: label } : {}, ...revision?{revisionDirection:/上|高/u.test(revision[1])?1:-1}:{} })
      }
    }
  }
  return claims
}

const unavailable = detail => ({ status: 'unavailable', rules: [], detail })
const scaleFor = claim => claim.metric==='EPS'?(claim.unit==='元'?1:null):({亿元:10000,万元:1,千元:.1,元:.0001})[claim.unit]
function revisionCounts(row,metric,count) {
  const values=['UPGRADE','DOWNGRADE','MAINTAIN'].map(s=>number(row[metric+'_'+s]))
  const missing=values.every(v=>v===null)
  const valid=!missing&&Number.isInteger(count)&&count>=0&&values.slice(0,2).every(v=>Number.isInteger(v)&&v>=0)&&(values[2]===null||Number.isInteger(values[2])&&values[2]>=0)&&values.reduce((sum,v)=>sum+(v??0),0)<=count
  return {upgrade:valid?values[0]:null,downgrade:valid?values[1]:null,maintain:valid?values[2]:null,invalid:!missing&&!valid,valid}
}

/** Explicit report metadata selects a threshold; company names never infer an industry. */
export function consensusPolicyFromBlocks(blocks) {
  const all=blocks.flatMap(b=>b.text.split(/[\n。；;]/u)).map(s=>s.trim().replace(/[.!?！？]$/u,'').trim()),lines=all.filter(s=>/^一致预期偏离阈值\s*[:：]/u.test(s))
  const values=lines.map(line=>{const match=line.match(/^一致预期偏离阈值\s*[:：]\s*(\d+(?:\.\d+)?)\s*[%％]$/u);const value=match?Number(match[1])/100:NaN;if(!Number.isFinite(value)||value<=0||value>1)throw Error('一致预期偏离阈值无效，请明确指定0%到100%之间的正数。');return value})
  if(distinct(values).length>1)throw Error('一致预期偏离阈值有冲突，未作偏离判断。')
  const cycles=all.filter(s=>/^一致预期统计周期\s*[:：]/u.test(s)).map(line=>{const match=line.match(/^一致预期统计周期\s*[:：]\s*(30|90|180)\s*天$/u);if(!match)throw Error('一致预期统计周期须为30天、90天或180天。');return {'30':'263001000','90':'263002000','180':'263003000'}[match[1]]})
  if(distinct(cycles).length>1)throw Error('一致预期统计周期有冲突，未作偏离判断。')
  return {threshold:values[0]??.20,cycle:cycles[0]??'263002000'}
}

function snapshot(claim,rows,cycle) {
  const all=rows.filter(row=>record(row)&&row.S_INFO_WINDCODE===claim.windCode&&String(row.EST_REPORT_DT)===`${claim.year}1231`&&date(row.EST_DT))
  const matching=all.some(row=>row.CONSEN_DATA_CYCLE_TYP!=null)?all.filter(row=>row.CONSEN_DATA_CYCLE_TYP===cycle):all
  const historical=matching.filter(row=>date(row.EST_DT)<=date(claim.baseDate)),eligible=historical.length?historical:matching
  if(!eligible.length)return null
  const estDt=eligible.map(row=>date(row.EST_DT)).sort().at(-1),candidates=eligible.filter(row=>date(row.EST_DT)===estDt)
  const fields=['CONSEN_DATA_CYCLE_TYP','NUM_EST_INST','S_EST_BASESHARE',...['AVG','MEDIAN','MIN','MAX','DEV','UPGRADE','DOWNGRADE','MAINTAIN'].map(s=>`${claim.metric}_${s}`)]
  if(distinct(candidates.map(row=>JSON.stringify(fields.map(f=>row[f]??null)))).length!==1)return {conflict:true}
  return {row:candidates[0],estDt,fallback:!historical.length}
}

function directionFor(claim,rows,current,claims,minInstitutions,cycle) {
  const none={kind:'unavailable',detail:'缺少可比的相邻年度预测或明确月度修订方向，未执行C4。'}
  const count=number(current.row.NUM_EST_INST)
  if(current.fallback||!Number.isInteger(count)||count<minInstitutions||current.row.CONSEN_DATA_CYCLE_TYP!==cycle)return none
  const comparisons=[],previous=(claims??[]).filter(c=>c.windCode===claim.windCode&&c.baseDate===claim.baseDate&&c.metric===claim.metric&&c.year===claim.year-1&&!c.basis)
  if(previous.length===1){
    const prior=snapshot(previous[0],rows,cycle),scale=scaleFor(previous[0]),median=number(current.row[claim.metric+'_MEDIAN'])
    const previousMedian=prior?.row?number(prior.row[claim.metric+'_MEDIAN']):null
    const priorCount=number(prior?.row?.NUM_EST_INST),priorMin=number(prior?.row?.[claim.metric+'_MIN']),priorMax=number(prior?.row?.[claim.metric+'_MAX'])
    const validMedian=previousMedian!==null&&(priorMin===null||previousMedian>=priorMin)&&(priorMax===null||previousMedian<=priorMax)
    if(prior?.row&&!prior.fallback&&scale!=null&&Number.isFinite(previous[0].value)&&median!==null&&validMedian&&Number.isInteger(priorCount)&&priorCount>=minInstitutions&&prior.row.CONSEN_DATA_CYCLE_TYP===current.row.CONSEN_DATA_CYCLE_TYP){
      const reportedChange=claim.value*scaleFor(claim)-previous[0].value*scale,consensusChange=median-previousMedian
      comparisons.push({kind:'adjacent-year',previousYear:previous[0].year,previousEstDt:prior.estDt,previousReportedValue:previous[0].value*scale,previousMedian,reportedChange,consensusChange,conflict:reportedChange*consensusChange<0})
    }
  }
  // EPS has no matching revision-count family; profit counts must not stand in for EPS revisions.
  const {upgrade,downgrade,valid}=revisionCounts(current.row,claim.metric,count)
  if(claim.metric!=='EPS'&&[1,-1].includes(claim.revisionDirection)&&valid){
    const consensusDirection=Math.sign(upgrade-downgrade)
    comparisons.push({kind:'monthly-revision',reportedDirection:claim.revisionDirection,consensusDirection,conflict:claim.revisionDirection*consensusDirection<0})
  }
  const primary=comparisons.find(c=>c.conflict)??comparisons[0]
  return primary?{...primary,comparisons}:none
}

/** Rows here must come from the host source adapter; model output never reaches this calculation. */
export function compareConsensusClaim(claim, rows, options={}) {
  if (!METRICS[claim.metric] || !/^\d{6}\.(SH|SZ|BJ)$/.test(claim.windCode) || !date(claim.baseDate) || !Number.isInteger(claim.year) || claim.year < 2000 || claim.year > 2099 || !Number.isFinite(claim.value)) return unavailable('预测字段不完整，无法比对。')
  if (claim.basis) return { status: 'skipped', rules: [], detail: `${claim.basis}与静态表主营业务收入口径尚未确认，未作偏离判断。` }
  const {threshold=.20,minInstitutions=5,stdMultiplier=1,cycle='263002000'}=options
  if(!Number.isFinite(threshold)||threshold<=0||threshold>1||!Number.isInteger(minInstitutions)||minInstitutions<1||minInstitutions>1000||!Number.isFinite(stdMultiplier)||stdMultiplier<=0||stdMultiplier>10)return unavailable('一致预期比较配置无效。')
  if(options.enabledMetrics&&!options.enabledMetrics.includes(claim.metric))return {status:'skipped',rules:[],detail:'该指标未启用一致预期比较。'}
  const scale = scaleFor(claim)
  if (scale == null) return unavailable('报告单位不明确，未作换算。')
  const reportedValue = claim.value * scale, period = `${claim.year}1231`
  if (!Number.isFinite(reportedValue) || !Array.isArray(rows)) return unavailable('预测数值或数据无效。')
  if(!['263001000','263002000','263003000'].includes(cycle))return unavailable('一致预期统计周期无效。')
  const current=snapshot(claim,rows,cycle)
  if(!current)return unavailable(`${claim.windCode} ${claim.year}年度本次来源未返回可用一致预期快照，无法比对。`)
  if(current.conflict)return unavailable('同一预测快照返回互相冲突的记录，未作判断。')
  const {row,estDt,fallback}=current,median = number(row[claim.metric + '_MEDIAN']), avg = number(row[claim.metric + '_AVG']), min = number(row[claim.metric + '_MIN']), max = number(row[claim.metric + '_MAX']), std = number(row[claim.metric + '_DEV']), count = number(row.NUM_EST_INST)
  const sample = Number.isInteger(count) && count >= minInstitutions, relativeBase = median !== null && median !== 0, interval = min !== null && max !== null && min <= max, deviation = relativeBase ? Math.abs(reportedValue - median) / Math.abs(median) : null
  if (interval && median !== null && (median < min || median > max)) return unavailable('一致预期中值与极值区间互相冲突，未作偏离判断。')
  const rules = [], notes = []
  const revisions=revisionCounts(row,claim.metric,count)
  if(revisions.invalid)notes.push('修订家数缺失或不一致，未采用这些家数作月度方向判断')
  if (!sample) notes.push(`预测家数${count ?? '未知'}，样本有限，不作C2/C3强判断`)
  if (!relativeBase) notes.push('中值为空或零，不作相对偏离判断')
  if (!interval || std === null || std < 0) notes.push('区间或标准差字段缺失/无效，对应规则未执行')
  if (fallback) notes.push(`报告基准日${claim.baseDate}无快照，已回退至最新EST_DT=${estDt}比较；仅作事后参考，不能据此认定历史报告当时有误`)
    if (Number.isInteger(count) && count > 0 && interval && (reportedValue < min || reportedValue > max)) rules.push('C1')
    if (sample && relativeBase && Math.abs(reportedValue - median) - Math.abs(median) * threshold > Math.max(1, Math.abs(reportedValue), Math.abs(median)) * 1e-12) rules.push('C2')
    if (sample && median !== null && std !== null && std >= 0 && Math.abs(reportedValue - median) > std*stdMultiplier) rules.push('C3')
  const direction=directionFor(claim,rows,current,options.claims,minInstitutions,cycle)
  if(direction.conflict)rules.push('C4')
  const unit = claim.metric === 'EPS' ? '元' : '万元'
  const evidence = { kind: 'consensus', label: `infodb · Wind一致预期 · ${estDt}`, data: { source: 'infodb', schema: SCHEMA, apiName: TABLE, windCode: claim.windCode, forecastYear: claim.year, estReportDt: period, estDt, reportBaseDate: claim.baseDate, fallback, metric: claim.metric, reportedValue, originalValue: claim.value, originalUnit: claim.unit, unit, avg, median, min, max, std, institutionCount: count, deviationPct: deviation === null ? null : deviation * 100, threshold, minInstitutions, stdMultiplier, rules, notes, direction, upgrade:revisions.upgrade,downgrade:revisions.downgrade,maintain:revisions.maintain,baseShare:number(row.S_EST_BASESHARE),baseShareUnit:'万股',cycle:row.CONSEN_DATA_CYCLE_TYP??null,severity:rules.includes('C1')?'CRITICAL':rules.includes('C2')?'HIGH':'MEDIUM' } }
  return { status: notes.length ? 'partial' : 'completed', rules, evidence, detail: notes.join('；') || `${claim.windCode} ${claim.year}年度${METRICS[claim.metric]}已按${estDt}快照比较。` }
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
    const args = { source: 'infodb', schema: SCHEMA, [key]: consensusSql(claim, 'historical') }
    if (validateJsonSchemaValue(parameters, args).length) continue
    try { if (definition.presentCall?.(args)?.kind !== 'read') continue } catch { continue }
    return { name: schema.name, query:(claim,mode,signal)=>ctx.tools.execute({name:schema.name,arguments:{...args,[key]:consensusSql(claim,mode)},agent,callId:randomUUID(),signal}) }
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
  let policy
  try { policy=consensusPolicyFromBlocks(input.blocks) }catch(error){return {issues,checks:[{kind:'consensus',status:'unavailable',detail:error.message}]}}
  const agent = ctx.agents?.get(input.sessionId), cache = new Map(), selected=claims.slice(0,12)
  let skillSource
  const keyFor=claim=>`${claim.windCode}/${claim.year}/${claim.baseDate}`
  let groups = 0
  for (const claim of selected) {
    signal?.throwIfAborted()
    const key = keyFor(claim)
    if (!cache.has(key)) {
      if (groups++ >= 3) { checks.push({ kind: 'consensus', status: 'partial', detail: '本批已达到3组证券/年度/基准日查询预算，剩余预测未查。' }); break }
      let phase='discovery'
      try {
        const discovery=deadline(signal,8000)
        let source
        const queryClaim={...claim,cycle:policy.cycle}
        try {
          source=sourceFor(ctx,agent,queryClaim)
          if(!source){
            skillSource??=await abortable(managedInfodbSource(ctx,agent,discovery.signal),discovery.signal)
            source=skillSource
          }
        }finally{discovery.dispose()}
        if (!source) return { issues, checks: [...checks, { kind: 'consensus', status: 'unavailable', detail: '当前会话没有可用的已授权infodb只读SQL工具或已启用的infodb读取技能；未查询、未使用其他来源替代。' }] }
        const query = async mode => {
          phase='read'
          // Managed skill reads include two fresh authorization round trips.
          // Their Python/DB process retains its own 4s bound; the full review
          // deadline still bounds discovery, authorization and all query groups.
          const budget = deadline(signal, source.kind==='skill'?12000:4000)
          try {
            const response = await abortable(source.query(queryClaim,mode,budget.signal), budget.signal)
            phase='response'
            const rows = sourceRows(response)
            if (mode!=='coverage'&&rows.some(row => row.S_INFO_WINDCODE !== claim.windCode || String(row.EST_REPORT_DT) !== `${claim.year}1231` || row.CONSEN_DATA_CYCLE_TYP!==policy.cycle || !date(row.EST_DT) || mode==='historical' && date(row.EST_DT) > claim.baseDate)) throw Error('来源返回的代码、报告期、统计周期或预测日期不符合查询条件。')
            return rows
          } finally { budget.dispose() }
        }
        let rows = await query('historical'), coverage
        if (!rows.length) rows = await query('latest')
        if(!rows.length){
          const value=await query('coverage')
          const period=p=>/^(?:19|20)\d{2}1231$/.test(String(p??''))
          if(value.length===1&&period(value[0].FIRST_PERIOD)&&period(value[0].LAST_PERIOD)&&value[0].FIRST_PERIOD<=value[0].LAST_PERIOD)coverage=value[0]
        }
        cache.set(key, { rows, coverage, toolName: source.name, kind:source.kind })
      } catch(error) {
        signal?.throwIfAborted()
        console.warn(JSON.stringify({event:'notes-consensus-source-failed',phase:['module','connection','transaction','query','fetch'].includes(error?.phase)?error.phase:phase,...typeof error?.driverCode==='string'&&/^[A-Z]{2,6}-[0-9]{3,6}$/.test(error.driverCode)?{driverCode:error.driverCode}:{}}))
        cache.set(key, { error: true })
      }
    }
  }
  for(const claim of selected){
    signal?.throwIfAborted()
    const received = cache.get(keyFor(claim))
    if(!received)continue
    if (received.error) { checks.push({ kind: 'consensus', status: 'unavailable', detail: `${claim.windCode} ${claim.year}年度来源未取得有效完整数据（可能超时、无权限或响应不符）；未作偏离判断。` }); continue }
    if(!received.rows.length){
      const range=received.coverage,period=`${claim.year}1231`,outside=range&&(period<range.FIRST_PERIOD||period>range.LAST_PERIOD)
      checks.push({kind:'consensus',status:'unavailable',detail:outside?`${claim.windCode} ${claim.year}年度不在来源当前覆盖报告期${range.FIRST_PERIOD}至${range.LAST_PERIOD}内；未作偏离判断。`:`${claim.windCode} ${claim.year}年度一致预期数据缺失${range?'（报告期位于当前覆盖范围内）':''}，未作偏离判断。`})
      continue
    }
    // Keep each report's cutoff isolated even if another report for this ticker is in the same batch.
    const comparisonRows=[...cache.entries()].filter(([key])=>key.endsWith('/'+claim.baseDate)).flatMap(([,value])=>value.rows??[])
    const comparison = compareConsensusClaim(claim, comparisonRows, {...policy,claims:selected})
    checks.push({ kind: 'consensus', status: comparison.status, detail: comparison.detail })
    if (!comparison.rules.length) continue
    comparison.evidence.data.toolName = received.toolName
    if(received.kind==='skill')comparison.evidence.data.skillName=received.toolName
    const data = comparison.evidence.data
    const display=value=>value===null?'缺失':Number((value/scaleFor(claim)).toFixed(4))+claim.unit
    const revision=data.downgrade!==null||data.upgrade!==null?`近一月调高${data.upgrade??'未知'}家、调低${data.downgrade??'未知'}家。`:''
    const directions=(data.direction.comparisons??[]).filter(c=>c.conflict).map(c=>c.kind==='adjacent-year'?`报告较${c.previousYear}年${c.reportedChange>0?'增加':'减少'}${display(Math.abs(c.reportedChange))}，一致预期中值同期${c.consensusChange>0?'增加':'减少'}${display(Math.abs(c.consensusChange))}。`:`报告较上月${c.reportedDirection>0?'上调':'下调'}该预测，市场近一月以${c.consensusDirection>0?'上调':'下调'}为主。`).join('')
    const deviation=data.deviationPct===null?'':`相对中值偏离${Number(data.deviationPct.toFixed(2))}%（阈值${Number((data.threshold*100).toFixed(2))}%）。`
    const questions=[
      `收入、成本或利润率等核心假设与市场有何差异${claim.metric==='EPS'?'，EPS股本基准是否一致':''}？`,
      `与机构一致预期的分歧来自信息差还是假设差异${data.downgrade>data.upgrade&&data.upgrade!==null?'，是否已纳入近一月下修反映的因素':''}？`,
      '若维持这一预测，请说明该情景对应的估值影响。'
    ]
    data.questionsToResearcher=questions
    issues.push({ blockId: claim.blockId, quote: claim.quote, category: 'research', message: `${claim.windCode} ${claim.year}年度${METRICS[claim.metric]}预测${claim.value}${claim.unit}；${data.estDt}一致预期中值${display(data.median)}，范围[${display(data.min)}, ${display(data.max)}]，${data.institutionCount??'未知'}家机构，触发${comparison.rules.join('/')}。${deviation}${directions}${revision}预测分歧不等于事实错误，不会将预测强制改为市场中值。请研究员说明：${questions.map((question,index)=>`${index+1}. ${question}`).join(' ')}${comparison.status === 'partial' ? comparison.detail : ''}`.slice(0, 600), evidence: [comparison.evidence] })
  }
  if (claims.length > 12) checks.push({ kind: 'consensus', status: 'partial', detail: `本批识别${claims.length}项预测，仅前12项进入专项预算。` })
  return { issues, checks }
}
