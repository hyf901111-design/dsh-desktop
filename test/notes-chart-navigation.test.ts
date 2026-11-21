// @vitest-environment happy-dom
import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
import {researchHtmlDisplayHtml} from '../packages/dsh-research-task-runtime/html-artifact.js'
import {noteChartNavigationAllowed} from '../src/preload/notes/chart-navigation'

const native=readFileSync(resolve('test/fixtures/notes-native-chart-navigation.html'),'utf8')
const event={id:'navigation-one',clock:1,targetRoute:[1,0],tag:'SVG',type:'keydown',key:'ArrowRight'}
it('recognizes the captured host chart runtime and its exact SVG route',()=>{
 expect(noteChartNavigationAllowed(native,event)).toBe(true)
 expect(noteChartNavigationAllowed(native,{...event,targetRoute:[1,1]})).toBe(false)
})
it.each([
 ['forged chart marker',()=>'<figure><svg tabindex="0"></svg></figure><script>document.querySelector("svg").addEventListener("keydown",()=>data.amount++);</script><script id="sherlock-template-data" type="application/json">{"templateId":"chart.line","version":"22a-20260930"}</script>'],
 ['runtime data mutation',()=>native.replace('select(index)});','chart.series[0].values[0]++;select(index)});')],
 ['extra script',()=>native+'<script>document.addEventListener("keydown",()=>window.data++);</script>'],
 ['inline handler',()=>native.replace('<svg ','<svg onkeydown="data.amount++" ')],
 ['external script',()=>native+'<script src="https://example.test/edit.js"></script>'],
 ['nonliteral model',()=>native.replace('})({"version":1', '})(getChart({"version":1').replace('});</script><script id=', '}));</script><script id=')]
])('rejects a %s instead of granting browsing ownership',(_label,html)=>{
 const value=html();expect(value).not.toBe(native);expect(noteChartNavigationAllowed(value,event)).toBe(false)
})
it.each([{type:'input'},{type:'change'},{tag:'INPUT'},{key:'Enter'},{value:'memo'},{checked:true},{x:.5,y:.5}])('does not classify a semantic or mixed event as navigation: %j',extra=>{
 expect(noteChartNavigationAllowed(native,{...event,...extra})).toBe(false)
})
it('also verifies the canonical host cartesian runtime without trusting a template attribute',()=>{
 const html=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{renderCartesianChart}from'./packages/dsh-research-task-runtime/cartesian-chart-artifact.js';process.stdout.write(renderCartesianChart(JSON.parse(readFileSync(0,'utf8'))).html)"],{input:JSON.stringify({version:1,type:'chart',variant:'line',title:'合成图',unit:'演示值',labels:['10月1日','10月2日'],series:[{name:'演示数据',values:[10,20]}]}),encoding:'utf8'})
 expect(noteChartNavigationAllowed(html,{...event,targetRoute:[1,2]})).toBe(true)
 expect(noteChartNavigationAllowed(html.replace('select(i);});','spec.series[0].values[0]++;select(i);});'),{...event,targetRoute:[1,2]})).toBe(false)
})

const pointerNative=readFileSync(resolve('test/fixtures/notes-native-chart-point-navigation.html'),'utf8')
const pointerEvents=Object.values(JSON.parse(readFileSync(resolve('test/fixtures/notes-native-chart-point-journal.json'),'utf8')).interactionState.events) as any[]
it('recognizes the actual canonical SVG click then Arrow journal and the exact read-only data disclosure click',()=>{
 expect(pointerEvents.map(event=>[event.tag,event.type,event.targetRoute])).toEqual([['SVG','click',[2,2]],['SVG','keydown',[2,2]],['SUMMARY','click',[3,0]]])
 // HappyDOM moves the nested source STYLE into head; Chromium preserves it in body.
 // The production-browser regression below checks the captured [2,2] events verbatim.
 const route=routedClick(pointerNative,'svg').targetRoute
 expect(noteChartNavigationAllowed(pointerNative,{...pointerEvents[0],targetRoute:route})).toBe(true)
 expect(noteChartNavigationAllowed(pointerNative,{...pointerEvents[1],targetRoute:route})).toBe(true)
 expect(noteChartNavigationAllowed(pointerNative,routedClick(pointerNative,'details > summary'))).toBe(true)
})

