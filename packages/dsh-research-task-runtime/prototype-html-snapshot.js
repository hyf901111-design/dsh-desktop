import {parse} from 'parse5'
import {isDeepStrictEqual} from 'node:util'
import {acceptArtifactOutput} from './artifact-output.js'
import {prototypeRecordViewHtml,prototypeRecordViewIssue,prototypeRecordViewRequirementIssue} from './prototype-record-view.js'
import {prototypeViewScaleIssue} from './prototype-presentation.js'
import {prototypePresentationUsageIssue} from './prototype-presentation-usage.js'

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key))
const forbidden=new Set(['__proto__','prototype','constructor'])
const prefix='sherlock-source-'
// A read of a parent object may contain the same large record arrays that a
// paged read exposes as rows. The model needs their shape; the renderer still
// receives the complete frozen response below. Keep scalar facts and small
// configuration/evidence lists intact, and describe every sampled array.
function samplePrototypeValue(value,path,sampledArrays){
 if(Array.isArray(value)){
  const records=value.length>25&&value.every(row=>row!==null&&typeof row==='object'&&!Array.isArray(row))
  if(records)sampledArrays.push({path,total:value.length,observedFields:[...new Set(value.flatMap(row=>Object.keys(row)))]})
  return(records?value.slice(0,2):value).map((item,index)=>samplePrototypeValue(item,[...path,index],sampledArrays))
 }
 return value!==null&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,samplePrototypeValue(item,[...path,key],sampledArrays)])):value
}
function completeData(record,request){
 const value=record.response
 if(record.purpose==='discovery'||!value||value.section!==request.args.section||value.section==='index'||value.section.startsWith('function:'))return false
 if(Array.isArray(value.rows))return value.offset===1&&value.nextOffset===undefined&&Number.isSafeInteger(value.total)&&value.total>0&&value.total<=500&&value.rows.length===value.total
 return Object.hasOwn(value,'value')&&value.value!==null&&typeof value.value==='object'
}

// A first-pass submission may name datasets it has actually read instead of
// waiting for a rejected generated envelope to supply their request arguments.
// Names select only complete observations owned by this child. They cannot
// request another file, execute a read, or resolve an ambiguous same-name source.
export function observedPrototypeSources(records,sources,targets,{onIssue}={}){
 if(!Array.isArray(records)||!Array.isArray(sources)||!sources.length||sources.length>8||!targets?.files?.length)return null
 const keys=new Set(),sections=new Set(),requests=[],selected=[]
 for(const source of sources){
  if(!exact(source,['key','section'])||typeof source.key!=='string'||!/^[a-zA-Z][\w-]{0,63}$/u.test(source.key)||forbidden.has(source.key)||keys.has(source.key)||typeof source.section!=='string'||sections.has(source.section))return null
  keys.add(source.key);sections.add(source.section)
  const owned=records.filter(record=>record.tool==='read_prototype'&&targets.files.includes(record.args?.file_path)&&record.args?.section===source.section&&record.purpose!=='discovery')
  const matches=owned.filter(record=>completeData(record,{args:{section:source.section}}))
  if(!matches.length){
   const part=owned.at(-1)?.response,section=JSON.stringify(source.section.slice(0,256)),alias=JSON.stringify(source.key)
   const remaining=Array.isArray(part?.rows)&&Number.isSafeInteger(part.nextOffset)?' The latest page has '+part.rows.length+' of '+part.total+' rows; continue at offset '+part.nextOffset+' and obtain a complete response.':''
   onIssue?.('Source '+alias+' selects section '+section+', but this child has not read its complete data. Read this exact section with read_prototype from the authorized original file before resubmitting; retain the existing page rather than rewriting it.'+remaining)
   return null
  }
  if(new Set(matches.map(record=>record.args.file_path)).size!==1)return null
  const record=matches.at(-1)
  if(!record)return null
  requests.push({key:source.key,tool:'read_prototype',args:structuredClone(record.args)})
  selected.push(structuredClone(record))
 }
 return{requests,records:selected}
}

