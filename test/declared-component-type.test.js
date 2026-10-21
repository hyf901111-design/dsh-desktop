import {expect,it,vi} from 'vitest'
import * as output from '../packages/dsh-research-task-runtime/artifact-output.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {fetchedWebPageRecord} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const url='https://example.org/policy/original',title='本人验收政策记录'
const data={version:1,title:'政策动态',items:[{title,date:'2026-01-30',url,summary:'【原文】本人验收记录。【分析】用于验证来源校验。'}],note:'保留原始日期与来源。'}
const restore=(value=data,type='news')=>output.restoreDeclaredArtifactType?.(JSON.stringify(value),type)

it('restores only the declared news discriminator without changing any business fields',()=>{
 const before=JSON.stringify(data),text=restore()
 expect(text).toBeTypeOf('string');expect(JSON.parse(text)).toEqual({...data,type:'news'})
 expect(JSON.stringify(data)).toBe(before);expect(restore(JSON.parse(text))).toBeUndefined()
})

it('keeps a declared sourced table as data while preserving zero and negative values',()=>{
 const table={version:1,title:'本人记录',columns:['项目','数值（元）'],rows:[['零',0],['负值',-120]],note:'本人输入记录，保留单位元。'}
 expect(JSON.parse(restore(table,'table'))).toEqual({...table,type:'table'})
})

it('does not infer a standalone custom component type from words in the user prompt',async()=>{
 const start=vi.fn(async()=>({childSessionId:'custom',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(data)}]})}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'custom'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'custom',kind:'container',prompt:'创建一个新闻阅读组件'})
  await vi.waitFor(()=>expect(runtime.inspect({parentSessionId:'parent',taskId:'custom'}).state).toBe('failed'))
  expect(runtime.inspect({parentSessionId:'parent',taskId:'custom'}).finalOutput).toBeUndefined()
 }finally{await runtime.dispose()}
})

it.each(['no-contract','unknown-type','explicit-type','null-type','missing-title','missing-items','wrong-version','multiple-objects'])('does not guess incomplete or conflicting component contracts: %s',mode=>{
 const value=structuredClone(data)
 if(mode==='explicit-type')value.type='reports'
 if(mode==='null-type')value.type=null
 if(mode==='missing-title')delete value.title
 if(mode==='missing-items')delete value.items
 if(mode==='wrong-version')value.version=7
 const text=mode==='multiple-objects'?JSON.stringify(value)+'\n'+JSON.stringify(value):JSON.stringify(value)
 expect(output.restoreDeclaredArtifactType?.(text,mode==='no-contract'?undefined:mode==='unknown-type'?'unknown':'news')).toBeUndefined()
})

it.each(['valid-source','unverified-source'])('routes an omitted type through host feed acquisition and the original source gate: %s',async mode=>{
 const evidence=`${title}\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[{title,date:'2026-01-30',url}]})}\n[/网页主文记录]\n\n原文内容。`
 const acquireFeedEvidence=vi.fn(async()=>({records:mode==='valid-source'?[fetchedWebPageRecord(url,evidence)]:[],evidence}))
 const start=vi.fn(async()=>({childSessionId:'declared-news',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(data)}],sourceRecords:[{tool:'web_fetch',purpose:'snapshot',args:{url:'https://example.org/other'},snapshotRows:[]}],acquireFeedEvidence})}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'declared-news-task'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'news',kind:'container',prompt:'工作台：政策研究\n本面板：政策动态\n取得实际政策原文与日期；仅生成本面板，优先使用 news 类型。'})
  await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.inspect({parentSessionId:'parent',taskId:'declared-news-task'}).state))
  const result=runtime.inspect({parentSessionId:'parent',taskId:'declared-news-task'})
  expect(acquireFeedEvidence).toHaveBeenCalledOnce()
  if(mode==='valid-source'){
   expect(result.state).toBe('completed');expect(start).toHaveBeenCalledOnce()
   expect(readTemplateModel(JSON.parse(result.finalOutput)).data).toEqual({...data,type:'news'})
  }else{expect(result.state).toBe('failed');expect(result.error).toMatch(/原文链接未能对应|尚未与同一条来源记录对应/);expect(result.finalOutput).toBeUndefined()}
 }finally{await runtime.dispose()}
})
