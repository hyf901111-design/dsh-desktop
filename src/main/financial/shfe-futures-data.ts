type Contract = {code:string; month:string; settlement:number|null; close:number|null; volume:number|null; openInterest:number|null}
type Product = {code:string; name:string; unit:string; contracts:Contract[]}
const origin = 'https://www.shfe.com.cn'
const units:Record<string,string> = {au:'元/克',ag:'元/千克',sc:'元/桶',ec:'点'}
const perTonne = new Set(['cu','bc','al','zn','pb','ni','sn','ao','ad','rb','wr','hc','ss','lu','fu','bu','br','ru','nr','sp','op'])
const validDay = (value:unknown):value is string => typeof value==='string' && /^\d{8}$/.test(value)

function numeric(value:unknown){
 if(typeof value==='number')return Number.isFinite(value)?value:null
 if(typeof value!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(value.trim()))return null
 const result=Number(value)
 return Number.isFinite(result)?result:null
}

export function parseShfeSettlements(report:any,day:string){
 if(!validDay(day)||report?.report_date!==day||report.o_code!=='0000'||!Array.isArray(report.o_curinstrument))return null
 const products=new Map<string,Product>()
 for(const row of report.o_curinstrument){
  const code=String(row?.PRODUCTGROUPID??'').trim()
  const month=String(row?.DELIVERYMONTH??'').trim()
  if(!/^[a-z]{1,4}$/.test(code)||row.PRODUCTID!==code+'_f'||!/^\d{2}(?:0[1-9]|1[0-2])$/.test(month)||typeof row.PRODUCTNAME!=='string')continue
  const product:Product=products.get(code)??{code,name:row.PRODUCTNAME.trim(),unit:units[code]??(perTonne.has(code)?'元/吨':''),contracts:[]}
  if(product.contracts.some(contract=>contract.month===month))continue
  product.contracts.push({code:code.toUpperCase()+month,month,settlement:numeric(row.SETTLEMENTPRICE),close:numeric(row.CLOSEPRICE),volume:numeric(row.VOLUME),openInterest:numeric(row.OPENINTEREST)})
  products.set(code,product)
 }
 const list=Array.from(products.values())
 // The exchange also publishes an intraday file at this URL, with empty settlement fields.
 if(!list.some(product=>product.contracts.some(contract=>contract.settlement!==null)))return null
 for(const product of list)product.contracts.sort((a,b)=>a.month.localeCompare(b.month))
 return {date:day.slice(0,4)+'-'+day.slice(4,6)+'-'+day.slice(6),products:list,
  url:origin+'/reports/tradedata/dailyandweeklydata/?query_date='+day+'&query_options=1&query_params=kx'}
}

export async function queryShfeFutures(json:(url:string)=>Promise<any>,check:()=>void){
 const days=await json(origin+'/data/config/currentTradingday.dat')
 const candidates=[...new Set([days?.currentTradingday,days?.lastTradingday].filter(validDay))]
 for(const day of candidates){
  let report
  try{report=await json(origin+'/data/tradedata/future/dailydata/kx'+day+'.dat')}catch{check();continue}
  const futuresReport=parseShfeSettlements(report,day)
  if(futuresReport)return {source:'上期所交易日报',futuresReport}
 }
 throw Error('暂未取得交易所公布的日结算数据，请稍后刷新')
}
