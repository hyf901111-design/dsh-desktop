// Also serialized into the client for saved cards; keep this function standalone.
export function displayKpiValue(value,label='',unit='',minimumFractionDigits){
 if(value===null)return '—'
 const text=String(value),name=String(label).trim()
 if(!unit&&/(?:代码|编号|标识)$/u.test(name))return text
 if(!unit&&/^(?:报告期|日期|交易日|(?:报告|公告|实际公告|交易|统计|截止|数据)日期)$/u.test(name)&&/^\d{8}$/u.test(text)){
  const day=text.slice(0,4)+'-'+text.slice(4,6)+'-'+text.slice(6)
  const date=new Date(day)
  if(Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===day)return day
  return text
 }
 if(typeof value==='string'&&!/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value))return value
 const n=Number(value)
 if(!Number.isFinite(n)||Math.abs(n)>Number.MAX_SAFE_INTEGER)return text
 const options=Number.isInteger(minimumFractionDigits)&&minimumFractionDigits>=0&&minimumFractionDigits<=12?
  {minimumFractionDigits,maximumFractionDigits:20}:n!==0&&Math.abs(n)<.01?{maximumSignificantDigits:3}:{maximumFractionDigits:2}
 return (typeof value==='string'&&value.startsWith('+')&&n>=0?'+':'')+n.toLocaleString('en-US',options)
}
