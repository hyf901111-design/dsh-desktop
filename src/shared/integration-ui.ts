/** Renderer projections. Secrets may be submitted once, but must never appear in replies. */
export type IntegrationTab = 'plugins' | 'apps' | 'mcp' | 'skills';
export type MarketKind = 'plugin' | 'app' | 'tool' | 'skill';
export type UiEntityKind = 'plugin' | 'connection' | 'skill';
export type IntegrationRow = {
    id: string;
    kind: UiEntityKind;
    tab: IntegrationTab;
    name: string;
    description: string;
    enabled: boolean;
    status: string;
    source: string;
    detail?: string;
    revision: number;
    invocationName?: string;
    invocationLabel?: string;
    toolCount?: number;
    tools?: Array<{
        id: string;
        name: string;
        description: string;
        allowed: boolean;
    }>;
    canRollback?: boolean;
    marketEntryId?: string;
    configurable?: boolean;
    removable?: boolean;
    toggleable?: boolean;
    toggleDisabledReason?: string;
    toolsReadonly?: boolean;
    connectionType?: ConnectionDraft['type'];
    connectionSummary?: { workspaceLabel: string; authLabel: string; dependencies: string[]; healthDetail?: string };
};
export type TaskCapabilitySummary = {
    entityId: string;
    kind: UiEntityKind;
    name: string;
    revision: number;
    available: boolean;
    unavailableReason?: string;
    /** Undefined means every workspace of the current account. */
    workspaceIds?: string[];
    tools: Array<{ id: string; name: string; description: string; effect: 'read' | 'write' | 'destructive' | 'unknown'; schemaDigest: string; allowed: boolean; unavailableReason?: string }>;
};
export type IntegrationSnapshot = {
    ownerAccountId?: string;
    /** Historical names only; this projection never registers callable tools. */
    historicalToolLabels?: Array<{wireName:string;label:string}>;
    revision: number;
    rows: IntegrationRow[];
    runtimeStatus?: string;
    compatibilityStatus?: string;
    taskCapabilities?: TaskCapabilitySummary[];
};
export type MarketEntry = {
    category?: 'research' | 'office' | 'developer';
    capabilities?: Array<{ name: string; description: string }>;
    id: string;
    kind: MarketKind;
    name: string;
    description: string;
    publisher: string;
    version: string;
    installed: boolean;
    available: boolean;
    unavailableReason?: string;
    permissions: string[];
    blueprint?: Partial<ConnectionDraft>;
};
export type ConnectionDraft = {
    id?: string;
    name: string;
    type: 'api' | 'mcp-http' | 'mcp-stdio' | 'google-calendar' | 'notion';
    url: string;
    clientId?: string;
    command: string;
    args: string;
    cwd: string;
    env: string;
    authType: 'none' | 'bearer' | 'api-key';
    headerName: string;
    secret: string;
    toolsJson: string;
    openApiDocument: string;
    workspaceIds: string;
    allowPrivateNetwork: boolean;
};
export type SkillPreview = {
    previewId: string;
    name: string;
    description: string;
    content: string;
    files: string[];
    warnings: string[];
};
export type SkillDetailCommand = { type: 'skill-detail'; id: string; revision: number };
export type SkillDetail = {
    type: 'skill-detail';
    id: string;
    revision: number;
    content: string;
    invocationName: string;
    /** Readable English name; presentation never determines runtime lookup. */
    invocationLabel?: string;
    enabled: boolean;
    /** False identifies a known global block; absence does not grant session/workspace access. */
    usable?: false;
    unavailableReason?: string;
};
export function isSkillDetailCommand(value: unknown): value is SkillDetailCommand {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const command = value as Record<string, unknown>;
    return command.type === 'skill-detail' && typeof command.id === 'string' && command.id.length > 0 && command.id.length <= 256
        && /^[a-zA-Z0-9_.:-]+(?:\/[a-zA-Z0-9_.:-]+)*$/.test(command.id)
        && !command.id.split('/').some(part => ['.', '..', '__proto__', 'constructor', 'prototype'].includes(part))
        && typeof command.revision === 'number' && Number.isSafeInteger(command.revision) && command.revision >= 0
        && Object.keys(command).every(key => ['type', 'id', 'revision'].includes(key));
}
export type UiOperation = {
    id: string;
    status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    message: string;
    entityId?: string;
    cancellable: boolean;
};
export type Mutation = {
    requestId: string;
    expectedRevision: number;
};
export type IntegrationCommand = SkillDetailCommand | {
    type: 'legacy-preview';
} | {
    type: 'migrate-legacy-skills';
    meta: Mutation;
} | {
    type: 'snapshot';
} | {
    type: 'market';
    kind: MarketKind;
} | {
    type: 'set-enabled';
    kind: UiEntityKind;
    id: string;
    enabled: boolean;
    meta: Mutation;
} | {
    type: 'dependencies';
    kind: UiEntityKind;
    id: string;
} | {
    type: 'uninstall';
    kind: UiEntityKind;
    id: string;
    meta: Mutation;
} | {
    type: 'rollback-plugin';
    id: string;
    meta: Mutation;
} | {
    type: 'disconnect';
    id: string;
    meta: Mutation;
} | {
    type: 'save-connection';
    draft: ConnectionDraft;
    meta: Mutation;
} | {
    type: 'connection-draft';
    id: string;
} | {
    type: 'probe';
    id: string;
} | {
    type: 'compile-openapi';
    document: string;
} | {
    type: 'grant-tools';
    id: string;
    toolIds: string[];
    meta: Mutation;
} | {
    type: 'preview-skill';
    path?: string;
} | {
    type: 'import-skill';
    previewId: string;
    mode: 'copy' | 'replace';
    meta: Mutation;
} | {
    type: 'install';
    entryId: string;
    meta: Mutation;
} | {
    type: 'create-plugin';
    manifest: string;
    meta: Mutation;
} | {
    type: 'add-source';
    url: string;
    meta: Mutation;
} | {
    type: 'authorize';
    id: string;
    meta: Mutation;
} | {
    type: 'operation';
    id: string;
} | {
    type: 'cancel-operation';
    id: string;
};
export type SkillImportDiagnostic = {
    code: string;
    reason: string;
    guidance: string;
    resourcePath?: string;
    actual?: number;
    limit?: number;
    unit?: 'bytes' | 'files';
};
export type LegacySkillPreviewItem = {
    name: string;
    status: string;
    message?: string;
    sourcePath?: string;
    kind?: 'personal' | 'project' | 'custom' | 'bundled';
    diagnostic?: SkillImportDiagnostic;
};
export type IntegrationReply = SkillDetail | {
    type: 'legacy-preview';
    items: LegacySkillPreviewItem[];
    eligibleCount: number;
} | {
    type: 'snapshot';
    snapshot: IntegrationSnapshot;
} | {
    type: 'market';
    entries: MarketEntry[];
} | {
    type: 'dependencies';
    descriptions: string[];
} | {
    type: 'operation';
    operation: UiOperation;
} | {
    type: 'draft';
    draft: ConnectionDraft;
} | {
    type: 'probe';
    status: 'verified' | 'config-valid' | 'unverified' | 'failed';
    message: string;
} | {
    type: 'compiled';
    toolsJson: string;
    diagnostics: string[];
} | {
    type: 'preview';
    preview: SkillPreview | null;
} | {
    type: 'cancelled';
};
export type SkillCommandSegment = {via:'menu';span:{start:number;end:number;draftRev:number}} | {via:'enter';token:string};
export type SkillComposerPrefill = { text: string; selectionStart: number; selectionEnd: number };
export interface IntegrationBridge {
    request(command: IntegrationCommand): Promise<IntegrationReply>;
    getPathForFile?(file: File): string;
    revealSource?(path: string): Promise<void>;
    useSkill?(input: { id: string; revision: number; invocationName: string; name: string; signal?: AbortSignal; sessionId?: string; expectedDraftRev?: number; commandSegment?: SkillCommandSegment; prefill?: SkillComposerPrefill }): Promise<void>;
}
export const emptyConnectionDraft = (type: ConnectionDraft['type'] = 'api'): ConnectionDraft => ({ name: '', type, url: '', clientId: '', command: '', args: '', cwd: '', env: '', authType: 'none', headerName: 'X-API-Key', secret: '', toolsJson: '[]', openApiDocument: '', workspaceIds: '', allowPrivateNetwork: false });
