import {expect,it,vi} from 'vitest'
import * as binding from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const url='https://example.org/policy/verified',title='取得的政策原文标题'
const source=binding.fetchedWebPageRecord(url,`${title}\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[{title,date:'2026-01-30',url}]})}\n[/网页主文记录]\n\n实际取得的政策原文。`)
const data={version:1,type:'news',title:'政策动态',items:[{title,url,date:'2026-01-30',summary:'【原文】实际取得。【分析】演示判断。'},{title:'未核验的煤价报道',url:'https://example.org/other',date:'2026-10-12',summary:'未核验的具体煤价涨幅不能作为事实。'},{title:'电量安排类政策未取得',date:'未知',summary:'没有取得这一研究维度的政策原文。'}],note:'原研究范围：容量电价、煤价与电量安排；未使用模拟数据。'}
const restore=(value=data,records=[source])=>binding.retainVerifiedFeedItems?.(JSON.stringify(value),records)

it('keeps proven items unchanged and explicitly lists every unverified item and original scope in the note',()=>{
 const before=JSON.stringify({data,source}),text=restore();expect(text).toBeTypeOf('string')
 const corrected=JSON.parse(text)
 expect(corrected.items).toEqual([data.items[0]]);expect(corrected.note).toContain(data.note)
 for(const item of data.items.slice(1)){expect(corrected.note).toContain(item.title);if(item.url)expect(corrected.note).toContain(item.url)}
 expect(corrected.note).toContain('未通过原文核验');expect(corrected.note).not.toContain('未核验的具体煤价涨幅不能作为事实。')
 expect(binding.componentFeedEvidenceIssue(text,[source])).toBeNull();expect(restore(corrected)).toBeUndefined()
 expect(JSON.stringify({data,source})).toBe(before)
})

it.each(['all-unverified','all-valid','discovery-only','missing-source','no-items','wrong-version','wrong-type','multiple'])('does not fabricate an empty or unsupported successful result: %s',mode=>{
 const value=structuredClone(data);let records=[source]
 if(mode==='all-unverified')value.items.shift()
 if(mode==='all-valid')value.items=[value.items[0]]
 if(mode==='discovery-only')records=[{...source,purpose:'discovery'}]
 if(mode==='missing-source')records=[]
 if(mode==='no-items')value.items=[]
 if(mode==='wrong-version')value.version=2
 if(mode==='wrong-type')value.type='table'
 const text=JSON.stringify(value)+(mode==='multiple'?'\n'+JSON.stringify(value):'')
 expect(binding.retainVerifiedFeedItems?.(text,records)).toBeUndefined()
})

it('uses the existing single synthesis attempt before publishing proven records with visible gaps',async()=>{
 const start=vi.fn(async()=>({childSessionId:'partial',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(data)}],sourceRecords:[source]})}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'partial'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'news',kind:'container',prompt:'工作台：政策研究\n本面板：政策动态\n只用真实取得的原文，缺失明确说明。仅生成本面板，优先使用 news 类型。'})
  await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.inspect({parentSessionId:'parent',taskId:'partial'}).state))
  const result=runtime.inspect({parentSessionId:'parent',taskId:'partial'})
  expect(result.state,result.error).toBe('completed');expect(start).toHaveBeenCalledTimes(2)
  const model=readTemplateModel(JSON.parse(result.finalOutput)).data
  expect(model.items).toEqual([data.items[0]]);expect(model.note).toContain('未核验的煤价报道');expect(model.note).toContain('电量安排类政策未取得')
 }finally{await runtime.dispose()}
})
