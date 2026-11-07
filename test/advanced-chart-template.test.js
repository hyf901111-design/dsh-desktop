import {describe,it,expect} from 'vitest';
import {advancedChartSamples as samples} from './fixtures/advanced-chart-samples.js';
import {advancedChartView} from '../packages/dsh-research-task-runtime/advanced-chart-view.js';
import {chartDataIssue,requestedChartVariant} from '../packages/dsh-research-task-runtime/chart-template-contract.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {validateWorkbench,prepareSimulatedArtifact,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
describe('remaining Figma 22A chart families',()=>{
 it.each(Object.keys(samples))('%s preserves data through the public creation path',variant=>{
  const s=samples[variant],panel={title:s.title,type:'chart',prompt:'chart.'+variant,size:'large',artifact:s};
  expect(chartDataIssue(s)).toBeNull();
  expect(validateWorkbench({requestId:'advanced-'+variant,title:'验收',dataMode:'simulated',panels:[panel]}).panels[0].artifact).toEqual(s);
  expect(prepareSimulatedArtifact(panel)).toEqual(s);
  const output=JSON.parse(acceptArtifactOutput(JSON.stringify(s)));
  expect(readTemplateModel(output).data).toEqual(s);expect(templateFor(s).schema).toContain('chart.'+variant);
  expect(workbenchDesignTemplate(panel).id).toBe('research.chart.'+variant);
  expect(workbenchPanelPrompt({title:'工作台',dataMode:'simulated'},panel)).toContain('必须输出 chart.'+variant);
  expect(requestedChartVariant('chart.'+variant)).toBe(variant);
  const v=advancedChartView(s,280,{height:180});expect(JSON.stringify(v)).not.toMatch(/NaN|Infinity/);expect(v.rows.length).toBeGreaterThan(0);
 });
 it('computes cumulative waterfall values, including changes crossing zero',()=>{
  const v=advancedChartView(samples.waterfall);expect(v.metrics.steps.map(s=>s.to)).toEqual([120,146,128,160,150,150]);
  const negative=advancedChartView({...samples.waterfall,start:{label:'起点',value:2},steps:[{label:'减少',delta:-5}]});expect(negative.metrics.steps.map(s=>s.to)).toEqual([2,-3,-3]);expect(negative.rows[1].detail).toContain('-3');
 });
 it('keeps the final waterfall category separate from the previous tick on narrow cards',()=>{
  const data={...samples.waterfall,start:{label:'期初MRR',value:1000},steps:[{label:'新增',delta:260},{label:'扩容',delta:140},{label:'挽回',delta:60},{label:'降档',delta:-85},{label:'流失',delta:-120},{label:'退款',delta:-30}],endLabel:'期末MRR'};
  for(const width of [280,376,624]){
   const view=advancedChartView(data,width),ticks=view.elements.filter(n=>n.tag==='text'&&n.attributes.y===view.height-15);
   expect(ticks[0].children).toEqual(['期初MRR']);expect(ticks.at(-1).children).toEqual(['期末MRR']);
   expect(ticks.at(-1).attributes.x-ticks.at(-2).attributes.x).toBeGreaterThan(60);
   expect(view.rows).toHaveLength(8);expect(view.metrics.steps.at(-1).to).toBe(1225);
  }
 });
 it('encodes funnel width as count and reports both conversion denominators',()=>{
  const v=advancedChartView(samples.funnel);expect(v.metrics.stages[2].ratio).toBe(.42);expect(v.metrics.stages[2].stepRatio).toBeCloseTo(4200/6800);expect(v.rows.at(-1).cells).toContain('9.6%');
  const z=advancedChartView({...samples.funnel,stages:[{label:'无',value:0},{label:'终点',value:0}]});expect(z.rows[1].detail).toContain('—');
 });
 it('conserves Sankey flow and preserves identical scale across columns and edges',()=>{
  const v=advancedChartView(samples.sankey);expect(v.metrics.total).toBe(100);
  expect(v.metrics.nodes.map(n=>n.value)).toEqual([60,40,65,35,72,28]);
  for(const edge of v.metrics.links)expect(edge.thickness/edge.value).toBeCloseTo(v.metrics.scale,10);
  expect(v.rows.find(r=>r.label==='搜索 → 新客').detail).toContain('75%');
 });
 it('uses bubble area rather than radius and preserves sample identity when filtering',()=>{
  const v=advancedChartView(samples.bubble),p=v.metrics.points;expect(p[1].radius/p[0].radius).toBeCloseTo(2,10);
  const filtered=advancedChartView(samples.bubble,320,{visible:[false,true]});expect(filtered.rows.map(r=>r.label)).toEqual(['样本B']);expect(filtered.metrics.xDomain).toEqual(v.metrics.xDomain);
 });
 it('distinguishes missing correlations/dates, explicit zero and out-of-range cells',()=>{
  const heat=advancedChartView(samples.heatmap);expect(heat.metrics.domain).toEqual([-1,1]);expect(heat.rows.find(r=>r.label==='成本 × 效率').cells).toContain('未提供');
  const calendar=advancedChartView(samples.calendar);expect(calendar.metrics.days).toHaveLength(5);expect(calendar.metrics.days[1]).toMatchObject({date:'2026-02-28',value:0,weekday:5});expect(calendar.metrics.days[2]).toMatchObject({date:'2026-03-01',value:null,weekday:6});
  expect(calendar.metrics.days[3]).toMatchObject({date:'2026-03-02',weekday:0});expect(calendar.metrics.total).toBe(14);
 });
 it('uses true OHLC extrema and aligned volume and keeps full data when selecting a range',()=>{
  for(const variant of ['candlestick','ohlc']){
   const v=advancedChartView(samples[variant]);expect(v.metrics.candles.map(c=>c.volume)).toEqual([100,200,0]);expect(v.rows[1].cells.slice(0,5)).toEqual(['12','14','10','11','200']);
   expect(v.metrics.candles.every(c=>c.highY<=c.openY&&c.highY<=c.closeY&&c.lowY>=c.openY&&c.lowY>=c.closeY)).toBe(true);
   expect(advancedChartView(samples[variant],320,{limit:2}).metrics.candles.map(c=>c.date)).toEqual(['2026-09-22','2026-09-23']);
  }
 });
 it.each(['candlestick','ohlc'])('uses dedicated red-up/green-down price colors for %s, independent of business status colors',variant=>{
  const view=advancedChartView(samples[variant]);
  const groups=view.elements.filter(n=>n.tag==='g'&&n.attributes['data-inspect']!==undefined);
  groups.forEach((group,i)=>{
   const expected=samples[variant].candles[i].close>=samples[variant].candles[i].open?'var(--sherlock-price-up,#df4f57)':'var(--sherlock-price-down,#00a83e)';
   expect(group.children.filter(n=>['plot-stem','volume-bar','candle-body'].includes(n.attributes?.class)).every(n=>(n.attributes.stroke??n.attributes.fill)===expected)).toBe(true);
  });
  expect(view.footnote).toContain('红：收≥开，绿：收<开');
 });
 it.each([
  {...samples.waterfall,steps:[{label:'缺失',delta:null}]},
  {...samples.funnel,stages:[{label:'先',value:2},{label:'后',value:3}]},
  {...samples.sankey,links:samples.sankey.links.slice(1)},
  {...samples.sankey,links:[...samples.sankey.links,{source:'c',target:'a',value:1}]},
  {...samples.sankey,links:[...samples.sankey.links,samples.sankey.links[0]]},
  {...samples.bubble,points:[{label:'A',x:1,y:2,size:-1}]},
  {...samples.scatter,points:[{label:'A',x:1,y:null}]},
  {...samples.heatmap,values:[[1,2,0],[2,1,0],[0,0,1]]},
  {...samples.heatmap,values:[[1,.6,0],[.5,1,0],[0,0,1]]},
  {...samples.calendar,start:'2026-02-30'},
  {...samples.calendar,values:[{date:'2026-02-28',value:1},{date:'2026-02-28',value:2}]},
  {...samples.candlestick,candles:[{date:'2026-09-21',open:10,high:9,low:8,close:10,volume:2}]},
  {...samples.ohlc,candles:[...samples.ohlc.candles].reverse()}
 ])('rejects misleading chart data before creating cards: %#',s=>{expect(chartDataIssue(s)).toBeTruthy();expect(acceptArtifactOutput(JSON.stringify(s))).toBeUndefined();});
 it('returns a focused Sankey repair hint with the failing node and preserves supplied data',()=>{
  const artifact=structuredClone(samples.sankey);artifact.links[4].value=44;
  const original=structuredClone(artifact);
  const panel={title:artifact.title,type:'chart',prompt:'chart.sankey',size:'large',artifact};
  for(const dataMode of ['simulated','source']){
   let message='';try{validateWorkbench({requestId:'repair-'+dataMode,title:'验收',dataMode,panels:[panel]});}catch(error){message=error.message;}
   expect(message).toContain('新客');expect(message).toContain('65');expect(message).toContain('64');
   expect(message).toContain('chart.sankey');expect(message).not.toContain('chart.waterfall');expect(message).not.toContain('chart.candlestick');
  }
  expect(artifact).toEqual(original);
  artifact.links[4].value=45;
  expect(prepareSimulatedArtifact({...panel,artifact})).toEqual(samples.sankey);
 });
 it('reports a heatmap matrix error with only its own schema',()=>{
  const artifact={...samples.heatmap,values:[[1,.6,0],[.5,1,0],[0,0,1]]};
  let message='';try{prepareSimulatedArtifact({title:artifact.title,type:'chart',artifact});}catch(error){message=error.message;}
  expect(message).toContain('矩阵必须对称');expect(message).toContain('chart.heatmap');expect(message).not.toContain('chart.sankey');
 });
 it('escapes text without allowing chart labels to become HTML',()=>{
  const s={...samples.scatter,points:[{label:'</script><img src=x onerror=alert(1)>',x:1,y:2}]};const out=JSON.parse(acceptArtifactOutput(JSON.stringify(s)));expect(out.html).not.toContain('<img src=x');expect(out.html).not.toContain('innerHTML');expect(readTemplateModel(out).data).toEqual(s);
 });
 it('retains dense datasets without duplicating the SVG into oversized HTML',()=>{
  const day=i=>new Date(Date.UTC(2024,0,1+i)).toISOString().slice(0,10);
  const dense=[
   {...samples.scatter,points:Array.from({length:600},(_,i)=>({label:'样本'+i,x:i,y:i%30}))},
   {...samples.bubble,points:Array.from({length:300},(_,i)=>({label:'样本'+i,x:i,y:i%30,size:i+1}))},
   {...samples.heatmap,labels:Array.from({length:16},(_,i)=>'指标'+i),values:Array.from({length:16},(_,i)=>Array.from({length:16},(_,j)=>i===j?1:.5))},
   {...samples.calendar,start:day(0),end:day(365),values:Array.from({length:366},(_,i)=>({date:day(i),value:i%20}))},
   ...['candlestick','ohlc'].map(variant=>({...samples[variant],candles:Array.from({length:366},(_,i)=>({date:day(i),open:10,high:14,low:8,close:11,volume:100}))}))
  ];
  for(const s of dense){
   const out=JSON.parse(acceptArtifactOutput(JSON.stringify(s)));
   expect(readTemplateModel(out).data).toEqual(s);
   expect(new TextEncoder().encode(out.html).length).toBeLessThan(200000);
   expect(JSON.stringify(advancedChartView(s,280,{height:180}))).not.toMatch(/NaN|Infinity/);
  }
 });
});
