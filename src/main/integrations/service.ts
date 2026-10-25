import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import type { IntegrationCommand, IntegrationReply, IntegrationRow, ConnectionDraft, UiOperation, LegacySkillPreviewItem, SkillDetail } from '../../shared/integration-ui';
import { emptyConnectionDraft, isSkillDetailCommand } from '../../shared/integration-ui';
import { IntegrationError, type Connection, type ConnectionConfig, type MutationMeta, type EntityKind, type ToolBinding, type ToolCall, type ToolResult, type CapabilityContext, type SkillInstall, type ApiOperation, type IntegrationState, type PluginInstall } from '../../shared/integrations';
import { IntegrationStore } from './store';
import { CredentialVault, type PlatformEncryption } from './vault';
import { OperationManager } from './operations';
import {skillEnglishName} from './skill-names';
import { SkillImportManager, readSkillResource, listManagedSkillSourceIds, skillImportErrorMessage } from './skill-import';
import { HttpApiAdapter } from './adapters/http-api';
import { compileOpenApi } from './adapters/openapi';
import { McpSupervisor } from './adapters/mcp';
import type { ProviderAdapter, ProviderTool } from './adapters/provider';
import { assertCapabilityAccess } from './policy';
import { normalizeMcpQueryArguments } from './query-arguments';
import { IntegrationCatalog } from './catalog';
import { DeclarativeInstaller } from './installer';
import { DependencyIndex } from './dependency-index';
import { projectTaskCapabilities } from './projection';
import { assertManagedPackagePath, removePackageResources, removeSkillPackageResources } from './package-resources';
import { manifestDigest, compareVersions } from './manifest';
import { LegacySkillMigration, type LegacySkillRoot } from './legacy-skills';
import { previewLegacyConnections, type LegacyConnectionSource } from './legacy-connections';
import { loadBundledSkills, readBundledSkill, isBundledSkillId, type BundledSkill } from './bundled-skills';
import datayesHistoricalTools from '../../../config/datayes-tools.json';
import {bundledDatayesConnection,bundledDatayesId,isBundledDatayesId,DATAYES_TOOLS,type BundledDatayesOptions} from './bundled-datayes';
export interface IntegrationServiceOptions {
    root: string;
    encryption: PlatformEncryption;
    getOwnerId(): string | undefined;
    bundledCatalogRoot?: string;
    bundledSkillDirectory?: string;
    clientVersion?: string;
    selectSkill?(): Promise<string | null>;
    resolveContext?(context: CapabilityContext): Promise<CapabilityContext>;
    approveWrite?(call: ToolCall, tool: ToolBinding, connection: Connection): Promise<boolean>;
    providers?: Record<string, ProviderAdapter>;
    legacySkillRoots?: LegacySkillRoot[];
    legacyConnectionSources?: LegacyConnectionSource[];
    bundledDatayes?: BundledDatayesOptions;
}
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value: unknown, max = 4000) => { if (typeof value !== 'string' || value.length > max || value.includes('\0'))
    throw new IntegrationError('INVALID_CONFIG', '字段格式无效'); return value.trim(); };
const id = (value: unknown) => { const v = text(value, 256); if (!/^[a-zA-Z0-9_.:-]+(?:\/[a-zA-Z0-9_.:-]+)*$/.test(v) || v.split('/').some(part => ['.', '..', '__proto__', 'constructor', 'prototype'].includes(part)))
    throw new IntegrationError('INVALID_CONFIG', '标识无效'); return v; };
