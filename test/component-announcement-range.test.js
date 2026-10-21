import {readFileSync} from 'node:fs'
import {expect,it,vi} from 'vitest'
import {componentSourceCollector,fetchedWebPageRecord,componentFeedEvidenceIssue,componentSnapshotEvidence,restoreSnapshotFeedHeadlines,retainVerifiedFeedItems} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {normalizeAnnouncementFeed} from '../packages/dsh-research-task-runtime/announcement-provenance.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
const observed=JSON.parse(readFileSync(new URL('./fixtures/announcement-range-observed-20261021.json',import.meta.url),'utf8'))
function collect(calls=observed.calls){
 const collector=componentSourceCollector(['public_data_query'])
 calls.forEach((call,i)=>{
  collector.accept({type:'tool/call',data:{callId:String(i),name:'public_data_query',arguments:JSON.stringify(call.args)}})
  collector.accept({type:'tool/result',data:{message:{source:{callId:String(i)},content:[{type:'tool-result',content:[{type:'text',text:JSON.stringify(call.response)}]}]}}})
 })
 return collector.records
}
const records=collect(),text=value=>JSON.stringify(value)
const restored=()=>normalizeAnnouncementFeed(structuredClone(observed.artifact),records)
const trusted={panelRequest:'中际旭创、新易盛、工业富联公告，2026-09-21 至 2026-10-21。'}
const one=()=>({...restored(),items:[restored().items[2]]})
it('rejects the actual 21-item timeline with 11 dates outside its declared range after restoring original facts',()=>{
 const data=restored(),issue=componentFeedEvidenceIssue(text(data),records)
 expect(issue).toMatch(/范围|窗口/)
 expect(data.items.filter(item=>item.time<'2026-09-21'||item.time>'2026-10-21')).toHaveLength(11)
 expect(issue).toContain('11、12、13、14、15、16、17、18、20、21')
 expect(issue).toContain('第19条：标题未对应同条已取得公告')
 expect(componentSnapshotEvidence(text(data),records)).toBe(false)
 expect(data.items).toHaveLength(21)
})
it('retains all three actual companies and invalidates the old coverage counts after bounded repair',()=>{
 const data=restored(),result=retainVerifiedFeedItems(text(data),records,trusted)
 expect(result).toBeTypeOf('string')
 const kept=JSON.parse(result)
 expect(kept.items).toHaveLength(10)
 expect(new Set(kept.items.map(i=>i.actor))).toEqual(new Set(['中际旭创','新易盛','工业富联']))
 expect(kept.note).toContain('失效')
 expect(kept.note).toContain('11')
 expect(kept.note).toContain('新易盛')
 expect(kept.note).toContain('投资者关系管理信息20260911')
 expect(componentFeedEvidenceIssue(result,records,trusted)).toBeNull()
})
it('keeps noticeDate distinct from the same record display timestamp across a date boundary',()=>{
 const data=one(),row=observed.calls[2].response.records[0]
 data.items[0].time=row.time
 const fixed=JSON.parse(restoreSnapshotFeedHeadlines(text(data),records))
 expect(fixed.items[0].time).toBe('2026-10-12')
 expect(fixed.items[0].summary).toContain('2026-10-11')
 expect(componentFeedEvidenceIssue(text(fixed),records)).toBeNull()
 expect(componentFeedEvidenceIssue(text(data),records)).toMatch(/日期/)
})
it.each(['noticeDate','title','code','name'])('does not restore or accept a same-URL conflicting source %s',key=>{
 const calls=structuredClone(observed.calls),row=calls[2].response.records[0]
 calls[2].response.records.push({...row,[key]:key==='noticeDate'?'2026-10-13':key==='code'?'300502':key==='name'?'新易盛':'另一条极相似公告'})
 const sources=collect(calls),data=one()
 expect(restoreSnapshotFeedHeadlines(text(data),sources)).toBeUndefined()
 expect(componentFeedEvidenceIssue(text(data),sources)).toMatch(/歧义|冲突/)
})
it('does not restore a wrong company to match a link belonging to another company',()=>{
 const data=one();data.items[0].actor='新易盛';data.items[0].object='新易盛 300502'
 expect(restoreSnapshotFeedHeadlines(text(data),records)).toBeUndefined()
 expect(componentFeedEvidenceIssue(text(data),records)).toMatch(/公司/)
})
it.each(['2026-10-11','2026-02-31','2026-10-12T00:00:00+08:00',null])('does not invent or borrow a notice date from %s',noticeDate=>{
 const calls=structuredClone(observed.calls);calls[2].response.records[0].noticeDate=noticeDate
 const sources=collect(calls),data=one()
 if(noticeDate==='2026-10-11'){
  expect(componentFeedEvidenceIssue(text(data),sources)).toMatch(/日期/)
 }else{
  data.items[0].time=null;data.items[0].timeMissing='公告日期未提供'
  const fixed=normalizeAnnouncementFeed(data,sources)
  expect(fixed.items[0].time).toBeNull()
  expect(componentFeedEvidenceIssue(text(fixed),sources)).toMatch(/日期|窗口/)
  delete fixed.range
  expect(componentFeedEvidenceIssue(text(fixed),sources)).toBeNull()
 }
})
it.each(['2026-09-21','2026-10-21'])('includes the exact boundary notice day %s',noticeDate=>{
 const calls=structuredClone(observed.calls);calls[2].response.records[0].noticeDate=noticeDate
 const data=one();data.items[0].time=noticeDate
 expect(componentFeedEvidenceIssue(text(data),collect(calls),trusted)).toBeNull()
})
it('enforces the trusted request even after the model broadens or removes the range label',()=>{
 const data=restored();data.range='2026-09-01 至 2026-10-21'
 expect(componentFeedEvidenceIssue(text(data),records,trusted)).toMatch(/窗口|范围/)
 delete data.range
 expect(componentFeedEvidenceIssue(text(data),records,trusted)).toMatch(/窗口|范围/)
})
it('does not infer calendar dates from vague relative language or source fetch timestamps',()=>{
 const data=one();delete data.range
 expect(componentFeedEvidenceIssue(text(data),records,{panelRequest:'近期公告，近一个月。'})).toBeNull()
})
it('applies announcement identity and date checks to news and reports as well',()=>{
 for(const type of ['news','reports']){
  const data={version:1,type,title:'公告',items:[{title:one().items[0].title,date:'2026-10-11',url:one().items[0].url}]}
  expect(componentFeedEvidenceIssue(text(data),records)).toMatch(/日期/)
 }
})
it('leaves unrelated ordinary and simulated timelines and other feeds at their existing boundary',()=>{
 const data={version:1,type:'timeline',title:'普通时间线',range:'2026-09-21 至 2026-10-21',items:[{id:'a',title:'自定义活动',time:'2026-09-01',url:'https://example.org/event'}]}
 expect(componentFeedEvidenceIssue(text(data),records,{panelRequest:'普通时间线'})).toBeNull()
 expect(normalizeAnnouncementFeed(data,records)).toBe(data)
 expect(componentFeedEvidenceIssue(text({...data,items:[]}),[])).toBeNull()
})
it('does not produce a successful empty fallback when no announcement lies in the window',()=>{
 const data=restored();data.items=data.items.slice(10)
 expect(retainVerifiedFeedItems(text(data),records,trusted)).toBeUndefined()
})
it('enters one bounded runtime repair and preserves verified companies with explicit excluded-record gaps',async()=>{
 const start=vi.fn(async()=>({childSessionId:'announcement-range',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:text(observed.artifact)}],sourceRecords:records}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'announcement-range'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'ann',kind:'container',prompt:'工作台：真实公告\n本面板：三家公司公告\n'+trusted.panelRequest+'\n仅生成本面板，优先使用 timeline 类型。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'announcement-range'}).state).toBe('completed'))
  const data=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'announcement-range'}).finalOutput)).data
  expect(data.items).toHaveLength(10)
  expect(data.note).toContain('11')
  expect(start).toHaveBeenCalledTimes(2)
  expect(start.mock.calls[1][0].prompt).toMatch(/窗口|范围/)
 }finally{await runtime.dispose()}
})

