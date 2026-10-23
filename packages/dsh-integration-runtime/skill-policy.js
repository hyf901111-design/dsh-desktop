import { isAbsolute, join } from 'node:path'
import { realpath, readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

// Only these client-owned research frameworks reserve readable slash names.
export const stableBuiltinSkillAliases = Object.freeze({
  'builtin:ework-finance-analysis': 'ework-finance-analysis',
  'builtin:ework-equity-research': 'ework-equity-research'
})

export function stableBuiltinSkillAlias(id) {
  return Object.hasOwn(stableBuiltinSkillAliases, id) ? stableBuiltinSkillAliases[id] : undefined
}

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
  const bundledDirectories = new Map()
  let initialized = false
  const remember = () => {
    const snapshot = runtime.snapshot
    if (!snapshot) return
    initialized = true
    for (const id of snapshot.managedSkillSources ?? []) managedSources.add(id)
    for (const skill of snapshot.skills) if (/^local:[a-f0-9]{64}$/.test(skill.sourceId ?? '')) managedSources.add(skill.sourceId)
    for (const skill of snapshot.skills) if (skill.provider === 'bundled') bundledDirectories.set(skill.resourceRoot, skill.id)
  }
  const off = runtime.onChange(remember)
  const unregister = ctx.skills.registerCandidatePolicy(async (candidate, options) => {
    await runtime.sync()
    options.signal?.throwIfAborted()
    remember()
    if (candidate.provider === 'ework-managed-skills') return !!enabledManagedSkill(runtime.snapshot, candidate.locator?.id, candidate.locator?.revision)
    const snapshot = runtime.snapshot
    const reservedId = Object.keys(stableBuiltinSkillAliases).find(id => stableBuiltinSkillAliases[id] === candidate.name || managedSkillInvocationName({ id }) === candidate.name)
    // Stable names always address the client bundle, including after its toggle
    // is switched off. A local/provider collision must not become a fallback.
    if (reservedId && (snapshot?.skills.some(skill => skill.id === reservedId && skill.provider === 'bundled') || [...bundledDirectories.values()].includes(reservedId))) return false
    const directory = candidate.resourceBase?.kind === 'directory' ? candidate.resourceBase.path : candidate.locator?.directory
    if (typeof directory !== 'string') return true
    if (!initialized) return false
    let canonical
    try { canonical = await realpath(directory) } catch { return false }
    if (!snapshot && candidate.source === 'bundled') return false
    const bundled = snapshot?.skills.filter(skill => skill.provider === 'bundled') ?? []
    let builtin = bundled.find(skill => skill.resourceRoot === canonical)
    let builtinId = builtin?.id ?? bundledDirectories.get(canonical)
    // Previous clients may have synchronized builtin eSkill copies into custom
    // roots. Those copies must not bypass the toggle; independent same-name
    // skills without the client metadata retain their own discovery behavior.
    if (!builtin) {
      try {
        const metadata = JSON.parse(await readFile(join(canonical, '_meta.json'), 'utf8'))
        if (metadata.source === 'eSkill') {
          const id = `builtin:${metadata.slug}`
          builtin = bundled.find(skill => skill.id === id)
          if (builtin || [...bundledDirectories.values()].includes(id)) builtinId = id
        }
      } catch { /* An ordinary personal skill has no builtin metadata. */ }
    }
    if (builtinId) {
      if (!enabledManagedSkill(snapshot, builtinId)) return false
      // The managed provider owns both the model name and readable slash alias.
      if (stableBuiltinSkillAlias(builtinId)) return false
    }
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
