vi.mock('../src/main/update/native-install', () => ({ prepareNativeMacInstall: async () => {} }))
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
  autoUpdater: {quitAndInstall:()=>fake.updater.quitAndInstall(false,true)},
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
  await vi.waitFor(()=>expect(manager.getUpdateStatus().phase).toBe('downloaded'))
  fake.updater.downloadUpdate.mockClear()
})
afterEach(() => manager.stopUpdateManager())

describe('update target freshness',()=>{
  it('never quits when persistence fails and only retries after saving succeeds',async()=>{
    manager.setUpdateRestartPreparation(async()=>{throw Error('研究更改尚未保存')})
    await manager.installDownloadedUpdate();expect(manager.getUpdateStatus()).toMatchObject({phase:'error',errorStage:'install',message:'研究更改尚未保存'})
    expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
    manager.setUpdateRestartPreparation(async()=>{});await manager.checkForUpdates(true);await manager.installDownloadedUpdate()
    expect(fake.updater.quitAndInstall).toHaveBeenCalledOnce();expect(fake.updater.downloadUpdate).not.toHaveBeenCalled()
  })
  it('refreshes and prepares newer releases during both background and manual checks',async()=>{
    for(const [version,manual] of [['0.8.5',false],['0.8.7',true]] as const){
      fake.latest=version;await manager.checkForUpdates(manual)
      await vi.waitFor(()=>expect(manager.getUpdateStatus()).toMatchObject({phase:'downloaded',availableVersion:version,manual}))
    }
    expect(fake.updater.downloadUpdate).toHaveBeenCalledTimes(2);expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
  })
  it('preserves a prepared archive without downloading or checking again at the restart click',async()=>{
    await manager.checkForUpdates(true);const checks=fake.updater.checkForUpdates.mock.calls.length
    await manager.installDownloadedUpdate()
    expect(fake.updater.downloadUpdate).not.toHaveBeenCalled();expect(fake.updater.checkForUpdates).toHaveBeenCalledTimes(checks)
    expect(fake.updater.quitAndInstall).toHaveBeenCalledOnce()
  })
  it('replaces an obsolete prepared version after a newer release is discovered',async()=>{
    fake.latest='0.8.7';await manager.checkForUpdates()
    await vi.waitFor(()=>expect(manager.getUpdateStatus()).toMatchObject({phase:'downloaded',availableVersion:'0.8.7'}))
    expect(fake.updater.quitAndInstall).not.toHaveBeenCalled();await manager.installDownloadedUpdate();await manager.installDownloadedUpdate()
    expect(fake.updater.quitAndInstall).toHaveBeenCalledOnce();expect(manager.getUpdateStatus().availableVersion).toBe('0.8.7')
  })
  it('detects a release published during downloading before offering a restart',async()=>{
    fake.latest='0.8.5';fake.updater.downloadUpdate.mockImplementationOnce(async()=>{fake.latest='0.8.7';fake.events.get('update-downloaded')?.({version:'0.8.5'});return []})
    await manager.checkForUpdates()
    await vi.waitFor(()=>expect(manager.getUpdateStatus()).toMatchObject({phase:'downloaded',availableVersion:'0.8.7'}))
    expect(fake.updater.downloadUpdate).toHaveBeenCalledTimes(2);expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
  })
  it('does not allow installation after a failed freshness check until a successful check restores readiness',async()=>{
    fake.updater.checkForUpdates.mockRejectedValueOnce(Error('offline'));await manager.checkForUpdates(true);await manager.installDownloadedUpdate()
    expect(manager.getUpdateStatus()).toMatchObject({phase:'error',errorStage:'check'});expect(fake.updater.quitAndInstall).not.toHaveBeenCalled()
    await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('downloaded')
  })
  it('deduplicates download actions while the automatic transfer is pending',async()=>{
    fake.latest='0.8.5';let release!:()=>void
    fake.updater.downloadUpdate.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>{fake.events.get('update-downloaded')?.({version:'0.8.5'});resolve([])}}))
    await manager.checkForUpdates();const first=manager.downloadAvailableUpdate(),second=manager.downloadAvailableUpdate();release();await Promise.all([first,second])
    expect(manager.getUpdateStatus().phase).toBe('downloaded');expect(fake.updater.downloadUpdate).toHaveBeenCalledOnce()
  })
})
