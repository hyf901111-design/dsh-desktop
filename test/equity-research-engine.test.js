import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { validatePacket, calculatePacket } from '../skills/ework-equity-research/scripts/lib/index.mjs'
import { decimal, formatDecimal } from '../skills/ework-equity-research/scripts/lib/numbers.mjs'

const temporary = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(p => rm(p, { recursive: true, force: true }))) })
const sha = text => createHash('sha256').update(text).digest('hex')
const scope = '合并'
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'equity-engine-')); temporary.push(root)
  const text = '范围：合并\n单位：万元\n指标\tFY2024\tFY2025\n营业收入\t100\t120\n营业成本\t50\t60\n'
  await writeFile(join(root, 'source.txt'), text)
  const packet = { schemaVersion: 1, synthetic: true, company: { name: '虚构演示公司', ticker: 'SYNTHETIC', currency: 'CNY' }, asOf: '2026-10-23', financialAsOf: '2025-12-31', sources: [{ id: 'annual', title: '虚构年度演示', publisher: '虚构出版者', kind: 'text-snapshot', textFile: 'source.txt', sha256: sha(text), publishedAt: '2026-03-01', accessedAt: '2026-10-23T00:00:00Z' }], facts: [], calculations: [] }
  function fact(id, metric, period, value, row, column) {
    return { id, metric, period, scope, unit: 'CNY_10K', value, sourceId: 'annual', evidence: { quote: text.trimEnd().split('\n').slice(0, row).join('\n'), locator: { lineStart: 1, lineEnd: row, valueLine: row, column }, metricText: metric === 'revenue' ? '营业收入' : '营业成本', periodText: period, scopeText: scope, unitText: '万元', valueText: value } }
  }
  packet.facts = [fact('rev24', 'revenue', 'FY2024', '100', 4, 2), fact('rev25', 'revenue', 'FY2025', '120', 4, 3), fact('cost25', 'costOfRevenue', 'FY2025', '60', 5, 3)]
  return { root, packet, text }
}
async function addRows(f, rows) {
  let text = f.text
  for (const row of rows) {
    text += `${row.metricText} ${row.period} ${scope} ${row.value} ${row.unitText}\n`
    const line = text.trimEnd().split('\n').length
    f.packet.facts.push({ id: row.id, metric: row.metric, period: row.period, scope, unit: row.unit, value: row.value, ...(row.asOf ? { asOf: row.asOf } : {}), sourceId: 'annual', evidence: { quote: text.trimEnd().split('\n').at(-1), locator: { lineStart: line, lineEnd: line }, metricText: row.metricText, periodText: row.period, scopeText: scope, unitText: row.unitText, valueText: row.value } })
  }
  f.text = text; f.packet.sources[0].sha256 = sha(text); await writeFile(join(f.root, 'source.txt'), text)
}
async function dcfFixture() {
  const f = await fixture()
  await addRows(f, [
    { id: 'cash', metric: 'cash', metricText: '货币资金', value: '20', unit: 'CNY', unitText: '元', period: '2025-12-31' },
    { id: 'debt', metric: 'debt', metricText: '有息债务', value: '10', unit: 'CNY', unitText: '元', period: '2025-12-31' },
    { id: 'assets', metric: 'nonOperatingAssets', metricText: '非经营资产', value: '5', unit: 'CNY', unitText: '元', period: '2025-12-31' },
    { id: 'minority', metric: 'minorityInterest', metricText: '少数股东权益', value: '2', unit: 'CNY', unitText: '元', period: '2025-12-31' },
    { id: 'shares', metric: 'shares', metricText: '总股本', value: '10', unit: 'shares', unitText: '股', period: '2025-12-31' },
    { id: 'price', metric: 'currentPrice', metricText: '现价', value: '100', unit: 'CNY_per_share', unitText: '元/股', period: '2026-10-23', asOf: '2026-10-23' },
  ])
  f.packet.dcf = { scope, asOf: '2026-10-23', currency: 'CNY', forecastTiming: 'year-end-fixed-periods', scenarios: ['bear', 'base', 'bull'].map(id => ({ id, fcff: ['100'], wacc: '0.1', terminalGrowth: '0', assumption: '纯虚构手工FCFF假设，无投资含义。' })), bridge: { cash: 'cash', debt: 'debt', nonOperatingAssets: 'assets', minorityInterest: 'minority', shares: 'shares' } }
  return f
}
const codes = result => result.diagnostics.map(d => d.code)

