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
