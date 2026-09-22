import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { parseDocument } from 'yaml';
import { IntegrationError } from '../../shared/integrations';
export type DeclarativeSkill = {
    id: string;
    name: string;
    description: string;
    files: Record<string, string>;
    connectionRequirements: string[];
};
export type DeclarativeManifest = {
    schemaVersion: 1;
    id: string;
    name: string;
    description: string;
    version: string;
    skills: DeclarativeSkill[];
    connectionRequirements: string[];
    permissions: string[];
    toolBindings: string[];
};
export const MANIFEST_LIMITS = { maxFiles: 1000, maxFileBytes: 2 * 1024 * 1024, maxPackageBytes: 50 * 1024 * 1024 } as const;
const invalid = (message: string): never => { throw new IntegrationError('INVALID_CONFIG', message); };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, label: string, max = 2000): string => { if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value))
    invalid(`${label}无效`); return value as string; };
const fields = (value: Record<string, unknown>, allowed: string[]) => { for (const key of Object.keys(value))
    if (!allowed.includes(key))
        invalid(`不支持的清单字段：${key}。只允许声明式能力，不运行安装脚本。`); };
const strings = (value: unknown, label: string, max = 100): string[] => { if (value === undefined)
    return []; if (!Array.isArray(value) || value.length > max)
    invalid(`${label}必须是列表`); return [...new Set((value as unknown[]).map(item => text(item, label, 256)))]; };
export function safePackagePath(path: string): string[] {
    if (!path || isAbsolute(path) || path.includes('\\') || path.includes(':') || /[\u0000-\u001f]/u.test(path))
        invalid('资源必须使用安全的相对路径');
    const parts = path.split('/');
    if (parts.length > 32 || parts.some(part => !part || part === '.' || part === '..' || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(part)))
        invalid('资源路径不能跨越目录或包含系统保留名称');
    return parts;
}
export function compareVersions(left: string, right: string): number {
    const parse = (value: string) => {
        const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*))?$/u.exec(value);
        if (!match)
            invalid('版本必须使用 major.minor.patch 格式');
        const core = match!.slice(1, 4).map(Number), pre = match![4]?.split('.');
        if (core.some(part => !Number.isSafeInteger(part)) || pre?.some(part => /^0\d+$/u.test(part)))
            invalid('版本数字无效');
        return { core, pre };
    };
    const a = parse(left), b = parse(right);
    for (let i = 0; i < 3; i++)
        if (a.core[i] !== b.core[i])
            return a.core[i]! > b.core[i]! ? 1 : -1;
    if (!a.pre || !b.pre)
        return a.pre ? -1 : b.pre ? 1 : 0;
    for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
        const x = a.pre[i], y = b.pre[i];
        if (x === y)
            continue;
        if (x === undefined)
            return -1;
        if (y === undefined)
            return 1;
        const nx = /^\d+$/u.test(x), ny = /^\d+$/u.test(y);
        if (nx && ny)
            return BigInt(x) > BigInt(y) ? 1 : -1;
        if (nx !== ny)
            return nx ? -1 : 1;
        return x > y ? 1 : -1;
    }
    return 0;
}
export function canonicalManifestJson(value: unknown): string {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return `[${value.map(canonicalManifestJson).join(',')}]`;
    return `{${Object.keys(value as object).sort().map(key => `${JSON.stringify(key)}:${canonicalManifestJson((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export function manifestDigest(value: unknown): string { return createHash('sha256').update(canonicalManifestJson(value)).digest('hex'); }
export function validateManifest(input: unknown): DeclarativeManifest {
    if (!record(input))
        invalid('插件清单必须是 JSON 对象');
    const data = input as Record<string, unknown>;
    fields(data, ['schemaVersion', 'id', 'name', 'description', 'version', 'skills', 'connectionRequirements', 'permissions', 'toolBindings']);
    if (data.schemaVersion !== 1)
        invalid('不支持此清单版本');
    const id = text(data.id, '插件 ID', 120);
    if (!/^[a-z0-9][a-z0-9._-]*$/u.test(id))
        invalid('插件 ID 只能使用小写字母、数字、点、下划线和连字符');
    const version = text(data.version, '版本', 64);
    compareVersions(version, version);
    if (!Array.isArray(data.skills) || data.skills.length > 100)
        invalid('skills 必须是最多 100 项的列表');
    let total = 0, count = 0;
    const ids = new Set<string>();
    const requirements = strings(data.connectionRequirements, '连接依赖');
    const skills = (data.skills as unknown[]).map((item): DeclarativeSkill => {
        if (!record(item))
            invalid('技能定义必须是对象');
        const skill = item as Record<string, unknown>;
        fields(skill, ['id', 'name', 'description', 'files', 'connectionRequirements']);
        const skillId = text(skill.id, '技能 ID', 100);
        if (!/^[a-z0-9][a-z0-9._-]*$/u.test(skillId) || ids.has(skillId))
            invalid('技能 ID 无效或重复');
        ids.add(skillId);
        const name = text(skill.name, '技能名称', 100), description = text(skill.description, '技能说明');
        if (!record(skill.files))
            invalid('技能 files 必须是相对路径到 UTF-8 文本的映射');
        const files: Record<string, string> = Object.create(null), paths = new Set<string>();
        for (const [path, content] of Object.entries(skill.files as Record<string, unknown>)) {
            safePackagePath(path);
            const normalized = path.normalize('NFC').toLowerCase();
            if (paths.has(normalized))
                invalid('技能文件名在大小写不敏感文件系统中冲突');
            paths.add(normalized);
            if (typeof content !== 'string')
                invalid('首版声明式技能资源只接受 UTF-8 文本');
            const bytes = Buffer.byteLength(content as string);
            total += bytes;
            count++;
            if (bytes > MANIFEST_LIMITS.maxFileBytes || total > MANIFEST_LIMITS.maxPackageBytes || count > MANIFEST_LIMITS.maxFiles)
                invalid('技能资源超过大小或文件数量限制');
            files[path] = content as string;
        }
        const main = files['SKILL.md'];
        if (!main)
            invalid('每个技能都必须包含 SKILL.md');
        const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]+)$/u.exec(main!);
        if (!front || !front[2]!.trim())
            invalid('SKILL.md 必须包含名称、说明和非空正文');
        let metadata: unknown;
        try {
            const parsed = parseDocument(front![1]!, { schema: 'core', uniqueKeys: true });
            if (parsed.errors.length || parsed.warnings.length)
                invalid('技能元信息无效');
            metadata = parsed.toJS({ maxAliasCount: 20 });
        }
        catch {
            invalid('无法解析技能元信息');
        }
        if (!record(metadata) || metadata.name !== name || metadata.description !== description)
            invalid('SKILL.md 的名称和说明必须与清单一致');
        return { id: skillId, name, description, files, connectionRequirements: [...new Set([...requirements, ...strings(skill.connectionRequirements, '技能连接依赖')])] };
    });
    const toolBindings = strings(data.toolBindings, '工具引用');
    if (!skills.length && !toolBindings.length)
        invalid('插件必须至少包含一个技能或工具引用');
    return { schemaVersion: 1, id, name: text(data.name, '插件名称', 120), description: text(data.description, '插件说明'), version, skills, connectionRequirements: requirements, permissions: strings(data.permissions, '权限说明'), toolBindings };
}
