import fixedSource from '../../../packages/dsh-research-task-runtime/fixed-chart-runtime.js?raw'
import cartesianSource from '../../../packages/dsh-research-task-runtime/cartesian-chart-artifact.js?raw'
import {chartDataIssue} from '../../../packages/dsh-research-task-runtime/chart-template-contract.js'
import {researchHtmlDisplayHtml,validResearchInteractionEvent} from '../../../packages/dsh-research-task-runtime/html-artifact.js'

const attr=(node:Element,name:string)=>node.getAttribute(name)??undefined
// Read the same authoritative source serialized by the host, before the
// preload bundler renames local bindings. Never execute or normalize page JS.
const functionSource=(source:string,name:string,next?:string)=>{
 const prefix='export function '+name+'(',boundary=next?'export function '+next+'(':undefined,start=source.indexOf(prefix),end=boundary?source.indexOf(boundary,start+prefix.length):source.length
 if(start<0||source.indexOf(prefix,start+prefix.length)>=0||end<start||boundary&&source.indexOf(boundary,end+boundary.length)>=0)return undefined
 return source.slice(start+'export '.length,end).trim()
}
const fixed=functionSource(fixedSource,'fixedChartRuntime'),cartesian=functionSource(cartesianSource,'cartesianChartRuntime','renderCartesianChart'),geometry=functionSource(cartesianSource,'cartesianChartSvg','cartesianChartRuntime')

/** Verify the complete host program and exact target; an SVG/marker is not authority. */
export function noteChartNavigationAllowed(html:string,event:any):boolean{
 if(!validResearchInteractionEvent(event)||event.tag!=='SVG'||event.type!=='keydown'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)||Object.keys(event).some(key=>!['id','clock','targetRoute','tag','type','key'].includes(key)))return false
 try{
  const parse=(content:string)=>new DOMParser().parseFromString('<!doctype html><html><head></head><body>'+content+'</body></html>','text/html')
  const document=parse(html),elements=[...document.querySelectorAll('*')]
  if(elements.some(node=>['iframe','frame','object','embed'].includes(node.localName)||[...node.attributes].some(item=>/^on/i.test(item.name))))return false
  const scripts=elements.filter(node=>node.localName==='script'&&attr(node,'type')!=='application/json')
  if(scripts.length!==1||attr(scripts[0]!,'src')!==undefined)return false
  const script=scripts[0]!.textContent??'',programs=[{runtime:fixed,suffix:');',fixed:true},{runtime:geometry?cartesian:undefined,suffix:','+geometry+');',fixed:false}]
  const program=programs.find(({runtime,suffix})=>runtime&&script.startsWith('('+runtime+')(')&&script.endsWith(suffix))
  if(!program)return false
  if(program.fixed&&!['ArrowLeft','ArrowRight'].includes(event.key))return false
  const model=JSON.parse(script.slice(('('+program.runtime+')(').length,-program.suffix.length))
  if(chartDataIssue(model)||program.fixed&&!['line','bar'].includes(model.variant))return false
  // Resolve against the exact display projection embedded by the sandbox.
  const display=parse(researchHtmlDisplayHtml(html,true)),target=event.targetRoute.reduce((node:Element|undefined,index:number)=>node?.children[index],display.body),svgs=[...display.querySelectorAll('svg')]
  return svgs.length===1&&target===svgs[0]&&(program.fixed||(attr(target!,'class')??'').split(/\s+/).includes('template-chart'))
 }catch{return false}
}
