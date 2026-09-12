import { mkdtemp, mkdir, realpath, lstat, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { join, dirname, basename } from 'node:path'
import { CancellationError, CancellationToken } from 'builder-util-runtime'
import { AppUpdater, type DownloadUpdateOptions } from 'electron-updater/out/AppUpdater.js'
import type { AppAdapter } from 'electron-updater/out/AppAdapter.js'
import type { LocalUpdatePaths } from './local-update-guard'
import { LocalDownloadExecutor, LOCAL_UPDATE_MAX_BYTES } from './local-download-http'

type Application = { version: string; name: string; isPackaged: boolean; whenReady(): Promise<void> }
const denyInstall = () => Error('隔离更新验收只允许本地下载，禁止安装或退出应用。')

/** A real AppUpdater download pipeline, deliberately with no Mac/Base/native installer. */
export class LocalDownloadUpdater extends AppUpdater {
  private disposed = false
  private disposePromise?: Promise<void>
  private active?: { token: CancellationToken; promise: Promise<string[]> }
  private readonly executor: LocalDownloadExecutor
  readonly cacheRoot: string
  private readonly pending: string
  private constructor(private readonly paths: LocalUpdatePaths, root: string, application: Application) {
    const adapter: AppAdapter = {
      ...application, userDataPath: paths.userData,
      appUpdateConfigPath: join(root, 'app-update.yml'), baseCachePath: join(root, 'cache'),
      relaunch: () => { throw denyInstall() }, quit: () => { throw denyInstall() }, onQuit: () => { throw denyInstall() }
    }
    super(undefined, adapter)
    this.cacheRoot = root
    this.pending = join(root, 'cache', 'acceptance-fixture', 'pending')
    this.executor = new LocalDownloadExecutor(paths.feed)
    Object.defineProperties(this, {
      autoDownload: { value: false, writable: false }, autoInstallOnAppQuit: { value: false, writable: false },
      autoRunAppAfterInstall: { value: false, writable: false }, disableDifferentialDownload: { value: true, writable: false },
      httpExecutor: { value: this.executor, writable: false }
    })
    this.allowPrerelease = false
    this.allowDowngrade = false
    this.setFeedURL({ provider: 'generic', url: paths.feed, useMultipleRangeRequest: false })
  }

  static async create(paths: LocalUpdatePaths, application: Application): Promise<LocalDownloadUpdater> {
    if (await realpath(paths.appData) !== paths.appData) throw Error('Local update appData changed after validation.')
    const root = await mkdtemp(join(paths.appData, 'local-update-download-'))
    try {
      await mkdir(join(root, 'cache', 'acceptance-fixture', 'pending'), { recursive: true, mode: 0o700 })
      await writeFile(join(root, 'app-update.yml'), 'updaterCacheDirName: acceptance-fixture\n', { flag: 'wx', mode: 0o600 })
      const updater = new LocalDownloadUpdater(paths, root, application)
      await updater.validateCache()
      return updater
    } catch (error) { await rm(root, { recursive: true, force: true }); throw error }
  }

  private async validateCache(): Promise<void> {
    if (this.disposed) throw new CancellationError()
    for (const path of [this.paths.appData, this.cacheRoot, join(this.cacheRoot, 'cache'), dirname(this.pending), this.pending]) {
      if (await realpath(path) !== path || !(await lstat(path)).isDirectory()) throw Error('Local updater cache path changed or escaped its isolated root.')
    }
    const config = join(this.cacheRoot, 'app-update.yml')
    if (await realpath(config) !== config || !(await lstat(config)).isFile() || await readFile(config, 'utf8') !== 'updaterCacheDirName: acceptance-fixture\n') throw Error('Local updater configuration escaped its isolated root.')
  }

  override downloadUpdate(token = new CancellationToken()): Promise<string[]> {
    if (this.disposed) return Promise.reject(new CancellationError())
    if (this.active) return this.active.promise
    const promise = super.downloadUpdate(token).finally(() => { this.active = undefined })
    this.active = { token, promise }
    return promise
  }

  protected override async doDownloadUpdate(options: DownloadUpdateOptions): Promise<string[]> {
    await this.validateCache()
    const info = options.updateInfoAndProvider.info
    if (('packages' in info && info.packages) || info.files.length !== 1) throw Error('Local download requires exactly one fixture ZIP, without packages.')
    const file = info.files[0]
    if (!file || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(file.url) || file.url.includes('..') ||
        !Number.isSafeInteger(file.size) || file.size! <= 0 || file.size! > LOCAL_UPDATE_MAX_BYTES || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) throw Error('Invalid bounded local ZIP metadata.')
    const files = options.updateInfoAndProvider.provider.resolveFiles(info)
    const fileInfo = files[0]
    if (files.length !== 1 || !fileInfo || fileInfo.packageInfo || fileInfo.url.origin !== this.paths.feed || fileInfo.url.pathname !== '/' + file.url) throw Error('Local ZIP resolution escaped its approved metadata.')
    // The upstream helper trusts the cached JSON filename. Validate before it can
    // read/hash a cache hit, not merely before writing the network destination.
    for (const name of await readdir(this.pending)) {
      const path = join(this.pending, name), stat = await lstat(path)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LOCAL_UPDATE_MAX_BYTES) throw Error('Unsafe entry in isolated update cache.')
      if (name === 'update-info.json') {
        if (stat.size > 4096) throw Error('Oversized local update cache record.')
        const cached = JSON.parse(await readFile(path, 'utf8'))
        if (cached.fileName !== file.url) throw Error('Local cached filename is outside its approved artifact.')
      } else if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.zip$/.test(name) || name.includes('..')) throw Error('Unexpected local update cache entry.')
    }
    return this.executeDownload({
      fileExtension: 'zip', fileInfo, downloadUpdateOptions: options,
      task: async (destination, downloadOptions) => {
        await this.validateCache()
        if (dirname(destination) !== this.pending || !/^\d*-?temp-[A-Za-z0-9._-]+\.zip$/.test(basename(destination))) throw Error('Local update destination is outside its pending cache.')
        await this.executor.download(fileInfo.url, destination, downloadOptions, file.size!, new Set(['/' + file.url]))
      },
      // executeDownload reaches done only after the real stream, digest, rename and cache record.
      done: async event => {
        if (this.disposed || options.cancellationToken.cancelled) throw new CancellationError()
        this.dispatchUpdateDownloaded(event)
      }
    })
  }

  override quitAndInstall(): void { throw denyInstall() }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise
    this.disposed = true
    this.active?.token.cancel()
    this.disposePromise = (async () => {
      await this.executor.dispose()
      await this.active?.promise.catch(() => {})
      // rm removes nested symlinks themselves; never follow a replaced root or parent.
      if (await realpath(this.paths.appData) !== this.paths.appData || await realpath(this.cacheRoot) !== this.cacheRoot) throw Error('Refusing to clean a replaced local cache root.')
      await rm(this.cacheRoot, { recursive: true, force: true })
      this.removeAllListeners()
    })()
    return this.disposePromise
  }
}
