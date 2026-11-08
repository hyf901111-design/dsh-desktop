// A canonical snapshot plus declarative field references. No model-authored
// executable code or independently restated record values are part of a view.
import {materializeDatasetAggregate} from './dataset-aggregate.js'
export const DATASET_VIEW_LIMITS=Object.freeze({datasets:5,records:200,fields:24,cellCharacters:8000,datasetBytes:48000,totalBytes:192000,sections:4,viewBytes:8000})
const forbidden=new Set(['__proto__','prototype','constructor'])
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[null,Object.prototype].includes(Object.getPrototypeOf(value))
const text=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0)
const id=v=>text(v,128)&&v.trim()===v&&!forbidden.has(v)
const fieldKey=v=>typeof v==='string'&&/^\p{L}[\p{L}\p{N}\p{M}_-]{0,63}$/u.test(v)&&!forbidden.has(v)
function check(condition,message){if(!condition)throw Error(message)}
function exact(value,required,optional=[]){return object(value)&&required.every(k=>Object.hasOwn(value,k))&&Object.keys(value).every(k=>required.includes(k)||optional.includes(k))}
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length
function cell(value){
 if(value===null||typeof value==='boolean')return true
 if(typeof value==='number')return Number.isFinite(value)&&Math.abs(value)<=1e15
 if(typeof value==='string')return text(value,DATASET_VIEW_LIMITS.cellCharacters,true)
 return Array.isArray(value)&&value.length<=50&&value.every(v=>text(v,DATASET_VIEW_LIMITS.cellCharacters,true))
}
// Only the simulated planning entry point may fill absent descriptive metadata.
// Never infer a date, change business records, or relax saved/source artifacts.
export function simulatedDatasetMetadata(value){
 return Array.isArray(value)?value.map(d=>object(d)?{...d,...(!Object.hasOwn(d,'note')?{note:'用户请求的模拟数据'}:{}),...(d.aggregate===undefined&&!Object.hasOwn(d,'asOf')?{asOf:'模拟数据，时点未指定'}:{})}:d):value
}
export function validateWorkbenchDatasets(value){
 check(Array.isArray(value)&&value.length>=1&&value.length<=DATASET_VIEW_LIMITS.datasets,'共同数据需要1–5份完整记录集。')
 if(value.some(d=>object(d)&&d.aggregate!==undefined)){
  const complete=new Map(),pending=[...value]
  check(new Set(value.map(d=>d?.id)).size===value.length,'共同数据集编号无效或重复。')
  while(pending.length){
   let progress=false
   for(let i=0;i<pending.length;){
    const d=pending[i]
    if(object(d)&&d.aggregate!==undefined){
     check(exact(d,['id','label','note','aggregate'])&&id(d.id)&&text(d.label,200)&&text(d.note,8000),`共同数据集 ${d.id??'未命名'}：汇总数据只声明id、label、note、aggregate，不独立提供records或估算值；当前多余字段：${Object.keys(d).filter(k=>!['id','label','note','aggregate'].includes(k)).join('、')||'无'}。需要负责人职责等非派生信息时另保留原记录集，不能删掉业务信息去凑汇总。`)
     const source=complete.get(d.aggregate?.dataset);if(!source){i++;continue}
     complete.set(d.id,validateWorkbenchDatasets([materializeDatasetAggregate(d,source)])[0])
    }else complete.set(d?.id,validateWorkbenchDatasets([d])[0])
    pending.splice(i,1);progress=true
   }
   check(progress,'共同数据汇总引用了不存在的来源或形成循环；不能改用独立估算。')
  }
  return validateWorkbenchDatasets(value.map(d=>complete.get(d.id)))
 }
 const ids=new Set(),result=[]
 for(const d of value){
  check(exact(d,['id','label','asOf','note','fields','records'],['recordScope']),`共同数据集 ${d?.id??'未命名'} 字段无效，必须提供id、label、asOf、note、fields和records；缺少：${['id','label','asOf','note','fields','records'].filter(k=>!object(d)||!Object.hasOwn(d,k)).join('、')||'无'}；多余：${object(d)?Object.keys(d).filter(k=>!['id','label','asOf','note','fields','records','recordScope'].includes(k)).join('、')||'无':'无'}。`)
  check(id(d.id)&&!ids.has(d.id),'共同数据集编号无效或重复。');ids.add(d.id)
  check(d.recordScope===undefined||id(d.recordScope),'共同记录对象范围recordScope无效。')
  check(text(d.label,200)&&text(d.asOf,500)&&text(d.note,8000),'共同数据名称、时点和来源/演练说明不能为空或超过上限。')
  check(Array.isArray(d.fields)&&d.fields.length>=1&&d.fields.length<=DATASET_VIEW_LIMITS.fields,'共同数据需要1–24个已命名字段。')
  const keys=new Set(),fields=d.fields.map(f=>{
   check(exact(f,['key','label'],['unit'])&&fieldKey(f.key)&&!keys.has(f.key)&&text(f.label,100)&&(f.unit===undefined||text(f.unit,64)),'共同数据字段键、标签或单位无效或重复。')
   keys.add(f.key);return {key:f.key,label:f.label,...(f.unit===undefined?{}:{unit:f.unit})}
  })
  // Stable identity is required on every record; its display label is host
  // metadata. Filling only that omitted descriptor never invents an identity
  // or changes a business field/value, and avoids a full-data model retry.
  if(!keys.has('id')){
   check(fields.length<DATASET_VIEW_LIMITS.fields,'补充记录编号后字段超过24个；请按业务拆分，不截取字段。')
   fields.unshift({key:'id',label:'记录编号'});keys.add('id')
  }
  check(Array.isArray(d.records)&&d.records.length>=1&&d.records.length<=DATASET_VIEW_LIMITS.records,'共同数据需要1–200条完整记录；不能截取用户范围。')
  const recordIds=new Set(),records=d.records.map(r=>{
   check(exact(r,[...keys]),'共同记录必须保留所有声明字段；缺失值显式填写null，不得新增未声明字段。')
   check(id(r.id)&&!recordIds.has(r.id),'共同记录编号无效或重复。');recordIds.add(r.id)
   const entry={};for(const {key} of fields){check(cell(r[key]),'共同记录只支持有限数值、布尔、null、文本和文本数组。');entry[key]=Array.isArray(r[key])?[...r[key]]:r[key]}
   return entry
  })
  const copy={id:d.id,...(d.recordScope===undefined?{}:{recordScope:d.recordScope}),label:d.label,asOf:d.asOf,note:d.note,fields,records}
  check(bytes(copy)<=DATASET_VIEW_LIMITS.datasetBytes,'单份共同数据超过48000字节；请按业务拆分，不能丢弃记录。');result.push(copy)
 }
 check(bytes(result)<=DATASET_VIEW_LIMITS.totalBytes,'共同数据总量超过192000字节。')
 return freeze(result)
}
// Creation-time checks only: old saved documents remain readable. Within one
// explicit recordScope, the same stable record id / field denote the same fact.
// Dataset-local ids can overlap for unrelated entities without being rewritten.
export function assertWorkbenchViewSources(input){
 const datasets=input.sharedDatasets;if(!datasets)return
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
 // A remaining generated child receives all snapshots as source context.
 // Fully prepared cards, however, cannot use an orphaned data set implicitly.
 if(input.panels.some(panel=>panel.type!=='view'&&!panel.artifact))return
 const used=new Set(input.panels.filter(panel=>panel.type==='view').map(panel=>panel.view.dataset))
 for(const dataset of datasets)check(used.has(dataset.id),`共同数据集${dataset.id}没有任何组件引用；请修正view.dataset或合入实际使用的主记录，不能把未展示的数据算作组件已完成。`)
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
export function validateDatasetView(config,datasets){
 check(exact(config,['dataset','sections'],['subject','filters','where','details','reorder','navigation','layout']),'组合视图配置包含无效字段。')
 check(id(config.dataset),'组合视图必须引用有效的共同数据集。')
 const dataset=validateWorkbenchDatasets(datasets).find(d=>d.id===config.dataset)
 check(dataset,'组合视图引用的共同数据集不存在。')
 const keys=new Set(dataset.fields.map(f=>f.key))
 const ref=k=>typeof k==='string'&&keys.has(k)
 const refs=(list,min=0,max=24)=>Array.isArray(list)&&list.length>=min&&list.length<=max&&new Set(list).size===list.length&&list.every(ref)
 check(config.subject===undefined||text(config.subject,256),'组合视图主题无效。')
 check(config.filters===undefined||refs(config.filters,0,4),'筛选字段无效、重复或超过4项。')
 check(config.where===undefined||Array.isArray(config.where)&&config.where.length<=8&&config.where.every(rule=>object(rule)&&ref(rule.field)&&(rule.op==='notNull'?exact(rule,['field','op']):rule.op==='in'&&exact(rule,['field','op','values'])&&Array.isArray(rule.values)&&rule.values.length>0&&rule.values.length<=64&&rule.values.every(value=>value===null||['string','number','boolean'].includes(typeof value)&&Number.isFinite(typeof value==='number'?value:0)))),'视图范围条件无效；使用字段原值的in列表或notNull，不删改共同记录。')

 check(config.details===undefined||refs(config.details),'详情字段无效或重复。')
 check(config.reorder===undefined||typeof config.reorder==='boolean','优先级排序设置无效。')
 check(config.navigation===undefined||['flow','tabs'].includes(config.navigation),'组合视图导航无效。')
 check(config.layout===undefined||['stack','split'].includes(config.layout),'组合视图布局无效。')
 check(Array.isArray(config.sections)&&config.sections.length>=1&&config.sections.length<=DATASET_VIEW_LIMITS.sections,'组合视图需要1–4个内容区。')
 const sections=config.sections.map(s=>{
  check(object(s)&&['records','compare','schedule'].includes(s.kind),'不支持的组合内容区类型；请保留业务需求并使用适合的组件。')
  check(s.title===undefined||text(s.title,100),'内容区标题无效。')
  if(s.kind==='records'||s.kind==='compare'){
   check(exact(s,['kind','fields'],['title'])&&refs(s.fields,1),'记录/对比字段无效、重复或为空。')
   return {kind:s.kind,...(s.title===undefined?{}:{title:s.title}),fields:[...s.fields]}
  }
  check(exact(s,['kind','label','start','end'],['title','owner','resource'])&&[s.label,s.start,s.end].every(ref)&&(s.owner===undefined||ref(s.owner))&&(s.resource===undefined||ref(s.resource)),'排程字段引用无效。')
  for(const r of dataset.records){
   const a=r[s.start],b=r[s.end],at=datasetScheduleTime(a),bt=datasetScheduleTime(b)
   check((a===null||at!==null)&&(b===null||bt!==null),'排程日期无效；日内时间必须包含明确时区，缺失填null。')
   check(at===null||bt===null||bt>=at,'排程结束时间早于开始时间。')
  }
  return {...s}
 })
 check(!config.reorder||sections.some(s=>s.kind==='records'),'优先级排序需要可操作的记录内容区。')
 const view={dataset:config.dataset,...(config.where===undefined?{}:{where:config.where.map(rule=>({...rule,...(rule.values?{values:[...rule.values]}:{})}))}),...(config.subject===undefined?{}:{subject:config.subject}),filters:[...(config.filters??[])],details:[...(config.details??[])],reorder:config.reorder??false,navigation:config.navigation??'flow',layout:config.layout??'stack',sections}
 check(bytes(view)<=DATASET_VIEW_LIMITS.viewBytes,'组合视图配置超过8000字节。')
 return freeze({dataset,view})
}
export function parseDatasetViewArtifact(value){
 check(exact(value,['version','type','title','dataset','view'],['context'])&&value.version===1&&value.type==='view'&&text(value.title,256)&&(value.context===undefined||text(value.context,3000)),'组合组件格式无效。')
 const {dataset,view}=validateDatasetView(value.view,[value.dataset])
 return freeze({version:1,type:'view',title:value.title,dataset,view,...(value.context===undefined?{}:{context:value.context})})
}
export function datasetViewDataIssue(value){try{parseDatasetViewArtifact(value)}catch(error){return error.message}}
export const DATASET_AGGREGATE_GUIDANCE='数量、状态计数、金额合计等派生汇总必须声明aggregate让宿主从完整主记录计算，禁止另抄汇总records。汇总集只含{id,label,note,aggregate:{dataset:来源集id,groupBy:[来源字段键],measures:[{key:结果字段键,label,op:"count|sum",field?:求和来源字段,where?:{field:来源字段,equals:原值},unit?}]}}，不填写asOf/fields/records；其余普通集仍提供完整原记录。groupBy支持1–4字段，count计条数，sum按数值原值合计；where仅支持明确原值相等筛选。多层汇总可引用已定义汇总集，不得循环。视图引用汇总集生成的字段，来源时点继承主记录。数据或交互超出此声明能力时保持实际用户需求，采用完整数据的适合表达，不能伪造汇总或硬套。';
export const DATASET_VIEW_GUIDANCE='风险/待办等子集用view.where:[{field:字段键,op:"in",values:[原值]}]或op:"notNull"限定，多个条件为且；filters最多4项，仅供交互，不代替默认范围。保留完整主记录。全部分组汇总用records，compare只对比两条。数量和金额汇总必须用aggregate声明来源集、分组和count/sum计算，不独立填写汇总records；详见aggregate字段协议。字段键保持一致。完整sharedDatasets可直接生成，同时允许sharedContext作为备注；不必为它切到deferred。用户明确结束日期后不可延长窗口；容量不足保留未排期与等待原因。同一批对象用一个完整主数据集，各卡view.dataset均引用该主数据集，不复制为排程/验收的另一份相同编号记录。每份数据必须有实际组件引用；跨数据集确为同批对象时显式给dataset相同recordScope，该范围内同一id的同名字段值与单位须一致，null也必须一致；不同实体保留各自业务编号，不推断跨表身份。panels完整清单与sharedDatasets必须一次调用同时提供：先列清单及各卡view，再填写共同记录，不先单独提交sharedDatasets。records每条必须有稳定id，直接用业务编号如B01，不另造r-B01或重复编号字段；宿主可补id的显示标签，不能推断记录编号。reorder由上移/下移按钮调整本卡顺序，不支持拖动，不另造会过时的priority数值列。未排期在列表与排程均保留null，其他共同事实也须一致。独立事件可另建数据集。同一工作台多卡复用记录时可提供sharedDatasets:[{id,label,asOf,note,fields:[{key,label,unit?}],records:[{id,...各字段原值}]}]，共同事实只确定一次。面板type:view，提供view:{dataset:"数据集id",filters:[字段键],details:[字段键],reorder:false,navigation:"flow|tabs",layout:"stack|split",sections:[{kind:"records|compare",fields:[字段键]}或{kind:"schedule",label:字段键,start:字段键,end:字段键,owner?:字段键,resource?:字段键}]}。宿主生成交互，不写HTML/JS或重复各卡数据。仅明确模拟数据工作台支持sharedDatasets；已有真实资料仍沿原数据来源与artifact流程。缺失填null，日内排程使用含时区的ISO时间；不能为满足组件而删改业务、缩小用户范围或改称模拟。'

const fieldKeysSchema={type:'array',items:{type:'string'}};
export const DATASET_VIEW_SCHEMA={type:'object',additionalProperties:false,properties:{
 dataset:{type:'string',required:true},subject:{type:'string'},filters:{...fieldKeysSchema,description:'最多4个用户可切换筛选字段；范围子集另用where声明。'},details:fieldKeysSchema,reorder:{type:'boolean'},navigation:{type:'string',enum:['flow','tabs']},layout:{type:'string',enum:['stack','split']},
 where:{type:'array',description:'最多8个本视图默认范围条件；多个条件为且，保留完整主数据。in提供1–64个原始标量values，notNull不提供values。',items:{type:'object',additionalProperties:false,properties:{field:{type:'string',required:true},op:{type:'string',required:true,enum:['in','notNull']},values:{type:'array',items:{type:'json',description:'来源字段的原始字符串、数字、布尔或null，不接受对象或表达式。'}}}}},
 sections:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{kind:{type:'string',required:true,enum:['records','compare','schedule']},title:{type:'string'},fields:fieldKeysSchema,label:{type:'string'},start:{type:'string'},end:{type:'string'},owner:{type:'string'},resource:{type:'string'}}}}
}};
export const WORKBENCH_DATASETS_SCHEMA={type:'array',description:'仅明确模拟场景，同一批对象只写一个主记录集，排程/对比/列表均引用它；每份数据必须有组件引用，同批对象跨表时显式声明相同recordScope，该范围内同id同名事实及单位不得矛盾。不同实体的编号独立；每条记录有稳定id并完整填写所有声明字段，缺失null。记录必须含id，id显示字段省略时由宿主补标签。最多5组，每组200条/24字段/48KB，总192KB；不截取记录，不猜共同值。',items:{type:'object',additionalProperties:false,properties:{
 id:{type:'string',required:true},recordScope:{type:'string',description:'可选。跨数据集确为同一批对象时提供相同范围如book；该范围内同id的同名事实/单位必须一致。省略时编号仅限本数据集，员工001与设备001不视为同一对象。'},label:{type:'string',required:true},asOf:{type:'string',description:'模拟数据时点；省略时如实标注时点未指定，不猜日期。'},note:{type:'string',description:'模拟数据说明；省略时标注用户请求的模拟数据。'},
 aggregate:{type:'object',additionalProperties:false,description:DATASET_AGGREGATE_GUIDANCE,properties:{dataset:{type:'string',required:true},groupBy:{type:'array',required:true,items:{type:'string'}},measures:{type:'array',required:true,items:{type:'object',additionalProperties:false,properties:{key:{type:'string',required:true},label:{type:'string',required:true},op:{type:'string',required:true,enum:['count','sum']},field:{type:'string'},unit:{type:'string'},where:{type:'object',additionalProperties:false,properties:{field:{type:'string',required:true},equals:{type:'json',description:'与来源标量严格相等的原值',required:true}}}}}}}},
 fields:{type:'array',items:{type:'object',additionalProperties:false,properties:{key:{type:'string',required:true},label:{type:'string',required:true},unit:{type:'string'}}}},
 records:{type:'array',items:{type:'object',additionalProperties:true,properties:{id:{type:'string',required:true,description:'直接使用稳定业务编号，如B01；每条必填且唯一。其他字段必须与fields声明一致。'}}}}
}}};
