import { COMPUTER_USE_TOOL, createComputerUseController } from './computer-use.js'
import { COMPUTER_USE_GUIDANCE } from './computer-use-tools.js'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { connectionAllows, isLiveAgent, resolveCapabilityContext } from './context.js'
import { createToolProxy, toolRegistrationName, validateToolBinding } from './tool-proxy.js'
import { registerManagedSkillProvider } from './skill-provider.js'
import { validateManagedSkills, enabledManagedSkill, managedSkillInvocationName, stableBuiltinSkillAlias, stableBuiltinSkillAliases } from './skill-policy.js'
import { projectMcpInputSchema } from './schema-projection.js'
import { financeSkillGuidance, equityResearchSkillGuidance } from './skill-priority.js'

export const name = 'ework-integrations'
export const inject = ['tools', 'skills', 'agents', 'workspaceRegistry', 'llm', 'attachments']
const unavailable = () => Error('连接服务暂时不可用，请检查连接后重试')
const explicitManagedSkillPattern = new RegExp(`(?:^|\\s)\\/(ework-skill-[a-f0-9]{16}|${Object.values(stableBuiltinSkillAliases).join('|')})(?=\\s|$)`, 'g')
const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\u0000-\u001f]/.test(value)
const integrationErrorCodes = new Set(['VERSION_CONFLICT', 'AUTH_REQUIRED', 'ACCESS_DENIED', 'INVALID_CONFIG', 'NETWORK_BLOCKED', 'TIMEOUT', 'RESPONSE_TOO_LARGE', 'RESULT_UNKNOWN', 'RUNTIME_UNAVAILABLE', 'CANCELLED', 'STORAGE_UNAVAILABLE', 'NOT_FOUND', 'DEPENDENCY_BLOCKED', 'SCHEMA_CHANGED'])
// A rejected operation is not evidence that the authenticated bridge is unavailable.
class BridgeIntegrationError extends HarnessError {}

function bridgeConfig(env) {
  let config
  try { config = JSON.parse(env.EWORK_INTEGRATION_BRIDGE ?? '') } catch { throw unavailable() }
  let url
  try { url = new URL(config.url) } catch { throw unavailable() }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !identifier(config.token)) throw unavailable()
  return { url: url.origin, token: config.token }
}

function validateSnapshot(value) {
  if (!value || !Number.isSafeInteger(value.revision) || value.revision < 0 || !identifier(value.runtimeEpoch) || !identifier(value.ownerAccountId)) throw unavailable()
  for (const key of ['connections', 'tools', 'skills', 'plugins']) {
    if (!Array.isArray(value[key]) || value[key].length > 10000 || new Set(value[key].map(item => item?.id)).size !== value[key].length || value[key].some(item => !identifier(item?.id))) throw unavailable()
  }
  for (const connection of value.connections) {
    if (!identifier(connection.ownerAccountId) || !Number.isSafeInteger(connection.revision) || connection.revision < 0 || typeof connection.enabled !== 'boolean' || !['unconfigured', 'authorizing', 'connected', 'expired', 'revoked'].includes(connection.authState)) throw unavailable()
    if (!Array.isArray(connection.toolGrants) || !Array.isArray(connection.unattendedToolGrants) || [...connection.toolGrants, ...connection.unattendedToolGrants].some(item => !identifier(item))) throw unavailable()
    const grant = connection.workspaceGrant
    if (!grant || !['selected', 'all-owned'].includes(grant.mode) || (grant.mode === 'selected' && (!Array.isArray(grant.workspaceIds) || grant.workspaceIds.some(item => !identifier(item)))) || (grant.mode === 'all-owned' && !identifier(grant.ownerAccountId))) throw unavailable()
  }
  value.tools = value.tools.map(tool => ({ ...tool, inputSchema: projectMcpInputSchema(tool.inputSchema) }))
  value.tools.forEach(validateToolBinding)
  validateManagedSkills(value)
  if (new Set(value.tools.map(tool => toolRegistrationName(tool.id))).size !== value.tools.length) throw unavailable()
  return value
}

