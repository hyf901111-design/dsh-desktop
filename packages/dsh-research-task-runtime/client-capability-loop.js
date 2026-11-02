import {capabilityReceiptText} from './client-capabilities.js'
/** JSON tool envelopes are untrusted requests. Only the host executor may produce receipts. */
export async function runClientCapabilityLoop({generate,execute,signal,onReceipts=()=>{},preserveRemainingReply=false}){
 const receipts=[];let calls=0
 const completed=(incomplete=receipts.some(receipt=>receipt.status!=='succeeded'))=>({kind:'conversation',markdown:capabilityReceiptText(receipts),capabilityReceipts:receipts,...preserveRemainingReply&&incomplete?{requiresReply:true}:{}})
 for(let round=0;round<6;round++){
  if(signal?.aborted){if(receipts.length)return completed(true);signal.throwIfAborted()}
  let result
  try{result=await generate(receipts)}catch(error){if(!receipts.length)throw error;return {...completed(),markdown:capabilityReceiptText(receipts)+'\n后续回复未完成：'+error.message,...preserveRemainingReply?{requiresReply:true}:{}}}
  if(preserveRemainingReply&&receipts.length&&result?.kind==='conversation'&&!result.requiresReply&&(!result.markdown?.trim()||result.markdown.trim()===capabilityReceiptText(receipts))&&receipts.every(receipt=>['notes.blocks.read','notes.components.inspect','canvas.inspect'].includes(receipt.capability)))return{...completed(),markdown:capabilityReceiptText(receipts)+'\n\n已读取当前内容，本次尚未生成修改或答复。',requiresReply:true}
  if(result?.kind!=='capabilities')return receipts.length&&result?.kind==='conversation'?(preserveRemainingReply&&result.requiresReply===true?{...result,capabilityReceipts:receipts,capabilitySummary:capabilityReceiptText(receipts)}:completed()):{...result,...receipts.length?{capabilityReceipts:receipts,capabilitySummary:capabilityReceiptText(receipts)}:{}}
  if(!Array.isArray(result.calls)||!result.calls.length||result.calls.length>8||calls+result.calls.length>16){if(receipts.length)return {...completed(true),markdown:capabilityReceiptText(receipts)+'\n后续操作请求无效或超过本轮限制，未继续执行。'};throw Error('客户端操作请求超过本轮限制。')}
  const batch=[]
  for(const call of result.calls){
   if(signal?.aborted)return receipts.length?completed(true):{kind:'conversation',markdown:'操作已取消。'}
   const receipt=await execute(call);calls++;receipts.push(receipt);batch.push(receipt);onReceipts([receipt])
   if(receipt.status!=='succeeded')return completed()
  }
  // Completion is an intent marker, never evidence of a write. Only real
  // host receipts can settle it, and read-only batches must continue.
  if(result.completion==='complete'&&batch.some(receipt=>receipt.data?.pendingPreview===true||receipt.effect?.state==='saved'))return completed()
 }
 return {...completed(true),markdown:capabilityReceiptText(receipts)+'\n已达到本轮操作上限；未执行其他操作。'}
}
