import {capabilityReceiptText} from './client-capabilities.js'
/** JSON tool envelopes are untrusted requests. Only the host executor may produce receipts. */
export async function runClientCapabilityLoop({generate,execute,signal,onReceipts=()=>{}}){
 const receipts=[];let calls=0
 const completed=()=>({kind:'conversation',markdown:capabilityReceiptText(receipts),capabilityReceipts:receipts})
 for(let round=0;round<6;round++){
  if(signal?.aborted){if(receipts.length)return completed();signal.throwIfAborted()}
  let result
  try{result=await generate(receipts)}catch(error){if(!receipts.length)throw error;return {...completed(),markdown:capabilityReceiptText(receipts)+'\n后续回复未完成：'+error.message}}
  if(result?.kind!=='capabilities')return receipts.length&&result?.kind==='conversation'?completed():{...result,...receipts.length?{capabilityReceipts:receipts,capabilitySummary:capabilityReceiptText(receipts)}:{}}
  if(!Array.isArray(result.calls)||!result.calls.length||result.calls.length>8||calls+result.calls.length>16){if(receipts.length)return {...completed(),markdown:capabilityReceiptText(receipts)+'\n后续操作请求无效或超过本轮限制，未继续执行。'};throw Error('客户端操作请求超过本轮限制。')}
  for(const call of result.calls){
   if(signal?.aborted)return receipts.length?completed():{kind:'conversation',markdown:'操作已取消。'}
   const receipt=await execute(call);calls++;receipts.push(receipt);onReceipts([receipt])
   if(receipt.status!=='succeeded')return completed()
  }
 }
 return {...completed(),markdown:capabilityReceiptText(receipts)+'\n已达到本轮操作上限；未执行其他操作。'}
}