const rowStatus = (c: Connection) => !c.enabled ? '已停用' : c.authState === 'revoked' ? '已断开' : c.authState === 'expired' ? '需要重新授权' : c.authState === 'authorizing' ? '正在授权' : c.health === 'healthy' ? '已连接' : c.health === 'unreachable' ? '连接失败' : c.health === 'checking' ? '正在测试' : c.authState === 'unconfigured' ? '待授权' : '尚未验证调用';
export class IntegrationService {
    readonly operations: OperationManager;
    readonly vault: CredentialVault;
    private skillManagers = new Map<string, SkillImportManager>();
    private managedSkillSources: string[] = [];
    private bundledSkills = new Map<string, BundledSkill>();
    get skills(): SkillImportManager { const owner = this.owner(); let manager = this.skillManagers.get(owner); if (!manager) {
        manager = new SkillImportManager(join(this.options.root, 'skills'), { ownerAccountId: owner });
        this.skillManagers.set(owner, manager);
    } return manager; }
    private async refreshSkillSources() { this.managedSkillSources = await listManagedSkillSourceIds(join(this.options.root, 'skills')); }
    readonly mcp: McpSupervisor;
    readonly api: HttpApiAdapter;
    readonly catalog: IntegrationCatalog;
    readonly installer: DeclarativeInstaller;
    readonly providers: Record<string, ProviderAdapter>;
    runtimeEpoch = randomUUID();
    private calls = new Map<string, Set<AbortController>>();
    private runtimeSeenAt = 0;
    private migrations = new Map<string, Promise<void>>();
    private compatibility = new Map<string, string>();
    private disposed = false;
    private bundledDatayesSync: Promise<void> = Promise.resolve();
    private constructor(readonly store: IntegrationStore, private options: IntegrationServiceOptions) {
        this.vault = new CredentialVault(join(options.root, 'vault'), options.encryption);
        this.operations = new OperationManager(store);
        this.mcp = new McpSupervisor(this.vault, options.bundledDatayes?.request);
        this.api = new HttpApiAdapter(this.vault);
        this.catalog = new IntegrationCatalog({ bundledRoot: options.bundledCatalogRoot ?? join(options.root, 'catalog'), clientVersion: options.clientVersion ?? '1.0.6', cacheRoot: join(options.root, 'catalog-cache'), readCredential: ref => this.vault.read(ref) });
        this.installer = new DeclarativeInstaller(join(options.root, 'packages'));
        this.providers = options.providers ?? {};
    }
    static async open(options: IntegrationServiceOptions): Promise<IntegrationService> { const service = new IntegrationService(await IntegrationStore.open(options.root), options); await service.operations.recover(); await service.migrateDefaultToolGrants(); await service.refreshSkillSources(); for (const bundled of await loadBundledSkills(options.bundledSkillDirectory)) service.bundledSkills.set(bundled.skill.id, bundled); await service.syncBundledDatayes(); return service; }
    private syncBundledDatayes(resetAuthentication = false): Promise<void> {
        const pending = this.bundledDatayesSync.then(() => this.updateBundledDatayes(resetAuthentication));
        this.bundledDatayesSync = pending.catch(() => {});
        return pending;
    }
    private async updateBundledDatayes(resetAuthentication: boolean) {
        const options=this.options.bundledDatayes,owner=this.options.getOwnerId();if(this.disposed||!options||!owner)return;
        const authenticated=options.authenticated(),key=bundledDatayesId(owner),expected=bundledDatayesConnection(owner,authenticated);
        // A successful discovery can legitimately have a different tool count
        // and schema from the bootstrap catalog. Keep that verified cache;
        // authentication rotation must not reintroduce removed wire names.
        const hasCurrentTools=(state:IntegrationState,current?:Connection)=>{
            if(!current||current.ownerAccountId!==owner||current.configDigest!==expected.configDigest||!current.toolGrants.length||current.deniedToolIds?.length!==0)return false;
            const tools=Object.values(state.tools).filter(tool=>tool.connectionId===key);
            return tools.length===current.toolGrants.length&&new Set(current.toolGrants).size===tools.length
                &&current.toolGrants.every(id=>state.tools[id]?.connectionId===key&&state.tools[id]?.enabled);
        };
        const currentIsValid=(state:IntegrationState,current=state.connections[key])=>!!current&&hasCurrentTools(state,current)
            &&(authenticated?!['unconfigured','revoked'].includes(current.authState):current.authState==='unconfigured');
        if(!resetAuthentication&&currentIsValid(this.store.snapshot()))return;
        await this.store.change(state=>{
            if(this.disposed||this.options.getOwnerId()!==owner||options.authenticated()!==authenticated)return;
            const prior=state.connections[key];
            if(!resetAuthentication&&currentIsValid(state,prior))return;
            const retainTools=hasCurrentTools(state,prior);
            const connection={...expected,...(retainTools?{toolGrants:[...prior!.toolGrants],workspaceGrant:prior!.workspaceGrant}:{}),enabled:prior?.enabled??true,revision:prior?(prior.revision+1):1,createdAt:prior?.createdAt??expected.createdAt};
            state.connections[key]=connection;
            if(!retainTools)this.replaceTools(state,connection,DATAYES_TOOLS);
        });
    }
    private async migrateDefaultToolGrants() {
        const state = this.store.snapshot();
        if (!Object.values(state.connections).some(connection => connection.deniedToolIds === undefined)) return;
        await this.store.change(draft => {
            for (const connection of Object.values(draft.connections)) {
                if (connection.deniedToolIds !== undefined) continue;
                const known = Object.values(draft.tools).filter(tool => tool.connectionId === connection.id).map(tool => tool.id);
                // A subset records a deliberate prior choice. An empty legacy list was the old default.
                connection.deniedToolIds = connection.toolGrants.length ? known.filter(toolId => !connection.toolGrants.includes(toolId)) : [];
                const granted = known.filter(toolId => !connection.deniedToolIds!.includes(toolId));
                if (granted.length !== connection.toolGrants.length || granted.some(toolId => !connection.toolGrants.includes(toolId))) {
                    connection.toolGrants = granted;
                    connection.revision++;
                }
            }
        });
    }
    async previewLegacySkills() {
        const owner = this.owner(), migration = new LegacySkillMigration({ root: join(this.options.root, 'migration'), ownerAccountId: owner, manager: this.skills, roots: this.options.legacySkillRoots ?? [] });
        const report = await migration.preview(), state = this.store.snapshot();
        const items: LegacySkillPreviewItem[] = report.items.map(item => {
            const source = { name: item.name, sourcePath: item.sourcePath, kind: item.kind };
            if (item.sourceId && Object.values(state.skills).some(skill => skill.ownerAccountId === owner && skill.sourceId === item.sourceId))
                return { ...source, status: 'migrated', message: '已在当前账户管理，可在技能列表中启用或停用；来源文件保持不变。' };
            if (item.sourceId && this.managedSkillSources.includes(item.sourceId))
                return { ...source, status: 'compatibility', message: '该来源曾接入管理或已卸载，旧来源不会自动重复启用；如需重新添加，请重新选择完整技能包。' };
            return { ...source, status: item.status, message: item.message, diagnostic: item.diagnostic };
        });
        const eligibleCount = items.filter(item => item.status === 'eligible').length;
        this.compatibility.set(owner, eligibleCount ? `发现 ${eligibleCount} 项旧个人技能，可预览后复制接入管理；原文件保留。` : '旧技能检查完成；已接入的技能由当前列表管理，其余保持原提供者兼容。');
        if (this.options.legacyConnectionSources?.length) {
            const legacy = await previewLegacyConnections({ sources: this.options.legacyConnectionSources });
            items.push(...legacy.items.map(item => ({ name: item.name, status: 'compatibility', message: '旧连接保持原提供者兼容；请先停用旧 MCP，再在“添加连接”中补全配置，不自动沿用工具授权。' })));
            if (legacy.items.length)
                this.compatibility.set(owner, `${this.compatibility.get(owner)} 另发现 ${legacy.items.length} 项旧连接，保留原配置。`);
        }
        return { items, eligibleCount };
    }
    async scanLegacySkills() { try {
        await this.previewLegacySkills();
    }
    catch {
        const owner = this.options.getOwnerId();
        if (owner)
            this.compatibility.set(owner, '旧技能检查未完成，可稍后重试；原文件保持不变');
    } }
    migrateLegacySkills(signal?: AbortSignal): Promise<void> {
        const owner = this.options.getOwnerId();
        if (!owner || !this.options.legacySkillRoots?.length)
            return Promise.resolve();
        const existing = this.migrations.get(owner);
        if (existing)
            return existing;
        const manager = this.skills;
        this.compatibility.set(owner, '正在检查旧技能；原有文件保持不变');
        const work = (async () => {
            const migration = new LegacySkillMigration({ root: join(this.options.root, 'migration'), ownerAccountId: owner, manager, roots: this.options.legacySkillRoots! });
            const report = await migration.migrateOnce(async (receipt) => {
                signal?.throwIfAborted();
                if (this.options.getOwnerId() !== owner)
                    throw new IntegrationError('ACCESS_DENIED', '账户已变化，停止当前迁移');
                await this.store.change(state => { if (this.options.getOwnerId() !== owner)
                    throw new IntegrationError('ACCESS_DENIED', '账户已变化'); const old = state.skills[receipt.id]; state.skills[receipt.id] = { id: receipt.id, name: receipt.name, description: receipt.description, provider: 'managed', source: '旧个人技能', sourceId: receipt.sourceId, version: String(receipt.version), ownerAccountId: owner, enabled: old?.enabled ?? true, revision: (old?.revision ?? 0) + 1, bodyDigest: receipt.digest, resourceRoot: receipt.installPath, connectionRequirements: receipt.dependencies, createdAt: old?.createdAt ?? Date.now() }; });
            });
            await this.refreshSkillSources();
            const migrated = report.items.filter(item => item.status === 'migrated').length, compatibility = report.items.filter(item => item.status === 'compatibility').length, failed = report.items.filter(item => item.status === 'failed').length;
            this.compatibility.set(owner, `已接入 ${migrated} 项旧个人技能；${compatibility} 项保持原提供者兼容${failed ? `；${failed} 项暂不能接入，可在“接入旧技能”查看原因与处理方式` : ''}。原文件均保留。`);
        })().catch(() => { this.compatibility.set(owner, '部分旧技能尚未接入管理；原文件保留，可在“接入旧技能”重新检查'); }).finally(() => { this.migrations.delete(owner); });
        this.migrations.set(owner, work);
        return work;
    }
    private owner(): string { const owner = this.options.getOwnerId(); if (!owner)
        throw new IntegrationError('AUTH_REQUIRED', '账户身份尚未确认，请等待登录完成'); return owner; }
    private bundledSkill(entityId: string, state = this.store.snapshot()): SkillInstall | undefined {
        const bundled = this.bundledSkills.get(entityId);
        if (!bundled) return;
        const owner = this.options.getOwnerId();
        const preference = owner ? state.bundledSkillPreferences?.[owner]?.[entityId] : undefined;
        return { ...bundled.skill, enabled: preference?.enabled ?? true, revision: bundled.skill.revision + (preference?.revision ?? 0) };
    }
    private entity(kind: EntityKind, entityId: string, state = this.store.snapshot()) {
        const value = kind === 'connection' ? state.connections[id(entityId)] : kind === 'plugin' ? state.plugins[id(entityId)] : this.bundledSkill(id(entityId), state) ?? state.skills[id(entityId)];
        if (!value)
            throw new IntegrationError('NOT_FOUND', '项目不存在或已移除');
        if (value.ownerAccountId && value.ownerAccountId !== this.owner())
            throw new IntegrationError('ACCESS_DENIED', '当前账户无法访问此连接或能力');
        return value;
    }
    private connection(entityId: string): Connection { return this.entity('connection', entityId) as Connection; }
    private check(meta: MutationMeta, kind?: EntityKind, entityId?: string) {
        if (!meta || !Number.isSafeInteger(meta.expectedRevision) || typeof meta.requestId !== 'string')
            throw new IntegrationError('INVALID_CONFIG', '请求版本无效');
        this.owner();
        const revision = kind && entityId ? this.entity(kind, entityId).revision : this.store.snapshot().revision;
        if (meta.expectedRevision !== revision)
            throw new IntegrationError('VERSION_CONFLICT', '内容已更新，请刷新后重试');
    }
    private operation(idValue: string): UiOperation {
        const op = this.store.snapshot().operations[id(idValue)];
        if (!op)
            throw new IntegrationError('NOT_FOUND', '操作不存在');
        if (op.ownerAccountId !== this.owner())
            throw new IntegrationError('ACCESS_DENIED', '当前账户无法访问此操作');
        return { id: op.id, status: op.phase === 'queued' ? 'pending' : op.phase, message: op.error ?? op.progress ?? (op.phase === 'succeeded' ? '操作已完成' : op.phase === 'cancelled' ? '操作已取消' : '正在处理…'), entityId: op.entityId, cancellable: op.cancelable };
    }
    private async mutate(action: string, meta: MutationMeta, kind: EntityKind | undefined, entityId: string | undefined, work: (id: string, signal: AbortSignal) => Promise<string | void>): Promise<IntegrationReply> {
        const existing = Object.values(this.store.snapshot().operations).find(op => op.requestId === meta?.requestId);
        const target = entityId ?? existing?.entityId ?? randomUUID();
        const owner = this.owner();
        const receipt = await this.operations.start(action, target, meta.requestId, async (signal) => { if (owner !== this.owner())
            throw new IntegrationError('ACCESS_DENIED', '账户已变化，请重新操作'); const actualId = await work(target, signal); if (actualId)
            await this.store.change(state => { const op = Object.values(state.operations).find(item => item.requestId === meta.requestId && item.ownerAccountId === owner); if (op)
                op.entityId = actualId; }); }, () => this.check(meta, kind, entityId), owner);
        return { type: 'operation', operation: this.operation(receipt.operationId) };
    }
    async request(raw: unknown): Promise<IntegrationReply> {
        const command = raw as IntegrationCommand;
        if (!command || typeof command !== 'object')
            throw new IntegrationError('INVALID_CONFIG', '请求格式无效');
        const connectionId=command.type==='save-connection'?command.draft?.id:'id' in command?command.id:undefined;
        if(isBundledDatayesId(connectionId)&&['uninstall','disconnect','save-connection','grant-tools','connection-draft','authorize'].includes(command.type)) {
            this.owner();throw new IntegrationError('ACCESS_DENIED','内置通联 MCP 随客户端更新，可以启用或停用，不能删除或修改配置');
        }
        await this.syncBundledDatayes();
        if (command.type === 'uninstall' && isBundledSkillId(command.id)) {
            this.owner();
            throw new IntegrationError('ACCESS_DENIED', '内置技能随客户端更新，可以启用或停用，不能删除');
        }
        switch (command.type) {
            case 'snapshot': return { type: 'snapshot', snapshot: this.snapshot() };
            case 'skill-detail': return this.skillDetail(command);
            case 'connection-draft': return { type: 'draft', draft: this.draft(this.connection(command.id)) };
            case 'operation': return { type: 'operation', operation: this.operation(command.id) };
            case 'cancel-operation':
                this.operation(command.id);
                await this.operations.cancel(id(command.id));
                return { type: 'operation', operation: this.operation(command.id) };
            case 'set-enabled': return this.mutate(command.type, command.meta, command.kind, command.id, async (target, signal) => {
                if (typeof command.enabled !== 'boolean')
                    throw new IntegrationError('INVALID_CONFIG', '开关值无效');
                const owner = this.owner();
                await this.store.change(state => { signal.throwIfAborted(); if (owner !== this.owner()) throw new IntegrationError('ACCESS_DENIED', '账户已变化'); const entity = this.entity(command.kind, target, state); if (entity.revision !== command.meta.expectedRevision)
                    throw new IntegrationError('VERSION_CONFLICT', '配置已变化');
                    if (command.kind === 'skill' && this.bundledSkills.has(target)) {
                        const preferences = (state.bundledSkillPreferences ??= {});
                        const account = (preferences[owner] ??= {});
                        account[target] = { enabled: command.enabled, revision: (account[target]?.revision ?? 0) + 1 };
                    } else { entity.enabled = command.enabled; entity.revision++; }
                });
                if (command.kind === 'connection' && !command.enabled) {
                    this.abortCalls(target);
                    await this.mcp.dispose(target);
                }
            });
            case 'save-connection': return this.mutate(command.type, command.meta, command.draft.id ? 'connection' : undefined, command.draft.id, async (target, signal) => this.saveConnection(target, command.draft, command.meta, signal));
            case 'disconnect': return this.mutate(command.type, command.meta, 'connection', command.id, async (target, signal) => {
                const previous = this.connection(target);
                await this.store.change(state => { signal.throwIfAborted(); const c = this.entity('connection', target, state) as Connection; if (c.revision !== command.meta.expectedRevision)
                    throw new IntegrationError('VERSION_CONFLICT', '连接已变化'); c.enabled = false; c.authState = 'revoked'; c.revision++; c.updatedAt = Date.now(); });
                this.abortCalls(target);
                await this.mcp.dispose(target);
                const provider = this.providers[previous.providerId];
                try {
                    await provider?.disconnect?.(previous, signal);
                    await this.removeCredentials(previous);
                }
                catch {
                    await this.store.change(state => { const c = state.connections[target]; if (c?.revision === previous.revision + 1)
                        c.lastError = '本地已断开，远端撤销未完成；可重试断开连接'; });
                }
            });
            case 'grant-tools': return this.mutate(command.type, command.meta, 'connection', command.id, async (target, signal) => {
                if (!Array.isArray(command.toolIds) || command.toolIds.length > 1000)
                    throw new IntegrationError('INVALID_CONFIG', '工具选择无效');
                await this.store.change(state => { signal.throwIfAborted(); const c = this.entity('connection', target, state) as Connection; if (c.revision !== command.meta.expectedRevision)
                    throw new IntegrationError('VERSION_CONFLICT', '连接已变化'); for (const selected of command.toolIds)
                    if (state.tools[selected]?.connectionId !== target)
                        throw new IntegrationError('ACCESS_DENIED', '工具不属于此连接'); c.toolGrants = [...new Set(command.toolIds)]; c.deniedToolIds = Object.values(state.tools).filter(tool => tool.connectionId === target && !c.toolGrants.includes(tool.id)).map(tool => tool.id); c.unattendedToolGrants = c.unattendedToolGrants.filter(tool => c.toolGrants.includes(tool)); c.revision++; });
            });
            case 'probe': return this.probe(id(command.id));
            case 'compile-openapi': {
                const compiled = compileOpenApi(text(command.document, 2 * 1024 * 1024));
                return { type: 'compiled', toolsJson: JSON.stringify(compiled.tools, null, 2), diagnostics: compiled.diagnostics.map(d => `${d.path}：${d.message}`) };
            }
            case 'legacy-preview': return { type: 'legacy-preview', ...await this.previewLegacySkills() };
            case 'migrate-legacy-skills': return this.mutate(command.type, command.meta, undefined, undefined, async (_target, signal) => { await this.migrateLegacySkills(signal); signal.throwIfAborted(); });
            case 'preview-skill': {
                const path = command.path ?? await this.options.selectSkill?.();
                if (!path)
                    return { type: 'preview', preview: null };
                const preview = await this.skills.previewSkillImport(text(path, 4096)).catch(error => { throw new IntegrationError('INVALID_CONFIG', skillImportErrorMessage(error)); });
                return { type: 'preview', preview: { previewId: preview.previewId, name: preview.name, description: preview.description, content: preview.bodyPreview, files: preview.files.map(file => file.path), warnings: preview.conflicts.map(conflict => `已有同名技能「${conflict.name}」，请明确选择替换或另存`) } };
            }
            case 'import-skill': return this.mutate(command.type, command.meta, undefined, undefined, async (_target, signal) => {
                signal.throwIfAborted();
                const manager = this.skills;
                const receipt = await manager.commitSkillImport(command.previewId, command.mode).catch(error => { throw new IntegrationError('INVALID_CONFIG', skillImportErrorMessage(error)); });
                try {
                    await this.store.change(state => { signal.throwIfAborted(); const old = state.skills[receipt.id]; state.skills[receipt.id] = { id: receipt.id, name: receipt.name, description: receipt.description, provider: 'managed', source: '个人导入', sourceId: receipt.sourceId, version: String(receipt.version), ownerAccountId: this.owner(), enabled: true, revision: (old?.revision ?? 0) + 1, bodyDigest: receipt.digest, resourceRoot: receipt.installPath, connectionRequirements: receipt.dependencies, createdAt: old?.createdAt ?? Date.now() }; });
                    manager.finalizeSkillImport(receipt);
                }
                catch (error) {
                    await manager.rollbackSkillImport(receipt);
                    throw error;
                }
                await this.refreshSkillSources();
                return receipt.id;
            });
            case 'dependencies': {
                this.entity(command.kind, command.id);
                const impact = await new DependencyIndex(this.store).impact(command.id);
                return { type: 'dependencies', descriptions: [...impact.declaredTaskIds.map(task => `定时任务 ${task} 已绑定此能力`), ...impact.observedTaskIds.filter(task => !impact.declaredTaskIds.includes(task)).map(task => `定时任务 ${task} 曾使用此能力`), '已有内容会保留；未显式绑定的依赖仍在执行时检查权限'] };
            }
            case 'uninstall': return this.mutate(command.type, command.meta, command.kind, command.id, async (target, signal) => {
                const value = this.entity(command.kind, target);
                const hiddenPackage = command.kind === 'skill' && (value as SkillInstall).ownerPluginId ? this.store.snapshot().plugins[(value as SkillInstall).ownerPluginId!] : undefined;
                const marketOwner = hiddenPackage?.catalogKind === 'skill' ? hiddenPackage : undefined;
                const packageToRemove = command.kind === 'plugin' ? value as PluginInstall : marketOwner;
                const ownedSkills = packageToRemove ? packageToRemove.skillIds.map(key => this.store.snapshot().skills[key]!).filter(Boolean) : [];
                if (command.kind === 'plugin' && 'owner' in value && value.owner === 'bundled')
                    throw new IntegrationError('ACCESS_DENIED', '内置插件可以停用，不能卸载');
                const skillCopies = command.kind === 'skill' && hiddenPackage && !marketOwner
                    ? [value as SkillInstall, ...(hiddenPackage.previousVersion?.skills.filter(skill => skill.id === target) ?? [])] : [];
                let expectedRemovalRevision = command.meta.expectedRevision;
                if (command.kind === 'connection' && this.providers[(value as Connection).providerId]?.disconnect) {
                    await this.store.change(state => { signal.throwIfAborted(); const c = this.entity('connection', target, state) as Connection; if (c.revision !== expectedRemovalRevision)
                        throw new IntegrationError('VERSION_CONFLICT', '连接已变化'); c.enabled = false; c.authState = 'revoked'; c.revision++; expectedRemovalRevision = c.revision; });
                    this.abortCalls(target);
                    try {
                        await this.providers[(value as Connection).providerId]!.disconnect!(value as Connection, signal);
                    }
                    catch {
                        await this.store.change(state => { const c = state.connections[target]; if (c?.revision === expectedRemovalRevision)
                            c.lastError = '本地已停用，远端撤销未完成；请重试卸载'; });
                        throw new IntegrationError('AUTH_REQUIRED', '本地已停用，远端撤销未完成；连接保留以便重试卸载');
                    }
                }
                await this.store.change(state => { signal.throwIfAborted(); if (this.entity(command.kind, target, state).revision !== expectedRemovalRevision)
                    throw new IntegrationError('VERSION_CONFLICT', '内容已变化，请重新查看卸载影响'); if (command.kind === 'connection') {
                    delete state.connections[target];
                    for (const [key, tool] of Object.entries(state.tools))
                        if (tool.connectionId === target)
                            delete state.tools[key];
                }
                else if (command.kind === 'plugin') {
                    const plugin = state.plugins[target]!;
                    for (const skillId of plugin.skillIds)
                        if (state.skills[skillId]?.ownerPluginId === target)
                            delete state.skills[skillId];
                    delete state.plugins[target];
                }
                else {
                    delete state.skills[target];
                    if(marketOwner){if(state.plugins[marketOwner.id]?.revision!==marketOwner.revision)throw new IntegrationError('VERSION_CONFLICT','技能包已变化');for(const skillId of marketOwner.skillIds)delete state.skills[skillId];delete state.plugins[marketOwner.id]}
                    else if (hiddenPackage) {
                        const plugin = state.plugins[hiddenPackage.id];
                        if (!plugin || plugin.revision !== hiddenPackage.revision) throw new IntegrationError('VERSION_CONFLICT', '插件已变化，请重新查看技能删除影响');
                        plugin.skillIds = plugin.skillIds.filter(skillId => skillId !== target);
                        plugin.excludedSkillIds = [...new Set([...(plugin.excludedSkillIds ?? []), target])];
                        plugin.revision++;
                        if (plugin.previousVersion) {
                            plugin.previousVersion.skills = plugin.previousVersion.skills.filter(skill => skill.id !== target);
                            plugin.previousVersion.plugin.skillIds = plugin.previousVersion.plugin.skillIds.filter(skillId => skillId !== target);
                        }
                    }
                } });
                if (skillCopies.length)
                    await removeSkillPackageResources(join(this.options.root, 'packages'), skillCopies);
                if (packageToRemove)
                    await removePackageResources(join(this.options.root, 'packages'), packageToRemove, ownedSkills);
                if (command.kind === 'skill' && (value as SkillInstall).provider === 'managed') {
                    await this.skills.removeManagedSkill(target, { resourceRoot: (value as SkillInstall).resourceRoot, sourceId: (value as SkillInstall).sourceId });
                    await this.refreshSkillSources();
                }
                if (command.kind === 'connection') {
                    this.abortCalls(target);
                    await this.mcp.dispose(target);
                    const c = value as Connection;
                    await this.removeCredentials(c);
                }
            });
            case 'market': {
                if (!['plugin', 'app', 'tool', 'skill'].includes(command.kind))
                    throw new IntegrationError('INVALID_CONFIG', '市场分类无效');
                const entries = await this.catalog.list(command.kind, Object.values(this.store.snapshot().sources));
                const state = this.store.snapshot();
                return { type: 'market', entries: entries.map(entry => {
                        const blueprint = entry.manifest ?? {}, type = blueprint.type as ConnectionDraft['type'];
                        return { id: entry.id, kind: entry.kind, category: entry.category, capabilities: Array.isArray(blueprint.skills) ? blueprint.skills.flatMap((item: unknown) => { const skill = item as { name?: unknown; description?: unknown }; return skill && typeof skill.name === 'string' && typeof skill.description === 'string' ? [{ name: skill.name, description: skill.description }] : [] }) : [], name: entry.name, description: entry.description, publisher: entry.publisher, version: entry.version, permissions: entry.permissions, available: entry.available, unavailableReason: entry.unavailableReason,
                            installed: Object.values(state.plugins).some(p => p.sourceId === entry.sourceId && p.packageId === blueprint.id && compareVersions(p.version, entry.version) >= 0 && (!p.ownerAccountId || p.ownerAccountId === this.owner())),
                            ...(['app', 'tool'].includes(entry.kind) && ['api', 'mcp-http', 'mcp-stdio', 'google-calendar', 'notion'].includes(type) ? { blueprint: { ...emptyConnectionDraft(type), name: entry.name, authType: type === 'notion' ? 'bearer' as const : 'none' as const, url: typeof blueprint.url === 'string' ? blueprint.url : '', command: typeof blueprint.command === 'string' ? blueprint.command : '', args: typeof blueprint.args === 'string' ? blueprint.args : '', clientId: typeof blueprint.clientId === 'string' ? blueprint.clientId : '' } } : {}) };
                    }) };
            }
            case 'add-source': return this.mutate(command.type, command.meta, undefined, undefined, async (target, signal) => {
                const url = new URL(text(command.url));
                if (url.protocol !== 'https:' || url.username || url.password)
                    throw new IntegrationError('INVALID_CONFIG', '团队目录须为不含凭据的 HTTPS 地址');
                const source = { id: target, name: url.hostname, url: url.toString(), trusted: true };
                await this.catalog.validateSource(source);
                await this.store.change(state => { signal.throwIfAborted(); state.sources[target] = source; });
            });
            case 'create-plugin': return this.mutate(command.type, command.meta, undefined, undefined, async (_target, signal) => { let manifest: unknown; try {
                manifest = JSON.parse(text(command.manifest, 2 * 1024 * 1024));
            }
            catch {
                throw new IntegrationError('INVALID_CONFIG', '插件定义不是有效 JSON');
            } return this.installManifest(manifest, 'local', undefined, 'plugin', signal); });
            case 'install': return this.mutate(command.type, command.meta, undefined, undefined, async (target, signal) => {
                const entry = await this.catalog.get(command.entryId, Object.values(this.store.snapshot().sources));
                if (!entry.available)
                    throw new IntegrationError('INVALID_CONFIG', entry.unavailableReason ?? '当前条目不可用');
                if (entry.kind === 'app' || entry.kind === 'tool')
                    throw new IntegrationError('INVALID_CONFIG', '请先填写连接配置并明确保存');
                return this.installManifest(entry.manifest, entry.sourceId, entry.digest, entry.kind, signal, entry.id);
            });
            case 'rollback-plugin': return this.mutate(command.type, command.meta, 'plugin', command.id, async (target, signal) => {
                const current = this.entity('plugin', target) as PluginInstall, previous = current.previousVersion;
                if (!previous)
                    throw new IntegrationError('NOT_FOUND', '没有可回退的上一版本');
                const root = await assertManagedPackagePath(join(this.options.root, 'packages'), previous.plugin.packageRoot);
                const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
                if (manifestDigest(manifest) !== previous.plugin.digest)
                    throw new IntegrationError('INVALID_CONFIG', '上一版本资源摘要不匹配，未回退');
                const restoredSkills = previous.skills.filter(skill => !current.excludedSkillIds?.includes(skill.id));
                for (const skill of restoredSkills)
                    await assertManagedPackagePath(join(this.options.root, 'packages'), skill.resourceRoot);
                await this.store.change(state => {
                    signal.throwIfAborted();
                    if (this.entity('plugin', target, state).revision !== command.meta.expectedRevision)
                        throw new IntegrationError('VERSION_CONFLICT', '插件已变化');
                    const oldSkills = current.skillIds.map(key => state.skills[key]!).filter(Boolean), { previousVersion: _history, ...latest } = current;
                    state.plugins[target] = { ...previous.plugin, enabled: current.enabled, skillIds: restoredSkills.map(skill => skill.id), excludedSkillIds: current.excludedSkillIds, revision: current.revision + 1, previousVersion: { plugin: latest, skills: oldSkills } };
                    for (const skill of oldSkills)
                        delete state.skills[skill.id];
                    for (const skill of restoredSkills)
                        state.skills[skill.id] = { ...skill, revision: Math.max(skill.revision, oldSkills.find(old => old.id === skill.id)?.revision ?? 0) + 1 };
                });
                return target;
            });
            case 'authorize': return this.mutate(command.type, command.meta, 'connection', command.id, async (target, signal) => {
                const previous = this.connection(target), provider = this.providers[previous.providerId];
                if (!provider?.authorize)
                    throw new IntegrationError('INVALID_CONFIG', '此连接使用令牌或 API 凭据，请编辑连接后测试');
                const result = await provider.authorize(previous, signal);
                signal.throwIfAborted();
                const ref = randomUUID();
                await this.vault.put(ref, result.credential);
                try {
                    await this.store.change(state => { signal.throwIfAborted(); const c = state.connections[target]; if (!c || c.revision !== previous.revision || c.ownerAccountId !== this.owner())
                        throw new IntegrationError('VERSION_CONFLICT', '连接或账户已变化，请重新授权'); c.config.auth = { type: 'bearer', credentialRef: ref }; c.authState = 'connected'; c.health = 'unknown'; c.accountLabel = result.accountLabel; c.revision++; });
                }
                catch (error) {
                    await this.vault.remove(ref);
                    throw error;
                }
                this.abortCalls(target);
                if (previous.config.auth.credentialRef)
                    await this.vault.remove(previous.config.auth.credentialRef);
                await this.probe(target);
            });
            default: throw new IntegrationError('INVALID_CONFIG', '未知集成操作');
        }
    }
    private async installManifest(manifest: unknown, sourceId: string, digest: string | undefined, catalogKind: 'plugin' | 'skill', signal: AbortSignal, catalogEntryId?: string) {
        if(catalogKind==='skill'&&(!Array.isArray((manifest as {skills?:unknown})?.skills)||(manifest as {skills:unknown[]}).skills.length!==1))throw new IntegrationError('INVALID_CONFIG','技能市场每个条目必须对应一项独立技能');
        const existing = Object.values(this.store.snapshot().plugins).find(p => p.sourceId === sourceId && p.packageId === (manifest as {
            id?: string;
        })?.id && p.ownerAccountId === this.owner());
        const existingSkills = existing?.skillIds.map(key => this.store.snapshot().skills[key]!).filter(Boolean) ?? [];
        const transaction = await this.installer.stage(manifest, { sourceId, owner: 'user', ownerAccountId: this.owner(), expectedDigest: digest, existing, existingSkills });
        try {
            await this.store.change(state => {
                signal.throwIfAborted();
                if (existing ? state.plugins[existing.id]?.revision !== existing.revision : !!state.plugins[transaction.plugin.id])
                    throw new IntegrationError('VERSION_CONFLICT', '插件已变化，请重新安装');
                const { previousVersion: _oldHistory, ...prior } = existing ?? transaction.plugin;
                state.plugins[transaction.plugin.id] = { ...transaction.plugin, revision: Math.max(transaction.plugin.revision, state.revision + 1), ownerAccountId: this.owner(), catalogKind, catalogEntryId, previousVersion: existing ? { plugin: prior, skills: existingSkills } : undefined };
                for (const old of existingSkills)
                    delete state.skills[old.id];
                for (const skill of transaction.skills)
                    state.skills[skill.id] = { ...skill, revision: Math.max(skill.revision, state.revision + 1), ownerAccountId: this.owner() };
            });
        }
        catch (error) {
            await transaction.rollback();
            throw error;
        }
        await transaction.finalize();
        return catalogKind === 'skill' ? (transaction.skills[0]?.id ?? transaction.plugin.id) : transaction.plugin.id;
    }
    private draft(c: Connection): ConnectionDraft {
        const d = emptyConnectionDraft(c.kind === 'api' ? 'api' : c.kind === 'mcp' ? (c.config.type === 'mcp' && c.config.transport === 'stdio' ? 'mcp-stdio' : 'mcp-http') : c.providerId as ConnectionDraft['type']);
        Object.assign(d, { id: c.id, name: c.name, authType: c.config.auth.type === 'header' ? 'api-key' : c.config.auth.type, headerName: c.config.auth.headerName ?? 'X-API-Key', workspaceIds: c.workspaceGrant.mode === 'selected' ? c.workspaceGrant.workspaceIds.join('\n') : '' });
        if (c.config.type === 'api')
            Object.assign(d, { url: c.config.baseUrl, toolsJson: JSON.stringify(c.config.operations, null, 2), allowPrivateNetwork: c.config.network.allowLocal === true });
        if (c.config.type === 'mcp')
            Object.assign(d, { url: c.config.url ?? '', command: c.config.command ?? '', args: JSON.stringify(c.config.args ?? []), cwd: c.config.cwd ?? '', env: Object.keys(c.config.env ?? {}).map(key => `${key}=`).join('\n'), allowPrivateNetwork: c.config.network.allowLocal === true });
        if (c.config.type === 'app')
            d.clientId = c.config.clientId ?? '';
        return d;
    }
    private async saveConnection(target: string, draft: ConnectionDraft, meta: MutationMeta, signal: AbortSignal) {
        const previous = draft.id ? this.connection(draft.id) : undefined, owner = this.owner(), name = text(draft.name, 200);
        if (!name || !['api', 'mcp-http', 'mcp-stdio', 'google-calendar', 'notion'].includes(draft.type))
            throw new IntegrationError('INVALID_CONFIG', '请填写名称并选择连接类型');
        if (!['none', 'bearer', 'api-key'].includes(draft.authType))
            throw new IntegrationError('INVALID_CONFIG', '认证类型无效');
        const createdRefs: string[] = [];
        let saved = false;
        const auth = { type: draft.authType, headerName: text(draft.headerName ?? '', 100) || undefined, credentialRef: previous?.config.auth.credentialRef };
        try {
            if (draft.secret) {
                auth.credentialRef = randomUUID();
                createdRefs.push(auth.credentialRef);
                await this.vault.put(auth.credentialRef, text(draft.secret, 32768));
            }
            if (auth.type === 'none')
                delete auth.credentialRef;
            let config: ConnectionConfig;
            if (draft.type === 'api' || draft.type === 'mcp-http') {
                let url: URL;
                try {
                    url = new URL(text(draft.url, 4096));
                }
                catch {
                    throw new IntegrationError('INVALID_CONFIG', '请填写有效的服务地址');
                }
                if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
                    throw new IntegrationError('INVALID_CONFIG', '服务地址不能包含凭据、查询参数或片段');
                if (url.protocol === 'http:' && !draft.allowPrivateNetwork)
                    throw new IntegrationError('INVALID_CONFIG', 'HTTP 本机或局域网服务需要明确授权');
                const network = { allowLocal: draft.allowPrivateNetwork === true, allowedOrigins: [url.origin] };
                if (draft.type === 'api') {
                    let operations: ApiOperation[];
                    try {
                        operations = JSON.parse(text(draft.toolsJson || '[]', 1024 * 1024));
                    }
                    catch {
                        throw new IntegrationError('INVALID_CONFIG', '工具定义不是有效 JSON');
                    }
                    if (!Array.isArray(operations) || operations.length > 200)
                        throw new IntegrationError('INVALID_CONFIG', '工具列表格式无效或超过 200 项');
                    const names = new Set<string>();
                    for (const op of operations) {
                        op.id = id(op.id);
                        op.name = text(op.name ?? op.id, 200);
                        op.description = text(op.description ?? op.name);
                        op.method = text(op.method, 10).toUpperCase();
                        if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(op.method) || !op.path?.startsWith('/') || op.path.startsWith('//') || !op.inputSchema || typeof op.inputSchema !== 'object' || names.has(op.id))
                            throw new IntegrationError('INVALID_CONFIG', '接口定义存在无效方法、路径、schema 或重复标识');
                        op.effect = ['GET', 'HEAD'].includes(op.method) ? 'read' : op.method === 'DELETE' ? 'destructive' : 'write';
                        names.add(op.id);
                    }
                    config = { type: 'api', baseUrl: url.toString().replace(/\/$/, ''), auth, network, operations };
                }
                else
                    config = { type: 'mcp', transport: 'http', url: url.toString(), auth, network };
            }
            else if (draft.type === 'mcp-stdio') {
                const command = text(draft.command, 4096);
                if (!command)
                    throw new IntegrationError('INVALID_CONFIG', '请填写 MCP 启动命令');
                let args: string[];
                try {
                    args = draft.args.trim().startsWith('[') ? JSON.parse(draft.args) : draft.args.split(/\r?\n/).filter(Boolean);
                }
                catch {
                    throw new IntegrationError('INVALID_CONFIG', '参数请使用 JSON 数组或每行一个参数');
                }
                if (!Array.isArray(args) || args.length > 100 || args.some(arg => typeof arg !== 'string' || arg.length > 4096))
                    throw new IntegrationError('INVALID_CONFIG', 'MCP 参数无效');
                const env: Record<string, string> = {}, prior = previous?.config.type === 'mcp' ? previous.config.env : {};
                for (const line of text(draft.env ?? '', 65536).split(/\r?\n/).filter(Boolean)) {
                    const split = line.indexOf('='), key = line.slice(0, split).trim(), value = line.slice(split + 1);
                    if (split < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
                        throw new IntegrationError('INVALID_CONFIG', '环境变量请使用 KEY=value，每行一项');
                    if (!value && prior?.[key])
                        env[key] = prior[key]!;
                    else {
                        const ref = randomUUID();
                        createdRefs.push(ref);
                        await this.vault.put(ref, value);
                        env[key] = ref;
                    }
                }
                config = { type: 'mcp', transport: 'stdio', command, args, cwd: text(draft.cwd ?? '', 4096) || undefined, env, auth, network: {} };
            }
            else
                config = { type: 'app', provider: draft.type, auth: { ...auth, type: 'bearer' }, clientId: text(draft.clientId ?? '', 500) || undefined };
            const workspaces = text(draft.workspaceIds ?? '', 8192).split(/[\s,，]+/).filter(Boolean);
            signal.throwIfAborted();
            const c: Connection = { id: target, name, providerId: config.type === 'app' ? config.provider : config.type, kind: config.type, ownerAccountId: owner, config, enabled: previous?.enabled ?? true, revision: (previous?.revision ?? 0) + 1, authState: config.auth.type === 'none' || config.auth.credentialRef ? 'connected' : 'unconfigured', health: 'unknown', workspaceGrant: workspaces.length ? { mode: 'selected', workspaceIds: workspaces } : { mode: 'all-owned', ownerAccountId: owner }, toolGrants: previous?.toolGrants ?? [], deniedToolIds: previous?.deniedToolIds ?? [], unattendedToolGrants: previous?.unattendedToolGrants ?? [], createdAt: previous?.createdAt ?? Date.now(), updatedAt: Date.now(), configDigest: hash(config) };
            await this.store.change(state => { signal.throwIfAborted(); if (owner !== this.owner() || previous && state.connections[target]?.revision !== meta.expectedRevision)
                throw new IntegrationError('VERSION_CONFLICT', '连接或账户已变化'); state.connections[target] = c; if (config.type === 'api')
                this.replaceTools(state, c, config.operations.map(op => ({ name: op.id, description: op.description, inputSchema: op.inputSchema, effect: op.effect })));
            else if (config.type === 'app')
                this.replaceTools(state, c, this.providers[config.provider]?.describeCapabilities(c) ?? []);
            else if (previous?.configDigest !== c.configDigest) {
                for (const [key, tool] of Object.entries(state.tools))
                    if (tool.connectionId === target)
                        delete state.tools[key];
                c.toolGrants = [];
                c.deniedToolIds = [];
                c.unattendedToolGrants = [];
            } });
            saved = true;
            this.abortCalls(target);
            await this.mcp.dispose(target);
            const current = this.store.snapshot().connections[target];
            const used = new Set([current?.config.auth.credentialRef, ...(current?.config.type === 'mcp' ? Object.values(current.config.env ?? {}) : [])]);
            const previousRefs = [previous?.config.auth.credentialRef, ...(previous?.config.type === 'mcp' ? Object.values(previous.config.env ?? {}) : [])].filter((ref): ref is string => !!ref && !used.has(ref));
            await Promise.all(previousRefs.map(ref => this.vault.remove(ref)));
        }
        catch (error) {
            if (!saved)
                await Promise.all(createdRefs.map(ref => this.vault.remove(ref)));
            throw error;
        }
    }
    private replaceTools(state: IntegrationState, c: Connection, tools: ProviderTool[]) {
        const old = new Map(Object.values(state.tools).filter(tool => tool.connectionId === c.id).map(tool => [tool.id, tool]));
        for (const key of old.keys())
            delete state.tools[key];
        const allowed = new Set<string>();
        const denied = new Set(c.deniedToolIds ?? []);
        for (const tool of tools) {
            const toolId = `t_${hash([c.id, tool.name]).slice(0, 32)}`, schemaDigest = hash([tool.inputSchema, tool.effect]);
            state.tools[toolId] = { id: toolId, connectionId: c.id, operationId: tool.name, rawName: tool.name, name: tool.name, description: tool.description, inputSchema: tool.inputSchema, effect: tool.effect, enabled: true, schemaDigest };
            if (!denied.has(toolId)) allowed.add(toolId);
        }
        c.toolGrants = [...allowed];
        c.deniedToolIds = [...denied].filter(key => !!state.tools[key]);
        c.unattendedToolGrants = c.unattendedToolGrants.filter(key => old.get(key)?.schemaDigest === state.tools[key]?.schemaDigest && allowed.has(key));
    }
    async probe(connectionId: string): Promise<IntegrationReply> {
        const previous = this.connection(connectionId), signal = AbortSignal.timeout(30000);
        let verified = false, accountLabel: string | undefined, tools: ProviderTool[] | undefined, negotiatedVersion: string | undefined;
        try {
            if (previous.config.type === 'api') {
                const safe = previous.config.operations.find(op => op.effect === 'read' && (!Array.isArray(op.inputSchema.required) || op.inputSchema.required.length === 0));
                const result = await this.api.probe(previous.config, previous.configDigest, safe, {}, signal);
                verified = result.status === 'verified';
            }
            else if (previous.config.type === 'mcp') {
                const discovery = await this.mcp.connect(previous, signal);
                tools = discovery.tools.map(tool => ({ ...tool, effect: 'unknown' as const }));
                negotiatedVersion = discovery.negotiatedVersion;
                verified = true;
            }
            else {
                const provider = this.providers[previous.providerId];
                if (!provider)
                    throw new IntegrationError('INVALID_CONFIG', '该应用适配器尚未配置');
                const result = await provider.probe(previous, signal);
                accountLabel = result.accountLabel;
                tools = provider.describeCapabilities(previous);
                verified = true;
            }
            await this.store.change(state => { const c = state.connections[connectionId]; if (!c || c.configDigest !== previous.configDigest || c.revision !== previous.revision || c.ownerAccountId !== this.owner())
                throw new IntegrationError('VERSION_CONFLICT', '配置已改变，请重新测试'); c.health = verified ? 'healthy' : 'unknown'; c.lastCheckedAt = Date.now(); delete c.lastError; if (verified)
                c.authState = 'connected'; if (accountLabel)
                c.accountLabel = accountLabel; if (negotiatedVersion)
                c.negotiatedVersion = negotiatedVersion; if (tools) {
                const before = hash(Object.values(state.tools).filter(tool => tool.connectionId === c.id));
                this.replaceTools(state, c, tools);
                if (before !== hash(Object.values(state.tools).filter(tool => tool.connectionId === c.id)))
                    c.revision++;
            } });
            return { type: 'probe', status: verified ? 'verified' : 'config-valid', message: verified ? (isBundledDatayesId(previous.id) ? '内置通联连接成功，全部工具已可使用' : previous.kind === 'mcp' ? '连接成功，已发现的工具默认允许使用；可在连接详情中停用' : '只读请求已验证成功') : '配置有效；没有无需参数的只读探测接口，尚未验证调用' };
        }
        catch (error) {
            await this.store.change(state => { const c = state.connections[connectionId]; if (c?.revision === previous.revision && c.configDigest === previous.configDigest) {
                c.health = 'unreachable';
                c.lastError = error instanceof IntegrationError ? error.message : '连接未完成，请检查服务配置';
                if (error instanceof IntegrationError && error.code === 'AUTH_REQUIRED')
                    c.authState = 'expired';
            } });
            throw error;
        }
    }
    /** Display metadata only: no request dispatch, synchronization, resource reads or heartbeat. */
    getPresentationSkill(id: string): { id: string; invocationName: string; label: string } | null {
        if (id !== 'builtin:efund-ppt-maker' || !this.options.getOwnerId() || !this.bundledSkills.has(id)) return null;
        const row = this.snapshot().rows.find(row => row.kind === 'skill' && row.id === id && row.enabled);
        return row?.invocationName && row.invocationLabel ? { id: row.id, invocationName: row.invocationName, label: '/' + row.invocationLabel } : null;
    }
    private snapshot() {
        const state = this.store.snapshot(), owner = this.options.getOwnerId(), rows: IntegrationRow[] = [];
        if (owner) {
            for (const p of Object.values(state.plugins))
                if ((!p.ownerAccountId || p.ownerAccountId === owner) && p.catalogKind !== 'skill')
                    rows.push({ id: p.id, kind: 'plugin', tab: 'plugins', name: p.name, description: p.description, enabled: p.enabled, status: p.enabled ? '已启用' : '已停用', source: p.owner === 'bundled' ? 'EWork 内置' : '个人插件', revision: p.revision, removable: p.owner !== 'bundled', canRollback: !!p.previousVersion, marketEntryId: p.catalogEntryId, detail: `版本 ${p.version} · ${p.skillIds.length} 项技能` });
            for (const c of Object.values(state.connections))
                if (c.ownerAccountId === owner) {
                    const tools = Object.values(state.tools).filter(tool => tool.connectionId === c.id);
                    const bundled=isBundledDatayesId(c.id)&&!!this.options.bundledDatayes;
                    rows.push({ id: c.id, kind: 'connection', tab: c.kind === 'mcp' ? 'mcp' : 'apps', name: c.name, description: bundled?'官网 MCP 积分服务：股票、基金、指数、财务与估值等结构化数据':c.kind === 'api' ? '自定义 API' : c.kind === 'mcp' ? 'MCP 工具服务器' : c.providerId, enabled: c.enabled, status: bundled&&c.enabled&&!this.options.bundledDatayes?.authenticated()?'请先登录 EWork':rowStatus(c), source: bundled?'EWork 内置':c.accountLabel ?? '个人连接', detail: c.lastError, revision: c.revision, configurable: !bundled, removable: !bundled, ...(bundled?{toggleable:true,toolsReadonly:true}:{}), connectionType: this.draft(c).type,
                        connectionSummary: {
                            workspaceLabel: c.workspaceGrant.mode === 'all-owned' ? '当前账号的所有工作区' : c.workspaceGrant.workspaceIds.length ? `已选择 ${c.workspaceGrant.workspaceIds.length} 个工作区` : '未选择工作区',
                            authLabel: bundled?'EWork 账号授权 · 云端密钥已配置':c.providerId === 'google-calendar' ? `OAuth 2.0 · ${c.authState === 'connected' ? '已授权' : c.authState === 'expired' ? '授权已过期' : '待授权'}` : c.config.auth.type === 'none' ? '无需认证' : c.config.auth.credentialRef ? `${c.config.auth.type === 'bearer' ? 'Token' : 'API Key'} · 已配置` : '尚未配置凭据',
                            dependencies: Object.entries(state.taskBindings).filter(([, bindings]) => bindings.some(binding => binding.entityId === c.id || binding.toolIds.some(id => tools.some(tool => tool.id === id)))).map(([task]) => `定时任务 ${task}`),
                            healthDetail: c.lastError || (c.lastCheckedAt ? `上次检查：${new Date(c.lastCheckedAt).toLocaleString('zh-CN')}` : '尚未测试连接'),
                        }, toolCount: tools.length, tools: tools.map(tool => ({ id: tool.id, name: tool.name, description: tool.description, allowed: c.toolGrants.includes(tool.id) })) });
                }
            for (const bundled of this.bundledSkills.values()) {
                const skill = this.bundledSkill(bundled.skill.id, state)!;
                rows.push({ id: skill.id, kind: 'skill', tab: 'skills', name: skill.name, description: skill.description, enabled: skill.enabled, status: skill.enabled ? '已启用' : '已停用', source: skill.source, revision: skill.revision, invocationName:`ework-skill-${createHash('sha256').update(skill.id).digest('hex').slice(0,16)}`,invocationLabel:skillEnglishName('',skill.id,skill.name),toggleable: true, removable: false });
            }
            for (const skill of Object.values(state.skills))
                if (!skill.ownerAccountId || skill.ownerAccountId === owner) {
                    const plugin = skill.ownerPluginId ? state.plugins[skill.ownerPluginId] : undefined;
                    rows.push({ id: skill.id, kind: 'skill', tab: 'skills', name: skill.name, description: skill.description, enabled: skill.enabled, status: skill.enabled && (!plugin || plugin.enabled) ? '已启用' : '已停用', source: plugin ? `来自${plugin.name}` : skill.source, revision: skill.revision, invocationName:`ework-skill-${createHash('sha256').update(skill.id).digest('hex').slice(0,16)}`,invocationLabel:skillEnglishName('',skill.id,skill.name),removable: true });
                }
        }
        return { revision: state.revision, ownerAccountId:owner??'',rows, historicalToolLabels: rows.filter(row=>row.kind==='connection'&&isBundledDatayesId(row.id)).flatMap(row=>datayesHistoricalTools.map(tool=>({wireName:`ework__t_${hash([row.id,tool.name]).slice(0,32)}`,label:row.name+' · '+tool.name}))),taskCapabilities: projectTaskCapabilities(state, owner), compatibilityStatus: owner ? this.compatibility.get(owner) : undefined, runtimeStatus: !owner ? '等待账户身份确认' : Date.now() - this.runtimeSeenAt < 30000 ? '运行时已连接' : '运行时尚未连接' };
    }
    dependencies(entityId: string): string[] { const state = this.store.snapshot(), tasks = Object.entries(state.taskBindings).filter(([, bindings]) => bindings.some(b => b.entityId === entityId)); return [...tasks.map(([task]) => `定时任务 ${task} 使用此能力`), '未显式绑定的对话或任务仍会在执行时检查权限；已有内容会保留']; }
    runtimeSnapshot() { this.runtimeSeenAt = Date.now(); const owner = this.options.getOwnerId(), state = this.store.snapshot(); return { revision: state.revision, runtimeEpoch: this.runtimeEpoch, ownerAccountId: owner ?? '', managedSkillSources: this.managedSkillSources, connections: Object.values(state.connections).filter(c => c.ownerAccountId === owner).map(({ id, revision, enabled, ownerAccountId, workspaceGrant, authState, toolGrants, unattendedToolGrants }) => ({ id, revision, enabled, ownerAccountId, workspaceGrant, authState, toolGrants, unattendedToolGrants })), tools: Object.values(state.tools).filter(tool => state.connections[tool.connectionId]?.ownerAccountId === owner), skills: [...Object.values(state.skills).filter(skill => !skill.ownerAccountId || skill.ownerAccountId === owner), ...(owner ? [...this.bundledSkills.keys()].map(id => this.bundledSkill(id, state)!) : [])], plugins: Object.values(state.plugins).filter(p => !p.ownerAccountId || p.ownerAccountId === owner).map(({ id, enabled }) => ({ id, enabled })) }; }
    private async skillDetail(input: unknown): Promise<SkillDetail> {
        if (!isSkillDetailCommand(input)) throw new IntegrationError('INVALID_CONFIG', '技能详情请求无效');
        const owner = this.owner(), epoch = this.runtimeEpoch;
        const check = () => {
            if (owner !== this.owner() || epoch !== this.runtimeEpoch) throw new IntegrationError('ACCESS_DENIED', '账户状态已变化，请重新打开技能');
            const skill = this.entity('skill', input.id) as SkillInstall;
            if (skill.revision !== input.revision) throw new IntegrationError('VERSION_CONFLICT', '技能已更新，请刷新后重试');
            return skill;
        };
        const skill = check();
        const bundled = this.bundledSkills.get(skill.id);
        if (!bundled && !['managed', 'managed-plugin'].includes(skill.provider)) throw new IntegrationError('INVALID_CONFIG', '技能资源尚未接入托管');
        if (!bundled) await assertManagedPackagePath(join(this.options.root, skill.provider === 'managed-plugin' ? 'packages' : 'skills'), skill.resourceRoot);
        const content = bundled ? await readBundledSkill(bundled) : (await readSkillResource(skill.resourceRoot, 'SKILL.md').catch(error => { throw new IntegrationError('INVALID_CONFIG', skillImportErrorMessage(error)); })).toString('utf8');
        const current = check();
        if (current.resourceRoot !== skill.resourceRoot) throw new IntegrationError('VERSION_CONFLICT', '技能资源已更新，请刷新后重试');
        const plugin = current.ownerPluginId ? this.store.snapshot().plugins[current.ownerPluginId] : undefined;
        if (plugin?.ownerAccountId && plugin.ownerAccountId !== owner) throw new IntegrationError('ACCESS_DENIED', '当前账户无法访问此技能');
        const unavailableReason = !current.enabled ? '技能已停用，请先启用。' : current.ownerPluginId && !plugin?.enabled ? '所属插件已停用或移除，请先恢复插件。' : undefined;
        // Keep this stable-ID alias in parity with runtime managedSkillInvocationName (covered by a direct contract test).
        const invocationName = `ework-skill-${createHash('sha256').update(current.id).digest('hex').slice(0, 16)}`;
        return { type: 'skill-detail', id: current.id, revision: current.revision, content, invocationName, invocationLabel:skillEnglishName(content,current.id,current.name), enabled: current.enabled, ...(unavailableReason ? { usable: false, unavailableReason } : {}) };
    }
    async readSkill(input: {
        id: string;
        revision: number;
        context: CapabilityContext;
    }) {
        const check = () => { const s = this.entity('skill', input.id) as SkillInstall; if (!s.enabled || s.revision !== input.revision || s.ownerPluginId && !this.store.snapshot().plugins[s.ownerPluginId]?.enabled || input.context.runtimeEpoch !== this.runtimeEpoch || input.context.ownerAccountId !== this.owner())
            throw new IntegrationError('ACCESS_DENIED', '技能已停用或授权变化'); return s; };
        if (this.options.resolveContext)
            input = { ...input, context: await this.options.resolveContext(input.context) };
        const skill = check(), state = this.store.snapshot();
        for (const connectionId of skill.connectionRequirements) {
            const c = state.connections[connectionId];
            if (!c || c.ownerAccountId !== this.owner() || !c.enabled || c.authState !== 'connected' || c.workspaceGrant.mode === 'selected' && !c.workspaceGrant.workspaceIds.includes(input.context.workspaceId))
                throw new IntegrationError('DEPENDENCY_BLOCKED', '技能所需连接尚未授权给当前工作区');
        }
        if (input.context.unattended && input.context.taskId && !input.context.taskBindings?.some(binding => binding.kind === 'skill' && binding.entityId === skill.id && binding.bindingRevision === skill.revision || binding.kind === 'plugin' && binding.entityId === skill.ownerPluginId && binding.bindingRevision === state.plugins[binding.entityId]?.revision))
            throw new IntegrationError('ACCESS_DENIED', '此技能未获定时任务明确批准');
        const bundled = this.bundledSkills.get(skill.id);
        const content = bundled ? await readBundledSkill(bundled) : (await readSkillResource(skill.resourceRoot, 'SKILL.md')).toString('utf8');
        check();
        return { name: skill.name, description: skill.description, content, directory: skill.resourceRoot };
    }
    async execute(call: ToolCall, signal: AbortSignal): Promise<ToolResult> {
        if (!call || typeof call !== 'object' || !call.context || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments))
            throw new IntegrationError('INVALID_CONFIG', '工具请求无效');
        call = { ...call, context: this.options.resolveContext ? await this.options.resolveContext(call.context) : call.context };
        assertCapabilityAccess(call, this.store.snapshot(), this.options.getOwnerId(), this.runtimeEpoch);
        if (call.context.taskId)
            new DependencyIndex(this.store).assertToolAllowed(call.context.taskId, call.toolId, { bindings: call.context.taskBindings });
        const state = this.store.snapshot(), tool = state.tools[call.toolId]!, connection = state.connections[tool.connectionId]!;
        if (tool.effect !== 'read' && !call.context.unattended && !await this.options.approveWrite?.(call, tool, connection))
            throw new IntegrationError('ACCESS_DENIED', '本次写入或未知副作用操作未获批准');
        assertCapabilityAccess(call, this.store.snapshot(), this.options.getOwnerId(), this.runtimeEpoch);
        const controller = new AbortController(), group = this.calls.get(connection.id) ?? new Set<AbortController>();
        group.add(controller);
        this.calls.set(connection.id, group);
        try {
            const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(connection.config.type === 'mcp' ? 60000 : 30000)]);
            if (connection.config.type === 'mcp') {
                const discovery = await this.mcp.connect(connection, combined);
                const discovered = discovery.tools.map(item => ({ ...item, effect: 'unknown' as const }));
                const digest = hash(discovered.map(item => [item.name, item.inputSchema, item.effect]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
                const prior = hash(Object.values(this.store.snapshot().tools).filter(item => item.connectionId === connection.id).map(item => [item.operationId, item.inputSchema, item.effect]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
                if (digest !== prior) {
                    await this.store.change(latest => { const c = latest.connections[connection.id]; if (!c || c.revision !== connection.revision)
                        throw new IntegrationError('VERSION_CONFLICT', '连接已变化'); this.replaceTools(latest, c, discovered); c.revision++; });
                    throw new IntegrationError('SCHEMA_CHANGED', '服务器工具已变化，请重试当前请求');
                }
                assertCapabilityAccess(call, this.store.snapshot(), this.options.getOwnerId(), this.runtimeEpoch);
            }
            const result = connection.config.type === 'api' ? await this.api.invoke(connection.config, tool.operationId, call.arguments, combined) : connection.config.type === 'mcp' ? await this.mcp.invoke(connection.id, tool.rawName ?? tool.operationId, normalizeMcpQueryArguments(tool.inputSchema, call.arguments), combined) : await this.providers[connection.providerId]?.invoke(connection, tool.operationId, call.arguments, combined);
            if (!result)
                throw new IntegrationError('RUNTIME_UNAVAILABLE', '应用适配器不可用');
            try {
                combined.throwIfAborted();
                assertCapabilityAccess(call, this.store.snapshot(), this.options.getOwnerId(), this.runtimeEpoch);
            }
            catch {
                throw new IntegrationError(tool.effect === 'read' ? 'ACCESS_DENIED' : 'RESULT_UNKNOWN', tool.effect === 'read' ? '权限或账户已变化，未返回旧请求的数据' : '权限已变化或等待结果已取消；外部操作可能已完成，未自动重试');
            }
            if (result.errorCode === 'AUTH_REQUIRED')
                await this.expireConnection(connection);
            await this.recordCall(call, connection.id, result.isError ? 'failed' : 'succeeded', result.errorCode);
            return { ...result, callId: call.callId };
        }
        catch (error) {
            const code = error instanceof IntegrationError ? error.code : 'RESULT_UNKNOWN';
            if (code === 'AUTH_REQUIRED')
                await this.expireConnection(connection);
            await this.recordCall(call, connection.id, code === 'RESULT_UNKNOWN' ? 'unknown' : 'failed', code);
            throw error;
        }
        finally {
            group.delete(controller);
            if (!group.size)
                this.calls.delete(connection.id);
        }
    }
    private async removeCredentials(connection: Connection) { const refs = [connection.config.auth.credentialRef, ...(connection.config.type === 'mcp' ? Object.values(connection.config.env ?? {}) : [])].filter((ref): ref is string => !!ref); await Promise.all([...new Set(refs)].map(ref => this.vault.remove(ref))); }
    private async expireConnection(previous: Connection) { await this.store.change(state => { const c = state.connections[previous.id]; if (c?.revision === previous.revision) {
        c.authState = 'expired';
        c.health = 'unreachable';
        c.lastError = isBundledDatayesId(c.id) ? 'EWork 登录已失效，请重新登录后测试连接' : '授权已失效，请重新授权';
        c.revision++;
    } }); }
    private async recordCall(call: ToolCall, connectionId: string, status: 'succeeded' | 'failed' | 'unknown', errorCode?: import('../../shared/integrations').IntegrationErrorCode) { await this.store.change(state => { state.calls.push({ id: call.callId, toolId: call.toolId, connectionId, sessionId: call.context.sessionId, taskId: call.context.taskId, time: Date.now(), status, errorCode }); state.calls = state.calls.slice(-1000); }); }
    private abortCalls(connectionId: string) { for (const controller of this.calls.get(connectionId) ?? [])
        controller.abort(); }
    rotateIdentity() { this.runtimeEpoch = randomUUID(); this.operations.abortAll(); for (const key of this.calls.keys())
        this.abortCalls(key); void this.mcp.disposeAll(); void this.syncBundledDatayes(true).catch(()=>{}); }
    async dispose() { this.disposed=true; this.rotateIdentity(); await this.operations.dispose(); await this.mcp.disposeAll(); }
}
