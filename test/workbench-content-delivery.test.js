import {expect,it,vi} from 'vitest'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validateJsonSchemaValue} from '@deepseek-ai/dsh-tools'
import {registerWorkbench} from '../packages/dsh-research-task-runtime/workbench.js'
import {validateWorkbench,workbenchScopeDeficits} from '../packages/dsh-research-task-runtime/workbench-plan.js'
import {ResearchTaskRuntime} from '../packages/dsh-research-task-runtime/index.js'
import {readTemplateModel} from '../packages/dsh-research-task-runtime/component-template-registry.js'
import {registerPrototypeSourceTool} from '../packages/dsh-research-task-runtime/prototype-source-tool.js'

const source={label:'已取得的原始记录',url:'https://example.com/records'}
const plan=content=>({requestId:'content-direct',title:'完整资料',dataMode:'source',panels:[{title:'记录明细',type:'table',prompt:'呈现已取得的全部记录与完整正文。',content}]})
async function setup({request='用已取得的真实资料制作工作台。',documents,generate,prototype}={}){
 const dir=await mkdtemp(join(tmpdir(),'workbench-content-')),filePath=join(dir,'plans.json');let tool,state={version:1,tasks:[]}
 const adapter={start:vi.fn(generate??(async()=>{throw Error('prepared content must not start a child')}))}
 const storage={save:async value=>{state=structuredClone(value)},load:async()=>structuredClone(state)}
 const runtime=new ResearchTaskRuntime({adapter,storage})
 const readDocumentEvidence=documents?vi.fn(async()=>structuredClone(documents)):undefined
 let reader
 const ctx={agents:{get:()=>({})},tools:{register:value=>{if(value.name==='read_prototype')reader=value;else tool=value;return()=>{}},
  get:name=>name==='read_prototype'?reader:undefined,
  execute:vi.fn(async invocation=>({value:await reader.execute(invocation.arguments,invocation)})),
 },webServer:{register:()=>()=>{}},fs:{streamText:async function*(){yield prototype}},emit:()=>{}}
 if(prototype)registerPrototypeSourceTool(ctx,async(_ctx,_exec,path)=>({target:{displayPath:path},info:{size:Buffer.byteLength(prototype)}}))
 const dispose=await registerWorkbench(ctx,runtime,{filePath,readDocumentEvidence})
 const exec={agent:{session:{id:'parent',events:[{type:'user/message',data:{id:'human',source:{kind:'user'},content:[{type:'text',text:request}]}}]}},token:{},rootCallId:'workbench-call',signal:new AbortController().signal}
 return {tool,exec,runtime,adapter,storage,filePath,readDocumentEvidence,prototypeCalls:ctx.tools.execute,close:async()=>{await runtime.dispose();await dispose();await rm(dir,{recursive:true,force:true})}}
}

it('compiles content at the public tool boundary and preserves all records through storage and retries without a child',async()=>{
 const rows=Array.from({length:110},(_,i)=>({id:'ROW-'+i,name:'记录'+i,value:i,body:'原始说明'+('x'.repeat(540))+i,extra:'未声明展示的字段'+i}))
 const content={title:'完整记录',body:'正文须完整保留 <img src=x onerror=alert(1)>',rows,columns:[{key:'id',label:'编号'}],sources:[source],asOf:'2026-11-11',note:'原始说明与时点'}
 const input=plan(content),before=structuredClone(input),f=await setup()
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([])
  const receipt=await f.tool.execute(input,f.exec);expect(receipt.status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled()
  const task=[...f.runtime.tasks.values()][0],artifact=JSON.parse(task.finalOutput),model=readTemplateModel(artifact).data
  expect(model.rows).toHaveLength(110);expect(model.columns).toEqual(['编号','name','value','body','extra'])
  expect(model.rows[109]).toEqual(Object.values(rows[109]));expect(model.sources).toEqual([source]);expect(model.asOf).toBe(content.asOf);expect(model.note).toBe(content.note);expect(model.body).toBe(content.body)
  expect(artifact.html).toContain('110 / 110');expect(artifact.html).toContain('&lt;img src=x onerror=alert(1)&gt;');expect(artifact.html).not.toContain('<img src=x')
  const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(validateWorkbench(saved.input)).toEqual(saved.input);expect(input).toEqual(before)
  expect((await f.tool.execute(input,f.exec)).planId).toBe(receipt.planId);expect(f.runtime.tasks.size).toBe(1)
  const restored=new ResearchTaskRuntime({adapter:f.adapter,storage:f.storage});await restored.restore();try{expect([...restored.tasks.values()][0].finalOutput).toBe(task.finalOutput)}finally{await restored.dispose()}
  const changed=structuredClone(input);changed.panels[0].content.rows[0].value=999;await expect(f.tool.execute(changed,f.exec)).rejects.toThrow(/requestId/)
 }finally{await f.close()}
})

it('uses actual prose or chart data independently of the suggested panel type without losing auxiliary fields',()=>{
 const prose=validateWorkbench(plan({title:'说明',body:'## 完整正文\n原文与事实。',sources:[source]}));expect(prose.panels[0].type).toBe('markdown');expect(prose.panels[0].artifact.content).toContain('原文与事实')
 const chart=validateWorkbench(plan({title:'比较',rows:[{name:'甲',value:3,owner:'负责人甲'},{name:'乙',value:6,owner:'负责人乙'}],visualization:{kind:'bar',label:'name',values:['value']},sources:[source]}));expect(chart.panels[0].type).toBe('chart');expect(chart.panels[0].artifact.detailRows).toEqual([['甲',3,'负责人甲'],['乙',6,'负责人乙']]);expect(validateWorkbench(chart)).toEqual(chart)
 const simulated=validateWorkbench({...plan({title:'演练记录',rows:[{name:'甲',value:1}],body:'完整演练正文',note:'演练备注',asOf:'演练日'}),dataMode:'simulated'});expect(simulated.panels[0].artifact).toMatchObject({body:'完整演练正文',note:'演练备注',asOf:'演练日'});expect(simulated.panels[0].title).toContain('模拟')
 const longTitle=validateWorkbench(plan({title:'真实内容标题'.repeat(16),body:'完整正文'}));expect(validateWorkbench(longTitle)).toEqual(longTitle)
 const simulatedProse=validateWorkbench({...plan({title:'演练说明',body:'明确虚构的演练正文'}),dataMode:'simulated'});expect(simulatedProse.panels[0].type).toBe('markdown');expect(simulatedProse.panels[0].title).toContain('模拟')
})

it('uses a delivered component title when the planner omits the duplicate panel label',async()=>{
 const f=await setup()
 const input=plan({title:'原始记录汇总',body:'已经核对的说明。',sources:[source]})
 delete input.panels[0].title
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([])
  const result=await f.tool.execute(input,f.exec)
  expect(result.status).toBe('prepared')
  expect(result.panels).toEqual(['原始记录汇总'])
  const [saved]=JSON.parse(await readFile(f.filePath,'utf8'))
  expect(saved.input.panels[0].title).toBe('原始记录汇总')
  expect((await f.tool.execute(input,f.exec)).planId).toBe(result.planId)
  const changed=structuredClone(input)
  delete changed.panels[0].content.title
  await expect(f.tool.execute(changed,f.exec)).rejects.toThrow(/标题/)
 }finally{await f.close()}
})

it('compiles the native grouped bar declaration from rows with complete, aligned detail',()=>{
 const content={title:'季度对标',rows:[
  {quarter:'2026Q2',portfolio:-0.5,benchmark:-0.2,note:'保留亏损口径'},
  {quarter:'2026Q1',portfolio:1.6,benchmark:1,note:'原始期初'},
 ],visualization:{kind:'chart.groupedBar',label:'quarter',values:['portfolio','benchmark'],unit:'%'},sources:[source]}
 const result=validateWorkbench({...plan(content),originalRequest:'创建工作台。用「季度对标」分组柱图展示组合和基准季度收益率。'})
 expect(result.panels[0].artifact).toMatchObject({type:'chart',variant:'groupedBar',labels:['2026Q1','2026Q2'],unit:'%',
  series:[{name:'portfolio',values:[1.6,-0.5]},{name:'benchmark',values:[1,-0.2]}],
  detailRows:[['2026Q1',1.6,1,'原始期初'],['2026Q2',-0.5,-0.2,'保留亏损口径']]})
})

