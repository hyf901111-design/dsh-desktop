import {afterEach,expect,it} from 'vitest'
import {Context} from '@deepseek-ai/cordis'
import {SessionStore} from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import Commands from '@deepseek-ai/dsh-commands'
import Projections from '@deepseek-ai/dsh-session-projection'
import {createToolResultMessage} from '@deepseek-ai/dsh-llm'
import {mkdtemp,readFile,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
const {patchPlanPendingReplay,stripPlanPendingReplay}=createRequire(import.meta.url)('../scripts/lib/plan-mode-pending-replay.mjs')

const cleanup=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
const signal=()=>new AbortController().signal
async function fixture(seed,{baseline=false}={}){
 const dir=await mkdtemp(join(tmpdir(),'plan-replay-sdk-'));cleanup.push(()=>rm(dir,{recursive:true,force:true}))
 await symlink(join(process.cwd(),'node_modules'),join(dir,'node_modules'))
 const original=stripPlanPendingReplay(await readFile('node_modules/@deepseek-ai/dsh-plan-mode/lib/index.js','utf8'))
 await writeFile(join(dir,'plan.mjs'),baseline?original:patchPlanPendingReplay(original))
 const PlanMode=(await import(pathToFileURL(join(dir,'plan.mjs')).href)).default
 const ctx=new Context();new SessionStore(ctx);new SystemPrompt(ctx,{});new ToolRuntime(ctx);new Commands(ctx);new Projections(ctx)
 const controller=new PlanMode(ctx,{section:'REAL_PLAN_POLICY'})
 await new Promise(resolve=>setImmediate(resolve))
 const session=ctx.sessions.create('plan-replay',{seed,meta:{cwd:process.cwd()}})
 const steered=[],injected=[]
 const agent={id:session.id,ctx,session,inject(message){injected.push(message)},steer(message){steered.push(message)}}
 cleanup.push(()=>ctx.fiber.dispose())
 return {ctx,controller,session,agent,steered,injected,command:(line)=>ctx.commands.execute(agent,line,signal()),projection:()=>ctx.sessionProjections.snapshot(session).values.plan,policy:async()=>((await ctx.systemPrompt.assemble({agent,signal:signal()})).sections.find(s=>s.name==='plan:policy')?.text??''),preStep:(decision={kind:'enter',messages:[]},abortSignal=signal())=>ctx.waterfall('agent/pre-step',{agent,signal:abortSignal},async()=>decision)}
}
it('keeps an idle explicit /plan immediate despite command/run being written before the handler',async()=>{
 const f=await fixture();await f.command('/plan')
 expect(f.controller.get(f.agent)).toEqual({active:true})
 expect(f.projection()).toEqual({active:true,pending:false})
 expect(await f.policy()).toBe('REAL_PLAN_POLICY')
})
it('restores a running durable /plan selection in a new session object and commits it only at an accepted next step',async()=>{
 const live=await fixture();live.session.append('turn/start',{turn:1});await live.command('/plan')
 expect(live.controller.get(live.agent)).toEqual({active:false,pending:true})
 const cold=await fixture(structuredClone([...live.session.events]))
 expect(cold.projection()).toEqual({active:false,pending:true})
 expect(cold.controller.get(cold.agent)).toEqual({active:false,pending:true})
 expect(await cold.policy()).toBe('REAL_PLAN_POLICY')
 await cold.preStep()
 expect(cold.controller.get(cold.agent)).toEqual({active:true})
 expect(cold.projection()).toEqual({active:true,pending:false})
})

it('retains the unmodified rc7 SDK failure as a real-controller baseline rather than faking a fixed projection',async()=>{
 const live=await fixture(undefined,{baseline:true});live.session.append('turn/start',{turn:1});await live.command('/plan')
 const cold=await fixture(structuredClone([...live.session.events]),{baseline:true})
 expect(cold.projection()).toEqual({active:false,pending:true})
 expect(cold.controller.get(cold.agent)).toEqual({active:false})
 expect(await cold.policy()).toBe('')
})
it('does not start work or consume a selected mode when Stop ends the same live session',async()=>{
 const f=await fixture();f.session.append('turn/start',{turn:1});await f.command('/plan')
 f.session.append('turn/end',{turn:1,reason:{kind:'aborted',reason:{kind:'user'}}})
 const before=[...f.session.events]
 expect(f.controller.get(f.agent)).toEqual({active:false,pending:true})
 expect(await f.policy()).toBe('REAL_PLAN_POLICY')
 expect(f.session.events).toEqual(before);expect(f.steered).toEqual([])
 await f.preStep({kind:'reject'})
 expect(f.session.events).toEqual(before)
 await f.preStep(undefined,AbortSignal.abort())
 expect(f.session.events).toEqual(before)
 f.session.append('turn/start',{turn:2});await f.preStep()
 expect(f.controller.get(f.agent)).toEqual({active:true})
 expect(f.projection()).toEqual({active:true,pending:false})
})
it('uses the last /plan off and committed plan/mode to clear cold pending selections',async()=>{
 const live=await fixture();live.session.append('turn/start',{turn:1});await live.command('/plan')
 const cold=await fixture(structuredClone([...live.session.events]))
 await cold.command('/plan off')
 expect(cold.controller.get(cold.agent)).toEqual({active:false})
 expect(cold.projection()).toEqual({active:false,pending:false})
 expect(await cold.policy()).toBe('')
 await cold.preStep();expect(cold.controller.get(cold.agent)).toEqual({active:false})
 const again=await fixture(structuredClone([...live.session.events]));expect(again.controller.get(again.agent).pending).toBe(true)
 again.session.append('plan/mode',{active:false})
 expect(again.controller.get(again.agent)).toEqual({active:false})
 expect(again.projection()).toEqual({active:false,pending:false})
})
it('keeps idle plan exit immediate and replays committed state without restoring obsolete pending commands',async()=>{
 const f=await fixture();await f.command('/plan');await f.command('/plan off')
 const cold=await fixture(structuredClone([...f.session.events]))
 expect(cold.controller.get(cold.agent)).toEqual({active:false})
 expect(cold.projection()).toEqual({active:false,pending:false})
 expect(await cold.policy()).toBe('')
})
async function review(f,{selected=['Approve'],custom}={}){
 f.ctx.provide('userQuestions',{ask:async()=>({answers:[{id:'plan-review',selected,...custom===undefined?{}:{custom}}]})})
 return f.ctx.tools.execute({name:'exit_plan_mode',arguments:{plan:'# 计划\n核对来源，再请求用户确认。'},agent:f.agent,callId:'review-exit',signal:signal()})
}
it('gives the exact approved live exit precedence over replay until its next accepted boundary',async()=>{
 const f=await fixture();await f.command('/plan');f.session.append('turn/start',{turn:1})
 const result=await review(f)
 expect(result.isError).not.toBe(true)
 expect(f.controller.get(f.agent)).toEqual({active:true,pending:false})
 expect(await f.policy()).toBe('')
 await f.preStep()
 expect(f.controller.get(f.agent)).toEqual({active:false})
 expect(f.projection()).toEqual({active:false,pending:false})
})
it.each([{selected:['Keep planning']},{selected:['Approve'],custom:'仍需修改'}])('does not leave Plan after refusal or a nonexact approval (%j)',async answer=>{
 const f=await fixture();await f.command('/plan');f.session.append('turn/start',{turn:1})
 const result=await review(f,answer)
 expect(result.isError).toBe(true)
 expect(f.controller.get(f.agent)).toEqual({active:true})
 expect(await f.policy()).toBe('REAL_PLAN_POLICY')
 const cold=await fixture(structuredClone([...f.session.events]))
 await cold.preStep();expect(cold.controller.get(cold.agent)).toEqual({active:true})
})
it('does not infer an approved exit from tool output after a cold restart before the approved live intent was committed',async()=>{
 const live=await fixture();await live.command('/plan');live.session.append('turn/start',{turn:1});const result=await review(live)
 expect(result.isError).not.toBe(true)
 const call=live.session.append('tool/call',{turn:1,step:1,callId:'review-exit',name:'exit_plan_mode',arguments:{plan:'# 计划'}})
 live.session.append('tool/result',{turn:1,step:1,message:createToolResultMessage({callId:'review-exit',isError:false,content:[{type:'text',text:'{"approved":true}'}]})},{surfaceOp:'append',sourceEventSeqs:[call.seq]})
 const cold=await fixture(structuredClone([...live.session.events]))
 expect(cold.controller.get(cold.agent)).toEqual({active:true})
 expect(await cold.policy()).toBe('REAL_PLAN_POLICY')
 await cold.preStep();expect(cold.projection()).toEqual({active:true,pending:false})
})
it('does not treat user prose or unrelated commands as a durable Plan selection',async()=>{
 const f=await fixture()
 f.session.append('command/run',{commandId:'unrelated',name:'other',args:'plan',source:{kind:'user'}})
 f.session.append('command/run',{commandId:'hidden-input',name:'plan',source:{kind:'user'}})
 expect(f.controller.get(f.agent)).toEqual({active:false})
 expect(f.projection()).toEqual({active:false,pending:false})
 expect(await f.policy()).toBe('')
})
it('strictly patches the actual SDK entry twice, inversely restores it, and rejects partial or unknown owners',async()=>{
 const source=stripPlanPendingReplay(await readFile('node_modules/@deepseek-ai/dsh-plan-mode/lib/index.js','utf8')),patched=patchPlanPendingReplay(source)
 expect(patchPlanPendingReplay(patched)).toBe(patched)
 expect(stripPlanPendingReplay(patched)).toBe(source)
 expect(()=>patchPlanPendingReplay(source+'\n// unknown drift')).toThrow(/drift/)
 expect(()=>patchPlanPendingReplay(patched.replace('apply: applyLoggedPlanSelection','apply: state => state'))).toThrow(/drift/)
 expect(()=>patchPlanPendingReplay(patched.replace('/* sherlock:plan-pending-replay:rc7:v1 */',''))).toThrow(/partial/)
 // The original set() ordering and approval implementation remain byte exact.
 const originalSet=source.slice(source.indexOf('\tset(agent, active) {'),source.indexOf('\n\t/** Append one pending selection'))
 expect(patched).toContain(originalSet)
 expect(patched).toContain('this.pendingIntents.set(agent.session, {\n\t\t\t\t\tactive: false,\n\t\t\t\t\tnarrate: false\n\t\t\t\t});')
})
