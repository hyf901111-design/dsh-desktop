import {it,expect,vi} from 'vitest'
import {ScheduledComponentExecutor} from '../src/main/scheduled/component-executor'
import {TaskRunner} from '../src/main/scheduled/task-runner'
import {TaskStore} from '../src/main/scheduled/task-store'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readFileSync} from 'node:fs'
import {Script} from 'node:vm'
// @ts-expect-error JavaScript patch module
import {patchComponentScheduledTasks} from '../scripts/lib/component-scheduled-tasks.mjs'
it('patches the real client, parses, and can be repeated without duplicate entries',()=>{
 const source=readFileSync('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js','utf8')
 const result=patchComponentScheduledTasks(source)
 new Script(result)
 expect(patchComponentScheduledTasks(result)).toBe(result)
 expect(result).toContain('data-component-schedule-open')
 expect(result).toContain('data-component-schedule-clock')
})
it.each([false,true])('refreshes bound data without a model, reports error=%s',async failed=>{
 const dir=await mkdtemp(join(tmpdir(),'component-task-'))
 try{
 const store=new TaskStore(join(dir,'tasks.json'))
 const task=await store.save({title:'更新',prompt:'更新指标',workspaceId:'',component:{sessionId:'canvas',nodeId:'a',title:'指标',boardTitle:'画板'},schedule:{frequency:'daily',time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-25'},notification:'always'})
 const canvas=vi.fn(async()=>({revision:'r',writable:true,nodes:[{id:'a',kind:'generated-container',capabilities:{fields:{containerSpec:{}}},content:{containerSpec:{type:'html',html:'template'}}}]}))
 const refresh=vi.fn(async target=>{expect(target.nodeId).toBe('a');return failed?{status:'error',error:'接口不可用'}:{status:'unchanged'}})
 const rpc=vi.fn(),notify=vi.fn()
 const runner=new TaskRunner(store,rpc,()=>true,notify,Date.now,new ScheduledComponentExecutor(store,canvas,refresh))
 await runner.run(task.id);await runner.tick()
 expect(rpc).not.toHaveBeenCalled();expect(refresh).toHaveBeenCalledOnce()
 expect(store.list()[0]!.runs[0]!.status).toBe(failed?'failed':'success')
 expect(notify).toHaveBeenCalledOnce()
 }finally{await rm(dir,{recursive:true,force:true})}
})
it('keeps ambiguous canvas timeouts recoverable and reconciles without redispatch',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'component-timeout-'))
 try{
 const store=new TaskStore(join(dir,'tasks.json'))
 const task=await store.save({title:'更新',prompt:'更新指标',workspaceId:'',component:{sessionId:'canvas',nodeId:'a',title:'指标',boardTitle:'画板'},schedule:{frequency:'daily',time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-25'},notification:'always'})
 const executor={start:vi.fn(async()=>{}),inspect:vi.fn().mockRejectedValueOnce(Error('画布操作响应超时。请先查看当前状态')).mockResolvedValueOnce({status:'success'})}
 const runner=new TaskRunner(store,vi.fn(),()=>true,vi.fn(),Date.now,executor)
 await runner.run(task.id);await runner.tick()
 expect(store.list()[0]!.runs[0]!.status).toBe('running')
 await runner.tick()
 expect(store.list()[0]!.runs[0]!.status).toBe('success')
 expect(executor.start).toHaveBeenCalledOnce()
 }finally{await rm(dir,{recursive:true,force:true})}
})