it('accepts equivalent literal candle and scatter shapes without another model call',()=>{
 const originalRequest='搭一个模拟工作台。「日线」用原生K线显示成交量，开高低收（元）和量（手）。「风险」用散点图，横轴年化波动率、纵轴年度收益率，单位均为百分比。'
 const candles=[{date:'2026-10-15',open:100,high:105,low:99,close:104,volume:5000}]
 const input={requestId:'chart-alias',title:'交易复盘',dataMode:'simulated',originalRequest,panels:[
  {title:'日线',type:'financial-widget',prompt:'K线与成交量',artifact:{version:1,title:'复盘日线',type:'chart.candlestick',unit:'元/手',volume:true,candles,source:'模拟交易台账'}},
  {title:'风险',type:'market',prompt:'散点图',artifact:{version:1,title:'风险散点',type:'scatter',unit:'%',xLabel:'年化波动率（%）',yLabel:'年度收益率（%）',points:[{name:'防御D',x:4.4,y:-0.8}],source:'模拟交易台账'}},
 ]}
 const result=validateWorkbench(input)
 expect(result.panels[0].artifact).toMatchObject({type:'chart',variant:'candlestick',unit:'元',volumeUnit:'手',candles,sources:[{label:'模拟交易台账'}]})
 expect(result.panels[1].artifact).toMatchObject({type:'chart',variant:'scatter',xAxis:{label:'年化波动率',unit:'%'},yAxis:{label:'年度收益率',unit:'%'},points:[{label:'防御D',x:4.4,y:-0.8}],sources:[{label:'模拟交易台账'}]})
 const conflict=structuredClone(input)
 conflict.panels[1].artifact.points[0].label='另一个产品'
 expect(()=>validateWorkbench(conflict)).toThrow(/chart.scatter/)
})

it('plots the authored ledger values when a planner copies a number incorrectly or omits a chart payload',()=>{
 const originalRequest=`创建模拟交易复盘工作台，不联网，来源标模拟演练台账。用「日线」原生K线并显示开高低收（元）和量（手）；「风险」散点图，横轴年化波动率、纵轴年度收益率，单位均为百分比；「对标」分组柱图比较组合和基准，单位百分比。
日线 日期｜开｜高｜低｜收｜量
2026-10-12｜100｜104｜99｜102｜3000
2026-10-13｜102｜103｜97｜98｜4200
散点 产品｜波动率｜收益率
稳健A｜2.5｜3.4
防御D｜4.4｜-0.8
季度 季度｜组合｜基准
2026Q2｜-0.5｜-0.2
2026Q1｜1.6｜1.0`
 const result=validateWorkbench({requestId:'authored-chart',title:'交易复盘',dataMode:'simulated',originalRequest,panels:[
  {title:'日线',type:'chart',prompt:'原生 K 线与成交量'},
  {title:'风险',type:'market',prompt:'原生散点图',artifact:{type:'scatter',points:[{product:'稳健A',volatility:2.5,return:3.4}]}},
  {title:'对标',type:'chart',prompt:'分组柱图',content:{title:'对标',rows:[{quarter:'2026Q1',portfolio:1.6,benchmark:-0.2}],visualization:{kind:'groupedBar',label:'quarter',values:['portfolio','benchmark'],unit:'%'}}},
 ]})
 const [price,risk,comparison]=result.panels.map(p=>p.artifact)
 expect(price).toMatchObject({variant:'candlestick',unit:'元',volumeUnit:'手',candles:[{date:'2026-10-12',open:100,high:104,low:99,close:102,volume:3000},{date:'2026-10-13',open:102,high:103,low:97,close:98,volume:4200}]})
 expect(risk).toMatchObject({variant:'scatter',points:[{label:'稳健A',x:2.5,y:3.4},{label:'防御D',x:4.4,y:-0.8}]})
 expect(comparison).toMatchObject({variant:'groupedBar',labels:['2026Q1','2026Q2'],unit:'%',series:[{name:'组合',values:[1.6,-0.5]},{name:'基准',values:[1,-0.2]}],sources:[{label:'模拟演练台账'}]})
 expect(validateWorkbench(result)).toEqual(result)
 const shared={id:'placeholder',label:'同一原表',fields:[{key:'sample',label:'原始编号'}],records:[{id:'A',sample:'临时规划'}]};
 const mapped=validateWorkbench({requestId:'authored-chart-shared',title:'交易复盘',dataMode:'source',originalRequest,sharedDatasets:[{...shared,note:'模拟演练台账',asOf:'2026-10-13'}],panels:[
  {title:'日线（K线+成交量）',type:'market',prompt:'原生K线并保留成交量',view:{dataset:'placeholder',subject:'日线',variant:'candlestick',sections:[{kind:'records',label:'date',fields:['open','high','low','close','volume']}]}},
  {title:'风险散点图',type:'chart',prompt:'原生散点图',artifact:{type:'scatter',title:'风险散点替代标题',points:[]}},
 ]});
 expect(mapped.panels.map(panel=>[panel.title,panel.artifact.variant])).toEqual([['日线','candlestick'],['风险','scatter']]);
 expect(mapped.panels[0].artifact.candles).toEqual(price.candles);
 expect(mapped.panels[1].artifact.points).toEqual(risk.points);
})

it('uses a unique original classification and explicit measure for a shared native chart',()=>{
 const source={id:'group-flows',label:'分类数据',asOf:'2026-11-06',note:'原型静态快照',fields:[{key:'id',label:'分类'},{key:'flow_1w',label:'近1周净流入'},{key:'flow_1m',label:'近1月净流入'}],records:[
  {id:'港股',flow_1w:5,flow_1m:9},{id:'美股',flow_1w:-4,flow_1m:-2}
 ]};
 const result=validateWorkbench({requestId:'source-axis',title:'分组资金',sharedDatasets:[source],panels:[
  {title:'各分类周流入',type:'chart',prompt:'用横向条形图展示 flow_1w 的正负值。',view:{dataset:source.id,variant:'horizontal',unit:'亿元',subject:'分类净流入',sections:[{kind:'records'}]}}
 ]});
 expect(result.panels[0].artifact).toMatchObject({variant:'horizontal',unit:'亿元',subtitle:'分类净流入',labels:['港股','美股'],series:[{name:'近1周净流入',values:[5,-4]}]});
 expect(validateWorkbench(result)).toEqual(result);
});

it('renders literal KPI content with its original metrics, units and sources',()=>{
 const input=plan({title:'本期资金总览',metrics:[{label:'净流入',value:'+0.2',unit:'亿元'},{label:'记录数',value:12,unit:'条'}],
  asOf:'2026-11-06',sources:[{label:'原始分类表'}],note:'按原表汇总'});
 input.panels[0].type='kpi';input.panels[0].prompt='用原生指标卡显示实际金额和记录数。';
 const result=validateWorkbench(input);
 expect(result.panels[0].artifact).toMatchObject({type:'kpi',items:input.panels[0].content.metrics,sources:[{label:'原始分类表'}],note:'按原表汇总'});
});

it('keeps a user-named sortable table when the planner visualizes the same complete details',()=>{
 const input={requestId:'channel-records',title:'渠道工作台',dataMode:'source',originalRequest:'做可排序「渠道明细」表，展示目标、实际、达成率。',panels:[
  {title:'渠道明细',prompt:'显示全部渠道记录，可排序。',type:'chart',artifact:{version:1,type:'chart',variant:'horizontal',title:'渠道明细',unit:'%',
   labels:['银行','券商'],series:[{name:'达成率',values:[88,90]}],detailColumns:['渠道','目标（万元）','实际（万元）','达成率'],detailRows:[['银行',1000,880,88],['券商',500,450,90]],sources:[{label:'渠道周报'}]}}
 ]};
 const [result]=validateWorkbench(input).panels;
 expect(result.type).toBe('table');
 expect(result.artifact).toMatchObject({type:'table',columns:['渠道','目标（万元）','实际（万元）','达成率（%）'],rows:input.panels[0].artifact.detailRows,sources:[{label:'渠道周报'}]});
});

it('prepares the three named sales cards from the original pasted ledger without a deferred model call',()=>{
 const originalRequest='用模拟渠道周报建工作台。做可排序「明细」表，展示目标、实际、达成率；「达成比较」用原生横向条形图比较各渠道；「销售指标」展示总目标、总实际、总体达成率（用总额计算）。金额万元，来源模拟渠道周报。不要联网。\n甲渠道｜100｜80\n乙渠道｜300｜330';
 const draft={requestId:'authored-sales',title:'销售台',dataMode:'simulated',generationMode:'deferred',originalRequest,
  panels:[{title:'明细',type:'table',prompt:'可排序明细。'},{title:'达成比较',type:'chart',prompt:'各渠道达成率。'},{title:'销售指标',type:'kpi',prompt:'整体目标、实际与达成率。'}]};
 const plan=validateWorkbench(draft);
 expect(plan.generationMode).toBeUndefined();
 expect(plan.panels[0].artifact.dataset.records.map(row=>[row.id,row.target,row.actual,row.completion])).toEqual([['甲渠道',100,80,80],['乙渠道',300,330,110]]);
 expect(plan.panels[1].artifact.series).toEqual([{name:'达成率',values:[80,110]}]);
 expect(plan.panels[2].artifact.items.map(item=>item.value)).toEqual([400,410,102.5]);
 expect(plan.panels[2].artifact.note).toContain('模拟渠道周报');
});

