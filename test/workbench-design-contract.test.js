import { describe, expect, it } from 'vitest';
import { validateWorkbench, layoutWorkbench, workbenchPanelPrompt } from '../packages/dsh-research-task-runtime/workbench-plan.js';
import { marketVariant, workbenchDesignTemplate, MARKET_DESIGN_TEMPLATES, WORKBENCH_DESIGN_VERSION } from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
import { renderMarketArtifact } from '../packages/dsh-research-task-runtime/market-artifact.js';
import { researchMarketDimensions, researchBentoLayout } from '../packages/dsh-research-task-runtime/bento-layout.js';
import { buildResearchTaskPrompt } from '../packages/dsh-research-task-runtime/index.js';
import { acceptArtifactOutput } from '../packages/dsh-research-task-runtime/artifact-output.js';

const candles = [
  { date: '02-04', open: 10, high: 11, low: 9.5, close: 10.6, volume: 1200 },
  { date: '02-05', open: 10.6, high: 11.2, low: 10.2, close: 10.8, volume: 1800 }
];
const panel = (title, type, prompt, artifact) => ({ title, type, prompt, size: 'small', artifact });

describe('research workbench Figma design contract', () => {
  it.each([
    ['股价相对表现：三家火电 vs 沪深300','取得三只股票与沪深300的收盘价，计算区间涨跌幅并绘制对比走势（归一化起点100）。支持显示/隐藏各标的序列。'],
    ['多只股票最近走势','按真实交易日对齐收盘价，用共同基期100比较。'],
    ['Three-stock relative strength','Plot normalized time series for multiple stocks and the benchmark.']
  ])('keeps the requested multi-security trend instead of replacing it with a quote table: %s', (title,prompt) => {
    const input=validateWorkbench({requestId:'trend-intent',title:'金融研究',panels:[{title,type:'market',size:'large',prompt}]});
    const task=workbenchPanelPrompt(input,input.panels[0]);
    expect(marketVariant(input.panels[0])).toBe('trend');
    expect(task).toContain('模板提供样式功能参考，不是业务字段要求');
    expect(task).toContain(prompt);
    expect(task).not.toContain('必须输出 market.table');
    expect(buildResearchTaskPrompt({parentSessionId:'session',canvasNodeId:'node',kind:'container',prompt:task})).toContain('"variant":"trend"');
  });

  it.each([
    ['热门股票行情明细','三只股票最新行情，按涨跌幅排序'],
    ['自选报价','展示多只股票的价格和涨跌幅，不要绘制趋势图。'],
    ['多只股票走势明细表','三只股票逐日数据，保留日期与收盘价。'],
    ['股票对比','variant: table；三只股票的报价；趋势另在其他组件展示。']
  ])('preserves a quote table when no trend display is requested: %s',(title,prompt)=>{
    expect(marketVariant({title,type:'market',prompt})).toBe('table');
  });

  it('reads the rendered body kind after shared CSS injection and preserves provenance space during arrange', () => {
    const quote={version:1,type:'market',variant:'metrics',title:'指数行情',asOf:'2026-09-30',items:Array.from({length:4},(_,i)=>({label:`指标${i}`,value:'100',detail:'来源返回'})),note:'最近交易日指数，人民币口径；来源数据时点为2026-09-30。',sources:[{label:'已验证行情接口'}]};
    const containerSpec=JSON.parse(acceptArtifactOutput(JSON.stringify(quote)));
    expect(containerSpec.html).toContain('body[data-research-kind="calendar"]');
    expect(researchMarketDimensions({containerSpec})).toEqual({width:656,height:385});
    expect(researchMarketDimensions({containerSpec,sizeMode:'manual'})).toBeNull();
    expect(researchMarketDimensions({containerSpec:{type:'html',html:`<style>body[data-research-kind="calendar"]{color:red}body[data-research-kind="dashboard"]{color:black}</style><body data-sherlock-market="trend" data-sherlock-design="${WORKBENCH_DESIGN_VERSION}"></body>`}})).toEqual({width:656,height:300});
    const huge={...quote,items:Array.from({length:12},(_,i)=>({label:`指标${i}`,value:'100'})),note:'来源说明'.repeat(128)};
    expect(workbenchDesignTemplate({type:'market',artifact:huge}).height).toBe(456);
  });
  it('uses host rendered templates for simulated K-line and metrics without a per-panel model', () => {
    const input = validateWorkbench({ requestId: 'figma-smoke', title: '模拟行情', dataMode: 'simulated', panels: [
      panel('K线与成交量', 'market', 'variant: candlestick；显示开高低收和成交量', { variant: 'candlestick', asOf: '2026-02-05', candles }),
      panel('关键指标', 'market', 'variant: metrics；同一时点的价格与涨跌', { variant: 'metrics', asOf: '2026-02-05', items: [{ label: '现价', value: '10.8 元' }, { label: '涨跌', value: '+1.89%' }] })
    ] });
    const [candle, metrics] = layoutWorkbench(input.panels);
    expect(candle).toMatchObject({ width: 716, height: 760 });
    expect(metrics).toMatchObject({ width: 656, height: 233 });
    for (const p of [candle, metrics]) {
      const rendered = renderMarketArtifact(p.artifact);
      expect(rendered?.html).toContain(`data-sherlock-design="${WORKBENCH_DESIGN_VERSION}"`);
      expect(researchMarketDimensions({ containerSpec: rendered })).toEqual({ width: p.width, height: p.height });
      expect(rendered?.html).toContain('模拟数据');
    }
    expect(renderMarketArtifact(candle.artifact)?.html).toContain('K线与成交量');
    expect(renderMarketArtifact(candle.artifact)?.html).toContain('<canvas');
    expect(workbenchPanelPrompt(input, candle)).toContain('market.candlestick');
  });

  it('rejects a line chart that claims to be a K-line', () => {
    expect(() => validateWorkbench({ requestId: 'wrong-chart', title: '模拟行情', dataMode: 'simulated', panels: [
      panel('K线', 'chart', '以折线画 K线', { variant: 'line', labels: ['02-04', '02-05'], series: [{ name: '收盘价', values: [10.6, 10.8] }] }),
      panel('关键指标', 'market', 'variant: metrics', { variant: 'metrics', asOf: '2026-02-05', items: [{ label: '现价', value: '10.8 元' }] })
    ] })).toThrow('market.candlestick');
  });

  it('does not mistake a metrics panel for candlesticks when its data note mentions K-line', () => {
    const input = validateWorkbench({ requestId: 'same-source', title: '模拟行情', dataMode: 'simulated', panels: [
      panel('当日行情概览', 'market', 'variant: metrics；与 K线 使用同一收盘时点', { variant: 'metrics', asOf: '2026-02-05', items: [{ label: '现价', value: '10.8 元' }] }),
      panel('K线与成交量', 'market', 'variant: candlestick；显示 OHLC', { variant: 'candlestick', asOf: '2026-02-05', candles })
    ] });
    expect(input.panels.map(p => p.artifact.variant)).toEqual(['metrics', 'candlestick']);
  });

  it('routes source K-line generation to the host market schema', () => {
    const prompt = buildResearchTaskPrompt({ parentSessionId: 'session', canvasNodeId: 'node', kind: 'container',
      prompt: '工作台：贵金属\n本面板：K线与成交量\n展示有来源的 OHLC\n优先使用 market 类型' });
    expect(prompt).toContain('market.candlestick');
    expect(prompt).toContain('唯一交付格式：');
    expect(prompt).toContain('不能改成折线');
  });

  it('keeps host dimensions and source nodes in one versioned mapping', () => {
    expect(workbenchDesignTemplate({ type: 'market', title: '指标', prompt: 'variant: metrics' })).toMatchObject({
      version: WORKBENCH_DESIGN_VERSION, figma: '1696:73546', width: 656, height: 334
    });
    expect(MARKET_DESIGN_TEMPLATES.table).toMatchObject({ figma: '1696:75648', width: 656, height: 352 });
    for (const [variant, template] of Object.entries(MARKET_DESIGN_TEMPLATES)) {
      const html = `<body data-sherlock-market="${variant}" data-sherlock-design="${WORKBENCH_DESIGN_VERSION}"></body>`;
      expect(researchMarketDimensions({ containerSpec: { type: 'html', html } })).toEqual({ width: template.width, height: template.height });
    }
  });

  it('keeps the source calendar size and fits six operational metrics in a compact card', () => {
    expect(workbenchDesignTemplate({ type: 'calendar', artifact: { items: Array(8).fill({}) } })).toMatchObject({
      figma: '1918:345317', width: 656, height: 424
    });
    expect(workbenchDesignTemplate({ type: 'dashboard', artifact: { items: Array(6).fill({}) } })).toMatchObject({
      width: 656, height: 238
    });
    expect(workbenchDesignTemplate({ type: 'news', artifact: { items: Array(8).fill({}) } })).toMatchObject({
      width: 656, height: 356
    });
  });

  it('normalizes generic simulated finance cards into source-backed metrics, trend and table', () => {
    const input = validateWorkbench({ requestId: 'finance-normalize', title: '金融分析工作台', dataMode: 'simulated', panels: [
      panel('核心行情', 'dashboard', '关键数据', { asOf: '2026-02-06', items: [{ label: '现价', value: '1478.60 元' }] }),
      panel('价格趋势', 'chart', '日内走势', { variant: 'line', labels: ['09:30', '10:30'], series: [{ name: '价格', values: [1462, 1478] }] }),
      panel('交易明细', 'table', '交易数据', { columns: ['时间', '价格'], rows: [['09:30', '1462']] })
    ] });
    expect(input.panels.map(p => [p.type, p.artifact.variant])).toEqual([['market', 'metrics'], ['market', 'trend'], ['market', 'table']]);
    expect(layoutWorkbench(input.panels).map(p => [p.width, p.height])).toEqual([[656, 233], [656, 300], [656, 155]]);
    expect(input.panels.map(p => renderMarketArtifact(p.artifact)?.html.includes('data-sherlock-design'))).toEqual([true, true, true]);
    const bad = { requestId: 'no-financial-bar', title: '金融分析工作台', dataMode: 'simulated', panels: [
      panel('柱图', 'chart', '财务柱图', { variant: 'bar', labels: ['一','二'], series: [{ name: '值', values: [1,2] }] }),
      panel('指标', 'dashboard', '指标', { asOf: '模拟', items: [{ label: '值', value: '1' }] })
    ] };
    expect(validateWorkbench(bad).panels[0]).toMatchObject({ type: 'chart', artifact: { variant: 'bar' } });
  });

  it('keeps user supplied simulated KPI values instead of substituting template samples', () => {
    const input={requestId:'explicit-metrics',title:'客服运营工作台',dataMode:'simulated',panels:[
      {title:'咨询量指标',type:'dashboard',size:'small',prompt:'电话420次、在线580次、合计1000次'}
    ]};
    expect(()=>validateWorkbench(input)).toThrow(/原数值与单位/);
    input.panels[0].artifact={asOf:'2026-09',items:[
      {label:'电话咨询',value:'420 次'},
      {label:'在线咨询',value:'580 次'},
      {label:'合计',value:'1000 次'}
    ]};
    expect(validateWorkbench(input).panels[0].artifact.items.map(item=>item.value)).toEqual(['420 次','580 次','1000 次']);
  });

  it('sizes dense finance data for reading while retaining source size for sparse data', () => {
    const denseTable = {version:1,type:'market',variant:'table',title:'银行明细',asOf:'模拟',
      columns:['名称','代码','价格','涨跌','市盈率','市净率','市值'],rows:Array.from({length:8},(_,i)=>[`银行${i}`,'600000.SH','8.5','+0.2','6.2','0.8','1000'])};
    const denseMetrics = {version:1,type:'market',variant:'metrics',title:'关键指标',asOf:'模拟',
      items:Array.from({length:9},(_,i)=>({label:`指标${i}`,value:String(i)}))};
    expect(workbenchDesignTemplate({type:'market',artifact:denseTable})).toMatchObject({width:656,height:280});
    expect(workbenchDesignTemplate({type:'market',artifact:denseMetrics})).toMatchObject({width:656,height:456});
    expect(researchMarketDimensions({containerSpec:{type:'html',html:renderMarketArtifact(denseTable).html}})).toEqual({width:656,height:280});
    expect(researchMarketDimensions({containerSpec:{type:'html',html:renderMarketArtifact(denseMetrics).html}})).toEqual({width:656,height:456});
    expect(workbenchDesignTemplate({type:'market',artifact:{...denseTable,columns:['名称','价格'],rows:[['A','8.5']]}})).toMatchObject({width:656,height:155});
  });

  it('packs contracted financial cards across a wide canvas before shrinking them', () => {
    const nodes = ['metrics', 'candlestick', 'table', 'breadth'].map((variant, index) => ({
      id: `m${index}`, kind: 'generated-container', sizeMode: 'auto', generationStatus: 'completed',
      containerSpec: { type: 'html', html: `<body data-sherlock-market="${variant}" data-sherlock-design="${WORKBENCH_DESIGN_VERSION}"></body>` }
    }));
    const result = researchBentoLayout(nodes, { width: 1200, height: 800 });
    expect(result.width).toBe(1324);
    expect(result.nodes.find(n => n.id === 'm1')).toMatchObject({ width: 716, height: 760 });
    expect(result.nodes.every(n => n.x + n.width <= result.width && n.y + n.height <= result.height)).toBe(true);
    for (const a of result.nodes) for (const b of result.nodes) if (a !== b) {
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y).toBe(true);
    }
  });
});
