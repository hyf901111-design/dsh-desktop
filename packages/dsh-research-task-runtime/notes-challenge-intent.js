// Pure browser/Node contract. A proposed replacement never grants write access.
function normalizedIntent(value) {
  return value.trim().replace(/(?:不要|不用|无需|不需要)(?:再)?(?:问我|确认|征求意见|解释|说明)[，,。\s]*/gu, '')
    .replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/gu, '内容')
}
const negative = /不要|不用|无需|先别|不必|不需要|别|先.{0,6}(?:建议|预览)|只.{0,6}(?:建议|讨论)|\bdo\s+not\b|\bdon't\b/iu
const prefix = /^(?:(?:请你?|你|帮我|帮忙|麻烦|可以|可不可以|能否|能不能|直接|立即|现在|马上|就)\s*)*/u

// Complete action clauses, rather than a verb-prefix match. Objects are the current
// anchored note or explicit deictic text; a proposition after that object is not
// an imperative (e.g. 修改原文 + 能保留格式 / 修改 + 建议看起来...).
const currentText = '(?:原文|正文|文字|内容|表达|这段(?:文字|内容|原文)?|这句(?:话|文字)?|这个|上面(?:这段)?)'
const editClause = new RegExp('^(?:修改|更改|改写|重写)(?:一下)?(?:'+currentText+')?(?:一下|好)?(?:吧)?$','u')
const replaceClause = new RegExp('^(?:替换(?:一下|上去|(?:到|进|回)?'+currentText+')?|改好(?:并?替换(?:上去|到原文|到正文)?)?)(?:一下|好)?(?:吧)?$','u')
const optimizeClause = new RegExp('^优化(?:一下)?(?:'+currentText+')?(?:一下|好)?(?:吧)?$','u')

export function challengeDirectReplacement(value) {
  const text = normalizedIntent(value)
  if (negative.test(text)) return false
  const clause = text.split(/[，,。；;\n]/u)[0].trim()
  const lead = clause.match(prefix)?.[0] ?? ''
  const asking = /[吗么?？]$/u.test(clause)
  // A modal request addresses the assistant; a bare questioned action merely
  // mentions editing. This preserves 可以帮我改好吗 without treating consequences
  // after the object as part of an action's argument.
  if (asking && !/请|帮我|帮忙|麻烦|可以|能否|能不能/u.test(lead)) return false
  const command = clause.slice(lead.length).replace(/[.!！?？]+$/u,'').replace(asking?/吗$/u:/$^/u,'')
  if (editClause.test(command) || replaceClause.test(command)) return true
  if (optimizeClause.test(command)) return /直接|立即|现在|马上/u.test(lead) || /原文|正文/u.test(command)
  // Assignment syntax explicitly names both old text and its desired value.
  // Quoted arbitrary values are normalized to 内容; unquoted modal propositions
  // remain discussion rather than being swallowed as replacement text.
  const assignment = command.match(/^(?:把|将)([^。；;\n]{1,60}?)(?:替换为|替换成|改成|改为)([^。；;\n]{1,120})$/u)
  if (assignment) return !/[能会有可是否吗么?？]/u.test(assignment[2])
  return /^(?:(?:please|can you|could you|directly|now)\s+)*(?:replace|rewrite|edit)\s+(?:the\s+)?(?:original|note|document|this text)(?:\s+now)?[.!?]?$/iu.test(clause)
}

/** Broader preview permission; it explicitly includes the same execution contract. */
export function challengeReplacementRequested(value) {
  if (challengeDirectReplacement(value)) return true
  const text = normalizedIntent(value)
  return !negative.test(text) && /^(?:(?:把|将).{1,60})?(?:修改|更改|改好|改写|重写|替换|改成|改为|优化)/u.test(text.replace(prefix, ''))
}
