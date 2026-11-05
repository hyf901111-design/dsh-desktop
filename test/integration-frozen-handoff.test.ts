import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { buildFeatureHandoff, createIntegrationBatchManifest, type CheckEvidence } from '../scripts/lib/sherlock-integration-model.mjs'
import { preflightIntegrationAction, verifyFeatureHandoff } from '../scripts/lib/sherlock-integration-preflight.mjs'
import { createGitWorkflowFixture, type GitWorkflowFixture } from './helpers/git-workflow-fixture'

const fixtures: GitWorkflowFixture[] = []
const now = '2026-11-06T05:00:00.000Z'

function setup() {
  const f = createGitWorkflowFixture()
  fixtures.push(f)
  const base = f.git(f.main, 'rev-parse', 'HEAD')
  const feature = f.createWorktree('completed', 'codex/feat/completed-20261106')
  f.write(feature, 'completed.js', 'export const completed = true\n')
  const tip = f.commit(feature, '完成本批功能')
  const check: CheckEvidence = { argv: [process.execPath, '-e', 'process.exit(0)'], outcome: 'passed',
    summary: '集成工具聚焦验证', verifiedCommit: tip, completedAt: now, timeoutMs: 5000 }
  const handoff = buildFeatureHandoff({ repository: feature, baseCommit: base, generatedAt: now, metadata: {
    featureName: '已交接功能', checks: [check], uiVerification: { outcome: 'not-applicable', summary: '无客户端界面变更' },
    acceptanceCriteria: ['历史交接范围不随分支后继扩大'], risks: []
  } })
  const integration = f.createWorktree('integration', 'codex/integration/20261106-02')
  f.git(integration, 'merge', '--no-ff', handoff.branch, '-m', '合并本批功能')
  const merge = f.git(integration, 'rev-parse', 'HEAD')
  const manifest = createIntegrationBatchManifest({ batchId: '20261106-02', branch: 'codex/integration/20261106-02',
    baseMainCommit: base, handoffs: [handoff], integrationChecks: [{ argv: check.argv, timeoutMs: 5000 }], createdAt: now })
  manifest.features[0]!.merged = { mergeCommit: merge, verificationCommit: merge,
    checks: [{ ...check, verifiedCommit: merge }], recordedAt: now }
  const manifestPath = path.join(f.root, 'batch.json')
  f.write(feature, 'successor.js', 'export const future = true\n')
  const successor = f.commit(feature, '保留下一批改动')
  function report(phase: 'accept' | 'promote' | 'merge' = 'accept') {
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const before = f.snapshot()
    const bytes = readFileSync(manifestPath)
    const result = preflightIntegrationAction({ repository: integration, manifestPath, phase,
      ...(phase === 'merge' ? { featureBranch: handoff.branch } : { expectedAcceptedTip: merge }),
      ...(phase === 'promote' ? { mainWorktree: f.main } : {}) })
    expect(f.snapshot()).toEqual(before)
    expect(readFileSync(manifestPath)).toEqual(bytes)
    return result
  }
  return { f, base, feature, tip, handoff, integration, merge, successor, manifest, report }
}

afterEach(() => { for (const f of fixtures.splice(0)) f.dispose() })

it('accepts the recorded handoff without importing its successor, while new merge checks stay strict', () => {
  const s = setup()
  for (const phase of ['accept', 'promote'] as const) {
    const report = s.report(phase)
    expect(report.ok, JSON.stringify(report.findings)).toBe(true)
    expect(report.findings).toContainEqual(expect.objectContaining({ code: 'feature-successor-outside-batch', severity: 'info',
      details: expect.objectContaining({ verifiedTip: s.tip, successorTip: s.successor, mergeCommit: s.merge }) }))
  }
  expect(s.f.git(s.feature, 'rev-parse', 'HEAD')).toBe(s.successor)
  expect(s.f.git(s.integration, 'rev-parse', 'HEAD')).toBe(s.merge)
  expect(spawnSync('git', ['-C', s.integration, 'merge-base', '--is-ancestor', s.successor, s.merge]).status).toBe(1)
  expect(s.report('merge').findings).toContainEqual(expect.objectContaining({ code: 'feature-ref-moved', severity: 'error' }))
  expect(verifyFeatureHandoff({ repository: s.integration, handoff: s.handoff, batchMainCommit: s.merge }).ok).toBe(false)
}, 20000)

it('rejects rewound and rewritten feature branches even with recorded integration evidence', () => {
  const s = setup()
  s.f.git(s.feature, 'reset', '--hard', s.base)
  expect(s.report().findings).toContainEqual(expect.objectContaining({ code: 'feature-ref-moved', severity: 'error' }))
  s.f.write(s.feature, 'different.js', 'export const rewritten = true\n')
  s.f.commit(s.feature, '独立重写功能分支')
  const report = s.report()
  expect(report.ok).toBe(false)
  expect(report.findings).toContainEqual(expect.objectContaining({ code: 'feature-ref-moved', severity: 'error' }))
}, 20000)

it('does not trust a forged merge boundary or a changed historical handoff inventory', () => {
  const s = setup()
  s.manifest.features[0]!.merged!.mergeCommit = s.tip
  expect(s.report().findings).toContainEqual(expect.objectContaining({ code: 'feature-ref-moved', severity: 'error' }))
  s.manifest.features[0]!.merged!.mergeCommit = s.merge
  s.manifest.features[0]!.handoff.files[0]!.path = 'different.js'
  const report = s.report()
  expect(report.ok).toBe(false)
  expect(report.findings).toContainEqual(expect.objectContaining({ code: 'feature-file-inventory-mismatch', severity: 'error' }))
}, 20000)
