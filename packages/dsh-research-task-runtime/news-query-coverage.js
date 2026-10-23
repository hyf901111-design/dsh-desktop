import {isDeepStrictEqual} from 'node:util'
import {extractArtifactObjects,acceptArtifactOutput} from './artifact-output.js'
import {filterScopedNewsArtifact,controlledNewsHtml,NEWS_EMPTY_NOTE} from './news-topic-filter.js'

// A finite, validated plan, not entity inference from prose or returned headlines.
export const NEWS_QUERY_MARKER='【宿主新闻查询集合】'
const sources=new Set(['eastmoney-news','gdelt-news'])
const object=value=>value&&typeof value==='object'&&!Array.isArray(value)
export function newsQueryPlan(value){
 if(!Array.isArray(value)||!value.length||value.length>8)return
 const plan=value.map(row=>{
  if(!object(row)||Object.keys(row).some(k=>!['source','query','limit'].includes(k))||!sources.has(row.source)||typeof row.query!=='string'||!row.query.trim()||row.query.length>100||!Number.isInteger(row.limit)||row.limit<1||row.limit>100)return
  return {source:row.source,query:row.query.trim(),limit:row.limit}
 })
 if(plan.some(row=>!row)||new Set(plan.map(row=>JSON.stringify(row))).size!==plan.length)return
 return plan
}
export function plannedNewsQueries(prompt=''){
 if(String(prompt).split(NEWS_QUERY_MARKER).length!==2)return
 const match=String(prompt).match(/(?:^|\n)【宿主新闻查询集合】\n([^\n]{1,4096})(?:\n|$)/u)
 try{return match&&newsQueryPlan(JSON.parse(match[1]))||undefined}catch{return undefined}
}
export const newsQueryArgs=row=>({operation:'query',source:row.source,parameters_json:JSON.stringify({query:row.query,limit:row.limit})})
function queryIdentity(args){
 try{
  const p=JSON.parse(args?.parameters_json)
  if(args.operation!=='query'||!sources.has(args.source)||!object(p)||Object.keys(p).some(k=>!['query','limit'].includes(k))||typeof p.query!=='string')return
  return {source:args.source,query:p.query.trim()}
 }catch{return}
}
const sameQuery=(row,args)=>{const id=queryIdentity(args);return id?.source===row.source&&id.query===row.query}
const publicTool=name=>['public_data_query','ework__public_data_query'].includes(name)
export function newsQueryAttempt(call,result,response){
 if(!publicTool(call?.tool)||!queryIdentity(call.args))return
 const valid=!result?.isError&&!result?.error&&Array.isArray(response?.records)
 return {tool:call.tool,api:'news',...queryIdentity(call.args),status:valid?(response.records.length?'success':'empty'):'unavailable'}
}
// Only fixed-source public news rows cross the durable boundary; no raw error
// bodies, arbitrary request parameters, credentials or model reasoning.
function retainRecord(record){
 if(!publicTool(record?.tool)||!queryIdentity(record.args)||!Array.isArray(record.response?.records)||record.response.records.length>100)return
 const rows=record.response.records
 if(rows.some(row=>!object(row)||typeof row.title!=='string'||row.title.length>2000))return
 const fields=['title','summary','content','url','time','date','publisher','firstSeenAt','domain','language','country']
 const response={sourceId:record.args.source,records:rows.map(row=>Object.fromEntries(fields.filter(k=>typeof row[k]==='string'&&row[k].length<=16000).map(k=>[k,row[k]])))}
 return {tool:record.tool,args:structuredClone(record.args),response}
}
export function newsCoverageState(plan,records=[],attempts=[],prior){
 const retained=[]
 for(const record of [...(prior?.records??[]),...records]){
  if(!plan.some(row=>sameQuery(row,record.args)))continue
  const safe=retainRecord(record);if(!safe)continue
  if(retained.some(row=>isDeepStrictEqual(row,safe)))continue
  retained.push(safe)
 }
 const entries=plan.map(row=>{
  const actual=retained.findLast(record=>sameQuery(row,record.args))
  const attempt=attempts.findLast(item=>item?.api==='news'&&item.source===row.source&&item.query===row.query)
  const previous=prior?.entries?.find(item=>isDeepStrictEqual(item.request,row))
  // A user-started retry may keep an older successful response while asking to
  // recover its latest failed read. That record is evidence, not a fresh read.
  const retryPending=previous?.retryPending===true&&!attempt
  const status=['success','empty','unavailable'].includes(attempt?.status)?attempt.status:retryPending?'not_attempted':previous?.status==='unavailable'?'unavailable':actual?(actual.response.records.length?'success':'empty'):'not_attempted'
  return {request:row,status,...(retryPending?{retryPending:true}:{})}
 })
 return {version:1,entries,records:retained,...(typeof prior?.draft==='string'&&prior.draft.length<=200000?{draft:prior.draft}:{})}
}
export function restoreNewsCoverage(value,prompt){
 const plan=plannedNewsQueries(prompt)
 if(!plan||!object(value)||value.version!==1||!Array.isArray(value.entries)||value.entries.length!==plan.length||!Array.isArray(value.records)||value.records.length>32||JSON.stringify(value).length>2_000_000)return
 if(value.entries.some((entry,i)=>!isDeepStrictEqual(entry?.request,plan[i])||!['success','empty','unavailable','not_attempted'].includes(entry.status)||entry.retryPending!==undefined&&(entry.retryPending!==true||entry.status!=='not_attempted')))return
 const state=newsCoverageState(plan,value.records,[],value)
 if(typeof value.draft==='string'&&value.draft.length<=200000&&extractArtifactObjects(value.draft).length===1)state.draft=value.draft
 return state
}
const abortable=(promise,signal)=>new Promise((resolve,reject)=>{
 const abort=()=>reject(signal.reason??Error('cancelled'))
 if(signal.aborted)return abort()
 signal.addEventListener('abort',abort,{once:true})
 Promise.resolve(promise).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort))
})
export async function completeNewsQueries(state,{query,signal,onChange,budgetMs=15000}){
 if(typeof query!=='function')return state
 const deadline=new AbortController(),timer=setTimeout(()=>deadline.abort(Error('news-query-deadline')),budgetMs)
 const bounded=signal?AbortSignal.any([signal,deadline.signal]):deadline.signal
 const pending=state.entries.filter(entry=>entry.status==='not_attempted');let next=0
 try{
  await Promise.all(Array.from({length:Math.min(2,pending.length)},async()=>{
   while(next<pending.length&&!bounded.aborted){
    const entry=pending[next++]
    let started=false
    try{
     const value=await abortable(query(entry.request,bounded,()=>{started=true}),bounded)
     // No current grant/tool: keep not_attempted, never claim a source failure.
     if(value===undefined)continue
     delete entry.retryPending
     const record={tool:'public_data_query',args:newsQueryArgs(entry.request),response:value.response}
     const retained=!value.isError&&retainRecord(record)
     entry.status=retained?(retained.response.records.length?'success':'empty'):'unavailable'
     if(retained)state.records.push(retained)
    }catch{
     if(signal?.aborted)throw signal.reason
     entry.status=started?'unavailable':'not_attempted'
     if(started)delete entry.retryPending
    }
    if(signal?.aborted)throw signal.reason
    await onChange?.(state)
   }
  }))
  signal?.throwIfAborted()
  return state
 }finally{clearTimeout(timer)}
}
const identity=item=>JSON.stringify([item.url??'',item.title])
const escape=value=>String(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
export function mergeObservedNewsItems(existing,records,verified){
 const items=[],seen=new Set()
 for(const item of existing){const key=identity(item);if(!seen.has(key)){seen.add(key);items.push(item)}}
 for(const record of records)for(const row of Array.isArray(record.response?.records)?record.response.records:[]){
  const date=row?.time??row?.date
  if(!row?.url||seen.has(identity(row)))continue
  const item={title:row.title,...(date?{date}:{}),url:row.url,...(row.summary?{summary:row.summary}:{}),...(row.publisher?{category:row.publisher}:{})}
  if(!verified({version:1,type:'news',title:'已取得新闻',items:[item]}))continue
  seen.add(identity(row));items.push(item)
 }
 return items
}
export function newsTableCoverageIssue(data,scope,{verified=()=>false}={}){
 if(!String(scope).includes('【新闻容量适配】')||!(data?.type==='table'||data?.type==='market'&&data.variant==='table'))return
 const columns=Array.isArray(data.columns)?data.columns.map(value=>String(value).trim()):[]
 const title=columns.findIndex(value=>/^(?:新闻标题|标题|title|headline)$/iu.test(value)),date=columns.findIndex(value=>/^(?:发布日期|发布时间|报道日期|日期|时间|date|time)$/iu.test(value)),url=columns.findIndex(value=>/^(?:原文|原文链接|来源链接|来源及链接|链接|url)$/iu.test(value))
 if(title<0||date<0||url<0||!Array.isArray(data.rows)||data.rows.some(row=>!Array.isArray(row)||!verified({version:1,type:'news',title:data.title,items:[{title:row[title],date:row[date],url:row[url]}]})))return '新闻表格的标题、日期与原文链接尚未逐行对应已取得记录。仅用已有来源修复这些列及对应行，保留可证实字段与全部研究对象；未核验的行只能作为缺口说明，不能转成HTML或可读回退冒充真实资讯，不重复查询已有成功来源。'
}
export function coverageNewsData(text,state,scope,{verified=()=>false}={}){
 const candidates=extractArtifactObjects(text)
 if(candidates.length!==1)return text
 const data=candidates[0]
 const news=data.type==='news'&&Array.isArray(data.items)
 const table=String(scope).includes('【新闻容量适配】')&&(data.type==='table'||data.type==='market'&&data.variant==='table')&&Array.isArray(data.rows)&&Array.isArray(data.columns)
 if(!news&&!table)return text
 if(news&&data.items.length&&!verified(data)||table&&!acceptArtifactOutput(JSON.stringify(data)))return text
 if(table&&newsTableCoverageIssue(data,scope,{verified}))return text
 // Publication dates must actually exist. An index firstSeenAt is not one.
 const items=mergeObservedNewsItems(news?data.items:[],state.records,verified)
 // Never truncate a source collection to fit this template. Large-news plans
 // already use the existing controlled table/HTML routes.
 if(table&&!items.some(item=>!JSON.stringify(data.rows).includes(item.title)))return text
 const merged=filterScopedNewsArtifact({...data,type:'news',items,...(items.length&&data.note===NEWS_EMPTY_NOTE?{note:'已保留本次取得的相关新闻。'}:{})},state.records,scope)
 if(news&&merged.items.length<=40&&acceptArtifactOutput(JSON.stringify(merged)))return JSON.stringify(merged)
 const html=controlledNewsHtml(data.title,merged.items.map(row=>({...row,publisher:row.publisher??row.category})))
 const notes=[data.asOf,merged.note].filter(Boolean)
 const original=notes.length?`<aside data-news-original-note style="white-space:pre-wrap">${notes.map(escape).join('\n')}</aside>`:''
 // Keep the existing table's complete fields as an accessible comparison,
 // while the proven article collection gets real search and local paging.
 const retained=table?`<details data-news-original-table><summary>原表格（保留）</summary><div style="overflow:auto"><table><thead><tr>${data.columns.map(value=>`<th>${escape(value)}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${row.map(value=>`<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`:''
 html.html=html.html.replace('<main>',original+retained+'<main>')
 return JSON.stringify(html)
}
function coverageLabel(state,{request,status}){
 const labels={empty:'来源返回空结果',unavailable:'来源暂不可用',not_attempted:'尚未完成查询'}
 const retained=state.records.some(record=>sameQuery(request,record.args)&&record.response.records.length)
 return status==='success'?'本任务已取得记录':retained&&status==='unavailable'?'最近查询失败，保留已取得记录':retained&&status==='empty'?'最近查询空结果，保留已取得记录':labels[status]
}
export function newsCoverageNote(state){
 return '查询覆盖：'+state.entries.map(entry=>`${entry.request.query}：${coverageLabel(state,entry)}`).join('；')+'。仅覆盖已执行来源的查询窗口，不代表区间全部报道。'
}
export function coverageBindingCandidate(recipe,state){
 if(recipe?.mapping?.type!=='news')return
 const requests=recipe.requests.map(row=>({key:row.key,tool:row.toolId==='public_data_query'?row.toolId:'ework__'+row.toolId,args:row.args}))
 const items=Array.isArray(recipe.mapping.items)?[...recipe.mapping.items]:[recipe.mapping.items]
 const references=(value,key)=>object(value)&&(value.$from===key||Object.values(value).some(item=>references(item,key)))||Array.isArray(value)&&value.some(item=>references(item,key))
 for(const entry of state.entries){
  const actual=state.records.findLast(row=>sameQuery(entry.request,row.args))
  if(!actual)continue
  let request=requests.find(row=>row.tool==='public_data_query'&&isDeepStrictEqual(row.args,actual.args))
  if(!request){
   if(requests.length>=8)return
   let index=0,key;do{key='newsCoverage'+index++}while(requests.some(row=>row.key===key))
   request={key,tool:'public_data_query',args:actual.args};requests.push(request)
  }
  if(items.some(value=>references(value,request.key)))continue
  items.push({$from:request.key,$each:'records',$map:{title:{$path:'title'},summary:{$path:'summary',$default:'来源未提供摘要'},...(entry.request.source==='eastmoney-news'?{date:{$path:'time'}}:{}),url:{$path:'url'},category:{$path:'publisher',$optional:true}}})
 }
 return {version:1,type:'data-bound',requests,mapping:{...recipe.mapping,items}}
}
export function appendNewsCoverage(output,state,{refresh}={}){
 const spec=JSON.parse(output)
 if(spec.type!=='html')return output
 const fixed=value=>`<span data-workbench-status-text>${escape(value)}</span>`
 const entries=state.entries.map(entry=>`${escape(entry.request.query)}：${fixed(coverageLabel(state,entry))} (${entry.request.source==='gdelt-news'?'GDELT':'Eastmoney'})`).join('；')
 const status=refresh==='snapshot'?'当前为静态快照；逐查询自动更新尚未完整绑定。':refresh==='partial'?'周期更新以实际绑定状态为准；缺失查询尚未绑定。':''
 const aside=`<aside data-news-query-coverage role="status" style="padding:8px 10px;color:var(--sherlock-muted);font:11px/1.6 var(--sherlock-font-sans)">${fixed('查询覆盖：')}${entries}。${fixed('仅覆盖已执行来源的查询窗口，不代表区间全部报道。')}${status?fixed(status):''}</aside>`
 return JSON.stringify({...spec,html:/<body\b[^>]*>/iu.test(spec.html)?spec.html.replace(/<body\b[^>]*>/iu,match=>match+aside):aside+spec.html})
}
