import { app, autoUpdater as nativeUpdater, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { prepareNativeMacInstall } from './native-install'
import { cancelUpdateRestartReceipt, consumeUpdateRestartReceipt, writeUpdateRestartReceipt } from './restart-receipt'
import { armMacRenameRecovery, repairRenamedMacDock } from './mac-update-recovery'
import electronUpdater from 'electron-updater'
import { validateLocalUpdateEnvironment, type LocalUpdateEnvironment } from './local-update-guard'
import type { LocalCheckUpdater } from './local-check-updater'
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

let autoUpdater: typeof electronUpdater.autoUpdater | LocalCheckUpdater = electronUpdater.autoUpdater
let updateAccess: 'production' | 'blocked' | 'check-only' =
  app.commandLine?.hasSwitch('sherlock-local-acceptance-origin') || app.commandLine?.hasSwitch('sherlock-local-update-feed') ? 'blocked' : 'production'
const TRANSIENT_STATUS_MS = 8_000

let status = initialUpdateStatus(app.getVersion())
let startupTimer: NodeJS.Timeout | undefined
let intervalTimer: NodeJS.Timeout | undefined
let resetTimer: NodeJS.Timeout | undefined
let checkPromise: Promise<unknown> | undefined
let lastCheckedAt = 0
let downloadedVersion: string | undefined
let downloading = false
let installRequested = false
let installing = false
let started = false
let handlersRegistered = false
let prepareForRestart: (() => Promise<void>) | undefined

/** Called before IPC/menu registration. An attempted local setup can never fall back to production. */
export async function initializeLocalUpdateChecks(input: LocalUpdateEnvironment, temporaryDirectory: string): Promise<void> {
  if (!input.acceptanceOrigin && !input.feedRequested && updateAccess === 'production') return
  updateAccess = 'blocked'
  if (started || checkPromise) throw Error('Local update setup must precede update actions.')
  if (!input.feedRequested && input.acceptanceOrigin) return
  const paths = await validateLocalUpdateEnvironment(input, temporaryDirectory)
  const { LocalCheckUpdater } = await import('./local-check-updater')
  const local = new LocalCheckUpdater(paths, {
    version: app.getVersion(), name: app.getName(), isPackaged: app.isPackaged,
    whenReady: async () => { await app.whenReady() }
  })
  autoUpdater = local
  configureUpdater(true)
  updateAccess = 'check-only'
  console.info('[updater] isolated metadata checks only', paths.feed)
}

function assertUpdateAccess(installation = false): void {
  if (updateAccess === 'blocked') throw Error('Local update checks are disabled until isolated initialization succeeds.')
  if (installation && updateAccess === 'check-only') throw Error('隔离更新验收仅允许检查，禁止下载或安装。')
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

  if (checkPromise) {
    await checkPromise
    return getUpdateStatus()
  }
  if (installing || status.phase === 'downloading') {
    return getUpdateStatus()
  }

  transition({ type: 'check', manual })
  lastCheckedAt = Date.now()
  checkPromise = Promise.resolve().then(() => autoUpdater.checkForUpdates()).catch((error) => {
    transition({ type: 'error', message: errorMessage(error) })
    if (manual) scheduleReset()
  }).finally(() => {
    checkPromise = undefined
  })
  await checkPromise

  return getUpdateStatus()
}

export async function installDownloadedUpdate(): Promise<void> {
  assertUpdateAccess(true)
  if (status.phase !== 'downloaded') return
  await completeUpdate()
}

export async function downloadAvailableUpdate(): Promise<UpdateStatus> {
  assertUpdateAccess(true)
  if (status.phase !== 'available') return getUpdateStatus()
  await completeUpdate()
  return getUpdateStatus()
}

async function completeUpdate(): Promise<void> {
  assertUpdateAccess(true)
  if (installing || installRequested || downloading) return
  installRequested = true
  try {
    let downloads = 0
    while (true) {
      const latest = await checkForUpdates(true)
      if (latest.phase === 'available') {
        if (downloads++ >= 3) throw new Error('更新版本连续变化，请稍后重试。')
        downloading = true
        try { await autoUpdater.downloadUpdate() } finally { downloading = false }
        // Refresh again after download: a newer release may have appeared.
        continue
      }
      if (latest.phase !== 'downloaded') return
      installing = true
      transition({ type: 'install', stage: 'preparing' }, true)
      const beforeQuit = async (signal?: AbortSignal) => {
        if (!prepareForRestart) throw Error('研究状态保存入口尚未就绪，应用尚未退出。')
        transition({ type: 'install', stage: 'saving' }, true)
        await prepareForRestart()
        signal?.throwIfAborted()
        const cancelRecovery = process.platform === 'darwin' ? await armMacRenameRecovery(downloadedVersion!) : undefined
        if (signal?.aborted) { cancelRecovery?.(); signal.throwIfAborted() }
        try { writeUpdateRestartReceipt(app.getPath('userData'), app.getVersion(), downloadedVersion!) }
        catch (error) { cancelRecovery?.(); throw error }
        transition({ type: 'install', stage: 'restarting' }, true)
        return () => { cancelRecovery?.(); cancelUpdateRestartReceipt(app.getPath('userData')) }
      }
      if (process.platform === 'darwin') await prepareNativeMacInstall(nativeUpdater, 120_000, beforeQuit)
      else {
        const cancel = await beforeQuit()
        try { autoUpdater.quitAndInstall(false, true) } catch (error) { cancel(); throw error }
      }
      return
    }
  } catch (error) {
    installing = false
    cancelUpdateRestartReceipt(app.getPath('userData'))
    // Keep the actionable failure visible until the user retries.
    transition({ type: 'error', message: errorMessage(error) }, true)
  } finally {
    installRequested = false
  }
}

export function stopUpdateManager(): void {
  if (startupTimer) clearTimeout(startupTimer)
  if (intervalTimer) clearInterval(intervalTimer)
  if (resetTimer) clearTimeout(resetTimer)
  startupTimer = undefined
  intervalTimer = undefined
  resetTimer = undefined
  if (started && app.isReady()) powerMonitor.removeListener('resume', checkAfterResume)
}

function configureUpdater(localCheckOnly = false): void {
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

  autoUpdater.on('checking-for-update', () =>
    transition({ type: 'check', manual: status.manual })
  )
  autoUpdater.on('update-available', (info) =>
    transition({ type: downloadedVersion === info.version ? 'downloaded' : 'available', version: info.version })
  )
  autoUpdater.on('download-progress', (progress) =>
    transition({ type: 'progress', percent: progress.percent, transferredBytes: progress.transferred, totalBytes: progress.total, bytesPerSecond: progress.bytesPerSecond })
  )
  autoUpdater.on('update-not-available', () => {
    transition({ type: 'not-available' })
    scheduleReset()
  })
  autoUpdater.on('update-downloaded', (info) => {
    downloadedVersion = info.version
    transition({ type: 'downloaded', version: info.version })
  })
  autoUpdater.on('error', (error) => {
    installing = false
    transition({ type: 'error', message: errorMessage(error) })
    if (status.manual) scheduleReset()
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
