import {MARKET_DESIGN_TEMPLATES,TERMINAL_GENERIC_TEMPLATES,WORKBENCH_DESIGN_VERSION} from './workbench-design-contract.js'
import {applyTerminalPresentation} from './terminal-presentation.js'

const interactions = {
 metrics:['详情'],candlestick:['标的','交易区间','逐点行情'],trend:['系列','逐点数值'],scatter:['点选详情'],table:['搜索','排序','行详情'],pipeline:['阶段筛选','详情'],events:['详情'],heatmap:['选择区块','详情'],breadth:['区间分布'],
 'fund-kpi':['指标详情'],'fund-holdings':['搜索','排序'],'fund-industry':['行业比较'],'price-volume':['区间','逐点量价'],'order-book':['盘口档位'],'fund-flow':['行业','周期'],'valuation-band':['区间','分位比较'],'equity-drawdown':['区间','基准比较'],'allocation-donut':['选择分类'],'waterfall':['项目详情'],'funnel':['阶段详情'],'risk-matrix':['风险详情']
}
const generic=[
 ['kpi','指标卡',['详情'],656,212],['chart.line','折线图',['系列','逐点数值'],656,320],['chart.bar','柱状图',['系列','逐点数值'],656,320],
 ['table','明细表',['搜索','排序','完整表格'],656,352],['dashboard','概览',['指标详情'],656,238],['news','资讯',['搜索','分类','展开','来源'],656,352],
 ['reports','研报',['搜索','分类','展开','来源'],656,352],['calendar','日程',['日期','事件详情'],656,316],['gantt','甘特图',['筛选','日期','任务详情'],656,352]
]
export const COMPONENT_TEMPLATES=Object.freeze([
 ...Object.entries(MARKET_DESIGN_TEMPLATES).map(([variant,t])=>({id:`market.${variant}`,type:'market',variant,title:t.id,width:t.width,height:t.height,figma:t.figma,interactions:interactions[variant]})),
 ...generic.map(([id,title,interactions,width,height])=>({id,type:id.split('.')[0],...(id.startsWith('chart.')?{variant:id.split('.')[1]}:{}),title,interactions,width,height,figma:TERMINAL_GENERIC_TEMPLATES[id].figma}))
].map(t=>Object.freeze({...t,version:WORKBENCH_DESIGN_VERSION,minWidth:280,minHeight:180,responsive:'控件换行；内容按可用宽度布局；长列表内部滚动；不缩小正文',maxDataBytes:256000})))
const templates=new Map(COMPONENT_TEMPLATES.map(t=>[t.id,t]))
export function templateFor(data){return templates.get(data?.type==='market'||data?.type==='chart'?`${data.type}.${data.variant}`:data?.type)??null}
export function retainTemplateModel(spec,data){
 const template=templateFor(data)
 if(!template||spec.type!=='html')return spec
 // Inert source data accompanies the trusted renderer. It is not executable,
 // does not carry connection credentials, and is validated again before refresh.
 const json=JSON.stringify({templateId:template.id,version:template.version,data})
 if(new TextEncoder().encode(json).length>template.maxDataBytes)return spec
 const encoded=json.replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029')
 return {...spec,html:applyTerminalPresentation(spec.html)+`<script id="sherlock-template-data" type="application/json">${encoded}</script>`}
}
export function readTemplateModel(spec){
 const native=templateFor(spec)
 if(native)return {templateId:native.id,version:native.version,data:spec}
 if(spec?.type!=='html'||typeof spec.html!=='string')return null
 const text=spec.html.match(/<script id="sherlock-template-data" type="application\/json">([^<]*)<\/script>/)?.[1]
 if(!text||text.length>512000)return null
 try{const model=JSON.parse(text);const t=templateFor(model.data);return t&&model.templateId===t.id&&typeof model.version==='string'?model:null}catch{return null}
}
export function templateSummary(spec){
 const model=readTemplateModel(spec)
 if(!model)return null
 const t=templates.get(model.templateId)
 return {templateId:t.id,templateVersion:model.version,data:model.data,interactions:t.interactions,message:'已保留结构化数据。更新只提交此数据对象，不读取或重写 HTML；样式由宿主固定模板提供。'}
}
