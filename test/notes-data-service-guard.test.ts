import {afterEach,expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createComponentDataService} from '../src/main/component-data/service'
import {CanvasActionBridge} from '../src/main/state/canvas-action-bridge'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'

const fixtures:Array<{dispose():Promise<void>}>=[]
afterEach(async()=>{for(const fixture of fixtures.splice(0))await fixture.dispose()})
async function fixture(){
 const directory=await mkdtemp(join(tmpdir(),'note-data-guard-'))
 const data={version:1,type:'kpi',title:'原组件',asOf:'来源时点',items:[{label:'价格',value:'100'}]}
 let spec=JSON.parse(acceptArtifactOutput(JSON.stringify(data))!),revision=1
 const sent:any[]=[],apply=vi.fn(),query=vi.fn(async(_args:any,_signal:AbortSignal)=>({records:[{price:101}]}))
 const canvas=new CanvasActionBridge({canRead:()=>true,send:(packet:any)=>{
  sent.push(packet);if(packet.cancel)return
  queueMicrotask(()=>{
   if(packet.method==='apply'){apply(packet);spec=packet.args.changes[0].fields.containerSpec;revision++}
   canvas.respond({requestId:packet.requestId,sessionId:packet.sessionId,result:packet.method==='inspect'?{revision:String(revision),writable:true,nodes:[{id:'note-node',content:{containerSpec:spec},capabilities:{fields:{containerSpec:true}}}]}:{status:'applied'}})
  })
 }})
 const service=await createComponentDataService({file:join(directory,'bindings.json'),owner:()=> 'owner',isShared:()=>false,canvas,integrations:{} as any,
  rpc:async method=>({items:method==='session.list'?[{sessionId:'note',cwd:'/workspace'}]:[{workspaceId:'w',path:'/workspace'}]}),
  publicData:{validate:async()=>({sourceId:'kraken-ticker',sourceName:'Kraken'}),query}})
 const binding:any=await service.request('note',{action:'bind-generated',nodeId:'note-node',initialSpec:spec,recipe:{intervalMinutes:1,requests:[{key:'q',toolId:'public_data_query',args:{operation:'query',source:'kraken-ticker',parameters_json:'{"pair":"XBTUSD"}'}}],mapping:{...data,items:[{label:'价格',value:{$from:'q',$path:'records.0.price',$as:'string'}}]}}})
 const f={service,binding,sent,apply,query,spec:()=>spec,persisted:async()=>JSON.parse(await readFile(join(directory,'bindings.json'),'utf8')),dispose:async()=>{canvas.dispose();await service.dispose();await rm(directory,{recursive:true,force:true})}}
 fixtures.push(f);return f
}
const request=(f:any,args:any,control?:any)=>(f.service.request as any)('note',{nodeId:'note-node',...args},control)

it('inspects one actual binding through a guarded note canvas without exposing recipes or other nodes',async()=>{
 const f=await fixture(),result=await request(f,{action:'inspect'},{guardId:'lease-one'})
 expect(result).toMatchObject({nodeId:'note-node',bound:true,revision:f.binding.revision,enabled:true,intervalMinutes:1,sourceNames:['Kraken']})
 expect(result).not.toHaveProperty('requests');expect(result).not.toHaveProperty('mapping');expect(result).not.toHaveProperty('guardId')
 expect(f.sent.at(-1)).toMatchObject({guardId:'lease-one',method:'inspect',selectedIds:['note-node'],args:{ids:['note-node']}})
 expect(f.query).not.toHaveBeenCalled()
})

it('requires the observed binding revision for controlled configure and refresh, preserving state on stale calls',async()=>{
 const f=await fixture(),control={guardId:'lease-cas'}
 await expect(request(f,{action:'configure',revision:f.binding.revision+1,settings:{enabled:false}},control)).rejects.toThrow(/变化|版本/)
 await expect(request(f,{action:'refresh',revision:f.binding.revision+1},control)).rejects.toThrow(/变化|版本/)
 await expect(request(f,{action:'refresh'},control)).rejects.toThrow(/版本/)
 expect(f.service.engine.list('note')[0]).toMatchObject({revision:f.binding.revision,enabled:true})
 expect(f.query).not.toHaveBeenCalled();expect(f.apply).not.toHaveBeenCalled()
 const configured=await request(f,{action:'configure',revision:f.binding.revision,settings:{intervalMinutes:5,enabled:false}},control)
 expect(configured).toMatchObject({revision:f.binding.revision+1,intervalMinutes:5,enabled:false})
})

