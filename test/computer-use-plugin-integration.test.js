import { afterEach, expect, it, vi } from 'vitest'
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
import { DEFAULT_COMPUTER_USE_PLUGIN_ID } from '../src/main/integrations/bundled-computer-use'
import { IntegrationService } from '../src/main/integrations/service'
import { startIntegrationBridge } from '../src/main/integrations/runtime-bridge'
import { createIntegrationRuntime, inject } from '../packages/dsh-integration-runtime/index.js'

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const bundle = resolve('packages/dsh-integration-runtime')
async function fixture(binary = process.execPath) {
  const requests = []
  const data = Buffer.from([1, 2, 3])
  const screenshot = { dataBase64: data.toString('base64'), mimeType: 'image/png' }
  const image = { attachmentId: 'computer-screenshot', mediaType: screenshot.mimeType, bytes: data.length, width: 1, height: 1 }
  const saveImage = vi.fn(async () => image)
  const fetchRequest = async (url, init) => {
    if (new URL(url).pathname !== '/computer') return fetch(url, init)
    const input = JSON.parse(init.body)
    requests.push(input)
    service.assertComputerUseAccess(input)
    return new Response(JSON.stringify({ data: { op: input.op }, screenshots: input.op === 'call' ? [screenshot] : [] }))
  }
  const root = await mkdtemp(join(tmpdir(), 'ework-computer-plugin-'))
  let owner = 'one', revoked = 0
  const service = await IntegrationService.open({ root, getOwnerId: () => owner, bundledComputerUseRoot: bundle, onComputerUseRevoked: () => { revoked++ },
    encryption: { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() } })
  const bridge = await startIntegrationBridge(service), ctx = new Context()
  new SessionStore(ctx); new AgentRegistry(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  const llm = new LlmRuntime(ctx)
  const resolveModelInfo = vi.spyOn(llm, 'resolveModelInfo').mockResolvedValue({ inputModalities: ['image'] })
  ctx.provide('attachments', { saveImage })
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  ctx.provide('workspaceRegistry', { resolveByPath: async () => ({ id: 'owned', path: '/tmp/computer-plugin-test' }) })
  const agent = (await ctx.agents.create({ sessionId: 'computer-plugin-test', meta: { cwd: '/tmp/computer-plugin-test' }, agentOptions: { provider: 'test-vision-provider', model: 'test-vision-model' } })).agent
  let runtime
  cleanups.push(async () => { await runtime?.dispose(); await ctx.fiber.dispose(); await bridge.dispose(); await service.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.inject(inject, async pluginContext => {
    runtime = createIntegrationRuntime(pluginContext, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify(bridge), EWORK_COMPUTER_USE_BINARY: binary, SHERLOCK_LOCAL_SEARCH_URL: 'http://127.0.0.1:1234', SHERLOCK_LOCAL_SEARCH_TOKEN: 'test-only-token' }, fetch: fetchRequest, pollIntervalMs: 0 })
    await runtime.ready
  })
  const row = async () => { const reply = await service.request({ type: 'snapshot' }); if (reply.type !== 'snapshot') throw Error('No snapshot'); return reply.snapshot.rows.find(r => r.id === DEFAULT_COMPUTER_USE_PLUGIN_ID) }
  const toggle = async (enabled) => {
    const current = await row(), result = await service.request({ type: 'set-enabled', kind: 'plugin', id: current.id, enabled, meta: { requestId: crypto.randomUUID(), expectedRevision: current.revision } })
    if (result.type !== 'operation') throw Error('No operation')
    await service.operations.wait(result.operation.id)
  }
  const invoke = (op = 'tools') => ctx.tools.execute({ name: 'computer_use', arguments: { op, name: 'get_window_state', arguments_json: '{}' }, callId: op, agent, signal: new AbortController().signal })
  return { service, runtime, ctx, row, toggle, invoke, requests, data, saveImage, resolveModelInfo, revoked: () => revoked, owner: (value) => { owner = value; service.rotateIdentity() } }
}

it('loads the recommended native tool and releases its session through the persisted plugin switch', async () => {
  const f = await fixture()
  expect(await f.row()).toMatchObject({ name: '电脑控制', enabled: true, status: '已启用', removable: false, toolCount: 1 })
  expect((await f.row()).detail).not.toContain('三选一')
  expect((await f.invoke()).isError).toBe(false)
  expect(f.ctx.tools.get('computer_use_plus')).toBeUndefined()
  expect(f.requests[0]).toMatchObject({ op: 'tools', name: 'get_window_state', ownerAccountId: 'one', runtimeEpoch: f.service.runtimeEpoch })
  await f.toggle(false)
  expect(f.revoked()).toBe(1)
  expect(() => f.service.assertComputerUseAccess(f.requests[0])).toThrow()
  // No poll yet: the execute boundary must re-read the desktop switch itself.
  expect((await f.invoke()).isError).toBe(true)
  expect(f.ctx.tools.get('computer_use')).toBeUndefined()
  expect(f.requests[1]).toMatchObject({ op: 'release', sessionId: f.requests[0].sessionId })
  expect(await f.row()).toMatchObject({ enabled: false, status: '已停用', toolCount: 0 })
  await f.toggle(true); await f.runtime.sync()
  expect((await f.invoke()).isError).toBe(false)
  expect(f.requests.at(-1).sessionId).not.toBe(f.requests[0].sessionId)
  await expect(f.service.request({ type: 'uninstall', kind: 'plugin', id: DEFAULT_COMPUTER_USE_PLUGIN_ID, meta: { requestId: 'remove', expectedRevision: (await f.row()).revision } })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
})

it('publishes a screenshot attachment through the plugin context for the active vision route', async () => {
  const f = await fixture()
  expect((await f.invoke('call')).isError).toBe(false)
  expect(f.resolveModelInfo).toHaveBeenCalledWith('test-vision-provider', 'test-vision-model', expect.any(AbortSignal))
  expect(f.saveImage).toHaveBeenCalledWith({ data: f.data, mediaType: 'image/png', name: '桌面当前观察.png' })
})

it('keeps account preferences isolated and rejects a stale runtime status after account rotation', async () => {
  const f = await fixture(), old = f.service.runtimeSnapshot()
  await f.toggle(false); await f.runtime.sync()
  f.owner('two'); await f.runtime.sync()
  expect(await f.row()).toMatchObject({ enabled: true, status: '已启用' })
  expect(() => f.service.reportPluginStatus({ id: 'builtin:computer-use', version: '0.1.0', registered: true, runtimeEpoch: old.runtimeEpoch, ownerAccountId: old.ownerAccountId })).toThrow()
  f.owner('one'); await f.runtime.sync()
  expect(await f.row()).toMatchObject({ enabled: false, status: '已停用' })
  expect(f.ctx.tools.get('computer_use')).toBeUndefined()
})

it('does not call a missing native executable ready or register an unusable tool', async () => {
  const f = await fixture('/missing/ework-cua-driver')
  expect(await f.row()).toMatchObject({ status: '等待运行时连接', toolCount: 0 })
  expect(f.ctx.tools.get('computer_use')).toBeUndefined()
  expect(f.runtime.snapshot).toBeDefined()
})

it('retains byte-identical public plugin exports from the pinned distribution', async () => {
  const archived = join(bundle, 'vendor/computer-use')
  const receipt = JSON.parse(await readFile(join(archived, 'source-receipt.json'), 'utf8'))
  for (const [file, expected] of Object.entries(receipt.files)) expect(createHash('sha256').update(await readFile(join(archived, file))).digest('hex'), file).toBe(expected)
  expect(receipt.archiveSha256).toBe('066d1c5e003a5e4776d322aff58cce74ffff0c4a2cda4de7eb6d7033adc73c9b')
})

it('only exposes Peekaboo and rejects stale retired plugin requests', async () => {
  const f = await fixture()
  await f.invoke()
  const activeRequest = f.requests[0]
  const reply = await f.service.request({ type: 'snapshot' })
  expect(reply.snapshot.rows.filter(row => row.id.startsWith('builtin:computer-use')).map(row => row.id)).toEqual([DEFAULT_COMPUTER_USE_PLUGIN_ID])
  for (const pluginId of ['builtin:computer-use', 'builtin:computer-use-uitars']) {
    expect(() => f.service.assertComputerUseAccess({ ...activeRequest, pluginId })).toThrow()
    await expect(f.service.request({ type: 'set-enabled', kind: 'plugin', id: pluginId, enabled: true,
      meta: { requestId: crypto.randomUUID(), expectedRevision: 1 } })).rejects.toThrow()
  }
  expect(f.service.runtimeSnapshot().plugins.filter(p => p.id.startsWith('builtin:computer-use')).map(p => p.id)).toEqual([DEFAULT_COMPUTER_USE_PLUGIN_ID])
  expect((await f.invoke()).isError).toBe(false)
  expect(f.requests.at(-1).pluginId).toBe(DEFAULT_COMPUTER_USE_PLUGIN_ID)
})
