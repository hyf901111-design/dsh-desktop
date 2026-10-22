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
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {requestedMarketVariant,marketVariant} from '../packages/dsh-research-task-runtime/workbench-design-contract.js'

const captured=JSON.parse(readFileSync(new URL('./fixtures/workbench-source-profile-missing.json',import.meta.url),'utf8'))
const input=()=>structuredClone(captured.first),cleanups=[]
const validate=value=>validateWorkbench({...value,requestId:value.requestId??'owned-profile-fixture'})
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup();vi.unstubAllEnvs()})

async function fixture({publicTool=true,human=captured.first.panels[0].prompt}={}){
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

it('proves the actual market request has typed columns but no existing market variant default',()=>{
 const p=input().panels[0]
 expect(p.type).toBe('market');expect(requestedMarketVariant(p.prompt)).toBeUndefined();expect(marketVariant(p)).toBeNull()
 expect(p.prompt).toContain('key/label列声明')
 expect(captured.firstError).toContain('missing required property "panels[0].publicData.profile"')
})

it('accepts the exact owned first request through real SDK validation and stays idempotent',async()=>{
 const f=await fixture(),args=input(),before=JSON.stringify(args),first=await f.invoke(args)
 expect(first,JSON.stringify(first)).toMatchObject({isError:false,value:{status:'accepted',templateIds:['table']}})
 expect(JSON.stringify(args)).toBe(before)
 expect((await f.invoke(structuredClone(args))).value).toEqual(first.value)
 expect(f.tasks).toHaveLength(1);expect(f.startBatch).toHaveBeenCalledOnce();expect(f.query).not.toHaveBeenCalled()
 expect(await f.plans()).toHaveLength(1)
 for(const text of ['300308','300502','601138','code','name','price','change_pct','volume','amount','quote_time','手','元','静态','"profile":"quotes-table"',JSON.stringify(args.panels[0].publicData.requests[0].parameters_json)])expect(f.tasks[0].prompt).toContain(text)
 expect(validate(args)).toEqual(validate(captured.corrected))
})

it.each(['table-type','declared-market-table','null-layout'])('infers only an explicit table display recipe: %s',kind=>{
 const args=input(),p=args.panels[0]
 if(kind==='table-type'){p.type='table';p.prompt='腾讯报价，按代码与价格两列显示。'}
 if(kind==='declared-market-table')p.prompt='market.table；腾讯报价静态表。'
 if(kind==='null-layout')p.artifact={version:1,type:'table',columns:[{key:'price',label:'价格（元）'},{key:'code',label:'代码'}],rows:[]}
 const plan=validate(args)
 if(plan.panels[0].publicData)expect(plan.panels[0].publicData.profile).toBe('quotes-table')
 else expect(plan.panels[0].prompt).toContain('"profile":"quotes-table"')
 expect(validate(plan)).toEqual(plan)
})

it.each([false,true])('carries any declared column to an ordinary source task without a fixed-field allowlist (explicit profile=%s)',async explicit=>{
 const args=input(),p=args.panels[0]
 p.prompt='调用腾讯行情获取三家公司报价，使用明确key/label列声明和columns列结构：code(证券代码)、reportDate(财报发布日期)、customValue(自定义值,万元)。缺失列必须保留并标明来源未提供，不编造日期或数值。'
 if(explicit)p.publicData.profile='quotes-table'
 const f=await fixture(),result=await f.invoke(args)
 expect(result,JSON.stringify(result)).toMatchObject({isError:false,value:{templateIds:['table']}})
 expect(f.tasks).toHaveLength(1);expect(f.query).not.toHaveBeenCalled()
 const plan=validate(args),panel=plan.panels[0]
 expect(panel.type).toBe('table');expect(panel.publicData).toBeUndefined();expect(panel.artifact).toBeUndefined()
 for(const content of [p.prompt,'reportDate','财报发布日期','customValue','万元',JSON.stringify(p.publicData.requests[0].parameters_json)])expect(f.tasks[0].prompt).toContain(content)
 expect(validate(plan)).toEqual(plan)
})

it('keeps an unambiguous table recipe without a column declaration on the existing direct source route',()=>{
 const args=input(),p=args.panels[0]
 p.title='腾讯报价';p.prompt='market.table；展示证券代码、名称、最新价。'
 const plan=validate(args),panel=plan.panels[0]
 expect(panel).toMatchObject({type:'market',publicData:{profile:'quotes-table',intervalMinutes:0,requests:p.publicData.requests}})
 expect(panel.prompt).toContain(p.prompt);expect(panel.prompt).not.toContain('宿主来源能力校正');expect(validate(plan)).toEqual(plan)
})

it.each(['ambiguous','metrics','mixed-renderers','unknown-renderer','unknown-source','mixed-source','unknown-param','bad-symbols','null-profile','empty-profile','undefined-profile','unknown-metadata'])('keeps an invalid or ambiguous first request rejected at real SDK/host gates: %s',async kind=>{
 const args=input(),p=args.panels[0],data=p.publicData
 if(kind==='ambiguous')p.prompt='展示三只股票的最新行情，合理组织。'
 if(kind==='metrics')p.prompt='market.metrics；显示指标卡。'
 if(kind==='mixed-renderers')p.prompt='market.table 和 market.metrics 都可以；'+p.prompt
 if(kind==='unknown-renderer')p.prompt='variant: imaginary；'+p.prompt
 if(kind==='unknown-source')data.requests[0].source='sina-news'
 if(kind==='mixed-source')data.requests.push({source:'kraken-ticker',parameters_json:'{"pair":"ETHUSD"}'})
 if(kind==='unknown-param')data.requests[0].parameters_json='{"symbols":["sz300308"],"url":"https://not-authorized.invalid"}'
 if(kind==='bad-symbols')data.requests[0].parameters_json='{"symbols":["guessed300308"]}'
 if(kind==='null-profile')data.profile=null
 if(kind==='empty-profile')data.profile=''
 if(kind==='undefined-profile')data.profile=undefined
 if(kind==='unknown-metadata')data.sourceUrl='https://not-authorized.invalid'
 const before=JSON.stringify(args),f=await fixture(),result=await f.invoke(args)
 expect(result).toMatchObject({isError:true});expect(f.tasks).toEqual([]);expect(await f.plans()).toEqual([]);expect(f.query).not.toHaveBeenCalled();expect(JSON.stringify(args)).toBe(before)
})

it('does not replace an explicit undefined key or a conflicting flattened profile',()=>{
 const args=input(),p=args.panels[0];p.publicData.profile=undefined
 expect(Object.hasOwn(p.publicData,'profile')).toBe(true);expect(()=>validate(args)).toThrow()
 delete p.publicData.profile;p.profile='quotes-metrics';p.requests=structuredClone(p.publicData.requests)
 expect(()=>validate(args)).toThrow(/冲突/u)
})

it.each(['no-tool','no-network','source-only-records','simulated','actual-zero','actual-date'])('does not turn recipe recovery into new authority or discard data: %s',async kind=>{
 const args=input(),p=args.panels[0]
 if(kind==='simulated')args.dataMode='simulated'
 if(kind==='actual-zero'||kind==='actual-date')p.artifact={version:1,type:'table',columns:['代码','值'],rows:[['300308',kind==='actual-zero'?0:'2026-10-22 16:14:45']]}
 const human=kind==='no-network'?'禁止联网，仅整理已提供资料。':kind==='source-only-records'?'只用已有记录，不能新取数。':captured.first.panels[0].prompt
 const f=await fixture({publicTool:kind!=='no-tool',human}),result=await f.invoke(args)
 expect(result).toMatchObject({isError:true});expect(f.tasks).toEqual([]);expect(await f.plans()).toEqual([]);expect(f.query).not.toHaveBeenCalled()
})

it('leaves an explicitly supplied supported profile unchanged and still rejects duplicate-input conflicts',()=>{
 expect(validate(captured.corrected)).toEqual(validate(input()))
 const args=structuredClone(captured.corrected),p=args.panels[0];p.profile='quotes-metrics';p.requests=structuredClone(p.publicData.requests)
 expect(()=>validate(args)).toThrow(/冲突/u)
})

// The display declaration never changes the human's independently captured
// source policy; the generated task still carries the real provider constraint.
it('retains a plugin-only human source restriction independently of inferred table layout',async()=>{
 const f=await fixture({human:'创建报价工作台，行情报价只能用DataYes取数，不可使用免费源替代。'})
 const result=await f.invoke(input())
 expect(result,JSON.stringify(result)).toMatchObject({isError:false})
 expect(f.tasks).toHaveLength(1)
 expect(f.tasks[0].context.panels[0].sourcePolicy).toMatchObject({pluginRequired:true,pluginProhibited:false})
 expect(f.query).not.toHaveBeenCalled()
})

it('keeps an ambiguous human source restriction rejected before starting a task',async()=>{
 const f=await fixture({human:'创建报价工作台，本卡只能用DataYes取数。'})
 const result=await f.invoke(input())
 expect(result).toMatchObject({isError:true,error:{message:expect.stringContaining('人类来源约束')}})
 expect(f.tasks).toHaveLength(0);expect(await f.plans()).toEqual([]);expect(f.query).not.toHaveBeenCalled()
})
