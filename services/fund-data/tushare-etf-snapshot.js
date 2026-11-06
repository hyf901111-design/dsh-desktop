const dayMs=86400000
const shift=(date,days)=>new Date(Date.parse(`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)}T00:00:00Z`)+days*dayMs).toISOString().slice(0,10).replaceAll('-','')
const finite=value=>typeof value==='number'&&Number.isFinite(value)
const yi=value=>finite(value)?value/10000:null
const sum=(rows,key)=>{const values=rows.map(r=>r[key]).filter(finite);return values.length?values.reduce((a,b)=>a+b,0):null}
export function validateEtfSnapshot(args,now=new Date()){
 if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['end_date','lookback_days','view','index_code','limit','offset'].includes(k)))throw Error('ETF 汇总参数无效')
 const end_date=args.end_date??new Date(now.getTime()+8*3600000).toISOString().slice(0,10).replaceAll('-',''),lookback_days=args.lookback_days??7,view=args.view??'overview',limit=args.limit??20,offset=args.offset??0
 if(typeof end_date!=='string'||!/^\d{8}$/.test(end_date)||!Number.isFinite(Date.parse(`${end_date.slice(0,4)}-${end_date.slice(4,6)}-${end_date.slice(6,8)}`))||shift(end_date,0)!==end_date||!Number.isInteger(lookback_days)||lookback_days<1||lookback_days>90||!['overview','inflows','outflows','products'].includes(view)||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>5000||args.index_code!==undefined&&(typeof args.index_code!=='string'||!/^\d{6}(?:\.[A-Z]{2,4})?$/.test(args.index_code)))throw Error('ETF 日期、窗口或分页参数无效')
 return {end_date,lookback_days,view,limit,offset,...args.index_code?{index_code:args.index_code}:{}}
}
async function all(query,api_name,params,fields,signal){
 const rows=[],codes=new Set()
 for(let offset=0;offset<6000;offset+=1000){
  signal?.throwIfAborted()
  const data=await query({api_name,params,fields,limit:1000,offset},signal)
  if(!Array.isArray(data?.records)||!data.pagination)throw Error('ETF 来源未返回有效记录')
  for(const row of data.records){
   const key=api_name==='trade_cal'?row.cal_date:row.ts_code
   if(typeof key!=='string'||codes.has(key))throw Error('ETF 来源分页出现重复或无效代码，未汇总')
   codes.add(key);rows.push(row)
  }
  if(!data.pagination.possiblyMore)return rows
  if(!data.records.length||data.pagination.nextOffset!==offset+1000)throw Error('ETF 来源分页不完整，未汇总')
 }
 throw Error('ETF 来源超过安全分页范围，未汇总')
}
export async function buildEtfSnapshot(input,query,signal){
 const {end_date,lookback_days}=validateEtfSnapshot(input)
 const calendar=await all(query,'trade_cal',{exchange:'SSE',start_date:shift(end_date,-lookback_days-40),end_date,is_open:'1'},'cal_date,is_open',signal)
 const dates=calendar.filter(r=>String(r.is_open)==='1'&&/^\d{8}$/.test(r.cal_date)&&r.cal_date<=end_date).map(r=>r.cal_date).sort().reverse()
 const fields='ts_code,trade_date,etf_name,total_share,total_size,nav,close,exchange'
 async function available(cutoff){
  for(const date of dates.filter(d=>d<=cutoff).slice(0,5)){
   const rows=await all(query,'etf_share_size',{trade_date:date},fields,signal)
   if(rows.some(row=>row.trade_date!==date))throw Error('ETF 来源日期不一致，未汇总')
   if(rows.length)return {date,rows}
  }
  throw Error('最近五个交易日未取得 ETF 份额规模记录，未以零值代替')
 }
 const end=await available(end_date),start=await available(shift(end.date,-lookback_days))
 const basic=await all(query,'etf_basic',{},'ts_code,csname,index_code,index_name,mgr_name',signal)
 const prior=new Map(start.rows.map(r=>[r.ts_code,r])),metadata=new Map(basic.map(r=>[r.ts_code,r]))
 const products=end.rows.map(r=>{
  const p=prior.get(r.ts_code),b=metadata.get(r.ts_code),delta=p&&finite(r.total_share)&&finite(p.total_share)?r.total_share-p.total_share:null
  return {code:r.ts_code,name:b?.csname||r.etf_name||r.ts_code,indexCode:b?.index_code??null,indexName:b?.index_name??null,manager:b?.mgr_name??null,exchange:r.exchange,
   date:end.date,startDate:p?start.date:null,shareYi:yi(r.total_share),sizeYi:yi(r.total_size),nav:finite(r.nav)?r.nav:null,close:finite(r.close)?r.close:null,
   shareChangeYi:yi(delta),sizeChangeYi:p&&finite(r.total_size)&&finite(p.total_size)?yi(r.total_size-p.total_size):null,flowEstimateYi:finite(delta)&&finite(r.nav)&&r.nav>0?delta*r.nav/10000:null,
   returnPct:p&&finite(r.close)&&finite(p.close)&&p.close>0?(r.close/p.close-1)*100:null,
   matched:Boolean(p)}
 })
 const summary={products:products.length,startProducts:start.rows.length,matchedProducts:products.filter(r=>r.matched).length,
  sizeYi:sum(products,'sizeYi'),shareYi:sum(products,'shareYi'),sizeCoverage:products.filter(r=>finite(r.sizeYi)).length,shareCoverage:products.filter(r=>finite(r.shareYi)).length,
  startSizeYi:sum(start.rows,'total_size')===null?null:sum(start.rows,'total_size')/10000,startShareYi:sum(start.rows,'total_share')===null?null:sum(start.rows,'total_share')/10000,
  shareChangeYi:sum(products,'shareChangeYi'),sizeChangeYi:sum(products,'sizeChangeYi'),sizeChangeCoverage:products.filter(r=>finite(r.sizeChangeYi)).length,flowEstimateYi:sum(products,'flowEstimateYi'),flowCoverage:products.filter(r=>finite(r.flowEstimateYi)).length,
  netCreatedProducts:products.filter(r=>r.shareChangeYi>0).length,netRedeemedProducts:products.filter(r=>r.shareChangeYi<0).length}
 return {source:'Tushare',api:'etf_share_size + etf_basic + trade_cal',sourceUrl:'https://tushare.pro/document/2?doc_id=408',receivedAt:new Date().toISOString(),
  period:{requestedEnd:end_date,start:start.date,end:end.date,lookbackDays:lookback_days},coverage:{complete:true,endProducts:products.length,startProducts:start.rows.length,matchedProducts:summary.matchedProducts},summary,products,
  formula:'份额变动按期末净值估算金额 = (期末份额−期初份额) × 期末净值；不是逐日净申购合计或官方资金流。区间收益为未复权收盘价变化，不含分红。万份/万元÷10000为亿份/亿元。',
  note:'分页已取齐仅指 Tushare 对所查询日期的可用记录；入库可能分批，不能保证交易所全部产品齐全。规模/份额总计各按当日有效记录；变动使用 sizeChangeYi/shareChangeYi，只按两期匹配且两期该字段均有效的产品，缺失不补零，不把新增或消失产品当申赎。不要用覆盖范围不同的两期总计之差冒充同口径变动。日期以实际返回为准，可能滞后。'}
}
export function selectEtfSnapshot(snapshot,input){
 const args=validateEtfSnapshot(input),{products,...base}=snapshot
 const selected=products.filter(p=>!args.index_code||(p.indexCode??'').split('.')[0]===args.index_code.split('.')[0])
 const filtered=selected.filter(p=>args.view==='inflows'?p.flowEstimateYi>0:args.view==='outflows'?p.flowEstimateYi<0:true)
 const order=args.view==='outflows'?1:-1,key=['inflows','outflows'].includes(args.view)?'flowEstimateYi':'sizeYi'
 const sorted=[...filtered].sort((a,b)=>finite(a[key])&&finite(b[key])?order*(a[key]-b[key])||a.code.localeCompare(b.code):finite(a[key])?-1:finite(b[key])?1:a.code.localeCompare(b.code))
 const records=args.view==='overview'?[]:sorted.slice(args.offset,args.offset+args.limit),more=args.view!=='overview'&&args.offset+records.length<sorted.length
 return {...base,view:args.view,coverage:{...base.coverage,selectedProducts:selected.length,rankedProducts:filtered.length},summaryScope:'全部可用 ETF 记录；index_code 只筛选 records，不改变 summary',records,
  ranking:args.view==='overview'?null:{field:key,unit:'亿元',direction:order===1?'ascending':'descending',meaning:key==='flowEstimateYi'?'按期末净值估算的份额变动金额':'期末规模'},
  fieldInfo:{sizeYi:'期末规模（亿元）',sizeChangeYi:'两期规模均有效的匹配产品规模变化（亿元）',sizeChangeCoverage:'规模变动所覆盖产品数（只）',shareYi:'期末份额（亿份）',shareChangeYi:'两期匹配份额变化（亿份）',flowEstimateYi:'按期末净值估算的份额变动金额（亿元）',returnPct:'区间未复权价格变化（%）',nav:'期末单位净值（元）',close:'期末收盘价（元）'},
  pagination:{offset:args.offset,limit:args.limit,total:args.view==='overview'?0:sorted.length,returned:records.length,possiblyMore:more,nextOffset:more?args.offset+records.length:null}}
}
