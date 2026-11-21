import {afterEach,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {registerWorkbenchExecutionPolicy} from '../packages/dsh-research-task-runtime/workbench-execution-policy.js'

const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'))
const layout=fixture('workbench-layout-delivery-requests.json'),fixed=fixture('workbench-public-table-requests.json')
const sources=['web_search','web_fetch','public_data_query','financial_query']
const tools=['research_workbench_create',...sources,'research_canvas_use'].map(name=>({name,parameters:{type:'object',properties:{}}}))
const dispose=[]
afterEach(()=>dispose.splice(0).forEach(fn=>fn()))
function planning(text){
 const message={id:'disclosure',role:'user',source:{kind:'user',clientMode:'research'},content:[{type:'text',text}]}
 const session={header:{},events:[{type:'turn/start',data:{turn:1}},{type:'user/message',data:message}]}
 const agent={session},hooks=new Map(),signal=new AbortController().signal
 dispose.push(registerWorkbenchExecutionPolicy({tools:{guard:()=>()=>{}},systemPrompt:{context:()=>()=>{}},on:(event,fn)=>{hooks.set(event,fn);return()=>{}}}))
 return {session,wire:()=>hooks.get('agent/request-context')({agent,turn:1,signal},async()=>({system:'base',messages:[message],tools}))}
}
const names=wire=>wire.tools.map(tool=>tool.name)
it.each(['资管例外追踪','ETF逐项稽核'])('starts the actual %s disclosure with its pasted rows and can regain the original sources',async role=>{
 const run=planning(layout[role]),first=await run.wire()
 expect(names(first)).toEqual(['research_workbench_create','web_search'])
 expect(first.system).toContain('pastedTable');expect(first.system).not.toContain('【已适配')
 run.session.events.push({type:'tool/call',data:{name:'web_search',callId:'missing-field',arguments:'{}'}})
 const next=await run.wire()
 expect(names(next)).toEqual(['research_workbench_create',...sources])
})
it.each(['资管经营','ETF持仓'])('honors the stated exclusive-source instruction for %s',async role=>{
 expect(names(await planning(fixed[role]).wire())).toEqual(['research_workbench_create'])
})
it.each([
 '请另外核对原件。','请从 PDF 核实原表中的金额。','并请用同业平均作对照。','还要显示该公司今年营收。','请每十分钟刷新。',
])('keeps the original source tools for %s',async extra=>{
 expect(names(await planning(layout['资管例外追踪']+'\n'+extra).wire())).toContain('web_fetch')
})
it('keeps original readers on a missing cell, an undated source or an unsafe / unrelated citation',async()=>{
 const original=layout['资管例外追踪']
 for(const uncertain of [original.replace('1015827',''),original.replace(/20(?:23|24)\s*年?/gu,''),original.replace('来源为','参考教程：'),original.replace('https://','https://user:pass@')]){
  expect(names(await planning(uncertain).wire())).toContain('web_fetch')
 }
})
