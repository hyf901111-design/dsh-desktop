import { afterEach, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { IntegrationService } from '../src/main/integrations/service'
import { DependencyIndex } from '../src/main/integrations/dependency-index'
import type { IntegrationCommand } from '../src/shared/integration-ui'
import type { IntegrationBinding, SkillInstall } from '../src/shared/integrations'

const roots: string[] = [], services: IntegrationService[] = []
const encryption = { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() }
afterEach(async () => { await Promise.all(services.splice(0).map(service => service.dispose())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const manifest = (version = '1.0.0') => ({ schemaVersion: 1, id: 'test.removal', name: '研究助手', description: '删除范围回归', version, permissions: [], skills: ['alpha', 'beta'].map(id => ({ id, name: id, description: `Skill ${id}`, files: { 'SKILL.md': `---\nname: ${id}\ndescription: Skill ${id}\n---\n\n${id} ${version}` } })) })
async function mutate(service: IntegrationService, command: object, revision = service.store.snapshot().revision, expected = 'succeeded') {
  const reply = await service.request({ ...command, meta: { requestId: randomUUID(), expectedRevision: revision } } as IntegrationCommand)
  if (reply.type !== 'operation') throw Error('Missing operation')
  await service.operations.wait(reply.operation.id)
  const result = await service.request({ type: 'operation', id: reply.operation.id })
  expect(result).toMatchObject({ type: 'operation', operation: { status: expected } })
  return result
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ework-skill-removal-')); roots.push(root)
  const source = join(root, 'original-plugin.json'); await writeFile(source, JSON.stringify(manifest()))
  const service = await IntegrationService.open({ root: join(root, 'registry'), encryption, getOwnerId: () => 'owner' }); services.push(service)
  await mutate(service, { type: 'create-plugin', manifest: await readFile(source, 'utf8') })
  const skills = service.runtimeSnapshot().skills, alpha = skills.find(skill => skill.name === 'alpha')!, beta = skills.find(skill => skill.name === 'beta')!
  return { root, source, service, alpha, beta, pluginId: alpha.ownerPluginId! }
}
const binding = (id: string, revision: number, kind: 'skill' | 'plugin' = 'skill'): IntegrationBinding => ({ entityId: id, kind, bindingRevision: revision, toolIds: [], schemaDigests: {}, allowWrite: false })
const readSkill = (service: IntegrationService, skill: SkillInstall) => service.readSkill({ id: skill.id, revision: skill.revision, context: { sessionId: 'session', rootSessionId: 'session', workspaceId: 'work', ownerAccountId: 'owner', runtimeEpoch: service.runtimeEpoch, unattended: false } })

it('deletes only a plugin skill, revokes dependent tasks and runtime reads, and leaves sibling and source intact', async () => {
  const { service, alpha, beta, source, pluginId } = await fixture(), dependencies = new DependencyIndex(service.store)
  const before = service.store.snapshot().plugins[pluginId]!
  await dependencies.syncBindings('uses-alpha', [binding(alpha.id, alpha.revision)])
  await dependencies.syncBindings('uses-plugin', [binding(pluginId, before.revision, 'plugin')])
  await dependencies.syncBindings('uses-beta', [binding(beta.id, beta.revision)])
  expect((await dependencies.impact(alpha.id)).declaredTaskIds).toEqual(['uses-alpha', 'uses-plugin'])
  const snapshot = await service.request({ type: 'snapshot' })
  expect(snapshot.type === 'snapshot' && snapshot.snapshot.rows.find(row => row.id === alpha.id)?.removable).toBe(true)
  await mutate(service, { type: 'uninstall', kind: 'skill', id: alpha.id }, alpha.revision)
  expect(service.runtimeSnapshot().skills.map(skill => skill.id)).toEqual([beta.id])
  const plugin = service.store.snapshot().plugins[pluginId]!
  expect(plugin).toMatchObject({ enabled: true, skillIds: [beta.id], excludedSkillIds: [alpha.id] })
  expect(plugin.revision).toBeGreaterThan(before.revision)
  await expect(readSkill(service, alpha)).rejects.toMatchObject({ code: 'NOT_FOUND' })
  expect((await readSkill(service, beta)).content).toContain('beta 1.0.0')
  await expect(readFile(join(alpha.resourceRoot, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(source, 'utf8')).toBe(JSON.stringify(manifest()))
  expect(await dependencies.preflight('uses-alpha')).toMatchObject({ ready: false, issues: [{ code: 'NOT_FOUND' }] })
  expect(await dependencies.preflight('uses-plugin')).toMatchObject({ ready: false, issues: [{ code: 'VERSION_CONFLICT' }] })
  expect(await dependencies.preflight('uses-beta')).toMatchObject({ ready: true })
})

it('keeps the deletion across restart, same-version refresh, update and both rollback directions', async () => {
  const { root, service, alpha, pluginId } = await fixture()
  await mutate(service, { type: 'create-plugin', manifest: JSON.stringify(manifest('1.1.0')) })
  const updated = service.runtimeSnapshot().skills.find(skill => skill.id === alpha.id)!
  await mutate(service, { type: 'uninstall', kind: 'skill', id: alpha.id }, updated.revision)
  await expect(readFile(join(alpha.resourceRoot, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(join(updated.resourceRoot, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' })
  await service.dispose()
  const reopened = await IntegrationService.open({ root: join(root, 'registry'), encryption, getOwnerId: () => 'owner' }); services.push(reopened)
  for (const version of ['1.1.0', '1.2.0']) await mutate(reopened, { type: 'create-plugin', manifest: JSON.stringify(manifest(version)) })
  for (let i = 0; i < 2; i++) {
    const current = reopened.store.snapshot().plugins[pluginId]!
    await mutate(reopened, { type: 'rollback-plugin', id: pluginId }, current.revision)
    expect(reopened.runtimeSnapshot().skills.map(skill => skill.name)).toEqual(['beta'])
    expect(reopened.store.snapshot().plugins[pluginId]!.excludedSkillIds).toEqual([alpha.id])
  }
})

it('restores default skills only after full plugin uninstall and reinstall without reviving old task grants', async () => {
  const { service, alpha, pluginId } = await fixture(), dependencies = new DependencyIndex(service.store)
  await dependencies.syncBindings('old-skill', [binding(alpha.id, alpha.revision)])
  await mutate(service, { type: 'uninstall', kind: 'skill', id: alpha.id }, alpha.revision)
  await mutate(service, { type: 'uninstall', kind: 'plugin', id: pluginId }, service.store.snapshot().plugins[pluginId]!.revision)
  await mutate(service, { type: 'create-plugin', manifest: JSON.stringify(manifest()) })
  expect(service.runtimeSnapshot().skills.map(skill => skill.name).sort()).toEqual(['alpha', 'beta'])
  expect(service.store.snapshot().plugins[pluginId]!.excludedSkillIds ?? []).toEqual([])
  expect(await dependencies.preflight('old-skill')).toMatchObject({ ready: false, issues: [{ code: 'VERSION_CONFLICT' }] })
  await expect(readSkill(service, alpha)).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
})

it('remains revoked if resource cleanup rejects a path belonging to another skill', async () => {
  const { service, alpha, beta, pluginId } = await fixture()
  await service.store.change(state => { state.skills[alpha.id]!.resourceRoot = beta.resourceRoot })
  await mutate(service, { type: 'uninstall', kind: 'skill', id: alpha.id }, alpha.revision, 'failed')
  expect(service.store.snapshot().plugins[pluginId]!.excludedSkillIds).toEqual([alpha.id])
  expect(service.runtimeSnapshot().skills.map(skill => skill.id)).toEqual([beta.id])
  expect((await readSkill(service, beta)).content).toContain('beta')
  await expect(readSkill(service, alpha)).rejects.toMatchObject({ code: 'NOT_FOUND' })
})

it('rejects an in-flight plugin update after a skill deletion changes package ownership metadata', async () => {
  const { service, alpha, beta } = await fixture()
  const original = service.installer.stage.bind(service.installer)
  let release!: () => void, staged!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), ready = new Promise<void>(resolve => { staged = resolve })
  service.installer.stage = async (...args: Parameters<typeof original>) => { const tx = await original(...args); staged(); await gate; return tx }
  const reply = await service.request({ type: 'create-plugin', manifest: JSON.stringify(manifest('1.1.0')), meta: { requestId: randomUUID(), expectedRevision: service.store.snapshot().revision } })
  if (reply.type !== 'operation') throw Error('Missing operation')
  await ready
  await mutate(service, { type: 'uninstall', kind: 'skill', id: alpha.id }, alpha.revision)
  release(); await service.operations.wait(reply.operation.id)
  expect(await service.request({ type: 'operation', id: reply.operation.id })).toMatchObject({ operation: { status: 'failed' } })
  expect(service.runtimeSnapshot().skills.map(skill => skill.id)).toEqual([beta.id])
  expect((await readSkill(service, beta)).content).toContain('beta 1.0.0')
})
