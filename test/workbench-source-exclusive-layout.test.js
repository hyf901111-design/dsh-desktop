import {afterEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {Context} from '@deepseek-ai/cordis'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime,{defineTool} from '@deepseek-ai/dsh-tools'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'

const captured=JSON.parse(readFileSync(new URL('./fixtures/workbench-source-layout-exclusive-tencent.json',import.meta.url),'utf8'))
const input=()=>structuredClone(captured.first),cleanups=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();vi.unstubAllEnvs()})

async function fixture({publicTool=true,human=captured.humanRequest}={}){
 vi.stubEnv('SHERLOCK_RESEARCH_CONTEXT_URL','')
 const dir=await mkdtemp(join(tmpdir(),'workbench-profile-sdk-')),ctx=new Context()
 new SystemPrompt(ctx,{});new ToolRuntime(ctx)
 const agent={id:'profile-parent',session:{id:'profile-parent',events:[{type:'user/message',data:{id:'profile-human',source:{kind:'user'},content:[{type:'text',text:human}]}}]},ctx}
 ctx.provide('agents',{get:id=>id===agent.id?agent:undefined});ctx.provide('webServer',{register:()=>()=>{}})
 const query=vi.fn(()=>{throw Error('No real source call is allowed in this fixture')})
 if(publicTool)ctx.tools.register(defineTool({name:'public_data_query',description:'Synthetic source schema only',parameters:{},output:{schema:{type:'object',additionalProperties:false,properties:{}},render:()=>[]},execute:query}))
 const tasks=[],startBatch=vi.fn(async(request,context)=>request.panels.map(p=>{const task={taskId:randomUUID(),...p,context};tasks.push(task);return{taskId:task.taskId}}))
 const file=join(dir,'plans.json'),dispose=await registerWorkbench(ctx,{startBatch},{filePath:file})
 cleanups.push(async()=>{await dispose();await ctx.fiber.dispose();await rm(dir,{recursive:true,force:true})})
 return{ctx,agent,tasks,startBatch,query,plans:async()=>{try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if(e.code==='ENOENT')return[];throw e}},invoke:args=>ctx.tools.execute({name:'research_workbench_create',arguments:args,agent,callId:randomUUID(),signal:new AbortController().signal})}
}

it.each(['first','second'])('accepts the exact owned native %s call through real SDK once without losing source exclusivity',async which=>{
 const f=await fixture(),args=structuredClone(captured[which]),before=JSON.stringify(args),one=await f.invoke(args)
 expect(one,JSON.stringify(one)).toMatchObject({isError:false,value:{status:'accepted',templateIds:['table']}})
 expect((await f.invoke(structuredClone(args))).value).toEqual(one.value)
 expect(f.tasks).toHaveLength(1);expect(f.startBatch).toHaveBeenCalledOnce();expect(f.query).not.toHaveBeenCalled();expect(JSON.stringify(args)).toBe(before)
 const task=f.tasks[0],policy=task.context.panels[0].sourcePolicy
 expect(policy).toMatchObject({pluginRequired:false,pluginProhibited:true,publicSourceRequests:[{operation:'query',source:'tencent-quotes',parameters_json:args.panels[0].publicData.requests[0].parameters_json}]})
 for(const token of ['300308','300502','601138','reportDate','code','name','price','change_pct','volume','amount','quote_time','来源未提供','intervalMinutes','0'])expect(task.prompt).toContain(token)
 const saved=(await f.plans())[0];expect(saved.panels[0].artifact).toBeUndefined();expect(saved.panels[0].publicData).toBeUndefined();expect(saved.input.originalRequest).toBe(captured.humanRequest)
})

