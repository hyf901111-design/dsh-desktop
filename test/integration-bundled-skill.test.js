import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { IntegrationService } from '../src/main/integrations/service'
import * as resources from '../src/main/integrations/skill-import'
import { managedSkillInvocationName } from '../packages/dsh-integration-runtime/skill-policy.js'

const cleanups = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }
const content = '---\nname: efund-ppt-maker\ndescription: 按真实模板制作演示文稿\n---\n\n# 1.1.1 成品要求\n\n使用 [模板](assets/template.pptx)。\n'
const metadata = { slug: 'efund-ppt-maker', cnName: 'PPT制作助手', version: 'v1.1.1', source: 'eSkill' }
const builtinId = 'builtin:efund-ppt-maker'
async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), 'ework-bundled-skill-')), bundledSkillDirectory = join(root, 'bundle'), skillRoot = join(bundledSkillDirectory, 'efund-ppt-maker')
  await mkdir(join(skillRoot, 'assets'), { recursive: true }); await writeFile(join(skillRoot, 'SKILL.md'), content)
  await writeFile(join(skillRoot, '_meta.json'), JSON.stringify(metadata)); await writeFile(join(skillRoot, 'assets/template.pptx'), 'fixture-template')
  let owner = 'account-one', service
  cleanups.push(async () => { await service?.dispose(); await rm(root, { recursive: true, force: true }) })
  await options.beforeOpen?.({ root, bundledSkillDirectory, skillRoot })
  service = await IntegrationService.open({ root: join(root, 'registry'), encryption, getOwnerId: () => owner, bundledSkillDirectory })
  const snapshot = async () => (await service.request({ type: 'snapshot' })).snapshot
  const row = (await snapshot()).rows.find(item => item.id === builtinId)
  const detail = (overrides = {}) => service.request({ type: 'skill-detail', id: builtinId, revision: row?.revision ?? 0, ...overrides })
  const context = () => ({ ownerAccountId: owner, runtimeEpoch: service.runtimeEpoch, sessionId: 'test-session', rootSessionId: 'test-session', workspaceId: 'test-workspace', unattended: false })
  return { root, bundledSkillDirectory, skillRoot, service, row, detail, snapshot, context, setOwner: value => { owner = value } }
}

