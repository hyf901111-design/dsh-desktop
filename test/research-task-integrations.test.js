import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime, { LlmAdapter } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import SubagentRuntime from '@deepseek-ai/dsh-subagent'
import { apply as spawn } from '@deepseek-ai/dsh-subagent-spawn-in-process'
import WorkerThreadCodeRuntime from '@deepseek-ai/dsh-code-runtime-worker-thread'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import { IntegrationService } from '../src/main/integrations/service'
import { startIntegrationBridge } from '../src/main/integrations/runtime-bridge'
import { resolveIntegrationContext } from '../src/main/integrations/context'
import { emptyConnectionDraft } from '../src/shared/integration-ui'
import { createIntegrationRuntime } from '../packages/dsh-integration-runtime/index.js'
import { toolRegistrationName } from '../packages/dsh-integration-runtime/tool-proxy.js'
import { createSubagentAdapter } from '../packages/dsh-research-task-runtime/index.js'
import { CANVAS_TOOL_NAMES } from '../packages/dsh-research-task-runtime/canvas-tools.js'

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
function deferred() { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }

async function fixture(mode = 'native', businessResponse) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ework-research-integrations-')))
  const ctx = new Context(), entered = deferred(), finish = deferred(), requests = [], admitted = [], handles = [], modelRequests = []
  let service, bridge, runtime, adapter, server
  cleanups.push(async () => {
    finish.resolve()
    for (const handle of handles) { await handle.result.catch(() => {}); await handle.dispose() }
    await adapter?.dispose(); await runtime?.dispose(); await ctx.fiber.dispose()
    await bridge?.dispose(); await service?.dispose()
    if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
    await rm(root, { recursive: true, force: true })
  })
  new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  new SubagentRuntime(ctx); spawn(ctx, { providerName: 'spawn' })
  new WorkerThreadCodeRuntime(ctx, { computeMs: 1000, maxWallMs: 3000, maxOutputBytes: 32768, maxOldGenerationSizeMb: 64 })
  for (const name of ['financial_query', 'web_search', 'research_workbench_create', 'research_canvas_use', 'research_canvas_task', ...CANVAS_TOOL_NAMES]) ctx.tools.register({
    name, description: name, parameters: { type: 'object', properties: {} }, output: { schema: {}, render: () => [] },
    execute: async () => { throw Error('This local integration fixture does not use public research tools') },
  })
  // The model transport is deterministic and local; tools still execute through real Harness dispatch.
  class LocalModel extends LlmAdapter {
    async resolveModel(provider, id) { return { provider, id, name: id, reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'max', name: 'Max' }], defaultEffort: 'max' } } }
    async listModels(provider) { return [{ provider, id: 'local', name: 'Local' }] }
    async *stream(request) {
      modelRequests.push(request)
      entered.resolve(); await finish.promise
      yield { type: 'block-start', index: 0, blockType: 'text' }
      yield { type: 'text-delta', index: 0, text: '本机数据验证完成' }
      yield { type: 'block-end', index: 0, block: { type: 'text', text: '本机数据验证完成' } }
      yield { type: 'finish', reason: 'stop' }
    }
  }
  ctx.llm.registerAdapter(['fixture-model'], new LocalModel())
  ctx.provide('workspaceRegistry', { resolveByPath: async path => path === root ? { id: 'workspace', path: root } : undefined })
  ctx.provide('userQuestions', { registerProvider: () => () => {} })
  ctx.provide('settings', { register: () => ({ get: () => ({ selections: [] }), replace: async () => {} }) })
  const parent = (await ctx.agents.create({ sessionId: 'research-parent', meta: { cwd: root }, agentOptions: { provider: 'fixture-model', model: 'local' } })).agent
  if (mode === 'code') parent.ctx.tools.presentAs('code')
  const api = createApiProxy(ctx, { cwd: root, defaultModelSelection: () => ({ provider: 'fixture-model', model: 'local' }) })
  ctx.provide('apiProxy', api)
  const sessions = async identitySessionId => {
    const response = await api.sessions.list({ rpcId: randomUUID(), payload: { identitySessionId } })
    if (!response.result.ok) throw Error(response.result.error.message)
    return response.result.value.items
  }
  service = await IntegrationService.open({
    root: join(root, 'registry'), encryption, getOwnerId: () => 'fixture-owner',
    resolveContext: async input => {
      const result = await resolveIntegrationContext(input, { ownerId: 'fixture-owner', tasks: [], workspaces: async () => [{ workspaceId: 'workspace', path: root }], sessions })
      admitted.push(result); return result
    },
  })
  bridge = await startIntegrationBridge(service)
  runtime = createIntegrationRuntime(ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify({ url: bridge.url, token: bridge.token }) }, pollIntervalMs: 0, requestTimeoutMs: 2000 })
  await runtime.ready
  server = createServer((request, response) => {
    const result = businessResponse ?? { path: request.url, nonce: randomUUID() }; requests.push(result)
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(result))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const mutate = async command => {
    const reply = await service.request({ ...command, meta: { requestId: randomUUID(), expectedRevision: command.id ? service.store.snapshot().connections[command.id].revision : service.store.snapshot().revision } })
    expect(reply.type).toBe('operation'); await service.operations.wait(reply.operation.id)
    const completed = await service.request({ type: 'operation', id: reply.operation.id })
    expect(completed.operation.status, completed.operation.message).toBe('succeeded'); await runtime.sync()
  }
  await mutate({ type: 'save-connection', draft: {
    ...emptyConnectionDraft('api'), name: '研究本机连接', url: `http://127.0.0.1:${server.address().port}`, allowPrivateNetwork: true, workspaceIds: 'workspace',
    toolsJson: JSON.stringify(['visible', 'hidden', 'ungranted'].map(id => ({ id, name: id, description: `Read local ${id} data`, method: 'GET', path: `/${id}`, inputSchema: { type: 'object', properties: {}, additionalProperties: false } }))),
  } })
  const connection = Object.values(service.store.snapshot().connections)[0]
  const tools = Object.values(service.store.snapshot().tools)
  const byPath = path => tools.find(tool => tool.remoteName === path || tool.name === path || tool.id.endsWith(path))
  // API tool IDs are assigned by the service; resolve their definitions rather than assuming ID formatting.
  const visible = byPath('visible'), hidden = byPath('hidden'), ungranted = byPath('ungranted')
  expect(visible).toBeDefined(); expect(hidden).toBeDefined(); expect(ungranted).toBeDefined()
  await mutate({ type: 'grant-tools', id: connection.id, toolIds: [visible.id, hidden.id] })
  const names = { visible: toolRegistrationName(visible.id), hidden: toolRegistrationName(hidden.id), ungranted: toolRegistrationName(ungranted.id) }
  const liftParentRestriction = parent.ctx.tools.restrict({ deny: [names.hidden] })
  adapter = createSubagentAdapter(ctx)
  const start = async (kind, synthesisOnly = false, query = '使用已连接数据生成研究表格') => {
    const handle = await adapter.start({ parentSessionId: parent.id, kind, query, prompt: query, signal: new AbortController().signal, synthesisOnly, onSessionEvent: () => {} })
    handles.push(handle); await entered.promise
    const child = ctx.agents.get(handle.childSessionId)
    expect(child).toBeDefined()
    return child
  }
  const invoke = (child, name) => ctx.tools.execute({ name, arguments: {}, callId: randomUUID(), agent: child, signal: new AbortController().signal })
  return { ctx, parent, start, names, runtime, requests, admitted, sessions, invoke, liftParentRestriction, mutate, connection, modelRequests }
}

