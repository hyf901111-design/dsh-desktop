import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
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
import {homeReportAssetsFixture} from './home-report-assets.js'
import * as mod from '../../packages/dsh-research-task-runtime/home-report-runtime.js'
import {createHomeReportBrief} from '../../packages/dsh-research-task-runtime/home-report-contract.js'

export async function reportRuntimeFixture(){
 const assets=await homeReportAssetsFixture(),root=await mkdtemp(join(tmpdir(),'home-report-runtime-')),cwd=join(root,'研究报告示例-fixture'),home=join(root,'profile')
 await mkdir(cwd);await mkdir(home)
 await writeFile(join(home,'research-board-directories.json'),JSON.stringify({report:{sessionId:'report-demo',path:cwd,title:'研究报告示例'}}))
 const ctx=new Context(),outside=[],errors=[]
 ctx.on('agent/error',event=>errors.push(event.error?.stack??event.error))
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new TokenMeter(ctx)
 new JsonlSessionPersistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false,writeBatchMaxDelayMs:1})
 new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1});todo(ctx,{allowParallelInProgress:false})
 class Outside extends LlmAdapter{async resolveModel(provider,model){return{provider,id:model,name:model,context:{contextWindow:16000},defaultMaxTokens:512}}async *stream(request){outside.push(request);yield{type:'finish',reason:{kind:'stop'}}}}
 ctx.llm.registerAdapter(['outside'],new Outside())
 const create=async id=>(await ctx.agents.create({sessionId:id,meta:{cwd},agentOptions:{provider:'outside',model:'normal',maxTokens:512}})).agent
 const agent=await create('report-demo'),runtime=mod.createHomeReportRuntime(ctx,{env:{DSH_HOME:home},assetsDirectory:assets.directory})
 const dispose=async()=>{await runtime.dispose();await ctx.fiber.dispose();await Promise.all([rm(root,{recursive:true,force:true}),rm(assets.directory,{recursive:true,force:true})])}
 const input={sessionId:'report-demo',cwd,runId:'report-run',fresh:true}
 const wire='ework-skill-778d85796a6c426b'
 const message=()=>'/'+wire+' '+createHomeReportBrief(assets.metadata)
 return{...assets,ctx,agent,runtime,input,cwd,home,root,message,outside,errors,create,dispose}
}
