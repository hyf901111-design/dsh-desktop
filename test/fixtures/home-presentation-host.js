import {mkdtemp,mkdir,writeFile,readFile,realpath,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {Context,Service} from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import {JsonStorageBackend} from '@deepseek-ai/dsh-storage-json'
import {DomainFacility} from '@deepseek-ai/dsh-storage-domain'
import WorkspaceRegistry from '@deepseek-ai/dsh-workspace'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic'
import SkillRegistry from '@deepseek-ai/dsh-skill'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import SessionTitleService from '@deepseek-ai/dsh-session-title'
import {createApiProxy} from '@deepseek-ai/dsh-host-apiproxy'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import {apply as registerSkillTool} from '@deepseek-ai/dsh-tool-skill'
import {apply as todo} from '@deepseek-ai/dsh-tool-todo'
import {IntegrationService} from '../../src/main/integrations/service'
import {startIntegrationBridge} from '../../src/main/integrations/runtime-bridge'
import {resolveIntegrationContext} from '../../src/main/integrations/context'
import {createIntegrationRuntime} from '../../packages/dsh-integration-runtime/index.js'
import {apply as registerResearchRuntime} from '../../packages/dsh-research-task-runtime/index.js'
import {HOME_PRESENTATION_PATH,createHomePresentationBrief} from '../../packages/dsh-research-task-runtime/home-presentation-runtime.js'

// Real production services on private temporary storage. The only model adapter
// is a local recorder; any escaped preset request is immediately observable.
export async function presentationHostFixture({bindWorkspace=true,autoCompaction=false}={}){
 const root=await realpath(await mkdtemp(join(tmpdir(),'home-presentation-host-'))),cwd=join(root,'examples','presentation'),home=join(root,'profile')
 await mkdir(cwd,{recursive:true});await mkdir(home)
 const previousHome=process.env.DSH_HOME;process.env.DSH_HOME=home
 const ctx=new Context(),outside=[],errors=[]
 ctx.on('agent/error',p=>errors.push(p.error?.message??String(p.error)))
 new Storage(ctx)
 const backend=new JsonStorageBackend(join(root,'storage'));ctx.storage.backend.register('json',backend)
 const domain=new DomainFacility(ctx,{backend:'json'});ctx.provide('storageDomain',domain)
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new SkillRegistry(ctx);new TokenMeter(ctx)
 new JsonlSessionPersistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false,writeBatchMaxDelayMs:1})
 new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});new UserQuestionService(ctx)
 if(autoCompaction)new BasicCompactionEngine(ctx,{thresholdRatio:0.05,retainTokens:0})
 new SessionTitleService(ctx,{fallbackMaxWords:10,fallbackMaxBytes:100,maxTitleBytes:256})
 const registry=new WorkspaceRegistry(ctx);await registry[Service.init]()
 class Outside extends LlmAdapter{async resolveModel(provider,model){return{provider,id:model,name:model,context:{contextWindow:32000},defaultMaxTokens:512}}async *stream(request){outside.push(request);yield{type:'finish',reason:{kind:'stop'}}}}
 ctx.llm.registerAdapter(['outside'],new Outside())
 const api=createApiProxy(ctx,{cwd:root,defaultModelSelection:()=>({provider:'outside',model:'normal'})})
 let seq=0
 const request=async(handler,payload)=>{const reply=await handler({rpcId:'fixture-'+(++seq),payload});if(!reply.result.ok)throw Error(reply.result.error.message);return reply.result.value}
 const {sessionId}=await request(api.sessions.create,{cwd,sessionId:'demo'})
 const agent=ctx.agents.get(sessionId)
 const bind=async()=>{const {workspace}=await request(api.workspace.create,{path:cwd});await request(api.sessions.create,{workspaceId:workspace.workspaceId,sessionId});return workspace}
 if(bindWorkspace)await bind()
 await writeFile(join(home,'research-board-directories.json'),JSON.stringify({example:{sessionId,path:cwd,title:'公司风格演示示例'}}))
 const service=await IntegrationService.open({root:join(root,'integrations'),encryption:{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()},getOwnerId:()=> 'fixture-owner',bundledSkillDirectory:resolve('skills'),resolveContext:input=>resolveIntegrationContext(input,{ownerId:'fixture-owner',tasks:[],workspaces:async()=> (await request(api.workspace.list,{})).items,sessions:async()=> (await request(api.sessions.list,{})).items})})
 const bridge=await startIntegrationBridge(service)
 const integrations=createIntegrationRuntime(ctx,{env:{EWORK_INTEGRATION_BRIDGE:JSON.stringify({url:bridge.url,token:bridge.token})},pollIntervalMs:0,requestTimeoutMs:2000})
 registerSkillTool(ctx);todo(ctx,{allowParallelInProgress:false});await integrations.ready
 const web=new WebServer(ctx,{host:'127.0.0.1',port:0});await web[Service.init]()
 // Install the complete production research middleware/routes, not a duplicate
 // presentation-only handler, so request-context and execution policies run.
 await registerResearchRuntime(ctx)
 const origin='http://127.0.0.1:'+web.port,input={sessionId,cwd,runId:'run-1',fresh:true}
 const command=async(action,extra={})=>{const response=await fetch(origin+HOME_PRESENTATION_PATH,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...input,action,...extra})});const reply=await response.json();if(!reply.ok)throw Error(reply.message);return reply}
 const metadata=JSON.parse(await readFile('packages/dsh-research-task-runtime/assets/home-presentation/source-metadata.json','utf8'))
 const bytes=await readFile('packages/dsh-research-task-runtime/assets/home-presentation/company-research-briefing.pptx'),sourceBytes=await readFile('packages/dsh-research-task-runtime/assets/home-presentation/source-report.pdf')
 const message=()=>'/ework-skill-180a6a3f86f8942e 📎 文件：`'+join(cwd,'Vanguard-2026经济与市场展望.pdf')+'` '+createHomePresentationBrief(metadata)
 const prompt=(text,mode='followup')=>request(api.sessions.prompt,{sessionId,mode,content:[{type:'text',text}]})
 const dispose=async()=>{await integrations.dispose();await ctx.fiber.dispose();await bridge.dispose();await service.dispose();await domain.closeAll();await backend.close();if(previousHome===undefined)delete process.env.DSH_HOME;else process.env.DSH_HOME=previousHome;await rm(root,{recursive:true,force:true})}
 return{ctx,root,cwd,home,agent,api,registry,service,integrations,input,metadata,bytes,sourceBytes,message,command,prompt,request,bind,outside,errors,dispose}
}
