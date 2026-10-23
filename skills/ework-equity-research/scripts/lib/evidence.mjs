import { readFile, realpath, stat } from 'node:fs/promises'
import { resolve, relative, isAbsolute, dirname } from 'node:path'
import { createHash } from 'node:crypto'
import { displayDecimal } from './numbers.mjs'
import { METRICS, UNITS, isObject, isText, isTimestamp, idValid, diagnostic, periodKey, normalized } from './schema.mjs'
export const digest = value => createHash('sha256').update(value).digest('hex')
const inside = (root, path) => {
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith('../') && !rel.startsWith('..\\') && !isAbsolute(rel)
}
async function localRead(root, file) {
  if (!isText(file) || isAbsolute(file) || !inside(root, resolve(root, file))) throw new Error('SOURCE_PATH:本地快照路径必须位于root目录内')
  const path = resolve(root, file)
  // Check parent realpath before opening, so even a dangling file under an escaping symlink is rejected.
  const parent = await realpath(dirname(path))
  if (!inside(root, parent)) throw new Error('SOURCE_PATH:符号链接不得逃逸root目录')
  const actual = await realpath(path)
  if (!inside(root, actual)) throw new Error('SOURCE_PATH:符号链接不得逃逸root目录')
  if ((await stat(actual)).size > 20 * 1024 * 1024) throw new Error('SOURCE_IO:单个来源快照不得超过20MiB')
  return readFile(actual)
}
export async function verifySources(packet, root, diagnostics) {
  const sources = []
  const texts = new Map()
  const ids = new Set()
  for (const [index, source] of packet.sources.entries()) {
    const path = `sources[${index}]`
    const errors = diagnostics.length
    const result = {
      ...source, integrity: 'invalid', authenticity: 'unverified',
      evidenceLevel: source?.kind === 'pdf-extract' ? 'extracted-text-only' : 'local-text-only',
    }
    try {
      if (!isObject(source) || !idValid(source.id) || ids.has(source.id) || !isText(source.title) ||
          !isText(source.publisher) || !isTimestamp(source.publishedAt) || !isTimestamp(source.accessedAt) ||
          !['text-snapshot', 'pdf-extract'].includes(source.kind) || !/^[a-f0-9]{64}$/.test(source.sha256 || '')) throw new Error('SOURCE_SCHEMA:来源需要唯一id、title、publisher、kind、publishedAt、accessedAt、textFile与64位小写sha256')
      ids.add(source.id)
      if (source.publishedAt.slice(0, 10) > packet.asOf || Date.parse(source.publishedAt) > Date.parse(source.accessedAt)) {
        throw new Error('SOURCE_DATE:披露日期不得晚于研究截止日或实际访问时间；回溯研究允许访问时间晚于截止日')
      }
      if (source.url && (!/^https?:\/\//.test(source.url) || !URL.canParse(source.url))) throw new Error('SOURCE_SCHEMA:url必须是HTTP(S)来源地址')
      const bytes = await localRead(root, source.textFile)
      if (digest(bytes) !== source.sha256) throw new Error('SOURCE_HASH_MISMATCH:文本快照SHA-256与登记不一致')
      if (source.kind === 'pdf-extract') {
        if (!/^[a-f0-9]{64}$/.test(source.originalSha256 || '') ||
            !isObject(source.extraction) || !isText(source.extraction.method) ||
            !Array.isArray(source.extraction.pages) || !source.extraction.pages.length) throw new Error('SOURCE_SCHEMA:PDF提取需originalFile/originalSha256及extraction:{method,pages:[{page,lineStart,lineEnd}]}')
        const original = await localRead(root, source.originalFile)
        if (digest(original) !== source.originalSha256) throw new Error('SOURCE_HASH_MISMATCH:PDF原文件SHA-256与登记不一致')
        result.originalIntegrity = 'verified'
        result.extractionFidelity = 'unverified'
      }
      texts.set(source.id, bytes.toString('utf8').replaceAll('\r\n', '\n').split('\n'))
      result.integrity = 'verified'
      diagnostics.push(diagnostic('SOURCE_AUTHENTICITY_UNVERIFIED', path, '已实际读取并核对本地快照哈希；发布者/URL声明不构成来源真实性认证，PDF提取忠实性未验证', 'warning'))
    } catch (error) {
      const [code, ...message] = error.message.split(':')
      diagnostics.push(diagnostic(code.startsWith('SOURCE_') ? code : 'SOURCE_IO', path, message.join(':') || error.message))
    }
    if (diagnostics.slice(errors).some(d => d.severity === 'error')) texts.delete(source?.id)
    sources.push(result)
  }
  return { sources, texts }
}
const escapeRE = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const containsToken = (text, token) => new RegExp(`(?<![\\p{L}\\p{N}_.])${escapeRE(token)}(?![\\p{L}\\p{N}_.])`, 'u').test(text)
const containsNumber = (text, token) => new RegExp(`(?<![\\d.,+(\\-])${escapeRE(token)}(?![\\d.,)])`, 'u').test(text)
// Reject a short semantic token hidden inside a different longer registered token.
function unembedded(text, token, vocabulary) {
  text = text.toLowerCase()
  token = token.toLowerCase()
  vocabulary = vocabulary.map(term => term.toLowerCase())
  let position = text.indexOf(token)
  while (position >= 0) {
    const embedded = vocabulary.some(other => other.length > token.length && other.includes(token) &&
      [...other.matchAll(new RegExp(escapeRE(token), 'g'))].some(match => position >= match.index &&
        text.slice(position - match.index, position - match.index + other.length) === other))
    if (!embedded) return true
    position = text.indexOf(token, position + 1)
  }
  return false
}

function scopeMarkers(lines) {
  const scopes = new Set()
  for (const line of lines) for (const scope of ['合并', '母公司']) {
    if ((/^\s*(?:范围|报表范围|口径)\s*[:：]/.test(line) && line.includes(scope)) ||
        new RegExp(`${scope}(?:资产负债表|利润表|现金流量表|财务报表)`).test(line) ||
        new RegExp(`(?:^|[\\s:：()（）])${scope}(?=$|[\\s()（）])`).test(line)) scopes.add(scope)
  }
  return scopes
}
function explicitUnits(line) {
  // Metric names such as 总股本 contain 股, but do not declare a unit.
  for (const term of Object.values(METRICS).flat().sort((a, b) => b.length - a.length)) line = line.replaceAll(term, ' ')
  const vocabulary = Object.values(UNITS).flatMap(unit => unit[2])
  return Object.entries(UNITS).filter(([, unit]) => unit[2].some(term =>
    unembedded(line, term, vocabulary) &&
    new RegExp(`(?<![\\p{L}_])${escapeRE(term)}(?![\\p{L}_])`, 'iu').test(line)))
}
function nearestMetric(cells) {
  return cells.slice().reverse().map(cell => cell.trim()).find(cell => {
    if (!cell || periodKey(cell) || ['合并', '母公司'].includes(cell) ||
        Object.values(UNITS).some(unit => unit[2].includes(cell)) ||
        /^[（(]?[一二三四五六七八九十百]+[）)、.,，]?\s*\d+$/.test(cell)) return false
    try { displayDecimal(cell); return false } catch { return true }
  })
}
function nearestPeriod(window, valueIndex, column) {
  for (let index = valueIndex - 1; index >= 0; index--) {
    const cells = window[index].split('\t')
    if (Object.values(METRICS).flat().some(term => unembedded(cells[0], term, Object.values(METRICS).flat()))) continue
    const period = periodKey(cells[column - 1]?.trim())
    if (period) return period
  }
  return null
}

export function verifyFacts(packet, sources, texts, diagnostics) {
  const facts = []
  const ids = new Set()
  for (const [index, fact] of packet.facts.entries()) {
    const path = `facts[${index}]`
    const start = diagnostics.length
    const fail = (code, message) => diagnostics.push(diagnostic(code, path, message))
    const result = { ...fact, status: 'invalid' }
    try {
      if (!isObject(fact) || !idValid(fact.id) || ids.has(fact.id) || !METRICS[fact.metric] ||
          !periodKey(fact.period) || !['合并', '母公司'].includes(fact.scope) ||
          !UNITS[fact.unit] || !idValid(fact.sourceId)) throw new Error('FACT_SCHEMA:事实需唯一id、受支持metric/period/scope/unit/value/sourceId')
      ids.add(fact.id)
      const declared = normalized(fact.value, fact.unit)
      const expectedUnit = fact.metric === 'shares' ? 'shares' : fact.metric === 'currentPrice' ? 'CNY_per_share' : fact.metric === 'grossMargin' ? 'ratio' : 'CNY'
      if (declared.unit !== expectedUnit) fail('UNIT_MISMATCH', `指标${fact.metric}要求${expectedUnit}量纲，增长率须使用明确计算`)
      const evidence = fact.evidence
      const loc = evidence?.locator
      const lines = texts.get(fact.sourceId)
      if (!lines) throw new Error('SOURCE_UNVERIFIED:事实引用的来源不存在或快照完整性未通过')
      if (!isObject(evidence) || !isObject(loc) ||
          !['quote', 'metricText', 'periodText', 'scopeText', 'unitText', 'valueText'].every(k => isText(evidence[k]))) throw new Error('FACT_SCHEMA:证据需quote、locator和五个原文字段metricText/periodText/scopeText/unitText/valueText')
      const { lineStart, lineEnd, column } = loc
      const valueLine = loc.valueLine ?? (lineStart === lineEnd ? lineStart : undefined)
      if (![lineStart, lineEnd, valueLine].every(Number.isInteger) || lineStart < 1 || lineEnd < lineStart ||
          lineEnd - lineStart > 80 || lineEnd > lines.length || valueLine < lineStart || valueLine > lineEnd ||
          (column !== undefined && (!Number.isInteger(column) || column < 1))) throw new Error('LOCATOR:证据行号必须有效；多行窗口需valueLine；column为从1起的TSV列号，窗口最多81行')
      const window = lines.slice(lineStart - 1, lineEnd)
      const row = lines[valueLine - 1]
      if (window.join('\n') !== evidence.quote) fail('QUOTE_MISMATCH', 'quote必须逐字等于指定行窗口（仅CRLF统一为LF）')
      if (!METRICS[fact.metric].includes(evidence.metricText) || !unembedded(row, evidence.metricText, Object.values(METRICS).flat())) fail('METRIC_MISMATCH', '指标必须是受控语义别名，并实际出现在数值所在行')
      if (periodKey(evidence.periodText) !== periodKey(fact.period) ||
          !window.some(line => containsToken(line, evidence.periodText))) fail('PERIOD_MISMATCH', '原文期间必须与事实期间一致且命中证据窗口')
      const scopes = scopeMarkers(window)
      if (evidence.scopeText !== fact.scope || !scopes.has(fact.scope) || scopes.size !== 1) fail('SCOPE_MISMATCH', 'scopeText必须与scope相同，并逐字命中窗口')
      const sourceUnit = Object.values(UNITS).find(unit => unit[2].includes(evidence.unitText))
      if (!sourceUnit || !unembedded(evidence.quote, evidence.unitText, Object.values(UNITS).flatMap(unit => unit[2])) ||
          sourceUnit[0] !== declared.unit) fail('UNIT_MISMATCH', '原文单位必须命中窗口且与声明单位量纲一致')
      const rowUnits = explicitUnits(row)
      const contextUnits = rowUnits.length ? rowUnits : window.slice(0, valueLine - lineStart).reverse().map(explicitUnits).find(units => units.length) || []
      if (sourceUnit && (contextUnits.length !== 1 || contextUnits[0][1][0] !== sourceUnit[0] || contextUnits[0][1][1] !== sourceUnit[1])) fail('UNIT_MISMATCH', '数值行的显式单位优先；否则使用最近单位表头，禁止跨取不同量纲或倍率')
      if (!containsNumber(row, evidence.valueText)) fail('NUMBER_MISSING', '原文数字必须作为完整数字token命中valueLine，其他行出现不算')
      const sourceValue = displayDecimal(evidence.valueText)
      if (sourceUnit && sourceValue.mul(sourceUnit[1]).cmp(declared.value) !== 0) fail('VALUE_MISMATCH', '原文数值按原文单位换算后与事实value/unit不一致')
      if (column !== undefined) {
        if (row.split('\t')[column - 1]?.trim() !== evidence.valueText) fail('CELL_MISMATCH', 'valueText必须等于指定TSV数据单元格')
        if (nearestPeriod(window, valueLine - lineStart, column) !== periodKey(evidence.periodText)) fail('PERIOD_MISMATCH', '期间必须位于同一TSV列的表头')
        if (!nearestMetric(row.split('\t').slice(0, column - 1))?.includes(evidence.metricText)) fail('METRIC_MISMATCH', '指标标签必须位于数值列之前')
      } else {
        const rowMetrics = Object.entries(METRICS).filter(([, terms]) => terms.some(term => unembedded(row, term, Object.values(METRICS).flat())))
        if (rowMetrics.length > 1) fail('AMBIGUOUS_METRIC', '同一叙述行包含多个指标，必须缩小原文记录或用明确的TSV行列绑定')
        const numericRow = row.replace(/20\d{2}-\d{2}-\d{2}(?:T[0-9:.+Z-]+)?|FY20\d{2}|20\d{2}(?:Q[1-4]|H[12]|年度|年)/g, ' ').replace(evidence.periodText, ' ')
        if ((numericRow.match(/-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g) || []).length > 1) fail('AMBIGUOUS_VALUE', '叙述行包含多个数字，无法确定数字与指标/单位的绑定；请用原表TSV列')
        const context = [...window]
        const at = row.lastIndexOf(evidence.valueText)
        context[valueLine - lineStart] = row.slice(0, at) + ' [value] ' + row.slice(at + evidence.valueText.length)
        const periods = new Set((context.join('\n').match(/FY20\d{2}|20\d{2}(?:Q[1-4]|H[12])|20\d{2}-\d{2}-\d{2}|20\d{2}年度|20\d{2}年|(?<!\d)20\d{2}(?!\d)/g) || []).map(periodKey))
        if (periods.size > 1) fail('AMBIGUOUS_PERIOD', '窗口包含多个期间，必须用TSV列明确绑定期间与数值')
      }
      const source = sources.find(s => s.id === fact.sourceId)
      if (loc.page !== undefined && (!Number.isInteger(loc.page) || loc.page < 1 ||
          source.kind !== 'pdf-extract' || !source.extraction.pages.some(p => p.page === loc.page && p.lineStart <= valueLine && p.lineEnd >= valueLine))) fail('PAGE_UNVERIFIED', '页码须对应valueLine所在PDF提取页的行范围映射；映射仍是提取声明')
      if (!diagnostics.slice(start).some(d => d.severity === 'error')) {
        Object.assign(result, {
          status: 'verified', normalizedValue: declared.value.toString(24), normalizedUnit: declared.unit,
          checks: { quote: true, number: true, metric: true, period: true, scope: true, unit: true },
        })
      }
    } catch (error) {
      const [code, ...message] = error.message.split(':')
      fail(/^[A-Z_]+$/.test(code) ? code : 'FACT_SCHEMA', message.join(':') || error.message)
    }
    facts.push(result)
  }
  return facts
}
