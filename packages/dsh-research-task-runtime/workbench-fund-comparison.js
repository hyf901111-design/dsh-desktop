import {randomUUID} from 'node:crypto'
import {reduceSourceValues} from './component-derived-values.js'

export const FUND_CATALOG_URL='https://fund.eastmoney.com/js/fundcode_search.js'
const BASIC_URL='https://tushare.pro/document/2?doc_id=19'
const NAV_URL='https://tushare.pro/document/2?doc_id=119'
const readCapability=Symbol.for('ework.builtin-tushare.read')
const activeReads=new Map()
const day=86400000
const compact=d=>d.toISOString().slice(0,10).replaceAll('-','')
const iso=s=>s.replace(/^(\d{4})(\d{2})(\d{2})$/u,'$1-$2-$3')
const utc=s=>Date.parse(iso(s)+'T00:00:00Z')
const validDate=s=>typeof s==='string'&&/^\d{8}$/u.test(s)&&Number.isFinite(utc(s))&&compact(new Date(utc(s)))===s
const finitePositive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0
const text=(value,max=128)=>typeof value==='string'&&value.trim()&&value.length<=max&&!/[<>\u0000-\u001f]/u.test(value)?value.trim():null
const fundCode=s=>typeof s==='string'&&/^\d{6}$/u.test(s)

export function fundComparisonCount(request){
 if(typeof request!=='string'||!/(?:纯债基金|纯债型基金)/u.test(request)||!/(?:比较|对比)/u.test(request)||!/中长期/u.test(request)||
    !/近一年收益/u.test(request)||!/近半年最大回撤/u.test(request)||!request.includes('年化波动率')||!request.includes('最新净值')||!request.includes('规模')||!request.includes('管理人')||
    /模拟|演示|附件|禁止联网|不(?:要|用|能|得)联网|离线|(?:只|仅)(?:用|使用|依赖)|指定|Tushare|天天基金|东方财富|通联|Wind|Choice|财汇|聚源|MCP|每.{0,8}刷新|实时|自动更新|额外|页签|\d{6}|\d+\s*张|不含|排除|优先|重点/iu.test(request))return null
 const count=Number(request.match(/至少\s*(?:比较|对比)?\s*(\d+)\s*只/u)?.[1])
 return Number.isSafeInteger(count)&&count>=3&&count<=12?count:null
}

export function fundComparisonReader(ctx,agent){
 if(typeof ctx.tools?.execute!=='function'||typeof ctx.tools?.get!=='function')return null
 const names=ctx.tools.schemas?.(agent)?.map(tool=>tool.name)??[]
 if(!names.includes('public_data_query'))return null
 const name=names.find(n=>ctx.tools.get(n,agent)?.[readCapability]===true)
 if(!name)return null
 return async (args,exec,signal)=>{
  if(!exec.token)throw Error('基金数据读取缺少有效任务上下文。')
  signal.throwIfAborted()
  const callId=randomUUID()
  activeReads.set(callId,{agent,token:exec.token,name})
  try {
   const result=await ctx.tools.execute({name,arguments:args,agent,callId,parent:exec.token,rootCallId:exec.rootCallId,signal})
   if(result.isError){
    // ToolRuntime keeps the provider code in error.info, not error.code.
    // Retain its sanitized diagnostic instead of turning transport/policy
    // failures into an apparently empty business dataset.
    const error=Error(result.error?.message||result.content?.find(x=>x.type==='text')?.text||'Tushare 业务读取失败。',{cause:result.error})
    error.code=result.error?.info?.code??result.error?.code??'BUSINESS_READ_FAILED'
    throw error
   }
   const payload=result.value?.content?.find(x=>x.type==='text')?.text??result.content?.find(x=>x.type==='text')?.text
   const value=JSON.parse(payload??'null')
   if(value?.source!=='Tushare'||value.api!==args.api_name||!Array.isArray(value.records)||value.pagination?.returned!==value.records.length)
    throw Error('Tushare 返回的业务记录或分页信息无法校验。')
   return value
  } finally {activeReads.delete(callId)}
 }
}

// The exception belongs only to the exact host dispatch, not to the model's
// root call, and still passes every integration/access guard.
export function isFundComparisonRead(exec){
 const entry=activeReads.get(exec.callId)
 return Boolean(entry&&entry.agent===exec.agent&&entry.token===exec.parent&&entry.name===exec.name)
}

