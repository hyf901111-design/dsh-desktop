import {randomUUID} from 'node:crypto'

type SymbolRef={code:string;market:string;name:string}
type Row=Record<string,any>
const num=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null
const first=(r:Row,keys:string[])=>keys.map(k=>r[k]).find(v=>v!==undefined&&v!==null)
const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-?\d{2}-?\d{2}/.test(v)?v.slice(0,10).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3'):null
export function normalizeFinancialBars(rows:Row[]){
 const seen=new Set<string>()
 return rows.flatMap(r=>{const d=date(first(r,['tradeDate','date','trade_date'])),open=num(first(r,['openPrice','openIndex','open'])),high=num(first(r,['highestPrice','highestIndex','highPrice','high'])),low=num(first(r,['lowestPrice','lowestIndex','lowPrice','low'])),close=num(first(r,['closePrice','closeIndex','close']))
 if(!d||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d||seen.has(d)||[open,high,low,close].some(v=>v===null||v<=0)||low!>Math.min(open!,close!)||high!<Math.max(open!,close!))return []
 seen.add(d);const v=num(first(r,['turnoverVol','volume']));return [{date:d,open:open!,high:high!,low:low!,close:close!,volume:v!==null&&v>=0?v:null}]
 }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-4000)
}
function unpack(value:any):any{
 if(typeof value==='string'){try{return JSON.parse(value.replace(/^```(?:json)?\s*|\s*```$/g,''))}catch{const at=value.indexOf('\n{\"provenance\"');if(at>=0){try{return JSON.parse(value.slice(at+1))}catch{}}return value}}
 if(value?.structuredContent)return unpack(value.structuredContent)
 if(Array.isArray(value?.content)){const t=value.content.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n');return unpack(t)}
 return value
}
function findRows(v:any):Row[]{
 v=unpack(v);if(Array.isArray(v))return v
 for(const key of ['data','result','records','items','hits','kline','feeds'])if(v?.[key]!==undefined){const rows=findRows(v[key]);if(rows.length)return rows}
 return []
}
export function parseFinancialApiDefinition(text:string):Row|null{
 const call=text.match(/^调用: (GET|POST) (https:\/\/[^\s]+)$/m),section=text.split(/【入参[^】]*】/)[1]?.split(/【出参[^】]*】/)[0];if(!call||!section)return null
 const parametersInput=section.split('\n').flatMap(line=>{const [name,,required,kind]=line.trim().split(' | ');if(!name||!required||!kind||!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)||!['必填','可选'].includes(required))return [];return [{name,required:required==='必填',location:kind.split('/')[0]}]});return {httpMethod:call[1],httpUrl:call[2],parametersInput}
}
function definition(value:any):Row|null{
 const v=unpack(value);if(typeof v==='string')return parseFinancialApiDefinition(v);if(v?.httpUrl&&v?.httpMethod)return v
 if(v&&typeof v==='object')for(const x of Object.values(v)){if(x&&typeof x==='object'){const found=definition(x);if(found)return found}}
 return null
}
type FinancialTransport={callTool:(name:string,args:Row,signal:AbortSignal)=>Promise<unknown>}|{request:(body:string,signal:AbortSignal)=>Promise<Response>}
export function createFinancialWidgetData(options:FinancialTransport&{identity:()=>string|null}){
 let sequence=0,owner:string|null=null
 const definitions=new Map<string,Row>(),pendingDefinitions=new Map<string,Promise<Row>>(),cache=new Map<string,{at:number;value:any}>()
 async function query(raw:any):Promise<any>{
  const account=options.identity();if(!account)throw Error('请先登录 EWork')
  if(owner!==account){owner=account;definitions.clear();pendingDefinitions.clear();cache.clear()}
  const q=raw as Row
  if(!q||!['search','quotes','history','news'].includes(q.action)||Object.keys(q).some(k=>!['action','query','symbols','period','adjustment','asset','refresh'].includes(k))||q.refresh!==undefined&&typeof q.refresh!=='boolean'||q.asset!==undefined&&!['index','stock'].includes(q.asset)||q.query!==undefined&&(typeof q.query!=='string'||q.query.length>100||/[\u0000-\u001f]/.test(q.query)))throw Error('金融组件请求参数无效')
  if(['quotes','history'].includes(q.action)&&(!Array.isArray(q.symbols)||q.symbols.length>200||q.symbols.some((s:any)=>!s||!['SH','SZ','BJ','HK','US'].includes(s.market)||typeof s.code!=='string'||!/^[A-Z0-9.^-]{1,20}$/.test(s.code))))throw Error('证券参数无效')
  if(q.action==='history'&&(q.symbols.length!==1||!['1m','1d','1w','1mo','1y'].includes(q.period)||!['none','forward','backward'].includes(q.adjustment)))throw Error('图表参数无效')
  if(q.action==='search'&&(!q.query?.trim()||q.query.length>100))return {symbols:[]}
  const signal=AbortSignal.timeout(55000),check=()=>{signal.throwIfAborted();if(options.identity()!==account)throw Error('账户已变化，取消旧行情请求')}
  const {refresh,...cachedQuery}=q,key=JSON.stringify(cachedQuery),prior=cache.get(key);if(!refresh&&prior&&Date.now()-prior.at<(q.action==='search'?300000:60000)){check();return structuredClone(prior.value)}
  const rpc=async(name:string,args:Row)=>{
   check();let result:any
   if('callTool' in options){result=await options.callTool(name,args,signal);check()}
   else{
    const id=++sequence,response=await options.request(JSON.stringify({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}}),signal);check()
    if(!response.ok){await response.body?.cancel();throw Error(response.status===401||response.status===403?'请登录 EWork 后刷新行情':'数据源暂不可用，请检查连接配置或稍后重试')}
    const text=await response.text();check();if(text.length>8*1024*1024)throw Error('数据过多，请缩小范围')
    const reply=JSON.parse(text)
    if(reply.id!==id||reply.error)throw Error('数据源未提供所需数据或接口权限，请稍后重试')
    result=reply.result
   }
   if(result?.isError){
    const diagnostic=(result.content??[]).filter((c:any)=>c.type==='text').map((c:any)=>String(c.text??'')).join('\n')
    if(/HTTP\s*402\b|额度|quota|credits?|payment required/i.test(diagnostic))throw Error('数据源暂不可用，请检查连接配置或稍后重试')
    throw Error('数据源未提供所需数据或接口权限，请稍后重试')
   }
   return unpack(result)
  }
  // Names are DataYes catalogue identifiers, never URLs supplied by the renderer.
  // Live definitions are required before every first use, and only GET definitions
  // on DataYes-owned origins with understood parameters can be executed.
  const api=async(nameEn:string,values:Row)=>{
   let def=definitions.get(nameEn)
   if(!def){let pending=pendingDefinitions.get(nameEn);if(!pending){pending=(async()=>{const found=definition(await rpc('get_api_info',{nameEn}));if(!found)throw Error('数据源暂未提供此市场接口');check();definitions.set(nameEn,found);return found})();pendingDefinitions.set(nameEn,pending)}try{def=await pending}finally{if(pendingDefinitions.get(nameEn)===pending)pendingDefinitions.delete(nameEn)}}
   check();const u=new URL(def.httpUrl)
   if(u.protocol!=='https:'||u.username||u.password||!['datayes.com','wmcloud.com'].some(h=>u.hostname===h||u.hostname.endsWith('.'+h))||!(['GET'].includes(String(def.httpMethod).toUpperCase())||nameEn==='intelligent_feed'&&def.httpMethod==='POST'))throw Error('此数据接口暂不支持固定组件')
   const params=def.parametersInput;if(!Array.isArray(params))throw Error('接口参数定义不可用')
   const url_params:Record<string,string>={},body:Row={}
   for(const p of params){const name=p.name??p.parameterName,location=String(p.location??'Query').toLowerCase();if(typeof name!=='string'||!['query','body'].includes(location))throw Error('此接口暂不支持固定组件')
    const value=values[name]
    if(value!==undefined&&value!==null)location==='body'?body[name]=value:url_params[name]=String(value)
    else if(p.required===true||p.isRequired===true)throw Error('此市场接口需要额外参数，暂不支持固定组件')
   }
   const response=await rpc('call_api',{nameEn,http_method:def.httpMethod,url:u.href,...(def.httpMethod==='GET'?{url_params}:{body})});if(typeof response==='string')throw Error(response.includes('截断')?'返回数据过多，请缩小搜索范围':'数据源未返回可解析的数据');return response
  }
  let result:any
  const payload=(v:any):any=>{v=unpack(v);for(let i=0;i<6;i++){if(v?.code!==undefined&&![0,1,200].includes(v.code)||v?.retCode!==undefined&&v.retCode!==1)throw Error('未取得有效数据，请检查数据源权限或稍后重试');if(v?.data===undefined)return v;v=unpack(v.data)}return v}
  const stamp=()=>new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}).replace(/[- :]/g,'')
  if(q.action==='search'){
   const keyword=q.query.trim(),exact=/^\d{5,6}$/.test(keyword),exchanges:Row={XSHG:'SH',XSHE:'SZ',XBEI:'BJ',XHKG:'HK'}
   const data=exact?await api(keyword.length===5?'getMktHKEqud':'market_snapshot',keyword.length===5?{ticker:keyword,beginDate:new Date(Date.now()-31*86400000).toISOString().slice(0,10).replaceAll('-',''),field:'ticker,secShortName,exchangeCD',pagenum:1,pagesize:3}:{ticker:keyword,type:'stock'}):await api('stock_search',{data_type:'1',query:keyword,topK:20}),symbols:SymbolRef[]=[],seen=new Set<string>()
   const rows=exact&&keyword.length===6?[payload(data)]:findRows(data)
   for(const r of rows){
    const code=String(r.entity_id??r.ticker??''),name=String(r.name??r.secShortName??''),exchange=exchanges[r.exchangeCD]
    // stock_search returns documented five-/six-digit trading codes. Do not
    // guess a market for unfamiliar codes. US results remain unsupported.
    const market=exchange??(/^\d{5}$/.test(code)?'HK':/^92\d{4}$/.test(code)?'BJ':/^[569]\d{5}$/.test(code)?'SH':/^[023]\d{5}$/.test(code)?'SZ':/^[48]\d{5}$/.test(code)?'BJ':null)
    if(!market||!code||!name||exact&&(code!==keyword||!exchange)||!exact&&/^\d+$/.test(keyword)&&!code.startsWith(keyword))continue;const id=market+':'+code;if(!seen.has(id)){seen.add(id);symbols.push({code,market,name})}
   }
   payload(data);result={symbols: symbols.slice(0,20),source:'通联 DataYes'}
  }else if(q.action==='news'){
   const end=stamp(),start=new Date(Date.now()-7*86400000).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'}).replace(/[- :]/g,'')
   const parameters={input:q.query?.trim()??'',onlyChannel:false,publishTimeStart:start,publishTimeEnd:end,pageNow:1}
   // The provider caps MCP response text. Fetch a useful reading list first;
   // retry a small page only when that cap prevents parsing the response.
   let value:any
   try{value=await api('intelligent_feed',{...parameters,pageSize:10})}catch(error){if(!(error instanceof Error)||!error.message.includes('数据过多'))throw error;value=await api('intelligent_feed',{...parameters,pageSize:3})}
   payload(value);const rows=findRows(value)
   result={news:rows.flatMap(r=>{if(typeof r.title!=='string'||!r.title)return [];let link:string|null=null;try{const u=new URL(r.redirect?.url);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)link=u.href}catch{}
    return [{id:String(r.mongoId??randomUUID()),title:r.title.slice(0,1000),source:String(r.channel??'通联精选资讯'),time:String(r.createTime??r.updateTime??''),url:link,summary:String(r.description??'').slice(0,4000)}]}).sort((a,b)=>(Date.parse(b.time)||0)-(Date.parse(a.time)||0)).slice(0,10),source:'通联 DataYes'}
  }else{
   const jobs:PromiseSettledResult<any>[]=[],loadSymbol=async(s:SymbolRef)=>{
    if(s.market==='US')throw Error('数据源暂未提供该美股行情接口')
    const index=q.asset==='index',end=stamp().slice(0,8)
    if(q.action==='history'){
     if(q.period==='1m')throw Error('当前图表接口暂不提供分钟行情')
     let value:any,unit='原始单位',nativePeriod=false
     if(['SH','SZ','BJ'].includes(s.market)){
      value=await api('market_HK',{ticker:s.code,time:({ '1d':'DAY','1w':'WEEK','1mo':'MONTH','1y':'YEAR'} as Row)[q.period],adjType:({none:0,forward:-1,backward:1} as Row)[q.adjustment],dateString:stamp(),flag:1,num:160});nativePeriod=true
     }else{
      const name=({none:'getMktHKEqud',forward:'getMktHKEqudAdjf',backward:'getMktHKequdAdjfAf'} as Row)[q.adjustment],begin=new Date(Date.now()-366*86400000)
      if(q.period==='1w'){begin.setUTCFullYear(begin.getUTCFullYear()-1);begin.setUTCDate(begin.getUTCDate()-((begin.getUTCDay()+6)%7))}
      if(q.period==='1mo'||q.period==='1y'){begin.setUTCFullYear(Number(end.slice(0,4))-(q.period==='1mo'?8:9),0,1)}
      const beginDate=begin.toISOString().slice(0,10).replaceAll('-',''),all:Row[]=[],seenPages=new Set<string>()
      for(let page=1;page<=40;page++){
       const response=await api(name,{ticker:s.code,beginDate,endDate:end,pagenum:page,pagesize:100,field:'ticker,exchangeCD,tradeDate,openPrice,highestPrice,lowestPrice,closePrice,preClosePrice,turnoverVol'});payload(response)
       const rows=findRows(response),fingerprint=JSON.stringify(rows.map(r=>[r.ticker,r.tradeDate]));if(rows.length&&seenPages.has(fingerprint))throw Error('此市场接口不支持完整周期查询，请选择日K');seenPages.add(fingerprint);all.push(...rows)
       if(rows.length<100)break;if(page===40)throw Error('此周期数据过多，请选择较短周期')
      }
      value=all;unit='股'
     }
     payload(value);const bars=normalizeFinancialBars(findRows(value).filter(r=>r.ticker===undefined||String(r.ticker)===s.code));if(!bars.length)throw Error('此周期暂无可用K线');return {symbol:s,bars,source:'通联 DataYes',basis:({none:'不复权',forward:'前复权',backward:'后复权'} as Row)[q.adjustment],volumeUnit:unit,nativePeriod}
    }
    if(index||s.market==='HK'){
     const value=await api(index?'getMktIdxd':'getMktHKEqud',{ticker:s.code,beginDate:new Date(Date.now()-60*86400000).toISOString().slice(0,10).replaceAll('-',''),endDate:end,pagenum:1,pagesize:60});payload(value);const rows=findRows(value).filter(r=>r.ticker===undefined||String(r.ticker)===s.code).sort((a,b)=>String(a.tradeDate).localeCompare(String(b.tradeDate))),r=rows.at(-1);if(!r)throw Error('暂无此证券行情')
     const price=num(index?r.closeIndex:r.closePrice),previous=num(index?r.preCloseIndex:r.preClosePrice);if(price===null||price<=0)throw Error('暂无可用价格');return {...s,price,priceChange:previous!==null?price!-previous:null,changePercent:previous!==null&&previous>0?(price/previous-1)*100:null,asOf:date(r.tradeDate),quality:'收盘行情',series:normalizeFinancialBars(rows).map(b=>b.close),source:'通联 DataYes'}
    }
    const value=await api('market_snapshot',{ticker:s.code,type:'stock'}),r=payload(value)
    if(String(r.ticker)!==s.code||r.exchangeCD&&({SH:'XSHG',SZ:'XSHE',BJ:'XBEI'} as Row)[s.market]!==r.exchangeCD||num(r.lastPrice)===null||num(r.lastPrice)!<=0)throw Error('暂无该证券可用行情')
    const price=num(r.lastPrice),previous=num(r.prevClosePrice),change=num(r.changePct)
    return {...s,price,priceChange:previous!==null?price!-previous:null,changePercent:change!==null?change*100:previous!==null&&previous>0?(price!/previous-1)*100:null,asOf:date(r.date),quality:String(r.status??'行情时效未确认'),source:'通联 DataYes'}
   }
   // Bounded provider concurrency avoids one MCP request per row at once.
   for(let i=0;i<q.symbols.length;i+=4){jobs.push(...await Promise.allSettled(q.symbols.slice(i,i+4).map(loadSymbol)));check()}
   const values=jobs.flatMap(j=>j.status==='fulfilled'?[j.value]:[]),errors=jobs.flatMap((j,i)=>j.status==='rejected'?[{...q.symbols[i],error:String(j.reason?.message??'数据暂缺')}]:[])
   result=q.action==='history'?{...values[0],bars:values[0]?.bars??[],error:errors[0]?.error}: {quotes:values,errors,source:'通联 DataYes'}
  }
  check();result.receivedAt=new Date().toISOString();cache.set(key,{at:Date.now(),value:result});if(cache.size>200)cache.delete(cache.keys().next().value!);return structuredClone(result)
 }
 return {query}
}
