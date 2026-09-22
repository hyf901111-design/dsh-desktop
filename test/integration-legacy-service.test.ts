import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { IntegrationService } from '../src/main/integrations/service'

const cleanups: Array<() => Promise<void>> = []
afterEach(async () => { for (const close of cleanups.splice(0)) await close() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ework-legacy-service-')), source = join(root, 'legacy/report')
  await mkdir(source, { recursive: true })
  await writeFile(join(source, 'SKILL.md'), '---\nname: report\ndescription: report\n---\nOriginal skill.')
  const service = await IntegrationService.open({ root: join(root, 'registry'), getOwnerId: () => 'owner', encryption: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }, legacySkillRoots: [{ path: join(root, 'legacy'), kind: 'personal' }] })
  cleanups.push(async () => { await service.dispose(); await rm(root, { recursive: true, force: true }) })
  return { root, source, service }
}
it('keeps the source and structured diagnostic across the trusted UI boundary and explains manual import failures', async () => {
  const { source, service } = await fixture()
  await writeFile(join(source, 'template.pptx'), Buffer.alloc(2097153))
  expect(await service.request({ type: 'legacy-preview' })).toMatchObject({ type: 'legacy-preview', eligibleCount: 0, items: [{ sourcePath: source, kind: 'personal', status: 'failed', diagnostic: { code: 'FILE_TOO_LARGE', resourcePath: 'template.pptx', limit: 2097152, actual: 2097153 } }] })
  await expect(service.request({ type: 'preview-skill', path: join(source, 'SKILL.md') })).rejects.toMatchObject({ code: 'INVALID_CONFIG', message: expect.stringContaining('template.pptx') })
  await expect(service.request({ type: 'preview-skill', path: source })).rejects.toThrow('不要删除')
  expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toContain('Original skill.')
})
it('allows a later explicit migration pass to include a newly added source without duplicating earlier copies', async () => {
  const { root, service } = await fixture()
  await service.migrateLegacySkills()
  expect(service.runtimeSnapshot().skills).toHaveLength(1)
  const added = join(root, 'legacy/added'); await mkdir(added)
  await writeFile(join(added, 'SKILL.md'), '---\nname: added\ndescription: added\n---\nAdded skill.')
  await service.migrateLegacySkills()
  expect(service.runtimeSnapshot().skills.map(skill => skill.name).sort()).toEqual(['added', 'report'])
  expect(await service.request({ type: 'legacy-preview' })).toMatchObject({ eligibleCount: 0, items: [{ status: 'migrated' }, { status: 'migrated' }] })
})