export function parseFundComparisonCatalog(raw){
 const match=String(raw).match(/^\s*var\s+r\s*=\s*(\[[\s\S]*\])\s*;\s*$/u)
 if(!match)throw Error('基金分类目录格式无效。')
 const rows=JSON.parse(match[1])
 if(!Array.isArray(rows)||rows.length>60000)throw Error('基金分类目录容量无效。')
 const seen=new Set(),out=[]
 for(const row of rows){
  if(!Array.isArray(row)||!fundCode(row[0])||row[3]!=='债券型-长债')continue
  const name=text(row[2])
  if(!name?.includes('纯债')||/短债|超短|中短/u.test(name))continue
  const product=name.replace(/\s*[A-ZＡ-Ｚ](?:类|份额)?$/u,'')
  if(seen.has(product))continue
  seen.add(product)
  out.push({code:row[0],name})
 }
 return out
}

async function fetchCatalog(signal){
 const response=await fetch(FUND_CATALOG_URL,{signal,redirect:'error',credentials:'omit'})
 if(!response.ok||!response.body){await response.body?.cancel();throw Error('基金分类目录暂不可用。')}
 const reader=response.body.getReader(),decoder=new TextDecoder(),chunks=[]
 let bytes=0
 try{
  while(true){
   const {done,value}=await reader.read()
   if(done)break
   bytes+=value.byteLength
   if(bytes>5*1024*1024)throw Error('基金分类目录超过大小上限。')
   chunks.push(decoder.decode(value,{stream:true}))
  }
  return parseFundComparisonCatalog(chunks.join('')+decoder.decode())
 } finally {await reader.cancel().catch(()=>{});reader.releaseLock()}
}

const round=n=>Number(n.toFixed(5))
function offsetMonths(date,count){
 const d=new Date(date),dayOfMonth=d.getUTCDate()
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+count)
 const end=new Date(d);end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0)
 d.setUTCDate(Math.min(dayOfMonth,end.getUTCDate()))
 return d
}

function compareFundRows(entries,requestedEnd,count,{ observed = false } = {}){
 if(!validDate(requestedEnd))throw Error('统计截止日期无效。')
 const dates=[...new Set(entries.flatMap(e=>e.nav.map(r=>r.nav_date)).filter(d=>validDate(d)&&d<=requestedEnd&&utc(d)>=utc(requestedEnd)-10*day))].sort().reverse()
 for(const end of dates){
  const start=compact(offsetMonths(utc(end),-12)),halfStart=compact(offsetMonths(utc(end),-6))
  const rows=[]
  for(const item of entries){
   const series=item.nav.filter(r=>r.nav_date>=start&&r.nav_date<=end)
   const half=series.filter(r=>r.nav_date>=halfStart)
   const latest=series.at(-1)
   const disclosedScale=series.findLast(r=>finitePositive(r.net_asset)&&validDate(r.ann_date)&&r.ann_date<=requestedEnd)
   const scale=disclosedScale??(observed?series.findLast(r=>finitePositive(r.net_asset)&&r.ann_date==null):undefined)
   if((!scale&&!observed)||series.length<200||half.length<95||latest?.nav_date!==end||!finitePositive(latest.unit_nav)||
      utc(series[0].nav_date)-utc(start)>10*day||utc(half[0].nav_date)-utc(halfStart)>10*day||
      series.some((r,i)=>!finitePositive(r.adj_nav)||i&&utc(r.nav_date)-utc(series[i-1].nav_date)>14*day))continue
   const current=observed?item.nav.findLast(r=>r.nav_date<=requestedEnd&&finitePositive(r.unit_nav)):latest
   rows.push({code:item.code,name:item.name,manager:item.manager,first:series[0].nav_date,halfFirst:half[0].nav_date,
    gain:round(reduceSourceValues('pctChange',series.map(r=>r.adj_nav))),
    drawdown:round(reduceSourceValues('maxDrawdown',half.map(r=>r.adj_nav))),
    volatility:round(reduceSourceValues('returnStdDev',series.map(r=>r.adj_nav))*Math.sqrt(252)),
    nav:current.unit_nav,navDate:current.nav_date,scale:scale?round(scale.net_asset/1e8):null,
    scaleDate:scale?.nav_date??null,annDate:disclosedScale?.ann_date??null})
  }
  if(rows.length>=count)return {rows:rows.slice(0,count).sort((a,b)=>b.gain-a.gain||a.code.localeCompare(b.code)),start,halfStart,end}
 }
 return null
}

export function fundComparisonRows(entries,requestedEnd,count){
 return compareFundRows(entries,requestedEnd,count)
}

const observedDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)?value.replaceAll('-',''):value
const observedFundCode=value=>typeof value==='string'&&/^\d{6}\.OF$/u.test(value)

