import{createHash,randomUUID}from'node:crypto'
import{constants}from'node:fs'
import{open,mkdir,lstat,readFile,writeFile,rename,rm,type FileHandle}from'node:fs/promises'
import{join}from'node:path'
import type{IncomingMessage,RequestOptions}from'node:http'
import{CancellationError,type CancellationToken}from'builder-util-runtime'
import type{Operation}from'electron-updater/out/differentialDownloader/downloadPlanBuilder'
import type{ProgressInfo}from'builder-util-runtime'
import type{EventEmitter}from'node:events'

export interface TransferProgress extends ProgressInfo{downloadKind:'differential'|'full';archiveBytes:number;reusedBytes:number;resumedBytes:number}
type Request=EventEmitter&{end():void;abort():void}
export interface TransferExecutor{createRequest(options:RequestOptions,receive:(response:IncomingMessage)=>void):Request}
export interface TransferInput{
 url:URL;version:string;size:number;sha512:string;cacheDir:string;destination:string;executor:TransferExecutor;cancellationToken:CancellationToken
 headers?:Record<string,string|string[]|number|undefined>|null;operations?:Operation[];oldFile?:string;onProgress?:(value:TransferProgress)=>void;retryDelaysMs?:readonly number[];timeoutMs?:number
}
type Part={bytes:number;sha256:string}
type State={identity:string;etag:string|null;parts:Record<string,Part>}
export class RangeUnsupportedError extends Error{}
class RepresentationChanged extends Error{}
const locks=new Set<string>(),MAX_SIZE=8*1024**3,BUFFER=128*1024
const checksum=(value:string)=>createHash('sha256').update(value).digest('hex')
export const transferIdentity=(input:Pick<TransferInput,'version'|'url'|'size'|'sha512'>)=>checksum(JSON.stringify([input.version,input.url.href,input.size,input.sha512]))
const cancelled=(input:TransferInput)=>{if(input.cancellationToken.cancelled)throw new CancellationError()}
const textHeader=(response:IncomingMessage,name:string)=>{const value=response.headers[name];return Array.isArray(value)?value[0]:value}
const strongEtag=(value:string|undefined)=>value&&/^"[^\r\n"]*"$/.test(value)?value:null
const regular=async(path:string)=>{const info=await lstat(path);if(!info.isFile()||info.isSymbolicLink())throw Error('Unsafe update cache file.');return info}
async function directory(path:string){await mkdir(path,{recursive:true,mode:0o700});const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Unsafe update cache directory.')}
async function acquire(root:string){
 if(locks.has(root))throw Error('更新下载正在进行，请稍后重试。');locks.add(root)
 const path=join(root,'.lock'),token=randomUUID();let acquiredInode:number|undefined
 try{
  for(let attempt=0;;attempt++){
   try{await mkdir(path,{mode:0o700});acquiredInode=(await lstat(path)).ino;break}catch(error){
    if((error as NodeJS.ErrnoException).code!=='EEXIST'||attempt)throw error
    const info=await lstat(path);if(!info.isDirectory()||info.isSymbolicLink())throw Error('Unsafe update lock.')
    let owner:{pid?:number};try{const raw=await readFile(join(path,'owner.json'),'utf8');if(raw.length>1024)throw Error();owner=JSON.parse(raw)}catch{throw Error('更新下载锁未确认，请稍后重试。')}
    if(!Number.isSafeInteger(owner.pid)||owner.pid!<=0)throw Error('Unsafe update lock owner.')
    let alive=true;try{process.kill(owner.pid!,0)}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false}
    if(alive)throw Error('更新下载正在进行，请稍后重试。')
    const again=await lstat(path);if(again.ino!==info.ino||again.mtimeMs!==info.mtimeMs)throw Error('Update lock changed.')
    await rm(path,{recursive:true})
   }
  }
  await writeFile(join(path,'owner.json'),JSON.stringify({pid:process.pid,token}),{mode:0o600,flag:'wx'})
  return async()=>{try{const owner=JSON.parse(await readFile(join(path,'owner.json'),'utf8'));if(owner.token===token)await rm(path,{recursive:true})}finally{locks.delete(root)}}
 }catch(error){
  if(acquiredInode!==undefined)try{const info=await lstat(path);if(info.isDirectory()&&!info.isSymbolicLink()&&info.ino===acquiredInode)await rm(path,{recursive:true})}catch{}
  locks.delete(root);throw error
 }
}
async function save(path:string,state:State){const temporary=path+'.'+randomUUID()+'.tmp';try{await writeFile(temporary,JSON.stringify(state),{mode:0o600,flag:'wx'});await rename(temporary,path)}finally{await rm(temporary,{force:true})}}
async function readState(path:string,identity:string):Promise<State>{
 try{const info=await regular(path);if(info.size>2*1024*1024)throw Error('Oversized update state.');const state=JSON.parse(await readFile(path,'utf8')) as State
  if(state.identity!==identity||!(state.etag===null||strongEtag(state.etag))||!state.parts||Array.isArray(state.parts)||Object.entries(state.parts).some(([key,value])=>!/^\d+-\d+$/.test(key)||!Number.isSafeInteger(value.bytes)||value.bytes<0||!/^[a-f0-9]{64}$/.test(value.sha256)))throw Error('Invalid update state.')
  return state
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;return{identity,etag:null,parts:{}}}
}
async function prefix(file:FileHandle,length:number){const hash=createHash('sha256'),buffer=Buffer.alloc(BUFFER);for(let offset=0;offset<length;){const{bytesRead}=await file.read(buffer,0,Math.min(buffer.length,length-offset),offset);if(!bytesRead)throw Error('Incomplete update cache prefix.');hash.update(buffer.subarray(0,bytesRead));offset+=bytesRead}return hash}
function safeUrl(url:URL){if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Invalid update URL.')}
async function response(input:TransferInput,url:URL,headers:TransferInput['headers'],redirects=0):Promise<{body:IncomingMessage;cleanup():void}>{
 cancelled(input);safeUrl(url);if(redirects>8)throw Error('Too many update redirects.')
 return new Promise((resolve,reject)=>{
  let ended=false,request:Request|undefined,activeBody:IncomingMessage|undefined
  const abort=()=>{request?.abort()}
  const timeout=setTimeout(()=>{fail(Object.assign(Error('Update transfer timed out.'),{code:'ETIMEDOUT'}));abort()},input.timeoutMs??30000)
  const cleanup=()=>{clearTimeout(timeout);input.cancellationToken.removeListener('cancel',onCancel)}
  const fail=(error:Error)=>{if(ended)return;ended=true;cleanup();reject(error)}
  const onCancel=()=>{fail(new CancellationError());abort()}
  const redirect=(target:string)=>{
   if(ended)return;ended=true;cleanup();abort()
   let next:URL;try{next=new URL(target,url);safeUrl(next);if(url.protocol==='https:'&&next.protocol!=='https:')throw Error('Insecure update redirect.')}catch(error){reject(error);return}
   const nextHeaders={...headers};if(next.origin!==url.origin)for(const key of Object.keys(nextHeaders))if(/^(authorization|proxy-authorization|cookie|host)$/i.test(key))delete nextHeaders[key]
   response(input,next,nextHeaders,redirects+1).then(resolve,reject)
  }
  input.cancellationToken.on('cancel',onCancel)
  try{request=input.executor.createRequest({protocol:url.protocol,hostname:url.hostname,port:url.port,path:url.pathname+url.search,method:'GET',headers,redirect:'manual'} as RequestOptions,body=>{
   if(ended){body.destroy();return}
   if(body.statusCode&&body.statusCode>=300&&body.statusCode<400&&textHeader(body,'location')){body.destroy();redirect(textHeader(body,'location')!);return}
   // Keep cancellation/timeout alive through consumption, not merely headers.
   ended=true;activeBody=body
   const streamCancel=()=>{body.destroy(new CancellationError());abort()};input.cancellationToken.removeListener('cancel',onCancel);input.cancellationToken.on('cancel',streamCancel)
   const streamTimer=setTimeout(()=>{body.destroy(Object.assign(Error('Update transfer timed out.'),{code:'ETIMEDOUT'}));abort()},input.timeoutMs??30000)
   const activity=()=>streamTimer.refresh();body.on('readable',activity)
   clearTimeout(timeout)
   resolve({body,cleanup:()=>{clearTimeout(streamTimer);body.removeListener('readable',activity);input.cancellationToken.removeListener('cancel',streamCancel)}})
  })
  request.on('error',(error:Error)=>activeBody?activeBody.destroy(error):fail(error));request.on('redirect',(_status:unknown,_method:unknown,target:string)=>redirect(target));request.end()}catch(error){fail(error as Error);abort()}
 })
}
const retryable=(error:unknown)=>{const value=error as NodeJS.ErrnoException&{statusCode?:number};return value.statusCode===429||!!value.statusCode&&value.statusCode>=500||/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_|ERR_STREAM_PREMATURE_CLOSE/.test(value.code??'')||/aborted|socket|network|premature|timed out/i.test(value.message??'')}
async function writeAll(file:FileHandle,data:Buffer,position:number){for(let offset=0;offset<data.length;){const{bytesWritten}=await file.write(data,offset,data.length-offset,position+offset);if(!bytesWritten)throw Error('Update cache write made no progress.');offset+=bytesWritten}}
async function delay(input:TransferInput,ms:number){cancelled(input);await new Promise<void>((resolve,reject)=>{const stop=()=>{clearTimeout(timer);input.cancellationToken.removeListener('cancel',stop);reject(new CancellationError())},timer=setTimeout(()=>{input.cancellationToken.removeListener('cancel',stop);resolve()},ms);input.cancellationToken.once('cancel',stop)})}

/** Resumable bytes stay outside electron-updater's disposable pending directory. */
export async function downloadResumableUpdate(input:TransferInput):Promise<void>{
 cancelled(input);safeUrl(input.url)
 if(!Number.isSafeInteger(input.size)||input.size<=0||input.size>MAX_SIZE||!input.version||input.version.length>96||!/^[A-Za-z0-9+/]{86}==$/.test(input.sha512)||Buffer.from(input.sha512,'base64').length!==64)throw Error('Invalid update identity/size/SHA512.')
 const operations=input.operations??[{kind:1,start:0,end:input.size}],differential=!!input.operations
 if(!operations.length||operations.some(op=>![0,1].includes(op.kind)||!Number.isSafeInteger(op.start)||!Number.isSafeInteger(op.end)||op.start<0||op.end<=op.start||op.kind===1&&op.end>input.size)||operations.reduce((sum,op)=>sum+op.end-op.start,0)!==input.size)throw Error('Invalid update range plan.')
 const root=join(input.cacheDir,'ework-resume-v1');await directory(root);const release=await acquire(root)
 const identity=transferIdentity(input),folder=join(root,identity),statePath=join(folder,'state.json');let output:FileHandle|undefined,old:FileHandle|undefined,outputIdentity:number|undefined
 try{
  await directory(folder);let state=await readState(statePath,identity)
  if(operations.some(op=>op.kind===0)){if(!input.oldFile)throw Error('Missing differential base.');await regular(input.oldFile);old=await open(input.oldFile,constants.O_RDONLY|constants.O_NOFOLLOW);const size=(await old.stat()).size;if(operations.some(op=>op.kind===0&&op.end>size))throw Error('Differential base range exceeds size.')}
  const downloads=operations.filter(op=>op.kind===1),total=downloads.reduce((sum,op)=>sum+op.end-op.start,0),reused=input.size-total,startTime=Date.now();let resumed=0,transferred=0,wire=0
  const emit=(delta=0)=>input.onProgress?.({downloadKind:differential?'differential':'full',archiveBytes:input.size,reusedBytes:reused,resumedBytes:resumed,total,transferred,percent:total?transferred/total*100:100,bytesPerSecond:wire/Math.max(.001,(Date.now()-startTime)/1000),delta})
  let representationRestarts=0
  for(;;){
   try{
    transferred=0;resumed=0
    for(const op of downloads){const key=op.start+'-'+op.end,path=join(folder,key+'.part');let length=state.parts[key]?.bytes??0
     try{const info=await regular(path);if(length>info.size||length>op.end-op.start)length=0;const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{if((await prefix(file,length)).copy().digest('hex')!==state.parts[key]?.sha256)length=0}finally{await file.close()}}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;length=0}
     if(!state.etag&&length<op.end-op.start)length=0
     state.parts[key]={bytes:length,sha256:length?state.parts[key]!.sha256:createHash('sha256').digest('hex')};resumed+=length;transferred+=length
    }
    emit();await save(statePath,state)
    for(const op of downloads){
     cancelled(input);const key=op.start+'-'+op.end,path=join(folder,key+'.part'),file=await open(path,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600)
     try{
      const size=op.end-op.start;let bytes=state.parts[key]!.bytes;await file.truncate(bytes);let digester=await prefix(file,bytes),checkpoint=bytes,attempt=0,rangeReset=false
      const persist=async()=>{await file.sync();state.parts[key]={bytes,sha256:digester.copy().digest('hex')};await save(statePath,state);checkpoint=bytes}
      while(bytes<size){
       cancelled(input);let incoming:Awaited<ReturnType<typeof response>>|undefined
       try{
        const headers={...input.headers,Range:`bytes=${op.start+bytes}-${op.end-1}`,'Accept-Encoding':'identity',...(state.etag?{'If-Range':state.etag}:{})}
        incoming=await response(input,input.url,headers);const body=incoming.body,status=body.statusCode??0,etag=strongEtag(textHeader(body,'etag'))
        if(status>=400)throw Object.assign(Error('Update HTTP '+status),{statusCode:status})
        if(state.etag&&etag!==state.etag)throw new RepresentationChanged('Update representation changed; restarting verified ranges.')
        const complete200=status===200&&!differential&&op.start===0&&bytes===0&&op.end===input.size
        if(status!==206&&!complete200)throw new RangeUnsupportedError('更新服务器未接受断点范围。')
        if(status===206&&textHeader(body,'content-range')!==`bytes ${op.start+bytes}-${op.end-1}/${input.size}`)throw Error('Invalid update Content-Range.')
        const contentLength=textHeader(body,'content-length');if(contentLength!==undefined&&Number(contentLength)!==size-bytes)throw Error('Invalid update Content-Length.')
        if(!state.etag&&etag){state.etag=etag;await save(statePath,state)}
        for await(const chunk of body){cancelled(input);const data=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);if(bytes+data.length>size)throw Error('Update response exceeds expected size.');await writeAll(file,data,bytes);digester.update(data);bytes+=data.length;transferred+=data.length;wire+=data.length;emit(data.length);if(bytes-checkpoint>=1024*1024)await persist()}
        if(bytes!==size)throw Object.assign(Error('Update response ended before expected size.'),{code:'ECONNRESET'})
        await persist()
       }catch(error){
        incoming?.body.destroy();await persist()
        if(input.cancellationToken.cancelled)throw new CancellationError()
        if(error instanceof RangeUnsupportedError&&!differential&&bytes>0&&!rangeReset){rangeReset=true;transferred-=bytes;resumed=0;bytes=0;digester=createHash('sha256');await file.truncate(0);await persist();emit();continue}
        if(error instanceof RepresentationChanged||error instanceof RangeUnsupportedError)throw error
        const delays=input.retryDelaysMs??[250,750,2000]
        if(!retryable(error)||attempt>=delays.length)throw error
        if(!state.etag){transferred-=bytes;bytes=0;digester=createHash('sha256');await file.truncate(0);await persist()}
        await delay(input,delays[attempt++]!)
       }finally{incoming?.cleanup()}
      }
     }finally{await file.close()}
    }
    break
   }catch(error){
    if(!(error instanceof RepresentationChanged)||representationRestarts++>=1)throw error
    for(const key of Object.keys(state.parts))await rm(join(folder,key+'.part'),{force:true})
    state={identity,etag:null,parts:{}};await save(statePath,state)
   }
  }
  cancelled(input);output=await open(input.destination,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);outputIdentity=(await output.stat()).ino
  const digest=createHash('sha512'),buffer=Buffer.alloc(BUFFER);let position=0
  const oldIdentity=old?await old.stat():undefined
  for(const op of operations){
   cancelled(input);const source=op.kind===0?old!:await open(join(folder,op.start+'-'+op.end+'.part'),constants.O_RDONLY|constants.O_NOFOLLOW)
   try{for(let cursor=op.kind===0?op.start:0,left=op.end-op.start;left>0;){cancelled(input);const{bytesRead}=await source.read(buffer,0,Math.min(buffer.length,left),cursor);if(!bytesRead)throw Error('Truncated update range.');await writeAll(output,buffer.subarray(0,bytesRead),position);digest.update(buffer.subarray(0,bytesRead));left-=bytesRead;cursor+=bytesRead;position+=bytesRead}}finally{if(op.kind===1)await source.close()}
  }
  if(old&&oldIdentity){const after=await old.stat();if(after.ino!==oldIdentity.ino||after.size!==oldIdentity.size||after.mtimeMs!==oldIdentity.mtimeMs)throw Error('Differential base changed during reconstruction.')}
  if(position!==input.size||digest.digest('base64')!==input.sha512){for(const key of Object.keys(state.parts))await rm(join(folder,key+'.part'),{force:true});await save(statePath,{identity,etag:null,parts:{}});throw Error('Update SHA512 checksum mismatch.')}
  await output.sync();cancelled(input);emit()
 }catch(error){
  if(output){await output.close();output=undefined;try{const info=await lstat(input.destination);if(info.ino===outputIdentity&&!info.isSymbolicLink())await rm(input.destination)}catch{}}
  throw error
 }finally{try{await Promise.allSettled([output?.close(),old?.close()])}finally{await release()}}
}

/** Cleanup is serialized with writers and never reaches the native update.zip cache. */
export async function clearVerifiedTransfer(input:Pick<TransferInput,'cacheDir'|'url'|'version'|'size'|'sha512'>):Promise<void>{
 const root=join(input.cacheDir,'ework-resume-v1');const release=await acquire(root)
 try{await rm(join(root,transferIdentity(input)),{recursive:true,force:true})}finally{await release()}
}
