import {matchesDatasetViewScope} from './dataset-view-runtime.js';
// A canonical snapshot plus declarative field references. No model-authored
// executable code or independently restated record values are part of a view.
import {compactDatasetGroupLabel,materializeDatasetAggregate} from './dataset-aggregate.js'
import {publicTableSourceHref} from './component-provenance.js'
import {parseDerivedSpec} from './derived-template-contract.js'
import {chartDataIssue,chartFieldUnit,orderDatedChartRows} from './chart-template-contract.js'
// Complete host data has a bounded storage budget independent of display or
// model-observation pages. Never satisfy a budget by trimming source records.
export const WORKBENCH_DATASET_LIMITS=Object.freeze({datasets:16,records:10000,fields:24,cellCharacters:8000,datasetBytes:2000000,totalBytes:8000000})
export const DATASET_VIEW_LIMITS=Object.freeze({sections:4,viewBytes:8000})
const forbidden=new Set(['__proto__','prototype','constructor'])
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[null,Object.prototype].includes(Object.getPrototypeOf(value))
const text=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0)
const id=v=>text(v,128)&&v.trim()===v&&!forbidden.has(v)
const fieldKey=v=>typeof v==='string'&&/^\p{L}[\p{L}\p{N}\p{M}_-]{0,63}$/u.test(v)&&!forbidden.has(v)
export function mapWorkbenchPanelFields(panel,resolveField){
 const mapList=(value,resolve)=>Array.isArray(value)?value.map(resolve):value
 const mapFields=(value,resolve)=>Array.isArray(value)&&new Set(value).size===value.length?[...new Set(value.map(resolve))]:mapList(value,resolve)
 const mapKeys=(object,keys,resolve)=>({...object,...Object.fromEntries(keys.filter(key=>Object.hasOwn(object,key)).map(key=>[key,resolve(object[key])]))})
 const hierarchy=panel?.hierarchy,view=panel?.view
 if(object(hierarchy)){
  const resolve=key=>resolveField(hierarchy.dataset,key)
  return {...panel,hierarchy:mapKeys(hierarchy,['levels','details'],value=>mapList(value,resolve))}
 }
 if(!object(view))return panel
 const resolve=key=>resolveField(view.dataset,key)
 const rules=value=>mapList(value,rule=>object(rule)?mapKeys(rule,['field'],resolve):rule)
 const sections=value=>mapList(value,section=>{
  if(!object(section))return section
  const names=section.kind==='schedule'?['label','start','end','owner','resource']:panel.type==='chart'||view.variant!==undefined?['label']:[]
  return mapKeys(mapKeys(section,names,resolve),['fields'],fields=>mapFields(fields,resolve))
 })
 return {...panel,view:{...mapKeys(view,['filters','details'],value=>mapFields(value,resolve)),
  ...(Object.hasOwn(view,'label')?{label:resolve(view.label)}:{}),
  ...(Object.hasOwn(view,'where')?{where:rules(view.where)}:{}),
  ...(Object.hasOwn(view,'sections')?{sections:sections(view.sections)}:{})}}
}

