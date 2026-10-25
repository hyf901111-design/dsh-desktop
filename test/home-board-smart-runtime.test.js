import {mkdtemp,mkdir,writeFile,rm,realpath} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Session} from '@deepseek-ai/dsh-session'
import {afterEach,expect,it,vi} from 'vitest'
import {ResearchTaskRuntime,JsonResearchTaskStorage} from '../packages/dsh-research-task-runtime/index.js'
import {createHomeBoardSmartRuntime} from '../packages/dsh-research-task-runtime/home-board-smart-runtime.js'
import {HOME_BOARD_SMART_PROMPT,HOME_BOARD_SMART_ARTIFACT} from '../packages/dsh-research-task-runtime/home-board-smart-contract.js'
const releases=[]
afterEach(async()=>{for(const off of releases.splice(0))await off()})
async function fixture(title='自选行情示例看板（演示案例）'){
 const root=await realpath(await mkdtemp(join(tmpdir(),'home-board-smart-'))),cwd=join(root,'board');await mkdir(cwd)
 await writeFile(join(root,'research-board-directories.json'),JSON.stringify({board:{sessionId:'board-session',path:cwd,title}}))
 const session=Session.create('board-session',undefined,{version:0,id:'board-session',createdAt:Date.now(),cwd}),agent={session,status:'idle'},ctx={agents:{get:id=>id===session.id?agent:undefined}},outside=vi.fn(()=>{throw Error('Must not call a model')})
 const storage=new JsonResearchTaskStorage(join(root,'tasks.json')),tasks=new ResearchTaskRuntime({adapter:{start:outside},storage}),guide=createHomeBoardSmartRuntime(ctx,tasks,{env:{DSH_HOME:root}})
 releases.push(async()=>{guide.dispose();await tasks.dispose();await rm(root,{recursive:true,force:true})})
 return{root,cwd,session,agent,ctx,outside,storage,tasks,guide,input:{sessionId:session.id,runId:'smart-run',canvasNodeId:'smart-node',prompt:HOME_BOARD_SMART_PROMPT}}
}
it.each(['自选行情示例看板','自选行情示例看板 · 练习副本','自选行情示例看板（演示案例）','自选行情示例看板 · 练习副本（演示案例）'])('generates the native prepared table in the registered board session titled %s',async title=>{
 const f=await fixture(title),task=await f.guide.generate(f.input)
 expect(task.state).toBe('completed')
 expect(JSON.parse(task.finalOutput)).toEqual(HOME_BOARD_SMART_ARTIFACT)
 expect(f.tasks.tasks.size).toBe(1)
 expect(f.session.events).toEqual([])
})
it('refuses a renamed board session before creating a task',async()=>{
 const f=await fixture('自选行情示例看板（演示案例） · 练习副本')
 await expect(f.guide.generate(f.input)).rejects.toThrow('尚未登记')
 expect(f.tasks.tasks.size).toBe(0)
 expect(f.session.events).toEqual([])
})
it('creates one durable native prepared table and restores its task without invoking a model',async()=>{
 const f=await fixture(),[first,duplicate]=await Promise.all([f.guide.generate(f.input),f.guide.generate(f.input)])
 expect(duplicate.taskId).toBe(first.taskId);expect(first.state).toBe('completed');expect(JSON.parse(first.finalOutput)).toEqual(HOME_BOARD_SMART_ARTIFACT)
 expect(JSON.parse(first.finalOutput).rows.map(row=>row[0])).toEqual(['苹果（AAPL）','长江电力（600900）','工业富联（601138）','五粮液（000858）','徐工机械（000425）'])
 const restored=new ResearchTaskRuntime({adapter:{start:f.outside},storage:f.storage});await restored.restore()
 try{const resumed=createHomeBoardSmartRuntime(f.ctx,restored,{env:{DSH_HOME:f.root}});expect((await resumed.generate(f.input)).taskId).toBe(first.taskId);resumed.dispose();expect(restored.tasks.size).toBe(1)}finally{await restored.dispose()}
 expect(f.outside).not.toHaveBeenCalled();expect(f.session.events).toEqual([])
})
it('rejects ordinary sessions, changed instructions and cancellation before creating any task',async()=>{
 const f=await fixture(),abort=new AbortController();abort.abort()
 await expect(f.guide.generate(f.input,abort.signal)).rejects.toMatchObject({name:'AbortError'})
 for(const input of [{...f.input,sessionId:'other'},{...f.input,prompt:'查询实时股价'},{...f.input,artifact:HOME_BOARD_SMART_ARTIFACT}])await expect(f.guide.generate(input)).rejects.toThrow()
 f.agent.status='running';await expect(f.guide.generate(f.input)).rejects.toThrow();f.agent.status='idle'
 f.session.append('user/message',{id:'ordinary',role:'user',source:{kind:'user'},content:[{type:'text',text:'普通用户需求'}]},{surfaceOp:'append'});await expect(f.guide.generate(f.input)).rejects.toThrow()
 expect(f.tasks.tasks.size).toBe(0);expect(f.outside).not.toHaveBeenCalled()
})
