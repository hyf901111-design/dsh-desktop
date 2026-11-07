import {describe,it,expect} from 'vitest';
import {CARTESIAN_CHART_TEMPLATES,CHART_VARIANTS,chartDataIssue,requestedChartVariant} from '../packages/dsh-research-task-runtime/chart-template-contract.js';
import {cartesianChartSvg,renderCartesianChart} from '../packages/dsh-research-task-runtime/cartesian-chart-artifact.js';
import {acceptArtifactOutput,workbenchMarketVariantIssue} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {prepareSimulatedArtifact,workbenchPanelPrompt,validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
import {generateSimulatedPanel} from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js';

const data=(variant,more={})=>({version:1,type:'chart',title:'经营分析',variant,labels:['一季度','二季度','三季度'],series:[{name:'产品',values:[20,35,50]},{name:'服务',values:[10,25,30]}],asOf:'2026-09-30 · 模拟数据',unit:'万元',...more});
describe('Figma cartesian templates',()=>{
 it.each(['净申购估算排名，用共享零轴的正负横条图展示','双向横条比较产品增减','横柱图展示区间收益'])('keeps signed ranking intent: %s',prompt=>{
   const panel={title:'产品排名',type:'chart',size:'large',prompt};
   expect(requestedChartVariant(prompt)).toBe('horizontal');
   const contract=workbenchPanelPrompt({title:'运营',dataMode:'source',originalRequest:prompt},panel);
   expect(contract).toContain('必须输出 chart.horizontal 的结构化数据');
   expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(data('line'))),contract)).toContain('chart.horizontal');
 });
 it('uses explicit sign colors and a shared zero axis without changing ranking values',()=>{
   const spec=data('horizontal',{colorBySign:true,series:[{name:'份额变化',values:[20,-10,0]}]});
   const accepted=JSON.parse(acceptArtifactOutput(JSON.stringify(spec)));
   expect(readTemplateModel(accepted).data).toEqual(spec);
   const svg=cartesianChartSvg(spec),marks=svg.elements.find(e=>e.attributes['data-series']===0).children;
   expect(marks.map(m=>m.attributes.fill)).toEqual(['var(--sherlock-market-positive)','var(--sherlock-market-negative)','var(--sherlock-muted)']);
   expect(marks[0].attributes.x).toBeCloseTo(marks[1].attributes.x+marks[1].attributes.width);
   expect(chartDataIssue({...spec,colorBySign:'yes'})).toBeTruthy();
   expect(chartDataIssue({...spec,variant:'line'})).toBeTruthy();
 });
 it('honors the explicit positive-green negative-red caption when the optional flag is omitted',()=>{
   const spec=data('horizontal',{subtitle:'共享零轴 · 正绿负红',series:[{name:'净申购估算',values:[20,-10,0]}]});
   const marks=cartesianChartSvg(spec).elements.find(e=>e.attributes['data-series']===0).children;
   expect(marks.map(m=>m.attributes.fill)).toEqual(['var(--sherlock-market-positive)','var(--sherlock-market-negative)','var(--sherlock-muted)']);
   const disabled=cartesianChartSvg({...spec,colorBySign:false}).elements.find(e=>e.attributes['data-series']===0).children;
   expect(new Set(disabled.map(m=>m.attributes.fill)).size).toBe(1);
 });
 it('keeps a real monthly comparison curve when a panel includes an optional chart syntax example',()=>{
   const panel={title:'近一月走势对比与相对沪深300强弱',type:'chart',size:'large',prompt:'取中际旭创(300308)、新易盛(300502)、工业富联(601138)及沪深300(000300)近一个月的日收盘价，统一归一化为近一月起点=100的累计涨跌幅对比曲线；并在附表中给出各标的近一月累计涨跌幅、相对沪深300超额收益（相对强弱），单位%。使用 financial_query 按确认后的代码取日线历史，注明来源与日期区间；普通柱状/折线用 chart 并可声明 chart.bar。数据取不到的标的明确标注缺失，不缩小研究范围。'};
   expect(requestedChartVariant(panel.title+'\n'+panel.prompt)).toBe('line');
   expect(workbenchDesignTemplate(panel).id).toBe('research.chart.line');
   const prompt=workbenchPanelPrompt({title:'算力产业链真实金融研究',dataMode:'source',originalRequest:panel.prompt},panel);
   expect(prompt).toContain('必须输出 chart.line 的结构化数据');
   const output=acceptArtifactOutput(JSON.stringify(data('line')));
   expect(workbenchMarketVariantIssue(output,prompt)).toBeNull();
   expect(workbenchMarketVariantIssue(acceptArtifactOutput(JSON.stringify(data('bar'))),prompt)).toContain('chart.line');
 });
 it.each([
   ['近一月走势；格式示例：chart.bar 绘制普通柱状图','line'],
   ['近一月走势；语法示例：chart.pie（饼图）','line'],
   ['近一月走势；模块格式示例：chart.bar（柱状图）/ chart.pie（饼图）','line'],
   ['近一月走势；普通柱状图用 chart 并可声明 chart.bar（柱状图）','line'],
   ['近一月走势\n格式示例：普通柱状图用 chart.bar','line'],
   ['近一月走势；格式示例：普通柱状图，使用 chart.bar','line'],
   ['近一月走势，普通柱状图用 chart 并可声明 chart.bar','line'],
   ['季度收入柱状图\n语法示例：chart.line','bar'],
   ['季度收入柱状图；例如 chart.line / chart.area','bar'],
   ['本面板：季度收入结构饼图\n例如 chart.bar','pie'],
   ['近月累计涨跌幅对比曲线；图表类型可声明 chart.bar','line'],
   ['近一月走势；格式示例 chart.line；必须使用 chart.bar','bar'],
   ['近一月走势；普通柱状/折线用 chart 并可声明 chart.bar；本面板使用 chart.groupedBar','groupedBar']
 ])('resolves the business chart intent in %s', (prompt,variant)=>{
   expect(requestedChartVariant(prompt)).toBe(variant);
 });
 it.each([
   ['近一月收益比较，使用 chart.bar 绘制收益柱状图','bar'],
   ['近一月走势，必须 chart.bar','bar'],
   ['近一月走势；格式示例 chart.line，但本面板必须使用 chart.bar','bar'],
   ['近一月走势；格式示例 chart.line，随后使用 chart.bar','bar'],
   ['近一月走势；格式示例 chart.pie（饼图），随后使用 chart.bar','bar'],
   ['近一月走势；格式示例 chart.pie（饼图），使用 chart.bar','bar'],
   ['近一月走势；格式示例 chart.pie（饼图），请使用 chart.bar','bar'],
   ['近一月走势；格式示例 chart.pie（饼图），请采用 chart.groupedBar','groupedBar'],
   ['近一月走势；格式示例 chart.pie（饼图），请务必使用 chart.bar','bar'],
   ['近一月走势；格式示例 chart.pie（饼图），请必须采用 chart.groupedBar','groupedBar'],
   ['近一月走势；格式示例 chart.pie（饼图），请使用 chart.line；格式示例 chart.bar（柱状图）','line'],
   ['近一月走势；格式示例 chart.pie（饼图）但本面板必须使用 chart.bar','bar'],
   ['近一月走势：使用 chart.bar 并可声明 chart.line 作为格式示例','bar'],
   ['近一月走势：使用 chart.bar 并可声明 chart.line','bar'],
   ['示例公司近一月走势，使用 chart.bar','bar'],
   ['示例公司近一月走势使用 chart.bar','bar'],
   ['chart.bar','bar'],
   ['季度收入对比柱状图','bar'],
   ['月度收益比较',undefined]
 ])('retains explicit selection and magnitude-comparison intent in %s',(prompt,variant)=>{
   expect(requestedChartVariant(prompt)).toBe(variant);
 });
 it.each(CHART_VARIANTS)('keeps an explicit %s selection beside optional format guidance',variant=>{
   expect(requestedChartVariant(`必须使用 chart.${variant}；普通柱状/折线用 chart 并可声明 chart.bar`)).toBe(variant);
   expect(requestedChartVariant(`例如三家公司的收益数据，使用 chart.${variant} 展示`)).toBe(variant);
 });
 it.each([
   ['近一月走势，例如展示三家公司收益，使用 chart.bar','bar'],
   ['请画每月销量，例如一月、二月的数据使用 chart.groupedBar 展示','groupedBar'],
   ['近一月走势，比如展示三家公司收益，采用 chart.bar','bar'],
   ['请画每月销量，举例选取一月、二月的数据，必须使用 chart.groupedBar 展示','groupedBar']
 ])('keeps a chart selection following a business-data example in %s',(prompt,variant)=>{
   expect(requestedChartVariant(prompt)).toBe(variant);
   const panel={title:'按要求展示数据',type:'chart',size:'large',prompt};
   expect(workbenchDesignTemplate(panel).id).toBe('research.chart.'+variant);
   expect(workbenchPanelPrompt({title:'经营分析',dataMode:'source',originalRequest:prompt},panel)).toContain('必须输出 chart.'+variant+' 的结构化数据');
 });
 it('keeps a long source/date explanation in the native chart note instead of rejecting or truncating the chart',()=>{
   const asOf='腾讯财经公开日K，数据日期2026-09-01至2026-10-20；'+('各公司保留原始证券代码、日期、前复权口径、价格单位和区间首尾收盘价。').repeat(9)
   const input=data('line',{asOf,note:'原有解读说明：统一基期100，不能将元与点直接同轴比较。'}),before=JSON.stringify(input)
   const output=acceptArtifactOutput(before)
   expect(output).toBeDefined()
   const model=readTemplateModel(JSON.parse(output))
   expect(model.templateId).toBe('chart.line')
   expect(model.data.asOf.length).toBeLessThanOrEqual(256)
   expect(model.data.note).toContain(asOf)
   expect(model.data.note).toContain(input.note)
   expect(model.data.series).toEqual(input.series);expect(model.data.labels).toEqual(input.labels)
   expect(chartDataIssue(model.data)).toBeNull();expect(JSON.stringify(input)).toBe(before)
 })
 it.each(CARTESIAN_CHART_TEMPLATES.map(t=>t.variant))('%s flows through the real artifact and workbench contract without losing data',variant=>{
   const input=data(variant), output=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
   expect(output.type).toBe('html');
   expect(readTemplateModel(output).data).toEqual(input);
   const panel={title:'模拟经营分析',prompt:'chart.'+variant,type:'chart',size:'large',artifact:input};
   expect(prepareSimulatedArtifact(panel)).toMatchObject({variant,labels:input.labels,series:input.series,unit:'万元',asOf:input.asOf});
   expect(workbenchDesignTemplate(panel).id).toBe('research.chart.'+variant);
   expect(workbenchPanelPrompt({title:'经营看板',dataMode:'simulated'},panel)).toContain('必须输出 chart.'+variant);
   expect(templateFor(input).figma).toMatch(/^1918:/);
   expect(templateFor(input).schema).toContain('不超过600');
 });
 it.each(['stackedArea','stackedBar','percentBar','dumbbell','combo'])('simulated generator respects explicit %s rather than silently choosing bar',variant=>{
   const result=generateSimulatedPanel({type:'chart',title:'模拟经营图表',prompt:'chart.'+variant,size:'large',artifact:data(variant)},'运营');
   expect(result.artifact.variant).toBe(variant);
   expect(acceptArtifactOutput(JSON.stringify(prepareSimulatedArtifact(result)))).toBeTruthy();
 });
 it('rejects prompt-only simulated charts before creating cards instead of substituting unrelated samples',()=>{
   const panel={type:'chart',title:'季度产品收入',prompt:'chart.stackedBar；四季度产品A/B收入，万元',size:'large'};
   expect(()=>generateSimulatedPanel(panel,'经营分析')).toThrow(/panel.artifact/);
   expect(()=>validateWorkbench({requestId:'missing-chart-data',title:'经营分析',dataMode:'simulated',panels:[panel]})).toThrow(/模拟图表数据/);
   const artifact=data('stackedBar');
   expect(validateWorkbench({requestId:'chart-data',title:'经营分析',dataMode:'simulated',panels:[{...panel,artifact}]}).panels[0].artifact.series).toEqual(artifact.series);
 });
 it('fits vertical plot axes into the available card height without changing the data domain',()=>{
   const full=cartesianChartSvg(data('stackedBar')), compact=cartesianChartSvg(data('stackedBar'),400,[true,true],180);
   expect(compact.height).toBe(180);expect(compact.markup).toContain('y="170"');
   expect(compact.markup).toContain('80');expect(full.markup).toContain('80');
 });
 it.each(['line','step','dumbbell'])('%s shows the observed range instead of flattening near-base comparisons against zero',variant=>{
   const spec=data(variant,{labels:['A','B','C'],series:[{name:'航空',values:[90,100,103]},{name:'基准',values:[100,101,102]}]});
   const svg=cartesianChartSvg(spec),hidden=cartesianChartSvg(spec,620,[false,true]);
   const axes=chart=>chart.elements.filter(el=>el.tag==='text').slice(0,5).map(el=>el.children[0]);
   expect(axes(svg)[0]).toBe('89.35');
   expect(axes(svg)[4]).toBe('103.65');
   expect(axes(hidden)).toEqual(axes(svg));
   expect(svg.markup).not.toMatch(/NaN|Infinity/);
 });
 it('pads constant and negative trend domains without inventing zero observations',()=>{
   const ticks=values=>cartesianChartSvg(data('line',{labels:['A','B','C'],series:[{name:'A',values}]})).elements.filter(el=>el.tag==='text').slice(0,5).map(el=>el.children[0]);
   expect(ticks([100,100,100])).toEqual(['95','97.5','100','102.5','105']);
   expect(ticks([-103,-100,-90])).toEqual(['-103.65','-100.08','-96.5','-92.925','-89.35']);
   expect(ticks([0,0,0])).toEqual(['-1','-0.5','0','0.5','1']);
 });
 it.each(['area','stackedArea','bar','groupedBar','stackedBar','horizontal','lollipop','combo'])('%s keeps its zero baseline for magnitude comparison',variant=>{
   const svg=cartesianChartSvg(data(variant,{series:[{name:'A',values:[90,100,103]}]}));
   const ticks=svg.elements.filter(el=>el.tag==='text').slice(0,5).map(el=>el.children[0]);
   expect(ticks[0]).toBe('0');expect(ticks[4]).toBe('103');
 });
 it('rejects malformed and semantically impossible charts without fabricating replacement values',()=>{
   for(const broken of [data('percentBar',{series:[{name:'A',values:[1,-1,0]}]}),data('dumbbell',{series:[{name:'A',values:[1,2,3]}]}),data('area',{series:[{name:'A',values:[1,null,2]}]}),data('combo',{series:[{name:'A',values:[1,2,3],kind:'pie'}]})]){
     expect(chartDataIssue(broken)).toBeTruthy();expect(acceptArtifactOutput(JSON.stringify(broken))).toBeUndefined();
   }
 });
 it('keeps percent-chart source units honest before creating a simulated workbench',()=>{
   const misleading=data('percentBar',{unit:'%（提交非负原值，模板自动换算占比）',series:[{name:'收入',values:[120,150,210]}]});
   expect(chartDataIssue(misleading)).toContain('原始数据单位');
   expect(acceptArtifactOutput(JSON.stringify(misleading))).toBeUndefined();
   expect(()=>validateWorkbench({title:'收入结构',requestId:'percent-units',dataMode:'simulated',panels:[{title:'收入结构',prompt:'chart.percentBar',type:'chart',size:'large',artifact:misleading}]})).toThrow();
   const corrected={...misleading,unit:'百万元'};
   expect(chartDataIssue(corrected)).toBeNull();
   expect(renderCartesianChart(corrected).html).toContain('占比 · 原值单位：百万元');
   expect(chartDataIssue(data('percentBar',{unit:'%'}))).toBeNull();
 });
 it('fits short horizontal plots while retaining readable row pitch',()=>{
   const compact=cartesianChartSvg(data('dumbbell'),400,[true,true],160);
   expect(compact.height).toBe(160);expect(compact.categorySize).toBeGreaterThanOrEqual(30);
 });
 it('stacks positive and negative values separately and re-stacks visible series in a fixed domain',()=>{
   const spec=data('stackedBar',{labels:['A'],series:[{name:'up1',values:[20]},{name:'up2',values:[30]},{name:'down',values:[-10]}]});
   const full=cartesianChartSvg(spec), hidden=cartesianChartSvg(spec,620,[false,true,true]);
   // Domain -10..50: y(0)=177.666..., y(30)=80.666..., y(50)=16.
   expect(full.markup).toContain('y="16"');
   const rect=hidden.markup.match(/<g data-series="1"><rect[^>]+y="([^"]+)"[^>]+height="([^"]+)"/);
   expect(Number(rect[1])).toBeCloseTo(80.6666667);
   expect(Number(rect[2])).toBeCloseTo(97);
 });
 it('percent bars use original non-negative magnitudes and handle zero totals',()=>{
   const spec=data('percentBar',{labels:['A','B'],series:[{name:'one',values:[1,0]},{name:'two',values:[3,0]}]});
   const svg=cartesianChartSvg(spec);
   expect(svg.markup).toContain('100%');expect(svg.markup).not.toMatch(/NaN|Infinity/);
   const single=cartesianChartSvg(spec,620,[false,true]);
   expect(single.markup).toMatch(/<g data-series="1"><rect[^>]+y="16"[^>]+height="194"/);
   expect(spec.series[0].values).toEqual([1,0]);
 });
 it('keeps a readable row pitch for long horizontal charts',()=>{
   const spec=data('horizontal',{labels:Array.from({length:50},(_,i)=>'分类'+i),series:[{name:'A',values:Array.from({length:50},(_,i)=>i)}]});
   expect(cartesianChartSvg(spec,320).categorySize).toBeGreaterThanOrEqual(30);
   expect(acceptArtifactOutput(JSON.stringify(spec))).toBeTruthy();
 });
 it('keeps label and tooltip text inert while retaining original data in the template model',()=>{
   const input=data('combo',{labels:['</script><img src=x onerror=alert(1)>','B','C']});
   const output=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
   expect(output.html).not.toContain('<img src=x');expect(readTemplateModel(output).data).toEqual(input);
 });
 it('rejects a downgraded requested chart after host rendering',()=>{
   const output=acceptArtifactOutput(JSON.stringify(data('groupedBar')));
   expect(workbenchMarketVariantIssue(output,'必须输出 chart.percentBar 的结构化数据')).toContain('chart.percentBar');
   expect(workbenchMarketVariantIssue(output,'必须输出 chart.groupedBar 的结构化数据')).toBeNull();
 });
 it('does not change the existing native line/bar contract',()=>{
   for(const variant of ['line','bar']){const {asOf,unit,...input}=data(variant);expect(renderCartesianChart(input)).toBeUndefined();expect(JSON.parse(acceptArtifactOutput(JSON.stringify(input))).type).toBe('chart');}
   expect(requestedChartVariant('季度百分比堆叠柱图')).toBe('percentBar');
   expect(requestedChartVariant('柱线组合图')).toBe('combo');
   expect(workbenchMarketVariantIssue(JSON.stringify({type:'html',html:'<body data-sherlock-market="trend">'}),'必须输出 market.trend 的结构化数据')).toBeNull();
 });
});
