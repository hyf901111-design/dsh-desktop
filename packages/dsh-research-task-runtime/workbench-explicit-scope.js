// Deliberately finite human grammar, shared by host capture and legacy readers.
// No relative dates, date inference, provider grants or generated scope authority.
export function explicitWindows(value) {
 if(typeof value!=='string')return []
 return [...value.matchAll(/(?<!\d)(\d{4}-\d{2}-\d{2})\s*(?:至|到|[~～—–])\s*(\d{4}-\d{2}-\d{2})(?!\d)/gu)].map(m=>({start:m[1],end:m[2]}))
}
const day=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(value)&&!value.startsWith('0000')&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
const future=/未来|今后|接下来|即将|\bfuture\b|\bupcoming\b/iu
const past=/历史|过去|往期|\bhistorical\b|\bpast\b/iu
const topics=[/新闻|资讯|\bnews\b|\barticles?\b/iu,/公告|\bannouncements?\b/iu,/研报|\breports?\b/iu,/行业会议|会议|博览会|展会|\bconference/iu,/定期报告|财报|披露|季报|半年报|年报/u,/解禁/u,/股东大会/u]
const calendar=/事件|日历|日程|\bcalendar\b|\bevents?\b/iu
const all=/(?:所有|全部|每张|每个|各)(?:卡|面板)|整个工作台|共同(?:窗口|范围|日期)|共用|统一(?:窗口|范围|日期)|全局|\bshared\b/iu
const ids=value=>topics.flatMap((re,i)=>re.test(value)?[i]:[])
const supplied=/(?:只|仅)?(?:用|使用|依据|根据)\s*(?:我|用户)(?:已)?(?:提供|上传)的?(?:新闻|文章|日历|日程|事件)?(?:原文|资料|内容)/u
export const usesHumanSourceScope=request=>request?.dataMode!=='simulated'&&!supplied.test(request?.originalRequest??'')
const ambiguity=()=>{throw Error('人类明确日期范围的适用卡片存在歧义或冲突；请明确各卡日期窗口，不能扩大或猜测范围。')}
export function restoreExplicitScope(value) {
 if(!value||Object.keys(value).some(k=>!['windows','future'].includes(k))||typeof value.future!=='boolean'||!Array.isArray(value.windows)||value.windows.length>16)ambiguity()
 const windows=value.windows.map(w=>{
  if(!w||Object.keys(w).length!==2||!day(w.start)||!day(w.end)||w.start>w.end)ambiguity()
  return Object.freeze({start:w.start,end:w.end})
 })
 if(windows.length&&windows.reduce((a,w)=>a>w.start?a:w.start,'')>windows.reduce((a,w)=>a<w.end?a:w.end,'9999-12-31'))ambiguity()
 return Object.freeze({windows:Object.freeze(windows),future:value.future})
}
export function workbenchExplicitScope(original,panel={}) {
 const identity=[panel.title,panel.prompt].filter(Boolean).join('\n'),own=ids(identity)
 if(!own.length&&panel.type==='news')own.push(0)
 if(!own.length&&panel.type==='reports')own.push(2)
 const isCalendar=panel.type==='calendar'||calendar.test(identity)||own.some(i=>i>=3)
 const clauses=String(original??'').replace(/```[\s\S]*?```|`[^`]*`|“[^”]*”|「[^」]*」|^\s*>[^\n]*/gmu,'').split(/[。；;，,\n]/u).filter(Boolean)
 let selected=[]
 for(const clause of clauses){
  const windows=explicitWindows(clause),targets=ids(clause),generic=calendar.test(clause)&&!targets.length
  if(!windows.length&&!future.test(clause))continue
  if(!targets.length&&!generic&&!all.test(clause)&&/(?:卡|面板)/u.test(clause))ambiguity()
  const shared=all.test(clause)||!targets.length&&!generic
  if(!shared&&!targets.some(i=>own.includes(i))&&!(isCalendar&&(generic||!own.length&&targets.some(i=>i>=3))))continue
  if(windows.length>1&&/或者|或|分别/u.test(clause))ambiguity()
  selected.push({windows,future:future.test(clause),past:past.test(clause),shared,unlabelled:!targets.length&&!generic&&!all.test(clause)})
 }
 // A model qualifier selects between two explicitly distinguished human cards;
 // it cannot remove the only applicable human window or future requirement.
 if(selected.some(s=>s.future)&&selected.some(s=>s.past)){
  if(past.test(identity)&&!future.test(identity))selected=selected.filter(s=>s.shared||!s.future)
  else if(future.test(identity)&&!past.test(identity))selected=selected.filter(s=>s.shared||!s.past)
  else ambiguity()
 }
 if(!selected.length&&!own.length&&['timeline','calendar'].includes(panel.type)&&clauses.some(c=>explicitWindows(c).length))ambiguity()
 if(new Set(selected.filter(s=>s.unlabelled).flatMap(s=>s.windows.map(w=>JSON.stringify(w)))).size>1)ambiguity()
 if(selected.some(s=>s.future)&&selected.some(s=>s.past))ambiguity()
 return restoreExplicitScope({windows:selected.flatMap(s=>s.windows),future:selected.some(s=>s.future)})
}
// A persisted host field is authoritative. Legacy contexts resolve only from
// the captured human request and the original panel contract, never model data.
export function applicableExplicitScope(options={}) {
 if(!usesHumanSourceScope(options.workbenchRequest))return {windows:[],future:false}
 if(options.explicitScope!==undefined)return restoreExplicitScope(options.explicitScope)
 if(!options.workbenchRequest)return {windows:[],future:false}
 return workbenchExplicitScope(options.workbenchRequest.originalRequest,{prompt:options.panelRequest,type:options.panelType})
}
export function evidenceWindows(options={},range) {
 return [...applicableExplicitScope(options).windows,...explicitWindows(options.panelRequest),...explicitWindows(range)]
}
