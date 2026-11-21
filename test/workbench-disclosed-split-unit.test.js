import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'

const input = JSON.parse(readFileSync(new URL('./fixtures/workbench-disclosed-split-unit-submission.json',import.meta.url),'utf8'))
const compile = (args=input.arguments, text=input.request) => validateWorkbench({...args,originalRequest:text})
const alterFields = change => {
  const args = structuredClone(input.arguments)
  change(args.sharedDatasets[0].fields)
  return args
}

it('binds the valuation officer’s submitted labels and separate units to all six original columns without rounding source text', () => {
  for(const [open,close] of [['（','）'],['(',')']]){
    const text=input.request.replace('数量（股）', '数量'+open+'股'+close).replace('公允价值（元）','公允价值'+open+'元'+close).replace('占基金资产净值比例（%）','占基金资产净值比例'+open+'%'+close)
    const out=compile(input.arguments,text)
    const dataset=out.panels[0].artifact.dataset
    const fields=dataset.fields.filter(field=>field.key!=='id')
    expect(fields.map(field=>field.label)).toEqual(['序号','股票代码','股票名称','数量'+open+'股'+close,'公允价值'+open+'元'+close,'占基金资产净值比例'+open+'%'+close])
    expect(fields.slice(3).map(field=>field.unit)).toEqual(['股','元','%'])
    expect(dataset.records.map(row=>row.fairValue)).toEqual(['11448803849.16','10160652252.24','8589675214.80','7984305860.00','6688357598.61'])
    expect(dataset.records[3]).toMatchObject({code:'300308',name:'中际旭创',shares:13089026,weight:2.66})
  }
})

it('rejects changed currency, scaling, metric, order or an absent unit', () => {
  for (const change of [
    fields=>{fields[4].unit='美元'},fields=>{fields[4].unit='万元'},fields=>{fields[4].label='成本'},
    fields=>{delete fields[4].unit},fields=>{[fields[3],fields[4]]=[fields[4],fields[3]]}
  ])expect(()=>compile(alterFields(change))).toThrow('表头须与原文一致')
  expect(()=>compile(input.arguments,input.request.replace('公允价值（元）','公允价值（元，不含费用）'))).toThrow('表头须与原文一致')
})

it('resolves an unambiguous original header in a keyed numeric declaration and propagates the source only through its dataset', () => {
  const args=structuredClone(input.managerSubmitted)
  // The manager's first submission used English keys and exact printed labels.
  // Retain its schema while keeping the successfully submitted aggregation.
  args.sharedDatasets[0]=input.managerFirstSchema
  const url=input.managerRequest.match(/^https:\/\/\S+/mu)[0]
  const result=compile(args,input.managerRequest)
  const [kpi,chart,detail]=result.panels
  expect(kpi.artifact).toMatchObject({items:[{value:14.94}],sources:[{url}]})
  expect(chart.artifact).toMatchObject({sources:[{url}],series:[{values:[3.81,3.38,2.86,2.66,2.23]}]})
  expect(detail.artifact.dataset.sourceUrl).toBe(url)
  const {fields}=args.sharedDatasets[0]
  const wrong=structuredClone(args)
  wrong.sharedDatasets[0].pastedTable.numericFields[0]='未知数量'
  expect(()=>compile(wrong,input.managerRequest)).toThrow('数值列声明无效')
  const mixed=structuredClone(args)
  mixed.sharedDatasets.push({id:'other',label:'独立来源',asOf:'2025-12-31',note:'独立资料',fields:[{key:'id',label:'编号'},{key:'weight',label:'权重'}],records:[{id:'a',weight:2}]})
  const {sharedDatasets}=compile(mixed,input.managerRequest)
  expect(sharedDatasets.find(s=>s.id==='other')).not.toHaveProperty('sourceUrl')
  expect(fields[3].key).toBe('shares')
})
