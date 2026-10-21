import {calendarDate,calendarToday} from './calendar-template-contract.js'
import {applicableExplicitScope,evidenceWindows} from './workbench-explicit-scope.js'
import {readTemplateModel} from './component-template-registry.js'

const text=value=>typeof value==='string'?value:''
const itemText=item=>[item?.title,item?.summary,item?.category,item?.object].map(text).join(' ')
const categories=[['定期报告',/定期报告|季报|半年报|年报|财报|披露/u],['解禁',/解禁/u],['股东大会',/股东大会/u],['行业会议',/行业会议|会议|博览会|展会/u]]
const gap=/未取得|未核验|未确认|尚未|缺失|缺口|待核验|待确认/u
const pending=value=>/^(?:日期)?待定$|^日期待确认$/u.test(text(value))
const normalize=value=>text(value).normalize('NFKC').replace(/\s/gu,'')
const codes=value=>[...new Set(text(value).match(/(?<!\d)\d{6}(?!\d)/gu)??[])]
const mentions=(value,entity)=>entity.aliases.some(alias=>text(value).includes(alias))
const business=records=>records.filter(r=>r&&r.purpose!=='discovery'&&r.response&&(!Object.hasOwn(r.response,'retCode')||r.response.retCode===1))
const rows=record=>Array.isArray(record.response?.data)?record.response.data:[]
const disclosureRows=records=>business(records).filter(r=>r.tool?.startsWith('ework__')&&r.args?.nameEn==='getEquReportPredisclo').flatMap(r=>rows(r)).filter(r=>r&&/^\d{6}$/u.test(text(r.ticker))&&text(r.secShortName))
const entityFor=row=>({label:row.secShortName+'（'+row.ticker+'）',aliases:[row.ticker,row.secShortName]})
const within=(day,context)=>Boolean(day&&(!context.future||day>=context.today)&&context.windows.every(w=>day>=w.start&&day<=w.end))
function contextFor(request,now){
 const human=request?.workbenchRequest
 if(human?.dataMode!=='source'||typeof human.originalRequest!=='string')return
 const original=human.originalRequest
 if(/(?:只|仅)?(?:用|使用|依据|根据)\s*(?:我|用户)(?:已)?(?:提供|上传)的?(?:日历|日程|事件)?(?:原文|资料|内容)/u.test(original))return
 const scope=applicableExplicitScope({...request,panelType:'calendar'}),windows=scope.windows,future=scope.future,today=calendarToday(undefined,now)
 // Historical and ordinary calendars retain their existing permissive contract.
 if(!future&&!windows.length)return
 if(!future&&windows.every(w=>calendarDate(w.start)&&calendarDate(w.end)&&w.start<=w.end&&w.end<today))return
 return {original,future,today,windows:evidenceWindows({...request,panelType:'calendar'})}
}
function eventsFrom(records){
 const disclosures=disclosureRows(records).map(row=>({kind:'定期报告',day:row.preDate,row,entity:entityFor(row)}))
 // Only explicit event fields establish generic event dates. A publication,
 // report-period, update date or arbitrary row.date is not an event date.
 const other=business(records).filter(r=>r.args?.nameEn!=='getEquReportPredisclo').flatMap(r=>rows(r)).filter(r=>r&&typeof r.title==='string'&&typeof r.eventDate==='string').map(row=>({kind:categories.find(([,re])=>re.test(row.title+' '+text(row.category)))?.[0],day:row.eventDate,title:row.title}))
 return [...disclosures,...other]
}
// endDate remains the report's identity, never its disclosure/event day.
// Check only explicit year/quarter/half-year/annual wording; generic reports
// carry no invented period and ordinary date strings are not report labels.
function reportPeriodMatches(item,row){
 const description=itemText(item),endDate=calendarDate(row.endDate)
 const years=[...description.matchAll(/(?<!\d)(20\d{2})\s*(?:年\s*)?(?=Q[1-4]|第?[一二三四1234]季(?:度)?(?:报告|报|披露)|半年报|半年度报告|中报|年报|年度报告|财报|定期报告)/giu)].map(m=>m[1])
 const periods=[...description.matchAll(/(?:Q([1-4])\s*(?:财报|财务报告|定期报告|业绩报告|披露|发布|公布)|第?([一二三四1234])季(?:度)?(?:报告|报|披露|发布|公布))/giu)].map(m=>Number(m[1]??({'一':1,'二':2,'三':3,'四':4}[m[2]]??m[2]))*3)
 if(/半年报|半年度报告|中报/u.test(description))periods.push(6)
 if(/(?<!半)年报|(?<!半)年度报告/u.test(description))periods.push(12)
 const explicitDates=[...description.matchAll(/(?:报告期|endDate)\s*[:：=]?\s*(\d{4}-\d{2}-\d{2})/gu)].map(m=>m[1])
 if(!years.length&&!periods.length&&!explicitDates.length)return true
 return Boolean(endDate&&years.every(year=>year===endDate.slice(0,4))&&periods.every(month=>month===Number(endDate.slice(5,7)))&&explicitDates.every(date=>date===endDate))
}
function matchingEvent(item,event){
 if(event.row)return reportPeriodMatches(item,event.row)&&mentions([item?.title,item?.object].map(text).join(' '),event.entity)&&/披露|发布|公布/u.test(text(item?.title))&&/定期报告|季报|半年报|年报|财报/u.test(text(item?.title)+' '+text(item?.category))
 return normalize(item?.title)===normalize(event.title)
}
function scopeEntities(original,disclosures,previous){
 const entities=disclosures.filter(row=>mentions(original,entityFor(row))).map(entityFor)
 for(const code of codes(original))if(!entities.some(e=>e.aliases.includes(code)))entities.push({label:code,aliases:[code]})
 // A draft can point to a literal human object, never grant it factual status.
 for(const item of previous?.items??[])for(const value of [item?.object,item?.actor])if(typeof value==='string'&&value.length>=2&&value.length<=80&&original.includes(value)&&!entities.some(e=>e.aliases.includes(value)))entities.push({label:value,aliases:[value]})
 return entities.filter((e,i)=>entities.findIndex(other=>other.label===e.label)===i)
}
const clauses=value=>text(value).split(/[。；;\n]/u).filter(Boolean)
const unsupportedHistory=value=>clauses(value).some(clause=>/曾预报|此前预披露|原(?:计划|预报|披露日期)|改期|提前至|延后至/u.test(clause)&&!/(?:不能|无法|未能|不足以|不代表|没有|未取得).{0,20}(?:证明|推断|确认|改期|历史)/u.test(clause))

