import {cartesianChartSvg,cartesianChartAxisPrecision} from '../../../packages/dsh-research-task-runtime/cartesian-chart-artifact.js'

/** Called only after the complete host program and literal model are verified.
 * Rebuild the known runtime's passive tree with trusted geometry, never page JS.
 * Existing full artifacts remain untouched. Partial or untrusted trees fail. */
export function hydrateCompactChartNavigationDisplay(document:Document,model:any,precision:boolean,marker:string|undefined):boolean{
 if(marker===undefined)return true
 if(marker!=='1'||!precision)return false
 const svgs=document.body.querySelectorAll('svg'),tables=document.body.querySelectorAll(':scope > details > .data-scroll > table > tbody')
 if(svgs.length!==1||tables.length!==1)return false
 const svg=svgs[0]!,rows=tables[0]!
 if(svg.namespaceURI!=='http://www.w3.org/2000/svg'||!svg.classList.contains('template-chart')||svg.childNodes.length||rows.childNodes.length)return false
 svg.innerHTML=cartesianChartAxisPrecision(cartesianChartSvg)(model).markup
 for(let index=0;index<model.labels.length;index++){
  const row=document.createElement('tr')
  for(const value of [model.labels[index],...model.series.map((series:any)=>series.values[index])]){
   const cell=document.createElement('td');cell.textContent=String(value).replace(/\r\n?/g,'\n').replace(/\0/g,'\ufffd');row.append(cell)
  }
  rows.append(row)
 }
 return true
}
