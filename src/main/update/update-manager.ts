import { app, autoUpdater as nativeUpdater, BrowserWindow, ipcMain, powerMonitor } from 'electron'
import { prepareNativeMacInstall } from './native-install'
import { armMacRenameRecovery, repairRenamedMacDock } from './mac-update-recovery'
import electronUpdater from 'electron-updater'
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

const { autoUpdater } = electronUpdater
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
  startupTimer = setTimeout(
    () => void checkForUpdates(),
    UPDATE_STARTUP_DELAY_MS + Math.random() * UPDATE_STARTUP_JITTER_MS
  )
  intervalTimer = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS)
  powerMonitor.on('resume', checkAfterResume)
}

export async function checkForUpdates(manual = false): Promise<UpdateStatus> {
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
  if (status.phase !== 'downloaded') return
  await completeUpdate()
}

export async function downloadAvailableUpdate(): Promise<UpdateStatus> {
  if (status.phase !== 'available') return getUpdateStatus()
  await completeUpdate()
  return getUpdateStatus()
}

async function completeUpdate(): Promise<void> {
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
      transition({ type: 'install' }, true)
      if (process.platform === 'darwin') await prepareNativeMacInstall(nativeUpdater, 120_000, () => armMacRenameRecovery(downloadedVersion!))
      else autoUpdater.quitAndInstall(false, true)
      return
    }
  } catch (error) {
    installing = false
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

function configureUpdater(): void {
  autoUpdater.autoDownload = false
  // Do not hand an archive to Squirrel before the final freshness check.
  autoUpdater.autoInstallOnAppQuit = false
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

  console.info('[updater] status', status.phase, status.percent ?? '')
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
