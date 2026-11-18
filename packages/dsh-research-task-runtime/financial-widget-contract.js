// Shared with the trusted, serialized React canvas. No data-provider secrets or
// synthetic prices are stored in this spec. Data is fetched for this configuration.
import {financialIndexCatalog} from './financial-index-catalog.js'
import {validFuturesDirectory} from './futures-directory.js'
import {financialCryptoCodes,financialCryptoPeriods} from './financial-crypto-catalog.js'

export const FINANCIAL_WIDGET_GUIDANCE=[
 '明确创建组件库同款“行情面板”且未指定标的时，用financial-widget.quote和symbols:[]保留原生搜索、周期、指标及未选标的空态。indices用于明确指数需求。空响应显示缺失与配置/重试；来源、行情时点、获取时间与保存时间分别据实显示。',
 '真实行情和K线优先复用组件库内置行情面板（financial-widget.quote），保留MA/VOL/MACD、拖拽浏览、选中后滚轮缩放和默认每60秒自动刷新。工作台panel.type="financial-widget"，首次附artifact:{version:1,type:"financial-widget",widget:"quote",title:"标的行情",symbols:[{code:"已确认的代码",market:"SH|SZ|BJ|HK|US|CRYPTO",name:"标的名称"}]}，其余配置由宿主补默认值。',
 'BTC/USD、ETH/USD、SOL/USD使用market:"CRYPTO"、dataSource:"kraken"或明确选择的"bitfinex"，selectedSymbol格式为"CRYPTO:BTC/USD"。BTC、XBT、比特币等精确现货别名对应BTC/USD，不能替换为ETF。Kraken和Bitfinex支持1m/1h/1d/1w，使用adjustment:"none"。',
 '证券按实际来源选周期和复权。tushare与datapro限沪深北市场、1d/1w、不复权。备用行情只支持adjustment:"none"；明确要求的周期或复权需要选择支持该能力且已获准的数据源。可将行情标的联动到实时新闻列表，专题新闻可使用已配置的doubao来源。',
 '原生组件只配置标的、来源和显示选项，不填价格、OHLC数组或HTML，不启动逐卡模型。代码或市场尚未确认时先查当前数据工具，不猜股票代码，不用样例代替。模拟记录、指定历史快照、组合对比、未覆盖的币对或数据字段继续使用对应market/chart专业模板及实际来源数据。标准图表交结构化数据，由宿主动态绘图。'
].join('')

