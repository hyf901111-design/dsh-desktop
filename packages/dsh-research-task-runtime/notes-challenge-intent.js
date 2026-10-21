// Pure browser/Node contract. A proposed replacement never grants write access.
function normalizedIntent(value) {
  return value.trim().replace(/(?:不要|不用|无需|不需要)(?:再)?(?:问我|确认|征求意见|解释|说明)[，,。\s]*/gu, '')
    .replace(/“[^”]*”|「[^」]*」|『[^』]*』|"[^"]*"|'[^']*'/gu, '内容')
}
const negative = /不要|不用|无需|先别|不必|不需要|别|先.{0,6}(?:建议|预览)|只.{0,6}(?:建议|讨论)|\bdo\s+not\b|\bdon't\b/iu
const prefix = /^(?:(?:请你?|你|帮我|帮忙|麻烦|可以|可不可以|能否|能不能|直接|立即|现在|马上|就)\s*)*/u

export function challengeDirectReplacement(value) {
  const text = normalizedIntent(value)
  if (negative.test(text)) return false
  // Judge the first current request, not quoted speech or a later mentioned command.
  const clause = text.split(/[，,。；;\n]/u)[0].trim()
  if (/(?:会|可能|是否|是不是|有没有|有无)(?!帮我|帮忙).{0,60}(?:[吗么?？]|$)|风险|后果|安全[吗么?？]|什么意思|是什么|为什么|怎么|如何/u.test(clause)) return false
  const command = clause.replace(prefix, '')
  if (/^(?:把|将).{1,60}(?:替换为|替换成|改成|改为)/u.test(command)) return true
  if (/^(?:修改|更改|改写|重写|替换|改成|改为|改好)/u.test(command)) return true
  if (/^优化/u.test(command)) return /直接|立即|现在|马上|原文|正文/u.test(clause)
  return /^(?:(?:please|can you|could you|directly|now)\s+)*(?:replace|rewrite|edit)\b/iu.test(clause)
}

/** Broader preview permission; it explicitly includes the same execution contract. */
export function challengeReplacementRequested(value) {
  if (challengeDirectReplacement(value)) return true
  const text = normalizedIntent(value)
  return !negative.test(text) && /^(?:(?:把|将).{1,60})?(?:修改|更改|改好|改写|重写|替换|改成|改为|优化)/u.test(text.replace(prefix, ''))
}
