import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry, { isUserInvocable } from '@deepseek-ai/dsh-skill'
import WorkerThreadCodeRuntime from '@deepseek-ai/dsh-code-runtime-worker-thread'
import { apply as registerSkillTool } from '@deepseek-ai/dsh-tool-skill'
import { scopeTarget } from '@deepseek-ai/dsh-scope'
import { IntegrationService } from '../src/main/integrations/service'
import { manifestDigest } from '../src/main/integrations/manifest'
import { startIntegrationBridge } from '../src/main/integrations/runtime-bridge'
import { resolveIntegrationContext } from '../src/main/integrations/context'
import { emptyConnectionDraft } from '../src/shared/integration-ui'
import { createIntegrationRuntime } from '../packages/dsh-integration-runtime/index.js'
import { toolRegistrationName } from '../packages/dsh-integration-runtime/tool-proxy.js'
import { managedSkillInvocationName } from '../packages/dsh-integration-runtime/skill-policy.js'

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
// Test-only encryption never opens an OS credential store or accesses personal credentials.
const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }

async function fixture({ marketManifest } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ework-harness-e2e-')))
  let service, bridge, runtime, server
  const ctx = new Context(), requests = []
  cleanups.push(async () => {
    await runtime?.dispose()
    await ctx.fiber.dispose()
    await bridge?.dispose()
    await service?.dispose()
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    await rm(root, { recursive: true, force: true })
  })
  const workspaces = ['a', 'b'].map(id => ({ workspaceId: `workspace-${id}`, path: join(root, id) }))
  await Promise.all(workspaces.map(workspace => mkdir(workspace.path)))
  let bundledCatalogRoot = join(projectRoot, 'build/integration-catalog')
  if (marketManifest) {
    bundledCatalogRoot = join(root, 'test-catalog')
    await mkdir(bundledCatalogRoot)
    await writeFile(join(bundledCatalogRoot, 'catalog.json'), JSON.stringify({ schemaVersion: 1, entries: [{
      id: 'harness-test-skill', kind: 'skill', name: marketManifest.name, description: marketManifest.description,
      publisher: 'Test fixture', version: marketManifest.version, permissions: [],
      manifest: marketManifest, digest: manifestDigest(marketManifest),
    }] }))
  }
  new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  new WorkerThreadCodeRuntime(ctx, { computeMs: 1000, maxWallMs: 3000, maxOutputBytes: 32768, maxOldGenerationSizeMb: 64 })
  ctx.provide('workspaceRegistry', { resolveByPath: async path => {
    const workspace = workspaces.find(item => item.path === path)
    return workspace ? { id: workspace.workspaceId, path: workspace.path } : undefined
  } })
  const a = (await ctx.agents.create({ sessionId: 'real-agent-a', meta: { cwd: workspaces[0].path }, agentOptions: {} })).agent
  const b = (await ctx.agents.create({ sessionId: 'real-agent-b', meta: { cwd: workspaces[1].path }, agentOptions: {} })).agent
  service = await IntegrationService.open({
    root: join(root, 'registry'), encryption, getOwnerId: () => 'fixture-owner',
    bundledCatalogRoot, clientVersion: '1.0.6',
    resolveContext: context => resolveIntegrationContext(context, {
      ownerId: 'fixture-owner', tasks: [], workspaces: async () => workspaces,
      // These identities come from real Harness Agent/Session objects, not the bridge request.
      sessions: async () => ctx.agents.list().map(agent => ({ sessionId: agent.session.id, cwd: agent.session.header.cwd })),
    }),
  })
  bridge = await startIntegrationBridge(service)
  runtime = createIntegrationRuntime(ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify({ url: bridge.url, token: bridge.token }) }, pollIntervalMs: 0, requestTimeoutMs: 2000 })
  registerSkillTool(ctx)
  await runtime.ready
  const mutate = async command => {
    const reply = await service.request({ ...command, meta: { requestId: randomUUID(), expectedRevision: command.id ? (command.kind === 'skill' ? service.store.snapshot().skills[command.id].revision : service.store.snapshot().connections[command.id].revision) : service.store.snapshot().revision } })
    expect(reply.type).toBe('operation')
    await service.operations.wait(reply.operation.id)
    const completed = await service.request({ type: 'operation', id: reply.operation.id })
    expect(completed.operation.status, completed.operation.message).toBe('succeeded')
    return completed.operation
  }
  const connect = async () => {
    server = createServer((request, response) => {
      const url = new URL(request.url, 'http://fixture.local')
      if (request.method !== 'GET' || url.pathname !== '/lookup') { response.writeHead(404); response.end(); return }
      const value = { nonce: randomUUID(), query: url.searchParams.get('query'), sequence: requests.length + 1 }
      requests.push(value)
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify(value))
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const origin = `http://127.0.0.1:${server.address().port}`
    await mutate({ type: 'save-connection', draft: {
      ...emptyConnectionDraft('api'), name: '真实本机数据', url: origin, allowPrivateNetwork: true, workspaceIds: 'workspace-a',
      toolsJson: JSON.stringify([{ id: 'lookup', name: '查询数据', description: '读取测试服务动态生成的 nonce', method: 'GET', path: '/lookup', queryParams: ['query'], inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false } }]),
    } })
    const connection = Object.values(service.store.snapshot().connections)[0]
    const tool = Object.values(service.store.snapshot().tools)[0]
    await runtime.sync()
    return { connectionId: connection.id, toolId: tool.id, name: toolRegistrationName(tool.id) }
  }
  const invoke = (name, args, agent = a, callId = randomUUID()) => ctx.tools.execute({ name, arguments: args, callId, agent, signal: new AbortController().signal })
  const runCode = (code, agent = a, callId = randomUUID()) => invoke('run_code', { code, description: '真实集成链路验证' }, agent, callId)
  return { ctx, a, b, service, bridge, runtime, requests, mutate, connect, invoke, runCode }
}

