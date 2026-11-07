import {expect,it} from 'vitest';
import {validateWorkbench,workbenchPanelPrompt} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {marketVariant} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
import {requestedChartVariant,positiveChartIntent} from '../packages/dsh-research-task-runtime/chart-template-contract.js';

it.each(['不各自独立画K线','不要分别绘制 K 线图','不用蜡烛图','Do not draw candlestick charts'])('keeps a normalized comparison when candlesticks are explicitly excluded: %s',negative=>{
 const prompt='展示三只指数共同基期100的对比折线图；'+negative+'。';
 const input=validateWorkbench({requestId:'compare',title:'指数对比',dataMode:'source',panels:[{title:'归一化走势对比',type:'chart',size:'large',prompt}]});
 expect(requestedChartVariant(prompt)).toBe('line');
 expect(marketVariant({title:'归一化走势对比',type:'market',prompt})).toBe('trend');
 expect(workbenchPanelPrompt(input,input.panels[0])).toContain(negative);
});

it('preserves three validated history requests through comparison routing',()=>{
 const input=validateWorkbench({requestId:'compare-source',title:'指数对比',dataMode:'source',panels:[{title:'近三个月归一化走势对比',type:'market',size:'large',layout:'wide',prompt:'按共同交易日展示三指数基期100折线，不各自独立画K线。',publicData:{profile:'price-volume',intervalMinutes:0,requests:['sh000300','sh000905','sz399006'].map(symbol=>({source:'tencent-history',parameters_json:JSON.stringify({symbol,limit:60})}))}}]});
 expect(input.panels[0].type).toBe('chart');
 const task=workbenchPanelPrompt(input,input.panels[0]);
 for(const symbol of ['sh000300','sh000905','sz399006'])expect(task).toContain(symbol);
 expect(task).not.toContain('必须输出 market.candlestick');
});

it('still rejects a line chart presented as actual candlesticks',()=>{
 expect(()=>validateWorkbench({requestId:'candles',title:'K线研究',panels:[{title:'K线图',type:'chart',size:'large',prompt:'chart.line；展示K线'}]})).toThrow('candlestick');
});

it('uses content sizing when a valid plan omits the optional canvas preset',()=>{
 const input=validateWorkbench({requestId:'automatic-size',title:'指数对比',panels:[{title:'区间表现',type:'chart',layout:'wide',prompt:'展示三指数共同基期100的折线走势'}]});
 expect(input.panels[0].size).toBeTruthy();
 expect(()=>validateWorkbench({requestId:'invalid-size',title:'指数对比',panels:[{title:'区间表现',type:'chart',size:'huge',prompt:'折线走势'}]})).toThrow('规划尺寸');
});

it('does not erase a positive candlestick request nested in a caution',()=>{
 for(const text of ['不要漏掉K线和成交量','Do not omit candlestick charts'])expect(positiveChartIntent(text)).toBe(text);
});
