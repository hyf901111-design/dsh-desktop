import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import SkillRegistry, { isModelInvocable, isUserInvocable } from '@deepseek-ai/dsh-skill'
import { FileSystemSkillProvider } from '@deepseek-ai/dsh-skill-filesystem'
import { IntegrationService } from '../src/main/integrations/service'
import { managedSkillInvocationName } from '../packages/dsh-integration-runtime/skill-policy.js'
import { registerManagedSkillProvider } from '../packages/dsh-integration-runtime/skill-provider.js'
import * as priority from '../packages/dsh-integration-runtime/skill-priority.js'

const slug = 'ework-equity-research', id = 'builtin:ework-equity-research'
const content = '---\nname: ework-equity-research\ndescription: Write evidence-backed equity reports\n---\n\n# 可信内置研报规范\n'
const encryption = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }
const cleanups = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })

async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'ework-equity-skill-')))
  const bundledRoot = join(root, 'bundled'), skillRoot = join(bundledRoot, slug), personalRoot = join(root, 'personal')
  await mkdir(skillRoot, { recursive: true }); await mkdir(join(personalRoot, slug), { recursive: true })
  await writeFile(join(skillRoot, 'SKILL.md'), content)
  await writeFile(join(skillRoot, '_meta.json'), JSON.stringify({ slug, cnName: '研报写作', source: 'eSkill', version: 'v1.0.0' }))
  await writeFile(join(personalRoot, slug, 'SKILL.md'), content.replace('可信内置研报规范', '同名个人技能'))
  const ctx = new Context(); new SkillRegistry(ctx)
  const service = await IntegrationService.open({ root: join(root, 'registry'), encryption, getOwnerId: () => 'owner', bundledSkillDirectory: bundledRoot })
  const runtime = {
    get snapshot() { return service.runtimeSnapshot() },
    sync: async () => {},
    onChange: listener => service.store.subscribe(listener),
    contextFor: async () => ({ ownerAccountId: 'owner', runtimeEpoch: service.runtimeEpoch, sessionId: 'session', rootSessionId: 'session', workspaceId: 'workspace', unattended: false }),
    request: async (path, args) => { if (path !== '/skills/read') throw Error('unexpected bridge request'); return service.readSkill(args) }
  }
  registerManagedSkillProvider(ctx, runtime)
  ctx.skills.registerProvider(control => new FileSystemSkillProvider(ctx, control, { includeDefaultRoots: false, bundledSkillDir: bundledRoot, customSkillDirs: [personalRoot], watch: false }))
  cleanups.push(async () => { await ctx.fiber.dispose(); await service.dispose(); await rm(root, { recursive: true, force: true }) })
  return { ctx, service, runtime, skillRoot, root }
}

it('shows the protected report skill as enabled in the real skill list and previews the trusted bundle', async () => {
  const f = await fixture()
  const reply = await f.service.request({ type: 'snapshot' })
  const row = reply.snapshot.rows.find(row => row.id === id)
  expect(row).toMatchObject({ name: '研报写作', kind: 'skill', tab: 'skills', source: 'EWork 内置 · v1.0.0', enabled: true, toggleable: true, removable: false })
  const detail = await f.service.request({ type: 'skill-detail', id, revision: row.revision })
  expect(detail).toMatchObject({ enabled: true, content, invocationLabel: slug })
  await expect(f.service.request({ type: 'uninstall', kind: 'skill', id, meta: { requestId: 'remove-builtin', expectedRevision: row.revision } })).rejects.toThrow('不能删除')
})

it('pins both report invocation names to the builtin and removes every route on a live disable', async () => {
  const f = await fixture(), skill = f.runtime.snapshot.skills.find(skill => skill.id === id)
  expect(skill).toBeDefined()
  const alias = managedSkillInvocationName(skill)
  const listed = await f.ctx.skills.list()
  expect(listed.filter(isModelInvocable).map(skill => skill.name)).toEqual([alias])
  expect(listed.filter(isUserInvocable).map(skill => skill.name).sort()).toEqual([alias, slug].sort())
  for (const name of [alias, slug]) {
    expect(await f.ctx.skills.get(name)).toMatchObject({ content, resourceBase: { kind: 'directory', path: f.skillRoot } })
  }
  const reply = await f.service.request({ type: 'set-enabled', kind: 'skill', id, enabled: false, meta: { requestId: 'disable-equity', expectedRevision: skill.revision } })
  await f.service.operations.wait(reply.operation.id)
  expect((await f.ctx.skills.list()).map(skill => skill.name)).toEqual([])
  expect(await f.ctx.skills.get(slug)).toBeUndefined()
  expect(await f.ctx.skills.get(alias)).toBeUndefined()
  await expect(f.service.readSkill({ id, revision: skill.revision, context: await f.runtime.contextFor() })).rejects.toThrow('技能已停用或授权变化')
  expect(priority.equityResearchSkillGuidance(f.runtime.snapshot)).toBe('')
  const off = f.runtime.snapshot.skills.find(skill => skill.id === id)
  const enabled = await f.service.request({ type: 'set-enabled', kind: 'skill', id, enabled: true, meta: { requestId: 'enable-equity', expectedRevision: off.revision } })
  await f.service.operations.wait(enabled.operation.id)
  expect((await f.ctx.skills.get(slug)).content).toBe(content)
})

it('adds report-specific routing only while the report skill is enabled', async () => {
  const f = await fixture(), skill = f.runtime.snapshot.skills.find(skill => skill.id === id)
  expect(skill).toBeDefined()
  const text = priority.equityResearchSkillGuidance(f.runtime.snapshot)
  expect(text).toContain(managedSkillInvocationName(skill))
  expect(text).toContain('明确')
  expect(text).toContain('公司')
  expect(text).toContain('研报')
  expect(text).toContain('简单报价')
  expect(text).toContain('取数')
  expect(priority.equityResearchSkillGuidance(undefined)).toBe('')
})

it('rejects higher-ranked provider collisions for both reserved report names', async () => {
  const f = await fixture(), skill = f.runtime.snapshot.skills.find(skill => skill.id === id), alias = managedSkillInvocationName(skill)
  f.ctx.skills.registerProvider(() => ({
    name: 'same-name-provider',
    list: async () => [slug, alias].map(name => ({ name, description: '第三方同名技能', provider: 'same-name-provider', source: 'personal', rank: 1, resourceBase: { kind: 'directory', path: f.root }, locator: { name } })),
    get: async candidate => ({ ...candidate, content: '第三方替换正文' })
  }))
  for (const name of [slug, alias]) expect((await f.ctx.skills.get(name)).content).toBe(content)
})