it('keeps the matching report-level unit on a multi-series line without discarding its source',()=>{
 const input=plan({title:'业绩与预测',unit:'亿元',rows:[{period:'2024A',revenue:3620.13,profit:507.45}],
  visualization:{kind:'line',label:'period',values:['revenue','profit'],unit:'亿元'},sources:[{label:'年报点评.pdf · 第1页'}]})
 const artifact=validateWorkbench(input).panels[0].artifact
 expect(artifact).toMatchObject({type:'chart',variant:'line',unit:'亿元',labels:['2024A'],series:[{name:'revenue',values:[3620.13]},{name:'profit',values:[507.45]}],sources:[{label:'年报点评.pdf · 第1页'}]})
 const requested={...input,originalRequest:'用研报做工作台，原生折线图比较营收和归母净利润。',panels:[{...input.panels[0],title:'营业收入与归母净利润',type:'chart'}]}
 expect(validateWorkbench(requested).panels[0].artifact).toMatchObject({unit:'亿元',series:[{name:'营业收入',values:[3620.13]},{name:'归母净利润',values:[507.45]}],sources:artifact.sources})
 const conflict=structuredClone(input)
 conflict.panels[0].content.unit='万元'
 expect(()=>validateWorkbench(conflict)).toThrow(/单位/)
})

it('turns literal shared and inline record mappings into native dated charts without new model work',()=>{
 const daily=[{id:'d-2',trade_date:'2026-10-23',amount:1024.45},{id:'d-1',trade_date:'2026-10-22',amount:815.05}]
 const fields=[{key:'trade_date',label:'交易日期'},{key:'amount',label:'成交额（千元）'}]
 const nav=[{id:'n-2',nav_date:'2026-10-23',unit_nav:1.8713,ts_code:'001234.OF'},{id:'n-1',nav_date:'2026-10-22',unit_nav:1.8712,ts_code:'001234.OF'}]
 const result=validateWorkbench({requestId:'mapped-actual',title:'日线与净值',dataMode:'source',
  originalRequest:'用已取得的记录创建工作台。「成交额」画原生柱状图；「净值」画原生折线图。',
  sharedDatasets:[{id:'daily',label:'日线原表',fields,records:daily,asOf:'2026-10-23',note:'Tushare daily 2026-10-22 至 2026-10-23'}],panels:[
   {title:'成交额',type:'chart',prompt:'原生柱状图按 trade_date 画 amount。',artifact:{type:'chart',title:'成交额',chartType:'bar',dataset:'daily',xField:'trade_date',yField:'amount',unit:'千元'}},
   {title:'净值',type:'chart',prompt:'用折线图展示 nav_date 与 unit_nav 的真实记录。',artifact:{type:'chart',title:'净值',version:1,fields:[{key:'nav_date',label:'净值日期'},{key:'unit_nav',label:'单位净值（元）',unit:'元'}],records:nav,source:{label:'Tushare fund_nav 2026-10-22 至 2026-10-23'}}},
 ]})
 expect(result.panels[0].artifact).toMatchObject({variant:'bar',unit:'千元',labels:['2026-10-22','2026-10-23'],series:[{values:[815.05,1024.45]}]})
 expect(result.panels[1].artifact).toMatchObject({variant:'line',unit:'元',labels:['2026-10-22','2026-10-23'],series:[{values:[1.8712,1.8713]}],
  detailRows:[['2026-10-22',1.8712,'n-1','001234.OF'],['2026-10-23',1.8713,'n-2','001234.OF']]})
 expect(validateWorkbench(result)).toEqual(result)
})

it('mixes a compiled explanation and a real shared view without starting extra content tasks',async()=>{
 const f=await setup(),input=plan({title:'独立交接说明',body:'已取得两条原记录，交接要求须逐项保留。',sources:[source]})
 input.sharedDatasets=[{id:'original',label:'交接原记录',asOf:'来源数据日',note:'已取得的真实档案',fields:[{key:'id',label:'编号'},{key:'name',label:'名称'}],records:[{id:'A',name:'原记录甲'},{id:'B',name:'原记录乙'}]}]
 input.panels.push({title:'完整原档案',type:'view',prompt:'保留全部原始档案。',view:{dataset:'original',sections:[{kind:'records',fields:['id','name']}]}})
 try{expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled();const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(validateWorkbench(saved.input)).toEqual(saved.input);expect(saved.input.sharedDatasets).toEqual(input.sharedDatasets);expect(f.runtime.tasks.size).toBe(2)}finally{await f.close()}
})

it('rejects conflicting payloads, unsafe sources and insufficient actual records instead of certifying delivery',()=>{
 const content={title:'比较',rows:[{name:'一条',value:1}],sources:[source]}
 const conflicting=plan(content);conflicting.panels[0].artifact={version:1,type:'table',title:'其他',columns:['name'],rows:[['被覆盖']]};expect(()=>validateWorkbench(conflicting)).toThrow(/混用/)
 expect(()=>validateWorkbench(plan({...content,sources:[{label:'脚本',url:'javascript:alert(1)'}]}))).toThrow(/安全/)
 const incomplete=plan(content);incomplete.panels[0].prompt='至少比较8只基金的收益';expect(()=>validateWorkbench(incomplete)).toThrow(/实际交付1/)
 expect(()=>validateWorkbench(plan({title:'空',rows:[]}))).toThrow(/完整对象记录/)
 expect(()=>validateWorkbench({...plan({title:'演练',body:'伪造引用 https://example.com/fabricated'}),dataMode:'simulated'})).toThrow(/外部链接/)
 const duplicate=plan(content);duplicate.panels.push({...duplicate.panels[0],title:'不同规划标题'});expect(()=>validateWorkbench(duplicate)).toThrow(/面板标题/)
})

const documents=[{name:'records.tsv',format:'tsv',blocks:[{id:'T1',rows:[['编号','名称'],['R1','原始甲'],['R2','原始乙']]}]}]
const documentContent={title:'原文件明细',rows:[{编号:'R1',名称:'原始甲'},{编号:'R2',名称:'原始乙'}],sources:[{label:'records.tsv [T1]'}],note:'原文 [T1]'}
const documentRequest='📎 文件：`/workspace/records.tsv`\n只用附件制作工作台，展示全部原始记录。'
it('materializes a delimited attachment once for both searchable rows and a native aggregate',async()=>{
 const docs=[{name:'ledger.csv',format:'csv',blocks:[{id:'T1',rows:[
  ['业务编号','渠道','金额（万元）','说明'],
  ['R-001','直营网','7.250','原始备注'],
  ['R-002','直营网','0','零值保留'],
  ['R-003','代销','-2','负值保留'],
 ]}]}]
 const f=await setup({request:'📎 文件：`/workspace/ledger.csv`\n用附件创建工作台，保留全部原始记录，按渠道汇总金额。',documents:docs})
 const input={requestId:'attachment-table',title:'渠道账簿',dataMode:'source',sharedDatasets:[
  {id:'ledger',label:'原始账簿',sourceTable:{document:'ledger.csv',block:'T1',identity:'业务编号',numericFields:['金额（万元）']},fields:[{key:'column3',label:'金额（万元）',unit:'万元'}]},
  {id:'totals',label:'按渠道汇总',aggregate:{dataset:'ledger',groupBy:['渠道'],measures:[
   {key:'count',label:'记录数',op:'count',unit:'条'},{key:'total',label:'总金额',op:'sum',field:'金额（万元）',unit:'万元'},
  ]}},
 ],panels:[
  {title:'逐笔明细',type:'table',prompt:'保留全部原始记录，可按渠道筛选。',view:{dataset:'ledger',filters:['渠道'],sections:[{kind:'records',label:'业务流水',fields:['id','业务编号','渠道','金额（万元）','说明']}] }},
  {title:'渠道金额汇总',type:'view',prompt:'统计各渠道的金额和条数。',view:{dataset:'totals',sections:[{kind:'records',fields:['count','total']}] }},
  {title:'渠道金额图',type:'chart',prompt:'用横向条形图展示各渠道金额，并保留记录数。',view:{dataset:'totals',sections:[{kind:'records',label:'渠道分类',fields:['total','count']}] }},
 ]}
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([])
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared')
  expect(f.readDocumentEvidence).toHaveBeenCalledOnce()
  expect(f.adapter.start).not.toHaveBeenCalled()
  const [ledgerView,totalsView,chart]=[...f.runtime.tasks.values()].map(task=>readTemplateModel(JSON.parse(task.finalOutput)).data)
  const {dataset:ledger}=ledgerView,{dataset:totals}=totalsView
  expect(ledger.records.map(r=>[r.id,r.column3,r.说明])).toEqual([['R-001',7.25,'原始备注'],['R-002',0,'零值保留'],['R-003',-2,'负值保留']])
  expect(ledger.fields.find(field=>field.key==='column3').unit).toBe('万元')
  expect(totals.records.map(r=>[r.渠道,r.count,r.total])).toEqual([['直营网',2,7.25],['代销',1,-2]])
  expect(chart).toMatchObject({variant:'horizontal',unit:'万元',labels:['直营网','代销'],series:[{name:'总金额',values:[7.25,-2]}],
   detailRows:[['直营网',7.25,2],['代销',-2,1]],sources:[{label:'ledger.csv [T1]'}]})
  const wrong=structuredClone(input)
  wrong.requestId='unauthorized-table'
  wrong.sharedDatasets[0].sourceTable.document='other.csv'
  await expect(f.tool.execute(wrong,f.exec)).rejects.toThrow(/本轮附件/)
 }finally{await f.close()}
})