export function resolveWorkbenchPanelLabels(panel,datasets){
 const requested=panel?.view?.type;
 const recordsView=panel?.type==='view'&&requested==='table';
 if(recordsView||requested===panel?.type||panel?.type==='view'&&['chart','kpi','timeline'].includes(requested)){
  if(requested!==undefined){
   const {type,...view}=panel.view;
   panel={...panel,type:recordsView?'view':type,view};
  }
 }
 // Some planners call a continuous record view “stack”. Keep the stored
 // navigation canonical without changing an independently declared layout.
 if(['view','table'].includes(panel?.type)&&panel.view?.navigation==='stack')
  panel={...panel,view:{...panel.view,navigation:'flow'}};
 if(panel?.type==='chart'&&panel.view?.navigation==='flow'&&panel.view.sections?.length===1){
  const {navigation,...view}=panel.view
  panel={...panel,view}
 }
 const declared=panel?.view;
 if(panel?.type==='kpi'&&declared?.sections===undefined&&
    datasets?.some(dataset=>dataset.id===declared?.dataset&&dataset.groupBy?.length===0&&dataset.records.length===1))
  panel={...panel,view:{...declared,sections:[{kind:'records'}]}};
 if(['view','table'].includes(panel?.type)&&declared?.sections===undefined&&Array.isArray(declared?.where)&&declared.where.length){
  const source=datasets?.find(dataset=>dataset.id===declared.dataset);
  if(source)panel={...panel,view:{...declared,sections:[{kind:'records',fields:source.fields.map(field=>field.key)}]}};
 }
 const resolved=mapWorkbenchPanelFields(panel,(datasetId,key)=>{
  const fields=datasets?.find(dataset=>dataset.id===datasetId)?.fields
  if(!fields||fields.some(field=>field.key===key))return key
  const matches=fields.filter(field=>field.label===key)
  if(matches.length===1)return matches[0].key
  if(matches.length||typeof key!=='string')return key
  const plain=fields.filter(field=>field.label.replace(/\s*[（(][^）()]+[）)]$/u,'')===key)
  return plain.length===1?plain[0].key:key
 })
 if(!['chart','view','table'].includes(resolved?.type)||!Array.isArray(resolved.view?.sections))return resolved;
 const source=datasets?.find(dataset=>dataset.id===resolved.view.dataset);
 const fields=source?.fields;
 const genericIndex=resolved.type!=='chart'&&/^(?:记录编号|附件行号|原型记录行号|序号|ID)$/iu.test(fields?.find(field=>field.key==='id')?.label??'')&&
  !/(?:只|仅)(?:显示|展示|保留)|隐藏/u.test(resolved.prompt??'');
 const dimensions=genericIndex?fields.filter(field=>field.key!=='id'&&source.records.every(record=>typeof record[field.key]==='string'&&record[field.key].trim())):[];
 const listedFields=resolved.type==='chart'?[]:[...(resolved.prompt??'').matchAll(/(?:字段(?:包括|包含|含|有|为)?|保留(?:字段|每(?:一)?(?:条|行)(?:记录|数据)?的?)?)\s*[:：]?\s*([^。；;\n]{1,180})/gu)].flatMap(([,list])=>{
  const parts=list.replace(/[（(][^）)]*[）)]/gu,'').split(/[、，,]/u)
   .map(item=>item.trim().replace(/\s*[一二两三四五六七八九十\d]+列$/u,''));
  if(parts.length<2)return [];
  return parts.flatMap(part=>{
   const field=fields?.find(field=>field.key===part||field.label.replace(/[（(][^）)]*[）)]$/u,'')===part);
   return field?[field.key]:[];
  });
 });
 const sections=resolved.view.sections.map(section=>{
  if(section?.kind!=='records')return section;
  if(listedFields.length>=2&&Array.isArray(section.fields)){
   const keys=[...new Set([...listedFields,...section.fields])];
   if(keys.length<=24)section={...section,fields:keys};
  }
  const onlyDimension=dimensions.length===1?dimensions[0].key:undefined;
  if(onlyDimension&&Array.isArray(section.fields)&&!section.fields.includes(onlyDimension)&&section.fields.length<24)
   section={...section,fields:[onlyDimension,...section.fields]};
  if(typeof section.start!=='string'||section.end!==undefined)return section;
  const date=fields?.find(field=>field.key===section.start||field.label===section.start);
  if(!date||![date.key,date.label].includes(section.label))return section;
  const {start,...content}=section;
  if(resolved.type==='chart')return {...content,label:date.key};
  return {...content,...(Array.isArray(content.fields)&&!content.fields.includes(date.key)?{fields:[date.key,...content.fields]}:{})};
 });
 // A table has no separate category axis. An explicit table hint can repeat
 // the single record section's leading field after resolving source headers.
 const view={...resolved.view,sections};
 if(recordsView&&sections.length===1&&sections[0]?.kind==='records'&&
    typeof view.label==='string'&&Array.isArray(sections[0].fields)&&
    sections[0].fields[0]===view.label&&fields?.some(field=>field.key===view.label))
  delete view.label;
 return {...resolved,view};
}
function check(condition,message){if(!condition)throw Error(message)}
function exact(value,required,optional=[]){return object(value)&&required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k))}
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length
function cell(value){
 if(value===null||typeof value==='boolean')return true
 if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value)<=1e15
 if(typeof value==='string')return text(value,WORKBENCH_DATASET_LIMITS.cellCharacters,true)
 return Array.isArray(value)&&value.length<=50&&value.every(v=>text(v,WORKBENCH_DATASET_LIMITS.cellCharacters,true))
}
// Only the simulated planning entry point may fill absent metadata and mark
// omitted declared cells unknown. Never infer values, IDs or dates, remove extra
// fields, or relax saved/source artifacts.
export function simulatedDatasetMetadata(value){
 return Array.isArray(value)?value.map(d=>object(d)&&d.aggregate===undefined?{...d,...(!Object.hasOwn(d,'note')?{note:'用户请求的模拟数据'}:{}),...(!Object.hasOwn(d,'asOf')?{asOf:'模拟数据，时点未指定'}:{}),...(Array.isArray(d.fields)&&Array.isArray(d.records)?{records:d.records.map(r=>object(r)?{...Object.fromEntries(d.fields.filter(f=>object(f)&&fieldKey(f.key)&&f.key!=='id').map(f=>[f.key,null])),...r}:r)}:{})}:d):value
}
// A chart axis is field metadata only for explicitly selected measures. Carry it
// onto the canonical descriptors so all views of this dataset render the same units.
function applySharedChartUnits(dataset,panels){
 const claims=new Map()
 for(const panel of panels){
  const view=panel?.view
  if(view?.dataset!==dataset.id||panel.artifact!==undefined||!text(view.unit,64)||
     !(panel.type==='chart'||panel.type==='view'&&view.type==='chart')||!Array.isArray(view.sections)||view.sections.length!==1)continue
  const resolved=resolveWorkbenchPanelLabels(panel,[dataset]).view
  const [section]=resolved.sections
  if(!['records','compare'].includes(section?.kind)||!Array.isArray(section.fields))continue
  const measures=section.fields.filter(key=>key!=='id'&&key!==section.label&&key!==resolved.label&&!dataset.groupBy?.includes(key))
   .map(key=>dataset.fields.find(field=>field.key===key))
   .filter(field=>field&&dataset.records.some(row=>Number.isFinite(row[field.key]))&&
    dataset.records.every(row=>row[field.key]===null||Number.isFinite(row[field.key])))
  // A single-series chart can also declare extra fields solely for its detail table.
  if(measures.length>1&&!['groupedBar','dumbbell'].includes(resolved.variant))continue
  for(const field of measures){
   if(chartFieldUnit(field)||/[（(][^）()]+[）)]$/u.test(field.label))continue
   // An unlabelled rate could be a fraction, percent or basis points.
   if([field.key,field.label].some(name=>/率|占比|比例|百分|[%％]|(?:rate|ratio|pct|percent(?:age)?)$/iu.test(name))&&
      !/^(?:%|％|比例|百分点|基点|bp|bps)$/iu.test(view.unit))continue
   if(!claims.has(field.key))claims.set(field.key,new Set())
   claims.get(field.key).add(view.unit)
  }
 }
 for(const field of dataset.fields){
  const units=claims.get(field.key)
  if(units?.size===1)field.unit=units.values().next().value
 }
}
export function validateWorkbenchDatasets(value,panels=[]){
 check(Array.isArray(value)&&value.length>=1&&value.length<=WORKBENCH_DATASET_LIMITS.datasets,`共同数据需要1–${WORKBENCH_DATASET_LIMITS.datasets}份完整记录集；不能删除来源来满足容量。`)
 if(value.some(d=>object(d)&&d.aggregate!==undefined)){
  const complete=new Map(),pending=[...value]
  check(new Set(value.map(d=>d?.id)).size===value.length,'共同数据集编号无效或重复。')
  const missingSumFields=value.flatMap(d=>{
   const config=d?.aggregate
   if(!id(d?.id)||!id(config?.dataset)||!Array.isArray(config.measures)||config.measures.length>12)return []
   return config.measures.filter(m=>m?.op==='sum'&&m.field===undefined&&fieldKey(m.key))
    .map(m=>`「${d.id}」的「${m.key}」需要 field（来源「${config.dataset}」）`)
  })
  check(!missingSumFields.length,`共同数据汇总：请一次补齐以下求和项的来源数值字段键：${missingSumFields.join('、')}。`)
  while(pending.length){
   let progress=false
   for(let i=0;i<pending.length;){
    const d=pending[i]
    if(object(d)&&d.aggregate!==undefined){
     check(exact(d,['id','label','aggregate'],['note'])&&id(d.id)&&text(d.label,200)&&(d.note===undefined||text(d.note,8000)),`共同数据集 ${d.id??'未命名'}：汇总数据只声明id、label、aggregate及可选note，不独立提供records或估算值；当前多余字段：${Object.keys(d).filter(k=>!['id','label','note','aggregate'].includes(k)).join('、')||'无'}。需要负责人职责等非派生信息时另保留原记录集，不能删掉业务信息去凑汇总。`)
     const source=complete.get(d.aggregate?.dataset);if(!source){i++;continue}
     const note=d.note&&d.note!==source.note&&!d.note.startsWith(source.note+'\n')?source.note+'\n'+d.note:d.note??source.note;
     complete.set(d.id,validateWorkbenchDatasets([materializeDatasetAggregate({...d,note},source)])[0])
    }else complete.set(d?.id,validateWorkbenchDatasets([d])[0])
    pending.splice(i,1);progress=true
   }
   check(progress,'共同数据汇总引用了不存在的来源或形成循环；不能改用独立估算。')
  }
  return validateWorkbenchDatasets(value.map(d=>complete.get(d.id)),panels)
 }
 const ids=new Set(),result=[]
 for(let d of value){
  if(d?.identity==='id'){
   // Direct records already use id as their canonical identity. All row validation still applies.
   const {identity,...dataset}=d
   d=dataset
  }
  check(exact(d,['id','label','asOf','note','fields','records'],['recordScope','groupBy','sourceUrl']),`共同数据集 ${d?.id??'未命名'} 字段无效，必须提供id、label、asOf、note、fields和records；缺少：${['id','label','asOf','note','fields','records'].filter(k=>!object(d)||!Object.hasOwn(d,k)).join('、')||'无'}；多余：${object(d)?Object.keys(d).filter(k=>!['id','label','asOf','note','fields','records','recordScope','groupBy','sourceUrl'].includes(k)).join('、')||'无':'无'}。`)
  check(id(d.id)&&!ids.has(d.id),'共同数据集编号无效或重复。');ids.add(d.id)
  check(d.sourceUrl===undefined||typeof d.sourceUrl==='string'&&publicTableSourceHref(d.sourceUrl)===d.sourceUrl,'共同记录来源需使用公开披露链接。')
  check(d.recordScope===undefined||id(d.recordScope),'共同记录对象范围recordScope无效。')
  check(text(d.label,200)&&text(d.asOf,500)&&text(d.note,8000),'共同数据名称、时点和来源/演练说明不能为空或超过上限。')
  check(Array.isArray(d.fields)&&d.fields.length>=1&&d.fields.length<=WORKBENCH_DATASET_LIMITS.fields,'共同数据需要1–24个已命名字段。')
  check(bytes(d)<=WORKBENCH_DATASET_LIMITS.datasetBytes,`单份共同数据超过${WORKBENCH_DATASET_LIMITS.datasetBytes}字节的宿主存储配额；不能丢弃记录或字段。`)
  const keys=new Set(),fields=d.fields.map(f=>{
   check(exact(f,['key','label'],['unit','minimumFractionDigits'])&&
    (f.minimumFractionDigits===undefined||Number.isInteger(f.minimumFractionDigits)&&f.minimumFractionDigits>=0&&f.minimumFractionDigits<=12)&&fieldKey(f.key)&&!keys.has(f.key)&&text(f.label,100)&&(f.unit===undefined||text(f.unit,64)),'共同数据字段键、标签或单位无效或重复。')
   keys.add(f.key);return {key:f.key,label:f.label,...(f.unit===undefined?{}:{unit:f.unit}),...(f.minimumFractionDigits===undefined?{}:{minimumFractionDigits:f.minimumFractionDigits})}
  })
  // Stable identity is required on every record; its display label is host
  // metadata. Filling only that omitted descriptor never invents an identity
  // or changes a business field/value, and avoids a full-data model retry.
  if(!keys.has('id')){
   check(fields.length<WORKBENCH_DATASET_LIMITS.fields,'补充记录编号后字段超过24个；请按业务拆分，不截取字段。')
   fields.unshift({key:'id',label:'记录编号'});keys.add('id')
  }
  check(Array.isArray(d.records)&&d.records.length>=1&&d.records.length<=WORKBENCH_DATASET_LIMITS.records,`共同数据需要1–${WORKBENCH_DATASET_LIMITS.records}条完整记录；不能截取用户范围。`)
  const recordIds=new Set(),records=d.records.map(r=>{
   check(exact(r,[...keys]),`共同数据集 ${d.id} 记录 ${r?.id??'未编号'} 字段不匹配；缺少：${[...keys].filter(k=>!Object.hasOwn(r??{},k)).join('、')||'无'}；未声明：${Object.keys(r??{}).filter(k=>!keys.has(k)).join('、')||'无'}。保留原记录，缺失值填写null，不得删除业务字段。`)
   check(id(r.id)&&!recordIds.has(r.id),'共同记录编号无效或重复。');recordIds.add(r.id)
   const entry={};for(const {key} of fields){check(cell(r[key]),'共同记录只支持有限数值、布尔、null、文本和文本数组。');entry[key]=Array.isArray(r[key])?[...r[key]]:r[key]}
   return entry
  })
  check(d.groupBy===undefined||Array.isArray(d.groupBy)&&d.groupBy.length<=4&&(d.groupBy.length>0||records.length===1)&&new Set(d.groupBy).size===d.groupBy.length&&d.groupBy.every(key=>key!=='id'&&keys.has(key)),'汇总分组标识必须引用实际字段，全表汇总只有一条记录。')
  const copy={id:d.id,...(d.groupBy===undefined?{}:{groupBy:[...d.groupBy]}),...(d.recordScope===undefined?{}:{recordScope:d.recordScope}),label:d.label,asOf:d.asOf,note:d.note,...(d.sourceUrl?{sourceUrl:d.sourceUrl}:{}),fields,records}
  applySharedChartUnits(copy,panels)
  check(bytes(copy)<=WORKBENCH_DATASET_LIMITS.datasetBytes,`单份共同数据超过${WORKBENCH_DATASET_LIMITS.datasetBytes}字节的宿主存储配额；不能丢弃记录或字段。`);result.push(copy)
 }
 check(bytes(result)<=WORKBENCH_DATASET_LIMITS.totalBytes,`共同数据总量超过${WORKBENCH_DATASET_LIMITS.totalBytes}字节的宿主存储配额；不能截取用户范围。`)
 return freeze(result)
}
// Creation-time checks only: old saved documents remain readable. Within one
// explicit recordScope, the same stable record id / field denote the same fact.
// Dataset-local ids can overlap for unrelated entities without being rewritten.
function assertPreparedTeamAssignments(input){
 if(input.dataMode!=='simulated'||typeof input.originalRequest!=='string')return
 const request=input.originalRequest.replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|"[^"\n]*"/gu,'')
 const count=new Set([...request.matchAll(/(?<!\d)(\d{1,3})\s*(?:人|名成员)\s*(?:的)?(?:团队|小组)/gu)].filter(match=>
  !/(?:至少|不少于|不低于|最少|约|大约|超过|不要|不需要|非)\s*$/u.test(request.slice(Math.max(0,match.index-8),match.index))).map(match=>Number(match[1])).filter(n=>n>0&&n<=200))
 if(count.size!==1)return
 const [members]=count
 for(const dataset of input.sharedDatasets){
  // Only a recognizable task-assignment record set establishes team scope.
  // Audience, stakeholder, aggregate, unassigned and unrelated records do not.
  if(!dataset.fields.some(field=>/^(?:task|taskName|task_name)$/iu.test(field.key)||/^(?:任务|事项)(?:名称|标题)?$/u.test(field.label)))continue
  const owner=dataset.fields.filter(field=>/^(?:owner|assignee|responsible)$/iu.test(field.key)||/^(?:任务)?负责人$/u.test(field.label))
  if(owner.length!==1)continue
  const names=new Set(dataset.records.flatMap(record=>{
   const value=record[owner[0].key]
   return (Array.isArray(value)?value:[value]).filter(name=>typeof name==='string'&&name.trim()&&!/^(?:—|未分配|待定|未知)$/u.test(name.trim())).map(name=>name.trim())
  }))
  if(names.size>members)throw Error(`原请求为${members}人团队，共同任务记录「${dataset.label}」实际含${names.size}位负责人。保留全部任务、日期和依赖，只把负责人统一到同一批${members}名模拟成员；各卡复用该记录集，成员工作量由同一记录按负责人汇总，不删任务或另造汇总。`)
 }
}
export function assertWorkbenchViewSources(input){
 const datasets=input.sharedDatasets;if(!datasets)return
 assertPreparedTeamAssignments(input)
 const facts=new Map()
 for(const dataset of datasets)for(const record of dataset.records){
  const identity=JSON.stringify([dataset.recordScope===undefined?'local':'shared',dataset.recordScope??dataset.id,record.id])
  if(!facts.has(identity))facts.set(identity,new Map())
  const fields=facts.get(identity)
  for(const field of dataset.fields){
   if(field.key==='id')continue
   const previous=fields.get(field.key),encoded=JSON.stringify(record[field.key])
   check(!previous||previous.value===encoded&&previous.unit===field.unit,`共同记录${record.id}的${field.key}在数据集${previous?.dataset}与${dataset.id}中不一致；请将同一事实放入同一主记录，由各卡引用，不要猜测、覆盖或把null当成另一份已知值。`)
   fields.set(field.key,{value:encoded,unit:field.unit,dataset:dataset.id})
  }
 }
 // A generated child can read the snapshots. A native-only prepared plan
 // may also retain its common source records as evidence. Its delivery
 // coverage still comes from the actual rendered artifacts.
 if(input.panels.some(panel=>panel.type!=='view'&&!panel.artifact)||
    input.panels.every(panel=>panel.type!=='view'&&panel.artifact))return
 const used=new Set(input.panels.flatMap(panel=>[panel.view?.dataset,panel.hierarchy?.dataset]).filter(Boolean))
 for(const dataset of datasets)check(used.has(dataset.id),`共同数据集${dataset.id}没有任何组件引用；请修正view.dataset或合入实际使用的主记录，不能把未展示的数据算作组件已完成。`)
}

