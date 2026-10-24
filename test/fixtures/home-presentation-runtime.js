import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import {apply as todo} from '@deepseek-ai/dsh-tool-todo'
import * as mod from '../../packages/dsh-research-task-runtime/home-presentation-runtime.js'
const until=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await new Promise(r=>setTimeout(r,10))}throw Error('native event timeout')}
export async function presentationRuntimeFixture(){
 const root=await mkdtemp(join(tmpdir(),'home-presentation-runtime-')),cwd=join(root,'研究看板','公司风格演示示例-fixture'),home=join(root,'profile')
 await mkdir(cwd,{recursive:true});await mkdir(home)
 const bytes=await readFile('packages/dsh-research-task-runtime/assets/home-presentation/company-research-briefing.pptx'),sourceBytes=await readFile('packages/dsh-research-task-runtime/assets/home-presentation/source-report.pdf'),metadata=JSON.parse(await readFile('packages/dsh-research-task-runtime/assets/home-presentation/source-metadata.json','utf8'))
 await writeFile(join(home,'research-board-directories.json'),JSON.stringify({fixture:{sessionId:'demo',path:cwd,title:'公司风格演示示例'}}))
 const ctx=new Context(),outside=[],errors=[]
 ctx.on('agent/error',p=>errors.push(p.error?.stack??p.error))
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new TokenMeter(ctx)
 new JsonlSessionPersistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false,writeBatchMaxDelayMs:1})
 new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});todo(ctx,{allowParallelInProgress:false})
 class Outside extends LlmAdapter{async resolveModel(provider,model){return{provider,id:model,name:model,context:{contextWindow:16000},defaultMaxTokens:512}}async *stream(request){outside.push(request);yield{type:'finish',reason:{kind:'stop'}}}}
 ctx.llm.registerAdapter(['outside'],new Outside())
 const create=async id=>(await ctx.agents.create({sessionId:id,meta:{cwd},agentOptions:{provider:'outside',model:'normal',maxTokens:512}})).agent
 const agent=await create('demo'),runtime=mod.createHomePresentationRuntime(ctx,{env:{DSH_HOME:home}})
 const dispose=async()=>{await runtime.dispose();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})}
 const input={sessionId:'demo',cwd,runId:'run-1',fresh:true}
 const message=()=>'/ework-skill-180a6a3f86f8942e 📎 文件：`'+join(cwd,'Vanguard-2026经济与市场展望.pdf')+'` \n'+mod.createHomePresentationBrief(metadata)
 return{ctx,agent,runtime,input,cwd,bytes,sourceBytes,metadata,message,outside,errors,create,until,dispose}
}
