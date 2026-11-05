import {normalizeFinancialBars} from './widget-data'
import {parsePublicIndexChart} from './index-data'

type Row=Record<string,any>
type SymbolRef={code:string;market:string;name:string}
type BackupIO={text:(url:URL|string,gbk?:boolean,body?:URLSearchParams)=>Promise<string>;json:(url:URL|string,body?:URLSearchParams)=>Promise<Row>;check:()=>void;sinaQuotes:(symbols:SymbolRef[])=>Promise<Map<string,string[]>>;parseSinaQuote:(s:SymbolRef,fields:string[]|undefined)=>Row}
const num=(v:unknown):number|null=>(typeof v==='number'||typeof v==='string'&&v.trim()!=='')&&Number.isFinite(Number(v))?Number(v):null
const plain=(v:unknown)=>String(v??'').replace(/<[^>]*>/g,'').trim()
const mainland=(s:SymbolRef)=>['SH','SZ','BJ'].includes(s.market)
const key=(s:SymbolRef)=>s.market.toLowerCase()+s.code
// Identifiers checked against Eastmoney's public global-index catalogue. NDX
// is its Nasdaq Composite; NDX100 is Nasdaq 100. They are not interchangeable.
const globalCodes:Record<string,[string,string]>={
 '^HSI':['HSI','Asia/Hong_Kong'],'^HSCE':['HSCEI','Asia/Hong_Kong'],
 '^DJI':['DJIA','America/New_York'],'^GSPC':['SPX','America/New_York'],'^IXIC':['NDX','America/New_York'],'^NDX':['NDX100','America/New_York'],
 '^N225':['N225','Asia/Tokyo'],'^KS11':['KS11','Asia/Seoul'],'^TWII':['TWII','Asia/Taipei'],'^STI':['STI','Asia/Singapore'],
 '^AXJO':['AS51','Australia/Sydney'],'^BSESN':['SENSEX','Asia/Kolkata'],'^FTSE':['FTSE','Europe/London'],'^GDAXI':['GDAXI','Europe/Berlin'],
 '^FCHI':['FCHI','Europe/Paris'],'^STOXX50E':['SX5E','Europe/Berlin'],'^GSPTSE':['TSX','America/Toronto'],'^BVSP':['BVSP','America/Sao_Paulo']
}
const dateAt=(seconds:number,zone:string)=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(seconds*1000))
const yahooCode=(s:SymbolRef)=>s.market==='HK'?s.code.replace(/^0+/,'').padStart(4,'0')+'.HK':s.code.replace(/\.(?:OQ|N)$/,'')

