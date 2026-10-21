// A canonical snapshot plus declarative field references. No model-authored
// executable code or independently restated record values are part of a view.
export const DATASET_VIEW_LIMITS=Object.freeze({datasets:5,records:200,fields:24,cellCharacters:8000,datasetBytes:48000,totalBytes:192000,sections:4,viewBytes:8000})
const forbidden=new Set(['__proto__','prototype','constructor'])
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[null,Object.prototype].includes(Object.getPrototypeOf(value))
const text=(v,max,empty=false)=>typeof v==='string'&&v.length<=max&&(empty||v.trim().length>0)
const id=v=>text(v,128)&&v.trim()===v&&!forbidden.has(v)
const fieldKey=v=>typeof v==='string'&&/^[a-zA-Z][\w-]{0,63}$/.test(v)&&!forbidden.has(v)
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
export function validateWorkbenchDatasets(value){
 check(Array.isArray(value)&&value.length>=1&&value.length<=DATASET_VIEW_LIMITS.datasets,'共同数据需要1–5份完整记录集。')
 const ids=new Set(),result=[]
 for(const d of value){
  check(exact(d,['id','label','asOf','note','fields','records']),'共同数据字段无效，必须提供id、label、asOf、note、fields和records。')
  check(id(d.id)&&!ids.has(d.id),'共同数据集编号无效或重复。');ids.add(d.id)
  check(text(d.label,200)&&text(d.asOf,500)&&text(d.note,8000),'共同数据名称、时点和来源/演练说明不能为空或超过上限。')
  check(Array.isArray(d.fields)&&d.fields.length>=1&&d.fields.length<=DATASET_VIEW_LIMITS.fields,'共同数据需要1–24个已命名字段。')
  const keys=new Set(),fields=d.fields.map(f=>{
   check(exact(f,['key','label'],['unit'])&&fieldKey(f.key)&&!keys.has(f.key)&&text(f.label,100)&&(f.unit===undefined||text(f.unit,64)),'共同数据字段键、标签或单位无效或重复。')
   keys.add(f.key);return {key:f.key,label:f.label,...(f.unit===undefined?{}:{unit:f.unit})}
  })
  check(keys.has('id'),'共同数据必须声明稳定的id字段。')
  check(Array.isArray(d.records)&&d.records.length>=1&&d.records.length<=DATASET_VIEW_LIMITS.records,'共同数据需要1–200条完整记录；不能截取用户范围。')
  const recordIds=new Set(),records=d.records.map(r=>{
   check(exact(r,[...keys]),'共同记录必须保留所有声明字段；缺失值显式填写null，不得新增未声明字段。')
   check(id(r.id)&&!recordIds.has(r.id),'共同记录编号无效或重复。');recordIds.add(r.id)
   const entry={};for(const key of keys){check(cell(r[key]),'共同记录只支持有限数值、布尔、null、文本和文本数组。');entry[key]=Array.isArray(r[key])?[...r[key]]:r[key]}
   return entry
  })
  const copy={id:d.id,label:d.label,asOf:d.asOf,note:d.note,fields,records}
  check(bytes(copy)<=DATASET_VIEW_LIMITS.datasetBytes,'单份共同数据超过48000字节；请按业务拆分，不能丢弃记录。');result.push(copy)
 }
 check(bytes(result)<=DATASET_VIEW_LIMITS.totalBytes,'共同数据总量超过192000字节。')
 return freeze(result)
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
 check(exact(config,['dataset','sections'],['subject','filters','details','reorder','navigation','layout']),'组合视图配置包含无效字段。')
 check(id(config.dataset),'组合视图必须引用有效的共同数据集。')
 const dataset=validateWorkbenchDatasets(datasets).find(d=>d.id===config.dataset)
 check(dataset,'组合视图引用的共同数据集不存在。')
 const keys=new Set(dataset.fields.map(f=>f.key))
 const ref=k=>typeof k==='string'&&keys.has(k)
 const refs=(list,min=0,max=24)=>Array.isArray(list)&&list.length>=min&&list.length<=max&&new Set(list).size===list.length&&list.every(ref)
 check(config.subject===undefined||text(config.subject,256),'组合视图主题无效。')
 check(config.filters===undefined||refs(config.filters,0,4),'筛选字段无效、重复或超过4项。')
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
 const view={dataset:config.dataset,...(config.subject===undefined?{}:{subject:config.subject}),filters:[...(config.filters??[])],details:[...(config.details??[])],reorder:config.reorder??false,navigation:config.navigation??'flow',layout:config.layout??'stack',sections}
 check(bytes(view)<=DATASET_VIEW_LIMITS.viewBytes,'组合视图配置超过8000字节。')
 return freeze({dataset,view})
}
export function parseDatasetViewArtifact(value){
 check(exact(value,['version','type','title','dataset','view'])&&value.version===1&&value.type==='view'&&text(value.title,256),'组合组件格式无效。')
 const {dataset,view}=validateDatasetView(value.view,[value.dataset])
 return freeze({version:1,type:'view',title:value.title,dataset,view})
}
export function datasetViewDataIssue(value){try{parseDatasetViewArtifact(value)}catch(error){return error.message}}
export const DATASET_VIEW_GUIDANCE='同一工作台多卡复用记录时可提供sharedDatasets:[{id,label,asOf,note,fields:[{key,label,unit?}],records:[{id,...各字段原值}]}]，共同事实只确定一次。面板type:view，提供view:{dataset:"数据集id",filters:[字段键],details:[字段键],reorder:false,navigation:"flow|tabs",layout:"stack|split",sections:[{kind:"records|compare",fields:[字段键]}或{kind:"schedule",label:字段键,start:字段键,end:字段键,owner?:字段键,resource?:字段键}]}。由宿主直接生成不同组合和可靠交互，不编写HTML/JS、不重复填写各卡数据。仅明确模拟数据工作台支持sharedDatasets；已有真实资料仍沿原数据来源与artifact流程。缺失填null，日内排程使用含时区的ISO时间；不能为满足组件而删改业务、缩小用户范围或改称模拟。'