it('uses the complete attachment records for a declared native hierarchy',async()=>{
 const documents=[{name:'ledger.csv',format:'csv',blocks:[{id:'T1',rows:[
  ['任务编号','区域','团队','任务','负责人'],['A-1','华东','运营','复核','张甲'],['A-2','华东','运营','复核','李乙'],['A-3','华北','运营','验收','王丙'],
 ]}]}]
 const request='📎 文件：`/workspace/ledger.csv`\n只用附件创建工作台。组织关系按原表的区域、团队、任务展示，保留3条任务。'
 const f=await setup({request,documents})
 const input={title:'交付组织',dataMode:'source',sharedDatasets:[{id:'ledger',label:'附件任务',sourceTable:{document:'ledger.csv',block:'T1',identity:'任务编号'}}],panels:[
  {title:'组织关系',type:'mind-map',prompt:'按区域、团队（1个）、任务保留实际层级。',hierarchy:{dataset:'ledger',levels:['区域','团队','任务']}},
 ]}
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([])
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared')
  expect(f.adapter.start).not.toHaveBeenCalled()
  const [task]=f.runtime.tasks.values(),artifact=readTemplateModel(JSON.parse(task.finalOutput)).data
  expect(artifact.content).toBe('# 组织关系\n- 华东\n  - 运营\n    - A-1 · 复核\n    - A-2 · 复核\n- 华北\n  - 运营\n    - A-3 · 验收')
  expect(artifact.source.title).toContain('ledger.csv [T1]')
  const [saved]=JSON.parse(await readFile(f.filePath,'utf8'))
  expect(validateWorkbench(saved.input)).toEqual(saved.input)
  expect((await f.tool.execute(input,f.exec)).planId).toBe(saved.id)
  const authoredOrder=structuredClone(input)
  authoredOrder.requestId='authored-hierarchy'
  delete authoredOrder.panels[0].hierarchy
  authoredOrder.panels[0].content={title:'生成模型复制的结构草稿',body:'仅凭预览列出了部分层级。'}
  authoredOrder.panels[0].view={dataset:'ledger',sections:[{kind:'records',title:'任务',fields:['任务编号','负责人']}]}
  expect((await f.tool.execute(authoredOrder,f.exec)).status).toBe('prepared')
  expect(f.adapter.start).not.toHaveBeenCalled()
  const snapshot=readTemplateModel(JSON.parse([...f.runtime.tasks.values()].at(-1).finalOutput)).data.source.text
  expect(snapshot).toContain('负责人');expect(snapshot).toContain('王丙')
 }finally{await f.close()}
})

it('keeps a Word roster and exact uncertainty notes searchable without retyping the source',async()=>{
 const documents=[{name:'监管资料.docx',blocks:[
  {id:'P1',text:'委员名单'},
  {id:'P2',text:'监事\n王甲、刘乙。'},
  {id:'P3',text:'“—”表示未掌握可确认的负责人信息，不代表岗位空缺。张丙的历史任职仍需核实。'},
  {id:'P4',text:'主席  胡甲    |    副主席  邓乙'},
  {id:'P5',text:'拟筹建监督中心，本次未核实其已经正式运行。'},
  {id:'T1',rows:[['综合司\n张甲 主任†（2024.12）','','市场司\n—'],['','','稽查局\n王丁 副局长']]},
  {id:'T2',rows:[['李戊','周己','钱庚'],['吴辛','赵壬','孙癸']]}
 ]}];
 const f=await setup({request:'📎 文件：`/workspace/监管资料.docx`\n只用这个附件做机构查询工作台，人员不漏，完整保留待核信息，能搜索和查看原文。',documents});
 const input={title:'监管速查',dataMode:'source',sharedDatasets:[
  {id:'people',label:'部门及人员原文',asOf:'宿主按原件核验',note:'原件中的部门及人员',documentGrid:{document:'监管资料.docx',blocks:[
   ...[1,2,3,4].map(column=>({block:'T1',layout:'cells',columns:[column]})),{block:'T2',layout:'cells',skipHeader:true},{block:'P2',layout:'name-list'}
  ]}},
  {id:'checks',label:'待核事项原文',documentGrid:{document:'监管资料.docx',blocks:[{block:'P3',layout:'paragraph'}]}}
 ],panels:[
  {title:'部门及负责人速查',type:'view',prompt:'保留完整人员原文并能搜索。',view:{dataset:'people',groupBy:['group'],details:['text','citation'],sections:[{kind:'records',fields:['name','group','text','citation']}]}},
  {title:'待核事项',type:'view',prompt:'完整保留原文缺失状态。',view:{dataset:'checks',sections:[{kind:'records',fields:['text','citation']}]}}
 ]};
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([]);
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');
  expect(f.adapter.start).not.toHaveBeenCalled();
  const [people,checks,leaders]=[...f.runtime.tasks.values()].map(task=>readTemplateModel(JSON.parse(task.finalOutput)).data);
  expect(people.dataset.records.map(row=>row.name)).toEqual(['综合司','市场司','稽查局','李戊','周己','钱庚','吴辛','赵壬','孙癸','王甲','刘乙']);
  expect(people.dataset.records[0]).toMatchObject({text:'综合司\n张甲 主任†（2024.12）',citation:'监管资料.docx [T1] 第1行第1列'});
  expect(people.dataset.records[1]).toMatchObject({text:'市场司\n—',status:'未掌握可确认的负责人信息，不代表岗位空缺',citation:'监管资料.docx [T1] 第1行第3列；状态说明 [P3]'});
  expect(people.view.sections[0].fields).toContain('status');
  expect(people.view.filters).toEqual(['group']);
  expect(checks.dataset.records[0]).toMatchObject({text:documents[0].blocks[2].text,citation:'监管资料.docx [P3]'});
  expect(checks.dataset.records[1]).toMatchObject({text:documents[0].blocks[4].text,citation:'监管资料.docx [P5]'});
  expect(leaders.dataset.records).toHaveLength(1);
  expect(leaders.dataset.records[0]).toMatchObject({text:documents[0].blocks[3].text,citation:'监管资料.docx [P4]'});
  const wrong=structuredClone(input);wrong.sharedDatasets[0].documentGrid.document='other.docx';
  await expect(f.tool.execute(wrong,f.exec)).rejects.toThrow(/本轮附件/);
 }finally{await f.close()}
});

it('compiles a fully specified local form into the existing renderer without a child model',async()=>{
 const f=await setup({request:'做一个研究登记工作台。「风险申请」要有必填组合名称、必填风险类型下拉（市场、信用、流动性）、必填额度（万元，1到500）、必填到期日期和可选说明。这张表单的记录只在工作台里保存。'});
 try{
  const result=await f.tool.execute({title:'风险登记',dataMode:'source',panels:[
   {title:'风险申请',type:'form',prompt:'本工作台本地风险申请表单。'}
  ]},f.exec);
  expect(result.status).toBe('prepared');
  const [task]=f.runtime.tasks.values();
  const output=JSON.parse(task.finalOutput),artifact=readTemplateModel(output).data;
  expect(artifact.mode).toBe('local');
  expect(artifact.fields.map(field=>[field.label,field.kind,field.required??false])).toEqual([
   ['组合名称','text',true],['风险类型','select',true],['额度（万元）','number',true],['到期日期','date',true],['说明','textarea',false]
  ]);
  expect(artifact.fields[1].options.map(option=>option.label)).toEqual(['市场','信用','流动性']);
  expect(artifact.fields[2]).toMatchObject({min:1,max:500});
  expect(output.html).toContain('form-reset');
  expect(f.adapter.start).not.toHaveBeenCalled();
 }finally{await f.close();}
});

it('counts cited Word hierarchy members only when the native outline actually includes them',()=>{
 const documentEvidence=[{name:'监管资料.docx',blocks:[
  {id:'T1',rows:[['机关职能部门 2 个 · 机关党委']]},
  {id:'T2',rows:[['综合司\n张甲','','市场司\n—'],['机关党委（机关纪委）']]},
  {id:'P1',text:'3个证券监管局：北京、天津、河北证监局。'},
  {id:'T3',rows:[['序号','专业委员会名称'],['1','公募专业委员会'],['2','私募专业委员会']]}
 ]}];
 const prompt='用原生导图呈现机关职能部门2个+机关党委、3个证监局、2个专业委员会。';
 const content='# 监管体系\n- 机关职能部门 2 个 + 机关党委 [T2]\n  - 综合司\n  - 市场司\n  - 机关党委（机关纪委）\n- 3个证监局：北京、天津、河北证监局 [P1]\n- 专业委员会 2 个 [T3]\n  - 1 公募专业委员会\n  - 2 私募专业委员会';
 const deficits=outline=>workbenchScopeDeficits({documentEvidence,originalRequest:'用附件做可视化',panels:[{
  type:'mind-map',title:'组织关系',prompt,artifact:{type:'mind-map',content:outline}
 }]});
 expect(deficits(content)).toEqual([]);
 expect(deficits(content.replace('  - 市场司','  - 未在原文的部门'))).toContainEqual(expect.objectContaining({expected:2,actual:1}));
 expect(deficits(content.replace('北京、','石家庄、'))).toContainEqual(expect.objectContaining({expected:3,actual:2}));
 expect(deficits(content.replace('[T3]','[T4]'))).toContainEqual(expect.objectContaining({expected:2,actual:null,entity:'专业委员会'}));
});