describe('equity research evidence boundary', () => {
  it('reads the snapshot and separates integrity from authenticity', async () => {
    const f = await fixture(); const v = await validatePacket(f.packet, { root: f.root })
    expect(v.ok).toBe(true); expect(v.facts[1].normalizedValue).toBe('1200000')
    expect(v.sources[0].authenticity).toBe('unverified'); expect(v.sources[0].integrity).toBe('verified')
  })
  it.each([['wrong period', p => { p.facts[1].period = 'FY2024' }, 'PERIOD_MISMATCH'], ['wrong metric', p => { p.facts[1].metric = 'netIncome' }, 'METRIC_MISMATCH'], ['invented number', p => { p.facts[1].value = '121' }, 'VALUE_MISMATCH'], ['wrong amount scale', p => { p.facts[1].unit = 'CNY' }, 'VALUE_MISMATCH'], ['wrong column', p => { p.facts[1].evidence.locator.column = 2 }, 'CELL_MISMATCH']])('rejects %s', async (_name, mutate, code) => {
    const f = await fixture(); mutate(f.packet); const v = await validatePacket(f.packet, { root: f.root }); expect(v.ok).toBe(false); expect(codes(v)).toContain(code)
  })
  it('does not accept a matching number elsewhere in the evidence window', async () => {
    const f = await fixture(); f.packet.facts[2].evidence.valueText = '120'; f.packet.facts[2].value = '120'
    const v = await validatePacket(f.packet, { root: f.root }); expect(v.ok).toBe(false); expect(codes(v)).toContain('CELL_MISMATCH')
  })
  it('requires a column when a table window contains multiple periods', async () => {
    const f = await fixture(); delete f.packet.facts[1].evidence.locator.column
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('AMBIGUOUS_PERIOD')
  })
  it('rejects altered snapshots and evidence that is not literally at its locator', async () => {
    const f = await fixture(); await writeFile(join(f.root, 'source.txt'), f.text + 'altered')
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('SOURCE_HASH_MISMATCH')
    await writeFile(join(f.root, 'source.txt'), f.text); f.packet.facts[0].evidence.quote += ' invented'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('QUOTE_MISMATCH')
  })
  it('rejects traversal and symlink escapes', async () => {
    const f = await fixture(); f.packet.sources[0].textFile = '../secret.txt'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('SOURCE_PATH')
    await symlink(tmpdir(), join(f.root, 'escape')); f.packet.sources[0].textFile = 'escape/secret.txt'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('SOURCE_PATH')
  })
  it('diagnoses schema errors instead of throwing', async () => {
    for (const p of [null, [], { schemaVersion: 8 }, { schemaVersion: 1, facts: 'bad' }]) expect((await validatePacket(p, { root: tmpdir() })).ok).toBe(false)
  })
  it('does not confuse substring digits or percentage scales', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'margin', metric: 'grossMargin', metricText: '毛利率', value: '20', unit: 'percent', unitText: '%', period: 'FY2025' }])
    const v = await validatePacket(f.packet, { root: f.root }); expect(v.ok).toBe(true); expect(v.facts.at(-1).normalizedValue).toBe('0.2')
    f.packet.facts.at(-1).value = '2'; f.packet.facts.at(-1).evidence.valueText = '2'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('NUMBER_MISSING')
  })
})

