import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IntegrationService } from '../src/main/integrations/service'
import { registerIntegrationIpc } from '../src/main/integrations/ipc'
import * as resources from '../src/main/integrations/skill-import'
import { managedSkillInvocationName } from '../packages/dsh-integration-runtime/skill-policy.js'

const cleanups = []
afterEach(async () => { vi.restoreAllMocks(); for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }
const content = '---\nname: 中文资料核验\ndescription: 核验已提供的测试资料\n---\n\n# 核验步骤\n\n保留原始引用与日期。\n\n![外部图片](https://example.invalid/pixel)\n<script>notExecuted()</script>\n'
async function mutate(service, command, expectedRevision = service.store.snapshot().revision) {
  const reply = await service.request({ ...command, meta: { requestId: randomUUID(), expectedRevision } })
  expect(reply.type).toBe('operation')
  await service.operations.wait(reply.operation.id)
  expect(await service.request({ type: 'operation', id: reply.operation.id })).toMatchObject({ operation: { status: 'succeeded' } })
}
async function fixture(imported = false) {
  const root = await mkdtemp(join(tmpdir(), 'ework-skill-detail-'))
  let owner = 'account-one'
  const service = await IntegrationService.open({ root: join(root, 'registry'), encryption, getOwnerId: () => owner })
  cleanups.push(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }) })
  if (imported) {
    const source = join(root, 'original-skill'); await mkdir(source); await writeFile(join(source, 'SKILL.md'), content)
    const preview = await service.request({ type: 'preview-skill', path: source })
    await mutate(service, { type: 'import-skill', previewId: preview.preview.previewId, mode: 'copy' })
  } else {
    const manifest = { schemaVersion: 1, id: 'test.skill-detail', name: '详情预览测试', description: '隔离测试插件', version: '1.0.0', skills: [{ id: 'verify', name: '中文资料核验', description: '核验已提供的测试资料', files: { 'SKILL.md': content } }] }
    await mutate(service, { type: 'create-plugin', manifest: JSON.stringify(manifest) })
  }
  const skill = Object.values(service.store.snapshot().skills)[0]
  const detail = (overrides = {}) => service.request({ type: 'skill-detail', id: skill.id, revision: service.store.snapshot().skills[skill.id]?.revision ?? skill.revision, ...overrides })
  return { root, service, skill, detail, setOwner: value => { owner = value } }
}

