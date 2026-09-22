import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { SkillImportManager } from '../src/main/integrations/skill-import'
import { LegacySkillMigration, legacySkillRoots } from '../src/main/integrations/legacy-skills'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ework-legacy-migration-')); roots.push(root)
  const legacy = join(root, 'legacy'), bundled = join(root, 'bundled')
  for (const directory of [join(legacy, 'report'), join(bundled, 'built-in')]) {
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'SKILL.md'), '---\nname: 研究报告\ndescription: 旧技能\n---\n保留旧正文。')
  }
  const manager = new SkillImportManager(join(root, 'managed'), { ownerAccountId: 'owner' })
  const migration = new LegacySkillMigration({ root: join(root, 'migration'), ownerAccountId: 'owner', manager, roots: [{ path: legacy, kind: 'personal' }, { path: bundled, kind: 'bundled' }] })
  return { root, legacy, bundled, manager, migration }
}
it('uses the same default project/user/bundled roots as the installed filesystem provider', () => {
  const roots = legacySkillRoots({ userDataRoot: '/app-data', agentsHome: '/agents-home', workspaceRoots: ['/project'], bundledSkillDirectory: '/bundled', customRoots: ['/custom'] })
  expect(roots.map(root => root.path)).toEqual(['/app-data/harness/skills', '/agents-home/skills', '/project/.dsh/skills', '/project/.agents/skills', '/custom', '/bundled'])
  expect(roots.find(root => root.path === '/bundled')?.kind).toBe('bundled')
})
it('migrates once into managed copies and preserves original/bundled files', async () => {
  const { legacy, bundled, migration } = await fixture()
  const original = await readFile(join(legacy, 'report/SKILL.md'), 'utf8')
  const register = vi.fn(async () => undefined)
  const first = await migration.migrateOnce(register)
  expect(first.status).toBe('complete')
  expect(first.items.map(item => item.status).sort()).toEqual(['compatibility', 'migrated'])
  expect(register).toHaveBeenCalledOnce()
  const again = await migration.migrateOnce(register)
  expect(again).toEqual(first)
  expect(register).toHaveBeenCalledOnce()
  expect(await readFile(join(legacy, 'report/SKILL.md'), 'utf8')).toBe(original)
  expect(await readFile(join(bundled, 'built-in/SKILL.md'), 'utf8')).toContain('保留旧正文')
})
it('reports flat markdown and symlinks without following them or silently importing adjacent files', async () => {
  const { root, legacy, migration } = await fixture()
  await writeFile(join(legacy, 'flat.md'), 'flat skill')
  await symlink(root, join(legacy, 'escape'))
  const preview = await migration.preview()
  expect(preview.items.find(item => item.sourcePath.endsWith('flat.md'))?.status).toBe('compatibility')
  expect(preview.items.find(item => item.sourcePath.endsWith('escape'))?.status).toBe('skipped')
})
it('rolls back the managed copy when registering metadata fails and retries without touching old files', async () => {
  const { legacy, manager, migration } = await fixture()
  const failed = await migration.migrateOnce(async () => { throw new Error('metadata failed') })
  expect(failed.status).toBe('partial')
  expect((await manager.previewSkillImport(join(legacy, 'report'))).conflicts).toEqual([])
  const register = vi.fn(async () => undefined)
  expect((await migration.migrateOnce(register)).status).toBe('complete')
  expect(register).toHaveBeenCalledOnce()
})
it('identifies the blocked resource and a safe recovery path without weakening import limits', async () => {
  const { legacy, migration } = await fixture()
  await mkdir(join(legacy, 'report/assets'))
  await writeFile(join(legacy, 'report/assets/template.pptx'), Buffer.alloc(2 * 1024 * 1024 + 1))
  const item = (await migration.preview()).items.find(item => item.name === 'report')!
  expect(item).toMatchObject({ status: 'failed', sourcePath: join(legacy, 'report'), diagnostic: { code: 'FILE_TOO_LARGE', resourcePath: 'assets/template.pptx', actual: 2097153, limit: 2097152, unit: 'bytes' } })
  expect(item.diagnostic?.guidance).toContain('不要删除')
  expect(item.message).toContain('原方式')
})
it('explains installed dependency symlinks without following or removing them', async () => {
  const { legacy, migration } = await fixture()
  await mkdir(join(legacy, 'report/node_modules/.bin'), { recursive: true })
  await symlink('../../outside', join(legacy, 'report/node_modules/.bin/tool'))
  const item = (await migration.preview()).items.find(item => item.name === 'report')!
  expect(item.diagnostic).toMatchObject({ code: 'UNSAFE_PATH', resourcePath: 'node_modules/.bin/tool' })
  expect(item.diagnostic?.guidance).toContain('依赖')
  expect(item.diagnostic?.guidance).toContain('完整')
})
it('keeps bundled management explicit and scans new sources after an earlier completed migration', async () => {
  const { legacy, migration } = await fixture()
  const register = vi.fn(async () => undefined)
  const first = await migration.migrateOnce(register)
  expect(first.items.find(item => item.kind === 'bundled')?.message).toContain('内置管理')
  await mkdir(join(legacy, 'added'))
  await writeFile(join(legacy, 'added/SKILL.md'), '---\nname: added\ndescription: added\n---\nNew skill.')
  const second = await migration.migrateOnce(register)
  expect(second.items.find(item => item.name === 'added')?.status).toBe('migrated')
  expect(register).toHaveBeenCalledTimes(2)
})
