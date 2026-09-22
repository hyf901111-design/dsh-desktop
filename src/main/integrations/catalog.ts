import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash, randomUUID, createPublicKey, verify } from 'node:crypto';
import { join } from 'node:path';
import { IntegrationError, type CatalogEntry, type CatalogKind, type CatalogSource } from '../../shared/integrations';
import { compareVersions, manifestDigest, validateManifest, canonicalManifestJson } from './manifest';
import { networkFetch } from './adapters/network-policy';
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const error = (message: string): never => { throw new IntegrationError('INVALID_CONFIG', message); };
interface CatalogPage { url: string; etag?: string; document: unknown }
interface CatalogCache {
    url: string;
    etag?: string;
    document: unknown;
    fetchedAt: number;
    pages?: CatalogPage[];
}
export interface CatalogOptions {
    bundledRoot: string;
    clientVersion: string;
    cacheRoot?: string;
    readCredential?: (ref: string) => Promise<string>;
}
export class IntegrationCatalog {
    private cache = new Map<string, CatalogCache>();
    constructor(private options: CatalogOptions) { }
    async list(kind: CatalogKind, sources: CatalogSource[]): Promise<CatalogEntry[]> {
        if (!['plugin', 'app', 'tool', 'skill'].includes(kind))
            error('目录分类无效');
        this.checkSources(sources);
        const bundled = this.parse(JSON.parse(await readFile(join(this.options.bundledRoot, 'catalog.json'), 'utf8')), 'bundled');
        const remote = await Promise.all(sources.map(async (source) => this.parse((await this.remote(source)).document, source.id)));
        return [...bundled, ...remote.flat()].filter(entry => entry.kind === kind);
    }
    async get(entryId: string, sources: CatalogSource[]): Promise<CatalogEntry> {
        this.checkSources(sources);
        const separator = entryId.indexOf(':');
        if (separator < 0)
            error('目录条目标识无效');
        const sourceId = entryId.slice(0, separator), source = sources.find(item => item.id === sourceId);
        const document = sourceId === 'bundled' ? JSON.parse(await readFile(join(this.options.bundledRoot, 'catalog.json'), 'utf8')) : source ? (await this.remote(source)).document : undefined;
        if (!document)
            throw new IntegrationError('NOT_FOUND', '找不到此目录来源');
        const entry = this.parse(document, sourceId).find(item => item.id === entryId);
        if (!entry)
            throw new IntegrationError('NOT_FOUND', '条目已从目录中移除，请刷新');
        return entry;
    }
    async validateSource(source: CatalogSource): Promise<void> { this.checkSources([source]); await this.remote(source, true); }
    private checkSources(sources: CatalogSource[]) {
        if (sources.length > 30)
            error('最多添加 30 个目录来源');
        const ids = new Set<string>();
        for (const source of sources) {
            if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u.test(source.id) || source.id === 'bundled' || ids.has(source.id))
                error('目录来源 ID 无效、重复或使用了保留名称');
            ids.add(source.id);
        }
    }
    private async remote(source: CatalogSource, force = false): Promise<CatalogCache> {
        if (!source.trusted) throw new IntegrationError('ACCESS_DENIED', '请先确认并信任此目录来源');
        let url: URL;
        try { url = new URL(source.url); } catch { throw new IntegrationError('NETWORK_BLOCKED', '目录地址无效'); }
        if (url.protocol !== 'https:' || url.username || url.password || url.hash)
            throw new IntegrationError('NETWORK_BLOCKED', '目录仅支持无内嵌凭据的 HTTPS 地址');
        const key = createHash('sha256').update(`${source.id}\0${source.url}`).digest('hex');
        let cached = this.cache.get(key);
        if (!cached && this.options.cacheRoot && !source.credentialRef) {
            try {
                const value = JSON.parse(await readFile(join(this.options.cacheRoot, `${key}.json`), 'utf8')) as CatalogCache;
                if (value.url === source.url) { this.verifyCached(source, value); cached = value; this.cache.set(key, value); }
            } catch { /* Invalid or unverifiable cache is ignored, never promoted as live data. */ }
        }
        if (cached) this.verifyCached(source, cached);
        if (!force && cached && Date.now() - cached.fetchedAt < 30000) return structuredClone(cached);
        const credential = source.credentialRef ? await this.options.readCredential?.(source.credentialRef) : undefined;
        if (source.credentialRef && !credential) throw new IntegrationError('AUTH_REQUIRED', '目录凭据不可用');
        const priorPages = cached?.pages ?? (cached ? [{ url: cached.url, etag: cached.etag, document: cached.document }] : []);
        const pages: CatalogPage[] = [], entries: unknown[] = [], seen = new Set<string>();
        let current = new URL(url), totalBytes = 0, catalogRevision: unknown;
        for (;;) {
            if (pages.length >= 25 || seen.has(current.href) || current.origin !== url.origin || current.pathname !== url.pathname)
                error('目录分页过多、重复或离开了当前来源');
            seen.add(current.href);
            const previous = priorPages.find(page => page.url === current.href);
            const headers: Record<string, string> = { Accept: 'application/json' };
            if (previous?.etag) headers['If-None-Match'] = previous.etag;
            if (credential) headers.Authorization = `Bearer ${credential}`;
            let response: Response;
            try { response = await networkFetch(current, { headers }, { allowedOrigins: [url.origin] }); }
            catch (cause) {
                // A failed later page can only return the complete old verified snapshot.
                if (cached && !force) return structuredClone(cached);
                throw cause;
            }
            let document: unknown;
            if (response.status === 304) {
                if (!previous) error('目录返回了没有对应缓存的 304');
                document = previous!.document;
            } else {
                if (!response.ok) throw new IntegrationError(response.status === 401 || response.status === 403 ? 'AUTH_REQUIRED' : 'INVALID_CONFIG', `目录读取失败（${response.status}）`);
                let content: string;
                try { content = await response.text(); } catch (cause) { if (cached && !force) return structuredClone(cached); throw cause; }
                totalBytes += Buffer.byteLength(content);
                if (totalBytes > 8 * 1024 * 1024) error('目录分页内容超过 8 MiB');
                try { document = JSON.parse(content); } catch { error('目录不是有效的 JSON'); }
            }
            this.verifySignature(source, document);
            this.parse(document, source.id);
            const page = document as { schemaVersion: number; entries: unknown[]; nextCursor?: unknown; catalogRevision?: unknown };
            if (pages.length === 0) catalogRevision = page.catalogRevision;
            else if (catalogRevision !== page.catalogRevision) error('目录在分页期间发生变化，请刷新重试');
            if (response.status === 304) totalBytes += Buffer.byteLength(JSON.stringify(document));
            entries.push(...page.entries);
            if (entries.length > 500 || totalBytes > 8 * 1024 * 1024) error('目录超过 500 项或 8 MiB，未保存不完整分页');
            pages.push({ url: current.href, etag: response.headers.get('etag') ?? previous?.etag, document });
            if (page.nextCursor === undefined || page.nextCursor === null) break;
            if (typeof page.nextCursor !== 'string' || !page.nextCursor || page.nextCursor.length > 2048) error('目录分页游标无效');
            // Only an opaque cursor is accepted. Never follow server-provided next URLs.
            current = new URL(url); current.searchParams.set('cursor', page.nextCursor as string);
        }
        const document = { schemaVersion: 1, entries };
        this.parse(document, source.id); // Also catches duplicate IDs spanning multiple pages.
        const next: CatalogCache = { url: source.url, etag: pages[0]?.etag, document, pages, fetchedAt: Date.now() };
        this.cache.set(key, next);
        if (this.options.cacheRoot && !source.credentialRef) {
            await mkdir(this.options.cacheRoot, { recursive: true, mode: 0o700 });
            const file = join(this.options.cacheRoot, `${key}.json`), temp = `${file}.${randomUUID()}.tmp`;
            await writeFile(temp, JSON.stringify(next), { mode: 0o600 }); await rename(temp, file);
        }
        return structuredClone(next);
    }
    private verifyCached(source: CatalogSource, cached: CatalogCache) {
        this.parse(cached.document, source.id);
        if (!cached.pages) { this.verifySignature(source, cached.document); return; }
        if (!Array.isArray(cached.pages) || !cached.pages.length || cached.pages.length > 25) error('目录缓存分页无效');
        const entries: unknown[] = []; let bytes = 0, expectedUrl = new URL(source.url).href;
        const seen = new Set<string>();
        for (const [index, page] of cached.pages.entries()) {
            if (page.url !== expectedUrl || seen.has(page.url)) error('目录缓存分页链无效');
            seen.add(page.url);
            this.verifySignature(source, page.document); this.parse(page.document, source.id);
            bytes += Buffer.byteLength(JSON.stringify(page.document));
            entries.push(...(page.document as { entries: unknown[] }).entries);
            const cursor = (page.document as { nextCursor?: unknown }).nextCursor;
            if (index === cached.pages.length - 1) { if (cursor !== undefined && cursor !== null) error('目录缓存缺少后续分页'); }
            else {
                if (typeof cursor !== 'string' || !cursor || cursor.length > 2048) error('目录缓存分页游标无效');
                const next = new URL(source.url); next.searchParams.set('cursor', cursor as string); expectedUrl = next.href;
            }
        }
        if (bytes > 8 * 1024 * 1024 || entries.length > 500 || canonicalManifestJson({ schemaVersion: 1, entries }) !== canonicalManifestJson(cached.document)) error('目录缓存汇总与已验证分页不一致');
    }
    private verifySignature(source: CatalogSource, document: unknown) {
        if (!source.publicKey)
            return;
        if (!record(document) || typeof document.signature !== 'string')
            error('签名目录缺少签名');
        const signed = document as Record<string, unknown>;
        try {
            const key = createPublicKey(source.publicKey);
            if (key.asymmetricKeyType !== 'ed25519')
                error('目录签名仅支持 Ed25519 公钥');
            const payload = canonicalManifestJson({ schemaVersion: signed.schemaVersion, entries: signed.entries });
            if (!verify(null, Buffer.from(payload), key, Buffer.from(signed.signature as string, 'base64')))
                error('目录签名校验失败');
        }
        catch (cause) {
            if (cause instanceof IntegrationError)
                throw cause;
            error('目录公钥或签名无效');
        }
    }
    private parse(input: unknown, sourceId: string): CatalogEntry[] {
        if (!record(input) || input.schemaVersion !== 1 || !Array.isArray(input.entries) || input.entries.length > 500)
            error('目录 schemaVersion 或 entries 无效');
        const data = input as {
            entries: unknown[];
        }, ids = new Set<string>();
        return data.entries.map(raw => {
            if (!record(raw))
                error('目录条目必须是对象');
            const item = raw as Record<string, unknown>;
            for (const field of ['id', 'name', 'description', 'publisher', 'version'])
                if (typeof item[field] !== 'string' || !(item[field] as string).trim() || (item[field] as string).length > 2000)
                    error(`目录字段 ${field} 无效`);
            const id = item.id as string;
            if (!/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(id) || ids.has(id))
                error('目录条目 ID 无效或重复');
            ids.add(id);
            if (!['plugin', 'app', 'tool', 'skill'].includes(item.kind as string))
                error('目录分类无效');
            if (item.category !== undefined && !['research', 'office', 'developer'].includes(String(item.category))) error('目录主题分类无效');
            const kind = item.kind as CatalogKind, version = item.version as string;
            compareVersions(version, version);
            if (!Array.isArray(item.permissions) || item.permissions.some(value => typeof value !== 'string' || value.length > 1000))
                error('权限说明必须是文本列表');
            if (!record(item.manifest))
                error('目录条目没有实际清单或连接方式');
            const manifest = item.manifest as Record<string, unknown>;
            if (kind === 'plugin' || kind === 'skill') {
                const validated = validateManifest(manifest);
                if (validated.version !== version)
                    error('目录版本与安装包版本不一致');
                if (typeof item.digest !== 'string' || item.digest !== manifestDigest(manifest))
                    error('目录安装包摘要不匹配');
            }
            else {
                const allowed = kind === 'app' ? ['notion', 'google-calendar'] : ['api', 'mcp-http', 'mcp-stdio'];
                if (!allowed.includes(String(manifest.type)))
                    error('目录连接方式尚不支持');
                for (const key of Object.keys(manifest))
                    if (!['type', 'name', 'url', 'clientId', 'command', 'args', 'cwd', 'authType', 'headerName', 'toolsJson'].includes(key))
                        error(`连接模板包含不支持的字段 ${key}`);
                for (const value of Object.values(manifest))
                    if (typeof value !== 'string')
                        error('连接模板值必须为字符串');
            }
            const min = typeof item.minClientVersion === 'string' ? item.minClientVersion : undefined;
            const available = !min || compareVersions(this.options.clientVersion, min) >= 0;
            return { id: `${sourceId}:${id}`, kind, category: item.category as CatalogEntry['category'], name: item.name as string, description: item.description as string, publisher: item.publisher as string, version, sourceId, manifest: structuredClone(manifest), permissions: [...item.permissions as string[]], available, ...(min ? { minClientVersion: min } : {}), ...(typeof item.digest === 'string' ? { digest: item.digest } : {}), ...(kind === 'app' ? { providerId: String(manifest.type) } : {}), ...(!available ? { unavailableReason: `需要 EWork ${min} 或更新版本` } : {}) };
        });
    }
}
