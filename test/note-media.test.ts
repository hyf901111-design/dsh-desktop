import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NoteFiles,noteFileOwnerPrefix} from '../src/main/notes/files'
import {ResearchFilePreviewRegistry} from '../src/main/state/research-file-preview'

const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex')
const mp4=Buffer.concat([Buffer.from('000000186674797069736f6d0000000069736f6d6d703431','hex'),Buffer.from('media payload for seeking')])
const mp3=Buffer.from('ID3\x04\x00\x00\x00\x00\x00\x00audio payload')
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'ework-note-media-'));roots.push(root);await mkdir(join(root,'workspace'))
 const state={owner:'alice',allowed:true,now:1000},records:any[]=[]
 const registry=new ResearchFilePreviewRegistry({now:()=>state.now,capabilityTtlMs:60000,canReadAuthorization:record=>record.sessionId.startsWith(noteFileOwnerPrefix(state.owner)),storage:{load:()=>records,save:next=>{records.splice(0,records.length,...next);return true}}})
 const files=new NoteFiles({root:join(root,'owned'),registry,workspaceRoot:async()=>join(root,'workspace'),owner:()=>state.owner,canRead:()=>state.allowed,reveal:vi.fn()})
 const admit=async(name:string,bytes:Buffer)=>{const path=join(root,name);await writeFile(path,bytes);return files.admit('alice','note',{nodeId:'note-file-'+name.replace(/\W/g,'-'),path})}
 return {state,records,registry,files,admit}
}
it('issues an ephemeral image lease without persisting its URL or token',async()=>{
 const f=await fixture(),node=await f.admit('image.png',png),identity={nodeId:node.id,authorizationId:node.authorizationId}
 const lease=await f.files.media('alice','note',identity)
 expect(node).toMatchObject({mediaKind:'image',contentType:'image/png'})
 expect(lease).toMatchObject({kind:'image',contentType:'image/png',name:'image.png',expiresAt:61000,releaseId:expect.any(String),url:expect.stringMatching(/^sherlock-preview:\/\//)})
 expect(lease.url).not.toContain('/owned/');expect(JSON.stringify(node)).not.toContain(lease.releaseId);expect(JSON.stringify(f.records)).not.toContain(lease.releaseId)
 expect(Buffer.from(await(await f.registry.handle(new Request(lease.url))).arrayBuffer())).toEqual(png)
 const origin='http://127.0.0.1:3000',cors=await f.registry.handle(new Request(lease.url,{headers:{Origin:origin}}),origin)
 expect(cors.headers.get('access-control-allow-origin')).toBe(origin);expect(cors.headers.get('access-control-expose-headers')).toContain('Content-Range')
})
for(const [name,bytes,kind,type] of [['clip.mp4',mp4,'video','video/mp4'],['sound.mp3',mp3,'audio','audio/mpeg'],['sound.m4a',mp4,'audio','audio/mp4'],['clip.mov',mp4,'video','video/quicktime']] as const)it('serves authorized '+name+' even though it is not a research root preview',async()=>{
 const f=await fixture(),node=await f.admit(name,bytes),identity={nodeId:node.id,authorizationId:node.authorizationId}
 expect(node.previewEligible).toBe(false)
 const lease=await f.files.media('alice','note',identity)
 expect(lease).toMatchObject({kind,contentType:type});expect(node.mediaKind).toBe(kind)
 const response=await f.registry.handle(new Request(lease.url,{headers:{Range:'bytes=4-11'}}))
 expect(response.status).toBe(206);expect(response.headers.get('content-range')).toBe(`bytes 4-11/${bytes.length}`);expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes.subarray(4,12))
 expect((await f.registry.handle(new Request(lease.url+'other.mp4'))).status).toBe(403)
 expect((await f.registry.handle(new Request(lease.url,{headers:{Origin:'https://untrusted.invalid'}}),'http://127.0.0.1:3000')).status).toBe(403)
})
it('renews and releases the exact media lease while retaining durable attachment authorization',async()=>{
 const f=await fixture(),node=await f.admit('clip.mp4',mp4),identity={nodeId:node.id,authorizationId:node.authorizationId},first=await f.files.media('alice','note',identity)
 f.state.now=50000
 const renewed=await f.files.media('alice','note',{...identity,action:'renew',releaseId:first.releaseId})
 expect(renewed.url).not.toBe(first.url);expect(renewed.expiresAt).toBe(110000);expect((await f.registry.handle(new Request(first.url))).status).toBe(403)
 expect(await f.files.media('alice','note',{...identity,action:'release',releaseId:renewed.releaseId})).toEqual({ok:true})
 expect((await f.registry.handle(new Request(renewed.url))).status).toBe(403)
 const final=await f.files.media('alice','note',identity);f.state.now=final.expiresAt+1
 expect((await f.registry.handle(new Request(final.url))).status).toBe(403)
 expect(await f.files.bind('alice','note',identity)).toMatchObject({previewSessionId:node.previewSessionId})
})
it('denies other notes, grants, accounts and revoked read access, including already issued URLs',async()=>{
 const f=await fixture(),node=await f.admit('clip.mp4',mp4),identity={nodeId:node.id,authorizationId:node.authorizationId}
 for(const [owner,note,input] of [['bob','note',identity],['alice','other',identity],['alice','note',{...identity,authorizationId:'forged'}]] as const)await expect(f.files.media(owner,note,input)).rejects.toThrow()
 const lease=await f.files.media('alice','note',identity);f.state.allowed=false
 expect((await f.registry.handle(new Request(lease.url))).status).toBe(403)
 f.state.allowed=true;const next=await f.files.media('alice','note',identity);f.state.owner='bob'
 expect((await f.registry.handle(new Request(next.url))).status).toBe(403)
})
it('refuses unsupported content, spoofed media signatures and bytes changed after authorization',async()=>{
 const f=await fixture()
 for(const [name,bytes] of [['spoof.mp4',Buffer.from('<script>not video</script>')],['archive.zip',Buffer.from([0,1,255])],['document.pdf',Buffer.from('%PDF-1.4')]] as const){
  const node=await f.admit(name,bytes)
  expect(node.mediaKind).toBeUndefined();await expect(f.files.media('alice','note',{nodeId:node.id,authorizationId:node.authorizationId})).rejects.toThrow('媒体')
 }
 const node=await f.admit('clip.mp4',mp4),lease=await f.files.media('alice','note',{nodeId:node.id,authorizationId:node.authorizationId})
 await writeFile(node.path!,Buffer.from('<script>changed</script>'))
 expect((await f.registry.handle(new Request(lease.url))).status).toBe(415)
})
it('revokes an active media URL when its note attachment is removed',async()=>{
 const f=await fixture(),node=await f.admit('clip.mp4',mp4),lease=await f.files.media('alice','note',{nodeId:node.id,authorizationId:node.authorizationId})
 f.files.revoke('alice','note',node.id)
 expect((await f.registry.handle(new Request(lease.url))).status).toBe(403)
})
it('releases a newly issued lease instead of publishing it after an asynchronous account change',async()=>{
 const f=await fixture(),node=await f.admit('clip.mp4',mp4),restore=f.registry.restoreMedia.bind(f.registry);let staleUrl=''
 vi.spyOn(f.registry,'restoreMedia').mockImplementation(async(value,current)=>{const lease=await restore(value,current);staleUrl=lease!.url;f.state.owner='bob';return lease})
 await expect(f.files.media('alice','note',{nodeId:node.id,authorizationId:node.authorizationId})).rejects.toThrow('媒体')
 f.state.owner='alice'
 expect((await f.registry.handle(new Request(staleUrl))).status).toBe(403)
})