/** Every call is bounded, authenticated, cancellable, and never follows a redirect. */
function createBridge(config, fetchRequest, timeoutMs) {
  const pending = new Set(), controllers = new Set()
  let disposed = false
  const request = async (path, body, signal) => {
    if (disposed) throw unavailable()
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true })
    let timedOut = false
    const deadlineMs = path === '/execute' ? timeoutMs : Math.min(timeoutMs, 10000)
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, deadlineMs)
    controllers.add(controller)
    const operation = (async () => {
      const response = await fetchRequest(`${config.url}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { authorization: `Bearer ${config.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: controller.signal })
      if (!response.ok && response.status !== 400 && response.status !== 403) { await response.body?.cancel(); throw unavailable() }
      const maxBytes = response.ok ? 8 * 1024 * 1024 : 16 * 1024
      if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw unavailable() }
      const reader = response.body?.getReader()
      if (!reader) throw unavailable()
      const decoder = new TextDecoder(), chunks = []; let total = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          if (total > maxBytes) { await reader.cancel(); throw unavailable() }
          chunks.push(decoder.decode(value, { stream: true }))
        }
        chunks.push(decoder.decode())
        controller.signal.throwIfAborted()
        const value = JSON.parse(chunks.join(''))
        if (!response.ok) {
          if (!value || !integrationErrorCodes.has(value.code) || typeof value.error !== 'string' || !value.error.trim() || value.error.length > 4000 || (response.status === 403) !== (value.code === 'ACCESS_DENIED')) throw unavailable()
          throw new BridgeIntegrationError(value.error, value.code)
        }
        return value
      } finally { reader.releaseLock() }
    })()
    pending.add(operation)
    try { return await operation } catch (error) {
      if (error instanceof BridgeIntegrationError) throw error
      // A single slow tool call does not prove that the bridge or its grants disappeared.
      // Its external result may be unknown, so never replay it automatically.
      if (timedOut && path === '/execute') throw new BridgeIntegrationError('工具执行超时，外部结果可能已完成；未自动重试', 'RESULT_UNKNOWN')
      throw unavailable()
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); controllers.delete(controller); pending.delete(operation) }
  }
  return { request, async dispose() { disposed = true; for (const controller of controllers) controller.abort(); await Promise.allSettled([...pending]) } }
}

