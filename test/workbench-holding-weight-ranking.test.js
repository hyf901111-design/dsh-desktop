import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {workbenchReadingPurpose} from '../packages/dsh-research-task-runtime/workbench-reading-purpose.js'
import {validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js'

const {originalRequest,args}=JSON.parse(readFileSync('test/fixtures/workbench-holding-weight-ranking.json','utf8'))
const official=originalRequest.match(/^https:\/\/[^\n]+/mu)[0]
function compile(change=()=>{}){
 const plan={...structuredClone(args),originalRequest}
 change(plan)
 return validateWorkbench(plan)
}
it('delivers the actual right-sidebar research request with the weight ranking and original amounts available from each cited card',()=>{
 const p=compile()
 expect(p.panels.map(x=>x.type)).toEqual(['table','chart','view'])
 const [summary,ranking,ledger]=p.panels.map(x=>x.artifact)
 expect(summary.body).toMatch(/14\.94%.*0\.43/u)
 expect(ranking.labels).toEqual(['宁德时代','贵州茅台','中国平安','中际旭创','紫金矿业'])
 expect(ranking.series[0].values).toEqual([3.81,3.38,2.86,2.66,2.23])
 expect(ledger.dataset.records.map(x=>x.value)).toEqual([11448803849.16,10160652252.24,8589675214.80,7984305860.00,6688357598.61])
 expect(ledger.dataset.fields.find(x=>x.key==='value').minimumFractionDigits).toBe(2)
 expect(ledger.dataset.sourceUrl).toBe(official)
 expect(summary.sources.some(s=>s.url===official)).toBe(true)
 expect(ranking.sources.some(s=>s.url===official)).toBe(true)
 expect(validateWorkbench(p).panels).toEqual(p.panels)
})
it('preserves requested amounts, number of panels, distinct scales, ranking ties and an amount absent from the detail',()=>{
 for (const extra of ['；也要看绝对金额','；请单列公允价值排序','；一共四张','；请做4个面板']){
  expect(compile(p=>{p.originalRequest=extra+'。'+p.originalRequest}).panels).toHaveLength(4)
 }
 const changedAmount=p=>{p.originalRequest=p.originalRequest.replace('11448803849.16','13448803849.16')}
 expect(compile(changedAmount).panels).toHaveLength(4)
 const stored=compile(p=>{p.originalRequest='请留四张。'+p.originalRequest})
 expect(validateWorkbench({...stored,originalRequest}).panels).toEqual(stored.panels)
 expect(compile(p=>{p.originalRequest=p.originalRequest.replace('3.81\n','3.38\n')}).panels).toHaveLength(4)
 expect(compile(p=>{p.panels[2].view.sections[0].fields=p.panels[2].view.sections[0].fields.filter(k=>k!=='value')} ).panels).toHaveLength(4)
 expect(compile(p=>{p.originalRequest=p.originalRequest.replaceAll('公允价值（元）','成交金额（元）');p.sharedDatasets[0].fields.find(f=>f.key==='value').label='成交金额（元）'}).panels).toHaveLength(4)
})
it('rejects unclear citation adjacency and conflicting source declarations, and never binds a second URL to all cards',()=>{
 for(const alter of [
  text=>text.replace('第10页第5.3.1节前五行','但这里的财务指标来自另一份材料'),
  text=>text.replace(official,'https://example.org/report.pdf\n'+official),
  text=>text.replace(official,official+'\n这是其他用途的链接')
 ]){
  const p=compile(plan=>plan.originalRequest=alter(plan.originalRequest))
  expect(p.sharedDatasets[0].sourceUrl).toBeUndefined()
 }
})

it('recognizes a disclosure ledger task described with the accounting term 勾稽',()=>{
 expect(workbenchReadingPurpose('我是估值核算员，收盘后要照着季报和托管系统逐笔勾稽。')).toBe('reconcile')
})

it('binds the two requested decisions and all five original records to the published snapshot',()=>{
 const panels=[{type:'kpi',title:'晨会指标'},{type:'chart',title:'权重比较'},{type:'view',title:'逐行复核'}]
 const result=validateWorkbench({originalRequest,requestId:'weights',title:'持仓晨会',panels})
 const [metrics,comparison,detail]=result.panels.map(panel=>panel.artifact)
 expect(metrics.items.map(item=>[item.value,item.unit])).toEqual([[14.94,'%'],[0.43,'个百分点']])
 expect(metrics.items[1].detail).toContain('贵州茅台')
 expect(metrics.sources[0].url).toBe(official)
 expect(comparison.series[0].values).toEqual([3.81,3.38,2.86,2.66,2.23])
 expect(detail.dataset.records).toHaveLength(5)
 expect(Object.values(detail.dataset.records[3])).toContain('7984305860.00')
 expect(validateWorkbench(result).panels).toEqual(result.panels)
})

it('reserves the compact holdings contract for an exact complete scope and a single weighting question', async()=>{
 const {holdingConcentrationInput}=await import('../packages/dsh-research-task-runtime/workbench-holding-concentration.js')
 expect(holdingConcentrationInput(originalRequest)).toBeTruthy()
 for (const text of [originalRequest.replace('前五合计','前三合计'), '另外需要绝对金额的排名。'+originalRequest,
    '需要一张网页做归因。'+originalRequest, originalRequest.replace(official,'')])
   expect(holdingConcentrationInput(text)).toBeUndefined()
})
