import {evaluateMapping,materializeComponentMapping,sourceDisplaySelector,componentSourceMetadata} from './component-data-refresh.js'
import {templateDataIssue} from './template-data-contract.js'
import {readableTrendFigure} from './component-readable-chart.js'
import {timelineDataIssue,timelineOrder} from './timeline-template-contract.js'

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const missing=value=>value===null||value===undefined||value===''
export const pureMissingSourceText=value=>typeof value==='string'&&/^(?:(?:—|--|N\/A|Not provided|Unavailable)|(?:来源未提供|本次未取得|未提供|未取得|缺失|暂无)(?:数据|数值|字段)?)[。.]?$/iu.test(value.trim())
const pureMissing=pureMissingSourceText
const missingDisplay=value=>missing(value)||pureMissing(value)
const itemMetadata=new Set(['detail','source','url'])
const scalar=value=>missing(value)||typeof value==='string'||typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e15
const esc=value=>String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const entryMode=mode=>({rows:'row',series:'seriesItem',items:'item',events:'event'}[mode]??mode)

function sourceEventIdentity(mapping,responses,now,scope){
 const paths=['title','time','url'].map(key=>mapping[key])
 if(paths.some(selector=>!object(selector)||typeof selector.$path!=='string'||!selector.$path||Object.keys(selector).some(key=>!['$path','$from'].includes(key))))return false
 const origin=selector=>selector.$path.replace(/\[(\d+)\]/gu,'.$1').split('.').slice(0,-1).join('.')
 return paths.every((selector,index)=>{
  if(selector.$from!==paths[0].$from||origin(selector)!==origin(paths[0]))return false
  const value=evaluateMapping(selector,responses,now,scope)
  return typeof value==='string'||index===1&&value===null
 })
}

// This is a source-selector proof, not a second mapping language. Selection,
// ordering and conversion still run in the existing bounded evaluator. Every
// business cell must originate in an observed response, not a model literal.
function sourcePayload(mapping,responses,now,scope=responses,cohort=[scope],mode='value'){
 if(Array.isArray(mapping))return mapping.length>0&&mapping.every(value=>sourcePayload(value,responses,now,scope,cohort,entryMode(mode)))
 if(!object(mapping))return false
 // Numeric text defaults/prefixes cannot turn a source omission into a value.
 if(['$prefix','$suffix'].some(key=>typeof mapping[key]==='string'&&/\d/u.test(mapping[key])))return false
 if(Object.hasOwn(mapping,'$calc')){
  evaluateMapping(mapping,responses,now,scope)
  return mapping.$calc.args.every(arg=>sourcePayload(arg,responses,now,scope,cohort))
 }
 const source=mapping.$from===undefined?scope:responses[mapping.$from]
 if(source===undefined)return false
 const each=mapping.$each??(Object.hasOwn(mapping,'$map')?mapping.$path:undefined)
 if(each!==undefined){
  const {$map,$path,$normalize,$reduce,$digits,$scale,$as,$prefix,$suffix,$single,...select}=mapping
  const rows=evaluateMapping({...select,$each:each,$map:{$path:''}},responses,now,scope)
  const child=$map??(mapping.$each!==undefined&&Object.hasOwn(mapping,'$path')?{$path:mapping.$path}:undefined)
  if(!Array.isArray(rows)||!rows.length||child===undefined)return false
  const childMode=entryMode(mode)
  return rows.every(row=>sourcePayload(child,responses,now,row,rows,childMode))
 }
 if(Object.hasOwn(mapping,'$map'))return sourcePayload(mapping.$map,responses,now,source,[source],mode)
 if(mode==='event')return sourceEventIdentity(mapping,responses,now,scope)
 if(mode==='events')return false
 if(Object.hasOwn(mapping,'$path')){
  if(Object.hasOwn(mapping,'$default')&&!pureMissing(mapping.$default))return false
  const selector={$path:mapping.$path,...(mapping.$from!==undefined?{$from:mapping.$from}:{})}
  try{evaluateMapping(selector,responses,now,scope);return true}catch{
   // An optional absent field is only a real source omission when the same
   // field exists in a sibling source row. A wholly misspelled path is invalid.
   return mapping.$optional===true&&cohort.some(row=>{try{evaluateMapping(selector,responses,now,row);return true}catch{return false}})
  }
 }
 if(mode==='item')return Object.hasOwn(mapping,'value')&&sourcePayload(mapping.value,responses,now,scope,cohort)&&Object.entries(mapping).every(([key,value])=>['label','value'].includes(key)||itemMetadata.has(key)||key==='unit'&&typeof value==='string'||key==='missing'&&pureMissing(value)||sourcePayload(value,responses,now,scope,cohort))
 if(mode==='seriesItem')return Object.hasOwn(mapping,'values')&&sourcePayload(mapping.values,responses,now,scope,cohort)
 return false
}

