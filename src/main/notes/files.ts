import { createHash, randomUUID } from 'node:crypto'
import { basename, dirname, join, isAbsolute, relative, resolve } from 'node:path'
import { mkdir, realpath, rename, stat, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { copyResearchFile } from '../state/research-owned-files'
import type { ResearchFilePreviewRegistry } from '../state/research-file-preview'
import type { NoteFileNode } from '../../shared/note-files'
import { isKnowledgeFileId } from '../../shared/knowledge-drag'
import { sharedKnowledgeSessionFile } from '../../shared/knowledge-sessions'
import type { KnowledgeStore } from '../knowledge/store'
import type { KnowledgeSharing } from '../knowledge/sharing'
export const noteFileOwnerPrefix=(owner:string)=>'note-files:'+createHash('sha256').update(owner).digest('hex')+':'
type KnowledgeSources={store:Pick<KnowledgeStore,'file'>;sharing:Pick<KnowledgeSharing,'read'>;generation():number}

export class NoteFiles {
  private importing = new Map<string,{cancelled:boolean}>()
  constructor(private options:{root:string;registry:ResearchFilePreviewRegistry;workspaceRoot(sessionId:string):Promise<string|null>;owner():string;canRead(sessionId:string):boolean;reveal(path:string):void;knowledge?:KnowledgeSources}){}
  private identity(owner:string,sessionId:string,nodeId:string){
    if(!/^note-file-[\w-]{1,80}$/.test(nodeId))throw Error('笔记文件标识无效。')
    const key=createHash('sha256').update(JSON.stringify([owner,sessionId])).digest('hex')
    return {sessionId:noteFileOwnerPrefix(owner)+key,nodeId,key}
  }
  private async copyKnowledgeFile(id:unknown,directory:string,current:()=>boolean){
    const knowledge=this.options.knowledge
    if(!knowledge||!isKnowledgeFileId(id))throw Error('知识库项目标识无效。')
    const file=id.length===32?await knowledge.sharing.read(id,AbortSignal.timeout(20000)):await knowledge.store.file(id)
    if(!current())throw Error('文件导入已取消。')
    const name=file.document.name
    if(!name||name==='.'||name==='..'||/[\\/\p{Cc}]/u.test(name))throw Error('知识库文件名无效。')
    if('data' in file&&sharedKnowledgeSessionFile(name,file.document.source))throw Error('请在知识库中打开对应的只读会话。')
    await mkdir(directory,{recursive:true})
    const owned=await mkdtemp(join(directory,'knowledge-')),path=join(owned,name)
    try{
      if('data' in file)await writeFile(path,file.data,{flag:'wx',mode:0o600})
      else{
        const copy=await copyResearchFile(file.path,owned)
        if(copy!==path)await rename(copy,path)
      }
      return path
    }catch(error){await rm(owned,{recursive:true,force:true});throw error}
  }
  private async copyInput(sessionId:string,input:any,directory:string,current:()=>boolean){
    let source:string
    if(typeof input.relativePath==='string'){
      if(input.relativePath.length>8192||isAbsolute(input.relativePath)||input.relativePath.split(/[\\/]/).some((part:string)=>part==='..'))throw Error('文件路径不可用。')
      const workspace=await this.options.workspaceRoot(sessionId);if(!workspace)throw Error('会话文件目录尚未就绪。')
      const root=await realpath(workspace);source=await realpath(resolve(root,input.relativePath))
      const inside=relative(root,source);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('文件不在当前会话目录中。')
    }else if(typeof input.path==='string'&&input.path.length<=8192&&isAbsolute(input.path))source=input.path
    else throw Error('请从访达或当前会话的文件区拖入文件。')
    if(!current())throw Error('文件导入已取消。')
    return copyResearchFile(source,directory)
  }
  async admit(owner:string,sessionId:string,input:any,writable:()=>boolean=()=>true):Promise<NoteFileNode>{
    const identity=this.identity(owner,sessionId,input.nodeId),pending={cancelled:false},key=identity.sessionId+':'+identity.nodeId
    if(this.importing.has(key)||this.importing.size>=NOTE_IMPORT_LIMIT)throw Error('请等待当前文件导入完成。')
    this.importing.set(key,pending)
    const knowledge=input.knowledgeFileId===undefined?undefined:this.options.knowledge
    const generation=knowledge?.generation()
    const valid=()=>!pending.cancelled&&this.options.owner()===owner&&this.options.canRead(sessionId)&&writable()&&knowledge?.generation()===generation
    let knowledgeCopy:string|undefined
    try{
      if(!valid())throw Error('文件导入已取消。')
      const directory=join(this.options.root,identity.key)
      const path=input.knowledgeFileId!==undefined
        ? (knowledgeCopy=await this.copyKnowledgeFile(input.knowledgeFileId,directory,valid))
        : await this.copyInput(sessionId,input,directory,valid)
      if(!valid())throw Error('文件导入已取消。')
      const descriptor=await this.options.registry.admitFinder({path,sessionId:identity.sessionId,nodeId:identity.nodeId},true)
      if(!descriptor)throw Error('文件暂时无法导入，请重试。')
      if(!valid()){this.options.registry.revokeNode(identity.sessionId,identity.nodeId);throw Error('文件导入已取消。')}
      this.options.registry.releaseCapability({...descriptor,sessionId:identity.sessionId,nodeId:identity.nodeId})
      const media=await this.options.registry.restoreMedia({sessionId:identity.sessionId,nodeId:identity.nodeId,authorizationId:descriptor.authorizationId},valid)
      if(media)this.options.registry.releaseCapability({...media,sessionId:identity.sessionId,nodeId:identity.nodeId})
      if(!valid()){this.options.registry.revokeNode(identity.sessionId,identity.nodeId);throw Error('文件导入已取消。')}
      return {id:identity.nodeId,name:descriptor.name,path,source:'computer',authorizationId:descriptor.authorizationId,previewSessionId:identity.sessionId,contentType:media?.contentType??descriptor.contentType,...media?{mediaKind:media.kind}:{},...descriptor.previewEligible===false?{previewEligible:false}: {}}
    }catch(error){
      if(knowledgeCopy)await rm(dirname(knowledgeCopy),{recursive:true,force:true})
      throw error
    }finally{this.importing.delete(key)}
  }
  async admitImage(owner:string,sessionId:string,stored:{attachment:{mediaType:string;bytes:number;name?:string};data:string},current:()=>boolean){
    const formats:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'}
    const ref=stored.attachment,ext=Object.hasOwn(formats,ref?.mediaType)?formats[ref.mediaType]:undefined
    if(!current()||!ext||!Number.isSafeInteger(ref.bytes)||ref.bytes<=0||ref.bytes>20*1024*1024||typeof stored.data!=='string'||stored.data.length!==4*Math.ceil(ref.bytes/3))throw Error('笔记图片暂时无法读取。')
    const data=Buffer.from(stored.data,'base64')
    if(data.length!==ref.bytes)throw Error('笔记图片不完整。')
    const directory=await mkdtemp(join(tmpdir(),'ework-note-image-'))
    const stem=basename(ref.name||'笔记配图').replace(/\.[^.]*$/u,'').replace(/[^\p{L}\p{N}_ -]/gu,'').trim().slice(0,80)||'笔记配图'
    const path=join(directory,stem+'.'+ext),nodeId='note-file-'+randomUUID()
    try{
      await writeFile(path,data,{flag:'wx',mode:0o600})
      if(!current())throw Error('笔记图片请求已结束。')
      const node=await this.admit(owner,sessionId,{nodeId,path})
      if(!current()||node.mediaKind!=='image'){this.revoke(owner,sessionId,nodeId);throw Error('笔记图片暂时无法显示。')}
      return {...node,noteDisplay:'inline' as const}
    }finally{await rm(directory,{recursive:true,force:true})}
  }
  revoke(owner:string,sessionId:string,nodeId:string){const identity=this.identity(owner,sessionId,nodeId),pending=this.importing.get(identity.sessionId+':'+nodeId);if(pending)pending.cancelled=true;return this.options.registry.revokeNode(identity.sessionId,nodeId)}
  async bind(owner:string,sessionId:string,input:any){const identity=this.identity(owner,sessionId,input.nodeId),file=await this.options.registry.resolveExportSource({sessionId:identity.sessionId,nodeId:identity.nodeId,authorizationId:input.authorizationId});if(!file||owner!==this.options.owner()||!this.options.canRead(sessionId))throw Error('此附件不属于当前笔记，请重新拖入文件。');return {previewSessionId:identity.sessionId}}
  async media(owner:string,sessionId:string,input:any):Promise<any>{
    const identity=this.identity(owner,sessionId,input.nodeId),current=()=>owner===this.options.owner()&&this.options.canRead(sessionId)
    if(!current())throw Error('笔记媒体授权已变化，请重新打开笔记。')
    const action=input.action??'acquire',request={sessionId:identity.sessionId,nodeId:identity.nodeId,authorizationId:input.authorizationId}
    if(!['acquire','renew','release'].includes(action))throw Error('媒体操作无效。')
    if(action==='release')return {ok:this.options.registry.releaseCapability({...request,capabilityToken:input.releaseId})}
    const lease=await this.options.registry.restoreMedia(request,current)
    if(!lease||!current()){
      if(lease)this.options.registry.releaseCapability({...request,capabilityToken:lease.capabilityToken})
      throw Error('此附件没有可直接播放的受支持媒体，或当前授权已失效。')
    }
    if(action==='renew'&&input.releaseId)this.options.registry.releaseCapability({...request,capabilityToken:input.releaseId})
    return {url:lease.url,releaseId:lease.capabilityToken,expiresAt:lease.expiresAt,kind:lease.kind,contentType:lease.contentType,name:lease.name}
  }
  async reference(owner:string,sessionId:string,input:any){
    const identity=this.identity(owner,sessionId,input.nodeId)
    const file=await this.options.registry.resolveExportSource({sessionId:identity.sessionId,nodeId:identity.nodeId,authorizationId:input.authorizationId})
    if(!file||owner!==this.options.owner()||!this.options.canRead(sessionId))throw Error('此附件不属于当前笔记，请重新拖入文件。')
    const path=await realpath(file.path),info=await stat(path)
    if(!info.isFile()||info.size>64*1024*1024||owner!==this.options.owner()||!this.options.canRead(sessionId))throw Error('附件当前无法读取。')
    return {path,name:file.name,revision:{size:info.size,mtimeMs:info.mtimeMs}}
  }
  async reveal(owner:string,sessionId:string,input:any){
    const identity=this.identity(owner,sessionId,input.nodeId),file=await this.options.registry.resolveExportSource({sessionId:identity.sessionId,nodeId:identity.nodeId,authorizationId:input.authorizationId})
    if(!file||owner!==this.options.owner()||!this.options.canRead(sessionId))throw Error('文件暂不可用，请重新拖入。')
    this.options.reveal(file.path);return {ok:true}
  }
}
const NOTE_IMPORT_LIMIT=64
