import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { McpSupervisor } from '../src/main/integrations/adapters/mcp'
import type { Connection } from '../src/shared/integrations'
type HttpFixture = { url: string; metrics: { initializes: number; calls: number; unauthorized: number; deletes: number; requests: number }; close(): Promise<void> }
const { createMcpHttpFixture } = await import(new URL('./fixtures/integrations/mcp-http.mjs', import.meta.url).href) as {
  createMcpHttpFixture(options?: { secret?: string; failRequests?: number }): Promise<HttpFixture>
}

const supervisors: McpSupervisor[] = []
const fixtures: Array<{close():Promise<void>}> = []
const signal = () => new AbortController().signal
function connection(patch: Partial<Connection> = {}): Connection {
  return {
    id: 'mcp-fixture', name: 'MCP fixture', providerId: 'mcp', kind: 'mcp', ownerAccountId: 'user',
    config: { type: 'mcp', transport: 'stdio', command: process.execPath, args: [resolve('test/fixtures/integrations/mcp-stdio.mjs'), 'first'], auth: { type: 'none' }, network: {} },
    enabled: true, revision: 1, authState: 'connected', health: 'unknown', workspaceGrant: { mode: 'selected', workspaceIds: ['workspace'] },
    toolGrants: [], unattendedToolGrants: [], createdAt: 1, updatedAt: 1, configDigest: 'first', ...patch
  }
}
function supervisor(secrets: Record<string,string> = {}) {
  const vault = { read: vi.fn(async (ref: string) => { if (!(ref in secrets)) throw new Error('secret missing'); return secrets[ref]! }) }
  const instance = new McpSupervisor(vault)
  supervisors.push(instance)
  return { instance, vault }
}
afterEach(async () => {
  await Promise.all(supervisors.splice(0).map(instance => instance.disposeAll()))
  await Promise.all(fixtures.splice(0).map(fixture => fixture.close()))
  vi.unstubAllEnvs()
})

