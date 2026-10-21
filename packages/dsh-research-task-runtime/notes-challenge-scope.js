/** Host-owned editing scope. Model text never determines the authorized range. */
export function challengeReplacementScope(source, anchorQuote) {
  if (typeof source !== 'string' || typeof anchorQuote !== 'string' || !anchorQuote.trim()) return { error: 'anchor' }
  const at = source.indexOf(anchorQuote)
  if (at < 0 || source.indexOf(anchorQuote, at + 1) >= 0) return { error: 'anchor' }
  const end = at + anchorQuote.length
  let from = 0, to = source.length
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const boundary = /[。！？!?\n\r]/u.test(char) || char === '.' && !(/[0-9]/u.test(source[i - 1] || '') && /[0-9]/u.test(source[i + 1] || ''))
    if (!boundary) continue
    if (i + 1 <= at) from = i + 1
    if (i + 1 >= end) { to = i + 1; break }
  }
  // Whitespace separating sentences is not part of the replacement authority.
  while (from < at && /\s/u.test(source[from])) from++
  while (to > end && /\s/u.test(source[to - 1])) to--
  if (to - from > 6000) return { error: 'too-long' }
  return { from, to, quote: source.slice(from, to) }
}
