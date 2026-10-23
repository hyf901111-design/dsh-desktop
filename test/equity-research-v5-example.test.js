import { afterEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { validatePacket, calculatePacket } from '../skills/ework-equity-research/scripts/lib/index.mjs'
import { validateReport, renderReport } from '../skills/ework-equity-research/scripts/lib/report.mjs'
import { reportCoverage } from '../skills/ework-equity-research/scripts/lib/quality.mjs'

const exampleRoot = resolve('skills/ework-equity-research/examples/driver-v5')
const packetPath = join(exampleRoot, 'packet.json')
const temporary = []
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function runExample() {
  const bytes = await readFile(packetPath, 'utf8').catch(() => null)
  expect(bytes, 'The reusable driver-v5 packet must be bundled with its original synthetic source snapshots').not.toBeNull()
  const packet = JSON.parse(bytes)
  const validation = await validatePacket(packet, { root: exampleRoot })
  const calculation = calculatePacket(packet, validation)
  return { packet, validation, calculation }
}

describe('bundled synthetic V5 complete-research example', () => {
  it('runs original snapshots through the actual evidence, driver, market, quarter and report pipeline', async () => {
    const { packet, validation, calculation } = await runExample()
    expect(packet).toMatchObject({ schemaVersion: 2, synthetic: true, company: { ticker: 'SYNTHETIC' }, report: { profile: 'full' } })
    expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true)
    expect(calculation.ok, JSON.stringify(calculation.diagnostics)).toBe(true)
    expect(validateReport(packet, validation, calculation)).toEqual([])
    expect(reportCoverage(packet.report, packet, calculation)).toMatchObject({ structureComplete: true, hasGaps: false, researchRequirements: { standard: 'ework-equity-v5', complete: true } })
    expect(calculation.dcf.forecasts).toHaveLength(18)
    expect(calculation.dcf.scenarios.map(row => row.id)).toEqual(['bear', 'base', 'bull'])
    expect(new Set(calculation.dcf.scenarios.map(row => row.perShareValue)).size).toBe(3)
    const base = calculation.dcf.scenarios.find(row => row.id === 'base')
    expect(base.forecastRows.map(row => row.fcff)).toEqual(['140', '140', '140', '140', '140', '140'])
    expect(Number(base.perShareValue)).toBeCloseTo(242.56402586998652, 10)
    expect(calculation.dcf.sensitivities.reverseGrowth.status).toBe('calculated')
    expect(Number(calculation.dcf.sensitivities.reverseGrowth.residualPerShare)).toBeCloseTo(0, 8)
    expect(calculation.dcf.operatingBoundary.usesOperatingProfitProxy).toBe(true)
    const html = renderReport(packet, validation, calculation)
    expect(html).toContain('纯合成')
    expect(html).toContain('section-dcf-reverse')
    expect(html).toContain('section-market-year')
    expect(html).toContain('section-quarterly-actuals')
    expect(html).not.toContain('{{')
  })

  it('keeps the same closing price and coherent annual, interim and standalone-quarter evidence', async () => {
    const { packet, validation, calculation } = await runExample()
    expect(validation.ok, JSON.stringify(validation.diagnostics)).toBe(true)
    const facts = new Map(packet.facts.map(fact => [fact.id, fact]))
    expect(packet.dcf.bridge.priceRef).toBe(packet.market.rows.at(-1).stockRef)
    expect(facts.get(packet.dcf.bridge.priceRef)).toMatchObject({ value: '362', securityId: 'SYNTHETIC', marketSession: 'close', period: '2026-10-22' })
    expect(calculation.dcf.currentPrice.value).toBe(calculation.market.rows.at(-1).stock)
    for (const row of packet.market.rows) {
      expect(facts.get(row.stockRef).securityId).toBe('SYNTHETIC')
      expect(facts.get(row.stockRef).evidence.quote).toContain('证券：SYNTHETIC')
    }
    expect(calculation.market.rows).toHaveLength(262)
    expect(calculation.market.coverage.fullYear).toBe(true)
    expect(Number(calculation.market.stockReturn)).toBeCloseTo(2.584158415841584, 12)
    expect(calculation.quarterly.quarters.map(row => [row.period, row.revenue, row.parentNetIncome, row.revenueYoY, row.parentNetIncomeYoY])).toEqual([
      ['2025Q3', '250', '40', '0.25', '0.25'], ['2025Q4', '250', '40', '0.25', '0.25'],
      ['2026Q1', '250', '40', '0', '0'], ['2026Q2', '250', '40', '0', '0'],
    ])
    expect(facts.get(packet.dcf.baseFY.revenueRef).value).toBe('1000')
    expect(facts.get(packet.dcf.interim.revenueRef).value).toBe('500')
    expect(['2025Q1', '2025Q2', '2025Q3', '2025Q4'].reduce((sum, period) => sum + Number(facts.get(`q${period}-revenue`).value), 0)).toBe(1000)
    expect(['2026Q1', '2026Q2'].reduce((sum, period) => sum + Number(facts.get(`q${period}-revenue`).value), 0)).toBe(500)
    expect(facts.get('base-parent-ni').value).toBe('160')
    expect(facts.get('interim-parent-ni').value).toBe('80')
    expect(['2025Q1', '2025Q2', '2025Q3', '2025Q4'].reduce((sum, period) => sum + Number(facts.get(`q${period}-netIncomeAttributableToParent`).value), 0)).toBe(160)
    expect(['2026Q1', '2026Q2'].reduce((sum, period) => sum + Number(facts.get(`q${period}-netIncomeAttributableToParent`).value), 0)).toBe(80)
    const calendar = validation.observations.find(row => row.id === 'calendar')
    expect(calendar.quote).toContain('合成测试，非真实日历')
  })

  it('supports an isolated CLI HTML development check with a complete manifest and leaves no generated files in the skill', async () => {
    await runExample()
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'equity-driver-v5-example-'))
    temporary.push(temporaryRoot)
    const out = join(temporaryRoot, 'development-html')
    const result = spawnSync(process.execPath, [resolve('skills/ework-equity-research/scripts/research.mjs'), 'run', '--input', packetPath, '--out', out, '--format', 'html'], { encoding: 'utf8', timeout: 30000 })
    expect(result.status, result.stderr + result.stdout).toBe(0)
    const receipt = JSON.parse(result.stdout)
    const manifest = JSON.parse(await readFile(join(out, 'run.json'), 'utf8'))
    expect(receipt).toMatchObject({ ok: true, status: 'rendered-for-review', researchRequirements: { complete: true } })
    expect(manifest).toMatchObject({ synthetic: true, delivery: { requested: ['html'], completed: ['html'] }, researchRequirements: { complete: true } })
    expect(await readFile(join(out, manifest.artifacts.html), 'utf8')).toContain('纯合成')
    expect((await readdir(exampleRoot)).sort()).toEqual(['README.md', 'market.txt', 'packet.json', 'v5-source.txt'])
  })
})
