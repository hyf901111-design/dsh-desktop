import {readDelimitedRow} from './delimited-row.js'
import {delimitedStatistics} from './delimited-statistics.js'
import {extractArtifactObjects,retainedTableData} from './artifact-output.js'
import {readTemplateModel} from './component-template-registry.js'

// Keep delimited files as evidence, never executable code or a guessed series.
// Bound the complete representation; a cut record must not look like EOF.
export function extractDelimitedEvidence(input,name,budget=140_000) {
 const text=String(input).replace(/^\uFEFF/u,''),delimiter=/\.tsv$/iu.test(name)?'\t':','
 const rows=[]
 for(let i=0;i<text.length;){
  const row=readDelimitedRow(text,i,delimiter)
  rows.push(row.cells)
  i=row.next
 }
 while(rows.length&&rows.at(-1).every(value=>value===''))rows.pop()
 const header=rows[0]
 if(!header?.length||header.some(value=>!value.trim())||new Set(header).size!==header.length||rows.some(row=>row.length!==header.length))throw Error('CSV 表头重复、为空或记录列数不一致')
 if(rows.length<2)throw Error('CSV 没有可读取的记录')
 const document={name,format:/\.tsv$/iu.test(name)?'tsv':'csv',blocks:[{id:'T1',rows}]}
 if(Buffer.byteLength(JSON.stringify(document),'utf8')>budget)throw Error('CSV 完整证据超出容量，请使用分块数据读取，不能截断或按样本交付')
 const statistics=delimitedStatistics(rows)
 if(Buffer.byteLength(JSON.stringify({...document,statistics}),'utf8')<=budget)document.statistics=statistics
 return document
}

const validFieldKey=key=>/^\p{L}[\p{L}\p{N}\p{M}_-]{0,63}$/u.test(key)&&
 !['id','constructor','prototype','__proto__'].includes(key)
const decimalValue=value=>/^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)
 ?value.replace(/^\+/u,'').replace(/(\.\d*?)0+$/u,'$1').replace(/\.$/u,'').replace(/^-0$/u,'0')
 :undefined

export function delimitedRecordFields(header,identity) {
 const keys=new Set(header.filter(validFieldKey))
 const fields=header.map((label,index)=>{
  if(label===identity)return {key:'id',label}
  if(validFieldKey(label))return {key:label,label}
  let key='column'+(index+1)
  while(keys.has(key))key+='-'
  keys.add(key)
  return {key,label}
 })
 return identity?fields:[{key:'id',label:'附件行号'},...fields]
}

