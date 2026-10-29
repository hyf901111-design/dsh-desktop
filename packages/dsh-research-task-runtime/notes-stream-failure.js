// LlmFailure / LlmError carry message, code, status, retry delay and requestId.
// Only finite SDK/provider codes, numeric HTTP status and allowed parameter
// names enter public diagnostics. Formatter text is inspected only transiently.
// Provider messages, request IDs, causes, headers and bodies are never rendered.
const codes=new Set(['AUTH','FORBIDDEN','RATE_LIMIT','QUOTA','INVALID_REQUEST','CONTEXT_WINDOW_EXCEEDED','EMPTY_RESPONSE','INVALID_CREDENTIAL','MISSING_CREDENTIAL','TIMEOUT','TRANSPORT','STREAM_CLOSED','PI_AI_ERROR','NO_ADAPTER','NO_MODEL','UNKNOWN_MODEL','INVALID_MODEL_CONTEXT','INVALID_MODEL_INFO','INVALID_MODEL_MAX_TOKENS','INVALID_MODEL_REASONING','UNSUPPORTED_REASONING_EFFORT','INVALID_PREPARED_CALL','INVALID_ADAPTER','INVARIANT','UNKNOWN','ABORTED','ECONNRESET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_SOCKET','SERVER'])
const kinds=new Set(['stop','error','aborted','max-tokens','tool-calls'])
const own=(value,key)=>{try{const d=value&&Object.getOwnPropertyDescriptor(value,key);return d&&'value'in d?d.value:undefined}catch{return}}
const providerCodes=new Set(['invalid_request_error','insufficient_quota','invalid_api_key','model_not_found','unsupported_parameter','rate_limit_exceeded','context_length_exceeded','billing_hard_limit_reached','authentication_error','permission_error','overloaded_error'])
const parameters=new Set(['reasoning_effort','max_tokens','max_completion_tokens','temperature','top_p','thinking','messages','stream','model','tools','tool_choice','response_format','budget_tokens'])
function formattedFacts(message){
 // Pi's openai-completions catch calls formatProviderError without a prefix.
 // Its body cap is 4000 JS characters. Accept only that entire formatter
 // shape and a complete object; never scan embedded JSON or render its text.
 if(typeof message!=='string'||message.length>4005)return{}
 const match=/^([1-5][0-9]{2}): (\{[\s\S]*\})$/u.exec(message)
 if(!match||match[0]!==message)return{}
 try{
  const body=JSON.parse(match[2]),error=own(body,'error'),payload=error===undefined?body:error
  const plain=payload&&typeof payload==='object'&&!Array.isArray(payload),code=plain?own(payload,'code'):undefined,param=plain?own(payload,'param'):undefined
  const providerCode=Number.isInteger(code)&&code>=1000&&code<=1999?String(code):typeof code==='string'&&(/^[1][0-9]{3}$/u.test(code)||providerCodes.has(code))?code:undefined
  return{status:Number(match[1]),...providerCode===undefined?{}:{providerCode},...parameters.has(param)?{parameter:param}:{}}
 }catch{return{}}
}
function facts(value){
 let code='UNKNOWN',status,formattedStatus,providerCode,parameter;const seen=new Set(),queue=[value]
 for(let i=0;i<4&&queue.length;i++){
  const current=queue.shift();if(!current||typeof current!=='object'||seen.has(current))continue;seen.add(current)
  for(const candidate of [own(current,'failure'),current]){
   const candidateCode=own(candidate,'code'),candidateStatus=own(candidate,'status')
   if(code==='UNKNOWN'&&codes.has(candidateCode))code=candidateCode
   if(status===undefined&&Number.isInteger(candidateStatus)&&candidateStatus>=100&&candidateStatus<=599)status=candidateStatus
   const extra=formattedFacts(own(candidate,'message'))
   formattedStatus??=extra.status;providerCode??=extra.providerCode;parameter??=extra.parameter
  }
  const cause=own(current,'cause');if(cause)queue.push(cause)
 }
 status??=formattedStatus
 return{code,...status===undefined?{}:{status},...providerCode===undefined?{}:{providerCode},...parameter===undefined?{}:{parameter}}
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
const messages={AUTH:'模型服务鉴权失败',FORBIDDEN:'模型服务拒绝了本次请求',RATE_LIMIT:'模型服务暂时限流',QUOTA:'模型服务额度不足',INVALID_REQUEST:'模型服务未接受本次请求参数',CONTEXT_WINDOW_EXCEEDED:'本次内容超出模型上下文范围',EMPTY_RESPONSE:'模型服务未返回内容',INVALID_CREDENTIAL:'模型服务凭证不可用',MISSING_CREDENTIAL:'模型服务缺少凭证',TIMEOUT:'模型服务响应超时',TRANSPORT:'与模型服务的连接中断',STREAM_CLOSED:'模型响应流未完整结束',UNSUPPORTED_REASONING_EFFORT:'模型服务不支持本次推理等级',MAX_TOKENS:'模型输出达到本次长度上限，生成尚未完成',ABORTED:'生成已取消',UNEXPECTED_TOOL_CALL:'模型返回了当前生成路径不支持的工具调用',INCOMPLETE_STREAM:'模型响应未完整结束',INVARIANT:'模型响应协议异常'}
export function noteFailureError(snapshot,purpose){
 const {code,status,providerCode,parameter}=snapshot.failure,phase=purpose==='workspace-note-format-recovery'?'格式恢复':'主生成'
 const error=new Error(`${messages[code]||'模型服务生成失败'}（${code}${status===undefined?'':'；HTTP '+status}${providerCode===undefined?'':'；服务码 '+providerCode}${parameter===undefined?'':'；参数 '+parameter}；${phase}）。本次模型输出未写入，原需求已保留。`)
 error.code=code;if(status!==undefined)error.status=status
 return error
}
