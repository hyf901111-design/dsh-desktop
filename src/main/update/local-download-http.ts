import { request, type IncomingMessage, type RequestOptions } from 'node:http'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { CancellationError, CancellationToken, DigestTransform, ProgressCallbackTransform, type DownloadOptions } from 'builder-util-runtime'
import { LocalMetadataExecutor } from './local-check-updater'

export const LOCAL_UPDATE_MAX_BYTES = 16 * 1024 * 1024

/** No Electron net/session, native proxy, generic download helpers or outbound discovery. */
export class LocalDownloadExecutor extends LocalMetadataExecutor {
  private disposed = false
  private readonly checks = new Map<CancellationToken, Promise<string>>()
  private readonly transfers = new Map<AbortController, Promise<string>>()
  constructor(private readonly feed: string) { super(feed) }

  override request(options: RequestOptions, token = new CancellationToken(), data?: Record<string, unknown> | null): Promise<string> {
    if (this.disposed) return Promise.reject(new CancellationError())
    const child = new CancellationToken(token)
    const operation = super.request(options, child, data).finally(() => { child.dispose(); this.checks.delete(child) })
    this.checks.set(child, operation)
    return operation
  }

  download(url: URL, destination: string, options: DownloadOptions, size: number, allowed: ReadonlySet<string>): Promise<string> {
    if (this.disposed || options.cancellationToken.cancelled) return Promise.reject(new CancellationError())
    const controller = new AbortController()
    const cancel = () => controller.abort(new CancellationError())
    options.cancellationToken.once('cancel', cancel)
    if (options.cancellationToken.cancelled) cancel()
    const operation = this.transfer(url, destination, options, size, allowed, controller.signal)
      .catch(error => { throw options.cancellationToken.cancelled || this.disposed ? new CancellationError() : error })
      .finally(() => { options.cancellationToken.removeListener('cancel', cancel); this.transfers.delete(controller) })
    this.transfers.set(controller, operation)
    return operation
  }

  private async transfer(start: URL, destination: string, options: DownloadOptions, size: number, allowed: ReadonlySet<string>, signal: AbortSignal): Promise<string> {
    if (!Number.isSafeInteger(size) || size <= 0 || size > LOCAL_UPDATE_MAX_BYTES || !options.sha512) throw Error('Invalid local fixture size or SHA-512.')
    const validate = (input: string | URL, base: URL): URL => {
      const raw = String(input)
      if (raw.includes('%') || raw.includes('\\') || /(^|\/)\.\.?($|\/)/.test(raw)) throw Error('Unsafe local artifact path.')
      const url = new URL(raw, base)
      if (url.origin !== this.feed || url.username || url.password || url.search || url.hash || !allowed.has(url.pathname)) throw Error('Local artifact request/redirect must stay on the exact approved origin and path.')
      return url
    }
    let active: ReturnType<typeof request> | undefined, response: IncomingMessage | undefined
    const abort = () => { active?.destroy(signal.reason); response?.destroy(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    const timeout = setTimeout(() => { active?.destroy(Error('Local fixture download exceeded 30 seconds.')); response?.destroy(Error('Local fixture download exceeded 30 seconds.')) }, 30_000)
    try {
      let url = validate(start, start)
      for (let redirects = 0; ; redirects++) {
        signal.throwIfAborted()
        response = await new Promise<IncomingMessage>((resolve, reject) => {
          active = request(url, { method: 'GET', agent: false, headers: { accept: 'application/zip', 'accept-encoding': 'identity' }, signal }, resolve)
          active.setTimeout(5_000, () => active?.destroy(Error('Local fixture download timed out.')))
          active.on('error', reject)
          active.end()
        })
        // Attach before handling redirects/headers so abort/error never goes unhandled.
        response.on('error', () => {})
        const status = response.statusCode ?? 0
        if (status >= 300 && status < 400) {
          response.destroy()
          if (!response.headers.location || redirects >= 3) throw Error('Local artifact redirect limit exceeded.')
          url = validate(response.headers.location, url)
          continue
        }
        if (status !== 200 || response.headers['content-encoding'] || response.headers['transfer-encoding'] ||
            response.headers['content-length'] !== String(size)) {
          response.destroy()
          throw Error('Local artifact requires HTTP 200, identity encoding and exact Content-Length.')
        }
        let received = 0
        const length = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            received += chunk.length
            callback(received > size ? Error('Local fixture exceeds its declared size.') : null, chunk)
          },
          flush(callback) { callback(received === size ? null : Error('Local fixture ended before its declared size.')) }
        })
        const progress = new ProgressCallbackTransform(size, options.cancellationToken, options.onProgress ?? (() => {}))
        const digest = new DigestTransform(options.sha512, 'sha512', 'base64')
        const file = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
        try { await pipeline(response, length, progress, digest, file.createWriteStream(), { signal }) }
        finally { await file.close() }
        return destination
      }
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      active?.destroy()
      response?.destroy()
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true
    for (const token of this.checks.keys()) token.cancel()
    for (const controller of this.transfers.keys()) controller.abort(new CancellationError())
    await Promise.allSettled([...this.checks.values(), ...this.transfers.values()])
  }
}
