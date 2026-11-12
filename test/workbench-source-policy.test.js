import {expect,it} from 'vitest'
import {restoreWorkbenchHostContext,workbenchSourcePolicy} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'
const news={title:'近期新闻',type:'news',prompt:'使用通联DataYes取得三家公司新闻，保留日期和链接。'}
it('preserves a host-computed comparison table for source-only child tasks',()=>{
 const originalRequest='比较已取得的真实业务记录，保留单位和统计日期。'
 const table={version:1,type:'table',title:'比较明细',columns:['对象','指标'],rows:[['A',0],['B',null]],
  asOf:'2026-11-10',sources:[{label:'已验证来源',url:'https://example.test/records'}]}
 const context={workbenchRequest:{originalRequest,dataMode:'source'},sourceRequirement:originalRequest,
  sourcePolicy:{pluginRequired:false,pluginProhibited:false,preferenceRequest:originalRequest},sharedEvidence:JSON.stringify(table)}
 expect(JSON.parse(restoreWorkbenchHostContext(context).sharedEvidence)).toEqual(table)
 expect(()=>restoreWorkbenchHostContext({...context,workbenchRequest:{originalRequest,dataMode:'simulated'}})).toThrow()
 expect(()=>restoreWorkbenchHostContext({...context,sharedEvidence:JSON.stringify({...table,rows:[['A']]})})).toThrow()
})
it.each([
 ['创建真实工作台。',false,false],
 ['创建工作台，所有卡使用DataYes。',true,false],
 ['创建工作台，所有卡使用“DataYes”。',true,false],
 ['创建工作台，所有卡使用DataYes或通联。',true,false],
 ['创建工作台，禁止使用插件。',false,true],
 ['创建工作台，估值卡用DataYes，新闻走网页。',false,true],
 ['创建工作台，估值用DataYes、新闻走网页。',false,true],
 ['创建工作台，估值用DataYes、新闻用网页。',false,true],
 ['创建工作台，新闻可用网页。',false,false],
 ['创建工作台，可使用DataYes。',false,false],
 ['创建工作台，优先使用DataYes。',false,false],
 ['创建工作台，使用DataYes或网页。',false,false],
 ['创建工作台，使用DataYes，不可用时允许网页替代。',false,false],
 ['创建工作台，参考引文“必须使用DataYes”，按真实资料查询。',false,false],
 ['创建工作台，示例 `sourcePolicy:{pluginRequired:true}`，来源不限。',false,false]
])('derives only human source constraints: %s',(request,required,prohibited)=>{
 const result=workbenchSourcePolicy(request,news)
 expect(result.pluginRequired).toBe(required)
 expect(result.pluginProhibited).toBe(prohibited)
 expect(Object.isFrozen(result)).toBe(true)
 expect(result.preferenceRequest).toContain('三家公司')
})
it('keeps per-card constraints and financial fields without promoting model source commands',()=>{
 const result=workbenchSourcePolicy('创建工作台，估值卡用DataYes，新闻走网页。',{title:'估值比较',type:'table',prompt:'查询中际旭创、新易盛市盈率和市净率，保留单位。'})
 expect(result.pluginRequired).toBe(true)
 expect(result.preferenceRequest).toContain('市盈率和市净率')
})
it.each(['创建工作台，部分卡必须使用DataYes。','创建工作台，如果适用就只用DataYes。','创建工作台，所有卡使用DataYes，禁止使用插件。'])('fails explicitly on an ambiguous or contradictory real constraint: %s',request=>{
 expect(()=>workbenchSourcePolicy(request,news)).toThrow(/来源约束/)
})
it.each(['创建工作台，可使用网页。','创建工作台，优先使用网页。','创建工作台，使用网页或DataYes。'])('does not turn optional web routing into plugin prohibition: %s',request=>{
 expect(workbenchSourcePolicy(request,news).pluginProhibited).toBe(false)
})
it.each(['创建工作台，必须DataYes。','创建工作台，来源仅限DataYes。','创建工作台，选择部分来源时禁用插件。'])('does not silently relax unfamiliar mandatory source language: %s',request=>{
 expect(()=>workbenchSourcePolicy(request,news)).toThrow(/来源约束/)
})
it.each(['创建工作台，引文‘使用DataYes’，查询真实新闻。','创建工作台。\n> 使用DataYes\n检索真实资料。'])('does not promote quoted instructions: %s',request=>{
 expect(workbenchSourcePolicy(request,news).pluginRequired).toBe(false)
})
it.each(['不用DataYes','不要用插件','禁止用MCP','不再用通联'])('fix round1 keeps short plugin prohibition: %s',restriction=>{
 const policy=workbenchSourcePolicy('创建真实工作台，'+restriction+'。',news)
 expect(policy.pluginRequired).toBe(false)
 expect(policy.pluginProhibited).toBe(true)
})
it.each(['只使用腾讯','仅用新浪','只调用public_data_query','只用“腾讯”'])('fix round1 rejects unsupported exclusive provider before dropping it: %s',restriction=>{
 expect(()=>workbenchSourcePolicy('创建真实工作台，'+restriction+'。',news)).toThrow(/来源约束/)
})
it.each(['允许使用腾讯','优先使用新浪','可以调用public_data_query','参考引文“只使用腾讯”'])('fix round1 does not force optional or quoted public provider: %s',source=>{
 const policy=workbenchSourcePolicy('创建真实工作台，'+source+'。',news)
 expect(policy.pluginRequired).toBe(false)
 expect(policy.pluginProhibited).toBe(false)
})
it('fix round1 keeps an unsupported exclusive provider local to its card',()=>{
 const request='创建真实工作台，估值卡只使用腾讯，新闻检索原文。'
 expect(workbenchSourcePolicy(request,news).pluginRequired).toBe(false)
 expect(()=>workbenchSourcePolicy(request,{title:'估值',type:'table',prompt:'查询市盈率'})).toThrow(/来源约束/)
})