const pointClick=pointerEvents[0]
const routedClick=(html:string,selector:string)=>{
 const document=new DOMParser().parseFromString('<!doctype html><html><head></head><body>'+researchHtmlDisplayHtml(html,true)+'</body></html>','text/html'),target=document.querySelector(selector)!,targetRoute:number[]=[]
 for(let node=target;node!==document.body;node=node.parentElement!)targetRoute.unshift([...node.parentElement!.children].indexOf(node))
 return {...pointClick,targetRoute,tag:target.tagName.toUpperCase()}
}
it('allows a real canonical point hit but refuses external controls and forged target tags',()=>{
 const hit=routedClick(pointerNative,'rect.hit[data-point="2"]')
 expect(noteChartNavigationAllowed(pointerNative,hit)).toBe(true)
 expect(noteChartNavigationAllowed(pointerNative,{...hit,tag:'SVG'})).toBe(false)
 const legend=routedClick(pointerNative,'[data-chart-series]')
 expect(noteChartNavigationAllowed(pointerNative,legend)).toBe(false)
})
it.each([{key:'ArrowRight'},{value:'memo'},{checked:true},{x:undefined,y:undefined},{x:-.1},{y:1.1},{x:Infinity},{y:'private'},{extra:'private'}])('refuses a mixed or invalid point click: %j',extra=>{
 expect(noteChartNavigationAllowed(pointerNative,{...pointClick,...extra})).toBe(false)
})
it.each(['a','button','label','summary','span role="button"','div contenteditable="true"','g data-chart-series="0"'])('refuses a chart root nested in an interactive %s',wrapper=>{
 const tag=wrapper.split(' ')[0],html=pointerNative.replace('<svg class="template-chart"','<'+wrapper+'><svg class="template-chart"').replace('</svg>','</svg></'+tag+'>')
 expect(noteChartNavigationAllowed(html,routedClick(html,'svg'))).toBe(false)
})
it.each(['<foreignObject><input id="business-edit"/></foreignObject>','<use href="#business"/>','<set attributeName="width" to="10" begin="click"/>','<animate attributeName="width" from="0" to="10" begin="click"/>','<a href="#business"><circle cx="10" cy="10" r="5"/></a>'])('refuses active SVG content next to an otherwise authoritative chart runtime: %s',content=>{
 const html=pointerNative.replace('</svg>',content+'</svg>')
 expect(noteChartNavigationAllowed(html,routedClick(html,'svg'))).toBe(false)
})
it('refuses arbitrary point handlers even with a copied canonical model and chart marker',()=>{
 const html=pointerNative.replace('select(Number(el.dataset.point));','spec.series[0].values[0]++;select(Number(el.dataset.point));')
 expect(html).not.toBe(pointerNative);expect(noteChartNavigationAllowed(html,pointClick)).toBe(false)
})

it.each([
 ['changed value',(html:string)=>html.replace('<td>20</td>','<td>200</td>')],
 ['editable cell',(html:string)=>html.replace('<td>20</td>','<td><input value="20"></td>')],
 ['linked cell',(html:string)=>html.replace('<td>20</td>','<td><a href="#business">20</a></td>')],
 ['contenteditable',(html:string)=>html.replace('<table>','<table contenteditable="true">')],
 ['arbitrary summary',(html:string)=>html.replace('<summary>查看完整数据</summary>','<summary>修改数据</summary>')],
 ['delegated legend handler',(html:string)=>html.replace('<summary>','<summary data-chart-series="0">')],
 ['duplicate disclosure',(html:string)=>html.replace('</details>','</details><details><summary>查看完整数据</summary></details>')],
 ['extra row',(html:string)=>html.replace('</tbody>','<tr><td>额外业务</td><td>9</td></tr></tbody>')]
])('does not grant read-only disclosure to a %s',(_label,change)=>{
 const html=(change as (html:string)=>string)(pointerNative);expect(html).not.toBe(pointerNative)
 expect(noteChartNavigationAllowed(html,routedClick(html,'details > summary'))).toBe(false)
})

