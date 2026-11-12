import { IntegrationError, type CapabilityContext } from '../../shared/integrations';
import type { ScheduledTask } from '../../shared/scheduled-tasks';
/** Harness supplies live session identity. Task privileges come only from the durable scheduler. */
export async function resolveIntegrationContext(input: CapabilityContext, options: {
    ownerId: string | undefined;
    tasks: ScheduledTask[];
    workspaces(): Promise<Array<{
        workspaceId: string;
        path: string;
        sessionIds?: string[];
    }>>;
    sessions(sessionId: string): Promise<Array<{
        sessionId: string;
        cwd?: string;
        origin?: string;
        parentSessionId?: string;
    }>>;
}): Promise<CapabilityContext> {
    if (!options.ownerId || input.ownerAccountId !== options.ownerId ||
        !input.sessionId || !input.rootSessionId || !input.workspaceId) {
        throw new IntegrationError('ACCESS_DENIED', '当前会话或账户身份已变化');
    }
    const [workspaces, sessions] = await Promise.all([options.workspaces(), options.sessions(input.sessionId)]).catch(error => {
        if (error instanceof IntegrationError) throw error;
        throw new IntegrationError('RUNTIME_UNAVAILABLE', '会话身份暂时无法核验，数据请求尚未发出');
    });
    const session = sessions.find(item => item.sessionId === input.sessionId);
    const workspace = workspaces.find(item => item.workspaceId === input.workspaceId);
    if (!session || !workspace || (session.cwd ? session.cwd !== workspace.path : !workspace.sessionIds?.includes(session.sessionId))) {
        throw new IntegrationError('ACCESS_DENIED', '当前工作区不可用');
    }
    let root = session;
    const seen = new Set([root.sessionId]);
    while (root.origin === 'subagent' && root.parentSessionId) {
        const parent = sessions.find(item => item.sessionId === root.parentSessionId);
        if (!parent || seen.has(parent.sessionId) || seen.size >= 32 || (parent.cwd && parent.cwd !== workspace.path))
            throw new IntegrationError('ACCESS_DENIED', '研究子会话的授权来源不可用');
        root = parent;
        seen.add(root.sessionId);
    }
    if (input.rootSessionId !== root.sessionId)
        throw new IntegrationError('ACCESS_DENIED', '会话父级身份不匹配');
    const sessionIds = new Set([input.sessionId, root.sessionId]);
    const candidates = options.tasks.filter(item => !item.deletedAt && ((item.sessionId && sessionIds.has(item.sessionId)) ||
        item.runs.some(run => run.sessionId && sessionIds.has(run.sessionId)) ||
        (item.component && sessionIds.has(item.component.sessionId) && item.runs.some(run => run.status === 'running'))));
    const selected = candidates.find(item=>item.id===input.taskId);
    const task = input.taskId?.startsWith('component-data:') ? selected : selected ?? candidates.find(item=>!item.id.startsWith('component-data:'));
    if(input.taskId?.startsWith('component-data:') && !task)throw new IntegrationError('ACCESS_DENIED','组件数据更新已暂停或配置已变化');
    // Explicitly overwrite, rather than spread, all scheduler-owned fields.
    return {
        sessionId: input.sessionId, rootSessionId: root.sessionId,
        workspaceId: input.workspaceId, ownerAccountId: options.ownerId,
        runtimeEpoch: input.runtimeEpoch, unattended: Boolean(task),
        taskId: task?.id, taskBindings: task ? structuredClone(task.integrationBindings ?? []) : undefined,
    };
}
