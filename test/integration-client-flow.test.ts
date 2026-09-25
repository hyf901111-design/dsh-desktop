import { afterEach, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { manifestDigest } from '../src/main/integrations/manifest'
import { IntegrationService } from '../src/main/integrations/service'
import { emptyConnectionDraft, type IntegrationCommand, type IntegrationRow } from '../src/shared/integration-ui'
const roots: string[] = [], services: IntegrationService[] = []
const encryption = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() }
async function create(getOwnerId = () => 'owner', withSkillFixture = false) {
  const root = await mkdtemp(join(tmpdir(), 'ework-client-flow-')); roots.push(root)
  let bundledCatalogRoot = resolve('build/integration-catalog')
  if (withSkillFixture) {
    bundledCatalogRoot = join(root, 'test-catalog'); await mkdir(bundledCatalogRoot)
    const manifest = { schemaVersion: 1, id: 'test.catalog.skill', name: '市场测试技能', description: '仅用于隔离验收', version: '1.0.0', skills: [{ id: 'summary', name: '市场测试技能', description: '验收摘要', files: { 'SKILL.md': '---\nname: 市场测试技能\ndescription: 验收摘要\n---\n基于已提供资料编写验收摘要。' } }] }
    await writeFile(join(bundledCatalogRoot, 'catalog.json'), JSON.stringify({ schemaVersion: 1, entries: [{ id: 'test-skill', kind: 'skill', name: manifest.name, description: manifest.description, publisher: 'Test fixture', version: '1.0.0', permissions: [], manifest, digest: manifestDigest(manifest) }] }))
  }
  const service = await IntegrationService.open({ root, encryption, getOwnerId, bundledCatalogRoot, approveWrite: async () => true })
  services.push(service); return service
}
async function mutate(service: IntegrationService, command: object, revision = service.store.snapshot().revision) {
  const reply = await service.request({ ...command, meta: { requestId: randomUUID(), expectedRevision: revision } } as IntegrationCommand)
  if (reply.type !== 'operation') throw Error('Missing operation')
  await service.operations.wait(reply.operation.id)
  const result = await service.request({ type: 'operation', id: reply.operation.id })
  expect(result).toMatchObject({ type: 'operation', operation: { status: 'succeeded' } })
  return result.type === 'operation' ? result.operation : reply.operation
}
async function row(service: IntegrationService): Promise<IntegrationRow> {
  const reply = await service.request({ type: 'snapshot' }); if (reply.type !== 'snapshot') throw Error('Missing snapshot')
  return reply.snapshot.rows[0]!
}
afterEach(async () => { await Promise.all(services.splice(0).map(s => s.dispose())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('connects a user API, discovers the declared tool, invokes it and denies it after disabling', async () => {
  let calls = 0
  const server = createServer((request, response) => { calls++; response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ actual: request.url, value: 42 })) })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  try {
    const service = await create(), origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    await mutate(service, { type: 'save-connection', draft: { ...emptyConnectionDraft(), name: '本机实际 API', url: origin, allowPrivateNetwork: true, toolsJson: JSON.stringify([{ id: 'facts', name: '事实', description: '读取事实', method: 'GET', path: '/facts', effect: 'read', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }]) } })
    let connection = await row(service)
    expect(await service.request({ type: 'probe', id: connection.id })).toMatchObject({ type: 'probe', status: 'verified' })
    await mutate(service, { type: 'grant-tools', id: connection.id, toolIds: [connection.tools![0]!.id] }, connection.revision)
    connection = await row(service)
    const call = { callId: randomUUID(), toolId: connection.tools![0]!.id, connectionRevision: connection.revision, arguments: {}, context: { sessionId: 'session', rootSessionId: 'session', workspaceId: 'workspace', ownerAccountId: 'owner', unattended: false, runtimeEpoch: service.runtimeEpoch } }
    expect((await service.execute(call, new AbortController().signal)).content[0]!.text).toContain('42')
    expect(calls).toBe(2)
    await mutate(service, { type: 'set-enabled', kind: 'connection', id: connection.id, enabled: false }, connection.revision)
    await expect(service.execute(call, new AbortController().signal)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    expect(calls).toBe(2)
  } finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) }
})

it('allows discovered tools in a user configured MCP without a separate grant step', async () => {
  const service = await create()
  await mutate(service, { type: 'save-connection', draft: { ...emptyConnectionDraft('mcp-stdio'), name: '默认允许的 MCP', command: process.execPath, args: JSON.stringify([resolve('test/fixtures/integrations/mcp-stdio.mjs'), 'auto-grant']) } })
  let connection = await row(service)
  expect(await service.request({ type: 'probe', id: connection.id })).toMatchObject({ type: 'probe', status: 'verified' })
  connection = await row(service)
  expect(connection.tools!.length).toBeGreaterThan(1)
  expect(connection.tools!.every(tool => tool.allowed)).toBe(true)
  const toolId = connection.tools!.find(tool => tool.name === 'echo')!.id
  const result = await service.execute({ callId: randomUUID(), toolId, connectionRevision: connection.revision, arguments: { message: 'automatic', url_params: { pagesize: 10, pagenum: 1 } }, context: { sessionId: 's', rootSessionId: 's', workspaceId: 'w', ownerAccountId: 'owner', runtimeEpoch: service.runtimeEpoch, unattended: false } }, new AbortController().signal)
  expect(JSON.parse(result.content[0]!.text).args).toMatchObject({ message: 'automatic', url_params: { pagesize: '10', pagenum: '1' } })
})

