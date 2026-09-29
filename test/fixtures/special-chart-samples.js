const base={version:1,type:'chart',title:'经营分析 · 模拟数据',unit:'万元',asOf:'2026-09-30 · 模拟数据，非真实业务记录'};
const root={name:'收入',children:[{name:'软件',children:[{name:'企业',value:60},{name:'个人',value:20}]},{name:'服务',children:[{name:'实施',value:30},{name:'培训',value:10}]},{name:'其他',value:8}]};
export const specialChartSamples={
 pie:{...base,variant:'pie',items:[{label:'华东',value:42},{label:'华南',value:28},{label:'华北',value:18},{label:'其他',value:12}]},
 donut:{...base,variant:'donut',items:[{label:'华东',value:42},{label:'华南',value:28},{label:'华北',value:18},{label:'其他',value:12}]},
 treemap:{...base,variant:'treemap',root},sunburst:{...base,variant:'sunburst',root},
 radar:{...base,variant:'radar',unit:'分',normalization:'各维度以同向0–100评分，分数越高表示该维度表现越好',labels:['效率','质量','交付','成本','响应'],series:[{name:'本期',values:[80,72,88,65,92]},{name:'上期',values:[65,70,73,80,68]}]},
 histogram:{...base,variant:'histogram',unit:'ms',binCount:6,samples:[10,13,15,17,18,19,19,20,20,21,22,23,24,25,25,25,27,28,29,30,32,35,37,40]},
 box:{...base,variant:'box',unit:'ms',groups:[{name:'服务A',samples:[1,2,3,4,5,6,20]},{name:'服务B',samples:[4,5,6,7,8,9,10]},{name:'服务C',samples:[3,5,6,9,12,14,15]}]},
 bullet:{...base,variant:'bullet',min:0,max:120,rows:[{label:'产品收入',value:72,target:85},{label:'服务收入',value:96,target:100},{label:'其他收入',value:55,target:60}],bands:[{to:50,label:'第一参考区间'},{to:85,label:'第二参考区间'},{to:120,label:'第三参考区间'}]},
 gauge:{...base,variant:'gauge',unit:'%',min:0,max:100,value:72,target:85}
};
