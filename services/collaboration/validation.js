import { LIMITS } from '../../packages/dsh-research-collaboration/protocol.js'
export class CollaborationError extends Error {
  constructor(code, status = 400, details) {
    super(code)
    this.code = code
    this.status = status
    this.details = details
  }
}
export function fail(code, status = 400, details) {
  throw new CollaborationError(code, status, details)
}
export function requiredString(value, max = 128) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    fail('INVALID_INPUT')
  return value
}
export function assetName(value) {
  requiredString(value, 256)
  if (/[\\/\u0000-\u001f]/.test(value)) fail('INVALID_ASSET_NAME')
  return value
}
export function operationId(value) {
  requiredString(value)
  if (!/^[-\w:.]{1,128}$/.test(value)) fail('INVALID_OPERATION_ID')
  return value
}
export function role(value) {
  if (value !== 'editor' && value !== 'viewer') fail('INVALID_ROLE')
  return value
}
export function publicId(value) {
  if (typeof value !== 'string' || !/^\d{10}$/.test(value))
    fail('INVALID_PUBLIC_ID')
  return value
}
export async function bytes(request, max = LIMITS.requestBytes) {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()
  let size = 0
  const chunks = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) fail('SIZE_LIMIT', 413)
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
export async function jsonBody(request, max = LIMITS.requestBytes) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    fail('INVALID_CONTENT_TYPE', 415)
  try {
    const value = JSON.parse(
      new TextDecoder().decode(await bytes(request, max))
    )
    if (!value || Array.isArray(value) || typeof value !== 'object')
      fail('INVALID_INPUT')
    return value
  } catch (e) {
    if (e instanceof CollaborationError) throw e
    fail('INVALID_JSON')
  }
}
export function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
export function errorResponse(error) {
  const known = error instanceof CollaborationError
  const code = known
    ? error.code
    : /TOO_LARGE/.test(error.message)
      ? 'SIZE_LIMIT'
      : /INVALID|FORBIDDEN|PRIVATE|INCOMPLETE/.test(error.message)
        ? error.message
        : 'COLLABORATION_UNAVAILABLE'
  const status = known
    ? error.status
    : code === 'SIZE_LIMIT'
      ? 413
      : code === 'COLLABORATION_UNAVAILABLE'
        ? 503
        : 400
  return json(
    {
      error: {
        code,
        message: code,
        retryable: status >= 500,
        ...(error.details ? { details: error.details } : {})
      }
    },
    status
  )
}
