import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {validateDatasetView} from '../packages/dsh-research-task-runtime/dataset-view-contract.js'

const fixture=name=>JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'))
const firstCall=fixture('workbench-etf-audit-records-first-call.json')
const originalRequest=fixture('workbench-layout-delivery-requests.json').ETF逐项稽核
const compile=mutate=>{
  const input=structuredClone(firstCall)
  mutate?.(input.panels[0].view)
  return validateWorkbench({...input,requestId:'etf-source-records',originalRequest})
}

it('accepts the original ETF audit submission with the disclosed row number as its leading record field',()=>{
  const {dataset,view}=compile().panels[0].artifact
  const keys=view.sections[0].fields
  const [headers,...rows]=originalRequest.split('\n\n').at(-1).split('\n').map(line=>line.split('\t'))
  expect(keys.map(key=>dataset.fields.find(field=>field.key===key).label)).toEqual(headers)
  expect(dataset.records.map(record=>keys.map((key,i)=>i>=3?Number(record[key]):record[key])))
    .toEqual(rows.map(row=>row.map((value,i)=>i>=3?Number(value):value)))
  expect(view).not.toHaveProperty('label')
  expect(view).not.toHaveProperty('type')
  expect(()=>validateDatasetView({...view,label:keys[0]},[dataset])).toThrow(/无效字段/)
})

it.each([
  ['a label from a different displayed column',view=>{view.label='股票名称'}],
  ['a missing field',view=>{view.label='未声明字段'}],
  ['an unknown option',view=>{view.extraOption=true}],
  ['a classification on a compare section',view=>{view.sections[0].kind='compare'}],
  ['a classification across multiple sections',view=>{view.sections.push(structuredClone(view.sections[0]))}],
  ['a chart label with no table declaration',view=>{delete view.type}],
])('keeps rejecting %s on a record view',(_,change)=>{
  expect(()=>compile(change)).toThrow(/无效字段/)
})
