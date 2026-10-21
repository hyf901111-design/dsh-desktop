import {afterEach,expect,it,vi} from 'vitest'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {fetchedWebPageRecord} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {acquireFeedSourceEvidence} from '../packages/dsh-research-task-runtime/component-feed-acquisition.js'
const cleanup=[]
afterEach(async()=>{for(const dispose of cleanup.splice(0))await dispose()})
// Synthetic records exercise the real Runtime and acquisition, with only the
// external model and network replaced. They make no claim about observed B news.
const title='甲公司发布产品',url='https://example.org/product'
const item={id:'product',title,time:'2026-10-15',actor:'甲公司',url,summary:'产品正文。'}
const artifact={version:1,type:'timeline',title:'公司新闻',range:'2026-10-01 至 2026-10-21',items:[item]}
const context={sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:'公司新闻'},sourceRequirement:'查询公司真实新闻和来源链接。',workbenchRequest:{originalRequest:'创建甲公司与乙公司真实新闻工作台，包含行业政策。2026-10-01 至 2026-10-21。',dataMode:'source'}}
const page={url,content:`${title}\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[{title,date:item.time,url}]})}\n[/网页主文记录]\n\n合成正文。`}
async function run(outputs,{read=async()=>page,records=[]}={}){
 const reads=vi.fn(read),acquire=vi.fn((text,records,options)=>acquireFeedSourceEvidence({text,records,observedUrls:[url],readPage:reads,...options}))
 const start=vi.fn(async()=>{
  const output=outputs[Math.min(start.mock.calls.length-1,outputs.length-1)]
  if(output instanceof Error)throw output
  return {childSessionId:'offline-article',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(output)}],sourceRecords:records[start.mock.calls.length-1]??[],acquireFeedEvidence:acquire}),dispose:async()=>{}}
 })
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}});cleanup.push(()=>runtime.dispose())
 const task=await runtime.start({kind:'container',parentSessionId:'p',canvasNodeId:'news',prompt:'工作台：公司研究\n本面板：公司新闻\n查询公司真实新闻和来源链接。仅生成本面板，优先使用 timeline 类型。'},context)
 await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.tasks.get(task.taskId).state))
 const result=runtime.tasks.get(task.taskId)
 return {result,start,reads,acquire,model:result.finalOutput?readTemplateModel(JSON.parse(result.finalOutput))?.data:undefined}
}
it('supplements source evidence and completes the real timeline without a second generation',async()=>{
 const f=await run([artifact])
 expect(f.result.state).toBe('completed');expect(f.reads).toHaveBeenCalledOnce();expect(f.start).toHaveBeenCalledOnce()
 expect(f.model.items).toEqual(artifact.items)
 expect(f.start.mock.calls[0][0].hostContext.workbenchRequest).toEqual(context.workbenchRequest)
})
it('uses first-pass acquired evidence in exactly one repair and keeps the original time and URL',async()=>{
 const f=await run([{...artifact,items:[{...item,title:'模型错误标题'}]},artifact])
 expect(f.result.state).toBe('completed');expect(f.reads).toHaveBeenCalledOnce();expect(f.start).toHaveBeenCalledTimes(2)
 expect(f.start.mock.calls[1][0].prompt).toContain('合成正文')
 expect(f.start.mock.calls[1][0].hostContext).toEqual(f.start.mock.calls[0][0].hostContext)
 expect(f.model.items).toEqual([item])
})
it('keeps a proven item and the entire missing research object after the sole repair',async()=>{
 const candidate={...artifact,items:[item,{...item,id:'other',actor:'乙公司',title:'乙公司政策',url:'https://example.org/unknown',summary:'未经核实的模型判断'}]}
 const f=await run([candidate])
 expect(f.result.state).toBe('completed');expect(f.start).toHaveBeenCalledTimes(2)
 expect(f.model.items).toEqual([item]);expect(f.model.note).toContain('乙公司政策');expect(f.model.note).not.toContain('未经核实的模型判断')
})
it.each(['unavailable','throwing-repair'])('fails honestly when no original can be proven: %s',async mode=>{
 const f=await run(mode==='throwing-repair'?[artifact,new Error('offline repair failure')]:[artifact],{read:async()=>{throw Error('offline read unavailable')}})
 expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.start).toHaveBeenCalledTimes(2);expect(f.reads).toHaveBeenCalledOnce()
})
it('preserves first-draft research gaps when repair silently drops the unavailable company',async()=>{
 const missing={...item,id:'missing',title:'乙公司政策',actor:'乙公司',url:'https://example.org/unavailable',summary:'未经核实的摘要'}
 const f=await run([{...artifact,note:'研究范围还有行业政策维度',items:[item,missing]},artifact])
 expect(f.result.state).toBe('completed')
 expect(f.model.items).toEqual([item])
 expect(f.model.note).toContain('乙公司')
 expect(f.model.note).toContain('行业政策')
 expect(f.model.note).not.toContain('未经核实的摘要')
})

it('reuses first-pass retrieval when only the second generation supplies the timeline',async()=>{
 const f=await run([null,artifact],{records:[[fetchedWebPageRecord(url,page.content)],[]]})
 expect(f.result.state).toBe('completed');expect(f.start).toHaveBeenCalledTimes(2);expect(f.reads).not.toHaveBeenCalled()
 expect(f.model.items).toEqual([item])
})
it('does not turn an invented omitted article into a mandatory human research object',async()=>{
 const fabricated={...item,id:'invented',actor:'不存在公司',title:'模型虚构对象',url:'https://example.org/invented'}
 const f=await run([{...artifact,items:[item,fabricated]},artifact])
 expect(f.result.state).toBe('completed');expect(f.model.items).toEqual([item]);expect(f.model.note??'').not.toContain('不存在公司')
})
it('restores a proven first-pass article if repair omits it',async()=>{
 const missing={...item,id:'missing',title:'乙公司政策',actor:'乙公司',url:'https://example.org/missing'}
 const f=await run([{...artifact,items:[item,missing]},{...artifact,items:[missing]}])
 expect(f.result.state).toBe('completed')
 expect(f.model.items).toEqual([item])
 expect(f.model.note).toContain('乙公司')
 expect(f.reads).toHaveBeenCalledOnce()
})
