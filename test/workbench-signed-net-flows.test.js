// @vitest-environment happy-dom
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {parseDatasetViewArtifact} from '../packages/dsh-research-task-runtime/dataset-view-contract.js'
import {renderDatasetViewArtifact} from '../packages/dsh-research-task-runtime/dataset-view-artifact.js'
import {datasetViewValue} from '../packages/dsh-research-task-runtime/dataset-view-runtime.js'
import {isNetFlowAmount,requestsSignedNetFlows} from '../packages/dsh-research-task-runtime/dataset-net-flow-display.js'

const {originalRequest,args}=JSON.parse(readFileSync('test/fixtures/workbench-requested-signed-flows.json','utf8'))
const compile=(request=originalRequest)=>validateWorkbench({...structuredClone(args),originalRequest:request})
const cells=artifact=>{
 const root=document.createElement('div')
 root.innerHTML=renderDatasetViewArtifact(artifact).html
 return [...root.querySelectorAll('tbody tr')].map(row=>[...row.cells].map(cell=>cell.textContent.trim()))
}
it('persists the signed flow fields from the actual BlackRock request without relying on the generated section title',()=>{
 const plan=compile()
 const [exceptions,others,balances]=plan.panels.map(p=>p.artifact)
 expect(exceptions.view.sections[0].title).toBe('2023 净流出（百万美元）')
 expect(exceptions.view.signedFields).toEqual(['column4','column5','净流入同比变化'])
 expect(cells(exceptions).map(row=>row.slice(-3))).toEqual([
  ['+24367 百万美元','-8473 百万美元','+32840 百万美元'],
  ['+9374 百万美元','-55125 百万美元','+64499 百万美元']
 ])
 expect(others.variant).toBe('groupedBar')
 expect(balances.view.signedFields).toBeUndefined()
 expect(cells(balances).flat().filter(c=>/^\+/u.test(c))).toEqual([])
 expect(cells(balances)[0].some(cell=>/^1015827(?: 百万美元)?$/u.test(cell))).toBe(true)
 expect(exceptions.dataset.records[0].column4).toBe(24367)
 expect(exceptions.dataset.sourceUrl).toBe(originalRequest.match(/^https:\/\/[^\n]+/mu)[0])
 expect(validateWorkbench(plan).panels).toEqual(plan.panels)
})
it('does not infer a sign instruction from unsigned reports, unrelated fields, numeric table contents or ratio fields',()=>{
 for(const request of ['两年净流入保持原样','净流入不要带符号','净流入无需显示正负号','利润带符号；另核对净流入']){
  const artifact=compile(originalRequest.replace('两年的带符号净流入',request)).panels[0].artifact
  expect(artifact.view.signedFields).toBeUndefined()
  expect(cells(artifact)[0]).toContain('24367 百万美元')
 }
 for(const field of [
  {label:'2024年末AUM'},{label:'净流入占AUM比例'},{label:'净流入增长率'},
  {label:'净流入',unit:'%'},{label:'Net flows as a share of revenue'},{label:'Net flows',unit:'bps'}
 ])expect(isNetFlowAmount(field)).toBe(false)
 expect(requestsSignedNetFlows('Show signed net cash flows.')).toBe(true)
 const artifact=compile().panels[2].artifact
 expect(()=>parseDatasetViewArtifact({...artifact,view:{...artifact.view,signedFields:['column2']}})).toThrow(/净流入/u)
})
it('retains zero, missing amounts, original decimal precision and historical unsigned values',()=>{
 const amount={label:'Net cash inflows',unit:'USD',minimumFractionDigits:2}
 for(const [n,expected] of [[2,'+2.00 USD'],[0,'0.00 USD'],[-1.25,'-1.25 USD'],[null,'未提供']]){
  expect(datasetViewValue(n,amount,true)).toBe(expected)
 }
 expect(datasetViewValue(2,amount)).toBe('2.00 USD')
 expect(datasetViewValue(4.58,{label:'10年期收益率',unit:'%'})).toBe('4.58 %')
 expect(datasetViewValue(12,{label:'AUM',unit:'USD'},true)).toBe('12 USD')
})