it('adds omitted Word branches to the prepared native hierarchy from the original source',async()=>{
 const name='监管层级.docx';
 const documents=[{name,blocks:[
  {id:'P1',text:'协会组织关系及原文。'},
  {id:'T1',rows:[['协会内设部门 3 个']]},
  {id:'T2',rows:[['办公室  —','人力资源部  王甲','风险监测部  刘乙']]},
  {id:'T3',rows:[['序号','专业委员会名称'],['1','公募专业委员会'],['2','私募专业委员会']]}
 ]}];
 const f=await setup({request:'📎 文件：`/workspace/监管层级.docx`\n只用这个附件做监管机构组织关系速查工作台。',documents});
 const artifact={version:1,type:'mind-map',title:'组织关系',content:'# 组织关系\n- 基金业协会\n  - 内设部门 3 个\n  - 专业委员会 2 个',
  source:{title:name,text:'组织关系来自附件 [P1]。'}};
 try{
  expect((await f.tool.execute({title:'监管速查',dataMode:'source',panels:[{title:artifact.title,type:'mind-map',prompt:'可视化组织关系。',artifact}]},f.exec)).status).toBe('prepared');
  const task=[...f.runtime.tasks.values()][0];
  const actual=readTemplateModel(JSON.parse(task.finalOutput)).data;
  expect(actual.content).toContain('  - 内设部门 3 个 [T2]\n    - 办公室 [T2]\n    - 人力资源部 [T2]\n    - 风险监测部 [T2]');
  expect(actual.content).toContain('  - 专业委员会 2 个 [T3]\n    - 公募专业委员会 [T3]\n    - 私募专业委员会 [T3]');
  expect(f.adapter.start).not.toHaveBeenCalled();
 }finally{await f.close();}
});

it('presents a cited Word outline as a native hierarchy and retains separate unresolved source notes',async()=>{
 const name='治理结构.docx',documents=[{name,blocks:[
  {id:'P1',text:'一 监管机构'},{id:'P2',text:'二 基金业协会'},
  {id:'P3',text:'本次未核实监测中心已正式运行。'},
  {id:'P4',text:'—表示未掌握可确认的负责人信息，不代表岗位空缺。'},
  {id:'T1',rows:[['协会内设部门 2 个']]},{id:'T2',rows:[['办公室  —','人力资源部  王甲']]}
 ]}];
 const f=await setup({request:'📎 文件：`/workspace/治理结构.docx`\n用附件做组织关系工作台，单独查看待核事项。',documents});
 const content='## 一 监管机构\n- 监管部门\n\n## 二 基金业协会\n- 会员大会\n- 内设部门 2 个 [T1]\n\n来源：'+name;
 try{
  const result=await f.tool.execute({title:'监管速查',dataMode:'source',panels:[
   {title:'组织关系总览',type:'markdown',prompt:'组织关系结构。',artifact:{version:1,title:'组织关系总览',type:'markdown',content}},
   {title:'待核事项',type:'markdown',prompt:'保留未知状态。',artifact:{version:1,title:'待核事项',type:'markdown',content:`[P4] ${documents[0].blocks[3].text}\n\n来源：${name}`}}
  ]},f.exec);
  expect(result.status).toBe('prepared');
  const [map,pending]=[...f.runtime.tasks.values()].map(task=>{
   const artifact=JSON.parse(task.finalOutput);
   return readTemplateModel(artifact)?.data??artifact;
  });
  expect(map.type).toBe('mind-map');
  expect(map.content).toContain('    - 办公室 [T2]');
  expect(map.source.text).toContain(content);
  expect(pending.content).toContain('[P3] 本次未核实监测中心已正式运行。');
  expect(f.adapter.start).not.toHaveBeenCalled();
 }finally{await f.close();}
});

it('recovers the two requested organizations from source chapters when a plan only graphs Word block ids',async()=>{
 const name='两家机构.docx';
 const documents=[{name,blocks:[
  {id:'P1',text:'一 甲监管机构'},
  {id:'P2',text:'主席  王甲'},
  {id:'T1',rows:[['机关职能部门 2 个 · 机关党委']]},
  {id:'T2',rows:[['综合司\n—','','市场司\n张乙'],['机关党委（机关纪委）','','']]},
  {id:'P3',text:'3个证券监管局：北京、天津、河北证监局。另设上海证券监管专员办事处、深圳证券监管专员办事处。'},
  {id:'P4',text:'二 基金业协会'},
  {id:'T3',rows:[['会员大会\n全体会员组成','会员代表大会\n选举理事']]},
  {id:'P5',text:'会员代表大会选举理事、监事'},
  {id:'T4',rows:[['理事会\n理事长 刘甲','监事会\n监事长 王乙']]},
  {id:'P6',text:'三 核查说明'}
 ]}];
 const f=await setup({request:'📎 文件：`/workspace/两家机构.docx`\n用附件做甲监管机构和基金业协会的组织关系工作台。',documents});
 const title='甲监管机构组织架构总览';
 const artifact={version:1,type:'mind-map',title,content:`# ${title}\n- T2\n  - 综合司\n  - 市场司\n  - 机关党委（机关纪委）`,
  source:{title:name,text:name+' [T2]'}};
 try{
  const result=await f.tool.execute({title:'监管速查',dataMode:'source',panels:[
   {title,type:'mind-map',prompt:'展示机关职能部门2个+机关党委、3个证监局、2个专员办。',artifact}
  ]},f.exec);
  expect(result.status).toBe('prepared');
  const [task]=f.runtime.tasks.values(),output=JSON.parse(task.finalOutput);
  const map=readTemplateModel(output)?.data??output;
  expect(task.deliveryStatus).toBeUndefined();
  expect(map.content).toContain('- 基金业协会 [P4]\n  - 会员大会 [T3]');
  expect(map.content).toMatch(/会员代表大会 \[T3\][\s\S]+    - 理事会 \[T4\]/u);
  expect(map.content).toContain('    - 深圳证券监管专员办事处 [P3]');
  expect(map.content).not.toContain('三 核查说明');
  expect(f.adapter.start).not.toHaveBeenCalled();
 }finally{await f.close();}
});

it('does not require four dataset rows for a four-action countdown control',()=>{
 const html='<button>开始</button><button>暂停</button><button>继续</button><button>重置</button>';
 const artifact={version:1,type:'html',title:'番茄钟',html};
 const deficits=prompt=>workbenchScopeDeficits({dataMode:'source',originalRequest:'制作番茄钟',panels:[{
  title:'番茄钟',prompt,type:'html',artifact
 }]});
 expect(deficits('提供开始、暂停、继续、重置四个操作，至少4个按钮。')).toEqual([]);
 expect(deficits('保留至少4条完整专注记录。')).toContainEqual(expect.objectContaining({expected:4,actual:null}));
});

it('materializes the complete static prototype array through the registered file reader and keeps native search',async()=>{
 const rows=Array.from({length:244},(_,i)=>({code:String(i).padStart(5,'0'),name:'产品'+i,group:i%2?'固收':'权益',ret:i===12?-0.0085:i/10000,channel:{直销:i/10},note:'原始说明'.repeat(90)}))
 const source=`<script>const original={products:${JSON.stringify(rows)}}; throw new Error('must never execute source');</script>`
 const f=await setup({request:'📎 文件：`/workspace/原型.html`\n根据原型制作研究工作台，完整展示244只产品，可搜索和筛选。',prototype:source})
 const input={requestId:'prototype-products',title:'指数运营',dataMode:'source',sharedDatasets:[
  {id:'products',label:'产品明细',note:'收益保持原始比例。',prototypeTable:{document:'原型.html',section:'original.products',identity:'code'},
   fields:[{key:'name',label:'产品名称'},{key:'group',label:'产品分类'},{key:'ret',label:'原值收益率'},{key:'channel.直销',label:'直销份额'}]},
 ],panels:[{title:'全部产品明细',type:'view',prompt:'从原型原样保留244只产品，按产品分类筛选和搜索。',view:{dataset:'products',filters:['group'],sections:[{kind:'records',fields:['code','name','group','ret','channel.直销']}]}}]}
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([])
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared')
  expect(f.adapter.start).not.toHaveBeenCalled()
  expect(f.prototypeCalls.mock.calls.length).toBeGreaterThan(1)
  const task=[...f.runtime.tasks.values()][0],artifact=readTemplateModel(JSON.parse(task.finalOutput)).data
  expect(artifact.dataset.records.map(row=>[row.id,row.name,row.group,row.ret])).toEqual(rows.map(row=>[row.code,row.name,row.group,row.ret]))
  expect(artifact.dataset.note).toContain('原型.html · original.products')
  expect(artifact.dataset.note).toContain('规划备注：收益保持原始比例。')
  const direct=artifact.dataset.fields.find(field=>field.label==='直销份额').key
  expect(artifact.view.sections[0].fields).toEqual(['id','name','group','ret',direct])
  expect(artifact.dataset.records.map(row=>row[direct])).toEqual(rows.map(row=>row.channel.直销))
  expect(artifact.view.filters).toEqual(['group'])
  const calls=f.prototypeCalls.mock.calls.length
  const wrong=structuredClone(input);wrong.sharedDatasets[0].prototypeTable.document='other.html'
  await expect(f.tool.execute(wrong,f.exec)).rejects.toThrow(/本轮附件/)
  expect(f.prototypeCalls.mock.calls.length).toBe(calls)
  const nested=structuredClone(input);nested.requestId='prototype-nested-field'
  nested.sharedDatasets[0].fields.at(-1).key='channel'
  await expect(f.tool.execute(nested,f.exec)).rejects.toThrow(/original\.products.*channel\.直销/u)
 }finally{await f.close()}
})

