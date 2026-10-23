import { join } from 'node:path'
import { enabledManagedSkill, managedSkillInvocationName, registerLegacySkillPolicy, stableBuiltinSkillAlias } from './skill-policy.js'

const PROVIDER = 'ework-managed-skills'
const invocation = { modelInvocable: true, userInvocable: true }
const bundledInvocation = { modelInvocable: false, userInvocable: true }
// Other builtins keep native model discovery; the two reserved frameworks use managed IDs.
const invocationFor = skill => skill.provider === 'bundled' && !stableBuiltinSkillAlias(skill.id) ? bundledInvocation : invocation

/** Registry invalidation reaches model discovery, the skill tool, and slash consumers. */
export function registerManagedSkillProvider(ctx, runtime) {
  const unregisterLegacyPolicy = registerLegacySkillPolicy(ctx, runtime)
  let invalidate = () => {}
  const unregister = ctx.skills.registerProvider(control => {
    invalidate = control.invalidate
    return {
      name: PROVIDER,
      async list(options) {
        options.signal?.throwIfAborted()
        await runtime.sync()
        options.signal?.throwIfAborted()
        const snapshot = runtime.snapshot
        return (snapshot?.skills ?? []).filter(skill => enabledManagedSkill(snapshot, skill.id)).flatMap(skill => {const candidate={
          name: managedSkillInvocationName(skill), description: `${skill.name}：${skill.description}`, source: skill.source, provider: PROVIDER,
          rank: 250, invocation: invocationFor(skill), resourceBase: { kind: 'directory', path: skill.resourceRoot },
          locator: { id: skill.id, revision: skill.revision, runtimeEpoch: snapshot.runtimeEpoch, ownerAccountId: snapshot.ownerAccountId }
        };const alias=skill.provider==='bundled'&&stableBuiltinSkillAlias(skill.id);return alias?[candidate,{...candidate,name:alias,rank:650,invocation:bundledInvocation}]:[candidate]})
      },
      async get(candidate, options) {
        await runtime.sync()
        options.signal?.throwIfAborted()
        const { id, revision, runtimeEpoch, ownerAccountId } = candidate.locator
        const current = () => {
          const snapshot = runtime.snapshot
          if (!snapshot || snapshot.runtimeEpoch !== runtimeEpoch || snapshot.ownerAccountId !== ownerAccountId) return
          return enabledManagedSkill(snapshot, id, revision)
        }
        const skill = current()
        if (!skill) return
        const context = await runtime.contextFor(options.scope, options.signal)
        if (!current()) return
        const result = await runtime.request('/skills/read', { id, revision, context }, options.signal)
        await runtime.sync()
        options.signal?.throwIfAborted()
        if (!current()) return
        if (!result || result.name !== skill.name || typeof result.description !== 'string' || typeof result.content !== 'string' || Buffer.byteLength(result.content) > 2 * 1024 * 1024 || result.directory !== skill.resourceRoot) throw Error('技能内容与安装记录不一致，请重新导入')
        return {
          name: candidate.name, description: `${skill.name}：${skill.description}`, source: skill.source, provider: PROVIDER,
          invocation: candidate.name===stableBuiltinSkillAlias(skill.id)?bundledInvocation:invocationFor(skill), resourceBase: { kind: 'directory', path: result.directory }, path: join(result.directory, 'SKILL.md'), content: result.content
        }
      }
    }
  })
  const off = runtime.onChange(() => invalidate())
  return () => { off(); unregister(); unregisterLegacyPolicy() }
}