describe('IntegrationService → authenticated bridge → Harness tools and skills', () => {
  it('reads independently generated API nonces through both a real tool and a Code Mode worker', async () => {
    const f = await fixture(), binding = await f.connect()
    expect(f.ctx.tools.schemas(f.a).map(tool => tool.name)).toContain(binding.name)
    expect(f.ctx.tools.schemas(f.b).map(tool => tool.name)).not.toContain(binding.name)
    const direct = await f.invoke(binding.name, { query: 'direct-request' }, f.a, 'direct-call')
    expect(direct.isError).toBe(false)
    expect(JSON.parse(direct.content[0].text)).toEqual(f.requests[0])
    expect(f.requests[0].query).toBe('direct-request')
    f.a.ctx.tools.presentAs('code'); f.b.ctx.tools.presentAs('code')
    const code = await f.runCode(`const result = await tools[${JSON.stringify(binding.name)}]({query:"worker-request"}); return result.content[0].text;`, f.a, 'worker-call')
    expect(code.isError).toBe(false)
    expect(f.requests).toHaveLength(2)
    expect(f.requests[1].query).toBe('worker-request')
    expect(f.requests[1].nonce).not.toBe(f.requests[0].nonce)
    expect(code.content[0].text).toContain(f.requests[1].nonce)
    const hidden = await f.runCode(`return typeof tools[${JSON.stringify(binding.name)}];`, f.b)
    expect(hidden.isError).toBe(false); expect(hidden.content[0].text).toContain('undefined')
    expect(f.requests).toHaveLength(2)
    expect(f.service.store.snapshot().calls.map(call => ({ id: call.id, status: call.status, sessionId: call.sessionId }))).toEqual([
      { id: 'direct-call', status: 'succeeded', sessionId: 'real-agent-a' },
      { id: 'worker-call:code:1', status: 'succeeded', sessionId: 'real-agent-a' },
    ])
  })

  it('blocks retained tool names and a retained proxy after a durable connection disable', async () => {
    const f = await fixture(), binding = await f.connect()
    await f.mutate({ type: 'grant-tools', id: binding.connectionId, toolIds: [binding.toolId] }); await f.runtime.sync()
    const retained = f.ctx.tools.get(binding.name, f.a)
    expect((await f.invoke(binding.name, { query: 'before-disable' })).isError).toBe(false)
    expect(f.requests).toHaveLength(1)
    await f.mutate({ type: 'set-enabled', kind: 'connection', id: binding.connectionId, enabled: false })
    // No manual sync before using the stale name: dispatch must fetch current authority itself.
    expect((await f.invoke(binding.name, { query: 'after-disable' })).isError).toBe(true)
    await expect(retained.execute({ query: 'retained-proxy' }, { agent: f.a, callId: 'retained-call', signal: new AbortController().signal })).rejects.toThrow()
    expect(f.ctx.tools.get(binding.name, f.a)).toBeUndefined()
    f.a.ctx.tools.presentAs('code')
    const hidden = await f.runCode(`return typeof tools[${JSON.stringify(binding.name)}];`)
    expect(hidden.isError).toBe(false); expect(hidden.content[0].text).toContain('undefined')
    expect(f.requests).toHaveLength(1)
  })

  it('removes one plugin skill from actual registry, tool and slash paths while keeping its sibling callable', async () => {
    const f = await fixture()
    const manifest = { schemaVersion: 1, id: 'test.independent-skills', name: '独立删除测试', description: '真实运行时删除回归', version: '1.0.0', permissions: [], skills: [['report', '研究报告'], ['verify', '资料核验']].map(([id, name]) => ({ id, name, description: `执行${name}`, files: { 'SKILL.md': `---\nname: ${name}\ndescription: 执行${name}\n---\n\n${name}：保留原始来源。` } })) }
    await f.mutate({ type: 'create-plugin', manifest: JSON.stringify(manifest) }); await f.runtime.sync()
    const deleted = f.service.runtimeSnapshot().skills.find(skill => skill.name === '研究报告')
    const kept = f.service.runtimeSnapshot().skills.find(skill => skill.name === '资料核验')
    const alias = managedSkillInvocationName(deleted), sibling = managedSkillInvocationName(kept), lookup = { cwd: f.a.session.header.cwd, scope: f.a }
    expect((await f.ctx.skills.get(alias, lookup)).content).toContain('研究报告')
    expect((await f.invoke('skill', { name: alias })).isError).toBe(false)
    await f.mutate({ type: 'uninstall', kind: 'skill', id: deleted.id }); await f.runtime.sync()
    const names = (await f.ctx.skills.list(lookup)).filter(isUserInvocable).map(skill => skill.name)
    expect(names).not.toContain(alias); expect(names).toContain(sibling)
    expect(await f.ctx.skills.get(alias, lookup)).toBeUndefined()
    expect((await f.invoke('skill', { name: alias })).isError).toBe(true)
    const messages = [createUserMessage({ content: [{ type: 'text', text: `/${alias} 编写报告` }], source: { kind: 'user' } })]
    const slash = await f.ctx.waterfall(scopeTarget(f.ctx, f.a), 'agent/pre-step', { agent: f.a, messages, turn: 0, step: 0, signal: new AbortController().signal }, () => Promise.resolve({ kind: 'enter', messages }))
    expect(slash.messages.some(message => message.source?.kind === 'skill-invocation')).toBe(false)
    expect((await f.invoke('skill', { name: sibling })).content[0].text).toContain('资料核验')
    expect(f.service.runtimeSnapshot().plugins.find(plugin => plugin.id === kept.ownerPluginId)?.enabled).toBe(true)
    expect(f.requests).toHaveLength(0)
  })

  it('installs a Chinese market skill and uses its actual resource via registry, skill tool and slash loading', async () => {
    const name = '中文市场验收技能'
    const content = `---\nname: ${name}\ndescription: 核验测试资料中的事实与来源\n---\n\n仅使用独立测试资料，保留日期与原始引用。`
    const marketManifest = { schemaVersion: 1, id: 'test.harness.market-skill', name, description: '仅用于隔离运行时验收', version: '1.0.0', skills: [{ id: 'verify', name, description: '核验测试资料中的事实与来源', files: { 'SKILL.md': content } }] }
    const f = await fixture({ marketManifest })
    const market = await f.service.request({ type: 'market', kind: 'skill' })
    expect(market.type).toBe('market')
    expect(market.entries).toHaveLength(1)
    const entry = market.entries.find(item => item.name === name)
    expect(entry?.available).toBe(true)
    await f.mutate({ type: 'install', entryId: entry.id }); await f.runtime.sync()
    const installed = f.service.runtimeSnapshot().skills.find(skill => skill.name === name)
    expect(installed).toBeDefined()
    const alias = managedSkillInvocationName(installed), lookup = { cwd: f.a.session.header.cwd, scope: f.a }
    const catalog = await f.ctx.skills.list(lookup)
    expect(catalog.filter(isUserInvocable).map(skill => skill.name)).toContain(alias)
    expect(catalog.find(skill => skill.name === alias).description).toContain(name)
    const resource = await readFile(join(installed.resourceRoot, 'SKILL.md'), 'utf8')
    expect(resource).toBe(content)
    expect((await f.ctx.skills.get(alias, lookup)).content).toBe(resource)
    const loaded = await f.invoke('skill', { name: alias })
    expect(loaded.isError).toBe(false); expect(loaded.content[0].text).toContain('仅使用独立测试资料，保留日期与原始引用。')
    const slash = () => {
      const messages = [createUserMessage({ content: [{ type: 'text', text: `/${alias} 核验测试资料` }], source: { kind: 'user' } })]
      return f.ctx.waterfall(scopeTarget(f.ctx, f.a), 'agent/pre-step', { agent: f.a, messages, turn: 0, step: 0, signal: new AbortController().signal }, () => Promise.resolve({ kind: 'enter', messages }))
    }
    expect((await slash()).messages.some(message => message.source?.kind === 'skill-invocation')).toBe(true)
    await f.mutate({ type: 'set-enabled', kind: 'skill', id: installed.id, enabled: false }); await f.runtime.sync()
    expect((await f.ctx.skills.list(lookup)).map(skill => skill.name)).not.toContain(alias)
    expect(await f.ctx.skills.get(alias, lookup)).toBeUndefined()
    expect((await f.invoke('skill', { name: alias })).isError).toBe(true)
    expect((await slash()).messages.some(message => message.source?.kind === 'skill-invocation')).toBe(false)
    expect(f.requests).toHaveLength(0)
  })
})
