import { describe, expect, it } from 'vitest';
import { validateWorkbench, prepareSimulatedArtifact } from '../packages/dsh-research-task-runtime/workbench-plan.js';
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js';
import { generateSimulatedPanel } from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js';
import { marketVariant } from '../packages/dsh-research-task-runtime/workbench-design-contract.js';

const panel = (title, type, artifact) => ({ title, type, size: 'large', prompt: `展示${title}的模拟数据`, artifact });
const plan = (first, second) => ({
  requestId: 'medical-mock-20260206', title: '医药行业观察工作台（模拟）', dataMode: 'simulated',
  panels: [first, second]
});
const metric = panel('医药行业核心指标（模拟）', 'market', {
  asOf: '2026-02-06 15:00', variant: 'metrics', items: [{ label: '医药指数', value: '8246.31' }]
});

describe('真实客户端模拟工作台输入修复', () => {
  it('将完整的量价与风险表投影为原生图，保留分组柱图的季度和序列对应关系', () => {
    const panel = (title, prompt, rows, visualization) => ({
      title, prompt, type:'chart', content:{title, rows, visualization, sources:[{label:'原台账'}]},
    });
    const input = {
      requestId:'trade-chart-projection', title:'复盘工作台',
      originalRequest:'「量价」K线，开高低收（元）及量（手）。「风险」用散点图，横轴年化波动率、纵轴年度收益率，单位均为百分比。「对标」用分组柱图。',
      panels:[
        panel('量价','保留2个交易日',[
          {date:'2026-10-13',open:102,high:103,low:97,close:98,volume:4200},
          {date:'2026-10-12',open:100,high:104,low:99,close:102,volume:3000},
        ]),
        panel('风险','保留2个产品',[
          {name:'产品甲',volatility:2.5,return:3.4},
          {name:'产品乙',volatility:4.4,return:-0.8},
        ]),
        panel('对标','组合与基准',[
          {quarter:'2026Q2',portfolio:-0.5,benchmark:-0.2},
          {quarter:'2026Q1',portfolio:1.6,benchmark:1},
        ],{kind:'bar',label:'quarter',values:['portfolio','benchmark'],unit:'%'}),
      ],
    };
    const [candle,scatter,grouped] = validateWorkbench(input).panels.map(p=>p.artifact);
    expect(candle).toMatchObject({variant:'candlestick',unit:'元',volumeUnit:'手',candles:[
      {date:'2026-10-12',close:102,volume:3000},{date:'2026-10-13',close:98,volume:4200},
    ]});
    expect(scatter).toMatchObject({variant:'scatter',xAxis:{label:'年化波动率',unit:'%'},yAxis:{label:'年度收益率',unit:'%'},
      points:[{label:'产品甲',x:2.5,y:3.4},{label:'产品乙',x:4.4,y:-0.8}]});
    expect(grouped).toMatchObject({variant:'groupedBar',labels:['2026Q1','2026Q2'],series:[
      {name:'portfolio',values:[1.6,-0.5]},{name:'benchmark',values:[1,-0.2]},
    ]});
    const prepared = prepareSimulatedArtifact({
      type:'chart',title:'模拟量价',artifact:{...candle,sources:undefined,source:'原台账'},
    });
    expect(prepared).toMatchObject({volumeUnit:'手',candles:candle.candles,sources:[{label:'原台账'}]});
    const [candleInput,scatterInput] = input.panels;
    const mapped = validateWorkbench({...input,panels:[
      {title:candleInput.title,type:'chart',prompt:candleInput.prompt,artifact:{version:1,chartType:'candlestick',
        source:'原台账',unit:{price:'元',volume:'手'},xField:'date',openField:'open',highField:'high',
        lowField:'low',closeField:'close',volumeField:'volume',data:candleInput.content.rows}},
      {title:scatterInput.title,type:'chart',prompt:scatterInput.prompt,artifact:{version:1,type:'chart.scatter',
        source:'原台账',unit:{x:'%',y:'%'},labelField:'name',xField:'volatility',yField:'return',data:scatterInput.content.rows}},
    ]}).panels.map(p=>p.artifact);
    expect(mapped[0].candles).toEqual(candle.candles);
    expect(mapped[1].points).toEqual(scatter.points);
  });
  it('保留用户给出的瀑布图、配置环图与风险矩阵原值，拒绝账簿勾稽不符或改用 HTML', () => {
    const source = '用户提供的账簿';
    const market = (title, variant, details) => ({
      title, type:'market', prompt:'展示'+title, artifact:{version:1,type:'market',title,variant,asOf:'账簿期末',source,...details},
    });
    const waterfall = market('净值桥（瀑布图）','waterfall',{unit:'元',items:[
      {label:'期初',value:100,kind:'total'},
      {label:'利息',value:20,kind:'increase'},
      {label:'费用',value:-5,kind:'decrease'},
      {label:'期末',value:115,kind:'total'},
    ]});
    const donut = market('配置环形图','allocation-donut',{unit:'元',items:[{name:'债券',value:110,unit:'元'},{name:'现金',value:5,unit:'元'}]});
    const risk = market('风险矩阵','risk-matrix',{items:[{name:'赎回',probability:2,impact:4}]});
    const originalRequest = '基于账簿制作工作台，画「净值桥」瀑布图、「配置环形图」和「风险矩阵」。';
    const input = {requestId:'specialized-market', title:'账簿工作台', dataMode:'source',originalRequest, panels:[waterfall,donut,risk]};
    const result = validateWorkbench(input);
    expect(result.panels[0].artifact).toMatchObject({source,unit:'元',start:100,startLabel:'期初',endLabel:'期末',changes:[{label:'利息',value:20},{label:'费用',value:-5}]});
    expect(result.panels[1].artifact.items.map(({label,value})=>[label,value])).toEqual([['债券',110],['现金',5]]);
    expect(result.panels[2].artifact.items[0]).toMatchObject({label:'赎回',probability:2,impact:4});
    const mismatch = structuredClone(input);
    mismatch.panels[0].artifact.items.at(-1).value = 120;
    expect(()=>validateWorkbench(mismatch)).toThrow('期末金额与期初金额加各期增减额不一致');
    const wrongUnit = structuredClone(input);
    wrongUnit.panels[1].artifact.items[0].unit = '万元';
    expect(()=>validateWorkbench(wrongUnit)).toThrow('必须使用同一单位');
    expect(()=>validateWorkbench({...input,panels:[{...waterfall,type:'html',artifact:{version:1,type:'html',title:waterfall.title,html:'<p>净值桥</p>'}}]}))
      .toThrow('需使用用户指定的原生 market.waterfall');
  });
  it('按规划保留基金指标模板和六个季度时点', () => {
    const trend = generateSimulatedPanel({ title:'基金 vs 基准 累计收益率趋势（模拟）', prompt:'market.trend；6 个季度时点，两条同量纲序列', type:'market', size:'medium' }, '研究工作台双卡面板规划');
    const kpi = generateSimulatedPanel({ title:'基金核心指标卡（模拟）', prompt:'fund.kpi；最大回撤需要较长口径说明', type:'market', size:'medium' }, '研究工作台双卡面板规划');
    expect(marketVariant({title:'基金核心指标卡（模拟）',prompt:'fund.kpi'})).toBe('fund-kpi');
    expect(trend.artifact.labels).toEqual(['2025Q1','2025Q2','2025Q3','2025Q4','2026Q1','2026Q2']);
    expect(trend.artifact.series.every(item=>item.values.length===6)).toBe(true);
    expect(kpi.artifact.variant).toBe('fund-kpi');
    expect(kpi.artifact.items.find(item=>item.label==='最大回撤').detail.length).toBeGreaterThan(26);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(prepareSimulatedArtifact(trend)))).html).toContain('data-trend-series');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(prepareSimulatedArtifact(kpi)))).html).toContain('fund-detail-disclosure');
    const genericPlannerKpi = generateSimulatedPanel({ title:'基金核心指标（演示数据）', prompt:'最大回撤有完整长口径', type:'kpi', size:'small' }, '研究工作台面板规划');
    expect(genericPlannerKpi.type).toBe('market');
    expect(genericPlannerKpi.artifact.variant).toBe('fund-kpi');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(prepareSimulatedArtifact(genericPlannerKpi)))).html).toContain('fund-detail-disclosure');
    const scopedKpi = generateSimulatedPanel({title:'基金核心指标卡',prompt:'展示近一年收益、波动率、最大回撤；最大回撤口径可展开',type:'kpi',size:'small'},'基金核心指标卡生成');
    expect(scopedKpi.artifact.items.map(item=>item.label)).toEqual(['近一年收益','年化波动率','最大回撤']);
    expect(scopedKpi.artifact.items[2].detail).toContain('样本未提供峰谷日期及修复天数');
    const suppliedKpi = validateWorkbench({requestId:'fund-kpi-panel-title',title:'研究工作台面板规划',dataMode:'simulated',panels:[{
      title:'基金核心指标（演示数据）',prompt:'最大回撤说明',type:'kpi',size:'small',artifact:{items:[{label:'最大回撤',value:'-8.4%',detail:'模拟区间内按照日频复权单位净值计算峰值至后续谷值的最大跌幅'}]}
    }]});
    expect(suppliedKpi.panels[0].artifact.variant).toBe('fund-kpi');
  });
  it('保留图表已规划的数据，表格遵守行数', () => {
    const line = generateSimulatedPanel({ title: '近3个月双序列趋势', prompt: '折线图，近3个月，两条序列', type: 'chart', size: 'large', artifact: {version:1,type:'chart',title:'模拟趋势',variant:'line',labels:['2026-04','2026-05','2026-06'],series:[{name:'样本',values:[12,15,18]},{name:'基准',values:[10,12,16]}]} }, '模拟测试工作台');
    const bar = generateSimulatedPanel({ title: '三行业双序列对比', prompt: '柱状图，3个行业，两条序列', type: 'chart', size: 'large', artifact: {version:1,type:'chart',title:'模拟行业',variant:'bar',labels:['医药','科技','消费'],series:[{name:'样本',values:[12,15,18]},{name:'基准',values:[10,12,16]}]} }, '模拟测试工作台');
    const table = generateSimulatedPanel({ title: '三方案对比表', prompt: '3行格式化数值', type: 'table', size: 'large' }, '模拟测试工作台');
    expect(line.artifact.labels).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(bar.artifact.labels).toEqual(['医药', '科技', '消费']);
    expect(table.artifact.rows).toHaveLength(3);
    for (const chart of [line, bar]) {
      expect(chart.artifact.series).toHaveLength(2);
      expect(chart.artifact.series.every(series => series.values.length === chart.artifact.labels.length)).toBe(true);
      expect(() => acceptArtifactOutput(JSON.stringify(prepareSimulatedArtifact(chart)))).not.toThrow();
    }
    expect(() => acceptArtifactOutput(JSON.stringify(prepareSimulatedArtifact(table)))).not.toThrow();
  });
  it('批量准备量价和盘口固定模板，不在规划后因模拟样本缺失而失败', () => {
    const price = generateSimulatedPanel({ title: '贵州茅台量价联动', prompt: 'variant: price-volume；模拟价格与成交量', type: 'market', size: 'large' }, '证券量价与盘口工作台');
    const book = generateSimulatedPanel({ title: '贵州茅台买卖盘口', prompt: '同时生成 market.price-volume 与 market.order-book；模拟买卖十档', type: 'market', size: 'large' }, '证券量价与盘口工作台');
    expect(price.artifact.labels).toHaveLength(65);
    expect(book.artifact.bids).toHaveLength(10);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(price.artifact))).html).toContain('data-sherlock-market="price-volume"');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(book.artifact))).html).toContain('data-sherlock-market="order-book"');
    const prepared = validateWorkbench({ requestId: 'market-two-new', title: '证券量价与盘口工作台', dataMode: 'simulated', panels: [price, book] });
    expect(prepared.panels.map(item => item.artifact.variant)).toEqual(['price-volume', 'order-book']);
  });
  it('为资金流向模板准备可按时段与行业筛选的本地模拟样本', () => {
    const flow = generateSimulatedPanel({ title: '行业资金流向', prompt: 'variant: fund-flow', type: 'market', size: 'large' }, '行业观察工作台');
    expect(flow.artifact.records).toHaveLength(10);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(flow.artifact))).html).toContain('data-flow-industry');
  });
  it('为估值分位带准备完整时点与单调分位阈值', () => {
    const valuation = generateSimulatedPanel({ title: '估值分位带', prompt: 'variant: valuation-band', type: 'market', size: 'large' }, '白酒行业观察工作台');
    expect(valuation.artifact.values).toHaveLength(65);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(valuation.artifact))).html).toContain('valuation-band-middle');
  });
  it('为基金净值回撤模板准备同长净值与基准序列', () => {
    const panel = generateSimulatedPanel({ title: '基金净值与回撤', prompt: 'variant: equity-drawdown', type: 'market', size: 'large' }, '基金组合观察工作台');
    expect(panel.artifact.equity).toHaveLength(65);
    expect(panel.artifact.benchmark).toHaveLength(65);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('drawdown-controls');
  });
  it('为配置占比模板准备合计为100的本地模拟样本', () => {
    const panel = generateSimulatedPanel({ title: '资产配置占比', prompt: 'variant: allocation-donut', type: 'market', size: 'large' }, '基金组合观察工作台');
    expect(panel.artifact.items.reduce((sum, item) => sum + item.value, 0)).toBe(100);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('allocation-legend');
  });
  it('为增减瀑布模板准备可推导期末余额的本地模拟样本', () => {
    const panel = generateSimulatedPanel({ title: '利润增减瀑布图', prompt: 'variant: waterfall', type: 'market', size: 'large' }, '经营观察工作台');
    expect(panel.artifact.changes.reduce((sum, item) => sum + item.value, panel.artifact.start)).toBe(116);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('waterfall-readout');
  });
  it('为漏斗模板准备同批次递减的本地模拟样本', () => {
    const panel = generateSimulatedPanel({ title: '客户转化漏斗', prompt: 'variant: funnel', type: 'market', size: 'large' }, '运营观察工作台');
    expect(panel.artifact.stages.map(item => item.count)).toEqual([1000, 680, 310, 122]);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('funnel-stage-list');
  });
  it('为风险矩阵准备各等级可定位的本地模拟风险项', () => {
    const panel = generateSimulatedPanel({ title: '项目风险矩阵', prompt: 'variant: risk-matrix', type: 'market', size: 'large' }, '项目观察工作台');
    expect(panel.artifact.items).toHaveLength(4);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(panel.artifact))).html).toContain('risk-grid');
  });
  it('将仅多包一层的表格单元格展开为完整列，保留原始文字', () => {
    const table = panel('重点覆盖估值与盈利预期（模拟）', 'market', {
      asOf: '2026-02-06 15:00', columns: ['公司', '代码', '收盘', '涨跌', 'PE', 'EPS'],
      rows: [
        ['恒瑞医药', '600276.SH', '46.85', '+1.24', '32.15', '1.46'],
        [['药明康德', '603259.SH'], '58.32', '-0.86', '27.43', '2.13']
      ]
    });
    const artifact = validateWorkbench(plan(metric, table)).panels[1].artifact;
    expect(artifact.rows[1]).toEqual(['药明康德', '603259.SH', '58.32', '-0.86', '27.43', '2.13']);
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(artifact))).html).toContain('药明康德');
  });

  it('对演示趋势中仅短一个的序列等距补点并标明补点，保持首尾数值', () => {
    const trend = panel('行业表现与相对收益（模拟）', 'market', {
      asOf: '2026-02-06 15:00', variant: 'trend',
      labels: Array.from({ length: 12 }, (_, i) => `第${i + 1}日`),
      series: [{ name: '医药生物', values: Array.from({ length: 12 }, (_, i) => 100 + i) },
        { name: '创新药', values: Array.from({ length: 11 }, (_, i) => 100 + i * 2) }]
    });
    const artifact = validateWorkbench(plan(metric, trend)).panels[1].artifact;
    expect(artifact.series[1].values).toHaveLength(12);
    expect(artifact.series[1].values[0]).toBe(100);
    expect(artifact.series[1].values[1]).toBeCloseTo(101.81818, 4);
    expect(artifact.series[1].values.at(-1)).toBe(120);
    expect(artifact.note).toContain('创新药');
    expect(artifact.note).toContain('线性插值');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(artifact))).html).toContain('完整趋势数据');
  });

  it('将事件对象和观察重点整理为日历摘要，拆出日期中的时间', () => {
    const calendar = panel('催化日历与研究跟进（模拟）', 'calendar', {
      items: [{ title: 'III 期数据读出', date: '2026-02-10 09:00', object: '恒瑞医药',
        observation_focus: 'PFS/OS 与安全性', impact_window: '1–2 周', status: '待发布', category: '临床数据' }]
    });
    const artifact = validateWorkbench(plan(metric, calendar)).panels[1].artifact;
    expect(artifact.items[0].date).toBe('2026-02-10');
    expect(artifact.items[0].time).toBe('09:00');
    expect(artifact.items[0].summary).toContain('恒瑞医药');
    expect(artifact.items[0].summary).toContain('PFS/OS 与安全性');
    expect(artifact.items[0].summary).toContain('1–2 周');
    expect(JSON.parse(acceptArtifactOutput(JSON.stringify(artifact))).html).toContain('09:00');
  });

  it('无法安全补点时指出具体序列及横轴长度，供模型定点修正', () => {
    const trend = panel('行业表现与相对收益（模拟）', 'market', {
      asOf: '2026-02-06 15:00', variant: 'trend',
      labels: Array.from({ length: 12 }, (_, i) => `第${i + 1}日`),
      series: [{ name: '创新药', values: [100, 105, 110] }]
    });
    expect(() => validateWorkbench(plan(metric, trend))).toThrow(/创新药.*3.*12/);
  });

  it('无法确定如何拆分的表格行指出行列数量，不猜测单元格', () => {
    const table = panel('重点覆盖估值与盈利预期（模拟）', 'market', {
      asOf: '2026-02-06 15:00', columns: ['公司', '代码', '收盘'],
      rows: [['恒瑞医药', '600276.SH', '46.85'], ['药明康德', '603259.SH']]
    });
    expect(() => validateWorkbench(plan(metric, table))).toThrow(/第2行.*2.*3/);
  });
});

it('恢复用户明示的原生柱图和指标卡，保留原始数据',()=>{
 const output=validateWorkbench({
   requestId:'inline-presentation',title:'限额工作台',
   originalRequest:'做「限额占用率」用原生柱图展示百分比；「限额概览」用指标卡显示总数。',
   panels:[
     {type:'table',title:'限额占用率',prompt:'按组展示占用率百分比柱状图',artifact:{
       version:1,type:'table',title:'限额占用率',columns:['组别','占用率（%）'],rows:[['甲',120],['乙',0]]}},
     {type:'table',title:'限额概览',prompt:'原生指标卡',artifact:{
       version:1,type:'table',title:'限额概览',columns:['指标','数值','单位'],rows:[['总数',2,'组']]}}
   ]
 })
 expect(output.panels.map(panel=>panel.type)).toEqual(['chart','kpi'])
 expect(output.panels[0].artifact).toMatchObject({variant:'bar',unit:'%',labels:['甲','乙'],series:[{values:[120,0]}]})
 expect(output.panels[1].artifact.items).toEqual([{label:'总数',value:2,unit:'组'}])
})