it('does not accept an empty announcement timeline as a successful verified snapshot',()=>{
 const data={...restored(),items:[]}
 expect(componentFeedEvidenceIssue(text(data),records,trusted)).toMatch(/没有|至少|1/)
 expect(componentSnapshotEvidence(text(data),records,trusted)).toBe(false)
})
it('invalidates stale coverage and reports the actual range reason when retaining announcement feeds',()=>{
 const data={...restored(),type:'news',items:restored().items.map(i=>({title:i.title,date:i.time,url:i.url}))}
 const result=retainVerifiedFeedItems(text(data),records,trusted)
 expect(result).toBeTypeOf('string')
 const kept=JSON.parse(result)
 expect(kept.items).toHaveLength(10)
 expect(kept.note).toContain('失效')
 expect(kept.note).toContain('窗口')
})
it.each(['financial','web'])('does not borrow unrelated %s snapshot evidence to verify an invalid announcement timeline',mode=>{
 const data=one();data.items[0].title='未取得的另一条公告'
 const source=mode==='financial'?{tool:'financial_query',purpose:'snapshot',response:{status:'complete',records:[{metric:'close',value:10}]}}:{tool:'web_fetch',purpose:'snapshot',args:{url:data.items[0].url},response:null}
 expect(componentSnapshotEvidence(text(data),[source,...records],trusted)).toBe(false)
})
it('rejects a substituted company in the headline even when its actor and object are absent',()=>{
 const data=one();delete data.items[0].actor;delete data.items[0].object;data.items[0].title='新易盛：关于公司经营的公告'
 expect(restoreSnapshotFeedHeadlines(text(data),records)).toBeUndefined()
 expect(componentFeedEvidenceIssue(text(data),records)).toMatch(/公司/)
})
it('reports identity mismatch as an identity gap rather than blaming its in-window date',()=>{
 const data=one();data.items.push({...data.items[0],id:'wrong-company',actor:'新易盛',object:'新易盛 300502'})
 const kept=JSON.parse(retainVerifiedFeedItems(text(data),records,trusted))
 expect(kept.items).toHaveLength(1)
 expect(kept.note).toContain('同条来源身份或日期未核验')
})

