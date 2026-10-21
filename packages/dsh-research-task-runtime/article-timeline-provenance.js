import {extractArtifactObjects} from './artifact-output.js'
import {explicitWindows,noticeDay} from './announcement-provenance.js'

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
 const windows=[...explicitWindows(options.workbenchRequest?.originalRequest),...explicitWindows(options.panelRequest),...explicitWindows(data.range)]
 if(windows.some(w=>!noticeDay(w.start)||!noticeDay(w.end)||w.start>w.end))return '明确日期窗口无效；不修改原始请求范围'
 const day=articleTimelineDay(item?.time)
 if(!day)return '缺少可核验的明确原文日期'
 if(windows.some(w=>day<w.start||day>w.end))return '原文日期超出明确日期窗口，作为背景保留但不计入窗口内记录'
 return null
}

// The first draft is not source authority. Keep previously proven records and
// gaps for human-requested objects; do not turn invented article titles into a
// mandatory scope. Unproven summaries and dates are never carried as facts.
export function restoreArticleTimelineScope(text,original,options={},isVerified=()=>false) {
 const candidates=extractArtifactObjects(text),data=candidates.length===1?candidates[0]:null
 if(!articleTimelineRequired(data,options)||!Array.isArray(data.items)||!original||!Array.isArray(original.items)||original.items.length>60)return
 const same=(a,b)=>a?.url&&b?.url?a.url===b.url:typeof a?.id==='string'&&a.id===b?.id
 const missing=original.items.filter(item=>!data.items.some(current=>same(item,current)))
 const proven=missing.filter(isVerified)
 const human=options.workbenchRequest.originalRequest
 const scope=[...new Set(missing.filter(item=>!proven.includes(item)).flatMap(item=>[item?.actor,item?.object].filter(value=>typeof value==='string'&&value.length>=2&&human.includes(value))))]
 const categories=['行业政策','公告','新闻','研报'].filter(value=>human.includes(value))
 const gap=scope.length?`原研究范围待核验：${scope.join('、')}；本次修复未保留对应已核验原文，不能视为已完整覆盖。${categories.length?'人类要求的研究类别：'+categories.join('、')+'；未取得部分仍属数据缺口。':''}`:null
 if(!proven.length&&!gap)return
 return JSON.stringify({...data,items:[...data.items,...proven],...((gap||data.note)?{note:[data.note,gap].filter(Boolean).join('\n')}:{})})
}
