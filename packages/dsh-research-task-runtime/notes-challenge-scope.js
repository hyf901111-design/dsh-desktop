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

/** Reviewer meta belongs to comments. Preserve wording already authored in the note. */
export function challengeReplacementBody(before,after){
 if(typeof before!=='string'||typeof after!=='string')return{error:'review-reminder'}
 const meta=/(?:待核实|待核查|待验证|需核实|需要核实|需核查|尚未核实|未联网核验)/gu
 const counts=value=>{const result=new Map();for(const word of value.match(meta)??[])result.set(word,(result.get(word)??0)+1);return result},old=counts(before),excess=new Map([...counts(after)].map(([word,count])=>[word,Math.max(0,count-(old.get(word)??0))]))
 // Existing qualifiers cannot be assigned to new positions by counting alone.
 // Reject ambiguous changes instead of deleting an authored occurrence.
 const next=counts(after)
 if([...old].some(([word,count])=>(next.get(word)??0)!==count))return{error:'review-reminder'}
 let removed=false
 const replacement=after.replace(/[（(【\[]\s*(?:待核实|待核查|待验证|需核实|需要核实|需核查|尚未核实|未联网核验)\s*[）)】\]]/gu,value=>{const word=value.match(meta)?.[0];if(!word||!excess.get(word))return value;excess.set(word,excess.get(word)-1);removed=true;return''})
 if(!replacement.trim())return{error:'review-reminder'}
 if([...counts(replacement)].some(([word,count])=>count>(old.get(word)??0)))return{error:'review-reminder'}
 return{replacement,removed}
}