it('keeps cohort-wide facts distinct from a filtered listing and counts rendered exception bullets',()=>{
 const rows=[{id:'0001',ours:true},{id:'0002',ours:true},{id:'0003',ours:false},{id:'0004',ours:false},{id:'0005',ours:false}];
 const plan={requestId:'filtered-prototype',title:'原型快照',dataMode:'source',sharedDatasets:[
  {id:'full',label:'产品全表',asOf:'原型快照',note:'原型附件 · 全表',fields:[{key:'ours',label:'我司产品'}],records:rows}
 ],panels:[
  {title:'产品概览',type:'note',prompt:'覆盖产品 5 只，新上市 2 只。',content:{body:'覆盖产品 5 只，其中新上市 0004 和 0005。'}},
  {title:'竞品明细',type:'view',prompt:'全市场 5 只中剔除我司 2 只后的竞品产品（3 只）。',view:{dataset:'full',where:[{field:'ours',op:'in',values:[false]}],sections:[{kind:'records',fields:['id','ours']}]}},
  {title:'异常清单',type:'note',prompt:'异常清单（3 项），保留逐项原文。',content:{body:'· 编码 0003 缺少期初数据\n· 编码 0004 缺少净值\n· 编码 0005 待审核',note:'原型快照数据，来源：原型.html。'}}
 ]};
 expect(validateWorkbench(plan).panels[1].artifact.dataset.records).toEqual(rows);
 const incomplete=structuredClone(plan);incomplete.panels[2].content.body='· 编码 0003 缺少期初数据';
 expect(()=>validateWorkbench(incomplete)).toThrow(/异常清单.*实际交付1/);
 const truncated=structuredClone(plan);truncated.sharedDatasets[0].records=rows.slice(1);
 expect(()=>validateWorkbench(truncated)).toThrow(/竞品明细.*实际交付4/);
});

it('renders KPI counts and dated events directly from one complete shared ledger',async()=>{
 const f=await setup({request:'根据下面的模拟登记做整改工作台，包含可筛选明细、原生时间线和「整改KPI」指标卡。禁止联网。'});
 const records=[{id:'LC-01',team:'交易组',day:'2026-11-01',status:'待复核'},{id:'LC-02',team:'客户组',day:'2026-11-03',status:'已完成'},{id:'LC-03',team:'研究组',day:'2026-11-03',status:'待复核'}];
 const input={title:'整改工作台',dataMode:'simulated',sharedDatasets:[
  {id:'items',label:'模拟合规登记',fields:[{key:'id',label:'编号'},{key:'team',label:'责任组'},{key:'day',label:'发现日'},{key:'status',label:'状态'}],records},
  {id:'summary',label:'整改统计',aggregate:{dataset:'items',groupBy:[],measures:[
   {key:'total',label:'整改总数',op:'count',unit:'项'},{key:'pending',label:'待复核数',op:'count',unit:'项',where:{field:'status',equals:'待复核'}},{key:'done',label:'已完成数',op:'count',unit:'项',where:{field:'status',equals:'已完成'}}]}}
 ],panels:[
  {title:'整改明细',type:'table',prompt:'显示编号、责任组、发现日和状态，按状态筛选。',view:{dataset:'items',filters:['status'],sections:[{kind:'records',fields:['id','team','day','status']}]}},
  {title:'检查时间线',type:'timeline',prompt:'用原生时间线按发现日显示编号。',view:{dataset:'items',sections:[{kind:'schedule',fields:['id','status'],start:'day',owner:'team'}]}},
  {title:'整改KPI',type:'view',prompt:'用指标卡计算总数、待复核数和已完成数。',view:{dataset:'summary',sections:[{kind:'records'}]}}
 ]};
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([]);
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');
  expect(f.adapter.start).not.toHaveBeenCalled();
  const [view,timeline,kpi]=[...f.runtime.tasks.values()].map(task=>readTemplateModel(JSON.parse(task.finalOutput)).data);
  expect(view.dataset.records).toEqual(records);
  expect(timeline.type).toBe('timeline');
  expect(timeline.items.map(({id,title,time,actor})=>[id,title,time,actor])).toEqual(records.map(row=>[row.id,row.id,row.day,row.team]));
  expect(timeline.items.map(item=>item['状态'])).toEqual(records.map(row=>row.status));
  expect(kpi.items.map(({label,value,unit})=>[label,value,unit])).toEqual([['整改总数',3,'项'],['待复核数',2,'项'],['已完成数',1,'项']]);
  const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0].input;
  expect(validateWorkbench(saved)).toEqual(saved);
 }finally{await f.close()}
});

it('builds complete reconciliation views and signed charts from the actual pasted user rows',async()=>{
 const f=await setup({request:'用这份模拟清算台账做对账工作台，包含明细和差异清单。差异为账面减托管，差额为零时不列入差异清单。禁止联网。\n来源：模拟清算台账，2026-11-10。\n001｜固收｜1.2｜0.7\n002｜股票｜0.6｜0.6\n003｜现金｜-0.4｜-0.1'});
 const input={title:'对账',dataMode:'simulated',sharedDatasets:[{id:'ledger',label:'清算台账',asOf:'2026-10-01',pastedTable:{block:1,identity:'batch',numericFields:['book','custody'],derive:[{key:'delta',label:'差额',op:'subtract',left:'book',right:'custody',unit:'万元'}]},fields:[
  {key:'batch',label:'批次编号'},{key:'category',label:'资产类别'},{key:'book',label:'账面额',unit:'万元'},{key:'custody',label:'托管额',unit:'万元'}]}],panels:[
  {title:'对账明细',type:'view',prompt:'全部对账明细',view:{dataset:'ledger',sections:[{kind:'records',fields:['id','category','book','custody','delta']}]}},
  {title:'差异清单',type:'table',prompt:'仅显示不等于零的差额',view:{dataset:'ledger',where:[{field:'delta',op:'ne',value:0}],sections:[{kind:'records',fields:['id','delta']}]}},
  {title:'差额对比',type:'chart',prompt:'用横向条形图画有符号差额',view:{dataset:'ledger',variant:'horizontal',sections:[{kind:'records',label:'batch',fields:['delta']}]}}
 ]};
 try{
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');
  expect(f.adapter.start).not.toHaveBeenCalled();
  const [full,filtered,chart]=[...f.runtime.tasks.values()].map(task=>readTemplateModel(JSON.parse(task.finalOutput)).data);
  expect(full.dataset.records.map(row=>[row.id,row.delta])).toEqual([['001',0.5],['002',0],['003',-0.3]]);
  expect(full.dataset.note).toContain('模拟清算台账');
  expect(full.dataset.asOf).toBe('2026-11-10');
  expect(filtered.dataset.records).toEqual(full.dataset.records);
  expect(filtered.view.where).toEqual(input.panels[1].view.where);
  expect(chart).toMatchObject({variant:'horizontal',unit:'万元',labels:['001','002','003'],series:[{values:[0.5,0,-0.3]}]});
  const injected=structuredClone(input);injected.sharedDatasets[0].records=[{id:'999'}];
  await expect(f.tool.execute(injected,f.exec)).rejects.toThrow(/原始|原表/);
 }finally{await f.close()}
});

it('keeps a pasted asset identity available for filtered portfolio totals',()=>{
 const plan={requestId:'portfolio-paste',title:'资产配置',dataMode:'simulated',originalRequest:'根据模拟月末账簿做投委会工作台。看资产明细和「组合KPI」指标卡。禁止联网。\n来源：模拟月末账簿，2026-11-06。\n资产｜余额\n股票｜75\n现金｜25',sharedDatasets:[
  {id:'assets',label:'模拟月末账簿',fields:[{key:'assetClass',label:'资产'},{key:'amount',label:'余额',unit:'万元'}],
   pastedTable:{block:1,header:true,identity:'assetClass',numericFields:['amount']},aggregate:{dataset:'assets',groupBy:[],measures:[
    {key:'total',label:'总市值',op:'sum',field:'amount'},{key:'cash',label:'现金余额',op:'sum',field:'amount',where:{field:'assetClass',equals:'现金'}},
    {key:'cashRatio',label:'现金占比',op:'percent',field:'amount',where:{field:'assetClass',equals:'现金'},digits:2}
   ]}}
 ],panels:[
  {title:'资产明细',type:'table',prompt:'展示全部资产和余额。',view:{dataset:'assets',sections:[{kind:'records',fields:['assetClass','amount']}]}},
  {title:'组合KPI',type:'kpi',prompt:'汇总市值、现金余额和现金占比。',view:{dataset:'assets',groupBy:[],note:'现金占比按同一账簿计算。',sections:[{kind:'records',fields:['total','cash','cashRatio']}]}}
 ]};
 const result=validateWorkbench(plan);
 expect(result.panels[0].artifact.dataset.records.map(row=>[row.id,row.amount])).toEqual([['股票',75],['现金',25]]);
 expect(result.panels[1].artifact.items.map(item=>[item.label,item.value,item.unit])).toEqual([['总市值',100,'万元'],['现金余额',25,'万元'],['现金占比',25,'%']]);
 expect(result.panels[1].artifact.note).toContain('现金占比按同一账簿计算。');
 expect(validateWorkbench(result)).toEqual(result);
});