describe('MCP supervisor with real SDK transports', () => {
  it('discovers paginated STDIO tools and reuses one live process for concurrent connects', async () => {
    const { instance } = supervisor()
    const [first, second] = await Promise.all([instance.connect(connection(), signal()), instance.connect(connection(), signal())])
    expect(first.tools.map(tool => tool.name)).toEqual(['echo', 'environment', 'wait', 'large', 'stderr', 'crash'])
    expect(second.tools).toEqual(first.tools)
    expect(first.negotiatedVersion).toMatch(/^202\d-\d\d-\d\d$/)
    const left = JSON.parse((await instance.invoke('mcp-fixture', 'echo', { input: 'hello' }, signal())).content[0]!.text)
    await instance.connect(connection(), signal())
    const right = JSON.parse((await instance.invoke('mcp-fixture', 'echo', {}, signal())).content[0]!.text)
    expect(left.pid).toBe(right.pid)
    expect(right.calls).toBe(2)
    expect(left.args).toEqual({ input: 'hello' })
  })

  it('replaces a changed configuration and terminates the old child', async () => {
    const { instance } = supervisor()
    await instance.connect(connection(), signal())
    const old = JSON.parse((await instance.invoke('mcp-fixture', 'echo', {}, signal())).content[0]!.text)
    const changed = connection()
    if (changed.config.type === 'mcp') changed.config.args = [resolve('test/fixtures/integrations/mcp-stdio.mjs'), 'second']
    await instance.connect(changed, signal())
    const next = JSON.parse((await instance.invoke('mcp-fixture', 'echo', {}, signal())).content[0]!.text)
    expect(next.pid).not.toBe(old.pid)
    expect(next.label).toBe('second')
    expect(() => process.kill(old.pid, 0)).toThrow()
    await instance.dispose('mcp-fixture')
    expect((await instance.invoke('mcp-fixture', 'echo', {}, signal())).errorCode).toBe('RUNTIME_UNAVAILABLE')
  })

  it('inherits only safe environment values and resolves explicit environment entries from the vault', async () => {
    vi.stubEnv('EWORK_INTEGRATION_BRIDGE_TOKEN', 'bridge-secret')
    vi.stubEnv('OTHER_SECRET', 'another-secret')
    const { instance, vault } = supervisor({ 'vault:fixture': 'fixture-secret' })
    const input = connection()
    if (input.config.type === 'mcp') input.config.env = { FIXTURE_SECRET: 'vault:fixture' }
    await instance.connect(input, signal())
    const result = JSON.parse((await instance.invoke(input.id, 'environment', {}, signal())).content[0]!.text)
    expect(result).toEqual({ bridgeToken: false, unrelatedSecret: false, explicitSecret: true, nodeOptions: false, path: true })
    expect(vault.read).toHaveBeenCalledWith('vault:fixture')
  })

  it('blocks injected node execution options and masks credentials echoed in tool output', async () => {
    const { instance } = supervisor({ 'vault:fixture': 'fixture-secret' })
    const invalid = connection()
    if (invalid.config.type === 'mcp') invalid.config.env = { NODE_OPTIONS: 'vault:fixture' }
    await expect(instance.connect(invalid, signal())).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
    const valid = connection()
    if (valid.config.type === 'mcp') valid.config.env = { FIXTURE_SECRET: 'vault:fixture' }
    await instance.connect(valid, signal())
    const result = await instance.invoke(valid.id, 'echo', { text: 'fixture-secret' }, signal())
    expect(JSON.stringify(result)).not.toContain('fixture-secret')
    expect(result.content[0]!.text).toContain('[凭据已隐藏]')
  })

  it('does not start a child if disposed while awaiting credentials', async () => {
    let release!: (value: string) => void
    const instance = new McpSupervisor({ read: () => new Promise(resolve => { release = resolve }) })
    supervisors.push(instance)
    const input = connection()
    if (input.config.type === 'mcp') input.config.env = { FIXTURE_SECRET: 'vault:deferred' }
    const pending = instance.connect(input, signal())
    const rejected = expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    await instance.dispose(input.id)
    release('late-secret')
    await rejected
    expect((await instance.invoke(input.id, 'echo', {}, signal())).errorCode).toBe('RUNTIME_UNAVAILABLE')
  })

  it('cancels an in-flight request and retains the connection for later calls', async () => {
    const { instance } = supervisor()
    await instance.connect(connection(), signal())
    const controller = new AbortController()
    const pending = instance.invoke('mcp-fixture', 'wait', {}, controller.signal)
    setTimeout(() => controller.abort(), 30)
    expect((await pending).errorCode).toBe('CANCELLED')
    expect((await instance.invoke('mcp-fixture', 'echo', {}, signal())).isError).not.toBe(true)
  })

  it('bounds output and drains stderr without exposing it as tool content', async () => {
    const { instance } = supervisor()
    await instance.connect(connection(), signal())
    expect(JSON.stringify(await instance.invoke('mcp-fixture', 'stderr', {}, signal()))).not.toContain('DO-NOT-EXPOSE')
    const large = await instance.invoke('mcp-fixture', 'large', {}, signal())
    expect(large.isError).toBe(true)
    expect(large.errorCode).toBe('RESPONSE_TOO_LARGE')
  })

  it('does not automatically replay a tool call after the server dies', async () => {
    const { instance } = supervisor()
    await instance.connect(connection(), signal())
    const result = await instance.invoke('mcp-fixture', 'crash', {}, signal())
    expect(result.errorCode).toBe('RESULT_UNKNOWN')
  })

  it('rejects unknown tool names without sending a request', async () => {
    const { instance } = supervisor()
    await instance.connect(connection(), signal())
    expect((await instance.invoke('mcp-fixture', 'not-discovered', {}, signal())).errorCode).toBe('NOT_FOUND')
    expect(JSON.parse((await instance.invoke('mcp-fixture', 'echo', {}, signal())).content[0]!.text).calls).toBe(1)
  })

  it('connects to a real HTTP server through network policy, uses vault authentication, and terminates sessions', async () => {
    const fixture = await createMcpHttpFixture({ secret: 'http-secret' })
    fixtures.push(fixture)
    const { instance } = supervisor({ 'vault:http': 'http-secret' })
    const input = connection({ config: { type: 'mcp', transport: 'http', url: fixture.url, auth: { type: 'bearer', credentialRef: 'vault:http' }, network: { allowLocal: true, allowedOrigins: [new URL(fixture.url).origin] } } })
    const result = await instance.connect(input, signal())
    expect(result.tools.map(tool => tool.name)).toEqual(['echo', 'second'])
    expect(JSON.parse((await instance.invoke(input.id, 'echo', { body: 'HTTP works' }, signal())).content[0]!.text).args).toEqual({ body: 'HTTP works' })
    expect(fixture.metrics.initializes).toBe(1)
    expect(fixture.metrics.calls).toBe(1)
    await instance.dispose(input.id)
    expect(fixture.metrics.deletes).toBe(1)
  })

  it('does not retry failed authentication or disclose the credential', async () => {
    const fixture = await createMcpHttpFixture({ secret: 'expected-secret' })
    fixtures.push(fixture)
    const { instance } = supervisor({ 'vault:http': 'wrong-secret' })
    const input = connection({ config: { type: 'mcp', transport: 'http', url: fixture.url, auth: { type: 'bearer', credentialRef: 'vault:http' }, network: { allowLocal: true, allowedOrigins: [new URL(fixture.url).origin] } } })
    await expect(instance.connect(input, signal())).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
    expect(fixture.metrics.unauthorized).toBe(1)
  })

  it('rejects an unapproved local HTTP target before reaching the server', async () => {
    const fixture = await createMcpHttpFixture()
    fixtures.push(fixture)
    const { instance } = supervisor()
    const input = connection({ config: { type: 'mcp', transport: 'http', url: fixture.url, auth: { type: 'none' }, network: {} } })
    await expect(instance.connect(input, signal())).rejects.toMatchObject({ code: 'NETWORK_BLOCKED' })
    expect(fixture.metrics.requests).toBe(0)
  })

  it('allows cancellation during retry backoff without keeping a client alive', async () => {
    const fixture = await createMcpHttpFixture({ failRequests: 100 })
    fixtures.push(fixture)
    const { instance } = supervisor()
    const controller = new AbortController()
    const input = connection({ config: { type: 'mcp', transport: 'http', url: fixture.url, auth: { type: 'none' }, network: { allowLocal: true, allowedOrigins: [new URL(fixture.url).origin] } } })
    const pending = instance.connect(input, controller.signal)
    setTimeout(() => controller.abort(), 50)
    await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
    expect(fixture.metrics.requests).toBe(1)
  })

  it('retries a transient initialization failure and invokes the business tool exactly once', async () => {
    const fixture = await createMcpHttpFixture({ failRequests: 1 })
    fixtures.push(fixture)
    const { instance } = supervisor()
    const input = connection({ config: { type: 'mcp', transport: 'http', url: fixture.url, auth: { type: 'none' }, network: { allowLocal: true, allowedOrigins: [new URL(fixture.url).origin] } } })
    await instance.connect(input, signal())
    const result = await instance.invoke(input.id, 'echo', { value: 1 }, signal())
    expect(result.isError).not.toBe(true)
    expect(fixture.metrics.calls).toBe(1)
    expect(fixture.metrics.initializes).toBe(1)
  })
})