function completeObservedNav({code,start,end,pages}){
 const rows=new Map()
 let offset=0
 for(let page=0;page<pages.size;page++){
  const response=pages.get(offset)
  if(!response)return
  for(const row of response.records){
   const date=observedDate(row?.nav_date)
   if(row?.ts_code!==code||!validDate(date)||date<start||date>end)return
   const prior=rows.get(date)
   if(prior&&(prior.adj_nav!==row.adj_nav||prior.unit_nav!==row.unit_nav))return
   if(!prior||!finitePositive(prior.net_asset)&&finitePositive(row.net_asset)){
    rows.set(date,{...row,nav_date:date,ann_date:observedDate(row.ann_date)})
   }
  }
  const {possiblyMore,nextOffset}=response.pagination
  if(possiblyMore===false&&nextOffset==null)return [...rows.values()].sort((a,b)=>a.nav_date.localeCompare(b.nav_date))
  if(possiblyMore!==true||!response.records.length||nextOffset!==offset+response.records.length)return
  offset=nextOffset
 }
}

// Input is the current authored request's captured responses. The host must
// supply the actual allowed managed-tool names, never names claimed in a row.
export function observedFundComparison({records,count,trustedTools}){
 if(!Array.isArray(records)||!Number.isSafeInteger(count)||count<1||count>12)return null
 const tools=new Set(trustedTools),basics=new Map(),windows=new Map()
 for(const {tool,args,response} of records){
  if(!tools.has(tool)||response?.source!=='Tushare'||response.api!==args?.api_name||response.success===false||response.error||
     !Array.isArray(response.records)||response.pagination?.returned!==response.records.length)continue
  const code=args.params?.ts_code
  if(!observedFundCode(code))continue
  if(response.api==='fund_basic'){
   const [row]=response.records,name=text(row?.name),manager=text(row?.management)
   if(response.records.length===1&&row?.ts_code===code&&name&&manager)basics.set(code,{code:code.slice(0,6),name,manager})
   continue
  }
  if(response.api!=='fund_nav')continue
  const start=observedDate(args.params.start_date),end=observedDate(args.params.end_date)
  const offset=args.offset??0
  if(!validDate(start)||!validDate(end)||start>end||!Number.isSafeInteger(offset)||offset<0||response.pagination.offset!==offset)continue
  const key=JSON.stringify([code,start,end])
  if(!windows.has(key))windows.set(key,{code,start,end,pages:new Map()})
  windows.get(key).pages.set(offset,response)
 }
 const byEnd=new Map()
 for(const window of windows.values()){
  const basic=basics.get(window.code),nav=basic&&completeObservedNav(window)
  if(!nav?.length)continue
  if(!byEnd.has(window.end))byEnd.set(window.end,new Map())
  const funds=byEnd.get(window.end)
  if(!funds.has(window.code)||funds.get(window.code).nav[0].nav_date>nav[0].nav_date)funds.set(window.code,{...basic,nav})
 }
 for(const end of [...byEnd.keys()].sort().reverse()){
  const funds=byEnd.get(end)
  if(funds.size<count)continue
  const result=compareFundRows([...funds.values()],end,count,{observed:true})
  if(result)return {...result,basis:{navField:'adj_nav',annualizationPeriods:252},missing:{
   scale:result.rows.filter(row=>row.scale===null).length,annDate:result.rows.filter(row=>row.annDate===null).length}}
 }
 return null
}

async function readNav(query,code,start,end,signal){
 const rows=new Map()
 let offset=0,limit=300
 for(let page=0;page<5;page++){
  signal.throwIfAborted()
  let response
  try {response=await query({api_name:'fund_nav',params:{ts_code:code+'.OF',start_date:start,end_date:end},fields:'ts_code,ann_date,nav_date,unit_nav,adj_nav,net_asset',limit,offset},signal)}
  catch(error){
   if(limit>100&&/RESPONSE_TOO_LARGE|过大|截断/u.test(String(error.code??error.cause?.code??'')+' '+String(error.message??'')+' '+String(error.cause?.message??''))){limit=100;continue}
   throw error
  }
  for(const row of response.records){
   if(row.ts_code!==code+'.OF'||!validDate(row.nav_date)||row.nav_date<start||row.nav_date>end)throw Error('基金净值代码或日期与请求不一致。')
   // Repeated identical observations are safe; conflicting revisions are not.
   const prior=rows.get(row.nav_date)
   if(prior&&(prior.adj_nav!==row.adj_nav||prior.unit_nav!==row.unit_nav))throw Error('同日净值冲突。')
   if(!prior||!finitePositive(prior.net_asset)&&finitePositive(row.net_asset))rows.set(row.nav_date,row)
  }
  if(response.pagination?.possiblyMore===false)return [...rows.values()].sort((a,b)=>a.nav_date.localeCompare(b.nav_date))
  const next=response.pagination?.nextOffset
  if(!Number.isSafeInteger(next)||next<=offset)throw Error('无法继续读取净值分页。')
  offset=next
 }
 throw Error('净值分页未取齐。')
}

