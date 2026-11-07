// Presentation metadata comes from the same observed responses as the values.
// Do not infer a provider from a tool name, or use retrieval time as data time.
export function chartSourcesIssue(sources) {
 if(sources===undefined)return null
 const valid=s=>{
  if(!s||typeof s!=='object'||Array.isArray(s)||Object.keys(s).some(k=>!['label','url'].includes(k))||typeof s.label!=='string'||!s.label.trim()||s.label.length>256)return false
  if(s.url===undefined)return true
  try{const u=new URL(s.url);return typeof s.url==='string'&&s.url.length<=2048&&!/[\u0000-\u0020\u007f]/.test(s.url)&&['http:','https:'].includes(u.protocol)&&!u.username&&!u.password}catch{return false}
 }
 return Array.isArray(sources)&&sources.length<=12&&sources.every(valid)?null:'图表来源使用 sources:[{label,url?}]，链接必须为安全http/https'
}
export function sourcePeriod(response) {
 const date=value=>{
  if(typeof value!=='string')return null
  const text=/^\d{8}$/.test(value)?value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6):value
  return /^\d{4}-\d{2}-\d{2}$/.test(text)&&Number.isFinite(Date.parse(text))&&new Date(text).toISOString().slice(0,10)===text?text:null
 }
 const start=date(response?.period?.start),end=date(response?.period?.end)
 return start&&end&&start<=end?{start,end,label:start===end?end:start+' 至 '+end}:null
}
export function observedPresentationMetadata(matched) {
 const periods=matched.map(({response})=>sourcePeriod(response))
 const period=periods.length&&periods.every(p=>p&&p.label===periods[0]?.label)?periods[0]:null
 const sources=[]
 for(const {response}of matched){
  const name=response?.source
  if(typeof name!=='string'||!name.trim()||name.length>128||/[\u0000-\u001f]/.test(name))continue
  let url
  try{const u=new URL(response.sourceUrl);if(['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&typeof response.sourceUrl==='string'&&response.sourceUrl.length<=2048&&!/[\u0000-\u0020\u007f]/.test(response.sourceUrl))url=response.sourceUrl}catch{}
  if(!sources.some(s=>s.name===name&&s.url===url))sources.push({name,...(url?{url}:{})})
 }
 return {period,sources}
}
export function applyObservedPresentation(data,metadata) {
 if(!metadata)return data
 const {period,sources}=observedPresentationMetadata(metadata.matched)
 // Only absent or exact period-boundary headers can be expanded to a range.
 // A distinct quote/date or authored scope is never overwritten.
 if(period&&(!data.asOf||[period.start,period.end,period.start.replaceAll('-',''),period.end.replaceAll('-','')].includes(data.asOf)))data.asOf=period.label
 if(!data.asOf&&metadata.time)data.asOf=metadata.time
 if(['kpi','table','chart','market'].includes(data.type)&&(!data.sources||Array.isArray(data.sources)&&!data.sources.length)&&sources.length){
  data.sources=sources.map(({name,...rest})=>({...rest,[data.type==='kpi'?'name':'label']:name}))
 }
 return data
}
