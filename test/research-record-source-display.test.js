import {describe,expect,it} from 'vitest'
import {Window} from 'happy-dom'
import audit from './fixtures/research-etf-original-order-view.json'
import {renderDatasetViewArtifact} from '../packages/dsh-research-task-runtime/dataset-view-artifact.js'
import {componentDataStatusView} from '../scripts/lib/component-data-status.mjs'
import {getComponentSourceInfo} from '../scripts/lib/component-source-info.mjs'

function table(value){
 const html=renderDatasetViewArtifact(value).html
 const window=new Window()
 window.document.write(html)
 return window.document.querySelector('.dv-records')
}
describe('saved official original-order disclosure',()=>{
 it('keeps the six disclosed columns and preserves each internal key for row interaction',()=>{
  const recordTable=table(audit)
  expect([...recordTable.querySelectorAll('thead th')].map(cell=>cell.textContent)).toEqual(['序号','股票代码','股票名称','数量（股）','公允价值（元）','占基金资产净值比例（%）'])
  const rows=[...recordTable.querySelectorAll('tbody tr')]
  expect(rows.map(row=>row.dataset.recordId)).toEqual(audit.dataset.records.map(row=>row.id))
  expect(rows.map(row=>[row.cells[0].textContent,row.cells[1].textContent])).toEqual(audit.dataset.records.map(row=>[row.seq,row.code]))
 })
 it('shows an explicitly selected row key and a genuine business identifier',()=>{
  const requested=structuredClone(audit)
  requested.view.sections[0].fields.unshift('id')
  expect(table(requested).rows[1].cells[0].textContent).toBe('row-1')
  const business=structuredClone(audit)
  business.dataset.fields[0].label='股票代码'
  for(const record of business.dataset.records)record.id=record.code
  expect(table(business).rows[1].cells[0].textContent).toBe('300750')
 })
 it('reads the linked dataset provenance from inert saved artifacts before or after template metadata was added',()=>{
  const expected={url:audit.dataset.sourceUrl,label:audit.dataset.note}
  const representations=[{containerSpec:audit},{containerSpec:renderDatasetViewArtifact(audit)},{containerSpec:{html:'<script id="sherlock-template-data" type="application/json">'+JSON.stringify({data:audit})+'</script>'}}]
  for(const node of representations){
   const info=getComponentSourceInfo(node)
   expect(info.records).toHaveLength(1)
   expect(info.records[0]).toMatchObject(expected)
   expect(info.asOf).toBe('2025-12-31')
   expect(componentDataStatusView(null,null,node)).toMatchObject({source:expected.label,time:'数据 2025-12-31',detail:'静态快照'})
  }
  const detached={containerSpec:{...audit,view:{dataset:'other'}}}
  expect(getComponentSourceInfo(detached).records).toEqual([])
  expect(componentDataStatusView(null,null,detached).source).toBe('来源未标注')
  for(const sourceUrl of ['javascript:alert(1)','https://user:password@example.com/a','https://example.com/a?token=private']){
   const node={containerSpec:{...audit,dataset:{...audit.dataset,sourceUrl}}}
   expect(getComponentSourceInfo(node).records).toEqual([])
   expect(componentDataStatusView(null,null,node).source).toBe('来源未标注')
  }
 })
})
