import{readFile,lstat,writeFile,rm}from'node:fs/promises'
import{join,dirname,resolve}from'node:path'
import{createReadStream}from'node:fs'
import{createHash}from'node:crypto'
import{gunzipSync,gzipSync}from'node:zlib'
import{CancellationError,type CancellationToken,type BlockMap,type DownloadOptions,type ProgressInfo}from'builder-util-runtime'
import{computeOperations,type Operation}from'electron-updater/out/differentialDownloader/downloadPlanBuilder.js'
import type{DownloadExecutorTask}from'electron-updater/out/AppUpdater.js'
import type{UpdateDownloadedEvent}from'electron-updater/out/types.js'
import{downloadResumableUpdate,RangeUnsupportedError,clearVerifiedTransfer,type TransferExecutor,type TransferInput,type TransferProgress}from'./resumable-transfer'

export type TransferFallback='no-cache'|'no-blockmap'|'range-unsupported'|'differential-disabled'|'no-reusable-blocks'
export type MacTransferProgress=TransferProgress&{fallbackReason?:TransferFallback}
type Executor=TransferExecutor&{downloadToBuffer(url:URL,options:DownloadOptions):Promise<Buffer>}
type MacBoundary={nativeUpdater:unknown;app:{version:string};httpExecutor:Executor;downloadedUpdateHelper:{cacheDir:string;clear():Promise<void>}|null;previousBlockmapBaseUrlOverride?:string|null;executeDownload(task:DownloadExecutorTask):Promise<string[]>;emit(name:'download-progress',value:ProgressInfo):boolean;logger:{info(value:string):void;warn(value:string):void}}
type Installation={cancel():void}
const installed=new WeakMap<object,Installation>()
class UnsupportedBlockmap extends Error{}
const cancelled=(token:CancellationToken)=>{if(token.cancelled)throw new CancellationError()}
async function validateArchive(owner:MacBoundary,task:DownloadExecutorTask,file:string){
 const token=task.downloadUpdateOptions.cancellationToken;cancelled(token)
 if(dirname(resolve(file))!==resolve(owner.downloadedUpdateHelper!.cacheDir,'pending'))throw Error('Update archive escaped native pending cache.')
 const stat=await lstat(file)
 if(!stat.isFile()||stat.isSymbolicLink()||stat.size!==task.fileInfo.info.size)throw Error('Update archive size/checksum mismatch.')
 const hash=createHash('sha512')
 for await(const chunk of createReadStream(file)){cancelled(token);hash.update(chunk)}
 if(hash.digest('base64')!==task.fileInfo.info.sha512)throw Error('Update SHA512 checksum mismatch.')
 cancelled(token)
}
function validateMap(value:unknown):BlockMap{
 const map=value as BlockMap,file=map?.files?.[0]
 if(map?.version!=='2'||!Array.isArray(map.files)||map.files.length!==1||!file||file.offset!==0||typeof file.name!=='string'||!Array.isArray(file.sizes)||!file.sizes.length||file.sizes.length>200000||!Array.isArray(file.checksums)||file.sizes.length!==file.checksums.length||file.sizes.some(size=>!Number.isSafeInteger(size)||size<=0)||file.checksums.some(hash=>typeof hash!=='string'||!hash||hash.length>128))throw new UnsupportedBlockmap('Invalid update blockmap.')
 return map
}
const unpack=(buffer:Buffer)=>{if(buffer.length>4*1024*1024)throw Error('Oversized update blockmap.');return validateMap(JSON.parse(gunzipSync(buffer,{maxOutputLength:32*1024*1024}).toString('utf8')))}
async function blockmap(owner:MacBoundary,url:URL,options:DownloadOptions){
 for(let retry=0;;retry++)try{cancelled(options.cancellationToken);return unpack(await owner.httpExecutor.downloadToBuffer(url,options))}catch(error){
  cancelled(options.cancellationToken);const reason=error as NodeJS.ErrnoException&{statusCode?:number}
  if(retry>=2||!(reason.statusCode===429||!!reason.statusCode&&reason.statusCode>=500||error instanceof SyntaxError||/ECONN|ETIMEDOUT|EPIPE|ERR_|Z_BUF_ERROR|Z_DATA_ERROR|socket|aborted|network|unexpected end/i.test((reason.code??'')+' '+reason.message)))throw error
  await options.cancellationToken.createPromise<void>((resolve,_reject,onCancel)=>{const timer=setTimeout(resolve,200*(retry+1));onCancel(()=>clearTimeout(timer))})
 }
}
async function plan(owner:MacBoundary,task:DownloadExecutorTask,token:CancellationToken):Promise<{operations?:Operation[];oldFile?:string;newMap?:BlockMap;reason?:TransferFallback}>{
 const cache=owner.downloadedUpdateHelper!.cacheDir,oldFile=join(cache,'update.zip'),provider=task.downloadUpdateOptions.updateInfoAndProvider.provider,info=task.downloadUpdateOptions.updateInfoAndProvider.info
 if(task.downloadUpdateOptions.disableDifferentialDownload)return{reason:'differential-disabled'}
 let oldSize:number
 try{const stat=await lstat(oldFile);if(!stat.isFile()||stat.isSymbolicLink())return{reason:'no-cache'};oldSize=stat.size}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{reason:'no-cache'};throw error}
 const urls=await provider.getBlockMapFiles(task.fileInfo.url,owner.app.version,info.version,owner.previousBlockmapBaseUrlOverride??null),options={headers:task.downloadUpdateOptions.requestHeaders,cancellationToken:token}
 let newMap:BlockMap,oldMap:BlockMap
 try{
  newMap=await blockmap(owner,urls[1]!,options)
  try{const path=join(cache,'current.blockmap'),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>4*1024*1024)throw Error('Unsafe cached blockmap.');oldMap=unpack(await readFile(path))}catch{oldMap=await blockmap(owner,urls[0]!,options)}
 }catch(error){
  cancelled(token);const code=(error as {statusCode?:number}).statusCode
  // Only a missing/unsupported map warrants full download, never a socket error.
  if(code===404||code===410||error instanceof UnsupportedBlockmap)return{reason:'no-blockmap'}
  throw error
 }
 const sum=(map:BlockMap)=>map.files[0]!.sizes.reduce((a,b)=>a+b,0)
 if(sum(oldMap)!==oldSize||sum(newMap)!==task.fileInfo.info.size)return{reason:'no-blockmap',newMap}
 let operations:Operation[]
 try{operations=computeOperations(oldMap,newMap,{info(){},warn(){},error(){}})}catch{return{reason:'no-blockmap',newMap}}
 if(operations.filter(op=>op.kind===1).reduce((sum,op)=>sum+op.end-op.start,0)>=task.fileInfo.info.size!)return{reason:'no-reusable-blocks',newMap}
 return{operations,oldFile,newMap}
}