export function compileDatasetHierarchy(declaration,datasets,title){
 check(exact(declaration,['dataset','levels'],['details'])&&id(declaration.dataset)&&Array.isArray(declaration.levels)&&
  declaration.levels.length>=2&&declaration.levels.length<=8&&new Set(declaration.levels).size===declaration.levels.length,
  '层级需要共同记录集和 2–8 个不同字段，顺序从上级到记录。')
 const dataset=datasets?.find(d=>d.id===declaration.dataset)
 const fields=declaration.levels.map(key=>dataset?.fields.find(field=>field.key===key))
 check(dataset&&!dataset.groupBy&&fields.every(Boolean),'层级字段必须来自同一份完整原始记录。')
 const details=declaration.details??[]
 check(Array.isArray(details)&&details.length<=24&&details.every(key=>dataset.fields.some(field=>field.key===key)),'导图明细必须使用原表字段。')
 const roots=new Map()
 const singleLine=value=>String(value).replace(/[\r\n]+/gu,' ').trim()
 for(const record of dataset.records){
  let nodes=roots
  for(const field of fields.slice(0,-1)){
   const value=record[field.key]
   check((typeof value==='string'&&value.trim())||Number.isFinite(value),'层级字段缺少原值，不能猜测节点归属。')
   if(!nodes.has(value))nodes.set(value,new Map())
   nodes=nodes.get(value)
  }
  const label=record[fields.at(-1).key]
  check((typeof label==='string'&&label.trim())||Number.isFinite(label),'层级末级缺少原值，不能补造记录。')
  nodes.set(fields.at(-1).key==='id'?record.id:`${record.id} · ${singleLine(label)}`,new Map())
 }
 const lines=['# '+singleLine(title)]
 const visit=(nodes,depth)=>{
  for(const [value,children] of nodes){lines.push('  '.repeat(depth)+'- '+singleLine(value));visit(children,depth+1)}
 }
 visit(roots,0)
 const snapshot=[...new Set(['id',...declaration.levels,...details])]
 const citation=/^(.+?\.(?:csv|tsv) \[T\d+\])(?:\n|$)/iu.exec(dataset.note)?.[1]
 const artifact=parseDerivedSpec({version:1,type:'mind-map',title,content:lines.join('\n'),asOf:dataset.asOf,
  source:{title:citation??dataset.label,text:dataset.note+'\n'+JSON.stringify({fields:snapshot.map(key=>dataset.fields.find(field=>field.key===key).label),
   records:dataset.records.map(row=>snapshot.map(key=>row[key]))})}})
 check(artifact,'完整层级超过原生导图容量或含无效节点，请保留完整记录并按上级拆分。')
 return artifact
}

