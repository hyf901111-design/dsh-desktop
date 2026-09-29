import {describe,it,expect} from 'vitest';
import {CARTESIAN_CHART_TEMPLATES,chartDataIssue,requestedChartVariant} from '../packages/dsh-research-task-runtime/chart-template-contract.js';
import {cartesianChartSvg,renderCartesianChart} from '../packages/dsh-research-task-runtime/cartesian-chart-artifact.js';
import {acceptArtifactOutput,workbenchMarketVariantIssue} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {prepareSimulatedArtifact,workbenchPanelPrompt,validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';
import {generateSimulatedPanel} from '../packages/dsh-research-task-runtime/simulated-workbench-generator.js';

const data=(variant,more={})=>({version:1,type:'chart',title:'经营分析',variant,labels:['一季度','二季度','三季度'],series:[{name:'产品',values:[20,35,50]},{name:'服务',values:[10,25,30]}],asOf:'2026-09-30 · 模拟数据',unit:'万元',...more});
describe('Figma cartesian templates',()=>{
 it.each(CARTESIAN_CHART_TEMPLATES.map(t=>t.variant))('%s flows through the real artifact and workbench contract without losing data',variant=>{
   const input=data(variant), output=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
   expect(output.type).toBe('html');
   expect(readTemplateModel(output).data).toEqual(input);
   const panel={title:'模拟经营分析',prompt:'chart.'+variant,type:'chart',size:'large',artifact:input};
   expect(prepareSimulatedArtifact(panel)).toMatchObject({variant,labels:input.labels,series:input.series,unit:'万元',asOf:input.asOf});
   expect(workbenchDesignTemplate(panel).id).toBe('research.chart.'+variant);
   expect(workbenchPanelPrompt({title:'经营看板'},panel)).toContain('必须输出 chart.'+variant);
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
