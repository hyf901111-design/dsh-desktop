import type { IntegrationBatchManifest } from './sherlock-integration-model.mjs'

export interface IntegrationExecutionResult {
  schemaVersion: 1
  status: 'planned' | 'prepared' | 'merged' | 'preview-ready' | 'conflict' | 'ownership-recovered' | 'main-synchronized' | 'records-reconciled' | 'accepted' | 'promoted' | 'cancelled' | 'recovery-required'
  batchId: string
  branch: string
  beforeCommit: string
  afterCommit: string
  actions: Array<{ kind: string; description: string; argv?: string[] }>
  recoveryCommand?: string
  conflictContext?: { integrationTip: string; featureTip: string; featureBase: string }
}

export function createIntegrationBatch(options: {
  mainRepository: string
  worktreePath: string
  batchId: string
  handoffPaths: string[]
  integrationChecks: IntegrationBatchManifest['integrationChecks']
  dryRun: boolean
  now: string
}): IntegrationExecutionResult

export function adoptIntegrationBatch(options: {
  integrationRepository: string
  batchId: string
  handoffPaths: string[]
  integrationChecks: IntegrationBatchManifest['integrationChecks']
  dryRun: boolean
  now: string
}): IntegrationExecutionResult

export function readPersistedIntegrationOwnerToken(repository: string): string
export function formatIntegrationRecoveryCommand(options: {
  repository: string
  manifestPath: string
  featureBranch: string
}): string
export function mergeIntegrationFeature(options: {
  previewOnly?: boolean
  integrationRepository: string
  manifestPath: string
  featureBranch: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult

export function continueIntegrationPreview(options: {
  integrationRepository: string
  manifestPath: string
  featureBranch: string
  ownerToken: string
  confirmBatchId: string
  confirmTip: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult
export function continueIntegrationFeature(options: {
  integrationRepository: string
  manifestPath: string
  featureBranch: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult
export function recoverIntegrationOwnership(options: {
  integrationRepository: string
  manifestPath: string
  confirmBatchId: string
  confirmTip: string
}): IntegrationExecutionResult
export function synchronizeIntegrationMain(options: {
  integrationRepository: string
  manifestPath: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult
export function continueIntegrationMain(options: {
  integrationRepository: string
  manifestPath: string
  confirmBatchId: string
  confirmMainCommit: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult
export function reconcileIntegrationRecords(options: {
  integrationRepository: string
  manifestPath: string
  confirmBatchId: string
  confirmTip: string
  confirmMainCommit: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult
export function acceptIntegrationBatch(options: {
  integrationRepository: string
  manifestPath: string
  commit: string
  confirmBatchId: string
  ownerToken: string
  now: string
}): IntegrationExecutionResult
export function promoteIntegrationBatch(options: {
  integrationRepository: string
  manifestPath: string
  mainWorktree: string
  confirmBatchId: string
  confirmTip: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult
export function cancelIntegrationBatch(options: {
  integrationRepository: string
  manifestPath: string
  confirmBatchId: string
  explicitCancellation: boolean
  dryRun: boolean
  now: string
}): IntegrationExecutionResult

export function refreshIntegrationHandoff(options: {
  integrationRepository: string
  manifestPath: string
  handoffPath: string
  confirmBatchId: string
  confirmTip: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult

export function appendIntegrationHandoff(options: {
  integrationRepository: string
  manifestPath: string
  handoffPath: string
  confirmBatchId: string
  confirmTip: string
  ownerToken: string
  dryRun: boolean
  now: string
}): IntegrationExecutionResult
