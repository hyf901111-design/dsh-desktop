/** Only the annotation ledger classifies these paths; filenames never imply a prepared output. */
export function createPptxAnnotationDeliveryGate(bridge){
 const paths=new Map(),batches=new Map();let epoch=0
 const unwrap=result=>{if(result?.ok!==true)throw Object.assign(Error(result?.error||'无法核对 PPT 修改状态。'),{code:result?.code});return result.value}
 const abort=()=>new DOMException('交付文件所属会话已变化。','AbortError')
 const wait=(promise,signal)=>new Promise((resolve,reject)=>{
  if(signal?.aborted){reject(abort());return}
  const cancelled=()=>{signal.removeEventListener('abort',cancelled);reject(abort())};signal?.addEventListener('abort',cancelled,{once:true})
  promise.then(value=>{signal?.removeEventListener('abort',cancelled);if(signal?.aborted)reject(abort());else resolve(value)},error=>{signal?.removeEventListener('abort',cancelled);reject(error)})
 })
 const result=(known,value)=>{
  const base={kind:'annotation',preparedId:known.preparedId,documentId:known.documentId,...(known.submissionId?{submissionId:known.submissionId}:{})},status=value?.status
  if(!['pending','success','failed'].includes(status))return {...base,status:'failed',code:'unconfirmed',error:'未取得此 PPT 的独立核验结果。'}
  if(status==='success'){
   const record=value.versionRecord
   if(!record||record.sourceDocumentId!==known.documentId||record.preparedId!==known.preparedId||!/^([a-f0-9]{64})$/.test(record.version)||!value.newFileRelativePath||record.relativePath!==value.newFileRelativePath)return {...base,status:'failed',code:'unconfirmed',error:'此 PPT 缺少已核验的新版本记录。'}
  }
  return {...base,...value,kind:'annotation',preparedId:known.preparedId,documentId:known.documentId}
 }
 const batch=known=>{
  const key=JSON.stringify([known.sendingSessionId,known.preparedId]);if(batches.has(key))return batches.get(key)
  const ownEpoch=epoch
  const promise=(async()=>{
   const binding=unwrap(await bridge.bindSubmission({sendingSessionId:known.sendingSessionId,preparedId:known.preparedId,...(known.submissionId?{submissionId:known.submissionId}:{})}))
   if(epoch!==ownEpoch)throw abort()
   if(binding?.status!=='bound'||!binding.submissionId)return {status:'pending',documents:[]}
   const completed=unwrap(await bridge.complete({sendingSessionId:known.sendingSessionId,preparedId:known.preparedId,submissionId:binding.submissionId}))
   return {...completed,submissionId:binding.submissionId}
  })();batches.set(key,promise);promise.finally(()=>{if(batches.get(key)===promise)batches.delete(key)}).catch(()=>{});return promise
 }
 const read=async(input,ownEpoch)=>{
  const known=unwrap(await bridge.lookupOutput(input));if(epoch!==ownEpoch)throw abort();if(known===null)return {kind:'ordinary'}
  if(!known?.preparedId||!known.documentId)throw Error('PPT 修改输出的登记信息不完整。')
  if(known.status!=='pending')return result(known,known)
  const completed=await batch({...known,sendingSessionId:input.sendingSessionId})
  const document=completed.documents?.find(value=>value.documentId===known.documentId)
  if(!document&&completed.status==='pending')return result(known,{status:'pending'})
  return result({...known,submissionId:completed.submissionId},document)
 }
 return {
  inspect(input,{signal,force=false}={}){
   if(signal?.aborted)return Promise.reject(abort())
   const key=JSON.stringify([input.sendingSessionId,input.path]),cached=paths.get(key)
   if(!force&&cached&&(cached.pending||cached.expires>Date.now()))return wait(cached.promise,signal)
   const ownEpoch=epoch,entry={pending:true,expires:0,promise:null}
   entry.promise=read(input,ownEpoch).catch(error=>({kind:'unverified',status:'failed',code:error?.code||'unavailable',error:error?.message||'暂时无法核对 PPT 修改状态，请稍后重试。'})).then(value=>{if(epoch!==ownEpoch)throw abort();entry.pending=false;entry.expires=Date.now()+1500;return value})
   paths.set(key,entry);if(paths.size>256)paths.delete(paths.keys().next().value)
   return wait(entry.promise,signal)
  },
  invalidate(){epoch++;paths.clear();batches.clear()}
 }
}

const pptxAnnotationDeliveryGates=new WeakMap()
export function getPptxAnnotationDeliveryGate(bridge){
 if(!bridge||typeof bridge.lookupOutput!=='function')return null
 let gate=pptxAnnotationDeliveryGates.get(bridge);if(!gate){gate=createPptxAnnotationDeliveryGate(bridge);pptxAnnotationDeliveryGates.set(bridge,gate)}return gate
}
export function pptxAnnotationDeliveryText(value,en=false){
 if(!value||value.kind==='ordinary')return ''
 if(value.status==='success')return en?'PPT changes verified':'PPT 修改已核验'
 if(value.status==='pending')return en?'PPT changes are awaiting verification. This candidate is not ready to open.':'PPT 修改待核验，当前候选文件尚不能作为修改成果打开。'
 return value.error||(en?'PPT verification failed. The candidate has been retained.':'PPT 修改核验未通过，候选文件已保留。')
}
export function pptxAnnotationDeliveryCanRetry(win,value,sessionId){
 if(value?.kind!=='annotation'||value.status!=='failed'||value.code==='cancelled')return false
 try{const coordinator=win[Symbol.for('sherlock:pptx-annotation-input')];return typeof coordinator?.retry==='function'&&coordinator.getSubmissions().some(item=>item.sessionId===sessionId&&item.prepared?.preparedId===value.preparedId&&!!item.submissionId)}catch{return false}
}
export const PPTX_ANNOTATION_DELIVERY_SOURCE='const pptxAnnotationDeliveryGates=new WeakMap();\n'+[createPptxAnnotationDeliveryGate,getPptxAnnotationDeliveryGate,pptxAnnotationDeliveryText,pptxAnnotationDeliveryCanRetry].map(fn=>fn.toString()).join('\n')
