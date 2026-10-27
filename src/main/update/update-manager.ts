import { app, autoUpdater as nativeUpdater, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { disposeNativeMacPreparation, prepareNativeMacInstall, resetNativeMacPreparation } from './native-install'
import { cancelUpdateRestartReceipt, consumeUpdateRestartReceipt, writeUpdateRestartReceipt } from './restart-receipt'
import { armMacRenameRecovery, repairRenamedMacDock } from './mac-update-recovery'
import electronUpdater from 'electron-updater'
import { validateLocalUpdateEnvironment, type LocalUpdateEnvironment } from './local-update-guard'
import type { LocalDownloadUpdater } from './local-download-updater'
import type { LocalCheckUpdater } from './local-check-updater'
import { installMacUpdateTransfer, cancelMacUpdateTransfer, type MacTransferProgress } from './mac-download'
import type { UpdateStatus } from '../../shared/contracts'
import {
  shouldCheckAfterResume,
  supportsAutoUpdates,
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_STARTUP_DELAY_MS,
  UPDATE_STARTUP_JITTER_MS
} from './update-policy'
import {
  initialUpdateStatus,
  reduceUpdateStatus,
  type UpdateStateEvent
} from './update-state'
import {
  assertTrustedMainWindowEvent,
  type TrustedWindow
} from '../ipc-trust'

let autoUpdater: typeof electronUpdater.autoUpdater | LocalCheckUpdater | LocalDownloadUpdater = electronUpdater.autoUpdater
let updateAccess: 'production' | 'blocked' | 'check-only' | 'download-only' =
  app.commandLine?.hasSwitch('sherlock-local-acceptance-origin') || app.commandLine?.hasSwitch('sherlock-local-update-feed') || app.commandLine?.hasSwitch('sherlock-local-update-download') ? 'blocked' : 'production'
const TRANSIENT_STATUS_MS = 8_000

let status = initialUpdateStatus(app.getVersion())
let startupTimer: NodeJS.Timeout | undefined
let intervalTimer: NodeJS.Timeout | undefined
let resetTimer: NodeJS.Timeout | undefined
let checkPromise: Promise<unknown> | undefined
let lastCheckedAt = 0
let downloadedVersion: string | undefined
let preparedVersion: string | undefined
let latestVersion: string | undefined
let preparationPromise: Promise<UpdateStatus> | undefined
let preparationController: AbortController | undefined
let preparing = false
let refreshing = false
let stopped = false
let updateErrorEpoch = 0
let downloading = false
let installRequested = false
let installing = false
let activeInstallCleanup: (() => void) | undefined
let started = false
let handlersRegistered = false
let localDownloadUpdater: LocalDownloadUpdater | undefined
let prepareForRestart: (() => Promise<void>) | undefined

/** Called before IPC/menu registration. An attempted local setup can never fall back to production. */
export async function initializeLocalUpdateChecks(input: LocalUpdateEnvironment, temporaryDirectory: string): Promise<void> {
  if (!input.acceptanceOrigin && !input.feedRequested && !input.downloadRequested && updateAccess === 'production') return
  updateAccess = 'blocked'
  if (started || checkPromise) throw Error('Local update setup must precede update actions.')
  if (input.downloadRequested && !input.feedRequested) throw Error('Local download requires the explicit validated feed.')
  if (!input.feedRequested && input.acceptanceOrigin) return
  const paths = await validateLocalUpdateEnvironment(input, temporaryDirectory)
  const application = {
    version: app.getVersion(), name: app.getName(), isPackaged: app.isPackaged,
    whenReady: async () => { await app.whenReady() }
  }
  if (input.downloadRequested) {
    const { LocalDownloadUpdater } = await import('./local-download-updater')
    localDownloadUpdater = await LocalDownloadUpdater.create(paths, application)
    autoUpdater = localDownloadUpdater
  } else {
    const { LocalCheckUpdater } = await import('./local-check-updater')
    autoUpdater = new LocalCheckUpdater(paths, application)
  }
  configureUpdater(true)
  updateAccess = input.downloadRequested ? 'download-only' : 'check-only'
  console.info('[updater] isolated local update mode', updateAccess, paths.feed)
}

function assertUpdateAccess(installation = false): void {
  if (updateAccess === 'blocked') throw Error('Local update checks are disabled until isolated initialization succeeds.')
  if (installation && updateAccess === 'check-only') throw Error('隔离更新验收仅允许检查，禁止下载或安装。')
  if (installation && updateAccess !== 'production') throw Error('隔离更新验收禁止安装或退出应用。')
}

export function setUpdateRestartPreparation(prepare: () => Promise<void>): void {
  prepareForRestart = prepare
}

export function getUpdateStatus(): UpdateStatus {
  return { ...status }
}

export function registerUpdateHandlers(getMainWindow: () => TrustedWindow | undefined): void {
  if (handlersRegistered) return
  handlersRegistered = true
  ipcMain.handle('updates:status', (event) => {
    assertTrustedMainWindowEvent(event, getMainWindow())
    return getUpdateStatus()
  })
  ipcMain.handle('updates:check', (event) => {
    assertTrustedMainWindowEvent(event, getMainWindow())
    return checkForUpdates(true)
  })
  ipcMain.handle('updates:download', (event) => {
    assertTrustedMainWindowEvent(event, getMainWindow())
    return downloadAvailableUpdate()
  })
  ipcMain.handle('updates:install', (event) => {
    assertTrustedMainWindowEvent(event, getMainWindow())
    return installDownloadedUpdate()
  })
}

export function startUpdateManager(): void {
  if (updateAccess !== 'production') return
  if (started) return
  started = true
  stopped = false

  if (!supportsUpdates()) {
    transition({
      type: 'unsupported',
      message: 'Updates are available in installed macOS and Windows builds.'
    })
    return
  }

  void repairRenamedMacDock().catch(error => console.warn('[updater] Dock migration deferred', error))
  configureUpdater()
  const completed = consumeUpdateRestartReceipt(app.getPath('userData'), app.getVersion())
  if (completed) { status = completed; broadcast() }
  startupTimer = setTimeout(
    () => void checkForUpdates(),
    UPDATE_STARTUP_DELAY_MS + Math.random() * UPDATE_STARTUP_JITTER_MS
  )
  intervalTimer = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS)
  powerMonitor.on('resume', checkAfterResume)
}