it('keeps a manually disabled tool disabled after discovery while allowing new tools by default', async () => {
  const service = await create()
  await mutate(service, { type: 'save-connection', draft: { ...emptyConnectionDraft('mcp-stdio'), name: '可停用的 MCP', command: process.execPath, args: JSON.stringify([resolve('test/fixtures/integrations/mcp-stdio.mjs'), 'manual-denial']) } })
  let connection = await row(service)
  await service.request({ type: 'probe', id: connection.id })
  connection = await row(service)
  const disabled = connection.tools!.find(tool => tool.name === 'echo')!
  await mutate(service, { type: 'grant-tools', id: connection.id, toolIds: connection.tools!.filter(tool => tool.id !== disabled.id).map(tool => tool.id) }, connection.revision)
  connection = await row(service)
  expect(connection.tools!.find(tool => tool.id === disabled.id)?.allowed).toBe(false)
  await service.request({ type: 'probe', id: connection.id })
  connection = await row(service)
  expect(connection.tools!.find(tool => tool.id === disabled.id)?.allowed).toBe(false)
  expect(connection.tools!.filter(tool => tool.id !== disabled.id).every(tool => tool.allowed)).toBe(true)
})

it('migrates an old empty grant list to default allow and preserves an old partial selection', async () => {
  const service = await create()
  const toolsJson = JSON.stringify([
    { id: 'one', name: 'One', description: 'One', method: 'GET', path: '/one', inputSchema: { type: 'object', properties: {} } },
    { id: 'two', name: 'Two', description: 'Two', method: 'GET', path: '/two', inputSchema: { type: 'object', properties: {} } }
  ])
  await mutate(service, { type: 'save-connection', draft: { ...emptyConnectionDraft(), name: '旧连接一', url: 'https://one.example.com', toolsJson } })
  await mutate(service, { type: 'save-connection', draft: { ...emptyConnectionDraft(), name: '旧连接二', url: 'https://two.example.com', toolsJson } })
  const before = service.store.snapshot()
  const first = Object.values(before.connections).find(connection => connection.name === '旧连接一')!
  const second = Object.values(before.connections).find(connection => connection.name === '旧连接二')!
  const selected = Object.values(before.tools).find(tool => tool.connectionId === second.id)!.id
  await service.store.change(state => {
    state.connections[first.id]!.toolGrants = []
    state.connections[second.id]!.toolGrants = [selected]
    delete state.connections[first.id]!.deniedToolIds
    delete state.connections[second.id]!.deniedToolIds
  })
  await service.dispose()
  const restored = await IntegrationService.open({ root: service.store.root, encryption, getOwnerId: () => 'owner', approveWrite: async () => true })
  services.push(restored)
  const state = restored.store.snapshot()
  expect(state.connections[first.id]!.toolGrants).toHaveLength(2)
  expect(state.connections[first.id]!.deniedToolIds).toEqual([])
  expect(state.connections[second.id]!.toolGrants).toEqual([selected])
  expect(state.connections[second.id]!.deniedToolIds).toHaveLength(1)
})

