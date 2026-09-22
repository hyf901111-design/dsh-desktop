import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, realpath, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { IntegrationError, type PluginInstall, type SkillInstall } from '../../shared/integrations';
import { compareVersions, manifestDigest, safePackagePath, validateManifest } from './manifest';
export type InstallOptions = {
    sourceId: string;
    ownerAccountId?: string;
    owner: 'bundled' | 'user';
    expectedDigest?: string;
    existing?: PluginInstall;
    existingSkills?: SkillInstall[];
};
export type InstallTransaction = {
    plugin: PluginInstall;
    skills: SkillInstall[];
    rollback(): Promise<void>;
    finalize(): Promise<void>;
};
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
async function directory(path: string) { await mkdir(path, { recursive: true, mode: 0o700 }); const info = await lstat(path); if (!info.isDirectory() || info.isSymbolicLink())
    throw new IntegrationError('INVALID_CONFIG', '托管安装目录不能是符号链接'); return realpath(path); }
async function write(path: string, content: string) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); const file = await open(path, 'wx', 0o600); try {
    await file.writeFile(content);
    await file.sync();
}
finally {
    await file.close();
} }
/** Promotes immutable package versions only. Metadata commit and runtime activation belong to IntegrationService. */
export class DeclarativeInstaller {
    constructor(private managedRoot: string) { }
    async stage(input: unknown, options: InstallOptions): Promise<InstallTransaction> {
        const manifest = validateManifest(input), digest = manifestDigest(input);
        if (options.expectedDigest && (!/^[a-f0-9]{64}$/u.test(options.expectedDigest) || options.expectedDigest !== digest))
            throw new IntegrationError('INVALID_CONFIG', '插件内容摘要与目录不一致，请刷新后重试');
        const id = `plugin-${hash(`${options.ownerAccountId ?? ''}\0${options.sourceId}\0${manifest.id}`).slice(0, 24)}`;
        const existing = options.existing;
        if (existing && (existing.id !== id || existing.sourceId !== options.sourceId || existing.packageId !== manifest.id))
            throw new IntegrationError('INVALID_CONFIG', '不能用其他来源覆盖已有插件');
        if (existing && compareVersions(manifest.version, existing.version) < 0)
            throw new IntegrationError('INVALID_CONFIG', '不能安装低于当前版本的插件；回退必须使用已保存版本');
        if (existing?.version === manifest.version && existing.digest !== digest)
            throw new IntegrationError('INVALID_CONFIG', '同一版本的内容已改变，来源必须发布新版本');
        const root = await directory(resolve(this.managedRoot)), skillsRoot = await directory(join(root, 'skills')), packagesRoot = await directory(join(root, 'packages'));
        const transactionId = randomUUID(), staging = join(root, `.install-staging-${transactionId}`), versionDirectory = `${manifest.version}-${digest.slice(0, 12)}-${transactionId.slice(0, 8)}`;
        await mkdir(staging, { mode: 0o700 });
        const promoted: string[] = [];
        const now = Date.now();
        const skills: SkillInstall[] = [];
        const packageHome = await directory(join(packagesRoot, id));
        const packageRoot = join(packageHome, versionDirectory);
        try {
            await mkdir(join(staging, 'package'), { mode: 0o700 });
            await write(join(staging, 'package', 'manifest.json'), JSON.stringify(input, null, 2));
            for (const skill of manifest.skills) {
                const skillId = `${id}/skill/${skill.id}`, previous = options.existingSkills?.find(item => item.id === skillId);
                const home = await directory(join(skillsRoot, `${id}-${skill.id}`)), resourceRoot = join(home, versionDirectory), source = join(staging, `skill-${skill.id}`);
                await mkdir(source, { mode: 0o700 });
                for (const [path, content] of Object.entries(skill.files))
                    await write(join(source, ...safePackagePath(path)), content);
                await rename(source, resourceRoot);
                promoted.push(resourceRoot);
                skills.push({ id: skillId, name: skill.name, description: skill.description, provider: 'managed-plugin', source: options.owner === 'bundled' ? 'EWork 内置' : '插件目录', sourceId: options.sourceId, ownerAccountId: options.ownerAccountId, version: manifest.version, ownerPluginId: id, enabled: previous?.enabled ?? true, revision: (previous?.revision ?? 0) + 1, bodyDigest: hash(skill.files['SKILL.md']!), resourceRoot, connectionRequirements: skill.connectionRequirements, createdAt: previous?.createdAt ?? now });
            }
            await rename(join(staging, 'package'), packageRoot);
            promoted.push(packageRoot);
            await rm(staging, { recursive: true, force: true });
        }
        catch (error) {
            await Promise.all(promoted.map(path => rm(path, { recursive: true, force: true })));
            await rm(staging, { recursive: true, force: true });
            throw error;
        }
        const plugin: PluginInstall = { id, packageId: manifest.id, name: manifest.name, description: manifest.description, sourceId: options.sourceId, ownerAccountId: options.ownerAccountId, version: manifest.version, digest, owner: existing?.owner ?? options.owner, enabled: existing?.enabled ?? true, skillIds: skills.map(skill => skill.id), toolBindings: manifest.toolBindings, installState: 'installed', revision: (existing?.revision ?? 0) + 1, packageRoot, createdAt: existing?.createdAt ?? now };
        let finalized = false, rolledBack = false;
        return { plugin, skills, async rollback() { if (finalized)
                throw new IntegrationError('VERSION_CONFLICT', '安装已经提交，不能使用未提交事务回滚'); if (rolledBack)
                return; await Promise.all(promoted.map(path => rm(path, { recursive: true, force: true }))); rolledBack = true; }, async finalize() { if (rolledBack)
                throw new IntegrationError('VERSION_CONFLICT', '安装已经回滚，不能再提交'); finalized = true; } };
    }
}
