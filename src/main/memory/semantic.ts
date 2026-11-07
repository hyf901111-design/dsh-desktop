import { fork, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { MemoryRecord, MemoryRetrievalStatus } from '../../shared/memory'
import type { MemoryStore } from './store'

export type LocalMemoryConfig = { node:string; worker:string; model:string; idleMs?:number; timeoutMs?:number }
export type MemorySemanticProvider = {
  select(rows:MemoryRecord[],query:string,projectId:string|undefined,now:number,owner:string):Promise<{id:string;revision:number}[]>
  clear():void; close():void; status():MemoryRetrievalStatus
}
type Pending={resolve(value:any):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>}

export class LocalMemoryEngine implements MemorySemanticProvider {
  private child?:ChildProcess
  private pending=new Map<number,Pending>()
  private sequence=0
  private generation=0
  private signature=''
  private owner=''
  private idle?:ReturnType<typeof setTimeout>
  private view:MemoryRetrievalStatus={state:'idle',message:'本地语义检索按需加载。'}
  private queue:Promise<unknown>=Promise.resolve()
  constructor(private config:LocalMemoryConfig,private store:MemoryStore,private changed?:()=>void){}
  status(){return {...this.view}}
  private state(view:MemoryRetrievalStatus){this.view=view;this.changed?.()}
  private rpc(command:unknown):Promise<any>{
    if(!this.child){
      const child=fork(this.config.worker,[],{execPath:this.config.node,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,EWORK_MEMORY_MODEL_DIRECTORY:this.config.model},serialization:'advanced'})
      this.child=child
      child.on('message',(response:any)=>{const item=this.pending.get(response?.id);if(!item)return;this.pending.delete(response.id);clearTimeout(item.timer);response.error?item.reject(Error('本地语义检索暂不可用。')):item.resolve(response.value)})
      const gone=()=>{if(this.child!==child)return;this.child=undefined;this.signature='';for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('本地语义进程已退出。'))}this.pending.clear()}
      child.on('exit',gone);child.on('error',gone)
    }
    const id=++this.sequence
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.clear();reject(Error('本地语义检索超时。'))},this.config.timeoutMs??12000)
      timer.unref();this.pending.set(id,{resolve,reject,timer})
      this.child!.send({id,command},error=>{if(error){const p=this.pending.get(id);if(p){clearTimeout(p.timer);this.pending.delete(id);reject(Error('本地语义检索连接失败。'))}}})
    })
  }
  select(rows:MemoryRecord[],query:string,projectId:string|undefined,now:number,owner:string){
    const generation=this.generation
    const work=this.queue.then(async()=>{
      if(generation!==this.generation)throw Error('旧检索已失效。')
      if(this.idle)clearTimeout(this.idle)
      this.owner=owner
      const signature=createHash('sha256').update(JSON.stringify([owner,rows.map(r=>[r.id,r.revision,r.title,r.content,r.status,r.scope,r.projectId])])).digest('hex')
      try{
        if(signature!==this.signature){
          this.state({state:'loading',message:'正在准备本地记忆索引…',indexed:0})
          let cache;try{cache=this.store.readVectors(owner)}catch{cache=undefined}
          const indexed=await this.rpc({type:'index',rows,cache})
          if(generation!==this.generation||owner!==this.owner)throw Error('旧索引已失效。')
          if(indexed.cache)this.store.writeVectors(owner,indexed.cache)
          this.signature=signature
          this.state({state:'ready',message:'本地语义索引已就绪；使用前会由当前会话模型核对依据。',indexed:rows.length})
        }
        const result=await this.rpc({type:'search',query,projectId,now})
        if(generation!==this.generation)throw Error('旧检索已失效。')
        if(!Array.isArray(result?.candidates)||result.candidates.length>30)throw Error('本地检索结果无效。')
        return result.candidates as {id:string;revision:number}[]
      }catch(error){if(generation===this.generation)this.state({state:'fallback',message:'本地语义检索暂不可用，已回退到关键词候选；仍需核对依据。'});throw error}
      finally{if(generation===this.generation){this.idle=setTimeout(()=>this.clear(),this.config.idleMs??120000);this.idle.unref()}}
    })
    this.queue=work.catch(()=>{});return work
  }
  clear(){
    this.generation++;if(this.idle)clearTimeout(this.idle)
    const child=this.child;this.child=undefined;child?.kill()
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('旧检索已失效。'))}this.pending.clear()
    this.owner='';this.signature='';this.state({state:'idle',message:'本地语义检索按需加载。'})
  }
  close(){this.clear()}
}