/** Replace only the archive task on the existing production MacUpdater instance.
 * Its executeDownload cache/rename/done and Squirrel signature/install path stay native.
 */
export function installMacUpdateTransfer(updater:unknown,options:{nativeUpdater:unknown;retryDelaysMs?:readonly number[]}):boolean{
 if(!updater||typeof updater!=='object')return false
 const owner=updater as MacBoundary
 if(owner.nativeUpdater!==options.nativeUpdater||!owner.nativeUpdater||typeof owner.executeDownload!=='function'||!owner.httpExecutor?.createRequest||!owner.httpExecutor.downloadToBuffer||!owner.app?.version)return false
 if(installed.has(owner))return true
 const original=owner.executeDownload,tokens=new Set<CancellationToken>();installed.set(owner,{cancel:()=>{for(const token of tokens)token.cancel()}})
 owner.executeDownload=function(task){
  if(task.fileExtension!=='zip')return original.call(owner,task)
  const token=task.downloadUpdateOptions.cancellationToken;tokens.add(token)
  let transfer:TransferInput|undefined,hasNewMap=false
  return original.call(owner,{...task,
   task:async(destination)=>{
    cancelled(token);if(!owner.downloadedUpdateHelper)throw Error('Native updater cache is unavailable.')
    const planned=await plan(owner,task,token);cancelled(token)
    let reason=planned.reason
    transfer={url:task.fileInfo.url,version:task.downloadUpdateOptions.updateInfoAndProvider.info.version,size:task.fileInfo.info.size!,sha512:task.fileInfo.info.sha512,cacheDir:owner.downloadedUpdateHelper.cacheDir,destination,executor:owner.httpExecutor,cancellationToken:token,headers:task.downloadUpdateOptions.requestHeaders,operations:planned.operations,oldFile:planned.oldFile,retryDelaysMs:options.retryDelaysMs,
     onProgress:value=>{if(!token.cancelled)owner.emit('download-progress',{...value,...(reason?{fallbackReason:reason}:{})} as MacTransferProgress)}}
    try{await downloadResumableUpdate(transfer)}catch(error){
     if(!(error instanceof RangeUnsupportedError)||!transfer.operations)throw error
     reason='range-unsupported';owner.logger.warn('更新服务器不支持差分Range；改为可校验的完整下载。')
     transfer={...transfer,operations:undefined,oldFile:undefined};await downloadResumableUpdate(transfer)
    }
    cancelled(token)
    const pendingMap=join(owner.downloadedUpdateHelper.cacheDir,'pending','current.blockmap')
    await rm(pendingMap,{force:true})
    if(planned.newMap){await writeFile(pendingMap,gzipSync(JSON.stringify(planned.newMap)),{flag:'wx',mode:0o600});hasNewMap=true}
   },
   done:async(event:UpdateDownloadedEvent)=>{
    try{await validateArchive(owner,task,event.downloadedFile)}catch(error){if(!token.cancelled)await owner.downloadedUpdateHelper!.clear();throw error}
    const result=await task.done?.(event)
    if(transfer&&!hasNewMap)await rm(join(owner.downloadedUpdateHelper!.cacheDir,'current.blockmap'),{force:true})
    return result
   }
  }).then(async paths=>{
   // The native cache now owns the verified archive; partial state is redundant.
   if(transfer)await clearVerifiedTransfer(transfer).catch(error=>owner.logger.warn('Verified update partial cleanup deferred: '+String(error)))
   return paths
  }).finally(()=>tokens.delete(token))
 }
 return true
}
export function cancelMacUpdateTransfer(updater:unknown):void{if(updater&&typeof updater==='object')installed.get(updater)?.cancel()}