const noUnlock=clause=>/(?:无|没有|不存在).{0,8}解禁|解禁.{0,8}(?:为零|为0|无事件)/u.test(clause)&&!/(?:不能|无法|不代表|不等于).{0,12}(?:证明|推断|无|没有)/u.test(clause)
function emptyUnlockCoverage(records,entity,context){
 const day=value=>calendarDate(text(value).replace(/^(\d{4})(\d{2})(\d{2})$/u,'$1-$2-$3'))
 return context.windows.length>0&&business(records).some(record=>{
  const args=record.args?.url_params,start=day(args?.beginFloatDate),end=day(args?.endFloatDate)
  return record.tool?.startsWith('ework__')&&record.args?.http_method==='GET'&&record.args.nameEn==='getEquSharesFloat'&&record.response.retCode===1&&Array.isArray(record.response.data)&&record.response.data.length===0&&entity.aliases.includes(args?.ticker)&&start&&end&&start<=end&&context.windows.every(w=>start<=w.start&&end>=w.end)
 })
}
function eventCount(value){
 if(/^\d+$/u.test(value))return Number(value)
 const digits={零:0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}
 if(Object.hasOwn(digits,value))return digits[value]
 const parts=value.split('十')
 return parts.length===2?(parts[0]?digits[parts[0]]:1)*10+(parts[1]?digits[parts[1]]:0):NaN
}

