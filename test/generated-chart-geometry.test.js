import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {Window} from 'happy-dom'
import {generatedChartGeometry,chartGeometryRepairIssue} from '../packages/dsh-research-task-runtime/generated-chart-geometry.js'
import {acceptArtifactOutput} from '../packages/dsh-research-task-runtime/artifact-output.js'
const captured=JSON.parse(readFileSync(new URL('./fixtures/notes-real-third-offline-line-html.json',import.meta.url),'utf8'))[1].html
function dom(html){const w=new Window({settings:{disableJavaScriptEvaluation:true}});w.document.body.innerHTML=html;return w.document}
function legacy(values,variant='line',extra=[]){return JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'chart',variant,title:'完整来源及口径'.repeat(50),labels:values.map((_,i)=>'分类'+i),series:[{name:'系列甲',values},...extra]}))).html}
function damage(html){const d=dom(html);let out=html;for(const el of d.querySelectorAll('circle'))out=out.replace('cy="'+el.getAttribute('cy')+'"','cy="17"');return out.replace(/points="([^"]+)"/g,(_,p)=>'points="'+p.split(' ').map(v=>v.split(',')[0]+',17').join(' ')+'"')}
function assertScale(html,all){const d=dom(html),ticks=[...d.querySelectorAll('svg>text[text-anchor=end]')].map(n=>Number(n.textContent.replaceAll(',',''))),low=ticks[0],high=ticks[4],actual=marks(html);all.forEach((values,si)=>values.forEach((v,i)=>expect(actual[si][i]).toBeCloseTo(260-(v-low)/(high-low)*220,5)))}
function marks(html){const d=dom(html);return [...d.querySelectorAll('[data-series-group]')].map(g=>[...g.querySelectorAll('circle')].map(p=>Number(p.getAttribute('cy'))))}
it('normalizes the captured stale data geometry while retaining every byte outside the SVG and all executable content',()=>{
 const result=generatedChartGeometry(captured);expect(result.issue).toBeUndefined();expect(marks(result.html)[0]).toEqual([250,50,150]);expect(result.html).toContain('>9.5</text>');expect(result.html).toContain('>20.5</text>')
 const tail=s=>s.slice(s.indexOf('</svg>')+6);expect(tail(result.html)).toBe(tail(captured));expect(result.html.slice(0,result.html.indexOf('<svg'))).toBe(captured.slice(0,captured.indexOf('<svg')))
 expect(generatedChartGeometry(result.html).html).toBe(result.html)
})
it.each([[0,0,0],[-8,-2,-5],[0,-4,9],[1e-6,2e-6,1.5e-6],[100000,200000,150000]])('uses the existing host domain for zero/negative/small/large values %j',(...values)=>{
 const base=legacy(values),result=generatedChartGeometry(damage(base));expect(result.issue).toBeUndefined();expect(result.html).not.toBe(damage(base));assertScale(result.html,[values]);expect(generatedChartGeometry(result.html).html).toBe(result.html)
})
it('projects multiple series against one fixed host domain without changing their data or display references',()=>{
 const base=legacy([-10,0,50],'line',[{name:'第二组',values:[20,-30,0]}]),result=generatedChartGeometry(damage(base));expect(result.issue).toBeUndefined();assertScale(result.html,[[-10,0,50],[20,-30,0]]);expect(result.html.slice(result.html.indexOf('<script>'))).toBe(base.slice(base.indexOf('<script>')))
})
it('projects positive and negative bar heights from the shared zero baseline',()=>{
 const base=legacy([-10,0,50],'bar',[{name:'第二组',values:[20,-30,0]}]),bad=base.replace(/(<rect[^>]+)height="[^"]+"/g,'$1height="99"'),result=generatedChartGeometry(bad),rects=s=>[...dom(s).querySelectorAll('g rect')].map(n=>[n.getAttribute('y'),String(Number(n.getAttribute('height'))<1?0:Number(n.getAttribute('height')))]);expect(result.issue).toBeUndefined();expect(rects(result.html)).toEqual(rects(base));expect(result.html.slice(result.html.indexOf('</svg>'))).toBe(base.slice(base.indexOf('</svg>')))
})
it('preserves a valid explicitly fixed domain and all original geometry byte for byte',()=>{
 const base=legacy([4,55,89]),d=dom(base),svg=d.querySelector('svg'),axis=[...svg.children].filter(n=>n.tagName.toLowerCase()==='text'&&n.getAttribute('text-anchor')==='end'),points=[...svg.querySelectorAll('circle')]
 axis.forEach((n,i)=>n.textContent=String(i*25));points.forEach((n,i)=>n.setAttribute('cy',String(260-[4,55,89][i]/100*220)))
 svg.querySelector('polyline').setAttribute('points',points.map(n=>n.getAttribute('cx')+','+n.getAttribute('cy')).join(' '))
 const custom=d.body.innerHTML;expect(generatedChartGeometry(base).html).toBe(base);expect(generatedChartGeometry(custom).html).toBe(custom)
})
it('leaves stored artifact restoration on its original HTML version and geometry',()=>{expect(JSON.parse(acceptArtifactOutput(JSON.stringify({version:1,type:'html',title:'旧卡',html:captured}),{normalizeChartGeometry:false})).html).toBe(captured)})
it.each([
 ['ambiguous data',s=>s.replace('<script>','<script>var other={labels:["A"],series:[{name:"other",values:[7]}]};')],
 ['multiple charts',s=>s.replace('</figure>','</figure>'+s.match(/<svg[\s\S]+?<\/svg>/)[0])],
 ['data alias',s=>s.replace('var svg=', 'var alias=chart.series[0].values;alias[0]=99;var svg=')],
 ['data alias through at',s=>s.replace('var svg=', 'var other=chart.series.at(0).values;other[0]=99;var svg=')],
 ['mutating data callback',s=>s.replace('var svg=', 'chart.series.forEach(s=>{s.values[0]=99});var svg=')],
 ['computed mutator',s=>s.replace('var svg=', 'chart.series[0].values["splice"](0,1,99);var svg=')],
 ['destructuring alias',s=>s.replace('var svg=', 'var {series}=chart;series[0].values[0]=99;var svg=')],
 ['unknown callee',s=>s.replace('var svg=', 'mutate(chart.series);var svg=')],
 ['data alias through filter',s=>s.replace('var svg=', 'var other=chart.series.filter(()=>true);other[0].values[0]=99;var svg=')],
 ['dynamic data',s=>s.replace('select(0);','chart.series[0].values[0]=77;select(0);')],
 ['dynamic geometry',s=>s.replace('select(0);',"svg.setAttribute('y',88);select(0);")],
 ['computed data',s=>s.replace('values:[10,20,15]','values:[10,20,Number(15)]')],
 ['explicit foreign type',s=>s.replace('var chart={','var chart={type:"another-model",')],
 ['per-series custom axis',s=>s.replace('name:"演示数据",values:', 'name:"演示数据",axis:"right",values:')],
 ['custom scale',s=>s.replace('var chart={','var chart={scale:"log",')],
 ['custom SVG annotation',s=>s.replace('</svg>','<path d="M0,0 L2,3"/></svg>')],
 ['inline geometry style',s=>s.replace('<g data-series-group=', '<g style="transform:translateY(9px)" data-series-group=')],
 ['stylesheet geometry override',s=>'<style>circle{cy:40px}</style>'+s],
 ['opaque factory',s=>s.replace('var chart={labels:', 'var chart=factory({labels:').replace('values:[10,20,15]}]};','values:[10,20,15]}]});')],
 ['transform',s=>s.replace('<svg ','<svg transform="rotate(20)" ')],
 ['point/title association mismatch',s=>s.replace('10月1日 · 演示数据：10','另一个来源：7')],
 ['unrelated variable data',s=>s.replace('series:[{name:"演示数据",values:[10,20,15]}]','series:[{name:"别的对象",values:[1,2,3]}]')],
])('does not guess or rewrite %s',(_,change)=>{const html=change(captured);expect(generatedChartGeometry(html)).toEqual({html})})
it('reports a provable mismatch between a standard line and its corresponding points for the single bounded repair',()=>{
 const html=captured.replace('points="145,213.1578947368421','points="145,14');expect(generatedChartGeometry(html).issue).toContain('线与数据点不一致');expect(generatedChartGeometry(html).html).toBe(html)
})

