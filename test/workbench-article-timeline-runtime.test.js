import {afterEach,expect,it,vi} from 'vitest'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
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
async function run(outputs,{read=async()=>page,records=[],hostContext=context}={}){
 const reads=vi.fn(read),acquire=vi.fn((text,records,options)=>acquireFeedSourceEvidence({text,records,observedUrls:[url],readPage:reads,...options}))
 const start=vi.fn(async()=>{
  const output=outputs[Math.min(start.mock.calls.length-1,outputs.length-1)]
  if(output instanceof Error)throw output
  return {childSessionId:'offline-article',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(output)}],sourceRecords:records[start.mock.calls.length-1]??[],acquireFeedEvidence:acquire}),dispose:async()=>{}}
 })
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}});cleanup.push(()=>runtime.dispose())
 const task=await runtime.start({kind:'container',parentSessionId:'p',canvasNodeId:'news',prompt:'工作台：公司研究\n本面板：公司新闻\n查询公司真实新闻和来源链接。仅生成本面板，优先使用 timeline 类型。'},hostContext??undefined)
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

it.each(['2条已核验新闻','两篇已核验新闻'])('invalidates stale counts and source coverage after omission: %s',async staleTitle=>{
 const missing={...item,id:'missing',title:'乙公司新闻',actor:'乙公司',url:'https://example.org/missing'}
 const stale={...artifact,title:staleTitle,asOf:'全部来源已经核验'}
 const f=await run([{...stale,items:[item,missing]},stale])
 expect(f.result.state).toBe('completed');expect(f.start).toHaveBeenCalledTimes(2)
 expect(f.model.items).toEqual([item]);expect(f.model.title).not.toBe(staleTitle);expect(f.model.asOf).not.toBe(stale.asOf)
 for(const value of [staleTitle,'全部来源已经核验','已失效','乙公司','展示 1 条'])expect(f.model.note).toContain(value)
})
it('preserves the proven original identity of an omitted out-of-window background without counting it',async()=>{
 const background={id:'background',title:'乙公司历史政策原文',actor:'乙公司',time:'2026-09-10',url:'https://example.org/background',summary:'不得沿用的模型摘要'}
 const backgroundPage=page.content.replaceAll(title,background.title).replaceAll(item.time,background.time).replaceAll(url,background.url)
 const f=await run([{...artifact,items:[item,background]},artifact],{records:[[fetchedWebPageRecord(background.url,backgroundPage)],[]]})
 expect(f.result.state).toBe('completed');expect(f.start).toHaveBeenCalledTimes(2);expect(f.model.items).toEqual([item])
 for(const value of [background.title,background.time,background.url,'不计入','背景'])expect(f.model.note).toContain(value)
 expect(f.model.note).not.toContain(background.summary);expect(f.model.asOf).toContain('仅计入窗口内')
})
it('preserves a human category gap even when the omitted candidate has no actor or object',async()=>{
 const policy={id:'policy',title:'行业政策待核验候选',time:'2026-10-14',url:'https://example.org/policy',summary:'不能作为事实的摘要'}
 const f=await run([{...artifact,items:[item,policy]},artifact])
 expect(f.result.state).toBe('completed');expect(f.model.items).toEqual([item]);expect(f.model.note).toContain('行业政策')
 expect(f.model.note).toMatch(/缺口|待核验/);expect(f.model.note).not.toContain(policy.title);expect(f.model.note).not.toContain(policy.summary)
})
it.each([
 ['乙公司（300502）','300502.SZ','300502'],
 ['乙公司（300502.SZ）','300502','300502'],
 ['乙公司（sz300502）','300502.SZ','300502']
])('retains human ticker scope across explicit equivalent spelling: %s / %s',async(human,object,code)=>{
 const hostContext={...context,workbenchRequest:{...context.workbenchRequest,originalRequest:'创建甲公司与'+human+'真实新闻工作台。2026-10-01 至 2026-10-21。'}}
 const missing={id:'missing',title:'模型待核验候选',time:'2026-10-14',object,url:'https://example.org/missing'}
 const f=await run([{...artifact,items:[item,missing]},artifact],{hostContext})
 expect(f.result.state).toBe('completed');expect(f.model.items).toEqual([item]);expect(f.model.note).toContain(code)
 expect(f.model.note).toMatch(/缺口|待核验/);expect(f.model.note).not.toContain(missing.title)
})