it('installs a real market skill and preserves independent copies for two accounts', async () => {
  let owner = 'one'; const service = await create(() => owner, true)
  const market = await service.request({ type: 'market', kind: 'skill' }); if (market.type !== 'market') throw Error('Wrong market')
  const entry = market.entries[0]!
  const first = await mutate(service, { type: 'install', entryId: entry.id })
  const firstSkill = await row(service)
  expect(firstSkill.tab).toBe('skills')
  const content = await service.readSkill({ id: firstSkill.id, revision: firstSkill.revision, context: { sessionId: 's', rootSessionId: 's', workspaceId: 'w', ownerAccountId: owner, runtimeEpoch: service.runtimeEpoch, unattended: false } })
  expect(content.content).toContain('验收摘要')
  owner = 'two'; service.rotateIdentity()
  await expect(service.request({ type: 'operation', id: first.id })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  await mutate(service, { type: 'install', entryId: entry.id })
  const secondSkill = await row(service)
  expect(firstSkill.id).not.toBe(secondSkill.id)
  await mutate(service, { type: 'set-enabled', kind: 'skill', id: secondSkill.id, enabled: false }, secondSkill.revision)
  expect(service.store.snapshot().skills[firstSkill.id]!.enabled).toBe(true)
})

it('returns editable market blueprints without silently installing example endpoints', async () => {
  const service = await create()
  const market = await service.request({ type: 'market', kind: 'tool' }); if (market.type !== 'market') throw Error('Wrong market')
  expect(market.entries.find(entry => entry.blueprint?.type === 'api')?.blueprint?.url).toBe('')
  const reply = await service.request({ type: 'install', entryId: market.entries[0]!.id, meta: { requestId: 'invalid-install', expectedRevision: 0 } })
  if (reply.type !== 'operation') throw Error('Wrong reply'); await service.operations.wait(reply.operation.id)
  expect(await service.request({ type: 'operation', id: reply.operation.id })).toMatchObject({ operation: { status: 'failed' } })
  expect(Object.keys(service.store.snapshot().connections)).toHaveLength(0)
})

it('reconnects an approved real STDIO MCP after service restart before invoking it', async () => {
  const service = await create()
  await mutate(service, { type: 'save-connection', draft: { ...emptyConnectionDraft('mcp-stdio'), name: 'MCP 实测', command: process.execPath, args: JSON.stringify([resolve('test/fixtures/integrations/mcp-stdio.mjs'), 'restart']) } })
  let connection = await row(service)
  await service.request({ type: 'probe', id: connection.id })
  connection = await row(service)
  const toolId = connection.tools!.find(tool => tool.name === 'echo')!.id
  await mutate(service, { type: 'grant-tools', id: connection.id, toolIds: [toolId] }, connection.revision)
  connection = await row(service)
  await service.mcp.disposeAll()
  const result = await service.execute({ callId: randomUUID(), toolId, connectionRevision: connection.revision, arguments: { message: 'after restart' }, context: { sessionId: 's', rootSessionId: 's', workspaceId: 'w', ownerAccountId: 'owner', runtimeEpoch: service.runtimeEpoch, unattended: false } }, new AbortController().signal)
  expect(result.isError).not.toBe(true)
  expect(result.content[0]!.text).toContain('after restart')
})

it('removes superseded plugin skills and rolls back only to a verified installed version', async () => {
  const service = await create()
  const manifest = (version: string, ids: string[]) => ({ schemaVersion: 1, id: 'local.versioned', name: 'Versioned', description: 'Versioned package', version, permissions: [], skills: ids.map(id => ({ id, name: id, description: `Skill ${id}`, files: { 'SKILL.md': `---\nname: ${id}\ndescription: Skill ${id}\n---\n\n${id}` } })) })
  await mutate(service, { type: 'create-plugin', manifest: JSON.stringify(manifest('1.0.0', ['alpha', 'beta'])) })
  await mutate(service, { type: 'create-plugin', manifest: JSON.stringify(manifest('1.1.0', ['alpha'])) })
  expect(service.runtimeSnapshot().skills.map(skill => skill.name)).toEqual(['alpha'])
  const plugin = (await row(service))
  expect(plugin.canRollback).toBe(true)
  await mutate(service, { type: 'rollback-plugin', id: plugin.id }, plugin.revision)
  expect(service.runtimeSnapshot().skills.map(skill => skill.name).sort()).toEqual(['alpha', 'beta'])
  const restored = await row(service)
  expect(restored.detail).toContain('1.0.0')
})

it('does not return delayed adapter results after identity and epoch revocation', async () => {
  const service = await create()
  await mutate(service, { type: 'save-connection', draft: { ...emptyConnectionDraft(), name: 'Delayed', url: 'https://example.com', toolsJson: JSON.stringify([{ id: 'read', name: 'Read', description: 'Read', method: 'GET', path: '/read', inputSchema: { type: 'object', properties: {} } }]) } })
  let connection = await row(service)
  await mutate(service, { type: 'grant-tools', id: connection.id, toolIds: [connection.tools![0]!.id] }, connection.revision)
  connection = await row(service)
  let release!: () => void, started!: () => void
  const gate = new Promise<void>(done => { release = done }), began = new Promise<void>(done => { started = done })
  service.api.invoke = async () => { started(); await gate; return { content: [{ type: 'text', text: 'old-account-data' }] } }
  const request = service.execute({ callId: 'delayed', toolId: connection.tools![0]!.id, connectionRevision: connection.revision, arguments: {}, context: { sessionId: 's', rootSessionId: 's', workspaceId: 'w', ownerAccountId: 'owner', runtimeEpoch: service.runtimeEpoch, unattended: false } }, new AbortController().signal)
  await began; service.rotateIdentity(); release()
  await expect(request).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  expect(service.store.snapshot().calls.at(-1)?.status).toBe('failed')
})

it('removes market-skill package ownership so the same skill can be reinstalled', async () => {
  const service = await create(undefined, true)
  await mutate(service, { type: 'install', entryId: 'bundled:test-skill' })
  const skill = await row(service)
  await mutate(service, { type: 'uninstall', kind: 'skill', id: skill.id }, skill.revision)
  expect(Object.keys(service.store.snapshot().plugins)).toHaveLength(0)
  const market = await service.request({ type: 'market', kind: 'skill' })
  expect(market.type === 'market' && market.entries.find(entry => entry.id === 'bundled:test-skill')?.installed).toBe(false)
  await mutate(service, { type: 'install', entryId: 'bundled:test-skill' })
  expect((await row(service)).name).toBe('市场测试技能')
})
