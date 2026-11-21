// The operation header is complete only after its quoted value and comma.
// Escaped characters are decoded as JSON before anything reaches the renderer.
const leadMember = /^(\s*\{\s*)"publicLead"\s*:\s*("(?:[^"\\\u0000-\u001f]|\\["\\/bfnrt]|\\u[\da-fA-F]{4}){1,600}")\s*,/u
const conversationBody = /^\s*\{\s*"kind"\s*:\s*"conversation"\s*,\s*"markdown"\s*:\s*"/u
const firstSentence = /^([^\n{}\[\]<>`\\]{1,220}?(?:[。！？!?]|\.(?=\s)|(?<!\d)\.$|(?=\n)))/u
const privateSyntax = /(?:wireToken|requestId|clientReceipts|clientCapabilities|documentSnapshot|reasoning[-_ ]?(?:delta|content)|notes\.(?:blocks|components)|"[a-z_][\w-]*"\s*:|\b[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}\b)/iu

export function consumeNoteLead(text) {
  return text.replace(leadMember, '$1')
}

export function safeNoteSentence(text) {
  if (typeof text !== 'string' || text.length > 240 || /[\r\n{}\[\]<>`\\\u0000-\u001f]/u.test(text) || privateSyntax.test(text)) return ''
  const sentence = text.trim()
  return sentence.length > 1 && /[\p{L}\p{N}]/u.test(sentence) ? sentence : ''
}

export function notePublicLead(prefix, conversationOnly, closed = false) {
  if (!conversationOnly) {
    const member = leadMember.exec(prefix)
    return member ? safeNoteSentence(JSON.parse(member[2])) : ''
  }
  // Compatibility for a model that responds in the original public envelope.
  // Read only an unescaped first sentence from this exact markdown slot.
  const body = prefix.replace(conversationBody, '')
  const content = body.trimStart().slice(0, 240)
  if (body !== prefix) {
    const complete = /^([^"\\\r\n]*)"\s*[,}]/u.exec(body)
    if (complete && safeNoteSentence(complete[1])) return safeNoteSentence(complete[1])
  } else if (closed && safeNoteSentence(content) && content.length === body.trim().length) {
    return safeNoteSentence(content)
  }
  let end = 0
  while (end < content.length) {
    const match = firstSentence.exec(content.slice(end))
    if (!match || (body !== prefix && match[1].includes('"'))) break
    const next = end + match[1].length
    if (!safeNoteSentence(content.slice(0, next))) break
    end = next
  }
  return safeNoteSentence(content.slice(0, end))
}
