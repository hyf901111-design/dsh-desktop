import {hydrateCompactChartNavigationDisplay} from './chart-navigation-display'
import cartesian169 from './cartesian-navigation-1.6.9.js?raw'
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
const fixed=functionSource(fixedSource,'fixedChartRuntime')
const cartesianPrograms=(source:string,legacy=false)=>{
 const runtime=functionSource(source,'cartesianChartRuntime',legacy?'cartesianChartAxisPrecision':'renderCartesianChart')
 const geometry=functionSource(source,'cartesianChartSvg','cartesianChartRuntime')
 const precision=functionSource(source,'cartesianChartAxisPrecision')
 if(!runtime||!geometry||!precision)return []
 return [
  {runtime,suffix:','+geometry+');',fixed:false,precise:false,legacy},
  {runtime,suffix:',('+precision+')('+geometry+'));',fixed:false,precise:true,legacy}
 ]
}
const programs=[
 {runtime:fixed,suffix:');',fixed:true,precise:false,legacy:false},
 ...cartesianPrograms(cartesianSource),
 ...cartesianPrograms(cartesian169,true)
]

const interactive='a,button,label,input,select,textarea,[contenteditable],[role="button"],[role="menuitem"],[data-chart-series]'
const passiveSvg=new Set(['SVG','G','PATH','RECT','CIRCLE','ELLIPSE','LINE','POLYGON','POLYLINE','TEXT','TSPAN','TITLE','DESC','DEFS','CLIPPATH','MASK','LINEARGRADIENT','RADIALGRADIENT','STOP'])

// Both host disclosures contain only the complete immutable chart model.
// Its exact table structure has no editable controls or delegated commands.
const readOnlyDataDisclosure=(body:HTMLElement,target:Element|undefined,model:any,fixed:boolean)=>{
 const shape=(node:Element|undefined,tag:string,attrs:Record<string,string>={})=>!!node&&node.namespaceURI==='http://www.w3.org/1999/xhtml'&&node.tagName===tag&&node.attributes.length===Object.keys(attrs).length&&Object.entries(attrs).every(([key,value])=>node.getAttribute(key)===value)
 const leaf=(node:Element|undefined,tag:string,value:unknown)=>shape(node,tag)&&!node!.children.length&&node!.textContent===String(value??'—').replace(/\r\n?/g,'\n').replace(/\0/g,'\ufffd')
 const disclosures=body.querySelectorAll('details'),details=disclosures[0]
 if(disclosures.length!==1||!shape(details,'DETAILS')||details!.parentElement!==body||details!.children.length!==2||details!.closest(interactive+',summary'))return false
 const [summary,content]=[...details!.children]
 if(target!==summary||!leaf(summary,'SUMMARY',fixed?'查看全部数据':'查看完整数据'))return false
 if(!fixed&&(!shape(content,'DIV',{class:'data-scroll'})||content!.children.length!==1))return false
 const table=fixed?content:content!.children[0]
 if(!shape(table,'TABLE')||table!.children.length!==2)return false
 const [head,rows]=[...table!.children]
 if(!shape(head,'THEAD')||head!.children.length!==1||!shape(rows,'TBODY')||rows!.children.length!==model.labels.length)return false
 const headings=head!.children[0],names=[fixed?'日期':'分类',...model.series.map((series:any)=>series.name+(!fixed&&model.unit?' ('+model.unit+')':''))]
 if(!shape(headings,'TR')||headings!.children.length!==names.length||![...headings!.children].every((cell,index)=>leaf(cell,'TH',names[index])))return false
 return [...rows!.children].every((row,index)=>shape(row,'TR')&&row.children.length===names.length&&[...row.children].every((cell,column)=>leaf(cell,'TD',column?model.series[column-1].values[index]:model.labels[index])))
}

/** Verify the complete host program and exact target; an SVG/marker is not authority. */
export function noteChartNavigationAllowed(html:string,event:any):boolean{
 const pointer=event?.type==='click',fields=pointer?['id','clock','targetRoute','tag','type','x','y']:['id','clock','targetRoute','tag','type','key']
 if(!validResearchInteractionEvent(event)||Object.keys(event).some(key=>!fields.includes(key)))return false
 if(pointer?typeof event.x!=='number'||typeof event.y!=='number':event.tag!=='SVG'||event.type!=='keydown'||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return false
 try{
  const parse=(content:string)=>new DOMParser().parseFromString('<!doctype html><html><head></head><body>'+content+'</body></html>','text/html')
  const document=parse(html),elements=[...document.querySelectorAll('*')]
  if(elements.some(node=>['iframe','frame','object','embed'].includes(node.localName)||[...node.attributes].some(item=>/^on/i.test(item.name))))return false
  const scripts=elements.filter(node=>node.localName==='script'&&attr(node,'type')!=='application/json')
  if(scripts.length!==1||attr(scripts[0]!,'src')!==undefined)return false
  const script=scripts[0]!.textContent??''
  const program=programs.find(({runtime,suffix})=>runtime&&script.startsWith('('+runtime+')(')&&script.endsWith(suffix))
  if(!program)return false
  if(!pointer&&program.fixed&&!['ArrowLeft','ArrowRight'].includes(event.key))return false
  const model=JSON.parse(script.slice(('('+program.runtime+')(').length,-program.suffix.length))
  if(!!program.precise!==(model.axisDecimals!==undefined)||chartDataIssue(model)||program.fixed&&!['line','bar'].includes(model.variant))return false
  if(program.legacy&&model.series.some((series:{values:unknown[]})=>series.values.includes(null)))return false
  // Resolve against the exact display projection embedded by the sandbox.
  const display=parse(researchHtmlDisplayHtml(html,true))
  if(!hydrateCompactChartNavigationDisplay(display,model,!!program.precise,attr(document.body,'data-note-chart-compact')))return false
  const target=event.targetRoute.reduce((node:Element|undefined,index:number)=>node?.children[index],display.body),svgs=[...display.querySelectorAll('svg')]
  const svg=svgs[0]
  if(svgs.length!==1||!svg||!program.fixed&&!(attr(svg,'class')??'').split(/\s+/).includes('template-chart'))return false
  if(!pointer)return target===svg
  // Only passive geometry inside this exact host chart can locate a point.
  // Legend handlers also bind data-chart-series on non-button elements.
  if(![svg,...svg.querySelectorAll('*')].every(node=>node.namespaceURI==='http://www.w3.org/2000/svg'&&passiveSvg.has(node.tagName.toUpperCase())))return false
  if(event.tag==='SUMMARY')return readOnlyDataDisclosure(display.body,target,model,program.fixed)
  return !!target&&target.namespaceURI==='http://www.w3.org/2000/svg'&&target.tagName.toUpperCase()===event.tag&&target.closest('svg')===svg&&
   !target.closest(interactive+',summary')
 }catch{return false}
}