describe('installed skill detail from actual managed resources', () => {
  it.each([false, true])('previews %s imported skill bytes without mutation and matches the runtime invocation alias', async imported => {
    const f = await fixture(imported), before = f.service.store.snapshot()
    const result = await f.detail()
    expect(result).toEqual({ type: 'skill-detail', id: f.skill.id, revision: f.skill.revision, content, invocationName: managedSkillInvocationName(f.skill), enabled: true })
    expect(await readFile(join(f.skill.resourceRoot, 'SKILL.md'), 'utf8')).toBe(result.content)
    expect(result).not.toHaveProperty('resourceRoot'); expect(result).not.toHaveProperty('directory')
    expect(f.service.store.snapshot()).toEqual(before)
    await mutate(f.service, { type: 'set-enabled', kind: 'skill', id: f.skill.id, enabled: false }, f.skill.revision)
    expect(await f.detail()).toMatchObject({ content, enabled: false, usable: false, invocationName: result.invocationName, unavailableReason: expect.stringContaining('技能已停用') })
  })

  it('previews a skill belonging to a disabled plugin but does not mark it usable', async () => {
    const f = await fixture(), plugin = f.service.store.snapshot().plugins[f.skill.ownerPluginId]
    await mutate(f.service, { type: 'set-enabled', kind: 'plugin', id: plugin.id, enabled: false }, plugin.revision)
    expect(await f.detail()).toMatchObject({ content, enabled: true, usable: false, unavailableReason: expect.stringContaining('所属插件') })
  })

  it('rejects stale versions, missing skills, cross-account access and anonymous access', async () => {
    const f = await fixture()
    await expect(f.detail({ revision: f.skill.revision + 1 })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
    await expect(f.detail({ id: 'missing-skill' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    f.setOwner('account-two'); await expect(f.detail()).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
    f.setOwner(undefined); await expect(f.detail()).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  })

  it('rejects arbitrary paths, invalid revisions and fields even when called outside IPC', async () => {
    const f = await fixture()
    for (const overrides of [{ path: '/tmp/SKILL.md' }, { resourceRoot: f.root }, { id: '../outside' }, { id: 'constructor' }, { revision: -1 }, { revision: 1.1 }, { revision: '1' }, { revision: Number.MAX_SAFE_INTEGER + 1 }]) {
      await expect(f.detail(overrides)).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
    }
    const outside = join(f.root, 'outside'); await mkdir(outside); await writeFile(join(outside, 'SKILL.md'), 'not-a-managed-resource')
    await f.service.store.change(state => { state.skills[f.skill.id].resourceRoot = outside })
    await expect(f.detail()).rejects.toMatchObject({ code: 'ACCESS_DENIED' })
  })

  it('does not follow a replaced SKILL.md symlink and can read large managed content', async () => {
    const f = await fixture(), path = join(f.skill.resourceRoot, 'SKILL.md'), outside = join(f.root, 'outside.md')
    await writeFile(outside, 'must-not-read'); await rm(path); await symlink(outside, path)
    await expect(f.detail()).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
    const content='x'.repeat(3*1024*1024)
    await rm(path); await writeFile(path,content)
    expect((await f.detail()).content).toBe(content)
    await rm(path); await expect(f.detail()).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
  })

  it.each(['owner', 'epoch', 'revision'])('rechecks %s after reading before returning content', async change => {
    const f = await fixture(), original = resources.readSkillResource
    let release, began
    const gate = new Promise(resolve => { release = resolve }), started = new Promise(resolve => { began = resolve })
    vi.spyOn(resources, 'readSkillResource').mockImplementation(async (...args) => { const bytes = await original(...args); began(); await gate; return bytes })
    const pending = f.detail(); await started
    if (change === 'owner') f.setOwner('account-two')
    if (change === 'epoch') f.service.rotateIdentity()
    if (change === 'revision') await f.service.store.change(state => { state.skills[f.skill.id].revision++ })
    release()
    await expect(pending).rejects.toMatchObject({ code: change === 'revision' ? 'VERSION_CONFLICT' : 'ACCESS_DENIED' })
  })

  it('permits only a trusted frame with the exact read-only detail command before dispatch', async () => {
    const callbacks = new Map(), dispatch = vi.fn(async command => ({ type: 'skill-detail', ...command }))
    const window = { isDestroyed: () => false, webContents: { mainFrame: { processId: 1, routingId: 2 } } }
    registerIntegrationIpc({ handle: (name, fn) => callbacks.set(name, fn) }, () => window, { request: dispatch })
    const fn = callbacks.get('integrations:request'), trusted = { sender: window.webContents, senderFrame: { processId: 1, routingId: 2 } }, valid = { type: 'skill-detail', id: 'installed/skill/verify', revision: 1 }
    await expect(fn({ ...trusted, senderFrame: { processId: 1, routingId: 3 } }, valid)).rejects.toThrow('main EWork')
    for (const invalid of [{ ...valid, revision: -1 }, { ...valid, path: '/tmp/SKILL.md' }, { ...valid, id: '../outside' }]) await expect(fn(trusted, invalid)).rejects.toMatchObject({ code: 'INVALID_CONFIG' })
    expect(dispatch).not.toHaveBeenCalled()
    await expect(fn(trusted, valid)).resolves.toMatchObject(valid)
    expect(dispatch).toHaveBeenCalledExactlyOnceWith(valid)
  })
})
