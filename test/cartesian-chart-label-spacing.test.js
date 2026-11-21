import {expect,it} from 'vitest';
import {cartesianChartSvg,cartesianChartAxisPrecision} from '../packages/dsh-research-task-runtime/cartesian-chart-artifact.js';

const series=(count)=>({version:1,type:'chart',variant:'line',title:'指数对比',unit:'基期=100',labels:Array.from({length:count},(_,i)=>new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10)),series:[{name:'指数',values:Array.from({length:count},(_,i)=>100+i/10)}]});
const ticks=result=>result.elements.filter(el=>el.tag==='text'&&el.children[0]?.tag==='title');
it.each([1,2,3,5,60,63,100,366])('keeps endpoint labels inside the plot with separated date ticks for %s observations',count=>{
 const spec=series(count);
 for(const draw of [cartesianChartSvg,cartesianChartAxisPrecision(cartesianChartSvg)])for(const width of [280,320,566,880]){
  const result=draw({...spec,axisDecimals:2},width),visible=ticks(result).filter(el=>el.attributes.visibility!=='hidden');
  expect(visible[0].children[0].children[0]).toBe(spec.labels[0]);expect(visible.at(-1).children[0].children[0]).toBe(spec.labels.at(-1));
  const intervals=visible.map(el=>{const size=el.children.at(-1).length*6,anchor=el.attributes['text-anchor'],start=el.attributes.x-(anchor==='end'?size:anchor==='middle'?size/2:0);return{start,end:start+size}});
  expect(intervals[0].start).toBeGreaterThanOrEqual(48);expect(intervals.at(-1).end).toBeLessThanOrEqual(width-16);
  for(let i=1;i<intervals.length;i++)expect(intervals[i].start-intervals[i-1].end).toBeGreaterThanOrEqual(8);
  expect(result.elements.filter(el=>el.attributes.class==='hit')).toHaveLength(count);
  expect(result.elements.find(el=>el.attributes['data-series']===0).children.filter(el=>el.tag==='circle')).toHaveLength(count);
 }
 // Resizing only changes visibility/position; passive routes remain stable.
 expect(ticks(cartesianChartSvg(spec,320)).map(el=>el.children)).toEqual(ticks(cartesianChartSvg(spec,880)).map(el=>el.children));
});

it.each(['horizontal','lollipop','dumbbell'])('fits long Chinese organization names in the %s chart gutter while retaining their distinguishing suffixes',variant=>{
 const labels=['华东分公司机构直销客户一部','华东分公司机构直销客户二部','华南分公司银行渠道客户部']
 const spec={version:1,type:'chart',variant,title:'渠道净申购排名',labels,series:[{name:'本期',values:[2.6,1.2,-.7]},{name:'上期',values:[1.8,.7,-.5]}]}
 for(const width of [280,320,656]){
  const parts=ticks(cartesianChartSvg(spec,width))
  expect(parts.map(el=>el.children[0].children[0])).toEqual(labels)
  expect(new Set(parts.map(el=>el.children.at(-1))).size).toBe(labels.length)
  for(const el of parts)expect(el.attributes.x-Array.from(el.children.at(-1)).length*11).toBeGreaterThanOrEqual(0)
 }
})

it('centers each short channel label beneath its own group of actual and target bars',()=>{
 const spec={version:1,type:'chart',variant:'groupedBar',title:'渠道对比',labels:['直销','银行','互联网'],series:[{name:'实际',values:[null,0,-.4]},{name:'目标',values:[2.2,1.3,.5]}]}
 for(const width of [280,320,656]){
  const result=cartesianChartSvg(spec,width),labels=ticks(result),groups=result.elements.filter(el=>el.attributes.class==='hit')
  for(const [i,label] of labels.entries()){
   expect(label.attributes['text-anchor']).toBe('middle')
   expect(label.attributes.x).toBeCloseTo(groups[i].attributes.x+groups[i].attributes.width/2)
  }
 }
})
