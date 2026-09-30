import {describe,expect,it} from 'vitest';
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {advancedChartSamples} from './fixtures/advanced-chart-samples.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js';

const panel=(variant,title,artifact=advancedChartSamples[variant])=>({type:'chart',size:'medium',title,prompt:`chart.${variant}；保留完整开高低收及成交量`,artifact:{...artifact,title}});
const plan=panels=>({requestId:'ohlc-routing',title:'测试行情工作台',dataMode:'simulated',panels});
describe('Figma 22A K-line and OHLC workbench routing',()=>{
 it('accepts both host templates together and preserves their shared source records',()=>{
  const input=validateWorkbench(plan([panel('candlestick','测试股票近20日K线图'),panel('ohlc','测试股票近20日OHLC图')]));
  expect(input.panels.map(p=>p.artifact.variant)).toEqual(['candlestick','ohlc']);
  for(const p of input.panels){
   const rendered=JSON.parse(acceptArtifactOutput(JSON.stringify(p.artifact)));
   expect(readTemplateModel(rendered).data.candles).toEqual(advancedChartSamples.candlestick.candles);
   expect(workbenchPanelPrompt(input,p)).toContain(`必须输出 chart.${p.artifact.variant}`);
  }
 });
 it('routes source planning without needing data before the fetch',()=>{
  const {artifact,...p}=panel('candlestick','测试股票K线图');
  expect(validateWorkbench({...plan([p]),dataMode:'source'}).panels[0].type).toBe('chart');
 });
 it('continues to reject a close-price line passed off as a K-line',()=>{
  expect(()=>validateWorkbench(plan([panel('line','测试股票K线图',{variant:'line',unit:'元',asOf:'2026-09-30',labels:['昨日','今日'],series:[{name:'收盘',values:[10,11]}]})]))).toThrow('完整 OHLC');
 });
 it('does not present a candle chart as an OHLC tick chart',()=>{
  const p=panel('candlestick','测试股票OHLC图');
  expect(()=>validateWorkbench(plan([p]))).toThrow('chart.ohlc');
 });
});
