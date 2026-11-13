import {advancedChartView} from '../../../packages/dsh-research-task-runtime/advanced-chart-view.js'
import {cartesianChartSvg} from '../../../packages/dsh-research-task-runtime/cartesian-chart-artifact.js'
import {specialChartView,type ChartGeometryNode} from '../../../packages/dsh-research-task-runtime/special-chart-view.js'
import {address,chartSourceRows,parseRange,type WorkbookChart,type WorkbookChartKind} from '../../shared/spreadsheet/workbook'
import type {SheetEngine} from './engine'

export const chartKindLabels:Record<WorkbookChartKind,string>={
 bar:'柱状图',horizontal:'条形图',stackedBar:'堆叠柱状图',line:'折线图',step:'阶梯图',area:'面积图',
 combo:'组合图',pie:'饼图',donut:'环形图',scatter:'散点图'
}

export const escapeSheetText=(value:unknown)=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!))

const svgNode=(node:ChartGeometryNode):string=>typeof node==='string'?escapeSheetText(node):
 '<'+node.tag+Object.entries(node.attributes).map(([name,value])=>' '+name+'="'+escapeSheetText(value)+'"').join('')+'>'+node.children.map(svgNode).join('')+'</'+node.tag+'>'
const isEmpty=(value:unknown)=>value===null||value===undefined||value===''
const isNumber=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)
export function spreadsheetChartData(engine:SheetEngine|undefined,chart:WorkbookChart){
 const sheet=engine?.model.getSheetBySheetId(chart.sheetId)
 if(!sheet)return
 const bounds=parseRange(chart.range)
 const range=sheet.getRange(chart.range),raw=range.getRawValues(),display=range.getDisplayValues()
 const projected=chartSourceRows(chart,bounds,(row,col)=>{
  const y=row-bounds.r0,x=col-bounds.c0
  return {raw:raw[y]?.[x],label:display[y]?.[x]}
 })
 const headers=chart.headers?projected.rows[0]:undefined
 const values=projected.rows.slice(chart.headers?1:0).filter(row=>row.some(value=>!isEmpty(value.raw)))
 if(!values.length||values.some(row=>isEmpty(row[0]?.raw)||row.slice(1).some(cell=>!isNumber(cell.raw))))return
 if(chart.kind==='scatter'&&values.some(row=>!isNumber(row[0]?.raw)))return
 if(projected.composition&&(values.some(row=>Number(row[1]?.raw)<0)||!values.some(row=>Number(row[1]?.raw)>0)))return
 const series=projected.series.map((field,i)=>({
  name:String(headers?.[i+1]?.raw||(projected.byRows?String(bounds.r0+field+1)+' 行':address(0,bounds.c0+field).slice(0,-1)+' 列')),
  hasName:!isEmpty(headers?.[i+1]?.raw),
  values:values.map(row=>Number(row[i+1]?.raw))
 }))
 return {variant:chart.kind,source:sheet.getSheetName()+'!'+chart.range,categoryName:String(headers?.[0]?.raw||'X'),
  labels:values.map(row=>row[0]?.label||String(row[0]?.raw)),xValues:values.map(row=>Number(row[0]?.raw)),series,
  displayedValues:values.map(row=>row.slice(1).map(cell=>cell.label||String(cell.raw)))}
}
type ChartData=NonNullable<ReturnType<typeof spreadsheetChartData>>
export function spreadsheetChartSvg(chart:WorkbookChart,data:ChartData,width=540){
 let geometry
 if(chart.kind==='pie'||chart.kind==='donut'){
  geometry=specialChartView({variant:chart.kind,items:data.labels.map((label,index)=>({label,value:data.series[0]!.values[index]!}))},width)
 }else if(chart.kind==='scatter'){
  geometry=advancedChartView({variant:'scatter',xAxis:{label:data.categoryName,unit:''},yAxis:{label:data.series.length===1?data.series[0]!.name:'Y',unit:''},points:data.series.flatMap(series=>
   data.xValues.map((x,index)=>({x,y:series.values[index]!,label:data.labels[index]!,group:series.name})))},width)
 }else{
  geometry=cartesianChartSvg(data,width)
 }
 const elements=geometry.elements as ChartGeometryNode[]
 const markup=elements.filter(node=>typeof node==='string'||chart.gridlines!==false||node.attributes.class!=='grid').map(svgNode).join('')
 return '<svg data-ui-preserve role="img" aria-label="'+escapeSheetText(chart.title)+'" viewBox="0 0 '+geometry.width+' '+geometry.height+'">'+markup+'</svg>'
}
