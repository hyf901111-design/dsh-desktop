import { expect, it } from 'vitest'
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { datasetViewValue } from '../packages/dsh-research-task-runtime/dataset-view-runtime.js'
import { renderDatasetViewArtifact } from '../packages/dsh-research-task-runtime/dataset-view-artifact.js'

it('retains the displayed cents and sortable numbers in the 510310 quarterly holdings ledger', () => {
  // SSE disclosure 510310_20260122_JCA4, page 10, section 5.3.1.
  const originalRequest = '仅用季报公开原表建研究工作台，公允价值保留到分。\n股票代码\t公允价值（元）\n300750\t11448803849.16\n600519\t10160652252.24\n601318\t8589675214.80\n300308\t7984305860.00\n601899\t6688357598.61'
  const artifact = validateWorkbench({
    requestId: 'disclosed-cents', title: '季末持仓复核', dataMode: 'source', originalRequest,
    sharedDatasets: [{ id: 'holdings', label: '季报持仓', fields: [
      {key: 'code', label: '股票代码'}, {key: 'fairValue', label: '公允价值（元）', unit: '元'}
    ], pastedTable: { block: 1, header: true, identity: 'code', numericFields: ['fairValue'] } }],
    panels: [{type: 'view', title: '持仓明细', view: {dataset: 'holdings', sections: [{kind: 'records', fields: ['code','fairValue']}]}}]
  }).panels[0].artifact
  const field = artifact.dataset.fields.find(field => field.key === 'fairValue')
  expect(artifact.dataset.records[2].fairValue).toBe(8589675214.8)
  expect(datasetViewValue(artifact.dataset.records[2].fairValue, field)).toBe('8589675214.80 元')
  expect(datasetViewValue(artifact.dataset.records[3].fairValue, field)).toBe('7984305860.00 元')
  expect(renderDatasetViewArtifact(artifact).html).toContain('7984305860.00 元')
})
