import {describe,it,expect} from 'vitest';
import {specialChartSamples as samples} from './fixtures/special-chart-samples.js';
import {chartDataIssue,requestedChartVariant,chartTemplateSchema} from '../packages/dsh-research-task-runtime/chart-template-contract.js';
import {specialChartView} from '../packages/dsh-research-task-runtime/special-chart-view.js';
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js';
import {readTemplateModel,templateFor} from '../packages/dsh-research-task-runtime/component-template-registry.js';
import {prepareSimulatedArtifact,workbenchPanelPrompt,validateWorkbench} from '../packages/dsh-research-task-runtime/workbench-plan.js';
import {workbenchDesignTemplate} from '../packages/dsh-research-task-runtime/workbench-design-contract.js';

describe('Figma composition, distribution and target templates',()=>{
 it.each(Object.keys(samples))('%s travels through the public workbench path without losing source data',variant=>{
  const input=samples[variant],panel={title:input.title,type:'chart',prompt:'chart.'+variant,size:'large',artifact:input};
  expect(chartDataIssue(input)).toBeNull();
  expect(validateWorkbench({requestId:'special-'+variant,title:'验收',dataMode:'simulated',panels:[panel]}).panels[0].artifact).toEqual(input);
  expect(prepareSimulatedArtifact(panel)).toEqual(input);
  const result=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
  expect(result.type).toBe('html');expect(readTemplateModel(result).data).toEqual(input);
  expect(templateFor(input).schema).toContain('chart.'+variant);
  expect(workbenchDesignTemplate(panel).id).toBe('research.chart.'+variant);
  expect(workbenchPanelPrompt({title:'工作台',dataMode:'simulated'},panel)).toContain('必须输出 chart.'+variant);
  expect(requestedChartVariant('chart.'+variant)).toBe(variant);
  expect(JSON.stringify(specialChartView(input,304))).not.toMatch(/NaN|Infinity/);
 });
 it('advertises family-specific fields instead of asking every chart for Cartesian series',()=>{
  for(const [v,key] of [['pie','items'],['treemap','root'],['histogram','samples'],['box','groups'],['bullet','rows'],['gauge','min']])expect(chartTemplateSchema(v)).toContain(key);
 });
 it('composition sectors exhaust exactly one circle and zero does not become a fabricated proportion',()=>{
  const view=specialChartView(samples.pie),sectors=view.metrics.sectors;
  expect(view.metrics.total).toBe(100);expect(sectors.reduce((s,c)=>s+c.end-c.start,0)).toBeCloseTo(2*Math.PI,12);
  const zero=specialChartView({...samples.pie,items:[{label:'无收入',value:0}]});
  expect(zero.rows[0].cells).toEqual(['0','—']);expect(JSON.stringify(zero.elements)).toContain('暂无占比');
  const single=specialChartView({...samples.pie,items:[{label:'全部',value:42}]});
  const d=single.elements[0].children[0].attributes.d;expect(d.match(/ A/g)).toHaveLength(2);
 });
 it('hierarchy sums leaves and keeps treemap areas proportional before visual gaps',()=>{
  const v=specialChartView(samples.treemap,600),tiles=v.metrics.tiles,total=128;
  for(const t of tiles)expect(t.width*t.height/(600*v.height)).toBeCloseTo(t.value/total,12);
  expect(tiles.reduce((s,t)=>s+t.width*t.height,0)).toBeCloseTo(600*v.height,8);
  const child=specialChartView(samples.sunburst,600,{path:[0]});expect(child.metrics.total).toBe(80);expect(child.rows.map(r=>r.label)).toEqual(['企业','个人']);
  expect(child.rows.reduce((s,r)=>s+Number(r.cells[0]),0)).toBe(80);
 });
 it('histogram assigns boundary samples once and uses density for unequal bin widths',()=>{
  const data={...samples.histogram,samples:[0,1,2,3,4],binCount:4};
  expect(specialChartView(data).metrics.bins.map(b=>b.count)).toEqual([1,1,1,2]);
  for(const binCount of [4,6,10,40])expect(specialChartView(samples.histogram,620,{binCount}).metrics.bins.reduce((s,b)=>s+b.count,0)).toBe(samples.histogram.samples.length);
  const {samples:raw,binCount,...base}=samples.histogram;
  const unequal={...base,bins:[{lower:0,upper:1,count:5},{lower:1,upper:3,count:10}]};
  expect(chartDataIssue(unequal)).toBeNull();expect(specialChartView(unequal).metrics.density).toBe(true);
  expect(specialChartView({...samples.histogram,samples:[7,7,7]}).metrics.bins.reduce((s,b)=>s+b.count,0)).toBe(3);
 });
 it('calculates interpolated quartiles and Tukey outliers without calling the median a mean',()=>{
  expect(specialChartView(samples.box).metrics.groups[0]).toEqual({name:'服务A',low:1,q1:2.5,median:4,q3:5.5,high:6,outliers:[20],count:7});
  expect(specialChartView({...samples.box,groups:[{name:'单点',samples:[8]}]}).metrics.groups[0]).toMatchObject({low:8,q1:8,median:8,q3:8,high:8,outliers:[]});
 });
 it('describes percentage target differences in percentage points',()=>{
  const gauge=specialChartView(samples.gauge);
  expect(gauge.rows.find(r=>r.label==='差额').cells).toEqual(['-13 个百分点']);
  expect(gauge.rows[0].detail).toContain('当前 72 % · 目标 85 % · 差额 -13 个百分点');
  const bullet=specialChartView({...samples.bullet,unit:'%'});
  expect(bullet.headers.at(-1)).toBe('差额 个百分点');
  expect(bullet.rows[0].detail).toContain('差额 -13 个百分点');
 });
 it.each(Object.keys(samples))('keeps %s geometry finite inside a short plotting area',variant=>{
  const view=specialChartView(samples[variant],304,{height:180});
  expect(view.height).toBeLessThanOrEqual(180);
  expect(JSON.stringify(view.elements)).not.toMatch(/NaN|Infinity/);
  const text=[];const visit=el=>{if(typeof el==='string')return;if(el.tag==='text')text.push(el);el.children.forEach(visit);};view.elements.forEach(visit);
  expect(text.every(el=>Number(el.attributes.y)>=0&&Number(el.attributes.y)<=view.height)).toBe(true);
 });
 it.each([
  {...samples.pie,items:[{label:'负值',value:-1}]},
  {...samples.pie,items:[{label:'缺失',value:null}]},
  {...samples.sunburst,root:{name:'重复汇总',value:100,children:[{name:'叶',value:10}]}},
  {...samples.radar,series:[{name:'混合单位',values:[101,1,2,3,4]}]},
  {...samples.radar,normalization:''},
  {...samples.histogram,bins:[{lower:0,upper:10,count:2}]},
  {...samples.box,groups:[{name:'乱序',low:3,q1:2,median:1,q3:4,high:8,outliers:[]}],whiskerMethod:'测试'},
  {...samples.box,groups:[{name:'组',low:1,q1:2,median:3,q3:4,high:8,outliers:[2]}],whiskerMethod:'测试'},
  {...samples.bullet,bands:[{to:80,label:'未覆盖范围'}]},
  {...samples.gauge,value:120}, {...samples.gauge,max:0}
 ])('rejects misleading data before it reaches a template: %#',input=>{
  expect(chartDataIssue(input)).toBeTruthy();expect(acceptArtifactOutput(JSON.stringify(input))).toBeUndefined();
 });
 it('keeps model strings as escaped text under the production Trusted Types policy',()=>{
  const input={...samples.pie,items:[{label:'</script><script>alert(1)</script>',value:1}]};
  const result=JSON.parse(acceptArtifactOutput(JSON.stringify(input)));
  expect(result.html).not.toContain('<script>alert(1)</script>');expect(result.html).not.toContain('innerHTML');expect(readTemplateModel(result).data).toEqual(input);
 });
});