export async function acquireFundComparison({count,query,signal,now=new Date(),catalog=fetchCatalog}){
 const limited=AbortSignal.any([signal,AbortSignal.timeout(95000)])
 const end=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now).replaceAll('-','')
 const earliest=compact(new Date(offsetMonths(utc(end),-12).getTime()-10*day))
 const candidates=await catalog(limited)
 const accepted=[]
 let selected
 for(const item of candidates.slice(0,count+8)){
  limited.throwIfAborted()
  // One shared source owner dispatches sequentially. Parallel sibling cards
  // must not multiply load on the same managed provider.
  const entry=await (async()=>{
   try{
    const info=await query({api_name:'fund_basic',params:{market:'O',ts_code:item.code+'.OF'},fields:'ts_code,name,management,fund_type,found_date,status',limit:5},limited)
    const [record]=info.records
    const manager=text(record?.management)
    if(info.records.length!==1||record.ts_code!==item.code+'.OF'||record.fund_type!=='债券型'||record.status!=='L'||!manager||!validDate(record.found_date)||record.found_date>earliest)return null
    const nav=await readNav(query,item.code,earliest,end,limited)
    return {...item,manager,nav}
   }catch(error){
    limited.throwIfAborted()
    if(error.code||error.cause)throw error
    return null
   }
  })()
  if(entry)accepted.push(entry)
  selected=fundComparisonRows(accepted,end,count)
  if(selected)break
 }
 if(!selected)throw Error(`未取得至少 ${count} 只有共同统计截止日、完整指标及来源的中长期纯债基金，已保留缺口，未标为完成。`)
 return selected
}

export function fundComparisonArtifacts({rows,start,halfStart,end}){
 const asOf=`收益及波动率 ${iso(start)} 至 ${iso(end)}；最大回撤 ${iso(halfStart)} 至 ${iso(end)}`
 const note='样本来自天天基金长债分类中名称明确为纯债的场外基金，合并同基金不同份额；不是全市场排名。收益及风险按实际复权净值日序列计算：区间收益=期末/期初−1，半年回撤为相对期内峰值的最大跌幅（负值），年化波动率=近一年日简单收益样本标准差×√252。区间首日无观测时用后续第一个交易记录；各基金实际起点见明细。最新单位净值与规模分别按其数据日；规模是来源最后一次披露资产净值，单位亿元。'
 const sources=[{label:'Tushare 基金净值与规模',url:NAV_URL},{label:'Tushare 基金管理人',url:BASIC_URL},{label:'天天基金 长债分类',url:FUND_CATALOG_URL}]
 const base={version:1,asOf,note,sources}
 const identity=['基金名称','代码','管理人']
 const rowsFor=(...keys)=>rows.map(r=>[r.name,r.code+'.OF',r.manager,...keys.map(k=>validDate(r[k])?iso(r[k]):r[k])])
 const table={...base,type:'table',title:'纯债基金比较明细',columns:[...identity,'近一年收益（%）','近半年最大回撤（%）','近一年年化波动率（%）','最新单位净值','最新净值数据日','规模（亿元）','规模数据日','规模披露日','收益实际起点','回撤实际起点'],rows:rowsFor('gain','drawdown','volatility','nav','navDate','scale','scaleDate','annDate','first','halfFirst')}
 const graph={...base,type:'chart',unit:'%',labels:rows.map(r=>r.name)}
 const rank={...graph,variant:'horizontal',title:'近一年收益排名',series:[{name:'近一年收益',values:rows.map(r=>r.gain)}],detailColumns:[...identity,'近一年收益（%）'],detailRows:rowsFor('gain')}
 const risk={...graph,variant:'groupedBar',title:'半年回撤与年化波动率',series:[{name:'近半年最大回撤',values:rows.map(r=>r.drawdown)},{name:'近一年年化波动率',values:rows.map(r=>r.volatility)}],detailColumns:[...identity,'近半年最大回撤（%）','近一年年化波动率（%）'],detailRows:rowsFor('drawdown','volatility')}
 return [table,rank,risk]
}
