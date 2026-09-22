import { IntegrationError, type ToolCall, type IntegrationState } from '../../shared/integrations';
export function assertCapabilityAccess(call: ToolCall, state: IntegrationState, owner: string | undefined, epoch: string): void {
    const tool = state.tools[call.toolId], connection = tool && state.connections[tool.connectionId];
    const deny = () => { throw new IntegrationError('ACCESS_DENIED', '该能力未获授权、已停用或配置已变化，请在插件中检查连接'); };
    if (!owner || !call.context || call.context.ownerAccountId !== owner || call.context.runtimeEpoch !== epoch || !call.context.sessionId || !call.context.workspaceId)
        return deny();
    if (!tool || !connection || connection.ownerAccountId !== owner || !connection.enabled || !tool.enabled || connection.authState !== 'connected' || connection.revision !== call.connectionRevision || !connection.toolGrants.includes(tool.id))
        return deny();
    const grant = connection.workspaceGrant;
    if (grant.mode === 'selected' ? !grant.workspaceIds.includes(call.context.workspaceId) : grant.ownerAccountId !== owner)
        return deny();
    if (call.context.unattended) {
        if (call.context.taskId) {
            const binding = call.context.taskBindings?.find(b => b.toolIds.includes(tool.id));
            if (!binding || binding.schemaDigests[tool.id] !== tool.schemaDigest || tool.effect !== 'read' && !binding.allowWrite)
                return deny();
        }
        else if (!connection.unattendedToolGrants.includes(tool.id))
            return deny();
    }
}
