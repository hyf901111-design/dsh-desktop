import {ATTACHMENT_TEMPLATES,ATTACHMENT_GUIDANCE} from './attachment-template-contract.js'
import {DERIVED_TEMPLATES,DERIVED_GUIDANCE} from './derived-template-contract.js'
import {AUDIO_TEMPLATES,AUDIO_GUIDANCE} from './audio-template-contract.js'
import {YOUTUBE_TEMPLATES,YOUTUBE_GUIDANCE} from './youtube-template-contract.js'
import {IFRAME_TEMPLATES,IFRAME_GUIDANCE} from './iframe-template-contract.js'
import {TIMELINE_TEMPLATES,TIMELINE_GUIDANCE} from './timeline-template-contract.js'
import {KPI_TEMPLATES,KPI_GUIDANCE} from './kpi-template-contract.js'
import {CALENDAR_TEMPLATES,CALENDAR_GUIDANCE} from './calendar-template-contract.js'
import {GANTT_GUIDANCE} from './gantt-template-contract.js'
import {CHART_TEMPLATES,chartTemplateSchema} from './chart-template-contract.js'
import {MARKET_DESIGN_TEMPLATES,TERMINAL_GENERIC_TEMPLATES,WORKBENCH_DESIGN_VERSION} from './workbench-design-contract.js'
import {applyTerminalPresentation} from './terminal-presentation.js'
import {OPERATIONS_TEMPLATES,operationsTemplateSchema} from './operations-template-contract.js'
import {DATASET_VIEW_GUIDANCE} from './dataset-view-contract.js'

