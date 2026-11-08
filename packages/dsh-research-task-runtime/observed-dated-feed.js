import {hostStructuredWebRecord} from './component-source-binding.js'

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

export function workbenchReleaseScope(original,panel,format){
 const prior=(format==='timeline'||format==='html'&&/(?:只放|仅放|只要)一张/u.test(original??'')&&/发布动态|GitHub Releases/iu.test(panel??''))&&releaseTimelineScope(original)
 if(prior)return prior
 // A supported source adapter owns pagination and completeness, regardless of
 // whether the user calls it a timeline, release list or searchable table.
 // It does not route graphs/analysis, infer a repo, or ignore requested filters.
 if(!['timeline','html','table'].includes(format)||!/发布记录|发布动态|版本记录|release(?:s| records| notes)?/iu.test(panel??''))return
 const text=String(original??'')
 if(!/GitHub/iu.test(text)||/\d{4}-\d{2}-\d{2}|仅(?:保留|显示|看)?(?:稳定版|预发布)|(?:排除|不含|只要|只看|不要).{0,8}(?:稳定版|预发布)/u.test(text))return
 const counts=[...text.matchAll(/(?:最近|最新)\s*(各自?)?\s*(\d{1,3})\s*条/gu)]
 const repos=[...new Set([...text.matchAll(/(?<![\w./])([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)(?![\w./])/gu)].map(match=>match[1].toLowerCase()))]
 if(counts.length!==1||!repos.length||repos.length>8||repos.length>1&&!counts[0][1])return
 const count=Number(counts[0][2]);if(count<1||count>100)return
 return {repos,count,includeBody:/发布说明|Release Notes|正文|变更|更新要点/iu.test(text),...(/表格|总表|明细表|可搜索/u.test(panel??'')?{presentation:'table'}:{})}
}

const utcTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.replace('Z','.000Z')

function releasePage(record,repo,includeBody) {
 if(record.tool!=='web_fetch'||record.purpose!=='snapshot'||record.response?.sourceUrl!==record.args?.url)return false
 let url
 try{url=new URL(record.args.url)}catch{return false}
 if(url.origin!=='https://api.github.com'||url.pathname.toLowerCase()!==`/repos/${repo}/releases`||
  !/^\d{1,3}$/u.test(url.searchParams.get('per_page')??'')||url.searchParams.getAll('per_page').length!==1||
  url.searchParams.getAll('page').length>1||
  [...url.searchParams].some(([key,value])=>key!=='per_page'&&(key!=='page'||!/^\d{1,2}$/u.test(value))))return false
 const size=Number(url.searchParams.get('per_page')),page=Number(url.searchParams.get('page')??1)
 const rows=record.response.records
 if(size<1||size>100||page<1||!Array.isArray(rows)||!rows.length||rows.length>size||
  new Set(rows.map(row=>row?.html_url)).size!==rows.length||!rows.every(row=>
  row?.draft===false&&typeof row.tag_name==='string'&&row.tag_name.trim()&&
  utcTimestamp(row.published_at)&&
  typeof row.html_url==='string'&&row.html_url.toLowerCase().startsWith(`https://github.com/${repo}/releases/tag/`)&&
  (!includeBody||typeof row.body==='string')))return false
 return {size,page,rows,record}
}

function releasePages(records,repo,count,includeBody){
 const pages=records.map(record=>releasePage(record,repo,includeBody)).filter(Boolean)
 for(const first of pages.filter(page=>page.page===1).reverse()){
  const selected=[],seen=new Set()
  let remaining=count
  for(let index=1;remaining>0;index++){
   const page=index===1?first:pages.findLast(page=>page.size===first.size&&page.page===index)
   if(!page||page.rows.some(row=>seen.has(row.html_url)))break
   const take=Math.min(remaining,page.rows.length)
   selected.push({record:page.record,take})
   remaining-=take
   for(const row of page.rows)seen.add(row.html_url)
   if(page.rows.length<page.size)break
  }
  if(!remaining)return selected
 }
}

export function observedReleaseTimeline(scope,records,title) {
 const requests=[],items=[]
 for(const repo of scope.repos){
  const pages=releasePages(records,repo,scope.count,scope.includeBody)
  if(!pages||requests.length+pages.length>16)return
  for(const {record,take} of pages){
   const key='releases'+requests.length
   requests.push({key,tool:record.tool,args:record.args})
   if(scope.presentation==='table')items.push({$from:key,$each:'records',$take:take,$map:[{$path:'tag_name'},{$path:'published_at'},{$path:'html_url'},...(scope.includeBody?[{$path:'body'}]:[])]})
  else items.push({$from:key,$each:'records',$take:take,$map:{
    id:{$path:'html_url'},title:{$path:'tag_name'},time:{$path:'published_at'},url:{$path:'html_url'},object:repo,
    ...(scope.includeBody?{summary:{$path:'body'}}:{})
   }})
  }
 }
 return JSON.stringify({version:1,type:'data-bound',requests,mapping:{
  ...(scope.presentation==='table'?{version:1,type:'table',title:title?.trim().slice(0,256)||'发布记录',columns:['版本','发布日期','原始链接',...(scope.includeBody?['发布说明（原文）']:[])],rows:items,note:'保留来源的全部记录与原文；发布说明为空表示该条来源未提供正文。',sources:scope.repos.map(repo=>({label:repo+' GitHub Releases',url:'https://github.com/'+repo+'/releases'}))}:{version:1,type:'timeline',title:title?.trim().slice(0,256)||'发布动态',timeZone:'UTC',items})
 }})
}

export function releaseTimelineComplete(scope,data,records){
 if(scope.presentation==='table'){
  if(data?.type!=='table'||!Array.isArray(data.rows)||data.rows.length!==scope.count*scope.repos.length)return false
  const expected=[]
  for(const repo of scope.repos){const pages=releasePages(records,repo,scope.count,scope.includeBody);if(!pages)return false;for(const {record,take}of pages)for(const row of record.response.records.slice(0,take))expected.push([row.tag_name,row.published_at,row.html_url,...(scope.includeBody?[row.body]:[])])}
  return JSON.stringify(data.rows)===JSON.stringify(expected)
 }
 if(data?.type!=='timeline'||!Array.isArray(data.items)||data.items.length!==scope.count*scope.repos.length)return false
 const expected=new Map()
 for(const repo of scope.repos){
  const pages=releasePages(records,repo,scope.count,scope.includeBody)
  if(!pages)return false
  for(const {record,take} of pages)for(const row of record.response.records.slice(0,take))expected.set(row.html_url,{row,repo})
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
export async function readReleaseTimeline(scope,fetchPage,signal){
 const groups=await Promise.all(scope.repos.map(async repo=>{
  let size=scope.count,remaining=scope.count,records=[],reads=0
  while(remaining>0&&reads++<20){
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
   if(!result||result.rows.length<Math.min(size,remaining))return
   records.push(response)
   remaining-=result.rows.length
  }
  if(remaining<=0&&releasePages(records,repo,scope.count,scope.includeBody))return records
 }))
 return groups.every(Boolean)?groups.flat():[]
}
