import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readActiveBatchLease } from '../scripts/lib/sherlock-active-batch.mjs'
import { adoptIntegrationBatch, mergeIntegrationFeature, readPersistedIntegrationOwnerToken, refreshIntegrationHandoff } from '../scripts/lib/sherlock-integration-executor.mjs'
import { buildFeatureHandoff, type IntegrationBatchManifest } from '../scripts/lib/sherlock-integration-model.mjs'
import { preflightIntegrationAction } from '../scripts/lib/sherlock-integration-preflight.mjs'
import { createGitWorkflowFixture, type GitWorkflowFixture } from './helpers/git-workflow-fixture'

const fixtures: GitWorkflowFixture[] = []
const batchId = '20261106-01'
const now = '2026-11-06T02:00:00.000Z'
const cli = path.resolve(import.meta.dirname, '../scripts/manage-sherlock-integration.mjs')

function setup({ exitCode = 0, nestedFeature = false } = {}) {
  const f = createGitWorkflowFixture()
  fixtures.push(f)
  const base = f.git(f.main, 'rev-parse', 'HEAD')
  const a = f.createWorktree('alpha', 'codex/feat/alpha-20261106')
  const b = f.createWorktree('beta', 'codex/feat/beta-20261106')
  f.write(a, 'alpha.js', 'export const alpha = 1\n')
  f.commit(a, '功能：甲')
  f.write(b, 'beta.js', 'export const beta = 2\n')
  f.commit(b, '功能：乙')

  function handoff(repo: string, name: string) {
    const tip = f.git(repo, 'rev-parse', 'HEAD')
    const card = buildFeatureHandoff({ repository: repo, baseCommit: base, generatedAt: now, metadata: {
      featureName: name,
      checks: [{ argv: [process.execPath, '-e', 'process.exit(0)'], outcome: 'passed', verifiedCommit: tip, completedAt: now, summary: '功能聚焦检查', timeoutMs: 5000 }],
      uiVerification: { outcome: 'not-applicable', summary: '集成工具测试' },
      acceptanceCriteria: ['校验已合入历史'], risks: []
    } })
    const handoffPath = path.join(f.root, name + '.json')
    writeFileSync(handoffPath, JSON.stringify(card))
    return handoffPath
  }

  const integration = f.createWorktree('integration', `codex/integration/${batchId}`)
  const manifestPath = path.join(integration, `config/sherlock-integration-batches/${batchId}.json`)
  const checkLog = path.join(f.root, 'check-log.txt')
  const checkScript = `const head = require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD']); require('node:fs').appendFileSync(${JSON.stringify(checkLog)}, head); process.exit(${exitCode})`
  adoptIntegrationBatch({
    integrationRepository: integration, batchId, handoffPaths: [handoff(a, 'alpha'), handoff(b, 'beta')],
    integrationChecks: [{ argv: [process.execPath, '-e', checkScript], timeoutMs: 5000 }], dryRun: false, now
  })
  const ownerToken = readPersistedIntegrationOwnerToken(integration)
  const options = { integrationRepository: integration, manifestPath, ownerToken, dryRun: false, now }
  f.write(f.main, 'main-change.js', 'export const mainChange = true\n')
  const mainTip = f.commit(f.main, '推进主干')
  f.git(a, 'merge', '--no-ff', 'main', '-m', '功能分支包含主干')
  if (nestedFeature) f.git(a, 'merge', '--no-ff', 'codex/feat/beta-20261106', '-m', '功能分支包含另一个功能')
  refreshIntegrationHandoff({
    ...options, handoffPath: handoff(a, 'alpha-advanced'), confirmBatchId: batchId, confirmTip: f.git(integration, 'rev-parse', 'HEAD')
  })
  const alphaMerge = mergeIntegrationFeature({ ...options, featureBranch: 'codex/feat/alpha-20261106', previewOnly: true }).afterCommit
  const betaMerge = nestedFeature ? undefined : mergeIntegrationFeature({ ...options, featureBranch: 'codex/feat/beta-20261106', previewOnly: true }).afterCommit
  const tip = f.git(integration, 'rev-parse', 'HEAD')
  function run({ dryRun = false, confirmTip = tip, confirmMain = mainTip } = {}) {
    return spawnSync(process.execPath, [
      cli, 'reconcile-records', '--repo', integration, '--manifest', manifestPath,
      '--confirm-batch', batchId, '--confirm-tip', confirmTip, '--confirm-main', confirmMain,
      '--json', ...(dryRun ? ['--dry-run'] : [])
    ], { encoding: 'utf8' })
  }
  function manifest(): IntegrationBatchManifest {
    return JSON.parse(readFileSync(manifestPath, 'utf8'))
  }
  return { f, base, integration, manifestPath, checkLog, mainTip, alphaMerge, betaMerge, tip, run, manifest }
}

afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose()
})

it('records earlier Git merges using one verification of the current integration tip', () => {
  const s = setup()
  const before = s.f.snapshot()
  expect(s.run({ confirmTip: '0'.repeat(40) }).stderr).toMatch(/confirmTip/)
  expect(s.run({ confirmMain: s.base }).stderr).toMatch(/confirmMainCommit/)
  expect(s.run({ dryRun: true })).toMatchObject({ status: 0, stderr: '' })
  expect(s.f.snapshot()).toEqual(before)
  expect(() => readFileSync(s.checkLog)).toThrow()

  const result = s.run()
  expect(result).toMatchObject({ status: 0, stderr: '' })
  const record = JSON.parse(result.stdout)
  expect(record).toMatchObject({ status: 'records-reconciled', beforeCommit: s.tip })
  expect(readFileSync(s.checkLog, 'utf8')).toBe(s.tip + '\n')
  const manifest = s.manifest()
  expect(manifest.expectedMainCommit).toBe(s.mainTip)
  expect(manifest.mainSynchronizations).toMatchObject([{
    previousMainCommit: s.base, mainCommit: s.mainTip, mergeCommit: s.alphaMerge, verificationCommit: s.tip,
    checks: [{ verifiedCommit: s.tip, outcome: 'passed' }]
  }])
  expect(manifest.features.map(entry => entry.merged)).toMatchObject([s.alphaMerge, s.betaMerge].map(mergeCommit => ({
    mergeCommit, verificationCommit: s.tip, checks: [{ verifiedCommit: s.tip, outcome: 'passed' }]
  })))
  expect(s.f.git(s.integration, 'show', '-s', '--format=%P', record.afterCommit)).toBe(s.tip)
  expect(s.f.git(s.integration, 'diff-tree', '--no-commit-id', '--name-only', '-r', record.afterCommit)).toBe(`config/sherlock-integration-batches/${batchId}.json`)
  expect(s.f.git(s.f.main, 'rev-parse', 'HEAD')).toBe(s.mainTip)
  expect(readActiveBatchLease(s.integration)).toMatchObject({ currentTip: record.afterCommit })
  expect(readActiveBatchLease(s.integration)?.acceptedTip).toBeUndefined()
  expect(preflightIntegrationAction({ repository: s.integration, phase: 'accept', manifestPath: s.manifestPath, expectedAcceptedTip: record.afterCommit }).ok).toBe(true)
}, 30000)

it('leaves the manifest and lease untouched if a declared check fails', () => {
  const s = setup({ exitCode: 9 })
  const before = s.f.snapshot()
  const result = s.run()
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/集成检查失败/)
  expect(readFileSync(s.checkLog, 'utf8')).toBe(s.tip + '\n')
  expect(s.f.snapshot()).toEqual(before)
}, 20000)

it('rejects an unrecorded feature that has no exact historical merge parent', () => {
  const s = setup({ nestedFeature: true })
  const before = s.f.snapshot()
  const result = s.run({ dryRun: true })
  expect(result.status).toBe(1)
  expect(result.stderr).toMatch(/beta-20261106.*合并边界/)
  expect(() => readFileSync(s.checkLog)).toThrow()
  expect(s.f.snapshot()).toEqual(before)
}, 20000)
