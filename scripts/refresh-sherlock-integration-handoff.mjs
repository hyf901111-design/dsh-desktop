#!/usr/bin/env node
import { parseArgs } from 'node:util'
import { refreshIntegrationHandoff, readPersistedIntegrationOwnerToken } from './lib/sherlock-integration-executor.mjs'
const { values: v } = parseArgs({ options: { repo: { type: 'string' }, manifest: { type: 'string' }, handoff: { type: 'string' }, 'confirm-batch': { type: 'string' }, 'confirm-tip': { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } })
try {
  console.log(JSON.stringify(refreshIntegrationHandoff({ integrationRepository: v.repo, manifestPath: v.manifest, handoffPath: v.handoff,
    confirmBatchId: v['confirm-batch'], confirmTip: v['confirm-tip'], ownerToken: readPersistedIntegrationOwnerToken(v.repo), dryRun: v['dry-run'], now: new Date().toISOString() })))
} catch (error) { console.error(error.message); process.exitCode = 1 }
