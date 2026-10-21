import {evidenceWindows} from './workbench-explicit-scope.js'
import {extractArtifactObjects} from './artifact-output.js'
import {noticeDay} from './announcement-provenance.js'

// Only internal captured human context establishes real/simulated mode. Artifact
// titles, notes, and prompt markers cannot grant or remove source obligations.
export function articleTimelineRequired(data,options={}) {
 const request=options.workbenchRequest
 if(data?.type!=='timeline'||!request||request.dataMode!=='source')return false
 if(/(?:只|仅)?(?:用|使用|依据|根据)\s*(?:我|用户)(?:已)?(?:提供|上传)的?(?:新闻|文章)?(?:原文|资料|内容)/u.test(request.originalRequest))return false
 return /新闻|资讯|公告|研报|文章|\b(?:news|articles?|reports?)\b/iu.test(options.panelRequest??'')
}

// Calendar-day equivalence only. A date fingerprint cannot establish clock time,
// a timezone-less timestamp, an approximate date, or a date inferred from URLs.
export function articleTimelineDay(value) {
 if(typeof value!=='string')return null
 const match=value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/u)
 return noticeDay(match?`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`:value)
}
export function articleTimelineWindowIssue(data,item,options={}) {
 const windows=evidenceWindows(options,data.range)
 if(windows.some(w=>!noticeDay(w.start)||!noticeDay(w.end)||w.start>w.end))return '明确日期窗口无效；不修改原始请求范围'
 const day=articleTimelineDay(item?.time)
 if(!day)return '缺少可核验的明确原文日期'
 if(windows.some(w=>day<w.start||day>w.end))return '原文日期超出明确日期窗口，作为背景保留但不计入窗口内记录'
 return null
}

// This is scope matching only, never article evidence. Prefer the literal
// human token; an omitted exchange suffix cannot manufacture an exchange fact.
function humanScopeIdentity(value,human) {
 if(typeof value!=='string'||value.length<2)return null
 const normalize=text=>text.normalize('NFKC').toLowerCase()
 const candidate=normalize(value),code=candidate.match(/^(?:(sh|sz))?(\d{6})(?:\.(sh|sz))?$/u)
 if(!code)return human.includes(value)?value:null
 for(const match of normalize(human).matchAll(/(?<![a-z0-9])(?:(sh|sz))?(\d{6})(?:\.(sh|sz))?(?![a-z0-9])/gu)){
  const expected=code[1]??code[3],observed=match[1]??match[3]
  if(code[2]===match[2]&&(!expected||!observed||expected===observed))return match[0]
 }
 return null
}
// The first draft is not source authority. Restore source-proven identities
// (including backgrounds), then let the normal window gate decide eligibility.
// Unproven omissions carry human objects/categories only, never model facts.
export function restoreArticleTimelineScope(text,original,options={},isSourceProven=()=>false) {
 const candidates=extractArtifactObjects(text),data=candidates.length===1?candidates[0]:null
 if(!articleTimelineRequired(data,options)||!Array.isArray(data.items)||!original||!Array.isArray(original.items)||original.items.length>60)return
 const same=(a,b)=>a?.url&&b?.url?a.url===b.url:typeof a?.id==='string'&&a.id===b?.id
 const missing=original.items.filter(item=>!data.items.some(current=>same(item,current)))
 const proven=missing.filter(isSourceProven),unproven=missing.filter(item=>!proven.includes(item))
 const human=options.workbenchRequest.originalRequest
 const scope=[...new Set(unproven.flatMap(item=>[item?.actor,item?.object].map(value=>humanScopeIdentity(value,human)).filter(Boolean)))]
 const categories=['行业政策','公告','新闻','研报'].filter(value=>human.includes(value))
 const gap=unproven.length?[
  '修复省略了尚未取得原文核验的候选，未作为有效记录，不能视为已完整覆盖。',
  scope.length?`原研究对象待核验：${scope.join('、')}。`:null,
  categories.length?`人类要求的研究类别：${categories.join('、')}；未取得部分仍属数据缺口。`:null
 ].filter(Boolean).join(''):null
 if(!proven.length&&!gap)return
 // Keep scope notes outside model data until the common partial-feed finalizer
 // invalidates stale metadata and enforces the complete note/schema budget.
 return {text:JSON.stringify({...data,items:[...data.items,...proven]}),gaps:gap?[gap]:[]}
}
