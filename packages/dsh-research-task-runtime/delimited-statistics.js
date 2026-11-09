// Deterministic descriptive statistics over already parsed attachment rows.
// Decimal arithmetic never asks the model to reconstruct or add source values.
export function delimitedStatistics(rows,budget=24000){
 const [header,...records]=rows,measures=[]
 const decimal=/^[+-]?(?:0|[1-9]\d{0,14})(?:\.\d{1,12})?$/u
 const amount=(value,scale)=>{const negative=value.startsWith('-'),[integer,fraction='']=value.replace(/^[+-]/u,'').split('.');const result=BigInt(integer+fraction.padEnd(scale,'0'));return negative?-result:result}
 const format=(value,scale)=>{const negative=value<0n,digits=(negative?-value:value).toString().padStart(scale+1,'0');return (negative?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits)}
 for(let index=0;index<header.length;index++){
  const column=header[index],values=records.map(row=>row[index].trim()).filter(Boolean)
  if(/编号|代码|标识|(?:^|[ _-])(?:id|key|code)(?:$|[ _-])/iu.test(column)||!values.length||!values.every(value=>decimal.test(value)))continue
  const scale=Math.max(...values.map(value=>(value.split('.')[1]??'').length)),numbers=values.map(value=>amount(value,scale))
  measures.push({index,scale,column,count:numbers.length,sum:format(numbers.reduce((a,b)=>a+b,0n),scale),min:format(numbers.reduce((a,b)=>a<b?a:b),scale),max:format(numbers.reduce((a,b)=>a>b?a:b),scale)})
 }
 const result={recordCount:records.length,measures:measures.map(({index,scale,...facts})=>facts),groups:[]}
 for(let index=0;index<header.length;index++){
  if(measures.some(measure=>measure.index===index))continue
  const values=new Map()
  for(const row of records){const value=row[index];if(!values.has(value))values.set(value,[]);values.get(value).push(row)}
  if(values.size>24||values.size<2||[...values.keys()].some(value=>value.length>2000))continue
  const group={column:header[index],values:[...values].map(([value,entries])=>({value,count:entries.length,totals:Object.fromEntries(measures.map(m=>[m.column,entries.some(row=>row[m.index].trim())?format(entries.reduce((sum,row)=>sum+(row[m.index].trim()?amount(row[m.index].trim(),m.scale):0n),0n),m.scale):null]))}))}
  if(Buffer.byteLength(JSON.stringify({...result,groups:[...result.groups,group]}),'utf8')>budget){result.groupsTruncated=true;continue}
  result.groups.push(group)
 }
 return result
}
