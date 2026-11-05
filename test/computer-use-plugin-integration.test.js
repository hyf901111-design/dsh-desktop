import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, join } from 'node:path'
import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { IntegrationService } from '../src/main/integrations/service'
import { startIntegrationBridge } from '../src/main/integrations/runtime-bridge'
import { createIntegrationRuntime } from '../packages/dsh-integration-runtime/index.js'

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const bundle = resolve('packages/dsh-integration-runtime/vendor/computer-use')
async function fixture(binary = process.execPath) {
  const root = await mkdtemp(join(tmpdir(), 'ework-computer-plugin-'))
  let owner = 'one'
  const service = await IntegrationService.open({ root, getOwnerId: () => owner, bundledComputerUseRoot: bundle,
    encryption: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() } })
  const bridge = await startIntegrationBridge(service), ctx = new Context()
  new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  ctx.provide('workspaceRegistry', { resolveByPath: async () => ({ id: 'owned', path: '/tmp/computer-plugin-test' }) })
  const agent = (await ctx.agents.create({ sessionId: 'computer-plugin-test', meta: { cwd: '/tmp/computer-plugin-test' }, agentOptions: {} })).agent
  const runtime = createIntegrationRuntime(ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify(bridge), EWORK_COMPUTER_USE_BINARY: binary }, pollIntervalMs: 0 })
  cleanups.push(async () => { await runtime.dispose(); await ctx.fiber.dispose(); await bridge.dispose(); await service.dispose(); await rm(root, { recursive: true, force: true }) })
  await runtime.ready
  const row = async () => { const reply = await service.request({ type: 'snapshot' }); if (reply.type !== 'snapshot') throw Error('No snapshot'); return reply.snapshot.rows.find(r => r.id === 'builtin:computer-use') }
  const toggle = async (enabled) => {
    const current = await row(), result = await service.request({ type: 'set-enabled', kind: 'plugin', id: current.id, enabled, meta: { requestId: crypto.randomUUID(), expectedRevision: current.revision } })
    if (result.type !== 'operation') throw Error('No operation')
    await service.operations.wait(result.operation.id)
  }
  const invoke = () => ctx.tools.execute({ name: 'computer_use_plus', arguments: { op: 'status' }, callId: 'status', agent, signal: new AbortController().signal })
  return { service, runtime, ctx, agent, row, toggle, invoke, owner: (value) => { owner = value; service.rotateIdentity() } }
}

it('shows the actual original plugin and unloads/reloads its real registered tool through the persisted UI switch', async () => {
  const f = await fixture()
  expect(await f.row()).toMatchObject({ name: 'Computer Use', enabled: true, status: '已启用', removable: false, toolCount: 1 })
  expect((await f.invoke()).isError).toBe(false)
  await f.toggle(false)
  // No poll yet: the execute boundary must re-read the desktop switch itself.
  expect((await f.invoke()).isError).toBe(true)
  expect(f.ctx.tools.get('computer_use_plus')).toBeUndefined()
  expect(await f.row()).toMatchObject({ enabled: false, status: '已停用', toolCount: 0 })
  await f.toggle(true); await f.runtime.sync()
  expect((await f.invoke()).isError).toBe(false)
  await expect(f.service.request({ type: 'uninstall', kind: 'plugin', id: 'builtin:computer-use', meta: { requestId: 'remove', expectedRevision: (await f.row()).revision } })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
})

it('keeps account preferences isolated and rejects a stale runtime status after account rotation', async () => {
  const f = await fixture(), old = f.service.runtimeSnapshot()
  await f.toggle(false); await f.runtime.sync()
  f.owner('two'); await f.runtime.sync()
  expect(await f.row()).toMatchObject({ enabled: true, status: '已启用' })
  expect(() => f.service.reportPluginStatus({ id: 'builtin:computer-use', version: '0.1.0', registered: true, runtimeEpoch: old.runtimeEpoch, ownerAccountId: old.ownerAccountId })).toThrow()
  f.owner('one'); await f.runtime.sync()
  expect(await f.row()).toMatchObject({ enabled: false, status: '已停用' })
  expect(f.ctx.tools.get('computer_use_plus')).toBeUndefined()
})

it('does not call a missing native executable ready or register an unusable tool', async () => {
  const f = await fixture('/missing/ework-cua-driver')
  expect(await f.row()).toMatchObject({ status: '等待运行时连接', toolCount: 0 })
  expect(f.ctx.tools.get('computer_use_plus')).toBeUndefined()
  expect(f.runtime.snapshot).toBeDefined()
})

it('retains byte-identical public plugin exports from the pinned distribution', async () => {
  const receipt = JSON.parse(await readFile(join(bundle, 'source-receipt.json'), 'utf8'))
  for (const [file, expected] of Object.entries(receipt.files)) expect(createHash('sha256').update(await readFile(join(bundle, file))).digest('hex'), file).toBe(expected)
  expect(receipt.archiveSha256).toBe('066d1c5e003a5e4776d322aff58cce74ffff0c4a2cda4de7eb6d7033adc73c9b')
})