describe('deterministic decimal calculations', () => {
  it('calculates explicitly cited YoY, ratios, differences, sums, and gross profit', async () => {
    const f = await fixture(); f.packet.calculations = [
      { id: 'growth', op: 'yoy', inputs: ['rev25', 'rev24'] }, { id: 'r', op: 'ratio', inputs: ['cost25', 'rev25'] },
      { id: 'd', op: 'difference', inputs: ['rev25', 'cost25'] }, { id: 's', op: 'sum', inputs: ['rev25', 'cost25'] },
      { id: 'gp', op: 'grossProfit', inputs: ['rev25', 'cost25'] }, { id: 'gm', op: 'grossMargin', inputs: ['rev25', 'cost25'] },
    ]
    const c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root }))
    expect(c.ok).toBe(true); expect(c.calculations.map(x => x.value)).toEqual(['0.2', '0.5', '600000', '1800000', '600000', '0.5'])
    expect(c.calculations[0].inputs).toEqual(['rev25', 'rev24'])
  })
  it('preserves cents above Number.MAX_SAFE_INTEGER', async () => {
    const f = await fixture(); await addRows(f, [
      { id: 'largeA', metric: 'revenue', metricText: '营业收入', value: '90071992547409931.02', unit: 'CNY', unitText: '元', period: 'FY2025' },
      { id: 'largeB', metric: 'costOfRevenue', metricText: '营业成本', value: '90071992547409930.01', unit: 'CNY', unitText: '元', period: 'FY2025' },
    ]); f.packet.calculations = [{ id: 'small', op: 'difference', inputs: ['largeA', 'largeB'] }]
    const c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root })); expect(c.calculations[0].value).toBe('1.01')
  })
  it('retains tiny exact amount differences when calculations are chained', async () => {
    const f = await fixture(); await addRows(f, [
      { id: 'preciseA', metric: 'revenue', metricText: '营业收入', value: '1.00000000000000000001', unit: 'CNY', unitText: '元', period: 'FY2025' },
      { id: 'preciseB', metric: 'costOfRevenue', metricText: '营业成本', value: '1', unit: 'CNY', unitText: '元', period: 'FY2025' },
    ]); f.packet.calculations = [{ id: 'tiny', op: 'difference', inputs: ['preciseA', 'preciseB'] }, { id: 'again', op: 'ratio', inputs: ['tiny', 'preciseB'] }]
    const v = await validatePacket(f.packet, { root: f.root }); expect(v.facts.at(-2).normalizedValue).toBe('1.00000000000000000001'); const c = calculatePacket(f.packet, v); expect(c.calculations.map(x => x.value)).toEqual(['0.00000000000000000001', '0.00000000000000000001'])
  })
  it('rejects zero denominators and mismatched calculation periods', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'zero', metric: 'revenue', metricText: '营业收入', value: '0', unit: 'CNY', unitText: '元', period: 'FY2025' }])
    f.packet.calculations = [{ id: 'z', op: 'ratio', inputs: ['rev25', 'zero'] }, { id: 'wrong', op: 'difference', inputs: ['rev25', 'rev24'] }]
    const c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root })); expect(c.ok).toBe(false); expect(codes(c)).toContain('DIVISION_BY_ZERO'); expect(codes(c)).toContain('CALC_PERIOD')
  })
  it('cannot calculate from a forged or stale validation receipt', async () => {
    const f = await fixture(); const v = await validatePacket(f.packet, { root: f.root }); f.packet.facts[1].value = '999'
    expect(codes(calculatePacket(f.packet, v))).toContain('VALIDATION_REQUIRED')
    expect(codes(calculatePacket(f.packet, { ...v }))).toContain('VALIDATION_REQUIRED')
  })
})

