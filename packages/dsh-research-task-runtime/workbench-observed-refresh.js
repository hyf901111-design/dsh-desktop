import {isDeepStrictEqual} from 'node:util'
import {compileObservedSourceView,observedWorkbenchSourceEntries} from './workbench-source-views.js'
import {compileDatasetChart,parseDatasetViewArtifact,validateWorkbenchDatasets} from './dataset-view-contract.js'
import {expandBusinessEvidence} from './component-source-projection.js'
import {requestedComponentRefreshInterval} from './component-refresh-policy.js'
import {includesRequestCredentials} from './component-request-credentials.js'
import {materializeEcbCrossRate,observedEcbCrossRate} from './observed-ecb-cross-rate.js'
import {matchObservedContent,materializeObservedContent} from './observed-content-refresh.js'

// Intervals represent a source check, never a promise about publication time.
const rollingPublicSources=new Map([
 ['ecb-fx',1440],['tencent-quotes',1],['tencent-history',60],['kraken-ticker',1],['kraken-candles',5],
 ['coinbase-ticker',1],['coinbase-candles',5],['met-weather',60],['usgs-earthquakes',15],
 ['github-repo',60],['npm-downloads',1440],['sina-news',15],['eastmoney-news',15],['gdelt-news',15],['eastmoney-announcements',60],
])
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const fixedPeriod=/(?:^|[^\d])(?:19|20)\d{2}(?:[-/.年]\d{1,2}|年|[Q季][1-4]|\d{4}(?!\d))|(?:固定|指定)(?:的)?(?:日期|区间|窗口|时点)|回测|复盘|历史快照|历史报告|(?:年报|季报|财务报告|研报|研究报告)(?!更新|监控)|\b(?:backtest|as of \d|historical snapshot|fixed (?:date|period))\b/iu
const staticOnly=/(?:只|仅)(?:要|用|需|使用|保留|显示|提供)?(?:一份|本次)?(?:静态|快照|已取得的资料|附件)|(?:禁止|不要|不许|不得|无需|不用)联网|(?:不|不要|无需|禁止|不用|不需要)(?:建立|启用)?(?:刷新绑定|刷新|更新)|\b(?:static only|snapshot only|offline only|do not refresh)\b/iu
const textOf=value=>typeof value==='string'?value.replace(/```[\s\S]*?```/gu,'').replace(/^\s*>.*$/gmu,''):''
const sourceDay=response=>[response?.dataTime,response?.asOf].find(value=>typeof value==='string'&&value.trim())??'来源未提供数据时点'