// Only sections explicitly named by this card can finish its source phase.
// A complete array/object is enough to implement new UI over those records;
// an index, a function excerpt, an unrelated section or a partial page is not.
export function prototypeHtmlEvidence(records,panelRequest,targets,{candidate,observedSources=false}={}){
 const sections=[...new Set((panelRequest??'').match(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\b/gu)??[])]
 if(sections.length>8||!targets?.files?.length)return null
 const selected=[]
 for(const section of sections){
  const matches=records.filter(record=>{
   const parent=record.args?.section
   if(record.tool!=='read_prototype'||!targets.files.includes(record.args?.file_path)||typeof parent!=='string'||!completeData(record,{args:{section:parent}}))return false
   if(parent===section)return true
   if(!section.startsWith(parent+'.')||record.response.value===undefined)return false
   let value=record.response.value
   for(const key of section.slice(parent.length+1).split('.')){if(forbidden.has(key)||!value||typeof value!=='object'||!Object.hasOwn(value,key))return false;value=value[key]}
   return value!==null&&typeof value==='object'
  })
  if(new Set(matches.map(record=>record.args.file_path)).size!==1)return null
  const record=matches.at(-1)
  if(!record)return null
  if(!selected.some(source=>isDeepStrictEqual(source.args,record.args)))selected.push(record)
 }
 // An interrupted first-pass tool call may have no parseable draft at all.
 // Recovery may retain every complete source this child already owns, without
 // inferring that the first array fulfills the request or finishing retrieval.
 // A named missing source or a rejected candidate's unobserved request must
 // still fail the exact checks below rather than falling back to another set.
 if(observedSources&&candidate===undefined&&!sections.length){
  const names=[...new Set(records.filter(record=>record.tool==='read_prototype'&&record.purpose!=='discovery'&&targets.files.includes(record.args?.file_path)&&typeof record.args?.section==='string'&&(Array.isArray(record.response?.rows)||record.response?.value!==null&&typeof record.response?.value==='object')).map(record=>record.args.section))]
  const observed=observedPrototypeSources(records,names.map((section,i)=>({key:'source'+(i+1),section})),targets)
  if(!observed)return null
  selected.push(...observed.records)
 }
 // Repair may retain exact source requests from this card's rejected draft.
 // They never finish a source phase or authorize another read: every request
 // must match a complete response already owned by this card and user file.
 if(candidate!==undefined){
  if(!exact(candidate,['version','type','requests','mapping'])||candidate.version!==1||candidate.type!=='data-bound'||candidate.mapping?.type!=='html'||!Array.isArray(candidate.requests)||!candidate.requests.length||candidate.requests.length>8)return null
  const keys=new Set()
  for(const request of candidate.requests){
   if(!exact(request,['key','tool','args'])||typeof request.key!=='string'||!/^[a-zA-Z][\w-]{0,63}$/u.test(request.key)||forbidden.has(request.key)||keys.has(request.key)||request.tool!=='read_prototype'||!targets.files.includes(request.args?.file_path))return null
   keys.add(request.key)
   const record=records.findLast(record=>record.tool===request.tool&&isDeepStrictEqual(record.args,request.args)&&completeData(record,request))
   if(!record)return null
   if(!selected.some(source=>isDeepStrictEqual(source.args,record.args)))selected.push(record)
  }
 }
 if(!selected.length||selected.length>8)return null
 return JSON.stringify(selected.map(record=>{
   const response=record.response
   const sampledArrays=[]
   const responseSample=Array.isArray(response.rows)?{...response,rows:response.rows.slice(0,2)}:{...response,value:samplePrototypeValue(response.value,['value'],sampledArrays)}
   return{tool:record.tool,args:record.args,responseSample,...Array.isArray(response.rows)?{completeRowCount:response.total}:{},...sampledArrays.length?{sampledArrays,samplingNote:'responseSample仅展示记录结构；sampledArrays给出完整路径、条数及全部已观察字段。宿主注入完整原响应，筛选项、统计和交互从完整数据推导，不把这两条样本作为整体。'}:{}}
 }))
}

