import {readFileSync} from 'node:fs'
import {expect, it} from 'vitest'
import {layoutWorkbench, validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {workbenchReadingGuidance, workbenchReadingPurpose} from '../packages/dsh-research-task-runtime/workbench-reading-purpose.js'
import {pastedWorkbenchInput} from '../packages/dsh-research-task-runtime/workbench-pasted-tables.js'
import {matchesDatasetViewScope} from '../packages/dsh-research-task-runtime/dataset-view-runtime.js'
import {compileComponentContent} from '../packages/dsh-research-task-runtime/component-content.js'

const load = filename => JSON.parse(readFileSync(new URL('./fixtures/'+filename, import.meta.url),'utf8'))
const plans = load('workbench-public-table-plans.json')
const requests = load('workbench-public-table-requests.json')

it('allocates space from visible SSE disclosure fields while respecting explicit card widths and order', () => {
 const plan = validateWorkbench({...plans.ETF持仓, originalRequest:requests.ETF持仓})
 const [chart, table] = plan.panels.map(({layout,...panel})=>panel)
 const [first, second] = layoutWorkbench([table, chart])
 expect(first.title).toBe(table.title)
 expect(first.workbenchSpan).toBe(true)
 expect(second.y).toBeGreaterThanOrEqual(first.y+first.height)
 expect(second.workbenchSpan).toBeUndefined()
 expect(layoutWorkbench([{...table,layout:'standard'}])[0].workbenchSpan).toBeUndefined()
 const narrow = structuredClone(table)
 narrow.artifact.view.sections[0].fields = ['code','seq']
 expect(layoutWorkbench([narrow])[0].workbenchSpan).toBeUndefined()
})

it('uses prior-period actual outflows to choose the exception cohort and keeps the original 10-K dataset', () => {
 const raw = structuredClone(plans.资管经营)
 const where = [{field:'2023全年净流入',op:'lt',value:0}]
 const [chart, table] = raw.panels
 const originalRequest = '去年实际净流出的类别先出现在会上，带今年净流入追问是否扭转。\n'+requests.资管经营.split('\n').slice(1).join('\n')
 const {context,blocks} = pastedWorkbenchInput(originalRequest)
 expect(workbenchReadingPurpose(context)).toBe('exceptions')
 expect(workbenchReadingGuidance(context,blocks)).toContain('["2023全年净流入"]')
 const [outflows, records] = validateWorkbench({...raw,requestId:'blk-exceptions',originalRequest,panels:[
  {...chart,view:{...chart.view, where}}, {...table,view:{...table.view, where}}
 ]}).panels.map(panel=>panel.artifact)
 expect(outflows.labels).toEqual(['零售','机构指数'])
 expect(outflows.series.map(series=>series.values)).toEqual([[24367,9374],[-8473,-55125]])
 expect(records.dataset.records).toHaveLength(5)
 expect(records.dataset.records.filter(row=>matchesDatasetViewScope(row,records.view.where))).toHaveLength(2)
})

it('retains exact values in a reconciliation and honours a separately requested graph of the same source', () => {
 const {content} = load('workbench-ecb-currency-content.json')
 const request = '我需要对该段时间的汇率逐行核对，请保留原始行序。'
 expect(workbenchReadingPurpose(request)).toBe('reconcile')
 expect(compileComponentContent(content,{singlePanel:true,originalRequest:request}).data.type).toBe('table')
 expect(compileComponentContent(content,{singlePanel:true,originalRequest:request+'也请画出汇率折线图。'}).data.type).toBe('chart')
})

it('selects a sourced one-sentence handoff from the actual Treasury close without adding a chart', () => {
 const [url] = readFileSync(new URL('./fixtures/workbench-treasury-dated-snapshot.txt',import.meta.url),'utf8').match(/https?:\/\/\S+/u)
 const req = '给债券交易员留一张交接便签，12 月 31 日收在多少，较上个交易日动了几个基点？'
 expect(workbenchReadingGuidance(req)).toContain('panel.content.body')
 const {data} = compileComponentContent({title:'美债收盘交接',body:'10 年期美债收于 4.58%，较前一交易日的 4.55% 上行 3 个基点。',asOf:'2024-12-31',sources:[{label:'美国财政部',url}]})
 expect(data.type).toBe('markdown')
 expect(data.content).toContain(url)
})
