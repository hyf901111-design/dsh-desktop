export type EntityKind = 'plugin' | 'connection' | 'skill';
export type CatalogKind = 'plugin' | 'app' | 'tool' | 'skill';
export type Effect = 'read' | 'write' | 'destructive' | 'unknown';
export type JsonSchema = Record<string, unknown>;
export type WorkspaceGrant = {
    mode: 'selected';
    workspaceIds: string[];
} | {
    mode: 'all-owned';
    ownerAccountId: string;
};
export type MutationMeta = {
    requestId: string;
    expectedRevision: number;
};
export type IntegrationErrorCode = 'VERSION_CONFLICT' | 'AUTH_REQUIRED' | 'ACCESS_DENIED' | 'INVALID_CONFIG' | 'NETWORK_BLOCKED' | 'TIMEOUT' | 'RESPONSE_TOO_LARGE' | 'RESULT_UNKNOWN' | 'RUNTIME_UNAVAILABLE' | 'CANCELLED' | 'STORAGE_UNAVAILABLE' | 'NOT_FOUND' | 'DEPENDENCY_BLOCKED' | 'SCHEMA_CHANGED';
export class IntegrationError extends Error {
    constructor(public readonly code: IntegrationErrorCode, message: string) { super(message); this.name = 'IntegrationError'; }
}
export type AuthConfig = {
    type: 'none' | 'bearer' | 'api-key' | 'header';
    headerName?: string;
    credentialRef?: string;
};
export type NetworkPolicy = {
    allowLocal?: boolean;
    allowedOrigins?: string[];
};
export type ApiOperation = {
    id: string;
    name: string;
    description: string;
    method: string;
    path: string;
    inputSchema: JsonSchema;
    effect: Effect;
    queryParams?: string[];
    pathParams?: string[];
    bodyKey?: string;
};
export type ApiConfig = {
    type: 'api';
    baseUrl: string;
    auth: AuthConfig;
    operations: ApiOperation[];
    network: NetworkPolicy;
};
export type McpConfig = {
    type: 'mcp';
    transport: 'stdio' | 'http';
    url?: string;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    auth: AuthConfig;
    network: NetworkPolicy;
};
export type AppConfig = {
    type: 'app';
    provider: 'google-calendar' | 'notion';
    auth: AuthConfig;
    clientId?: string;
    brokerUrl?: string;
};
export type ConnectionConfig = ApiConfig | McpConfig | AppConfig;
export type Connection = {
    id: string;
    name: string;
    providerId: string;
    kind: 'api' | 'mcp' | 'app';
    ownerAccountId: string;
    config: ConnectionConfig;
    enabled: boolean;
    revision: number;
    authState: 'unconfigured' | 'authorizing' | 'connected' | 'expired' | 'revoked';
    health: 'unknown' | 'checking' | 'healthy' | 'degraded' | 'unreachable';
    workspaceGrant: WorkspaceGrant;
    toolGrants: string[];
    /** Explicit user opt-outs; newly discovered tools are otherwise allowed by default. */
    deniedToolIds?: string[];
    unattendedToolGrants: string[];
    accountLabel?: string;
    lastError?: string;
    createdAt: number;
    updatedAt: number;
    lastCheckedAt?: number;
    configDigest: string;
    negotiatedVersion?: string;
};
export type ToolBinding = {
    id: string;
    connectionId: string;
    operationId: string;
    name: string;
    description: string;
    inputSchema: JsonSchema;
    effect: Effect;
    enabled: boolean;
    schemaDigest: string;
    rawName?: string;
};
export type SkillInstall = {
    id: string;
    name: string;
    description: string;
    provider: string;
    source: string;
    sourceId: string;
    version: string;
    ownerPluginId?: string;
    ownerAccountId?: string;
    enabled: boolean;
    revision: number;
    bodyDigest: string;
    resourceRoot: string;
    connectionRequirements: string[];
    createdAt: number;
};
export type PluginInstall = {
    id: string;
    packageId: string;
    name: string;
    description: string;
    sourceId: string;
    version: string;
    digest: string;
    owner: 'bundled' | 'user' | 'legacy';
    ownerAccountId?: string;
    catalogEntryId?: string;
    previousVersion?: {
        plugin: Omit<PluginInstall, 'previousVersion'>;
        skills: SkillInstall[];
    };
    catalogKind?: CatalogKind;
    enabled: boolean;
    skillIds: string[];
    /** User-deleted skills stay excluded across ordinary updates and rollbacks. */
    excludedSkillIds?: string[];
    toolBindings: string[];
    installState: 'installed' | 'pending-runtime' | 'failed';
    revision: number;
    packageRoot: string;
    createdAt: number;
};
export type Operation = {
    id: string;
    ownerAccountId?: string;
    requestId: string;
    kind: string;
    entityId: string;
    phase: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
    progress?: string;
    errorCode?: IntegrationErrorCode;
    error?: string;
    cancelable: boolean;
    startedAt: number;
    finishedAt?: number;
    revision: number;
};
export type OperationReceipt = {
    operationId: string;
    entityId: string;
    revision: number;
};
export type CatalogSource = {
    id: string;
    name: string;
    url: string;
    trusted: boolean;
    credentialRef?: string;
    publicKey?: string;
};
export type CatalogEntry = {
    category?: 'research' | 'office' | 'developer';
    id: string;
    kind: CatalogKind;
    name: string;
    description: string;
    publisher: string;
    version: string;
    sourceId: string;
    minClientVersion?: string;
    digest?: string;
    url?: string;
    providerId?: string;
    manifest?: Record<string, unknown>;
    permissions: string[];
    available: boolean;
    unavailableReason?: string;
};
export type IntegrationBinding = {
    entityId: string;
    kind: EntityKind;
    bindingRevision: number;
    toolIds: string[];
    schemaDigests: Record<string, string>;
    allowWrite: boolean;
};
export type CapabilityContext = {
    sessionId: string;
    rootSessionId: string;
    workspaceId: string;
    ownerAccountId: string;
    taskId?: string;
    taskBindings?: IntegrationBinding[];
    unattended: boolean;
    runtimeEpoch: string;
};
export type ToolCall = {
    callId: string;
    toolId: string;
    connectionRevision: number;
    arguments: Record<string, unknown>;
    context: CapabilityContext;
};
export type AdapterResult = {
    content: Array<{
        type: 'text';
        text: string;
    }>;
    isError?: boolean;
    errorCode?: IntegrationErrorCode;
};
export type ToolResult = AdapterResult & {
    callId: string;
};
export type ProbeResult = {
    configDigest: string;
    status: 'verified' | 'config-valid' | 'unverified' | 'failed';
    testedOperationId?: string;
    checkedAt: number;
    error?: string;
};
export type CallEvidence = {
    id: string;
    toolId: string;
    connectionId: string;
    sessionId: string;
    taskId?: string;
    time: number;
    status: 'succeeded' | 'failed' | 'unknown';
    errorCode?: IntegrationErrorCode;
};
export type IntegrationState = {
    schemaVersion: 1;
    revision: number;
    /** Account-scoped preferences; trusted bundled content is never copied into user state. */
    bundledPluginPreferences?: Record<string, Record<string, {enabled: boolean; revision: number}>>;
    bundledSkillPreferences?: Record<string, Record<string, {enabled: boolean; revision: number}>>;
    connections: Record<string, Connection>;
    plugins: Record<string, PluginInstall>;
    skills: Record<string, SkillInstall>;
    tools: Record<string, ToolBinding>;
    operations: Record<string, Operation>;
    sources: Record<string, CatalogSource>;
    taskBindings: Record<string, IntegrationBinding[]>;
    calls: CallEvidence[];
};
export function emptyIntegrationState(): IntegrationState { return { schemaVersion: 1, revision: 0, connections: {}, plugins: {}, skills: {}, tools: {}, operations: {}, sources: {}, taskBindings: {}, calls: [] }; }
export function integrationMessage(error: unknown): string {
    if (error instanceof IntegrationError)
        return error.message;
    return '操作未完成，请检查配置或连接后重试';
}
