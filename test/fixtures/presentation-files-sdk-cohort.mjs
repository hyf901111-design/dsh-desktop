import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'

// Use the registry's actual ESM peer resolution. Equal bytes at two module
// URLs still have different private scope symbols. Never forge that symbol or
// relax the registry's requirement for a real agent-owned context.
const toolsUrl=import.meta.resolve('@deepseek-ai/dsh-tools')
const peerUrl=name=>import.meta.resolve(name,toolsUrl)
const [tools,{Context},{createScope,scopeOf},{default:SystemPrompt}]=await Promise.all([
 import(toolsUrl),import(peerUrl('@deepseek-ai/cordis')),import(peerUrl('@deepseek-ai/dsh-scope')),import(peerUrl('@deepseek-ai/dsh-system-prompt'))
])
const {registerPresentationFiles}=await import(new URL('../../packages/dsh-research-task-runtime/presentation-files.js',import.meta.url))
const {registerWorkbenchExecutionPolicy}=await import(new URL('../../packages/dsh-research-task-runtime/workbench-execution-policy.js',import.meta.url))
const {registerConversationComponentsPolicy}=await import(new URL('../../packages/dsh-research-task-runtime/conversation-components-policy.js',import.meta.url))
const cwd=process.argv[2]
assert(cwd&&pathToFileURL(cwd).protocol==='file:')
const ctx=new Context();new SystemPrompt(ctx,{})
const runtime=new tools.ToolRuntime(ctx)
const agent={id:'sdk-publication-session',session:{id:'sdk-publication-session',header:{cwd},events:[{type:'turn/start',data:{turn:7}},{type:'user/message',data:{source:{kind:'user'},content:[{type:'text',text:'交付本轮已制作的PPT。'}]}}]}}
ctx.provide('agents',{get:id=>id===agent.id?agent:undefined})
ctx.provide('workspaceRegistry',{resolveByPath:async path=>path===cwd?{id:'sdk-workspace',path:cwd}:undefined})
ctx.provide('eworkIntegrations',{snapshot:{ownerAccountId:'sdk-owner',runtimeEpoch:'sdk-epoch'}})
ctx.provide('sandboxPolicy',{resolve:async()=>({mode:'read-only',workspaceRoot:cwd,sessionId:agent.id})})
const scope=createScope(ctx,agent);agent.ctx=scope.ctx
const dispose=registerPresentationFiles(ctx,{env:{}})
let offWorkbench,offComponents
try{
 const schema=runtime.schemas(agent).find(tool=>tool.name==='presentation_files')
 assert(schema);assert.equal(schema.parameters.properties.paths.type,'array')
 tools.validateJsonSchemaValue(schema.parameters,{paths:['outputs/研究 (定稿).pptx']})
 const sdk=tools.renderToolsSdk(runtime.schemas(agent))
 assert.match(sdk,/presentation_files/);assert.match(sdk,/paths: string\[\]/);assert.match(schema.description,/质量/)
 const definition=runtime.get('presentation_files',agent)
 assert.equal(scopeOf(agent.ctx),agent)
 assert.throws(()=>runtime.restrict({deny:['presentation_files']}),/requires a scoped context/)
 const restore=agent.ctx.tools.restrict({deny:['presentation_files']})
 const call=callId=>runtime.execute({name:'presentation_files',arguments:{paths:['outputs/研究 (定稿).pptx']},agent,callId,signal:new AbortController().signal})
 let denied
 try{
  assert.equal(runtime.schemas(agent).some(tool=>tool.name==='presentation_files'),false)
  assert.equal(runtime.get('presentation_files',agent),undefined)
  assert.equal(runtime.get('presentation_files'),definition)
  denied=await call('denied-publication')
  assert.equal(denied.isError,true)
 }finally{restore()}
 assert.equal(runtime.schemas(agent).some(tool=>tool.name==='presentation_files'),true)
 assert.equal(runtime.get('presentation_files',agent),definition)
 offWorkbench=registerWorkbenchExecutionPolicy(ctx);offComponents=registerConversationComponentsPolicy(ctx)
 const result=await call('sdk-publication')
 assert.equal(result.isError,false)
 assert.equal(JSON.parse(result.value).status,'available')
 process.stdout.write(JSON.stringify({nativeSchema:true,codeSdk:true,scoped:true,hidden:true,denied:true,globalUnchanged:true,restored:true,publication:'available',cohort:{tools:toolsUrl,scope:peerUrl('@deepseek-ai/dsh-scope'),cordis:peerUrl('@deepseek-ai/cordis'),systemPrompt:peerUrl('@deepseek-ai/dsh-system-prompt')}}))
}finally{
 offWorkbench?.();offComponents?.();dispose();await scope.dispose();await ctx.fiber.dispose()
}
