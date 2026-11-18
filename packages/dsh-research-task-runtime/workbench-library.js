import {componentLibraryBuiltins} from './component-library-catalog.js'
import {isDeepStrictEqual} from 'node:util'
import {financialWidgetDefaults,financialWidgetSpec,financialCanLink,synchronizeFinancialLinks} from './financial-widget-contract.js'
import {financialIndexCatalog} from './financial-index-catalog.js'
import {retrospectiveNewsRecords} from './news-source-scope.js'
import {generalFuturesWorkbench} from './workbench-planning-context.js'
import {sourcedFuturesDirectoryPanel} from './futures-directory.js'

// A broad futures desk needs an actual contract or news entry point even if a
// model retry retained only background material. Keep authored tab/link indexes.
export function includeFuturesInformationSources(plan, request, limit, previous) {
 if (!generalFuturesWorkbench(request) || plan.dataMode==='simulated' || !Array.isArray(plan.panels) || !plan.panels.length) return plan
 const additions=[]
 const defaults=[
  {id:'builtin-futures',widget:'futures',title:'商品期货行情 · 上期所与能源中心',prompt:'按品种查看在市合约结算排行、期限结构及持仓，保留交易日期和原始日报。',options:{}},
  {id:'builtin-news',widget:'news',title:'期货市场要闻',prompt:'按发布时间追踪期货市场，支持主题检索和打开原文。',options:{query:'商品期货',dataSource:'doubao'}}
 ]
 for (const {id,widget,title,prompt,options} of defaults) {
  if(plan.panels.length+additions.length>=limit) break
  if(previous && !previous.panels?.some(panel=>panel.title===title)) continue
  if(plan.panels.some(p=>p?.library?.id===id || p?.artifact?.widget===widget || p?.title===title ||
      widget==='news'&&(p?.type==='news'||p?.publicData?.profile==='news'))) continue
  additions.push({title,prompt,type:'financial-widget',size:'large',library:{id,options}})
 }
 if(!additions.length)return plan
 if(!plan.tabs?.length && !plan.links?.length)return {...plan,panels:[...additions,...plan.panels]}
 const tabs=Array.isArray(plan.tabs)?plan.tabs.map((tab,i)=>i===0&&Array.isArray(tab?.panelIndexes)?
  {...tab,panelIndexes:[...tab.panelIndexes,...additions.map((_,j)=>plan.panels.length+j)]}:tab):plan.tabs
 return {...plan,panels:[...plan.panels,...additions],...(tabs?{tabs}:{})}
}

