import {it,expect,vi} from 'vitest'
import {prototypeTableCoverageIssue} from '../packages/dsh-research-task-runtime/prototype-table-coverage.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchSourcePolicy} from '../packages/dsh-research-task-runtime/workbench-source-policy.js'

const original='根据 /Users/user/Downloads/原型.html 创建运营工作台。'
const incomplete={version:1,type:'table',title:'全部产品明细',columns:['代码','名称'],rows:[['P01','示例甲'],['P02','示例乙'],['P03','示例丙']],note:'当前只有3条示例，组件以后按分页读取完整244条。'}
const options={panelType:'table',panelRequest:'产品明细总表：DYN.prods 全部244只产品，保留完整记录。',workbenchRequest:{originalRequest:original,dataMode:'source'}}
const records=[{tool:'read_prototype',args:{file_path:'/Users/user/Downloads/原型.html',section:'DYN.prods'},response:{section:'DYN.prods',total:244,rows:[{code:'00001'}]}}]
it('rejects the observed three-example completion instead of deferring promised records to the finished component',()=>{
 expect(prototypeTableCoverageIssue(JSON.stringify(incomplete),records,options)).toContain('完整 244 条记录，当前只有 3 条')
 const note={...incomplete,note:'已经完成全部产品。'}
 expect(prototypeTableCoverageIssue(JSON.stringify(note),[],options)).toContain('当前只有 3 条')
})
it('accepts a source-backed complete semantic table even when the host must render a larger readable view',()=>{
 const data={...incomplete,rows:Array.from({length:244},(_,i)=>[String(i),'原型记录'])}
 expect(prototypeTableCoverageIssue('rendered HTML is not the data contract',records,{...options,mappedData:data})).toBeNull()
})
it('does not treat a retained reading link as a promise that its external records are present',()=>{
 const ownRows=Array.from({length:12},(_,i)=>[String(i),'渠道记录'])
 const ownRecords=[{tool:'read_prototype',response:{section:'DYN.ours',total:12,rows:ownRows}}]
 const panelRequest='根据 DYN.ours 还原我司12只渠道资金流表，完整保留所有字段。保留查看全部244只四分类明细、30条对账告警与执行档案的阅读入口；实际详情可用性及计数以完整原始记录为准。'
 const scoped={...options,panelRequest,mappedData:{...incomplete,rows:ownRows}}
 expect(prototypeTableCoverageIssue('',ownRecords,scoped)).toBeNull()
 expect(prototypeTableCoverageIssue('',ownRecords,{...scoped,mappedData:{...incomplete,rows:ownRows.slice(0,3)}})).toContain('完整 12 条记录')
 // A separate requirement to render all records is still binding.
 expect(prototypeTableCoverageIssue('',ownRecords,{...scoped,panelRequest:panelRequest+'本卡完整展示全部244条渠道记录。'})).toContain('完整 244 条记录')
 // The source itself is authoritative even if the request only describes a link.
 expect(prototypeTableCoverageIssue('',records,{...scoped,panelRequest:'DYN.prods：保留查看全部244只明细的阅读入口，完整呈现来源。'})).toContain('完整 244 条记录')
})
it('does not exempt a record-display requirement merely because the same sentence also asks for a link',()=>{
 expect(prototypeTableCoverageIssue(JSON.stringify(incomplete),[],{...options,panelRequest:'完整展示全部244条记录，并提供查看原始资料的入口。'})).toContain('完整 244 条记录')
})
it('keeps scoped top-N samples, other cards and requests without an authored prototype unchanged',()=>{
 expect(prototypeTableCoverageIssue(JSON.stringify(incomplete),records,{...options,panelRequest:'只显示前3只产品。'})).toBeNull()
 expect(prototypeTableCoverageIssue(JSON.stringify(incomplete),records,{...options,panelType:'kpi'})).toBeNull()
 expect(prototypeTableCoverageIssue(JSON.stringify(incomplete),records,{...options,workbenchRequest:{originalRequest:'生成一个包含3条示例的表格'}})).toBeNull()
})
it.each(['invalid-repair','provider-error'])('never promotes the incomplete readable fallback after %s',async failure=>{
 const plan=validateWorkbench({requestId:'coverage',title:'运营工作台',originalRequest:original,dataMode:'source',panels:[{title:'全部244只产品',prompt:options.panelRequest,type:'table',size:'large'}]}),panel=plan.panels[0]
 const start=vi.fn(async()=>{
  if(failure==='provider-error'&&start.mock.calls.length>1)throw Error('provider interrupted the repair')
  return{childSessionId:'child-'+start.mock.calls.length,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(incomplete)}],sourceRecords:records}),dispose:async()=>{}}
 })
 const runtime=new ResearchTaskRuntime({adapter:{start},storage:{save:async()=>{}}})
 try{
  const receipt=await runtime.start({parentSessionId:'parent',canvasNodeId:'node',kind:'container',prompt:workbenchPanelPrompt(plan,panel)},{workbenchRequest:{originalRequest:original,dataMode:'source'},sourceRequirement:panel.prompt,sourcePolicy:workbenchSourcePolicy(original,panel)})
  await vi.waitFor(()=>expect(runtime.tasks.get(receipt.taskId)?.state).toBe('failed'))
  expect(runtime.tasks.get(receipt.taskId).finalOutput).toBeUndefined()
  expect(start).toHaveBeenCalledTimes(2)
 }finally{await runtime.dispose()}
})
