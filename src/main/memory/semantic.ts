import { fork, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import type { MemoryRecord, MemoryRetrievalStatus } from '../../shared/memory'
import type { MemoryStore } from './store'

export type LocalMemoryConfig = { node:string; worker:string; model:string; idleMs?:number; timeoutMs?:number; indexTimeoutMs?:number }
export type MemorySemanticProvider = {
  select(rows:MemoryRecord[],query:string,projectId:string|undefined,now:number,owner:string):Promise<{id:string;revision:number}[]>
  clear():void; close():void; status():MemoryRetrievalStatus
}
type Pending={resolve(value:any):void;reject(error:Error):void;timer:ReturnType<typeof setTimeout>;progress?:(value:any)=>void}

/** Cold indexing never blocks a chat: callers use keyword candidates until ready. */
export class LocalMemoryEngine implements MemorySemanticProvider {
  private child?:ChildProcess
  private pending=new Map<number,Pending>()
  private sequence=0
  private generation=0
  private signature=''
  private owner=''
  private idle?:ReturnType<typeof setTimeout>
  private building?:{signature:string;task:Promise<void>}
  private view:MemoryRetrievalStatus={state:'idle',message:'本地语义检索按需加载。'}
  constructor(private config:LocalMemoryConfig,private store:MemoryStore,private changed?:()=>void){}
  status(){return {...this.view}}
  private state(view:MemoryRetrievalStatus){this.view=view;this.changed?.()}
  private stopWorker(){
    const child=this.child;this.child=undefined;child?.kill();this.signature=''
    for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(Error('旧检索已失效。'))}this.pending.clear()
  }
  private armIdle(){
    if(this.idle)clearTimeout(this.idle)
    if(!this.building&&!this.pending.size&&this.child){this.idle=setTimeout(()=>this.clear(),this.config.idleMs??120000);this.idle.unref()}
  }
  private rpc(command:unknown,timeoutMs:number,progress?:(value:any)=>void):Promise<any>{
    if(!this.child){
      const child=fork(this.config.worker,[],{execPath:this.config.node,stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,EWORK_MEMORY_MODEL_DIRECTORY:this.config.model},serialization:'advanced'})
      this.child=child
      child.on('message',(response:any)=>{
        const item=this.pending.get(response?.id);if(!item)return
        if(response.progress){try{item.progress?.(response.progress)}catch{this.stopWorker()}return}
        this.pending.delete(response.id);clearTimeout(item.timer)
        response.error?item.reject(Error('本地语义检索暂不可用。')):item.resolve(response.value)
      })
      const gone=()=>{if(this.child!==child)return;this.stopWorker();this.state({state:'fallback',message:'本地语义检索暂不可用，已回退到关键词候选；仍需核对依据。'})}
      child.on('exit',gone);child.on('error',gone)
    }
    const id=++this.sequence
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>this.stopWorker(),timeoutMs)
      timer.unref();this.pending.set(id,{resolve,reject,timer,progress})
      this.child!.send({id,command},error=>{if(error)this.stopWorker()})
    })
  }
  private startIndex(rows:MemoryRecord[],owner:string,signature:string){
    this.clear();this.owner=owner
    const generation=this.generation
    this.state({state:'loading',message:'正在准备本地记忆索引，期间使用关键词候选。',indexed:0})
    const stillCurrent=()=>generation===this.generation&&owner===this.owner
    const task=Promise.resolve().then(async()=>{
      if(!stillCurrent())return
      try{
        let cache;try{cache=this.store.readVectors(owner)}catch{cache=undefined}
        const indexed=await this.rpc({type:'index',rows,cache},this.config.indexTimeoutMs??300000,progress=>{
          if(!stillCurrent())return
          if(progress.cache)this.store.writeVectors(owner,progress.cache)
          this.state({state:'loading',message:'正在准备本地记忆索引，期间使用关键词候选。',indexed:progress.indexed})
        })
        if(!stillCurrent())return
        if(indexed.cache)this.store.writeVectors(owner,indexed.cache)
        this.signature=signature
        this.state({state:'ready',message:'本地语义索引已就绪；使用前会由当前会话模型核对依据。',indexed:rows.length})
      }catch{if(stillCurrent())this.state({state:'fallback',message:'本地语义检索暂不可用，已回退到关键词候选；仍需核对依据。'})}
      finally{if(stillCurrent()){this.building=undefined;this.armIdle()}}
    })
    this.building={signature,task}
  }
  async select(rows:MemoryRecord[],query:string,projectId:string|undefined,now:number,owner:string){
    const signature=createHash('sha256').update(JSON.stringify([owner,rows.map(r=>[r.id,r.revision,r.title,r.content,r.status,r.scope,r.projectId,r.expiresAt])])).digest('hex')
    if(signature!==this.signature){
      if(this.building?.signature!==signature)this.startIndex(rows,owner,signature)
      throw Error('本地索引正在准备，暂用关键词候选。')
    }
    const generation=this.generation
    if(this.idle)clearTimeout(this.idle)
    try{
      const result=await this.rpc({type:'search',query,projectId,now},this.config.timeoutMs??1500)
      if(generation!==this.generation)throw Error('旧检索已失效。')
      if(!Array.isArray(result?.candidates)||result.candidates.length>30)throw Error('本地检索结果无效。')
      return result.candidates as {id:string;revision:number}[]
    }catch(error){if(generation===this.generation)this.state({state:'fallback',message:'本地语义检索暂不可用，已回退到关键词候选；仍需核对依据。'});throw error}
    finally{if(generation===this.generation)this.armIdle()}
  }
  clear(){
    this.generation++;if(this.idle)clearTimeout(this.idle)
    this.building=undefined;this.stopWorker();this.owner=''
    this.state({state:'idle',message:'本地语义检索按需加载。'})
  }
  close(){this.clear()}
}
