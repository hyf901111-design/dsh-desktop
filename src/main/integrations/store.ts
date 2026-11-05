import {mkdir,open,readFile,rename,rm,copyFile} from 'node:fs/promises'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {emptyIntegrationState,IntegrationError,type IntegrationState} from '../../shared/integrations'

function validate(value: unknown): asserts value is IntegrationState {
  const v=value as IntegrationState
  if(!v || v.schemaVersion!==1 || !Number.isSafeInteger(v.revision) || v.revision<0 || !Array.isArray(v.calls)) throw Error('invalid state')
  for(const key of ['connections','plugins','skills','tools','operations','sources','taskBindings'] as const) {
    if(!v[key] || typeof v[key]!=='object' || Array.isArray(v[key])) throw Error('invalid collection')
  }
  for(const key of ['bundledSkillPreferences','bundledPluginPreferences'] as const) if(v[key]!==undefined) {
    if(!v[key] || typeof v[key]!=='object' || Array.isArray(v[key])) throw Error('invalid bundled preferences')
    for(const preferences of Object.values(v[key])) {
      if(!preferences || typeof preferences!=='object' || Array.isArray(preferences)) throw Error('invalid bundled preferences')
      for(const [id,preference] of Object.entries(preferences)) if(!id.startsWith('builtin:') || !preference || typeof preference.enabled!=='boolean' || !Number.isSafeInteger(preference.revision) || preference.revision<0) throw Error('invalid bundled preference')
    }
  }
  for(const [id,c] of Object.entries(v.connections)) if(c.id!==id || !['api','mcp','app'].includes(c.kind) || typeof c.enabled!=='boolean' || !Number.isSafeInteger(c.revision) || !c.config || !Array.isArray(c.toolGrants) || (c.deniedToolIds!==undefined && (!Array.isArray(c.deniedToolIds) || c.deniedToolIds.some(toolId=>typeof toolId!=='string'))) || !c.workspaceGrant || typeof c.ownerAccountId!=='string') throw Error('invalid connection')
  for(const plugin of Object.values(v.plugins)) if(plugin.excludedSkillIds !== undefined && (!Array.isArray(plugin.excludedSkillIds) || plugin.excludedSkillIds.some(id => typeof id !== 'string' || !id.startsWith(`${plugin.id}/skill/`) || id.length > 256))) throw Error('invalid skill exclusions')
  for(const key of ['plugins','skills','tools','operations','sources'] as const) for(const [id,entity] of Object.entries(v[key])) if(!entity || entity.id!==id) throw Error('invalid entity')
}

export async function atomicWrite(file:string, content:Uint8Array|string):Promise<void> {
  const temp=`${file}.${randomUUID()}.tmp`
  let handle: Awaited<ReturnType<typeof open>>|undefined
  try { handle=await open(temp,'wx',0o600); await handle.writeFile(content); await handle.sync(); await handle.close(); handle=undefined; await rename(temp,file) }
  finally { await handle?.close().catch(()=>{}); await rm(temp,{force:true}).catch(()=>{}) }
}

export class IntegrationStore {
  private state=emptyIntegrationState()
  private queue:Promise<unknown>=Promise.resolve()
  private listeners=new Set<(state:IntegrationState)=>void>()
  private constructor(readonly root:string) {}
  static async open(root:string):Promise<IntegrationStore> {
    const store=new IntegrationStore(root)
    await mkdir(root,{recursive:true,mode:0o700})
    try { const content=await readFile(join(root,'state.json'),'utf8'); const value:unknown=JSON.parse(content); validate(value); store.state=value }
    catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw new IntegrationError('STORAGE_UNAVAILABLE','集成数据读取失败，原文件已保留，请恢复备份后重试') }
    return store
  }
  snapshot():IntegrationState { return structuredClone(this.state) }
  subscribe(listener:(state:IntegrationState)=>void):()=>void { this.listeners.add(listener); return ()=>{this.listeners.delete(listener)} }
  private enqueue<T>(fn:()=>Promise<T>):Promise<T> { const pending=this.queue.then(fn); this.queue=pending.catch(()=>{}); return pending }
  private async persist(next:IntegrationState):Promise<void> {
    validate(next)
    const file=join(this.root,'state.json')
    try { await copyFile(file,join(this.root,'state.backup.json')) } catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error }
    await atomicWrite(file,JSON.stringify(next))
    this.state=next
    for(const listener of this.listeners) { try{listener(this.snapshot())}catch{} }
  }
  commit(expectedRevision:number,next:IntegrationState):Promise<number> {
    const draft=structuredClone(next)
    return this.enqueue(async()=>{
      if(this.state.revision!==expectedRevision) throw new IntegrationError('VERSION_CONFLICT','内容已更新，请刷新后重试')
      draft.revision=expectedRevision+1; await this.persist(draft); return draft.revision
    })
  }
  change<T>(fn:(draft:IntegrationState)=>T|Promise<T>):Promise<T> {
    return this.enqueue(async()=>{ const draft=this.snapshot(); const result=await fn(draft); draft.revision=this.state.revision+1; await this.persist(draft); return structuredClone(result) })
  }
}