export async function checkForUpdates(manual = false): Promise<UpdateStatus> {
  assertUpdateAccess()
  if (!supportsUpdates()) {
    transition(
      {
        type: 'unsupported',
        message: 'Update checks are only available in installed macOS and Windows builds.'
      },
      manual
    )
    if (manual) scheduleReset()
    return getUpdateStatus()
  }

  if (manual && (checkPromise || preparing || status.phase === 'downloading')) {
    status = { ...status, manual: true }
    broadcast()
  }
  if (installing || preparing || status.phase === 'downloading') return getUpdateStatus()
  if (checkPromise) {
    await checkPromise
    return getUpdateStatus()
  }
  // A periodic check must not briefly remove a prepared Restart action.
  if (status.phase !== 'downloaded') transition({ type: 'check', manual })
  else status = { ...status, manual }
  lastCheckedAt = Date.now()
  checkPromise = queryLatestVersion().catch((error) => {
    transition({ type: 'error', errorStage: 'check', message: errorMessage(error) })
    if (manual) scheduleReset()
  }).finally(() => {
    checkPromise = undefined
  })
  await checkPromise
  if (updateAccess === 'production' && !installing && status.phase === 'available') void downloadAvailableUpdate()
  return getUpdateStatus()
}

export async function installDownloadedUpdate(): Promise<void> {
  assertUpdateAccess(true)
  if (status.phase !== 'downloaded' || !preparedVersion || preparedVersion !== status.availableVersion || installing || installRequested) return
  const target = preparedVersion
  const epoch = updateErrorEpoch
  const assertCurrent = () => {
    if (stopped) throw Error('应用正在退出，已取消更新重启。')
    if (epoch !== updateErrorEpoch) throw Error(status.message || '更新安装器状态已变化，请重试。')
  }
  installRequested = true
  installing = true
  let cancelRecovery: (() => void) | undefined
  const cleanupInstall = () => {
    const cancel = cancelRecovery
    cancelRecovery = undefined
    cancel?.()
    cancelUpdateRestartReceipt(app.getPath('userData'))
  }
  activeInstallCleanup = cleanupInstall
  try {
    if (!prepareForRestart) throw Error('研究状态保存入口尚未就绪，应用尚未退出。')
    transition({ type: 'install', stage: 'saving' }, true)
    await prepareForRestart()
    assertCurrent()
    cancelRecovery = process.platform === 'darwin' ? await armMacRenameRecovery(target) : undefined
    assertCurrent()
    writeUpdateRestartReceipt(app.getPath('userData'), app.getVersion(), target)
    transition({ type: 'install', stage: 'restarting' }, true)
    // The native installer is already ready: no download, network check or
    // extraction belongs on the explicit restart path.
    if (process.platform === 'darwin') nativeUpdater.quitAndInstall()
    else autoUpdater.quitAndInstall(false, true)
  } catch (error) {
    if (activeInstallCleanup === cleanupInstall) activeInstallCleanup = undefined
    // Recovery may finish arming after an earlier error cleared the global
    // cleanup handle. The attempt still owns that late-created guard.
    cleanupInstall()
    installing = false
    if (!stopped) transition({ type: 'error', errorStage: 'install', message: errorMessage(error) }, true)
  } finally { installRequested = false }
}