// Same IDs as the visible component library; no second list of lookalike templates.
export const WORKBENCH_LIBRARY_IDS=Object.freeze(componentLibraryBuiltins().map(item=>item.id))
export const WORKBENCH_LIBRARY_GUIDANCE=[
 '【组件库基础能力】实时行情、K线及可搜索的实时新闻先评估组件库覆盖，再规划其余取数与呈现。原生组件直接用 panel.library:{id,options?}，无需预取数据，不混用 artifact、publicData、requests 或 profile。金融组件 type:"financial-widget"，个人日历 type:"calendar-tool"。',
 'builtin-quote 是交互行情面板，支持标的搜索、周期、MA/VOL/MACD 和来源配置；证券可选支持的复权。Kraken（kraken）和 Bitfinex（bitfinex）支持 BTC/USD、ETH/USD、SOL/USD 现货和 1m、1h、1d、1w，每对独立一张。示例 library:{id:"builtin-quote",options:{symbols:[{code:"BTC/USD",market:"CRYPTO",name:"比特币"}],dataSource:"kraken",period:"1m",adjustment:"none"}}。A股等证券保留已确认的代码和市场；A股可按来源能力使用 tushare 或 datapro。无标的可用 symbols:[] 保留搜索。',
 'builtin-futures 是可直接挂载的上期所交易日报组件（含能源中心）。商品期货研究、合约比较和期限结构优先用一张 library:{id:"builtin-futures",options:{query:"rb"}}，query 可省略或填覆盖品种名/品种代码。用户可切换铜、铝、黄金、螺纹钢、原油等在市品种，可看持仓最大合约的品种涨跌排行，点击不同品种切换结算曲线、持仓分布、合约明细；每小时检查新的日结算数据，展示真实交易日。这些字段无需先搜索接口、逐个合约取数或制作重复静态卡。股指期货、外盘、期权、指定历史日、盘中报价或限定其他来源时，另按要求用成功的 Tushare、火山专业数据或其他授权来源。上期所和能源中心的在市品种目录可用同一 library 的 options:{directory:true}，按日报同步品种、报价单位和合约数，点击品种可查看行情。现行合约取来源列示的到期月，不能把已到期合约当作当前合约。选定主力须有本交易日成交或持仓依据。',
 'builtin-news 是支持搜索与来源选择的实时新闻列表。单一主题的日常浏览直接提交一个列表，用 options.query 保留主题，卡上已有换词检索和原文。用户指定独立栏目、对比需求或还需股票行情时再增加对应面板；加密货币、国际或其他专题搜索优先选择已配置的 dataSource:"doubao"，全市场财经新闻可用默认来源。按用户指定的可用来源填 doubao（豆包）、eastmoney（东方财富）或 sina（新浪财经）。区间内逐条整理公告或新闻使用 market.table；实时证券公告可用 builtin-announcements。',
 'builtin-watchlist 用于自选的搜索、增删、排序和选股，builtin-indices 用于市场指数总览，builtin-calendar 用于个人日历和手动日程。options 仅填配置，如 symbols:[{code,market,name}]、query、period、adjustment、indicators、visibleBars、refreshMinutes、refreshEnabled、dataSource。quote/announcements 最多一个标的，自选和指数可多个。多个大盘指数的盘中报价使用 builtin-indices，60 秒自动刷新填写 refreshMinutes:1 与 refreshEnabled:true。证券代码与交易所拆为 code:"600519"、market:"SH"，不把 .SH/.SZ 写入 code。选中标的用 selectedSymbol:"SH:688981"。',
 '联动用根级 links:[{sourcePanel:0,targetPanel:1}]，panels 从零计数。允许自选→行情/新闻/公告、行情→新闻/公告，每个目标至多一个来源，联动新闻随上游标的变化。按实体或主题分页用根级 tabs。',
 '工作台可同时包含库组件和独立数据卡。自定义量价图、组合对比、估值、经营、风险、指定历史区间及库组件无法覆盖的来源、周期或筛选沿用用户要求和实际数据。原生配置挂载后由客户端取数，报价来源、时点和刷新状态以实际返回为准。'
].join('\n')

function requestedNewsSource(request){
 const names={doubao:/豆包|\bdoubao\b/iu,eastmoney:/东方财富|\beastmoney\b/iu,sina:/新浪|\bsina\b/iu}
 const clauses=request.split(/[，,。；;\n]/u).filter(clause=>
  /^\s*(?:全部|所有|各)?\s*(?:新闻|资讯|news).{0,12}(?:使用|采用|来自|(?:数据)?来源\s*(?:[:：]|为|是)|\b(?:using|from)\b)/iu.test(clause)&&
  !/不要|禁止|排除|不用|不使用|可选|\b(?:not|without)\b/iu.test(clause))
 const named=Object.keys(names).filter(source=>clauses.some(clause=>names[source].test(clause)))
 return named.length===1?named[0]:undefined
}

