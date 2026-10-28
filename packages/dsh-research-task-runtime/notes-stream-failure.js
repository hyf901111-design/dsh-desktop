// LlmFailure / LlmError carry message, code, status, retry delay and requestId.
// Only this finite SDK/transport taxonomy and numeric HTTP status are public.
// Provider messages, request IDs, causes, headers and bodies are never rendered.
const codes=new Set(['AUTH','FORBIDDEN','RATE_LIMIT','QUOTA','INVALID_REQUEST','CONTEXT_WINDOW_EXCEEDED','EMPTY_RESPONSE','INVALID_CREDENTIAL','MISSING_CREDENTIAL','TIMEOUT','TRANSPORT','PI_AI_ERROR','NO_ADAPTER','NO_MODEL','UNKNOWN_MODEL','INVALID_MODEL_CONTEXT','INVALID_MODEL_INFO','INVALID_MODEL_MAX_TOKENS','INVALID_MODEL_REASONING','UNSUPPORTED_REASONING_EFFORT','INVALID_PREPARED_CALL','INVALID_ADAPTER','INVARIANT','UNKNOWN','ABORTED','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','SERVER'])
const kinds=new Set(['stop','error','aborted','max-tokens','tool-calls'])
const own=(value,key)=>{try{const d=value&&Object.getOwnPropertyDescriptor(value,key);return d&&'value'in d?d.value:undefined}catch{return}}
function facts(value){
 let code='UNKNOWN',status;const seen=new Set(),queue=[value]
 for(let i=0;i<4&&queue.length;i++){
  const current=queue.shift();if(!current||typeof current!=='object'||seen.has(current))continue;seen.add(current)
  for(const candidate of [own(current,'failure'),current]){
   const candidateCode=own(candidate,'code'),candidateStatus=own(candidate,'status')
   if(code==='UNKNOWN'&&codes.has(candidateCode))code=candidateCode
   if(status===undefined&&Number.isInteger(candidateStatus)&&candidateStatus>=100&&candidateStatus<=599)status=candidateStatus
  }
  const cause=own(current,'cause');if(cause)queue.push(cause)
 }
 return{code,...status===undefined?{}:{status}}
}
export function noteThrownFailure(error){
 const failure=facts(error)
 let name=own(error,'name');try{if(error instanceof DOMException)name=error.name}catch{}
 if(failure.code==='UNKNOWN'&&name==='AbortError')failure.code='ABORTED'
 if(failure.code==='UNKNOWN'&&name==='TimeoutError')failure.code='TIMEOUT'
 return{finish:'exception',failure}
}
export function noteFinishFailure(reason,finished,hasToolCall){
 const kind=own(reason,'kind'),finish=finished&&kinds.has(kind)?kind:'unknown'
 if(finish==='error'||finish==='aborted'){
  const failure=facts(reason);if(finish==='aborted'&&failure.code==='UNKNOWN')failure.code='ABORTED'
  return{finish,failure}
 }
 if(finish==='max-tokens')return{finish,failure:{code:'MAX_TOKENS'}}
 if(finish==='tool-calls'||hasToolCall)return{finish,failure:{code:'UNEXPECTED_TOOL_CALL'}}
 return finish==='stop'?{finish}:{finish,failure:{code:'INCOMPLETE_STREAM'}}
}
const messages={AUTH:'模型服务鉴权失败',FORBIDDEN:'模型服务拒绝了本次请求',RATE_LIMIT:'模型服务暂时限流',QUOTA:'模型服务额度不足',INVALID_REQUEST:'模型服务未接受本次请求参数',CONTEXT_WINDOW_EXCEEDED:'本次内容超出模型上下文范围',EMPTY_RESPONSE:'模型服务未返回内容',INVALID_CREDENTIAL:'模型服务凭证不可用',MISSING_CREDENTIAL:'模型服务缺少凭证',TIMEOUT:'模型服务响应超时',TRANSPORT:'与模型服务的连接中断',UNSUPPORTED_REASONING_EFFORT:'模型服务不支持本次推理等级',MAX_TOKENS:'模型输出达到本次长度上限，生成尚未完成',ABORTED:'生成已取消',UNEXPECTED_TOOL_CALL:'模型返回了当前生成路径不支持的工具调用',INCOMPLETE_STREAM:'模型响应未完整结束',INVARIANT:'模型响应协议异常'}
export function noteFailureError(snapshot,purpose){
 const {code,status}=snapshot.failure,phase=purpose==='workspace-note-format-recovery'?'格式恢复':'主生成'
 const error=new Error(`${messages[code]||'模型服务生成失败'}（${code}${status===undefined?'':'；HTTP '+status}；${phase}）。本次模型输出未写入，原需求已保留。`)
 error.code=code;if(status!==undefined)error.status=status
 return error
}
