/** The integration runtime owns preferences; no cached local defaults override it. */
export function bundledSkillEnabled(ctx, slug) {
  const runtime = ctx.get?.('eworkIntegrations')
  if (runtime) return runtime.snapshot?.skills.some(skill => skill.id === `builtin:${slug}` && skill.enabled) === true
  // Standalone generation/test hosts have no desktop integration bridge.
  // A desktop bridge that has not become available must fail closed.
  return !process.env.EWORK_INTEGRATION_BRIDGE
}

export function applyBundledSkillPreferences(prompt, {component, data}) {
  if (!component) prompt = prompt.replace(/以下是 EWork 内置技能 ework-workbench-components[\s\S]*?【EWork 内置组件生成技能结束】/gu, '')
  if (!data) prompt = prompt.replace(/【EWork 内置基础数据源】[\s\S]*?【EWork 内置基础数据源结束】/gu, '')
  return prompt
}
