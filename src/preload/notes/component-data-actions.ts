import {parseResearchContainerSpec} from '../../../packages/dsh-research-task-runtime/artifact-validator.js'

type Editor = {isEditable:boolean;readonly document:readonly any[];getBlock(id:string):any;updateBlock(id:string,value:any):unknown}
type Options = {sessionId:string;editor:Editor;current():boolean;update?(blockId:string,node:Record<string,any>,value:any):void;authorize?(value:any):void;onApplied?(value:any,blockId:string):void}
type Outcome = {result:Record<string,any>;error?:never}|{error:string;result?:never}
type Receipt = {fingerprint:string;promise:Promise<Outcome>;pending:boolean}
type Target = {block:any;node:Record<string,any>;payload:string}
const record=(value:any):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)
const validId=(value:any):value is string=>typeof value==='string'&&value.length>0&&value.length<=256
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value))
const changed=()=>Error('组件内容已变化，请重新读取后刷新。')
async function payloadRevision(payload:string):Promise<string>{
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload))
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
}

/** A component-data sink for the selected note block, never a document editing surface. */
export function createNoteComponentDataActions(options:Options) {
 const transports=new Map<string,Receipt>(),operations=new Map<string,Receipt>(),cancelled=new Set<string>()
 const check=(value:any)=>{
  options.authorize?.(value)
  if(!options.current())throw Error('笔记或账号状态已变化，请重新打开后刷新。')
  if(cancelled.has(value.requestId)||value.isCancelled?.())throw Error('组件数据刷新已取消。')
  if(!Number.isFinite(value.expiresAt)||value.expiresAt<=Date.now())throw Error('组件数据刷新请求已过期。')
 }
 const parse=(block:any):Target|undefined=>{
  if(block?.type!=='research'||!validId(block.id)||typeof block.props?.payload!=='string')return
  try{const node=JSON.parse(block.props.payload);if(record(node)&&validId(node.id))return {block,node,payload:block.props.payload}}catch{/* An unrelated malformed block is never exported. */}
 }
 const find=(nodeId:string,blockId?:string):Target=>{
  let target:Target|undefined
  if(blockId)target=parse(options.editor.getBlock(blockId))
  else{
   const visit=(blocks:readonly any[],depth=0)=>{
    if(depth>32)throw Error('笔记组件层级无效。')
    for(const block of blocks){
     const candidate=parse(block)
     if(candidate?.node.id===nodeId){if(target)throw Error('组件标识重复，请重新打开笔记后刷新。');target=candidate}
     if(Array.isArray(block?.children))visit(block.children,depth+1)
    }
   }
   visit(options.editor.document)
  }
  if(!target||target.node.id!==nodeId)throw Error('所选笔记组件不存在，请重新选择后刷新。')
  if(target.node.noteDraft||['draft','queued','running','retrying'].includes(target.node.generationStatus)||!record(target.node.containerSpec))throw Error('组件正在创建或生成，请稍后重试。')
  return target
 }
 const unchanged=(value:any,target:Target):Target=>{
  check(value)
  const live=find(target.node.id,target.block.id)
  if(live.payload!==target.payload)throw changed()
  return live
 }
 const trim=(cache:Map<string,Receipt>)=>{
  for(const [key,value]of cache){if(cache.size<=256)break;if(!value.pending)cache.delete(key)}
 }
 const remember=(cache:Map<string,Receipt>,key:string,receipt:Receipt)=>{cache.set(key,receipt);trim(cache)}
 const perform=async(value:any,nodeId:string,args:Record<string,any>):Promise<Record<string,any>>=>{
  check(value)
  let nextSpec:Record<string,any>|null=null
  if(value.method==='inspect'){
   if(Object.keys(args).some(key=>key!=='ids')||args.ids!==undefined&&(!Array.isArray(args.ids)||args.ids.length!==1||args.ids[0]!==nodeId))throw Error('只能读取当前选中的单个笔记组件。')
  }else{
   if(!validId(args.requestId)||!validId(args.revision)||Object.keys(args).some(key=>!['requestId','revision','changes'].includes(key))||!Array.isArray(args.changes)||args.changes.length!==1)throw Error('组件刷新参数无效。')
   const change=args.changes[0]
   if(!record(change)||change.op!=='update'||change.id!==nodeId||Object.keys(change).some(key=>!['op','id','fields'].includes(key))||!record(change.fields)||Object.keys(change.fields).length!==1||!Object.hasOwn(change.fields,'containerSpec'))throw Error('组件刷新只能更新当前组件的 containerSpec。')
   nextSpec=parseResearchContainerSpec(change.fields.containerSpec)
   if(!nextSpec)throw Error('组件内容不符合其结构约定，已保留原内容。')
   if(!options.editor.isEditable)throw Error('笔记当前不可编辑。')
  }
  const target=find(nodeId),revision=await payloadRevision(target.payload),live=unchanged(value,target)
  if(value.method==='inspect'){
   const writable=options.editor.isEditable
   return {revision,writable,nodes:[{id:nodeId,kind:live.node.kind,content:{containerSpec:clone(live.node.containerSpec)},capabilities:{fields:{containerSpec:writable}}}]}
  }
  if(revision!==args.revision)throw changed()
  const next={...live.node,containerSpec:nextSpec!},payload=JSON.stringify(next),nextRevision=await payloadRevision(payload)
  const latest=unchanged(value,target)
  if(!options.editor.isEditable)throw Error('笔记当前不可编辑。')
  // No asynchronous work separates the final CAS check from the editor update.
  if(options.update)options.update(latest.block.id,next,value)
  else options.editor.updateBlock(latest.block.id,{props:{...latest.block.props,payload}})
  options.onApplied?.(value,latest.block.id)
  return {status:'applied',revision:nextRevision}
 }
 return async function handle(value:any):Promise<{requestId:string;sessionId:string;result?:Record<string,any>;error?:string}|undefined>{
  if(!record(value))return
  if(value.cancel){if((value.sessionId===undefined||value.sessionId===options.sessionId)&&validId(value.requestId))cancelled.add(value.requestId);return}
  if(value.sessionId!==options.sessionId)return
  const envelope={requestId:value.requestId,sessionId:options.sessionId}
  try{
   check(value)
   if(!validId(value.requestId)||!['inspect','apply'].includes(value.method)||!Array.isArray(value.selectedIds)||value.selectedIds.length!==1||!validId(value.selectedIds[0])||!record(value.args??{}))throw Error('组件刷新只能操作当前选中的单个笔记组件。')
   const encoded=JSON.stringify(value.args??{})
   if(encoded.length>1500000)throw Error('组件刷新数据过大，请减少单次内容。')
   const args=JSON.parse(encoded),nodeId=value.selectedIds[0],fingerprint=JSON.stringify([value.method,nodeId,args])
   let receipt=transports.get(value.requestId)
   if(receipt&&receipt.fingerprint!==fingerprint)throw Error('操作标识已被其他请求使用。')
   const operationId=value.method==='apply'&&validId(args.requestId)?args.requestId:undefined
   if(!receipt&&operationId){receipt=operations.get(operationId);if(receipt&&receipt.fingerprint!==fingerprint)throw Error('操作标识已被其他请求使用。')}
   if(!receipt){
    const entry:Receipt={fingerprint,pending:true,promise:Promise.resolve({error:''})}
    entry.promise=perform(value,nodeId,args).then(result=>({result}),error=>({error:error instanceof Error?error.message:'组件数据刷新失败。'})).then(outcome=>{entry.pending=false;trim(transports);trim(operations);return outcome})
    receipt=entry
    if(operationId)remember(operations,operationId,entry)
   }
   remember(transports,value.requestId,receipt)
   const outcome=await receipt.promise
   check(value)
   return {...envelope,...clone(outcome)}
  }catch(error){return {...envelope,error:error instanceof Error?error.message:'组件数据刷新失败。'}}
 }
}
