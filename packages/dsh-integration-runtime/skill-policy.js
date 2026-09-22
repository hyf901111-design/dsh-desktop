import { isAbsolute } from 'node:path'
import { realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export function managedSkillInvocationName(skill) {
  return `ework-skill-${createHash('sha256').update(skill.id).digest('hex').slice(0, 16)}`
}

/** Display names may be localized or duplicated; the runtime invocation name is bound to stable ID. */
export function validateManagedSkills(snapshot) {
  for (const skill of snapshot.skills) {
    if (typeof skill.name !== 'string' || !skill.name.trim() || skill.name.length > 100 || /[\u0000-\u001f]/.test(skill.name) || typeof skill.description !== 'string' || !skill.description.trim() || typeof skill.enabled !== 'boolean' || !Number.isSafeInteger(skill.revision) || skill.revision < 0 || typeof skill.source !== 'string' || typeof skill.resourceRoot !== 'string' || !isAbsolute(skill.resourceRoot) || skill.resourceRoot.includes('\0')) throw Error('托管技能定义无效')
  }
  for (const plugin of snapshot.plugins) if (typeof plugin.enabled !== 'boolean') throw Error('插件状态无效')
  if (snapshot.managedSkillSources !== undefined && (!Array.isArray(snapshot.managedSkillSources) || snapshot.managedSkillSources.some(id => typeof id !== 'string' || !/^local:[a-f0-9]{64}$/.test(id)))) throw Error('旧技能兼容策略无效')
}

/** Suppress only migrated source directories, across every registry scope and after uninstall. */
export function registerLegacySkillPolicy(ctx, runtime) {
  if (typeof ctx.skills.registerCandidatePolicy !== 'function') throw Error('当前技能运行时缺少来源策略补丁，无法安全加载受管理技能')
  const managedSources = new Set()
  let initialized = false
  const remember = () => {
    const snapshot = runtime.snapshot
    if (!snapshot) return
    initialized = true
    for (const id of snapshot.managedSkillSources ?? []) managedSources.add(id)
    for (const skill of snapshot.skills) if (/^local:[a-f0-9]{64}$/.test(skill.sourceId ?? '')) managedSources.add(skill.sourceId)
  }
  const off = runtime.onChange(remember)
  const unregister = ctx.skills.registerCandidatePolicy(async (candidate, options) => {
    await runtime.sync()
    options.signal?.throwIfAborted()
    remember()
    if (candidate.provider === 'ework-managed-skills') return !!enabledManagedSkill(runtime.snapshot, candidate.locator?.id, candidate.locator?.revision)
    const directory = candidate.resourceBase?.kind === 'directory' ? candidate.resourceBase.path : candidate.locator?.directory
    if (typeof directory !== 'string') return true
    if (!initialized) return false
    let canonical
    try { canonical = await realpath(directory) } catch { return false }
    const id = `local:${createHash('sha256').update(canonical).digest('hex')}`
    return !managedSources.has(id)
  })
  return () => { off(); unregister() }
}

export function enabledManagedSkill(snapshot, id, revision) {
  const skill = snapshot?.skills.find(item => item.id === id)
  if (!skill?.enabled || (revision !== undefined && skill.revision !== revision)) return
  if (skill.ownerPluginId && !snapshot.plugins.some(plugin => plugin.id === skill.ownerPluginId && plugin.enabled)) return
  return skill
}