it('shows the original dimension beside pasted measures and validates a KPI source count',()=>{
 const base={requestId:'source-count',title:'整改工作台',dataMode:'simulated',originalRequest:'用模拟整改原表建工作台，禁止联网。\n甲组｜1\n乙组｜2',sharedDatasets:[
  {id:'rows',label:'整改原表',pastedTable:{block:1,numericFields:['amount']},fields:[{key:'team',label:'责任组'},{key:'amount',label:'件数'}]},
  {id:'totals',label:'整改汇总',aggregate:{dataset:'rows',groupBy:[],measures:[{key:'total',label:'总数',op:'count',unit:'条'}]}}
 ],panels:[
  {title:'各组明细',type:'view',prompt:'按责任组筛选，保留原表明细。',view:{dataset:'rows',filters:['team'],sections:[{kind:'records',fields:['amount']}]}},
  {title:'整改指标',type:'kpi',prompt:'用原生指标卡显示总数。数据为模拟整改原表2条记录。',view:{dataset:'totals',sections:[{kind:'records'}]}}
 ]};
 const result=validateWorkbench(base);
 expect(result.panels[0].artifact.view.sections[0].fields).toEqual(['team','amount']);
 expect(result.panels[1].artifact.items[0]).toMatchObject({label:'总数',value:2});
});

it('keeps visible prototype records complete and exposes original data-source entries',async()=>{
 const source='<script>const DATA={products:[{code:"0001",name:"产品一",className:"权益",region:"亚太",flow:2,ret:0.01},{code:"0002",name:"产品二",className:"固收",region:"欧洲",flow:-1,ret:-0.012}],sources:{"规模与净流入":"原始底稿","渠道与持仓":"InfoDB","对账口径":"底稿与渠道逐只核验"},recon:[{code:"0001",mark:"通过"},{code:"0002",mark:"待核"}]};</script>';
 const f=await setup({request:'📎 文件：`/workspace/指数原型.html`\n依照原型生成工作台，展示全部产品明细和数据来源。',prototype:source});
 const input={title:'指数复盘',dataMode:'source',sharedDatasets:[
  {id:'products',label:'产品',prototypeTable:{document:'指数原型.html',section:'DATA.products',identity:'code'},fields:[{key:'name',label:'产品名'},{key:'className',label:'分类'},{key:'region',label:'地域'},{key:'flow',label:'流入额'},{key:'ret',label:'近1周收益',unit:'比例'}]},
  {id:'sources',label:'数据出处',prototypeTable:{document:'指数原型.html',section:'DATA.sources',mode:'entries'},fields:[{key:'key',label:'数据项目'},{key:'value',label:'原始来源'}]},
  {id:'totals',label:'产品汇总',aggregate:{dataset:'products',groupBy:[],measures:[{key:'productCount',label:'产品数',op:'count'},{key:'netFlow',label:'净流入合计',op:'sum',field:'flow'}]}},
  {id:'recon',label:'对账底稿',asOf:'规划时点未经原文确认',prototypeTable:{document:'指数原型.html',section:'DATA.recon',identity:'code'},fields:[{key:'mark',label:'状态'}]}
 ],panels:[
  {title:'全市场产品明细',type:'view',prompt:'展示全部产品原始记录，可按地域和分类筛选。',view:{dataset:'products',filters:['className','region'],sections:[{kind:'records',fields:['name','flow']}]}},
  {title:'原型数据来源',type:'view',prompt:'列出原型中的全部数据来源。',view:{dataset:'sources',sections:[{kind:'records',fields:['key','value']}]}},
  {title:'市场总览',type:'kpi',prompt:'全市场2只港股 ETF 的整体指标：产品数和净流入合计。',view:{dataset:'totals',sections:[{kind:'records',fields:['productCount','netFlow']}]}},
  {title:'三方对账',type:'view',prompt:'保留原型的对账明细和来源。',view:{dataset:'recon',sections:[{kind:'records',fields:['id','mark']}]}}
 ]};
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([]);
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');
  expect(f.adapter.start).not.toHaveBeenCalled();
  const tasks=[...f.runtime.tasks.values()];
  const [products,sources,kpi,recon]=tasks.map(task=>readTemplateModel(JSON.parse(task.finalOutput)).data);
  expect(products.view.sections[0].fields).toEqual(['id','name','className','region','flow','ret']);
  expect(products.dataset.records.map(row=>row.id)).toEqual(['0001','0002']);
  expect(products.dataset.fields).toContainEqual({key:'ret',label:'近1周收益率',unit:'比例'});
  expect(sources.dataset.records.map(row=>[row.id,row.value])).toEqual([['规模与净流入','原始底稿'],['渠道与持仓','InfoDB'],['对账口径','底稿与渠道逐只核验']]);
  expect(kpi.items.map(item=>item.value)).toEqual([2,1]);
  expect(tasks[2].deliveryStatus).toBeUndefined();
  expect(recon.dataset.asOf).toBe('用户提供的原型静态快照');
  expect(recon.dataset.note).toContain('DATA.sources\n规模与净流入：原始底稿\n渠道与持仓：InfoDB\n对账口径：底稿与渠道逐只核验');
 }finally{await f.close()}
});

it('keeps the full classification text and accurate count behind short chart labels',()=>{
 const reason='业务审批和跨团队交接，需要保留完整说明。'.repeat(12)
 const rows=[{id:'T-1',reason},{id:'T-2',reason},{id:'T-3',reason:'另一项风险'}]
 const result=validateWorkbench({requestId:'risk-groups',title:'风险工作台',dataMode:'source',originalRequest:'汇总这3条任务的风险。',sharedDatasets:[
  {id:'raw',label:'任务原表',asOf:'原表日期',note:'原表 [T1]',fields:[{key:'reason',label:'风险与说明'}],records:rows},
  {id:'groups',label:'风险分布',aggregate:{dataset:'raw',groupBy:['reason'],measures:[{key:'count',label:'任务数',op:'count'}]}},
 ],panels:[{title:'风险分类汇总',type:'chart',prompt:'按风险分组，完整统计3条任务。',view:{dataset:'groups',sections:[{kind:'records',fields:['count']}]}}]})
 const artifact=result.panels[0].artifact
 expect(artifact.labels[0].length).toBeLessThan(60)
 expect(artifact.detailRows.map(row=>row.slice(1))).toEqual([[reason,2],['另一项风险',1]])
})

it('retains both original grouping dimensions when the selected chart label repeats',()=>{
 const input={requestId:'group-pairs',title:'跨区域任务',dataMode:'source',originalRequest:'用原表创建工作台并按区域和团队统计3条任务。',sharedDatasets:[
  {id:'ledger',label:'原表',asOf:'原表时点',note:'原表 [T1]',fields:[{key:'region',label:'区域'},{key:'team',label:'团队'}],records:[
   {id:'A',region:'华东',team:'运营'},{id:'B',region:'华东',team:'运营'},{id:'C',region:'华北',team:'运营'}]},
  {id:'group',label:'原表汇总',aggregate:{dataset:'ledger',groupBy:['region','team'],measures:[{key:'count',label:'任务数',op:'count',unit:'条'}]}},
 ],panels:[{title:'区域和团队任务汇总',type:'chart',prompt:'按区域和团队汇总3条任务。',view:{dataset:'group',sections:[{kind:'records',label:'team',fields:['count']}]}}]}
 const result=validateWorkbench(input)
 expect(result.panels[0].artifact).toMatchObject({labels:['华东 · 运营','华北 · 运营'],series:[{name:'任务数',values:[2,1]}],
  detailColumns:['图表分类','区域','团队','任务数'],detailRows:[['华东 · 运营','华东','运营',2],['华北 · 运营','华北','运营',1]]})
})