// Expand one host-read table into the existing shared data contract. The
// planner names source columns; it never resubmits individual record values.
export function materializeDelimitedDataset(draft,documents) {
 const {id,label,recordScope,sourceTable,fields}=draft
 if(Object.keys(draft).some(key=>!['id','label','recordScope','sourceTable','fields'].includes(key))||
    !sourceTable||typeof sourceTable!=='object'||Array.isArray(sourceTable)||
    Object.keys(sourceTable).some(key=>!['document','block','identity','numericFields'].includes(key)))
  throw Error('引用附件表格提供id、label、sourceTable，可保留已存在的原列字段说明，不能混入records或aggregate。')
 const matches=documents.filter(doc=>doc.name===sourceTable.document&&['csv','tsv'].includes(doc.format))
 const table=matches.length===1&&matches[0].blocks.find(block=>block.id===sourceTable.block)
 if(!table?.rows?.length)throw Error('共同记录只能引用本轮附件中唯一匹配的 CSV 或 TSV 表格。')
 const [header,...rows]=table.rows
 const identity=sourceTable.identity
 const keyIndex=identity===undefined?-1:header.indexOf(identity)
 if(identity!==undefined&&(keyIndex<0||rows.some(row=>!row[keyIndex]?.trim())||new Set(rows.map(row=>row[keyIndex])).size!==rows.length))
  throw Error('附件记录编号必须引用原表中非空且唯一的列。')
 const numericFields=sourceTable.numericFields??[]
 if(!Array.isArray(numericFields)||new Set(numericFields).size!==numericFields.length||
    numericFields.some(name=>name===identity||!header.includes(name)))throw Error('数值字段必须是不同的附件原列，不能转换编号。')
 const columns=delimitedRecordFields(header,identity)
 const numeric=new Set(numericFields)
 if(fields!==undefined){
  if(!Array.isArray(fields)||!fields.every(field=>field&&typeof field==='object'&&!Array.isArray(field)&&
     Object.keys(field).every(key=>['key','label','unit'].includes(key)))||new Set(fields.map(field=>field.label)).size!==fields.length)
   throw Error('附件字段说明必须对应不同的原表列。')
  for(const field of fields){
   const original=columns.find(column=>column.label===field.label&&(column.key===field.key||column.label===field.key))
   if(!original||field.unit!==undefined&&(!numeric.has(field.label)||typeof field.unit!=='string'||!field.unit.trim()||!field.label.includes(field.unit)))
    throw Error('附件字段说明只能保留原列名称和明确写在原表头的单位。')
   if(field.unit!==undefined)original.unit=field.unit
  }
 }
 const number=value=>{
  if(value==='')return null
  if(String(Number(value))!==decimalValue(value))
   throw Error('附件数值列包含不能无损转换的原值。保留该列为文本，或选择确为数值的原列。')
  return Number(value)
 }
 return {id,label,...(recordScope!==undefined?{recordScope}:{}),asOf:'附件原表快照',note:`${sourceTable.document} [${sourceTable.block}]`,
  fields:columns,records:rows.map((row,index)=>({...(!identity?{id:'row-'+(index+1)}:{}),
   ...Object.fromEntries(columns.slice(identity?0:1).map(({key,label},i)=>[key,numeric.has(label)?number(row[i]):row[i]]))}))}
}