function metadataSelector(value){
 if(!object(value))return undefined
 if(Object.hasOwn(value,'$template')){
  const names=Object.keys(value).filter(key=>key!=='$template')
  return names.length===1?metadataSelector(value[names[0]]):undefined
 }
 const clean=Object.fromEntries(Object.entries(value).filter(([key])=>!['$prefix','$suffix','$default'].includes(key)))
 if(Object.hasOwn(clean,'$map')){
  const child=metadataSelector(clean.$map)
  return child?{...clean,$map:child}:undefined
 }
 return Object.hasOwn(clean,'$path')?{...clean,$optional:true}:undefined
}
function metricDisplayMapping(value){
 if(Array.isArray(value))return value.map(metricDisplayMapping)
 if(!object(value))return value
 if(Object.hasOwn(value,'value'))return Object.fromEntries(Object.entries(value).flatMap(([key,child])=>{
  if(!itemMetadata.has(key))return [[key,child]]
  const selector=key==='detail'?sourceDisplaySelector(child):metadataSelector(child)
  return selector?[[key,selector]]:[]
 }))
 return Object.hasOwn(value,'$map')?{...value,$map:metricDisplayMapping(value.$map)}:value
}

function readableData(data){
 if(data?.type==='timeline'){
  if(!timelineDataIssue(data)||timelineDataIssue(data,{checkCapacity:false})||
   !data.items.every(item=>typeof item.url==='string'))return null
  const fields=[...new Set(data.items.flatMap(item=>Object.keys(item)))].filter(key=>!['id','title','time','url'].includes(key))
  const labels={summary:'来源说明',actor:'参与人',object:'对象',source:'来源'}
  const {items}=timelineOrder(data)
  return {mode:'events',columns:['标题','原始时间','原文链接',...fields.map(key=>Object.hasOwn(labels,key)?labels[key]:key)],
   linkColumn:2,rows:items.map(item=>[item.title,item.time,item.url,...fields.map(key=>item[key]??null)])}
 }
 const metric=data?.type==='kpi'||data?.type==='market'&&['metrics','fund-kpi'].includes(data.variant)
 if(metric){
  if(!Array.isArray(data.items)||!data.items.length)return null
  if(!data.items.some(item=>missingDisplay(item?.value))&&data.items.length<=12)return null
  for(const item of data.items){
   if(!object(item)||!Object.values(item).every(scalar))return null
   const probe={...item,...(missing(item.value)?{value:data.type==='kpi'?null:'来源未提供',...(data.type==='kpi'?{missing:item.missing??'来源未提供'}:{})}:{})}
   if(templateDataIssue({...data,items:[probe]}))return null
  }
  const fields=[...new Set(['label','value',...data.items.flatMap(item=>Object.keys(item))])]
  const names={label:'指标',value:'原值',detail:'指标说明',unit:'单位',missing:'缺失说明',source:'来源',url:'原文链接'}
  return {mode:'items',columns:fields.map(key=>names[key]??key),fixedColumns:fields.map(key=>Object.hasOwn(names,key)),rows:data.items.map(item=>fields.map(key=>item[key]??null))}
 }
 const table=data?.type==='table'||data?.type==='market'&&data.variant==='table'
 if(table){
  if(!Array.isArray(data.columns)||!data.columns.length||!Array.isArray(data.rows)||!data.rows.length)return null
  if(!data.columns.every(value=>typeof value==='string'&&value.trim()&&value.length<=(data.type==='table'?128:2000)))return null
  if(data.rows.some(row=>!Array.isArray(row)||row.length!==data.columns.length||row.some(value=>!scalar(value))))return null
  const columnLimit=data.type==='table'&&data.asOf===undefined&&data.note===undefined?12:32
  const capacity=data.rows.length>100||data.columns.length>columnLimit||data.type==='table'&&data.rows.some(row=>row.some(value=>typeof value==='string'&&value.length>512))
  if(!capacity&&!data.rows.some(row=>row.some(missing)))return null
  // Validate all metadata and unknown keys with the original contract. Only
  // the dimensions/cell length and source omissions are presentation limits.
  if(templateDataIssue({...data,columns:data.columns.slice(0,1),rows:[['原值']]}))return null
  return {mode:'rows',columns:data.columns,rows:data.rows}
 }
 const chart=data?.type==='chart'||data?.type==='market'&&data.variant==='trend'
 if(chart){
  if(!Array.isArray(data.labels)||!data.labels.length||!data.labels.every(value=>typeof value==='string'&&value.trim()&&value.length<=128)||!Array.isArray(data.series)||!data.series.length||data.series.length>12)return null
  if(data.labels.length<=366&&(data.type!=='chart'||data.labels.length*data.series.length<=600)&&!data.series.some(series=>series?.values?.some(missing)))return null
  for(const series of data.series){
   if(!object(series)||!Array.isArray(series.values)||series.values.length!==data.labels.length||!series.values.every(value=>missing(value)||typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=1e12))return null
  }
  const labels=data.labels.slice(0,2),series=data.series.map(series=>({...series,values:series.values.slice(0,labels.length).map(value=>missing(value)?0:value)}))
  if(templateDataIssue({...data,labels,series}))return null
  if(data.variant==='percentBar'&&(data.series.some(series=>series.values.some(value=>value<0))||/[%％]|百分比/u.test(data.unit??'')&&data.labels.some((_,i)=>data.series.reduce((sum,series)=>sum+(series.values[i]??0),0)>100+1e-8)))return null
  return {mode:'series',columns:['日期 / 期间',...data.series.map(series=>series.name)],fixedColumns:[true],rows:data.labels.map((label,i)=>[label,...data.series.map(series=>series.values[i])])}
 }
 return null
}

