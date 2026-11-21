import {expect, it} from 'vitest'
import {pastedWorkbenchBlocks} from '../packages/dsh-research-task-runtime/workbench-pasted-tables.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'

const dataset = {
  id:'ledger', label:'渠道台账', fields:[{key:'channel',label:'渠道'},{key:'target',label:'目标',unit:'亿元'},{key:'actual',label:'实际',unit:'亿元'}],
  pastedTable:{block:1,header:true,numericFields:['target','actual']}
}
const plan = {
  requestId:'channel-review',title:'渠道经营复盘',dataMode:'source',
  originalRequest:'我从 Excel 复制了渠道数据，请据此做经营工作台。\n渠道\t目标\t实际\r\n银行\t12\t10.8\r\n券商\t8\t8.6\r\n直销\t5\t',
  sharedDatasets:[dataset],panels:[
    {title:'目标与实际',type:'chart',view:{dataset:'ledger',variant:'groupedBar',unit:'亿元',sections:[{kind:'records',label:'channel',fields:['target','actual']}]}},
    {title:'经营明细',type:'view',view:{dataset:'ledger',sections:[{kind:'records',label:'channel',fields:['target','actual']}]}}
  ]
}

it('uses one Excel range for native comparison and detail without a redundant prompt',()=>{
  const compiled=validateWorkbench(plan)
  expect(compiled.panels.map(panel=>panel.type)).toEqual(['chart','view'])
  expect(compiled.panels[0].artifact).toMatchObject({variant:'groupedBar',labels:['银行','券商','直销'],series:[{values:[12,8,5]},{values:[10.8,8.6,null]}]})
  expect(compiled.panels[1].artifact.dataset.records.at(-1)).toMatchObject({channel:'直销',target:5,actual:null})
})
it('preserves quoted clipboard cells, line breaks, pipes, empty edges and block order',()=>{
  const text='复制的风险记录\n编号\t日期\t备注\r\n001\t2026-11-02\t"待核 A｜B\n第二行 ""原话""含\t制表符"\r\n\t2026-11-03\t\n\n另一个表\n|部门|件数|\n|---|---|\n|风控|2|'
  expect(pastedWorkbenchBlocks(text)).toEqual([
    [['编号','日期','备注'],['001','2026-11-02','待核 A｜B\n第二行 "原话"含\t制表符'],['','2026-11-03','']],
    [['部门','件数'],['风控','2']]
  ])
})
it('does not assign an observation date found inside a pasted row to the whole dataset',()=>{
  const result=validateWorkbench({...plan,originalRequest:plan.originalRequest.replaceAll('银行','2026-11-02')})
  expect(result.panels[1].artifact.dataset.asOf).not.toBe('2026-11-02')
})
it('accepts an explicit record id declaration only for the same row identities',()=>{
  const {pastedTable,...schema}=dataset
  const data={...schema,asOf:'月度台账',note:'用户粘贴',identity:'id',records:[{id:'银行',channel:'银行',target:12,actual:10.8},{id:'券商',channel:'券商',target:8,actual:8.6}]}
  const input={...plan,sharedDatasets:[data]}
  expect(validateWorkbench(input).panels.map(p=>p.type)).toEqual(['chart','view'])
  expect(()=>validateWorkbench({...input,sharedDatasets:[{...data,identity:'actual'}]})).toThrow(/identity|编号/)
})

it('binds exact source header names without requiring the planner to transcribe a schema',()=>{
  const source={id:'ledger',label:'渠道台账',pastedTable:{block:1,header:true,numericFields:['目标','实际']}}
  const input={...plan,sharedDatasets:[source],panels:[{title:'经营明细',type:'view',view:{dataset:'ledger',sections:[{kind:'records',fields:['渠道','目标','实际']}]}}]}
  expect(validateWorkbench(input).panels[0].artifact.dataset.records.at(-1)).toMatchObject({'渠道':'直销','目标':5,'实际':null})
  expect(()=>validateWorkbench({...input,originalRequest:plan.originalRequest.replace('目标\t实际','目标\t目标')})).toThrow(/表头|列键/)
  expect(()=>validateWorkbench({...input,originalRequest:plan.originalRequest+'\n其他\t5\t"缺引号'})).toThrow(/引号/)
})

it('retains chronology, owners, notes and requested details from a research visit ledger',()=>{
  const request='用公司调研记录生成时间线\n日期\t公司\t责任人\t要点\n2026-11-23\t甲公司\t研究员甲\t核对订单'
  const timeline={title:'走访日程',type:'timeline',view:{dataset:'visits',note:'排程以底稿为准',details:['要点'],
    sections:[{kind:'schedule',label:'公司',start:'日期',owner:'责任人',fields:['要点']}]}}
  const result=validateWorkbench({...plan,originalRequest:request,sharedDatasets:[{id:'visits',label:'调研底稿',pastedTable:{block:1,header:true}}],panels:[timeline]})
  expect(result.panels[0].artifact).toMatchObject({type:'timeline',note:expect.stringContaining('排程以底稿为准'),items:[{title:'甲公司',actor:'研究员甲',time:'2026-11-23','要点':'核对订单'}]})
})
it('normalizes equivalent chart category declarations and rejects a contradictory axis',()=>{
  const [chart]=plan.panels
  const build=label=>validateWorkbench({...plan,panels:[{...chart,view:{...chart.view,label}}]})
  expect(build('channel').panels[0].artifact.labels).toEqual(['银行','券商','直销'])
  expect(()=>build('target')).toThrow(/分类/)
})

it('uses the source order and counts for a native funnel and refuses to sort away an inconsistent cohort',()=>{
  const request='仅用下表给渠道总监建一个转化漏斗工作台。\n阶段\t客户数\n接触\t120\n意向\t72\n签约\t18'
  const input={...plan,originalRequest:request,sharedDatasets:[{id:'ledger',label:'同批客户',pastedTable:{block:1,header:true,numericFields:['客户数']}}],
    panels:[{title:'客户转化漏斗',type:'chart',view:{dataset:'ledger',variant:'funnel',unit:'家',sections:[{kind:'records',label:'阶段',fields:['客户数']}]}}]}
  const output=validateWorkbench(input)
  expect(output.panels[0].artifact).toMatchObject({type:'chart',variant:'funnel',stages:[{label:'接触',value:120},{label:'意向',value:72},{label:'签约',value:18}]})
  expect(()=>validateWorkbench({...input,originalRequest:request.replace('签约\t18','签约\t80')})).toThrow(/不递增/)
})
