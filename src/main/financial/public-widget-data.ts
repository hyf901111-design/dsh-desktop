import {networkFetch} from '../integrations/adapters/network-policy'
import {normalizeFinancialBars} from './widget-data'
import {financialIndexCatalog} from '../../../packages/dsh-research-task-runtime/financial-index-catalog.js'
import {parsePublicIndexChart} from './index-data'
import {queryBackupFinancialWidget} from './backup-widget-data'
import {queryShfeFutures} from './shfe-futures-data'
import {queryKrakenFinancialWidget} from './kraken-widget-data'
import {queryBitfinexFinancialWidget} from './bitfinex-widget-data'
import {financialCryptoPair,findFinancialCryptoSymbol} from '../../../packages/dsh-research-task-runtime/financial-crypto-catalog.js'
import {queryAccountFinancialWidget,type AccountFinancialSources} from './account-widget-data'

type Row=Record<string,any>
type SymbolRef={code:string;market:string;name:string}
const origins=['https://www.shfe.com.cn','https://api.kraken.com','https://api-pub.bitfinex.com','https://qt.gtimg.cn','https://hq.sinajs.cn','https://smartbox.gtimg.cn','https://web.ifzq.gtimg.cn','https://feed.mix.sina.com.cn','https://search-api-web.eastmoney.com','https://np-anotice-stock.eastmoney.com','https://query1.finance.yahoo.com','https://query2.finance.yahoo.com','https://quotes.sina.cn','https://push2.eastmoney.com','https://www.cninfo.com.cn']
const number=(value:unknown):number|null=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&value.trim()&&Number.isFinite(Number(value))?Number(value):null
const unavailable=()=>Error('公开数据源暂不可用，请稍后重试')
const tradingDate=(value:string)=>{
 const match=value.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/),day=match?match.slice(1).join('-'):''
 return day&&Number.isFinite(Date.parse(day))&&new Date(day).toISOString().slice(0,10)===day?day:null
}
const plain=(value:unknown)=>String(value??'').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '}[s]!)).trim()
const quoteCode=(code:string)=>code.replace(/\.(?:OQ|N)$/,'')
const symbolId=(s:SymbolRef)=>s.market.toLowerCase()+(s.market==='US'?quoteCode(s.code):s.code)
const validSymbol=(s:any)=>s&&typeof s.code==='string'&&(s.market==='CRYPTO'?Boolean(financialCryptoPair(s.code)):s.market==='INDEX'?financialIndexCatalog().some(e=>e.symbol.market==='INDEX'&&e.symbol.code===s.code):['SH','SZ','BJ','HK','US'].includes(s.market)&&(s.market==='US'?/^[A-Z][A-Z0-9.^-]{0,19}$/.test(s.code):new RegExp('^\\d{'+(s.market==='HK'?5:6)+'}$').test(s.code)))
const validQuery=(q:any)=>{
 if(!q||!['search','quotes','history','news','announcements','futures'].includes(q.action)||Object.keys(q).some(k=>!['action','query','symbols','period','adjustment','asset','refresh','source','includeCrypto'].includes(k))||q.source!==undefined&&!['default','backup','kraken','bitfinex','tushare','datapro','doubao','eastmoney','sina','shfe'].includes(q.source)||q.refresh!==undefined&&typeof q.refresh!=='boolean'||q.asset!==undefined&&!['index','stock'].includes(q.asset)||q.query!==undefined&&(typeof q.query!=='string'||q.query.length>100||/[\u0000-\u001f]/.test(q.query)))throw Error('金融组件请求参数无效')
 if(q.action==='futures'||q.source==='shfe'){
  if(q.action!=='futures'||q.source!=='shfe'||Object.keys(q).some(key=>!['action','source','refresh'].includes(key)))throw Error('期货日报请求参数无效')
 }
 if(q.includeCrypto!==undefined&&(q.action!=='search'||typeof q.includeCrypto!=='boolean'))throw Error('搜索参数无效')
 if(['quotes','history','announcements'].includes(q.action)&&(!Array.isArray(q.symbols)||q.symbols.length>200||q.symbols.some((s:any)=>!validSymbol(s))))throw Error('证券参数无效')
 if(q.symbols?.some((s:any)=>s.market==='INDEX')&&(q.action!=='quotes'||q.asset!=='index'))throw Error('指数请求参数无效')
 if(q.symbols?.some((s:any)=>s.market==='CRYPTO')&&(q.asset!==undefined||!['quotes','history'].includes(q.action)||q.symbols.some((s:any)=>s.market!=='CRYPTO')))throw Error('交易对请求参数无效')
 if(q.action==='announcements'&&q.symbols.length!==1)throw Error('公告证券参数无效')
 if(q.action==='history'&&(q.symbols.length!==1||!['1m','1h','1d','1w','1mo','1y'].includes(q.period)||q.period==='1h'&&q.symbols[0]?.market!=='CRYPTO'||!['none','forward','backward'].includes(q.adjustment)))throw Error('图表参数无效')
}
const safeLink=(value:unknown)=>{try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
function quoteTimestamp(value:string,market:string):string|null{
 const m=value.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})\s?(\d{2}):?(\d{2}):?(\d{2})$/)
 if(!m||!tradingDate(m.slice(1,4).join('-'))||Number(m[4])>23||Number(m[5])>59||Number(m[6])>59)return null
 const [year,month,day,hour,minute,second]=m.slice(1).map(Number)
 let offset=480
 if(market==='US'){
  const zone=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',timeZoneName:'shortOffset'}).formatToParts(new Date(Date.UTC(year!,month!-1,day!,12))).find(p=>p.type==='timeZoneName')?.value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/)
  if(!zone)return null;offset=(Number(zone[2])*60+Number(zone[3]??0))*(zone[1]==='-'?-1:1)
 }
 return new Date(Date.UTC(year!,month!-1,day!,hour!,minute!-offset,second!)).toISOString()
}