export function resolveDelimitedDatasetReferences(plan, documents) {
 const columnsByDataset=new Map();
 const sharedDatasets=plan.sharedDatasets.map(dataset=>{
  if(!dataset||!Object.hasOwn(dataset,'sourceTable'))return dataset;
  const resolved=materializeDelimitedDataset(dataset,documents);
  columnsByDataset.set(resolved.id,resolved.fields);
  return resolved;
 });
 const lookup=dataset=>{
  const columns=columnsByDataset.get(dataset);
  if(!columns)return;
  const keys=new Set(columns.map(column=>column.key));
  const labels=new Map(columns.filter(column=>column.key!=='id'||column.label!=='附件行号').map(column=>[column.label,column.key]));
  return name=>keys.has(name)?name:labels.get(name)??name;
 };
 const mapArray=(value,map)=>Array.isArray(value)?value.map(map):value;
 const mapFields=(value,resolve)=>{
  const mapped=mapArray(value,resolve);
  return Array.isArray(value)&&new Set(value).size===value.length?[...new Set(mapped)]:mapped;
 };
 const mapField=(object,key,resolve)=>Object.hasOwn(object,key)?{...object,[key]:resolve(object[key])}:object;
 const orderedFields=/(?:按|按照|依据)(?:原表|附件|清单)(?:的)?([\p{L}\p{N}_-]+(?:\s*[、→]\s*[\p{L}\p{N}_-]+){1,7}?)(?:逐层)?(?:展示|呈现|排列)/u.exec(plan.originalRequest??'')?.[1]?.split(/\s*[、→]\s*/u);
 const hierarchyPanels=plan.panels?.filter?.(panel=>['mind-map','markdown'].includes(panel?.type)&&/组织关系|组织.*(?:层级|结构)|组织架构|层级总览/u.test(panel.title));
 const [onlyDataset]=columnsByDataset.keys();
 const autoHierarchy=columnsByDataset.size===1&&hierarchyPanels?.length===1&&orderedFields?.every(label=>columnsByDataset.get(onlyDataset).some(field=>field.key===label||field.label===label))
  ? hierarchyPanels[0] : undefined;
 return {...plan,sharedDatasets:sharedDatasets.map(dataset=>{
  const aggregate=dataset?.aggregate;
  const resolve=lookup(aggregate?.dataset);
  return resolve?{...dataset,aggregate:{...aggregate,groupBy:mapArray(aggregate.groupBy,resolve),measures:mapArray(aggregate.measures,measure=>{
   if(!measure||typeof measure!=='object')return measure;
   const mapped=mapField(measure,'field',resolve);
   return measure.where&&typeof measure.where==='object'?{...mapped,where:mapField(measure.where,'field',resolve)}:mapped;
  })}}:dataset;
 }),panels:mapArray(plan.panels,panel=>{
  if(panel?.hierarchy){
   const resolve=lookup(panel.hierarchy.dataset);
   return resolve?{...panel,hierarchy:{...panel.hierarchy,levels:mapArray(panel.hierarchy.levels,resolve),
    ...(panel.hierarchy.details===undefined?{}:{details:mapFields(panel.hierarchy.details,resolve)})}}:panel;
  }
  const directHierarchyView=panel?.type==='mind-map'&&panel.view?.dataset===onlyDataset&&Object.keys(panel.view??{}).every(key=>['dataset','sections'].includes(key))&&
   Array.isArray(panel.view?.sections)&&panel.view.sections.every(section=>section?.kind==='records'&&Array.isArray(section.fields)&&Object.keys(section).every(key=>['kind','title','fields'].includes(key)));
  if(panel===autoHierarchy&&(!panel.content||panel.type==='mind-map'&&panel.content.rows===undefined)&&(!panel.view||directHierarchyView)&&!panel.library&&!panel.publicData){
   const {artifact,content,view,...base}=panel;
   const resolve=lookup(onlyDataset);
   const details=view?.sections.flatMap(section=>section.fields).map(resolve);
   return {...base,type:'mind-map',hierarchy:{dataset:onlyDataset,levels:orderedFields.map(resolve),...(details?.length?{details:[...new Set(details)]}:{})}};
  }
  const view=panel?.view;
  const resolve=lookup(view?.dataset);
  if(!resolve)return panel;
  const mapped={...view};
  for(const key of ['filters','details'])if(Object.hasOwn(view,key))mapped[key]=mapFields(view[key],resolve);
  if(Object.hasOwn(view,'where'))mapped.where=mapArray(view.where,rule=>rule&&typeof rule==='object'?mapField(rule,'field',resolve):rule);
  mapped.sections=mapArray(view.sections,section=>{
   if(!section||typeof section!=='object')return section;
   return Object.hasOwn(section,'fields')?{...mapField(section,'label',resolve),fields:mapFields(section.fields,resolve)}:
    ['label','start','end','owner','resource'].reduce((result,key)=>mapField(result,key,resolve),section);
  });
  const tableOrSchedule=panel.type==='table'||panel.type==='timeline'&&mapped.sections?.some?.(section=>section?.kind==='schedule');
  const type=tableOrSchedule&&panel.artifact===undefined&&panel.content===undefined?'view':panel.type;
  return {...panel,type,view:mapped};
 })};
}

