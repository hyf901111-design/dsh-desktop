// @vitest-environment happy-dom
import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {renderDatasetViewArtifact} from '../packages/dsh-research-task-runtime/dataset-view-artifact.js'
import {datasetViewValue} from '../packages/dsh-research-task-runtime/dataset-view-runtime.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
import {compactHostDashboardHtml} from '../packages/dsh-research-task-runtime/html-artifact.js'
const samples=JSON.parse(readFileSync('test/fixtures/workbench-role-source-first-calls.json','utf8'))
const compile=(role,change=()=>{})=>{
 const {args,originalRequest}=structuredClone(samples[role])
 const plan={requestId:'replay',...args,originalRequest}
 change(plan)
 return validateWorkbench(plan)
}
const rows=artifact=>{
 const el=document.createElement('html')
 el.innerHTML=renderDatasetViewArtifact(artifact).html
 return [...el.querySelectorAll('tbody tr')].map(row=>[...row.cells].map(c=>c.textContent))
}
it('retains both requested complementary scopes with the precise signed annual flows and one canonical disclosure',()=>{
 const result=compile('资管例外追踪')
 expect(result.panels).toHaveLength(2)
 const [first,rest]=result.panels.map(p=>p.artifact)
 expect(first.dataset).toEqual(rest.dataset)
 expect(rows(first)).toEqual([['零售','-8473','+24367','+32840 百万美元'],['机构指数','-55125','+9374','+64499 百万美元']])
 expect(rows(rest)).toEqual([['ETF','+185942','+390433','+204491 百万美元'],['机构主动','+87106','+64447','-22659 百万美元'],['现金管理','+79245','+152730','+73485 百万美元']])
 expect(validateWorkbench(result).panels).toEqual(result.panels)
 for(const change of [
  p=>{p.originalRequest=p.originalRequest.replace('再让我对照其余类别的两年净流入','会上只追问两类例外')},
  p=>{p.originalRequest='仅做一张卡。'+p.originalRequest},
  p=>{p.originalRequest=p.originalRequest.replace('再让我对照','不要再让我对照')},
  p=>{p.originalRequest=p.originalRequest.replace('64447\t87106','64447\t')},
  p=>{p.panels[0].view.where.push({field:'2024全年净流入',op:'gt',value:0})}
 ])expect(compile('资管例外追踪',change).panels).toHaveLength(1)
})
it('marks positive signed flows while preserving ordinary balances, IDs, source precision, zero and missing amounts',()=>{
 expect(datasetViewValue(2.4,{label:'全年净流入',unit:'万元',minimumFractionDigits:2},'带符号')).toBe('+2.40 万元')
 for(const [value,label,context,expected] of [[42,'年末AUM','带符号','42'],[5,'序号','带符号','5'],[4,'净流入','明细','4'],[-3,'净流入','带符号','-3'],[null,'净流入','带符号','未提供'],[0,'净流入','带符号','0']])expect(datasetViewValue(value,{label},context)).toBe(expected)
})
it('accepts a duplicated identity declaration only for the exact canonical source ordinal',()=>{
 const role='ETF逐项稽核'
 const detail=compile(role).panels[0].artifact
 expect(detail.dataset.records.map(r=>r.id)).toEqual(['1','2','3','4','5'])
 expect(detail.dataset.fields.find(f=>f.key==='id').label).toBe('序号')
 expect(detail.dataset.fields.find(f=>f.key==='value').minimumFractionDigits).toBe(2)
 expect(rows(detail).map(row=>row.length)).toEqual([6,6,6,6,6])
 for(const change of [
  p=>{p.sharedDatasets[0].identity='code'},
  p=>{p.originalRequest=p.originalRequest.replace('2\t600519','1\t600519')},
  p=>{p.originalRequest=p.originalRequest.replace('2\t600519','02\t600519')},
  p=>{p.sharedDatasets[0].fields[0].label='股票代码'},
  p=>{p.sharedDatasets[0].pastedTable.derive=[{key:'x',label:'变化',op:'subtract',left:'seq',right:'value'}]}
 ])expect(()=>compile(role,change)).toThrow()
})
it('keeps the public handoff sentence before the chart and detail tabs on reopened saved charts',()=>{
 const {artifact}=compile('固收交接便签').panels[0]
 expect(artifact.body).toContain('4.58%')
 expect(artifact.body).toContain('上行 3 个基点')
 const {html}=JSON.parse(acceptArtifactOutput(JSON.stringify(artifact)))
 const current=compactHostDashboardHtml(html)
 expect(current).toContain('>[data-component-body]{grid-column:1;grid-row:1}')
 expect(current).toContain('>[data-component-body])>figure{grid-row:2}')
 expect(compactHostDashboardHtml(current)).toBe(current)
})
