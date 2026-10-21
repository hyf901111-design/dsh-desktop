import {expect,it,vi} from 'vitest'
import {restoreSnapshotFeedHeadlines,resolveBoundComponent} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {materializeComponentMapping} from '../packages/dsh-research-task-runtime/component-data-refresh.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const row={symbol:'sh600011',code:'600011',name:'华能国际',title:'华能国际:华能国际关于第十四期超短期融资券发行的公告',time:'2026-10-20T17:34:18.892+08:00',displayTime:'2026-10-20 17:34:18:892',noticeDate:'2026-10-21',category:'其他',publisher:'华能国际 · 600011',summary:null,url:'https://data.eastmoney.com/notices/detail/600011/AN202610201830720785.html'}
const record={tool:'public_data_query',args:{operation:'query',source:'eastmoney-announcements',parameters_json:'{"symbol":"sh600011","limit":14}'},response:{sourceId:'eastmoney-announcements',source:'东方财富证券公告列表',receivedAt:'2026-10-21T00:00:00.000Z',records:[row],coverage:{symbol:'sh600011',scope:'first-page',returned:1}}}
const feed={version:1,type:'news',title:'近期公司公告',note:'煤价长协数据本次未取得。',items:[{title:row.title,summary:'巨潮转载的原文摘要：公司盈利大增。',date:'2026-10-21',category:'融资',url:row.url}]}

it('uses the exact observed announcement and separates source display time from its disclosure date',()=>{
 const before=JSON.stringify(feed),data=JSON.parse(restoreSnapshotFeedHeadlines(before,[record]))
 expect(data.items[0]).toMatchObject({title:row.title,date:row.noticeDate,time:'公告日',category:'华能国际 · 600011',publisher:'东方财富证券公告列表 · 华能国际 · 600011'})
 expect(data.items[0].summary).toContain('2026-10-20 17:34:18.892')
 expect(data.items[0].summary).toContain('列表展示')
 expect(data.items[0].summary).toContain('来源未提供原文摘要')
 expect(data.items[0].summary).not.toContain('巨潮')
 expect(data.items[0].summary).not.toContain('盈利大增')
 expect(data.note).toContain(feed.note)
 expect(data.note).toContain('首页')
 expect(JSON.stringify(feed)).toBe(before)
 expect(restoreSnapshotFeedHeadlines(JSON.stringify(data),[record])).toBeUndefined()
})

it.each(['unknown-link','other-provider','discovery','conflicting-title'])('does not restore source-specific details from %s',mode=>{
 const input=structuredClone(feed),sources=structuredClone([record])
 if(mode==='unknown-link')input.items[0].url=input.items[0].url.replace('AN202610201830720785','AN199901019999999999')
 if(mode==='other-provider')sources[0].response.sourceId='another-provider'
 if(mode==='discovery')sources[0].purpose='discovery'
 if(mode==='conflicting-title')sources[0].response.records.push({...row,title:'同一公告编号的另一条完全不同标题'})
 expect(restoreSnapshotFeedHeadlines(JSON.stringify(input),sources)).toBeUndefined()
})

it('retains an absent source timestamp as unknown instead of borrowing the notice date',()=>{
 const source=structuredClone(record);source.response.records[0].time=null;source.response.records[0].displayTime=null
 const data=JSON.parse(restoreSnapshotFeedHeadlines(JSON.stringify(feed),[source]))
 expect(data.items[0].date).toBe('2026-10-21')
 expect(data.items[0].summary).toContain('列表展示时间未提供')
})

it('keeps the same source-derived headline and dates during initial mapping and a later refresh',()=>{
 const mapping={version:1,type:'news',title:'公告',items:{$from:'q',$each:'records',$map:{title:{$path:'title'},date:{$path:'noticeDate'},summary:'未核实的盈利大增解读',url:{$path:'url'}}}}
 const result=resolveBoundComponent(JSON.stringify({version:1,type:'data-bound',requests:[{key:'q',tool:record.tool,args:record.args}],mapping}),[record])
 expect(result.data.items[0].title).toBe(row.title)
 expect(result.data.items[0].summary).not.toContain('盈利大增')
 const refreshed=structuredClone(record);refreshed.response.records[0].time='2026-10-20T18:34:18.000+08:00'
 const data=materializeComponentMapping(result.recipe.mapping,{q:refreshed.response},new Date(),[refreshed])
 expect(data.items[0].summary).toContain('18:34:18.000')
 expect(data.items[0].summary).not.toContain('17:34:18.892')
 expect(data.items[0].title).toBe(row.title)
})

it('delivers original source metadata in one actual worker without re-researching or binding a static feed',async()=>{
 const start=vi.fn(async()=>({childSessionId:'ann-provenance',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(feed)}],sourceRecords:[record]}),dispose:async()=>{}})),bindData=vi.fn()
 const runtime=new ResearchTaskRuntime({adapter:{start,bindData},storage:{save:async()=>{}},createId:()=> 'ann-provenance'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'ann',kind:'container',prompt:'工作台：火电研究\n本面板：公司公告\n优先使用 news 类型。只取本次真实快照，保留公告日期与列表展示时间。'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'ann-provenance'}).state).toBe('completed'))
  const model=readTemplateModel(JSON.parse(runtime.inspect({parentSessionId:'parent',taskId:'ann-provenance'}).finalOutput))
  expect(model.data.items[0].title).toBe(row.title)
  expect(model.data.items[0].summary).toContain('列表展示')
  expect(start).toHaveBeenCalledOnce();expect(bindData).not.toHaveBeenCalled()
 }finally{await runtime.dispose()}
})