describe('manual three-scenario FCFF DCF', () => {
  it('bridges every balance explicitly and withholds price return without current price', async () => {
    const f = await dcfFixture(); const c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root }))
    expect(c.ok).toBe(true); expect(c.dcf.scenarios.map(s => s.equityValue)).toEqual(['1013', '1013', '1013'])
    expect(c.dcf.scenarios[0].perShareValue).toBe('101.3'); expect(c.dcf.scenarios[0].priceReturn).toBeNull(); expect(c.dcf.rating).toBeNull()
    f.packet.dcf.currentPrice = 'price'; const withPrice = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root })); expect(withPrice.dcf.scenarios[0].priceReturn).toBe('0.013')
  })
  it.each([['WACC <= terminal growth', p => { p.dcf.scenarios[0].terminalGrowth = '0.1' }, 'DCF_DISCOUNT'], ['missing bridge item', p => { delete p.dcf.bridge.debt }, 'DCF_BRIDGE'], ['negative FCFF', p => { p.dcf.scenarios[0].fcff[0] = '-1' }, 'DCF_FCFF'], ['shares period mismatch', p => { p.facts.find(f => f.id === 'shares').period = 'FY2025'; p.facts.find(f => f.id === 'shares').evidence.periodText = 'FY2025' }, 'DCF_BRIDGE']])('rejects %s', async (_name, mutate, code) => {
    const f = await dcfFixture(); mutate(f.packet); const c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root })); expect(c.ok).toBe(false); expect(codes(c)).toContain(code)
  })
  it('withholds a return when a referenced current price has no verified price timestamp', async () => {
    const f = await dcfFixture(); f.packet.dcf.currentPrice = 'price'; delete f.packet.facts.at(-1).asOf
    const c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root })); expect(c.dcf.scenarios[0].priceReturn).toBeNull(); expect(codes(c)).toContain('PRICE_UNAVAILABLE')
  })
})


describe('additional evidence anti-confusion checks', () => {
  it('does not treat total revenue as operating revenue', async () => {
    const f = await fixture(); f.text = f.text.replaceAll('营业收入', '营业总收入'); await writeFile(join(f.root, 'source.txt'), f.text); f.packet.sources[0].sha256 = sha(f.text)
    for (const fact of f.packet.facts.filter(x => x.metric === 'revenue')) { fact.evidence.quote = fact.evidence.quote.replaceAll('营业收入', '营业总收入'); fact.evidence.metricText = '营业总收入' }
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('METRIC_MISMATCH')
  })
  it('rejects net income labeled as attributable-to-parent income', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'income', metric: 'netIncomeAttributableToParent', metricText: '净利润', value: '10', unit: 'CNY', unitText: '元', period: 'FY2025' }])
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('METRIC_MISMATCH')
  })
  it('does not accept a smaller unit token embedded in a larger unit', async () => {
    const f = await fixture(); f.packet.facts[1].unit = 'CNY'; f.packet.facts[1].evidence.unitText = '元'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('UNIT_MISMATCH')
  })
  it('does not accept a positive digit from a negative amount', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'income', metric: 'netIncome', metricText: '净利润', value: '-1', unit: 'CNY', unitText: '元', period: 'FY2025' }]); const fact = f.packet.facts.at(-1); fact.value = '1'; fact.evidence.valueText = '1'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('NUMBER_MISSING')
  })
  it('requires a recognizable reporting scope and rejects ambiguous scope windows', async () => {
    const f = await fixture(); f.packet.facts[1].scope = '范围'; f.packet.facts[1].evidence.scopeText = '范围'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('FACT_SCHEMA')
    f.packet.facts[1].scope = scope; f.packet.facts[1].evidence.scopeText = scope
    f.text = f.text.replace('范围：合并', '范围：合并及母公司'); await writeFile(join(f.root, 'source.txt'), f.text); f.packet.sources[0].sha256 = sha(f.text)
    for (const fact of f.packet.facts) fact.evidence.quote = fact.evidence.quote.replace('范围：合并', '范围：合并及母公司')
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('SCOPE_MISMATCH')
  })
  it('does not confuse a four-digit amount with a competing year', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'cash', metric: 'cash', metricText: '货币资金', value: '2000', unit: 'CNY', unitText: '元', period: '2025-12-31' }])
    expect((await validatePacket(f.packet, { root: f.root })).ok).toBe(true)
  })
  it('round-trips repeating ratio outputs through presentation formatting', () => {
    const ratio = decimal('1').div('3').toString(); expect(ratio).toBe('0.333333333333333333'); expect(formatDecimal(ratio, { scale: '0.01', places: 2 })).toBe('33.33')
    expect(formatDecimal('90071992547409931.025', { places: 2 })).toBe('90071992547409931.03')
  })
})