// A date-bound query stays date-bound even if its result happens to contain
// the last trading day. An open-ended provider query can acquire a new record.
function hasFixedArgs(value){
 if(!value||typeof value!=='object'){
  if(typeof value!=='string')return false
  const text=value.trim()
  if(text.startsWith('{')||text.startsWith('['))try{return hasFixedArgs(JSON.parse(text))}catch{return true}
  return fixedPeriod.test(text)
 }
 return Object.entries(value).some(([key,item])=>/^(?:start(?:date|_date|period)?|end(?:date|_date|period)?|since|until|as_?of|year|report_?period|fiscal_?year|trade_?date|date)$/iu.test(key)&&item!=null&&item!==''||hasFixedArgs(item))
}
function canReplay(entry,tools){
 if(entry.purpose||!tools.has(entry.tool)||includesRequestCredentials(entry.args)||hasFixedArgs(entry.args))return false
 if(entry.tool==='public_data_query')return entry.args.operation==='query'&&entry.args.source===entry.response.sourceId&&rollingPublicSources.has(entry.args.source)
 return /^ework__t_[a-f\d]+$/iu.test(entry.tool)
}
export function workbenchReplayTools(registeredTools=[],schemas=[]){
 const visible=new Set(schemas.map(schema=>schema.name))
 const tools=new Set(registeredTools.filter(tool=>tool.effect==='read'&&visible.has('ework__'+tool.id)).map(tool=>'ework__'+tool.id))
 if(visible.has('public_data_query'))tools.add('public_data_query')
 return tools
}
function sourceChoiceMatches(text,entry){
 const names=[entry.response.source,entry.response.sourceId,entry.response.api,
  ...(entry.args.source==='ecb-fx'?['欧洲央行','欧洲中央银行','ECB']:[]),
  ...(entry.tool==='public_data_query'?['public_data_query','内置免费源','免费数据源','公开数据源']:['插件','MCP'])]
  .filter(value=>typeof value==='string'&&value.trim()).map(name=>name.toLowerCase())
 const mentions=text=>names.some(name=>text.toLowerCase().includes(name))
 return text.split(/[，,。；;\n]/u).every(clause=>{
  const forbidden=clause.match(/(?:禁止|不要|不用|不得|排除)(?:再)?(?:使用|用|接入|调用|采用)?\s*(.+)/iu)
  if(forbidden&&mentions(forbidden[1]))return false
  const required=clause.match(/(?:只(?:能|允许)?(?:使用|用|接入|采用)|仅(?:允许|可)?(?:使用|用|接入|采用)|(?:数据)?来源(?:必须|限定|指定)(?:为|来自|使用)?|\bonly use\s+)(.+)/iu)
  return !required||mentions(required[1])
 })
}
export function replayableParentRecords(records,tools,original,panel){
 if(!original||[original,panel].some(text=>fixedPeriod.test(textOf(text))||staticOnly.test(textOf(text))))return []
 return observedWorkbenchSourceEntries(records).filter(entry=>canReplay(entry,tools)&&sourceChoiceMatches(original,entry))
  .map(({tool,args,response})=>({tool,args,response}))
}
function datasetFromSource(declaration,entry){
 const {id,label,identity='id',fields}=declaration
 if(!Array.isArray(fields)||!fields.length||!entry.fields.includes(identity)||
    fields.some(field=>!object(field)||field.key!=='id'&&!entry.fields.includes(field.key)))throw Error('共同来源字段或唯一编号未对应本轮完整响应')
 const keys=fields.map(field=>field.key)
 if(identity!=='id'&&entry.fields.includes('id'))throw Error('来源已有 id，请沿用原始业务编号')
 const records=entry.rows.map(row=>Object.fromEntries([['id',row[identity]],...keys.filter(key=>key!=='id').map(key=>[key,row[key]])]))
 return validateWorkbenchDatasets([{id,label,fields,records,asOf:sourceDay(entry.response),note:entry.label}])[0]
}
export function resolveObservedWorkbenchDatasets(plan,observed){
 const references=new Map()
 if(!plan.sharedDatasets?.some?.(dataset=>object(dataset)&&Object.hasOwn(dataset,'sourceRef')))return {plan,references}
 const entries=observedWorkbenchSourceEntries(observed)
 const sharedDatasets=plan.sharedDatasets.map(declaration=>{
  if(!object(declaration)||!Object.hasOwn(declaration,'sourceRef'))return declaration
  const entry=entries.find(item=>item.sourceRef===declaration.sourceRef)
  if(!entry||Object.keys(declaration).some(key=>!['id','label','sourceRef','identity','fields'].includes(key)))throw Error('共同数据 sourceRef 仅使用本轮来源目录、id、label、identity 和 fields，记录及时点由宿主读取')
  references.set(declaration.id,declaration)
  return datasetFromSource(declaration,entry)
 })
 return {plan:{...plan,sharedDatasets},references}
}

function exactSharedSource(dataset,entries){
 if(!dataset||dataset.groupBy!==undefined)return
 const keys=dataset.fields.map(field=>field.key).filter(key=>key!=='id')
 const matches=[]
 for(const entry of entries){
  const name=entry.response.source
  if(typeof name!=='string'||!name||!dataset.note.includes(name)||dataset.asOf!==sourceDay(entry.response)||
     dataset.records.length!==entry.rows.length||!keys.length||!keys.every(key=>entry.fields.includes(key)))continue
  // Certify the entire keyed projection, including every row and business
  // field. A coincidentally matching price, date or provider label cannot bind.
  const candidates=entry.fields.includes('id')?['id']:keys
  const identities=candidates.filter(key=>entry.rows.every((row,i)=>row[key]===dataset.records[i].id))
  if(identities.length!==1||!dataset.records.every((row,i)=>keys.every(key=>isDeepStrictEqual(row[key],entry.rows[i][key]))))continue
  matches.push({sourceRef:entry.sourceRef,id:dataset.id,label:dataset.label,identity:identities[0],fields:dataset.fields})
 }
 if(matches.length===1)return matches[0]
}

export function materializeObservedWorkbenchRefresh(mapping,responses){
 const projection=mapping.observedWorkbench
 if(projection.kind==='ecb-cross-rate')return materializeEcbCrossRate(mapping,responses)
 const response=expandBusinessEvidence(responses.q)
 const [entry]=observedWorkbenchSourceEntries([{tool:'replay',args:{},response}])
 if(!entry||entry.label!==projection.sourceLabel||!Array.isArray(projection.fields)||projection.fields.some(field=>!entry.fields.includes(field)))throw Error('来源记录不完整或字段已变化，原有数据已保留')
 if(projection.kind==='content')return materializeObservedContent(mapping,entry.rows,sourceDay(response))
 if(projection.kind==='source-view'){
  const view={sourceRef:entry.sourceRef,...(projection.chart?{chart_spec:projection.chart}:{})}
  const data=compileObservedSourceView(mapping.title,view,[entry])
  return {...data,asOf:sourceDay(response)}
 }
 if(projection.kind!=='shared-dataset')throw Error('未知来源视图')
 const dataset=datasetFromSource(projection.dataset,entry)
 if(mapping.type==='view')return parseDatasetViewArtifact({version:1,type:'view',title:mapping.title,dataset,view:projection.view,...(projection.context?{context:projection.context}:{})})
 if(mapping.type==='chart')return compileDatasetChart(projection.view,[dataset],mapping.title,mapping.variant,projection.chartIntent??'')
 throw Error('来源记录无法用于此组件类型')
}