export function compileDatasetChart(config,datasets,title,variant,intent=''){
 if(object(config)&&Object.hasOwn(config,'label')&&config.sections?.length===1){
  const {label,...view}=config, [section]=view.sections;
  check(typeof label==='string'&&object(section)&&(section.label===undefined||section.label===label),'图表分类字段与记录区的分类字段不一致。');
  config={...view,sections:[{...section,label}]};
 }
 check(exact(config,['dataset','sections'],['variant','unit','note','subject','where'])&&id(config.dataset)&&Array.isArray(config.sections)&&config.sections.length===1,
  '共同数据图表只使用一个完整的记录区；需要交互筛选时请保留独立 view。')
 const [section]=config.sections
 const dataset=datasets?.find(d=>d.id===config.dataset)
 check(dataset&&exact(section,['kind'],['fields','label','title'])&&['records','compare'].includes(section.kind)&&
  (section.fields===undefined||Array.isArray(section.fields)&&section.fields.length>0),
  '共同数据图表需要实际记录集、分类字段和数值字段。')
 const group=dataset.groupBy?.length===1?dataset.groupBy[0]:undefined
 const getField=key=>dataset.fields.find(field=>field.key===key)
 const named=getField(section.label)
 const groupField=getField(group)
 const groupLabel=typeof section.label==='string'?section.label.replace(/(?:分类|分组)$/u,''):section.label
 const tokens=new Set(intent.match(/[A-Za-z][A-Za-z\d_.-]*/gu)??[]);
 const mentioned=field=>tokens.has(field.key)||field.label.length>=2&&intent.includes(field.label);
 // Grouped bars can leave an individual source cell empty without drawing a zero.
 const numericSeries=field=>dataset.records.every(row=>Number.isFinite(row[field.key])||variant==='groupedBar'&&row[field.key]===null)&&
  (section.fields?.includes(field.key)||dataset.records.some(row=>Number.isFinite(row[field.key])));
 const numeric=section.fields===undefined?dataset.fields.filter(field=>field.key!=='id'&&numericSeries(field)):[];
 const marked=numeric.filter(mentioned);
 const onlyMeasure=marked.length===1?marked:numeric.length===1?numeric:[];
 const selected=section.fields??onlyMeasure.map(field=>field.key);
 let implicit;
 if(section.label===undefined&&!dataset.groupBy?.length){
  const candidates=dataset.fields.filter(field=>
   (field.key!=='id'||!/^(?:记录编号|附件行号|原型记录行号)$/u.test(field.label))&&dataset.records.every(row=>typeof row[field.key]==='string'&&row[field.key].trim())&&
   new Set(dataset.records.map(row=>row[field.key])).size===dataset.records.length);
  const sameIdentity=candidates.some(field=>field.key!=='id'&&dataset.records.every(row=>row[field.key]===row.id));
  const possible=sameIdentity?candidates.filter(field=>field.key!=='id'):candidates;
  const stated=possible.filter(field=>selected.includes(field.key));
  implicit=(stated.length===1?stated[0]:possible.length===1?possible[0]:undefined)?.key;
 }
 const dimension=named?.key??(section.label===undefined||groupLabel===groupField?.label||groupLabel===group?group:undefined)??implicit;
 const dimensions=dataset.groupBy?.length>1&&(section.label===undefined||dataset.groupBy.includes(dimension))?dataset.groupBy:[dimension]
 const axes=dimensions.map(getField)
 const fields=selected.filter(key=>!dimensions.includes(key)).map(getField)
 check(axes.every(Boolean)&&fields.length&&fields.every(Boolean)&&new Set(fields).size===fields.length,'图表字段必须是共同记录的实际分类和数值列。')
 validateViewScope(config.where,dataset);
 const scoped=config.where?.length?dataset.records.filter(row=>matchesDatasetViewScope(row,config.where)):dataset.records;
 check(scoped.length,'图表范围内没有来源记录，请用明细如实显示空结果。');
 const records=axes.length===1&&/date|日期|时间/iu.test(axes[0].key+' '+axes[0].label)
  ?orderDatedChartRows(scoped,row=>row[axes[0].key]):scoped;
 const keys=records.map(row=>dimensions.map(key=>row[key]))
 const categories=keys.map(values=>values.join(' · '))
 check(keys.every(values=>values.every(value=>typeof value==='string'&&value.trim()))&&new Set(categories).size===categories.length,'每个绘图分类需要唯一且完整的原始名称；请先按图表分类汇总。')
 const longLabels=categories.some(label=>label.length>128)
 const labels=longLabels?categories.map(compactDatasetGroupLabel):categories
 const separateLabel=longLabels||axes.length>1
 const measures=fields.filter(numericSeries)
 check(measures.length,'共同数据图表没有完整的数值系列。')
 const preferred=config.unit===undefined?undefined:measures.find(field=>chartFieldUnit(field)===config.unit);
 const primaryUnit=chartFieldUnit(preferred??measures[0]);
 check(config.unit===undefined||text(config.unit,64)&&(!primaryUnit||primaryUnit===config.unit),'共同数据图表的单位与来源字段不一致。')
 const unit=config.unit??primaryUnit;
 const sameUnit=measures.filter(field=>chartFieldUnit(field)===primaryUnit)
 check(config.note===undefined||text(config.note,2000),'共同数据图表的说明过长或无效。')
 check(config.subject===undefined||text(config.subject,256),'共同数据图表的副标题无效。')
 const note=[...new Set([dataset.note,config.note].filter(Boolean))].join('\n');
 const base={version:1,type:'chart',title,variant,...(unit?{unit}:{}),...(config.subject?{subtitle:config.subject}:{}),asOf:dataset.asOf,note,sources:[{label:dataset.note.split('\n',1)[0],...(dataset.sourceUrl?{url:dataset.sourceUrl}:{})}]}
 if(variant==='funnel'){
  check(axes.length===1&&fields.length===1&&measures.length===1,'漏斗图引用一列有序阶段及一列同批次的数值。')
  const artifact={...base,stages:records.map(row=>({label:row[axes[0].key],value:row[measures[0].key]}))}
  const issue=chartDataIssue(artifact)
  check(!issue,`共同数据漏斗图无法完整显示：${issue}`)
  return artifact
 }
 if(variant==='groupedBar'&&axes.length===2&&fields.length===1){
  const labels=[...new Set(keys.map(([label])=>label))]
  const groups=[...new Set(keys.map(([,group])=>group))]
  const values=new Map(keys.map((key,index)=>[JSON.stringify(key),records[index][measures[0].key]]))
  check(groups.length>1&&values.size===labels.length*groups.length,'分组柱图需要完整的两维交叉数据；缺少组合时请保留分项，不能补零。')
  const artifact={...base,series:groups.map(name=>({name,values:labels.map(label=>values.get(JSON.stringify([label,name])))})),labels}
  const issue=chartDataIssue(artifact)
  check(!issue,`共同数据图表无法完整显示：${issue}`)
  return artifact
 }
 check(variant!=='groupedBar'||sameUnit.length>1,'分组柱图至少需要两个同单位的数值系列；其他原单位可保留为完整数据。')
 const singleSeriesIntent=!['groupedBar','dumbbell'].includes(variant)&&sameUnit.length>1&&!/两条|双序列|双线|多序列|多条|分别(?:绘制|展示|显示)/u.test(intent);
 const singleTargets=!singleSeriesIntent?[]:
  [...intent.matchAll(/(?:纵轴(?:为|是)?|绘制|展示|显示|画)\s*([^，。；;\n]{1,70})/gu)].flatMap(([,phrase])=>{
  const measure=phrase.replace(/^\d{4}[-/]\d{2}[-/]\d{2}\s*(?:至|到|—|–|~|～)\s*\d{4}[-/]\d{2}[-/]\d{2}\s*(?:(?:共)?[\d一二两三四五六七八九十]+(?:天|日))?的?\s*/u,'');
  const matches=sameUnit.filter(field=>measure.startsWith(field.label)).toSorted((a,b)=>b.label.length-a.label.length);
  const [field]=matches;
  if(!field)return [];
  const suffix=measure.slice(field.label.length).replace(/^(?:金额|数额|额|值|走势|趋势)/u,'');
  return /^(?:和|与|及|、|对比|分别)/u.test(suffix)?[]:[field];
 });
 const titleTargets=singleSeriesIntent&&!singleTargets.length?sameUnit.filter(field=>field.label.length>=2&&title.includes(field.label)):[];
 const explicitlyPlotted=new Set(singleTargets.length?singleTargets:titleTargets);
 const plotted=explicitlyPlotted.size===1?[...explicitlyPlotted]:sameUnit;
 const countDetails=dataset.groupBy?.length&&/(?:任务|事项|记录|条目)(?:数量|条数|数)|\d+\s*条(?:任务|事项|记录|条目)/u.test(intent)
  ?dataset.fields.filter(field=>!fields.includes(field)&&/^(?:任务|事项|记录|条目)(?:数量|条数|数)$/u.test(field.label)&&records.every(row=>Number.isSafeInteger(row[field.key])))
  :[];
 const detailFields=[...fields,...countDetails];
 const detailLabel=field=>field.unit&&field.unit!==unit&&!field.label.includes(field.unit)?`${field.label}（${field.unit}）`:field.label
 const artifact={...base,labels,
  series:plotted.map(field=>({name:field.label,values:records.map(row=>row[field.key])})),
  detailColumns:[...(separateLabel?['图表分类']:[]),...axes.map(field=>field.label),...detailFields.map(detailLabel)],
  detailRows:records.map((row,index)=>[...(separateLabel?[labels[index]]:[]),...keys[index],...detailFields.map(field=>row[field.key])])}
 const issue=chartDataIssue(artifact)
 check(!issue,`共同数据图表无法完整显示：${issue}`)
 return artifact
}
// Naive timestamps are intentionally rejected: different cards must not infer
// different time zones. Date-only values remain valid all-day scheduling data.
export function datasetScheduleTime(value){
 if(typeof value!=='string')return null
 const m=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/)
 if(!m)return null
 const y=Number(m[1]),month=Number(m[2]),day=Number(m[3]),date=new Date(Date.UTC(y,month-1,day))
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||m[4]!==undefined&&(Number(m[4])>23||Number(m[5])>59||Number(m[6]??0)>59))return null
 const time=Date.parse(value);return Number.isFinite(time)?time:null
}

