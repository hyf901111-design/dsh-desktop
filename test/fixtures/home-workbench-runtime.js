import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import LlmRuntime,{LlmAdapter} from '@deepseek-ai/dsh-llm'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import {createHomeWorkbenchRuntime} from '../../packages/dsh-research-task-runtime/home-workbench-runtime.js'
import {registerWorkbenchExecutionPolicy} from '../../packages/dsh-research-task-runtime/workbench-execution-policy.js'
export async function workbenchRuntimeFixture(){
 const root=await mkdtemp(join(tmpdir(),'home-workbench-runtime-')),cwd=join(root,'白酒研究示例'),home=join(root,'profile');await mkdir(cwd);await mkdir(home)
 await writeFile(join(home,'research-board-directories.json'),JSON.stringify({fixture:{sessionId:'demo',path:cwd,title:'白酒龙头研究工作台（演示案例）'}}))
 const ctx=new Context(),outside=[],errors=[],tasks=[];ctx.on('agent/error',p=>errors.push(p.error?.stack??p.error))
 new SessionStore(ctx);new AgentRegistry(ctx);new LlmRuntime(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new TokenMeter(ctx);new JsonlSessionPersistence(ctx,{root:join(root,'sessions'),compression:'none',packChunks:false,writeBatchMaxDelayMs:1});new AgentLoop(ctx,{agents:[],maxParallelToolCalls:1})
 const disposeTool=ctx.tools.register(defineTool({
  name:'research_workbench_create',description:'Create a research workbench',parameters:{},
  output:{schema:{type:'string'},render:(_args,value)=>[{type:'text',text:value}]},
  execute(){throw Error('Replay must not call the live workbench tool')}
 }))
 const disposePolicy=registerWorkbenchExecutionPolicy(ctx)
 class Outside extends LlmAdapter{async resolveModel(provider,model){return{provider,id:model,name:model,context:{contextWindow:16000},defaultMaxTokens:512}}async *stream(request){outside.push(request);yield{type:'finish',reason:{kind:'stop'}}}}
 ctx.llm.registerAdapter(['outside'],new Outside())
 const {agent}=await ctx.agents.create({sessionId:'demo',meta:{cwd},agentOptions:{provider:'outside',model:'normal',maxTokens:512}})
 const runtime=createHomeWorkbenchRuntime(ctx,{async startPreparedBatch(input){const output=input.panels.map((p,i)=>({...p,parentSessionId:input.parentSessionId,taskId:'prepared-'+tasks.length+'-'+i,state:'completed',createdAt:Date.now(),finalOutput:JSON.stringify(p.artifact)}));tasks.push(...output);return output}},{env:{DSH_HOME:home}})
 return{ctx,agent,runtime,outside,errors,tasks,input:{sessionId:'demo',cwd,runId:'run-1',fresh:true},async dispose(){await runtime.dispose();disposePolicy();disposeTool();await ctx.fiber.dispose();await rm(root,{recursive:true,force:true})}}
}
