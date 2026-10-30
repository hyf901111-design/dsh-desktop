// @vitest-environment happy-dom
import {beforeAll,expect,it} from 'vitest'
import {build} from 'esbuild'
import {execFileSync} from 'node:child_process'
import {resolve} from 'node:path'
// @ts-expect-error Test-only ESM helper.
import {esbuildRawSource} from './helpers/esbuild-raw-source.mjs'
// @ts-expect-error Test-only ESM helper.
import {notesChartNavigationCompatibilitySource} from './helpers/notes-chart-navigation-compatibility.mjs'
import {researchHtmlDisplayHtml} from '../packages/dsh-research-task-runtime/html-artifact.js'
let widths:string[]=[]
let allowed:(html:string,event:any)=>boolean,html:string,full:string
beforeAll(async()=>{
 const built=await build({stdin:{contents:notesChartNavigationCompatibilitySource(),resolveDir:resolve('src/preload/notes'),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,plugins:[esbuildRawSource()],logLevel:'silent'})
 const module={exports:{} as any};new Function('module','exports',built.outputFiles[0]!.text)(module,module.exports);allowed=module.exports.noteChartNavigationAllowed
 const output=execFileSync(process.execPath,['--input-type=module','-e',"import{homeNotesGuideChart}from'./packages/dsh-research-task-runtime/home-notes-guide-artifacts.js';import{HOME_NOTES_CHART_SPEC}from'./packages/dsh-research-task-runtime/home-notes-guide-contract.js';import{renderCartesianChart,cartesianChartAxisPrecision,cartesianChartSvg}from'./packages/dsh-research-task-runtime/cartesian-chart-artifact.js';const full=renderCartesianChart(HOME_NOTES_CHART_SPEC).html,start=full.indexOf('>',full.indexOf('<svg'))+1,end=full.indexOf('</svg>',start);process.stdout.write(JSON.stringify([homeNotesGuideChart('compat').node.containerSpec.html,full,...[480,680,862].map(w=>full.slice(0,start)+cartesianChartAxisPrecision(cartesianChartSvg)(HOME_NOTES_CHART_SPEC,w).markup+full.slice(end))]))"],{encoding:'utf8'})
 ;[html,full,...widths]=JSON.parse(output)
})
const parse=(value:string)=>new DOMParser().parseFromString('<html><head></head><body>'+researchHtmlDisplayHtml(value,true)+'</body></html>','text/html')
const route=(body:HTMLElement,target:Element)=>{const result:number[]=[];for(let n=target;n!==body;n=n.parentElement!)result.unshift([...n.parentElement!.children].indexOf(n));return result}
it('keeps actual runtime-generated dense point and disclosure routes inside the full 9b guard',()=>{
 for(const artifact of widths){const expected=parse(artifact),svg=expected.querySelector('svg')!,hit=svg.querySelector('rect.hit[data-point="80"]')!,summary=expected.querySelector('details>summary')!
 for(const index of [0,80,242])for(const selector of ['rect.hit','circle']){const target=svg.querySelector(selector+'[data-point=\"'+index+'\"]')!;expect(allowed(html,{id:'dense-target',clock:1,targetRoute:route(expected.body,target),tag:target.tagName.toUpperCase(),type:'click',x:.5,y:.5})).toBe(true)}
 expect(hit).toBeTruthy();expect(allowed(html,{id:'dense-mouse',clock:1,targetRoute:route(expected.body,hit),tag:'RECT',type:'click',x:.5,y:.5})).toBe(true)
 expect(allowed(html,{id:'dense-arrow',clock:2,targetRoute:route(expected.body,svg),tag:'SVG',type:'keydown',key:'ArrowRight'})).toBe(true)
 expect(allowed(html,{id:'dense-data',clock:3,targetRoute:route(expected.body,summary),tag:'SUMMARY',type:'click',x:.5,y:.5})).toBe(true)}
})
it('refuses unknown programs, partial compact trees and mutable disclosures',()=>{
 const expected=parse(full),summary=expected.querySelector('details>summary')!,event={id:'dense-forged',clock:1,targetRoute:route(expected.body,summary),tag:'SUMMARY',type:'click',x:.5,y:.5}
 expect(allowed(html.replace('Object.defineProperty(svg','spec.series[0].values[0]++;Object.defineProperty(svg'),event)).toBe(false)
 expect(allowed(html.replace('<tbody></tbody>','<tbody><tr><td>forged</td></tr></tbody>'),event)).toBe(false)
 expect(allowed(html.replace('<summary>查看完整数据</summary>','<summary><button>编辑</button></summary>'),event)).toBe(false)
})
