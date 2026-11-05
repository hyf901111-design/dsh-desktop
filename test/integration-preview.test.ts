import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { createGitWorkflowFixture, type GitWorkflowFixture } from './helpers/git-workflow-fixture'
import { buildFeatureHandoff } from '../scripts/lib/sherlock-integration-model.mjs'
import { readActiveBatchLease } from '../scripts/lib/sherlock-active-batch.mjs'
import { adoptIntegrationBatch, mergeIntegrationFeature, continueIntegrationPreview, continueIntegrationFeature, acceptIntegrationBatch, readPersistedIntegrationOwnerToken, refreshIntegrationHandoff } from '../scripts/lib/sherlock-integration-executor.mjs'
const fixtures: GitWorkflowFixture[] = [], now = '2026-11-05T03:00:00.000Z', batchId = '20261105-01'
function setup() {
  const f = createGitWorkflowFixture(); fixtures.push(f)
  f.write(f.main, '.gitignore', '.worktrees/\n'); f.commit(f.main, '忽略构建目录')
  const branch = 'codex/feat/image-test-20261105', feature = f.createWorktree('image', branch), base = f.git(feature, 'rev-parse', 'HEAD')
  f.write(feature, 'image.js', 'export const image = true'); const tip = f.commit(feature, '功能：图片测试')
  const handoff = path.join(f.root, 'handoff.json')
  writeFileSync(handoff, JSON.stringify(buildFeatureHandoff({ repository: feature, baseCommit: base, generatedAt: now, metadata: {
    featureName: '图片', checks: [{ argv: [process.execPath, '-e', 'process.exit(0)'], outcome: 'passed', verifiedCommit: tip, completedAt: now, summary: '图片聚焦检查', timeoutMs: 2000 }],
    uiVerification: { outcome: 'not-applicable', summary: '流程测试' }, acceptanceCriteria: ['保持验收门禁'], risks: []
  } })))
  const integration = f.createWorktree('integration', `codex/integration/${batchId}`)
  adoptIntegrationBatch({ integrationRepository: integration, batchId, handoffPaths: [handoff], integrationChecks: [{ argv: [process.execPath, '-e', 'process.exit(9)'], timeoutMs: 2000 }], dryRun: false, now })
  const options = { integrationRepository: integration, manifestPath: path.join(integration, `config/sherlock-integration-batches/${batchId}.json`), featureBranch: branch, ownerToken: readPersistedIntegrationOwnerToken(integration), dryRun: false, now }
  return { f, feature, integration, tip, options }
}
afterEach(() => fixtures.splice(0).forEach(f => f.dispose()))
it('runs feature checks for a preview while keeping full validation and acceptance pending', () => {
  const { f, integration, options } = setup(), before = f.snapshot()
  expect(mergeIntegrationFeature({ ...options, previewOnly: true, dryRun: true }).status).toBe('planned')
  expect(f.snapshot().equals(before)).toBe(true)
  const result = mergeIntegrationFeature({ ...options, previewOnly: true })
  expect(result.status).toBe('preview-ready')
  expect(readActiveBatchLease(integration)?.currentTip).toBe(result.afterCommit)
  expect(JSON.parse(readFileSync(options.manifestPath, 'utf8')).features[0].merged).toBeUndefined()
  expect(() => acceptIntegrationBatch({ ...options, commit: result.afterCommit, confirmBatchId: batchId })).toThrow(/合并/)
  // The ordinary continuation still executes the declared batch check, which fails here.
  expect(continueIntegrationFeature(options).status).toBe('recovery-required')
})
it('checkpoints only an exact owned merge boundary without rewriting evidence, even when the feature has a successor', () => {
  const { f, feature, integration, tip: featureBase, options } = setup()
  f.git(integration, 'merge', '--no-ff', options.featureBranch, '-m', '集成：图片预览')
  const tip = f.git(integration, 'rev-parse', 'HEAD'), manifest = readFileSync(options.manifestPath)
  f.write(feature, 'followup.js', 'export const fix = true'); f.commit(feature, '修复：图片预览')
  const input = { ...options, confirmBatchId: batchId, confirmTip: tip }
  expect(() => continueIntegrationPreview({ ...input, ownerToken: 'wrong' })).toThrow(/owner/)
  expect(() => continueIntegrationPreview({ ...input, confirmTip: '0'.repeat(40) })).toThrow(/confirmTip/)
  expect(continueIntegrationPreview(input).status).toBe('preview-ready')
  expect(readActiveBatchLease(integration)?.currentTip).toBe(tip)
  expect(readFileSync(options.manifestPath).equals(manifest)).toBe(true)
  expect(() => acceptIntegrationBatch({ ...options, commit: tip, confirmBatchId: batchId })).toThrow()
  const old = JSON.parse(manifest.toString()).features[0].handoff, nextTip = f.git(feature, 'rev-parse', 'HEAD'), handoffPath = path.join(f.root, 'next.json')
  writeFileSync(handoffPath, JSON.stringify(buildFeatureHandoff({ repository: feature, baseCommit: featureBase, generatedAt: now, metadata: {
    featureName: old.featureName, checks: old.checks.map((check: any) => ({ ...check, verifiedCommit: nextTip })), uiVerification: old.uiVerification, acceptanceCriteria: old.acceptanceCriteria, risks: old.risks
  } })))
  const refreshed = refreshIntegrationHandoff({ ...input, handoffPath })
  expect(refreshed.afterCommit).not.toBe(tip)
  expect(JSON.parse(readFileSync(options.manifestPath, 'utf8')).features[0].merged).toBeUndefined()
  expect(mergeIntegrationFeature({ ...options, previewOnly: true }).status).toBe('preview-ready')
})