export function compileSharedDatasetCard(type,config,datasets,title){
 if(type==='kpi'&&object(config)){
  const {groupBy,details,...view}=config;
  const section=Array.isArray(view.sections)&&view.sections.length===1?view.sections[0]:undefined;
  const duplicateDetails=details===undefined||Array.isArray(details)&&section?.kind==='records'&&
   (section.fields===undefined||Array.isArray(section.fields)&&details.every(field=>section.fields.includes(field)));
  if(duplicateDetails&&(groupBy===undefined||Array.isArray(groupBy)&&groupBy.length===0&&
     datasets?.some(dataset=>dataset.id===view.dataset&&dataset.groupBy?.length===0)))
   config=details!==undefined&&section.fields===undefined?{...view,sections:[{...section,fields:details}]}:view;
 }
 check(exact(config,['dataset','sections'],type==='timeline'?['subject','note','details']:['subject','note'])&&config.sections?.length===1,'指标和时间线从共同记录引用一个内容区，交互筛选请使用独立记录视图。')
 const source=datasets?.find(dataset=>dataset.id===config.dataset),[declared]=config.sections;
 if(type==='kpi'&&declared?.kind==='records'&&declared.fields===undefined&&source?.records.length===1)
  config={...config,sections:[{...declared,fields:source.fields.filter(field=>field.key!=='id').map(field=>field.key)}]};
 let timelineDetails=[];
 if(type==='timeline'&&declared?.kind==='schedule'){
  const {fields,...schedule}=declared;
  const {details,...timeline}=config;
  const available=new Set(source?.fields.map(field=>field.key));
  for(const list of [fields,details]){
   check(list===undefined||Array.isArray(list)&&list.length<=24&&new Set(list).size===list.length&&list.every(field=>available.has(field)),
    '时间线明细字段必须来自同一记录集。');
  }
  const label=schedule.label??(fields?.includes('id')||schedule.resource==='id'?'id':undefined);
  const end=schedule.end??schedule.start;
  const used=new Set([label,schedule.start,end,schedule.owner,schedule.resource,'id']);
  timelineDetails=[...new Set([...(fields??[]),...(details??[])])].filter(field=>!used.has(field));
  config={...timeline,sections:[{...schedule,label,end}]};
 }
 const {dataset,view}=validateDatasetView(config,datasets),[section]=view.sections;
 const note=[...new Set([dataset.note,view.note].filter(Boolean))].join('\n');
 const metadata={version:1,type,title,asOf:dataset.asOf,note,...(view.subject?{subject:view.subject}:{})};
 if(type==='kpi'){
  check(section.kind==='records'&&dataset.records.length===1,'共同数据指标卡使用一个 records 区引用单条汇总结果，整体统计使用 groupBy:[]。');
  const [row]=dataset.records;
  const fields=section.fields.map(key=>dataset.fields.find(field=>field.key===key));
  return {...metadata,items:fields.map(field=>({label:field.label,value:row[field.key],...(field.unit?{unit:field.unit}:{}),
   ...(row[field.key]===null?{missing:'来源缺值或计算条件不成立'}:{})}))};
 }
 check(section.kind==='schedule','共同数据时间线使用 schedule 区，以 label 指定事件标题，start 指定发生日期，单点事件 end 同 start。');
 return {...metadata,items:dataset.records.map(row=>{
  const label=row[section.label],time=row[section.start],end=row[section.end];
  check(text(label,256),'共同数据时间线的事件标题必须是原记录中非空文本。');
  const item={id:row.id,title:label,time,...(time===null?{timeMissing:'来源未提供发生时间'}:{}),
   ...(end!==null&&end!==time?{endTime:end}:{}),...(section.owner?{actor:row[section.owner]}:{}),
   ...(section.resource?{object:row[section.resource]}:label!==row.id?{object:row.id}:{})};
  for(const key of timelineDetails){
   const field=dataset.fields.find(candidate=>candidate.key===key);
   const name=Object.hasOwn(item,field.label)||forbidden.has(field.label)||['url','source'].includes(field.label)?`明细 · ${field.label} (${key})`:field.label;
   const value=row[key];
   item[name]=typeof value==='number'&&field.unit?`${value} ${field.unit}`:Array.isArray(value)?value.join(' · '):value;
  }
  return item;
 })};
}
function validateViewScope(where,dataset){
 const ref=key=>dataset.fields.some(field=>field.key===key);
 const scopeRule=rule=>{
  if(!object(rule)||!ref(rule.field))return false;
  if(rule.op==='notNull')return exact(rule,['field','op']);
  if(['gt','gte','lt','lte','ne'].includes(rule.op))return exact(rule,['field','op','value'])&&Number.isFinite(rule.value)&&
   dataset.records.every(record=>record[rule.field]===null||Number.isFinite(record[rule.field]));
  return rule.op==='in'&&exact(rule,['field','op','values'])&&Array.isArray(rule.values)&&rule.values.length>0&&rule.values.length<=64&&
   rule.values.every(value=>value===null||['string','number','boolean'].includes(typeof value)&&Number.isFinite(typeof value==='number'?value:0));
 };
 check(where===undefined||Array.isArray(where)&&where.length<=8&&where.every(scopeRule),'视图范围条件无效；使用in、notNull或数值列的gt、gte、lt、lte、ne，不删改共同记录。')
}
export function validateDatasetView(config,datasets){
 check(exact(config,['dataset','sections'],['subject','note','filters','where','details','reorder','navigation','layout']),'组合视图配置包含无效字段。')
 check(id(config.dataset),'组合视图必须引用有效的共同数据集。')
 const dataset=validateWorkbenchDatasets(datasets).find(d=>d.id===config.dataset)
 check(dataset,'组合视图引用的共同数据集不存在。')
 const keys=new Set(dataset.fields.map(f=>f.key))
 const ref=k=>typeof k==='string'&&keys.has(k)
 const refs=(list,min=0,max=24)=>Array.isArray(list)&&list.length>=min&&list.length<=max&&new Set(list).size===list.length&&list.every(ref)
 check(config.subject===undefined||text(config.subject,256),'组合视图主题无效。')
 check(config.note===undefined||text(config.note,2000),'组合视图业务说明无效。')
 check(config.filters===undefined||refs(config.filters,0,4),'筛选字段无效、重复或超过4项。')
 validateViewScope(config.where,dataset);

 check(config.details===undefined||refs(config.details),'详情字段无效或重复。')
 check(config.reorder===undefined||typeof config.reorder==='boolean','优先级排序设置无效。')
 check(config.navigation===undefined||['flow','tabs'].includes(config.navigation),'组合视图导航无效。')
 check(config.layout===undefined||['stack','split'].includes(config.layout),'组合视图布局无效。')
 check(Array.isArray(config.sections)&&config.sections.length>=1&&config.sections.length<=DATASET_VIEW_LIMITS.sections,'组合视图需要1–4个内容区。')
 const sections=config.sections.map(s=>{
  check(object(s)&&['records','compare','schedule'].includes(s.kind),'不支持的组合内容区类型；请保留业务需求并使用适合的组件。')
  check(s.title===undefined||text(s.title,100),'内容区标题无效。')
  if(s.kind==='records'||s.kind==='compare'){
   check(exact(s,['kind','fields'],['title','label'])&&refs(s.fields,1)&&(s.label===undefined||text(s.label,100)),'记录/对比字段无效、重复或为空。')
   const title=s.title??s.label
   return {kind:s.kind,...(title===undefined?{}:{title}),fields:[...new Set([...(dataset.groupBy??[]),...s.fields])]}
  }
  check(exact(s,['kind','label','start','end'],['title','owner','resource'])&&[s.label,s.start,s.end].every(ref)&&(s.owner===undefined||ref(s.owner))&&(s.resource===undefined||ref(s.resource)),'排程字段引用无效。')
  for(const r of dataset.records){
   const a=r[s.start],b=r[s.end],at=datasetScheduleTime(a),bt=datasetScheduleTime(b)
   check((a===null||at!==null)&&(b===null||bt!==null),`数据集 ${dataset.id} 记录 ${r.id} 排程日期无效：${s.start}=${a}、${s.end}=${b}；日内时间必须包含明确时区，缺失填null。`)
   check(at===null||bt===null||bt>=at,`数据集 ${dataset.id} 记录 ${r.id} 排程结束时间早于开始时间：${s.start}=${a}、${s.end}=${b}。仅修正该记录日期，保留其他记录。`)
  }
  return {...s}
 })
 check(!config.reorder||sections.some(s=>s.kind==='records'),'优先级排序需要可操作的记录内容区。')
 const view={dataset:config.dataset,...(config.where===undefined?{}:{where:config.where.map(rule=>({...rule,...(rule.values?{values:[...rule.values]}:{})}))}),...(config.subject===undefined?{}:{subject:config.subject}),...(config.note===undefined?{}:{note:config.note}),filters:[...(config.filters??[])],details:[...(config.details??[])],reorder:config.reorder??false,navigation:config.navigation??'flow',layout:config.layout??'stack',sections}
 check(bytes(view)<=DATASET_VIEW_LIMITS.viewBytes,'组合视图配置超过8000字节。')
 return freeze({dataset,view})
}
export function parseDatasetViewArtifact(value){
 check(exact(value,['version','type','title','dataset','view'],['context'])&&value.version===1&&value.type==='view'&&text(value.title,256)&&(value.context===undefined||text(value.context,3000)),'组合组件格式无效。')
 const {dataset,view}=validateDatasetView(value.view,[value.dataset])
 return freeze({version:1,type:'view',title:value.title,dataset,view,...(value.context===undefined?{}:{context:value.context})})
}
export function datasetViewDataIssue(value){try{parseDatasetViewArtifact(value)}catch(error){return error.message}}
export const DATASET_AGGREGATE_GUIDANCE='数量、状态计数、金额合计等派生汇总必须声明aggregate让宿主从完整主记录计算，禁止另抄汇总records。汇总集只含{id,label,note,aggregate:{dataset:来源集id,groupBy:[来源字段键],measures:[{key:结果字段键,label,op:"count|sum|percent",field?:求和来源字段,where?:{field:来源字段,equals:原值},numerator?:汇总分子键,denominator?:汇总分母键,digits?:百分比小数位,unit?}]}}，不填写asOf/fields/records；其余普通集仍提供完整原记录。groupBy支持0–4字段；groupBy:[]为单条全表汇总，可直接用type:kpi引用。count计条数，sum按数值原值合计，percent使用同一汇总中的 count/sum 分子、分母计算百分比；where仅支持明确原值相等筛选。多层汇总可引用已定义汇总集，不得循环。视图引用汇总集生成的字段，来源时点继承主记录。数据或交互超出此声明能力时保持实际用户需求，采用完整数据的适合表达，不能伪造汇总或硬套。';
export const DATASET_VIEW_GUIDANCE='完整明细表用type:view与records区，HTML内嵌原表用prototypeTable，其他支持的附件表用sourceTable。客户端分页渲染并在完整记录中搜索和筛选。风险/待办等子集用view.where:[{field:字段键,op:"in",values:[原值]}]或op:"notNull"限定，多个条件为且；filters最多4项，仅供交互，不代替默认范围。保留完整主记录。全部分组汇总用records，compare只对比两条。数量和金额汇总必须用aggregate声明来源集、分组和count/sum计算，不独立填写汇总records；详见aggregate字段协议。字段键保持一致。完整sharedDatasets可直接生成，同时允许sharedContext作为备注；不必为它切到deferred。用户明确结束日期后不可延长窗口；容量不足保留未排期与等待原因。同一批对象用一个完整主数据集，各卡view.dataset均引用该主数据集，不复制为排程/验收的另一份相同编号记录。每份数据必须有实际组件引用；跨数据集确为同批对象时显式给dataset相同recordScope，该范围内同一id的同名字段值与单位须一致，null也必须一致；不同实体保留各自业务编号，不推断跨表身份。panels完整清单与sharedDatasets必须一次调用同时提供：先列清单及各卡view，再填写共同记录，不先单独提交sharedDatasets。records每条必须有稳定id，直接用业务编号如B01，不另造r-B01或重复编号字段；宿主可补id的显示标签，不能推断记录编号。reorder由上移/下移按钮调整本卡顺序，不支持拖动，不另造会过时的priority数值列。未排期在列表与排程均保留null，其他共同事实也须一致。独立事件可另建数据集。同一工作台多卡复用记录时可提供sharedDatasets:[{id,label,asOf,note,fields:[{key,label,unit?}],records:[{id,...各字段原值}]}]，共同事实只确定一次。面板type:view，提供view:{dataset:"数据集id",filters:[字段键],details:[字段键],reorder:false,navigation:"flow|tabs",layout:"stack|split",sections:[{kind:"records|compare",fields:[字段键]}或{kind:"schedule",label:字段键,start:字段键,end:字段键,owner?:字段键,resource?:字段键}]}。宿主生成交互，不写HTML/JS或重复各卡数据。真实资料和明确模拟场景均支持sharedDatasets；真实资料必须保留实际asOf与note来源说明，缺失来源信息不能冒充模拟补齐。缺失填null，日内排程使用含时区的ISO时间；不能为满足组件而删改业务、缩小用户范围或改称模拟。'