function cancelPendingInstall(): void {
  const cleanup = activeInstallCleanup
  activeInstallCleanup = undefined
  cleanup?.()
}

export async function downloadAvailableUpdate(): Promise<UpdateStatus> {
  assertUpdateAccess()
  if (updateAccess === 'check-only') throw Error('隔离更新验收仅允许检查，禁止下载或安装。')
  if (updateAccess === 'download-only') {
    if (downloading || status.phase !== 'available') return getUpdateStatus()
    downloading = true
    try {
      // Isolated download checks may never prepare a native installer or quit.
      const latest = await checkForUpdates(true)
      if (latest.phase === 'available') await autoUpdater.downloadUpdate()
    } catch {
      // Actual AppUpdater download errors already drive the production event reducer.
      // Shutdown cancellation intentionally creates no artificial renderer phase.
    } finally { downloading = false }
    return getUpdateStatus()
  }
  if (preparationPromise) return preparationPromise
  if (status.phase !== 'available') return getUpdateStatus()
  preparationPromise = prepareAvailableUpdate()
  try { return await preparationPromise } finally { preparationPromise = undefined }
}

async function queryLatestVersion(): Promise<string | undefined> {
  refreshing = true
  latestVersion = undefined
  try {
    await autoUpdater.checkForUpdates()
    return latestVersion
  } finally { refreshing = false }
}

async function prepareAvailableUpdate(): Promise<UpdateStatus> {
  preparing = true
  const controller = new AbortController()
  const epoch = updateErrorEpoch
  const assertCurrent = () => {
    controller.signal.throwIfAborted()
    if (epoch !== updateErrorEpoch) throw Error(status.message || '更新准备失败，请重试。')
  }
  preparationController = controller
  let target = status.availableVersion!
  let errorStage: NonNullable<UpdateStatus['errorStage']> = 'download'
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      assertCurrent()
      if (downloadedVersion !== target) {
        preparedVersion = undefined
        // A timed-out wait may still own a running Squirrel command. Do not
        // replace its feed or let its late completion prepare a different ZIP.
        errorStage = 'install'
        if (process.platform === 'darwin') await resetNativeMacPreparation(nativeUpdater, 120_000, controller.signal)
        assertCurrent()
        errorStage = 'download'
        downloading = true
        transition({ type: 'progress', percent: 0 })
        try { await autoUpdater.downloadUpdate() } finally { downloading = false }
      }
      assertCurrent()
      if (downloadedVersion !== target) throw Error('更新文件版本不匹配，请重新下载。')
      transition({ type: 'prepare', version: target })
      errorStage = 'check'
      const before = await queryLatestVersion()
      assertCurrent()
      if (!before) { transition({ type: 'not-available' }); return getUpdateStatus() }
      if (before !== target) { target = before; transition({ type: 'available', version: target }); continue }
      errorStage = 'install'
      if (preparedVersion !== target) {
        if (process.platform === 'darwin') await prepareNativeMacInstall(nativeUpdater, 120_000, controller.signal)
        assertCurrent()
        preparedVersion = target
      }
      errorStage = 'check'
      const after = await queryLatestVersion()
      assertCurrent()
      if (!after) { preparedVersion = undefined; transition({ type: 'not-available' }); return getUpdateStatus() }
      if (after !== target) { target = after; transition({ type: 'available', version: target }); continue }
      transition({ type: 'downloaded', version: target })
      return getUpdateStatus()
    }
    throw Error('更新版本连续变化，请稍后重试。')
  } catch (error) {
    if (!controller.signal.aborted && !stopped) transition({ type: 'error', errorStage, message: errorMessage(error) })
    return getUpdateStatus()
  } finally {
    preparing = false
    if (preparationController === controller) preparationController = undefined
  }
}

