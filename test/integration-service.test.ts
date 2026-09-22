import {afterEach,expect,it} from 'vitest'
import {mkdtemp,rm} from 'node:fs/promises'
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
