import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {IntegrationService} from '../src/main/integrations/service'
import {emptyConnectionDraft} from '../src/shared/integration-ui'
const roots:string[]=[]
const encryption={isEncryptionAvailable:()=>true,encryptString:(s:string)=>Buffer.from(s),decryptString:(b:Buffer)=>b.toString()}
afterEach(async()=>{await Promise.all(roots.splice(0).map(root=>rm(root,{recursive:true,force:true})))})
it('persists real connection configuration without returning secrets and isolates account switches',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ework-service-'));roots.push(root);let owner='one'
  const service=await IntegrationService.open({root,encryption,getOwnerId:()=>owner})
  try{
    const draft={...emptyConnectionDraft(),name:'My API',url:'https://example.com',authType:'bearer' as const,secret:'private-test-token',toolsJson:JSON.stringify([{id:'read',name:'Read',description:'Read',method:'GET',path:'/read',effect:'read',inputSchema:{type:'object',properties:{},additionalProperties:false}}])}
    const reply=await service.request({type:'save-connection',draft,meta:{requestId:'save-1',expectedRevision:0}})
    expect(reply.type).toBe('operation');if(reply.type!=='operation')throw Error('wrong reply')
    await service.operations.wait(reply.operation.id)
    const snapshot=await service.request({type:'snapshot'});expect(JSON.stringify(snapshot)).not.toContain('private-test-token')
    if(snapshot.type!=='snapshot')throw Error('wrong reply')
    expect(snapshot.snapshot.rows[0]).toMatchObject({name:'My API',tab:'apps',connectionSummary:{workspaceLabel:'当前账号的所有工作区',authLabel:'Token · 已配置',dependencies:[],healthDetail:'尚未测试连接'}})
    expect(JSON.stringify(snapshot)).not.toContain('credentialRef')
    const id=snapshot.snapshot.rows[0]!.id
    const edit=await service.request({type:'connection-draft',id});expect(JSON.stringify(edit)).not.toContain('private-test-token')
    owner='two'
    expect(await service.request({type:'snapshot'})).toMatchObject({snapshot:{rows:[]}})
    await expect(service.request({type:'connection-draft',id})).rejects.toMatchObject({code:'ACCESS_DENIED'})
  }finally{await service.dispose()}
})
it('rejects a stale form rather than overwriting a newer connection',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ework-service-'));roots.push(root)
  const service=await IntegrationService.open({root,encryption,getOwnerId:()=> 'owner'})
  try{
    const first=await service.request({type:'save-connection',draft:{...emptyConnectionDraft(),name:'First',url:'https://example.com'},meta:{requestId:'save-1',expectedRevision:0}})
    if(first.type!=='operation')throw Error('wrong reply');await service.operations.wait(first.operation.id)
    const snapshot=await service.request({type:'snapshot'});if(snapshot.type!=='snapshot')throw Error('wrong reply');const row=snapshot.snapshot.rows[0]!
    const change=await service.request({type:'set-enabled',kind:'connection',id:row.id,enabled:false,meta:{requestId:'disable',expectedRevision:row.revision}})
    if(change.type!=='operation')throw Error('wrong reply');await service.operations.wait(change.operation.id)
    await expect(service.request({type:'set-enabled',kind:'connection',id:row.id,enabled:true,meta:{requestId:'stale',expectedRevision:row.revision}})).rejects.toMatchObject({code:'VERSION_CONFLICT'})
    expect(service.store.snapshot().connections[row.id]?.enabled).toBe(false)
  }finally{await service.dispose()}
})
it('reads the real owned builtin presentation label without requests, heartbeat or state changes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ework-skill-presentation-'));roots.push(root);let owner:string|undefined='one'
  const bundle=join(root,'bundled'),skill=join(bundle,'efund-ppt-maker');await mkdir(skill,{recursive:true})
  await writeFile(join(skill,'SKILL.md'),'---\nname: efund-ppt-maker\ndescription: 制作正式演示文稿\n---\n\n# 正文\n')
  await writeFile(join(skill,'_meta.json'),JSON.stringify({slug:'efund-ppt-maker',source:'eSkill',cnName:'PPT制作助手',version:'1.0.0'}))
  const service=await IntegrationService.open({root:join(root,'state'),encryption,getOwnerId:()=>owner,bundledSkillDirectory:bundle})
  try{
    expect(service.getPresentationSkill).toBeTypeOf('function');const before=service.store.snapshot()
    const request=vi.spyOn(service,'request').mockImplementation(async()=>{throw Error('Presentation must not refresh integrations')})
    const heartbeat=vi.spyOn(service,'runtimeSnapshot').mockImplementation(()=>{throw Error('Presentation must not set heartbeat')})
    expect(service.getPresentationSkill('builtin:efund-ppt-maker')).toEqual({id:'builtin:efund-ppt-maker',invocationName:'ework-skill-180a6a3f86f8942e',label:'/efund-ppt-maker'})
    expect(service.getPresentationSkill('imported:efund-ppt-maker')).toBeNull();expect(service.store.snapshot()).toEqual(before)
    await service.store.change(state=>{state.bundledSkillPreferences??={};state.bundledSkillPreferences.one={'builtin:efund-ppt-maker':{enabled:false,revision:1}}})
    expect(service.getPresentationSkill('builtin:efund-ppt-maker')).toBeNull();owner='two';expect(service.getPresentationSkill('builtin:efund-ppt-maker')).toMatchObject({id:'builtin:efund-ppt-maker'})
    owner=undefined;expect(service.getPresentationSkill('builtin:efund-ppt-maker')).toBeNull();request.mockRestore();heartbeat.mockRestore()
  }finally{vi.restoreAllMocks();await service.dispose()}
})
it('does not invent a presentation skill when the actual builtin bundle was not loaded',async()=>{
  const root=await mkdtemp(join(tmpdir(),'ework-skill-presentation-empty-'));roots.push(root)
  const service=await IntegrationService.open({root,encryption,getOwnerId:()=> 'owner'})
  try{expect(service.getPresentationSkill).toBeTypeOf('function');expect(service.getPresentationSkill('builtin:efund-ppt-maker')).toBeNull()}finally{await service.dispose()}
})
