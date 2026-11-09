import {hostStructuredWebRecord} from './component-source-binding.js'
import {readTemplateModel} from './component-template-registry.js'
const processingRequired=text=>/主要变化|变更要点|变更摘要|变化摘要|升级注意|升级风险|迁移|破坏性|影响分析|建议/u.test(text??'')
const linkedBodyOnly=value=>typeof value==='string'&&value.length<=2000&&/\[[^\]]+\]\(https?:\/\/[^)]+\)/u.test(value)&&value.split(/\n/u).filter(line=>line.trim()).every(line=>/^(?:For (?:stable releases?|pre-releases?),? please (?:refer|see)|(?:详情|内容)?(?:请)?(?:详见|参见)|\*?\*?Full Changelog)/iu.test(line.trim()))

export function releaseLinkedSourceFollowup(records,request){
 if(!processingRequired(request))return
 const urls=new Set()
 for(const record of records??[]){
  if(record.tool!=='web_fetch'||!Array.isArray(record.response?.records))continue
  for(const row of record.response.records){
   if(!linkedBodyOnly(row.body))continue
   for(const match of row.body.matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/gu)){
    try{const url=new URL(match[1]);if(url.protocol==='https:'&&url.hostname==='github.com'&&!url.username&&!url.password&&/^\/[\w.-]+\/[\w.-]+\/blob\//u.test(url.pathname))urls.add(url.href)}catch{}
   }
  }
 }
 if(urls.size)return '已取得发布身份与日期，但正文仅指向其他原文，尚未取得用户要求的实际变更。继续用本卡已授权 web_fetch 读取下列来源原文，按目标版本标题定位对应章节，保留变化与升级注意事项的证据；不把目录指引当正文，不重查已核实版本：\n'+JSON.stringify([...urls].slice(0,5))
}

// Product names are not repository identifiers. Only an actually observed
// official collection URL can supply a missing repository, and ambiguity is
// left to acquisition rather than guessed from a product-name allowlist.
export function observedWorkbenchReleaseScope(original,panel,format,records=[]){
 const repos=[...new Set(records.flatMap(record=>{
  if(record.tool!=='web_fetch')return []
  try{const url=new URL(record.args?.url),match=url.origin==='https://api.github.com'&&url.pathname.match(/^\/repos\/([\w.-]+\/[\w.-]+)\/releases$/u);return match?[match[1]]:[]}catch{return []}
 }))]
 const named=repos.filter(repo=>String(panel).toLowerCase().includes(repo.toLowerCase()))
 const chosen=named.length===1?named:repos
 if(chosen.length!==1)return
 return workbenchReleaseScope(String(original??'')+'\nGitHub '+chosen[0],panel,format)
}

export function releaseCohortIssue(candidate,records,original,panel){
 if(!/版本|升级|发布|变更/u.test(panel??''))return
 const scope=observedWorkbenchReleaseScope(original,'发布记录','table',records)
 if(!scope?.stableOnly)return
 const expected=[]
 for(const repo of scope.repos){const pages=releasePages(records,repo,scope.count,false,true);if(!pages)return;for(const {record,indices} of pages)for(const i of indices)expected.push(record.response.records[i].tag_name)}
 const data=readTemplateModel(candidate)?.data??candidate
 if(processingRequired(String(original??'')+'\n'+String(panel??''))){
  const texts=data?.type==='timeline'?data.items?.map(item=>item.summary):Array.isArray(data?.rows)?data.rows.flat().filter(value=>typeof value==='string'):[]
  if(texts?.some(linkedBodyOnly))return '当前仅取得发布日期和指向CHANGELOG的说明，尚未取得要求的实际变更或升级分析。沿已读取原文中的真实链接读取目标版本章节，不能用重复的来源指引或发布列表替代处理结果。'
 }
 let versions
 if(['table','market'].includes(data?.type)&&Array.isArray(data.rows)){
  const column=data.columns?.findIndex(column=>/版本|\bversion\b/iu.test(typeof column==='string'?column:column?.label??''))
  if(column>=0)versions=data.rows.map(row=>String(row[column]).trim())
 }else if(data?.type==='timeline'&&Array.isArray(data.items))versions=data.items.map(item=>item.title)
 if(!versions)return
 const key=value=>value.trim().replace(/^v(?=\d)/u,'')
 if(new Set(versions.map(key)).size!==expected.length||versions.some(version=>!expected.some(item=>key(item)===key(version))))
  return '交付版本与本卡已读取的最近正式发布集合不一致。按官方列表顺序排除 prerelease=true，保留最近'+scope.count+'条实际发布：'+expected.join('、')+'。不能替换成最近几个次版本或混入预发布；复用已取得记录，不重新取数。'
}

// The host can finish a dated collection without a model artifact when the
// human supplied exact sources and counts, and all source lists are complete.
export function releaseTimelineScope(request) {
 const text=typeof request==='string'?request:''
 if(!/GitHub\s+Releases/iu.test(text)||!/时间线/u.test(text)||
  !/超出容量[^。；]{0,40}(?:切换|分页)/u.test(text)||
  /\d{4}-\d{2}-\d{2}|仅(?:保留|显示|看)?(?:稳定版|预发布)|(?:排除|不含|只要|只看|不要).{0,8}(?:稳定版|预发布)/u.test(text))return null
 const counts=[...text.matchAll(/(?:最近|最新)\s*(各自?)?\s*(\d{1,3})\s*条/gu)]
 const repos=[...new Set([...text.matchAll(/(?<![\w./])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?![\w./])/gu)].map(match=>match[1].toLowerCase()))]
 if(counts.length!==1||!repos.length||repos.length>8||repos.length>1&&!counts[0][1])return null
 const count=Number(counts[0][2])
 if(count<1||count>100)return null
 return {repos,count,includeBody:/发布说明|Release Notes/iu.test(text)}
}

