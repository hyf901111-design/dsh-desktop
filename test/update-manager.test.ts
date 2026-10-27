vi.mock('../src/main/update/native-install', async importOriginal => ({ ...await importOriginal<typeof import('../src/main/update/native-install')>(), prepareNativeMacInstall: async () => {} }))
vi.mock('../src/main/update/restart-receipt', () => ({ consumeUpdateRestartReceipt: () => undefined, writeUpdateRestartReceipt: vi.fn(), cancelUpdateRestartReceipt: vi.fn() }))
vi.mock('../src/main/update/mac-update-recovery', () => ({ armMacRenameRecovery: async () => undefined, repairRenamedMacDock: async () => {} }))
import { afterAll, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => {
  class FakeAutoUpdater {
    autoDownload = true
    autoInstallOnAppQuit = true
    allowPrerelease = true
    logger: unknown
    private listeners = new Map<string, Array<(...args: unknown[]) => void>>()

    on(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      return this
    }

    emit(event: string, value: unknown): void {
      for (const listener of this.listeners.get(event) ?? []) listener(value)
    }

    async checkForUpdates(): Promise<void> {
      this.emit('update-available', { version: '0.6.0' })
    }

    async downloadUpdate(): Promise<string[]> {
      this.emit('download-progress', { percent: 44.4 })
      this.emit('update-downloaded', { version: '0.6.0' })
      return ['/tmp/sherlock-update.zip']
    }

    quitAndInstall(..._args: unknown[]): void {}
  }

  return {
    autoUpdater: new FakeAutoUpdater(),
    ipcHandle: vi.fn(),
    ipcHandlers: new Map<string, (event: unknown) => unknown>(),
    powerOn: vi.fn(),
    powerRemove: vi.fn()
  }
})

vi.mock('electron', () => ({
  autoUpdater: { quitAndInstall: () => fakes.autoUpdater.quitAndInstall(false, true) },
  app: {
    getVersion: () => '0.5.0',
    getPath: () => '/isolated-test',
    isPackaged: true,
    isReady: () => false
  },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: {
    handle: (channel: string, handler: (event: unknown) => unknown) => {
      fakes.ipcHandle(channel, handler)
      fakes.ipcHandlers.set(channel, handler)
    }
  },
  powerMonitor: { on: fakes.powerOn, removeListener: fakes.powerRemove }
}))

vi.mock('electron-updater', () => ({
  default: { autoUpdater: fakes.autoUpdater }
}))

import {
  checkForUpdates,
  downloadAvailableUpdate,
  getUpdateStatus,
  installDownloadedUpdate,
  registerUpdateHandlers,
  setUpdateRestartPreparation,
  startUpdateManager,
  stopUpdateManager
} from '../src/main/update/update-manager'

afterAll(() => stopUpdateManager())

describe('desktop update manager', () => {
  it('rejects every update action from a child frame', async () => {
    const webContents = { mainFrame: { processId: 7, routingId: 41 } }
    const mainWindow = {
      isDestroyed: () => false,
      webContents
    }
    registerUpdateHandlers(() => mainWindow)
    const childEvent = {
      sender: webContents,
      senderFrame: { processId: 7, routingId: 42 }
    }

    for (const channel of [
      'updates:status',
      'updates:check',
      'updates:download',
      'updates:install'
    ]) {
      const handler = fakes.ipcHandlers.get(channel)
      expect(handler, channel).toBeTypeOf('function')
      await expect(Promise.resolve().then(() => handler?.(childEvent))).rejects.toThrow(
        'main EWork Odyssey window'
      )
    }
  })

  it('exposes a dedicated manual update check to the trusted preload', () => {
    expect(fakes.ipcHandle.mock.calls.map(([channel]) => channel)).toContain('updates:check')
  })

  it('discovers and downloads in the background, prepares first and only quits after the explicit install action', async () => {
    const download=vi.spyOn(fakes.autoUpdater,'downloadUpdate'),quit=vi.spyOn(fakes.autoUpdater,'quitAndInstall')
    startUpdateManager();setUpdateRestartPreparation(async()=>{})
    await checkForUpdates();await vi.waitFor(()=>expect(getUpdateStatus().phase).toBe('downloaded'))
    expect(fakes.autoUpdater.autoDownload).toBe(false);expect(fakes.autoUpdater.autoInstallOnAppQuit).toBe(false)
    expect(download).toHaveBeenCalledOnce();expect(quit).not.toHaveBeenCalled()
    await installDownloadedUpdate();await installDownloadedUpdate()
    expect(getUpdateStatus()).toMatchObject({phase:'installing',installStage:'restarting',availableVersion:'0.6.0'})
    expect(quit).toHaveBeenCalledOnce()
  })
  it('forwards actual downloaded and total bytes from updater events', () => {
    fakes.autoUpdater.emit('download-progress', {percent:44.4,transferred:44400000,total:100000000,downloadKind:'differential',archiveBytes:545000000,reusedBytes:445000000,resumedBytes:10000000})
    expect(getUpdateStatus()).toMatchObject({phase:'downloading',transferredBytes:44400000,totalBytes:100000000,downloadKind:'differential',archiveBytes:545000000,reusedBytes:445000000,resumedBytes:10000000})
  })

  it('allows another install attempt after the native installer reports an error', async () => {
    const quitAndInstall = vi.spyOn(fakes.autoUpdater, 'quitAndInstall').mockClear()
    fakes.autoUpdater.emit('error', new Error('Installation authorization cancelled'))
    expect(getUpdateStatus()).toMatchObject({ phase: 'error', manual: true })
    await checkForUpdates(true)
    await vi.waitFor(()=>expect(getUpdateStatus().phase).toBe('downloaded'))
    expect(quitAndInstall).not.toHaveBeenCalled()
    await installDownloadedUpdate()
    expect(quitAndInstall).toHaveBeenCalledOnce()
  })

})
