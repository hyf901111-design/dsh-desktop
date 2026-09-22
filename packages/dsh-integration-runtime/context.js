import { isAbsolute } from 'node:path'

const id = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value)

export function isLiveAgent(ctx, agent) {
  return Boolean(agent && id(agent.id) && agent.session?.id === agent.id && ctx.agents.get(agent.id) === agent)
}

/** Identities come from the live Harness scope, never from model arguments. */
export async function resolveCapabilityContext(ctx, agent, snapshot, signal) {
  signal?.throwIfAborted()
  if (!isLiveAgent(ctx, agent) || !snapshot || !id(snapshot.ownerAccountId) || !id(snapshot.runtimeEpoch)) throw Error('当前执行未绑定有效会话')
  const cwd = agent.session.header?.cwd
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || cwd.includes('\0')) throw Error('当前会话未绑定工作区')
  const workspace = await ctx.workspaceRegistry.resolveByPath(cwd)
  signal?.throwIfAborted()
  if (!isLiveAgent(ctx, agent) || !workspace || !id(workspace.id) || workspace.path !== cwd) throw Error('当前会话的工作区不可用')
  let root = agent
  const visited = new Set([agent])
  // A durable fork header does not itself confer the creator's live privileges.
  while (root.session.header?.parentSession) {
    const parent = ctx.agents.get(root.session.header.parentSession)
    if (!parent || visited.has(parent) || visited.size >= 32 || !ctx.agents.isOwnedBy(root.id, parent)) break
    visited.add(parent); root = parent
  }
  return {
    sessionId: agent.id, rootSessionId: root.id, workspaceId: workspace.id,
    ownerAccountId: snapshot.ownerAccountId, unattended: false, runtimeEpoch: snapshot.runtimeEpoch
  }
}

export function connectionAllows(connection, tool, context) {
  if (!connection || !tool || !context || !connection.enabled || !tool.enabled || connection.authState !== 'connected') return false
  if (connection.ownerAccountId !== context.ownerAccountId || !connection.toolGrants.includes(tool.id)) return false
  const grant = connection.workspaceGrant
  const workspaceAllowed = grant?.mode === 'selected'
    ? Array.isArray(grant.workspaceIds) && grant.workspaceIds.includes(context.workspaceId)
    : grant?.mode === 'all-owned' && grant.ownerAccountId === context.ownerAccountId
  return Boolean(workspaceAllowed && (!context.unattended || connection.unattendedToolGrants.includes(tool.id)))
}
