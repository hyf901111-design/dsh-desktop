// Declarative grouping over an already validated snapshot. No generated code,
// guessed identities, or independently supplied aggregate values are executed.
import {addDecimal,decimalNumber,decimalParts,decimalPercentage} from './workbench-decimal.js'

export function materializeDatasetAggregate(dataset,source){
 const fail=message=>{throw Error('共同数据汇总：'+message)}
 const exact=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k))
 const raw=dataset.aggregate,fields=new Map(source.fields.map(f=>[f.key,f])),seen=new Set(['id'])
 const a=raw&&Array.isArray(raw.measures)?{...raw,measures:raw.measures.map(measure=>{
  if(measure?.op!=='percent'||typeof measure.field!=='string'||!exact(measure.where,['field','equals'])||
     measure.numerator!==undefined||measure.denominator!==undefined)return measure;
  const sums=raw.measures.filter(candidate=>candidate?.op==='sum'&&candidate.field===measure.field);
  const numerator=sums.filter(candidate=>candidate.where?.field===measure.where.field&&candidate.where?.equals===measure.where.equals);
  const denominator=sums.filter(candidate=>candidate.where===undefined);
  if(numerator.length!==1||denominator.length!==1)return measure;
  const {field,where,...ratio}=measure;
  return {...ratio,numerator:numerator[0].key,denominator:denominator[0].key};
 })}:raw;
 if(!exact(a,['dataset','groupBy','measures'])||!Array.isArray(a.groupBy)||a.groupBy.length>4||!Array.isArray(a.measures)||!a.measures.length||a.measures.length>12)fail('需要来源、0–4个分组字段与1–12个计算项。全表汇总使用 groupBy:[]。')
 const groups=a.groupBy.map(key=>{
  if(!fields.has(key)||seen.has(key))fail('分组字段不存在或重复。');seen.add(key);return fields.get(key)
 })
 for(const m of a.measures){
  if(!m||!exact(m,['key','label','op'],m.op==='percent'?['numerator','denominator','unit','digits']:['field','where','unit'])||typeof m.key!=='string'||!/^\p{L}[\p{L}\p{N}\p{M}_-]{0,63}$/u.test(m.key)||['__proto__','constructor','prototype'].includes(m.key)||seen.has(m.key)||typeof m.label!=='string'||!m.label.trim()||m.label.length>100||!['count','sum','percent'].includes(m.op))fail('计算项键、标签或操作无效。')
  seen.add(m.key)
  if(m.unit!==undefined&&(typeof m.unit!=='string'||!m.unit.trim()||m.unit.length>64))fail('计算单位无效。')
  if(m.op==='sum'&&!fields.has(m.field))fail(`「${dataset.id}」的「${m.key}」求和需要 field，填写来源「${source.id}」中的数值字段键。`)
  if(m.op!=='sum'&&m.field!==undefined)fail(`「${dataset.id}」的「${m.key}」计数不接受 field。`)
  if(m.where!==undefined&&(!exact(m.where,['field','equals'])||!fields.has(m.where.field)||!['string','number','boolean'].includes(typeof m.where.equals)&&m.where.equals!==null))fail('筛选必须引用来源字段和一个明确原值。')
 }
 const measures=a.measures.filter(measure=>measure.op!=='percent'),ratios=a.measures.filter(measure=>measure.op==='percent');
 const totals=new Set(measures.map(measure=>measure.key));
 const resolveTotal=key=>{
  if(totals.has(key))return key;
  const matches=measures.filter(measure=>measure.op==='sum'&&measure.field===key);
  return matches.length===1?matches[0].key:undefined;
 };
 for(const ratio of ratios)if(!resolveTotal(ratio.numerator)||!resolveTotal(ratio.denominator)||
   ratio.digits!==undefined&&(!Number.isInteger(ratio.digits)||ratio.digits<0||ratio.digits>8))
  fail('百分比的分子和分母只能引用本汇总的 count/sum 结果，精度为0–8位。');
 const grouped=new Map()
 for(const row of source.records){
  const values=a.groupBy.map(key=>row[key]);if(values.some(v=>Array.isArray(v)))fail('分组字段只支持标量原值。')
  const key=JSON.stringify(values)
  if(!grouped.has(key))grouped.set(key,{id:'group-'+(grouped.size+1),...Object.fromEntries(a.groupBy.map((k,i)=>[k,values[i]])),...Object.fromEntries(measures.map(m=>[m.key,m.op==='count'?0:null]))})
  const out=grouped.get(key)
  for(const m of measures){
   if(m.where&&row[m.where.field]!==m.where.equals)continue
   if(m.op==='count'){out[m.key]++;continue;}
   const value=row[m.field];if(value===null)continue
   if(typeof value!=='number'||!Number.isFinite(value))fail('求和遇到非数值原值，不能猜测或默认为零。')
   out[m.key]=addDecimal(out[m.key],decimalParts(value));
  }
 }
 for(const row of grouped.values()){
  for(const {key,op} of measures)if(op==='sum'&&row[key]!==null)row[key]=decimalNumber(row[key]);
  for(const {key,numerator,denominator,digits} of ratios)row[key]=decimalPercentage(row[resolveTotal(numerator)],row[resolveTotal(denominator)],digits);
 }
 const derivedFields=a.measures.map(({key,label,op,field,unit})=>{
  const knownUnit=unit??(op==='percent'?'%':op==='sum'?fields.get(field).unit:undefined);
  return {key,label,...(knownUnit===undefined?{}:{unit:knownUnit})};
 });
 return {id:dataset.id,groupBy:[...a.groupBy],label:dataset.label,asOf:source.asOf,note:dataset.note,fields:[{key:'id',label:'记录编号'},...groups,...derivedFields],records:[...grouped.values()]}
}
// Match every displayed group and count against the retained source records.
// A label or total supplied by the planner does not establish coverage.
export function verifiedAggregateRecordCount(view, datasets) {
 const groups=view?.dataset?.groupBy
 if(view?.type!=='view'||!groups?.length||!Array.isArray(datasets)||view.view.where?.length)return null
 const {dataset}=view
 const countFields=dataset.fields.filter(field=>/^(?:任务|事项|记录|条目|项目|产品|基金)(?:总数|数量|条数|只数|数)$/u.test(field.label))
 if(countFields.length!==1)return null
 const key=countFields[0].key
 const shown=new Set(view.view.sections.filter(section=>section.kind==='records').flatMap(section=>section.fields))
 if(!shown.has(key)||!groups.every(group=>shown.has(group)))return null
 const identity=record=>JSON.stringify(groups.map(group=>record[group]))
 for(const source of datasets){
  if(source.id===dataset.id||source.groupBy?.length||!groups.every(group=>source.fields.some(field=>field.key===group)))continue
  const expected=new Map()
  for(const record of source.records){
   const group=identity(record)
   expected.set(group,(expected.get(group)??0)+1)
  }
  if(dataset.records.length!==expected.size)continue
  for(const row of dataset.records){
   const group=identity(row)
   if(expected.get(group)===row[key])expected.delete(group)
  }
  if(!expected.size)return source.records.length
 }
 return null
}

