vi.mock('../src/main/update/native-install', () => ({ prepareNativeMacInstall: async (_updater: unknown, _timeout: unknown, beforeQuit: () => Promise<unknown>) => { await beforeQuit(); fake.updater.quitAndInstall(false, true) } }))
vi.mock('../src/main/update/restart-receipt', () => ({ consumeUpdateRestartReceipt: () => undefined, writeUpdateRestartReceipt: vi.fn(), cancelUpdateRestartReceipt: vi.fn() }))
vi.mock('../src/main/update/mac-update-recovery', () => ({ armMacRenameRecovery: async () => undefined, repairRenamedMacDock: async () => {} }))
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  latest: '0.8.4', target: '',
  events: new Map<string, (value?: any) => void>(),
  updater: {
    autoDownload: true, autoInstallOnAppQuit: true, allowPrerelease: true,
    logger: undefined as unknown,
    on: vi.fn(), checkForUpdates: vi.fn(), downloadUpdate: vi.fn(), quitAndInstall: vi.fn()
  }
}))
vi.mock('electron', () => ({
  autoUpdater: {},
  app: { getVersion: () => '0.8.3', getPath: () => '/isolated-test', isPackaged: true, isReady: () => false },
  BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: vi.fn() },
  powerMonitor: { on: vi.fn(), removeListener: vi.fn() }
}))
vi.mock('electron-updater', () => ({ default: { autoUpdater: fake.updater } }))
let manager: typeof import('../src/main/update/update-manager')
beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  fake.events.clear()
  fake.latest = '0.8.4'
  fake.target = ''
  fake.updater.on.mockImplementation((event, callback) => fake.events.set(event, callback))
  fake.updater.checkForUpdates.mockImplementation(async () => {
    fake.events.get('checking-for-update')?.()
    fake.target = fake.latest
    fake.events.get('update-available')?.({ version: fake.target })
  })
  fake.updater.downloadUpdate.mockImplementation(async () => {
    fake.events.get('download-progress')?.({ percent: 50 })
    fake.events.get('update-downloaded')?.({ version: fake.target })
    return []
  })
  manager = await import('../src/main/update/update-manager')
  manager.startUpdateManager()
  manager.setUpdateRestartPreparation(async () => {})
  await manager.checkForUpdates()
})
afterEach(() => manager.stopUpdateManager())

describe('update target freshness', () => {
  it('never quits when research persistence fails, and retries only after saving succeeds', async () => {
    const stages: string[] = []
    manager.setUpdateRestartPreparation(async () => { stages.push(manager.getUpdateStatus().installStage!); throw Error('研究更改尚未保存') })
    await manager.downloadAvailableUpdate()
    expect(stages).toEqual(['saving'])
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'error', availableVersion: '0.8.4', message: '研究更改尚未保存' })
    expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
    manager.setUpdateRestartPreparation(async () => {})
    await manager.checkForUpdates(true)
    await manager.installDownloadedUpdate()
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'installing', installStage: 'restarting' })
    expect(fake.updater.quitAndInstall).toHaveBeenCalledOnce()
  })
  it('refreshes an available release in both background and manual checks', async () => {
    fake.latest = '0.8.5'
    await manager.checkForUpdates()
    expect(manager.getUpdateStatus().availableVersion).toBe('0.8.5')
    fake.latest = '0.8.7'
    await manager.checkForUpdates(true)
    expect(manager.getUpdateStatus().availableVersion).toBe('0.8.7')
  })
  it('downloads the latest release even if the button originally offered an older one', async () => {
    fake.latest = '0.8.7'
    await manager.downloadAvailableUpdate()
    expect(fake.target).toBe('0.8.7')
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'installing', availableVersion: '0.8.7' })
    expect(fake.updater.autoInstallOnAppQuit).toBe(false)
  })
  it('preserves a current downloaded archive without redownloading', async () => {
    fake.events.get('update-downloaded')?.({ version: '0.8.4' })
    await manager.checkForUpdates(true)
    expect(manager.getUpdateStatus().phase).toBe('downloaded')
    await manager.installDownloadedUpdate()
    expect(fake.updater.downloadUpdate).not.toHaveBeenCalled()
    expect(fake.updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })
  it('replaces an old downloaded release before allowing explicit installation', async () => {
    fake.events.get('update-downloaded')?.({ version: '0.8.4' })
    fake.latest = '0.8.7'
    await manager.installDownloadedUpdate()
    expect(fake.updater.quitAndInstall).toHaveBeenCalledTimes(1)
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'installing', availableVersion: '0.8.7' })
    await manager.installDownloadedUpdate()
    expect(fake.updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })
  it('detects a release published during downloading', async () => {
    fake.updater.downloadUpdate.mockImplementationOnce(async () => {
      fake.latest = '0.8.7'
      fake.events.get('update-downloaded')?.({ version: '0.8.4' })
      return []
    })
    await manager.downloadAvailableUpdate()
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'installing', availableVersion: '0.8.7' })
    expect(fake.updater.downloadUpdate).toHaveBeenCalledTimes(2)
    expect(fake.updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })
  it('does not install a cached archive when freshness cannot be verified', async () => {
    fake.events.get('update-downloaded')?.({ version: '0.8.4' })
    fake.updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await manager.installDownloadedUpdate()
    expect(manager.getUpdateStatus().phase).toBe('error')
    expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
    await manager.checkForUpdates(true)
    expect(manager.getUpdateStatus().phase).toBe('downloaded')
  })
  it('deduplicates clicks while waiting for a refresh', async () => {
    let release!: () => void
    fake.updater.checkForUpdates.mockImplementationOnce(() => new Promise<void>(resolve => {
      release = () => { fake.events.get('update-available')?.({ version: fake.latest }); resolve() }
    }))
    const first = manager.downloadAvailableUpdate()
    await Promise.resolve()
    const second = manager.downloadAvailableUpdate()
    release()
    await Promise.all([first, second])
    expect(fake.updater.downloadUpdate).toHaveBeenCalledTimes(1)
  })
})
