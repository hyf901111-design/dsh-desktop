import {afterEach,expect,it} from 'vitest'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {IntegrationService} from '../src/main/integrations/service'

const cleanups:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const close of cleanups.splice(0).reverse())await close()})
const encryption={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()}
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'ework-builtin-prefs-')),directory=join(root,'bundle'),slug='efund-ppt-maker'
 await mkdir(join(directory,slug),{recursive:true})
 await writeFile(join(directory,slug,'SKILL.md'),'---\nname: efund-ppt-maker\ndescription: PPT fixture\n---\nPPT body')
 await writeFile(join(directory,slug,'_meta.json'),JSON.stringify({slug,cnName:'PPT制作助手',version:'v1.1.1',source:'eSkill'}))
 let owner='one'
 const open=async()=>{
  const service=await IntegrationService.open({root:join(root,'state'),encryption,getOwnerId:()=>owner,bundledSkillDirectory:directory,bundledTushare:{authenticated:()=>true,request:async()=>{throw Error('unexpected network')}}})
  cleanups.push(()=>service.dispose());return service
 }
 cleanups.push(()=>rm(root,{recursive:true,force:true}))
 const service=await open()
 return {service,open,directory,setOwner:(value:string)=>{owner=value;service.rotateIdentity()}}
}
async function row(service:IntegrationService,id:string){const r=await service.request({type:'snapshot'});if(r.type!=='snapshot')throw Error('snapshot');return r.snapshot.rows.find(r=>r.id===id)!}
async function toggle(service:IntegrationService,id:string,enabled:boolean){const r=await row(service,id),reply=await service.request({type:'set-enabled',kind:r.kind,id,enabled,meta:{requestId:randomUUID(),expectedRevision:r.revision}});if(reply.type!=='operation')throw Error('operation');await service.operations.wait(reply.operation.id);expect((await service.request({type:'operation',id:reply.operation.id}) as any).operation.status).toBe('succeeded')}

it('defaults builtins on, persists skill opt-outs across restart and upgrade, and isolates accounts',async()=>{
 const f=await fixture(),id='builtin:efund-ppt-maker',initial=await row(f.service,id)
 expect(initial).toMatchObject({enabled:true,toggleable:true,removable:false})
 await toggle(f.service,id,false)
 const off=await row(f.service,id)
 expect(off.enabled).toBe(false);expect(off.revision).not.toBe(initial.revision)
 const ctx={ownerAccountId:'one',runtimeEpoch:f.service.runtimeEpoch,sessionId:'test',rootSessionId:'test',workspaceId:'test',unattended:false}
 await expect(f.service.readSkill({id,revision:off.revision,context:ctx})).rejects.toMatchObject({code:'ACCESS_DENIED'})
 expect(await f.service.request({type:'skill-detail',id,revision:off.revision})).toMatchObject({enabled:false,usable:false})
 const restarted=await f.open();expect((await row(restarted,id)).enabled).toBe(false)
 await writeFile(join(f.directory,'efund-ppt-maker','SKILL.md'),'---\nname: efund-ppt-maker\ndescription: Updated PPT fixture\n---\nUpdated body')
 const upgraded=await f.open();expect((await row(upgraded,id)).enabled).toBe(false)
 expect(upgraded.runtimeSnapshot().skills.find(s=>s.id===id)?.description).toBe('Updated PPT fixture')
 f.setOwner('two');expect((await row(f.service,id)).enabled).toBe(true)
 f.setOwner('one');expect((await row(f.service,id)).enabled).toBe(false)
 await toggle(f.service,id,true);expect((await row(f.service,id)).enabled).toBe(true)
 expect(f.service.store.snapshot().skills).toEqual({})
})

it('keeps Tushare off through snapshots, login refresh and restart, while protecting its fixed config',async()=>{
 const f=await fixture(),snapshot=await f.service.request({type:'snapshot'}),id=(snapshot as any).snapshot.rows.find((r:any)=>r.kind==='connection').id
 expect(await row(f.service,id)).toMatchObject({enabled:true,toggleable:true,removable:false,configurable:false})
 await toggle(f.service,id,false)
 for(let n=0;n<3;n++)expect((await row(f.service,id)).enabled).toBe(false)
 const tool=f.service.runtimeSnapshot().tools.find(t=>t.connectionId===id)!
 await expect(f.service.execute({callId:'disabled-mcp',toolId:tool.id,connectionRevision:(await row(f.service,id)).revision,arguments:{},context:{ownerAccountId:'one',runtimeEpoch:f.service.runtimeEpoch,sessionId:'test',rootSessionId:'test',workspaceId:'test',unattended:false}},new AbortController().signal)).rejects.toMatchObject({code:'ACCESS_DENIED'})
 f.service.rotateIdentity();expect((await row(f.service,id)).enabled).toBe(false)
 expect((await row(await f.open(),id)).enabled).toBe(false)
 const off=await row(f.service,id)
 await expect(f.service.request({type:'uninstall',kind:'connection',id,meta:{requestId:randomUUID(),expectedRevision:off.revision}})).rejects.toMatchObject({code:'ACCESS_DENIED'})
 await toggle(f.service,id,true);expect((await row(f.service,id)).enabled).toBe(true)
})
