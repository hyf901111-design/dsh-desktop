import {componentDiscoveryToolNames,componentSourceCollector} from './component-source-binding.js'
import {decodeDataResponse} from './component-data-refresh.js'
import {expandBusinessEvidence} from './component-source-projection.js'
import {workbenchPlanningSession} from './workbench-prototype-evidence.js'
import {isDeepStrictEqual} from 'node:util'

export const WORKBENCH_OBSERVED_SOURCE_LIMITS=Object.freeze({records:128,bytes:8_000_000,depth:32})
const sourceTool=name=>typeof name==='string'&&/^(?:ework__[\w.-]{1,160}|public_data_query|web_fetch|financial_query)$/u.test(name)
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const bytes=value=>Buffer.byteLength(JSON.stringify(value))
const invalid=()=>{throw Error('工作台已取得来源记录无效；不能把未观察到的内容当作共享证据。')}
const quota=()=>{throw Error('工作台已取得来源超过宿主保留配额；原始记录未被截取，不能声称已完整交接。')}
const rejectionWarnings=Object.freeze({
 quota:'部分已取得来源超过宿主保留容量，未交接；子卡仅使用可核验资料，并按原授权补齐缺口。',
 invalid:'部分已取得来源无法完整校验，未交接；子卡仅使用可核验资料，并按原授权补齐缺口。'
})
const decoderQuotaErrors=new Set(['数据超过组件容量','接口返回的数据过大','还原后的业务响应超出组件容量'])
function authoredMessages(event){
 const messages=event.type==='user/message'?[event.data]:event.type==='agent/inbox/spliced'?event.data?.inserted??[]:[]
 return messages.filter(message=>message?.source?.kind==='user')
}

function copyJson(value,depth=0){
 if(depth>WORKBENCH_OBSERVED_SOURCE_LIMITS.depth)invalid()
 if(value===null||typeof value==='string'||typeof value==='boolean')return value
 if(typeof value==='number'){if(!Number.isFinite(value))invalid();return value}
 if(Array.isArray(value))return Object.freeze(value.map(child=>copyJson(child,depth+1)))
 if(!object(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))invalid()
 const copy={}
 for(const [key,child] of Object.entries(value)){
  if(['__proto__','prototype','constructor'].includes(key))invalid()
  Object.defineProperty(copy,key,{value:copyJson(child,depth+1),enumerable:true})
 }
 return Object.freeze(copy)
}

function restoreObservedRecord(record){
 if(!object(record)||Object.keys(record).some(key=>!['tool','args','response','purpose','snapshotRows'].includes(key))||
  !sourceTool(record.tool)||!object(record.args)||!Object.hasOwn(record,'response')||
  record.purpose!==undefined&&record.purpose!=='snapshot'||
  record.snapshotRows!==undefined&&(!Array.isArray(record.snapshotRows)||!record.snapshotRows.length)||
  !(object(record.response)||Array.isArray(record.response)||record.response===null&&record.snapshotRows?.length))invalid()
 return copyJson(record)
}

// Host/storage only. Preserve complete responses, including their original
// pagination and uncertainty; a saved page is never promoted to a full source.
export function restoreWorkbenchObservedSources(value){
 if(value===undefined)return undefined
 if(!Array.isArray(value)||!value.length)invalid()
 if(value.length>WORKBENCH_OBSERVED_SOURCE_LIMITS.records||bytes(value)>WORKBENCH_OBSERVED_SOURCE_LIMITS.bytes)quota()
 return Object.freeze(value.map(restoreObservedRecord))
}

// Replay only paired, successful tool observations belonging to this authored
// request. Assistant prose, injected user messages and unrelated history never
// supply records. Capture synchronously before queueing the workbench.
export function captureWorkbenchObservedSources({session,messageId,schemas=[],onRejected}={}){
 if(typeof messageId!=='string'||!messageId)return undefined
 const events=workbenchPlanningSession(session)?.events??[]
 const start=events.findLastIndex(event=>authoredMessages(event).at(-1)?.id===messageId)
 if(start<0)return undefined
 const allowed=(Array.isArray(schemas)?schemas:[]).map(schema=>schema.name).filter(sourceTool)
 if(!allowed.length)return undefined
 const discovery=componentDiscoveryToolNames(schemas),calls=new Map(),records=[]
 const reject=reason=>{
  if(typeof onRejected==='function')return onRejected(rejectionWarnings[reason])
  if(reason==='quota')quota()
  invalid()
 }
 let retainedBytes=2
 for(const event of events.slice(start+1)){
  if(authoredMessages(event).length)break
  if(event.type==='tool/call'&&allowed.includes(event.data?.name)&&typeof event.data.callId==='string'&&event.data.callId){
   calls.set(event.data.callId,event)
   continue
  }
  if(event.type!=='tool/result')continue
  const message=event.data?.message
  if(message?.source?.kind!=='tool')continue
  const id=message.source.callId,call=calls.get(id)
  if(!call)continue
  calls.delete(id)
  const result=message.content?.find(block=>block.type==='tool-result'&&block.toolCallId===id)
  const {name:tool,arguments:rawArgs}=call.data
  if(!result||result.isError||result.error||discovery.has(tool))continue
  let args
  try{args=typeof rawArgs==='string'?JSON.parse(rawArgs):rawArgs}catch{continue}
  if(!object(args)||tool==='public_data_query'&&args.operation!=='query'||tool==='financial_query'&&['resolve','search','catalog'].includes(args.intent))continue
  let resultBytes
  try{resultBytes=bytes(result)}catch{reject('invalid');continue}
  if(resultBytes>WORKBENCH_OBSERVED_SOURCE_LIMITS.bytes){reject('quota');continue}
  let record
  if(tool==='web_fetch'){
   // Reuse the existing exact-URL and fingerprint checks for rendered pages.
   const collector=componentSourceCollector([tool],schemas)
   collector.accept(call);collector.accept(event)
   record=collector.records[0]
  }else{
   try{
    const response=expandBusinessEvidence(decodeDataResponse(result))
    record={tool,args,response,...(tool==='financial_query'?{purpose:'snapshot'}:{})}
   }catch(error){
    if(decoderQuotaErrors.has(error?.message))reject('quota')
    else if(typeof onRejected==='function'&&error?.message!=='数据接口业务请求失败')reject('invalid')
    continue
   }
  }
  if(!record||record.response?.kind==='catalog'||!object(record.response)&&!Array.isArray(record.response)&&!record.snapshotRows?.length)continue
  try{record=restoreObservedRecord(record)}catch{reject('invalid');continue}
  const previous=records.findIndex(prior=>prior.tool===tool&&isDeepStrictEqual(prior.args,args))
  if(previous>=0&&tool==='web_fetch'&&!record.response&&records[previous].response)continue
  const nextCount=records.length+(previous<0?1:0)
  const nextBytes=retainedBytes+bytes(record)+(previous>=0?-bytes(records[previous]):records.length?1:0)
  if(nextCount>WORKBENCH_OBSERVED_SOURCE_LIMITS.records||nextBytes>WORKBENCH_OBSERVED_SOURCE_LIMITS.bytes){
   reject('quota');continue
  }
  if(previous>=0)records.splice(previous,1)
  retainedBytes=nextBytes
  records.push(record)
 }
 return records.length?Object.freeze(records):undefined
}
