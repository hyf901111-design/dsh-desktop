import { IntegrationError, type IntegrationBinding, type IntegrationErrorCode, type IntegrationState, type ToolBinding } from '../../shared/integrations'
import { validateIntegrationBindings } from '../../shared/scheduled-tasks'
import { IntegrationStore } from './store'

export interface DependencyIssue {
  code: IntegrationErrorCode
  entityId: string
  message: string
  route: string
  toolId?: string
}
export interface DependencyPreflight { ready: boolean; issues: DependencyIssue[] }
export interface DependencyImpact {
  entityId: string
  declaredTaskIds: string[]
  observedTaskIds: string[]
  taskCount: number
  /** Observed calls are evidence, not a claim that every natural-language dependency is known. */
  hasUntrackedDependents: true
}

function route(state: IntegrationState, id: string, kind?: IntegrationBinding['kind']): string {
  if (kind === 'plugin' || state.plugins[id]) return 'integrations/plugins'
  if (kind === 'skill' || state.skills[id]) return 'integrations/skills'
  return state.connections[id]?.kind === 'mcp' ? 'integrations/mcp' : 'integrations/apps'
}

function inspect(state: IntegrationState, bindings: IntegrationBinding[]): DependencyIssue[] {
  const issues: DependencyIssue[] = []
  const add = (code: IntegrationErrorCode, entityId: string, message: string, kind?: IntegrationBinding['kind'], toolId?: string) => {
    if (!issues.some(issue => issue.code === code && issue.entityId === entityId && issue.toolId === toolId)) {
      issues.push({ code, entityId, message, route: route(state, entityId, kind), ...(toolId ? { toolId } : {}) })
    }
  }
  const checkConnection = (id: string) => {
    const connection = state.connections[id]
    if (!connection) { add('NOT_FOUND', id, '任务所需的连接已删除'); return }
    if (!connection.enabled) add('DEPENDENCY_BLOCKED', id, `连接“${connection.name}”已停用`)
    if (connection.authState !== 'connected') add('AUTH_REQUIRED', id, `连接“${connection.name}”需要重新授权或测试`)
    return connection
  }
  for (const binding of bindings) {
    const entity = binding.kind === 'connection' ? state.connections[binding.entityId]
      : binding.kind === 'plugin' ? state.plugins[binding.entityId] : state.skills[binding.entityId]
    if (!entity) { add('NOT_FOUND', binding.entityId, '任务绑定的能力已删除，请重新选择', binding.kind); continue }
    if (!entity.enabled) add('DEPENDENCY_BLOCKED', entity.id, `“${entity.name}”已停用`, binding.kind)
    if (entity.revision !== binding.bindingRevision) add('VERSION_CONFLICT', entity.id, `“${entity.name}”的配置或权限已变化，请重新确认任务范围`, binding.kind)
    if (binding.kind === 'connection') checkConnection(entity.id)
    if (binding.kind === 'plugin') {
      const plugin = state.plugins[entity.id]!
      if (plugin.installState !== 'installed') add('DEPENDENCY_BLOCKED', entity.id, `插件“${entity.name}”尚未就绪`, binding.kind)
      for (const skillId of plugin.skillIds) {
        const skill = state.skills[skillId]
        if (!skill?.enabled) add('DEPENDENCY_BLOCKED', skillId, '插件依赖的技能缺失或已停用', 'skill')
        for (const connectionId of skill?.connectionRequirements ?? []) checkConnection(connectionId)
      }
    }
    if (binding.kind === 'skill') {
      const skill = state.skills[entity.id]!
      if (skill.ownerPluginId && (!state.plugins[skill.ownerPluginId]?.enabled || state.plugins[skill.ownerPluginId]?.installState !== 'installed')) {
        add('DEPENDENCY_BLOCKED', skill.ownerPluginId, '技能所属插件缺失、已停用或未就绪', 'plugin')
      }
      for (const connectionId of skill.connectionRequirements) checkConnection(connectionId)
    }
    for (const toolId of binding.toolIds) {
      const tool = state.tools[toolId]
      if (!tool) { add('NOT_FOUND', binding.entityId, '任务批准的工具已删除，请重新选择', binding.kind, toolId); continue }
      if (!belongsTo(state, binding, tool)) add('ACCESS_DENIED', binding.entityId, '任务工具不属于所选能力，未扩大授权', binding.kind, toolId)
      const connection = checkConnection(tool.connectionId)
      if (!tool.enabled || !connection?.toolGrants.includes(tool.id)) add('ACCESS_DENIED', tool.connectionId, `工具“${tool.name}”已停用或未授权`, 'connection', toolId)
      if (binding.schemaDigests[toolId] !== tool.schemaDigest) add('SCHEMA_CHANGED', tool.connectionId, `工具“${tool.name}”的参数或功能已变化，请重新确认`, 'connection', toolId)
      if (tool.effect !== 'read' && !binding.allowWrite) add('ACCESS_DENIED', tool.connectionId, `工具“${tool.name}”需要任务单独批准写入范围`, 'connection', toolId)
    }
  }
  return issues
}

