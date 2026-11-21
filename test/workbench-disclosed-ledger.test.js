import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { disclosureLedgerInput } from '../packages/dsh-research-task-runtime/workbench-disclosure-ledger.js'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'

const fixture = name => JSON.parse(readFileSync(new URL('./fixtures/'+name,import.meta.url),'utf8'))
const {request,managerRequest} = fixture('workbench-disclosed-split-unit-submission.json')
const submission = fixture('workbench-disclosed-ledger-submission.json')
const compact = {requestId:'ledger',title:'估值对账',panels:[{type:'view',title:'按披露顺序逐笔核对'}]}
const compile = (args,text=request) => validateWorkbench({...args,originalRequest:text})
const [headers,...sourceRows] = request.slice(request.indexOf('序号\t股票代码')).trim().split('\n').map(row=>row.split('\t'))

it.each([['the actual six-panel submission',submission],['the advertised single-view submission',compact]])(
 'builds a searchable ledger from %s, retaining all original columns, exact cents and disclosure order',(_,args)=>{
  const normalized=compile(args)
  expect(normalized.panels).toHaveLength(1)
  const [panel]=normalized.panels
  expect(panel.layout).toBe('wide')
  const {dataset,view}=panel.artifact
  const keys=view.sections[0].fields
  const displayed=keys.map(key=>dataset.fields.find(field=>field.key===key))
  expect(displayed.map(field=>field.label)).toEqual(headers)
  expect(view.filters).toEqual([keys[1],keys[2]])
  expect(dataset.sourceUrl).toBe(request.match(/^https:\/\/[^\s]+/mu)[0])
  expect(dataset.records.map(row=>keys.map(key=>String(row[key])))).toEqual(sourceRows)
  expect(dataset.records.map(row=>row.id)).toEqual(sourceRows.map(row=>row[0]))
  expect(validateWorkbench(normalized).panels).toEqual(normalized.panels)
 })

it('keeps requested individual cards, other analysis, source boundaries and incomplete inputs on the normal path',()=>{
 for (const extra of ['每只股票单独建卡。','请一笔一卡。','另做一张图。','另做图。','另外汇总权重。','请一共五张。','另需一张表导出。']){
   expect(disclosureLedgerInput(extra+request)).toBeUndefined()
   expect(compile(submission,extra+request).panels).toHaveLength(6)
 }
 for (const text of [managerRequest,request.replace('7984305860.00','未披露'),request.replace('600519','300750'),
     request.replace('https://','https://invalid.example\nhttps://'),request.replace('按披露顺序','自行选择顺序')]){
   expect(disclosureLedgerInput(text)).toBeUndefined()
 }
 expect(compile(compact,request.replace('600519','000001')).sharedDatasets[0].records[1].column2).toBe('000001')
})

it('consolidates only a complete set of single-row replicas of the full unfiltered table',()=>{
 const copy=()=>structuredClone(submission)
 const partial=copy();partial.panels[1].view.where[0].values=[2]
 expect(compile(partial).panels).toHaveLength(6)
 const subset=copy();subset.panels[1].view.sections[0].fields.pop()
 expect(compile(subset).panels).toHaveLength(6)
 const altered=copy();altered.sharedDatasets[0].pastedTable.fields[4].label='另外的金额'
 expect(()=>compile(altered)).toThrow('表头须与原文一致')
})
