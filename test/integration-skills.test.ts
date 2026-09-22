import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { SkillImportManager, readSkillResource, listManagedSkillSourceIds, SKILL_IMPORT_LIMITS } from '../src/main/integrations/skill-import'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ework-skill-import-'))
  roots.push(root)
  const source = join(root, 'source')
  const managed = join(root, 'managed')
  await mkdir(source)
  await writeFile(join(source, 'SKILL.md'), '---\nname: 研究报告\ndescription: 保留来源的报告\ndependencies:\n  - connection/research\n---\n\n# 研究报告\n先查来源。\n')
  return { root, source, managed, manager: new SkillImportManager(managed) }
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

describe('safe managed skill imports', () => {
  it('isolates imported ids and resources by account and only removes the owning managed copy', async () => {
    const { source, managed } = await fixture()
    const alice = new SkillImportManager(managed, { ownerAccountId: 'alice' })
    const bob = new SkillImportManager(managed, { ownerAccountId: 'bob' })
    const first = await alice.commitSkillImport((await alice.previewSkillImport(source)).previewId, 'copy')
    const second = await bob.commitSkillImport((await bob.previewSkillImport(source)).previewId, 'copy')
    expect(first.id).not.toBe(second.id)
    await expect(bob.removeManagedSkill(first.id, { resourceRoot: first.installPath })).rejects.toMatchObject({ code: 'STORAGE_INVALID' })
    await alice.removeManagedSkill(first.id, { resourceRoot: first.installPath, sourceId: first.sourceId })
    await expect(stat(first.installPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(source, 'SKILL.md'), 'utf8')).toContain('先查来源')
    expect(await readFile(join(second.installPath, 'SKILL.md'), 'utf8')).toContain('先查来源')
    expect(await listManagedSkillSourceIds(managed)).toEqual([first.sourceId])
    await bob.removeManagedSkill(second.id, { resourceRoot: second.installPath })
    expect(await listManagedSkillSourceIds(managed)).toEqual([first.sourceId])
  })

  it('refuses to remove arbitrary source, built-in, or replaced resource paths', async () => {
    const { source, manager } = await fixture()
    const skill = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'copy')
    await expect(manager.removeManagedSkill(skill.id, { resourceRoot: source })).rejects.toMatchObject({ code: 'STORAGE_INVALID' })
    await expect(manager.removeManagedSkill('../source')).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
    expect(await readFile(join(skill.installPath, 'SKILL.md'), 'utf8')).toContain('先查来源')
  })
  it('previews a folder and resource files without executing scripts', async () => {
    const { source, root, managed, manager } = await fixture()
    await mkdir(join(source, 'scripts'))
    await writeFile(join(source, 'scripts', 'run.sh'), `#!/bin/sh\ntouch ${join(root, 'executed')}\n`)
    await chmod(join(source, 'scripts', 'run.sh'), 0o755)
    const preview = await manager.previewSkillImport(source)
    expect(preview.name).toBe('研究报告')
    expect(preview.dependencies).toEqual(['connection/research'])
    expect(preview.bodyPreview).toContain('先查来源')
    expect(preview.files.map(file => file.path)).toEqual(['SKILL.md', 'scripts/run.sh'])
    expect(preview.sourceDigest).toMatch(/^[a-f0-9]{64}$/)
    await expect(stat(join(root, 'executed'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(stat(managed)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('imports all resources from a selected SKILL.md with private, non-executable files', async () => {
    const { source, manager } = await fixture()
    await writeFile(join(source, 'references.txt'), 'trusted copy')
    const preview = await manager.previewSkillImport(join(source, 'SKILL.md'))
    const imported = await manager.commitSkillImport(preview.previewId, 'replace')
    expect(imported.version).toBe(1)
    expect(imported.sourceId).toBe(preview.sourceId)
    expect((await readSkillResource(imported.installPath, 'references.txt')).toString()).toBe('trusted copy')
    expect((await stat(join(imported.installPath, 'references.txt'))).mode & 0o777).toBe(0o600)
    await expect(manager.commitSkillImport(preview.previewId, 'replace')).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' })
  })

  it('replaces only the same stable source and preserves the previous immutable version', async () => {
    const { source, manager } = await fixture()
    const first = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'replace')
    const oldBody = await readFile(join(first.installPath, 'SKILL.md'), 'utf8')
    await writeFile(join(source, 'SKILL.md'), oldBody.replace('先查来源', '再次核实来源'))
    const preview = await manager.previewSkillImport(source)
    expect(preview.conflicts[0]).toMatchObject({ id: first.id, sameSource: true })
    const updated = await manager.commitSkillImport(preview.previewId, 'replace')
    expect(updated.id).toBe(first.id)
    expect(updated.version).toBe(2)
    expect(updated.previousVersionPath).toBe(first.installPath)
    expect(await readFile(join(first.installPath, 'SKILL.md'), 'utf8')).toBe(oldBody)
    expect(await readFile(join(updated.installPath, 'SKILL.md'), 'utf8')).toContain('再次核实来源')
  })

  it('does not overwrite another source with the same display name and supports copy', async () => {
    const { source, root, manager } = await fixture()
    const first = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'replace')
    const secondSource = join(root, 'another-source')
    await mkdir(secondSource)
    await writeFile(join(secondSource, 'SKILL.md'), await readFile(join(source, 'SKILL.md')))
    const preview = await manager.previewSkillImport(secondSource)
    expect(preview.conflicts).toEqual([expect.objectContaining({ id: first.id, sameSource: false })])
    await expect(manager.commitSkillImport(preview.previewId, 'replace')).rejects.toMatchObject({ code: 'SOURCE_CONFLICT' })
    const second = await manager.commitSkillImport(preview.previewId, 'copy')
    expect(second.id).not.toBe(first.id)
    expect(second.sourceId).not.toBe(first.sourceId)
    expect(await readFile(join(first.installPath, 'SKILL.md'), 'utf8')).toContain('先查来源')
  })

  it('rejects source changes after preview and leaves the current version untouched', async () => {
    const { source, manager } = await fixture()
    const imported = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'replace')
    const preview = await manager.previewSkillImport(source)
    await writeFile(join(source, 'new.txt'), 'not reviewed')
    await expect(manager.commitSkillImport(preview.previewId, 'replace')).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
    expect((await readdir(join(imported.installPath, '..'))).length).toBe(1)
  })

  it('compensates a failed service commit without removing the old working version', async () => {
    const { source, manager, managed } = await fixture()
    const first = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'replace')
    manager.finalizeSkillImport(first)
    await writeFile(join(source, 'resource.txt'), 'new version')
    const next = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'replace')
    await manager.rollbackSkillImport(next)
    await expect(stat(next.installPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readFile(join(first.installPath, 'SKILL.md'), 'utf8')).toContain('先查来源')
    const reopened = new SkillImportManager(managed)
    const preview = await reopened.previewSkillImport(source)
    expect(preview.conflicts[0]).toMatchObject({ version: first.version, digest: first.digest })
  })

  it('does not roll back over a newer successful import', async () => {
    const { source, manager } = await fixture()
    const first = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'replace')
    await writeFile(join(source, 'resource.txt'), 'newer')
    const next = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'replace')
    await expect(manager.rollbackSkillImport(first)).rejects.toMatchObject({ code: 'ROLLBACK_CONFLICT' })
    expect(await readFile(join(next.installPath, 'resource.txt'), 'utf8')).toBe('newer')
  })

  it('removes a new import on compensation and can import it again', async () => {
    const { source, manager } = await fixture()
    const first = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'copy')
    await manager.rollbackSkillImport(first)
    const preview = await manager.previewSkillImport(source)
    expect(preview.conflicts).toEqual([])
    expect((await manager.commitSkillImport(preview.previewId, 'replace')).version).toBe(1)
  })

  it('expires previews and ignores caller mutations to preview data', async () => {
    const { source, managed } = await fixture()
    let now = 10
    const manager = new SkillImportManager(managed, { now: () => now, previewTtlMs: 50 })
    const preview = await manager.previewSkillImport(source)
    preview.name = '../../escape'
    preview.files[0]!.path = '../../escape'
    const imported = await manager.commitSkillImport(preview.previewId, 'copy')
    expect(imported.name).toBe('研究报告')
    const expiring = await manager.previewSkillImport(source)
    now = 61
    await expect(manager.commitSkillImport(expiring.previewId, 'copy')).rejects.toMatchObject({ code: 'PREVIEW_EXPIRED' })
  })

  it('rejects a stale replacement preview after a concurrent install', async () => {
    const { source, manager } = await fixture()
    const left = await manager.previewSkillImport(source)
    const right = await manager.previewSkillImport(source)
    const results = await Promise.allSettled([
      manager.commitSkillImport(left.previewId, 'replace'),
      manager.commitSkillImport(right.previewId, 'replace')
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'PREVIEW_STALE' } })
  })

  it.each(['file', 'directory', 'root'])('rejects %s symlink escapes', async kind => {
    const { source, root, manager } = await fixture()
    const outside = join(root, 'outside')
    await mkdir(outside)
    await writeFile(join(outside, 'private.txt'), 'private')
    if (kind === 'root') {
      const link = join(root, 'source-link')
      await symlink(source, link)
      await expect(manager.previewSkillImport(link)).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
    } else {
      await symlink(kind === 'file' ? join(outside, 'private.txt') : outside, join(source, 'escape'))
      await expect(manager.previewSkillImport(source)).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
    }
  })

  it('enforces individual file limits before reading their contents', async () => {
    const { source, manager } = await fixture()
    await writeFile(join(source, 'large.bin'), Buffer.alloc(SKILL_IMPORT_LIMITS.maxFileBytes + 1))
    await expect(manager.previewSkillImport(source)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('enforces total package limits', async () => {
    const { source, manager } = await fixture()
    const bytes = Buffer.alloc(SKILL_IMPORT_LIMITS.maxFileBytes)
    await Promise.all(Array.from({ length: 26 }, (_, index) => writeFile(join(source, `resource-${index}.bin`), bytes)))
    await expect(manager.previewSkillImport(source)).rejects.toMatchObject({ code: 'PACKAGE_TOO_LARGE' })
  })

  it('enforces the maximum file count', async () => {
    const { source, manager } = await fixture()
    await Promise.all(Array.from({ length: SKILL_IMPORT_LIMITS.maxFiles }, (_, index) => writeFile(join(source, `resource-${index}.txt`), '')))
    await expect(manager.previewSkillImport(source)).rejects.toMatchObject({ code: 'TOO_MANY_FILES' })
  })

  it('rejects malformed front matter rather than accepting executable YAML tags', async () => {
    const { source, manager } = await fixture()
    await writeFile(join(source, 'SKILL.md'), '---\nname: !!js/function >\n  function () { return 1 }\ndescription: bad\n---\ncontent')
    await expect(manager.previewSkillImport(source)).rejects.toMatchObject({ code: 'INVALID_SKILL' })
  })

  it.each(['../secret', '/etc/passwd', 'C:\\secret', 'references/../../secret', 'references\\secret'])('rejects unsafe resource path %s', async resourcePath => {
    const { source, manager } = await fixture()
    const imported = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'copy')
    await expect(readSkillResource(imported.installPath, resourcePath)).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
  })

  it('rejects a managed resource symlink inserted after import', async () => {
    const { source, root, manager } = await fixture()
    const imported = await manager.commitSkillImport((await manager.previewSkillImport(source)).previewId, 'copy')
    await writeFile(join(root, 'private'), 'private')
    await symlink(join(root, 'private'), join(imported.installPath, 'private'))
    await expect(readSkillResource(imported.installPath, 'private')).rejects.toMatchObject({ code: 'UNSAFE_PATH' })
  })
})
