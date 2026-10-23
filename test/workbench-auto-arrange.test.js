import {afterEach,expect,it,vi} from 'vitest'
import {createWorkbenchAutoArrangeState} from '../scripts/lib/workbench-auto-arrange.mjs'
import {financialClientFixture} from './helpers/financial-widget-client-fixture.js'

const cleanups=[]
afterEach(async()=>{for(const cleanup of cleanups.splice(0).reverse())await cleanup()})
const spec=(title='实际资料')=>({version:1,type:'table',title,columns:['项目','数值'],rows:[['收入',0],['变化',-120]]})
const plan=(id='automatic',prepared=false)=>({id,createdAt:Date.now(),panels:Array.from({length:4},(_,i)=>({nodeId:id+'-'+i,title:'资料 '+i,prompt:'展示原始资料',pending:!prepared,taskId:prepared?'task-'+id+'-'+i:undefined,preparedOutput:prepared?JSON.stringify(spec('资料 '+i)):undefined,x:i%2*672,y:Math.floor(i/2)*368,width:656,height:428,size:'large'}))})
const completed=p=>({artifacts:p.panels.map(panel=>({id:panel.nodeId,workbenchId:p.id,generationStatus:'completed',containerSpec:spec()}))})
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}}

it('只登记实际新规划的完整原成员，失败、取消、缺失和无内容都不算完成',()=>{
 const state=createWorkbenchAutoArrangeState(storage(),'one'),p=plan()
 state.register(p,new Set());const snapshot=completed(p)
 for(const bad of ['queued','running','failed','cancelled','interrupted']){snapshot.artifacts[2].generationStatus=bad;expect(state.ready(snapshot)).toEqual([])}
 snapshot.artifacts[2].generationStatus='completed';delete snapshot.artifacts[2].containerSpec;expect(state.ready(snapshot)).toEqual([])
 snapshot.artifacts[2].containerSpec=spec();expect(state.ready({...snapshot,artifacts:snapshot.artifacts.slice(1)})).toEqual([])
 expect(state.ready(snapshot)).toEqual([p.id]);expect(state.consume([p.id])).toBe(true);expect(state.ready(snapshot)).toEqual([])
 state.register(p,new Set(p.panels.map(panel=>panel.nodeId)));expect(state.ready(snapshot)).toEqual([])
})
it('持久 pending 支持后台完成后返回，已消费和未登记历史在重开与刷新时不重排',()=>{
 const store=storage(),p=plan();let state=createWorkbenchAutoArrangeState(store,'one');state.register(p,new Set())
 state=createWorkbenchAutoArrangeState(store,'one');expect(state.ready(completed(p))).toEqual([p.id]);state.consume([p.id])
 state=createWorkbenchAutoArrangeState(store,'one');expect(state.ready(completed(p))).toEqual([])
 expect(state.register(p,new Set())).toBe(false)
 state.register(p,new Set(p.panels.map(panel=>panel.nodeId)));expect(state.ready(completed(p))).toEqual([])
 expect(createWorkbenchAutoArrangeState(store,'other').ready(completed(p))).toEqual([])
})
it('标记保存失败仍在本进程去重，并且不伪造跨重启保存成功',()=>{
 const backing=storage(),p=plan();let reject=false
 const store={getItem:backing.getItem,setItem:(key,value)=>{if(reject)throw Error('quota');return backing.setItem(key,value)}}
 const state=createWorkbenchAutoArrangeState(store,'failure');state.register(p,new Set());reject=true;state.consume([p.id])
 expect(state.ready(completed(p))).toEqual([]);expect(state.register(p,new Set())).toBe(false)
 expect(createWorkbenchAutoArrangeState(store,'failure').ready(completed(p))).toEqual([p.id])
})
it('实际布局保存失败保留 pending，同一挂载不反复整理，返回后恢复保存才消费',async()=>{
 const f=await financialClientFixture({},{refreshState:true});cleanups.push(f.dispose);const p=plan('save-failure',true),w=f.workspace,organize=vi.spyOn(w,'organizeCanvas'),persist=vi.spyOn(w,'persist').mockReturnValue(false),consume=vi.spyOn(w,'consumeWorkbenchArrange')
 await f.act(async()=>w.applyWorkbench(p));await vi.waitFor(()=>expect(persist).toHaveBeenCalled(),{timeout:2500});expect(organize).toHaveBeenCalledTimes(1);expect(consume).not.toHaveBeenCalled();expect(w.pendingWorkbenchArrange()).toEqual([p.id])
 await f.act(async()=>w.setArtifacts(w.getSnapshot().artifacts));f.win.dispatchEvent(new f.win.Event('resize'));await new Promise(resolve=>setTimeout(resolve,120));expect(organize).toHaveBeenCalledTimes(1)
 persist.mockRestore();await f.render('another');await f.render();await vi.waitFor(()=>expect(consume).toHaveBeenCalledTimes(1),{timeout:2500});expect(organize).toHaveBeenCalledTimes(2);expect(w.pendingWorkbenchArrange()).toEqual([])
})
it('真实 inspection 失败不整理，原任务重试成功才整理且后续刷新不重复',async()=>{
 const f=await financialClientFixture({},{refreshState:true});cleanups.push(f.dispose);const p=plan('retry'),w=f.workspace,organize=vi.spyOn(w,'organizeCanvas')
 p.panels=p.panels.map(panel=>({...panel,taskId:'task-'+panel.nodeId}));await f.act(async()=>w.applyWorkbench(p))
 const inspect=(panel,state,taskId=panel.taskId)=>w.applyGenerationInspection(panel.nodeId,{taskId,canvasNodeId:panel.nodeId,state,lastSeq:1,events:[],...(state==='completed'?{finalOutput:JSON.stringify(spec(panel.title))}:{error:'上游超时'})})
 await f.act(async()=>{p.panels.forEach((panel,i)=>expect(inspect(panel,i===2?'failed':'completed')).toBe(true))})
 await new Promise(resolve=>setTimeout(resolve,100));expect(organize).not.toHaveBeenCalled()
 const retry=p.panels[2];await f.act(async()=>{expect(w.beginContainerGeneration(retry.nodeId,retry.prompt)).toBeTruthy();expect(w.attachGenerationTask(retry.nodeId,{taskId:'retry-task',canvasNodeId:retry.nodeId,state:'running'})).toBe(true);expect(inspect(retry,'completed','retry-task')).toBe(true)})
 await vi.waitFor(()=>expect(organize).toHaveBeenCalledTimes(1),{timeout:2500})
 await vi.waitFor(()=>expect(w.pendingWorkbenchArrange()).toEqual([]),{timeout:2500})
 await f.act(async()=>{expect(w.beginContainerGeneration(retry.nodeId,retry.prompt)).toBeTruthy();expect(w.attachGenerationTask(retry.nodeId,{taskId:'refresh-task',canvasNodeId:retry.nodeId,state:'running'})).toBe(true);expect(inspect(retry,'completed','refresh-task')).toBe(true)})
 await new Promise(resolve=>setTimeout(resolve,150));expect(organize).toHaveBeenCalledTimes(1)
})
it('真实生产入口全部成功后一次标准整理，包含离屏旧组件并保留输入焦点',async()=>{
 const f=await financialClientFixture({},{refreshState:true});cleanups.push(f.dispose)
 const p=plan(),w=f.workspace,organize=vi.spyOn(w,'organizeCanvas'),persist=vi.spyOn(w,'persist'),consume=vi.spyOn(w,'consumeWorkbenchArrange')
 const input=f.document.createElement('textarea');f.document.body.append(input);input.focus()
 await f.act(async()=>w.setArtifacts([{id:'old-offscreen',kind:'pasted-text',messageId:'old-offscreen',title:'旧资料',excerpt:'保留原文',x:250,y:4000,width:480,height:600,sizeMode:'manual'}]))
 await f.act(async()=>w.applyWorkbench(p));expect(organize).not.toHaveBeenCalled()
 for(const [i,panel] of p.panels.entries()){
  await f.act(async()=>{w.applyWorkbench({...p,panels:p.panels.map((value,index)=>index<=i?{...value,taskId:'task-'+value.nodeId,preparedOutput:JSON.stringify(spec(value.title))}:value)})})
  if(i<3)expect(organize).not.toHaveBeenCalled()
 }
 await vi.waitFor(()=>expect(organize).toHaveBeenCalledTimes(1),{timeout:2500})
 expect(consume).not.toHaveBeenCalled()
 expect(organize.mock.calls[0][1]).toBe('standard');expect(f.document.activeElement).toBe(input)
 expect(w.getWorkbenchCells().map(c=>c.id).sort()).toEqual(['old-offscreen',...p.panels.map(panel=>panel.nodeId)].sort())
 await vi.waitFor(()=>expect(consume).toHaveBeenCalledTimes(1),{timeout:2500});expect(persist.mock.invocationCallOrder.at(-1)).toBeLessThan(consume.mock.invocationCallOrder[0])
 const arranged=structuredClone(w.getWorkbenchCells());await f.act(async()=>w.applyWorkbench(p));await f.render('another');await f.render()
 await new Promise(resolve=>setTimeout(resolve,150));expect(organize).toHaveBeenCalledTimes(1);expect(w.getWorkbenchCells()).toEqual(arranged)
})
it('后台 prepared 全完成批次返回后整理，历史全完成看板不会被扫描重排',async()=>{
 const f=await financialClientFixture({},{refreshState:true});cleanups.push(f.dispose);const p=plan('away',true),w=f.workspace,organize=vi.spyOn(w,'organizeCanvas')
 await f.render('another');await f.act(async()=>w.applyWorkbench(p));await new Promise(resolve=>setTimeout(resolve,100));expect(organize).not.toHaveBeenCalled()
 await f.render();await vi.waitFor(()=>expect(organize).toHaveBeenCalledTimes(1),{timeout:2500})
 await f.act(async()=>w.setArtifacts(w.getSnapshot().artifacts.map(node=>({...node,workbenchId:'old-history'}))));await f.render('another');await f.render();await new Promise(resolve=>setTimeout(resolve,150));expect(organize).toHaveBeenCalledTimes(1)
})
