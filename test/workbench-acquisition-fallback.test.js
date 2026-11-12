import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'

const acquisition=vi.hoisted(()=>({run:vi.fn()}))
vi.mock('../packages/dsh-research-task-runtime/workbench-fund-comparison.js',async importOriginal=>({
 ...await importOriginal(), fundComparisonCount:()=>8, fundComparisonReader:()=>async()=>{},
 acquireFundComparison:(...args)=>acquisition.run(...args),fundComparisonArtifacts:data=>[data]
}))
const clean=[]
beforeEach(()=>{acquisition.run.mockReset()})
afterEach(async()=>{for(const dispose of clean.splice(0).reverse())await dispose()})
const request='给固收投委会搭个纯债基金比较工作台。至少比较8只中长期纯债基金的近一年收益、近半年最大回撤、年化波动率、最新净值和规模，保留管理人、统计区间及来源，便于筛选和排序。'
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'workbench-fallback-'));clean.push(()=>rm(directory,{recursive:true,force:true}))
 const filePath=join(directory,'plans.json');let tool
 const runtime={startBatch:vi.fn(async({panels})=>panels.map((_,i)=>({taskId:'task-'+i})))}
 const ctx={agents:{get:()=>({})},tools:{register:value=>{tool=value;return()=>{}}},webServer:{register:()=>()=>{}}}
 clean.push(await registerWorkbench(ctx,runtime,{filePath}))
 const controller=new AbortController()
 const exec={signal:controller.signal,agent:{session:{id:'fallback-parent',events:[{type:'user/message',data:{id:'request',source:{kind:'user'},content:[{type:'text',text:request}]}}]}}}
 const panels=[['比较明细','table'],['收益分布','chart'],['风险对照','chart'],['净值与规模','table']].map(([title,type])=>({title,type,size:'medium',prompt:title+'，保留共同对象与来源'}))
 return {runtime,controller,exec,panels,run:()=>tool.execute({title:'比较工作台',requestId:'comparison',panels},exec),plans:async()=>JSON.parse(await readFile(filePath,'utf8'))}
}
it('keeps the user plan and gives all panels the same acquired evidence',async()=>{
 const evidence={rows:Array.from({length:8},(_,i)=>({code:String(i),value:i})),source:'confirmed source'}
 acquisition.run.mockResolvedValue(evidence)
 const f=await fixture(),receipt=await f.run(),[plan]=await f.plans()
 expect(receipt.panels).toEqual(f.panels.map(p=>p.title))
 expect(plan.panels.map(p=>p.type)).toEqual(f.panels.map(p=>p.type))
 const [batch,context]=f.runtime.startBatch.mock.calls[0]
 expect(batch.panels).toHaveLength(4)
 expect(context.panels).toHaveLength(4)
 for(const panel of context.panels)expect(JSON.parse(panel.sharedEvidence)).toEqual(evidence)
 expect(plan.ready).toBe(true);expect(plan.panels.every(p=>p.taskId&&!p.error)).toBe(true)
})
it('continues normal component generation when shared acquisition is unavailable',async()=>{
 acquisition.run.mockRejectedValue(Error('source timeout'))
 const f=await fixture(),receipt=await f.run(),[plan]=await f.plans()
 expect(receipt.status).toBe('accepted')
 expect(plan.acquisitionWarning).toBe('source timeout')
 expect(f.runtime.startBatch).toHaveBeenCalledOnce()
 expect(plan.panels).toHaveLength(4)
 expect(plan.panels.every(p=>p.taskId&&!p.error)).toBe(true)
 expect(f.runtime.startBatch.mock.calls[0][1].panels.every(p=>!p.sharedEvidence)).toBe(true)
})
it('reports a planned card as pending until acquisition starts its real task',async()=>{
 let release
 acquisition.run.mockImplementation(()=>new Promise(resolve=>{release=resolve}))
 const f=await fixture(),running=f.run()
 await vi.waitFor(()=>expect(acquisition.run).toHaveBeenCalled(),{timeout:3000})
 const [plan]=await f.plans(),nodeId=plan.panels[0].nodeId
 expect(f.runtime.inspectPendingGeneration('fallback-parent',nodeId)).toMatchObject({pending:true,state:'queued',planId:plan.id})
 expect(f.runtime.inspectPendingGeneration('other-parent',nodeId)).toBeUndefined()
 release({rows:[{code:'confirmed',value:1}]})
 await running
 expect(f.runtime.inspectPendingGeneration('fallback-parent',nodeId)).toBeUndefined()
 expect(f.runtime.startBatch).toHaveBeenCalledOnce()
})
it('finishes cancelled preparation without leaving phantom running panels',async()=>{
 const f=await fixture();acquisition.run.mockImplementation(async()=>{f.controller.abort();throw f.controller.signal.reason})
 await expect(f.run()).rejects.toThrow()
 const [plan]=await f.plans()
 expect(plan.ready).toBe(true)
 expect(plan.panels.every(p=>p.error&&!p.taskId)).toBe(true)
 expect(f.runtime.startBatch).not.toHaveBeenCalled()
})
