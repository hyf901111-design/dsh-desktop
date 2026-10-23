import {expect,it,vi} from 'vitest'
import {registerCanvasTools,registerCanvasGoalGuard,bindCanvasChild} from '../packages/dsh-research-task-runtime/canvas-tools.js'
import {createCanvasActionController} from '../packages/dsh-research-task-runtime/canvas-actions.js'
import {parseResearchContainerSpec} from '../packages/dsh-research-task-runtime/artifact-validator.js'

function fixture(){
 let state={files:[],artifacts:['quote','news'].map(id=>({id,title:id,containerSpec:{version:1,type:'markdown',title:id,content:'原内容'}})),selection:{selectedNodeIds:[],orderedFileIds:[]}},history=[],writable=true
 const commit=vi.fn(next=>{history.push(state);state=next})
 const controller=createCanvasActionController({snapshot:()=>state,canWrite:()=>writable,describe:()=>({title:{type:'string',maxLength:256},containerSpec:{type:'object'}}),validate:node=>parseResearchContainerSpec(node.containerSpec)?node:null,commit,undo:()=>{state=history.pop();return true}})
 const calls=[],tools=new Map()
 const dispose=registerCanvasTools({tools:{register:tool=>{tools.set(tool.name,tool);return()=>tools.delete(tool.name)}}},{env:{SHERLOCK_RESEARCH_CONTEXT_URL:'http://127.0.0.1:1234',SHERLOCK_RESEARCH_CONTEXT_TOKEN:'fixture-token'},fetch:async(_url,init)=>{
  const call=JSON.parse(init.body);calls.push(call)
  try{return new Response(JSON.stringify(await controller[call.method](call.args)))}catch(error){return new Response(JSON.stringify({error:error.message}),{status:400})}
 }})
 return {controller,commit,calls,tools,dispose,deny:()=>{writable=false},read:()=>state,exec:{agent:{session:{id:'canvas'}},signal:new AbortController().signal}}
}
const operations=()=>[
 {op:'update',id:'quote',fields:{title:'已核实报价',containerSpec:{version:1,type:'market',variant:'table',title:'已核实报价',asOf:'2026-10-20 · 公开报价',columns:['标的','价格'],rows:[['测试标的','100.25 元']]}}},
 {op:'update',id:'news',fields:{containerSpec:{version:1,type:'reports',title:'实际公告',items:[{title:'已经取得的公告',date:'2026-10-20',summary:'实际取得的公告记录',category:'公告',url:'https://example.org/notice/observed'}]}}}
]
const input=(route,changes)=>route==='operations'?{operations:changes}:{changes:JSON.stringify(changes)}

it('declares a structured operation array in the actual dsh-tools schema and keeps changes optional',()=>{
 const f=fixture()
 try{
  const tool=f.tools.get('research_canvas_apply'),schema=tool.parameters
  expect(schema.properties.operations?.type).toBe('array')
  expect(schema.properties.operations.items.properties.op.enum).toEqual(['remove','update','arrange','presentation'])
  expect(schema.properties.operations.items.properties.fields.type).toBe('object')
  expect(schema.required).toEqual(['requestId','revision'])
  expect(tool.description).toContain('优先使用 operations')
 }finally{f.dispose()}
})

it.each(['operations','changes'])('updates two real host cards atomically, retries idempotently and undoes through %s',async route=>{
 const f=fixture()
 try{
  const before=structuredClone(f.read()),revision=(await f.controller.inspect({})).revision,changes=operations(),original=structuredClone(changes)
  const args={requestId:'two-cards',revision,...input(route,changes)},tool=f.tools.get('research_canvas_apply')
  const result=JSON.parse(await tool.execute(args,f.exec))
  expect(result.changedIds).toEqual(['quote','news']);expect(f.commit).toHaveBeenCalledOnce()
  expect(f.read().artifacts[0].containerSpec.html).toContain('100.25')
  expect(f.read().artifacts[1].containerSpec.html).toContain('已经取得的公告')
  expect(changes).toEqual(original)
  expect(f.calls[0].args.operations).toBeUndefined();expect(Array.isArray(f.calls[0].args.changes)).toBe(true)
  expect(JSON.parse(await tool.execute(args,f.exec))).toEqual(result);expect(f.commit).toHaveBeenCalledOnce()
  await f.tools.get('research_canvas_undo').execute({requestId:'undo',revision:result.revision,actionId:result.actionId},f.exec)
  expect(f.read()).toEqual(before)
 }finally{f.dispose()}
})

