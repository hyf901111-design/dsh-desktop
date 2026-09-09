export const PROTOCOL_VERSION = 1
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