export function readableSnapshotUnavailable(data){
 if(data?.type==='timeline')return false
 if(Array.isArray(data?.items))return data.items.length>0&&data.items.every(item=>missingDisplay(item?.value))
 if(Array.isArray(data?.series))return data.series.length>0&&data.series.every(series=>series.values.every(missingDisplay))
 return Array.isArray(data?.rows)&&data.rows.length>0&&data.rows.every(row=>row.every(missingDisplay))
}

// Serialized trusted UI. All rows are present on first paint; pagination only
// changes visibility. Search, page and full browsing use the existing shared
// state bridge, with no script supplied by a model or data response.
export function readableSnapshotRuntime(){
 const rows=[...document.querySelectorAll('tbody tr')],search=document.querySelector('[data-readable-search]'),previous=document.querySelector('[data-readable-previous]'),next=document.querySelector('[data-readable-next]'),all=document.querySelector('[data-readable-all]'),count=document.querySelector('[data-readable-count]')
 const shared=window.sherlockShared.register({initialState:{query:'',page:0,all:false},reduce:(state,action)=>action.type==='search'?{...state,query:String(action.query).slice(0,256),page:0}:action.type==='page'?{...state,page:Math.max(0,state.page+action.delta),all:false}:action.type==='all'?{...state,all:!state.all,page:0}:state,render:(state,context)=>{
  const found=rows.filter(row=>row.textContent.toLocaleLowerCase().includes(state.query.toLocaleLowerCase())),page=Math.min(state.page,Math.max(0,Math.ceil(found.length/25)-1)),disabled=context.readOnly||!context.connected
  search.value=state.query;search.disabled=disabled;rows.forEach(row=>row.hidden=true);found.forEach((row,i)=>row.hidden=!state.all&&Math.floor(i/25)!==page)
  previous.disabled=disabled||page===0;next.disabled=disabled||state.all||(page+1)*25>=found.length;all.disabled=disabled;all.setAttribute('aria-pressed',String(state.all));count.textContent=found.length+' / '+rows.length
 }})
 search.oninput=()=>shared.dispatch({type:'search',query:search.value});previous.onclick=()=>shared.dispatch({type:'page',delta:-1});next.onclick=()=>shared.dispatch({type:'page',delta:1});all.onclick=()=>shared.dispatch({type:'all'})
}

