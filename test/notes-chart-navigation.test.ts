// @vitest-environment happy-dom
import {expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
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
it('recognizes only the exact optional precision program and still rejects modified data or formatter code',()=>{
 const html=execFileSync(process.execPath,['--input-type=module','-e',"import{readFileSync}from'node:fs';import{renderCartesianChart}from'./packages/dsh-research-task-runtime/cartesian-chart-artifact.js';process.stdout.write(renderCartesianChart(JSON.parse(readFileSync(0,'utf8'))).html)"],{input:JSON.stringify({version:1,type:'chart',variant:'line',title:'精度显示',unit:'演示值',axisDecimals:2,labels:['10月1日','10月2日'],series:[{name:'演示数据',values:[92.243,262.89]}]}),encoding:'utf8'})
 const navigation={...event,targetRoute:[1,2]}
 expect(noteChartNavigationAllowed(html,navigation)).toBe(true)
 expect(noteChartNavigationAllowed(html.replace('maximumFractionDigits:digits','maximumFractionDigits:(spec.series[0].values[0]++,digits)'),navigation)).toBe(false)
 expect(noteChartNavigationAllowed(html.replace('"axisDecimals":2','"axisDecimals":5'),navigation)).toBe(false)
 expect(noteChartNavigationAllowed(html.replace('"axisDecimals":2,',''),navigation)).toBe(false)
})
