// Preserve a subject immediately before a colon when the extractor quotes only
// its value. The result remains one exact source span, never a generated fact.
export function contextualMemoryEvidence(source: string, evidence: string): string {
  const quote = evidence.trim(), start = source.indexOf(quote)
  if (start < 0 || start !== source.lastIndexOf(quote)) return quote
  const prefix = source.slice(0, start).match(/(?:^|[。.!?！？；;\n])([^。.!?！？；;\n]{1,120}[:：]\s*)$/u)?.[1]
  return prefix ? prefix.trimStart() + quote : quote
}

// Certainty alone does not make a detail useful in a later conversation. These
// conservative checks also apply when an extractor incorrectly says explicit=true.
export function reusableMemoryEvidence(value: string, kind: string): boolean {
  if(/(?:待|尚未|还未|未)(?:确认|确定)|也许|或许|可能|假设|暂定|先试试|\b(?:tentative|unconfirmed|maybe|perhaps|hypothetical)\b/iu.test(value))return false
  if(/(?:不要|不用|别)(?:再)?(?:记住|记录|保存)|\b(?:do not|don't)\s+(?:remember|save|store)\b/iu.test(value))return false
  if(/记住|记下来|记录下来|长期保存|\bremember\b|\bsave\b.{0,30}\b(?:future|later)\b/iu.test(value))return true
  if(kind==='progress')return false
  // A bare schedule value does not identify whose meeting or habit it describes.
  if(kind!=='preference'&&/^(?:固定)?每(?:周|月|年|天|日)/u.test(value))return false
  if(/这(?:个|张|份|封|段|轮)(?:图表|看板|报告|邮件|消息|页面|卡片|表格|草稿|回答)|\bthis\s+(?:chart|dashboard|report|email|message|page|table|draft|reply)\b/iu.test(value))return false
  const lasting=/以后|今后|长期|始终|固定|约定|每次|每周|每月|统一|\balways\b|\bevery\b|going forward/iu.test(value)
  if(/^(?:请|帮我|给我|做个|生成|制作|搭建|创建|please\b|build\b|create\b|generate\b|make\b)/iu.test(value)&&!lasting)return false
  if(kind==='preference')return /以后|今后|默认|一直|每次|长期|始终|我(?:更|比较|通常|习惯|喜欢)|prefer|always|default/iu.test(value)
  return lasting||/采用|基线|必须|禁止|不允许|负责人|联系人|技术栈|工作语言|(?:上线|交付|发布|截止)(?:日期|时间)|截止(?:到|于)|\b(?:decided|baseline|deadline|must)\b/iu.test(value)
}

// A request to reuse an unspecified habit is not a new, self-contained fact.
// Keep this admission check independent of the extractor's `explicit` claim.
export function unresolvedMemoryReference(value: string): boolean {
  const reference = /(?:按(?:照)?|照|沿用|保持|遵循)(?:我(?:们)?(?:平时|通常|习惯|喜欢|惯用)(?:的)?|(?:之前|以前|原来|原先|上次|原有)(?:说过)?的?)(?:格式|方式|写法|习惯|偏好|模板|安排|方案|要求)|(?:跟|和|像)(?:之前|以前|原来|上次)(?:一样|相同)|\b(?:my|our)\s+(?:usual|previous|existing)\s+(?:format|style|preferences?|template|arrangement)|\b(?:the\s+)?same\s+(?:format|style|preferences?|template|arrangement)\s+as\s+(?:before|last\s+time)\b/giu
  const rest = value.replace(reference, '')
  if (rest === value) return false
  // An explicit description after the reference remains eligible. The model
  // must still extract the actual preference, with exact user evidence.
  return !/[:：]\s*\S|[，,；;\n]\s*(?:先|再|用|只|不|每|分|包括|具体|即|改|保留)|(?:并|另外|同时)(?:附上|增加|加上|包含|保留)|\b(?:but|and)\s+(?:include|add|use|keep)\b|(?:先.{1,30}再|用(?:中文|英文)|in\s+(?:Chinese|English))/iu.test(rest)
}
