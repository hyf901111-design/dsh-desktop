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
