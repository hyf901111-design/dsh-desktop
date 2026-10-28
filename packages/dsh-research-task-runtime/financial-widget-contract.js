// Shared with the trusted, serialized React canvas. No data-provider secrets or
// synthetic prices are stored in this spec. Data is fetched for this configuration.
import {financialIndexCatalog} from './financial-index-catalog.js'
export const FINANCIAL_WIDGET_GUIDANCE="明确创建组件库同款“行情面板”且未指定标的时，用financial-widget.quote和symbols:[]保留原生证券搜索、周期、指标及未选标的空态；不猜证券、不改成indices。indices用于明确指数需求，symbols:[]是合法未配置状态；空响应显示缺失与配置/重试，不记录虚假的获取成功。创建组件不等于行情获取成功，来源、行情时点、获取时间与保存时间分别据实显示。" + '真实证券行情和K线优先复用组件库的内置行情面板（financial-widget.quote），保留分时/日K/周K/月K/年K、MA/VOL/MACD、拖拽浏览、选中后滚轮缩放和每60秒自动刷新。工作台panel.type="financial-widget"，首次附artifact:{version:1,type:"financial-widget",widget:"quote",title:"标的行情",symbols:[{code:"已确认的证券代码",market:"SH|SZ|BJ|HK|US",name:"原证券名"}]}；其余配置由宿主补默认值。也可指定period:"1m|1d|1w|1mo|1y"、adjustment:"none|forward|backward"及indicators:["MA","VOL","MACD"]。只配置来源标的，不填价格、OHLC数组或HTML，不启动逐卡模型。仅用户或实际来源确认代码/市场后填symbols；已指定证券但代码或市场尚未确认时先查当前数据工具，不猜股票代码，不用贵州茅台等样例代替。模拟记录、指定历史快照、组合对比或当前内置组件未覆盖的加密资产等继续使用对应market/chart专业模板及实际来源数据；禁止把不支持的资产伪装成支持的证券。标准图表一律交结构化数据，由宿主动态绘图，不手写SVG、canvas布局或拉伸图中的文字。';
export function financialWidgetDefaults(widget){
 const titles={watchlist:'自选',quote:'行情面板',indices:'市场指数',news:'新闻列表',announcements:'公告列表'}
 if(!titles[widget])return null
 return {version:1,type:'financial-widget',widget,title:titles[widget],symbols:widget==='indices'?[
  {code:'000300',market:'SH',name:'沪深300'},{code:'000001',market:'SH',name:'上证指数'},
  {code:'399001',market:'SZ',name:'深证成指'},{code:'399006',market:'SZ',name:'创业板指'},
  {code:'000688',market:'SH',name:'科创50'},{code:'000016',market:'SH',name:'上证50'}]:[],period:'1d',adjustment:'none',indicators:['MA','VOL','MACD'],market:'all',query:''}
}
export function financialWidgetSpec(value){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['version','type','widget','title','symbols','period','adjustment','indicators','market','query','selectedSymbol','linkedWatchlistId','linkedSourceId','visibleBars','dataSource','refreshMinutes','refreshEnabled'].includes(k)))return null
 if(value.version!==1||value.type!=='financial-widget'||!['watchlist','quote','indices','news','announcements'].includes(value.widget)||typeof value.title!=='string'||!value.title.trim()||value.title.length>256)return null
 if(!Array.isArray(value.symbols)||value.symbols.length>(['quote','announcements'].includes(value.widget)?1:value.widget==='indices'?64:200))return null
 const ids=new Set()
 for(const s of value.symbols){
  if(!s||typeof s!=='object'||Object.keys(s).some(k=>!['code','market','name'].includes(k))||!['SH','SZ','BJ','HK','US','INDEX'].includes(s.market)||typeof s.code!=='string'||!/^[A-Z0-9.^-]{1,20}$/.test(s.code)||typeof s.name!=='string'||!s.name.trim()||s.name.length>100||/[\u0000-\u001f]/.test(s.name))return null
  if(s.market==='INDEX'&&(value.widget!=='indices'||!financialIndexCatalog().some(e=>e.symbol.code===s.code)))return null
  const id=s.market+':'+s.code;if(ids.has(id))return null;ids.add(id)
 }
 if(!['1m','1d','1w','1mo','1y'].includes(value.period)||!['none','forward','backward'].includes(value.adjustment)||!Array.isArray(value.indicators)||new Set(value.indicators).size!==value.indicators.length||value.indicators.some(i=>!['MA','VOL','MACD'].includes(i))||!['all','SH','SZ','BJ','HK','US'].includes(value.market)||typeof value.query!=='string'||value.query.length>100||/[\u0000-\u001f]/.test(value.query))return null
 if(value.selectedSymbol!==undefined&&(value.widget!=='watchlist'||typeof value.selectedSymbol!=='string'||!ids.has(value.selectedSymbol)))return null
 if(value.visibleBars!==undefined&&(value.widget!=='quote'||!Number.isInteger(value.visibleBars)||value.visibleBars<1||value.visibleBars>320))return null
 if(value.dataSource!==undefined&&!['default','backup'].includes(value.dataSource)||value.refreshMinutes!==undefined&&(!Number.isInteger(value.refreshMinutes)||value.refreshMinutes<0||value.refreshMinutes>10080)||value.refreshEnabled!==undefined&&typeof value.refreshEnabled!=='boolean')return null
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
 if(target?.type==='research-study'){if(['peers','news'].includes(target.role))return false;if(['reader','analysis'].includes(target.role))return source?.type==='research-study'&&source.role==='directory';if(target.role==='matrix')return source?.type==='research-study'&&source.role==='valuation';return source?.type==='financial-widget'&&source.widget==='watchlist'}
 return source?.type==='financial-widget'&&target?.type==='financial-widget'&&(source.widget==='watchlist'&&['quote','news','announcements'].includes(target.widget)||source.widget==='quote'&&['news','announcements'].includes(target.widget))
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
  const source=nodes.get(sourceId)?.containerSpec,next={...spec}
  if(sourceId===node.id||!financialCanLink(source,spec)){
   if(widget==='news'){next.query=financialNewsQuery(spec);delete next.linkedSourceId}else if(widget==='announcements')delete next.linkedSourceId;else delete next.linkedWatchlistId
  }else{const symbol=source.widget==='watchlist'?financialSelectedSymbol(source):source.symbols[0];next.symbols=symbol?[symbol]:[]}
  if(JSON.stringify(spec)!==JSON.stringify(next))nodes.set(node.id,{...node,containerSpec:financialWidgetSpec(next)})
 }
 return artifacts.map(node=>nodes.get(node.id))
}
// Rows leave 4px above and below the name/code pair. A short list does not reserve
// twelve empty rows; the header, controls, column header and source strip stay.
export function financialWidgetDimensions(spec,initial=false){
 if(spec?.widget==='watchlist')return {width:320,height:initial?600:130+36*Math.min(12,Math.max(2,spec.symbols?.length||0))}
 if(spec?.widget==='indices')return {width:980,height:Math.min(600,200+124*Math.max(0,Math.ceil((spec.symbols?.length||6)/6)-1))}
 return ({quote:{width:716,height:600},indices:{width:980,height:200},news:{width:620,height:340},announcements:{width:620,height:340}})[spec?.widget]
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