it.each(['line','bar'])('supports sparse category labels in a standard %s chart beyond the QA sample length',variant=>{
 const values=Array.from({length:12},(_,i)=>i-5),base=legacy(values,variant),bad=variant==='line'?damage(base):base.replace(/(<rect[^>]+)height="[^"]+"/g,'$1height="99"'),result=generatedChartGeometry(bad)
 expect(result.html).not.toBe(bad);expect(result.issue).toBeUndefined();expect(result.html.slice(result.html.indexOf('</svg>'))).toBe(base.slice(base.indexOf('</svg>')));if(variant==='line')assertScale(result.html,[values])
})
it('treats property ordering as transport syntax while retaining chart values and units in repair',()=>{
 const before=generatedChartGeometry(captured,{includeModel:true}).snapshot,after=captured.replace('series:[{name:"演示数据",values:[10,20,15]}]','series:[{values:[10,20,15],name:"演示数据"}]')
 expect(chartGeometryRepairIssue(before,after)).toBeUndefined()
})

it.each([
 ['disabled legend',s=>s.replace('type="button" data-chart-series=', 'disabled type="button" data-chart-series=')],
 ['hidden summary',s=>s.replace('<summary>', '<summary hidden>')],
 ['hidden replacement',s=>s.replace(/<textarea[\s\S]*?<\/textarea>/,'<input type="hidden">')],
 ['disabled control',s=>s.replace('<textarea ','<textarea disabled ')],
 ['readonly control',s=>s.replace('<textarea ','<textarea readonly ')],
 ['hidden ancestor',s=>s.replace('<div class="note">','<div hidden class="note">')],
 ['CSS hidden control',s=>s.replace('<textarea ','<textarea style="display:none" ')],
 ['wrong default',s=>s.replace('</textarea>','错误默认值</textarea>')],
])('does not treat %s as preserving the original editable input during repair',(_,change)=>{
 const snapshot=generatedChartGeometry(captured,{includeModel:true}).snapshot;expect(chartGeometryRepairIssue(snapshot,change(captured))).toContain('保留原HTML的备注')
})
