export const STABLE_DOWNLOAD_CACHE_CONTROL: string

export function proxyStableDownload(
  request: Request,
  fetchOrigin?: typeof fetch
): Promise<Response>

declare const worker: {
  fetch(request: Request, env?: { SHERLOCK_RELEASES?: unknown }): Promise<Response>
}

export default worker