function belongsTo(state: IntegrationState, binding: IntegrationBinding, tool: ToolBinding): boolean {
  if (binding.kind === 'connection') return tool.connectionId === binding.entityId
  if (binding.kind === 'plugin') return state.plugins[binding.entityId]?.toolBindings.includes(tool.id) ?? false
  return state.skills[binding.entityId]?.connectionRequirements.includes(tool.connectionId) ?? false
}

/** TaskStore is authoritative. This index mirrors approved bindings and never turns usage into permission. */
export class DependencyIndex {
  constructor(private readonly store: IntegrationStore) {}

  async syncBindings(taskId: string, bindings: IntegrationBinding[]): Promise<void> {
    this.validTaskId(taskId)
    const copied = validateIntegrationBindings(bindings)
    await this.store.change(state => { state.taskBindings[taskId] = copied })
  }

  async removeTask(taskId: string): Promise<void> {
    this.validTaskId(taskId)
    await this.store.change(state => { delete state.taskBindings[taskId] })
  }

  async preflight(taskId: string, claimedBindings?: IntegrationBinding[]): Promise<DependencyPreflight> {
    this.validTaskId(taskId)
    const state = this.store.snapshot()
    const bindings = validateIntegrationBindings(claimedBindings ?? state.taskBindings[taskId] ?? [])
    const issues = inspect(state, bindings)
    return { ready: issues.length === 0, issues }
  }

  /** Synchronous fresh-state guard for a trusted runtime task context; no task-wide default approval. */
  assertToolAllowed(taskId: string, toolId: string, options: { bindings?: IntegrationBinding[] } = {}): void {
    this.validTaskId(taskId)
    const state = this.store.snapshot()
    const bindings = validateIntegrationBindings(options.bindings ?? state.taskBindings[taskId] ?? [])
    const tool = state.tools[toolId]
    if (!tool || !bindings.some(binding => binding.toolIds.includes(toolId) && belongsTo(state, binding, tool))) {
      throw new IntegrationError('ACCESS_DENIED', '该工具未获得本次定时任务的明确批准')
    }
    const issue = inspect(state, bindings)[0]
    if (issue) throw new IntegrationError(issue.code, issue.message)
  }

  /** Produces a proposed binding; the user must save it through the task editor before it grants anything. */
  async recordUse(taskId: string, toolId: string, revision: number): Promise<IntegrationBinding> {
    this.validTaskId(taskId)
    const state = this.store.snapshot()
    const tool = state.tools[toolId]
    const connection = tool && state.connections[tool.connectionId]
    if (!tool || !connection) throw new IntegrationError('NOT_FOUND', '使用记录对应的工具或连接已删除')
    if (connection.revision !== revision) throw new IntegrationError('VERSION_CONFLICT', '连接版本已更新，请根据当前配置确认依赖')
    return { entityId: connection.id, kind: 'connection', bindingRevision: revision, toolIds: [tool.id], schemaDigests: { [tool.id]: tool.schemaDigest }, allowWrite: false }
  }

  async impact(entityId: string): Promise<DependencyImpact> {
    const state = this.store.snapshot()
    const plugin = state.plugins[entityId]
    const skill = state.skills[entityId]
    const relatedConnections = new Set(skill?.connectionRequirements ?? [])
    if (state.connections[entityId]) relatedConnections.add(entityId)
    const relatedTools = new Set(plugin?.toolBindings ?? [])
    for (const tool of Object.values(state.tools)) if (relatedConnections.has(tool.connectionId) || tool.id === entityId) relatedTools.add(tool.id)
    const declaredTaskIds = Object.entries(state.taskBindings).filter(([, bindings]) => bindings.some(binding =>
      binding.entityId === entityId || binding.toolIds.some(id => relatedTools.has(id))
      || (binding.kind === 'skill' && state.skills[binding.entityId]?.connectionRequirements.includes(entityId))
      || (binding.kind === 'plugin' && state.plugins[binding.entityId]?.skillIds.includes(entityId))
    )).map(([taskId]) => taskId).sort()
    const observedTaskIds = [...new Set(state.calls.filter(call => call.taskId && (call.connectionId === entityId || relatedTools.has(call.toolId))).map(call => call.taskId!))].sort()
    return { entityId, declaredTaskIds, observedTaskIds, taskCount: new Set([...declaredTaskIds, ...observedTaskIds]).size, hasUntrackedDependents: true }
  }

  private validTaskId(taskId: string): void {
    if (typeof taskId !== 'string' || !taskId || taskId.length > 512 || ['__proto__', 'constructor', 'prototype'].includes(taskId)) {
      throw new IntegrationError('INVALID_CONFIG', '任务标识无效')
    }
  }
}
