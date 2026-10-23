import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { IntegrationError, type SkillInstall } from '../../shared/integrations';
import { assertManagedPackagePath } from './package-resources';
import { readSkillResource } from './skill-import';

const slugs = ['efund-ppt-maker', 'ework-workbench-components', 'ework-free-data-sources', 'ework-finance-analysis', 'ework-equity-research'] as const;
export const BUNDLED_PPT_SKILL_ID = 'builtin:efund-ppt-maker';
export const BUNDLED_COMPONENT_SKILL_ID = 'builtin:ework-workbench-components';
export const BUNDLED_FREE_DATA_SKILL_ID = 'builtin:ework-free-data-sources';
export const BUNDLED_FINANCE_SKILL_ID = 'builtin:ework-finance-analysis';
export const BUNDLED_EQUITY_RESEARCH_SKILL_ID = 'builtin:ework-equity-research';
export const isBundledSkillId = (id: string): boolean => slugs.some(slug => id === `builtin:${slug}`);
export interface BundledSkill {
    readonly skill: SkillInstall;
    readonly bundleRoot: string;
    readonly metadataDigest: string;
}
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const invalid = () => new IntegrationError('INVALID_CONFIG', '客户端内置技能的元信息无效');

async function trustedRoot(path: string): Promise<string> {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new IntegrationError('ACCESS_DENIED', '内置技能目录不是可信的客户端资源目录');
    return realpath(path);
}

/** Only the client-owned package is projected; user/import metadata cannot create locked entries. */
export async function loadBundledSkills(directory?: string): Promise<BundledSkill[]> {
    if (!directory) return [];
    let bundleRoot: string;
    try {
        bundleRoot = await trustedRoot(directory);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
    }
    const skills: BundledSkill[] = [];
    for (const slug of slugs) {
        try {
            await lstat(join(bundleRoot, slug));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
            throw error;
        }
        const resourceRoot = await assertManagedPackagePath(bundleRoot, join(bundleRoot, slug));
        const content = await readSkillResource(resourceRoot, 'SKILL.md');
        const metadataBytes = await readSkillResource(resourceRoot, '_meta.json');
        let metadata: Record<string, unknown>, description: string;
        try {
            const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(metadataBytes));
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
            metadata = value as Record<string, unknown>;
            if (metadata.slug !== slug || metadata.source !== 'eSkill' || typeof metadata.cnName !== 'string'
                || !metadata.cnName.trim() || metadata.cnName.length > 100 || /[\u0000-\u001f]/u.test(metadata.cnName)
                || typeof metadata.version !== 'string' || !/^v?\d+\.\d+\.\d+$/u.test(metadata.version)) throw invalid();
            const text = new TextDecoder('utf-8', { fatal: true }).decode(content);
            const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text)?.[1];
            if (!header) throw invalid();
            const document = parseDocument(header, { schema: 'core', uniqueKeys: true });
            if (document.errors.length || document.warnings.length) throw invalid();
            const frontmatter: unknown = document.toJS({ maxAliasCount: 20 });
            if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) throw invalid();
            const fields = frontmatter as Record<string, unknown>;
            if (fields.name !== slug || typeof fields.description !== 'string' || !fields.description.trim()
                || fields.description.length > 4000 || fields.description.includes('\0')) throw invalid();
            description = fields.description.trim();
        } catch { throw invalid(); }
        const metadataDigest = digest(metadataBytes), bodyDigest = digest(content);
        // Content-derived revisions are stable across restarts and change when the installed bundle changes.
        const revision = Number.parseInt(createHash('sha256').update(metadataDigest + bodyDigest).digest('hex').slice(0, 12), 16);
        const skill: SkillInstall = Object.freeze({ id: `builtin:${slug}`, name: metadata.cnName as string, description,
            provider: 'bundled', source: `EWork 内置 · ${metadata.version}`, sourceId: `bundled:${slug}`, version: metadata.version as string,
            enabled: true, revision, bodyDigest, resourceRoot, connectionRequirements: [], createdAt: 0 });
        skills.push({ skill, bundleRoot, metadataDigest });
    }
    return skills;
}

/** Revalidate fixed trusted paths and bytes before exposing preview or runtime content. */
export async function readBundledSkill(bundled: BundledSkill): Promise<string> {
    if (await trustedRoot(bundled.bundleRoot) !== bundled.bundleRoot) throw new IntegrationError('ACCESS_DENIED', '内置技能资源目录已变化');
    await assertManagedPackagePath(bundled.bundleRoot, bundled.skill.resourceRoot);
    const bytes = await readSkillResource(bundled.skill.resourceRoot, 'SKILL.md');
    const metadata = await readSkillResource(bundled.skill.resourceRoot, '_meta.json');
    if (digest(bytes) !== bundled.skill.bodyDigest || digest(metadata) !== bundled.metadataDigest)
        throw new IntegrationError('VERSION_CONFLICT', '内置技能已更新，请重启客户端后重试');
    return bytes.toString('utf8');
}
