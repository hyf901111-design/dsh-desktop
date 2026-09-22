import { afterEach, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionStore } from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import { IntegrationError } from '../src/shared/integrations'
import { startIntegrationBridge } from '../src/main/integrations/runtime-bridge'
import { createIntegrationRuntime } from '../packages/dsh-integration-runtime/index.js'

const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

async function fixture(failure, requestFetch = fetch) {
  const ctx = new Context(), calls = []
  new SessionStore(ctx); new AgentRegistry(ctx); new LlmRuntime(ctx); new SystemPrompt(ctx, {}); new ToolRuntime(ctx); new SkillRegistry(ctx)
  new AgentLoop(ctx, { agents: [], maxParallelToolCalls: 1 })
  ctx.provide('workspaceRegistry', { resolveByPath: async path => ({ id: 'workspace', path }) })
  const agent = (await ctx.agents.create({ sessionId: 'bridge-error-agent', meta: { cwd: '/tmp/integration-errors' }, agentOptions: {} })).agent
  const snapshot = {
    revision: 1, runtimeEpoch: 'epoch', ownerAccountId: 'owner',
    connections: [{ id: 'connection', revision: 1, enabled: true, ownerAccountId: 'owner', workspaceGrant: { mode: 'all-owned', ownerAccountId: 'owner' }, authState: 'connected', toolGrants: ['write', 'read'], unattendedToolGrants: [] }],
    tools: ['write', 'read'].map(id => ({ id, connectionId: 'connection', operationId: id, name: id, description: `Fixture ${id} operation`, inputSchema: { type: 'object', properties: {}, additionalProperties: false }, effect: id, enabled: true, schemaDigest: `schema-${id}` })),
    skills: [], plugins: [],
  }
  // Exercise the real HTTP bridge's exception-to-status/body contract.
  const bridge = await startIntegrationBridge({
    runtimeSnapshot: () => snapshot,
    execute: async call => { calls.push(call.toolId); if (call.toolId === 'write') throw failure; return { callId: call.callId, content: [{ type: 'text', text: 'still-available' }] } },
    readSkill: async () => { throw failure },
  })
  const runtime = createIntegrationRuntime(ctx, { env: { EWORK_INTEGRATION_BRIDGE: JSON.stringify({ url: bridge.url, token: bridge.token }) }, fetch: requestFetch, pollIntervalMs: 0 })
  cleanups.push(async () => { await runtime.dispose(); await ctx.fiber.dispose(); await bridge.dispose() })
  await runtime.ready
  const invoke = name => ctx.tools.execute({ name: `ework__${name}`, arguments: {}, callId: `call-${name}`, agent, signal: new AbortController().signal })
  return { ctx, agent, runtime, bridge, calls, invoke }
}

it.each([
  ['RESULT_UNKNOWN', '外部操作可能已完成，请先核对结果，未自动重试'],
  ['AUTH_REQUIRED', '连接授权已过期，请重新授权'],
  ['SCHEMA_CHANGED', '服务器工具已变化，请重新确认允许的工具'],
  ['ACCESS_DENIED', '本次写入未获批准'],
])('preserves real bridge %s errors without dropping unrelated capabilities', async (code, message) => {
  const f = await fixture(new IntegrationError(code, message))
  const result = await f.invoke('write')
  expect(result).toMatchObject({ isError: true, error: { info: { code }, message } })
  expect(result.content[0].text).toContain(message)
  expect(f.calls).toEqual(['write'])
  expect(f.runtime.snapshot).toBeDefined()
  expect(f.ctx.tools.schemas(f.agent).map(tool => tool.name)).toContain('ework__read')
  expect((await f.invoke('read')).content).toEqual([{ type: 'text', text: 'still-available' }])
  expect(f.calls).toEqual(['write', 'read'])
})

it.each([
  ['unknown error code', () => Response.json({ code: 'UNRECOGNIZED', error: 'do not expose' }, { status: 400 })],
  ['invalid JSON', () => new Response('not JSON', { status: 400 })],
  ['oversized error response', () => Response.json({ code: 'RESULT_UNKNOWN', error: 'x'.repeat(20000) }, { status: 400 })],
  ['mismatched error status', () => Response.json({ code: 'RESULT_UNKNOWN', error: 'do not expose' }, { status: 403 })],
  ['unauthenticated response', () => Response.json({ code: 'ACCESS_DENIED', error: 'do not expose' }, { status: 401 })],
  ['transport failure', () => { throw new TypeError('fetch failed') }],
])('invalidates the runtime on %s', async (_name, response) => {
  const f = await fixture(new IntegrationError('RESULT_UNKNOWN', 'unused'), (url, options) => url.endsWith('/execute') ? response() : fetch(url, options))
  const result = await f.invoke('write')
  expect(result.isError).toBe(true)
  expect(result.content[0].text).not.toContain('do not expose')
  expect(f.runtime.snapshot).toBeUndefined()
  expect(f.ctx.tools.schemas(f.agent).map(tool => tool.name)).not.toContain('ework__read')
  expect(f.calls).toEqual([])
})