// requiredData is an internal first-draft snapshot used only to preserve
// source-proven background fields and literal human object names. It grants no
// fact, mode or scope authority.
// Undefined means this narrow evidence guard found no issue, not that arbitrary
// event APIs or prose have been exhaustively verified.
export function calendarEventEvidenceIssue(spec,request={},records=[],{now=new Date(),requiredData}={}){
 let context
 try{context=contextFor(request,now)}catch(error){return error.message}
 if(!context)return
 const data=readTemplateModel(spec)?.data??spec,previous=readTemplateModel(requiredData)?.data??requiredData
 if(data?.type==='error')return
 if(data?.type!=='calendar')return previous?.type==='calendar'?'日历事件核验未通过：不得以无可核验日历模型的 HTML 或文字替换日历；保留已核验事件及完整背景/缺口 note。':undefined
 if(!Array.isArray(data.items))return '日历事件核验未通过：items 必须为完整事件列表。'
 if(context.windows.some(w=>!calendarDate(w.start)||!calendarDate(w.end)||w.start>w.end))return '日历事件核验未通过：明确日期窗口无效，不得扩大或修改人类原始窗口。'
 const issues=[],add=message=>issues.push(message),events=eventsFrom(records),disclosures=disclosureRows(records),entities=scopeEntities(context.original,disclosures,previous)
 const note=text(data.note),metadata=[data.title,data.asOf,data.note].map(text).join('\n'),allText=[metadata,...data.items.map(itemText)].join('\n')
 const requiredCategories=categories.filter(([,re])=>re.test(context.original)).map(([label])=>label)
 const proven=[]
 for(const item of data.items){
  const label=text(item?.title)||'未命名事件'
  if(/报告期|核查结果|未取得|无数据返回|缺口|未核验/u.test(text(item?.title)+' '+text(item?.category))){add(`${label}：报告期背景、缺源说明和未核验线索应完整移入 note，不计事件`);continue}
  const matches=events.filter(event=>matchingEvent(item,event)),day=calendarDate(item?.date)
  if(!day&&!(pending(item?.date)&&matches.some(event=>event.day===item.date))){add(`${label}：日期非法、约日期或日期待定但未取得事件存在的来源；未核验线索写入 note，不虚构日期`);continue}
  if(day&&!within(day,context)){add(`${label} ${day}：超出明确窗口或宿主本地今日 ${context.today}，仅能作为背景`);continue}
  if(new Set(matches.filter(event=>event.row).map(event=>event.row.ticker)).size>1){add(`${label}：事件对应多个公司身份，请逐公司保留来源事件`);continue}
  const match=matches.find(event=>event.day===item.date)
  if(!match){add(`${label}：没有同条事件来源对应；披露仅使用 preDate${matches.some(e=>e.row)?'='+matches.filter(e=>e.row).map(e=>e.day).join('/') : ''}；声明的报告年度/季度必须对应同条报告期 endDate，endDate/updateDate1/latestPreDiscDate 不能替代事件日`);continue}
  if(proven.some(p=>p.item.date===item.date&&matchingEvent(p.item,match))){add(`${label}：同条来源事件重复，不能重复计数`);continue}
  proven.push({item,event:match})
 }
 // Preserve only actual source events in the human scope. An unrelated model
 // candidate or extra query never becomes a mandatory company or event.
 for(const event of events){
  const selected=previous?.items?.some(item=>matchingEvent(item,event)&&item.date===event.day)
  const requested=event.entity?mentions(context.original,event.entity):context.original.includes(event.title)||selected&&requiredCategories.includes(event.kind)
  if(requested&&within(calendarDate(event.day),context)&&!proven.some(p=>p.event===event||matchingEvent(p.item,event)&&p.item.date===event.day))add(`${event.entity?.label??event.title}：已取得${event.kind??'事件'} ${event.day}${event.row?' (preDate)':''}，修复不得省略已核验的窗口内事件`)
 }
 for(const entity of entities){
  if(!mentions(allText,entity))add(`${entity.label}：不得静默删除人类研究公司；无记录仍需在 note 保留缺口`)
  for(const category of requiredCategories.filter(c=>c!=='行业会议')){
   if(proven.some(p=>mentions(itemText(p.item),entity)&&p.event.kind===category))continue
   if(category==='解禁'&&emptyUnlockCoverage(records,entity,context)&&clauses(note).some(clause=>mentions(clause,entity)&&noUnlock(clause)))continue
   if(!clauses(note).some(clause=>mentions(clause,entity)&&categories.find(([label])=>label===category)[1].test(clause)&&gap.test(clause)))add(`${entity.label} ${category}：未取得安排须在完整 note 中逐对象保留缺口，不把缺源写成无事件`)
  }
 }
 for(const category of requiredCategories){
  if(proven.some(p=>p.event.kind===category))continue
  if(category==='解禁'&&entities.length&&entities.every(entity=>emptyUnlockCoverage(records,entity,context)&&clauses(note).some(clause=>mentions(clause,entity)&&noUnlock(clause))))continue
  if(!clauses(note).some(clause=>categories.find(([label])=>label===category)[1].test(clause)&&gap.test(clause)))add(`${category}：研究维度未取得可核验记录，应在 note 保留未核验/缺失说明${category==='行业会议'?'及日期待定':''}`)
  if(category==='行业会议'&&!/日期待定|日期待确认/u.test(note))add('行业会议：未核验线索日期待定，不能作为已确认安排')
 }
 if(disclosures.length&&unsupportedHistory(allText))add('getEquReportPredisclo 的 updateDate1/latestPreDiscDate 不是先前预披露日期或改期历史；无明确变更记录不能声称“曾预报/改期”')
 // A successful empty, fully covering business response is different from a
 // failed call or an omitted response. Never promote failed unlock calls to zero.
 for(const clause of clauses(metadata).filter(noUnlock)){
  const named=entities.filter(entity=>mentions(clause,entity))
  const collective=/(?:所有|全部|各|[一二三四五六七八九十\d]+家)公司/u.test(clause)
  const scope=named.length&&!collective?named:entities
  if(!scope.length||!scope.every(entity=>emptyUnlockCoverage(records,entity,context)))add('解禁记录未取得不等于窗口内无解禁；失败响应不能证明零事件：'+clause)
 }
 if(previous?.type==='calendar'&&Array.isArray(previous.items))for(const row of disclosures){
  if(!mentions(context.original,entityFor(row)))continue
  if(previous.items.some(item=>mentions(itemText(item),entityFor(row))&&/报告期/u.test(itemText(item))&&item.date===row.endDate)&&!clauses(note).some(clause=>mentions(clause,entityFor(row))&&/报告期|endDate/u.test(clause)&&clause.includes(row.endDate)))add(`${row.secShortName}：已取得报告期 ${row.endDate} (endDate) 背景必须完整保留到 note，不计事件`)
 }
 const counts=[...metadata.matchAll(/(?<!\d)(\d+|[零一二两三四五六七八九十]+)\s*[条项个](?:已核验|已确认|来源)?(?:事件|日程|安排)/gu)]
 if(counts.some(count=>eventCount(count[1])!==data.items.length))add('标题/说明保留了错误事件计数，需与实际有效日程同步')
 if(gap.test(note)&&clauses(metadata).some(clause=>/全部(?:事件|类别)?(?:已核验|已确认|覆盖|取得)|所有类别.{0,5}完整覆盖|无缺失|完整覆盖/u.test(clause)&&!/(?:不能|无法|不代表|尚未|未能).{0,12}(?:全部|完整|所有)/u.test(clause)))add('标题/asOf/note 的完整覆盖声明与实际缺口矛盾，请同步修正')
 if(issues.length)return '日历事件核验未通过：'+[...new Set(issues)].join('；')+'。复用已取得业务证据，保留人类公司和事件类别；背景/未核验线索/缺源移入完整 note，不计事件，不伪造日期或以删除已核验事件绕过。'
}

export function calendarEventRepairEvidence(records=[]){
 const fields=['ticker','secShortName','preDate','endDate','updateDate1','latestPreDiscDate','title','eventDate','category']
 const evidence=JSON.stringify(business(records).map(record=>({tool:record.tool,api:record.args?.nameEn,receivedRows:rows(record).length,data:rows(record).filter(row=>row&&typeof row==='object').map(row=>Object.fromEntries(fields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]])))})))
 return Buffer.byteLength(evidence)<=48000?evidence:JSON.stringify({omitted:true,reason:'完整业务证据超出修复预算；省略不等于来源缺失，不能据此删除事件或声称完整。'})
}
