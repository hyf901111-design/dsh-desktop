import {expect,it,vi} from 'vitest'
import * as output from '../packages/dsh-research-task-runtime/artifact-output.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {fetchedWebPageRecord} from '../packages/dsh-research-task-runtime/component-source-binding.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'

const url='https://example.org/policy/original',title='已取得政策原文'
const data={version:1,type:'news',title:'政策记录',items:[{title,date:'2026-01-30',url,summary:'媒体报道的"回收比例"未在原文核实。'}],note:'所有"影响方向"均为分析。'}
const broken=value=>JSON.stringify(value).replaceAll('\\"','"')
const restore=text=>output.restoreArtifactStringQuotes?.(text)

it('recovers unescaped quotation marks inside complete artifact string values without changing business content',()=>{
 const raw=broken(data),fixed=restore(raw)
 expect(()=>JSON.parse(raw)).toThrow();expect(fixed).toBeTypeOf('string');expect(JSON.parse(fixed)).toEqual(data)
 expect(restore(fixed)).toBeUndefined()
})

it.each(['valid','escaped','missing-comma','missing-brace','truncated','multiple','wrong-version','incomplete-model','prose','broken-key'])('leaves ambiguous, incomplete or already valid JSON untouched: %s',mode=>{
 let raw=broken(data)
 if(mode==='valid')raw=JSON.stringify(data)
 if(mode==='escaped')raw=JSON.stringify({...data,note:'保留反斜杠 \\ 与已转义引号 "原文"。'})
 if(mode==='missing-comma')raw='{"version":1 "type":"news","title":"记录","items":[]}'
 if(mode==='missing-brace')raw=raw.slice(0,-1)
 if(mode==='truncated')raw=raw.slice(0,-30)
 if(mode==='multiple')raw+='\n'+raw
 if(mode==='wrong-version')raw=broken({...data,version:3})
 if(mode==='incomplete-model')raw=broken({...data,items:undefined})
 if(mode==='prose')raw='结果如下：'+raw
 if(mode==='broken-key')raw='{"version":1,"type":"news","ti"tle":"记录","items":[],"note":"一"句"话"}'
 expect(restore(raw)).toBeUndefined()
})

it.each([true,false])('still applies source validation after local quote recovery, verified source: %s',async verified=>{
 const evidence=`${title}\n\n[网页读取状态：已滚动至文末，完成正文收集]\n\n[网页主文记录]\n${JSON.stringify({articles:[{title,date:'2026-01-30',url}]})}\n[/网页主文记录]\n\n已取得的原文。`
 const records=verified?[fetchedWebPageRecord(url,evidence)]:[{tool:'web_fetch',purpose:'snapshot',snapshotRows:[]}]
 const start=vi.fn(async()=>({childSessionId:'quotes',dispose:async()=>{},result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:broken(data)}],sourceRecords:records})}))
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{load:async()=>({version:1,tasks:[]}),save:async()=>{}},createId:()=> 'quotes'})
 try{
  await runtime.start({parentSessionId:'parent',canvasNodeId:'news',kind:'container',prompt:'工作台：政策研究\n本面板：政策记录\n只用取得的政策原文，优先使用 news 类型。'})
  await vi.waitFor(()=>expect(['completed','failed']).toContain(runtime.inspect({parentSessionId:'parent',taskId:'quotes'}).state))
  const result=runtime.inspect({parentSessionId:'parent',taskId:'quotes'})
  if(verified){expect(result.state,result.error).toBe('completed');expect(start).toHaveBeenCalledOnce();expect(readTemplateModel(JSON.parse(result.finalOutput)).data).toEqual(data)}
  else{expect(result.state).toBe('failed');expect(result.finalOutput).toBeUndefined();expect(result.error).toMatch(/原文链接未能对应|尚未与同一条来源记录对应/)}
 }finally{await runtime.dispose()}
})

it('recovers a single fenced artifact with quoted missing-value punctuation without rewriting any data',()=>{
 const graph={version:1,type:'mind-map',title:'组织关系',content:'# 机构\n- 部门甲\n  - 负责人甲',source:{title:'附件',text:'"—"表示资料未确认，不代表岗位空缺。'}}
 expect(JSON.parse(restore('```json\n'+broken(graph)+'\n```'))).toEqual(graph)
 expect(restore('```json\n'+broken(graph)+'\n```\n另外一个对象')).toBeUndefined()
})
