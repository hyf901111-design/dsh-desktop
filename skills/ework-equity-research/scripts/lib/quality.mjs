import {createHash} from 'node:crypto'
const text=v=>typeof v==='string'&&v.trim().length>0&&v.length<=12000
const error=(code,path,message)=>({severity:'error',code,path,message})
export const RESEARCH_SECTIONS=Object.freeze({business:'公司与商业模式',industry:'行业与竞争',performance:'业绩与经营驱动',profitability:'盈利质量',balance:'资产负债与营运资本',cashflow:'现金流与资本配置',forecast:'预测与情景假设',valuation:'估值与敏感性',risks:'风险与反证',monitoring:'跟踪与验证'})
export function reportCoverage(report={}){
 report=report&&typeof report==='object'?report:{}
 const profile=report.profile??'brief',sections=(Array.isArray(report.sections)?report.sections:[]).map(s=>({kind:s?.kind,status:s?.status,title:s?.title}))
 return {profile,structureComplete:profile==='full'&&Object.keys(RESEARCH_SECTIONS).every(k=>sections.some(s=>s.kind===k)),hasGaps:profile!=='full'||sections.some(s=>s.status!=='supported'),sections,thesisCount:Array.isArray(report.theses)?report.theses.length:0,reliance:'structure-and-citations-only; economic reasoning requires analyst review'}
}
export function qualityDiagnostics(report,values){
 const ds=[],fail=(code,path,message)=>ds.push(error(code,path,message))
 if(!['brief','full'].includes(report.profile??'brief'))fail('RESEARCH_STRUCTURE','report.profile','profile仅支持full或brief')
 if(report.profile!=='full')return ds
 if(!Array.isArray(report.summary)||!report.summary.length)fail('RESEARCH_STRUCTURE','report.summary','完整研究需要核心判断摘要')
 const sections=Array.isArray(report.sections)?report.sections:[],seen=new Set()
 for(const [i,s] of sections.entries()){
  const path=`report.sections[${i}]`
  if(!s||!Object.hasOwn(RESEARCH_SECTIONS,s.kind)||seen.has(s.kind)||!['supported','partial','missing'].includes(s.status)){fail('RESEARCH_STRUCTURE',path,'完整研究章节需唯一受控kind及supported/partial/missing状态');continue}
  seen.add(s.kind)
  if(s.status!=='supported'&&!['missing','impact','nextStep'].every(k=>text(s.gap?.[k])))fail('RESEARCH_GAP',path,'资料不足章节必须说明缺失资料、结论影响与补充动作')
  if(s.status==='supported'&&(!Array.isArray(s.paragraphs)||!s.paragraphs.length||!s.paragraphs.some(p=>Array.isArray(p?.refs)&&p.refs.some(id=>values.has(id))||[...(typeof p?.text==='string'?p.text:'').matchAll(/\{\{([^{}]+)\}\}/g)].some(m=>values.has(m[1].replace(/^(?:period:|observation:)/,'').split('|')[0])))))fail('SECTION_EVIDENCE',path,'已支持章节需要可追溯事实或原文观察，不能只填无来源结论')
 }
 for(const kind of Object.keys(RESEARCH_SECTIONS))if(!seen.has(kind))fail('RESEARCH_STRUCTURE','report.sections','缺少研究范围：'+kind)
 if(!Array.isArray(report.theses)||!report.theses.length||report.theses.length>8)fail('THESIS_CHAIN','report.theses','完整研究需要核心论点及证据、推论、假设、反证、观察条件')
 for(const [i,t] of (Array.isArray(report.theses)?report.theses:[]).entries())if(!t||!['statement','inference','assumption','falsifier','monitoring'].every(k=>text(t[k]))||!Array.isArray(t.evidenceRefs)||!t.evidenceRefs.length||t.evidenceRefs.length>40||!t.evidenceRefs.every(id=>values.has(id)))fail('THESIS_CHAIN',`report.theses[${i}]`,'核心论点证据链不完整或引用不存在')
 return ds
}
export function extraReportRows(report){
 const result=[]
 for(const [i,p] of (report.summary??[]).entries())if(p?.label!==undefined)result.push([{text:p.label},`report.summary[${i}].label`])
 for(const [i,t] of (report.theses??[]).entries())for(const key of ['statement','inference','assumption','falsifier','monitoring'])result.push([{text:t?.[key],refs:['statement','inference'].includes(key)?t?.evidenceRefs:undefined},`report.theses[${i}].${key}`])
 for(const [i,s] of (report.sections??[]).entries()){
  if(s.gap)for(const key of ['missing','impact','nextStep'])result.push([{text:s.gap[key]},`report.sections[${i}].gap.${key}`])
  for(const [j,t] of (s.tables??[]).entries()){
   const path=`report.sections[${i}].tables[${j}]`
   result.push([{text:t?.title},path+'.title'])
   for(const [k,column] of (t?.columns??[]).entries())result.push([{text:column},path+`.columns[${k}]`])
   for(const [r,row] of (t?.rows??[]).entries())for(const [c,cell] of row.entries())result.push([cell,path+`.rows[${r}][${c}]`])
  }
  for(const [j,c] of (s.charts??[]).entries()){result.push([{text:c?.title},`report.sections[${i}].charts[${j}].title`]);for(const [k,series]of(c?.series??[]).entries())result.push([{text:series?.name},`report.sections[${i}].charts[${j}].series[${k}].name`])}
 }
 return result
}
function semanticKey(id,values,memo,seen=new Set()){
 if(memo.has(id))return memo.get(id)
 if(seen.has(id))return 'invalid-cycle'
 const value=values.get(id);if(!value)return 'missing:'+id
 const next=new Set(seen);next.add(id)
 const inputs=value.op?(value.inputs??[]).map(input=>semanticKey(input,values,memo,next)):[]
 const structure=value.op?[value.op,...(value.op==='sum'?inputs.sort():inputs)]:['fact',value.metric]
 const key=createHash('sha256').update(JSON.stringify(structure)).digest('hex')
 memo.set(id,key);return key
}
export function visualDiagnostics(report,values){
 const memo=new Map(),ds=[],fail=(path,message,code='REPORT_VISUAL')=>ds.push(error(code,path,message))
 for(const [i,s]of(report.sections??[]).entries()){
  if(!s||typeof s!=='object'){fail(`report.sections[${i}]`,'章节必须是对象');continue}
  if(!Array.isArray(s.tables??[])||!Array.isArray(s.charts??[])||(s.tables?.length??0)>8||(s.charts?.length??0)>8){fail(`report.sections[${i}]`,'专题表图必须是有界数组');continue}
  for(const [j,t]of(s.tables??[]).entries())if(!t||!Array.isArray(t.columns)||!t.columns.length||t.columns.length>8||!Array.isArray(t.rows)||!t.rows.length||t.rows.length>80||t.rows.some(r=>!Array.isArray(r)||r.length!==t.columns.length))fail(`report.sections[${i}].tables[${j}]`,'专题表格需要等宽列与有界行')
  for(const[j,c]of(s.charts??[]).entries()){
   const path=`report.sections[${i}].charts[${j}]`,series=c?.series
   if(!Array.isArray(series)||!series.length||series.length>4){fail(path,'图表需要有界series','REPORT_CHART');continue}
   let periods,unit,scope,frequency
   for(const v of series){
    if(!Array.isArray(v?.refs)||v.refs.length<2||v.refs.length>8){fail(path,'每条系列需引用可比期间','REPORT_CHART');continue}
    const rows=v.refs.map(id=>values.get(id))
    if(rows.some(x=>!x||x.type==='observation'||!x.period)){fail(path,'图表只能引用有期间的数值事实/计算','REPORT_CHART');continue}
    const ps=rows.map(x=>x.period),freq=p=>p.startsWith('FY')?'FY':/^20\d{2}H[12]$/.test(p)?p.slice(4):/^20\d{2}Q[1-4]$/.test(p)?p.slice(4):'date'
    periods??=JSON.stringify(ps);unit??=rows[0].unit;scope??=rows[0].scope;frequency??=freq(ps[0])
    if(new Set(ps).size!==ps.length||JSON.stringify(ps)!==periods||rows.some(x=>x.unit!==unit||x.scope!==scope||freq(x.period)!==frequency||semanticKey(x.id,values,memo)!==semanticKey(rows[0].id,values,memo)))fail(path,'禁止混合全年/中期、口径、量纲或同系列不同指标；各系列期间须对齐','REPORT_CHART')
   }
  }
 }
 return ds
}
