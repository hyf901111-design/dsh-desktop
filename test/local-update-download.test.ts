import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'

const fake = vi.hoisted(() => ({
  switches: new Set<string>(), paths: {} as Record<string,string>, messages: [] as any[],
  handlers: new Map<string,(event:unknown)=>unknown>(),
  check: vi.fn(async () => { throw new Error('production updater must not be reached') }),
  download: vi.fn(), quit: vi.fn(), receipt: vi.fn(), recovery: vi.fn(), power: vi.fn(), native: vi.fn(), prepare: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getVersion: ()=>'0.9.5', getName: ()=>'EWork Odyssey', getPath:(key:string)=>fake.paths[key], isPackaged:true,
    quit:fake.quit,relaunch:fake.quit,on:fake.quit,isReady:()=>true, whenReady:async()=>{}, commandLine:{hasSwitch:(key:string)=>fake.switches.has(key)} },
  autoUpdater:{setFeedURL:fake.native,checkForUpdates:fake.native,quitAndInstall:fake.native}, BrowserWindow:{getAllWindows:()=>[{isDestroyed:()=>false,webContents:{send:(_c:string,s:unknown)=>fake.messages.push(s)}}]},
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
vi.mock('../src/main/update/native-install',()=>({prepareNativeMacInstall:fake.quit}))

let root:string, userData:string, appData:string, origin:string, server:Server
let response= { code:200, body:'', location:'', delay:0 }, requests:string[]=[]
const bytes=Buffer.alloc(256*1024,42)
let artifact={mode:'success',delay:0,location:''}
const sha=createHash('sha512').update(bytes).digest('base64')
let manager:typeof import('../src/main/update/update-manager')
const metadata=(version='0.9.6',url='acceptance-unavailable.zip')=>`version: ${version}\nfiles:\n  - url: ${url}\n    sha512: ${sha}\n    size: ${bytes.length}\npath: ${url}\nreleaseNotes: 本地合成检查，不提供下载或安装\n`
async function initialize(overrides:Record<string,unknown>={}) {
  expect((manager as any).initializeLocalUpdateChecks).toBeTypeOf('function')
  return (manager as any).initializeLocalUpdateChecks({acceptanceOrigin:'http://127.0.0.1:8773',feed:origin,feedRequested:true,downloadRequested:true,userData,appData,...overrides},tmpdir())
}
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks();fake.messages=[];fake.handlers.clear();fake.switches=new Set(['sherlock-local-acceptance-origin','sherlock-local-update-feed'])
  root=await mkdtemp(join(tmpdir(),'ework-local-update-test-'));userData=join(root,'user');appData=join(root,'app');await mkdir(userData);await mkdir(appData);fake.paths={userData,appData}
  artifact={mode:'success',delay:0,location:''};requests=[];response={code:200,body:metadata(),location:'',delay:0}
  server=createServer((req,res)=>{
    requests.push(req.url!)
    if(req.url!.startsWith('/latest')){res.writeHead(response.code,response.location?{location:response.location}:{'content-type':'text/yaml'});res.end(response.body);return}
    if(artifact.location){res.writeHead(302,{location:artifact.location});res.end();return}
    const content=artifact.mode==='bad-hash'?Buffer.alloc(bytes.length,43):bytes
    res.writeHead(200,{'content-length':artifact.mode==='bad-length'?content.length+1:content.length})
    if(artifact.mode==='truncated'){res.write(content.subarray(0,100));setTimeout(()=>res.destroy(),20);return}
    if(!artifact.delay){res.end(content);return}
    let offset=0;const timer=setInterval(()=>{res.write(content.subarray(offset,offset+=32768));if(offset>=content.length){clearInterval(timer);res.end()}},artifact.delay);res.on('close',()=>clearInterval(timer))
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${(server.address() as any).port}`
  manager=await import('../src/main/update/update-manager')
})
afterEach(async()=>{await manager?.stopUpdateManager();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true})})

describe('isolated download-only update channel',()=>{
  async function ready(){await initialize();await manager.checkForUpdates(true);expect(manager.getUpdateStatus().phase).toBe('available');manager.setUpdateRestartPreparation(fake.prepare)}
  function noInstall(){for(const spy of [fake.check,fake.download,fake.quit,fake.native,fake.receipt,fake.recovery,fake.prepare])expect(spy).not.toHaveBeenCalled()}
  it('downloads real bounded bytes, emits true progress and completes without any installer path',async()=>{
    await ready();artifact.delay=250;await manager.downloadAvailableUpdate()
    expect(manager.getUpdateStatus().phase).toBe('downloaded')
    expect(fake.messages.some(s=>s.phase==='downloading'&&s.percent>0&&s.percent<100&&s.totalBytes===bytes.length)).toBe(true)
    const dirs=await readdir(appData);expect(dirs).toHaveLength(1)
    const cache=join(appData,dirs[0]!,'cache','acceptance-fixture','pending')
    expect(await readFile(join(cache,'acceptance-unavailable.zip'))).toEqual(bytes)
    expect(JSON.parse(await readFile(join(cache,'update-info.json'),'utf8')).sha512).toBe(sha)
    await expect(manager.installDownloadedUpdate()).rejects.toThrow(/install|安装/i);noInstall()
    await manager.stopUpdateManager();expect(await readdir(appData)).toEqual([])
  })
  it('reports true checksum failure, cleans pending data and retries the corrected fixture',async()=>{
    await ready();artifact.mode='bad-hash';await manager.downloadAvailableUpdate()
    expect(manager.getUpdateStatus()).toMatchObject({phase:'error',message:expect.stringMatching(/checksum mismatch/i)})
    expect(fake.messages.some(s=>s.phase==='downloaded')).toBe(false)
    const dirs=await readdir(appData);expect(await readdir(join(appData,dirs[0]!,'cache','acceptance-fixture','pending'))).toEqual([])
    artifact.mode='success';await manager.checkForUpdates(true);await manager.downloadAvailableUpdate();expect(manager.getUpdateStatus().phase).toBe('downloaded');noInstall()
  })
  it.each(['bad-length','truncated'])('rejects %s without downloaded or installation',async(mode)=>{
    await ready();artifact.mode=mode;await manager.downloadAvailableUpdate();expect(manager.getUpdateStatus().phase).toBe('error');expect(fake.messages.some(s=>s.phase==='downloaded')).toBe(false);noInstall()
  })
  it('rejects an external artifact redirect without connecting, and bounds same-origin redirect loops',async()=>{
    await ready();artifact.location='https://updates.invalid/payload.zip';await manager.downloadAvailableUpdate();expect(manager.getUpdateStatus().phase).toBe('error');noInstall()
    artifact.location='/acceptance-unavailable.zip';await manager.checkForUpdates(true);requests=[];await manager.downloadAvailableUpdate();expect(manager.getUpdateStatus().phase).toBe('error');expect(requests.filter(p=>p.endsWith('.zip')).length).toBeLessThanOrEqual(4)
  })
  it('blocks install while available, in progress and after download; cleanup cancels in-flight bytes',async()=>{
    await ready();await expect(manager.installDownloadedUpdate()).rejects.toThrow(/安装|install/i)
    artifact.delay=200;const download=manager.downloadAvailableUpdate();await new Promise(r=>setTimeout(r,100))
    await expect(manager.installDownloadedUpdate()).rejects.toThrow(/安装|install/i)
    await manager.stopUpdateManager();await download;expect(await readdir(appData)).toEqual([]);noInstall()
  })
  it('keeps a bare download flag blocked before IPC and rejects it without acceptance/feed',async()=>{
    fake.switches=new Set(['sherlock-local-update-download']);vi.resetModules();manager=await import('../src/main/update/update-manager')
    await expect(manager.checkForUpdates()).rejects.toThrow(/local|隔离/i)
    await expect(initialize({acceptanceOrigin:undefined,feedRequested:false})).rejects.toThrow();noInstall()
  })
  it('does not widen the old check-only capability',async()=>{
    await initialize({downloadRequested:false});await manager.checkForUpdates(true)
    await expect(manager.downloadAvailableUpdate()).rejects.toThrow(/检查|check/i);expect(await readdir(appData)).toEqual([]);noInstall()
  })
  it('rejects a cache parent replaced by a symlink before any artifact transfer',async()=>{
    await ready();const [dir]=await readdir(appData);const pending=join(appData,dir!,'cache','acceptance-fixture','pending')
    const outside=join(root,'outside');await mkdir(outside);await rm(pending,{recursive:true});await symlink(outside,pending)
    await manager.downloadAvailableUpdate();expect(manager.getUpdateStatus().phase).toBe('error');expect(requests.filter(p=>p.endsWith('.zip'))).toEqual([]);expect(await readdir(outside)).toEqual([]);noInstall()
  })
  it.each(['config','cache-record'])('rejects a tampered %s before accessing an escaped cache',async(kind)=>{
    await ready();const [dir]=await readdir(appData),own=join(appData,dir!)
    if(kind==='config')await writeFile(join(own,'app-update.yml'),'updaterCacheDirName: ../../outside\n')
    else await writeFile(join(own,'cache','acceptance-fixture','pending','update-info.json'),JSON.stringify({fileName:'../../../../outside',sha512:sha}))
    await manager.downloadAvailableUpdate();expect(manager.getUpdateStatus().phase).toBe('error');expect(requests.filter(p=>p.endsWith('.zip'))).toEqual([]);noInstall()
  })
  it('rejects artifact redirects to another loopback port without contacting it',async()=>{
    let hits=0;const trap=createServer((_q,r)=>{hits++;r.end(bytes)});await new Promise<void>(r=>trap.listen(0,'127.0.0.1',r))
    try{await ready();artifact.location=`http://127.0.0.1:${(trap.address() as any).port}/acceptance-unavailable.zip`;await manager.downloadAvailableUpdate();expect(manager.getUpdateStatus().phase).toBe('error');expect(hits).toBe(0);noInstall()}
    finally{await new Promise<void>(r=>trap.close(()=>r()))}
  })
  it.each([0,16777217])('rejects invalid declared artifact size %s before transfer',async(size)=>{
    await initialize();response.body=metadata().replace(`size: ${bytes.length}`,`size: ${size}`);await manager.checkForUpdates(true);await manager.downloadAvailableUpdate()
    expect(manager.getUpdateStatus().phase).toBe('error');expect(requests.filter(p=>p.endsWith('.zip'))).toEqual([]);noInstall()
  })
  it('keeps installer flags immutable and never constructs the platform updater',async()=>{
    const {LocalDownloadUpdater}=await import('../src/main/update/local-download-updater')
    const local=await LocalDownloadUpdater.create({feed:origin,userData:await realpath(userData),appData:await realpath(appData)},{version:'0.9.5',name:'fixture',isPackaged:true,whenReady:async()=>{}})
    try{
      for(const [key,value] of [['autoDownload',false],['autoInstallOnAppQuit',false],['autoRunAppAfterInstall',false],['disableDifferentialDownload',true]] as const){expect(local[key]).toBe(value);expect(Reflect.set(local,key,!value)).toBe(false)}
      expect(()=>local.quitAndInstall()).toThrow(/安装|install/i);noInstall()
    }finally{await local.dispose()}
  })

})