const equityPeriods=Object.freeze(['1m','1d','1w','1mo','1y'])
const dailyPeriods=Object.freeze(['1d','1w'])
const allAdjustments=Object.freeze(['none','forward','backward'])
const unadjusted=Object.freeze(['none'])
export const historyCapabilities=Object.freeze({
 default:Object.freeze({periods:equityPeriods,adjustments:allAdjustments}),
 backup:Object.freeze({periods:equityPeriods,adjustments:unadjusted}),
 kraken:Object.freeze({periods:financialCryptoPeriods,adjustments:unadjusted}),
 bitfinex:Object.freeze({periods:financialCryptoPeriods,adjustments:unadjusted}),
 tushare:Object.freeze({periods:dailyPeriods,adjustments:unadjusted}),
 datapro:Object.freeze({periods:dailyPeriods,adjustments:unadjusted})
})
export const financialCryptoSources=Object.freeze(['kraken','bitfinex'])
export const financialMainlandSources=Object.freeze(['tushare','datapro'])
export const financialNewsSources=Object.freeze(['sina','eastmoney','doubao'])
const periodRequests={
 '1m':/分时|分钟(?:K线|线|图|周期)|\b1m\b/iu,
 '1h':/小时(?:K线|K|线|图|周期)|\b1h\b/iu,
 '1mo':/月\s*(?:K|线)|\b1mo\b/iu,
 '1y':/年\s*(?:K|线)|\b1y\b/iu,
 '1w':/周\s*(?:K|线)|\b1w\b/iu
}
export function financialWidgetDefaults(widget){
 const titles={watchlist:'自选',quote:'行情面板',indices:'市场指数',futures:'期货期限结构',news:'新闻列表',announcements:'公告列表'}
 if(!titles[widget])return null
 return {version:1,type:'financial-widget',widget,title:titles[widget],symbols:widget==='indices'?[
  {code:'000300',market:'SH',name:'沪深300'},{code:'000001',market:'SH',name:'上证指数'},
  {code:'399001',market:'SZ',name:'深证成指'},{code:'399006',market:'SZ',name:'创业板指'},
  {code:'000688',market:'SH',name:'科创50'},{code:'000016',market:'SH',name:'上证50'}]:[],period:'1d',adjustment:'none',indicators:['MA','VOL','MACD'],market:'all',query:'',...(widget==='futures'?{dataSource:'shfe',refreshMinutes:60}:['quote','indices'].includes(widget)?{dataSource:'backup'}:{})}
}
// Adapter capability is a host fact. Planner-selected display options cannot
// turn a successfully mounted shell into an unsupported data request.
export function financialWidgetPlanSpec(value,request=''){
 const configured={...financialWidgetDefaults(value?.widget),...value}
 if(configured.widget==='quote'){
  if(value?.dataSource===undefined&&configured.symbols?.[0]?.market==='CRYPTO')configured.dataSource='kraken'
  const source=configured.dataSource??'default',capabilities=Object.hasOwn(historyCapabilities,source)?historyCapabilities[source]:null
  if(capabilities){
   const human=String(request).replace(/(?:不要|不需要|不使用|不得使用)\s*(?:前|后)复权/gu,'')
   const native=financialCryptoSources.includes(source)||financialMainlandSources.includes(source)
   if(native&&[...equityPeriods,'1h'].includes(configured.period)&&!capabilities.periods.includes(configured.period)){
    if(periodRequests[configured.period]?.test(human))throw Error('所选行情来源不支持所要求的图表周期。请选择有该能力且当前获准的数据源。')
    configured.period='1d'
   }
   if(allAdjustments.includes(configured.adjustment)&&!capabilities.adjustments.includes(configured.adjustment)){
    if(/前复权|后复权|\b(?:forward|backward|qfq|hfq)\b/iu.test(human)){
     throw Error((source==='backup'?'备用行情':'所选行情来源')+'不支持所要求的复权方式。请保留用户复权要求，选择有该能力且当前获准的数据源。')
    }
    configured.adjustment='none'
   }
  }
 }
 let spec=financialWidgetSpec(configured)
 if(!spec)return null
 if(spec.widget==='watchlist'){
  const clauses=[...String(request).matchAll(/(?:^|[，,。；;：:\n])\s*(?:请\s*)?(?:默认|初始)\s*(?:选中|选择|选|展示|显示)\s*[「“"']?([^，,。；;\n」”"']{1,80})/gu)];
  const matches=spec.symbols.filter(symbol=>clauses.some(([,target])=>{
   const text=target.trim();
   const code=text.match(/^(?:(SH|SZ|BJ|HK|US):)?([A-Z0-9^.-]+?)(?:\.(SH|SZ|BJ|HK|US))?(?=$|[^A-Z\d.^-])/iu);
   return text.startsWith(symbol.name)||code?.[2]?.toUpperCase()===symbol.code&&(!code[1]&&!code[3]||(code[1]??code[3]).toUpperCase()===symbol.market);
  }));
  if(matches.length===1)spec=financialWidgetSpec({...spec,selectedSymbol:`${matches[0].market}:${matches[0].code}`});
 }
 return spec
}

export function financialWidgetSpec(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','type','widget','title','symbols','period','adjustment','indicators','market','query','selectedSymbol','linkedWatchlistId','linkedSourceId','visibleBars','dataSource','refreshMinutes','refreshEnabled','directory'].includes(k)))return null
 if(value.directory!==undefined&&(value.widget!=='futures'||!validFuturesDirectory(value.directory)))return null
 if(value.version!==1||value.type!=='financial-widget'||!['watchlist','quote','indices','news','announcements','futures'].includes(value.widget)||typeof value.title!=='string'||!value.title.trim()||value.title.length>256)return null
 if(!Array.isArray(value.symbols)||value.symbols.length>(['quote','announcements'].includes(value.widget)?1:value.widget==='indices'?64:200))return null
 const ids=new Set()
 for(const s of value.symbols){
  if(!s||typeof s!=='object'||Object.keys(s).some(k=>!['code','market','name'].includes(k))||!['SH','SZ','BJ','HK','US','INDEX','CRYPTO'].includes(s.market)||typeof s.code!=='string'||typeof s.name!=='string'||!s.name.trim()||s.name.length>100||/[\u0000-\u001f]/.test(s.name))return null
  if(s.market==='CRYPTO'){
   if(!financialCryptoCodes.includes(s.code)||!['quote','news'].includes(value.widget))return null
  }else if(!/^[A-Z0-9.^-]{1,20}$/.test(s.code))return null
  if(s.market==='INDEX'&&(value.widget!=='indices'||!financialIndexCatalog().some(e=>e.symbol.code===s.code)))return null
  const id=s.market+':'+s.code;if(ids.has(id))return null;ids.add(id)
 }
 if(value.widget==='futures'&&(value.dataSource!=='shfe'||value.symbols.length)||value.dataSource==='shfe'&&value.widget!=='futures')return null
 const source=value.dataSource,cryptoSource=financialCryptoSources.includes(source),mainlandSource=financialMainlandSources.includes(source),quoteMarket=value.symbols[0]?.market
 if((cryptoSource||mainlandSource)&&value.widget!=='quote'||financialNewsSources.includes(source)&&value.widget!=='news')return null
 if(value.widget==='quote'&&quoteMarket&&((quoteMarket==='CRYPTO')!==cryptoSource||mainlandSource&&!['SH','SZ','BJ'].includes(quoteMarket)))return null
 const {periods,adjustments}=historyCapabilities[cryptoSource||mainlandSource?source:'default']
 if(!periods.includes(value.period)||!adjustments.includes(value.adjustment)||!Array.isArray(value.indicators)||new Set(value.indicators).size!==value.indicators.length||value.indicators.some(i=>!['MA','VOL','MACD'].includes(i))||!['all','SH','SZ','BJ','HK','US'].includes(value.market)||typeof value.query!=='string'||value.query.length>100||/[\u0000-\u001f]/.test(value.query))return null
 if(value.selectedSymbol!==undefined&&(!['watchlist','quote'].includes(value.widget)||typeof value.selectedSymbol!=='string'||!ids.has(value.selectedSymbol)))return null
 if(value.visibleBars!==undefined&&(value.widget!=='quote'||!Number.isInteger(value.visibleBars)||value.visibleBars<1||value.visibleBars>320))return null
 if(source!==undefined&&!['default','backup','shfe',...financialNewsSources,...financialCryptoSources,...financialMainlandSources].includes(source)||value.refreshMinutes!==undefined&&(!Number.isInteger(value.refreshMinutes)||value.refreshMinutes<0||value.refreshMinutes>10080)||value.refreshEnabled!==undefined&&typeof value.refreshEnabled!=='boolean')return null
 if(value.linkedWatchlistId!==undefined&&(value.widget!=='quote'||typeof value.linkedWatchlistId!=='string'||!value.linkedWatchlistId.trim()||value.linkedWatchlistId.length>200||/[\u0000-\u001f]/.test(value.linkedWatchlistId)))return null
 if(value.linkedSourceId!==undefined&&(!['news','announcements'].includes(value.widget)||typeof value.linkedSourceId!=='string'||!value.linkedSourceId.trim()||value.linkedSourceId.length>200||/[\u0000-\u001f]/.test(value.linkedSourceId)))return null
 return Object.freeze({...value,symbols:Object.freeze(value.symbols.map(s=>Object.freeze({...s}))),indicators:Object.freeze([...value.indicators])})
}
export function changeWatchlist(spec,action){
 if(spec.widget!=='watchlist')return spec
 const symbols=[...spec.symbols],next={...spec}
 if(action.op==='add'&&!symbols.some(s=>s.code===action.symbol?.code&&s.market===action.symbol?.market))symbols.unshift(action.symbol)
 else if(action.op==='remove'){const i=symbols.findIndex(s=>s.code===action.code&&s.market===action.market);if(i>=0){symbols.splice(i,1);if(next.selectedSymbol===action.market+':'+action.code){const replacement=symbols[Math.min(i,symbols.length-1)];if(replacement)next.selectedSymbol=replacement.market+':'+replacement.code;else delete next.selectedSymbol}}}
 else if(action.op==='move'&&Number.isInteger(action.from)&&Number.isInteger(action.to)&&action.from>=0&&action.to>=0&&action.from<symbols.length&&action.to<symbols.length){if(!next.selectedSymbol&&symbols[0])next.selectedSymbol=symbols[0].market+':'+symbols[0].code;symbols.splice(action.to,0,symbols.splice(action.from,1)[0])}
 else if(action.op==='select'&&symbols.some(s=>s.code===action.code&&s.market===action.market))next.selectedSymbol=action.market+':'+action.code
 return financialWidgetSpec({...next,symbols})??spec
}
export function financialSelectedSymbol(spec){
 return spec.symbols.find(s=>s.market+':'+s.code===spec.selectedSymbol)??spec.symbols[0]??null
}
export function financialLinkSourceId(spec){
 if(spec?.type==='research-study')return spec.linkedSourceId;
 return spec?.widget==='quote'?spec.linkedWatchlistId:['news','announcements'].includes(spec?.widget)?spec.linkedSourceId:undefined
}
export function financialCanLink(source,target){
 if(target?.type==='research-study'){if(['peers','news'].includes(target.studyRole))return false;if(['reader','analysis'].includes(target.studyRole))return source?.type==='research-study'&&source.studyRole==='directory';if(target.studyRole==='matrix')return source?.type==='research-study'&&source.studyRole==='valuation';return source?.type==='financial-widget'&&source.widget==='watchlist'}
 return source?.type==='financial-widget'&&target?.type==='financial-widget'&&(source.widget==='watchlist'&&['quote','news','announcements'].includes(target.widget)||source.widget==='quote'&&(target.widget==='news'||target.widget==='announcements'&&source.symbols?.[0]?.market!=='CRYPTO'))
}
export function financialNewsQuery(spec){
 return spec.linkedSourceId?(spec.symbols[0]?.name||spec.symbols[0]?.code||''):spec.query
}
// Synchronize in type order, not canvas order: watchlist -> quote -> feeds.
// Deletion detaches dependents; an empty upstream clears stale stock content.
export function synchronizeFinancialLinks(artifacts){
 const nodes=new Map(artifacts.map(n=>[n.id,n]))
 for(const widget of ['quote','news','announcements'])for(const node of artifacts){
  const spec=node.containerSpec,sourceId=financialLinkSourceId(spec);if(spec?.widget!==widget||!sourceId)continue
  const sourceNode=nodes.get(sourceId),source=sourceNode?.containerSpec,next={...spec}
  // A source reserved by the same workbench may finish after its dependent.
  if(!source&&['queued','running'].includes(sourceNode?.generationStatus))continue
  if(sourceId===node.id||!financialCanLink(source,spec)){
   if(widget==='news'){
    next.query=financialNewsQuery(spec)
    if(spec.symbols.some(symbol=>symbol.market==='CRYPTO'))next.symbols=[]
    delete next.linkedSourceId
   }else if(widget==='announcements'){
    if(source?.symbols?.[0]?.market==='CRYPTO')next.symbols=[]
    delete next.linkedSourceId
   }else delete next.linkedWatchlistId
  }else{
   const symbol=source.widget==='watchlist'?financialSelectedSymbol(source):source.symbols[0];
   next.symbols=symbol?[symbol]:[];
   if(widget==='quote'){
    if(symbol){
     next.selectedSymbol=symbol.market+':'+symbol.code
     if(financialCryptoSources.includes(next.dataSource)||financialMainlandSources.includes(next.dataSource)&&!['SH','SZ','BJ'].includes(symbol.market)){
      next.dataSource='backup';next.period='1d';next.adjustment='none'
     }
    }
    else delete next.selectedSymbol;
   }
  }
  if(JSON.stringify(spec)!==JSON.stringify(next)){
   const validated=financialWidgetSpec(next);
   if(validated)nodes.set(node.id,{...node,containerSpec:validated});
  }
 }
 return artifacts.map(node=>nodes.get(node.id))
}
// Rows leave 4px above and below the name/code pair. A short list does not reserve
// twelve empty rows; the header, controls, column header and source strip stay.
export function financialWidgetDimensions(spec,initial=false){
 if(spec?.widget==='watchlist')return {width:320,height:initial?600:130+36*Math.min(12,Math.max(2,spec.symbols?.length||0))}
 if(spec?.widget==='indices')return {width:980,height:Math.min(600,200+124*Math.max(0,Math.ceil((spec.symbols?.length||6)/6)-1))}
 return ({futures:{width:716,height:420},quote:{width:716,height:600},indices:{width:980,height:200},news:{width:620,height:340},announcements:{width:620,height:340}})[spec?.widget]
}
export function financialIndicators(bars){
 const values=bars.map(b=>b.close),sma=(values,n)=>values.map((v,i)=>i<n-1||values.slice(i-n+1,i+1).some(x=>!Number.isFinite(x))?null:values.slice(i-n+1,i+1).reduce((a,b)=>a+b,0)/n)
 const ema=(v,n)=>{let previous;return v.map(x=>{previous=previous===undefined?x:x*2/(n+1)+previous*(1-2/(n+1));return previous})}
 const fast=ema(values,12),slow=ema(values,26),dif=fast.map((x,i)=>x-slow[i]),dea=ema(dif,9)
 return {ma5:sma(values,5),ma10:sma(values,10),ma20:sma(values,20),ma30:sma(values,30),volume5:sma(bars.map(b=>b.volume),5),volume10:sma(bars.map(b=>b.volume),10),macd:dif.map((x,i)=>({dif:x,dea:dea[i],histogram:2*(x-dea[i])}))}
}

// Period boundaries use UTC trading dates; the header and chart share these bars.
export function financialPeriodBars(bars,period,nativePeriod=false){
 const grouped=[]
 for(const b of bars){let key=b.date;if(!nativePeriod&&period==='1w'){const d=new Date(b.date.slice(0,10)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));key=d.toISOString().slice(0,10)}else if(!nativePeriod&&period==='1mo')key=b.date.slice(0,7);else if(!nativePeriod&&period==='1y')key=b.date.slice(0,4)
 const previous=grouped.at(-1);if(previous?.key===key){previous.high=Math.max(previous.high,b.high);previous.low=Math.min(previous.low,b.low);previous.close=b.close;previous.volume=previous.volume===null||b.volume===null?null:previous.volume+b.volume;previous.date=b.date}else grouped.push({...b,key})}
 return grouped
}