/** Static source injection, never file access, script execution or refresh.
 * The model owns the custom UI; complete records come from the exact tool call.
 * Keep data inert even when a source string contains HTML or script delimiters. */
export function resolvePrototypeHtmlSnapshot(candidate,records,options={}){
 if(!Array.isArray(records)||!exact(candidate,['version','type','requests','mapping'])||candidate.version!==1||candidate.type!=='data-bound'||!Array.isArray(candidate.requests)||!candidate.requests.length||candidate.requests.length>8)return null
 const supplied=candidate.mapping
 if(supplied&&typeof supplied==='object'&&!Array.isArray(supplied)&&!exact(supplied,['version','type','title','html','view','note','notes'])){
  const fields=Object.keys(supplied).filter(key=>!['version','type','title','html','view','note','notes'].includes(key)).map(key=>JSON.stringify(key.slice(0,80))).slice(0,8).join('、')
  options.onPrototypeViewIssue?.('mapping 含未支持字段 '+fields+'；保留已有页面及来源，仅提交 version、type、title、html 或 view，可选 note/notes。数值格式来自已读取来源，不另设 mapping 元字段。')
  return null
 }
 let spec=exact(supplied,['version','type','title','html','view','note','notes'])?{...supplied,version:supplied.version===undefined?1:supplied.version,...supplied.title===undefined&&typeof options.panelTitle==='string'?{title:options.panelTitle}:{}}:undefined
 const notes=[spec?.note,...Array.isArray(spec?.notes)?spec.notes:[spec?.notes]].filter(value=>value!==undefined)
 if(notes.length>8||notes.some(value=>typeof value!=='string')||notes.join('\n').length>4000)return null
 if(!spec||spec.version!==1||spec.type!=='html'||typeof spec.title!=='string'||!spec.title.trim()||spec.title.length>256||spec.view!==undefined&&spec.html!==undefined||spec.view===undefined&&(typeof spec.html!=='string'||!spec.html.trim()||Buffer.byteLength(spec.html)>200000))return null
 const sources=new Map()
 for(const request of candidate.requests){
  if(!exact(request,['key','tool','args'])||typeof request.key!=='string'||!/^[a-zA-Z][\w-]{0,63}$/u.test(request.key)||forbidden.has(request.key)||sources.has(request.key)||request.tool!=='read_prototype'||!request.args||typeof request.args.section!=='string')return null
  const record=records.findLast(record=>record.tool===request.tool&&isDeepStrictEqual(record.args,request.args)&&completeData(record,request))
  if(!record)return null
  let json
  try{json=JSON.stringify(record.response,(_key,value)=>{if(typeof value==='number'&&!Number.isFinite(value)||['bigint','function','symbol','undefined'].includes(typeof value))throw Error('Not source JSON');return value})}catch{return null}
  if(!json||Buffer.byteLength(json)>65536)return null
  sources.set(prefix+request.key,json.replace(/[<>&\u2028\u2029]/gu,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0')))
 }
 if(spec.view!==undefined){
  const viewIssue=prototypeRecordViewIssue(spec.view,sources)
  if(viewIssue){options.onPrototypeViewIssue?.(viewIssue);return null}
  const requirementIssue=prototypeRecordViewRequirementIssue(spec.view,options.panelRequest)
  if(requirementIssue){options.onPrototypeViewIssue?.(requirementIssue);return null}
  const issue=prototypeViewScaleIssue(spec.view,sources)
  if(issue){options.onPrototypeScaleIssue?.(issue);return null}
  const html=prototypeRecordViewHtml(spec.view,sources,{restoreSortOnRepeat:/(?:再点|再次点击|重复点击|reclick|click again)[^。；;]{0,30}(?:恢复|还原|reset|restore)/iu.test(options.panelRequest??'')})
  if(!html)return null
  const {view,...rest}=spec;spec={...rest,html}
 }
 const insertions=[],found=new Set()
 let bodyEnd
 const visit=(node,inert=false)=>{
  if(node.tagName==='body')bodyEnd=node.sourceCodeLocation?.endTag?.startOffset
  const attrs=new Map((node.attrs??[]).map(attr=>[attr.name,attr.value])),id=attrs.get('id')
  if(typeof id==='string'&&id.startsWith(prefix)){
   const named=JSON.stringify(id.slice(0,128)),empty='<script id='+named+' type="application/json"></script>'
   if(!sources.has(id))throw Error('来源槽 '+named+' 没有对应的宿主来源别名；仅使用 sources 中已读取的 key，保留其他页面内容。')
   if(found.has(id))throw Error('来源槽 '+named+' 重复；每个来源只保留一个 '+empty+'，不要重写其余页面。')
   if(inert||node.tagName!=='script'||attrs.size!==2||attrs.get('type')!=='application/json')throw Error('来源槽 '+named+' 必须为文档中可读取的 '+empty+'；不要放入 template 或添加 src 等属性。')
   const start=node.sourceCodeLocation?.startTag?.endOffset,end=node.sourceCodeLocation?.endTag?.startOffset
   if(!Number.isInteger(start)||!Number.isInteger(end)||spec.html.slice(start,end).trim())throw Error('来源槽 '+named+' 必须留空并保留闭合标签：'+empty+'；删除槽内样本/占位 JSON，完整数据由宿主注入。保留已有读取脚本和界面，不要重写其他部分。')
   found.add(id);insertions.push({start,end,text:sources.get(id)})
  }
  for(const child of node.childNodes??[])visit(child,inert)
  // A template is not a usable source slot in the document and must not hide
  // a duplicate from the caller's exact source-key check.
  if(node.content)visit(node.content,true)
 }
 try{
  visit(parse(spec.html,{sourceCodeLocationInfo:true}))
  if(found.size!==sources.size){
   const missing=[...sources.keys()].filter(id=>!found.has(id))
   options.onPrototypeViewIssue?.('缺少来源槽 '+missing.map(id=>JSON.stringify(id)).join('、')+'；在读取脚本前各添加一个空的 <script id="对应来源槽" type="application/json"></script>，不要重写其余页面。')
   return null
  }
  if(supplied.view===undefined){
   const issue=prototypePresentationUsageIssue(spec.html,sources)
   if(issue){options.onPrototypeViewIssue?.(issue);return null}
  }
  const note=[...new Set(notes.map(value=>value.trim()).filter(Boolean))].join('\n'),escaped=note?.replace(/[&<>"']/gu,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
  const status=(escaped?'<aside data-workbench-status-text>'+escaped+'</aside>':'')+'<aside data-workbench-status-text data-prototype-snapshot>原型静态快照，不代表最新外部数据；自动更新未绑定。</aside>'
  insertions.push({start:bodyEnd??spec.html.length,end:bodyEnd??spec.html.length,text:status})
  let html=spec.html
  for(const {start,end,text} of insertions.sort((a,b)=>b.start-a.start))html=html.slice(0,start)+text+html.slice(end)
  const {note:metadataNote,notes:metadataNotes,...artifact}=spec
  const output=acceptArtifactOutput(JSON.stringify({...artifact,html}))
  return output?{data:JSON.parse(output),output,prototypeHtmlSnapshot:true}:null
 }catch(error){
  if(error instanceof Error&&error.message.startsWith('来源槽 '))options.onPrototypeViewIssue?.(error.message)
  return null
 }
}

// Coverage is proved against the actual source response, not a model-written
// row counter or a claim that the browser will fetch the rest after completion.
export function prototypeHtmlSourceRows(spec,records,panelRequest){
 if(spec?.type!=='html'||typeof spec.html!=='string'||!Array.isArray(records))return null
 let rows=null
 const names=new Set((panelRequest??'').match(/[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/gu)??[])
 const retain=value=>{if(rows===null||value.length>rows.length)rows=value}
 // Object reads retain arrays below value (for example PROV.recon_rows).
 // Count only the card's named array in an exact, complete observed response;
 // an unrelated larger array or a model-written counter is not evidence.
 const nestedRows=(response)=>{
  let remaining=2048
  const visitValue=(value,path=[])=>{
   if(!value||typeof value!=='object'||path.length>8||remaining--<=0)return
   if(Array.isArray(value)){
    const relative=path.join('.'),full=[response.section,...path].join('.')
    if(names.has(full)||names.has(response.section)&&names.has(relative))retain(value)
    return
   }
   for(const [key,child] of Object.entries(value))if(!forbidden.has(key))visitValue(child,[...path,key])
  }
  visitValue(response.value)
 }
 const visit=node=>{
  const attrs=new Map((node.attrs??[]).map(attr=>[attr.name,attr.value]))
  if(node.tagName==='script'&&attrs.get('type')==='application/json'&&attrs.get('id')?.startsWith(prefix)){
   try{
    const response=JSON.parse((node.childNodes??[]).map(child=>child.value??'').join(''))
    if(typeof response.section==='string'&&records.some(record=>record.tool==='read_prototype'&&completeData(record,{args:{section:response.section}})&&isDeepStrictEqual(record.response,response))){
     if(Array.isArray(response.rows)&&panelRequest.includes(response.section))retain(response.rows)
     else nestedRows(response)
    }
   }catch{}
  }
  for(const child of node.childNodes??[])visit(child)
 }
 try{visit(parse(spec.html));return rows}catch{return null}
}

export const PROTOTYPE_HTML_DATA_PROMPT='本卡数据交互优先复用宿主记录视图，不重抄数据或编写整页代码：交付 {version:1,type:"data-bound",requests:[{key:"products",tool:"read_prototype",args:本卡真实成功的完整读取参数}],mapping:{version:1,type:"html",title:"本卡标题",view:{source:"products",path:"rows",kind:"table",columns:[{field:"原字段",label:"显示名",unit?:"单位",digits?:2,scale?:100}],search:["代码字段","名称字段"],filters:[{field:"分类字段",label:"分类",kind:"category"},{field:"流量字段",label:"方向",kind:"sign"}],key:"代码字段",value:"默认排序数值字段",details?:{field:"嵌套明细数组字段",columns:[{field:"原字段",label:"显示名"}]},highlight?:["需高亮的原编号"]}}。同一类别为键的多个明细对象可用details:{label:"类别",fields:[{field:"占比对象字段",label:"占比",unit:"%"},{field:"金额对象字段",label:"金额"}]}横向对齐展开；数字显示可用scale（比例转百分比为100），不改源值。无需的配置省略。条形统计图用kind:"bars"、label:"名称字段"、value:"数值字段"、unit:"亿"、periods:[{field:"flow_1w",label:"近1周"},...]，支持真实窗口切换、方向筛选与排序。path相对完整原响应，如rows或value.by_category；所有字段必须确实存在。宿主提供搜索、筛选、排序、分页、逐行展开、共享状态和主题。只有本卡要求超出这些交互时才改用mapping.html完整自包含页面：在脚本前放空的 <script id="sherlock-source-products" type="application/json"></script>，用JSON.parse(...textContent)读取rows或value，每个requests.key恰有一个同名空槽。宿主只注入本卡实际读齐的响应（offset=1且无nextOffset，或完整value），不执行原型脚本、不读取新文件、不绑定刷新；不把数据抄进槽或代码。保留用户要求的全部控件、记录和来源口径。'
