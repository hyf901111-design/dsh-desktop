const base={version:1,type:'chart',title:'图表验收 · 模拟数据',unit:'万元',asOf:'2026-09-30 · 模拟数据'};
const points=[{label:'样本A',x:80,y:2,group:'产品A',size:100},{label:'样本B',x:160,y:6,group:'产品B',size:400},{label:'样本C',x:120,y:4,group:'产品A',size:225}];
const candles=[{date:'2026-09-21',open:10,high:13,low:9,close:12,volume:100},{date:'2026-09-22',open:12,high:14,low:10,close:11,volume:200},{date:'2026-09-23',open:11,high:12,low:10,close:11,volume:0}];
export const advancedChartSamples={
 waterfall:{...base,variant:'waterfall',start:{label:'期初',value:120},steps:[{label:'新增',delta:26},{label:'成本',delta:-18},{label:'增长',delta:32},{label:'折旧',delta:-10}],endLabel:'期末'},
 funnel:{...base,variant:'funnel',unit:'人',stages:[{label:'访问',value:10000},{label:'浏览',value:6800},{label:'咨询',value:4200},{label:'试用',value:2100},{label:'成交',value:960}]},
 sankey:{...base,variant:'sankey',unit:'千人',columns:['来源','客群','结果'],nodes:[{id:'a',label:'搜索',column:0},{id:'b',label:'推荐',column:0},{id:'c',label:'新客',column:1},{id:'d',label:'复购',column:1},{id:'e',label:'成交',column:2},{id:'f',label:'流失',column:2}],links:[{source:'a',target:'c',value:45},{source:'a',target:'d',value:15},{source:'b',target:'c',value:20},{source:'b',target:'d',value:20},{source:'c',target:'e',value:45},{source:'c',target:'f',value:20},{source:'d',target:'e',value:27},{source:'d',target:'f',value:8}]},
 scatter:{...base,variant:'scatter',xAxis:{label:'客单价',unit:'元'},yAxis:{label:'转化率',unit:'%'},points:points.map(({size,...p})=>p)},
 bubble:{...base,variant:'bubble',xAxis:{label:'客单价',unit:'元'},yAxis:{label:'转化率',unit:'%'},sizeLabel:'订单量',sizeUnit:'单',points},
 heatmap:{...base,variant:'heatmap',unit:'相关系数',labels:['营收','成本','效率'],values:[[1,.6,-.2],[.6,1,null],[-.2,null,1]]},
 calendar:{...base,variant:'calendar',unit:'事件',start:'2026-02-27',end:'2026-03-03',values:[{date:'2026-02-27',value:4},{date:'2026-02-28',value:0},{date:'2026-03-02',value:8},{date:'2026-03-03',value:2}]},
 candlestick:{...base,variant:'candlestick',unit:'元',volumeUnit:'万手',candles},
 ohlc:{...base,variant:'ohlc',unit:'元',volumeUnit:'万手',candles}
};