// Source paths and citations do not assign a collection to this card. Shared
// board counts apply only when its own content contract asks for that collection.
function releaseCollectionIntent(panel){
 const clauses=String(panel??'').split(/[。；;\n]/u).filter(clause=>!/^\s*(?:数据来源|来源|参考|依据|sources?\b|data sources?\b)/iu.test(clause))
 return clauses.some(clause=>/发布记录|发布动态|版本记录|版本.{0,12}(?:日期|发布说明|主要变化)|(?<![\w/@.-])release(?:s| records| notes| list| history)?(?![\w/.-])/iu.test(clause))
}

export function workbenchReleaseScope(original,panel,format){
 const prior=(format==='timeline'||format==='html'&&/(?:只放|仅放|只要)一张/u.test(original??'')&&/发布动态|GitHub Releases/iu.test(panel??''))&&releaseTimelineScope(original)
 if(prior)return prior
 // A supported source adapter owns pagination and completeness, regardless of
 // whether the user calls it a timeline, release list or searchable table.
 // It does not route graphs/analysis, infer a repo, or ignore requested filters.
 if(!['timeline','html','table'].includes(format)||!releaseCollectionIntent(panel))return
 const text=String(original??'')
 if(/\d{4}-\d{2}-\d{2}|(?:只要|只看|仅看).{0,8}预发布|(?:排除|不含|不要).{0,8}(?:稳定版|正式版)/u.test(text))return
 const counts=[...text.matchAll(/(?:最近|最新)\s*(各自?)?\s*(\d{1,3})\s*(?:条|个(?:正式|稳定)?版本)/gu)]
 const repos=[...new Set([...text.matchAll(/(?<![\w./])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?![\w./])/gu)].map(match=>match[1].toLowerCase()))]
 if(counts.length!==1||!repos.length||repos.length>8||repos.length>1&&!counts[0][1])return
 const count=Number(counts[0][2]);if(count<1||count>100)return
 return {repos,count,includeBody:/发布说明|Release Notes|正文|变更|更新要点|主要变化/iu.test(text+'\n'+String(panel??'')),...(processingRequired(text+'\n'+String(panel??''))?{processingRequired:true}:{}),...(/正式|稳定|排除预发布|不含预发布/u.test(text)?{stableOnly:true}:{}),...(/表格|总表|明细表|可搜索/u.test(panel??'')?{presentation:'table'}:{})}
}

const utcTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.replace('Z','.000Z')

