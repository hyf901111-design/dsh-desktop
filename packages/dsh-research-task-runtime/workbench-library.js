import {componentLibraryBuiltins} from './component-library-catalog.js'
import {financialWidgetDefaults,financialWidgetSpec,financialCanLink,synchronizeFinancialLinks} from './financial-widget-contract.js'

// Same IDs as the visible component library; no second list of lookalike templates.
export const WORKBENCH_LIBRARY_IDS=Object.freeze(componentLibraryBuiltins().map(item=>item.id))
export const WORKBENCH_LIBRARY_GUIDANCE='【组件库基础能力】先按用户需求判断现有组件能覆盖哪些部分，再规划剩余取数与可视化；可以在同一个工作台混用原生组件和按数据生成的卡片。可直接调用组件库：builtin-watchlist 自选列表（搜索、增删、排序、选择证券并输出选股节点）；builtin-quote 行情面板（证券搜索、分时/K线、周期、复权、MA/VOL/MACD，接收自选节点并输出选股节点）；builtin-indices 市场指数总览；builtin-news 可搜索的实时新闻列表；builtin-announcements 证券公告列表（新闻和公告均接收自选或行情节点）；builtin-calendar 个人日历工具（已有日历与手动日程，不等于经济数据日历）。原生组件用 panel.library:{id,options?}；金融组件 type:"financial-widget"，日历 type:"calendar-tool"。options 仅填配置，如 symbols:[{code,market:"SH|SZ|BJ|HK|US",name}]、query、period:"1m|1d|1w|1mo|1y"、adjustment:"none|forward|backward"、indicators:["MA","VOL","MACD"]、refreshMinutes、refreshEnabled；quote/announcements最多一个标的，自选和指数可多个，选中标的用selectedSymbol:"SH:688981"，不填行情数字或HTML；未指定标的可用空symbols保留搜索入口，指定标的须保留已确认代码与市场。单卡示例：{"title":"行情","prompt":"显示所选证券的行情","type":"financial-widget","library":{"id":"builtin-quote","options":{"symbols":[]}}}。需要联动时在根级 links:[{sourcePanel:0,targetPanel:1}] 按panels零基序号声明；允许自选→行情/新闻/公告、行情→新闻/公告，每个目标至多一个来源，宿主绑定真实节点ID。新闻独立使用时用query保留研究主题；与节点连接后跟随所选证券。按实体或主题分页用根级tabs，不用文字假装页签。原生组件无需预取价格、抄写记录或启动生成子任务，但配置完成不等于取数成功。库组件不覆盖的财务、估值、经营、风险、行业对比、指定来源/区间/筛选等需求，保留为独立数据卡；根据实际资料选择图形，现有模板只提供样式和交互参考，不补造字段、不删减需求、不因缺模板字段而失败。不能为复用库组件把多维投研缩成行情加新闻，也不把实时列表当作区间完整资讯。公开回报只说明交付内容与真实状态，不复述本规则。'

export function resolveWorkbenchLibraryPanel(panel){
 if(panel?.library===undefined)return panel
 const {library,...rest}=panel
 if(!library||typeof library!=='object'||Array.isArray(library)||Object.keys(library).some(k=>!['id','options'].includes(k))||!WORKBENCH_LIBRARY_IDS.includes(library.id))throw Error('组件库ID无效，请使用已列出的内置组件。')
 if(panel.artifact!=null||panel.publicData!==undefined||panel.requests!==undefined||panel.profile!==undefined)throw Error('组件库配置与数据快照/取数配置不能同时覆盖同一张卡；请拆分互补展示。')
 const options=library.options??{}
 if(!options||typeof options!=='object'||Array.isArray(options)||JSON.stringify(options).length>16000)throw Error('组件库配置无效或过长。')
 const widget=componentLibraryBuiltins().find(item=>item.id===library.id).widget
 if(widget==='calendar'){
  if(Object.keys(options).length)throw Error('日历工具复用已有日历，不接受生成的事件或提醒；经济事件请使用数据日历卡。')
  return {...rest,type:'calendar-tool',artifact:{version:1,type:'calendar-tool',title:panel.title}}
 }
 const safeKeys=['symbols','query','period','adjustment','indicators','market','selectedSymbol','visibleBars','dataSource','refreshMinutes','refreshEnabled']
 const defaults=financialWidgetDefaults(widget)
 const spec=Object.keys(options).every(key=>safeKeys.includes(key))&&financialWidgetSpec({...defaults,symbols:[],...options,title:panel.title})
 const content=(panel.title??'')+' '+(panel.prompt??'')
 const missingFinancialFields=widget==='quote'&&/市盈率|市净率|\bPE\b|\bPB\b|研发费用率|毛利率|净利率|营业收入|财务报表/iu.test(content)
 if(spec&&!missingFinancialFields)return {...rest,type:'financial-widget',artifact:spec}
 // Keep all authored requirements when the library cannot represent them.
 // A wrong market/unsupported indicator is not permission to substitute a ticker.
 const candle=/K\s*线|蜡烛图|candlestick/iu.test(content)
 return {...rest,type:['news','announcements'].includes(widget)?'news':candle?'chart':'table',prompt:(candle?'chart.candlestick；':'')+panel.prompt+'\n原生组件未覆盖以下展示配置，请依据原需求和真实数据选择呈现方式，保留字段、来源、标的与交互，不套原生字段或替换证券：'+JSON.stringify(options)}
}

export function validateWorkbenchLinks(value,panels){
 if(value===undefined)return undefined
 if(!Array.isArray(value)||value.length>panels.length)throw Error('节点联动配置无效。')
 const targets=new Set()
 return value.map(link=>{
  if(!link||typeof link!=='object'||Object.keys(link).some(key=>!['sourcePanel','targetPanel'].includes(key)))throw Error('节点联动使用sourcePanel和targetPanel面板序号。')
  const {sourcePanel:s,targetPanel:t}=link
  if(!Number.isInteger(s)||!Number.isInteger(t)||s<0||t<0||s===t||s>=panels.length||t>=panels.length||targets.has(t)||!financialCanLink(panels[s].artifact,panels[t].artifact))throw Error('节点联动需连接兼容的原生组件：自选→行情/新闻/公告，行情→新闻/公告；每个目标一个来源。不支持联动的数据卡应保留独立展示。')
  if(panels[t].artifact.linkedWatchlistId||panels[t].artifact.linkedSourceId)throw Error('节点联动请使用面板序号，不同时提供外部节点ID。')
  targets.add(t);return {sourcePanel:s,targetPanel:t}
 })
}

// Resolve only after all real IDs exist. Works even when dependents precede sources.
export function bindWorkbenchLibraryLinks(panels,links){
 if(!links?.length)return panels
 const nodes=panels.map(p=>({id:p.nodeId,containerSpec:p.artifact}))
 for(const {sourcePanel:s,targetPanel:t} of links){
  if(!nodes[s]?.id||!nodes[t]?.id)throw Error('组件节点尚未分配，无法建立联动。')
  nodes[t].containerSpec={...nodes[t].containerSpec,[nodes[t].containerSpec.widget==='quote'?'linkedWatchlistId':'linkedSourceId']:nodes[s].id}
 }
 return synchronizeFinancialLinks(nodes).map((node,i)=>({...panels[i],...(node.containerSpec?{artifact:node.containerSpec}:{})}))
}
