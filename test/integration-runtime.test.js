import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import WorkerThreadCodeRuntime from '@deepseek-ai/dsh-code-runtime-worker-thread'
import { createIntegrationRuntime } from '../packages/dsh-integration-runtime/index.js'

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

async function fixture() {
  const snapshot = {
    revision: 1, runtimeEpoch: 'fixture-epoch', ownerAccountId: 'owner-1',
    connections: [{ id: 'connection-1', revision: 1, enabled: true, ownerAccountId: 'owner-1', workspaceGrant: { mode: 'selected', workspaceIds: ['workspace-a'] }, authState: 'connected', toolGrants: ['lookup'], unattendedToolGrants: [] }],
    tools: [{ id: 'lookup', connectionId: 'connection-1', operationId: 'lookup', name: '查询资料', description: '查询测试资料', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false }, effect: 'read', enabled: true, schemaDigest: 'schema-1' }], skills: [], plugins: []
  }
  const received = [], sockets = new Set()
  const controls = { unavailable: false, execute: undefined }
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== 'Bearer fixture-token') { response.writeHead(401); response.end('{}'); return }
    if (controls.unavailable) { response.writeHead(503); response.end('{}'); return }
    if (request.url === '/snapshot') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(snapshot)); return }
    if (request.url === '/execute') {
      let body = ''; for await (const chunk of request) body += chunk
      const call = JSON.parse(body); received.push(call)
      const value = controls.execute ? await controls.execute(call, request, response) : { callId: call.callId, content: [{ type: 'text', text: 'fixture-data:42' }] }
      if (!response.destroyed && value !== undefined) { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)) }
      return
    }
    response.writeHead(404); response.end('{}')
  })
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const ctx = new Context()
  new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  ctx.provide('workspaceRegistry', { resolveByPath: async path => path === '/tmp/integration-a' ? { id: 'workspace-a', path } : path === '/tmp/integration-b' ? { id: 'workspace-b', path } : undefined })
  const a = (await ctx.agents.create({ sessionId: 'agent-a', meta: { cwd: '/tmp/integration-a' }, agentOptions: {} })).agent
  const b = (await ctx.agents.create({ sessionId: 'agent-b', meta: { cwd: '/tmp/integration-b' }, agentOptions: {} })).agent
  const runtime = createIntegrationRuntime(ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify({ url: `http://127.0.0.1:${server.address().port}`, token: 'fixture-token' }) }, pollIntervalMs: 0, requestTimeoutMs: 500 })
  cleanups.push(async () => { await runtime.dispose(); await ctx.fiber.dispose(); for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)) })
  await runtime.ready
  const invoke = (agent = a, args = { query: '真实数据' }) => ctx.tools.execute({ name: 'ework__lookup', arguments: args, callId: 'call-1', agent, signal: new AbortController().signal })
  return { ctx, a, b, runtime, snapshot, received, controls, invoke }
}