function releasePage(record,repo,includeBody) {
 if(record.tool!=='web_fetch'||record.purpose!=='snapshot'||record.response?.sourceUrl!==record.args?.url)return false
 let url
 try{url=new URL(record.args.url)}catch{return false}
 const web=url.origin==='https://github.com'&&url.pathname.toLowerCase()===`/${repo}/releases`
 if(!web&&(url.origin!=='https://api.github.com'||url.pathname.toLowerCase()!==`/repos/${repo}/releases`)||
  !web&&(!/^\d{1,3}$/u.test(url.searchParams.get('per_page')??'')||url.searchParams.getAll('per_page').length!==1)||
  url.searchParams.getAll('page').length>1||
  [...url.searchParams].some(([key,value])=>key!=='per_page'&&(key!=='page'||!/^\d{1,3}$/u.test(value))||web&&key==='per_page'))return false
 const size=web?10:Number(url.searchParams.get('per_page')),page=Number(url.searchParams.get('page')??1)
 const rows=record.response.records
 if(size<1||size>100||page<1||page>100||!Array.isArray(rows)||!rows.length||rows.length>size||
  new Set(rows.map(row=>row?.html_url)).size!==rows.length||!rows.every(row=>
  row?.draft===false&&typeof row.tag_name==='string'&&row.tag_name.trim()&&
  utcTimestamp(row.published_at)&&
  typeof row.html_url==='string'&&row.html_url.toLowerCase().startsWith(`https://github.com/${repo}/releases/tag/`)&&
  (!includeBody||typeof row.body==='string'&&row.body_complete!==false)&&
  (!web||row.body_format==='official-webpage-transcription')))return false
 return {size,page,rows,record,web}
}

function releasePages(records,repo,count,includeBody,stableOnly=false){
 const pages=records.map(record=>releasePage(record,repo,includeBody)).filter(Boolean)
 for(const first of pages.filter(page=>page.page===1).reverse()){
  const selected=[],seen=new Set()
  let remaining=count
  for(let index=1;remaining>0;index++){
   const page=index===1?first:pages.findLast(page=>page.size===first.size&&page.web===first.web&&page.page===index)
   if(!page||page.rows.some(row=>seen.has(row.html_url)))break
   if(stableOnly&&page.rows.some(row=>typeof row.prerelease!=='boolean'))break
   const indices=page.rows.map((row,i)=>!stableOnly||row.prerelease===false?i:-1).filter(i=>i>=0).slice(0,remaining)
   selected.push({record:page.record,indices})
   remaining-=indices.length
   for(const row of page.rows)seen.add(row.html_url)
   if(page.rows.length<page.size)break
  }
  if(!remaining)return selected
 }
}

export function observedReleaseTimeline(scope,records,title) {
 const requests=[],items=[]
 for(const repo of scope.repos){
  const pages=releasePages(records,repo,scope.count,scope.includeBody,scope.stableOnly)
  if(!pages||requests.length+pages.length>128)return
  for(const {record,indices} of pages){
   const key='releases'+requests.length
   requests.push({key,tool:record.tool,args:record.args})
   // Each page is a source list, not a table row. Emit row-level selectors so
   // multiple transport pages cannot become nested arrays of table rows.
   if(scope.presentation==='table')for(const i of indices)items.push(
    ['tag_name','published_at','html_url',...(scope.includeBody?['body']:[])].map(field=>({$from:key,$path:`records.${i}.${field}`})))
  else for(const i of indices)items.push({
    id:{$from:key,$path:`records.${i}.html_url`},title:{$from:key,$path:`records.${i}.tag_name`},time:{$from:key,$path:`records.${i}.published_at`},url:{$from:key,$path:`records.${i}.html_url`},object:repo,
    ...(scope.includeBody?{summary:{$from:key,$path:`records.${i}.body`}}:{})
   })
  }
 }
 return JSON.stringify({version:1,type:'data-bound',requests,mapping:{
  ...(scope.presentation==='table'?{version:1,type:'table',title:title?.trim().slice(0,256)||'发布记录',columns:['版本','发布日期','原始链接',...(scope.includeBody?['发布说明（全文）']:[])],rows:items,note:'保留来源全部记录和完整正文；官方网页备选路径保留全文转写与链接，不宣称与 API 原始 Markdown 字节相同。发布说明为空表示来源未提供正文。',sources:scope.repos.map(repo=>({label:repo+' GitHub Releases',url:'https://github.com/'+repo+'/releases'}))}:{version:1,type:'timeline',title:title?.trim().slice(0,256)||'发布动态',timeZone:'UTC',items})
 }})
}