describe('row binding and PDF extraction provenance', () => {
  it('rejects a number attached to another metric in the same narrative row', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'mix', metric: 'revenue', metricText: '营业收入', value: '10', unit: 'CNY', unitText: '元', period: 'FY2025' }])
    const row = f.packet.facts.at(-1); f.text = f.text.replace(row.evidence.quote, row.evidence.quote + '，营业成本 20 元'); row.evidence.quote += '，营业成本 20 元'; row.value = '20'; row.evidence.valueText = '20'; await writeFile(join(f.root, 'source.txt'), f.text); f.packet.sources[0].sha256 = sha(f.text)
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('AMBIGUOUS_METRIC')
  })
  it('rejects an unlabeled second numeric value in a narrative row', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'mix', metric: 'revenue', metricText: '营业收入', value: '10', unit: 'CNY', unitText: '元', period: 'FY2025' }])
    const row = f.packet.facts.at(-1); f.text = f.text.replace(row.evidence.quote, row.evidence.quote + '（占比20%）'); row.evidence.quote += '（占比20%）'; row.value = '20'; row.evidence.valueText = '20'; await writeFile(join(f.root, 'source.txt'), f.text); f.packet.sources[0].sha256 = sha(f.text)
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('AMBIGUOUS_VALUE')
  })
  it('does not approve net income hidden inside an adjusted net-income label', async () => {
    const f = await fixture(); await addRows(f, [{ id: 'adjusted', metric: 'netIncome', metricText: '净利润', value: '10', unit: 'CNY', unitText: '元', period: 'FY2025' }])
    const row = f.packet.facts.at(-1); f.text = f.text.replace(row.evidence.quote, row.evidence.quote.replace('净利润', '扣除非经常性损益后的净利润')); row.evidence.quote = row.evidence.quote.replace('净利润', '扣除非经常性损益后的净利润'); await writeFile(join(f.root, 'source.txt'), f.text); f.packet.sources[0].sha256 = sha(f.text)
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('METRIC_MISMATCH')
  })
  it('checks original bytes and records that extraction fidelity remains unverified', async () => {
    const f = await fixture(); const original = '%PDF-1.7\nSYNTHETIC BYTES ONLY'; await writeFile(join(f.root, 'original.pdf'), original)
    Object.assign(f.packet.sources[0], { kind: 'pdf-extract', originalFile: 'original.pdf', originalSha256: sha(original), extraction: { method: 'synthetic test extraction', pages: [{ page: 1, lineStart: 1, lineEnd: 5 }] } }); f.packet.facts[1].evidence.locator.page = 1
    const v = await validatePacket(f.packet, { root: f.root }); expect(v.ok).toBe(true); expect(v.sources[0].originalIntegrity).toBe('verified'); expect(v.sources[0].extractionFidelity).toBe('unverified')
    f.packet.sources[0].extraction.pages[0].lineEnd = 3
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('PAGE_UNVERIFIED')
    await writeFile(join(f.root, 'original.pdf'), original + ' altered')
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('SOURCE_HASH_MISMATCH')
  })
  it('withholds return for negative or stale current prices', async () => {
    const f = await dcfFixture(); f.packet.dcf.currentPrice = 'price'; f.packet.facts.at(-1).asOf = '2026-10-22'
    let c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root })); expect(c.dcf.scenarios[0].priceReturn).toBeNull()
    f.packet.facts.at(-1).asOf = '2026-10-23'; f.text = f.text.replace('100 元/股', '-100 元/股'); f.packet.facts.at(-1).value = '-100'; f.packet.facts.at(-1).evidence.valueText = '-100'; f.packet.facts.at(-1).evidence.quote = f.packet.facts.at(-1).evidence.quote.replace('100 元/股', '-100 元/股'); await writeFile(join(f.root, 'source.txt'), f.text); f.packet.sources[0].sha256 = sha(f.text)
    c = calculatePacket(f.packet, await validatePacket(f.packet, { root: f.root })); expect(c.dcf.scenarios[0].priceReturn).toBeNull(); expect(c.dcf.rating).toBeNull()
  })
})

