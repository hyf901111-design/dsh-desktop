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
  app: { getVersion: () => '0.8.3', isPackaged: true, isReady: () => false },
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
  await manager.checkForUpdates()
})
afterEach(() => manager.stopUpdateManager())

describe('update target freshness', () => {
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
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'downloaded', availableVersion: '0.8.7' })
    expect(fake.updater.autoInstallOnAppQuit).toBe(false)
  })
  it('preserves a current downloaded archive without redownloading', async () => {
    await manager.downloadAvailableUpdate()
    await manager.checkForUpdates(true)
    expect(manager.getUpdateStatus().phase).toBe('downloaded')
    await manager.installDownloadedUpdate()
    expect(fake.updater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(fake.updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })
  it('replaces an old downloaded release before allowing explicit installation', async () => {
    await manager.downloadAvailableUpdate()
    fake.latest = '0.8.7'
    await manager.installDownloadedUpdate()
    expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'downloaded', availableVersion: '0.8.7' })
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
    expect(manager.getUpdateStatus()).toMatchObject({ phase: 'available', availableVersion: '0.8.7' })
    await manager.installDownloadedUpdate()
    expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
  })
  it('does not install a cached archive when freshness cannot be verified', async () => {
    await manager.downloadAvailableUpdate()
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
