import {describe,it,expect,vi} from 'vitest'
import {ComponentDataRefresh, evaluateMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
const data={version:1,type:'market',variant:'metrics',title:'指标',asOf:'2026-09-25',items:[{label:'指数',value:'100'}]}
function setup(){
 let now=100000,stored=[],spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))),revision='r1'
 const execute=vi.fn(async()=>({items:[{name:'指数',price:101}],date:'2026-09-26'})),apply=vi.fn(async(s)=>{spec=s;revision+='x'})
 const service=new ComponentDataRefresh({now:()=>now,owner:()=> 'owner',load:async()=>stored,save:async(v)=>{stored=structuredClone(v)},execute,
   inspect:async()=>({revision,spec,writable:true}),apply:async(_b,rev,s)=>{if(rev!==revision)throw Error('conflict');await apply(s)},validateRequest:async r=>({...r,connectionId:'c',connectionRevision:1,schemaDigest:'d'})})
 const input={sessionId:'s',nodeId:'n',workspaceId:'w',requests:[{key:'quote',toolId:'t',args:{url_params:{ticker:'510300',date:{$date:{format:'yyyyMMdd',timezone:'Asia/Shanghai'}}}}}],mapping:{...data,asOf:{$from:'quote',$path:'date'},items:{$from:'quote',$each:'items',$map:{label:{$path:'name'},value:{$path:'price',$as:'string'}}}},intervalMinutes:1}
 return {service,input,execute,apply,now:n=>{now=n},spec:()=>spec,store:()=>stored,edit:()=>{spec={...spec,title:'用户编辑'}}}
}
describe('data refresh without generation',()=>{
 it('maps bounded JSON values and dates without evaluating code',()=>{
  expect(evaluateMapping({a:{$date:{format:'yyyyMMdd',timezone:'Asia/Shanghai',offsetDays:-1}}},{},new Date('2026-09-26T02:00:00Z'))).toEqual({a:'20260925'})
  expect(()=>evaluateMapping({$path:'__proto__.x'},{},new Date())).toThrow()
  expect(()=>evaluateMapping({$path:'missing'},{},new Date())).toThrow()
 })
 it('updates only data, detects unchanged responses, and survives reload',async()=>{
  const f=setup();await f.service.load();const b=await f.service.bind(f.input)
  await f.service.refresh(b.id);expect(f.apply).toHaveBeenCalledTimes(1)
  expect(f.spec().html).toContain('101')
  await f.service.refresh(b.id);expect(f.apply).toHaveBeenCalledTimes(1)
  expect(f.service.list()[0]).toMatchObject({status:'unchanged',failures:0})
  await f.service.load();expect(f.service.list()[0].lastSuccess).toBeTruthy()
 })
 it('coalesces same component and shared data requests, and retains old data on error',async()=>{
  const f=setup();await f.service.load();const b=await f.service.bind(f.input)
  let release;f.execute.mockImplementationOnce(()=>new Promise(r=>{release=r}))
  const one=f.service.refresh(b.id),two=f.service.refresh(b.id)
  await vi.waitFor(()=>expect(release).toBeTruthy());release({items:[{name:'指数',price:102}],date:'2026-09-26'});await Promise.all([one,two]);expect(f.execute).toHaveBeenCalledTimes(1)
  f.now(120000);f.execute.mockRejectedValueOnce(Error('服务暂不可用'));await f.service.refresh(b.id)
  expect(f.apply).toHaveBeenCalledTimes(1);expect(f.service.list()[0]).toMatchObject({status:'error',failures:1})
  expect(f.service.list()[0].nextRun).toBeGreaterThan(120000)
 })
 it('rejects stale results after pause, edit, or delete',async()=>{
  for(const action of ['pause','edit','delete']){
   const f=setup();await f.service.load();const b=await f.service.bind(f.input)
   let release;f.execute.mockImplementationOnce(()=>new Promise(r=>{release=r}))
   const pending=f.service.refresh(b.id);await vi.waitFor(()=>expect(release).toBeTruthy())
   if(action==='edit')f.edit();else await f.service.configure(b.id,action==='delete'?{deleted:true}:{enabled:false})
   release({items:[{name:'指数',price:102}],date:'2026-09-26'});await pending;expect(f.apply).not.toHaveBeenCalled()
  }
 })
 it('rejects missing mappings, credentials and invalid intervals before scheduling',async()=>{
  const f=setup();await f.service.load()
  await expect(f.service.bind({...f.input,intervalMinutes:.001})).rejects.toThrow()
  await expect(f.service.bind({...f.input,requests:[{key:'x',toolId:'t',args:{Authorization:'Bearer secret'}}]})).rejects.toThrow()
 })
})

describe('concurrent data consumers and account changes',()=>{
 it('shares a pending source request across different cards while one consumer is paused',async()=>{
  const f=setup();await f.service.load();const a=await f.service.bind(f.input),b=await f.service.bind({...f.input,nodeId:'n2'})
  let release,networkSignal;f.execute.mockImplementationOnce((_b,_r,_a,signal)=>{networkSignal=signal;return new Promise(r=>{release=r})})
  const one=f.service.refresh(a.id),two=f.service.refresh(b.id)
  await vi.waitFor(()=>expect(release).toBeTruthy())
  await f.service.configure(a.id,{enabled:false})
  expect(networkSignal.aborted).toBe(false)
  release({items:[{name:'指数',price:103}],date:'2026-09-26'})
  await Promise.all([one,two]);expect(f.execute).toHaveBeenCalledTimes(1);expect(f.apply).toHaveBeenCalledTimes(1)
  expect(f.service.list().find(row=>row.id===a.id).status).toBe('paused')
 })
 it('drops an old account response and does not schedule its bindings for the next account',async()=>{
  const f=setup();await f.service.load();const b=await f.service.bind(f.input)
  let release;f.execute.mockImplementationOnce(()=>new Promise(r=>{release=r}))
  const pending=f.service.refresh(b.id);await vi.waitFor(()=>expect(release).toBeTruthy())
  f.service.options.owner=()=> 'next-owner'
  release({items:[{name:'指数',price:104}],date:'2026-09-26'});await pending
  expect(f.apply).not.toHaveBeenCalled();expect(f.service.list()).toEqual([])
  f.now(99999999);await f.service.tick();expect(f.execute).toHaveBeenCalledTimes(1)
 })
})
