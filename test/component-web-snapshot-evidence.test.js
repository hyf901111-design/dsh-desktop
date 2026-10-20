import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {componentSourceCollector,componentSnapshotEvidence} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'

const observed=JSON.parse(readFileSync(new URL('./fixtures/component-web-fetch-announcements.json',import.meta.url),'utf8'))
function collect(calls=observed.calls,{failed=false,prefix=''}={}){
 const collector=componentSourceCollector(['public_data_query','web_fetch'])
 const accept=(id,name,args,text,isError=false)=>{
  collector.accept({type:'tool/call',data:{callId:id,name,arguments:JSON.stringify(args)}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:id},content:[{type:'tool-result',isError,content:[{type:'text',text}]}]}}})
 }
 accept('catalog','public_data_query',{operation:'catalog'},'{"sources":[{"name":"接口目录"}]}')
 calls.forEach((c,i)=>accept('page-'+i,'web_fetch',{url:c.url},`Fetched ${c.url} (HTTP 200)\n\n${prefix}${JSON.stringify(c.data)}`,failed))
 return collector.records
}
const proof=(artifact,records)=>componentSnapshotEvidence(JSON.stringify(artifact),records)

it('recognizes observed announcement list records behind their different detail URLs',()=>{
 const records=collect()
 expect(proof(observed.artifact,records)).toBe(true)
 expect(records.filter(r=>r.tool==='web_fetch').every(r=>r.response===null)).toBe(true)
})

it('does not promote JSON examples embedded in fetched API documentation into business records',()=>{
 expect(proof(observed.artifact,collect(observed.calls,{prefix:'API documentation. Example response:\n'}))).toBe(false)
})

it('retains only bounded public record fingerprints, including the real fetch transport preamble',()=>{
 const calls=structuredClone(observed.calls)
 calls[0].data.data.list[0].body='Do not retain this full public page body'
 const records=collect(calls,{prefix:'[网页读取状态：已滚动至文末，完成正文收集]\n\n'})
 expect(proof(observed.artifact,records)).toBe(true)
 expect(JSON.stringify(records)).not.toContain('Do not retain this full public page body')
})

it('completes the actual public announcement output without a discovery-only repair or refresh binding',async()=>{
 const records=collect(),bindData=vi.fn(),start=vi.fn(async()=>({childSessionId:'announcements',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(observed.artifact)}],sourceRecords:records}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},createId:()=> 'announcements'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'reports',kind:'container',prompt:'工作台：真实公司研究\n本面板：近期公告\n优先使用 reports 类型。查询真实公告标题和日期，保留原文链接，只取本次快照。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'announcements'}).state).toBe('completed'))
  expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
  expect(runtime.inspect({parentSessionId:'parent',taskId:'announcements'}).finalOutput).toContain('AN202610151830531389')
 }finally{await runtime.dispose()}
})

it('uses a nested article link actually returned by the source without trusting unrelated links',()=>{
 const url='https://example.org/api/news',item={title:'An observed business announcement',date:'2026-10-15',url:'https://publisher.example.net/story/observed-483838'}
 const records=collect([{url,data:{records:[{headline:item.title,publishedAt:item.date,article:{href:item.url}}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...item,url:'https://publisher.example.net/story/unobserved'}]},records)).toBe(false)
})

it.each(['array','object'])('keeps a related article with its own identity separate from its parent record (%s)',shape=>{
 const first={title:'An observed first business announcement',date:'2026-10-15',url:'https://example.org/articles/first-record-483838.html'}
 const related={title:'A different related business announcement',date:'2026-10-16',url:'https://example.org/articles/other-record-747474.html'}
 const child={...related,id:'other-record-747474'}
 const records=collect([{url:'https://example.org/api/news',data:{records:[{...first,id:'first-record-483838',article:{href:first.url},relatedArticles:shape==='array'?[child]:child}]}}])
 expect(proof({version:1,type:'reports',items:[first]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[related]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...first,url:related.url}]},records)).toBe(false)
})

it('matches an observed identifier only as a complete same-host detail URL segment',()=>{
 const item={title:'Observed company shareholder meeting announcement',date:'2026-10-15',url:'https://example.org/articles/observed-483838.html'}
 const records=collect([{url:'https://example.org/api/records',data:{records:[{id:'observed-483838',title:item.title,date:item.date}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...item,url:item.url.replace('example.org','news.example.org')}]},records)).toBe(false)
})

it.each([
 ['示例股份：关于不实施本年度现金分红计划的公告','示例股份：关于实施本年度现金分红计划的公告'],
 ['示例股份：关于本年度拟投资10亿元的公告','示例股份：关于本年度拟投资1亿元的公告'],
 ['示例股份：本年度净利润变动为-10.5%的公告','示例股份：本年度净利润变动为10.5%的公告'],
 ['示例股份：本年度净利润变动为10.5%的公告','示例股份：本年度净利润变动为105%的公告']
])('does not verify changed business wording or numbers under the same record ID: %s',(title,changed)=>{
 const item={title,date:'2026-10-20',url:'https://example.org/articles/observed-483838.html'}
 const records=collect([{url:'https://example.org/api/records',data:{records:[{id:'observed-483838',title,date:item.date}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(true)
 expect(proof({version:1,type:'reports',items:[{...item,title:changed}]},records)).toBe(false)
})

it.each(['documentation','sample','example'])('does not treat a %s=true envelope as actual business list data',marker=>{
 const calls=observed.calls.map(call=>({...call,data:{[marker]:true,...call.data}}))
 expect(proof(observed.artifact,collect(calls))).toBe(false)
})

it('does not borrow a link from an explicitly marked example wrapper',()=>{
 const item={title:'An observed company business announcement',date:'2026-10-15',url:'https://publisher.example.net/example/unobserved-1234'}
 const records=collect([{url:'https://example.org/api/news',data:{records:[{title:item.title,date:item.date,article:{example:true,href:item.url}}]}}])
 expect(proof({version:1,type:'reports',items:[item]},records)).toBe(false)
})

it.each(['unobserved-id','wrong-date','wrong-title','unrelated-host','public-suffix-host','url-substring','failed-fetch','document-example','business-error'])('rejects %s as evidence for a generated list',mode=>{
 let calls=structuredClone(observed.calls),artifact=structuredClone(observed.artifact),failed=false
 artifact.items=artifact.items.slice(0,1)
 if(mode==='unobserved-id')artifact.items[0].url=artifact.items[0].url.replace('AN202610151830531389','AN199901019999999999')
 if(mode==='wrong-date')artifact.items[0].date='2026-10-16'
 if(mode==='wrong-title')artifact.items[0].title='完全未出现的另一家企业重大业务公告'
 if(mode==='unrelated-host')artifact.items[0].url=artifact.items[0].url.replace('data.eastmoney.com','unobserved.example')
 if(mode==='public-suffix-host'){calls[0].url='https://api.one.com.cn/list';artifact.items[0].url=artifact.items[0].url.replace('data.eastmoney.com','other.com.cn')}
 if(mode==='url-substring')artifact.items[0].url=artifact.items[0].url.replace('AN202610151830531389','prefixAN202610151830531389suffix')
 if(mode==='failed-fetch')failed=true
 if(mode==='document-example')calls=calls.map(c=>({...c,data:{documentation:{examples:c.data}}}))
 if(mode==='business-error')calls=calls.map(c=>({...c,data:{...c.data,success:false}}))
 expect(proof(artifact,collect(calls,{failed}))).toBe(false)
})