describe('research children inherit authorized EWork tools', () => {
  it('installs lossless source projection for an actual component child using the authenticated managed-tool bridge',async()=>{
    const response={retCode:1,data:Array.from({length:60},(_,i)=>({ticker:'600027',publishDate:'2026-08-28',endDate:'2026-06-30',itemName:'指标'+i,value:i,content:'已披露经营数据，保留全部记录及单位。'.repeat(100)}))}
    const f=await fixture('native',response),child=await f.start('container')
    const result=await f.invoke(child,f.names.visible)
    expect(result.isError,JSON.stringify(result.content)).toBe(false)
    const projection=JSON.parse(result.content[0].text)
    expect(projection.__eworkEvidenceProjection?.rowCount).toBe(60)
    expect(projection.data).toHaveLength(60)
    expect(result.value.content[0].text).toBe(JSON.stringify(response))
    expect(f.requests).toHaveLength(1)
  })
  it('uses the selected concise effort in the actual first component model request', async () => {
    const f = await fixture(); await f.start('container')
    expect(f.modelRequests[0].reasoningEffort).toBe('low')
  })
  it.each(['qa', 'board', 'container'])('lets a real %s child call parent-visible data without widening the parent scope', async kind => {
    const f = await fixture(), child = await f.start(kind)
    expect(f.modelRequests[0].tools.map(tool => tool.name)).toContain(f.names.visible)
    const childNames = f.ctx.tools.schemas(child).map(tool => tool.name)
    expect(childNames).toContain(f.names.visible)
    expect(childNames).not.toContain(f.names.hidden)
    expect(childNames).not.toContain(f.names.ungranted)
    expect(child.session.header).toMatchObject({ origin: 'subagent', parentSession: f.parent.id, cwd: f.parent.session.header.cwd })
    expect(f.ctx.agents.isOwnedBy(child.id, f.parent)).toBe(true)
    expect((await f.sessions()).find(session => session.sessionId === child.id)).toMatchObject({ origin: 'subagent', parentSessionId: f.parent.id, cwd: f.parent.session.header.cwd })
    const result = await f.invoke(child, f.names.visible)
    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    expect(f.requests).toHaveLength(1)
    expect(JSON.parse(result.content[0].text)).toEqual(f.requests[0])
    expect(f.admitted[0]).toMatchObject({ sessionId: child.id, rootSessionId: f.parent.id, workspaceId: 'workspace', unattended: false })
    // A later parent widening cannot expand the child's captured allow set.
    f.liftParentRestriction()
    expect(f.ctx.tools.get(f.names.hidden, f.parent)).toBeDefined()
    expect((await f.invoke(child, f.names.hidden)).isError).toBe(true)
    expect((await f.invoke(child, f.names.ungranted)).isError).toBe(true)
    expect(f.requests).toHaveLength(1)
    // The main-process grant authority still revokes an already running child.
    await f.mutate({ type: 'set-enabled', kind: 'connection', id: f.connection.id, enabled: false })
    expect((await f.invoke(child, f.names.visible)).isError).toBe(true)
    expect(f.requests).toHaveLength(1)
  })

  it('inherits the visible Code Mode capability set and invokes it in the real worker', async () => {
    const f = await fixture('code'), child = await f.start('qa')
    expect(f.ctx.tools.schemas(child).map(tool => tool.name)).toContain(f.names.visible)
    child.ctx.tools.presentAs('code')
    const result = await f.ctx.tools.execute({ name: 'run_code', arguments: { code: `return await tools[${JSON.stringify(f.names.visible)}]({});`, description: '读取研究数据' }, callId: randomUUID(), agent: child, signal: new AbortController().signal })
    expect(result.isError, JSON.stringify(result.content)).toBe(false)
    expect(f.requests).toHaveLength(1); expect(result.content[0].text).toContain(f.requests[0].nonce)
    expect(f.admitted[0]).toMatchObject({ sessionId: child.id, rootSessionId: f.parent.id })
  })

  it.each(['qa', 'container'])('keeps synthesis-only %s children free of integration and research tools', async kind => {
    const f = await fixture(), child = await f.start(kind, true)
    expect(f.ctx.tools.schemas(child).map(tool => tool.name)).toEqual([])
    expect((await f.invoke(child, f.names.visible)).isError).toBe(true)
    expect(f.requests).toHaveLength(0)
  })

  it('preserves the explicit offline container boundary', async () => {
    const f = await fixture(), child = await f.start('container', false, '不联网，使用以下数据：1、2、3 制作表格')
    expect(f.ctx.tools.schemas(child).map(tool => tool.name)).toEqual([])
    expect((await f.invoke(child, f.names.visible)).isError).toBe(true)
    expect(f.requests).toHaveLength(0)
  })
})
