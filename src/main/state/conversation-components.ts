import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { canonicalConversationComponentInput, normalizeConversationComponentArtifact } from '../../../packages/dsh-research-task-runtime/conversation-component-contract.js';
import type { ConversationComponentCreateArguments, ConversationComponentCreateReceipt, ConversationComponentExecutionIdentity, ConversationComponentProvenance, ConversationComponentTarget, ConversationComponentView, ConversationNativeSpecUpdate, JsonObject } from '../../../packages/dsh-research-task-runtime/conversation-component-contract.js';
import { financialWidgetSpec } from '../../../packages/dsh-research-task-runtime/financial-widget-contract.js';
import { parseResearchContainerSpec } from '../../../packages/dsh-research-task-runtime/artifact-validator.js';
const MAX_STORE = 64 * 1024 * 1024, MAX_OBSERVATION = 1024 * 1024;
const clone = <T>(value: T): T => structuredClone(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value);
const object = (value: unknown): value is Record<string, any> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
export type ConversationNativeObservation = {
    specRevision: number;
    querySignature: string;
    receivedAt: number;
    sourceNames: string[];
    dataAsOf?: string;
    result: JsonObject;
};
type Item = {
    id: string;
    ownerAccountId: string;
    sessionId: string;
    turnId: string;
    requestId: string;
    fingerprint: string;
    windowGeneration: string;
    authorityId?: string;
    authoritySeq?: number;
    revision: number;
    node: JsonObject;
    readableText: string;
    provenance: ConversationComponentProvenance;
    createdAt: number;
    updatedAt: number;
    observations: Record<string, ConversationNativeObservation>;
};
type Guard = () => boolean;
const noGuard = () => true;
const assertCurrent = (guard: Guard) => { if (!guard())
    throw Error('对话组件宿主身份已失效或操作已取消。'); };