export function resolveWorkbenchLibraryPanel(panel, originalRequest='', currentDirectory=false){
 if(currentDirectory&&generalFuturesWorkbench(originalRequest))panel=sourcedFuturesDirectoryPanel(panel)
 if(panel?.library===undefined)return panel
 const {library,...rest}=panel
 if(!library||typeof library!=='object'||Array.isArray(library)||Object.keys(library).some(k=>!['id','options'].includes(k))||!WORKBENCH_LIBRARY_IDS.includes(library.id))throw Error('组件库ID无效，请使用已列出的内置组件。')
 if(panel.artifact!=null||panel.publicData!==undefined||panel.requests!==undefined||panel.profile!==undefined)throw Error('组件库配置与数据快照/取数配置不能同时覆盖同一张卡；请拆分互补展示。')
 let options=library.options??{}
 if(!options||typeof options!=='object'||Array.isArray(options)||JSON.stringify(options).length>16000)throw Error('组件库配置无效或过长。')
 if(Array.isArray(options.symbols)){
  const symbols=options.symbols.map(symbol=>{
   const suffix=typeof symbol?.code==='string'&&/^(\d{6})\.(SH|SZ|BJ)$/iu.exec(symbol.code);
   if(!suffix||symbol.market&&symbol.market.toUpperCase?.()!==suffix[2].toUpperCase())return symbol;
   return {...symbol,code:suffix[1],market:suffix[2].toUpperCase()};
  });
  options={...options,symbols};
 }
 const requested=componentLibraryBuiltins().find(item=>item.id===library.id).widget
 const content=(panel.title??'')+' '+(panel.prompt??'')
 if(requested==='futures'){
  const clauses=String(originalRequest).split(/[。；;，,\n]/u)
  const forbidden=clauses.some(clause=>/禁止联网|不(?:要)?联网|只用附件|仅(?:用|基于)附件|离线生成/u.test(clause)||
   !/新闻|公告|资讯/u.test(clause)&&/(?:只能?|仅能?|必须|指定|限定).{0,18}(?:tushare|火山|通联|datapro|腾讯|新浪|豆包)/iu.test(clause)&&!/上期所|上海期货交易所/u.test(clause))
  if(forbidden||options.dataSource!==undefined&&options.dataSource!=='shfe')throw Error('此原生期货组件从上期所读取最新结算日报。请用用户指定的来源或附件交付所需视图。')
 }
 const quotesOnly=requested==='quote'||requested==='watchlist'&&
  /(?:盘中|实时).{0,8}报价|指数行情/u.test(content)&&
  !/自选|增删|联动/u.test(originalRequest);
 const indexCatalog=quotesOnly&&Array.isArray(options.symbols)&&options.symbols.length>1?financialIndexCatalog():[]
 const missingFinancialFields=requested==='quote'&&/市盈率|市净率|\bPE\b|\bPB\b|研发费用率|毛利率|净利率|营业收入|财务报表/iu.test(content)
 const aggregateQuote=indexCatalog.length&&!missingFinancialFields&&/指数/u.test(content)&&
  options.symbols.every(symbol=>indexCatalog.some(({symbol:index})=>index.code===symbol?.code&&index.market===symbol.market))&&
  !/K\s*线|蜡烛图|分时图|日线|周线|月线|复权|均线|\b(?:MA|MACD|VOL)\b/iu.test(content)&&
  (options.adjustment===undefined||options.adjustment==='none')&&!options.indicators?.length&&options.visibleBars===undefined&&options.selectedSymbol===undefined
 const widget=aggregateQuote?'indices':requested
 const seconds=/\b(\d+)\s*秒(?:钟)?(?:自动)?刷新/u.exec(originalRequest)?.[1];
 if(widget==='indices'&&seconds&&Number(seconds)%60===0&&Number(seconds)>=60&&Number(seconds)<=86400&&
    /自动刷新/u.test(content)&&!/(?:不要|禁止|不使用)自动刷新/u.test(originalRequest)){
  options={...options,refreshMinutes:Number(seconds)/60,refreshEnabled:true};
 }
 if(widget==='calendar'){
  if(Object.keys(options).length)throw Error('日历工具复用已有日历，不接受生成的事件或提醒；经济事件请使用数据日历卡。')
  return {...rest,type:'calendar-tool',artifact:{version:1,type:'calendar-tool',title:panel.title}}
 }
 const safeKeys=['title','symbols','query','period','adjustment','indicators','market','selectedSymbol','visibleBars','dataSource','refreshMinutes','refreshEnabled','directory']
 const defaults=financialWidgetDefaults(widget)
 const knownIndices=widget==='indices'&&(options.symbols===undefined||Array.isArray(options.symbols)&&!options.symbols.length)
  ? defaults.symbols.filter(symbol=>content.includes(symbol.name)) : []
 const preferTopicSearch=widget==='news'&&options.dataSource===undefined&&typeof options.query==='string'&&options.query.trim()&&
  /加密货币|数字资产|\bcrypto\b/iu.test(originalRequest)&&/实时|持续更新|\b(?:live|real.time)\b/iu.test(originalRequest)&&
  !/新浪|东方财富|通联|腾讯|豆包|彭博|路透|\b(?:sina|eastmoney|datayes|doubao|reuters|bloomberg|gdelt)\b|(?:仅|只).{0,8}(?:来源|使用|使用网页)|(?:数据源|来源).{0,8}(?:指定|限定)|禁止联网|不要联网|不联网/iu.test(originalRequest)
 const cryptoQuote=widget==='quote'&&options.symbols?.[0]?.market==='CRYPTO'
 const source=(widget==='news'?requestedNewsSource(originalRequest):undefined)??
  (preferTopicSearch?'doubao':cryptoQuote&&options.dataSource===undefined?'kraken':undefined)
 const spec=(options.title===undefined||typeof options.title==='string'&&options.title.length<=256)&&Object.keys(options).every(key=>safeKeys.includes(key))&&financialWidgetSpec({...defaults,symbols:[],...options,...(knownIndices.length?{symbols:knownIndices}:{}),...(source?{dataSource:source}:{}),title:panel.title})
 if(['news','announcements'].includes(widget)&&retrospectiveNewsRecords(panel,originalRequest)){
  const scope={query:options.query,symbols:options.symbols}
  const searchScope=scope.query||scope.symbols?.length?`\n沿用原检索主题与标的：${JSON.stringify(scope)}。`:''
  return {...rest,type:'market',prompt:`market.table；variant: table；${panel.prompt}${searchScope}`}
 }
 if(spec&&!missingFinancialFields)return {...rest,type:'financial-widget',artifact:spec}
 // Keep all authored requirements when the library cannot represent them.
 // A wrong market/unsupported indicator is not permission to substitute a ticker.
 const candle=/K\s*线|蜡烛图|candlestick/iu.test(content)
 return {...rest,type:['news','announcements'].includes(widget)?'news':candle?'chart':'table',prompt:(candle?'chart.candlestick；':'')+panel.prompt+'\n原生组件未覆盖以下展示配置，请依据原需求和真实数据选择呈现方式，保留字段、来源、标的与交互，不套原生字段或替换证券：'+JSON.stringify(options)}
}

