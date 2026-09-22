import type { TaskCapabilitySummary } from '../../shared/integration-ui';
import type { IntegrationState, Connection, ToolBinding } from '../../shared/integrations';
export function projectTaskCapabilities(state: IntegrationState, owner: string | undefined): TaskCapabilitySummary[] {
    if (!owner)
        return [];
    const owned = (entity: {
        ownerAccountId?: string;
    }) => !entity.ownerAccountId || entity.ownerAccountId === owner;
    const connectionIssue = (connection: Connection | undefined): string | undefined => !connection || connection.ownerAccountId !== owner ? '连接不可用或属于其他账户'
        : !connection.enabled ? '连接已停用'
            : connection.authState !== 'connected' ? '连接需要授权或测试' : undefined;
    const projectTools = (tools: ToolBinding[]) => tools.map(tool => {
        const connection = state.connections[tool.connectionId];
        const unavailableReason = connectionIssue(connection) ?? (!tool.enabled || !connection?.toolGrants.includes(tool.id) ? '请先在连接中批准此工具' : undefined);
        return { id: tool.id, name: tool.name, description: tool.description, effect: tool.effect,
            schemaDigest: tool.schemaDigest, allowed: !unavailableReason, unavailableReason };
    });
    const allTools = Object.values(state.tools);
    const scopeFor = (connectionIds: string[]): string[] | undefined => {
        let scope: string[] | undefined;
        for (const id of connectionIds) {
            const connection = state.connections[id];
            if (!connection || connection.ownerAccountId !== owner)
                return [];
            if (connection.workspaceGrant.mode === 'selected')
                scope = scope === undefined ? [...connection.workspaceGrant.workspaceIds] : scope.filter(id => connection.workspaceGrant.mode === 'selected' && connection.workspaceGrant.workspaceIds.includes(id));
        }
        return scope;
    };
    const result: TaskCapabilitySummary[] = Object.values(state.connections).filter(c => c.ownerAccountId === owner).map(c => ({
        entityId: c.id, kind: 'connection', name: c.name, revision: c.revision,
        available: !connectionIssue(c), unavailableReason: connectionIssue(c),
        workspaceIds: c.workspaceGrant.mode === 'selected' ? [...c.workspaceGrant.workspaceIds] : undefined,
        tools: projectTools(allTools.filter(tool => tool.connectionId === c.id)),
    }));
    for (const skill of Object.values(state.skills).filter(owned)) {
        const parent = skill.ownerPluginId ? state.plugins[skill.ownerPluginId] : undefined;
        const unavailableReason = !skill.enabled ? '技能已停用' : skill.ownerPluginId && (!parent?.enabled || !owned(parent)) ? '所属插件不可用' : skill.connectionRequirements.map(id => connectionIssue(state.connections[id])).find(Boolean);
        result.push({ entityId: skill.id, kind: 'skill', name: skill.name, revision: skill.revision,
            available: !unavailableReason, unavailableReason, workspaceIds: scopeFor(skill.connectionRequirements),
            tools: projectTools(allTools.filter(tool => skill.connectionRequirements.includes(tool.connectionId))) });
    }
    for (const plugin of Object.values(state.plugins).filter(owned)) {
        if (plugin.catalogKind === 'skill')
            continue;
        const unavailableReason = !plugin.enabled ? '插件已停用' : plugin.installState !== 'installed' ? '插件尚未就绪'
            : plugin.skillIds.some(id => !state.skills[id]?.enabled || !owned(state.skills[id]!)) ? '插件技能缺失或已停用' : undefined;
        result.push({ entityId: plugin.id, kind: 'plugin', name: plugin.name, revision: plugin.revision,
            available: !unavailableReason, unavailableReason, workspaceIds: scopeFor(allTools.filter(tool => plugin.toolBindings.includes(tool.id)).map(tool => tool.connectionId)), tools: projectTools(allTools.filter(tool => plugin.toolBindings.includes(tool.id))) });
    }
    return result;
}
