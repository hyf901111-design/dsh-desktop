// Data-only protocol. Component code never runs in the collaboration service.
export const COMPONENT_STATE_LIMIT = 64 * 1024
export function componentVersion(html) {
  let a = 2166136261, b = 5381
  for (let i = 0; i < html.length; i++) { a = Math.imul(a ^ html.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ html.charCodeAt(i) }
  return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36) + '-' + html.length
}
export function componentData(value, max = COMPONENT_STATE_LIMIT) {
  let nodes = 0
  const visit = (v, depth) => {
    if (++nodes > 10000 || depth > 32) return false
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return true
    if (typeof v === 'number') return Number.isFinite(v)
    if (!v || typeof v !== 'object') return false
    if (Array.isArray(v)) return v.every(x => visit(x, depth + 1))
    return Object.getPrototypeOf(v) === Object.prototype && Object.entries(v).every(([k, x]) => !['__proto__', 'prototype', 'constructor'].includes(k) && visit(x, depth + 1))
  }
  return visit(value, 0) && new TextEncoder().encode(JSON.stringify(value)).length <= max
}
export function validateComponentMessage(m) {
  if (!m || Object.keys(m).some(k => !['op', 'nodeId', 'version', 'peerId', 'inputId', 'sequence', 'payload', 'token', 'revision', 'state', 'ack'].includes(k)) ||
      !['join', 'leave', 'input', 'commit'].includes(m.op) ||
      ![m.nodeId, m.version, m.peerId].every(v => typeof v === 'string' && /^[-\w:.]{1,128}$/.test(v))) throw Error('INVALID_COMPONENT_MESSAGE')
  if (m.op === 'input' && (typeof m.inputId !== 'string' || !/^[-\w]{1,80}$/.test(m.inputId) || !Number.isSafeInteger(m.sequence) || m.sequence < 1 || !componentData(m.payload, 4096))) throw Error('INVALID_COMPONENT_INPUT')
  if (m.op === 'commit' && (typeof m.token !== 'string' || m.token.length > 80 || !Number.isSafeInteger(m.revision) || m.revision < 1 || !componentData(m.state) || !Array.isArray(m.ack) || m.ack.length > 128 || !m.ack.every(x => typeof x === 'string' && x.length <= 80))) throw Error('INVALID_COMPONENT_STATE')
}
