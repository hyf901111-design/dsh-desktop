import {createHash} from 'node:crypto'
import {defineTool} from '@deepseek-ai/dsh-tools'
import {validateWorkbenchDatasets} from './dataset-view-contract.js'
import {restoreWorkbenchObservedSources} from './workbench-observed-sources.js'

export const WORKBENCH_SOURCE_TOOL='workbench_source_read'
export const WORKBENCH_SOURCE_PAGE_LIMITS=Object.freeze({default:50,max:200})
const sourceRef=record=>createHash('sha256').update(JSON.stringify([record.tool,record.args])).digest('hex').slice(0,24)
const freeze=value=>{if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)
const pathKey=key=>/^[A-Za-z_$][\w$]*$/u.test(key)?'.'+key:'['+JSON.stringify(key)+']'
function observedCollections(response,snapshotRows){
 const collections=[]
 const walk=(value,path)=>{
  if(Array.isArray(value)){
   collections.push({path,records:value,fields:[...new Set(value.flatMap(row=>object(row)?Object.keys(row):[]))]})
  }else if(object(value))for(const [key,child] of Object.entries(value))walk(child,path+pathKey(key))
 }
 walk(response,'data')
 if(snapshotRows)walk(snapshotRows,'snapshotRows')
 return collections
}

// Only host-owned, already validated workbench records enter this reader.
// It has no provider, path, URL or refresh operation and grants no network use.
export function createWorkbenchSourceSnapshot({hostContext,signal}={}){
 if(hostContext?.sharedDatasets===undefined&&hostContext?.sharedObservedRecords===undefined)return undefined
 const dataMode=hostContext.workbenchRequest?.dataMode??'source'
 if(!['source','simulated'].includes(dataMode))throw Error('共同来源快照的数据模式无效。')
 const datasets=hostContext.sharedDatasets===undefined?[]:validateWorkbenchDatasets(hostContext.sharedDatasets)
 const observed=restoreWorkbenchObservedSources(hostContext.sharedObservedRecords)??[]
 if(observed.length&&dataMode!=='source')throw Error('已取得的真实来源不能改称模拟数据。')
 const response=(dataset,offset,limit)=>{
  const records=dataset.records.slice(offset,offset+limit),nextOffset=offset+records.length
  return {source:dataMode==='simulated'?'用户授权的模拟数据':'工作台已取得的来源快照',dataMode,snapshotOnly:true,
   datasetId:dataset.id,label:dataset.label,asOf:dataset.asOf,note:dataset.note,
   fields:dataset.fields,records,
   pagination:{offset,limit,returned:records.length,total:dataset.records.length,possiblyMore:nextOffset<dataset.records.length,...(nextOffset<dataset.records.length?{nextOffset}:{})}}
 }
 // These complete snapshots are retained by the host, not inserted into the
 // model prompt. Every observation page points to its unchanged full source.
 // These host snapshot descriptors are not executable observation-page calls:
 // their limit describes the entire retained collection, even above page max.
 const datasetRecords=datasets.map(dataset=>({tool:WORKBENCH_SOURCE_TOOL,
  args:{dataset:dataset.id,offset:0,limit:dataset.records.length},purpose:'snapshot',
  response:response(dataset,0,dataset.records.length)}))
 const ids=new Set(datasets.map(dataset=>dataset.id))
 const observedEntries=observed.map((record,index)=>{
  let id='observed-'+(index+1);while(ids.has(id))id='_'+id;ids.add(id)
  const raw=record.response,metadata=object(raw)?Object.fromEntries(['source','sourceId','sourceUrl','asOf','note','unit','currency','fieldInfo','missingFields','limitations','pagination','status','kind','error','success'].filter(key=>Object.hasOwn(raw,key)).map(key=>[key,raw[key]])):{}
  const origin={tool:record.tool,args:record.args,sourceRef:sourceRef(record),...(record.purpose?{purpose:record.purpose}:{})}
  // A non-callable host descriptor cannot be overwritten by a read of the
  // first page with the same dataset argument. Its sourceRef owns full JSON.
  const retained={tool:WORKBENCH_SOURCE_TOOL,args:{dataset:id,snapshot:true},purpose:'snapshot',response:{...metadata,snapshotKind:'workbench-observed-source',snapshotOnly:true,dataMode:'source',origin,data:raw,...(record.snapshotRows?{snapshotRows:record.snapshotRows}:{})}}
  return {id,retained,collections:observedCollections(raw,record.snapshotRows),label:typeof raw?.source==='string'?raw.source:'已取得来源 '+(index+1)}
 })
 // Original records stay frozen in hostContext.sharedObservedRecords. Seed
 // their complete local aliases once so offline readers keep access without
 // doubling the collector's byte budget or granting the original tools.
 const sourceRecords=freeze([...datasetRecords,...observedEntries.map(entry=>entry.retained)])
 const catalog=freeze([
  ...datasets.map((dataset,index)=>({id:dataset.id,label:dataset.label,recordCount:dataset.records.length,dataMode,sourceRef:sourceRef(datasetRecords[index])})),
  ...observedEntries.map(entry=>({id:entry.id,label:entry.label,dataMode,sourceRef:sourceRef(entry.retained),originSourceRef:entry.retained.response.origin.sourceRef,tool:entry.retained.response.origin.tool,fields:object(entry.retained.response.data)?Object.keys(entry.retained.response.data):[],collections:entry.collections.map(({path,records,fields})=>({path,recordCount:records.length,fields})),...(entry.retained.response.pagination!==undefined?{sourcePagination:entry.retained.response.pagination}:{}),...(entry.retained.response.status!==undefined?{sourceStatus:entry.retained.response.status}:{})}))
 ])
 let child,disposed=false
 const releases=[]
 const check=exec=>{
  signal?.throwIfAborted();exec.signal?.throwIfAborted()
  if(disposed||exec.agent!==child)throw Error('本地来源快照只属于当前组件子会话。')
 }
 const tool=defineTool({
  name:WORKBENCH_SOURCE_TOOL,
  description:'Read this component’s already acquired workbench data locally. Empty arguments list datasets; dataset reads a complete-field page. Returned sourceRef always references the full host snapshot, not only this page. No network, file access or refresh.',
  parameters:{dataset:{type:'string',enum:catalog.map(dataset=>dataset.id)},collection:{type:'string',description:'Exact collection path returned in this dataset catalog; required when a raw response has multiple arrays. No inferred paths.'},offset:{type:'integer',description:'Zero-based row offset, default 0.'},limit:{type:'integer',description:'Rows per page, default 50; 1–200. Fields and cell contents are never truncated.'}},
  output:{schema:{type:'object',additionalProperties:true},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},isConcurrencySafe:()=>true,
  execute(args,exec){
   check(exec)
   if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(key=>!['dataset','collection','offset','limit'].includes(key)))throw Error('本地来源读取只接受 dataset、collection、offset、limit，不接受文件路径、网址或其他操作。')
   if(args.dataset===undefined){
    if(args.collection!==undefined||args.offset!==undefined||args.limit!==undefined)throw Error('分页读取需要明确选择目录中的 dataset。')
    return {dataMode,snapshotOnly:true,datasets:structuredClone(catalog)}
   }
   const entry=observedEntries.find(entry=>entry.id===args.dataset)
   if(entry){
    const retained=entry.retained.response,reference=sourceRef(entry.retained)
    if(!entry.collections.length){
     if(args.collection!==undefined||args.offset!==undefined||args.limit!==undefined)throw Error('该原始响应没有数组集合；保留完整对象读取，不猜测分页路径。')
     return structuredClone({...retained,sourceRef:reference})
    }
    const collection=args.collection===undefined&&entry.collections.length===1?entry.collections[0]:entry.collections.find(collection=>collection.path===args.collection)
    if(!collection)throw Error('请选择本来源目录中实际存在的 collection，不能猜测路径。')
    const offset=args.offset??0,limit=args.limit??WORKBENCH_SOURCE_PAGE_LIMITS.default
    if(!Number.isSafeInteger(offset)||offset<0||offset>collection.records.length||!Number.isSafeInteger(limit)||limit<1||limit>WORKBENCH_SOURCE_PAGE_LIMITS.max)throw Error('分页范围无效：offset 必须在实际记录范围内，limit 为 1–200。')
    const records=collection.records.slice(offset,offset+limit),next=offset+records.length
    const {data,snapshotRows,snapshotKind,...metadata}=retained
    return structuredClone({...metadata,sourceRef:reference,collection:collection.path,fields:collection.fields,records,pagePagination:{offset,limit,returned:records.length,total:collection.records.length,possiblyMore:next<collection.records.length,...(next<collection.records.length?{nextOffset:next}:{})},observedRecordsOnly:true})
   }
   const index=datasets.findIndex(dataset=>dataset.id===args.dataset)
   if(index<0)throw Error('该数据集不属于本组件的共同来源快照。')
   if(args.collection!==undefined)throw Error('共同记录集直接分页读取，不接受原始响应 collection。')
   const dataset=datasets[index],offset=args.offset??0,limit=args.limit??WORKBENCH_SOURCE_PAGE_LIMITS.default
   if(!Number.isSafeInteger(offset)||offset<0||offset>dataset.records.length||!Number.isSafeInteger(limit)||limit<1||limit>WORKBENCH_SOURCE_PAGE_LIMITS.max)throw Error('分页范围无效：offset 必须在实际记录范围内，limit 为 1–200。')
   return structuredClone({...response(dataset,offset,limit),sourceRef:catalog[index].sourceRef})
  }
 })
 const dispose=()=>{if(disposed)return;disposed=true;for(const release of releases.splice(0).reverse())release();signal?.removeEventListener('abort',dispose)}
 signal?.addEventListener('abort',dispose,{once:true})
 return {toolName:WORKBENCH_SOURCE_TOOL,catalog,sourceRecords,
  instruction:'共同记录和已取得的原始响应保留在宿主本地快照。先用 workbench_source_read({}) 查看目录，再按实际 dataset/collection 和 offset/limit 阅读完整字段；返回 sourceRef 引用该来源的全部已观察内容，映射用目录实际路径。pagePagination 仅描述本地已观察数组；原 pagination/status/缺失说明保持原样，本地读完不代表上游已取全。复用已有资料，只补仍缺的来源页或字段，不重复联网取相同记录，不建立自动刷新；保留真实来源、时点及 dataMode。',
  register(agent){
   signal?.throwIfAborted()
   if(disposed||child||!agent.ctx?.tools?.register||!agent.ctx.tools?.guard)throw Error('本地来源快照读取边界不可用。')
   child=agent
   try{
    releases.push(agent.ctx.tools.guard(exec=>exec.name===WORKBENCH_SOURCE_TOOL&&exec.agent!==agent?'本地来源快照只属于当前组件子会话。':undefined))
    releases.push(agent.ctx.tools.register(tool))
   }catch(error){dispose();throw error}
  },dispose}
}