it('passes a trusted guard through every inspect and final apply of its own refresh',async()=>{
 const f=await fixture(),result=await request(f,{action:'refresh',revision:f.binding.revision},{guardId:'lease-refresh'})
 expect(result.status).toBe('success');expect(f.query).toHaveBeenCalledOnce();expect(f.apply).toHaveBeenCalledOnce()
 expect(f.sent.filter(packet=>!packet.cancel).every(packet=>packet.guardId==='lease-refresh')).toBe(true)
 expect((f.apply.mock.calls as any)[0][0].args.changes[0].fields).not.toHaveProperty('guardId')
 expect(f.service.engine.list('note')[0]).not.toHaveProperty('guardId')
})

it('returns saved configure settings when cancellation arrives during persistence instead of hiding the effect',async()=>{
 const f=await fixture(),controller=new AbortController(),engine=f.service.engine as any,save=engine.options.save
 engine.options.save=async(value:any)=>{await save(value);controller.abort(Error('已取消后续操作'))}
 const result=await request(f,{action:'configure',revision:f.binding.revision,settings:{enabled:false,intervalMinutes:5}},{guardId:'lease-save-boundary',signal:controller.signal})
 expect(controller.signal.aborted).toBe(true)
 expect(result).toMatchObject({bound:true,nodeId:'note-node',revision:f.binding.revision+1,status:'paused',enabled:false,intervalMinutes:5})
 expect(result).not.toHaveProperty('requests');expect(result).not.toHaveProperty('mapping')
 expect(await f.persisted()).toEqual([expect.objectContaining({revision:f.binding.revision+1,enabled:false,intervalMinutes:5})])
 expect(f.query).not.toHaveBeenCalled();expect(f.apply).not.toHaveBeenCalled()
})

it('cancels only the refresh it started and never applies a late provider response',async()=>{
 const f=await fixture(),controller=new AbortController();let release!:(value:any)=>void,sourceSignal:AbortSignal|undefined
 f.query.mockImplementationOnce(async(_args,signal)=>{sourceSignal=signal;return new Promise(resolve=>{release=resolve})})
 const pending=request(f,{action:'refresh',revision:f.binding.revision},{guardId:'lease-cancel',signal:controller.signal})
 const rejected=expect(pending).rejects.toThrow(/取消|cancel/i)
 await vi.waitFor(()=>expect(release).toBeTypeOf('function'));controller.abort(Error('已取消'))
 await rejected;expect(sourceSignal?.aborted).toBe(true)
 release({records:[{price:999}]});await Promise.resolve();expect(f.apply).not.toHaveBeenCalled()
})

it('returns pending state for an existing automatic refresh without joining or cancelling it',async()=>{
 const f=await fixture(),controller=new AbortController();let release!:(value:any)=>void,sourceSignal:AbortSignal|undefined
 f.query.mockImplementationOnce(async(_args,signal)=>{sourceSignal=signal;return new Promise(resolve=>{release=resolve})})
 f.service.engine.setVisible('note',true)
 const automatic=(f.service.engine.refresh as any)(f.binding.id,true)
 try{
  await vi.waitFor(()=>expect(release).toBeTypeOf('function'))
  let result:any;const controlled=request(f,{action:'refresh',revision:f.binding.revision},{guardId:'lease-shared',signal:controller.signal}).then((value:any)=>{result=value})
  await vi.waitFor(()=>expect(result?.status).toBe('refreshing'),{timeout:500})
  controller.abort();expect(sourceSignal?.aborted).toBe(false);expect(f.query).toHaveBeenCalledOnce()
  release({records:[{price:101}]});await automatic;await controlled;expect(f.apply).toHaveBeenCalledOnce()
  expect((f.apply.mock.calls as any)[0][0]).not.toHaveProperty('guardId')
 }finally{release?.({records:[{price:101}]});await automatic}
})

it('keeps controls out of model arguments and refuses controlled bind or invalid guard envelopes',async()=>{
 const f=await fixture()
 await expect(request(f,{action:'refresh',revision:f.binding.revision,guardId:'model'})).rejects.toThrow()
 await expect(request(f,{action:'bind',recipe:{}},{guardId:'lease'})).rejects.toThrow()
 await expect(request(f,{action:'inspect'},{guardId:''})).rejects.toThrow()
 expect(f.query).not.toHaveBeenCalled();expect(f.apply).not.toHaveBeenCalled()
 const sent:any[]=[],canvas=new CanvasActionBridge({canRead:()=>true,send:packet=>sent.push(packet)})
 try{canvas.bind({sessionId:'s',selectedIds:['n']});await expect(canvas.execute({sessionId:'s',method:'inspect',args:{},guardId:'untrusted'})).rejects.toThrow();expect(sent).toEqual([])}finally{canvas.dispose()}
})
