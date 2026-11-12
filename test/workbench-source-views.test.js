import {expect, it} from 'vitest'
import {compileObservedSourceView, observedSourceViews} from '../packages/dsh-research-task-runtime/workbench-source-views.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'

const records = [
  {nav_date: '20261110', unit_nav: 1.2, adj_nav: 1.4},
  {nav_date: '20261109', unit_nav: 1.1, adj_nav: 1.3}
]
const sources = [{tool:'ework__query', args:{api_name:'fund_nav', params:{ts_code:'A'}},
  response:{source:'Tushare',api:'fund_nav',records,pagination:{returned:2,possiblyMore:false}}}]
const line = {chartType:'Line Chart', encodings:{x:{field:'nav_date'},y:{field:'unit_nav'}}}

it('binds both views to one receipt and uses the existing line renderer with aligned data', () => {
  const [source] = observedSourceViews(sources)
  expect(source).toMatchObject({rows:2, fields:['nav_date','unit_nav','adj_nav']})
  const table = compileObservedSourceView('净值明细', {sourceRef:source.sourceRef}, sources)
  const chart = compileObservedSourceView('净值走势', {sourceRef:source.sourceRef,chart_spec:line}, sources)
  expect(table.rows).toEqual(records.map(row => Object.values(row)))
  expect(chart).toMatchObject({type:'chart',variant:'line',labels:['20261109','20261110'],series:[{values:[1.1,1.2]}]})
  expect(chart.detailRows).toHaveLength(2)
  expect(JSON.parse(acceptArtifactOutput(JSON.stringify(chart))).html).toContain('data-chart-template="line"')
})

it('returns the invalid field path and rejects incomplete pages and style overrides', () => {
  const [source] = observedSourceViews(sources)
  expect(() => compileObservedSourceView('净值', {sourceRef:source.sourceRef,chart_spec:{...line,encodings:{...line.encodings,y:{field:'missing'}}}}, sources)).toThrow(/encodings\/y\/field/)
  expect(() => compileObservedSourceView('净值', {sourceRef:source.sourceRef,chart_spec:{...line,color:'red'}}, sources)).toThrow(/chart_spec\/color/)
  const partial = [{...sources[0],response:{...sources[0].response,pagination:{returned:2,possiblyMore:true}}}]
  expect(observedSourceViews(partial)).toEqual([])
})

it('combines complete observed fund NAV responses only for the same explicit funds and query window',()=>{
  const sample=(code,end='20261110')=>({
    ...sources[0],args:{api_name:'fund_nav',params:{ts_code:code,start_date:'20261109',end_date:end}},
    response:{...sources[0].response,records:records.map(record=>({ts_code:code,...record}))},
  })
  const observations=['217022.OF','110037.OF','000402.OF'].map(code=>sample(code))
  const [reference]=observedSourceViews(observations)
  const input={sourceRef:reference.sourceRef}, originalRequest='比较 217022.OF 和 110037.OF 的 Tushare 净值'
  const scope={originalRequest,panelRequest:'合并两只基金 217022.OF / 110037.OF 的净值明细'}
  const table=compileObservedSourceView('两基金净值明细',input,observations,scope)
  expect(table.rows.map(row=>row.slice(0,2))).toEqual([
    ['110037.OF','20261109'],['217022.OF','20261109'],['110037.OF','20261110'],['217022.OF','20261110'],
  ])
  expect(compileObservedSourceView('单基金净值走势',{...input,chart_spec:line},observations,scope).detailRows).toHaveLength(2)
  expect(compileObservedSourceView('明细',input,[observations[0],sample('110037.OF','20261111')],scope).rows).toHaveLength(2)
  expect(compileObservedSourceView('明细',input,observations,{...scope,originalRequest:'只查 217022.OF'}).rows).toHaveLength(2)
})
