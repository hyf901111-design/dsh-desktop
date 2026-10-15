import {EventEmitter} from 'node:events'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'

const host=vi.hoisted(()=>({latest:'1.3.3',userData:'',native:undefined as any,updater:undefined as any,states:[] as any[],cancelRecovery:vi.fn()}))
vi.mock('electron',()=>({get autoUpdater(){return host.native},app:{getVersion:()=> '1.3.2',getName:()=> 'EWork Odyssey',getPath:()=>host.userData,isPackaged:true,isReady:()=>false},BrowserWindow:{getAllWindows:()=>[{isDestroyed:()=>false,webContents:{send:(_channel:string,status:unknown)=>host.states.push(status)}}]},ipcMain:{handle:vi.fn()},powerMonitor:{on:vi.fn(),removeListener:vi.fn()}}))
vi.mock('electron-updater',()=>({default:{get autoUpdater(){return host.updater}}}))
vi.mock('../src/main/update/mac-update-recovery',()=>({armMacRenameRecovery:async()=>host.cancelRecovery,repairRenamedMacDock:async()=>{}}))
let manager:typeof import('../src/main/update/update-manager')
beforeEach(async()=>{
 vi.resetModules();host.cancelRecovery.mockClear();host.latest='1.3.3';host.states=[];host.userData=await mkdtemp(join(tmpdir(),'ework-background-update-'))
 host.native=Object.assign(new EventEmitter(),{checkForUpdates:vi.fn(),quitAndInstall:vi.fn()})
 host.updater=Object.assign(new EventEmitter(),{autoDownload:true,autoInstallOnAppQuit:true,allowPrerelease:true,logger:undefined,
  checkForUpdates:vi.fn(async()=>{host.updater.emit('checking-for-update');host.updater.emit('update-available',{version:host.latest})}),
  downloadUpdate:vi.fn(async()=>{const version=host.latest;host.updater.emit('download-progress',{percent:50,transferred:500,total:1000});host.updater.emit('update-downloaded',{version});return ['/verified/update.zip']}),quitAndInstall:vi.fn()})
 manager=await import('../src/main/update/update-manager');manager.startUpdateManager();manager.setUpdateRestartPreparation(async()=>{})
})
afterEach(async()=>{await manager.stopUpdateManager();await rm(host.userData,{recursive:true,force:true})})
async function preparing(manual=false){await manager.checkForUpdates(manual);await vi.waitFor(()=>{expect(manager.getUpdateStatus().phase).toBe('preparing');expect(host.native.checkForUpdates).toHaveBeenCalledOnce()})}
async function ready(){await preparing();host.native.emit('update-downloaded');await vi.waitFor(()=>expect(manager.getUpdateStatus().phase).toBe('downloaded'))}