/** Register managed capabilities into the real Harness services, retaining exact disposers. */
export function createIntegrationRuntime(ctx, { env = process.env, fetch: fetchRequest = globalThis.fetch, pollIntervalMs = 2000, requestTimeoutMs = 65000 } = {}) {
  const bridge = createBridge(bridgeConfig(env), fetchRequest, requestTimeoutMs)
  const tools = new Map(), agents = new Map(), listeners = [], changes = new Set()
  let snapshot, available = false, disposed = false, refreshingRestrictions = false, syncing, timer, disposal, computerUse
  const currentConnections = () => new Map((snapshot?.connections ?? []).map(connection => [connection.id, connection]))
  const allowed = (binding, context) => available && context?.runtimeEpoch === snapshot.runtimeEpoch && context?.ownerAccountId === snapshot.ownerAccountId && connectionAllows(currentConnections().get(binding.connectionId), binding, context)

  const allowsComputerUse = agent => {
    const context = agents.get(agent)?.context
    return available && isLiveAgent(ctx, agent) && context?.runtimeEpoch === snapshot.runtimeEpoch && context?.ownerAccountId === snapshot.ownerAccountId
  }
  const refreshRestrictions = () => {
    if (refreshingRestrictions || disposed) return
    refreshingRestrictions = true
    try {
      for (const [agent, state] of agents) {
        if (!isLiveAgent(ctx, agent)) continue
        const deny = [...tools.values()].filter(entry => !allowed(entry.binding, state.context)).map(entry => entry.name).sort()
        if (ctx.tools.get(COMPUTER_USE_TOOL) && !allowsComputerUse(agent)) deny.push(COMPUTER_USE_TOOL)
        const key = JSON.stringify(deny)
        if (key === state.key) continue
        // Install the more restrictive replacement before releasing the old mask.
        const next = deny.length > 0 ? agent.ctx.tools.restrict({ deny }) : undefined
        const previous = state.dispose; state.dispose = next; state.key = key; previous?.()
      }
    } finally { refreshingRestrictions = false }
  }
  const attach = agent => {
    if (disposed || agents.has(agent) || !isLiveAgent(ctx, agent)) return
    agents.set(agent, { context: undefined, key: undefined, dispose: undefined })
    refreshRestrictions()
  }
  const clearTools = () => { const entries = [...tools.values()]; tools.clear(); for (const entry of entries) entry.dispose(); refreshRestrictions() }
  const changed = () => { for (const listener of changes) listener() }
  const failClosed = () => { const wasAvailable = available; available = false; for (const state of agents.values()) state.context = undefined; clearTools(); if (wasAvailable) changed(); void computerUse?.sync(undefined).catch(() => {}) }

  const runtime = {
    async request(path, body, signal) { try { return await bridge.request(path, body, signal) } catch (error) { if (!disposed && !signal?.aborted && !(error instanceof BridgeIntegrationError)) failClosed(); throw error } },
    onChange(listener) { changes.add(listener); return () => changes.delete(listener) },
    get snapshot() { return available ? snapshot : undefined },
    async contextFor(agent, signal) {
      if (!available || disposed) throw unavailable()
      const context = await resolveCapabilityContext(ctx, agent, snapshot, signal)
      if (!available || disposed || context.runtimeEpoch !== snapshot.runtimeEpoch || context.ownerAccountId !== snapshot.ownerAccountId) throw unavailable()
      return context
    },
    authorize(binding, context) {
      const current = tools.get(binding.id)?.binding
      if (!current || current.schemaDigest !== binding.schemaDigest || !allowed(current, context)) throw Error('此工具已停用或当前工作区没有使用权限')
      return currentConnections().get(current.connectionId)
    },
    sync() {
      if (disposed) return Promise.resolve()
      if (syncing) return syncing
      const work = (async () => {
        try {
          const next = validateSnapshot(await bridge.request('/snapshot'))
          if (disposed) return
          if (snapshot?.runtimeEpoch === next.runtimeEpoch && next.revision < snapshot.revision) throw unavailable()
          const notify = !available || JSON.stringify(snapshot) !== JSON.stringify(next)
          snapshot = next; available = true
          for (const agent of ctx.agents.list()) attach(agent)
          await Promise.all([...agents].map(async ([agent, state]) => {
            try { state.context = await runtime.contextFor(agent) } catch { state.context = undefined }
          }))
          if (disposed) return
          const desired = new Map(next.tools.filter(binding => {
            const connection = next.connections.find(item => item.id === binding.connectionId)
            return binding.enabled && connection?.enabled && connection.authState === 'connected'
          }).map(binding => [binding.id, binding]))
          for (const [id, entry] of tools) {
            const binding = desired.get(id)
            if (!binding || JSON.stringify(binding) !== entry.key) { tools.delete(id); entry.dispose() }
          }
          for (const [id, binding] of desired) {
            if (tools.has(id)) continue
            const definition = createToolProxy(binding, runtime), entry = { name: definition.name, binding, key: JSON.stringify(binding), dispose: () => {} }
            tools.set(id, entry)
            try { entry.dispose = ctx.tools.register(definition) } catch (error) { tools.delete(id); throw error }
          }
          refreshRestrictions()
          await computerUse?.sync(next)
          if (notify) changed()
        } catch { if (!disposed) failClosed() }
      })()
      syncing = work.finally(() => { syncing = undefined })
      return syncing
    },
    dispose() {
      if (disposal) return disposal
      disposed = true; available = false; clearInterval(timer)
      for (const off of listeners.splice(0).reverse()) off()
      for (const entry of tools.values()) entry.dispose()
      tools.clear()
      for (const state of agents.values()) state.dispose?.()
      agents.clear()
      changes.clear()
      disposal = (async () => { await computerUse?.dispose(); await bridge.dispose(); await syncing })()
      return disposal
    }
  }
  if (env.EWORK_COMPUTER_USE_BINARY) computerUse = createComputerUseController(ctx, {
    binaryPath: env.EWORK_COMPUTER_USE_BINARY, runtime, env, fetch: fetchRequest,
    report: value => bridge.request('/plugins/status', value),
    allowed: allowsComputerUse
  })
  listeners.push(ctx.tools.guard(exec => {
    if (!exec.name.startsWith('ework__')) return
    const entry = [...tools.values()].find(item => item.name === exec.name)
    const state = agents.get(exec.agent)
    if (!isLiveAgent(ctx, exec.agent) || !entry || !allowed(entry.binding, state?.context)) return '当前连接不可用或没有使用权限'
  }))
  listeners.push(ctx.on('tools/change', refreshRestrictions))
  listeners.push(ctx.on('agent/created', ({ agent }) => { attach(agent); void runtime.sync() }))
  listeners.push(ctx.on('agent/disposed', ({ agent }) => { const state = agents.get(agent); agents.delete(agent); state?.dispose?.() }))
  // Assembly precedes agent/pre-step. A freshly spawned child is still masked
  // until its capability context resolves, so refresh managed wire schemas at
  // this boundary instead of giving its first model request an empty MCP set.
  listeners.push(ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const agent = context.agent
    if (!isLiveAgent(ctx, agent)) return next()
    await runtime.sync()
    const state = agents.get(agent)
    if (state) {
      try { state.context = await runtime.contextFor(agent, context.signal) }
      catch { state.context = undefined }
      refreshRestrictions()
    }
    context.signal?.throwIfAborted()
    const result = await next()
    const isManaged = tool => tool.name.startsWith('ework__') || tool.name === COMPUTER_USE_TOOL
    const managed = ctx.tools.wireSchemas(agent).schemas.filter(isManaged)
    // Context text providers are synchronous. Add the current routing guidance
    // here, after the bridge sync, rather than inserting a Promise as text.
    const skillAvailable = ctx.tools.schemas(agent).some(tool => tool.name === 'skill')
    const guidance = [
      {name:'sherlock:computer-use-selection',text:managed.some(tool => tool.name === COMPUTER_USE_TOOL) ? COMPUTER_USE_GUIDANCE : ''},
      {name:'ework:finance-skill',text:skillAvailable?financeSkillGuidance(runtime.snapshot):''},
      {name:'ework:equity-research-skill',text:skillAvailable?equityResearchSkillGuidance(runtime.snapshot):''}
    ]
    return { ...result, contexts: [...result.contexts.filter(entry => !guidance.some(item => item.name === entry.name)), ...guidance.filter(entry => entry.text)], tools: [...result.tools.filter(tool => !isManaged(tool)), ...managed] }
  }))
  listeners.push(ctx.on('agent/pre-step', async ({messages,signal}, next) => {
    await runtime.sync()
    const decision=await next()
    if(decision.kind!=='enter')return decision
    const requested=new Set((messages??[]).filter(message=>message.source?.kind==='user').flatMap(message=>message.content.filter(block=>block.type==='text').flatMap(block=>[...block.text.matchAll(explicitManagedSkillPattern)].map(match=>match[1]))))
    if(!requested.size)return decision
    await runtime.sync();signal?.throwIfAborted()
    for(const name of requested){
      const skill=runtime.snapshot?.skills.find(item=>managedSkillInvocationName(item)===name||stableBuiltinSkillAlias(item.id)===name)
      if(!skill||!enabledManagedSkill(runtime.snapshot,skill.id)||!decision.messages.some(message=>message.source?.kind==='skill-invocation'&&message.source.name===name&&message.content.some(block=>block.type==='text'&&block.text.includes('<skill_instructions>'))))
        throw new HarnessError('所选技能未能加载（可能已停用、移除或连接中断），本次执行已停止；请重新选择技能后发送。','SKILL_UNAVAILABLE')
    }
    return decision
  }))
  listeners.push(registerManagedSkillProvider(ctx, runtime))
  listeners.push(ctx.provide('eworkIntegrations', runtime))
  runtime.ready = runtime.sync()
  if (pollIntervalMs > 0) { timer = setInterval(() => { void runtime.sync() }, pollIntervalMs); timer.unref?.() }
  return runtime
}

export async function apply(ctx) {
  const runtime = createIntegrationRuntime(ctx)
  ctx.effect(() => () => runtime.dispose())
  await runtime.ready
}
