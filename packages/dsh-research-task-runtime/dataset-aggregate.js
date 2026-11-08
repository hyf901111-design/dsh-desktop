// Declarative grouping over an already validated snapshot. No generated code,
// guessed identities, or independently supplied aggregate values are executed.
export function materializeDatasetAggregate(dataset,source){
 const fail=message=>{throw Error('共同数据汇总：'+message)}
 const exact=(v,required,optional=[])=>v&&typeof v==='object'&&!Array.isArray(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k))
 const a=dataset.aggregate,fields=new Map(source.fields.map(f=>[f.key,f])),seen=new Set(['id'])
 if(!exact(a,['dataset','groupBy','measures'])||!Array.isArray(a.groupBy)||!a.groupBy.length||a.groupBy.length>4||!Array.isArray(a.measures)||!a.measures.length||a.measures.length>12)fail('需要来源、1–4个分组字段与1–12个计算项。')
 const groups=a.groupBy.map(key=>{
  if(!fields.has(key)||seen.has(key))fail('分组字段不存在或重复。');seen.add(key);return fields.get(key)
 })
 for(const m of a.measures){
  if(!exact(m,['key','label','op'],['field','where','unit'])||typeof m.key!=='string'||!/^\p{L}[\p{L}\p{N}\p{M}_-]{0,63}$/u.test(m.key)||['__proto__','constructor','prototype'].includes(m.key)||seen.has(m.key)||typeof m.label!=='string'||!m.label.trim()||m.label.length>100||!['count','sum'].includes(m.op))fail('计算项键、标签或操作无效。')
  seen.add(m.key)
  if(m.unit!==undefined&&(typeof m.unit!=='string'||!m.unit.trim()||m.unit.length>64))fail('计算单位无效。')
  if(m.op==='sum'?!fields.has(m.field):m.field!==undefined)fail('求和需要来源数值字段；计数不接受field。')
  if(m.where!==undefined&&(!exact(m.where,['field','equals'])||!fields.has(m.where.field)||!['string','number','boolean'].includes(typeof m.where.equals)&&m.where.equals!==null))fail('筛选必须引用来源字段和一个明确原值。')
 }
 const grouped=new Map()
 for(const row of source.records){
  const values=a.groupBy.map(key=>row[key]);if(values.some(v=>Array.isArray(v)))fail('分组字段只支持标量原值。')
  const key=JSON.stringify(values)
  if(!grouped.has(key))grouped.set(key,{id:'group-'+(grouped.size+1),...Object.fromEntries(a.groupBy.map((k,i)=>[k,values[i]])),...Object.fromEntries(a.measures.map(m=>[m.key,m.op==='count'?0:null]))})
  const out=grouped.get(key)
  for(const m of a.measures){
   if(m.where&&row[m.where.field]!==m.where.equals)continue
   const value=m.op==='count'?1:row[m.field];if(value===null)continue
   if(typeof value!=='number'||!Number.isFinite(value))fail('求和遇到非数值原值，不能猜测或默认为零。')
   out[m.key]=(out[m.key]??0)+value
  }
 }
 return {id:dataset.id,label:dataset.label,asOf:source.asOf,note:dataset.note,fields:[{key:'id',label:'记录编号'},...groups,...a.measures.map(({key,label,unit})=>({key,label,...(unit===undefined?{}:{unit})}))],records:[...grouped.values()]}
}
