// Serve public release objects directly from R2 so HEAD cannot poison a later Range response.
const STABLE = 'download/sherlock-mac-arm64.dmg'
const BRANDED_DOWNLOAD = 'download/EWork-Odyssey-mac-arm64.dmg'
const IMMUTABLE = /^releases\/v\d+\.\d+\.\d+(?:-[\w.-]+)?\/sherlock-[\w.-]+\.(?:zip(?:\.blockmap)?|dmg(?:\.blockmap)?|exe(?:\.blockmap)?)$/
const NO_CACHE = 'no-store, no-cache, max-age=0, must-revalidate'

function singleRange(value, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)
  if (!match || (!match[1] && !match[2]) || size === 0) return null
  const first = match[1] ? Number(match[1]) : undefined
  const last = match[2] ? Number(match[2]) : undefined
  if ([first, last].some(n => n !== undefined && !Number.isSafeInteger(n))) return null
  if (first === undefined) {
    if (!last) return null
    const length = Math.min(last, size)
    return { offset: size - length, length }
  }
  if (first >= size || (last !== undefined && last < first)) return null
  return { offset: first, length: Math.min(last ?? size - 1, size - 1) - first + 1 }
}

export async function serveReleaseDownload(request, bucket) {
  const url = new URL(request.url)
  const requestedKey = url.pathname.slice(1)
  // Both public URLs follow the same mutable object on every future release.
  const key = requestedKey === BRANDED_DOWNLOAD ? STABLE : requestedKey
  if (url.hostname !== 'updates.evanarts.com' || (key !== STABLE && !IMMUTABLE.test(key))) {
    return new Response('Not found', { status: 404 })
  }
  if (!['GET', 'HEAD'].includes(request.method)) {
    return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
  }
  const info = await bucket.head(key)
  if (!info) return new Response('Not found', { status: 404, headers: { 'cache-control': NO_CACHE } })
  const headers = new Headers()
  info.writeHttpMetadata(headers)
  headers.set('etag', info.httpEtag)
  headers.set('last-modified', info.uploaded.toUTCString())
  headers.set('accept-ranges', 'bytes')
  headers.set('cache-control', key === STABLE ? NO_CACHE : 'public, max-age=31536000, immutable')
  if (requestedKey === BRANDED_DOWNLOAD) {
    headers.set('content-disposition', 'attachment; filename="EWork-Odyssey-mac-arm64.dmg"')
  }
  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch?.split(',').some(tag => tag.trim() === '*' || tag.trim().replace(/^W\//, '') === info.httpEtag)) {
    return new Response(null, { status: 304, headers })
  }
  headers.set('content-length', String(info.size))
  if (request.method === 'HEAD') return new Response(null, { headers })
  let range
  const rawRange = request.headers.get('range')
  const ifRange = request.headers.get('if-range')
  const validatorMatches = !ifRange || ifRange === info.httpEtag || (
    Number.isFinite(Date.parse(ifRange)) && Math.floor(info.uploaded.getTime() / 1000) <= Math.floor(Date.parse(ifRange) / 1000)
  )
  if (rawRange && validatorMatches) {
    range = singleRange(rawRange, info.size)
    if (!range) return new Response(null, { status: 416, headers: {
      'content-range': `bytes */${info.size}`, 'cache-control': NO_CACHE, 'accept-ranges': 'bytes'
    } })
  }
  const object = await bucket.get(key, { onlyIf: { etagMatches: info.etag }, ...(range ? { range } : {}) })
  // A mutable alias changed between HEAD and GET: never splice different versions together.
  if (!object || !('body' in object)) return new Response(null, { status: 412, headers: { 'cache-control': NO_CACHE } })
  if (range) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${info.size}`)
    headers.set('content-length', String(range.length))
  }
  return new Response(object.body, { status: range ? 206 : 200, headers })
}