describe('managed integration runtime against real Harness services and HTTP bridge', () => {
  it('publishes permitted schemas and performs a real authenticated request with trusted execution identity', async () => {
    const f = await fixture()
    expect(f.ctx.tools.schemas(f.a).map(tool => tool.name)).toContain('ework__lookup')
    expect(f.ctx.tools.schemas(f.b).map(tool => tool.name)).not.toContain('ework__lookup')
    const schema = f.ctx.tools.get('ework__lookup', f.a).parameters
    expect(Object.keys(schema.properties)).toEqual(['query'])
    const result = await f.invoke()
    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'fixture-data:42' }])
    expect(f.received).toEqual([{ callId: 'call-1', toolId: 'lookup', connectionRevision: 1, arguments: { query: '真实数据' }, context: { sessionId: 'agent-a', rootSessionId: 'agent-a', workspaceId: 'workspace-a', ownerAccountId: 'owner-1', unattended: false, runtimeEpoch: 'fixture-epoch' } }])
  })

  it('rejects an unauthorized workspace, forged agent, and model-supplied identity without issuing requests', async () => {
    const f = await fixture()
    expect((await f.invoke(f.b)).isError).toBe(true)
    expect((await f.invoke({ ...f.a, session: f.a.session })).isError).toBe(true)
    expect((await f.invoke(f.a, { query: 'x', context: { workspaceId: 'workspace-a' } })).isError).toBe(true)
    expect(f.received).toHaveLength(0)
  })

  it('revalidates an existing schema before dispatch and removes capabilities after a disable', async () => {
    const f = await fixture()
    f.snapshot.connections[0].enabled = false; f.snapshot.connections[0].revision++; f.snapshot.revision++
    expect((await f.invoke()).isError).toBe(true)
    expect(f.received).toHaveLength(0)
    expect(f.ctx.tools.get('ework__lookup', f.a)).toBeUndefined()
    expect(f.ctx.tools.schemas(f.a).map(tool => tool.name)).not.toContain('ework__lookup')
  })

  it('fails closed on bridge loss and recovers only after a new authoritative snapshot', async () => {
    const f = await fixture()
    f.controls.unavailable = true
    expect((await f.invoke()).isError).toBe(true)
    expect(f.ctx.tools.get('ework__lookup', f.a)).toBeUndefined()
    expect(f.received).toHaveLength(0)
    f.controls.unavailable = false; f.snapshot.runtimeEpoch = 'epoch-after-restart'
    await f.runtime.sync()
    expect((await f.invoke()).isError).toBe(false)
    expect(f.received[0].context.runtimeEpoch).toBe('epoch-after-restart')
  })

  it('does not convert a remote tool failure into successful tool output', async () => {
    const f = await fixture()
    f.controls.execute = async call => ({ callId: call.callId, isError: true, errorCode: 'AUTH_REQUIRED', content: [{ type: 'text', text: '连接授权已过期' }] })
    const result = await f.invoke()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('连接授权已过期')
    expect(f.received).toHaveLength(1)
  })

  it('synchronizes agents created after mounting without granting a new scope transient access', async () => {
    const f = await fixture()
    const c = (await f.ctx.agents.create({ sessionId: 'agent-c', meta: { cwd: '/tmp/integration-b' }, agentOptions: {} })).agent
    expect(f.ctx.tools.schemas(c).map(tool => tool.name)).not.toContain('ework__lookup')
    await f.runtime.sync()
    expect((await f.invoke(c)).isError).toBe(true)
    expect(f.received).toHaveLength(0)
  })

  it('aborts and drains an in-flight request and removes tools during disposal', async () => {
    const f = await fixture()
    let entered; const entry = new Promise(resolve => { entered = resolve })
    f.controls.execute = async () => { entered(); return undefined }
    const call = f.invoke(); await entry; await f.runtime.dispose()
    expect((await call).isError).toBe(true)
    expect(f.ctx.tools.get('ework__lookup', f.a)).toBeUndefined()
    expect(f.received).toHaveLength(1)
  })

  it('keeps invalid model schemas out of the registry instead of silently widening their inputs', async () => {
    const f = await fixture()
    f.snapshot.tools[0].inputSchema.properties.sessionId = { type: 'string' }
    f.snapshot.revision++
    await f.runtime.sync()
    expect(f.ctx.tools.schemas(f.a).map(tool => tool.name)).not.toContain('ework__lookup')
    expect((await f.invoke()).isError).toBe(true)
    expect(f.received).toHaveLength(0)
  })

  it('rejects a retained proxy after schema replacement and never replays a remote call automatically', async () => {
    const f = await fixture()
    const old = f.ctx.tools.get('ework__lookup', f.a)
    f.snapshot.tools[0].schemaDigest = 'schema-2'
    f.snapshot.tools[0].inputSchema = { type: 'object', properties: { ticker: { type: 'string' } }, required: ['ticker'], additionalProperties: false }
    f.snapshot.revision++
    await expect(old.execute({ query: 'old input' }, { agent: f.a, callId: 'old-schema', signal: new AbortController().signal })).rejects.toThrow()
    expect(f.received).toHaveLength(0)
    expect(f.ctx.tools.schemas(f.a).find(tool => tool.name === 'ework__lookup').parameters.properties).toEqual({ ticker: { type: 'string' } })
    expect((await f.invoke(f.a, { ticker: 'ABC' })).isError).toBe(false)
    expect(f.received).toHaveLength(1)
  })

  it('maintains separate stable dispatch names when tool identifiers normalize to the same prefix', async () => {
    const f = await fixture()
    f.snapshot.tools = ['a-b', 'a_b'].map(id => ({ ...f.snapshot.tools[0], id }))
    f.snapshot.connections[0].toolGrants = ['a-b', 'a_b']; f.snapshot.revision++
    await f.runtime.sync()
    const names = f.ctx.tools.schemas(f.a).map(tool => tool.name)
    expect(names).toHaveLength(2)
    expect(names).toContain('ework__a_b')
    expect(names.find(name => name !== 'ework__a_b')).toMatch(/^ework__a_b_[a-f0-9]{10}$/)
    for (const name of names) expect((await f.ctx.tools.execute({ name, arguments: { query: 'x' }, callId: name, agent: f.a, signal: new AbortController().signal })).isError).toBe(false)
    expect(f.received.map(call => call.toolId).sort()).toEqual(['a-b', 'a_b'])
  })

  it('does not mark unrelated tools unavailable when the caller cancels one request', async () => {
    const f = await fixture()
    let entered; const entry = new Promise(resolve => { entered = resolve })
    f.controls.execute = async () => { entered(); return undefined }
    const controller = new AbortController()
    const result = f.ctx.tools.execute({ name: 'ework__lookup', arguments: { query: 'x' }, callId: 'cancel-call', agent: f.a, signal: controller.signal })
    await entry; controller.abort()
    expect((await result).isError).toBe(true)
    expect(f.ctx.tools.schemas(f.a).map(tool => tool.name)).toContain('ework__lookup')
    expect(f.received).toHaveLength(1)
  })

  it('rejects success-shaped malformed tool responses instead of manufacturing usable data', async () => {
    const f = await fixture()
    f.controls.execute = async call => ({ callId: call.callId, content: [{ type: 'text' }] })
    expect((await f.invoke()).isError).toBe(true)
    expect(f.received).toHaveLength(1)
  })

  it('uses the same authorization and identity through a real Code Mode worker sub-dispatch', async () => {
    const f = await fixture()
    new WorkerThreadCodeRuntime(f.ctx, { computeMs: 1000, maxWallMs: 2000, maxOutputBytes: 32768, maxOldGenerationSizeMb: 64 })
    f.a.ctx.tools.presentAs('code'); f.b.ctx.tools.presentAs('code')
    expect((await f.invoke()).isError).toBe(true)
    const run = (agent, code) => f.ctx.tools.execute({ name: 'run_code', arguments: { code, description: '验证连接工具的会话权限' }, callId: 'code-call', agent, signal: new AbortController().signal })
    const allowed = await run(f.a, 'const result = await tools.ework__lookup({query:"worker request"}); return result.content[0].text;')
    expect(allowed.isError).toBe(false)
    expect(allowed.content[0].text).toContain('fixture-data:42')
    expect(f.received).toHaveLength(1)
    expect(f.received[0].context.sessionId).toBe('agent-a')
    expect(f.received[0].callId).toBe('code-call:code:1')
    const hidden = await run(f.b, 'return typeof tools.ework__lookup;')
    expect(hidden.isError).toBe(false)
    expect(hidden.content[0].text).toContain('undefined')
    expect(f.received).toHaveLength(1)
  })

  it('rejects unsafe bridge addresses and malformed snapshots without exposing tools', async () => {
    const f = await fixture()
    f.snapshot.connections[0].workspaceGrant = { mode: 'all-owned', ownerAccountId: 'other-owner' }
    await f.runtime.sync()
    expect((await f.invoke()).isError).toBe(true)
    expect(f.received).toHaveLength(0)
    expect(() => createIntegrationRuntime(f.ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify({ url: 'https://example.com', token: 'fixture-token' }) } })).toThrow()
  })
})