// Only the workbench host supplies references and the currently authorized
// read tools. No URL, reconstructed numeric sample, or model-written recipe
// can grant an unattended query.
export function prepareObservedWorkbenchRefresh(panel,{observed,sourceView,datasetReference,datasets,tools,originalRequest,authoredContent}){
 const artifact=panel.artifact
 if(!artifact||!observed?.length||!originalRequest||!['table','chart','view'].includes(artifact.type))return
 const original=textOf(originalRequest),local=textOf(panel.title+'\n'+panel.prompt)
 if(fixedPeriod.test(original)||fixedPeriod.test(local)||staticOnly.test(original)||staticOnly.test(local))return
 const tracking=/(?:实时|监[控测]|跟踪|追踪|滚动|最新|当前|刷新|更新|行情|净值走势|趋势|\b(?:live|monitor|tracking|current|latest|refresh)\b)/iu.test(original+'\n'+local)
 const entries=observedWorkbenchSourceEntries(observed).filter(entry=>canReplay(entry,tools)&&(entry.tool==='public_data_query'||tracking))
 if(!entries.length)return
 datasetReference??=exactSharedSource(datasets?.find(dataset=>dataset.id===panel.view?.dataset),entries)
 let projection,selected,mapping
 if(sourceView||datasetReference){
  const entry=entries.find(item=>item.sourceRef===(sourceView?.sourceRef??datasetReference.sourceRef))
  if(!entry)return
  selected={q:entry}
  if(sourceView){
   if(!['table','chart'].includes(artifact.type))return
   projection={kind:'source-view',sourceLabel:entry.label,fields:entry.fields,...(sourceView.chart_spec?{chart:sourceView.chart_spec}:{})}
  }else{
   if(!['chart','view'].includes(artifact.type))return
   const {sourceRef,...dataset}=datasetReference
   projection={kind:'shared-dataset',sourceLabel:entry.label,fields:[...new Set([dataset.identity??'id',...dataset.fields.map(f=>f.key).filter(key=>key!=='id')])],
    dataset,view:artifact.type==='view'?artifact.view:panel.view,...(artifact.context?{context:artifact.context}:{}),...(artifact.type==='chart'?{chartIntent:panel.title+'\n'+panel.prompt}:{})}
  }
  mapping={version:1,type:artifact.type,title:artifact.title,...(artifact.variant?{variant:artifact.variant}:{}),observedWorkbench:projection}
 }else{
  const content=matchObservedContent(authoredContent,artifact,entries)
  if(content){
   selected={q:content.entry}
   mapping={version:1,type:artifact.type,title:artifact.title,...(artifact.variant?{variant:artifact.variant}:{}),observedWorkbench:content.projection}
  }else{
   const fx=observedEcbCrossRate(artifact,entries)
   if(!fx)return
   mapping=fx.mapping
   selected=fx.selected
  }
 }
 const sources=Object.entries(selected)
 if(sources.some(([,entry])=>!sourceChoiceMatches(original,entry)))return
 const data=materializeObservedWorkbenchRefresh(mapping,Object.fromEntries(sources.map(([key,entry])=>[key,entry.response])))
 // Source views may have combined more than one observed fund or changed
 // renderer under a size limit. Never bind only a subset of the first card.
 if(sourceView||mapping.observedWorkbench.kind==='content'){
  const {asOf:deliveredDate,...delivered}=artifact,{asOf:sourceDate,...projected}=data
  if(!isDeepStrictEqual(delivered,projected)||deliveredDate&&deliveredDate!==sourceDate)return
 }
 const intervalMinutes=requestedComponentRefreshInterval(local)??requestedComponentRefreshInterval(original)??Math.max(...sources.map(([,entry])=>rollingPublicSources.get(entry.args.source)??15))
 const requests=sources.map(([key,entry])=>({key,toolId:entry.tool==='public_data_query'?entry.tool:entry.tool.slice('ework__'.length),args:entry.args}))
 return {data,recipe:{requests,mapping,intervalMinutes}}
}
