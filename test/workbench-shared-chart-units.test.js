import { expect, it } from 'vitest'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { renderDatasetViewArtifact } from '../packages/dsh-research-task-runtime/dataset-view-artifact.js'

const chart = (dataset, measured, label, unit, title = '按类别对比') => ({
  title, type: 'chart', view: { dataset, unit, variant: measured.length > 1 ? 'groupedBar' : 'bar',
    label, sections: [{ kind: 'records', label, fields: measured }] }
})
const detail = (dataset, fields) => ({
  title: '逐条复核', type: 'view', view: { dataset, sections: [{ kind: 'records', fields }] }
})
const plan = (sharedDatasets, panels, originalRequest) => ({
  requestId: 'shared-field-units', title: '台账复核', dataMode: 'source', sharedDatasets, panels, originalRequest
})
const units = dataset => Object.fromEntries(dataset.fields.map(field => [field.key, field.unit]))

it.each([
  { axis: '渠道', keys: ['目标','实际'], labels: ['银行','券商','直销'], values: [[12,10.8],[8,8.6],[5,4.1]],
    derive: [{ key:'达成率',label:'达成率',op:'percent',left:'实际',right:'目标',unit:'%',digits:1 }] },
  { axis: '产品', keys: ['敞口','限额'], labels: ['稳健一号','均衡二号','精选三号'], values: [[0,8],[11.2,10],[null,6]] }
])('retains the declared chart unit in the $axis ledger, including the delivered detail HTML', ({ axis, keys, labels, values, derive }) => {
  const request = '从 Excel 复制的业务台账，金额单位亿元。\n' + [[axis,...keys],...values.map((row,index) => [labels[index],...row])].map(row => row.join('\t')).join('\n')
  const source = {id:'ledger',label:'业务台账',pastedTable:{block:1,header:true,identity:axis,numericFields:keys,...(derive ? {derive} : {})}}
  const reports = [detail('ledger',[axis,...keys,...(derive ? ['达成率'] : [])]),chart('ledger',keys,axis,'亿元')]
  const compiled = validateWorkbench(plan([source], reports, request))
  const artifact = compiled.panels[0].artifact
  expect(units(artifact.dataset)).toEqual({id:undefined,[axis]:undefined,[keys[0]]:'亿元',[keys[1]]:'亿元',...(derive ? {'达成率':'%'} : {})})
  expect(artifact.dataset.records.map(row => keys.map(key => row[key]))).toEqual(values)
  expect(artifact.dataset.fields).toEqual(compiled.sharedDatasets[0].fields)
  const html = renderDatasetViewArtifact(artifact).html
  expect(html).toContain(values[0][0]+' 亿元')
  expect(html).toContain(derive ? '90 %' : '未提供')
  expect(validateWorkbench(compiled).panels[0].artifact).toEqual(artifact)
})

it('keeps conflicting chart declarations, other datasets, categories and percentage fields independent', () => {
  const keys = ['amount','limit','ratio','备注']
  const fields = [{key:'amount',label:'敞口'},{key:'limit',label:'限额'},{key:'ratio',label:'敞口占比',unit:'%'},{key:'备注',label:'备注'}]
  const source = {id:'a',label:'台账',asOf:'2026-11',note:'来源台账',fields,records:[{id:'甲',amount:10,limit:15,ratio:8,备注:'待复核'}]}
  const input = plan([source,{...source,id:'b'}],[
    chart('a',['amount'],'id','亿元','敞口甲'),chart('a',['amount'],'id','万元','敞口乙'),
    chart('a',['limit'],'id','亿元','限额'),detail('a',keys),{...detail('b',keys),title:'另一本台账'}
  ])
  const compiled = validateWorkbench(input)
  expect(units(compiled.panels[3].artifact.dataset)).toEqual({id:undefined,amount:undefined,limit:'亿元',ratio:'%',备注:undefined})
  expect(units(compiled.panels[4].artifact.dataset)).toEqual({id:undefined,amount:undefined,limit:undefined,ratio:'%',备注:undefined})
  expect(fields[1]).not.toHaveProperty('unit')
})


it('only annotates eligible numeric series and leaves qualified field labels, percentages and supplemental columns intact', () => {
  const fields = [{key:'goal',label:'目标'},{key:'actual',label:'实际'},{key:'margin',label:'Margin ratio'},
    {key:'pct',label:'达成率',unit:'%'},{key:'fees',label:'手续费（万元）'},{key:'volume',label:'成交量（手）'},
    {key:'other',label:'另一个金额'},{key:'memo',label:'备注'}]
  const source = {id:'ledger',label:'台账',note:'来源台账',asOf:'11月',fields,
    records:[{id:'银行',goal:12,actual:10,margin:0.7,pct:83.3,fees:1,volume:11,other:6,memo:'待复核'}]}
  const selected = ['goal','actual','margin','pct','fees','volume','memo']
  const input = plan([source],[chart('ledger',selected,'id','亿元'),detail('ledger',['id',...selected,'other'])])
  const compiled = validateWorkbench(input)
  expect(compiled.panels[0].artifact.series.map(series=>series.name)).toEqual(['目标','实际'])
  expect(units(compiled.sharedDatasets[0])).toEqual({id:undefined,goal:'亿元',actual:'亿元',margin:undefined,pct:'%',fees:undefined,volume:undefined,other:undefined,memo:undefined})
  expect(validateWorkbench(compiled).panels).toEqual(compiled.panels)
})

it('does not use a chart with multiple supplemental fields as evidence for a single-series trend', () => {
  const source={id:'a',label:'净流入',note:'来源台账',asOf:'11月',fields:[{key:'net',label:'净流入'},{key:'other',label:'销售规模'}],
    records:[{id:'十一月',net:13,other:150}]}
  const line=chart('a',['net','other'],'id','亿元','净流入走势')
  line.view.variant='line'
  const result=validateWorkbench(plan([source],[line,detail('a',['net','other'])]))
  expect(result.panels[0].artifact.series.map(series=>series.name)).toEqual(['净流入'])
  expect(units(result.sharedDatasets[0])).toEqual({id:undefined,net:undefined,other:undefined})
})