it('keeps a different Eastmoney feed on its original web-record identity boundary',()=>{
 const item={title:'另一个已取得的市场资讯标题',date:'2026-10-21',url:'https://data.eastmoney.com/report/market-story.html'}
 const web=fetchedWebPageRecord('https://data.eastmoney.com/report/',JSON.stringify({records:[item]}))
 const data={version:1,type:'news',title:'市场资讯',items:[item]}
 expect(componentFeedEvidenceIssue(text(data),[...records,web])).toBeNull()
})
it.each(['same-company-other-notice','unknown-company','changed-business-number'])('does not rewrite a %s headline into the URL candidate before source acceptance',mode=>{
 const data={...restored(),items:[restored().items[0]]}
 const title=mode==='same-company-other-notice'?observed.calls[0].response.records[1].title:mode==='unknown-company'?'腾讯控股：关于公司经营的公告':'中际旭创：关于拟投资1亿元的公告'
 data.items[0].title=title;delete data.items[0].actor;delete data.items[0].object
 const before=text(data)
 expect(componentFeedEvidenceIssue(before,records,trusted)).toMatch(/标题|公司/)
 expect(restoreSnapshotFeedHeadlines(before,records)).toBeUndefined()
 expect(normalizeAnnouncementFeed(data,records)).toBe(data)
 expect(componentFeedEvidenceIssue(text(normalizeAnnouncementFeed(data,records)),records,trusted)).toMatch(/标题|公司/)
})
it('keeps another event and unknown company visible as identity gaps after one bounded repair',async()=>{
 const data={...restored(),items:[restored().items[0],{...restored().items[0],id:'other-event',title:observed.calls[0].response.records[1].title},{...restored().items[0],id:'unknown-company',title:'腾讯控股：关于公司经营的公告'}]}
 delete data.items[1].actor;delete data.items[1].object;delete data.items[2].actor;delete data.items[2].object
 const start=vi.fn(async()=>({childSessionId:'identity-repair',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:text(data)}],sourceRecords:records}),dispose:async()=>{}}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}},createId:()=> 'identity-repair'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'ann',kind:'container',prompt:'工作台：公告身份\n本面板：公司公告\n'+trusted.panelRequest+'\n仅生成本面板，优先使用 timeline 类型。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'identity-repair'}).state).toBe('completed'))
  const kept=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'identity-repair'}).finalOutput)).data
  expect(start).toHaveBeenCalledTimes(2)
  expect(kept.items).toHaveLength(1)
  expect(kept.note).toContain(data.items[1].title)
  expect(kept.note).toContain('腾讯控股')
  expect(kept.note).toContain('同条来源身份或日期未核验')
 }finally{await runtime.dispose()}
})
it('does not let generic web headline recovery bypass fixed-adapter announcement identity',()=>{
 const row=observed.calls[0].response.records[0],item={title:'腾讯控股：关于公司经营的公告',date:row.noticeDate,url:row.url}
 const web=fetchedWebPageRecord('https://data.eastmoney.com/notices/',JSON.stringify({records:[{title:row.title,date:row.noticeDate,url:row.url}]}))
 const data={version:1,type:'news',title:'公司公告',items:[item]}
 expect(restoreSnapshotFeedHeadlines(text(data),[...records,web])).toBeUndefined()
})

it.each(['中际旭创 : H股公告 （董事会会议日期）','H股公告（董事会会议日期）','H股公告（董事会会议日期）（类型：其他）'])('retains only proven display-metadata headline recovery: %s',title=>{
 const data={...restored(),items:[{...restored().items[0],title}]}
 const fixed=JSON.parse(restoreSnapshotFeedHeadlines(text(data),records))
 expect(fixed.items[0].title).toBe(observed.calls[0].response.records[0].title)
 expect(componentFeedEvidenceIssue(text(fixed),records,trusted)).toBeNull()
})
it('does not delete business words inside a source title to claim title equivalence',()=>{
 const data={...restored(),items:[restored().items[18]]}
 expect(restoreSnapshotFeedHeadlines(text(data),records)).toBeUndefined()
 expect(componentFeedEvidenceIssue(text(data),records,trusted)).toMatch(/标题未对应/)
})
