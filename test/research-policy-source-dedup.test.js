import {afterEach,expect,it,vi} from 'vitest'
import {writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {ResearchTaskRuntime,buildResearchTaskPrompt,createSubagentAdapter,createSharedBoardExecutor} from '../packages/dsh-research-task-runtime/index.js'
import {freeDataInstruction,POLICY_SOURCE_GUIDANCE} from '../packages/dsh-research-task-runtime/free-data-skill.js'

const policy=POLICY_SOURCE_GUIDANCE
const online='创建一个政策法规交互网页，检索最新官方通知并按机构筛选。'
const occurrences=text=>text.split(policy).length-1
const sha256=text=>createHash('sha256').update(text).digest('hex')
const base={parentSessionId:'policy-parent',canvasNodeId:'policy-component',kind:'container',prompt:online}
const cleanup=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();vi.unstubAllEnvs()})
function fixture({data=true,plugin=false,outputs}={}){
 const parent={id:base.parentSessionId,session:{events:[]}},agents=new Map([[parent.id,parent]]),sent=[]
 const schemas=['public_data_query','web_search','web_fetch'].map(name=>({name}))
 if(plugin)schemas.push({name:'ework__t_abcdef',description:'通联 DataYes financial business source'})
 const ctx={agents,on:()=>()=>{},tools:{schemas:()=>schemas},get:name=>name==='eworkIntegrations'?{sync:async()=>{},snapshot:{skills:[{id:'builtin:ework-workbench-components',enabled:true},{id:'builtin:ework-free-data-sources',enabled:data}],tools:[]}}:undefined,
  subagents:{start:vi.fn(async(_provider,request)=>{
   sent.push(request)
   if(!outputs)throw Error('AUDIT_CAPTURE_ONLY')
   const id='policy-child-'+sent.length,child={id,session:{id,events:[]}};agents.set(id,child)
   return{id,localAgent:child,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:outputs[sent.length-1]??outputs.at(-1)}]}),dispose:async()=>{}}
  })}}
 return{ctx,sent,text:()=>sent.at(-1).prompt.filter(x=>x.type==='text').map(x=>x.text).join('\n')}
}
async function throughRuntime({prompt=online,hostContext,...options}={}){
 const f=fixture(options),adapter=createSubagentAdapter(f.ctx),runtime=new ResearchTaskRuntime({adapter,retryDelayMs:0,createId:()=>base.canvasNodeId,storage:{load:async()=>undefined,save:async()=>{}}})
 cleanup.push(()=>runtime.dispose())
 await runtime.start({...base,prompt},hostContext);await runtime.tasks.get(base.canvasNodeId).runPromise
 return f
}
it('sends one canonical source policy through the actual Research runtime builder and adapter primary request',async()=>{
 const f=await throughRuntime();expect(f.sent).toHaveLength(1)
 const text=f.text(),measurement={unit:'UTF-16 code units / UTF-8 bytes',policyChars:policy.length,policyBytes:Buffer.byteLength(policy),copies:occurrences(text),assembledChars:text.length,assembledBytes:Buffer.byteLength(text),nonPolicyTextSha256:sha256(text.split(policy).join('')),defaultFreeDataSha256:sha256(freeDataInstruction()),toolFilter:f.sent[0].toolFilter,sample:'known generic Research primary native-spawn prompt; no model invoked'}
 if(process.env.SHERLOCK_PROMPT_DEDUP_MEASUREMENT)writeFileSync(process.env.SHERLOCK_PROMPT_DEDUP_MEASUREMENT,JSON.stringify(measurement,null,2))
 expect(occurrences(text)).toBe(1)
 expect(text).toContain(online)
 expect(f.sent[0].toolFilter.allow).toEqual(['public_data_query','web_search','web_fetch'])
})
it('keeps exported freeDataInstruction default intact while the explicit canonical builder has one copy',()=>{
 const standalone=freeDataInstruction()
 expect(occurrences(standalone)).toBe(1)
 expect(freeDataInstruction(undefined,{includePolicySourceGuidance:true})).toBe(standalone)
 expect(freeDataInstruction(undefined,{includePolicySourceGuidance:false})).toBe(standalone.replace(policy,''))
 expect(standalone).toContain('时点缺失写未知，获取时间不等于报价时间')
 expect(occurrences(buildResearchTaskPrompt(base,{canonicalPolicySourceGuidance:true}))).toBe(1)
})
it('does not strip a literal policy in the user query',async()=>{
 const prompt=online+'\n以下是用户要逐字保留的资料：'+policy
 const f=await throughRuntime({prompt});expect(f.text()).toContain(prompt)
 expect(occurrences(f.text())).toBe(2)
})
it('retains source policy when the bundled data skill is disabled',async()=>{
 const f=await throughRuntime({data:false})
 expect(occurrences(f.text())).toBe(1)
 expect(f.text()).not.toContain('【EWork 内置基础数据源】')
})
it('retains offline scope and zero network tools',async()=>{
 const prompt='根据完整离线记录制作政策网页，禁止联网。甲机构2026-10-01通知，乙机构2026-10-02通知。'
 const f=await throughRuntime({prompt})
 expect(f.text()).toContain(prompt)
 expect(occurrences(f.text())).toBe(1)
 expect(f.sent[0].toolFilter.allow).toEqual([])
})
it('does not alter typed initial template policy ownership or tool scope',async()=>{
 const prompt='工作台：政策\n本面板：通知时间线\n优先使用 timeline 类型。检索最新官方政策原文。'
 const f=await throughRuntime({prompt})
 expect(f.text()).toContain('唯一交付格式')
 // The existing typed entry is deliberately unchanged by this generic fix.
 expect(occurrences(f.text())).toBe(2)
 expect(f.sent[0].toolFilter.allow).toEqual(['public_data_query','web_search','web_fetch'])
})
it('revokes generic producer ownership if the adapter rebuilds a typed initial request',async()=>{
 const f=fixture(),adapter=createSubagentAdapter(f.ctx);cleanup.push(()=>adapter.dispose())
 const query='工作台：政策\n本面板：通知时间线\n优先使用 timeline 类型。检索最新官方政策原文。'
 const prompt=buildResearchTaskPrompt(base,{canonicalPolicySourceGuidance:true})
 await expect(adapter.start({parentSessionId:base.parentSessionId,kind:'container',query,prompt,policySourceGuidanceIncluded:true,signal:new AbortController().signal})).rejects.toThrow('AUDIT_CAPTURE_ONLY')
 expect(f.text()).toContain('唯一交付格式')
 expect(occurrences(f.text())).toBe(2)
 expect(f.sent[0].toolFilter.allow).toEqual(['public_data_query','web_search','web_fetch'])
})
it('keeps explicit plugin source guidance and authorized plugin tool when generic producer owns the policy',async()=>{
 const prompt='创建一个财务政策交互网页，使用通联DataYes财务与估值数据，并检索官方政策。'
 const f=await throughRuntime({prompt,plugin:true})
 expect(f.text()).toContain('通联')
 expect(f.sent[0].toolFilter.allow).toContain('ework__t_abcdef')
 expect(occurrences(f.text())).toBe(1)
})
it('preserves independent adapter caller contracts instead of searching their arbitrary text for policy ownership',async()=>{
 const f=fixture(),adapter=createSubagentAdapter(f.ctx);cleanup.push(()=>adapter.dispose())
 const evidence='UNTRUSTED_EVIDENCE_BEGIN\n'+policy+'\nUNTRUSTED_EVIDENCE_END'
 await expect(adapter.start({parentSessionId:base.parentSessionId,kind:'container',query:online,prompt:evidence,signal:new AbortController().signal})).rejects.toThrow('AUDIT_CAPTURE_ONLY')
 expect(f.text()).toContain(evidence)
 expect(occurrences(f.text())).toBe(3) // one user copy, existing free-data + adapter contracts
})
it('retains the generic producer and previous output in a repair request without a second wrapper',async()=>{
 const final=JSON.stringify({version:1,type:'markdown',title:'政策说明',content:'已核对的资料。'})
 const f=await throughRuntime({outputs:['PUBLIC_PREVIOUS_OUTPUT_NOT_JSON',final]})
 expect(f.sent).toHaveLength(2)
 const repair=f.text();expect(repair).toContain('PUBLIC_PREVIOUS_OUTPUT_NOT_JSON')
 expect(repair).toContain(online)
 expect(occurrences(repair)).toBe(1)
 expect(repair.split('【EWork 内置基础数据源】')).toHaveLength(2)
 expect(f.sent[1].toolFilter.allow).toEqual([])
})
it('keeps the shared structured producer canonical when its generic prompt is retained',async()=>{
 const f=fixture(),executor=createSharedBoardExecutor(f.ctx);cleanup.push(()=>executor.dispose())
 await expect(executor.execute({sessionId:base.parentSessionId,kind:'container',prompt:online,files:[]},new AbortController().signal)).rejects.toThrow('AUDIT_CAPTURE_ONLY')
 expect(f.sent).toHaveLength(1)
 expect(occurrences(f.text())).toBe(1)
 expect(f.text()).toContain(online)
})
it('keeps source-only selected creation outside the online producer contract',async()=>{
 const f=fixture(),adapter=createSubagentAdapter(f.ctx),runtime=new ResearchTaskRuntime({adapter,retryDelayMs:0,createId:()=>base.canvasNodeId,storage:{load:async()=>undefined,save:async()=>{}}})
 cleanup.push(()=>runtime.dispose())
 const sources=[{id:'selected-source',type:'artifact',title:'原始通知',text:'仅授权这段离线资料：'+policy}]
 await runtime.start({...base,kind:'create',prompt:'整理所选资料为简短说明，不联网。',sources})
 await runtime.tasks.get(base.canvasNodeId).runPromise
 expect(f.sent).toHaveLength(1)
 expect(f.text()).toContain(sources[0].text)
 expect(f.text()).toContain('不得尝试访问外部网页，不提供额外搜索权限')
 expect(occurrences(f.text())).toBe(1) // this is the selected source, not a host policy
 expect(f.sent[0].toolFilter.allow).toEqual([])
})