// Read-only public sources use fixed origins in the main process. They need no
// provider credentials, never execute returned scripts, and carry their own
// source and trading date rather than inheriting an MCP provenance label.
export function createPublicFinancialWidgetData(options:{identity:()=>string|null;fetch?:(input:string|URL,init?:RequestInit)=>Promise<Response>;accountSources?:AccountFinancialSources}){
 let owner:string|null=null
 const cache=new Map<string,{at:number;value:Row}>(),pending=new Map<string,Promise<Row>>()
 const fetcher=options.fetch??((url,init)=>networkFetch(url,init,{allowedOrigins:origins},{timeoutMs:12000}))
 async function query(raw:unknown):Promise<any>{
  validQuery(raw);const q=raw as Row
  const account=options.identity()
  if(!account&&['tushare','datapro','doubao'].includes(q.source))throw Error('请先登录 EWork')
  if(owner!==account){owner=account;cache.clear();pending.clear()}
  const check=()=>{if(options.identity()!==account)throw Error('账户已变化，取消旧行情请求')}
  const {refresh,...request}=q,key=JSON.stringify(request),previous=cache.get(key)
  if(!refresh&&previous&&Date.now()-previous.at<(q.action==='search'?300000:60000)){check();return structuredClone(previous.value)}
  if(pending.has(key)){const value=await pending.get(key)!;check();return structuredClone(value)}
  const work=(async()=>{
   const signal=AbortSignal.timeout(q.source==='datapro'?51000:25000)
   const get=async(url:URL|string,gbk=false,body?:URLSearchParams)=>{
    check();signal.throwIfAborted()
    let response:Response
    try{response=await fetcher(url,{method:body?'POST':'GET',...(body?{body,headers:{accept:'application/json, text/plain, */*','content-type':'application/x-www-form-urlencoded','user-agent':'EWork Odyssey','referer':'https://www.cninfo.com.cn/'}}:{headers:{accept:'application/json, text/plain, */*','user-agent':'EWork Odyssey','referer':new URL(url).hostname==='www.shfe.com.cn'?'https://www.shfe.com.cn/':new URL(url).hostname.includes('gtimg')?'https://gu.qq.com/':new URL(url).hostname.includes('eastmoney.com')?'https://data.eastmoney.com/':'https://finance.sina.com.cn/'}}),redirect:'error',signal})}catch{check();throw unavailable()}
    check();if(!response.ok){await response.body?.cancel();throw unavailable()}
    const reader=response.body?.getReader();if(!reader)throw unavailable()
    const chunks:Uint8Array[]=[];let size=0
    try{for(;;){check();signal.throwIfAborted();const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024)throw Error('返回数据过多，请缩小范围');chunks.push(value)}}catch(error){check();if(error instanceof Error&&error.message==='返回数据过多，请缩小范围')throw error;throw unavailable()}finally{await reader.cancel().catch(()=>{})}
    check();const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
    return new TextDecoder(gbk&&!/charset\s*=\s*utf-?8/i.test(response.headers.get('content-type')??'')?'gb18030':'utf-8').decode(bytes)
   }
   const json=async(url:URL|string,body?:URLSearchParams)=>{try{return JSON.parse(await get(url,false,body))}catch(error){check();if(error instanceof Error&&/暂不可用|数据过多/.test(error.message))throw error;throw Error('公开数据格式暂不可用，请稍后重试')}}
   const rawQuotes=async(symbols:SymbolRef[])=>{
    const rows=new Map<string,string[]>();let failure:unknown
    for(let i=0;i<symbols.length;i+=50){
     const url=new URL('https://qt.gtimg.cn/');url.searchParams.set('q',symbols.slice(i,i+50).map(symbolId).join(','))
     try{const text=await get(url,true);for(const match of text.matchAll(/(?:^|\n)\s*v_([A-Za-z0-9.^-]+)="([^"\r\n]*)"\s*;?/g))rows.set(match[1]!,match[2]!.split('~'))}catch(error){check();failure=error}
    }
    if(!rows.size&&failure)throw failure
    return rows
   }
   const parseQuote=(s:SymbolRef,fields:string[]|undefined)=>{
    if(!fields||!(s.market==='US'?(fields[2]===quoteCode(s.code)||fields[2]?.startsWith(quoteCode(s.code)+'.')):fields[2]===s.code))throw Error('暂无该证券可用行情')
    const price=number(fields[3]),asOf=tradingDate(fields[30]??'');if(price===null||price<=0||!asOf)throw Error('暂无该证券有效行情')
    return {...s,price,priceChange:number(fields[31]),changePercent:number(fields[32]),asOf,quotedAt:quoteTimestamp(fields[30]??'',s.market),quality:'公开报价 · 时效未确认',source:'腾讯财经'}
   }
   const sinaQuotes=async(symbols:SymbolRef[])=>{
    const rows=new Map<string,string[]>()
    for(let i=0;i<symbols.length;i+=50){
     // This endpoint treats an encoded comma as part of one ticker name.
     // Codes were validated above, so only safe fixed identifiers enter this URL.
     const url=new URL('https://hq.sinajs.cn/?list='+symbols.slice(i,i+50).map(symbolId).join(','))
     for(const match of (await get(url,true)).matchAll(/(?:^|\n)\s*var\s+hq_str_([a-z]+\d+)="([^"\r\n]*)"\s*;?/g))rows.set(match[1]!,match[2]!.split(','))
    }
    return rows
   }
   const parseSinaQuote=(s:SymbolRef,fields:string[]|undefined)=>{
    const price=number(fields?.[3]),previous=number(fields?.[2]),asOf=tradingDate(fields?.[30]??''),quotedAt=quoteTimestamp((fields?.[30]??'')+' '+(fields?.[31]??''),s.market)
    if(price===null||price<=0||!asOf||!quotedAt)throw Error('暂无该证券有效行情')
    const priceChange=previous!==null&&previous>0?price-previous:null
    return {...s,price,priceChange,changePercent:priceChange!==null?priceChange/previous!*100:null,asOf,quotedAt,source:'新浪财经',quality:'公开报价 · 时效未确认'}
   }
   const history=async(s:SymbolRef,period:string,adjustment:string)=>{
    let id=symbolId(s)
    if(s.market==='US'){
     const fields=(await rawQuotes([s])).get(id);parseQuote(s,fields)
     id='us'+fields![2]
    }
    if(period==='1m'){
     if(s.market==='US')throw Error('此市场暂不提供公开分时数据')
     const url=new URL('https://web.ifzq.gtimg.cn/appstock/app/minute/query');url.searchParams.set('code',id)
     const value=await json(url),data=value.data?.[id]?.data,day=tradingDate(String(data?.date??''))
     if(value.code!==0||!day||!Array.isArray(data.data))throw Error('暂无此证券分时数据')
     let cumulative=0,previousTime='';const bars=data.data.flatMap((line:unknown)=>{
      if(typeof line!=='string')return [];const [time='',p,v]=line.split(/\s+/),price=number(p),total=number(v)
      if(!/^\d{4}$/.test(time)||Number(time.slice(0,2))>23||Number(time.slice(2))>59||time<=previousTime||price===null||price<=0||total===null||total<cumulative)return []
      const volume=total-cumulative;cumulative=total;previousTime=time
      return [{date:day+'T'+time.slice(0,2)+':'+time.slice(2)+':00+08:00',open:price,high:price,low:price,close:price,volume}]
     })
     if(!bars.length)throw Error('暂无可用分时价格')
     return {symbol:s,bars,source:'腾讯财经',basis:'分时价格',volumeUnit:s.market==='HK'?'股':'手',nativePeriod:true}
    }
    const unit=period==='1w'?'week':['1mo','1y'].includes(period)?'month':'day',adj=({none:'',forward:'qfq',backward:'hfq'} as Row)[adjustment]
    const path=s.market==='US'&&adj?'usfqkline':s.market==='HK'&&adj?'hkfqkline':'fqkline',url=new URL('https://web.ifzq.gtimg.cn/appstock/app/'+path+'/get')
    url.searchParams.set('param',[id,unit,'','',320,adj].join(','))
    const value=await json(url),rows=value.data?.[id]?.[adj+unit]
    if(value.code!==0||!Array.isArray(rows))throw Error(adj?'该市场暂无所选复权数据':'暂无此证券K线')
    const bars=normalizeFinancialBars(rows.flatMap((row:unknown)=>Array.isArray(row)?[{date:row[0],open:row[1],close:row[2],high:row[3],low:row[4],volume:row[5]}]:[]))
    if(!bars.length)throw Error('此周期暂无有效K线')
    return {symbol:s,bars,source:'腾讯财经',basis:({none:'不复权',forward:'前复权',backward:'后复权'} as Row)[adjustment],volumeUnit:['HK','US'].includes(s.market)?'股':'手',nativePeriod:period!=='1y'}
   }
   let result:Row
   const cryptoSearch=q.action==='search'&&q.includeCrypto?findFinancialCryptoSymbol(q.query):undefined
   const cryptoQuote=q.symbols?.[0]?.market==='CRYPTO'
   if(q.action==='futures')result=await queryShfeFutures(json,check)
   else if(cryptoSearch)result={symbols:[cryptoSearch],source:'Kraken'}
   else if(['tushare','datapro','doubao'].includes(q.source))result=await queryAccountFinancialWidget(q,options.accountSources??{},signal)
   else if(cryptoQuote||['kraken','bitfinex'].includes(q.source)){
    if(!cryptoQuote||q.source&&!['default','backup','kraken','bitfinex'].includes(q.source))throw Error('此行情源只支持已登记的加密资产现货交易对')
    const provider=q.source==='bitfinex'?queryBitfinexFinancialWidget:queryKrakenFinancialWidget
    result=await provider(q,{json})
   }else if(['sina','eastmoney'].includes(q.source)&&q.action!=='news')throw Error('此数据源只支持新闻查询')
   else if(q.source==='backup'&&['quotes','history','announcements'].includes(q.action))result=await queryBackupFinancialWidget(q,{text:get,json,check,sinaQuotes,parseSinaQuote})
   else if(q.action==='quotes'){
    const values=new Map<string,Row>(),missing=new Map<string,Row>();let rows=new Map<string,string[]>(),primaryError:Error|undefined
    const domestic=q.symbols.filter((s:SymbolRef)=>s.market!=='INDEX'),global=q.symbols.filter((s:SymbolRef)=>s.market==='INDEX')
    try{if(domestic.length)rows=await rawQuotes(domestic)}catch(error){check();primaryError=error as Error}
    for(const s of domestic){try{values.set(symbolId(s),parseQuote(s,rows.get(symbolId(s))))}catch(error){missing.set(symbolId(s),{...s,error:(primaryError??error as Error).message})}}
    for(let i=0;i<global.length;i+=4)await Promise.all(global.slice(i,i+4).map(async(s:SymbolRef)=>{try{
     const url=new URL('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(s.code));url.searchParams.set('interval','1d');url.searchParams.set('range','3mo')
     const quote=parsePublicIndexChart(s,await json(url))
     if(quote.series.length<2&&s.code==='HSTECH.HK')try{quote.series=(await history({code:'HSTECH',market:'HK',name:s.name},'1d','none')).bars.slice(-60).map((b:Row)=>b.close);quote.seriesSource='腾讯财经'}catch{check()}
     values.set(symbolId(s),quote)
    }catch(error){check();missing.set(symbolId(s),{...s,error:(error as Error).message})}}))
    // Only absent/invalid mainland quotes use the backup. Never overwrite a
    // valid primary quote, or interpret this schema as a HK/US quote.
    const fallback=q.symbols.filter((s:SymbolRef)=>['SH','SZ'].includes(s.market)&&missing.has(symbolId(s)))
    if(fallback.length){try{const backup=await sinaQuotes(fallback);for(const s of fallback){try{values.set(symbolId(s),parseSinaQuote(s,backup.get(symbolId(s))));missing.delete(symbolId(s))}catch{check()}}}catch{check()}}
    const quotes:Row[]=q.symbols.flatMap((s:SymbolRef)=>values.has(symbolId(s))?[values.get(symbolId(s))!]:[])
    if(q.asset==='index'){const native=quotes.filter(p=>p.market!=='INDEX');for(let i=0;i<native.length;i+=4)await Promise.all(native.slice(i,i+4).map(async quote=>{try{quote.series=(await history(quote as SymbolRef,'1d','none')).bars.slice(-60).map((b:Row)=>b.close)}catch{check();quote.series=[]}}))}
    result={quotes,errors:[...missing.values()],source:[...new Set(quotes.map(p=>p.source))].join(' / ')||'腾讯财经'}
   }else if(q.action==='history'){
    try{result=await history(q.symbols[0],q.period,q.adjustment)}catch(error){check();result={bars:[],error:(error as Error).message,source:'腾讯财经'}}
   }else if(q.action==='search'){
    if(!q.query?.trim())result={symbols:[],source:'腾讯财经'}
    else{
     const url=new URL('https://smartbox.gtimg.cn/s3/');url.searchParams.set('v','2');url.searchParams.set('q',q.query.trim());url.searchParams.set('t','all')
     const text=(await get(url,true)).trim(),match=text.match(/^v_hint="([^"\r\n]*)";?$/)
     if(!match)throw Error('公开搜索数据暂不可用')
     let content:string;try{content=JSON.parse('"'+match[1]+'"')}catch{throw Error('搜索数据格式暂不可用')}
     const symbols:SymbolRef[]=[],seen=new Set<string>()
     for(const entry of content.split('^')){
      const [market='',rawCode='',rawName]=entry.split('~'),code=rawCode.toUpperCase(),s={market:market.toUpperCase(),code:market==='us'?quoteCode(code):code,name:plain(rawName).slice(0,100)}
      if(!validSymbol(s)||!s.name||seen.has(symbolId(s)))continue;seen.add(symbolId(s));symbols.push(s)
     }
     result={symbols:symbols.slice(0,20),source:'腾讯财经'}
    }
   }else if(q.action==='announcements'){
    const symbol:SymbolRef=q.symbols[0],code=symbol.market==='US'?quoteCode(symbol.code):symbol.code,kind=symbol.market==='HK'?'H':symbol.market==='US'?'U':'A',tag=({SH:'SHA',SZ:'SZA',BJ:'BJA',HK:'H',US:'U'} as Row)[symbol.market]
    const url=new URL('https://np-anotice-stock.eastmoney.com/api/security/ann')
    for(const [key,value] of Object.entries({page_size:'30',page_index:'1',ann_type:kind,stock_list:code,sr:'-1'}))url.searchParams.set(key,value)
    const value=await json(url)
    if(value.success!==1||!Array.isArray(value.data?.list))throw unavailable()
    const seen=new Set<string>()
    result={source:'东方财富',announcements:value.data.list.flatMap((r:Row)=>{
     // A stock code is not an identity on its own: SH000001 is an index,
     // SZ000001 is a company. Match the upstream exchange tag as well.
     if(!Array.isArray(r.codes)||!r.codes.some((s:Row)=>s.stock_code===code&&String(s.ann_type).split(',').includes(tag)))return []
     const id=String(r.art_code??''),title=plain(r.title_ch||r.title||r.title_en),day=tradingDate(String(r.notice_date??''))
     if(!/^AN\d{14,24}$/.test(id)||!title||!day||seen.has(id))return [];seen.add(id)
     return [{id,title:title.slice(0,1000),date:day,category:Array.isArray(r.columns)?r.columns.map((c:Row)=>plain(c.column_name)).filter(Boolean).join(' · ').slice(0,120):'',url:'https://data.eastmoney.com/notices/detail/'+code+'/'+id+'.html'}]
    }).sort((a:Row,b:Row)=>b.date.localeCompare(a.date)).slice(0,30)}
   }else if(q.source==='eastmoney'||q.source!=='sina'&&(q.source==='backup'?!q.query?.trim():q.query?.trim())){
    const url=new URL('https://search-api-web.eastmoney.com/search/jsonp');url.searchParams.set('cb','ework');url.searchParams.set('param',JSON.stringify({uid:'',keyword:q.query?.trim()||'财经',type:['cmsArticle'],client:'web',clientType:'web',clientVersion:'curr',param:{cmsArticle:{searchScope:'default',sort:'latest',pageIndex:1,pageSize:20,preTag:'',postTag:''}}}))
    const text=(await get(url)).trim(),match=text.match(/^ework\(([\s\S]*)\);?$/);let value:Row
    try{value=JSON.parse(match?.[1]??'')}catch{throw Error('新闻搜索数据暂不可用')}
    if(value.code!==0||!Array.isArray(value.result?.cmsArticle))throw unavailable()
    result={source:'东方财富',news:value.result.cmsArticle.flatMap((r:Row)=>{
     const title=plain(r.title),day=tradingDate(String(r.date??'')),time=day&&/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(r.date)?r.date.replace(' ','T')+'+08:00':null,url=safeLink(r.url)||(/^\d{14,24}$/.test(String(r.code))?'https://finance.eastmoney.com/a/'+r.code+'.html':null)
     return title&&time?[{id:String(r.code),title:title.slice(0,1000),source:plain(r.mediaName)||'东方财富',time,url,summary:plain(r.content).slice(0,1000)}]:[]
    })}
   }else{
    const url=new URL('https://feed.mix.sina.com.cn/api/roll/get');for(const [k,v] of Object.entries({pageid:'384',lid:'2519',num:'30',page:'1'}))url.searchParams.set(k,v)
    const value=await json(url);if(value.result?.status?.code!==0||!Array.isArray(value.result.data))throw unavailable()
    result={source:'新浪财经',news:value.result.data.flatMap((r:Row)=>{
     const title=plain(r.title),seconds=number(r.ctime),url=safeLink(r.url)
     const terms=['backup','sina'].includes(q.source)?q.query?.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean):null,matched=!terms?.length||terms.some((term:string)=>(title+' '+plain(r.summary)).toLocaleLowerCase().includes(term))
     return matched&&title&&seconds!==null&&seconds>=946656000&&seconds<4102416000&&url?[{id:String(r.docid??url),title:title.slice(0,1000),source:plain(r.media_name)||'新浪财经',time:new Date(seconds*1000).toISOString(),url,summary:plain(r.summary).slice(0,1000)}]:[]
    })}
   }
   if(result.news){const seen=new Set<string>();result.news=result.news.sort((a:Row,b:Row)=>(Date.parse(b.time)||0)-(Date.parse(a.time)||0)).filter((n:Row)=>{if(seen.has(n.id))return false;seen.add(n.id);return true}).slice(0,20)}
   check();result.receivedAt=new Date().toISOString()
   if(!result.error&&(!result.errors?.length||result.quotes?.length)){cache.set(key,{at:Date.now(),value:result});if(cache.size>200)cache.delete(cache.keys().next().value!)}
   return result
  })()
  pending.set(key,work)
  try{const result=await work;check();return structuredClone(result)}finally{if(pending.get(key)===work)pending.delete(key)}
 }
 return {query}
}
