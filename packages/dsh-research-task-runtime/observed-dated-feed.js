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

const utcTimestamp=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value.replace('Z','.000Z')

function exactReleaseList(record,repo,count,includeBody) {
 if(record.tool!=='web_fetch'||record.purpose!=='snapshot'||record.response?.sourceUrl!==record.args?.url)return false
 let url
 try{url=new URL(record.args.url)}catch{return false}
 if(url.origin!=='https://api.github.com'||url.pathname.toLowerCase()!==`/repos/${repo}/releases`||
  url.searchParams.get('per_page')!==String(count)||url.searchParams.getAll('per_page').length!==1||
  url.searchParams.getAll('page').length>1||
  [...url.searchParams].some(([key,value])=>key!=='per_page'&&(key!=='page'||value!=='1')))return false
 const rows=record.response.records
 return Array.isArray(rows)&&rows.length===count&&new Set(rows.map(row=>row?.html_url)).size===count&&rows.every(row=>
  row?.draft===false&&typeof row.tag_name==='string'&&row.tag_name.trim()&&
  utcTimestamp(row.published_at)&&
  typeof row.html_url==='string'&&row.html_url.toLowerCase().startsWith(`https://github.com/${repo}/releases/tag/`)&&
  (!includeBody||typeof row.body==='string'))
}

export function observedReleaseTimeline(scope,records,title) {
 const requests=[],items=[]
 for(const [index,repo] of scope.repos.entries()){
  const source=records.findLast(record=>exactReleaseList(record,repo,scope.count,scope.includeBody))
  if(!source)return
  const key='releases'+index
  requests.push({key,tool:source.tool,args:source.args})
  items.push({$from:key,$each:'records',$map:{
   id:{$path:'html_url'},title:{$path:'tag_name'},time:{$path:'published_at'},url:{$path:'html_url'},object:repo,
   ...(scope.includeBody?{summary:{$path:'body'}}:{})
  }})
 }
 return JSON.stringify({version:1,type:'data-bound',requests,mapping:{
  version:1,type:'timeline',title:title?.trim().slice(0,256)||'发布动态',timeZone:'UTC',items
 }})
}
