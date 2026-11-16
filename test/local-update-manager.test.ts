import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, type Server } from 'node:http'

const fake = vi.hoisted(() => ({
  switches: new Set<string>(), paths: {} as Record<string,string>, messages: [] as any[],
  handlers: new Map<string,(event:unknown)=>unknown>(),
  check: vi.fn(async () => { throw new Error('production updater must not be reached') }),
  download: vi.fn(), quit: vi.fn(), receipt: vi.fn(), recovery: vi.fn(), power: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getVersion: ()=>'0.9.5', getName: ()=>'EWork Odyssey', getPath:(key:string)=>fake.paths[key], isPackaged:true,
    isReady:()=>true, whenReady:async()=>{}, commandLine:{hasSwitch:(key:string)=>fake.switches.has(key)} },
  autoUpdater:{}, BrowserWindow:{getAllWindows:()=>[{isDestroyed:()=>false,webContents:{send:(_c:string,s:unknown)=>fake.messages.push(s)}}]},
  ipcMain:{handle:(c:string,h:(event:unknown)=>unknown)=>fake.handlers.set(c,h)},
  powerMonitor:{on:fake.power,removeListener:vi.fn()}
}))
// Keep the actual AppUpdater/GenericProvider/check event chain; only the production singleton is inert.
vi.mock('electron-updater', async importOriginal => {
  const real:any=await importOriginal()
  return {AppUpdater:real.AppUpdater,default:{AppUpdater:real.AppUpdater,autoUpdater:{checkForUpdates:fake.check,downloadUpdate:fake.download,quitAndInstall:fake.quit}}}
})
vi.mock('../src/main/update/restart-receipt',()=>({consumeUpdateRestartReceipt:fake.receipt,writeUpdateRestartReceipt:fake.receipt,cancelUpdateRestartReceipt:fake.receipt}))
vi.mock('../src/main/update/mac-update-recovery',()=>({armMacRenameRecovery:fake.recovery,repairRenamedMacDock:fake.recovery}))
vi.mock('../src/main/update/native-install',async importOriginal=>({...await importOriginal<typeof import('../src/main/update/native-install')>(),prepareNativeMacInstall:fake.quit}))