function validProvenance(p: unknown): p is ConversationComponentProvenance { return object(p) && Array.isArray(p.sourceNames) && p.sourceNames.length <= 200 && p.sourceNames.every((s: unknown) => typeof s === 'string' && s.length <= 1000) && ['native-observed', 'provided', 'unspecified'].includes(p.sourceState) && ['native', 'snapshot'].includes(p.refreshKind) && (p.fetchedAt === undefined || timestamp(p.fetchedAt)) && (p.dataAsOf === undefined || typeof p.dataAsOf === 'string' && p.dataAsOf.length <= 2048) && Object.keys(p).every(k => ['sourceNames', 'sourceState', 'refreshKind', 'fetchedAt', 'dataAsOf'].includes(k)); }
function publicView(item: Item): ConversationComponentView { return clone({ id: item.id, sessionId: item.sessionId, revision: item.revision, node: item.node, provenance: item.provenance, createdAt: item.createdAt, updatedAt: item.updatedAt }); }
function receipt(item: Item): ConversationComponentCreateReceipt { return { status: 'succeeded', effect: { kind: 'conversation-component', state: 'saved', componentId: item.id }, data: { renderManifest: { version: 1, kind: 'conversation-component', componentId: item.id, sessionId: item.sessionId, turnId: item.turnId, requestId: item.requestId, status: 'ready' } }, message: '对话组件已保存。' }; }
function observation(result: JsonObject, revision: number, signature: string): ConversationNativeObservation | null {
    if (Buffer.byteLength(JSON.stringify(result)) > MAX_OBSERVATION)
        throw Error('金融组件观察数据超过 1 MiB，无法保存。');
    // receivedAt and source come only from the existing trusted native service.
    const receivedAt = typeof result.receivedAt === 'string' ? Date.parse(result.receivedAt) : NaN;
    const rows = Array.isArray(result.quotes) ? result.quotes.filter(object) : [];
    const useful = rows.length > 0 || Array.isArray(result.bars) && result.bars.length > 0 || !result.error && (Array.isArray(result.news) || Array.isArray(result.announcements));
    if (!useful || !timestamp(receivedAt))
        return null;
    const sourceNames = [...new Set([result.source, ...rows.map(row => row.source)].filter((s): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= 1000))];
    if (!sourceNames.length)
        return null;
    const lastBar = Array.isArray(result.bars) ? result.bars.at(-1) : undefined;
    const dataAsOf = [...rows.map(row => row.quotedAt || row.asOf), result.asOf, object(lastBar) ? (lastBar as Record<string, unknown>).date : undefined].find(v => typeof v === 'string' && v.length > 0 && v.length <= 2048);
    return { specRevision: revision, querySignature: signature, receivedAt, sourceNames, ...(dataAsOf ? { dataAsOf } : {}), result: clone(result) };
}
/** Independent, owner-scoped conversation instances. No canvas state is read or written. */
export class ConversationComponentStore {
    private items: Item[] = [];
    private queue: Promise<unknown> = Promise.resolve();
    private loaded = false;
    private failure: Error | undefined;
    constructor(private readonly file: string) { }
    async load(): Promise<void> {
        try {
            let text: string;
            try {
                const info = await stat(this.file);
                if (info.size > MAX_STORE)
                    throw Error('对话组件文件超过 64 MiB');
                text = await readFile(this.file, 'utf8');
            }
            catch (e: any) {
                if (e.code === 'ENOENT') {
                    this.items = [];
                    this.loaded = true;
                    this.failure = undefined;
                    return;
                }
                throw e;
            }
            const state = JSON.parse(text), ids = new Set<string>(), keys = new Set<string>(), counts = new Map<string, number>();
            if (!object(state) || state.version !== 1 || !Array.isArray(state.items) || state.items.length > 1024 || Object.keys(state).some(k => !['version', 'items'].includes(k)))
                throw Error('对话组件存储结构无效');
            for (const value of state.items) {
                if (!object(value) || Object.keys(value).some(k => !['id', 'ownerAccountId', 'sessionId', 'turnId', 'requestId', 'fingerprint', 'windowGeneration', 'authorityId', 'authoritySeq', 'revision', 'node', 'readableText', 'provenance', 'createdAt', 'updatedAt', 'observations'].includes(k)) || !['id', 'ownerAccountId', 'sessionId', 'turnId', 'requestId', 'windowGeneration'].every(k => id(value[k])) || typeof value.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(value.fingerprint) || !Number.isSafeInteger(value.revision) || value.revision < 1 || !timestamp(value.createdAt) || !timestamp(value.updatedAt) || value.authorityId !== undefined && !id(value.authorityId) || value.authoritySeq !== undefined && (!Number.isSafeInteger(value.authoritySeq) || value.authoritySeq < 0) || typeof value.readableText !== 'string' || Buffer.byteLength(value.readableText) > 1024 * 1024 || !validProvenance(value.provenance) || !object(value.node) || value.node.id !== value.id || value.node.kind !== 'generated-container' || value.node.x !== 0 || value.node.y !== 0 || value.node.generationStatus !== 'completed' || !parseResearchContainerSpec(value.node.containerSpec) || !object(value.observations))
                    throw Error('对话组件条目无效');
                const nodeType = value.node.containerSpec.type;
                if (Object.keys(value.node).some(k => !['id', 'kind', 'x', 'y', 'width', 'height', 'title', 'containerSpec', 'generationStatus', 'refreshMinutes'].includes(k)) || ![value.node.width, value.node.height].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 1e6) || typeof value.node.title !== 'string' || !value.node.title.trim() || value.node.title.length > 120 || value.node.refreshMinutes !== 0)
                    throw Error('对话组件节点结构无效');
                if (!['financial-widget', 'chart', 'table', 'kpi', 'markdown', 'html', 'mind-map', 'summary'].includes(nodeType))
                    throw Error('对话组件类型无效');
                for (const [action, o] of Object.entries(value.observations))
                    if (!['quotes', 'history', 'news', 'announcements'].includes(action) || !object(o) || o.specRevision !== value.revision || typeof o.querySignature !== 'string' || !timestamp(o.receivedAt) || !Array.isArray(o.sourceNames) || !o.sourceNames.every((s: unknown) => typeof s === 'string') || !object(o.result) || Buffer.byteLength(JSON.stringify(o)) > MAX_OBSERVATION + 8192)
                        throw Error('对话组件观察记录无效');
                const key = JSON.stringify([value.ownerAccountId, value.sessionId, value.turnId, value.requestId]), session = JSON.stringify([value.ownerAccountId, value.sessionId]);
                if (ids.has(value.id) || keys.has(key) || (counts.get(session) ?? 0) >= 128)
                    throw Error('对话组件身份重复或超过 128 项');
                ids.add(value.id);
                keys.add(key);
                counts.set(session, (counts.get(session) ?? 0) + 1);
            }
            this.items = state.items;
            this.loaded = true;
            this.failure = undefined;
        }
        catch (e) {
            this.failure = Error(`对话组件读取失败，原文件已保留：${e instanceof Error ? e.message : '无效数据'}`);
            throw this.failure;
        }
    }
    private ready() { if (this.failure)
        throw this.failure; if (!this.loaded)
        throw Error('对话组件存储尚未读取。'); }
    private find(owner: string, target: ConversationComponentTarget, items = this.items): Item { this.ready(); const item = items.find(i => i.ownerAccountId === owner && i.sessionId === target.sessionId && i.id === target.componentId); if (!item)
        throw Error('对话组件不存在或无权访问。'); return item; }
    read(owner: string, target: ConversationComponentTarget): ConversationComponentView { return publicView(this.find(owner, target)); }
    details(owner: string, target: ConversationComponentTarget): Readonly<Item> { return clone(this.find(owner, target)); }
    private mutate<T>(operation: (items: Item[]) => T, guard: Guard = noGuard): Promise<T> {
        const run = this.queue.catch(() => { }).then(async () => { this.ready(); assertCurrent(guard); const items = clone(this.items), result = operation(items), text = JSON.stringify({ version: 1, items }) + '\n'; if (Buffer.byteLength(text) > MAX_STORE)
            throw Error('对话组件存储超过 64 MiB，原有组件已保留。'); assertCurrent(guard); if (text === JSON.stringify({ version: 1, items: this.items }) + '\n')
            return clone(result); await mkdir(dirname(this.file), { recursive: true, mode: 0o700 }); const temporary = this.file + '.' + randomUUID() + '.tmp'; try {
            await writeFile(temporary, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
            assertCurrent(guard);
            await rename(temporary, this.file);
            this.items = items;
            return clone(result);
        }
        finally {
            await rm(temporary, { force: true }).catch(() => { });
        } });
        this.queue = run;
        return run;
    }
    create(args: ConversationComponentCreateArguments, identity: ConversationComponentExecutionIdentity, requestId: string, guard: Guard = () => identity.current()): Promise<ConversationComponentCreateReceipt> {
        return this.mutate(items => {
            if (identity.mode !== 'conversation' || !['ownerAccountId', 'sessionId', 'turnId', 'windowGeneration'].every(k => id((identity as any)[k])) || !id(requestId) || identity.authorityId !== undefined && !id(identity.authorityId) || identity.authoritySeq !== undefined && (!Number.isSafeInteger(identity.authoritySeq) || identity.authoritySeq < 0))
                throw Error('对话组件真实宿主身份无效。');
            const canonical = canonicalConversationComponentInput(args), fingerprint = createHash('sha256').update(canonical).digest('hex'), old = items.find(i => i.ownerAccountId === identity.ownerAccountId && i.sessionId === identity.sessionId && i.turnId === identity.turnId && i.requestId === requestId);
            if (old) {
                if (old.fingerprint !== fingerprint)
                    throw Error('同一对话组件请求内容冲突。');
                return receipt(old);
            }
            if (items.length >= 1024)
                throw Error('对话组件总量已达 1024 项。');
            if (items.filter(i => i.ownerAccountId === identity.ownerAccountId && i.sessionId === identity.sessionId).length >= 128)
                throw Error('单会话对话组件已达 128 项。');
            const normalized = normalizeConversationComponentArtifact(args), componentId = randomUUID(), now = Date.now(), item: Item = { id: componentId, ownerAccountId: identity.ownerAccountId, sessionId: identity.sessionId, turnId: identity.turnId, requestId, fingerprint, windowGeneration: identity.windowGeneration, ...(identity.authorityId ? { authorityId: identity.authorityId } : {}), ...(identity.authoritySeq !== undefined ? { authoritySeq: identity.authoritySeq } : {}), revision: 1, node: { id: componentId, kind: 'generated-container', x: 0, y: 0, width: normalized.preferredSize.width, height: normalized.preferredSize.height, title: normalized.title, containerSpec: normalized.containerSpec, generationStatus: 'completed', refreshMinutes: 0 }, readableText: normalized.readableText, provenance: normalized.provenance, createdAt: now, updatedAt: now, observations: {} };
            items.push(item);
            return receipt(item);
        }, guard);
    }
    updateNativeSpec(owner: string, input: ConversationNativeSpecUpdate, guard: Guard = noGuard): Promise<ConversationComponentView> {
        return this.mutate(items => { const item = this.find(owner, input, items), old = financialWidgetSpec(item.node.containerSpec), next = financialWidgetSpec(input.spec); if (!old || !next || old.widget !== next.widget || next.linkedSourceId !== undefined || next.linkedWatchlistId !== undefined)
            throw Error('只能更新同类型的独立金融组件配置。'); if (item.revision !== input.expectedRevision)
            throw Error('对话组件版本已变化，请重新读取。'); if (canonicalConversationComponentInput({ artifact: old as unknown as JsonObject }) === canonicalConversationComponentInput({ artifact: next as unknown as JsonObject }))
            return publicView(item); item.node = { ...item.node, containerSpec: clone(next) as unknown as JsonObject }; item.revision++; item.updatedAt = Date.now(); item.observations = {}; item.provenance = { sourceNames: [], sourceState: 'unspecified', refreshKind: 'native' }; return publicView(item); }, guard);
    }
    observe(owner: string, target: ConversationComponentTarget, revision: number, query: JsonObject, result: JsonObject, guard: Guard = noGuard): Promise<boolean> {
        return this.mutate(items => { const item = this.find(owner, target, items); if (item.revision !== revision)
            return false; const action = query.action; if (typeof action !== 'string' || !['quotes', 'history', 'news', 'announcements'].includes(action))
            throw Error('金融观察类型无效。'); const entry = observation(result, revision, JSON.stringify(query)); if (!entry)
            return false; const old = item.observations[action]; if (old && old.receivedAt > entry.receivedAt)
            return false; item.observations[action] = entry; const all = Object.values(item.observations).filter(o => o.specRevision === revision), latest = all.reduce((a, b) => a.receivedAt >= b.receivedAt ? a : b); item.provenance = { sourceNames: [...new Set(all.flatMap(o => o.sourceNames))], sourceState: 'native-observed', refreshKind: 'native', fetchedAt: latest.receivedAt, ...(latest.dataAsOf ? { dataAsOf: latest.dataAsOf } : {}) }; return true; }, guard);
    }
}
