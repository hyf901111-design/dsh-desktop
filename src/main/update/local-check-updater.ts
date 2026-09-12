import { request as httpRequest, type RequestOptions, type ClientRequest } from 'node:http'
import { CancellationToken, HttpExecutor } from 'builder-util-runtime'
import { AppUpdater } from 'electron-updater/out/AppUpdater.js'
import type { AppAdapter } from 'electron-updater/out/AppAdapter.js'
import { parse } from 'yaml'
import type { LocalUpdatePaths } from './local-update-guard'

const denied = () => new Error('隔离更新验收仅允许检查，禁止下载或安装。')
const CHANNEL_PATH = /^\/latest(?:-mac)?\.yml$/

function metadataUrl(input: string, origin: string): URL {
  const url = new URL(input, origin)
  if (url.origin !== origin || url.username || url.password || url.hash || !CHANNEL_PATH.test(url.pathname) ||
      [...url.searchParams.keys()].some(k => k !== 'noCache')) throw Error('Local update request/redirect must stay on the exact metadata origin.')
  return url
}
function validateMetadata(text: string): void {
  const info = parse(text, { maxAliasCount: 0 })
  const artifact = (path: unknown) => typeof path === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*\.(zip|exe)$/.test(path) && !path.includes('..')
  if (!info || !Array.isArray(info.files) || !info.files.length || info.files.length > 4 || info.packages ||
      info.files.some((f: any) => !f || !artifact(f.url) || typeof f.sha512 !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(f.sha512) || !Number.isSafeInteger(f.size) || f.size < 0) ||
      (info.path !== undefined && !artifact(info.path))) throw Error('Local update metadata must contain only relative fixture artifacts.')
}

/** Only metadata GETs. Node HTTP has no system proxy, cookie store, disk cache or automatic redirects. */
class LocalMetadataExecutor extends HttpExecutor<ClientRequest> {
  constructor(private readonly origin: string) { super() }
  override request(options: RequestOptions, token = new CancellationToken(), data?: Record<string, unknown> | null): Promise<string> {
    if (data != null || (options.method && options.method.toUpperCase() !== 'GET') || options.auth || options.socketPath ||
        options.protocol !== 'http:' || options.hostname !== '127.0.0.1' || String(options.port) !== new URL(this.origin).port) {
      return Promise.reject(Error('Local update checks only permit metadata GET requests to the exact origin.'))
    }
    const start = metadataUrl(`${this.origin}${options.path}`, this.origin)
    return token.createPromise((resolve, reject, onCancel) => {
      let active: ClientRequest | undefined
      onCancel(() => active?.destroy())
      const visit = (url: URL, redirects: number) => {
        if (token.cancelled) return
        active = httpRequest(url, { method: 'GET', agent: false, headers: { accept: 'text/yaml' } }, response => {
          const code = response.statusCode ?? 0
          if (code >= 300 && code < 400) {
            response.resume()
            try {
              if (!response.headers.location || redirects >= 3) throw Error('Local update redirect limit exceeded.')
              visit(metadataUrl(response.headers.location, this.origin), redirects + 1)
            } catch (error) { reject(error as Error) }
            return
          }
          let size = 0
          const chunks: Buffer[] = []
          response.on('data', (chunk: Buffer) => {
            size += chunk.length
            if (size > 64 * 1024) { active?.destroy(); reject(Error('Local update metadata exceeds 64 KiB.')); return }
            chunks.push(chunk)
          })
          response.on('error', reject)
          response.on('end', () => {
            if (code !== 200) { reject(Error(`Local update metadata HTTP ${code}`)); return }
            try { const text = Buffer.concat(chunks).toString('utf8'); validateMetadata(text); resolve(text) } catch (error) { reject(error as Error) }
          })
        })
        active.setTimeout(5_000, () => active?.destroy(Error('Local update metadata request timed out.')))
        active.on('error', reject)
        active.end()
      }
      visit(start, 0)
    })
  }
  // No inherited generic request/download helper can bypass the metadata-only implementation.
  override createRequest(): ClientRequest { throw denied() }
  override downloadToBuffer(): Promise<Buffer> { return Promise.reject(denied()) }
}

/** Actual electron-updater checks/semver/provider/events, with no platform installer or cache access. */
export class LocalCheckUpdater extends AppUpdater {
  constructor(paths: LocalUpdatePaths, application: { version: string; name: string; isPackaged: boolean; whenReady(): Promise<void> }) {
    const adapter: AppAdapter = {
      version: application.version, name: application.name, isPackaged: application.isPackaged,
      userDataPath: paths.userData,
      get appUpdateConfigPath(): string { throw denied() },
      get baseCachePath(): string { throw denied() },
      whenReady: () => application.whenReady(), relaunch: () => { throw denied() }, quit: () => { throw denied() }, onQuit: () => { throw denied() }
    }
    super(undefined, adapter)
    Object.defineProperties(this, {
      autoDownload: { value: false, writable: false },
      autoInstallOnAppQuit: { value: false, writable: false },
      // electron-updater 6.x uses this internal executor for GenericProvider metadata.
      // Keep the integration exercised with the actual installed AppUpdater in focused tests.
      httpExecutor: { value: new LocalMetadataExecutor(paths.feed), writable: false }
    })
    this.allowPrerelease = false
    this.allowDowngrade = false
    this.setFeedURL({ provider: 'generic', url: paths.feed, useMultipleRangeRequest: false })
  }
  override downloadUpdate(): Promise<string[]> { return Promise.reject(denied()) }
  protected override doDownloadUpdate(): Promise<string[]> { return Promise.reject(denied()) }
  override quitAndInstall(): void { throw denied() }
}
