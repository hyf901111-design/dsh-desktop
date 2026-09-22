import { mkdtemp, readFile, rm, mkdir, symlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it } from 'vitest';
import { DeclarativeInstaller } from '../src/main/integrations/installer';
import { manifestDigest } from '../src/main/integrations/manifest';
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const manifest = (version = '1.0.0') => ({ schemaVersion: 1, id: 'team.research', name: '研究助手', description: '整理来源', version, skills: [{ id: 'report', name: '研究报告', description: '整理研究资料', files: { 'SKILL.md': '---\nname: 研究报告\ndescription: 整理研究资料\n---\n先核验来源，再撰写摘要。', 'references/style.md': '保留来源链接。' } }] });
async function fixture() { const root = await mkdtemp(join(tmpdir(), 'integration-install-')); roots.push(root); return { root, installer: new DeclarativeInstaller(root) }; }
it('installs actual skill resources and can compensate an uncommitted transaction', async () => {
    const { root, installer } = await fixture();
    const tx = await installer.stage(manifest(), { sourceId: 'team', owner: 'user', expectedDigest: manifestDigest(manifest()) });
    expect(await readFile(join(tx.skills[0]!.resourceRoot, 'SKILL.md'), 'utf8')).toContain('先核验来源');
    expect(tx.skills[0]!.resourceRoot.startsWith(join(await realpath(root), 'skills'))).toBe(true);
    expect(tx.skills[0]!.ownerPluginId).toBe(tx.plugin.id);
    await tx.rollback();
    await expect(readFile(join(tx.skills[0]!.resourceRoot, 'SKILL.md'))).rejects.toMatchObject({ code: 'ENOENT' });
});
it('retains previous version on update rollback and keeps stable skill IDs', async () => {
    const { installer } = await fixture();
    const first = await installer.stage(manifest(), { sourceId: 'team', owner: 'user' });
    await first.finalize();
    const second = await installer.stage(manifest('1.1.0'), { sourceId: 'team', owner: 'user', existing: first.plugin, existingSkills: first.skills });
    expect(second.plugin.id).toBe(first.plugin.id);
    expect(second.skills[0]!.id).toBe(first.skills[0]!.id);
    expect(second.skills[0]!.revision).toBe(first.skills[0]!.revision + 1);
    await second.rollback();
    expect(await readFile(join(first.skills[0]!.resourceRoot, 'SKILL.md'), 'utf8')).toContain('核验来源');
});
it('rejects unsafe files, executable install hooks, secrets and digest mismatch before promotion', async () => {
    const { installer } = await fixture();
    for (const invalid of [{ ...manifest(), scripts: { postinstall: 'touch /tmp/unsafe' } }, { ...manifest(), token: 'private-secret' }, { ...manifest(), skills: [{ ...manifest().skills[0], files: { '../escape': 'bad', 'SKILL.md': manifest().skills[0]!.files['SKILL.md'] } }] }])
        await expect(installer.stage(invalid, { sourceId: 'team', owner: 'user' })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await expect(installer.stage(manifest(), { sourceId: 'team', owner: 'user', expectedDigest: '0'.repeat(64) })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
});
it('refuses a managed skill directory symlink and refuses package downgrade', async () => {
    const { root, installer } = await fixture();
    const outside = await mkdtemp(join(tmpdir(), 'integration-outside-'));
    roots.push(outside);
    await mkdir(root, { recursive: true });
    await symlink(outside, join(root, 'skills'));
    await expect(installer.stage(manifest(), { sourceId: 'team', owner: 'user' })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
    await rm(join(root, 'skills'));
    const first = await installer.stage(manifest('2.0.0'), { sourceId: 'team', owner: 'user' });
    await first.finalize();
    await expect(installer.stage(manifest('1.0.0'), { sourceId: 'team', owner: 'user', existing: first.plugin, existingSkills: first.skills })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
});
it('rejects invalid metadata, file collisions and oversized resources before creating a package', async () => {
    const { installer } = await fixture();
    const skill = manifest().skills[0]!;
    for (const files of [
        { 'SKILL.md': '---\nname: other\ndescription: wrong\n---\nbody' },
        { ...skill.files, 'skill.md': skill.files['SKILL.md'] },
        { ...skill.files, 'too-large.txt': 'a'.repeat(2 * 1024 * 1024 + 1) },
        { ...skill.files, 'folder/NUL.txt': 'blocked' },
    ])
        await expect(installer.stage({ ...manifest(), skills: [{ ...skill, files }] }, { sourceId: 'team', owner: 'user' })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
});
it('does not allow a later rollback to delete a committed installation', async () => {
    const { installer } = await fixture();
    const tx = await installer.stage(manifest(), { sourceId: 'bundled', owner: 'bundled' });
    await tx.finalize();
    await expect(tx.rollback()).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    expect(tx.plugin.owner).toBe('bundled');
    expect(await readFile(join(tx.skills[0]!.resourceRoot, 'SKILL.md'), 'utf8')).toContain('核验来源');
});
it('distinguishes prerelease versions to reject a downgrade within the same patch', async () => {
    const { installer } = await fixture();
    const first = await installer.stage(manifest('1.0.0-rc.2'), { sourceId: 'team', owner: 'user' });
    await first.finalize();
    await expect(installer.stage(manifest('1.0.0-rc.1'), { sourceId: 'team', owner: 'user', existing: first.plugin })).rejects.toMatchObject({ code: 'INVALID_CONFIG' });
});
it('isolates the same catalog package across EWork accounts',async()=>{
 const {installer}=await fixture()
 const one=await installer.stage(manifest(),{sourceId:'bundled',owner:'user',ownerAccountId:'account-a'});await one.finalize()
 const two=await installer.stage(manifest(),{sourceId:'bundled',owner:'user',ownerAccountId:'account-b'});await two.finalize()
 expect(two.plugin.id).not.toBe(one.plugin.id)
 expect(two.skills[0]!.id).not.toBe(one.skills[0]!.id)
 expect(one.plugin.ownerAccountId).toBe('account-a')
 expect(two.skills[0]!.ownerAccountId).toBe('account-b')
})
