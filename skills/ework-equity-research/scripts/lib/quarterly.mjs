import {decimal} from './numbers.mjs'
import {isObject,isText,diagnostic} from './schema.mjs'
import {selectedFactContext} from './evidence-basis.mjs'
const keys=(o,allowed)=>isObject(o)&&Object.keys(o).every(k=>allowed.includes(k))
const ordinal=q=>{const m=/^(20\d{2})Q([1-4])$/.exec(q??'');return m?Number(m[1])*4+Number(m[2])-1:null}
export function runQuarterly(packet,facts,calculations,diagnostics,observations=[]){
 if(packet.quarterly===undefined)return null
 const result={status:'blocked',quarters:[]},q=packet.quarterly
 const fail=message=>{throw Error(message)}
 try{
  if(!keys(q,['latest','quarters','disclosureSearch'])||ordinal(q.latest)===null||!Array.isArray(q.quarters)||q.quarters.length!==4)fail('必须声明最近已披露且连续的四个实际季度')
  const latestEnd=new Date(Date.UTC(Number(q.latest.slice(0,4)),Number(q.latest.at(-1))*3,0)).toISOString().slice(0,10)
  if(latestEnd!==packet.financialAsOf)fail('最近季度末必须对齐financialAsOf，不能在已披露中报后仍选择上一年四季冒充最近一年')
  const obs=new Map(observations.filter(o=>o.status==='verified').map(o=>[o.id,o])),search=q.disclosureSearch
  if(!keys(search,['asOf','refs','note'])||search.asOf!==packet.asOf||!isText(search.note)||!Array.isArray(search.refs)||!search.refs.length||!search.refs.every(id=>obs.has(id)))fail('需最近披露范围的已核验检索记录与实际研究截止日；不据当前季度猜测已披露数据')
  const values=new Map([...facts.filter(f=>f.status==='verified').map(f=>[f.id,{...f,value:f.normalizedValue,unit:f.normalizedUnit}]),...calculations.filter(c=>c.status==='calculated').map(c=>[c.id,c])])
  const refs=new Set(search.refs)
  function get(id,metric,period){const x=values.get(id);if(!x||x.metric!==metric||x.period!==period||x.scope!=='合并'||x.unit!=='CNY'||(x.status==='verified'&&x.periodBasis!=='standalone')||(x.status==='calculated'&&x.op!=='quarterFromCumulative'))fail('单季实绩需同合并口径金额事实且显式standalone，或受控累计差分；不能把Q3累计当单季');if(x.status==='verified'&&!period.endsWith('Q1')&&/本年累计|年初至(?:报告)?期末|累计金额|累计发生|本期累计|本年年初/iu.test(selectedFactContext(x)))fail('原文明确累计口径，不能以standalone元数据改成单季');refs.add(id);return x}
  for(const [i,row]of q.quarters.entries()){
   if(!keys(row,['period','revenueRef','parentNetIncomeRef','operatingCashFlowRef','priorRevenueRef','priorParentNetIncomeRef'])||ordinal(row.period)!==ordinal(q.latest)-3+i)fail('四季度有遗漏、乱序或与最近披露季度不一致')
   const year=Number(row.period.slice(0,4)),quarter=Number(row.period.at(-1)),end=new Date(Date.UTC(year,quarter*3,0)).toISOString().slice(0,10)
   if(end>packet.financialAsOf||end>packet.asOf)fail('季度超出最近财务披露基期或研究截止日')
   const rev=get(row.revenueRef,'revenue',row.period),ni=get(row.parentNetIncomeRef,'netIncomeAttributableToParent',row.period),priorPeriod=(year-1)+row.period.slice(4),pr=get(row.priorRevenueRef,'revenue',priorPeriod),pn=get(row.priorParentNetIncomeRef,'netIncomeAttributableToParent',priorPeriod),cf=row.operatingCashFlowRef?get(row.operatingCashFlowRef,'operatingCashFlow',row.period):null
   if(decimal(pr.value).cmp('0')<=0||decimal(pn.value).cmp('0')<=0)fail('同比基期需为正；负利润/零基期须另作显式缺口解释')
   result.quarters.push({period:row.period,revenue:rev.value,parentNetIncome:ni.value,operatingCashFlow:cf?.value??null,revenueYoY:decimal(rev.value).div(pr.value).sub('1').toString(24),parentNetIncomeYoY:decimal(ni.value).div(pn.value).sub('1').toString(24),sourceRefs:[row.revenueRef,row.parentNetIncomeRef,row.priorRevenueRef,row.priorParentNetIncomeRef,...(cf?[row.operatingCashFlowRef]:[])]})
  }
  Object.assign(result,{status:'calculated',latest:q.latest,sourceRefs:[...refs],disclosureSearch:search,limitations:['最近披露范围由已核验检索记录与作者判断声明，程序不证明外部披露完整性。','经营现金流含金融业务等范围因素时，不能直接外推为工业FCFF。']})
 }catch(error){result.quarters=[];diagnostics.push(diagnostic('QUARTERLY_CONTRACT','quarterly',error.message))}
 return result
}
