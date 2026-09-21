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
it.each([false,true])('updates only the bound component, detects concurrent changes=%s and never prompts a global session',async changed=>{
 const dir=await mkdtemp(join(tmpdir(),'component-task-'))
 try{
 const store=new TaskStore(join(dir,'tasks.json'))
 const task=await store.save({title:'更新',prompt:'更新指标',workspaceId:'',component:{sessionId:'canvas',nodeId:'a',title:'指标',boardTitle:'画板'},schedule:{frequency:'daily',time:'09:00',timezone:'Asia/Shanghai',weekday:1,date:'2026-09-25'},notification:'always'})
 let spec={version:1,type:'markdown',title:'指标',content:'旧内容'}
 const canvas=vi.fn(async(_target,method,args:any)=>{
   if(method==='inspect')return {revision:'current',writable:true,nodes:[{id:'a',kind:'generated-container',capabilities:{fields:{containerSpec:{}}},content:{containerSpec:spec}}]}
   expect(args.changes).toHaveLength(1);expect(args.changes[0].id).toBe('a');spec=args.changes[0].fields.containerSpec
 })
 const runtime=vi.fn(async(method,args)=>method==='start'?{status:'running'}:{status:'completed',text:JSON.stringify({...spec,content:'新内容'})})
 const rpc=vi.fn();const notify=vi.fn()
 const runner=new TaskRunner(store,rpc,()=>true,notify,Date.now,new ScheduledComponentExecutor(store,canvas,runtime))
 await runner.run(task.id)
 expect(store.list()[0]!.runs[0]!.status).toBe('running')
 if(changed)spec={...spec,content:'用户修改'}
 await runner.tick()
 expect(rpc).not.toHaveBeenCalled()
 expect(store.list()[0]!.runs[0]!.status).toBe(changed?'failed':'success')
 expect(spec.content).toBe(changed?'用户修改':'新内容')
 expect(notify).toHaveBeenCalledOnce()
 }finally{await rm(dir,{recursive:true,force:true})}
})