let root:string, userData:string, appData:string, origin:string, server:Server
let response= { code:200, body:'', location:'', delay:0 }, requests:string[]=[]
let manager:typeof import('../src/main/update/update-manager')
const metadata=(version='0.9.6',url='acceptance-unavailable.zip')=>`version: ${version}\nfiles:\n  - url: ${url}\n    sha512: ${Buffer.alloc(64).toString('base64')}\n    size: 1\npath: ${url}\nreleaseNotes: 本地合成检查，不提供下载或安装\n`
async function initialize(overrides:Record<string,unknown>={}) {
  expect((manager as any).initializeLocalUpdateChecks).toBeTypeOf('function')
  return (manager as any).initializeLocalUpdateChecks({acceptanceOrigin:'http://127.0.0.1:8773',feed:origin,feedRequested:true,userData,appData,...overrides},tmpdir())
}
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks();fake.messages=[];fake.handlers.clear();fake.switches=new Set(['sherlock-local-acceptance-origin','sherlock-local-update-feed'])
  root=await mkdtemp(join(tmpdir(),'ework-local-update-test-'));userData=join(root,'user');appData=join(root,'app');await mkdir(userData);await mkdir(appData);fake.paths={userData,appData}
  requests=[];response={code:200,body:metadata(),location:'',delay:0}
  server=createServer((req,res)=>{requests.push(req.url!);setTimeout(()=>{res.writeHead(response.code,response.location?{location:response.location}:{'content-type':'text/yaml'});res.end(response.body)},response.delay)})
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as any).port}`
  manager=await import('../src/main/update/update-manager')
})
afterEach(async()=>{manager?.stopUpdateManager();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true})})

describe('isolated local update checks',()=>{
  it('blocks raw acceptance actions before initialization without touching production updater',async()=>{
    await expect(manager.checkForUpdates(true)).rejects.toThrow(/local|隔离/i)
    await expect(manager.downloadAvailableUpdate()).rejects.toThrow(/local|隔离/i)
    await expect(manager.installDownloadedUpdate()).rejects.toThrow(/local|隔离/i)
    expect(fake.check).not.toHaveBeenCalled();expect(requests).toEqual([])
  })
  it('runs real delayed metadata through checking, available and existing trusted IPC, never installs',async()=>{
    response.delay=50;await initialize();const wc={mainFrame:{processId:1,routingId:1}};manager.registerUpdateHandlers(()=>({isDestroyed:()=>false,webContents:wc}))
    const event={sender:wc,senderFrame:wc.mainFrame};const checking=fake.handlers.get('updates:check')!(event)
    await new Promise(r=>setTimeout(r,20));expect(manager.getUpdateStatus().phase).toBe('checking')
    await checking;expect(manager.getUpdateStatus()).toMatchObject({phase:'available',availableVersion:'0.9.6',currentVersion:'0.9.5',releaseNotes:'本地合成检查，不提供下载或安装'})
    for(const channel of ['updates:download','updates:install'])await expect(Promise.resolve().then(()=>fake.handlers.get(channel)!(event))).rejects.toThrow(/检查|check/i)
    manager.startUpdateManager();expect(fake.power).not.toHaveBeenCalled();expect(fake.receipt).not.toHaveBeenCalled();expect(fake.recovery).not.toHaveBeenCalled();expect(fake.quit).not.toHaveBeenCalled();expect(fake.download).not.toHaveBeenCalled();expect(fake.check).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1);expect(requests[0]).toMatch(/^\/latest(?:-mac)?\.yml/)
    expect(await readdir(appData)).toEqual([]);expect((await readdir(userData)).filter(n=>n!=='.updaterId')).toEqual([])
  })
  it('reports up-to-date from the real unchanged application version',async()=>{await initialize();response.body=metadata('0.9.5');await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('up-to-date')})
  it('reports local HTTP failure then retries through the original check chain',async()=>{
    await initialize();response.code=503;response.body='Local fixture unavailable';await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('error')
    response.code=200;response.body=metadata();await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('available');expect(requests).toHaveLength(2)
  })
  it.each(['http://localhost:8788','http://127.1:8788','http://2130706433:8788','http://127.0.0.1','http://127.0.0.1:80','https://127.0.0.1:8788','http://u:p@127.0.0.1:8788','http://127.0.0.1:8788/path','http://127.0.0.1:8788?x=1','http://127.0.0.1:8788#x'])('fails closed on invalid feed %s',async(feed)=>{
    await expect(initialize({feed})).rejects.toThrow();await expect(manager.checkForUpdates(true)).rejects.toThrow();expect(fake.check).not.toHaveBeenCalled();expect(requests).toEqual([])
  })
  it('rejects feed without validated acceptance origin and leaves actions blocked',async()=>{await expect(initialize({acceptanceOrigin:undefined})).rejects.toThrow();await expect(manager.checkForUpdates()).rejects.toThrow();expect(fake.check).not.toHaveBeenCalled()})
  it('keeps ordinary acceptance without the new feed disabled',async()=>{await initialize({feed:'',feedRequested:false});await expect(manager.checkForUpdates()).rejects.toThrow();expect(fake.check).not.toHaveBeenCalled()})
  it('rejects equal, nested and symlink-escaped data directories',async()=>{
    await expect(initialize({appData:userData})).rejects.toThrow();const child=join(userData,'nested');await mkdir(child);await expect(initialize({appData:child})).rejects.toThrow()
    const escape=join(root,'escape');await symlink(process.cwd(),escape);await expect(initialize({appData:escape})).rejects.toThrow();expect(requests).toEqual([])
  })
  it('rejects redirect to a different loopback origin before sending it any request',async()=>{
    let received=0;const trap=createServer((_q,s)=>{received++;s.end(metadata())});await new Promise<void>(r=>trap.listen(0,'127.0.0.1',r))
    try{await initialize();response.code=302;response.location=`http://127.0.0.1:${(trap.address() as any).port}/latest-mac.yml`;await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('error');expect(received).toBe(0)}finally{await new Promise<void>(r=>trap.close(()=>r()))}
  })
  it('rejects a public redirect without resolving or contacting that host',async()=>{await initialize();response.code=302;response.location='https://updates.invalid/latest-mac.yml';await manager.checkForUpdates(true);expect(manager.getUpdateStatus()).toMatchObject({phase:'error'});expect(requests).toHaveLength(1)})
  it('rejects external and traversal artifact URLs even though downloads are blocked',async()=>{await initialize();for(const url of ['https://updates.invalid/a.zip','//127.0.0.1/a.zip','../a.zip','%2e%2e/a.zip']){response.body=metadata('0.9.6',url);await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('error')}})
  it('does not consume an existing isolated restart receipt during check setup',async()=>{await writeFile(join(userData,'update-restart-receipt.json'),'keep');await initialize();await manager.checkForUpdates(true);expect(fake.receipt).not.toHaveBeenCalled();expect(fake.recovery).not.toHaveBeenCalled()})
  it('keeps a no-flag ordinary launch on the existing production check path',async()=>{
    fake.switches.clear();vi.resetModules();manager=await import('../src/main/update/update-manager')
    await initialize({acceptanceOrigin:undefined,feed:'',feedRequested:false})
    await manager.checkForUpdates(true);expect(fake.check).toHaveBeenCalledOnce();expect(requests).toEqual([])
  })
  it('allows a bounded same-origin metadata redirect but blocks redirect loops',async()=>{
    await initialize();server.removeAllListeners('request')
    let first=true
    server.on('request',(req,res)=>{requests.push(req.url!);if(first){first=false;res.writeHead(302,{location:origin+'/latest.yml'});res.end()}else{res.end(metadata())}})
    await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('available');expect(requests).toHaveLength(2)
    requests=[];server.removeAllListeners('request');server.on('request',(req,res)=>{requests.push(req.url!);res.writeHead(302,{location:origin+'/latest.yml'});res.end()})
    await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('error');expect(requests).toHaveLength(4)
  })
  it('blocks same-origin redirects to artifact paths before fetching bytes',async()=>{
    await initialize();response.code=302;response.location='/acceptance-unavailable.zip';await manager.checkForUpdates(true)
    expect(manager.getUpdateStatus().phase).toBe('error');expect(requests).toHaveLength(1)
  })
  it('rejects oversized metadata and can retry without touching a download cache',async()=>{
    await initialize();response.body=metadata()+'#'.repeat(70*1024);await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('error')
    response.body=metadata();await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('available');expect(await readdir(appData)).toEqual([])
  })
  it('rejects direct updater downloads and quits before any request or staging/cache write',async()=>{
    const {LocalCheckUpdater}=await import('../src/main/update/local-check-updater')
    const updater=new LocalCheckUpdater({feed:origin,userData,appData},{version:'0.9.5',name:'EWork Odyssey',isPackaged:true,whenReady:async()=>{}})
    expect(updater.autoDownload).toBe(false);expect(updater.autoInstallOnAppQuit).toBe(false)
    await expect(updater.downloadUpdate()).rejects.toThrow(/检查/);expect(()=>updater.quitAndInstall()).toThrow(/检查/)
    expect(requests).toEqual([]);expect(await readdir(userData)).toEqual([]);expect(await readdir(appData)).toEqual([])
  })

})
