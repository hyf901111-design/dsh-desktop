import {isDeepStrictEqual} from 'node:util'
import {acceptArtifactOutput,extractArtifactObjects} from './artifact-output.js'
import {componentMappableSource,componentBindingRequested} from './component-source-binding.js'
import {MAX_RESEARCH_HTML_BYTES} from './html-artifact.js'

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const escape=v=>String(v).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const text=v=>v===null||v===undefined?'本次未取得':typeof v==='object'?JSON.stringify(v):String(v)
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:undefined}catch{}}

// Last presentation strategy, after bounded model repair. This compiles only
// observed business responses, not a model-authored HTML/table or API examples.
// It is explicitly a source-record view, never a claim that the requested
// comparison, custom interaction or refresh recipe has been completed.
export function recoverObservedTable(records,{panelType,panelRequest='',originalRequest='',title,draft,error}={}){
 if(panelType!=='table'||!/^table\.(?:columns|rows)(?:\[|\b)/u.test(error??''))return null
 if(componentBindingRequested(originalRequest)||/筛选|排序|联动|编辑|钻取|可点击|点击.{0,12}(?:详情|切换)|filter|sort|drill|interactive/iu.test(originalRequest))return null
 // A model's table plan cannot override a human's chart requirement. When a
 // multi-card request has no trusted per-card human scope, stay conservative.
 if(/K\s*线|蜡烛图|折线图|趋势图|柱状图|饼图|散点图|candlestick|line\s+chart|bar\s+chart|pie\s+chart|scatter\s+plot/iu.test(originalRequest))return null
 if(/(?:只|仅|必须|指定).{0,16}(?:来源|Tushare|通联|DataYes|官方|网站|接口|插件)/iu.test(originalRequest))return null
 if(/(?:必须|保留|需要).{0,12}(?:K线|蜡烛|趋势图|交互)/iu.test(panelRequest))return null
 const candidates=extractArtifactObjects(draft??''),candidate=candidates.length===1?candidates[0]:undefined
 if(candidate?.type!=='data-bound'||!Array.isArray(candidate.requests)||!candidate.requests.length||candidate.requests.length>16||candidate.mapping?.type!=='table')return null
 const observed=[]
 for(const request of candidate.requests){
  const record=records.findLast(r=>r.tool===request.tool&&isDeepStrictEqual(r.args,request.args)&&componentMappableSource(r)&&!['discovery','snapshot'].includes(r.purpose))
  if(!record)return null
  if(!observed.some(r=>r.tool===record.tool&&isDeepStrictEqual(r.args,record.args)))observed.push(record)
 }
 const sections=[];let rowCount=0
 for(const record of observed){
  const response=record.response,rows=response?.records??response?.rows??response?.data
  if(response?.error!==undefined||response?.success===false||['error','failed','unavailable'].includes(response?.status)||Buffer.byteLength(JSON.stringify(response))>MAX_RESEARCH_HTML_BYTES)return null
  if(!object(response)||!Array.isArray(rows)||rows.length>2000||rows.some(row=>!object(row)))return null
  const fields=[...new Set(rows.flatMap(row=>Object.keys(row)))]
  if(fields.length>128||fields.some(key=>!key.trim()||['__proto__','prototype','constructor'].includes(key)))return null
  rowCount+=rows.length
  sections.push({response,rows,fields})
 }
 if(!rowCount||rowCount>5000)return null
 const label=typeof title==='string'&&title.trim()?title:'已取得的来源数据'
 const notice='已切换为来源明细；对比呈现暂未完成。保留本卡引用来源的完整记录、原始字段与单位，不补造缺失数据。静态快照，自动更新未绑定。'
 const tables=sections.map(({response,rows,fields},index)=>{
  const provider=typeof response.source==='string'?response.source:'已取得来源 '+(index+1),url=safeUrl(response.sourceUrl)
  const source=url?`<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(provider)}</a>`:escape(provider)
  const names={receivedAt:'获取时间（非报价时间）',timezone:'时区',note:'来源说明',unit:'单位',currency:'币种',asOf:'数据时点',status:'来源状态',missingFields:'缺失字段',fieldInfo:'字段说明',pagination:'返回范围'}
  // Keep every source metadata field, including structured units, partial
  // status and omissions. Rendering metadata is not executing its contents.
  const metadata=Object.entries(response).filter(([key])=>!['records','rows','data','source','sourceUrl'].includes(key)).map(([key,value])=>`<p>${escape(names[key]??key)}：${escape(text(value))}</p>`).join('')
  const headers=fields.map(key=>`<th>${escape(key)}${response.fieldInfo?.[key]!==undefined?'<small>'+escape(text(response.fieldInfo[key]))+'</small>':''}</th>`).join('')
  const body=rows.map(row=>'<tr>'+fields.map(key=>'<td>'+escape(text(row[key]))+'</td>').join('')+'</tr>').join('')
  return `<section><h3>${source}</h3>${metadata}${rows.length?`<div class="source-scroll" tabindex="0"><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`:'<p>本次未返回记录；未以其他来源或模拟数值补齐。</p>'}</section>`
 }).join('')
 const html=`<html><body data-observed-table-recovery><style>body{margin:0;padding:12px;background:var(--sherlock-surface);color:var(--sherlock-text);font:13px/1.6 var(--sherlock-font-sans)}aside,p,small{color:var(--sherlock-muted)}aside{white-space:pre-wrap}section{margin-top:18px}h3{font:600 14px/1.5 var(--sherlock-font-sans)}a{color:var(--sherlock-link)}.source-scroll{overflow:auto;max-height:70vh}table{border-collapse:collapse;min-width:100%;width:max-content}th,td{padding:8px;text-align:left;vertical-align:top;border-bottom:1px solid var(--sherlock-border);max-width:480px;white-space:pre-wrap;overflow-wrap:anywhere}th{background:var(--sherlock-surface-muted)}small{display:block;font-weight:400}p{margin:5px 0}</style><aside role="status">${notice}</aside>${tables}</body></html>`
 const output=acceptArtifactOutput(JSON.stringify({version:1,type:'html',title:label,html}))
 if(!output)return null // Capacity is a hard transfer limit; never truncate.
 const columns=[...new Set(sections.flatMap(s=>s.fields))]
 const data={version:1,type:'table',title:label,columns,rows:sections.flatMap(s=>s.rows.map(row=>columns.map(key=>text(row[key])))),note:notice}
 return {output,data,deliveryStatus:'partial',recoveryMode:'source-snapshot',unmetRequirements:['原定制呈现尚未完成']}
}
