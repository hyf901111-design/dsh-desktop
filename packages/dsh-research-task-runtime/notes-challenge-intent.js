// Pure browser/Node contract. A proposed replacement never grants write access.
function requestText(value) {
  return value.trim().replace(/^(?:(?:不要|不用|无需|不需要)(?:再)?(?:问我|确认|征求意见|解释|说明)[，,。\s]*)+/u, '')
}
const quotes = /“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/gu
const normalizedIntent = value => requestText(value).replace(quotes, '内容')
const quoteEnds = { '“': '”', '‘': '’', '「': '」', '『': '』', '"': '"', "'": "'" }
function firstClause(text) {
  let end
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (end) { if (char === end) end = undefined }
    else if (quoteEnds[char]) end = quoteEnds[char]
    else if (/[，,。；;\n]/u.test(char)) return text.slice(0, i).trim()
  }
  return text.trim()
}
// Each literal keeps its closing delimiter. Mixed/unclosed delimiters and any
// suffix after a quoted value cannot be swallowed into the assigned value.
const literal = `(?:“[^“”‘’「」『』"'\\n]*”|‘[^“”‘’「」『』"'\\n]*’|「[^“”‘’「」『』"'\\n]*」|『[^“”‘’「」『』"'\\n]*』|"[^“”‘’「」『』"'\\n]*"|'[^“”‘’「」『』"'\\n]*')`
const bare = `[^“”‘’「」『』"'。；;\\n]`
const assignmentClause = new RegExp('^(?:把|将)(' + literal + '|' + bare + '{1,60}?)(?:替换为|替换成|改成|改为)(' + literal + '|' + bare + '{1,120})(?:吧)?$', 'u')
const negative = /不要|不用|无需|先别|不必|不需要|别|先.{0,6}(?:建议|预览)|只.{0,6}(?:建议|讨论)|\bdo\s+not\b|\bdon't\b/iu
const prefix = /^(?:(?:请你?|你|帮我|帮忙|麻烦|可以|可不可以|能否|能不能|直接|立即|现在|马上|就)\s*)*/u

// Complete action clauses, rather than a verb-prefix match. Objects are the current
// anchored note or explicit deictic text; a proposition after that object is not
// an imperative (e.g. 修改原文 + 能保留格式 / 修改 + 建议看起来...).
const currentText = '(?:原文|正文|文字|内容|表达|这段(?:文字|内容|原文)?|这句(?:话|文字)?|这个|上面(?:这段)?)'
const currentTextTarget = new RegExp('^' + currentText + '$', 'u')
const editClause = new RegExp('^(?:修改|更改|改写|重写)(?:一下)?(?:'+currentText+')?(?:一下|好)?(?:吧)?$','u')
const replaceClause = new RegExp('^(?:替换(?:一下|上去|(?:到|进|回)?'+currentText+')?|改好(?:并?替换(?:上去|到原文|到正文)?)?)(?:一下|好)?(?:吧)?$','u')
const optimizeClause = new RegExp('^优化(?:一下)?(?:'+currentText+')?(?:一下|好)?(?:吧)?$','u')

export function challengeDirectReplacement(value, context) {
  const text = requestText(value)
  if (negative.test(text.replace(quotes, '内容'))) return false
  const clause = firstClause(text)
  const lead = clause.match(prefix)?.[0] ?? ''
  const asking = /[吗么?？]$/u.test(clause)
  // A modal request addresses the assistant; a bare questioned action merely
  // mentions editing. This preserves 可以帮我改好吗 without treating consequences
  // after the object as part of an action's argument.
  if (asking && !/请|帮我|帮忙|麻烦|可以|能否|能不能/u.test(lead)) return false
  const command = clause.slice(lead.length).replace(/[.!！?？]+$/u,'').replace(asking?/吗$/u:/$^/u,'')
  if (editClause.test(command) || replaceClause.test(command)) return true
  if (optimizeClause.test(command)) return /直接|立即|现在|马上/u.test(lead) || /原文|正文/u.test(command)
  const assignment = command.match(assignmentClause)
  if (assignment) {
    const target = assignment[1].trim(), quoted = !!quoteEnds[target[0]], oldText = quoted ? target.slice(1, -1) : target
    // A literal target must be in the current anchor, not a suggestion, another
    // comment or an unrelated note block. Both hosts pass this same quote.
    const currentTarget = !quoted && currentTextTarget.test(target)
    if (!currentTarget && !(oldText && typeof context?.quote === 'string' && context.quote.includes(oldText))) return false
    const next = assignment[2].trim()
    if (quoteEnds[next[0]]) return next.length > 2
    // Without delimiters, support a closed text-style noun phrase or a single
    // character correction of the proven text target. Arbitrary prose cannot
    // prove where the value ends, so it stays preview-capable until quoted.
    if (/^(?:(?!的)[\p{L}\p{N}])+的(?:表达|表述|文字|内容)$/u.test(next)) return true
    const prior = currentTarget ? context?.quote : oldText
    if (!/^(?:(?!的)[\p{L}\p{N}])+$/u.test(next) || typeof prior !== 'string') return false
    const before = [...prior], after = [...next]
    return before.length === after.length && before.filter((char, index) => char !== after[index]).length <= 1
  }
  return /^(?:(?:please|can you|could you|directly|now)\s+)*(?:replace|rewrite|edit)\s+(?:the\s+)?(?:original|note|document|this text)(?:\s+now)?[.!?]?$/iu.test(clause)
}

/** Broader preview permission; it explicitly includes the same execution contract. */
export function challengeReplacementRequested(value, context) {
  if (challengeDirectReplacement(value, context)) return true
  const text = normalizedIntent(value)
  return !negative.test(text) && /^(?:(?:把|将).{1,60})?(?:修改|更改|改好|改写|重写|替换|改成|改为|优化)/u.test(text.replace(prefix, ''))
}
