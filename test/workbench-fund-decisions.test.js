import { describe, expect, it } from 'vitest'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'
import { readTemplateModel } from '../packages/dsh-research-task-runtime/component-template-registry.js'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { marketVariant } from '../packages/dsh-research-task-runtime/workbench-design-contract.js'
import { workbenchPlanningContext } from '../packages/dsh-research-task-runtime/workbench-planning-context.js'

const cases = [
  {role:'基金经理',title:'行业组合权重与基准权重偏离',axis:'行业',actual:'组合权重',reference:'基准权重',unit:'%',variant:'dumbbell'},
  {role:'总经理',title:'各渠道实际净申购与目标净申购对比',axis:'渠道',actual:'实际净申购',reference:'目标净申购',unit:'亿元',variant:'groupedBar'},
  {role:'风控经理',title:'各产品当前敞口与风险限额对比',axis:'产品',actual:'当前敞口',reference:'风险限额',unit:'亿元',variant:'groupedBar'}
]
function records({axis,actual,reference,unit}) {
  return {
    columns:[{key:'label',label:axis},{key:'observed',label:actual+'（'+unit+'）'},{key:'reference',label:reference+'（'+unit+'）'}],
    rows:[{label:'甲',observed:0,reference:2,owner:'一组'},{label:'乙',observed:3,reference:2,owner:'二组'}],
    asOf:'2026-10-31',sources:[{label:'模拟月报'}]
  }
}
function panel(scenario,content=records(scenario),instruction='') {
  const {title,role}=scenario
  const plan=validateWorkbench({requestId:'monthly-review',title:'月度复盘',originalRequest:'我是'+role+'，做个月度复盘看板。'+instruction,
    panels:[{title,content}]})
  return plan.panels[0].artifact
}

describe('基金公司月度复盘',()=>{
  it.each(cases)('$role用成对的同单位数据比较$actual和$reference',scenario=>{
    const source=records(scenario), artifact=panel(scenario,source)
    expect(artifact).toMatchObject({type:'chart',variant:scenario.variant,unit:scenario.unit,labels:['甲','乙'],
      series:[{name:source.columns[1].label,values:[0,3]},{name:source.columns[2].label,values:[2,2]}],
      detailRows:[['甲',0,2,'一组'],['乙',3,2,'二组']],sources:source.sources})
    const rendered=JSON.parse(acceptArtifactOutput(JSON.stringify(artifact)))
    expect(readTemplateModel(rendered).data).toEqual(artifact)
  })
  it('recognizes target attainment without requiring the exact spreadsheet headings in the request',()=>{
    const scenario={...cases[1],title:'看看各渠道净申购是否达标'}
    expect(panel(scenario)).toMatchObject({type:'chart',variant:'groupedBar',labels:['甲','乙']})
    expect(panel({...scenario,title:'按渠道列出实际净申购与目标净申购'})).toMatchObject({type:'chart',variant:'groupedBar'})
    const source=records(scenario)
    source.columns[2].label='预算管理费（亿元）'
    expect(panel(scenario,source).type).toBe('table')
  })
  it('preserves an authored dumbbell and the specified channel order',()=>{
    const source={...records(cases[1]),visualization:{kind:'dumbbell',label:'label',values:['reference','observed'],unit:'亿元'}}
    expect(panel(cases[1],source)).toMatchObject({type:'chart',variant:'dumbbell',series:[{values:[2,2]},{values:[0,3]}]})
  })
  it('retains original rows for table-only, incomplete, duplicate-category and incompatible comparisons',()=>{
    const scenario=cases[1], base=records(scenario)
    for(const [source,instruction] of [
      [base,'只要表格'],
      [{...base,rows:[base.rows[0],{...base.rows[1],reference:null}]}],
      [{...base,rows:[base.rows[0],{...base.rows[1],label:'甲'}]}],
      [{...base,columns:[...base.columns.slice(0,2),{key:'reference',label:'目标净申购（万美元）'}]}],
      [{...base,columns:[...base.columns.slice(0,2),{key:'reference',label:'目标净申购（%）'}]}],
    ]) {
      const artifact=panel(scenario,source,instruction)
      expect(artifact.type).toBe('table')
      expect(artifact.rows).toHaveLength(2)
    }
  })
  it('distinguishes numbered KPI card names from user-provided values, including zero',()=>{
    const input={requestId:'kpi-identities',title:'公司周报',dataMode:'simulated',
      panels:[{title:'面板0',prompt:'展示面板0的模拟内容。',type:'kpi',size:'medium'}]}
    expect(validateWorkbench(input).panels).toHaveLength(1)
    for(const prompt of ['当月净申购：0亿元。','合计0','面板：0','面板0个']) {
      expect(()=>validateWorkbench({...input,panels:[{...input.panels[0],prompt}]})).toThrow(/原数值与单位/)
    }
  })
  it.each([
    ['经营会复盘净申购实际与目标，渠道分列','实际与目标'],
    ['组合经理复盘行业配置相对基准的偏离','组合与基准'],
    ['核对集中度敞口与风险限额，看哪些产品越限','实际敞口'],
    ['请按披露日期跟踪重点公司的财报和业绩会','披露日期'],
    ['渠道总监要看客户触达、意向、签约的转化漏斗','同一批客户']
  ])('为业务判断选择呈现时使用与请求相关的数据条件', (request,expected)=>{
    expect(workbenchPlanningContext(undefined,request)).toContain(expected)
  })
  it('keeps sector heatmaps and operating KPIs distinct from price trends and issuer disclosures',()=>{
    expect(marketVariant({title:'行业热力图',prompt:'对比行业指标趋势'})).toBe('heatmap')
    expect(marketVariant({title:'公司经营核心指标',prompt:'展示各渠道的规模和收入'})).toBe('metrics')
    expect(marketVariant({title:'个股核心指标',prompt:'展示六项指标与每股收益'})).toBe('key-metrics')
    expect(marketVariant({title:'公司经营核心指标',prompt:'variant: trend'})).toBe('trend')
  })
  it('does not assign private-data or financial views from a job title alone',()=>{
    expect(workbenchPlanningContext(undefined,'我是基金经理，帮我做个出差行程看板')).not.toContain('【业务视图】')
  })
})