it('rejects conflicting or missing transfer inputs and malformed legacy JSON before sending a host request',async()=>{
 const f=fixture()
 try{
  for(const payload of [{},{operations:operations(),changes:JSON.stringify(operations())},{changes:'[{"op":"update"'},{changes:'{}'},{operations:[]}]){
   await expect(f.tools.get('research_canvas_apply').execute({requestId:'invalid',revision:'r',...payload},f.exec)).rejects.toThrow()
  }
  await expect(f.tools.get('research_canvas_apply').execute({requestId:'syntax',revision:'r',changes:'[{"op":"update"'},f.exec)).rejects.toThrow('改用结构化 operations 数组')
  expect(f.calls).toHaveLength(0);expect(f.commit).not.toHaveBeenCalled()
 }finally{f.dispose()}
})

it('retains stale-revision and readonly rejection without retrying a structured update',async()=>{
 const f=fixture()
 try{
  const revision=(await f.controller.inspect({})).revision,tool=f.tools.get('research_canvas_apply')
  await tool.execute({requestId:'first',revision,operations:operations()},f.exec)
  const after=structuredClone(f.read())
  await expect(tool.execute({requestId:'stale',revision,operations:[{op:'remove',ids:['quote']}]},f.exec)).rejects.toThrow('已经变化')
  const fresh=(await f.controller.inspect({})).revision;f.deny()
  await expect(tool.execute({requestId:'readonly',revision:fresh,operations:[{op:'remove',ids:['quote']}]},f.exec)).rejects.toThrow('不可编辑')
  expect(f.read()).toEqual(after);expect(f.commit).toHaveBeenCalledOnce();expect(f.calls).toHaveLength(3)
 }finally{f.dispose()}
})

it.each(['operations','changes'])('retains host rejection of unsupported operations and undeclared fields for %s',async route=>{
 const f=fixture()
 try{
  const revision=(await f.controller.inspect({})).revision,before=structuredClone(f.read())
  for(const changes of [[{op:'replace',id:'quote',fields:{title:'不能替换'}}],[{op:'update',id:'quote',fields:{title:'先不要提交'}},{op:'update',id:'news',fields:{authorizationId:'不能新增权限'}}],[{op:'arrange',id:'quote'}]]){
   await expect(f.tools.get('research_canvas_apply').execute({requestId:'bad-'+f.calls.length,revision,...input(route,changes)},f.exec)).rejects.toThrow()
   expect(f.read()).toEqual(before);expect(f.commit).not.toHaveBeenCalled()
  }
 }finally{f.dispose()}
})

it.each(['operations','changes'])('passes canonical changes through parent and bound-child goal guards for %s',async route=>{
 const f=fixture(),global=vi.fn(async()=>{throw Error('目标限制')}),child=vi.fn(async()=>{throw Error('子任务已取消')}),releaseGlobal=registerCanvasGoalGuard(global)
 let releaseChild
 try{
  const args={requestId:'guarded',revision:'r',...input(route,operations())}
  await expect(f.tools.get('research_canvas_apply').execute(args,f.exec)).rejects.toThrow('目标限制')
  expect(global.mock.calls[0][1]).toBe('apply')
  expect(global.mock.calls[0][2].changes[0].fields.containerSpec.type).toBe('html')
  expect(global.mock.calls[0][2].operations).toBeUndefined()
  releaseChild=bindCanvasChild('structured-child','canvas',child)
  await expect(f.tools.get('research_canvas_apply').execute(args,{...f.exec,agent:{session:{id:'structured-child'}}})).rejects.toThrow('子任务已取消')
  expect(child.mock.calls[0][0]).toBe('apply');expect(child.mock.calls[0][1].changes).toEqual(global.mock.calls[0][2].changes)
  expect(global).toHaveBeenCalledOnce();expect(f.calls).toHaveLength(0)
 }finally{releaseChild?.();releaseGlobal();f.dispose()}
})

it.each(['operations','changes'])('rejects oversized and deeply nested changes before normalization or transport for %s',async route=>{
 const f=fixture()
 try{
  let nested={value:'leaf'};for(let i=0;i<80;i++)nested={nested}
  for(const changes of [[{op:'update',id:'quote',fields:{title:'x'.repeat(1500001)}}],[{op:'update',id:'quote',fields:{containerSpec:nested}}]]){
   await expect(f.tools.get('research_canvas_apply').execute({requestId:'bounded',revision:'r',...input(route,changes)},f.exec)).rejects.toThrow(/过大|嵌套|无效/)
  }
  expect(f.calls).toHaveLength(0)
 }finally{f.dispose()}
})
