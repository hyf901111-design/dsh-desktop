import { createHash } from 'node:crypto'
import { join, isAbsolute, relative, resolve } from 'node:path'
import { realpath } from 'node:fs/promises'
import { copyResearchFile } from '../state/research-owned-files'
import type { ResearchFilePreviewRegistry } from '../state/research-file-preview'
import type { NoteFileNode } from '../../shared/note-files'
export const noteFileOwnerPrefix=(owner:string)=>'note-files:'+createHash('sha256').update(owner).digest('hex')+':'

export class NoteFiles {
  private importing = new Map<string,{cancelled:boolean}>()
  constructor(private options:{root:string;registry:ResearchFilePreviewRegistry;workspaceRoot(sessionId:string):Promise<string|null>;owner():string;canRead(sessionId:string):boolean;reveal(path:string):void}){}
  private identity(owner:string,sessionId:string,nodeId:string){
    if(!/^note-file-[\w-]{1,80}$/.test(nodeId))throw Error('笔记文件标识无效。')
    const key=createHash('sha256').update(JSON.stringify([owner,sessionId])).digest('hex')
    return {sessionId:noteFileOwnerPrefix(owner)+key,nodeId,key}
  }
  async admit(owner:string,sessionId:string,input:any):Promise<NoteFileNode>{
    const identity=this.identity(owner,sessionId,input.nodeId),pending={cancelled:false},key=identity.sessionId+':'+identity.nodeId
    if(this.importing.has(key)||this.importing.size>=NOTE_IMPORT_LIMIT)throw Error('请等待当前文件导入完成。')
    this.importing.set(key,pending)
    const valid=()=>!pending.cancelled&&this.options.owner()===owner&&this.options.canRead(sessionId)
    try{
      let source:string
      if(typeof input.relativePath==='string'){
        if(input.relativePath.length>8192||isAbsolute(input.relativePath)||input.relativePath.split(/[\\/]/).some((part:string)=>part==='..'))throw Error('文件路径不可用。')
        const directory=await this.options.workspaceRoot(sessionId);if(!directory)throw Error('会话文件目录尚未就绪。')
        const root=await realpath(directory);source=await realpath(resolve(root,input.relativePath))
        const inside=relative(root,source);if(!inside||inside.startsWith('..')||isAbsolute(inside))throw Error('文件不在当前会话目录中。')
      }else if(typeof input.path==='string'&&input.path.length<=8192&&isAbsolute(input.path))source=input.path
      else throw Error('请从访达或当前会话的文件区拖入文件。')
      if(!valid())throw Error('文件导入已取消。')
      const path=await copyResearchFile(source,join(this.options.root,identity.key))
      if(!valid())throw Error('文件导入已取消。')
      const descriptor=await this.options.registry.admitFinder({path,sessionId:identity.sessionId,nodeId:identity.nodeId},true)
      if(!descriptor)throw Error('文件暂时无法导入，请重试。')
      if(!valid()){this.options.registry.revokeNode(identity.sessionId,identity.nodeId);throw Error('文件导入已取消。')}
      this.options.registry.releaseCapability({...descriptor,sessionId:identity.sessionId,nodeId:identity.nodeId})
      return {id:identity.nodeId,name:descriptor.name,path,source:'computer',authorizationId:descriptor.authorizationId,previewSessionId:identity.sessionId,contentType:descriptor.contentType,...descriptor.previewEligible===false?{previewEligible:false}: {}}
    }finally{this.importing.delete(key)}
  }
  revoke(owner:string,sessionId:string,nodeId:string){const identity=this.identity(owner,sessionId,nodeId),pending=this.importing.get(identity.sessionId+':'+nodeId);if(pending)pending.cancelled=true;return this.options.registry.revokeNode(identity.sessionId,nodeId)}
  async bind(owner:string,sessionId:string,input:any){const identity=this.identity(owner,sessionId,input.nodeId),file=await this.options.registry.resolveExportSource({sessionId:identity.sessionId,nodeId:identity.nodeId,authorizationId:input.authorizationId});if(!file||owner!==this.options.owner()||!this.options.canRead(sessionId))throw Error('此附件不属于当前笔记，请重新拖入文件。');return {previewSessionId:identity.sessionId}}
  async reveal(owner:string,sessionId:string,input:any){
    const identity=this.identity(owner,sessionId,input.nodeId),file=await this.options.registry.resolveExportSource({sessionId:identity.sessionId,nodeId:identity.nodeId,authorizationId:input.authorizationId})
    if(!file||owner!==this.options.owner()||!this.options.canRead(sessionId))throw Error('文件暂不可用，请重新拖入。')
    this.options.reveal(file.path);return {ok:true}
  }
}
const NOTE_IMPORT_LIMIT=64