it('fails rather than dropping an omitted human scope gap when its full note exceeds the schema budget',async()=>{
 const missing={id:'missing',title:'行业政策候选',time:'2026-10-14',url:'https://example.org/missing'}
 const final={...artifact,title:'2条已核验新闻',asOf:'全部来源已核验',note:'已有原始研究说明。'.repeat(200)}
 const f=await run([{...artifact,items:[item,missing]},final])
 expect(f.start).toHaveBeenCalledTimes(2);expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined()
 expect(f.result.error).toContain('缺口无法完整保留')
})
it('does not match an explicitly contradictory exchange when carrying omitted scope',async()=>{
 const hostContext={...context,workbenchRequest:{...context.workbenchRequest,originalRequest:'创建甲公司与乙公司（300502.SZ）真实新闻工作台。'}}
 const missing={id:'missing',title:'模型虚构对象',time:'2026-10-14',object:'300502.SH',url:'https://example.org/missing'}
 const f=await run([{...artifact,items:[item,missing]},artifact],{hostContext})
 expect(f.result.state).toBe('completed');expect(f.model.items).toEqual([item])
 expect(f.model.note).not.toContain('300502');expect(f.model.note).not.toContain(missing.title)
})
it('keeps the original URL of an omitted source-proven announcement background too',async()=>{
 const current={id:'notice-current',title:'甲公司产品公告',actor:'甲公司',time:'2026-10-15',url:'https://data.eastmoney.com/notices/detail/300308/AN202610150000000001.html'}
 const background={id:'notice-background',title:'乙公司历史公告',actor:'乙公司',time:'2026-09-10',url:'https://data.eastmoney.com/notices/detail/300502/AN202609100000000001.html'}
 const source={tool:'public_data_query',args:{operation:'query',source:'eastmoney-announcements'},response:{sourceId:'eastmoney-announcements',records:[current,background].map((entry,index)=>({name:entry.actor,code:index?'300502':'300308',title:entry.title,noticeDate:entry.time,time:entry.time+'T08:00:00.000+08:00',url:entry.url}))}}
 const draft={...artifact,title:'公司公告',items:[current,background]},repaired={...draft,items:[current]}
 const f=await run([draft,repaired],{records:[[source],[]]})
 expect(f.result.state).toBe('completed');expect(f.model.items).toHaveLength(1)
 expect(f.model.items[0]).toMatchObject({title:current.title,time:current.time,url:current.url})
 for(const value of [background.title,background.time,background.url])expect(f.model.note).toContain(value)
})

