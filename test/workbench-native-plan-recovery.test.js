import { describe, expect, it } from 'vitest'
import plans from './fixtures/workbench-native-first-plans-20261108.json' with {type:'json'}
import { validateWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js'
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

const cryptoRequest='创建一个加密货币行情实时监控工作台，能覆盖多个维度的加密货币数据、资讯等信息。'
const krakenPanel=(pair,interval=1)=>({
  title:`${pair} 价格与成交量`,type:'market',prompt:'展示最新收盘价及成交量，保留交易对、单位和真实数据源。',
  publicData:{profile:'price-volume',layoutProfile:'openterminal',intervalMinutes:3,
    requests:[{source:'kraken-candles',parameters_json:JSON.stringify({pair,interval,limit:60})}]}
})
const topicNews=(query,options={})=>({title:`${query}新闻`,type:'financial-widget',prompt:`搜索${query}相关的最新新闻。`,
  library:{id:'builtin-news',options:{query,...options}}})
const cryptoPlan=(panels,originalRequest=cryptoRequest)=>validateWorkbench({
  requestId:'live-crypto-monitoring',title:'加密货币监控工作台',dataMode:'source',originalRequest,panels
})

it('prepares supported live crypto quotes and topic news from the observed planning shapes',()=>{
  const plan=cryptoPlan([krakenPanel('XBTUSD'),krakenPanel('ETHUSD',60),krakenPanel('SOLUSD',1440),
    ...['加密货币','比特币','数字资产 监管'].map(query=>topicNews(query))]);
  expect(plan.panels.slice(0,3).map(panel=>panel.artifact)).toEqual([
    ['BTC/USD','1m'],['ETH/USD','1h'],['SOL/USD','1d']
  ].map(([code,period])=>expect.objectContaining({widget:'quote',dataSource:'kraken',period,visibleBars:60,refreshMinutes:3,refreshEnabled:true,
    adjustment:'none',indicators:['MA','VOL','MACD'],symbols:[expect.objectContaining({market:'CRYPTO',code})]})));
  expect(plan.panels.slice(3).map(panel=>[panel.artifact.widget,panel.artifact.dataSource,panel.artifact.query])).toEqual([
    ['news','doubao','加密货币'],['news','doubao','比特币'],['news','doubao','数字资产 监管']
  ]);
  expect(validateWorkbench(plan)).toEqual(plan);
});

it('keeps authored chart forms, fixed windows, unsupported pairs and provider preferences',()=>{
  const quote=krakenPanel('XBTUSD');
  for(const scope of ['价格请用折线图，成交量用柱状图。','近 60 分钟的历史快照。','只看 Binance 行情。','用 OpenTerminal 量价图。',
    '行情用 1 小时 K 线。','只看 ETH/USDT。','禁止联网。']){
    expect(cryptoPlan([quote],cryptoRequest+scope).panels[0].publicData).toEqual(quote.publicData);
  }
  for(const original of [krakenPanel('XBTUSD',5),krakenPanel('DOGEUSD')]){
    expect(cryptoPlan([original]).panels[0].publicData).toEqual(original.publicData);
  }
  const onlySina=cryptoPlan([topicNews('加密货币')],cryptoRequest+'新闻使用新浪财经。');
  expect(onlySina.panels[0].artifact.dataSource).toBe('sina');
  const otherProvider=cryptoPlan([topicNews('加密货币',{dataSource:'eastmoney'})]);
  expect(otherProvider.panels[0].artifact.dataSource).toBe('eastmoney');
});

it('keeps a retrospective announcement or news record list as a native table',()=>{
  const plan=cryptoPlan([
    {...topicNews('数字资产'),title:'数字资产资讯明细',prompt:'整理数字资产最近30天的报道，逐条列出时间、发布机构、摘要和原文链接。'},
    {title:'证券公告清单',type:'news',prompt:'整理过去30天的公告清单，保留原文链接。'}
  ],'做个工作台，把过去30天数字资产报道和证券公告整理成表格。');
  for(const panel of plan.panels){
    expect(panel).toMatchObject({type:'market',prompt:expect.stringContaining('market.table')});
    expect(panel).not.toHaveProperty('artifact');
    expect(workbenchPanelPrompt(plan,panel)).toContain('【新闻主题约束】');
  }
});