export function componentReadableSnapshot(data,mapping,responses,records,now=new Date()){
 let readable=readableData(data)
 if(!readable||!records.length||records.some(record=>record.purpose==='discovery'))return null
 try{
  if(!sourcePayload(mapping[readable.mode==='events'?'items':readable.mode],responses,now,responses,[responses],readable.mode))return null
  if(readable.mode==='series'&&!sourcePayload(mapping.labels,responses,now))return null
 }catch{return null}
 if(readable.mode==='items'){
  // Detail/source/link are display metadata, never proof of a business value.
  // Keep the original semantic data for guards; render only metadata selected
  // from the same real row scope, not literal claims or formatter decorations.
  try{
   const display=materializeComponentMapping({...mapping,items:metricDisplayMapping(mapping.items)},responses,now,records)
   display.items=display.items.map(item=>Object.fromEntries(Object.entries(item).filter(([key,value])=>!itemMetadata.has(key)||!missing(value))))
   readable=readableData(display)
   if(!readable)return null
  }catch{return null}
 }
 const text=value=>missingDisplay(value)?'<span data-workbench-status-text>来源未提供</span>':esc(value)
 const cell=(value,index)=>{
  if(index===readable.linkColumn)return '<a href="'+esc(value)+'" target="_blank" rel="noopener noreferrer">'+esc(value)+'</a>'
  if(readable.mode==='events'&&index>readable.linkColumn&&typeof value==='string'&&value.length>2000)return '<details><summary>展开完整来源说明</summary>'+esc(value)+'</details>'
  return text(value)
 }
 const headers=readable.columns.map((value,index)=>'<th scope="col">'+(readable.fixedColumns?.[index]?'<span data-workbench-status-text>'+esc(value)+'</span>':esc(value))+'</th>').join(''),rows=readable.rows.map(row=>'<tr>'+row.map((value,index)=>'<td>'+cell(value,index)+'</td>').join('')+'</tr>').join('')
 const sources=[...new Map(records.map(record=>{
  const label=record.response?.source??record.response?.sourceId
  let url
  try{const value=new URL(record.response?.sourceUrl);if(['http:','https:'].includes(value.protocol)&&!value.username&&!value.password)url=value.href}catch{}
  return [JSON.stringify([label,url]),{label:typeof label==='string'&&label.trim()?label:null,url}]
 })).values()]
 const provider=sources.map(source=>{
  const label=source.label?esc(source.label):'<span data-workbench-status-text>来源名称未提供</span>'
  return source.url?`<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${label}</a>`:label
 }).join(' · ')
 // Timestamp selectors prove the date, not a model-written provider suffix.
 // Display their unadorned observed value; keep the original semantic data for
 // all date/source/unit gates and derive provider labels only from records.
 let asOf=data.asOf
 if(object(mapping.asOf)){
  asOf=null
  try{
   const selector=metadataSelector(mapping.asOf)
   if(sourcePayload(selector,responses,now)){
    const value=evaluateMapping(selector,responses,now)
    if(scalar(value))asOf=missing(value)?null:String(value)
   }
  }catch{}
 }
 const hostMetadata=componentSourceMetadata(mapping,responses,records)
 if(object(mapping.asOf)&&hostMetadata&&hostMetadata.time!==undefined){
  // The shared materializer already chose this observed time when the header
  // formatter could not execute. Do not turn it back into a missing date.
  try{evaluateMapping(mapping.asOf,responses,now,responses,0,{nodes:0},'timestamp')}
  catch(error){if(['UNSUPPORTED_MAPPING_OPERATOR','UNSUPPORTED_DISPLAY_FORMAT'].includes(error.code))asOf=hostMetadata.time}
 }
 const sourceGaps=hostMetadata?.gaps.length?'<p data-readable-source-gaps role="status"><span data-workbench-status-text>来源缺失项：</span>'+hostMetadata.gaps.map(esc).join('、')+'</p>':''
 const templated=value=>object(value)&&(Object.hasOwn(value,'$template')||Object.values(value).some(templated))||Array.isArray(value)&&value.some(templated)
 const metadata=['subject','asOf','range','unit','subtitle','note'].filter(key=>key==='asOf'||!templated(mapping[key])).filter(key=>key==='asOf'?Object.hasOwn(data,key):typeof data[key]==='string'&&data[key].trim()).map(key=>'<p data-readable-meta="'+key+'">'+text(key==='asOf'?asOf:data[key])+'</p>').join('')
 const availability=readableSnapshotUnavailable(data)?'<p data-readable-availability role="status" data-workbench-status-text>来源未提供可用数值；已保留实际字段与来源。</p>':''
 const overview=readable.mode==='series'?(readableTrendFigure(data)??''):''
 const bodyMarker=data.type==='market'?' data-sherlock-market="'+esc(data.variant)+'"':''
 return {version:1,type:'html',title:data.title,html:`<html><body${bodyMarker} data-readable-snapshot><style>body{margin:0;padding:12px;box-sizing:border-box;background:var(--sherlock-surface);color:var(--sherlock-text);font:13px/1.6 var(--sherlock-font-sans)}header{display:flex;flex-wrap:wrap;gap:8px;align-items:center}input,button{font:inherit;color:inherit;background:var(--sherlock-surface-muted);border:1px solid var(--sherlock-border);border-radius:4px;padding:4px 8px}input{flex:1;min-width:100px}a{color:var(--sherlock-link)}.readable-scroll{overflow:auto;max-height:70vh;margin-top:10px}table{border-collapse:collapse;min-width:100%;width:max-content}th,td{padding:8px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--sherlock-border);white-space:pre-wrap;max-width:560px;overflow-wrap:anywhere}th{position:sticky;top:0;background:var(--sherlock-surface-muted)}p{white-space:pre-wrap;margin:6px 0}aside{color:var(--sherlock-muted)}[hidden]{display:none!important}</style><header><input data-readable-search aria-label="搜索完整数据" placeholder="搜索完整数据"><button data-readable-previous>上一页</button><button data-readable-next>下一页</button><button data-readable-all aria-pressed="false">浏览全部</button><span data-readable-count role="status">${readable.rows.length} / ${readable.rows.length}</span></header><aside><p data-workbench-status-text>静态快照，自动更新未绑定</p>${availability}<p>${provider}</p>${metadata}${sourceGaps}</aside>${overview}<main class="readable-scroll" tabindex="0"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></main><script>(${readableSnapshotRuntime.toString()})()</script></body></html>`}
}