// Only complete record projections are compared with full file rows. Aggregate
// views and explicitly selected subsets have different, narrower obligations.
export function delimitedTableIntegrityIssue(output,documents,request='') {
 const candidates=extractArtifactObjects(output)
 if(candidates.length!==1)return
 const data=retainedTableData(candidates[0])??readTemplateModel(candidates[0])?.data??candidates[0]
 if(!Array.isArray(data.rows)||!Array.isArray(data.columns))return
 const label=column=>typeof column==='string'?column:column?.label??column?.key
 const compact=value=>String(value??'').normalize('NFKC').trim()
 for(const document of documents??[]){
  if(!['csv','tsv'].includes(document.format))continue
  const [header,...original]=document.blocks[0].rows
  const mapping=data.columns.map(column=>header.findIndex(name=>compact(name)===compact(label(column))))
  // Require the original unique record key and another original field. Do not
  // guess that a summary keyed by team is the whole task-level projection.
  const unique=header.map((_,i)=>i).find(i=>original.every(row=>row[i]!=='' )&&new Set(original.map(row=>row[i])).size===original.length)
  const key=unique===undefined?-1:mapping.indexOf(unique)
  if(key<0||mapping.filter(i=>i>=0).length<2)return
  const byKey=new Map(original.map(row=>[compact(row[unique]),row]))
  // A full source count preceding an explicit filter describes acquisition,
  // not delivery. Resolve one unambiguous quoted field/literal predicate only;
  // never guess compound or arbitrary natural-language conditions.
  const filters=[...request.matchAll(/["“‘]([^"”’]+)["”’]\s*(?:字段|列)?\s*(不等于|不是|不为|!=|等于|为|是|=)\s*["“‘]([^"”’]*)["”’]/gu)]
  const subset=/(?:中|里)\s*筛选|筛(?:选出|出)/u.test(request)||filters.length>0&&/(?:仅|只)(?:保留|展示|列出?)/u.test(request)
  let selected
  if(subset&&filters.length===1&&!/且|并且|同时|或者|或是|\b(?:and|or)\b|&&|\|\|/iu.test(request)){
   const [,name,operator,value]=filters[0],field=header.findIndex(label=>compact(label)===compact(name))
   if(field>=0){const negative=['不等于','不是','不为','!='].includes(operator);selected=new Set(original.filter(row=>(compact(row[field])===compact(value))!==negative).map(row=>compact(row[unique])))}
  }
  const seen=new Set()
  for(const row of data.rows){
   const id=compact(row[key]),source=byKey.get(id)
   if(!source||seen.has(id))return `CSV 记录对应不完整：存在来源中没有或重复的编号 ${id}。直接保留原记录键，不重新编号、拼接或按规律重建。`
   if(selected&&!selected.has(id))return `CSV 记录 ${id} 不符合明确的筛选条件，不能把其他来源记录混入筛选交付。`
   seen.add(id)
   for(let i=0;i<mapping.length;i++)if(mapping[i]>=0){
    const expected=compact(source[mapping[i]]),actual=compact(row[i])
    const sameNumericValue=typeof row[i]==='number'&&Number.isFinite(row[i])&&String(row[i])===decimalValue(expected)
    if(actual!==expected&&!sameNumericValue&&!(expected===''&&['','—'].includes(actual)))return `CSV 原记录 ${id} 的“${header[mapping[i]]}”与原文件不一致。保留该行原始字段及完整长正文，不错配负责人、重算编号或压缩为摘要。`
   }
  }
  // Complete belongs to the selected scope: a complete risk subset is not
  // the full source file. Only explicit whole-record obligations demand all
  // source keys; field identity/correspondence above applies to every subset.
  const whole=/(?:全部|所有|全量)(?:的)?(?:原始)?(?:记录|数据行|明细)|完整记录明细|每条(?:原始)?记录.{0,16}(?:保留|字段)/u.test(request)||new RegExp('(?:全部|所有|全量)\\s*'+original.length+'\\s*条','u').test(request)
  if(selected&&seen.size!==selected.size)return `CSV 筛选交付不齐：筛选来源 ${selected.size} 条，实际 ${seen.size} 条。保留全部符合条件的原记录及完整字段。`
  if(!subset&&whole&&seen.size!==original.length)return `CSV 交付记录不齐：来源 ${original.length} 条，实际 ${seen.size} 条。使用全部原始记录，不能只按标题或声明条数标记完成。`
 }
}