it('accepts only pure missing-value layout rows while preserving their full declaration and unverified annotations',async()=>{
 const args=input(),a=args.panels[0].artifact
 a.rows=[['300308','中际旭创'],['300502','新易盛'],['601138','工业富联']].map(([code,name])=>Object.fromEntries(a.columns.map(c=>[c.key,c.key==='code'?code:c.key==='name'?name:c.key==='reportDate'?'来源未提供':null])))
 const f=await fixture(),result=await f.invoke(args)
 expect(result,JSON.stringify(result)).toMatchObject({isError:false})
 expect(f.tasks[0].prompt).toContain('不含业务数据');expect(f.tasks[0].prompt).toContain(a.source);expect(f.tasks[0].prompt).toContain(a.note)
 expect(f.tasks[0].prompt).toMatch(/未经|未验证/);expect(f.query).not.toHaveBeenCalled()
})

it('does not confuse a prohibition on copying Tencent quote dates with a prohibition on the actual source',async()=>{
 const f=await fixture({human:captured.humanRequest+'不得用腾讯行情日期填财务报告期。'}),result=await f.invoke(structuredClone(captured.second))
 expect(result,JSON.stringify(result)).toMatchObject({isError:false});expect(f.tasks[0].context.panels[0].sourcePolicy.publicSourceRequests).toHaveLength(1)
 expect(f.tasks[0].prompt).toContain('不得用腾讯行情日期填财务报告期');expect(f.query).not.toHaveBeenCalled()
})

it.each(['禁止使用腾讯行情作为来源。','不要再用腾讯行情取数。'])('keeps a later explicit human source prohibition rather than retaining the earlier Tencent recipe: %s',async prohibition=>{
 const f=await fixture({human:captured.humanRequest+prohibition}),result=await f.invoke(structuredClone(captured.second))
 expect(result).toMatchObject({isError:true});expect(f.tasks).toEqual([]);expect(await f.plans()).toEqual([]);expect(f.query).not.toHaveBeenCalled()
})

it.each(['zero','negative','numeric-text','date-cell','asOf-date','unknown-meta','observed-note','foreign-source','source-url'])('does not silently discard real observations, dates or unrecognized metadata: %s',async kind=>{
 const args=input(),a=args.panels[0].artifact
 a.rows=[Object.fromEntries(a.columns.map(c=>[c.key,null]))]
 if(kind==='zero')a.rows[0].price=0
 if(kind==='negative')a.rows[0].price=-1
 if(kind==='numeric-text')a.rows[0].price='590.11'
 if(kind==='date-cell')a.rows[0].reportDate='2026-10-22'
 if(kind==='asOf-date')a.asOf='2026-10-22 16:14:45'
 if(kind==='unknown-meta')a.revision=2
 if(kind==='observed-note')a.note='已取得真实数据。'
 if(kind==='foreign-source')a.source='通联DataYes'
 if(kind==='source-url')a.source='腾讯行情 https://unrequested.invalid'
 const f=await fixture(),result=await f.invoke(args)
 expect(result).toMatchObject({isError:true});expect(f.tasks).toEqual([]);expect(await f.plans()).toEqual([]);expect(f.query).not.toHaveBeenCalled()
})

it.each(['no-tool','no-network','mandatory-other','prohibited-tencent','ambiguous','unknown-params','wrong-provider','no-recipe'])('retains independent source permission and ambiguity gates: %s',async kind=>{
 const args=structuredClone(captured.second),p=args.panels[0]
 if(kind==='unknown-params')p.publicData.requests[0].parameters_json='{"symbols":["sz300308"],"url":"https://unrequested.invalid"}'
 if(kind==='wrong-provider')p.publicData.requests[0].source='sina-news'
 if(kind==='no-recipe')delete p.publicData
 const human=captured.humanRequest+(kind==='no-network'?'禁止联网。':kind==='mandatory-other'?'行情卡必须使用DataYes。':kind==='prohibited-tencent'?'禁止使用腾讯行情。':kind==='ambiguous'?'部分卡仅使用腾讯行情。':'')
 const f=await fixture({publicTool:kind!=='no-tool',human}),result=await f.invoke(args)
 expect(result).toMatchObject({isError:true});expect(f.tasks).toEqual([]);expect(await f.plans()).toEqual([]);expect(f.query).not.toHaveBeenCalled()
})