it('builds grouped bars from complete two-dimensional aggregate records',()=>{
 const sharedDatasets=[{id:'groups',label:'区域与团队预算',asOf:'原表时点',note:'原表 [T1]',groupBy:['region','team'],
  fields:[{key:'region',label:'区域'},{key:'team',label:'团队'},{key:'budget',label:'预算',unit:'万元'}],records:[
   {id:'A',region:'华东',team:'运营',budget:12},{id:'B',region:'华东',team:'产品',budget:9},
   {id:'C',region:'华北',team:'运营',budget:17},{id:'D',region:'华北',team:'产品',budget:15},
  ]}]
 const input={requestId:'chart-pivot',title:'预算工作台',dataMode:'source',originalRequest:'创建预算工作台，4条任务都保留。',sharedDatasets,
  panels:[{title:'区域预算图',type:'chart',prompt:'用分组柱图按区域与团队展示任务预算。',view:{dataset:'groups',sections:[{kind:'records',label:'team',fields:['budget']}]}}]}
 const result=validateWorkbench(input)
 expect(result.panels[0].artifact).toMatchObject({variant:'groupedBar',unit:'万元',labels:['华东','华北'],
  series:[{name:'运营',values:[12,17]},{name:'产品',values:[9,15]}]})
})

it('checks a source view subset against the requested document scope while retaining and validating its complete source',async()=>{
 const prompt='筛选出“名称”等于“原始甲”的完整记录。'
 const source=[{name:'records.tsv',format:'tsv',blocks:[{id:'T1',rows:[['编号','名称','日期'],['R1','原始甲','2026-10-01'],['R2','原始乙','']]}]}]
 const f=await setup({request:'📎 文件：`/workspace/records.tsv`\n只用附件创建工作台，'+prompt,documents:source})
 const input={requestId:'doc-subset',title:'原文范围',dataMode:'source',sharedDatasets:[{id:'rows',label:'原文件记录',note:'records.tsv [T1]',fields:[{key:'id',label:'编号'},{key:'name',label:'名称'},{key:'date',label:'日期'}],records:[{id:'R1',name:'原始甲',date:'2026-10-01'},{id:'R2',name:'原始乙'}]}],panels:[{title:'原始甲记录',type:'view',prompt,view:{dataset:'rows',where:[{field:'name',op:'in',values:['原始甲']}],sections:[{kind:'records',fields:['id','name']}]}}]}
 try{expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');expect(f.adapter.start).not.toHaveBeenCalled();const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(saved.input.sharedDatasets[0].records.map(row=>row.date)).toEqual(['2026-10-01',null]);expect(saved.input.sharedDatasets[0].asOf).toBe('附件原文，记录时点以各条出处为准');const changed=structuredClone(input);changed.requestId='wrong-hidden-record';changed.sharedDatasets[0].records[1].name='不应伪造的隐藏记录';expect((await f.tool.execute(changed,f.exec)).status).toBe('accepted');expect(await readFile(f.filePath,'utf8')).not.toContain('不应伪造的隐藏记录')}finally{await f.close()}
})
it('accepts a top-level panel note without treating it as verified document metadata',async()=>{
 const f=await setup({request:documentRequest,documents}),input=plan(documentContent)
 input.panels[0].note='附注：保持两条记录的原始出处。'
 try{
  expect(validateJsonSchemaValue(f.tool.parameters,input)).toEqual([])
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared')
  const [saved]=JSON.parse(await readFile(f.filePath,'utf8'))
  expect(saved.panels[0].prompt).toContain(input.panels[0].note)
  expect(saved.panels[0].artifact.note).toBe(documentContent.note)
 }finally{await f.close()}
})
it('keeps authorized outside sources in a mixed document board while checking its document references',async()=>{
 const f=await setup({request:'📎 文件：`/workspace/records.tsv`\n结合附件并查询外部资料，创建工作台并展示有来源的说明。',documents})
 const input=plan({title:'混合来源说明',body:'附件原始记录 [T1]；外部资料另列来源。',sources:[source]})
 try{expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');expect(f.readDocumentEvidence).toHaveBeenCalledOnce();expect(f.adapter.start).not.toHaveBeenCalled();const invalid=structuredClone(input);invalid.requestId='wrong-mixed-citation';invalid.panels[0].content.body='错误附件定位 [T9]';await expect(f.tool.execute(invalid,f.exec)).rejects.toThrow(/出处/)}finally{await f.close()}
})
it.each(['content','artifact'])('retains supplied document %s and validates original citations and records without a child',async kind=>{
 const f=await setup({request:documentRequest,documents}),input=plan(documentContent)
 if(kind==='artifact'){input.panels[0].artifact=validateWorkbench(input).panels[0].artifact;delete input.panels[0].content}
 input.panels[0].publicData={profile:'quotes-table',requests:[{source:'tencent-quotes',parameters_json:'{"symbols":["sh600000"]}'}]}
 try{
  expect((await f.tool.execute(input,f.exec)).status).toBe('prepared');expect(f.readDocumentEvidence).toHaveBeenCalledOnce();expect(f.adapter.start).not.toHaveBeenCalled()
  const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(saved.input.panels[0]).not.toHaveProperty('publicData');expect(saved.input.panels[0].artifact.rows).toEqual([['R1','原始甲'],['R2','原始乙']])
 }finally{await f.close()}
})
it.each(['citation','changed-record','missing-record','external-source'])('regenerates a document card with %s using the original attachment',async kind=>{
 const fresh=validateWorkbench(plan(documentContent)).panels[0].artifact
 const f=await setup({request:documentRequest,documents,generate:async()=>({childSessionId:'recovered',result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(fresh)}],documentEvidence:documents,documentExclusive:true}),dispose:async()=>{}})}),input=plan(structuredClone(documentContent))
 if(kind==='citation'){input.panels[0].content.sources=[{label:'records.tsv [T9]'}];input.panels[0].content.note='原文 [T9]'}
 if(kind==='changed-record')input.panels[0].content.rows[0].名称='冒充原文'
 if(kind==='missing-record')input.panels[0].content.rows.pop()
 if(kind==='external-source')input.panels[0].content.sources=[source]
 try{
  expect((await f.tool.execute(input,f.exec)).status).toBe('accepted');expect(f.runtime.tasks.size).toBe(1)
  await expect.poll(()=>[...f.runtime.tasks.values()][0].state).toBe('completed');expect(f.adapter.start).toHaveBeenCalledOnce()
  const saved=JSON.parse(await readFile(f.filePath,'utf8'))[0];expect(saved.input.panels[0].artifact).toBeUndefined()
  expect(readTemplateModel(JSON.parse([...f.runtime.tasks.values()][0].finalOutput)).data.rows).toEqual([['R1','原始甲'],['R2','原始乙']])
 }finally{await f.close()}
})

it('blocks a prepared document card when original evidence cannot be read',async()=>{
 const f=await setup({request:documentRequest})
 try{await expect(f.tool.execute(plan(documentContent),f.exec)).rejects.toThrow(/原文校验服务不可用/);expect(f.runtime.tasks.size).toBe(0)}finally{await f.close()}
})

it('keeps verified DOCX siblings and regenerates only the view containing an outside citation',async()=>{
 const documents=[{name:'org.docx',blocks:[{id:'P1',text:'甲部门原文与核查情况'},{id:'T1',rows:[['机构','出处'],['甲部门','[P1]']]}]}]
 const request='📎 文件：`/workspace/org.docx`\n只用附件制作组织工作台，提供概览和部门清单。'
 const fresh={version:1,type:'table',title:'部门清单',columns:['机构','出处'],rows:[['甲部门','[P1]']]}
 let attempts=0
 const f=await setup({request,documents,generate:async()=>{
  attempts++
  const artifact=attempts===1?{...fresh,rows:[['甲部门','https://example.com/unverified [P1]']]}:fresh
  return {childSessionId:`recovered-${attempts}`,result:Promise.resolve({stopReason:'completed',output:[{type:'text',text:JSON.stringify(artifact)}],documentEvidence:documents,documentExclusive:true}),dispose:async()=>{}}
 }})
 const input=plan({title:'组织概览',body:'甲部门原文 [P1]',sources:[{label:'org.docx [P1]'}]})
 input.sharedDatasets=[{id:'departments',label:'部门记录',asOf:'原文件时点',note:'org.docx [T1]',fields:[{key:'name',label:'机构'},{key:'source',label:'出处'}],records:[{id:'a',name:'甲部门',source:'https://example.com/outside [P1]'}]}]
 input.panels.push({title:'部门清单',type:'view',prompt:'用附件提供部门清单，支持搜索。',view:{dataset:'departments',sections:[{kind:'records',fields:['name','source']}]}})
 try{
  const receipt=await f.tool.execute(input,f.exec)
  expect(receipt.status).toBe('accepted');expect(receipt.templateIds).toEqual(['markdown','table'])
  await expect.poll(()=>[...f.runtime.tasks.values()].map(task=>task.state)).toEqual(['completed','completed'])
  expect(f.adapter.start).toHaveBeenCalledTimes(2)
  const child=f.adapter.start.mock.calls[0][0]
  expect(child.query).toContain(input.panels[1].prompt);expect(child.query).not.toContain('example.com');expect(child.hostContext.workbenchRequest.originalRequest).toBe(request);expect(child.hostContext.sharedDatasets).toBeUndefined()
  const saved=await readFile(f.filePath,'utf8');expect(saved).not.toContain('example.com')
  expect([...f.runtime.tasks.values()][1].finalOutput).not.toContain('example.com')
  expect((await f.tool.execute(input,f.exec)).planId).toBe(receipt.planId);expect(f.runtime.tasks.size).toBe(2)
 }finally{await f.close()}
})