describe('client-owned bundled PPT skill integration', () => {
  it('projects the actual v1.1.1 bundle into UI and runtime without persisting a managed copy', async () => {
    const f = await fixture(), stored = f.service.store.snapshot()
    expect(f.row).toMatchObject({ id: builtinId, kind: 'skill', tab: 'skills', name: 'PPT制作助手', description: '按真实模板制作演示文稿', enabled: true, toggleable: true, removable: false, source: 'EWork 内置 · v1.1.1' })
    expect(stored.skills).toEqual({})
    const skill = f.service.runtimeSnapshot().skills.find(item => item.id === builtinId)
    expect(skill).toMatchObject({ provider: 'bundled', version: 'v1.1.1', enabled: true, resourceRoot: await realpath(f.skillRoot), sourceId: 'bundled:efund-ppt-maker' })
    const detail = await f.detail()
    expect(detail).toEqual({ type: 'skill-detail', id: builtinId, revision: f.row.revision, content, invocationName: managedSkillInvocationName(skill), invocationLabel:'efund-ppt-maker', enabled: true })
    expect(await f.service.readSkill({ id: builtinId, revision: f.row.revision, context: f.context() })).toEqual({ name: 'PPT制作助手', description: f.row.description, content, directory: skill.resourceRoot })
    expect(f.service.store.snapshot()).toEqual(stored)
  })

  it('rejects uninstall mutations and leaves all bundle resources intact', async () => {
    const f = await fixture(), stored = f.service.store.snapshot()
    for (const command of [{ type: 'uninstall' }]) {
      await expect(f.service.request({ ...command, kind: 'skill', id: builtinId, meta: { requestId: randomUUID(), expectedRevision: f.row?.revision ?? 0 } })).rejects.toMatchObject({ code: 'ACCESS_DENIED', message: expect.stringContaining('内置技能') })
    }
    expect(f.service.store.snapshot()).toEqual(stored)
    expect(await readFile(join(f.skillRoot, 'SKILL.md'), 'utf8')).toBe(content)
    expect(await readFile(join(f.skillRoot, 'assets/template.pptx'), 'utf8')).toBe('fixture-template')
  })

  it('does not invent an installed entry when the actual bundle is absent', async () => {
    const f = await fixture({ beforeOpen: async ({ skillRoot }) => rm(skillRoot, { recursive: true }) })
    expect(f.row).toBeUndefined(); expect(f.service.runtimeSnapshot().skills).toEqual([])
    await expect(f.detail()).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a symlink masquerading as the bundled skill directory', async () => {
    await expect(fixture({ beforeOpen: async ({ root, skillRoot }) => { const other = join(root, 'other'); await mkdir(other); await rm(skillRoot, { recursive: true }); await symlink(other, skillRoot) } })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it.each(['SKILL.md', '_meta.json'])('rejects changed %s rather than claiming the cached version is current', async file => {
    const f = await fixture()
    expect(f.row).toBeDefined()
    await writeFile(join(f.skillRoot, file), file === 'SKILL.md' ? content + '\nChanged\n' : JSON.stringify({ ...metadata, version: 'v1.1.2' }))
    await expect(f.detail()).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(f.service.readSkill({ id: builtinId, revision: f.row.revision, context: f.context() })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })

  it('rechecks the package directory instead of following a replacement symlink', async () => {
    const f = await fixture(), other = join(f.root, 'replacement')
    await mkdir(other); await writeFile(join(other, 'SKILL.md'), 'outside-content')
    await rm(f.skillRoot, { recursive: true }); await symlink(other, f.skillRoot)
    await expect(f.detail()).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    await expect(f.service.readSkill({ id: builtinId, revision: f.row.revision, context: f.context() })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('uses stable revisions across restarts and changes the revision for changed bundle bytes', async () => {
    const f = await fixture()
    const open = async () => {
      const service = await IntegrationService.open({ root: join(f.root, 'registry'), encryption, getOwnerId: () => 'account-one', bundledSkillDirectory: f.bundledSkillDirectory })
      cleanups.push(() => service.dispose())
      return service
    }
    const same = await open()
    expect((await same.request({ type: 'snapshot' })).snapshot.rows[0].revision).toBe(f.row.revision)
    await writeFile(join(f.skillRoot, 'SKILL.md'), content + '\nNew package content\n')
    const updated = await open(), next = (await updated.request({ type: 'snapshot' })).snapshot.rows[0]
    expect(next.revision).not.toBe(f.row.revision)
    await expect(updated.request({ type: 'skill-detail', id: builtinId, revision: f.row.revision })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })

  it('loads the actual shipped PPT metadata and previews its layout-edit and full-authoring routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ework-real-bundled-ppt-')), bundledSkillDirectory = resolve('skills')
    const service = await IntegrationService.open({ root, encryption, getOwnerId: () => 'account-one', bundledSkillDirectory })
    cleanups.push(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }) })
    const row = (await service.request({ type: 'snapshot' })).snapshot.rows.find(item => item.id === builtinId)
    expect(row).toMatchObject({ name: 'PPT制作助手', source: 'EWork 内置 · v1.2.1', enabled: true, toggleable: true })
    const reply = await service.request({ type: 'skill-detail', id: row.id, revision: row.revision })
    expect(reply.content).toBe(await readFile(join(bundledSkillDirectory, 'efund-ppt-maker/SKILL.md'), 'utf8'))
    expect(reply.content).toContain('scripts/layout_edit.py')
    expect(reply.content).toContain('AUTHORING.md')
  })

  it('projects the shipped component skill as an client-owned v1.39.3 skill beside PPT', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ework-real-component-skill-')), bundledSkillDirectory = resolve('skills')
    const service = await IntegrationService.open({ root, encryption, getOwnerId: () => 'account-one', bundledSkillDirectory })
    cleanups.push(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }) })
    const rows = (await service.request({ type: 'snapshot' })).snapshot.rows
    expect(rows.find(item => item.id === builtinId)).toBeDefined()
    const id = 'builtin:ework-workbench-components', row = rows.find(item => item.id === id)
    expect(row).toMatchObject({ kind: 'skill', tab: 'skills', name: '工作台组件生成', source: 'EWork 内置 · v1.39.3', enabled: true, toggleable: true, removable: false })
    const skill = service.runtimeSnapshot().skills.find(item => item.id === id)
    expect(skill).toMatchObject({ provider: 'bundled', version: 'v1.39.3', enabled: true, sourceId: 'bundled:ework-workbench-components' })
    const reply = await service.request({ type: 'skill-detail', id, revision: row.revision })
    expect(reply.content).toBe(await readFile(join(bundledSkillDirectory, 'ework-workbench-components/SKILL.md'), 'utf8'))
    for (const command of [{ type: 'uninstall' }])
      await expect(service.request({ ...command, kind: 'skill', id, meta: { requestId: randomUUID(), expectedRevision: row.revision } })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('projects the shipped free data skill as an client-owned v1.0.8 skill beside PPT', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ework-real-free-data-skill-')), bundledSkillDirectory = resolve('skills')
    const service = await IntegrationService.open({ root, encryption, getOwnerId: () => 'account-one', bundledSkillDirectory })
    cleanups.push(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }) })
    const rows = (await service.request({ type: 'snapshot' })).snapshot.rows
    expect(rows.find(item => item.id === builtinId)).toBeDefined()
    const id = 'builtin:ework-free-data-sources', row = rows.find(item => item.id === id)
    expect(row).toMatchObject({ kind: 'skill', tab: 'skills', name: '基础数据源', source: 'EWork 内置 · v1.0.8', enabled: true, toggleable: true, removable: false })
    const skill = service.runtimeSnapshot().skills.find(item => item.id === id)
    expect(skill).toMatchObject({ provider: 'bundled', version: 'v1.0.8', enabled: true, sourceId: 'bundled:ework-free-data-sources' })
    const reply = await service.request({ type: 'skill-detail', id, revision: row.revision })
    expect(reply.content).toBe(await readFile(join(bundledSkillDirectory, 'ework-free-data-sources/SKILL.md'), 'utf8'))
    for (const command of [{ type: 'uninstall' }])
      await expect(service.request({ ...command, kind: 'skill', id, meta: { requestId: randomUUID(), expectedRevision: row.revision } })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('denies anonymous, stale revision and wrong-owner or epoch runtime reads', async () => {
    const f = await fixture(); expect(f.row).toBeDefined()
    await expect(f.detail({ revision: f.row.revision + 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    for (const context of [{ ...f.context(), ownerAccountId: 'another-account' }, { ...f.context(), runtimeEpoch: 'old-epoch' }])
      await expect(f.service.readSkill({ id: builtinId, revision: f.row.revision, context })).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    f.setOwner(undefined)
    expect((await f.snapshot()).rows).toEqual([])
    await expect(f.detail()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it.each(['owner', 'epoch'])('rechecks %s after reading bundled details', async changed => {
    const f = await fixture(); expect(f.row).toBeDefined()
    const original = resources.readSkillResource
    let began, release
    const started = new Promise(resolve => { began = resolve }), gate = new Promise(resolve => { release = resolve })
    vi.spyOn(resources, 'readSkillResource').mockImplementation(async (...args) => { const bytes = await original(...args); if (args[1] === 'SKILL.md') { began(); await gate } return bytes })
    const pending = f.detail(); await started
    if (changed === 'owner') f.setOwner('another-account')
    else f.service.rotateIdentity()
    release(); await expect(pending).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })
})