async function yahoo(s:SymbolRef,io:BackupIO,period='1d',range='3mo'){
 const code=yahooCode(s),url=new URL('https://query2.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(code))
 url.searchParams.set('interval',period);url.searchParams.set('range',range)
 const response=await io.json(url);io.check()
 const quote=parsePublicIndexChart({...s,code},response),chart=response.chart.result[0]
 return {quote:{...quote,...s} as Row,chart}
}
async function history(s:SymbolRef,q:Row,io:BackupIO):Promise<Row>{
 if(q.adjustment!=='none')throw Error('备用行情暂不支持所选复权方式，请选择不复权或默认数据源')
 if(mainland(s)){
  const url=new URL('https://quotes.sina.cn/cn/api/jsonp_v2.php/var%20_=/CN_MarketDataService.getKLineData')
  url.searchParams.set('symbol',key(s));url.searchParams.set('scale',q.period==='1m'?'1':'240');url.searchParams.set('ma','no');url.searchParams.set('datalen',['1m','1d'].includes(q.period)?'320':'1023')
  const text=(await io.text(url)).trim(),match=text.match(/^(?:\/\*[\s\S]{0,512}?\*\/\s*)?var _=\(([\s\S]*)\);?$/)
  let rows:Row[];try{rows=JSON.parse(match?.[1]??'')}catch{throw Error('备用K线数据格式不可用')}
  if(!Array.isArray(rows))throw Error('备用K线数据格式不可用')
  let bars:Row[]
  if(q.period==='1m'){
   const seen=new Set<string>()
   bars=rows.flatMap(row=>{
    if(!row||typeof row.day!=='string'||!/^\d{4}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(row.day))return []
    const normalized=normalizeFinancialBars([{...row,date:row.day.slice(0,10)}])[0],date=row.day.replace(' ','T')+'+08:00'
    if(!normalized||seen.has(date))return [];seen.add(date);return [{...normalized,date}]
   }).sort((a,b)=>a.date.localeCompare(b.date))
   const day=bars.at(-1)?.date.slice(0,10);bars=bars.filter(b=>b.date.startsWith(day)).slice(-320)
  }else bars=normalizeFinancialBars(rows.map(row=>({...row,date:row.day})))
  if(!bars.length)throw Error('备用源暂无此证券有效K线')
  return {symbol:s,bars,source:'新浪财经',basis:q.period==='1m'?'分时价格':'不复权',volumeUnit:'股',nativePeriod:q.period==='1m'}
 }
 const {chart}=await yahoo(s,io,q.period==='1m'?'1m':'1d',q.period==='1m'?'1d':['1mo','1y'].includes(q.period)?'10y':'2y')
 const raw=chart.indicators?.quote?.[0],times=chart.timestamp,zone=chart.meta.exchangeTimezoneName
 if(!raw||!Array.isArray(times))throw Error('备用源暂无此证券有效K线')
 const rows=times.flatMap((stamp:any,i:number)=>{
  if(!Number.isFinite(stamp)||stamp<=0)return []
  const date=q.period==='1m'?new Date(stamp*1000).toISOString():dateAt(stamp,zone)
  const bar={date,open:num(raw.open?.[i]),high:num(raw.high?.[i]),low:num(raw.low?.[i]),close:num(raw.close?.[i]),volume:num(raw.volume?.[i])}
  if([bar.open,bar.high,bar.low,bar.close].some(v=>v===null||v<=0)||bar.low!>Math.min(bar.open!,bar.close!)||bar.high!<Math.max(bar.open!,bar.close!))return []
  return [bar]
 })
 const seen=new Set<string>(),bars=rows.filter((r:Row)=>{if(seen.has(r.date))return false;seen.add(r.date);return true}).sort((a:Row,b:Row)=>a.date.localeCompare(b.date)).slice(-4000)
 if(!bars.length)throw Error('备用源暂无此证券有效K线')
 return {symbol:s,bars,source:'Yahoo Finance',basis:'来源价格口径',volumeUnit:'股',nativePeriod:q.period==='1m'}
}

async function announcements(s:SymbolRef,io:BackupIO):Promise<Row>{
 if(!['SH','SZ','BJ','HK'].includes(s.market))throw Error('巨潮备用公告暂不支持该市场，请使用默认数据源')
 const search=await io.json('https://www.cninfo.com.cn/new/information/topSearch/query',new URLSearchParams({keyWord:s.code,maxNum:'30'}))
 if(!Array.isArray(search))throw Error('备用公告证券查询不可用')
 const market=s.code.startsWith('6')||s.code.startsWith('5')||s.code.startsWith('9')&&!s.code.startsWith('92')?'SH':/^(?:4|8|92)/.test(s.code)?'BJ':'SZ'
 const found=search.find((r:Row)=>r.code===s.code&&r.category===(s.market==='HK'?'港股':'A股')&&(s.market==='HK'||market===s.market)&&typeof r.orgId==='string'&&/^[\w-]{1,80}$/.test(r.orgId))
 if(!found)throw Error('巨潮备用源未找到该市场的证券')
 const response=await io.json('https://www.cninfo.com.cn/new/hisAnnouncement/query',new URLSearchParams({stock:s.code+','+found.orgId,tabName:'fulltext',pageSize:'30',pageNum:'1',column:({SH:'sse',SZ:'szse',BJ:'bse',HK:'hke'} as Row)[s.market],plate:'',isHLtitle:'false',sortName:'time',sortType:'desc'}))
 if(!Array.isArray(response.announcements))throw Error('备用公告数据暂不可用')
 const seen=new Set<string>()
 return {source:'巨潮资讯',announcements:response.announcements.flatMap((r:Row)=>{
  const id=String(r.announcementId??''),title=plain(r.announcementTitle),stamp=num(r.announcementTime),path=String(r.adjunctUrl??'')
  if(r.secCode!==s.code||r.orgId!==found.orgId||!/^\d{6,20}$/.test(id)||!title||stamp===null||stamp<946656000000||stamp>=4102416000000||!new RegExp('^finalpage/\\d{4}-\\d{2}-\\d{2}/'+id+'\\.(?:PDF|pdf)$').test(path)||seen.has(id))return []
  seen.add(id);return [{id,title:title.slice(0,1000),date:dateAt(stamp/1000,'Asia/Shanghai'),category:plain(r.announcementTypeName).slice(0,120),url:'https://static.cninfo.com.cn/'+path}]
 }).sort((a:Row,b:Row)=>b.date.localeCompare(a.date)).slice(0,30)}
}

export async function queryBackupFinancialWidget(q:Row,io:BackupIO):Promise<Row>{
 if(q.action==='announcements')return announcements(q.symbols[0],io)
 if(q.action==='history')try{return await history(q.symbols[0],q,io)}catch(error){io.check();return {bars:[],source:mainland(q.symbols[0])?'新浪财经':'Yahoo Finance',error:(error as Error).message}}
 const native=q.symbols.filter(mainland),quotes=new Map<string,Row>(),errors=new Map<string,Row>();let sina=new Map<string,string[]>(),globals:Row[]=[]
 try{if(native.length)sina=await io.sinaQuotes(native)}catch{io.check()}
 if(q.symbols.some((s:SymbolRef)=>s.market==='INDEX'&&globalCodes[s.code]))try{
  const url=new URL('https://push2.eastmoney.com/api/qt/clist/get');for(const [k,v]of Object.entries({fs:'m:100',fields:'f2,f3,f4,f12,f13,f14,f18,f124',pz:'100',pn:'1',fltt:'2',invt:'2'}))url.searchParams.set(k,v)
  const result=await io.json(url);globals=Array.isArray(result.data?.diff)?result.data.diff:Object.values(result.data?.diff??{})
 }catch{io.check()}
 const load=async(s:SymbolRef)=>{try{
  let row:Row
  if(mainland(s)){
   row=io.parseSinaQuote(s,sina.get(key(s)))
   if(q.asset==='index')try{row.series=(await history(s,{period:'1d',adjustment:'none'},io)).bars.slice(-60).map((b:Row)=>b.close);if(row.series.length<2)throw Error('暂无有效走势')}catch(error){io.check();row.series=[];row.seriesError='走势更新失败：'+(error as Error).message}
  }else if(s.market==='INDEX'&&globalCodes[s.code]){
   const [code,zone]=globalCodes[s.code]!,r=globals.find(r=>r.f12===code&&r.f13===100),price=num(r?.f2),stamp=num(r?.f124)
   if(!r||price===null||price<=0||stamp===null||stamp<946656000||stamp>=4102416000){
    // The public catalogue can omit a market. Reuse the validated chart quote
    // and keep its actual provider and exchange timestamp instead of a blank.
    row=(await yahoo(s,io)).quote
   }else{
    row={...s,price,priceChange:num(r.f4),changePercent:num(r.f3),quotedAt:new Date(stamp*1000).toISOString(),asOf:dateAt(stamp,zone),timeZone:zone,source:'东方财富',quality:'公开报价 · 时效未确认',series:[]}
    try{row.series=(await yahoo(s,io)).quote.series;if(row.series.length<2)throw Error('暂无有效走势');row.seriesSource='Yahoo Finance'}catch(error){io.check();row.series=[];row.seriesError='走势更新失败：'+(error as Error).message}
   }
  }else row=(await yahoo(s,io)).quote
  if(q.asset==='index'&&!(row.series?.length>1)&&!row.seriesError)row.seriesError='走势更新失败：暂无有效走势'
  if(row.seriesError)errors.set(key(s),{...s,error:row.seriesError})
  quotes.set(key(s),row)
 }catch(error){io.check();errors.set(key(s),{...s,error:(error as Error).message})}}
 for(let i=0;i<q.symbols.length;i+=4)await Promise.all(q.symbols.slice(i,i+4).map(load))
 const rows=q.symbols.flatMap((s:SymbolRef)=>quotes.has(key(s))?[quotes.get(key(s))!]:[])
 return {quotes:rows,errors:[...errors.values()],source:[...new Set(rows.map((r:Row)=>r.source))].join(' / ')||'备用行情'}
}