const interactions = {
 charting:['已取得证券周期','K线OHLC收盘线','独立量纲比较','本地技术指标参数','绘图与锁定撤销','范围及视图恢复','完整来源记录'],
 'stock-ownership':['证券报告期','完整股东记录','原比例分母','股类明细','排序','范围导出'],'company-filings':['公告标题','表单类型','日期范围','原文与摘要来源','复制原文链接','范围导出'],'historical-price':['日期范围','时区复权币种','OHLCV与VWAP','排序','原缺失记录','范围导出'],
 'insider-trading':['公司与人员筛选','原交易类型和方向','交易日与披露日','日期排序','完整来源记录','披露链接'],'institutional-ownership':['已取得公司年度季度','本期比较期原值','原变化及单位','来源汇总与部分明细','机构与股类筛选','语义状态恢复'],
 dividends:['公司筛选','日期范围','状态筛选','日期排序','事件详情','原公告'],
 'stock-splits':['公司筛选','日期范围','拆股合股方向','来源状态','复权口径','原公告'],
 'revenue-geography':['公司与财年季度','固定分项颜色','图例切换','收入占比','来源总额核对','完整披露记录'],'revenue-business':['公司与财年季度','跨期固定颜色','图例分页','收入占比','来源总额核对','完整披露记录'],
 'company-profile':['公司切换','原登记资料','资料披露日期','完整简介'],'financial-statements':['财年季度','报表切换','披露日期','科目折叠','逐行单位','选中明细'],
 'price-performance':['市场时区与复权','交易范围','OHLCV读数','缩放平移'],'valuation-multiples':['财年季度','图例','缺失与负倍数','期间读数','完整记录'],'price-target':['机构预测','发布日期与有效期','当前价比较','目标价排序','记录详情'],
 'share-statistics':['股数与比例','统计口径'],'market-overview':['市场筛选','历史读数'],'currency-snapshot':['报价方向','精度','货币筛选'],'watchlist':['搜索','排序','行情详情','管理自选'],
 'ticker-information':['历史报价','逐点读数'],'key-metrics':['搜索','指标口径'],'management-team':['搜索','报酬排序','成员披露详情'],
 metrics:['详情'],candlestick:['标的','交易区间','逐点行情'],trend:['系列','逐点数值'],scatter:['点选详情'],table:['搜索','排序','行详情'],pipeline:['阶段筛选','详情'],events:['详情'],heatmap:['选择区块','详情'],breadth:['区间分布'],
 'fund-kpi':['指标详情'],'fund-holdings':['搜索','排序'],'fund-industry':['行业比较'],'price-volume':['区间','逐点量价'],'order-book':['盘口档位'],'fund-flow':['行业','周期'],'valuation-band':['区间','分位比较'],'equity-drawdown':['区间','基准比较'],'allocation-donut':['选择分类'],'waterfall':['项目详情'],'funnel':['阶段详情'],'risk-matrix':['风险详情']
}
const generic=[
 ['table','明细表',['搜索','排序','完整表格'],656,352],['dashboard','概览',['指标详情'],656,238],['news','资讯',['搜索','分类','展开','来源'],656,352],
 ['reports','研报',['搜索','分类','展开','来源'],656,352],['gantt','甘特图',['日期及日内时间轴','任务详情','键盘导航'],656,352]
]
export const COMPONENT_TEMPLATES=Object.freeze([
 {id:'view',type:'view',title:'共用记录组合视图',version:'dataset-view-v1',schema:DATASET_VIEW_GUIDANCE,width:656,height:620,figma:'现有控件规范组合扩展',interactions:['字段筛选','记录详情','两项比较','资源排程','本地优先级','状态恢复']},
 ...ATTACHMENT_TEMPLATES.map(t=>({...t,schema:ATTACHMENT_GUIDANCE})),
 ...AUDIO_TEMPLATES.map(t=>({...t,schema:AUDIO_GUIDANCE})),
 ...DERIVED_TEMPLATES.map(t=>({...t,schema:DERIVED_GUIDANCE})),
 ...YOUTUBE_TEMPLATES.map(t=>({...t,schema:YOUTUBE_GUIDANCE})),
 ...IFRAME_TEMPLATES.map(t=>({...t,schema:IFRAME_GUIDANCE})),
 ...TIMELINE_TEMPLATES.map(t=>({...t,schema:TIMELINE_GUIDANCE})),
 ...KPI_TEMPLATES.map(t=>({...t,schema:KPI_GUIDANCE})),
 ...CALENDAR_TEMPLATES.map(t=>({...t,schema:CALENDAR_GUIDANCE})),
 ...OPERATIONS_TEMPLATES.map(t=>({...t,schema:operationsTemplateSchema(t.id)})),
 ...CHART_TEMPLATES.map(t=>({...t,id:`chart.${t.variant}`,type:'chart',schema:chartTemplateSchema(t.variant),interactions:t.interactions??['系列切换','逐点数值','完整数据'],version:'22a-20260930'})),
 ...Object.entries(MARKET_DESIGN_TEMPLATES).map(([variant,t])=>({id:`market.${variant}`,type:'market',variant,title:t.id,width:t.width,height:t.height,minWidth:t.minWidth,minHeight:t.minHeight,figma:t.figma,interactions:interactions[variant]})),
 ...generic.map(([id,title,interactions,width,height])=>({id,type:id.split('.')[0],...(id.startsWith('chart.')?{variant:id.split('.')[1]}:{}),...(id==='gantt'?{schema:GANTT_GUIDANCE}:{}),title,interactions,width,height,figma:TERMINAL_GENERIC_TEMPLATES[id].figma}))
].map(t=>Object.freeze({...t,version:t.version??WORKBENCH_DESIGN_VERSION,minWidth:t.minWidth??280,minHeight:t.minHeight??180,responsive:'控件换行；内容按可用宽度布局；长列表内部滚动；不缩小正文',maxDataBytes:256000})))
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
 const chartDetails=model.data.type==='chart'&&Array.isArray(model.data.detailRows)?'补充明细已在图表下方默认折叠，包含 detailColumns/detailRows，可展开排序并拖动列宽；无需另建同一批记录的明细卡。':''
 return {templateId:t.id,templateVersion:model.version,data:model.data,interactions:t.interactions,message:(t.id==='view'?'已保留共同记录与组合视图配置。更新提交结构化数据和视图配置，不读取或重写HTML；保留原记录、单位、缺失值与说明。':'data 是完整的可编辑内容，直接修改需要的字段并通过 research_canvas_apply 提交 fields.containerSpec；保留其余数据、来源和日期，不读取或重写 HTML。')+chartDetails}
}
