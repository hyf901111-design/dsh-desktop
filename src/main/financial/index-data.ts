type SymbolRef={code:string;market:string;name:string}
type Row=Record<string,any>
export function parsePublicIndexChart(symbol:SymbolRef,value:Row,now=Date.now()):Row {
 const data=value?.chart?.result?.[0],meta=data?.meta,time=meta?.regularMarketTime,price=meta?.regularMarketPrice,zone=meta?.exchangeTimezoneName
 if(value?.chart?.error||meta?.symbol!==symbol.code||typeof time!=='number'||!Number.isFinite(time)||time<=0||typeof price!=='number'||!Number.isFinite(price)||price<=0||typeof zone!=='string')throw Error('暂无该指数有效行情')
 let date:(stamp:number)=>string
 try{const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});date=stamp=>formatter.format(new Date(stamp*1000));date(time)}catch{throw Error('暂无该指数有效行情')}
 const closes=data.indicators?.quote?.[0]?.close,points:Row[]=[]
 if(Array.isArray(data.timestamp)&&Array.isArray(closes))for(let i=0;i<data.timestamp.length;i++){
  const stamp=data.timestamp[i],close=closes[i]
  if(typeof stamp==='number'&&Number.isFinite(stamp)&&stamp>0&&stamp<=time&&typeof close==='number'&&Number.isFinite(close)&&close>0)points.push({stamp,close,day:date(stamp)})
 }
 points.sort((a,b)=>a.stamp-b.stamp)
 const asOf=date(time),previous=points.filter(p=>p.day<asOf).at(-1)?.close??(points.length<=1?meta.chartPreviousClose:null),validPrevious=typeof previous==='number'&&Number.isFinite(previous)&&previous>0,priceChange=validPrevious?price-previous:null,session=meta.currentTradingPeriod?.regular
 return {...symbol,price,priceChange,changePercent:priceChange===null?null:priceChange/previous*100,asOf,quotedAt:new Date(time*1000).toISOString(),timeZone:zone,marketState:Number.isFinite(session?.start)&&Number.isFinite(session?.end)?now>=session.start*1000&&now<session.end*1000?'open':'closed':undefined,series:points.slice(-60).map(p=>p.close),source:'Yahoo Finance',quality:'公开报价 · 时效未确认'}
}
