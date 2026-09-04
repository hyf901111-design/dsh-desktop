export const STABLE_DOWNLOAD_CACHE_CONTROL =
  'no-store, no-cache, max-age=0, must-revalidate'

export async function proxyStableDownload(request, fetchOrigin = fetch) {
  const originResponse = await fetchOrigin(request)
  const headers = new Headers(originResponse.headers)
  headers.set('cache-control', STABLE_DOWNLOAD_CACHE_CONTROL)
  return new Response(originResponse.body, {
    status: originResponse.status,
    statusText: originResponse.statusText,
    headers
  })
}

export default {
  fetch(request) {
    return proxyStableDownload(request)
  }
}
