import {decimal} from './numbers.mjs'
import {diagnostic} from './schema.mjs'
// Cross-lane consistency is recomputed from the selected verified inputs, not
// supplied check flags. Missing lane data is handled by research requirements.
export function alignmentDiagnostics(packet,validation,calculation){
 const ds=[],d=calculation.dcf,m=calculation.market,q=calculation.quarterly
 const fail=(path,message)=>ds.push(diagnostic('RESEARCH_ALIGNMENT',path,message))
 if(d?.status!=='calculated'||d.method!=='driver-fcff-v2')return ds
 if(m?.status==='calculated'&&(d.valuationAsOf!==m.valuationAsOf||!m.rows?.length||decimal(d.currentPrice.value).cmp(m.rows.at(-1).stock)!==0))fail('dcf.currentPrice','DCF与一年行情必须使用同一估值日和相同的实际收盘价')
 if(q?.status!=='calculated')return ds
 const values=new Map([...(validation.facts??[]).filter(x=>x.status==='verified').map(x=>[x.id,{...x,value:x.normalizedValue,unit:x.normalizedUnit}]),...(calculation.calculations??[]).filter(x=>x.status==='calculated').map(x=>[x.id,x])])
 const quarters=new Map()
 for(const row of packet.quarterly?.quarters??[])for(const id of [row.revenueRef,row.priorRevenueRef]){const x=values.get(id);if(x?.metric==='revenue'&&x.unit==='CNY')quarters.set(x.period,x.value)}
 for(const name of ['baseFY','interim']){
  const block=packet.dcf?.[name];if(!block)continue
  const n=Number(block.end.slice(5,7))/3,year=block.end.slice(0,4),known=Array.from({length:n},(_,i)=>quarters.get(year+'Q'+(i+1)))
  if(!Number.isInteger(n)||!known.length||known.some(x=>x===undefined))continue
  const basis=values.get(block.revenueRef)
  if(basis&&known.reduce((sum,x)=>sum.add(x),decimal('0')).cmp(basis.value)!==0)fail(`dcf.${name}.revenueRef`,'所选单季收入合计与DCF同年度/累计基期收入不一致；需先解决重述或口径差异')
 }
 return ds
}
