import{createHash}from'node:crypto'
import{createServer,type Server}from'node:http'
import{mkdtemp,readFile,writeFile,rm,mkdir,readdir}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{createRequire}from'node:module'
import{afterEach,expect,it,vi}from'vitest'
const fault=vi.hoisted(()=>({lockWrite:false}))
vi.mock('node:fs/promises',async original=>{const fs=await original<typeof import('node:fs/promises')>();return{...fs,writeFile:(...args:Parameters<typeof fs.writeFile>)=>{if(fault.lockWrite&&String(args[0]).endsWith('/.lock/owner.json')){fault.lockWrite=false;return Promise.reject(Object.assign(Error('Injected lock record failure'),{code:'ENOSPC'}))}return fs.writeFile(...args)}}})
import{downloadResumableUpdate,RangeUnsupportedError,type TransferInput}from'../src/main/update/resumable-transfer'
const require=createRequire(import.meta.url),{NodeHttpExecutor}=require('builder-util/out/nodeHttpExecutor'),{CancellationToken}=require('builder-util-runtime')
const hash=(data:Buffer)=>createHash('sha512').update(data).digest('base64'),roots:string[]=[],servers:Server[]=[]
afterEach(async()=>{for(const server of servers.splice(0)){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'ework-resume-'));roots.push(root)
 const target=Buffer.alloc(128*1024);for(let index=0;index<target.length;index++)target[index]=index%251
 const requests:{range:string;validator?:string}[]=[],control={failures:0,ignore:false,etag:'"stable"',corrupt:false,delay:0,errorStatus:0,trickle:false,redirects:false}
 const server=createServer((request,response)=>{
  const range=String(request.headers.range??''),match=/^bytes=(\d+)-(\d+)$/.exec(range);requests.push({range,validator:request.headers['if-range'] as string|undefined})
  const start=Number(match?.[1]??0),end=Number(match?.[2]??target.length-1),body=Buffer.from(target.subarray(start,end+1));if(control.corrupt)body[0]=body[0]!^1
  if(control.redirects){response.writeHead(302,{Location:'/update.zip'});response.end();return}
  if(control.errorStatus){const status=control.errorStatus;control.errorStatus=0;response.writeHead(status);response.end('temporary');return}
  if(control.ignore){response.writeHead(200,{'Content-Length':target.length,ETag:control.etag});response.end(target);return}
  response.writeHead(206,{'Content-Length':body.length,'Content-Range':`bytes ${start}-${end}/${target.length}`,ETag:control.etag})
  if(control.failures>0){control.failures--;response.write(body.subarray(0,32*1024));setTimeout(()=>response.destroy(),20)}else if(control.trickle){let cursor=0;const timer=setInterval(()=>{response.write(body.subarray(cursor,cursor+4096));cursor+=4096;if(cursor>=body.length){clearInterval(timer);response.end()}},10);response.on('close',()=>clearInterval(timer))}else if(control.delay){setTimeout(()=>response.end(body),control.delay)}else response.end(body)
 });servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as {port:number}).port
 const progress:Record<string,number|string>[]=[]
 const input:TransferInput={url:new URL(`http://127.0.0.1:${port}/update.zip`),version:'1.4.1',size:target.length,sha512:hash(target),cacheDir:join(root,'cache'),destination:join(root,'result.zip'),executor:new NodeHttpExecutor(),cancellationToken:new CancellationToken(),retryDelaysMs:[1,1],onProgress:value=>progress.push({...value})}
 return{root,target,requests,control,input,progress}
}
it('resumes the exact interrupted range with If-Range and verifies the final archive',async()=>{
 const f=await fixture();f.control.failures=1;await downloadResumableUpdate(f.input)
 expect(await readFile(f.input.destination)).toEqual(f.target);expect(f.requests[0]?.range).toBe('bytes=0-131071');expect(f.requests[1]?.range).toBe('bytes=32768-131071');expect(f.requests[1]?.validator).toBe('"stable"')
 expect(f.progress.at(-1)).toMatchObject({total:131072,transferred:131072,archiveBytes:131072,downloadKind:'full'})
})
it('keeps a validated partial outside pending across a failed call and resumes after the SDK clears pending',async()=>{
 const f=await fixture();f.control.failures=3;await expect(downloadResumableUpdate({...f.input,retryDelaysMs:[]})).rejects.toThrow()
 await rm(join(f.input.cacheDir,'pending'),{recursive:true,force:true});f.control.failures=0;const next=f.requests.length
 await downloadResumableUpdate({...f.input,destination:join(f.root,'retry.zip')});expect(f.requests[next]).toMatchObject({range:'bytes=32768-131071',validator:'"stable"'});expect(await readFile(join(f.root,'retry.zip'))).toEqual(f.target)
 expect(f.progress.at(-1)?.resumedBytes).toBe(32768)
})
it('rejects ignored differential Range instead of concatenating a full response',async()=>{
 const f=await fixture();f.control.ignore=true;await writeFile(join(f.root,'old.zip'),f.target)
 await expect(downloadResumableUpdate({...f.input,operations:[{kind:0,start:0,end:65536},{kind:1,start:65536,end:131072}],oldFile:join(f.root,'old.zip')})).rejects.toBeInstanceOf(RangeUnsupportedError)
 await expect(readFile(f.input.destination)).rejects.toThrow()
})
it('keeps a trusted resume prefix on transient HTTP errors without ETag headers',async()=>{
 const f=await fixture();f.control.failures=1;await expect(downloadResumableUpdate({...f.input,retryDelaysMs:[]})).rejects.toThrow();f.control.errorStatus=503
 await downloadResumableUpdate(f.input);expect(f.requests.map(row=>row.range)).toEqual(['bytes=0-131071','bytes=32768-131071','bytes=32768-131071']);expect(await readFile(f.input.destination)).toEqual(f.target)
})
it('uses an idle timeout so a slowly progressing response is not interrupted at a fixed wall-clock deadline',async()=>{
 const f=await fixture();f.control.trickle=true;await downloadResumableUpdate({...f.input,timeoutMs:50});expect(f.requests).toHaveLength(1);expect(await readFile(f.input.destination)).toEqual(f.target)
})
it('discards a partial if ETag changes and never mixes old and new representations',async()=>{
 const f=await fixture();f.control.failures=1;await expect(downloadResumableUpdate({...f.input,retryDelaysMs:[]})).rejects.toThrow();f.control.etag='"replacement"'
 await downloadResumableUpdate(f.input);expect(await readFile(f.input.destination)).toEqual(f.target);expect(f.requests.map(row=>row.range)).toEqual(['bytes=0-131071','bytes=32768-131071','bytes=0-131071'])
})
it('restarts a full stream safely if a server ignores Range on a resumed request',async()=>{
 const f=await fixture();f.control.failures=1;await expect(downloadResumableUpdate({...f.input,retryDelaysMs:[]})).rejects.toThrow();f.control.ignore=true
 await downloadResumableUpdate(f.input);expect(await readFile(f.input.destination)).toEqual(f.target);expect(f.requests.map(row=>row.range)).toEqual(['bytes=0-131071','bytes=32768-131071','bytes=0-131071'])
})
it('detects a corrupted on-disk prefix before issuing a resumed HTTP request',async()=>{
 const f=await fixture();f.control.failures=1;await expect(downloadResumableUpdate({...f.input,retryDelaysMs:[]})).rejects.toThrow()
 const root=join(f.input.cacheDir,'ework-resume-v1'),folder=(await readdir(root)).find(name=>/^[a-f0-9]{64}$/.test(name))!;await writeFile(join(root,folder,'0-131072.part'),Buffer.alloc(32768,88))
 await downloadResumableUpdate(f.input);expect(f.requests.at(-1)?.range).toBe('bytes=0-131071');expect(await readFile(f.input.destination)).toEqual(f.target)
})
it('isolates resume identities by version and expected SHA512',async()=>{
 const f=await fixture();f.control.failures=1;await expect(downloadResumableUpdate({...f.input,retryDelaysMs:[]})).rejects.toThrow()
 await downloadResumableUpdate({...f.input,version:'1.4.2'});expect(f.requests.at(-1)?.range).toBe('bytes=0-131071');expect(await readFile(f.input.destination)).toEqual(f.target)
})
it('uses only changed bytes in the progress denominator and verifies reconstructed COPY ranges',async()=>{
 const f=await fixture(),old=join(f.root,'old.zip');await writeFile(old,f.target)
 await downloadResumableUpdate({...f.input,oldFile:old,operations:[{kind:0,start:0,end:65536},{kind:1,start:65536,end:131072}]})
 expect(f.requests.map(row=>row.range)).toEqual(['bytes=65536-131071']);expect(await readFile(f.input.destination)).toEqual(f.target);expect(f.progress.at(-1)).toMatchObject({downloadKind:'differential',total:65536,archiveBytes:131072,reusedBytes:65536,transferred:65536})
})
it('cancels the active socket, retains trusted partial data, and releases the cache lock',async()=>{
 const f=await fixture();f.control.failures=1;const token=new CancellationToken();await expect(downloadResumableUpdate({...f.input,cancellationToken:token,onProgress:value=>{if(value.transferred>0)token.cancel()}})).rejects.toThrow(/cancel/i)
 f.control.failures=0;await downloadResumableUpdate({...f.input,destination:join(f.root,'after-cancel.zip')});expect(await readFile(join(f.root,'after-cancel.zip'))).toEqual(f.target)
})
it('never accepts corrupt bytes and does not leak an unverified destination',async()=>{
 const f=await fixture();f.control.corrupt=true;await expect(downloadResumableUpdate(f.input)).rejects.toThrow(/sha512|checksum/i);await expect(readFile(f.input.destination)).rejects.toThrow()
})
it('serializes cache ownership and does not allow two writers to corrupt the same resume data',async()=>{
 const f=await fixture();f.control.delay=80;const first=downloadResumableUpdate(f.input);await new Promise(resolve=>setTimeout(resolve,20));await expect(downloadResumableUpdate({...f.input,destination:join(f.root,'concurrent.zip')})).rejects.toThrow(/进行|busy|lock/i);await first;expect(await readFile(f.input.destination)).toEqual(f.target)
})
it('cleans up cancellation listeners when creating the transport request itself throws',async()=>{
 const f=await fixture(),token=new CancellationToken();await expect(downloadResumableUpdate({...f.input,cancellationToken:token,executor:{createRequest(){throw Error('transport unavailable')}}})).rejects.toThrow('transport unavailable');expect(token.listenerCount('cancel')).toBe(0)
})
it('rejects redirect loops through the transfer promise and releases its writer lease',async()=>{
 const f=await fixture(),token=new CancellationToken();f.control.redirects=true;const timer=setTimeout(()=>token.cancel(),1000)
 try{await expect(downloadResumableUpdate({...f.input,cancellationToken:token})).rejects.toThrow(/redirect/i)}finally{clearTimeout(timer)}
 expect(token.listenerCount('cancel')).toBe(0);f.control.redirects=false;await downloadResumableUpdate(f.input);expect(await readFile(f.input.destination)).toEqual(f.target)
})

it('releases only its own newly acquired lock if writing the owner record fails, allowing an actual retry',async()=>{
 const f=await fixture();fault.lockWrite=true;await expect(downloadResumableUpdate(f.input)).rejects.toThrow('Injected lock record failure');expect(f.requests).toEqual([])
 await downloadResumableUpdate(f.input);expect(await readFile(f.input.destination)).toEqual(f.target)
})
it('preserves an unconfirmed pre-existing lock instead of removing another writer during recovery',async()=>{
 const f=await fixture(),lock=join(f.input.cacheDir,'ework-resume-v1','.lock');await mkdir(lock,{recursive:true});await writeFile(join(lock,'owner.json'),'unconfirmed')
 await expect(downloadResumableUpdate(f.input)).rejects.toThrow(/锁未确认/);expect(await readFile(join(lock,'owner.json'),'utf8')).toBe('unconfirmed');expect(f.requests).toEqual([])
})
