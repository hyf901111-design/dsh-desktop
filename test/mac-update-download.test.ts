import{createHash}from'node:crypto'
import{EventEmitter}from'node:events'
import{readFile,mkdtemp,mkdir,writeFile,rm,readdir}from'node:fs/promises'
import{createRequire}from'node:module'
import{runInNewContext}from'node:vm'
import{join}from'node:path'
import{tmpdir}from'node:os'
import{gzipSync}from'node:zlib'
import{createServer,type Server}from'node:http'
import{afterEach,expect,it,vi}from'vitest'
import{installMacUpdateTransfer,cancelMacUpdateTransfer}from'../src/main/update/mac-download'
const require=createRequire(import.meta.url),{NodeHttpExecutor}=require('builder-util/out/nodeHttpExecutor'),{createClient}=require('electron-updater/out/providerFactory'),{CancellationToken}=require('builder-util-runtime')
const roots:string[]=[],servers:Server[]=[],updaters:any[]=[],hash=(bytes:Buffer)=>createHash('sha512').update(bytes).digest('base64')
afterEach(async()=>{for(const updater of updaters)updater.closeServerIfExists();updaters.length=0;for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
async function fixture(withBase=true){
 const root=await mkdtemp(join(tmpdir(),'ework-mac-native-'));roots.push(root);const cache=join(root,'sherlock-updater');await mkdir(cache,{recursive:true})
 const old=Buffer.concat([Buffer.alloc(64*1024,65),Buffer.alloc(64*1024,66)]),target=Buffer.concat([Buffer.alloc(64*1024,65),Buffer.alloc(64*1024,99)])
 const blockmap=(data:Buffer)=>({version:'2',files:[{name:'file',offset:0,sizes:[65536,65536],checksums:[hash(data.subarray(0,65536)),hash(data.subarray(65536))]}]})
 const requests:string[]=[],control={failures:0,ignore:false,mapFailures:0},server=createServer((request,response)=>{
  const url=new URL(request.url!,'http://fixture');if(url.pathname.endsWith('.blockmap')){const bytes=gzipSync(JSON.stringify(blockmap(url.pathname.includes('1.3.4')?old:target)));if(control.mapFailures>0){control.mapFailures--;response.end(bytes.subarray(0,Math.floor(bytes.length/2)))}else response.end(bytes);return}
  requests.push(String(request.headers.range??''));const match=/^bytes=(\d+)-(\d+)$/.exec(String(request.headers.range??'')),start=Number(match?.[1]??0),end=Number(match?.[2]??target.length-1)
  if(!match||control.ignore){response.writeHead(200,{'Content-Length':target.length,ETag:'"fixed"'});response.end(target);return}
  response.writeHead(206,{'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${target.length}`,ETag:'"fixed"'})
  if(control.failures){control.failures--;response.write(target.subarray(start,Math.min(start+8192,end+1)));setTimeout(()=>response.destroy(),10)}else response.end(target.subarray(start,end+1))
 });servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+(server.address() as{port:number}).port
 if(withBase){await writeFile(join(cache,'update.zip'),old);await writeFile(join(cache,'current.blockmap'),gzipSync(JSON.stringify(blockmap(old))))}
 const native=Object.assign(new EventEmitter(),{setFeedURL:vi.fn(),checkForUpdates:vi.fn(),quitAndInstall:vi.fn()}),module={exports:{} as any},path=require.resolve('electron-updater/out/MacUpdater.js'),localRequire=createRequire(path)
 runInNewContext(await readFile(path,'utf8'),{module,exports:module.exports,require:(id:string)=>id==='electron'?{autoUpdater:native}:id==='child_process'?{execFileSync:()=> 'ARM'}:localRequire(id),console,URL,Buffer,process,setTimeout,clearTimeout})
 const config=join(root,'app-update.yml');await writeFile(config,'updaterCacheDirName: sherlock-updater\n')
 const updater=new module.exports.MacUpdater(undefined,{version:'1.3.4',name:'QA updater',isPackaged:true,appUpdateConfigPath:config,userDataPath:root,baseCachePath:root,whenReady:async()=>{},relaunch(){throw Error('No relaunch')},quit(){throw Error('No quit')},onQuit(){}});updaters.push(updater)
 updater.autoDownload=false;updater.autoInstallOnAppQuit=false;updater.logger={info(){},warn(){},error(){}};updater.httpExecutor=new NodeHttpExecutor();const provider=createClient({provider:'generic',url:origin,useMultipleRangeRequest:false},updater,{executor:updater.httpExecutor,platform:'darwin',isUseMultipleRangeRequest:false})
 updater.updateInfoAndProvider={info:{version:'1.4.1',files:[{url:'/releases/v1.4.1/update.zip',size:target.length,sha512:hash(target)}]},provider}
 const progress:any[]=[],downloaded:any[]=[];updater.on('download-progress',(value:any)=>progress.push(value));updater.on('update-downloaded',(value:any)=>downloaded.push(value))
 return{root,cache,updater,native,target,control,requests,progress,downloaded,install:()=>installMacUpdateTransfer(updater,{nativeUpdater:native,retryDelaysMs:[1]})}
}
it('retains real MacUpdater execute/cache/native-feed behavior while retrying only changed ranges',async()=>{
 const f=await fixture();f.control.failures=1;expect(f.install()).toBe(true);expect(f.install()).toBe(true)
 const result=await f.updater.downloadUpdate();expect(await readFile(result[0])).toEqual(f.target);expect(f.requests).toEqual(['bytes=65536-131071','bytes=73728-131071']);expect(await readFile(join(f.cache,'update.zip'))).toEqual(f.target)
 expect(f.progress.at(-1)).toMatchObject({downloadKind:'differential',total:65536,archiveBytes:131072,reusedBytes:65536});expect(f.downloaded).toHaveLength(1);expect(f.native.setFeedURL).toHaveBeenCalledOnce();expect(f.native.checkForUpdates).not.toHaveBeenCalled();expect(f.native.quitAndInstall).not.toHaveBeenCalled()
})
it('preserves resumable data through actual SDK failure cleanup and retries without full-download fallback',async()=>{
 const f=await fixture();f.control.failures=4;f.install();await expect(f.updater.downloadUpdate()).rejects.toThrow();expect(f.native.setFeedURL).not.toHaveBeenCalled();expect(f.requests.every(value=>value.startsWith('bytes='))).toBe(true)
 f.control.failures=0;const next=f.requests.length;const result=await f.updater.downloadUpdate();expect(f.requests[next]).not.toBe('bytes=65536-131071');expect(await readFile(result[0])).toEqual(f.target);expect(f.downloaded).toHaveLength(1)
})
it('reports the full network amount truthfully when no previous ZIP is available',async()=>{
 const f=await fixture(false);f.install();const result=await f.updater.downloadUpdate();expect(await readFile(result[0])).toEqual(f.target);expect(f.progress.at(-1)).toMatchObject({downloadKind:'full',total:131072,archiveBytes:131072,reusedBytes:0,fallbackReason:'no-cache'})
})
it('never leaves an obsolete base blockmap paired with the newly verified full archive',async()=>{
 const f=await fixture(false);await writeFile(join(f.cache,'current.blockmap'),gzipSync(JSON.stringify({version:'2',files:[{name:'file',offset:0,sizes:[1],checksums:['obsolete']}]})));f.install();await f.updater.downloadUpdate();await expect(readFile(join(f.cache,'current.blockmap'))).rejects.toThrow();expect(await readFile(join(f.cache,'update.zip'))).toEqual(f.target)
})
it('revalidates the real SDK warm-cache hit before a second native handoff, clearing only a corrupt pending archive',async()=>{
 const f=await fixture();f.install();const paths=await f.updater.downloadUpdate(),corrupt=Buffer.from(f.target);corrupt[0]=90;await writeFile(paths[0],corrupt)
 await expect(f.updater.downloadUpdate()).rejects.toThrow(/sha512|checksum/i);expect(f.downloaded).toHaveLength(1);expect(f.native.setFeedURL).toHaveBeenCalledOnce();const next=await f.updater.downloadUpdate();expect(await readFile(next[0])).toEqual(f.target)
})
it('uses a clean full stream only after explicit Range rejection and keeps SHA512/native handoff intact',async()=>{
 const f=await fixture();f.control.ignore=true;f.install();const result=await f.updater.downloadUpdate();expect(await readFile(result[0])).toEqual(f.target);expect(f.progress.at(-1)).toMatchObject({downloadKind:'full',fallbackReason:'range-unsupported'});expect(f.downloaded).toHaveLength(1)
})
it('retries a chunked truncated gzip blockmap instead of promoting one network failure to a full archive',async()=>{
 const f=await fixture();f.control.mapFailures=1;f.install();const paths=await f.updater.downloadUpdate();expect(await readFile(paths[0])).toEqual(f.target);expect(f.requests).toEqual(['bytes=65536-131071']);expect(f.progress.at(-1)?.downloadKind).toBe('differential')
})
it('stops after bounded incomplete blockmap attempts without downloading the full archive',async()=>{
 const f=await fixture();f.control.mapFailures=10;f.install();await expect(f.updater.downloadUpdate()).rejects.toThrow();expect(f.requests).toEqual([]);expect(f.native.setFeedURL).not.toHaveBeenCalled()
})
it('never installs this transport on a check/download-only adapter without the actual native identity',()=>{
 const executeDownload=vi.fn();expect(installMacUpdateTransfer({executeDownload},{nativeUpdater:new EventEmitter()})).toBe(false);expect(executeDownload).not.toHaveBeenCalled()
})
it('cancels through the installed production hook without native handoff or quitting and permits later retry',async()=>{
 const f=await fixture();f.control.failures=1;f.install();let once=false;f.updater.on('download-progress',()=>{if(!once){once=true;cancelMacUpdateTransfer(f.updater)}})
 await expect(f.updater.downloadUpdate()).rejects.toThrow(/cancel/i);expect(f.native.setFeedURL).not.toHaveBeenCalled();expect(f.native.quitAndInstall).not.toHaveBeenCalled()
 f.control.failures=0;await f.updater.downloadUpdate();expect(f.downloaded).toHaveLength(1)
})
