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
