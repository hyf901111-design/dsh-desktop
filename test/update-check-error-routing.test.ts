import { afterEach, expect, it, vi } from 'vitest'
import { Window } from 'happy-dom'
import { SidebarUpdateControl } from '../src/preload/sidebar-update-control'
import type { UpdateStatus } from '../src/shared/contracts'

const fakes=vi.hoisted(()=>{
  const listeners=new Map<string,Array<(arg:unknown)=>void>>()
  const emit=(event:string,arg?:unknown)=>listeners.get(event)?.forEach(fn=>fn(arg))
  const f={checkFails:true,publish:(_status:unknown)=>{},updater:{
    autoDownload:true,autoInstallOnAppQuit:true,allowPrerelease:true,logger:undefined as unknown,
    on:(event:string,fn:(arg:unknown)=>void)=>{listeners.set(event,[...(listeners.get(event)??[]),fn])},
    checkForUpdates:vi.fn(async()=>{emit('checking-for-update');if(f.checkFails){const error=Error('HTTP 503');emit('error',error);throw error}emit('update-available',{version:'0.9.6'})}),
    downloadUpdate:vi.fn(async()=>{const error=Error('ECONNRESET during transfer');emit('error',error);throw error}),
    quitAndInstall:vi.fn()
  }}
  return f
})
vi.mock('electron',()=>({
  autoUpdater:{},app:{getVersion:()=> '0.9.5',getPath:()=>'/isolated-test',isPackaged:true,isReady:()=>false},
  BrowserWindow:{getAllWindows:()=>[{isDestroyed:()=>false,webContents:{send:(_channel:string,status:unknown)=>fakes.publish(status)}}]},
  ipcMain:{handle:vi.fn()},powerMonitor:{on:vi.fn(),removeListener:vi.fn()}
}))
vi.mock('electron-updater',()=>({default:{autoUpdater:fakes.updater}}))
vi.mock('../src/main/update/restart-receipt',()=>({consumeUpdateRestartReceipt:()=>undefined,writeUpdateRestartReceipt:vi.fn(),cancelUpdateRestartReceipt:vi.fn()}))
vi.mock('../src/main/update/mac-update-recovery',()=>({armMacRenameRecovery:vi.fn(),repairRenamedMacDock:async()=>{}}))
import {checkForUpdates,downloadAvailableUpdate,getUpdateStatus,installDownloadedUpdate,startUpdateManager,stopUpdateManager} from '../src/main/update/update-manager'
afterEach(()=>stopUpdateManager())
it('keeps check errors distinct and starts a background transfer once a retry discovers an update',async()=>{
  const win=new Window({url:'https://ework.local'}),doc=win.document as unknown as Document
  doc.body.innerHTML='<aside data-dsh-sidebar-root><footer data-dsh-sidebar-footer></footer></aside>'
  const control=new SidebarUpdateControl(doc,'zh',{retry:()=>checkForUpdates(true),download:downloadAvailableUpdate,install:installDownloadedUpdate})
  fakes.publish=status=>control.render(status as UpdateStatus)
  startUpdateManager()
  try{
    // AppUpdater emits error and rejects the same check: the second transition
    // must preserve check provenance rather than reclassify generic error.
    await checkForUpdates(true)
    expect(getUpdateStatus()).toMatchObject({phase:'error',errorStage:'check'})
    expect(doc.querySelector('.ework-notice-primary')?.textContent).toBe('重新检查')
    fakes.checkFails=false
    ;doc.querySelector<HTMLButtonElement>('.ework-notice-primary')!.click()
    // The successful check automatically starts the transfer; a transport
    // failure before its first progress event must remain a download error.
    await vi.waitFor(()=>expect(getUpdateStatus()).toMatchObject({phase:'error',errorStage:'download'}))
    expect(fakes.updater.downloadUpdate).toHaveBeenCalledTimes(1)
    expect(doc.querySelector('.ework-notice-primary')?.textContent).toBe('重新下载')
    doc.querySelector<HTMLButtonElement>('.ework-notice-primary')!.click()
    await vi.waitFor(()=>expect(fakes.updater.downloadUpdate).toHaveBeenCalledTimes(2))
    expect(fakes.updater.quitAndInstall).not.toHaveBeenCalled()
  }finally{fakes.publish=()=>{};await win.happyDOM.close()}
})
