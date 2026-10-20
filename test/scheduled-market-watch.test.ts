import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {TaskStore} from '../src/main/scheduled/task-store'
import {TaskRunner} from '../src/main/scheduled/task-runner'
import {createScheduledTaskService} from '../src/main/scheduled/task-service'
import {ScheduledMarketWatchExecutor} from '../src/main/scheduled/market-watch-executor'

const dirs:string[]=[]
afterEach(async()=>{await Promise.all(dirs.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
const request={action:'create',sessionId:'board',requestId:'message-1',humanRequest:'帮我设置一个定时任务，如果单日涨跌幅超过3%提醒我',title:'自选股涨跌提醒',nodeId:'watchlist',thresholdPercent:3}
async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'scheduled-watch-'));dirs.push(dir)
 let time=Date.parse('2026-10-20T02:00:00Z'),owner='account-a',percent=3,quoteTime='2026-10-20 10:00:00'
 const store=new TaskStore(join(dir,'tasks.json'),()=>time);await store.load()
 const query=vi.fn(async(_args:unknown,_signal:AbortSignal)=>({source:{id:'tencent-quotes',name:'腾讯行情'},receivedAt:new Date(time).toISOString(),dataTime:quoteTime,units:{changePercent:'%'},records:[{symbol:'sh600000',name:'测试标的',price:10,changePercent:percent,time:quoteTime,timezone:'Asia/Shanghai'}],missingSymbols:[]}))
 const notify=vi.fn(),rpc=vi.fn(async()=>{throw Error('不应调用模型或画板')})
 const executor=new ScheduledMarketWatchExecutor({publicData:{query},owner:()=>owner,now:()=>time})
 const runner=new TaskRunner(store,rpc,()=>true,notify,()=>time,undefined,undefined,executor)
 const canvas=vi.fn(()=>({files:[],artifacts:[{id:'watchlist',containerSpec:{type:'financial-widget',widget:'watchlist',symbols:[{code:'600000',market:'SH',name:'测试标的'}]}}]}))
 const service=createScheduledTaskService({store,runner,owner:()=>owner,readCanvas:canvas,isShared:()=>false,now:()=>time})
 return {dir,store,runner,service,query,notify,rpc,canvas,setNow:(t:string)=>time=Date.parse(t),setPercent:(p:number)=>percent=p,setOwner:(o:string)=>owner=o,advance:()=>time+=300000,setQuoteTime:(t:string)=>quoteTime=t}
}
it('persists a selected structured watchlist immediately and replays creation once across restart',async()=>{
 const f=await fixture()
 const [a,b]=await Promise.all([f.service.request(request),f.service.request(request)])
 expect(a).toMatchObject({status:'saved',task:{id:b.task.id,schedule:{frequency:'interval',intervalMinutes:5},watch:{symbols:['sh600000'],thresholdPercent:3}}})
 expect(f.query).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled()
 expect(f.store.list()).toHaveLength(1)
 const restored=new TaskStore(join(f.dir,'tasks.json'));await restored.load()
 expect(restored.list()[0]?.watch?.symbols).toEqual(['sh600000'])
 await expect(f.service.request({...request,thresholdPercent:4})).rejects.toThrow(/重放|重复|不同/)
 expect(JSON.parse(await readFile(join(f.dir,'tasks.json'),'utf8')).tasks).toHaveLength(1)
 f.canvas.mockImplementation(()=>{throw Error('画板已关闭')})
 expect((await f.service.request(request)).task.id).toBe(a.task.id)
})
it('retains alert deduplication and overdue scheduling through a real store reload',async()=>{
 const f=await fixture(),created=await f.service.request(request);f.setPercent(4)
 await f.runner.run(created.task.id);expect(f.notify).toHaveBeenCalledOnce()
 const store=new TaskStore(join(f.dir,'tasks.json'),()=>Date.parse('2026-10-20T02:10:00Z'));await store.load()
 const runner=new TaskRunner(store,f.rpc,()=>true,f.notify,()=>Date.parse('2026-10-20T02:10:00Z'),undefined,undefined,new ScheduledMarketWatchExecutor({owner:()=> 'account-a',publicData:{query:f.query},now:()=>Date.parse('2026-10-20T02:10:00Z')}))
 await runner.tick()
 expect(store.list()[0]?.runs[0]?.status).toBe('success');expect(f.notify).toHaveBeenCalledOnce()
 expect(store.list()[0]?.nextRun).toBe(Date.parse('2026-10-20T02:15:00Z'))
 await runner.tick();expect(store.list()[0]?.runs).toHaveLength(2)
})
it('preserves the initial next run when a replay arrives after the plan is paused',async()=>{
 const f=await fixture(),created=await f.service.request(request)
 await f.service.request({action:'pause',sessionId:'board',taskId:created.task.id})
 expect((await f.service.request(request)).task).toMatchObject({id:created.task.id,state:'paused',nextRun:null})
})
it('allows a new alert on the next quoted day and contains network failures without a foreground retry loop',async()=>{
 const f=await fixture(),created=await f.service.request(request);f.setPercent(4)
 await f.runner.run(created.task.id)
 f.setNow('2026-10-21T02:00:00Z');f.setQuoteTime('2026-10-21 10:00:00')
 await f.runner.run(created.task.id)
 expect(f.notify).toHaveBeenCalledTimes(2)
 f.query.mockRejectedValueOnce(Error('network timeout'))
 await f.runner.run(created.task.id)
 expect(f.store.list()[0]?.runs[0]).toMatchObject({status:'failed',error:'network timeout'})
})
it('does not send a late notification after deletion while a quote request is in flight',async()=>{
 const f=await fixture(),created=await f.service.request(request);f.setPercent(4)
 const reply=await f.query({},new AbortController().signal)
 let release!:(value:any)=>void,entered!:()=>void
 const started=new Promise<void>(resolve=>entered=resolve)
 f.query.mockImplementationOnce(async()=>{entered();return await new Promise(resolve=>release=resolve)})
 const running=f.runner.run(created.task.id);await started
 await f.service.request({action:'delete',sessionId:'board',taskId:created.task.id})
 release(reply);await running
 expect(f.notify).not.toHaveBeenCalled();expect(f.store.list()).toHaveLength(0)
})
it('does not consume a threshold alert while paused during an in-flight check',async()=>{
 const f=await fixture(),created=await f.service.request(request);f.setPercent(4)
 const reply=await f.query({},new AbortController().signal)
 let release!:(value:any)=>void,entered!:()=>void
 const started=new Promise<void>(resolve=>entered=resolve)
 f.query.mockImplementationOnce(async()=>{entered();return await new Promise(resolve=>release=resolve)})
 const running=f.runner.run(created.task.id);await started
 await f.service.request({action:'pause',sessionId:'board',taskId:created.task.id})
 release(reply);await running
 expect(f.notify).not.toHaveBeenCalled()
 await f.service.request({action:'resume',sessionId:'board',taskId:created.task.id})
 await f.runner.run(created.task.id)
 expect(f.notify).toHaveBeenCalledOnce()
})
it('notifies a triggered one-off watch before its completed state prevents future runs',async()=>{
 const f=await fixture(),created=await f.service.request(request);f.setPercent(4)
 await f.store.save({...created.task,schedule:{...created.task.schedule,frequency:'once',date:'2026-10-20',time:'10:05'}},created.task.id)
 await f.runner.run(created.task.id)
 expect(f.store.list()[0]?.state).toBe('completed')
 expect(f.notify).toHaveBeenCalledOnce()
})
it('deduplicates manual threshold checks of an already completed one-off task',async()=>{
 const f=await fixture(),created=await f.service.request(request)
 await f.store.save({...created.task,schedule:{...created.task.schedule,frequency:'once',date:'2026-10-20',time:'10:05'}},created.task.id)
 await f.runner.run(created.task.id);f.setPercent(4)
 await f.runner.run(created.task.id);await f.runner.run(created.task.id)
 expect(f.notify).toHaveBeenCalledOnce()
})
it('checks without an open canvas or model and alerts only strictly above the threshold once per quote day',async()=>{
 const f=await fixture(),created=await f.service.request(request)
 f.canvas.mockImplementation(()=>{throw Error('画板已关闭')})
 await f.runner.run(created.task.id)
 expect(f.store.list()[0]?.runs[0]).toMatchObject({status:'success',watchResult:{noChange:true}})
 expect(f.notify).not.toHaveBeenCalled()
 f.setPercent(-3.01);await f.runner.run(created.task.id)
 expect(f.notify).toHaveBeenCalledOnce()
 expect(f.notify.mock.calls[0]?.[1].watchResult.summary).toContain('-3.01%')
 await f.runner.run(created.task.id);expect(f.notify).toHaveBeenCalledOnce()
 f.advance();f.advance();await f.runner.tick();expect(f.notify).toHaveBeenCalledOnce()
 expect(f.rpc).not.toHaveBeenCalled();expect(f.query.mock.calls[0]?.[0]).toEqual({operation:'query',source:'tencent-quotes',parameters_json:'{"symbols":["sh600000"]}'})
})
it.each(['future','missing','nonfinite','account'])('records %s data as a visible failure rather than a no-change success',async kind=>{
 const f=await fixture(),created=await f.service.request(request)
 if(kind==='future')f.setQuoteTime('2026-10-21 15:00:00')
 if(kind==='missing')f.query.mockResolvedValueOnce({records:[]} as any)
 if(kind==='nonfinite')f.setPercent(NaN)
 if(kind==='account')f.setOwner('account-b')
 await f.runner.run(created.task.id)
 const run=f.store.list()[0]!.runs[0]!
 expect(run.status).toMatch(/failed|blocked/);expect(run.error).toBeTruthy();expect(run.watchResult?.noChange).not.toBe(true)
 if(kind==='account')expect(f.query).not.toHaveBeenCalled()
 if(kind==='account')expect(f.notify).not.toHaveBeenCalled()
})
it.each(['2026-10-20 09:00:00','2026-10-19 15:00:00'])('waits for a fresh quote at %s without guessing closure, notifying failure or consuming an alert',async oldTime=>{
 const f=await fixture(),created=await f.service.request(request);f.setPercent(4);f.setQuoteTime(oldTime)
 await f.runner.run(created.task.id)
 const task=f.store.list()[0]!
 expect(task).toMatchObject({state:'enabled',runs:[{status:'blocked',watchResult:{waitingForQuote:true,alertKeys:[],quotes:[{time:oldTime}]}}]})
 expect(task.runs[0]?.watchResult?.summary).toMatch(/等待新报价.*未判断阈值/)
 expect(f.notify).not.toHaveBeenCalled();expect(task.watchAlertKeys??[]).toEqual([])
 f.advance();f.setQuoteTime('2026-10-20 10:05:00');await f.runner.tick()
 expect(f.notify).toHaveBeenCalledOnce()
})
it('lets an explicitly retried one-off watch notify after waiting for a new quote',async()=>{
 const f=await fixture(),created=await f.service.request(request);f.setPercent(4)
 await f.store.save({...created.task,schedule:{...created.task.schedule,frequency:'once',date:'2026-10-20',time:'10:05'}},created.task.id)
 f.setNow('2026-10-20T02:05:00Z');f.setQuoteTime('2026-10-20 09:00:00');await f.runner.tick()
 expect(f.store.list()[0]).toMatchObject({state:'paused',runs:[{status:'blocked',watchResult:{waitingForQuote:true}}]})
 expect(f.store.list()[0]?.runs[0]?.watchResult?.summary).toContain('立即运行')
 f.query.mockRejectedValueOnce(Error('network timeout'))
 await f.service.request({action:'run',sessionId:'board',taskId:created.task.id})
 expect(f.store.list()[0]?.state).toBe('paused');expect(f.store.list()[0]?.runs[0]?.status).toBe('failed')
 f.setNow('2026-10-20T02:10:00Z');f.setQuoteTime('2026-10-20 10:10:00')
 await f.service.request({action:'run',sessionId:'board',taskId:created.task.id})
 expect(f.store.list()[0]).toMatchObject({state:'completed',runs:[{status:'success'},{status:'failed'},{status:'blocked'}]})
 expect(f.notify).toHaveBeenCalledOnce()
})
it('enforces origin session and account boundaries and refuses ungrounded symbols',async()=>{
 const f=await fixture(),created=await f.service.request(request)
 expect((await f.service.request({action:'list',sessionId:'other'})).tasks).toEqual([])
 await expect(f.service.request({action:'pause',sessionId:'other',taskId:created.task.id})).rejects.toThrow(/权限|不存在/)
 f.setOwner('account-b')
 expect((await f.service.request({action:'list',sessionId:'board'})).tasks).toEqual([])
 await expect(f.service.request({action:'delete',sessionId:'board',taskId:created.task.id})).rejects.toThrow(/权限|不存在/)
 f.setOwner('account-a')
 await expect(f.service.request({...request,requestId:'m2',nodeId:undefined,symbols:['sh510310']})).rejects.toThrow(/标的|代码/)
 await expect(f.service.request({...request,requestId:'m3',humanRequest:'帮我看一下自选股'})).rejects.toThrow(/明确|定时/)
})
