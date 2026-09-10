export const PROTOCOL_VERSION = 1
// Only fixed public failure codes cross the collaboration boundary.
const TASK_FAILURES = Object.freeze({
  EMPTY_OUTPUT: '模型没有返回可展示的内容，自动恢复仍未完成。',
  INVALID_OUTPUT: '组件格式未通过校验，自动修复仍未完成。',
  OUTPUT_TOO_LARGE: '组件内容超过长度上限，自动精简仍未完成。',
  CONTAINER_DATA_UNAVAILABLE: '未能取得所需资料，请检查网络或数据源。',
  TIMEOUT: '模型响应超时，本次生成未完成。',
  TRANSPORT: '模型连接中断，本次生成未完成。',
  RATE_LIMIT: '模型服务暂时限流，本次生成未完成。',
  GENERATION_FAILED: '本次组件生成未完成，可重新执行。'
})
export function taskFailureMessage(code) {
  return typeof code === 'string' && Object.hasOwn(TASK_FAILURES, code) ? TASK_FAILURES[code] : undefined
}
export const LIMITS = Object.freeze({
  nodes: 1000,
  documentBytes: 1024 * 1024,
  stateBytes: 1800000,
  updateBytes: 1024 * 1024,
  messageBytes: 16384,
  assetBytes: 50 * 1024 * 1024,
  boardAssetBytes: 1024 * 1024 * 1024,
  requestBytes: 25 * 1024 * 1024,
  history: 100,
  members: 10,
  inviteDays: 7,
  leaseMs: 30000
})
export function toBase64(bytes) {
  return Buffer.from(bytes).toString('base64')
}
export function fromBase64(value) {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value
    )
  )
    throw Error('INVALID_BASE64')
  return new Uint8Array(Buffer.from(value, 'base64'))
}

/** Non-durable cursor/geometry hints; never part of the Y document. */
export function validatePresenceHints(value, canvas) {
  const id = (v) => typeof v === 'string' && /^[-\w:.]{1,128}$/.test(v)
  const coord = (v) => Number.isFinite(v) && Math.abs(v) <= 10000000
  if (
    !value ||
    Object.keys(value).some(
      (k) => !['cursor', 'selectedIds', 'previews'].includes(k)
    )
  )
    throw Error('INVALID_PRESENCE')
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > 8192)
    throw Error('PRESENCE_SIZE_LIMIT')
  if (
    value.cursor != null &&
    (Object.keys(value.cursor).length !== 2 ||
      !coord(value.cursor.x) ||
      !coord(value.cursor.y))
  )
    throw Error('INVALID_PRESENCE')
  if (
    !Array.isArray(value.selectedIds) ||
    value.selectedIds.length > 100 ||
    !value.selectedIds.every(id)
  )
    throw Error('INVALID_PRESENCE')
  if (!Array.isArray(value.previews) || value.previews.length > 100)
    throw Error('INVALID_PRESENCE')
  const seen = new Set()
  for (const p of value.previews) {
    if (
      !p ||
      Object.keys(p).length !== 6 ||
      !['files', 'artifacts'].includes(p.collection) ||
      !id(p.nodeId) ||
      !coord(p.x) ||
      !coord(p.y) ||
      !Number.isFinite(p.width) ||
      !Number.isFinite(p.height) ||
      p.width <= 0 ||
      p.height <= 0 ||
      p.width > 20000 ||
      p.height > 20000
    )
      throw Error('INVALID_PRESENCE')
    const key = p.collection + ':' + p.nodeId
    if (seen.has(key) || !canvas[p.collection].some((n) => n.id === p.nodeId))
      throw Error('INVALID_PRESENCE')
    seen.add(key)
  }
}