export function validateWorkbenchLinks(value,panels,{ignoreUnsupported=false}={}){
 if(value===undefined)return undefined
 if(!Array.isArray(value)||value.length>panels.length)throw Error('节点联动配置无效。')
 const targets=new Set()
 const links=value.flatMap(link=>{
  if(!link||typeof link!=='object'||Object.keys(link).some(key=>!['sourcePanel','targetPanel'].includes(key)))throw Error('节点联动使用sourcePanel和targetPanel面板序号。')
  const {sourcePanel:s,targetPanel:t}=link
  const valid=Number.isInteger(s)&&Number.isInteger(t)&&s>=0&&t>=0&&s!==t&&s<panels.length&&t<panels.length;
  if(valid&&ignoreUnsupported&&panels[s].type!=='financial-widget'&&panels[t].type!=='financial-widget')return [];
  if(!valid||targets.has(t)||!financialCanLink(panels[s].artifact,panels[t].artifact))throw Error('节点联动需连接兼容的原生组件：自选→行情/新闻/公告，行情→新闻/公告；每个目标一个来源。不支持联动的数据卡应保留独立展示。')
  if(panels[t].artifact.linkedWatchlistId||panels[t].artifact.linkedSourceId)throw Error('节点联动请使用面板序号，不同时提供外部节点ID。')
  targets.add(t);return [{sourcePanel:s,targetPanel:t}]
 })
 return links.length||!ignoreUnsupported?links:undefined
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
// A single subject followed by reading/refresh actions describes a feed.
// Anything else (specified sources, time windows, additional jobs) stays with the planner.
export function simpleNewsBrief(request) {
 if (typeof request !== 'string' || request.length > 150) return null
 const parts=request.normalize('NFKC').trim().split(/[，,。.!！；;\n]+/u).map(part=>part.trim()).filter(Boolean)
 const match=/^(?:(?:请|帮我|给我|我想|我要|我|想|做|建|搭|弄|来|生成|一个|一张|个)\s*)*([\p{L}\d][\p{L}\d +.-]{0,24}?)(早报|晨报|晚报)(?:工作台|研究看板|看板)?$/u.exec(parts.shift() ?? '')
 if (!match || /和|与|以及|分别|同时|并|及|只|不要|禁止|附件|上周|昨天|本周|近\d|来源|来自|限定|按|根据|日报|研报|\band\b/iu.test(match[1])) return null
 const refresh=/^(?:每天|每日)(?:自动|自行|自己|定时)?更新$/u
 const reading=/^(?:(?:能|可|可以|支持)?(?:点|点开|点击)(?:新闻)?标题(?:能|可|可以)?(?:看|查看|阅读|打开)|(?:能|可|可以)?(?:打开|查看|阅读))(?:新闻)?原文$/u
 if (!parts.every(part=>refresh.test(part)||reading.test(part))) return null
 const topic=match[1].trim(),options={query:topic,dataSource:'doubao'}
 if (parts.some(part=>refresh.test(part))) Object.assign(options,{refreshEnabled:true,refreshMinutes:1440})
 return {title:topic+match[2],type:'news',prompt:'按发布时间阅读'+topic+'报道，可打开原文。',library:{id:'builtin-news',options}}
}

// Collapse inferred beats only when an existing feed already matches the
// whole request. Any remaining subject, source, count or layout stays authored.
export function consolidateDailyNewsFeeds(plan, request) {
 if (typeof request !== 'string' || request.length > 200 || plan.dataMode === 'simulated' ||
     plan.tabs?.length || plan.links?.length || plan.sharedDatasets?.length || !Array.isArray(plan.panels) || plan.panels.length < 2) return plan
 const brief=simpleNewsBrief(request)
 if (brief && plan.panels.some(panel=>panel?.library?.id==='builtin-news') &&
     plan.panels.every(panel=>['builtin-news','builtin-quote','builtin-watchlist','builtin-indices'].includes(panel?.library?.id) &&
       !panel.artifact && !panel.content && !panel.publicData && !panel.htmlFile)) return {...plan,panels:[brief]}
 const normalize = value => value.normalize('NFKC').toLowerCase().replace(/人工智能/gu, 'ai').replace(/\s+/gu, '')
 const text = normalize(request)
 if (!/新闻|资讯|要闻|news/u.test(text)) return plan
 const feeds=[]
 for (const panel of plan.panels) {
  if (panel?.library?.id !== 'builtin-news' || panel.artifact || panel.content || panel.publicData || panel.htmlFile ||
      typeof panel.library.options?.query !== 'string') return plan
  const {query,...settings}=panel.library.options
  if (feeds.length && !isDeepStrictEqual(settings,feeds[0].settings)) return plan
  feeds.push({topic:normalize(query),settings,panel})
 }
 const routine=/^(?:请|帮我|给我|我想|我|做|建|搭|弄|搞|一个|个|一张|工作台|研究看板|看板|日报|每天|每日|早上|平时|随时|扫一眼|看一眼|快速看|看看|浏览|跟踪|最新|的|新闻|资讯|要闻|please|make|create|build|me|an?|daily|scan|follow|latest|news|dashboard|[，,。.!！])*$/u
 const primary=feeds.find(({topic}) => topic && text.includes(topic) && routine.test(text.replace(topic,'')))
 return primary ? {...plan,panels:[primary.panel]} : plan
}
