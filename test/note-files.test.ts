import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile,rm,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {NoteFiles,noteFileOwnerPrefix} from '../src/main/notes/files'
import {ResearchFilePreviewRegistry} from '../src/main/state/research-file-preview'
import {noteFileCandidates,NOTE_FILE_DRAG_TYPE} from '../src/shared/note-files'
const roots:string[]=[];afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
async function fixture(){const root=await mkdtemp(join(tmpdir(),'ework-note-files-'));roots.push(root);const workspace=join(root,'workspace');await mkdir(workspace);const state={owner:'alice',allowed:true},records:any[]=[]
 const registry=new ResearchFilePreviewRegistry({canReadAuthorization:record=>record.sessionId.startsWith(noteFileOwnerPrefix(state.owner)),storage:{load:()=>records,save:next=>{records.splice(0,records.length,...next);return true}}}),reveal=vi.fn()
 return {root,workspace,state,registry,records,reveal,files:new NoteFiles({root:join(root,'owned'),registry,workspaceRoot:async()=>workspace,owner:()=>state.owner,canRead:()=>state.allowed,reveal})}
}
it('copies an imported file, persists only authorization metadata and restores it after the source is removed',async()=>{
 const f=await fixture(),source=join(f.root,'原始笔记.md');await writeFile(source,'# 文件内容\n\n保持完整。')
 const node=await f.files.admit('alice','s',{nodeId:'note-file-one',path:source});await rm(source)
 expect(await readFile(node.path!,'utf8')).toContain('保持完整');expect(node).not.toHaveProperty('capabilityToken');expect(node).not.toHaveProperty('url')
 const restored=await f.registry.restore({sessionId:node.previewSessionId,nodeId:node.id,authorizationId:node.authorizationId});expect(restored).not.toBeNull()
 const response=await f.registry.handle(new Request(restored!.url));expect(await response.text()).toContain('保持完整')
 await f.files.reveal('alice','s',{nodeId:node.id,authorizationId:node.authorizationId});expect(f.reveal).toHaveBeenCalledWith(node.path)
 await expect(f.files.reveal('alice','other',{nodeId:node.id,authorizationId:node.authorizationId})).rejects.toThrow('不可用')
})
it('keeps unsupported formats as authorized file cards without executing them',async()=>{
 const f=await fixture(),source=join(f.root,'archive.zip');await writeFile(source,Buffer.from([0,255,128,2]))
 const node=await f.files.admit('alice','s',{nodeId:'note-file-generic',path:source})
 expect(node.previewEligible).toBe(false);expect(node.authorizationId).toBeTruthy();expect(f.records[0].exportOnly).toBe(true)
 await f.files.reveal('alice','s',{nodeId:node.id,authorizationId:node.authorizationId});expect(f.reveal).toHaveBeenCalledOnce()
})
it('admits current-session sidebar files and rejects traversal and symlinks that leave the workspace',async()=>{
 const f=await fixture();await writeFile(join(f.workspace,'文件.txt'),'正文');await writeFile(join(f.root,'outside.txt'),'outside');await symlink(join(f.root,'outside.txt'),join(f.workspace,'escaped.txt'))
 expect((await f.files.admit('alice','s',{nodeId:'note-file-sidebar',relativePath:'文件.txt'})).name).toBe('文件.txt')
 for(const relativePath of ['../outside.txt','escaped.txt',join(f.root,'outside.txt')])await expect(f.files.admit('alice','s',{nodeId:'note-file-denied',relativePath})).rejects.toThrow()
})
for(const kind of ['removed','account','access'])it(`does not publish a grant after an in-flight import is ${kind}`,async()=>{
 const f=await fixture(),source=join(f.root,'文件.txt');await writeFile(source,'正文');let proceed!:()=>void
 const original=f.registry.admitFinder.bind(f.registry),gate=new Promise<void>(resolve=>{proceed=resolve}),entered=vi.fn()
 vi.spyOn(f.registry,'admitFinder').mockImplementation(async(value,fallback)=>{entered();await gate;return original(value,fallback)})
 const operation=f.files.admit('alice','s',{nodeId:'note-file-pending',path:source});await vi.waitFor(()=>expect(entered).toHaveBeenCalledOnce())
 if(kind==='removed')f.files.revoke('alice','s','note-file-pending');else if(kind==='account')f.state.owner='bob';else f.state.allowed=false
 proceed();await expect(operation).rejects.toThrow('取消');expect(f.records).toEqual([]);expect(f.reveal).not.toHaveBeenCalled()
})
it('bounds external FileLists and validates internal drags without using arbitrary paths',()=>{
 let reads=0;const files=new Proxy({length:1000},{get:(target,key)=>{if(key==='length')return target.length;reads++;return {name:'文件.txt'}}}) as unknown as FileList
 expect(noteFileCandidates({files,getData:()=>''},'s',()=>'/a')).toHaveLength(64);expect(reads).toBe(64)
 const transfer=(value:unknown)=>({files:[] as unknown as FileList,getData:(type:string)=>type===NOTE_FILE_DRAG_TYPE?JSON.stringify(value):''})
 expect(noteFileCandidates(transfer({sessionId:'s',relativePath:'a.md',name:'A'}),'s',()=>'/ignored')).toEqual([{name:'A',relativePath:'a.md'}])
 expect(noteFileCandidates(transfer({sessionId:'other',relativePath:'a.md',name:'A',path:'/unsafe'}),'s',()=>'/ignored')).toEqual([])
})
it('binds persisted attachments only to their owning note and denies old capabilities after an account change',async()=>{
 const f=await fixture(),source=join(f.root,'file.txt');await writeFile(source,'private content')
 const node=await f.files.admit('alice','s',{nodeId:'note-file-private',path:source}),input={nodeId:node.id,authorizationId:node.authorizationId}
 expect(await f.files.bind('alice','s',input)).toEqual({previewSessionId:node.previewSessionId})
 await expect(f.files.bind('alice','other',input)).rejects.toThrow('不属于')
 const descriptor=await f.registry.restore({sessionId:node.previewSessionId,nodeId:node.id,authorizationId:node.authorizationId});expect(descriptor).not.toBeNull()
 f.state.owner='bob'
 await expect(f.files.bind('bob','s',input)).rejects.toThrow('不属于')
 expect(await f.registry.restore({sessionId:node.previewSessionId,nodeId:node.id,authorizationId:node.authorizationId})).toBeNull()
 expect(await f.registry.resolveExportSource({sessionId:node.previewSessionId,nodeId:node.id,authorizationId:node.authorizationId})).toBeNull()
 expect((await f.registry.handle(new Request(descriptor!.url))).status).toBe(403)
})
it('resolves a frozen AI reference only through the owning note authorization, ignoring supplied paths',async()=>{
 const f=await fixture(),source=join(f.root,'证据.txt');await writeFile(source,'只在原文件内的完整证据')
 const node=await f.files.admit('alice','s',{nodeId:'note-file-reference',path:source});await rm(source)
 const identity={nodeId:node.id,authorizationId:node.authorizationId,path:'/private/untrusted-path'}
 const reference=await f.files.reference('alice','s',identity)
 expect(reference.path).toBe(node.path);expect(reference.revision.size).toBeGreaterThan(0);expect(await readFile(reference.path,'utf8')).toContain('完整证据')
 await expect(f.files.reference('alice','other',identity)).rejects.toThrow('不属于')
 f.state.owner='bob';await expect(f.files.reference('alice','s',identity)).rejects.toThrow()
})