// Final I1/I2/I3 counterexamples: fake model/transport, production Runtime.
it.each(['markdown','html','retained'])('final obligation survives second %s envelope with no originals',async type=>{
 const replacement=type==='markdown'?{version:1,type,title:'已核验新闻',content:'甲公司发布产品，乙公司已完成政策调整，全部新闻已核验。'}:type==='retained'?JSON.parse(acceptArtifactOutput(JSON.stringify(artifact))):{version:1,type:'html',title:'已核验新闻',html:'<article>甲公司发布产品，全部新闻已核验。</article>'}
 const f=await run([artifact,replacement],{read:async()=>{throw Error('no original')}})
 expect(f.result.state).toBe('failed');expect(f.result.finalOutput).toBeUndefined();expect(f.start).toHaveBeenCalledTimes(2);expect(f.result.error).toMatch(/原文|来源/)
})
it('final planned article obligation rejects a first markdown attempt too',async()=>{
 const f=await run([{version:1,type:'markdown',title:'公司新闻',content:'甲公司发布产品，乙公司已完成政策调整，全部新闻已核验。'}],{read:async()=>{throw Error('no original')}})
 expect(f.result.state).toBe('failed');expect(f.start).toHaveBeenCalledTimes(2)
})
it('final canonical sourced retained timeline is rendered by the trusted host',async()=>{
 const retained=JSON.parse(acceptArtifactOutput(JSON.stringify(artifact)))
 retained.html='<p>FAKE VISIBLE FACT</p>'+retained.html
 expect(retained.html).toContain('FAKE VISIBLE FACT')
 const f=await run([retained],{records:[[fetchedWebPageRecord(url,page.content)]]})
 expect(f.result.state,f.result.error).toBe('completed');expect(f.start).toHaveBeenCalledOnce();expect(f.model.items).toEqual([item]);expect(f.result.finalOutput).not.toContain('FAKE VISIBLE FACT')
})
it('final original-only announcement scope rejects a widened model range',async()=>{
 const notice={...item,time:'2026-09-10',title:'甲公司产品公告',url:'https://data.eastmoney.com/notices/detail/300308/AN202609100000000001.html'}
 const source={tool:'public_data_query',args:{operation:'query',source:'eastmoney-announcements'},response:{sourceId:'eastmoney-announcements',records:[{name:'甲公司',code:'300308',title:notice.title,noticeDate:notice.time,time:notice.time+'T08:00:00.000+08:00',url:notice.url}]}}
 const f=await run([{...artifact,range:'2026-09-01至2026-10-21',items:[notice]}],{records:[[source]],hostContext:{...context,workbenchRequest:{originalRequest:'创建甲公司真实新闻和公告工作台，窗口2026-10-01至2026-10-21。',dataMode:'source'}}})
 expect(f.result.state).toBe('failed');expect(f.start).toHaveBeenCalledTimes(2)
})
it('final legacy news scope is separate from a future meeting scope',async()=>{
 const f=await run([{...artifact,range:'2026-09-21至2026-10-20'}],{hostContext:{...context,workbenchRequest:{originalRequest:'创建甲公司真实工作台：相关新闻 2026-09-21 至 2026-10-20；未来行业会议 2026-10-21 至 2026-10-31。',dataMode:'source'}}})
 expect(f.result.state).toBe('completed');expect(f.start).toHaveBeenCalledOnce();expect(f.model.items).toEqual([item])
})

it.each(['standalone','simulated','supplied'])('final sticky source obligation preserves %s compatibility',async mode=>{
 const hostContext=mode==='standalone'?null:{...context,workbenchRequest:{originalRequest:mode==='supplied'?'仅用我提供的新闻原文创建新闻工作台。':'创建模拟新闻工作台。',dataMode:mode==='simulated'?'simulated':'source'}}
 const f=await run([{version:1,type:'markdown',title:'整理内容',content:'这里是用户允许的普通说明文字，保留原始材料和演示内容。'}],{hostContext})
 expect(f.result.state,f.result.error).toBe('completed');expect(f.start).toHaveBeenCalledOnce();expect(f.reads).not.toHaveBeenCalled()
})
it('final original-only announcement window keeps a valid record and an excluded proven background without false counts',async()=>{
 const notices=['2026-10-15','2026-09-10'].map((time,index)=>({id:'notice-'+index,title:index?'甲公司历史公告':'甲公司产品公告',actor:'甲公司',time,url:`https://data.eastmoney.com/notices/detail/300308/AN${time.replaceAll('-','')}0000000001.html`}))
 const source={tool:'public_data_query',args:{operation:'query',source:'eastmoney-announcements'},response:{sourceId:'eastmoney-announcements',records:notices.map(n=>({name:'甲公司',code:'300308',title:n.title,noticeDate:n.time,time:n.time+'T08:00:00.000+08:00',url:n.url}))}}
 const f=await run([{...artifact,title:'2条已核验公告',range:'2026-09-01至2026-10-21',items:notices}],{records:[[source]],hostContext:{...context,workbenchRequest:{originalRequest:'创建甲公司真实新闻和公告工作台，窗口2026-10-01至2026-10-21。',dataMode:'source'}}})
 expect(f.result.state,f.result.error).toBe('completed');expect(f.start).toHaveBeenCalledTimes(2)
 expect(f.model.items).toHaveLength(1);expect(f.model.items[0].time).toBe('2026-10-15');expect(f.model.title).not.toContain('2条')
 for(const value of [notices[1].title,notices[1].time,notices[1].url,'展示 1 条','未计入'])expect(f.model.note).toContain(value)
})