it('recognizes the captured fixed host read-only disclosure against every original model value',()=>{
 expect(noteChartNavigationAllowed(native,routedClick(native,'details > summary'))).toBe(true)
})
it.each([
 ['changed value',(html:string)=>html.replace('<td>20</td>','<td>200</td>')],
 ['editable cell',(html:string)=>html.replace('<td>20</td>','<td><input value="20"></td>')],
 ['linked cell',(html:string)=>html.replace('<td>20</td>','<td><a href="#business">20</a></td>')],
 ['contenteditable',(html:string)=>html.replace('<table>','<table contenteditable="true">')],
 ['unknown summary',(html:string)=>html.replace('<summary>查看全部数据</summary>','<summary>修改演示值</summary>')],
 ['wrong profile heading',(html:string)=>html.replace('<th>日期</th>','<th>分类</th>')],
 ['duplicate disclosure',(html:string)=>html.replace('</details>','</details><details><summary>查看全部数据</summary></details>')],
 ['unknown table wrapper',(html:string)=>html.replace('<table>','<div class="data-scroll"><table>').replace('</table>','</table></div>')]
])('rejects a %s in the fixed host disclosure',(_label,change)=>{
 const html=(change as (html:string)=>string)(native);expect(html).not.toBe(native)
 expect(noteChartNavigationAllowed(html,routedClick(html,'details > summary'))).toBe(false)
})

it('recognizes only the exact optional precision program and still rejects modified data or formatter code',()=>{
 const html=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{renderCartesianChart}from'./packages/dsh-research-task-runtime/cartesian-chart-artifact.js';process.stdout.write(renderCartesianChart(JSON.parse(readFileSync(0,'utf8'))).html)"],{input:JSON.stringify({version:1,type:'chart',variant:'line',title:'精度显示',unit:'演示值',axisDecimals:2,labels:['10月1日','10月2日'],series:[{name:'演示数据',values:[92.243,262.89]}]}),encoding:'utf8'})
 const navigation={...event,targetRoute:[1,2]}
 expect(noteChartNavigationAllowed(html,navigation)).toBe(true)
 expect(noteChartNavigationAllowed(html.replace('maximumFractionDigits:digits','maximumFractionDigits:(spec.series[0].values[0]++,digits)'),navigation)).toBe(false)
 expect(noteChartNavigationAllowed(html.replace('"axisDecimals":2','"axisDecimals":5'),navigation)).toBe(false)
 expect(noteChartNavigationAllowed(html.replace('"axisDecimals":2,',''),navigation)).toBe(false)
})

it.each([false,true])('retains read-only navigation for the exact saved 1.6.9 chart program (precision %s)',precise=>{
 const release=readFileSync(resolve('src/preload/notes/cartesian-navigation-1.6.9.js'),'utf8')
 const functions=release.split('\nexport ').slice(1).map(text=>text.trim())
 const [geometry,runtime,precision]=functions
 const model={version:1,type:'chart',variant:'line',title:'债基净值',unit:'元',labels:['A','B'],series:[{name:'净值',values:[1.001,1.002]}],...(precise?{axisDecimals:3}:{})}
 const geometryProgram=precise?'('+precision+')('+geometry+')':geometry
 const program='('+runtime+')('+JSON.stringify(model)+','+geometryProgram+');'
 const html='<figure><svg class="template-chart"></svg></figure><script>'+program+'</script>'
 const route=routedClick(html,'svg')
 expect(noteChartNavigationAllowed(html,route)).toBe(true)
 expect(noteChartNavigationAllowed(html.replace('const fmt =','const unused = 1; const fmt ='),route)).toBe(false)
})