export function verifiedKpiRecordCount(artifact,datasets,view){
 if(artifact?.type!=='kpi'||!Array.isArray(datasets)||!view?.dataset)return null;
 const summary=datasets.find(dataset=>dataset.id===view.dataset);
 if(summary?.groupBy?.length!==0||summary.records.length!==1)return null;
 const metrics=artifact.items.filter(item=>/^(?:(?:覆盖)?(?:任务|事项|整改事项|记录|条目|事件|产品|基金|标的|证券|ETF)(?:总数|数量|条数|只数|数)|总数|总条数)$/iu.test(item.label)&&
  Number.isSafeInteger(item.value)&&item.value>0&&summary.fields.some(field=>field.label===item.label&&summary.records[0][field.key]===item.value));
 if(metrics.length!==1)return null;
 const count=metrics[0].value;
 return datasets.some(source=>source.groupBy===undefined&&source.asOf===summary.asOf&&source.records.length===count&&
  (source.note===summary.note||summary.note.startsWith(source.note+'\n')))?count:null;
}

export function compactDatasetGroupLabel(label,index) {
 return `第${index+1}组 · ${label.slice(0,36)}${label.length>36?'…':''}`
}

// Verify chart detail counts against a retained dataset using an explicitly
// named dimension, then check that every one of those groups is plotted.
export function verifiedChartRecordCount(chart, datasets) {
 if(chart?.type!=='chart'||!Array.isArray(datasets)||!Array.isArray(chart.labels)||
    !Array.isArray(chart.detailColumns)||!Array.isArray(chart.detailRows)||chart.detailRows.length!==chart.labels.length)return null
 const countColumns=chart.detailColumns.flatMap((label,index)=>/^(?:任务|事项|记录|条目)(?:数量|条数|数)(?:\s*[（(][条项个][)）])?$/u.test(label)?[index]:[])
 if(countColumns.length!==1)return null
 const [countIndex]=countColumns
 const plotted=new Set(chart.labels)
 if(plotted.size!==chart.labels.length||!chart.detailRows.every((row,index)=>row[0]===chart.labels[index]))return null
 for(const source of datasets){
  if(source.groupBy?.length)continue
  const dimensions=source.fields.flatMap(field=>chart.detailColumns.flatMap((label,index)=>
   index!==countIndex&&(field.key===label||field.label===label)?[{index,key:field.key}]:[]))
  const layouts=dimensions.map(dimension=>[dimension]);
  if(dimensions.length>1)layouts.push(dimensions.toSorted((a,b)=>a.index-b.index));
  for(const layout of layouts){
   const expected=new Map()
   for(const record of source.records){
    const key=JSON.stringify(layout.map(column=>record[column.key]))
    expected.set(key,(expected.get(key)??0)+1)
   }
   if(expected.size!==plotted.size)continue
   for(const [position,row] of chart.detailRows.entries()){
    const values=layout.map(column=>row[column.index]);
    if(!values.every(value=>typeof value==='string'))continue;
    const category=values.join(' · '),key=JSON.stringify(values);
    if((category===chart.labels[position]||compactDatasetGroupLabel(category,position)===chart.labels[position])&&expected.get(key)===row[countIndex])expected.delete(key)
   }
   if(!expected.size)return source.records.length
  }
 }
 return null
}