export function stopUpdateManager(): Promise<void> {
  stopped = true
  if (updateAccess === 'production' && process.platform === 'darwin') cancelMacUpdateTransfer(autoUpdater)
  preparationController?.abort(Error('Update manager stopped.'))
  if (process.platform === 'darwin') disposeNativeMacPreparation(nativeUpdater)
  if (startupTimer) clearTimeout(startupTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  if (resetTimer) clearTimeout(resetTimer)
  startupTimer = undefined
  intervalTimer = undefined
  resetTimer = undefined
  if (started && app.isReady()) powerMonitor.removeListener('resume', checkAfterResume)
  return localDownloadUpdater?.dispose().catch(error => console.warn('[updater] isolated cache cleanup refused', error)) ?? Promise.resolve()
}

function configureUpdater(localCheckOnly = false): void {
  if (!localCheckOnly && updateAccess === 'production' && process.platform === 'darwin') installMacUpdateTransfer(autoUpdater, { nativeUpdater })
  if (!localCheckOnly) autoUpdater.autoDownload = false
  // Do not hand an archive to Squirrel before the final freshness check.
  if (!localCheckOnly) autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false
  autoUpdater.logger = {
    info: (...args: unknown[]) => console.info('[updater]', ...args),
    warn: (...args: unknown[]) => console.warn('[updater]', ...args),
    error: (...args: unknown[]) => console.error('[updater]', ...args),
    debug: (...args: unknown[]) => console.debug('[updater]', ...args)
  }

  autoUpdater.on('checking-for-update', () => {
    if (!preparing && !installing && status.phase !== 'downloaded') transition({ type: 'check', manual: status.manual })
  })
  autoUpdater.on('update-available', (info) => {
    latestVersion = info.version
    if (!preparing && !installing) transition({ type: preparedVersion === info.version ? 'downloaded' : 'available', version: info.version })
  })
  autoUpdater.on('download-progress', (progress) => {
    if (stopped) return
    const transfer = progress as Partial<MacTransferProgress>
    transition({ type: 'progress', percent: progress.percent, transferredBytes: progress.transferred, totalBytes: progress.total, bytesPerSecond: progress.bytesPerSecond,
      downloadKind: transfer.downloadKind, archiveBytes: transfer.archiveBytes, reusedBytes: transfer.reusedBytes, resumedBytes: transfer.resumedBytes, fallbackReason: transfer.fallbackReason })
  })
  autoUpdater.on('update-not-available', () => {
    latestVersion = undefined
    if (preparing || installing) return
    transition({ type: 'not-available' })
    scheduleReset()
  })
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version
    transition({ type: updateAccess === 'production' ? 'prepare' : 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (error) => {
    if (stopped) return
    updateErrorEpoch++
    if (!refreshing && !downloading) {
      preparedVersion = undefined
      if (process.platform === 'darwin') disposeNativeMacPreparation(nativeUpdater, error)
    }
    if (installing) cancelPendingInstall()
    installing = false
    transition({ type: 'error', errorStage: refreshing ? 'check' : downloading ? 'download' : 'install', message: errorMessage(error) })
    if (status.manual && refreshing && !preparing) scheduleReset()
  })
}

function transition(event: UpdateStateEvent, manualOverride?: boolean): void {
  if (event.type !== 'reset' && resetTimer) {
    clearTimeout(resetTimer)
    resetTimer = undefined
  }

  status = reduceUpdateStatus(status, event)
  if (manualOverride !== undefined) status.manual = manualOverride

  broadcast()
}

function broadcast(): void {
  console.info('[updater] status', status.phase, status.installStage ?? status.percent ?? '')
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('updates:status-changed', getUpdateStatus())
  }
}

function scheduleReset(): void {
  if (!status.manual) return
  if (resetTimer) clearTimeout(resetTimer)
  resetTimer = setTimeout(() => transition({ type: 'reset' }), TRANSIENT_STATUS_MS)
}

function checkAfterResume(): void {
  if (shouldCheckAfterResume(lastCheckedAt)) void checkForUpdates()
}

function supportsUpdates(): boolean {
  return supportsAutoUpdates(app.isPackaged, process.platform)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
