import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {createSourceFile,ScriptTarget,ScriptKind,forEachChild,isFunctionDeclaration} from 'typescript'
import {expect,it,vi} from 'vitest'
import {patchSessionIdentityList,patchStoredSessionIdentity} from '../scripts/lib/session-identity-list.mjs'
import {resolveIntegrationContext} from '../src/main/integrations/context'

const native=readFileSync('node_modules/@deepseek-ai/dsh-host-apiproxy/lib/index.js','utf8')
function fixture(){
 const source=patchSessionIdentityList(native),ast=createSourceFile('host.js',source,ScriptTarget.Latest,false,ScriptKind.JS)
 let declaration='';const visit=(node:any)=>{if(isFunctionDeclaration(node)&&node.name?.text==='sessionIdentitySummaries')declaration=node.getText(ast);forEachChild(node,visit)};visit(ast)
 const child={id:'child',header:{id:'child',createdAt:2,cwd:'/workspace',origin:'subagent',parentSession:'root'}}
 const read=vi.fn(()=>{throw Error('Identity lookup must not read histories')})
 const readStoredIdentity=vi.fn(async(id:string)=>id==='root'?{id,createdAt:1,cwd:'/workspace'}:undefined)
 const persistence={list:read,readFrom:read,readStoredIdentity}
 const ctx={sessions:{list:read,get:(id:string)=>id==='child'?child:undefined},agents:{get:(id:string)=>id==='child'?{status:'running'}:undefined},get:()=>persistence}
 const list=runInNewContext(`(${declaration})`,{ctx,sessionListFields:(h:any)=>({cwd:h.cwd,...h.origin?{origin:h.origin}:{},...h.parentSession?{parentSessionId:h.parentSession}:{}})})
 return{source,list,read,readStoredIdentity}
}
it('uses only the live child and one persisted parent header, never scans or replays history',async()=>{
 const f=fixture(),items=await f.list({identitySessionId:'child'})
 expect(items).toHaveLength(2)
 expect(items.find((x:any)=>x.sessionId==='child')).toMatchObject({running:true,parentSessionId:'root',origin:'subagent',cwd:'/workspace'})
 expect(items.find((x:any)=>x.sessionId==='root')).toMatchObject({running:false,cwd:'/workspace'})
 expect(f.read).not.toHaveBeenCalled();expect(f.readStoredIdentity).toHaveBeenCalledExactlyOnceWith('root',undefined)
 const context={ownerAccountId:'owner',sessionId:'child',rootSessionId:'root',workspaceId:'workspace',runtimeEpoch:'epoch',unattended:false}
 const options={ownerId:'owner',tasks:[],workspaces:async()=>[{workspaceId:'workspace',path:'/workspace'}],sessions:(id:string)=>f.list({identitySessionId:id})}
 expect(await resolveIntegrationContext(context,options)).toMatchObject({rootSessionId:'root',sessionId:'child',unattended:false})
 await expect(resolveIntegrationContext({...context,rootSessionId:'cold-1'},options)).rejects.toMatchObject({code:'ACCESS_DENIED'})
 await expect(resolveIntegrationContext({...context,sessionId:'missing'},options)).rejects.toMatchObject({code:'ACCESS_DENIED'})
})
it('reconciles activity from current sessions without loading any cold records',async()=>{
 const f=fixture()
 expect(await f.list({activitySessionIds:['child','child','root','missing']})).toEqual([{sessionId:'child',updatedAt:2,running:true,blank:false,origin:'subagent',parentSessionId:'root',cwd:'/workspace'}])
 expect(f.readStoredIdentity).not.toHaveBeenCalled();expect(f.read).not.toHaveBeenCalled()
})
it('patches only an explicit lightweight request, preserves the ordinary list, and fails on drift',()=>{
 const f=fixture();expect(patchSessionIdentityList(f.source)).toBe(f.source)
 expect(f.source).toContain('scoped ? await sessionIdentitySummaries(request.payload, signal) : await listVisibleSessionSummaries(signal)')
 expect(readFileSync('src/main/index.ts','utf8')).toContain("taskRpc('session.list', { identitySessionId: sessionId })")
 expect(()=>patchSessionIdentityList('drift')).toThrow('anchor drifted')
 const persistence=patchStoredSessionIdentity(readFileSync('node_modules/@deepseek-ai/dsh-session-persistence-jsonl/lib/index.js','utf8'))
 expect(patchStoredSessionIdentity(persistence)).toBe(persistence)
})
