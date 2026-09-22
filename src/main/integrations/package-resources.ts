import { lstat, realpath, rm } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { IntegrationError, type PluginInstall, type SkillInstall } from '../../shared/integrations';
export async function assertManagedPackagePath(root: string, path: string): Promise<string> {
    const base = await realpath(root), candidate = resolve(path), rel = relative(base, candidate);
    if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(base, rel) !== candidate)
        throw new IntegrationError('ACCESS_DENIED', '资源路径不属于托管安装目录');
    const info = await lstat(candidate);
    if (info.isSymbolicLink() || !info.isDirectory() || await realpath(candidate) !== candidate)
        throw new IntegrationError('ACCESS_DENIED', '托管资源路径发生变化');
    return candidate;
}
export async function removePackageResources(root: string, plugin: PluginInstall, skills: SkillInstall[]): Promise<void> {
    const paths = new Set([plugin.packageRoot, ...skills.map(skill => skill.resourceRoot)]);
    if (plugin.previousVersion) {
        paths.add(plugin.previousVersion.plugin.packageRoot);
        for (const skill of plugin.previousVersion.skills)
            paths.add(skill.resourceRoot);
    }
    for (const path of paths) {
        try {
            await rm(await assertManagedPackagePath(root, path), { recursive: true });
        }
        catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
                throw error;
        }
    }
}
