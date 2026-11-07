// Preserve a subject immediately before a colon when the extractor quotes only
// its value. The result remains one exact source span, never a generated fact.
export function contextualMemoryEvidence(source: string, evidence: string): string {
  const quote = evidence.trim(), start = source.indexOf(quote)
  if (start < 0 || start !== source.lastIndexOf(quote)) return quote
  const prefix = source.slice(0, start).match(/(?:^|[。.!?！？；;\n])([^。.!?！？；;\n]{1,120}[:：]\s*)$/u)?.[1]
  return prefix ? prefix.trimStart() + quote : quote
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
