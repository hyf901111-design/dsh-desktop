import { describe, expect, it } from 'vitest'
import plans from './fixtures/workbench-native-first-plans-20261108.json' with {type:'json'}
import { validateWorkbench } from '../packages/dsh-research-task-runtime/workbench-plan.js'
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js'

describe('native workbench planning replays', () => {
  it('prepares the first operations plan without changing supplied chart or task data', () => {
    const before = structuredClone(plans.operations)
    const plan = validateWorkbench(plans.operations)
    expect(plan.panels).toHaveLength(6)
    expect(plan.tabs.map(tab => tab.panelIndexes.length)).toEqual([3, 3])
    expect(plan.panels[2].artifact).toMatchObject({
      variant:'bar', labels:['已完成','进行中','待开始'], series:[{values:[2,1,1]}]
    })
    expect(plan.panels[3].artifact).toMatchObject({
      variant:'line', series:[{name:'处理量',values:[8,12,10,15]}]
    })
    expect(plan.panels[4].artifact.items.map(({title,status,completed})=>[title,status,completed]))
      .toEqual([['发布登录页','todo',false],['完成导出','todo',false],['启动报警','todo',false]])
    expect(plan.panels[5].artifact.asOf).toContain(plans.operations.panels[5].artifact.note)
    expect(validateWorkbench(plan)).toEqual(plan)
    expect(plans.operations).toEqual(before)
  })

  it('routes a confirmed US candlestick through the native quote capability', () => {
    const plan = validateWorkbench(plans.finance)
    expect(plan.panels).toHaveLength(6)
    expect(plan.panels[1]).toMatchObject({
      type:'financial-widget', artifact:{widget:'quote', symbols:[{market:'US',code:'AAPL'}],
      visibleBars:20, refreshMinutes:5}
    })
  })

  it('uses a research text panel for a planned overview without fabricating a frozen source', () => {
    const plan = validateWorkbench(plans.web)
    expect(plan.panels).toHaveLength(4)
    expect(plan.panels[3]).toMatchObject({type:'markdown',prompt:plans.web.panels[3].prompt})
    expect(plan.panels[3]).not.toHaveProperty('artifact')
  })

  it('reports the incompatible cards together without changing an explicit provider', () => {
    const plan = structuredClone(plans.finance)
    plan.originalRequest += ' 只使用腾讯财经数据。'
    plan.panels[2].layout = 'unknown'
    expect(()=>validateWorkbench(plan)).toThrow(/苹果 AAPL 日K线[\s\S]*腾讯历史行情symbol[\s\S]*基期100走势对比[\s\S]*布局无效/u)
  })

  it('keeps a conflicting chart shape and misaligned categories invalid', () => {
    const chart = plans.operations.panels[3].artifact
    expect(acceptArtifactOutput(JSON.stringify({...chart, variant:'bar'}))).toBeUndefined()
    const second = {name:'其他',points:chart.series[0].points.slice(1)}
    expect(acceptArtifactOutput(JSON.stringify({...chart,series:[...chart.series,second]}))).toBeUndefined()
  })
})

it('retains strict capability boundaries for unknown symbols, fixed snapshots and derived materials', () => {
 const unknown=structuredClone(plans.finance)
 unknown.originalRequest=unknown.originalRequest.replace('AAPL','')
 expect(()=>validateWorkbench(unknown)).toThrow('腾讯历史行情symbol')
 const fixed=structuredClone(plans.finance)
 fixed.panels[1].prompt+=' 仅作固定日期快照。'
 expect(()=>validateWorkbench(fixed)).toThrow('腾讯历史行情symbol')
 const derived=structuredClone(plans.web)
 derived.originalRequest+=' 使用所选组件的材料进行总结提炼。'
 expect(()=>validateWorkbench(derived)).toThrow('派生组件必须')
})

it('admits unresolved report summaries and relationship maps without requiring fabricated snapshots', () => {
 const plan=validateWorkbench({
  requestId:'report-views',title:'报告内容示意看板',dataMode:'source',
  originalRequest:'📎 文件：\x60/Users/qa/Downloads/report.pdf\x60 帮我把这个报告做成一个内容示意看板',
  panels:[
   {title:'课程一：活用非文本前沿 AI',type:'summary',prompt:'提炼趋势、技术和适用时点，标注报告页码。'},
   {title:'主题关系',type:'mind-map',prompt:'组织主题与子趋势的关系，标注报告页码。'}
  ]
 })
 expect(plan.panels.map(panel=>panel.type)).toEqual(['markdown','mind-map'])
 expect(plan.panels.every(panel=>!panel.artifact)).toBe(true)
 expect(plan.panels[0].prompt).toBe('提炼趋势、技术和适用时点，标注报告页码。')
})