const fieldKeysSchema={type:'array',items:{type:'string'}};
export const DATASET_HIERARCHY_SCHEMA={type:'object',additionalProperties:false,description:'原生思维导图，使用共同记录集。levels 按真实上下级排序，最后一个字段为记录名；每条原始记录都有带原编号的叶节点。',properties:{
 dataset:{type:'string',required:true},levels:{...fieldKeysSchema,required:true},details:{...fieldKeysSchema,description:'可选。来源快照内额外保留的原表字段。'}
}};
export const DATASET_VIEW_SCHEMA={type:'object',additionalProperties:false,properties:{
 dataset:{type:'string',required:true},label:{type:'string',description:'仅图表使用分类字段，优先放在唯一的 sections[0].label。明细表只填 records 分区的 fields。'},type:{type:'string',enum:['view','table','chart','kpi','timeline'],description:'面板类型由 panel.type 声明。明细表使用 panel.type=view 和 records 分区，省略内层 type。'},variant:{type:'string',enum:['bar','horizontal','line','area','groupedBar','dumbbell','funnel','candlestick','scatter'],description:'原生图表变体。用户贴出的完整金融台账可用 candlestick 或 scatter。'},unit:{type:'string',description:'仅 type:chart 的来源原单位。'},note:{type:'string',description:'组件的额外业务说明，不替代共同数据来源。'},subject:{type:'string'},filters:{...fieldKeysSchema,description:'最多4个用户可切换筛选字段；范围子集另用where声明。'},details:fieldKeysSchema,reorder:{type:'boolean'},navigation:{type:'string',enum:['flow','tabs','stack'],description:'连续显示各分区用 flow（兼容 stack），标签切换用 tabs。'},layout:{type:'string',enum:['stack','split']},
 where:{type:'array',description:'最多8个默认范围条件，多个条件为且。in用values；gt/gte（大于/含等号）、lt/lte（小于/含等号）、ne（不等于）对数值列用value；notNull不提供值。',items:{type:'object',additionalProperties:false,properties:{field:{type:'string',required:true},op:{type:'string',required:true,enum:['in','notNull','gt','gte','lt','lte','ne']},value:{type:'number'},values:{type:'array',items:{type:'json',description:'来源字段的原始字符串、数字、布尔或null，不接受对象或表达式。'}}}}},
 groupBy:{...fieldKeysSchema,description:'可省略。仅用于引用全表汇总的指标卡时可写 []，计算项仍须在 sharedDatasets.aggregate 声明。'},
 sections:{type:'array',description:'显式声明记录、图表和排程字段。只引用一条全表汇总的指标卡，或直接显示已声明筛选范围内所有字段的记录表，可省略。',items:{type:'object',additionalProperties:false,properties:{kind:{type:'string',required:true,enum:['records','compare','schedule']},title:{type:'string'},fields:fieldKeysSchema,label:{type:'string'},start:{type:'string'},end:{type:'string'},owner:{type:'string'},resource:{type:'string'}}}}
}};
export const WORKBENCH_DATASETS_SCHEMA={type:'array',description:'已取得的真实资料或用户允许的模拟场景，同一批对象只写一个主记录集，排程/对比/列表均引用它；每份数据必须有组件引用，同批对象跨表时显式声明相同recordScope，该范围内同id同名事实及单位不得矛盾。不同实体的编号独立；每条记录有稳定id并完整填写所有声明字段，缺失null。记录必须含id，id显示字段省略时由宿主补标签。完整数据按宿主存储配额校验，最多16组，每组10000条/24字段/2000000字节，总8000000字节；与显示或模型读取页大小无关。超限须保留完整范围并明确说明，不能截取记录、删除字段或猜共同值。',items:{type:'object',additionalProperties:false,properties:{
 id:{type:'string',required:true},recordScope:{type:'string',description:'可选。跨数据集确为同一批对象时提供相同范围如book；该范围内同id的同名事实/单位必须一致。省略时编号仅限本数据集，员工001与设备001不视为同一对象。'},label:{type:'string',required:true},asOf:{type:'string',description:'真实资料必填实际数据时点或明确的时点未提供说明。仅模拟模式可省略，由宿主标注模拟时点未指定，不猜日期。'},note:{type:'string',description:'真实资料必填实际出处及必要口径，不伪造来源。仅模拟模式可省略，由宿主标注用户请求的模拟数据。'},
 sourceRef:{type:'string',description:'本轮 research_workbench_source_catalog 返回的完整业务来源编号。与 id、label、fields 和 identity 一起使用，宿主沿用真实来源、时间和原始记录。'},
 identity:{type:'string',description:'sourceRef 原始记录中唯一稳定的文本编号字段，来源已有 id 时默认用 id。'},
 sourceTable:{type:'object',additionalProperties:false,description:'引用本轮已经解析的 CSV/TSV 附件。使用{id,label,sourceTable}，不重填records、fields、asOf或note。',properties:{
  document:{type:'string',required:true},block:{type:'string',required:true},identity:{type:'string',description:'实际唯一编号的原列名。作为视图字段id。'},numericFields:{type:'array',items:{type:'string'},description:'可无损转换成数值并参与汇总的原列名。'}
 }},
 documentGrid:{type:'object',additionalProperties:false,description:'直接引用本轮 Word 的原文段落、单元格或名单。只声明 id、label、documentGrid；宿主生成 id、name、group、text、citation。',properties:{
  document:{type:'string',required:true},blocks:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{
   block:{type:'string',required:true},layout:{type:'string',required:true,enum:['cells','paragraph','name-list']},skipHeader:{type:'boolean'},
   columns:{type:'array',items:{type:'integer'}}
  }}}
 }},
 prototypeTable:{type:'object',additionalProperties:false,description:'引用本轮 HTML 原型的完整静态数组。与 fields 同用，fields 填真实字段键与显示名；禁止重抄 records。宿主读齐数据并生成可搜索的原生视图。',properties:{
  document:{type:'string',required:true,description:'本轮附件文件名。'},section:{type:'string',required:true,description:'read_prototype 索引中的真实数据段路径。'},
  identity:{type:'string',description:'原数组中非空且唯一的字符串编号字段，保留前导零。没有业务编号时可省略，宿主使用原型行号。'},
  mode:{type:'string',enum:['rows','entries'],description:'rows 为静态数组。entries 为静态对象的原始键值对，fields 使用 key 和 value。'}
 }},
 pastedTable:{type:'object',additionalProperties:false,description:'直接使用本轮用户消息里从 Excel 粘贴的制表符原表或按 |、｜ 分隔的完整原表。首行表头可直接作为字段键时用 header:true 并省略 fields，其他情况按原列顺序声明 fields。省略 records、asOf、note。',properties:{
  block:{type:'integer',required:true,description:'消息中连续表段的 1-based 编号。'},header:{type:'boolean',description:'首行确为表头时填true，fields 的 key 或 label 与原表头对应。'},
  identity:{type:'string',description:'原表真实唯一编号的字段键，视图可用 id 引用。'},numericFields:{type:'array',items:{type:'string'}},
  derive:{type:'array',items:{type:'object',additionalProperties:false,properties:{key:{type:'string',required:true},label:{type:'string',required:true},
   op:{type:'string',required:true,enum:['subtract','percent']},left:{type:'string',required:true},right:{type:'string',required:true},unit:{type:'string'},digits:{type:'integer'}}}}
 }},
 aggregate:{type:'object',additionalProperties:false,description:DATASET_AGGREGATE_GUIDANCE,properties:{dataset:{type:'string',required:true},groupBy:{type:'array',required:true,items:{type:'string'}},measures:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{key:{type:'string',required:true},label:{type:'string',required:true},op:{type:'string',required:true,enum:['count','sum','percent']},field:{type:'string'},numerator:{type:'string'},denominator:{type:'string'},digits:{type:'integer'},unit:{type:'string'},where:{type:'object',additionalProperties:false,properties:{field:{type:'string',required:true},equals:{type:'json',description:'与来源标量严格相等的原值',required:true}}}}}}}},
 fields:{type:'array',items:{type:'object',additionalProperties:false,properties:{key:{type:'string',required:true},label:{type:'string',required:true},unit:{type:'string'}}}},
 records:{type:'array',items:{type:'object',additionalProperties:true,properties:{id:{type:'string',required:true,description:'直接使用稳定业务编号，如B01；每条必填且唯一。其他字段必须与fields声明一致。'}}}}
}}};