export function releaseTimelineComplete(scope,data,records){
 if(scope.presentation==='table'){
  if(data?.type!=='table'||!Array.isArray(data.rows)||data.rows.length!==scope.count*scope.repos.length)return false
  const expected=[]
  for(const repo of scope.repos){const pages=releasePages(records,repo,scope.count,scope.includeBody,scope.stableOnly);if(!pages)return false;for(const {record,indices}of pages)for(const i of indices){const row=record.response.records[i];expected.push([row.tag_name,row.published_at,row.html_url,...(scope.includeBody?[row.body]:[])])}}
  return JSON.stringify(data.rows)===JSON.stringify(expected)
 }
 if(data?.type!=='timeline'||!Array.isArray(data.items)||data.items.length!==scope.count*scope.repos.length)return false
 const expected=new Map()
 for(const repo of scope.repos){
  const pages=releasePages(records,repo,scope.count,scope.includeBody,scope.stableOnly)
  if(!pages)return false
  for(const {record,indices} of pages)for(const i of indices){const row=record.response.records[i];expected.set(row.html_url,{row,repo})}
 }
 for(const item of data.items){
  const entry=expected.get(item.url)
  if(!entry||entry.repo!==item.object||entry.row.tag_name!==item.title||entry.row.published_at!==item.time||
   scope.includeBody&&entry.row.body!==item.summary)return false
  expected.delete(item.url)
 }
 return expected.size===0
}

// Each known source owns its pagination semantics. Retry a smaller page only
// on transport truncation or a clipped JSON array; start over at page one when
// the page size changes so offsets cannot skip or duplicate records.
async function readApiReleaseTimeline(scope,fetchPage,signal){
 const groups=await Promise.all(scope.repos.map(async repo=>{
  let size=scope.count,remaining=scope.count,records=[],reads=0
  while(remaining>0&&reads++<Math.min(116,Math.max(20,scope.count+8))){
   signal?.throwIfAborted()
   const url=new URL(`https://api.github.com/repos/${repo}/releases`)
   url.searchParams.set('per_page',String(size))
   if(records.length)url.searchParams.set('page',String(records.length+1))
   const page=await fetchPage(url.href,signal)
   if(page?.statusCode!==200||page.url!==url.href)return
   const text=page.body?.content??''
   const response=hostStructuredWebRecord(page,url.href)
   if(page.truncated||Buffer.byteLength(text)>48_000||!response&&/\[网页读取状态[^\]]*\]\s*\[/u.test(text)){
    if(size===1)return
    size=Math.max(1,Math.floor(size/2))
    remaining=scope.count;records=[]
    continue
   }
   const result=response&&releasePage(response,repo,scope.includeBody)
   if(!result||scope.stableOnly&&result.rows.some(row=>typeof row.prerelease!=='boolean'))return
   records.push(response)
   remaining-=result.rows.filter(row=>!scope.stableOnly||row.prerelease===false).length
   if(result.rows.length<size&&remaining>0)return
  }
  if(remaining<=0&&releasePages(records,repo,scope.count,scope.includeBody,scope.stableOnly))return records
 }))
 return groups.every(Boolean)?groups.flat():[]
}

export async function readReleaseTimeline(scope,fetchPage,signal){
 // Retry a representation, not unrelated providers or guessed interfaces.
 // Exceptions, rate-limit JSON returned as HTTP 200 and invalid payloads all
 // lead to the same official public website. Never mix transport cohorts.
 let api=[]
 try{api=await readApiReleaseTimeline(scope,fetchPage,signal)}catch(error){signal?.throwIfAborted()}
 if(api.length)return api
 const groups=await Promise.all(scope.repos.map(async repo=>{
  const records=[];let remaining=scope.count
  for(let page=1;remaining>0&&page<=Math.min(100,Math.max(20,Math.ceil(scope.count/10)));page++){
   signal?.throwIfAborted()
   const url=`https://github.com/${repo}/releases?page=${page}`
   let response
   try{response=hostStructuredWebRecord(await fetchPage(url,signal),url)}catch(error){signal?.throwIfAborted();return}
   const result=response&&releasePage(response,repo,scope.includeBody)
   if(!result||scope.stableOnly&&result.rows.some(row=>typeof row.prerelease!=='boolean'))return
   records.push(response);remaining-=result.rows.filter(row=>!scope.stableOnly||row.prerelease===false).length
   if(result.rows.length<10&&remaining>0)return
  }
  if(remaining<=0&&releasePages(records,repo,scope.count,scope.includeBody,scope.stableOnly))return records
 }))
 return groups.every(Boolean)?groups.flat():[]
}
