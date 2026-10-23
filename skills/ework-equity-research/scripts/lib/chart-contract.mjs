import {createHash} from 'node:crypto'
import {decimal} from './numbers.mjs'
export const chartKind=chart=>chart?.kind??'bar'
export const chartReferences=chart=>chartKind(chart)==='waterfall'?[chart.startRef,...(chart.steps??[]).map(s=>s.ref),chart.endRef]:(chart.series??[]).flatMap(s=>s.refs??[])
export const chartNeedsDetail=chart=>['combo','waterfall'].includes(chartKind(chart))||(chart.series?.length??0)>2||(chart.series?.[0]?.refs?.length??0)>3||chartKind(chart)==='line'&&(chart.series?.length??0)>1
export const chartIsWide=chart=>chartNeedsDetail(chart)||chartKind(chart)==='waterfall'
const frequency=p=>/^FY\d{4}$/.test(p)?'FY':/^\d{4}H[12]$/.test(p)?p.slice(4):/^\d{4}Q[1-4]$/.test(p)?p.slice(4):/^\d{4}-\d{2}-\d{2}$/.test(p)?'date':null
const periodEnd=p=>/^FY\d{4}$/.test(p)?p.slice(2)+'-12-31':/^\d{4}[HQ][1-4]$/.test(p)?p.slice(0,4)+'-'+({H1:'06-30',H2:'12-31',Q1:'03-31',Q2:'06-30',Q3:'09-30',Q4:'12-31'}[p.slice(4)]??'00-00'):p
export const chartTime=period=>Date.parse(periodEnd(period))
function leafPeriods(id,values,memo,seen=new Set()){
 if(memo.has(id))return memo.get(id)
 if(seen.has(id))return new Set(['invalid-cycle'])
 const v=values.get(id);if(!v)return new Set(['missing'])
 const next=new Set(seen);next.add(id)
 const result=v.op?new Set((v.inputs??[]).flatMap(input=>[...leafPeriods(input,values,memo,next)])):new Set([v.period])
 memo.set(id,result);return result
}
function semanticKey(id,values,memo,seen=new Set()){
 if(memo.has(id))return memo.get(id)
 if(seen.has(id))return 'invalid-cycle'
 const value=values.get(id);if(!value)return 'missing:'+id
 const next=new Set(seen);next.add(id)
 const inputs=value.op?(value.inputs??[]).map(input=>semanticKey(input,values,memo,next)):[]
 const structure=value.op?[value.op,...(value.op==='sum'?inputs.sort():inputs)]:['fact',value.metric]
 const key=createHash('sha256').update(JSON.stringify(structure)).digest('hex');memo.set(id,key);return key
}
export function chartDiagnostics(chart,values,path,memo=new Map()){
 const ds=[],fail=message=>ds.push({severity:'error',code:'REPORT_CHART',path,message}),kind=chartKind(chart)
 if(!['bar','line','combo','waterfall'].includes(kind)){fail('图型仅支持bar、line、combo、waterfall');return ds}
 if(kind==='waterfall'){
  if(chart.series!==undefined||typeof chart.startRef!=='string'||typeof chart.endRef!=='string'||!Array.isArray(chart.steps)||chart.steps.length<1||chart.steps.length>8||chart.steps.some(s=>!s||typeof s.ref!=='string'||typeof s.label!=='string'||!s.label.trim()||Array.from(s.label).length>80)||new Set(chart.steps.map(s=>s.ref)).size!==chart.steps.length){fail('算术桥需要受控起终点与有界、唯一的带标签差额引用');return ds}
  const refs=chartReferences(chart),rows=refs.map(id=>values.get(id)),start=rows[0],end=rows.at(-1),steps=rows.slice(1,-1)
  if(rows.some(v=>!v||v.type==='observation'||v.unit!=='CNY'||!v.period||v.scope!==start?.scope)||steps.some(v=>v.status!=='calculated'||!['periodDifference','difference','sum'].includes(v.op))){fail('算术桥仅支持同范围人民币端点与已成功计算的确定性差额/合计');return ds}
  const samePeriod=start.period===end.period,newPeriod=end.period,periods=new Set([start.period,end.period]),periodMemo=new Map()
  const adjacent=start.period.replace(/20\d{2}/,year=>String(Number(year)+1))===end.period
  if(!samePeriod&&(!adjacent||frequency(start.period)!==frequency(end.period)||semanticKey(start.id,values,memo)!==semanticKey(end.id,values,memo))||steps.some(v=>v.period!==newPeriod||[...leafPeriods(v.id,values,periodMemo)].some(p=>!periods.has(p))))fail('算术桥须使用同一期或同含义相邻同比期端点，全部差额结果与底层事实须对应桥两端期间')
  if(steps.reduce((total,v)=>total.add(v.value),decimal(start.value)).cmp(end.value)!==0)fail('算术桥不闭合：起点加全部有符号变动必须精确等于终点')
  return ds
 }
 const series=chart?.series
 if(chart?.steps!==undefined||chart?.startRef!==undefined||chart?.endRef!==undefined||!Array.isArray(series)||!series.length||series.length>4){fail('图表需要有界series，桥参数仅用于waterfall');return ds}
 if(kind==='combo'&&(series.length!==2||series.filter(s=>s?.type==='bar').length!==1||series.filter(s=>s?.type==='line').length!==1)){fail('组合图必须恰有人民币柱系列与同比折线系列');return ds}
 let periods,scope,unit,freq
 for(const s of series){
  const minimum=['line','combo'].includes(kind)?3:2
  if(!s||!Array.isArray(s.refs)||s.refs.length<minimum||s.refs.length>8||kind!=='combo'&&s.type!==undefined){fail('每条系列需引用有界、可比期间；折线及组合图至少需要三个期间');continue}
  const rows=s.refs.map(id=>values.get(id))
  if(rows.some(v=>!v||v.type==='observation'||!v.period)){fail('图表只能引用有期间的数值事实或成功计算');continue}
  const ps=rows.map(v=>v.period),keys=ps.map(periodEnd),rowUnit=rows[0].unit,rowFrequency=frequency(ps[0])
  periods??=JSON.stringify(ps);scope??=rows[0].scope;unit??=rowUnit;freq??=rowFrequency
  if(!rowFrequency||new Set(ps).size!==ps.length||JSON.stringify(ps)!==periods||rows.some(v=>v.scope!==scope||frequency(v.period)!==freq||v.unit!==rowUnit||semanticKey(v.id,values,memo)!==semanticKey(rows[0].id,values,memo))||kind!=='combo'&&rowUnit!==unit||['line','combo'].includes(kind)&&(keys.some((key,i)=>i>0&&key<=keys[i-1])||freq!=='date'&&ps.some((period,i)=>i>0&&Number(period.match(/20\d{2}/)?.[0])!==Number(ps[i-1].match(/20\d{2}/)?.[0])+1)))fail('禁止混合频率、口径、量纲或同系列不同指标；期间须对齐且折线严格递增')
  if(kind==='combo'&&(s.type==='bar'&&rowUnit!=='CNY'||s.type==='line'&&(rowUnit!=='ratio'||rows.some(v=>v.status!=='calculated'||v.op!=='yoy'))))fail('组合图左轴仅人民币金额柱，右轴仅成功同比百分比折线')
 }
 if(!ds.length&&kind==='combo'&&series.length===2){
  const bars=series.find(s=>s?.type==='bar'),growth=series.find(s=>s?.type==='line')
  if(Array.isArray(bars?.refs)&&Array.isArray(growth?.refs)&&growth.refs.some((id,i)=>{const rate=values.get(id),left=values.get(bars.refs[i]),numerator=values.get(rate?.inputs?.[0]);return !left||!numerator||numerator.period!==left.period||numerator.scope!==left.scope||numerator.unit!==left.unit||semanticKey(numerator.id,values,memo)!==semanticKey(left.id,values,memo)||decimal(numerator.value).cmp(left.value)!==0}))fail('组合图同比的当期分子必须对应左轴相同指标、期间、范围及金额')
 }
 return ds
}