describe('review regressions: nearest financial context', () => {
  async function custom(text, changes = {}) {
    const f = await fixture(); f.text = text; await writeFile(join(f.root, 'source.txt'), text)
    f.packet.sources[0].sha256 = sha(text)
    const fact = { ...f.packet.facts[1], ...changes }
    fact.evidence = { ...f.packet.facts[1].evidence, quote: text, ...changes.evidence }
    f.packet.facts = [fact]; return f
  }
  it('binds a value to its closest metric label, skipping separate unit cells', async () => {
    const f = await custom('范围：合并\n单位：万元\n指标\tFY2025\t指标\tFY2025\n营业收入\t120\t营业成本\t60', { value: '60', evidence: { valueText: '60', locator: { lineStart: 1, lineEnd: 4, valueLine: 4, column: 4 } } })
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('METRIC_MISMATCH')
    const good = await custom('范围：合并\n指标\t单位\tFY2025\n营业收入\t万元\t120', { evidence: { locator: { lineStart: 1, lineEnd: 3, valueLine: 3, column: 3 } } })
    expect((await validatePacket(good.packet, { root: good.root })).ok).toBe(true)
  })
  it('uses the nearest period header instead of a stale prior section', async () => {
    const f = await custom('范围：合并\n单位：万元\n指标\tFY2024\n营业收入\t100\n指标\tFY2025\n营业收入\t120', { period: 'FY2024', evidence: { periodText: 'FY2024', locator: { lineStart: 1, lineEnd: 6, valueLine: 6, column: 2 } } })
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('PERIOD_MISMATCH')
  })
  it('does not overwrite an explicit value-row unit with a different window unit', async () => {
    const f = await custom('范围：合并\n单位：万元\n营业收入 FY2025 合并 100 元', { value: '100', evidence: { valueText: '100', locator: { lineStart: 1, lineEnd: 3, valueLine: 3 } } })
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('UNIT_MISMATCH')
  })
  it('rejects facts disclosed after the report cutoff while allowing later retrieval', async () => {
    const f = await fixture(); f.packet.sources[0].publishedAt = '2027-03-01'
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('SOURCE_DATE')
    f.packet.sources[0].publishedAt = '2026-03-01'; f.packet.sources[0].accessedAt = '2027-03-01'
    expect((await validatePacket(f.packet, { root: f.root })).ok).toBe(true)
  })
  it('does not turn revenue growth into a revenue amount', async () => {
    const f = await custom('FY2025 合并 营业收入同比增长 20%', { unit: 'percent', value: '20', evidence: { valueText: '20', unitText: '%', locator: { lineStart: 1, lineEnd: 1 } } })
    expect(codes(await validatePacket(f.packet, { root: f.root }))).toContain('UNIT_MISMATCH')
  })
  it('recognizes a consolidated heading without confusing parent-attributable income with parent statements', async () => {
    const text = '合并利润表\n单位：元\n指标\tFY2025\n归属于母公司股东的净利润\t120'
    const f = await custom(text, { metric: 'netIncomeAttributableToParent', unit: 'CNY', evidence: { unitText: '元', metricText: '归属于母公司股东的净利润', locator: { lineStart: 1, lineEnd: 4, valueLine: 4, column: 2 } } })
    expect((await validatePacket(f.packet, { root: f.root })).ok).toBe(true)
  })
})

describe('repeated annual-report page furniture', () => {
  it('does not treat 股份 in a repeated company header as a shares unit declaration', async () => {
    const f = await fixture(); const text = '合并现金流量表\n单位：元 币种：人民币\n指标\tFY2024\tFY2025\n虚构股份有限公司2025年度报告\n经营活动产生的现金流量净额\t100\t120'
    await writeFile(join(f.root, 'source.txt'), text); f.packet.sources[0].sha256 = sha(text)
    f.packet.facts = [{ ...f.packet.facts[1], metric: 'operatingCashFlow', unit: 'CNY', evidence: { quote: text, locator: { lineStart: 1, lineEnd: 5, valueLine: 5, column: 3 }, metricText: '经营活动产生的现金流量净额', periodText: 'FY2025', scopeText: '合并', unitText: '元', valueText: '120' } }]
    expect((await validatePacket(f.packet, { root: f.root })).ok).toBe(true)
  })
})