it('automatically downloads and extracts a discovered update, but never quits until the prepared update is explicitly installed',async()=>{
 await preparing();expect(host.updater.downloadUpdate).toHaveBeenCalledOnce();expect(host.native.checkForUpdates).toHaveBeenCalledOnce()
 expect(manager.getUpdateStatus().manual).toBe(false);expect(host.native.quitAndInstall).not.toHaveBeenCalled()
 await manager.installDownloadedUpdate();expect(host.native.quitAndInstall).not.toHaveBeenCalled()
 host.native.emit('update-downloaded');await vi.waitFor(()=>expect(manager.getUpdateStatus().phase).toBe('downloaded'))
 const checks=host.updater.checkForUpdates.mock.calls.length;await manager.installDownloadedUpdate();await manager.installDownloadedUpdate()
 expect(host.native.quitAndInstall).toHaveBeenCalledOnce();expect(host.updater.checkForUpdates).toHaveBeenCalledTimes(checks)
 expect(manager.getUpdateStatus()).toMatchObject({phase:'installing',installStage:'restarting'})
})
it('promotes an in-flight background transfer to manual status when About checks without starting a second transfer',async()=>{
 await preparing();await manager.checkForUpdates(true)
 expect(manager.getUpdateStatus()).toMatchObject({phase:'preparing',manual:true});expect(host.updater.downloadUpdate).toHaveBeenCalledOnce()
 host.native.emit('update-downloaded');await vi.waitFor(()=>expect(manager.getUpdateStatus()).toMatchObject({phase:'downloaded',manual:true}))
})
it('keeps the client running after extraction failure and retries preparation using the same verified archive',async()=>{
 await preparing();host.native.emit('error',Error('extract failed'))
 await vi.waitFor(()=>expect(manager.getUpdateStatus()).toMatchObject({phase:'error',errorStage:'install'}))
 expect(host.native.quitAndInstall).not.toHaveBeenCalled()
 await manager.checkForUpdates(true);await vi.waitFor(()=>expect(host.native.checkForUpdates).toHaveBeenCalledTimes(2))
 host.native.emit('update-downloaded');await vi.waitFor(()=>expect(manager.getUpdateStatus().phase).toBe('downloaded'))
 expect(host.updater.downloadUpdate).toHaveBeenCalledOnce()
})
it('refreshes a release that changed during extraction before offering a restart',async()=>{
 await preparing();host.latest='1.3.4';host.native.emit('update-downloaded')
 await vi.waitFor(()=>expect(host.native.checkForUpdates).toHaveBeenCalledTimes(2))
 expect(host.updater.downloadUpdate).toHaveBeenCalledTimes(2);expect(manager.getUpdateStatus()).toMatchObject({phase:'preparing',availableVersion:'1.3.4'})
 host.native.emit('update-downloaded');await vi.waitFor(()=>expect(manager.getUpdateStatus()).toMatchObject({phase:'downloaded',availableVersion:'1.3.4'}))
 expect(host.native.quitAndInstall).not.toHaveBeenCalled()
})
it('saves the latest edits only on the explicit restart action and refuses to quit when saving fails',async()=>{
 const save=vi.fn(async()=>{throw Error('changes not saved')});manager.setUpdateRestartPreparation(save)
 await ready();expect(save).not.toHaveBeenCalled();await manager.installDownloadedUpdate()
 expect(manager.getUpdateStatus()).toMatchObject({phase:'error',errorStage:'install',message:'changes not saved'});expect(host.native.quitAndInstall).not.toHaveBeenCalled()
 manager.setUpdateRestartPreparation(async()=>{});await manager.checkForUpdates(true);await vi.waitFor(()=>expect(manager.getUpdateStatus().phase).toBe('downloaded'))
 await manager.installDownloadedUpdate();expect(host.native.quitAndInstall).toHaveBeenCalledOnce();expect(host.native.checkForUpdates).toHaveBeenCalledOnce()
})
it('cancels pending preparation on shutdown and ignores a late native completion',async()=>{
 await preparing();await manager.stopUpdateManager();host.native.emit('update-downloaded');await Promise.resolve()
 expect(host.native.quitAndInstall).not.toHaveBeenCalled();expect(manager.getUpdateStatus().phase).not.toBe('downloaded')
})
it('does not quit after an installer error arrives while final edit saving is still pending',async()=>{
 await ready();let finish!:()=>void
 manager.setUpdateRestartPreparation(()=>new Promise<void>(resolve=>{finish=resolve}))
 const installing=manager.installDownloadedUpdate();host.updater.emit('error',Error('native installer failed'));finish();await installing
 expect(host.native.quitAndInstall).not.toHaveBeenCalled();expect(manager.getUpdateStatus()).toMatchObject({phase:'error',errorStage:'install'})
})
it('keeps the explicitly chosen installer stable if an older periodic check discovers another release during final saving',async()=>{
 await ready();let finishCheck!:()=>void,finishSave!:()=>void
 host.updater.checkForUpdates.mockImplementationOnce(()=>new Promise<void>(resolve=>{finishCheck=()=>{host.updater.emit('update-available',{version:'1.3.4'});resolve()}}))
 const check=manager.checkForUpdates()
 manager.setUpdateRestartPreparation(()=>new Promise<void>(resolve=>{finishSave=resolve}))
 const install=manager.installDownloadedUpdate();host.latest='1.3.4';finishCheck();await check
 expect(host.updater.downloadUpdate).toHaveBeenCalledOnce();expect(host.native.checkForUpdates).toHaveBeenCalledOnce()
 finishSave();await install
 expect(host.native.quitAndInstall).toHaveBeenCalledOnce()
 expect(manager.getUpdateStatus()).toMatchObject({phase:'installing',availableVersion:'1.3.3'})
})
it('cancels the restart receipt and recovery guard if native installation fails asynchronously after the restart request returns',async()=>{
 await ready();await manager.installDownloadedUpdate()
 expect(host.cancelRecovery).not.toHaveBeenCalled()
 host.updater.emit('error',Error('native restart refused'))
 expect(host.cancelRecovery).toHaveBeenCalledOnce()
 const {consumeUpdateRestartReceipt}=await import('../src/main/update/restart-receipt')
 expect(consumeUpdateRestartReceipt(host.userData,'1.3.3')).toBeUndefined()
 expect(manager.getUpdateStatus()).toMatchObject({phase:'error',errorStage:'install'})
})
